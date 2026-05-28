from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest


def test_check_state_lifecycle_mapping() -> None:
    import app.services.student_dashboard_service as svc

    assert svc._check_state_from_status("queued") == "queued"
    assert svc._check_state_from_status("running") == "running"
    assert svc._check_state_from_status("in_progress") == "running"
    assert svc._check_state_from_status("completed") == "success"
    assert svc._check_state_from_status("cancelled") == "cancelled"
    assert svc._check_state_from_status("success") == "success"
    assert svc._check_state_from_status("failure") == "failure"


def test_build_pull_check_items_lifecycle_states() -> None:
    import app.services.student_dashboard_service as svc

    items, successful = svc._build_pull_check_items(
        commit_statuses_raw=[
            {"context": "build", "state": "success", "updated_at": "2026-05-28T10:00:00Z"},
            {"context": "test", "state": "pending", "updated_at": "2026-05-28T10:00:00Z"},
        ],
        action_runs_raw=[
            {"id": 11, "name": "lint", "status": "queued", "conclusion": ""},
            {"id": 12, "name": "e2e", "status": "completed", "conclusion": "cancelled"},
        ],
    )

    by_name = {row["name"]: row["state"] for row in items}
    assert by_name["build"] == "success"
    assert by_name["test"] == "running"
    assert by_name["lint"] == "queued"
    assert by_name["e2e"] == "cancelled"
    assert successful == ["build"]


def test_review_summary_uses_latest_state_per_reviewer_and_normalizes_login() -> None:
    import app.services.student_dashboard_service as svc

    approvals, rejected, approved = svc._summarize_review_states_for_policy(
        [
            {
                "user_login": "Mentor1",
                "state": "APPROVED",
                "submitted_at": "2026-05-28T10:00:00Z",
            },
            {
                "user_login": "mentor1",
                "state": "CHANGES_REQUESTED",
                "submitted_at": "2026-05-28T10:05:00Z",
            },
            {
                "user_login": "reviewer2",
                "state": "lgtm",
                "submitted_at": "2026-05-28T10:10:00Z",
            },
        ]
    )
    assert approvals == 1
    assert rejected is True
    assert approved == {"reviewer2"}


def test_create_webhook_does_not_add_row_when_gitea_creation_fails(monkeypatch) -> None:
    import app.services.repo_settings_service as rs
    from app.models.user import User, UserRole

    owner_id = uuid4()
    owner = User(
        id=owner_id,
        email="owner@example.com",
        password_hash="x",
        full_name="Owner",
        role=UserRole.student,
        is_pending=False,
        is_blocked=False,
    )

    class _Session:
        def __init__(self):
            self.added = False

        async def get(self, model, key):
            if str(key) == str(owner_id):
                return owner
            return None

        def add(self, row):
            self.added = True

        async def flush(self):
            return None

    async def _raise(*args, **kwargs):
        raise RuntimeError("gitea down")

    async def _owner(*args, **kwargs):
        return "owner"

    monkeypatch.setattr(rs, "create_gitea_repo_webhook", _raise)
    monkeypatch.setattr(rs, "resolve_repo_owner", _owner)

    session = _Session()
    repo = type("Repo", (), {"id": uuid4(), "owner_id": owner_id, "gitea_repo_name": "r", "name": "r"})()

    with pytest.raises(RuntimeError):
        asyncio.run(
            rs.create_webhook(
                session,
                repo=repo,
                url="https://example/hook",
                events=["push"],
                secret="x",
                is_active=True,
            )
        )
    assert session.added is False


def test_branch_rule_match_prefers_exact_then_most_specific_wildcard() -> None:
    import app.services.repo_settings_service as rs

    exact = type("Rule", (), {"branch_pattern": "main"})()
    broad = type("Rule", (), {"branch_pattern": "release/*"})()
    specific = type("Rule", (), {"branch_pattern": "release/2026.*"})()

    selected = rs.match_branch_protection_rule([broad, specific], branch="release/2026.05")
    assert selected is specific

    selected_exact = rs.match_branch_protection_rule([broad, exact], branch="main")
    assert selected_exact is exact
