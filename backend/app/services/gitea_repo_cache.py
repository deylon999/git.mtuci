"""
In-process cache and batch loader for Gitea repo metadata / commit counts.

Goals:
- At most one GET /repos/{owner}/{repo} per repo per TTL window
- No duplicate metadata fetch after enrich_repos_gitea_stats
- Profile/list views use lite mode (metadata only); repos page can request full counts
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.core.config import settings
from app.services.gitea_service import (
    GITEA_ADMIN_USERNAME,
    count_repo_commits,
    get_repo_metadata,
    stats_from_repo_metadata,
)

logger = logging.getLogger(__name__)

METADATA_TTL_SEC = 120
COMMIT_STATS_TTL_SEC = 90

# Lite list: do not paginate hundreds of commit pages on profile/dashboard.
LITE_COMMIT_MAX_PAGES = 0
FULL_COMMIT_MAX_PAGES = 8
FULL_COMMIT_WEEK_MAX_PAGES = 3


@dataclass(frozen=True)
class RepoGiteaSnapshot:
    primary_owner: str
    repo_name: str
    resolved_owner: str
    metadata: dict[str, Any] | None
    exists: bool
    commits_total: int | None = None
    commits_total_approx: bool = False
    commits_week: int | None = None
    commits_week_approx: bool = False

    @property
    def parsed_stats(self) -> dict[str, Any]:
        return stats_from_repo_metadata(self.metadata) if self.metadata else {}


_cache: dict[tuple[str, str], tuple[RepoGiteaSnapshot, float]] = {}
_locks: dict[tuple[str, str], asyncio.Lock] = {}


def invalidate_gitea_repo_cache(
    *,
    primary_owner: str | None = None,
    repo_name: str | None = None,
) -> None:
    if primary_owner is None and repo_name is None:
        _cache.clear()
        return
    keys = list(_cache.keys())
    for key in keys:
        p, r = key
        if primary_owner and p != primary_owner:
            continue
        if repo_name and r != repo_name:
            continue
        _cache.pop(key, None)


async def _fetch_metadata_resolved(primary_owner: str, repo_name: str) -> tuple[str, dict[str, Any] | None]:
    """One or two GET /repos calls (student owner, then legacy admin)."""
    meta = await get_repo_metadata(owner=primary_owner, repo=repo_name)
    if meta is not None:
        return primary_owner, meta
    if primary_owner != GITEA_ADMIN_USERNAME:
        meta = await get_repo_metadata(owner=GITEA_ADMIN_USERNAME, repo=repo_name)
        if meta is not None:
            return GITEA_ADMIN_USERNAME, meta
    return primary_owner, None


async def _load_snapshot(
    primary_owner: str,
    repo_name: str,
    *,
    since_week: datetime | None,
    fetch_totals: bool,
    fetch_week: bool,
) -> RepoGiteaSnapshot:
    resolved, meta = await _fetch_metadata_resolved(primary_owner, repo_name)
    exists = meta is not None

    commits_total: int | None = None
    commits_total_approx = False
    commits_week: int | None = None
    commits_week_approx = False

    if exists and fetch_totals:
        commits_total, commits_total_approx = await count_repo_commits(
            owner=resolved,
            repo=repo_name,
            since=None,
            max_pages=FULL_COMMIT_MAX_PAGES,
        )
    if exists and fetch_week and since_week is not None:
        commits_week, commits_week_approx = await count_repo_commits(
            owner=resolved,
            repo=repo_name,
            since=since_week,
            max_pages=FULL_COMMIT_WEEK_MAX_PAGES,
        )

    return RepoGiteaSnapshot(
        primary_owner=primary_owner,
        repo_name=repo_name,
        resolved_owner=resolved,
        metadata=meta,
        exists=exists,
        commits_total=commits_total,
        commits_total_approx=commits_total_approx,
        commits_week=commits_week,
        commits_week_approx=commits_week_approx,
    )


async def get_repo_snapshot(
    primary_owner: str,
    repo_name: str,
    *,
    since_week: datetime | None = None,
    mode: str = "lite",
) -> RepoGiteaSnapshot:
    """
    mode: none | lite | full
    - none: DB-only placeholder, no HTTP
    - lite: metadata only (1 GET /repos per repo, cached)
    - full: metadata + bounded commit pagination
    """
    key = (primary_owner, repo_name)
    if mode == "none":
        return RepoGiteaSnapshot(
            primary_owner=primary_owner,
            repo_name=repo_name,
            resolved_owner=primary_owner,
            metadata=None,
            exists=False,
        )

    fetch_totals = mode == "full"
    fetch_week = mode == "full" and since_week is not None
    ttl = METADATA_TTL_SEC if mode == "lite" else COMMIT_STATS_TTL_SEC

    entry = _cache.get(key)
    if entry is not None:
        snap, fetched_at = entry
        age = time.monotonic() - fetched_at
        if age < ttl:
            needs_more = (fetch_totals and snap.commits_total is None) or (
                fetch_week and snap.commits_week is None
            )
            if not needs_more:
                return snap

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        entry = _cache.get(key)
        if entry is not None:
            snap, fetched_at = entry
            if time.monotonic() - fetched_at < ttl:
                needs_more = (fetch_totals and snap.commits_total is None) or (
                    fetch_week and snap.commits_week is None
                )
                if not needs_more:
                    return snap

        snap = await _load_snapshot(
            primary_owner,
            repo_name,
            since_week=since_week,
            fetch_totals=fetch_totals,
            fetch_week=fetch_week,
        )
        _cache[key] = (snap, time.monotonic())
        return snap


async def batch_repo_snapshots(
    repo_specs: list[tuple[str, str]],
    *,
    since_week: datetime | None = None,
    mode: str = "lite",
) -> list[RepoGiteaSnapshot]:
    """Parallel snapshots preserving input order."""
    if not repo_specs or mode == "none":
        return [
            RepoGiteaSnapshot(
                primary_owner=p,
                repo_name=r,
                resolved_owner=p,
                metadata=None,
                exists=False,
            )
            for p, r in repo_specs
        ]

    sem = asyncio.Semaphore(6)

    async def one(spec: tuple[str, str]) -> RepoGiteaSnapshot:
        primary, repo = spec
        async with sem:
            return await get_repo_snapshot(
                primary,
                repo,
                since_week=since_week,
                mode=mode,
            )

    return await asyncio.gather(*[one(s) for s in repo_specs])
