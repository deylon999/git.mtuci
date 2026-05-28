from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException


def test_pull_checks_block_merge_when_policy_reasons_present() -> None:
    import app.services.student_dashboard_service as svc

    checks = svc._pull_checks_from_detail(
        {"state": "open", "merged": False, "draft": False, "mergeable": True},
        required_contexts=["build"],
        successful_contexts=["build"],
        policy_reasons=["Missing approvals from required reviewers: mentor1"],
        required_approvals=1,
        approvals=0,
        required_reviewer_logins=["mentor1"],
        approved_reviewer_logins=[],
    )
    assert checks["can_merge"] is False
    assert checks["blocked_reason"] == "required_reviewers_missing"
    assert checks["missing_required_reviewer_logins"] == ["mentor1"]


def test_pull_checks_keep_branch_policy_when_no_specific_reviewer_gap() -> None:
    import app.services.student_dashboard_service as svc

    checks = svc._pull_checks_from_detail(
        {"state": "open", "merged": False, "draft": False, "mergeable": True},
        required_contexts=["build"],
        successful_contexts=["build"],
        policy_reasons=["Repository is locked for maintenance"],
        required_approvals=1,
        approvals=1,
        required_reviewer_logins=["mentor1"],
        approved_reviewer_logins=["mentor1"],
    )
    assert checks["can_merge"] is False
    assert checks["blocked_reason"] == "branch_policy"


def test_pull_checks_block_merge_when_required_checks_missing() -> None:
    import app.services.student_dashboard_service as svc

    checks = svc._pull_checks_from_detail(
        {"state": "open", "merged": False, "draft": False, "mergeable": True},
        required_contexts=["build", "test"],
        successful_contexts=["build"],
    )
    assert checks["can_merge"] is False
    assert checks["blocked_reason"] == "required_checks_missing"
    assert checks["missing_required_contexts"] == ["test"]


def test_validate_required_reviewers_rejects_unknown_and_no_access(monkeypatch) -> None:
    import app.services.repo_settings_service as rs
    from app.models.user import User, UserRole

    class _UsersRows:
        def __init__(self, users):
            self._users = users

        def scalars(self):
            return self

        def all(self):
            return self._users

    class _Session:
        async def execute(self, stmt):
            user1 = User(
                email="mentor1@test.local",
                password_hash="x",
                full_name="Mentor One",
                role=UserRole.student,
                is_pending=False,
                is_blocked=False,
            )
            user2 = User(
                email="mentor2@test.local",
                password_hash="x",
                full_name="Mentor Two",
                role=UserRole.student,
                is_pending=False,
                is_blocked=False,
            )
            return _UsersRows([user1, user2])

    async def _fake_role(session, *, user, repo):
        if user.email.startswith("mentor1"):
            return None
        return "write"

    monkeypatch.setattr(rs, "get_user_repo_access_role", _fake_role)

    repo = type("Repo", (), {"id": uuid4(), "owner_id": uuid4()})()
    with pytest.raises(HTTPException) as err:
        asyncio.run(
            rs._validate_required_reviewers(
                _Session(),
                repo=repo,
                required_reviewer_logins=["mentor1", "ghost-user"],
            )
        )
    assert err.value.status_code == 400
    assert "Unknown reviewers" in str(err.value.detail)
    assert "without repository access" in str(err.value.detail)
