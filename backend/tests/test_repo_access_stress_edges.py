from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class _Exec:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


def test_bulk_upsert_collaborators_partial_failures_and_idempotency(monkeypatch) -> None:
    import app.services.repo_access_service as svc
    from app.models.repo_access import RepoAccessRole
    from app.schemas.repo_access import RepoCollaboratorBulkItem

    class _Session:
        pass

    repo = type("Repo", (), {"id": uuid4(), "owner_id": uuid4(), "name": "repo", "gitea_repo_name": "repo"})()
    actor = type("User", (), {"id": uuid4(), "email": "owner@test.local", "full_name": "Owner", "group_name": None})()
    target_ok = type("User", (), {"id": uuid4(), "email": "dev@test.local", "full_name": "Dev", "group_name": None})()
    target_fail = type("User", (), {"id": uuid4(), "email": "broken@test.local", "full_name": "Broken", "group_name": None})()

    async def _resolve(_session, *, user_id, email):
        if email == target_ok.email:
            return target_ok
        if email == target_fail.email:
            return target_fail
        raise HTTPException(status_code=404, detail="User not found")

    calls: dict[str, int] = {"ok": 0}

    async def _add(_session, *, repo, actor, target_user, role):
        if target_user.email == target_fail.email:
            raise HTTPException(status_code=503, detail="temporary gitea failure")
        calls["ok"] += 1
        return svc.RepoCollaboratorRead(
            user=svc._user_read(target_user),
            role=role,
            granted_at=datetime.now(timezone.utc),
            is_owner=False,
        )

    monkeypatch.setattr(svc, "_resolve_target_user", _resolve)
    monkeypatch.setattr(svc, "add_collaborator", _add)

    items = [
        RepoCollaboratorBulkItem(email=target_ok.email, role=RepoAccessRole.read),
        RepoCollaboratorBulkItem(email=target_ok.email, role=RepoAccessRole.write),  # idempotent update path
        RepoCollaboratorBulkItem(email=target_fail.email, role=RepoAccessRole.write),  # partial failure
    ]
    result = asyncio.run(svc.bulk_upsert_collaborators(_Session(), repo=repo, actor=actor, items=items))
    assert result.processed == 3
    assert result.success == 2
    assert result.failed == 1
    assert calls["ok"] == 2
    assert any(r.status == "error" for r in result.results)


def test_create_invite_race_only_one_pending(monkeypatch) -> None:
    import app.services.repo_access_service as svc
    from app.models.repo_access import RepoAccessRole, RepositoryAccessInvite

    class _Session:
        def __init__(self):
            self.invites: list[object] = []
            self.audits: list[object] = []

        async def execute(self, stmt):
            text = str(stmt)
            if "repository_collaborators" in text:
                return _Exec([])
            if "repository_access_invites" in text:
                pending = [x for x in self.invites if getattr(x, "status", None).value == "pending"]
                return _Exec(pending[:1])
            return _Exec([])

        def add(self, row):
            if isinstance(row, RepositoryAccessInvite):
                if not getattr(row, "id", None):
                    row.id = uuid4()
                if not getattr(row, "status", None):
                    from app.models.repo_access import RepoInviteStatus

                    row.status = RepoInviteStatus.pending
                if not getattr(row, "created_at", None):
                    row.created_at = datetime.now(timezone.utc)
                self.invites.append(row)
            else:
                self.audits.append(row)

        async def flush(self):
            return None

    session = _Session()
    repo = type("Repo", (), {"id": uuid4(), "owner_id": uuid4(), "name": "repo", "gitea_repo_name": "repo"})()
    actor = type("User", (), {"id": uuid4(), "email": "owner@test.local", "full_name": "Owner", "group_name": None})()
    invitee = type("User", (), {"id": uuid4(), "email": "dev@test.local", "full_name": "Dev", "group_name": None})()

    async def _once():
        return await svc.create_invite(session, repo=repo, actor=actor, invitee=invitee, role=RepoAccessRole.write)

    first = asyncio.run(_once())
    assert first.status.value == "pending"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_once())
    assert exc.value.status_code == 400
    assert "pending" in str(exc.value.detail).lower()


def test_audit_consistency_check_detects_inconsistencies() -> None:
    import app.services.repo_access_service as svc
    from app.models.repo_access import RepoInviteStatus

    now = datetime.now(timezone.utc)
    repo = type("Repo", (), {"id": uuid4()})()
    user_id = uuid4()

    collab = type("Collab", (), {"user_id": user_id})()
    expired_pending = type(
        "Invite",
        (),
        {
            "id": uuid4(),
            "invitee_user_id": user_id,
            "role": type("Role", (), {"value": "write"})(),
            "status": RepoInviteStatus.pending,
            "expires_at": now - timedelta(days=1),
        },
    )()
    duplicate_pending = type(
        "Invite",
        (),
        {
            "id": uuid4(),
            "invitee_user_id": user_id,
            "role": type("Role", (), {"value": "write"})(),
            "status": RepoInviteStatus.pending,
            "expires_at": now + timedelta(days=1),
        },
    )()
    bad_audit = type(
        "Audit",
        (),
        {
            "id": uuid4(),
            "action": "collaborator_add",
            "actor_id": None,
            "target_id": None,
            "new_role": None,
        },
    )()

    class _Session:
        def __init__(self):
            self.calls = 0

        async def execute(self, _stmt):
            self.calls += 1
            if self.calls == 1:
                return _Exec([collab])
            if self.calls == 2:
                return _Exec([])
            if self.calls == 3:
                return _Exec([expired_pending, duplicate_pending])
            return _Exec([bad_audit])

    report = asyncio.run(svc.audit_consistency_check(_Session(), repo=repo))
    assert report.ok is False
    assert report.counters["collaborators"] == 1
    assert any("expired invite" in x for x in report.issues)
    assert any("duplicate pending invite" in x for x in report.issues)
    assert any("missing actor_id" in x for x in report.issues)
