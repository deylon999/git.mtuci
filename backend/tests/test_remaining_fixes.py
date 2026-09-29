"""Regression tests: webhook test delivery, request-log user lookup, release assets,
submission file cleanup, comment edit rights, token revocation, email case, admin bootstrap."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import create_access_token, decode_access_token, get_current_user, hash_password
from app.models.repo_access import RepoAccessRole
from app.models.user import User, UserRole
from main import app


def _user(role: UserRole = UserRole.student, **extra) -> User:
    fields = dict(
        id=uuid4(),
        email=f"{role.value}-{uuid4().hex[:6]}@mtuci.ru",
        password_hash="x",
        full_name=role.value.title(),
        role=role,
        is_pending=False,
        is_blocked=False,
        allow_assistant_grading=False,
        avatar_display_mode="cover",
        created_at=datetime.now(timezone.utc),
        token_version=0,
    )
    fields.update(extra)
    return User(**fields)


class _Session:
    """get() by model name; add/commit/flush are no-ops."""

    def __init__(self, by_model: dict | None = None):
        self.by_model = by_model or {}
        self.added: list = []

    async def get(self, model, key):
        return self.by_model.get(model.__name__)

    async def execute(self, stmt):
        class _R:
            def scalar_one_or_none(self):
                return None

            def scalars(self):
                return self

            def first(self):
                return None

            def all(self):
                return []

        return _R()

    async def scalar(self, stmt):
        return 1 if "nextval" in str(stmt) else None

    def add(self, row):
        self.added.append(row)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, row):
        row.id = getattr(row, "id", None) or uuid4()
        row.created_at = getattr(row, "created_at", None) or datetime.now(timezone.utc)
        # Column defaults the DB would apply on flush.
        for name, default in (("is_blocked", False), ("is_pending", True), ("allow_assistant_grading", False), ("avatar_display_mode", "cover")):
            if getattr(row, name, None) is None:
                setattr(row, name, default)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# --- 6. Webhook "Test" really asks Gitea to deliver -------------------------------

def _webhook_setup(monkeypatch, *, hook_id):
    import app.services.repo_settings_service as svc
    from app.models.repo_settings import RepositoryWebhook
    from app.models.repository import Repository

    owner = _user(UserRole.student, email="owner1@mtuci.ru")  # Gitea login = email local part
    repo = Repository(id=uuid4(), name="demo", gitea_repo_name="demo", owner_id=owner.id)
    now = datetime.now(timezone.utc)
    row = RepositoryWebhook(
        id=uuid4(), repository_id=repo.id, gitea_hook_id=hook_id, url="https://ci.example.org/hook",
        events_csv="push", is_active=True, created_at=now, updated_at=now,
    )

    async def _owner(*, primary_owner, repo_name):
        return primary_owner

    monkeypatch.setattr(svc, "resolve_repo_owner", _owner)
    session = _Session({"RepositoryWebhook": row, "User": owner})
    return svc, session, repo, row


def test_webhook_test_is_queued_in_gitea(monkeypatch) -> None:
    svc, session, repo, row = _webhook_setup(monkeypatch, hook_id=42)
    calls: list = []

    async def _test_hook(*, owner, repo, hook_id):
        calls.append((owner, repo, hook_id))

    monkeypatch.setattr(svc, "test_gitea_repo_webhook", _test_hook)
    result = asyncio.run(svc.test_webhook_delivery(session, repo=repo, webhook_id=row.id))
    assert calls == [("owner1", "demo", 42)]
    assert result.last_delivery_status == "test_queued"


def test_webhook_test_reports_gitea_failure_and_unregistered_hooks(monkeypatch) -> None:
    svc, session, repo, row = _webhook_setup(monkeypatch, hook_id=42)

    async def _fail(**kwargs):
        raise RuntimeError("gitea down")

    monkeypatch.setattr(svc, "test_gitea_repo_webhook", _fail)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(svc.test_webhook_delivery(session, repo=repo, webhook_id=row.id))
    assert exc.value.status_code == 502
    assert row.last_delivery_status is None

    svc, session, repo, row = _webhook_setup(monkeypatch, hook_id=None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(svc.test_webhook_delivery(session, repo=repo, webhook_id=row.id))
    assert exc.value.status_code == 409


# --- 8. Request log resolves the user only for logged requests ---------------------

def test_request_log_skips_user_lookup_for_unlogged_requests(monkeypatch) -> None:
    import app.core.logging_middleware as mw

    calls: list = []

    async def _resolve(session, **kwargs):
        calls.append(kwargs["user_id"])
        raise RuntimeError("db down")

    monkeypatch.setattr(mw, "resolve_log_display_user", _resolve)
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_access_token(str(uuid4()))}"}

    assert client.get("/system/info", headers=headers).status_code == 200
    assert calls == []  # successful GETs are not logged, so no DB lookup

    # Logged request: the lookup runs, and its failure does not break the response.
    assert client.get("/definitely-not-a-route", headers=headers).status_code == 404
    assert len(calls) == 1


# --- 9. Release assets: streamed, size-limited, downloadable -----------------------

def _release_client(monkeypatch, tmp_path, *, asset=None):
    import app.api.routes.releases as rel
    from app.models.release import RepositoryRelease
    from app.models.repository import Repository

    user = _user(UserRole.teacher)
    repo = Repository(id=uuid4(), name="demo", owner_id=user.id)
    release = RepositoryRelease(id=uuid4(), repository_id=repo.id, tag_name="v1.0.0", name="v1")
    session = _Session({"Repository": repo, "RepositoryRelease": release, "ReleaseAsset": asset})

    async def _allow(*args, **kwargs):
        return None

    async def _session_override():
        yield session

    monkeypatch.setattr(rel, "ensure_min_repo_role", _allow)
    monkeypatch.setattr(rel, "ensure_repository_accessible", _allow)
    monkeypatch.setattr(rel.settings, "UPLOAD_DIR", str(tmp_path))
    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: user
    return rel, TestClient(app), session, repo, release


def test_release_asset_upload_is_stored_under_upload_dir(monkeypatch, tmp_path) -> None:
    rel, client, session, repo, release = _release_client(monkeypatch, tmp_path)
    url = f"/repositories/{repo.id}/releases/{release.id}/assets"
    assert client.post(url, files={"file": ("app.zip", b"x" * 100, "application/zip")}).status_code == 201
    assert client.post(url, files={"file": ("app.zip", b"y" * 100, "application/zip")}).status_code == 201

    stored = sorted((tmp_path / "releases").rglob("*_app.zip"))
    assert len(stored) == 2  # same name, two files: no overwrite
    assert [a.size_bytes for a in session.added] == [100, 100]
    assert all(str(tmp_path) in a.storage_path for a in session.added)


def test_release_asset_upload_rejects_oversize_and_cleans_up(monkeypatch, tmp_path) -> None:
    rel, client, session, repo, release = _release_client(monkeypatch, tmp_path)
    monkeypatch.setattr(rel, "_MAX_RELEASE_ASSET_BYTES", 10)
    resp = client.post(
        f"/repositories/{repo.id}/releases/{release.id}/assets",
        files={"file": ("big.bin", b"z" * 50, "application/octet-stream")},
    )
    assert resp.status_code == 413
    assert not [p for p in (tmp_path / "releases").rglob("*") if p.is_file()]
    assert session.added == []


def test_release_asset_download(monkeypatch, tmp_path) -> None:
    from app.models.release import ReleaseAsset

    stored = tmp_path / "releases" / "r" / "abc_app.zip"
    stored.parent.mkdir(parents=True)
    stored.write_bytes(b"payload")
    asset = ReleaseAsset(id=uuid4(), filename="app.zip", content_type="application/zip", size_bytes=7, storage_path=str(stored))

    rel, client, session, repo, release = _release_client(monkeypatch, tmp_path, asset=asset)
    asset.release_id = release.id
    resp = client.get(f"/repositories/{repo.id}/releases/{release.id}/assets/{asset.id}")
    assert resp.status_code == 200
    assert resp.content == b"payload"
    assert "app.zip" in resp.headers["content-disposition"]

    # A stored path outside the release folders is never served.
    asset.storage_path = str(tmp_path / "elsewhere.txt")
    (tmp_path / "elsewhere.txt").write_text("secret")
    assert client.get(f"/repositories/{repo.id}/releases/{release.id}/assets/{asset.id}").status_code == 404


def test_release_asset_schema_hides_storage_path() -> None:
    from app.schemas.release import ReleaseAssetRead

    assert "storage_path" not in ReleaseAssetRead.model_fields


# --- 10. Failed submission leaves no files behind ----------------------------------

def test_failed_submission_removes_uploaded_files(monkeypatch, tmp_path) -> None:
    import app.api.routes.courses as courses
    from app.models.assignment import Assignment
    from app.models.course import Course

    student = _user(UserRole.student)
    course = Course(id=uuid4(), title="C", grade_max=100)
    assignment = Assignment(id=uuid4(), course_id=course.id, title="A")

    async def _ok(*args, **kwargs):
        return None

    async def _course(*args, **kwargs):
        return course

    async def _assignment(*args, **kwargs):
        return assignment

    async def _notify_fails(*args, **kwargs):
        raise RuntimeError("notification backend down")

    async def _session_override():
        yield _Session()

    monkeypatch.setattr(courses, "ensure_assignment_read", _ok)
    monkeypatch.setattr(courses, "_ensure_student_enrolled", _ok)
    monkeypatch.setattr(courses, "_get_course_or_404", _course)
    monkeypatch.setattr(courses, "_get_assignment_or_404", _assignment)
    monkeypatch.setattr(courses, "notify_submission_created", _notify_fails)
    monkeypatch.setattr(courses.settings, "UPLOAD_DIR", str(tmp_path))
    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: student

    resp = TestClient(app, raise_server_exceptions=False).post(
        f"/courses/{course.id}/assignments/{assignment.id}/submit",
        files=[("files", ("a.txt", b"one", "text/plain")), ("files", ("b.txt", b"two", "text/plain"))],
    )
    assert resp.status_code == 500
    assert not [p for p in tmp_path.rglob("*") if p.is_file()]


# --- 11. Only the author (or a repo admin) edits/deletes a comment ------------------

def test_comment_edit_rights(monkeypatch) -> None:
    import app.api.routes.issues as issues

    seen: list[RepoAccessRole] = []

    async def _record(db, *, user, repository_id, min_role):
        seen.append(min_role)

    monkeypatch.setattr(issues, "_require_repo_access", _record)
    author, other = _user(), _user()
    comment = type("C", (), {"author_id": author.id})()
    issue = type("I", (), {"repository_id": uuid4()})()

    asyncio.run(issues._require_comment_edit_rights(None, user=author, comment=comment, issue=issue))
    asyncio.run(issues._require_comment_edit_rights(None, user=other, comment=comment, issue=issue))
    assert seen == [RepoAccessRole.read, RepoAccessRole.admin]


# --- 12. Password change revokes older tokens ----------------------------------------

@pytest.fixture
def login_as(monkeypatch):
    import app.services.system_log_display as log_display
    import app.services.user_service as user_service

    def _login(user: User, **claims) -> str:
        async def _by_id(session, user_id):
            return user if user_id == user.id else None

        monkeypatch.setattr(user_service, "get_user_by_id", _by_id)
        monkeypatch.setattr(log_display, "get_user_by_id", _by_id)
        return create_access_token(str(user.id), extra_claims=claims or None, expires_days=30)

    async def _session_override():
        yield _Session()

    app.dependency_overrides[get_session] = _session_override
    return _login


def test_password_change_revokes_old_tokens_but_keeps_this_session(login_as) -> None:
    user = _user(password_hash=hash_password("old-password-1"))
    old_token = login_as(user)  # issued before token versioning: no "tv" claim
    client = TestClient(app)
    auth = {"Authorization": f"Bearer {old_token}"}
    assert client.get("/auth/me", headers=auth).status_code == 200

    resp = client.patch(
        "/users/me/password",
        headers=auth,
        json={"old_password": "old-password-1", "new_password": "new-password-2"},
    )
    assert resp.status_code == 200, resp.text
    new_token = resp.json()["access_token"]
    assert user.token_version == 1
    assert decode_access_token(new_token)["tv"] == 1
    assert decode_access_token(new_token)["exp"] == decode_access_token(old_token)["exp"]

    stale = client.get("/auth/me", headers=auth)
    assert stale.status_code == 401 and "expired" in stale.json()["detail"].lower()
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {new_token}"}).status_code == 200


def test_admin_password_reset_bumps_token_version() -> None:
    from app.services.user_service import set_user_password

    user = _user()
    set_user_password(user, "another-pass-3")
    set_user_password(user, "another-pass-4")
    assert user.token_version == 2


# --- 13. Emails are case-insensitive ---------------------------------------------------

def test_email_lookup_is_case_insensitive_and_new_emails_are_lowercased() -> None:
    from sqlalchemy.dialects import postgresql

    from app.services.user_service import get_user_by_email, normalize_email

    assert normalize_email("  Ivan.Petrov@MTUCI.ru ") == "ivan.petrov@mtuci.ru"

    compiled: list[str] = []

    class _S:
        async def execute(self, stmt):
            compiled.append(str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})))

            class _R:
                def scalars(self):
                    return self

                def first(self):
                    return None

            return _R()

    asyncio.run(get_user_by_email(_S(), "Ivan.Petrov@MTUCI.ru"))
    assert "lower(users.email) = 'ivan.petrov@mtuci.ru'" in compiled[0]

    session = _Session()

    async def _session_override():
        yield session

    app.dependency_overrides[get_session] = _session_override
    resp = TestClient(app).post(
        "/auth/register",
        json={
            "email": "Ivan.Petrov@MTUCI.ru",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Ivan Petrov",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["email"] == "ivan.petrov@mtuci.ru"


# --- 14. Admin bootstrap never re-promotes or unblocks an existing account -----------

def _bootstrap(monkeypatch, existing: User | None) -> list:
    import main

    added: list = []

    class _Ctx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def add(self, row):
            added.append(row)

        async def commit(self):
            pass

    async def _by_email(session, email):
        return existing

    monkeypatch.setenv("ADMIN_EMAIL", "Root@MTUCI.ru")
    monkeypatch.setenv("ADMIN_PASSWORD", "bootstrap-pass")
    monkeypatch.setattr(main, "SessionLocal", _Ctx)
    monkeypatch.setattr(main, "get_user_by_email", _by_email)
    asyncio.run(main.create_super_admin_if_missing())
    return added


def test_admin_bootstrap_leaves_existing_account_alone(monkeypatch) -> None:
    blocked_admin = _user(UserRole.admin, is_blocked=True)
    impostor = _user(UserRole.student)
    assert _bootstrap(monkeypatch, blocked_admin) == []
    assert blocked_admin.is_blocked is True
    assert _bootstrap(monkeypatch, impostor) == []
    assert impostor.role == UserRole.student


def test_admin_bootstrap_creates_missing_admin(monkeypatch) -> None:
    added = _bootstrap(monkeypatch, None)
    assert len(added) == 1
    assert added[0].role == UserRole.admin and added[0].email == "root@mtuci.ru"
