from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from main import app


def _user(role: UserRole) -> User:
    return User(
        id=uuid4(),
        email=f"{role.value}-{uuid4().hex[:6]}@test.local",
        password_hash="x",
        full_name=role.value.title(),
        role=role,
        is_pending=False,
        is_blocked=False,
        created_at=datetime.now(timezone.utc),
    )


class _Result:
    def __init__(self, target):
        self._target = target

    def scalar_one_or_none(self):
        return self._target

    def scalars(self):
        return self

    def all(self):
        # No custom RolePermission rows: role defaults apply.
        return []


class _Session:
    def __init__(self, target: User | None):
        self.target = target

    async def execute(self, stmt):
        return _Result(self.target)

    def add(self, row):
        return None

    async def commit(self):
        return None

    async def refresh(self, entity):
        return None


def _client(monkeypatch, *, actor: User, target: User | None) -> TestClient:
    import app.api.routes.admin as admin_route

    session = _Session(target)

    async def _session_override():
        yield session

    async def _update(session, *, user_id, role, is_blocked, is_pending=True, group_name=None, student_id=None):
        target.role = role
        return target

    async def _reset(*args, **kwargs):
        return None

    monkeypatch.setattr(admin_route, "update_user_role_and_block", _update)
    monkeypatch.setattr(admin_route, "reset_user_password", _reset)
    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: actor
    return TestClient(app)


def _patch_role(client: TestClient, target: User, role: str):
    return client.patch(
        f"/admin/users/{target.id}",
        json={"role": role, "is_blocked": False, "is_pending": False},
    )


def test_register_teacher_endpoint_is_gone() -> None:
    client = TestClient(app)
    resp = client.post(
        "/auth/register-teacher",
        json={"email": "t@test.local", "password": "password123", "full_name": "T"},
    )
    assert resp.status_code in {404, 405}


def test_teacher_cannot_grant_staff_or_admin_roles(monkeypatch) -> None:
    try:
        for role in ("admin", "teacher"):
            student = _user(UserRole.student)
            client = _client(monkeypatch, actor=_user(UserRole.teacher), target=student)
            resp = _patch_role(client, student, role)
            assert resp.status_code == 403, (role, resp.text)
            assert student.role == UserRole.student
    finally:
        app.dependency_overrides.clear()


def test_teacher_cannot_manage_other_teachers(monkeypatch) -> None:
    try:
        other = _user(UserRole.teacher)
        client = _client(monkeypatch, actor=_user(UserRole.teacher), target=other)
        assert _patch_role(client, other, "student").status_code == 403
        assert client.post(f"/admin/users/{other.id}/reset-password").status_code == 403
        assert other.role == UserRole.teacher
    finally:
        app.dependency_overrides.clear()


def test_teacher_can_still_manage_students(monkeypatch) -> None:
    try:
        student = _user(UserRole.student)
        client = _client(monkeypatch, actor=_user(UserRole.teacher), target=student)
        resp = _patch_role(client, student, "laborant")
        assert resp.status_code == 200, resp.text
        assert resp.json()["role"] == "laborant"
        assert client.post(f"/admin/users/{student.id}/reset-password").status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_admin_can_grant_teacher_but_not_touch_admins(monkeypatch) -> None:
    try:
        student = _user(UserRole.student)
        client = _client(monkeypatch, actor=_user(UserRole.admin), target=student)
        resp = _patch_role(client, student, "teacher")
        assert resp.status_code == 200, resp.text
        assert resp.json()["role"] == "teacher"

        other_admin = _user(UserRole.admin)
        client = _client(monkeypatch, actor=_user(UserRole.admin), target=other_admin)
        assert _patch_role(client, other_admin, "student").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_teacher_csv_import_rejects_privileged_roles(monkeypatch) -> None:
    try:
        client = _client(monkeypatch, actor=_user(UserRole.teacher), target=None)
        csv_body = (
            "email,full_name,role\n"
            "boss@test.local,Boss,admin\n"
            "peer@test.local,Peer,teacher\n"
            "kid@test.local,Kid,student\n"
        )
        resp = client.post(
            "/admin/users/import",
            files={"file": ("users.csv", csv_body.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] == 1
        assert len(body["errors"]) == 2
        assert all("Only admins can import" in e for e in body["errors"])
    finally:
        app.dependency_overrides.clear()
