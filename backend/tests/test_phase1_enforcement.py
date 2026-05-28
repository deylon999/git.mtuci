from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.services.repo_settings_service import evaluate_merge_policy
from main import app


class _DummySession:
    async def commit(self) -> None:
        return None


def _admin_user() -> User:
    return User(
        email="admin@test.local",
        password_hash="x",
        full_name="Admin",
        role=UserRole.admin,
        is_pending=False,
        is_blocked=False,
    )


def test_merge_policy_denies_missing_approvals_and_checks() -> None:
    result = evaluate_merge_policy(
        required_approvals=2,
        require_status_checks=True,
        required_status_contexts=["build", "test"],
        required_reviewer_logins=[],
        block_on_rejected_reviews=True,
        approvals=1,
        successful_checks=["build"],
        approved_reviewer_logins=[],
        has_rejected_review=True,
    )
    assert result.allowed is False
    assert any("Not enough approvals" in r for r in result.reasons)
    assert any("Missing required checks" in r for r in result.reasons)
    assert any("rejected review" in r for r in result.reasons)


def test_merge_policy_allows_when_requirements_met() -> None:
    result = evaluate_merge_policy(
        required_approvals=1,
        require_status_checks=True,
        required_status_contexts=["build", "test"],
        required_reviewer_logins=[],
        block_on_rejected_reviews=True,
        approvals=1,
        successful_checks=["build", "test"],
        approved_reviewer_logins=[],
        has_rejected_review=False,
    )
    assert result.allowed is True
    assert result.reasons == []


def test_merge_policy_denies_missing_required_reviewer_approval() -> None:
    result = evaluate_merge_policy(
        required_approvals=1,
        require_status_checks=False,
        required_status_contexts=[],
        required_reviewer_logins=["mentor1"],
        block_on_rejected_reviews=False,
        approvals=1,
        successful_checks=[],
        approved_reviewer_logins=["someone_else"],
        has_rejected_review=False,
    )
    assert result.allowed is False
    assert any("required reviewers" in r for r in result.reasons)


def test_check_merge_endpoint_denies_when_policy_not_met(monkeypatch) -> None:
    import app.api.routes.repository_settings as rs

    class _Rule:
        branch_pattern = "main"
        required_approvals = 2
        require_status_checks = True
        status_check_contexts = ["build", "test"]
        required_reviewer_logins = []
        dismiss_stale_approvals = True
        block_on_rejected_reviews = True

    async def _fake_ensure_manageable_repo(session, repository_id, current_user):
        class _Repo:
            id = repository_id

        return _Repo()

    async def _fake_list_branch_protections(session, *, repo):
        return [_Rule()]

    app.dependency_overrides[get_current_user] = _admin_user

    async def _session_override():
        yield _DummySession()

    app.dependency_overrides[get_session] = _session_override
    monkeypatch.setattr(rs, "ensure_manageable_repo", _fake_ensure_manageable_repo)
    monkeypatch.setattr(rs, "list_branch_protections", _fake_list_branch_protections)

    try:
        client = TestClient(app)
        response = client.post(
            f"/repositories/{uuid4()}/settings/branch-protection/check-merge",
            json={
                "branch": "main",
                "approvals": 0,
                "successful_checks": ["build"],
                "has_rejected_review": False,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is False
        assert any("Not enough approvals" in r for r in data["reasons"])
    finally:
        app.dependency_overrides.clear()


def test_check_merge_endpoint_denies_missing_required_reviewer(monkeypatch) -> None:
    import app.api.routes.repository_settings as rs

    class _Rule:
        branch_pattern = "main"
        required_approvals = 1
        require_status_checks = False
        status_check_contexts = []
        required_reviewer_logins = ["mentor1"]
        dismiss_stale_approvals = True
        block_on_rejected_reviews = False

    async def _fake_ensure_manageable_repo(session, repository_id, current_user):
        class _Repo:
            id = repository_id

        return _Repo()

    async def _fake_list_branch_protections(session, *, repo):
        return [_Rule()]

    app.dependency_overrides[get_current_user] = _admin_user

    async def _session_override():
        yield _DummySession()

    app.dependency_overrides[get_session] = _session_override
    monkeypatch.setattr(rs, "ensure_manageable_repo", _fake_ensure_manageable_repo)
    monkeypatch.setattr(rs, "list_branch_protections", _fake_list_branch_protections)

    try:
        client = TestClient(app)
        response = client.post(
            f"/repositories/{uuid4()}/settings/branch-protection/check-merge",
            json={
                "branch": "main",
                "approvals": 1,
                "successful_checks": [],
                "approved_reviewer_logins": ["someone_else"],
                "has_rejected_review": False,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is False
        assert any("required reviewers" in r for r in data["reasons"])
    finally:
        app.dependency_overrides.clear()


def test_check_merge_endpoint_respects_role_denial(monkeypatch) -> None:
    import app.api.routes.repository_settings as rs

    async def _deny_manageable_repo(session, repository_id, current_user):
        raise HTTPException(status_code=403, detail="forbidden")

    app.dependency_overrides[get_current_user] = _admin_user

    async def _session_override():
        yield _DummySession()

    app.dependency_overrides[get_session] = _session_override
    monkeypatch.setattr(rs, "ensure_manageable_repo", _deny_manageable_repo)

    try:
        client = TestClient(app)
        response = client.post(
            f"/repositories/{uuid4()}/settings/branch-protection/check-merge",
            json={
                "branch": "main",
                "approvals": 2,
                "successful_checks": ["build", "test"],
                "has_rejected_review": False,
            },
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_check_merge_endpoint_matches_wildcard_branch_pattern(monkeypatch) -> None:
    import app.api.routes.repository_settings as rs

    class _Rule:
        branch_pattern = "release/*"
        required_approvals = 1
        require_status_checks = False
        status_check_contexts = []
        required_reviewer_logins = ["mentor1"]
        dismiss_stale_approvals = True
        block_on_rejected_reviews = False

    async def _fake_ensure_manageable_repo(session, repository_id, current_user):
        class _Repo:
            id = repository_id

        return _Repo()

    async def _fake_list_branch_protections(session, *, repo):
        return [_Rule()]

    app.dependency_overrides[get_current_user] = _admin_user

    async def _session_override():
        yield _DummySession()

    app.dependency_overrides[get_session] = _session_override
    monkeypatch.setattr(rs, "ensure_manageable_repo", _fake_ensure_manageable_repo)
    monkeypatch.setattr(rs, "list_branch_protections", _fake_list_branch_protections)

    try:
        client = TestClient(app)
        response = client.post(
            f"/repositories/{uuid4()}/settings/branch-protection/check-merge",
            json={
                "branch": "release/2026.05",
                "approvals": 1,
                "successful_checks": [],
                "approved_reviewer_logins": [],
                "has_rejected_review": False,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is False
        assert any("required reviewers" in r for r in data["reasons"])
    finally:
        app.dependency_overrides.clear()
