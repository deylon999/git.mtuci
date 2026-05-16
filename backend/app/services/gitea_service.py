from __future__ import annotations

import asyncio
import base64
import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote, urlparse, urlunparse

import httpx

from app.core.config import settings
from app.utils.gitea_user import gitea_owner_path, normalize_gitea_owner_repo

logger = logging.getLogger(__name__)

GITEA_ADMIN_USERNAME = settings.GITEA_ADMIN_USERNAME

# Max commit pages per repo for dashboard stats (100 commits/page).
COMMIT_COUNT_MAX_PAGES = 30
COMMIT_WEEK_MAX_PAGES = 10


class GiteaAuthError(RuntimeError):
    """Gitea API rejected credentials (invalid token or missing admin user)."""


_GITEA_AUTH_FAILED_STATUSES = frozenset({401, 403})
_gitea_auth_failure_logged = False


def gitea_auth_error_message() -> str:
    token_set = bool((settings.GITEA_TOKEN or "").strip())
    hint = (
        "Удалите или обновите GITEA_TOKEN в backend/.env"
        if token_set
        else "Задайте GITEA_TOKEN или проверьте GITEA_ADMIN_USERNAME / GITEA_ADMIN_PASSWORD"
    )
    return (
        f"Gitea отклонил авторизацию. {hint}. "
        f"Пользователь {settings.GITEA_ADMIN_USERNAME} должен существовать в Gitea "
        "(при первом запуске через docker-compose пароль по умолчанию: admin12345)."
    )


def _basic_auth_headers() -> dict[str, str]:
    credentials = f"{settings.GITEA_ADMIN_USERNAME}:{settings.GITEA_ADMIN_PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def _token_auth_headers() -> dict[str, str] | None:
    token = (settings.GITEA_TOKEN or "").strip()
    if not token:
        return None
    return {"Authorization": f"token {token}"}


def _get_auth_headers(*, prefer_basic: bool = False) -> dict[str, str]:
    """
    Заголовки авторизации для Gitea API.
    По умолчанию — token; при prefer_basic или пустом token — basic admin.
    """
    if prefer_basic or _token_auth_headers() is None:
        return _basic_auth_headers()
    return _token_auth_headers()  # type: ignore[return-value]


def _log_gitea_auth_failure(resp: httpx.Response, *, context: str) -> None:
    global _gitea_auth_failure_logged
    if _gitea_auth_failure_logged:
        return
    _gitea_auth_failure_logged = True
    body = (resp.text or "")[:200].replace("\n", " ")
    logger.error(
        "Gitea API auth failed (%s %s): HTTP %s — %s. %s",
        context,
        resp.request.url if resp.request else "?",
        resp.status_code,
        body,
        gitea_auth_error_message(),
    )


def _gitea_response_unauthorized(resp: httpx.Response) -> bool:
    return resp.status_code in _GITEA_AUTH_FAILED_STATUSES


async def _gitea_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    **kwargs: Any,
) -> httpx.Response:
    """HTTP-запрос к Gitea с повтором через basic auth, если token отклонён (401/403)."""
    merged = {**_get_auth_headers(), **(headers or {})}
    resp = await client.request(method, url, headers=merged, **kwargs)
    if _gitea_response_unauthorized(resp) and _token_auth_headers() is not None:
        logger.warning(
            "GITEA_TOKEN rejected (HTTP %s); retrying with admin basic auth",
            resp.status_code,
        )
        merged = {**_get_auth_headers(prefer_basic=True), **(headers or {})}
        resp = await client.request(method, url, headers=merged, **kwargs)
    return resp


async def check_gitea_api_access() -> tuple[bool, str]:
    """
    Проверка доступа к Gitea API (для health/startup).
    Возвращает (ok, сообщение для логов).
    """
    base_url = settings.GITEA_URL.rstrip("/")
    version_url = f"{base_url}/api/v1/version"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await _gitea_request(client, "GET", version_url)
            if _gitea_response_unauthorized(resp):
                resp = await client.get(version_url, headers=_basic_auth_headers())
    except httpx.HTTPError as exc:
        return False, f"Gitea недоступен по {base_url}: {exc}"
    if _gitea_response_unauthorized(resp):
        return (
            False,
            f"{gitea_auth_error_message()} "
            "Запустите: docker compose run --rm gitea-bootstrap",
        )
    if resp.status_code != 200:
        return False, f"Gitea version check: HTTP {resp.status_code}"
    token_set = bool((settings.GITEA_TOKEN or "").strip())
    if token_set:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                token_resp = await client.get(
                    version_url, headers=_token_auth_headers() or {}
                )
            if _gitea_response_unauthorized(token_resp):
                return (
                    True,
                    f"Gitea API OK ({base_url}, basic auth). "
                    "GITEA_TOKEN в .env устарел — очистите строку для автоматического режима.",
                )
        except httpx.HTTPError:
            pass
    return True, f"Gitea API OK ({base_url})"


def gitea_public_base_url() -> str:
    return settings.GITEA_PUBLIC_URL.rstrip("/")


def build_clone_url(owner: str, repo_name: str) -> str:
    return f"{gitea_public_base_url()}/{owner}/{repo_name}.git"


def build_authenticated_clone_url(*, owner: str, repo_name: str, username: str, token: str) -> str:
    """HTTP(S) clone URL with embedded credentials (for private repos in lab)."""
    parsed = urlparse(build_clone_url(owner, repo_name))
    user = quote(username, safe="")
    tok = quote(token, safe="")
    host = parsed.hostname or "localhost"
    netloc = f"{user}:{tok}@{host}"
    if parsed.port:
        netloc += f":{parsed.port}"
    return urlunparse((parsed.scheme, netloc, parsed.path, "", "", ""))


MTUCI_GITEA_CLONE_TOKEN_NAME = "mtuci-clone"


async def verify_gitea_access_token(token: str) -> bool:
    base_url = settings.GITEA_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base_url}/api/v1/user",
                headers={"Authorization": f"token {token}"},
            )
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


async def create_gitea_user_access_token(
    username: str,
    *,
    name: str = MTUCI_GITEA_CLONE_TOKEN_NAME,
) -> str:
    """Create PAT for a Gitea user (admin API). Token value returned only once."""
    base_url = settings.GITEA_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(
            client,
            "POST",
            f"{base_url}/api/v1/users/{gitea_owner_path(username)}/tokens",
            headers={"Content-Type": "application/json"},
            json={
                "name": name,
                "scopes": ["read:repository", "write:repository", "read:user"],
            },
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Gitea create token failed: {resp.status_code} {resp.text[:300]}")
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("Gitea create token: invalid response")
    raw = data.get("sha1") or data.get("token")
    if not raw:
        raise RuntimeError("Gitea create token: empty token")
    return str(raw)


def build_repo_web_url(owner: str, repo_name: str) -> str:
    return f"{gitea_public_base_url()}/{owner}/{repo_name}"


def build_repo_gitea_links(owner: str, repo_name: str) -> dict[str, str]:
    """Standard Gitea repository section URLs."""
    base = build_repo_web_url(owner, repo_name).rstrip("/")
    return {
        "code": base,
        "issues": f"{base}/issues",
        "pulls": f"{base}/pulls",
        "wiki": f"{base}/wiki",
        "settings": f"{base}/settings",
        "commits": f"{base}/commits",
        "activity": f"{base}/activity",
    }


async def get_last_commit_for_path(
    *,
    owner: str,
    repo: str,
    filepath: str,
    ref: str | None = None,
) -> dict[str, Any] | None:
    """Latest commit touching a file or directory path."""
    try:
        commits, _ = await list_repo_commits_page(
            owner=owner,
            repo=repo,
            limit=1,
            page=1,
            ref=ref,
            path=filepath,
        )
    except Exception:
        return None
    if not commits or not isinstance(commits[0], dict):
        return None
    item = commits[0]
    commit = item.get("commit") if isinstance(item.get("commit"), dict) else item
    if not isinstance(commit, dict):
        return None
    msg = str(commit.get("message") or "").strip()
    if "\n" in msg:
        msg = msg.split("\n", 1)[0].strip()
    author = commit.get("author") if isinstance(commit.get("author"), dict) else {}
    return {
        "message": msg or "Commit",
        "committed_at": author.get("date"),
        "sha": str(item.get("sha") or "")[:12],
    }


async def ensure_gitea_user(username: str) -> None:
    """Create Gitea user via admin API if missing (idempotent)."""
    base_url = settings.GITEA_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as client:
        check = await _gitea_request(
            client,
            "GET",
            f"{base_url}/api/v1/users/{gitea_owner_path(username)}",
        )
        if check.status_code == 200:
            return
        if _gitea_response_unauthorized(check):
            raise GiteaAuthError(gitea_auth_error_message())
        if check.status_code != 404:
            logger.warning("Gitea user check for %s: %s", username, check.status_code)
            return

        create = await _gitea_request(
            client,
            "POST",
            f"{base_url}/api/v1/admin/users",
            headers={"Content-Type": "application/json"},
            json={
                "username": username,
                "email": f"{username}@gitmtuci.lab",
                "password": "changeme123",
                "must_change_password": False,
            },
        )
        if create.status_code not in (200, 201):
            logger.error("Failed to create Gitea user %s: %s", username, create.text[:300])


async def create_repository_for_owner(
    *,
    owner_username: str,
    name: str,
    description: str | None = None,
    private: bool = False,
    auto_init: bool = True,
    gitignores: str | None = None,
    license_key: str | None = None,
    readme: str | None = None,
) -> dict[str, Any]:
    """Create repository under a specific Gitea user (admin API)."""
    await ensure_gitea_user(owner_username)
    base_url = settings.GITEA_URL.rstrip("/")
    payload: dict[str, Any] = {
        "name": name,
        "description": description or "",
        "private": private,
        "auto_init": auto_init,
        "default_branch": "main",
    }
    if gitignores:
        payload["gitignores"] = gitignores
    if license_key:
        payload["license"] = license_key
    if readme:
        payload["readme"] = readme

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(
            client,
            "POST",
            f"{base_url}/api/v1/admin/users/{gitea_owner_path(owner_username)}/repos",
            headers={"Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code == 409:
        meta = await get_repo_metadata(owner=owner_username, repo=name)
        if meta:
            return meta
        raise RuntimeError(f"Gitea repo conflict: {name}")

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Gitea create repo failed: {resp.status_code} {resp.text[:500]}")

    data = resp.json()
    return data if isinstance(data, dict) else {"name": name}


async def create_repo(repo_name: str) -> str:
    """
    Deprecated: creates under admin token user. Use create_repository_for_owner.
    Kept for backward compatibility in scripts/tests.
    """
    await create_repository_for_owner(
        owner_username=GITEA_ADMIN_USERNAME,
        name=repo_name,
        private=False,
    )
    return repo_name


async def delete_repository(*, owner: str, repo_name: str) -> None:
    base_url = settings.GITEA_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(
            client,
            "DELETE",
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo_name, safe='')}",
        )
    if resp.status_code not in (204, 404):
        logger.warning("Gitea delete %s/%s: %s", owner, repo_name, resp.status_code)


async def ensure_repo_webhook(*, owner: str, repo_name: str) -> None:
    """Register push webhook on a repo (idempotent)."""
    base_url = settings.GITEA_URL.rstrip("/")
    webhook_url = settings.WEBHOOK_BASE_URL.rstrip("/")
    push_url = f"{webhook_url}/gitea/push"
    secret = settings.GITEA_WEBHOOK_SECRET

    async with httpx.AsyncClient(timeout=30) as client:
        hooks_resp = await _gitea_request(
            client,
            "GET",
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo_name, safe='')}/hooks",
        )
        if hooks_resp.status_code == 200:
            for hook in hooks_resp.json():
                if hook.get("config", {}).get("url") == push_url:
                    return

        resp = await _gitea_request(
            client,
            "POST",
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo_name, safe='')}/hooks",
            headers={"Content-Type": "application/json"},
            json={
                "type": "gitea",
                "config": {
                    "url": push_url,
                    "content_type": "json",
                    "secret": secret,
                },
                "events": ["push"],
                "active": True,
            },
        )
        if resp.status_code not in (200, 201):
            logger.warning("Webhook create %s/%s: %s", owner, repo_name, resp.status_code)


def stats_from_repo_metadata(meta: dict[str, Any] | None) -> dict[str, Any]:
    """Extract display stats from Gitea GET /repos/{owner}/{repo} payload."""
    if not meta:
        return {}
    language = meta.get("language")
    if isinstance(language, str):
        language = language.strip() or None
    forks = meta.get("forks_count")
    stars = meta.get("stars_count")
    open_pr = meta.get("open_pr_counter")
    if open_pr is None:
        open_pr = meta.get("open_pr_count")
    return {
        "language": language,
        "forks_count": int(forks) if forks is not None else None,
        "stars_count": int(stars) if stars is not None else None,
        "open_pr_count": int(open_pr) if open_pr is not None else None,
    }


async def _fetch_repo_api_response(*, owner: str, repo: str) -> httpx.Response | None:
    try:
        owner, repo = normalize_gitea_owner_repo(owner, repo)
    except ValueError:
        return None
    base_url = settings.GITEA_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=20) as client:
        return await _gitea_request(
            client,
            "GET",
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}",
        )


async def repo_exists_in_gitea(*, owner: str, repo: str) -> bool | None:
    """
    True/False — репозиторий есть/нет.
    None — не удалось проверить (ошибка авторизации Gitea).
    """
    resp = await _fetch_repo_api_response(owner=owner, repo=repo)
    if resp is None:
        return False
    if _gitea_response_unauthorized(resp):
        _log_gitea_auth_failure(resp, context="repo probe")
        return None
    if resp.status_code == 404:
        return False
    if resp.status_code == 200:
        return True
    logger.warning("Gitea repo probe %s/%s: HTTP %s", owner, repo, resp.status_code)
    return False


async def get_repo_metadata(*, owner: str, repo: str) -> dict[str, Any] | None:
    resp = await _fetch_repo_api_response(owner=owner, repo=repo)
    if resp is None:
        return None
    if _gitea_response_unauthorized(resp):
        _log_gitea_auth_failure(resp, context="get_repo_metadata")
        raise GiteaAuthError(gitea_auth_error_message())
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        logger.warning("Gitea get repo: HTTP %s", resp.status_code)
        return None
    data = resp.json()
    return data if isinstance(data, dict) else None


async def resolve_repo_owner(*, primary_owner: str, repo_name: str) -> str:
    """
    Return Gitea owner where the repo actually lives.
    Supports legacy assignment repos created under admin before the fix.
    """
    exists = await repo_exists_in_gitea(owner=primary_owner, repo=repo_name)
    if exists is True:
        return primary_owner
    if exists is None:
        # Не валим весь запрос: при сбое Gitea auth используем владельца по умолчанию.
        logger.warning(
            "resolve_repo_owner: Gitea auth failed, using primary_owner=%s for %s",
            primary_owner,
            repo_name,
        )
        return primary_owner
    if primary_owner != GITEA_ADMIN_USERNAME:
        admin_exists = await repo_exists_in_gitea(owner=GITEA_ADMIN_USERNAME, repo=repo_name)
        if admin_exists is True:
            return GITEA_ADMIN_USERNAME
    return primary_owner


async def list_repo_commits_page(
    *,
    owner: str,
    repo: str,
    limit: int = 100,
    page: int = 1,
    since: str | None = None,
    until: str | None = None,
    ref: str | None = None,
    path: str | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    """
    Возвращает одну страницу коммитов репозитория.
    Порядок в ответе Gitea обычно от новых к старым, но для корректности логику
    лучше делать с учётом этого уже на уровне маршрута.
    """
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/commits"
    params: dict[str, Any] = {"limit": limit, "page": page}
    if since:
        params["since"] = since
    if until:
        params["until"] = until
    if ref:
        params["sha"] = ref
    if path:
        params["path"] = path.lstrip("/")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url, params=params)

    # Gitea возвращает 409, если репозиторий пустой (нет ни одного коммита).
    if resp.status_code == 409:
        return [], False

    if resp.status_code != 200:
        raise RuntimeError(f"Gitea list commits failed: {resp.status_code} {resp.text}")

    data = resp.json()
    has_more_raw = resp.headers.get("X-HasMore")
    if has_more_raw is None:
        # Fallback, если заголовок не пришёл.
        has_more = isinstance(data, list) and len(data) == limit
    else:
        has_more = str(has_more_raw).lower() == "true"
    return data, has_more


async def list_repo_commits(
    *,
    owner: str,
    repo: str,
    limit: int = 100,
    max_pages: int = 20,
) -> list[dict[str, Any]]:
    commits: list[dict[str, Any]] = []
    page = 1

    while page <= max_pages:
        chunk, has_more = await list_repo_commits_page(
            owner=owner,
            repo=repo,
            limit=limit,
            page=page,
        )
        commits.extend(chunk)
        if not has_more or not chunk:
            break
        page += 1

    return commits


async def count_repo_commits(
    *,
    owner: str,
    repo: str,
    since: datetime | None = None,
    max_pages: int = COMMIT_COUNT_MAX_PAGES,
    page_size: int = 100,
) -> tuple[int | None, bool]:
    """
    Count commits in a repo. Returns (count, is_approximate).
    None if Gitea is unreachable or repo missing.
    """
    since_str = since.isoformat() if since else None
    total = 0
    page = 1
    try:
        while page <= max_pages:
            commits, has_more = await list_repo_commits_page(
                owner=owner,
                repo=repo,
                limit=page_size,
                page=page,
                since=since_str,
            )
            total += len(commits)
            if not has_more:
                return total, False
            page += 1
        return total, True
    except Exception as exc:
        logger.debug("count_repo_commits %s/%s: %s", owner, repo, exc)
        return None, False


async def enrich_repos_gitea_stats(
    repo_specs: list[tuple[str, str]],
    *,
    since: datetime | None = None,
    max_pages: int = COMMIT_COUNT_MAX_PAGES,
) -> list[tuple[int | None, bool, str]]:
    """
    For each (primary_owner, repo_name): resolve owner, count commits.
    Returns list of (count, is_approx, resolved_owner) in same order.
    """
    owner_cache: dict[tuple[str, str], str] = {}
    sem = asyncio.Semaphore(6)

    async def one(primary: str, repo_name: str) -> tuple[int | None, bool, str]:
        key = (primary, repo_name)
        if key not in owner_cache:
            owner_cache[key] = await resolve_repo_owner(primary_owner=primary, repo_name=repo_name)
        owner = owner_cache[key]
        async with sem:
            count, approx = await count_repo_commits(
                owner=owner,
                repo=repo_name,
                since=since,
                max_pages=max_pages if since is None else COMMIT_WEEK_MAX_PAGES,
            )
        return count, approx, owner

    return await asyncio.gather(*[one(p, r) for p, r in repo_specs])


async def list_repo_branches(*, owner: str, repo: str) -> list[dict[str, Any]]:
    owner, repo = normalize_gitea_owner_repo(owner, repo)
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/branches"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url)
    if resp.status_code == 404:
        return []
    if resp.status_code != 200:
        logger.warning("Gitea list branches %s/%s: %s", owner, repo, resp.status_code)
        return []
    data = resp.json()
    if not isinstance(data, list):
        return []
    return [b for b in data if isinstance(b, dict)]


async def list_repo_file_paths(
    *,
    owner: str,
    repo: str,
    ref: str,
    max_files: int = 800,
) -> list[str]:
    """Flat list of file paths in a branch (for search / go-to-file)."""
    owner, repo = normalize_gitea_owner_repo(owner, repo)
    base_url = settings.GITEA_URL.rstrip("/")
    branch_url = (
        f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/branches/{quote(ref, safe='')}"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        branch_resp = await _gitea_request(client, "GET", branch_url)
        if branch_resp.status_code != 200:
            return []
        branch_data = branch_resp.json()
        commit = branch_data.get("commit") if isinstance(branch_data, dict) else None
        sha = commit.get("id") if isinstance(commit, dict) else None
        if not sha:
            return []
        tree_url = (
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/git/trees/{sha}"
        )
        tree_resp = await _gitea_request(
            client,
            "GET",
            tree_url,
            params={"recursive": "true", "per_page": max_files},
        )
    if tree_resp.status_code != 200:
        return []
    tree_data = tree_resp.json()
    tree_items = tree_data.get("tree") if isinstance(tree_data, dict) else None
    if not isinstance(tree_items, list):
        return []
    paths: list[str] = []
    for item in tree_items:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "blob":
            continue
        path = str(item.get("path") or "").strip()
        if path:
            paths.append(path)
        if len(paths) >= max_files:
            break
    return sorted(paths)


async def create_repo_file(
    *,
    owner: str,
    repo: str,
    filepath: str,
    content: str,
    branch: str,
    message: str,
) -> dict[str, Any]:
    owner, repo = normalize_gitea_owner_repo(owner, repo)
    cleaned = filepath.strip().strip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid filepath")
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = (
        f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/contents/{quote(cleaned, safe='/')}"
    )
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(
            client,
            "POST",
            api_url,
            headers={"Content-Type": "application/json"},
            json={
                "branch": branch,
                "content": encoded,
                "message": message or f"Add {cleaned}",
            },
        )
    if _gitea_response_unauthorized(resp):
        raise GiteaAuthError(gitea_auth_error_message())
    if resp.status_code == 422:
        raise RuntimeError("Файл уже существует. Выберите другое имя или отредактируйте в Gitea.")
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Gitea create file failed: {resp.status_code} {resp.text[:300]}")
    data = resp.json()
    return data if isinstance(data, dict) else {}


async def list_repo_issues_page(
    *,
    owner: str,
    repo: str,
    page: int = 1,
    limit: int = 20,
    state: str = "open",
) -> tuple[list[dict[str, Any]], bool]:
    """Issues only (excludes pull requests)."""
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/issues"
    params: dict[str, Any] = {
        "page": page,
        "limit": limit,
        "state": state,
        "type": "issues",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url, params=params)
    if resp.status_code == 404:
        return [], False
    if resp.status_code != 200:
        raise RuntimeError(f"Gitea list issues failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    items = data if isinstance(data, list) else []
    has_more = str(resp.headers.get("X-HasMore", "")).lower() == "true"
    if not has_more and isinstance(data, list):
        has_more = len(data) == limit
    return items, has_more


async def list_repo_pulls_page(
    *,
    owner: str,
    repo: str,
    page: int = 1,
    limit: int = 20,
    state: str = "open",
) -> tuple[list[dict[str, Any]], bool]:
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/pulls"
    params: dict[str, Any] = {"page": page, "limit": limit, "state": state}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url, params=params)
    if resp.status_code == 404:
        return [], False
    if resp.status_code != 200:
        raise RuntimeError(f"Gitea list pulls failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    items = data if isinstance(data, list) else []
    has_more = str(resp.headers.get("X-HasMore", "")).lower() == "true"
    if not has_more and isinstance(data, list):
        has_more = len(data) == limit
    return items, has_more


async def list_repo_wiki_pages(
    *,
    owner: str,
    repo: str,
) -> list[dict[str, Any]]:
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/wiki/pages"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url)
    if resp.status_code in (404, 403):
        return []
    if resp.status_code != 200:
        raise RuntimeError(f"Gitea list wiki pages failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    if isinstance(data, dict) and isinstance(data.get("wiki_page_list"), list):
        return data["wiki_page_list"]
    return data if isinstance(data, list) else []


async def get_repo_wiki_page(
    *,
    owner: str,
    repo: str,
    page_name: str,
) -> dict[str, Any] | None:
    cleaned = page_name.strip().strip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid wiki page")
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = (
        f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}"
        f"/wiki/page/{quote(cleaned, safe='')}"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url)
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        raise RuntimeError(f"Gitea get wiki page failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    return data if isinstance(data, dict) else None


async def get_repo_contents(
    *,
    owner: str,
    repo: str,
    filepath: str = "",
    ref: str | None = None,
) -> Any:
    """
    Обёртка над Gitea Contents API:
    GET /api/v1/repos/{owner}/{repo}/contents/{filepath}
    """
    owner, repo = normalize_gitea_owner_repo(owner, repo)
    base_url = settings.GITEA_URL.rstrip("/")
    cleaned = filepath.lstrip("/")
    if cleaned:
        api_url = (
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/contents/{quote(cleaned, safe='/')}"
        )
    else:
        # Для корня Gitea ожидает /contents/ (с trailing slash).
        api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/contents/"

    params: dict[str, str] = {}
    if ref:
        params["ref"] = ref

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await _gitea_request(client, "GET", api_url, params=params or None)

    if resp.status_code == 404:
        raise RuntimeError(
            f"Репозиторий {owner}/{repo} не найден в Gitea. "
            "Возможно, он создан только в базе — удалите и создайте заново."
        )
    if _gitea_response_unauthorized(resp):
        raise GiteaAuthError(gitea_auth_error_message())
    if resp.status_code != 200:
        raise RuntimeError(f"Gitea get contents failed: {resp.status_code} {resp.text[:300]}")

    return resp.json()


async def get_repo_file_content(
    *,
    owner: str,
    repo: str,
    filepath: str,
    ref: str | None = None,
) -> str:
    """
    Возвращает декодированный текст файла из Content API (base64 -> UTF-8).
    """
    data = await get_repo_contents(owner=owner, repo=repo, filepath=filepath, ref=ref)
    if not isinstance(data, dict) or data.get("type") != "file":
        raise RuntimeError(f"Gitea file not found: {filepath}")

    content_b64 = data.get("content")
    if not content_b64:
        raise RuntimeError(f"Gitea file has empty content: {filepath}")

    raw = base64.b64decode(content_b64)
    return raw.decode("utf-8", errors="replace")

