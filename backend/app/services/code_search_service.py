from __future__ import annotations

from dataclasses import dataclass
from collections import Counter

import re
from datetime import datetime, timezone

from sqlalchemy import Select, select, func, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository, RepositoryType
from app.models.search import SavedSearch, SearchIndexEntry
from app.models.user import User, UserRole
from app.schemas.search_extended import CodeSearchHitRead
from app.services.gitea_service import get_repo_file_content, list_repo_file_paths
from app.services.repository_access_service import repository_not_blocked_clause
from app.utils.gitea_user import resolve_gitea_username


@dataclass(slots=True)
class CodeSearchFilters:
    extension: str | None = None
    path_prefix: str | None = None
    path_contains: str | None = None
    symbol: str | None = None
    repo_id: str | None = None
    min_score: float = 0.0
    sort: str = "relevance"
    branch: str = "main"
    per_repo_limit: int = 5


def _repo_scope_stmt(user: User) -> Select[tuple[Repository]]:
    stmt = select(Repository).where(repository_not_blocked_clause())
    if user.role == UserRole.admin:
        return stmt
    if user.role == UserRole.teacher:
        return stmt.where(Repository.owner_id == user.id)
    if user.role == UserRole.laborant:
        return stmt.where(Repository.owner_id == user.id)
    return stmt.where(
        (Repository.owner_id == user.id) | (Repository.repo_type == RepositoryType.public)
    )


def _tokenize(s: str) -> list[str]:
    return [t for t in re.split(r"[^a-zA-Z0-9_]+", s.lower()) if t]


def _is_postgres(session: AsyncSession) -> bool:
    get_bind = getattr(session, "get_bind", None)
    if not callable(get_bind):
        return False
    bind = get_bind()
    return bool(bind is not None and bind.dialect.name == "postgresql")


def _path_extension(path: str) -> str | None:
    dot_idx = path.rfind(".")
    if dot_idx <= 0 or dot_idx >= len(path) - 1:
        return None
    return path[dot_idx + 1 :].strip().lower() or None


async def _refresh_repo_index(
    session: AsyncSession,
    *,
    repo_id,
    owner: str,
    repo_name: str,
    branch: str,
    max_files: int = 1200,
    max_content_chars: int = 16000,
) -> None:
    try:
        paths = await list_repo_file_paths(owner=owner, repo=repo_name, ref=branch)
    except Exception:
        return
    if not paths:
        return
    rows: list[dict] = []
    for path in paths[:max_files]:
        try:
            content = await get_repo_file_content(owner=owner, repo=repo_name, filepath=path, ref=branch)
        except Exception:
            continue
        trimmed = content[:max_content_chars]
        rows.append(
            {
                "repository_id": repo_id,
                "branch": branch,
                "path": path,
                "extension": _path_extension(path),
                "content": trimmed,
                "content_size": len(trimmed),
                "updated_at": datetime.now(timezone.utc),
            }
        )
    if not rows:
        return
    await session.execute(
        delete(SearchIndexEntry).where(
            SearchIndexEntry.repository_id == repo_id,
            SearchIndexEntry.branch == branch,
        )
    )
    stmt = pg_insert(SearchIndexEntry).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_search_index_repo_branch_path",
        set_={
            "extension": stmt.excluded.extension,
            "content": stmt.excluded.content,
            "content_size": stmt.excluded.content_size,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    await session.execute(stmt)
    await session.commit()


def _extract_highlights(query: str, content: str, max_items: int = 3) -> list[str]:
    lines = content.splitlines()
    q_tokens = [t for t in _tokenize(query) if len(t) >= 2]
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        low = line.lower()
        if query.lower() in low or any(tok in low for tok in q_tokens):
            snippet = line.strip()
            if not snippet:
                continue
            if len(snippet) > 220:
                snippet = snippet[:220].rstrip() + "..."
            key = snippet.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(snippet)
            if len(out) >= max_items:
                break
    return out


def _symbol_match_score(symbol: str, path: str, content: str) -> float:
    if not symbol.strip():
        return 0.0
    escaped = re.escape(symbol.strip())
    patterns = [
        rf"\b(def|class|interface|type|enum|struct|fn|func|function)\s+{escaped}\b",
        rf"\b{escaped}\s*\(",
        rf"\b{escaped}\b",
    ]
    score = 0.0
    low_path = path.lower()
    low_symbol = symbol.lower()
    if low_symbol in low_path:
        score += 1.2
    for idx, p in enumerate(patterns):
        if re.search(p, content, flags=re.IGNORECASE | re.MULTILINE):
            score += 4.0 - idx
            break
    return score


def _score_match(query: str, path: str, content: str, *, symbol: str | None = None) -> tuple[float, str | None, list[str]]:
    score = 0.0
    snippet = None
    low_q = query.lower()
    low_path = path.lower()
    low_content = content.lower()
    q_tokens = _tokenize(query)

    if low_path == low_q:
        score += 8.0
    if low_path.startswith(low_q):
        score += 4.0
    if low_q in low_path:
        score += 2.0
    if low_q in low_content:
        score += 3.0
        idx = low_content.find(low_q)
        start = max(0, idx - 60)
        end = min(len(content), idx + len(query) + 60)
        snippet = content[start:end].replace("\n", " ").strip()
    path_tokens = set(_tokenize(path))
    content_tokens = set(_tokenize(content[:8000]))
    for token in q_tokens:
        if token in path_tokens:
            score += 1.5
        if token in content_tokens:
            score += 0.8

    # Prefer earlier path hits and shallower paths.
    if low_q in low_path:
        score += max(0.0, 1.2 - (low_path.index(low_q) / 200))
    score += max(0.0, 1.0 - (len(path.split("/")) / 20))
    score += max(0.0, 1.0 - (len(path) / 2000))

    # Token coverage bonus.
    if q_tokens:
        covered = sum(1 for t in q_tokens if t in low_content or t in low_path)
        score += (covered / max(1, len(q_tokens))) * 2.0

    if symbol:
        score += _symbol_match_score(symbol, path, content)

    highlights = _extract_highlights(query, content)
    if symbol:
        sym_hl = _extract_highlights(symbol, content, max_items=2)
        for row in sym_hl:
            if row not in highlights:
                highlights.append(row)
    return score, snippet, highlights[:4]


async def search_code_for_user(
    session: AsyncSession,
    *,
    user: User,
    query: str,
    limit: int,
    filters: CodeSearchFilters,
) -> tuple[list[CodeSearchHitRead], dict]:
    stmt = _repo_scope_stmt(user).limit(30)
    if filters.repo_id:
        stmt = stmt.where(Repository.id == filters.repo_id)
    repos = (await session.execute(stmt)).scalars().all()
    results: list[CodeSearchHitRead] = []
    ext = (filters.extension or "").strip().lstrip(".").lower()
    prefix = (filters.path_prefix or "").strip().strip("/")
    path_contains = (filters.path_contains or "").strip().lower()
    symbol = (filters.symbol or "").strip()
    ext_counter: Counter[str] = Counter()
    repo_counter: Counter[str] = Counter()
    if _is_postgres(session) and repos:
        repo_ids = [repo.id for repo in repos]
        # Lazy index warmup for repos without cached entries on this branch.
        counts = await session.execute(
            select(SearchIndexEntry.repository_id, func.count(SearchIndexEntry.id))
            .where(
                SearchIndexEntry.repository_id.in_(repo_ids),
                SearchIndexEntry.branch == filters.branch,
            )
            .group_by(SearchIndexEntry.repository_id)
        )
        present = {rid for rid, cnt in counts.all() if int(cnt or 0) > 0}
        for repo in repos:
            if repo.id in present:
                continue
            owner_user = await session.get(User, repo.owner_id) if repo.owner_id else None
            owner = resolve_gitea_username(owner_user) if owner_user else resolve_gitea_username(user)
            if not owner or not repo.gitea_repo_name:
                continue
            await _refresh_repo_index(
                session,
                repo_id=repo.id,
                owner=owner,
                repo_name=repo.gitea_repo_name,
                branch=filters.branch,
            )
        tsq = func.websearch_to_tsquery("simple", query)
        indexed_text = func.concat_ws(
            " ",
            func.coalesce(SearchIndexEntry.path, ""),
            func.coalesce(SearchIndexEntry.content, ""),
        )
        rank_expr = func.ts_rank_cd(func.to_tsvector("simple", indexed_text), tsq)
        q = (
            select(
                SearchIndexEntry.repository_id,
                SearchIndexEntry.path,
                SearchIndexEntry.content,
                rank_expr.label("rank"),
            )
            .where(
                SearchIndexEntry.repository_id.in_(repo_ids),
                SearchIndexEntry.branch == filters.branch,
                func.to_tsvector("simple", indexed_text).op("@@")(tsq),
            )
            .order_by(rank_expr.desc())
            .limit(max(limit * 8, 200))
        )
        if ext:
            q = q.where(SearchIndexEntry.extension == ext)
        if prefix:
            q = q.where(SearchIndexEntry.path.like(f"{prefix}%"))
        if path_contains:
            q = q.where(func.lower(SearchIndexEntry.path).contains(path_contains))
        rows = (await session.execute(q)).all()
        repo_name_map = {str(r.id): r.name for r in repos}
        repo_counter: Counter[str] = Counter()
        ext_counter: Counter[str] = Counter()
        per_repo_seen: Counter[str] = Counter()
        for repo_id, path, content, rank in rows:
            repo_id_s = str(repo_id)
            if per_repo_seen[repo_id_s] >= filters.per_repo_limit:
                continue
            if symbol and _symbol_match_score(symbol, path, content) <= 0:
                continue
            score, snippet, highlights = _score_match(query, path, content, symbol=symbol or None)
            score = max(score, float(rank or 0) * 10.0)
            if score <= max(0.0, filters.min_score):
                continue
            per_repo_seen[repo_id_s] += 1
            repo_name = repo_name_map.get(repo_id_s, repo_id_s)
            repo_counter[repo_name] += 1
            path_ext = _path_extension(path)
            if path_ext:
                ext_counter[path_ext] += 1
            results.append(
                CodeSearchHitRead(
                    repository_id=repo_id_s,
                    repository_name=repo_name,
                    path=path,
                    branch=filters.branch,
                    score=score,
                    snippet=snippet,
                    highlights=highlights,
                )
            )
        if filters.sort == "path":
            results.sort(key=lambda h: (h.path, -h.score))
        else:
            results.sort(key=lambda h: h.score, reverse=True)
        facets = {
            "extensions": [{"value": k, "count": v} for k, v in ext_counter.most_common(10)],
            "repositories": [{"value": k, "count": v} for k, v in repo_counter.most_common(10)],
        }
        return results[:limit], facets

    for repo in repos:
        owner_user = await session.get(User, repo.owner_id) if repo.owner_id else None
        if owner_user:
            owner = resolve_gitea_username(owner_user)
        else:
            owner = resolve_gitea_username(user)
        if not owner or not repo.gitea_repo_name:
            continue
        try:
            paths = await list_repo_file_paths(owner=owner, repo=repo.gitea_repo_name, ref=filters.branch)
        except Exception:
            continue
        matches = 0
        candidate_paths: list[str] = []
        query_tokens = _tokenize(query)
        for path in paths:
            if ext and not path.lower().endswith(f".{ext}"):
                continue
            if prefix and not path.startswith(prefix):
                continue
            if path_contains and path_contains not in path.lower():
                continue
            low_path = path.lower()
            if query.lower() in low_path or any(t in low_path for t in query_tokens):
                candidate_paths.append(path)
                continue
            candidate_paths.append(path)
        for path in candidate_paths:
            try:
                content = await get_repo_file_content(
                    owner=owner, repo=repo.gitea_repo_name, filepath=path, ref=filters.branch
                )
            except Exception:
                continue
            if symbol and _symbol_match_score(symbol, path, content) <= 0:
                continue
            score, snippet, highlights = _score_match(query, path, content, symbol=symbol or None)
            if score <= max(0.0, filters.min_score):
                continue
            repo_counter[repo.name] += 1
            dot_idx = path.rfind(".")
            if dot_idx > 0 and dot_idx < len(path) - 1:
                ext_counter[path[dot_idx + 1 :].lower()] += 1
            results.append(
                CodeSearchHitRead(
                    repository_id=str(repo.id),
                    repository_name=repo.name,
                    path=path,
                    branch=filters.branch,
                    score=score,
                    snippet=snippet,
                    highlights=highlights,
                )
            )
            matches += 1
            if matches >= filters.per_repo_limit:
                break
    if filters.sort == "path":
        results.sort(key=lambda h: (h.path, -h.score))
    else:
        results.sort(key=lambda h: h.score, reverse=True)
    facets = {
        "extensions": [{"value": k, "count": v} for k, v in ext_counter.most_common(10)],
        "repositories": [{"value": k, "count": v} for k, v in repo_counter.most_common(10)],
    }
    return results[:limit], facets


async def list_saved_searches(session: AsyncSession, *, user_id) -> list[SavedSearch]:
    rows = await session.execute(
        select(SavedSearch).where(SavedSearch.user_id == user_id).order_by(SavedSearch.updated_at.desc())
    )
    return rows.scalars().all()


async def create_saved_search(session: AsyncSession, *, entity: SavedSearch) -> SavedSearch:
    session.add(entity)
    await session.commit()
    await session.refresh(entity)
    return entity
