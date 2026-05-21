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

from mtuci_private_api import Mtuci
from mtuci_private_api.errors import AuthError

logger = logging.getLogger(__name__)

# How long to reuse LK data per login (seconds)
LK_CACHE_TTL_SEC = 60 * 60

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


async def _fetch_attendance_disciplines_fast(client: Mtuci) -> list[MtuciLkSubject]:
    """
    One POST /getProcessor for the discipline list.

    mtuci_private_api AttendanceService.get_attendance() also calls getProcessor
    once per subject for skip counts (N+1, ~0.5s each) — we skip that for speed.
    """
    from json.decoder import JSONDecodeError

    from mtuci_private_api.attendance.parsers import AttendanceListParser
    from mtuci_private_api.attendance.request_factory import ProcessorRequestFactory
    from mtuci_private_api.config import app_config
    from mtuci_private_api.errors import GetAttendanceError, ParseError
    from mtuci_private_api.http import Method

    body = ProcessorRequestFactory().create(
        processor="getArray_ArrayDicsiplinesStudentAttendance"
    )
    response = await client.client.request(
        method=Method.POST,
        url=f"{app_config.mtuci_url}/ilk/x/getProcessor",
        body=body,
    )
    if not response.is_success:
        raise GetAttendanceError(f"Bad status: {response.text}")

    try:
        subjects = AttendanceListParser().parse(response.json())
    except (ParseError, JSONDecodeError) as exc:
        raise GetAttendanceError("Error parsing attendance response") from exc

    result: list[MtuciLkSubject] = []
    for subject in subjects:
        name = (subject.subject_name or "").strip()
        if not name:
            continue
        result.append(
            MtuciLkSubject(
                name=name,
                attendance_percent=float(subject.attendance_percentage),
                skips=None,
            )
        )
    return result


async def fetch_lk_subjects(
    mtuci_login: str,
    mtuci_password: str,
) -> list[MtuciLkSubject]:
    """
    One LK session: single attendance request (discipline list only, no per-subject skips).
    """
    try:
        async with Mtuci(login=mtuci_login, password=mtuci_password) as client:
            rows = await _fetch_attendance_disciplines_fast(client)
            by_name: dict[str, MtuciLkSubject] = {}
            for row in rows:
                key = _normalize_subject_name(row.name)
                if not key:
                    continue
                by_name[key] = row

            return sorted(by_name.values(), key=lambda s: s.name.lower())
    except AuthError as e:
        raise MTUCIAuthError(f"Invalid MTUCI credentials: {e}") from e
    except Exception as e:
        raise MTUCIServiceError(f"Failed to fetch LK subjects: {e}") from e
