from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.permission_checks import ensure_repo_content_access
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
    def scalars(self):
        return self

    def all(self):
        # No custom RolePermission rows (role defaults apply) and no repositories.
        return []

    def scalar_one_or_none(self):
        return None

    def scalar(self):
        return 0


class _Session:
    async def execute(self, stmt):
        return _Result()


def _check(user: User, target_id) -> None:
    asyncio.run(ensure_repo_content_access(user, _Session(), target_student_id=target_id))


def test_student_cannot_view_other_users_repo_content() -> None:
    student = _user(UserRole.student)
    _check(student, student.id)
    with pytest.raises(HTTPException) as exc:
        _check(student, uuid4())
    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", [UserRole.teacher, UserRole.laborant, UserRole.admin])
def test_staff_keep_cross_user_repo_access(role: UserRole) -> None:
    _check(_user(role), uuid4())


def _client_as(user: User) -> TestClient:
    async def _session_override():
        yield _Session()

    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def test_teacher_repository_routes_reject_students() -> None:
    repo_id = uuid4()
    try:
        resp = _client_as(_user(UserRole.student)).get(f"/teacher/repositories/{repo_id}/summary")
        assert resp.status_code == 403, resp.text

        # Staff pass the gate and reach the lookup (unknown repo -> 404).
        resp = _client_as(_user(UserRole.teacher)).get(f"/teacher/repositories/{repo_id}/summary")
        assert resp.status_code == 404, resp.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["/repositories/all", "/repositories/stats"])
def test_repository_directory_is_staff_only(path: str) -> None:
    try:
        assert _client_as(_user(UserRole.student)).get(path).status_code == 403
        assert _client_as(_user(UserRole.teacher)).get(path).status_code == 200
    finally:
        app.dependency_overrides.clear()
