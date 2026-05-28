from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException


class _ScalarWrap:
    def __init__(self, one=None, many=None):
        self._one = one
        self._many = many if many is not None else []

    def scalar_one_or_none(self):
        return self._one

    def all(self):
        return list(self._many)


class _ExecWrap:
    def __init__(self, one=None, many=None):
        self._scalars = _ScalarWrap(one=one, many=many)

    def scalar_one_or_none(self):
        return self._scalars.scalar_one_or_none()

    def scalars(self):
        return self._scalars


def test_issue_cross_refs_resolve_issue_pr_commit_and_ignore_foreign_repo(monkeypatch) -> None:
    import app.services.issue_service as svc

    class _DB:
        async def get(self, model, _id):
            return type("Owner", (), {"login": "owner", "mtuci_login": "owner", "email": "owner@test.local"})()

    service = svc.IssueService(_DB())
    repo_id = uuid4()
    issue_id = uuid4()
    repository = type("Repo", (), {"id": repo_id, "owner_id": uuid4(), "gitea_repo_name": "repo", "name": "repo"})()

    async def _issue_by_number(_repo_id, number):
        if number == 12:
            return type("Issue", (), {"id": uuid4()})()
        return None

    async def _pull(owner, repo, index):
        return {"number": index} if owner == "owner" and repo == "repo" and index == 34 else None

    async def _commit_exists(owner, repo, sha):
        return owner == "owner" and repo == "repo" and sha.lower().startswith("deadbee")

    monkeypatch.setattr(service, "get_issue_by_number", _issue_by_number)
    monkeypatch.setattr(svc, "get_pull_request", _pull)
    monkeypatch.setattr(svc, "commit_exists", _commit_exists)

    refs = asyncio.run(
        service._resolve_cross_references(
            repository=repository,
            text="refs #12 owner/repo#34 alien/other#99 deadbeef",
            source_issue_id=issue_id,
            source_comment_id=None,
            created_at=datetime.now(timezone.utc),
        )
    )
    by_type = {(r.reference_type, r.reference_value): r for r in refs}
    assert ("issue", "#12") in by_type
    assert ("pr", "#34") in by_type
    assert ("commit", "deadbeef") in by_type
    assert ("issue", "#99") not in by_type


def test_gitea_sync_collaborator_swallow_partial_failures(monkeypatch) -> None:
    import app.services.repo_access_service as rs
    from app.models.repo_access import RepoAccessRole

    class _DB:
        async def get(self, model, _id):
            return type("Owner", (), {"id": _id, "login": "owner", "mtuci_login": "owner", "email": "owner@test.local"})()

    async def _boom(*args, **kwargs):
        raise RuntimeError("gitea unavailable")

    async def _owner(*args, **kwargs):
        return "owner"

    monkeypatch.setattr(rs, "set_repo_collaborator", _boom)
    monkeypatch.setattr(rs, "remove_repo_collaborator", _boom)
    monkeypatch.setattr(rs, "resolve_repo_owner", _owner)

    repo = type("Repo", (), {"owner_id": uuid4(), "gitea_repo_name": "repo", "name": "repo"})()
    user = type("User", (), {"login": "dev", "mtuci_login": "dev", "email": "dev@test.local"})()
    asyncio.run(rs._gitea_sync_collaborator(_DB(), repo=repo, target_user=user, role=RepoAccessRole.write))
    asyncio.run(rs._gitea_sync_collaborator(_DB(), repo=repo, target_user=user, role=None))


def test_create_invite_idempotency_rejects_duplicate_pending() -> None:
    import app.services.repo_access_service as rs
    from app.models.repo_access import RepoAccessRole

    class _DB:
        def __init__(self):
            self.added = []
            self.exec_calls = 0

        async def execute(self, _query):
            self.exec_calls += 1
            # existing collaborator: none, pending invite: exists
            if self.exec_calls == 1:
                return _ExecWrap(one=None)
            return _ExecWrap(one=object())

        def add(self, row):
            self.added.append(row)

        async def flush(self):
            return None

    db = _DB()
    repo = type("Repo", (), {"id": uuid4(), "owner_id": uuid4()})()
    actor = type("User", (), {"id": uuid4(), "email": "owner@test.local", "full_name": "Owner", "group_name": None})()
    invitee = type("User", (), {"id": uuid4(), "email": "dev@test.local", "full_name": "Dev", "group_name": None})()

    # First execute call -> no collaborator; second -> pending invite exists => 400
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            rs.create_invite(
                db,
                repo=repo,
                actor=actor,
                invitee=invitee,
                role=RepoAccessRole.write,
            )
        )
    assert exc.value.status_code == 400
    assert "pending" in str(exc.value.detail).lower()


def test_issue_timeline_includes_bidirectional_pr_commit_backlinks() -> None:
    import app.services.issue_service as svc

    repo_id = uuid4()
    issue_id = uuid4()
    now = datetime.now(timezone.utc)

    outbound_pr = type(
        "XRef",
        (),
        {
            "id": uuid4(),
            "repository_id": repo_id,
            "source_issue_id": issue_id,
            "source_comment_id": None,
            "reference_type": "pr",
            "reference_value": "#7",
            "target_issue_id": None,
            "target_pr_number": 7,
            "target_commit_sha": None,
            "target_exists": True,
            "created_at": now,
        },
    )()
    outbound_commit = type(
        "XRef",
        (),
        {
            "id": uuid4(),
            "repository_id": repo_id,
            "source_issue_id": issue_id,
            "source_comment_id": None,
            "reference_type": "commit",
            "reference_value": "deadbeef",
            "target_issue_id": None,
            "target_pr_number": None,
            "target_commit_sha": "deadbeef",
            "target_exists": True,
            "created_at": now,
        },
    )()
    inbound_issue = type(
        "XRef",
        (),
        {
            "id": uuid4(),
            "repository_id": repo_id,
            "source_issue_id": uuid4(),
            "source_comment_id": None,
            "reference_type": "issue",
            "reference_value": "#1",
            "target_issue_id": issue_id,
            "target_pr_number": None,
            "target_commit_sha": None,
            "target_exists": True,
            "created_at": now,
        },
    )()
    shared_pr = type(
        "XRef",
        (),
        {
            "id": uuid4(),
            "repository_id": repo_id,
            "source_issue_id": uuid4(),
            "source_comment_id": None,
            "reference_type": "pr",
            "reference_value": "#7",
            "target_issue_id": None,
            "target_pr_number": 7,
            "target_commit_sha": None,
            "target_exists": True,
            "created_at": now,
        },
    )()
    shared_commit = type(
        "XRef",
        (),
        {
            "id": uuid4(),
            "repository_id": repo_id,
            "source_issue_id": uuid4(),
            "source_comment_id": None,
            "reference_type": "commit",
            "reference_value": "deadbeef",
            "target_issue_id": None,
            "target_pr_number": None,
            "target_commit_sha": "deadbeef",
            "target_exists": True,
            "created_at": now,
        },
    )()

    class _Exec:
        def __init__(self, rows):
            self._rows = rows

        def scalar_one_or_none(self):
            return self._rows[0] if self._rows else None

        def scalars(self):
            class _S:
                def __init__(self, rows):
                    self._rows = rows

                def all(self):
                    return list(self._rows)

            return _S(self._rows)

    class _DB:
        def __init__(self):
            self._calls = 0

        async def get(self, model, _id):
            return type("Owner", (), {"id": _id, "login": "owner", "mtuci_login": "owner", "email": "owner@test.local"})()

        async def execute(self, stmt):
            self._calls += 1
            # 1: outbound rows, 2: outbound issues, 3: outbound users, 4: inbound target_issue,
            # 5: shared PR/commit rows
            if self._calls == 1:
                return _Exec([outbound_pr, outbound_commit])
            if self._calls == 2:
                return _Exec([type("Issue", (), {"id": issue_id, "author_id": uuid4()})()])
            if self._calls == 3:
                return _Exec([type("User", (), {"id": uuid4(), "login": "author"})()])
            if self._calls == 4:
                return _Exec([inbound_issue])
            if self._calls == 5:
                return _Exec([shared_pr, shared_commit])
            return _Exec([])

    service = svc.IssueService(_DB())
    issue_number_map = {
        str(inbound_issue.source_issue_id): 21,
        str(shared_pr.source_issue_id): 22,
        str(shared_commit.source_issue_id): 23,
    }

    async def _get_issue(issue_uuid):
        if str(issue_uuid) == str(issue_id):
            return type("Issue", (), {"id": issue_id, "number": 1, "author_id": uuid4()})()
        number = issue_number_map.get(str(issue_uuid))
        return type("Issue", (), {"id": issue_uuid, "number": number, "author_id": uuid4()})() if number else None

    async def _get_comments(_issue_id):
        return []

    service.get_issue = _get_issue  # type: ignore[assignment]
    service.get_comments = _get_comments  # type: ignore[assignment]

    repository = type("Repo", (), {"id": repo_id, "owner_id": uuid4(), "gitea_repo_name": "repo", "name": "repo"})()
    issue = type("Issue", (), {"id": issue_id, "repository_id": repo_id, "author_id": None, "body": "x", "created_at": now})()

    timeline = asyncio.run(service.get_issue_timeline(repository, issue))
    ref_types = [row.get("reference_type") for row in timeline if row.get("type") == "cross_reference_backlink"]
    assert "issue_backlink" in ref_types
    assert "pr_backlink" in ref_types
    assert "commit_backlink" in ref_types
