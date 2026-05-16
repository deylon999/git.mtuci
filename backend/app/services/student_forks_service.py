from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from app.core.config import settings
from app.models.user import User
from app.services.gitea_service import _gitea_request, build_repo_web_url, gitea_owner_path
from app.utils.gitea_user import resolve_gitea_username

logger = logging.getLogger(__name__)


async def _list_user_repos(owner: str) -> list[dict[str, Any]]:
    base_url = settings.GITEA_URL.rstrip("/")
    repos: list[dict[str, Any]] = []
    page = 1
    async with httpx.AsyncClient(timeout=30) as client:
        while page <= 10:
            resp = await _gitea_request(
                client,
                "GET",
                f"{base_url}/api/v1/users/{gitea_owner_path(owner)}/repos",
                params={"limit": 50, "page": page},
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            if not isinstance(data, list) or not data:
                break
            repos.extend([r for r in data if isinstance(r, dict)])
            if len(data) < 50:
                break
            page += 1
    return repos


async def _compare_fork(owner: str, repo: str, parent_full: str) -> tuple[int | None, int | None]:
    """Returns (ahead, behind) — коммиты в форке и в родителе относительно merge-base."""
    if "/" not in parent_full:
        return None, None
    parent_owner, parent_repo = parent_full.split("/", 1)
    base_url = settings.GITEA_URL.rstrip("/")

    async def count_compare(base: str, head: str) -> int | None:
        api_url = f"{base_url}/api/v1/repos/{gitea_owner_path(parent_owner)}/{quote(parent_repo, safe='')}/compare/{base}...{head}"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await _gitea_request(client, "GET", api_url)
            if resp.status_code != 200:
                return None
            data = resp.json()
            commits = data.get("commits") if isinstance(data, dict) else None
            return len(commits) if isinstance(commits, list) else None
        except Exception:
            return None

    ahead = await count_compare(
        f"{quote(parent_owner, safe='')}:{quote(parent_repo, safe='')}",
        f"{quote(owner, safe='')}:{quote(repo, safe='')}",
    )
    behind = await count_compare(
        f"{quote(owner, safe='')}:{quote(repo, safe='')}",
        f"{quote(parent_owner, safe='')}:{quote(parent_repo, safe='')}",
    )
    return ahead, behind


async def merge_fork_upstream(owner: str, repo: str) -> None:
    base_url = settings.GITEA_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await _gitea_request(
            client,
            "POST",
            f"{base_url}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo, safe='')}/merge-upstream",
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"merge-upstream failed: {resp.status_code} {resp.text[:200]}")


async def get_student_gitea_forks(
    *,
    student_user: User,
) -> list[dict[str, Any]]:
    owner = resolve_gitea_username(student_user)
    items: list[dict[str, Any]] = []
    try:
        repos = await _list_user_repos(owner)
    except Exception as exc:
        logger.warning("list_user_repos %s: %s", owner, exc)
        return []

    for meta in repos:
        if not meta.get("fork"):
            continue
        name = str(meta.get("name") or "")
        if not name:
            continue
        parent = meta.get("parent") if isinstance(meta.get("parent"), dict) else {}
        parent_full = str(parent.get("full_name") or "")
        ahead, behind = await _compare_fork(owner, name, parent_full) if parent_full else (None, None)
        open_pr = meta.get("open_pr_counter") or meta.get("open_pr_count")
        updated = meta.get("updated_at")
        sync_status = "up_to_date"
        if ahead and ahead > 0:
            sync_status = "ahead"
        elif behind and behind > 0:
            sync_status = "behind"
        items.append(
            {
                "id": f"{owner}/{name}",
                "name": name,
                "fork_repo_path": f"{owner}/{name}",
                "parent_repo_path": parent_full or None,
                "parent_web_url": build_repo_web_url(*parent_full.split("/", 1))
                if "/" in parent_full
                else None,
                "gitea_web_url": build_repo_web_url(owner, name),
                "ahead_by": ahead,
                "behind_by": behind,
                "open_pr_count": int(open_pr) if open_pr is not None else None,
                "sync_status": sync_status,
                "updated_at": updated,
            }
        )

    items.sort(
        key=lambda x: str(x.get("updated_at") or ""),
        reverse=True,
    )
    return items
