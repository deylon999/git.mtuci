"""Regression tests: late penalties, review comment routes, student IDs, per-user rate
limiting, avatar URLs/static mount, and SMTP sends off the event loop."""
from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import create_access_token, get_current_user
from app.models.user import User, UserRole
from main import app

DEADLINE = datetime(2026, 10, 1, 23, 59, tzinfo=timezone.utc)


# --- 11. Late penalty -------------------------------------------------------------

def test_weeks_late_counts_started_weeks() -> None:
    from app.api.routes.courses import _weeks_late

    assert _weeks_late(DEADLINE, DEADLINE) == 0
    assert _weeks_late(DEADLINE - timedelta(hours=5), DEADLINE) == 0
    assert _weeks_late(DEADLINE + timedelta(minutes=1), DEADLINE) == 1
    assert _weeks_late(DEADLINE + timedelta(hours=23), DEADLINE) == 1
    assert _weeks_late(DEADLINE + timedelta(days=7), DEADLINE) == 1
    assert _weeks_late(DEADLINE + timedelta(days=7, hours=1), DEADLINE) == 2
    # Naive timestamps are treated as UTC, not rejected.
    assert _weeks_late(DEADLINE.replace(tzinfo=None) + timedelta(hours=1), DEADLINE) == 1


def test_penalty_tiers_and_empty_periods() -> None:
    from app.api.routes.courses import _late_max_grade, _max_grade_for_weeks_late

    tiers = [{"weeks": 1, "max_grade": 80}, {"weeks": 2, "max_grade": 50}]
    assert _max_grade_for_weeks_late(tiers, 1) == 80
    assert _max_grade_for_weeks_late(tiers, 2) == 50
    assert _max_grade_for_weeks_late(tiers, 3) == 0.0
    # No tiers configured -> students see no penalty rules, so late work is not capped.
    assert _max_grade_for_weeks_late([], 3) == float("inf")
    assert _late_max_grade([], 3) is None
    assert _late_max_grade(tiers, 2) == 50


# --- 12. Review comment routes no longer collide with issue comments --------------

def _route_owner(path: str, method: str) -> str:
    for route in app.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return route.endpoint.__module__
    return ""


def test_review_and_issue_comment_routes_are_distinct() -> None:
    for method in ("PATCH", "DELETE"):
        assert _route_owner("/review-comments/{comment_id}", method).endswith("routes.reviews")
        assert _route_owner("/comments/{comment_id}", method).endswith("routes.issues")


# --- 13. Next student ID ignores non-numeric IDs ----------------------------------

def test_next_student_id_query_skips_non_numeric_ids() -> None:
    from sqlalchemy.dialects import postgresql

    from app.services.user_service import get_next_student_id

    seen: list[str] = []

    class _Session:
        def __init__(self, value):
            self.value = value

        async def execute(self, stmt):
            seen.append(str(stmt.compile(dialect=postgresql.dialect())))
            value = self.value

            class _R:
                def scalar(self):
                    return value

            return _R()

    assert asyncio.run(get_next_student_id(_Session(41))) == "42"
    assert asyncio.run(get_next_student_id(_Session(None))) == "1"
    assert "~" in seen[0] and "BIGINT" in seen[0]


# --- 14. Rate limit is per user behind a shared proxy IP --------------------------

def test_rate_limit_buckets_signed_in_users_separately() -> None:
    from app.core.rate_limit_middleware import RateLimitMiddleware

    limited = FastAPI()
    limited.add_middleware(RateLimitMiddleware, requests_per_minute=2)

    @limited.get("/x")
    async def x():
        return {"ok": True}

    client = TestClient(limited)  # every request comes from the same "proxy" IP
    alice = {"Authorization": f"Bearer {create_access_token(str(uuid4()))}"}
    bob = {"Authorization": f"Bearer {create_access_token(str(uuid4()))}"}

    assert [client.get("/x", headers=alice).status_code for _ in range(3)] == [200, 200, 429]
    assert client.get("/x", headers=bob).status_code == 200
    # Anonymous / forged tokens share the IP bucket.
    forged = {"Authorization": "Bearer not-a-jwt"}
    assert [client.get("/x", headers=forged).status_code for _ in range(3)] == [200, 200, 429]


# --- 17. Avatars: relative URL, only the avatars folder is public ------------------

def test_avatar_url_is_site_relative(monkeypatch, tmp_path) -> None:
    import app.api.routes.users as users_route

    user = User(
        id=uuid4(),
        email="student@mtuci.ru",
        password_hash="x",
        full_name="Student",
        role=UserRole.student,
        is_pending=False,
        is_blocked=False,
        allow_assistant_grading=False,
        avatar_display_mode="cover",
        created_at=datetime.now(timezone.utc),
    )

    class _Session:
        def add(self, row):
            pass

        async def commit(self):
            pass

        async def refresh(self, row):
            pass

    async def _session_override():
        yield _Session()

    monkeypatch.setattr(users_route.settings, "UPLOAD_DIR", str(tmp_path))
    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        resp = TestClient(app).post(
            "/users/me/avatar",
            files={"file": ("me.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["avatar_url"] == f"/uploads/avatars/{user.id}.png"
        assert (tmp_path / "avatars" / f"{user.id}.png").exists()
    finally:
        app.dependency_overrides.clear()


def test_only_avatars_are_statically_served() -> None:
    mounts = {getattr(r, "path", "") for r in app.routes if r.__class__.__name__ == "Mount"}
    assert "/uploads/avatars" in mounts
    assert "/uploads" not in mounts
    assert TestClient(app).get("/uploads/submissions/anything.pdf").status_code == 404


# --- 18. SMTP send runs off the event loop ------------------------------------------

def test_password_reset_email_is_sent_from_worker_thread(monkeypatch) -> None:
    import app.services.password_reset_service as reset_service

    user = User(id=uuid4(), email="student@mtuci.ru", password_hash="x", full_name="S", role=UserRole.student)
    calls: list[int] = []

    def _send(email, token):
        calls.append(threading.get_ident())

    class _Result:
        def scalar_one_or_none(self):
            return user

    class _Session:
        async def execute(self, stmt):
            return _Result()

        def add(self, row):
            pass

        async def commit(self):
            pass

    monkeypatch.setattr(reset_service, "send_reset_email", _send)

    async def _run() -> int:
        await reset_service.request_password_reset(_Session(), email=user.email)
        return threading.get_ident()

    loop_thread = asyncio.run(_run())
    assert calls and calls[0] != loop_thread
