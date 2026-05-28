from __future__ import annotations

from uuid import uuid4
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from main import app


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _Session:
    def __init__(self):
        self.repo_id = uuid4()
        self.user_id = uuid4()
        self.release_id = uuid4()
        self.registry_id = uuid4()
        self.release = type("Release", (), {"id": self.release_id, "repository_id": self.repo_id, "tag_name": "v1.2.3"})()
        self.registry = type(
            "Reg",
            (),
            {
                "id": self.registry_id,
                "repository_id": self.repo_id,
                "registry_type": "npm",
                "endpoint": "https://registry.npmjs.org",
                "namespace": "@org",
            },
        )()
        self.created_release = None

    async def get(self, model, key):
        name = getattr(model, "__name__", "")
        if name == "Repository":
            return type("Repo", (), {"id": self.repo_id, "owner_id": self.user_id, "name": "repo", "gitea_repo_name": "repo"})()
        if name == "RepositoryRelease" and str(key) == str(self.release_id):
            return self.release
        if name == "RepositoryRegistryIntegration" and str(key) == str(self.registry_id):
            return self.registry
        return None

    async def execute(self, stmt):
        return _Result([])

    def add(self, row):
        self.created_release = row

    async def commit(self):
        return None

    async def refresh(self, entity):
        if not getattr(entity, "id", None):
            entity.id = uuid4()
        if not getattr(entity, "created_at", None):
            entity.created_at = datetime.now(timezone.utc)


def _user() -> User:
    return User(
        id=uuid4(),
        email="teacher@test.local",
        password_hash="x",
        full_name="Teacher",
        role=UserRole.teacher,
        is_pending=False,
        is_blocked=False,
    )


def test_release_changelog_generation_and_publish_validation(monkeypatch) -> None:
    import app.api.routes.releases as rel_route

    session = _Session()
    user = _user()

    async def _session_override():
        yield session

    async def _allow(*args, **kwargs):
        return None

    async def _accessible(*args, **kwargs):
        return None

    async def _commits(*args, **kwargs):
        return [
            {"sha": "a" * 40, "commit": {"message": "feat(auth): add token"}},
            {"sha": "b" * 40, "commit": {"message": "fix(api): guard null"}},
            {"sha": "c" * 40, "commit": {"message": "Merge branch 'x'"}},
            {"sha": "d" * 40, "commit": {"message": "feat!: breaking auth change\n\nBREAKING CHANGE: ..."}},
        ]

    monkeypatch.setattr(rel_route, "ensure_min_repo_role", _allow)
    monkeypatch.setattr(rel_route, "ensure_repository_accessible", _accessible)
    monkeypatch.setattr(rel_route, "list_repo_commits_page", _commits)
    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        client = TestClient(app)
        created = client.post(
            f"/repositories/{session.repo_id}/releases",
            json={
                "tag_name": "v1.2.3",
                "name": "Release 1.2.3",
                "body": "",
                "target_commitish": "main",
                "auto_generate_changelog": True,
            },
        )
        assert created.status_code == 201
        body = created.json()["body"]
        assert "### Features" in body
        assert "### Breaking" in body
        assert "Merge branch" not in body

        bad = client.post(
            f"/repositories/{session.repo_id}/releases/{session.release_id}/publish",
            json={
                "registry_integration_id": str(session.registry_id),
                "package_name": "INVALID NAME",
                "version": "bad",
                "dry_run": True,
            },
        )
        assert bad.status_code == 200
        assert bad.json()["ok"] is False
        assert bad.json()["errors"]

        good = client.post(
            f"/repositories/{session.repo_id}/releases/{session.release_id}/publish",
            json={
                "registry_integration_id": str(session.registry_id),
                "package_name": "@org/pkg",
                "version": "1.2.3",
                "dry_run": True,
            },
        )
        assert good.status_code == 200
        assert good.json()["ok"] is True
    finally:
        app.dependency_overrides.clear()
