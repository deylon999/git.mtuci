from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.repo_access import RepoAccessRole
from app.models.user import User, UserRole
from main import app


class _DummySession:
    def __init__(self, repo):
        self._repo = repo

    async def get(self, model, key):
        # Route helpers only request Repository by id.
        if str(getattr(self._repo, "id", "")) == str(key):
            return self._repo
        return None


def _user() -> User:
    return User(
        email="student@test.local",
        password_hash="x",
        full_name="Student",
        role=UserRole.student,
        is_pending=False,
        is_blocked=False,
    )


def test_issues_enforce_repo_role_read_vs_write(monkeypatch) -> None:
    import app.api.routes.issues as issues_route

    current_user = _user()
    repo_id = uuid4()
    repo = type("Repo", (), {"id": repo_id, "owner_id": uuid4(), "is_blocked": False})()

    app.dependency_overrides[get_current_user] = lambda: current_user

    async def _session_override():
        yield _DummySession(repo)

    app.dependency_overrides[get_session] = _session_override

    async def _role_check(session, *, user, repo, min_role):
        if min_role == RepoAccessRole.write:
            raise HTTPException(status_code=403, detail="write denied")

    async def _fake_get_issues(self, repository_id, **kwargs):
        return []

    monkeypatch.setattr(issues_route, "ensure_min_repo_role", _role_check)
    monkeypatch.setattr(issues_route.IssueService, "get_issues", _fake_get_issues)

    try:
        client = TestClient(app)
        read_resp = client.get(f"/repositories/{repo_id}/issues")
        assert read_resp.status_code == 200
        assert read_resp.json() == []

        write_resp = client.post(
            f"/repositories/{repo_id}/issues",
            json={"title": "Need fix"},
        )
        assert write_resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_reviews_enforce_write_role(monkeypatch) -> None:
    import app.api.routes.reviews as reviews_route

    current_user = _user()
    repo_id = uuid4()
    repo = type("Repo", (), {"id": repo_id, "owner_id": uuid4(), "is_blocked": False})()

    app.dependency_overrides[get_current_user] = lambda: current_user

    async def _session_override():
        yield _DummySession(repo)

    app.dependency_overrides[get_session] = _session_override

    async def _deny_write(session, *, user, repo, min_role):
        if min_role == RepoAccessRole.write:
            raise HTTPException(status_code=403, detail="write denied")

    monkeypatch.setattr(reviews_route, "ensure_min_repo_role", _deny_write)

    try:
        client = TestClient(app)
        resp = client.post(
            f"/pull-requests/{repo_id}/reviews",
            json={"state": "commented", "body": "Looks good"},
        )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_reviews_scoped_enforce_write_role(monkeypatch) -> None:
    import app.api.routes.reviews as reviews_route

    current_user = _user()
    repo_id = uuid4()
    repo = type("Repo", (), {"id": repo_id, "owner_id": uuid4(), "is_blocked": False})()

    app.dependency_overrides[get_current_user] = lambda: current_user

    async def _session_override():
        yield _DummySession(repo)

    app.dependency_overrides[get_session] = _session_override

    async def _deny_write(session, *, user, repo, min_role):
        if min_role == RepoAccessRole.write:
            raise HTTPException(status_code=403, detail="write denied")

    monkeypatch.setattr(reviews_route, "ensure_min_repo_role", _deny_write)

    try:
        client = TestClient(app)
        resp = client.post(
            f"/repositories/{repo_id}/pulls/1/reviews",
            json={"state": "commented", "body": "Looks good"},
        )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_reviews_scoped_invalid_pull_number(monkeypatch) -> None:
    import app.api.routes.reviews as reviews_route

    current_user = _user()
    repo_id = uuid4()
    repo = type("Repo", (), {"id": repo_id, "owner_id": uuid4(), "is_blocked": False})()

    app.dependency_overrides[get_current_user] = lambda: current_user

    async def _session_override():
        yield _DummySession(repo)

    app.dependency_overrides[get_session] = _session_override

    async def _allow(*args, **kwargs):
        return None

    monkeypatch.setattr(reviews_route, "ensure_min_repo_role", _allow)

    try:
        client = TestClient(app)
        resp = client.get(f"/repositories/{repo_id}/pulls/0/threads")
        assert resp.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_merge_service_blocks_on_branch_policy(monkeypatch) -> None:
    import app.services.gitea_service as gitea_service
    import app.services.student_dashboard_service as svc

    async def _noop(*args, **kwargs):
        return None

    async def _deny_policy(*args, **kwargs):
        raise HTTPException(status_code=409, detail="Merge blocked by branch policy")

    called = {"merge": False}

    async def _merge_pull_request(*args, **kwargs):
        called["merge"] = True
        return {"merged": True}

    monkeypatch.setattr(svc, "_ensure_repo_not_blocked_for_write", _noop)
    monkeypatch.setattr(svc, "_enforce_branch_policy_for_pull_merge", _deny_policy)
    monkeypatch.setattr(gitea_service, "merge_pull_request", _merge_pull_request)

    with pytest.raises(HTTPException) as err:
        asyncio.run(
            svc.merge_student_repository_pull(
                session=object(),  # not used when policy check fails early
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                pull_number=1,
            )
        )
    assert err.value.status_code == 409
    assert called["merge"] is False


def test_branch_policy_enforcement_uses_successful_checks(monkeypatch) -> None:
    import app.services.repo_settings_service as rs
    import app.services.student_dashboard_service as svc

    class _Rule:
        branch_pattern = "main"
        required_approvals = 0
        require_status_checks = True
        status_check_contexts = ["build"]
        required_reviewer_logins = []
        block_on_rejected_reviews = False

    class _Session:
        async def execute(self, stmt):
            class _Result:
                def scalar_one_or_none(self_inner):
                    return type("Repo", (), {"id": uuid4(), "owner_id": owner_id})()

            return _Result()

    owner_id = uuid4()

    async def _fake_list_branch_protections(session, *, repo):
        return [_Rule()]

    async def _fake_bundle(*args, **kwargs):
        return {
            "pull": {"base_branch": "main"},
            "reviews": [],
            "checks": {"successful_contexts": ["build"]},
        }

    monkeypatch.setattr(rs, "list_branch_protections", _fake_list_branch_protections)
    monkeypatch.setattr(svc, "get_student_repository_pull_detail_bundle", _fake_bundle)

    # Should not raise, because required check is present.
    asyncio.run(
        svc._enforce_branch_policy_for_pull_merge(
            _Session(),
            student_id=owner_id,
            repo_item_id=str(uuid4()),
            pull_number=1,
        )
    )


def test_branch_policy_enforcement_denies_when_required_check_missing(monkeypatch) -> None:
    import app.services.repo_settings_service as rs
    import app.services.student_dashboard_service as svc

    class _Rule:
        branch_pattern = "main"
        required_approvals = 0
        require_status_checks = True
        status_check_contexts = ["build"]
        required_reviewer_logins = []
        block_on_rejected_reviews = False

    class _Session:
        async def execute(self, stmt):
            class _Result:
                def scalar_one_or_none(self_inner):
                    return type("Repo", (), {"id": uuid4(), "owner_id": owner_id})()

            return _Result()

    owner_id = uuid4()

    async def _fake_list_branch_protections(session, *, repo):
        return [_Rule()]

    async def _fake_bundle(*args, **kwargs):
        return {
            "pull": {"base_branch": "main"},
            "reviews": [],
            "checks": {"successful_contexts": []},
        }

    monkeypatch.setattr(rs, "list_branch_protections", _fake_list_branch_protections)
    monkeypatch.setattr(svc, "get_student_repository_pull_detail_bundle", _fake_bundle)

    with pytest.raises(HTTPException) as err:
        asyncio.run(
            svc._enforce_branch_policy_for_pull_merge(
                _Session(),
                student_id=owner_id,
                repo_item_id=str(uuid4()),
                pull_number=1,
            )
        )
    assert err.value.status_code == 409
