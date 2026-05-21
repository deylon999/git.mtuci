"""
Service for MTUCI LK integration — student profile, schedule, attendance.

LK requests are slow (browser-like auth). We cache results and avoid
fetching schedule per-day (the library re-downloads the whole month each time).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from dataclasses import dataclass, field

from datetime import datetime, timezone

from mtuci_private_api import Mtuci
from mtuci_private_api.errors import AuthError

logger = logging.getLogger(__name__)

# How long to reuse LK data per login (seconds)
LK_CACHE_TTL_SEC = 30 * 60

# Negative cache for auth failures (avoid hammering LK)
LK_ERROR_CACHE_TTL_SEC = 5 * 60


class MTUCIServiceError(Exception):
    """Base error for MTUCI service"""


class MTUCIAuthError(MTUCIServiceError):
    """Authentication failed with MTUCI LK"""


@dataclass
class MtuciLkSubject:
    """Discipline from LK attendance (and optionally one schedule sample)."""

    name: str
    attendance_percent: float | None = None
    skips: int | None = None
    teachers: list[str] = field(default_factory=list)


@dataclass
class _LkCacheEntry:
    subjects: list[MtuciLkSubject]
    fetched_at: float
    error: str | None = None


_lk_cache: dict[str, _LkCacheEntry] = {}
_lk_locks: dict[str, asyncio.Lock] = {}


def _cache_key(mtuci_login: str) -> str:
    return hashlib.sha256(mtuci_login.strip().lower().encode()).hexdigest()[:24]


def _normalize_subject_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def invalidate_lk_cache(mtuci_login: str | None) -> None:
    if not mtuci_login:
        return
    _lk_cache.pop(_cache_key(mtuci_login), None)


async def fetch_lk_subjects_cached(
    mtuci_login: str,
    mtuci_password: str,
    *,
    force_refresh: bool = False,
    cache_only: bool = False,
) -> tuple[list[MtuciLkSubject], str | None]:
    """
    Cached wrapper around LK fetch.

    Returns (subjects, error_key) where error_key is
    lk_auth_failed | lk_unavailable | None.
    """
    key = _cache_key(mtuci_login)
    now = time.monotonic()

    if not force_refresh:
        entry = _lk_cache.get(key)
        if entry is not None:
            age = now - entry.fetched_at
            ttl = LK_ERROR_CACHE_TTL_SEC if entry.error else LK_CACHE_TTL_SEC
            if age < ttl:
                return list(entry.subjects), entry.error
        if cache_only:
            return [], None

    lock = _lk_locks.setdefault(key, asyncio.Lock())
    async with lock:
        entry = _lk_cache.get(key)
        if not force_refresh and entry is not None:
            age = time.monotonic() - entry.fetched_at
            ttl = LK_ERROR_CACHE_TTL_SEC if entry.error else LK_CACHE_TTL_SEC
            if age < ttl:
                return list(entry.subjects), entry.error
        if cache_only:
            return [], None

        try:
            logger.info("LK fetch for %s (force=%s)", mtuci_login, force_refresh)
            subjects = await fetch_lk_subjects(mtuci_login, mtuci_password)
            _lk_cache[key] = _LkCacheEntry(
                subjects=subjects,
                fetched_at=time.monotonic(),
                error=None,
            )
            return subjects, None
        except MTUCIAuthError:
            _lk_cache[key] = _LkCacheEntry(
                subjects=[],
                fetched_at=time.monotonic(),
                error="lk_auth_failed",
            )
            return [], "lk_auth_failed"
        except MTUCIServiceError:
            _lk_cache[key] = _LkCacheEntry(
                subjects=[],
                fetched_at=time.monotonic(),
                error="lk_unavailable",
            )
            return [], "lk_unavailable"


async def fetch_student_info(mtuci_login: str, mtuci_password: str) -> dict:
    """Fetch student info from MTUCI LK (registration / profile)."""
    try:
        async with Mtuci(login=mtuci_login, password=mtuci_password) as client:
            user_info = await client.get_user_info()

            return {
                "name": user_info.name,
                "group": user_info.group,
                "department": user_info.department,
                "course": user_info.course,
                "speciality": user_info.speciality,
            }
    except AuthError as e:
        raise MTUCIAuthError(f"Invalid MTUCI credentials: {e}") from e
    except Exception as e:
        raise MTUCIServiceError(f"Failed to fetch student info: {e}") from e


async def fetch_lk_subjects(
    mtuci_login: str,
    mtuci_password: str,
) -> list[MtuciLkSubject]:
    """
    One LK session: attendance (all disciplines) + at most one schedule call for teachers.

    We do NOT loop over 21 days — each get_schedule() in mtuci-private-api reloads
    the full month timetable (dozens of HTTP calls).
    """
    try:
        async with Mtuci(login=mtuci_login, password=mtuci_password) as client:
            by_name: dict[str, MtuciLkSubject] = {}

            attendance_rows = await client.get_attendace()
            for row in attendance_rows:
                key = _normalize_subject_name(row.subject_name)
                if not key:
                    continue
                by_name[key] = MtuciLkSubject(
                    name=row.subject_name.strip(),
                    attendance_percent=float(row.attendance_percentage),
                    skips=int(row.skips) if row.skips is not None else None,
                )

            # Optional: single schedule sample for teacher names (one month fetch, not 21×)
            try:
                today = datetime.now(timezone.utc).replace(
                    hour=12, minute=0, second=0, microsecond=0
                )
                schedule = await client.get_schedule(today)
                for lesson in schedule.lessons:
                    name = (lesson.name or "").strip()
                    if not name:
                        continue
                    key = _normalize_subject_name(name)
                    teachers = [t.strip() for t in (lesson.teachers or []) if t and t.strip()]
                    existing = by_name.get(key)
                    if existing:
                        merged_teachers = list(
                            dict.fromkeys([*existing.teachers, *teachers])
                        )
                        by_name[key] = MtuciLkSubject(
                            name=existing.name,
                            attendance_percent=existing.attendance_percent,
                            skips=existing.skips,
                            teachers=merged_teachers,
                        )
                    else:
                        by_name[key] = MtuciLkSubject(name=name, teachers=teachers)
            except Exception as exc:
                logger.debug("LK schedule sample skipped: %s", exc)

            return sorted(by_name.values(), key=lambda s: s.name.lower())
    except AuthError as e:
        raise MTUCIAuthError(f"Invalid MTUCI credentials: {e}") from e
    except Exception as e:
        raise MTUCIServiceError(f"Failed to fetch LK subjects: {e}") from e
