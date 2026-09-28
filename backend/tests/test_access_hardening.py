"""Regression tests: pending students, webhook signatures, collaborator roles,
reset-link logging, submission repo links, and the admin activity WebSocket."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.database import get_session
from app.core.security import create_access_token
from app.models.repo_access import RepoAccessRole
from app.models.user import User, UserRole
from main import app


def _user(role: UserRole, *, pending: bool = False) -> User:
    return User(
        id=uuid4(),
        email=f"{role.value}-{uuid4().hex[:6]}@mtuci.ru",
        password_hash="x",
        full_name=role.value.title(),
        role=role,
        is_pending=pending,
        is_blocked=False,
        allow_assistant_grading=False,
        avatar_display_mode="cover",
        created_at=datetime.now(timezone.utc),
    )


class _Result:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalar(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return []


class _Session:
    def __init__(self, value=None, users: dict | None = None):
        self.value = value
        self.users = users or {}
        self.added: list = []

    async def execute(self, stmt):
        return _Result(self.value)

    async def get(self, model, key):
        return self.users.get(key)

    def add(self, row):
        self.added.append(row)

    async def commit(self):
        return None

    async def refresh(self, entity):
        entity.id = entity.id or uuid4()
        entity.created_at = entity.created_at or datetime.now(timezone.utc)
        entity.is_blocked = bool(entity.is_blocked)
        entity.allow_assistant_grading = bool(entity.allow_assistant_grading)
        entity.avatar_display_mode = entity.avatar_display_mode or "cover"


@pytest.fixture
def as_user(monkeypatch):
    """Authenticate requests with a real JWT for the given user (no DB)."""
    import app.services.system_log_display as log_display
    import app.services.user_service as user_service

    def _login(user: User) -> dict[str, str]:
        async def _by_id(session, user_id):
            return user if user_id == user.id else None

        monkeypatch.setattr(user_service, "get_user_by_id", _by_id)
        # LoggingMiddleware resolves the bearer's name for request logs via its own import.
        monkeypatch.setattr(log_display, "get_user_by_id", _by_id)
        return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}

    async def _session_override():
        yield _Session()

    app.dependency_overrides[get_session] = _session_override
    yield _login
    app.dependency_overrides.clear()


# --- 5. Pending students ---------------------------------------------------------

def test_pending_student_only_reaches_me_and_settings(as_user) -> None:
    client = TestClient(app)
    headers = as_user(_user(UserRole.student, pending=True))

    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["is_pending"] is True
    assert client.get("/users/me/settings", headers=headers).status_code == 200

    blocked = client.get("/roles/my-permissions", headers=headers)
    assert blocked.status_code == 403
    assert "pending" in blocked.json()["detail"].lower()


def test_approved_student_and_pending_staff_are_not_blocked(as_user) -> None:
    client = TestClient(app)
    for user in (_user(UserRole.student), _user(UserRole.teacher, pending=True)):
        headers = as_user(user)
        assert client.get("/roles/my-permissions", headers=headers).status_code == 200


def test_mtuci_registration_without_lk_credentials_stays_pending() -> None:
    session = _Session()

    async def _session_override():
        yield session

    app.dependency_overrides[get_session] = _session_override
    try:
        resp = TestClient(app).post(
            "/auth/register-student-mtuci",
            json={
                "email": "new.student@mtuci.ru",
                "password": "password123",
                "confirm_password": "password123",
                "full_name": "New Student",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["is_pending"] is True
    finally:
        app.dependency_overrides.clear()


# --- 6. Webhook signatures -------------------------------------------------------

def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_webhook_signature_is_mandatory(monkeypatch) -> None:
    import app.api.routes.webhooks as webhooks

    body = b'{"action":"deleted"}'
    monkeypatch.setattr(webhooks, "WEBHOOK_SECRET", "s3cret")
    assert webhooks.verify_webhook_signature(body, None) is False
    assert webhooks.verify_webhook_signature(body, "") is False
    assert webhooks.verify_webhook_signature(body, "deadbeef") is False
    assert webhooks.verify_webhook_signature(body, _sign("s3cret", body)) is True
    assert webhooks.verify_webhook_signature(body, "sha256=" + _sign("s3cret", body)) is True

    monkeypatch.setattr(webhooks, "WEBHOOK_SECRET", "")
    assert webhooks.verify_webhook_signature(body, _sign("", body)) is False


def test_unsigned_repository_webhook_is_rejected(monkeypatch) -> None:
    import app.api.routes.webhooks as webhooks

    monkeypatch.setattr(webhooks, "WEBHOOK_SECRET", "s3cret")

    async def _session_override():
        yield _Session()

    app.dependency_overrides[get_session] = _session_override
    try:
        resp = TestClient(app).post(
            "/webhooks/gitea",
            content=b'{"action":"deleted","repository":{"id":1},"sender":{}}',
            headers={"X-Gitea-Event": "repository", "Content-Type": "application/json"},
        )
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


# --- 7. Collaborator roles on shared repositories --------------------------------

def _write_check(monkeypatch, *, role: RepoAccessRole | None, min_role: RepoAccessRole, owner: bool = False, blocked: bool = False):
    import app.services.repo_access_service as repo_access
    from app.models.repository import Repository
    from app.services.student_dashboard_service import _ensure_repo_not_blocked_for_write

    student = _user(UserRole.student)
    repo = Repository(id=uuid4(), name="shared", owner_id=student.id if owner else uuid4(), is_blocked=blocked)

    async def _role(session, *, user, repo):
        return role

    monkeypatch.setattr(repo_access, "get_user_repo_access_role", _role)
    session = _Session(value=repo, users={student.id: student})
    asyncio.run(
        _ensure_repo_not_blocked_for_write(
            session, student_id=student.id, repo_item_id=str(repo.id), min_role=min_role
        )
    )


def test_read_collaborator_cannot_write_or_merge(monkeypatch) -> None:
    for min_role in (RepoAccessRole.write, RepoAccessRole.admin):
        with pytest.raises(HTTPException) as exc:
            _write_check(monkeypatch, role=RepoAccessRole.read, min_role=min_role)
        assert exc.value.status_code == 403


def test_write_collaborator_can_merge_but_not_force(monkeypatch) -> None:
    _write_check(monkeypatch, role=RepoAccessRole.write, min_role=RepoAccessRole.write)
    with pytest.raises(HTTPException):
        _write_check(monkeypatch, role=RepoAccessRole.write, min_role=RepoAccessRole.admin)


def test_read_collaborator_can_still_comment(monkeypatch) -> None:
    _write_check(monkeypatch, role=RepoAccessRole.read, min_role=RepoAccessRole.read)


def test_owner_passes_and_blocked_shared_repo_rejects_writes(monkeypatch) -> None:
    from app.services.repository_access_service import RepositoryBlockedError

    _write_check(monkeypatch, role=None, min_role=RepoAccessRole.admin, owner=True)
    with pytest.raises(RepositoryBlockedError):
        _write_check(monkeypatch, role=RepoAccessRole.write, min_role=RepoAccessRole.write, blocked=True)


# --- 8. Password reset link is not logged when it can be emailed -----------------

def test_reset_link_not_logged_when_smtp_configured(monkeypatch, caplog) -> None:
    import app.services.email_service as email_service

    class _SMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, *args):
            pass

        def sendmail(self, *args):
            pass

    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(email_service.smtplib, "SMTP", _SMTP)
    with caplog.at_level(logging.DEBUG):
        email_service.send_reset_email("user@test.local", "SECRET-TOKEN-123")
    assert "SECRET-TOKEN-123" not in caplog.text


# --- 9. Submission repository link ------------------------------------------------

@pytest.mark.parametrize("value", ["javascript:alert(1)", "data:text/html,x", "http://", "ftp://host/repo"])
def test_submission_repository_url_rejects_non_http(value: str) -> None:
    from app.api.routes.courses import _clean_submission_repository_url

    with pytest.raises(HTTPException) as exc:
        _clean_submission_repository_url(value)
    assert exc.value.status_code == 400


def test_submission_repository_url_accepts_http_links() -> None:
    from app.api.routes.courses import _clean_submission_repository_url

    assert _clean_submission_repository_url("  https://git.example.org/u/repo  ") == "https://git.example.org/u/repo"
    assert _clean_submission_repository_url("   ") is None
    assert _clean_submission_repository_url(None) is None


# --- 10. Activity WebSocket -------------------------------------------------------

def test_activity_websocket_requires_admin_token(as_user) -> None:
    client = TestClient(app)

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/activity"):
            pass

    student_headers = as_user(_user(UserRole.student))
    student_token = student_headers["Authorization"].split()[1]
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/activity?token={student_token}"):
            pass

    admin_token = as_user(_user(UserRole.admin))["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/activity?token={admin_token}") as ws:
        assert ws.receive_json()["type"] == "connected"


def test_test_broadcast_endpoint_is_gone() -> None:
    assert TestClient(app).get("/ws/test-broadcast").status_code == 404
