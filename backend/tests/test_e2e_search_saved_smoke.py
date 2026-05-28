from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.search import SavedSearch
from app.models.user import User, UserRole
from main import app


class _Session:
    def __init__(self):
        self.saved: dict[str, object] = {}

    async def get(self, model, key):
        if model is SavedSearch:
            return self.saved.get(str(key))
        return None

    async def delete(self, entity):
        self.saved.pop(str(entity.id), None)

    async def commit(self):
        return None

    async def refresh(self, entity):
        return None


def _auth_user() -> User:
    return User(
        id=uuid4(),
        email="smoke@test.local",
        password_hash="x",
        full_name="Smoke",
        role=UserRole.student,
        is_pending=False,
        is_blocked=False,
    )


def test_e2e_saved_search_to_code_search_flow(monkeypatch) -> None:
    import app.api.routes.search as search_route
    from app.schemas.search_extended import CodeSearchHitRead

    user = _auth_user()
    session = _Session()

    async def _session_override():
        yield session

    async def _create_saved(_session, *, entity):
        now = datetime.now(timezone.utc)
        if not getattr(entity, "id", None):
            entity.id = uuid4()
        entity.created_at = now
        entity.updated_at = now
        session.saved[str(entity.id)] = entity
        return entity

    async def _list_saved(_session, *, user_id):
        return [v for v in session.saved.values() if getattr(v, "user_id", None) == user_id]

    async def _search_code(_session, *, user, query, limit, filters):
        if query != "issue_token":
            return [], {}
        if filters.path_contains and "src/" not in filters.path_contains:
            return [], {}
        return ([
            CodeSearchHitRead(
                repository_id=str(uuid4()),
                repository_name="demo-repo",
                path="src/auth.py",
                branch=filters.branch,
                score=9.2,
                snippet="def issue_token():",
                highlights=["def issue_token():", "return token"],
            )
        ][:limit], {"extensions": [{"value": "py", "count": 1}], "repositories": [{"value": "demo-repo", "count": 1}]})

    monkeypatch.setattr(search_route, "create_saved_search", _create_saved)
    monkeypatch.setattr(search_route, "list_saved_searches", _list_saved)
    monkeypatch.setattr(search_route, "search_code_for_user", _search_code)

    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        client = TestClient(app)

        created = client.post(
            "/search/saved",
            json={
                "name": "Token in src",
                "query": "issue_token",
                "search_type": "code",
                "filters": {"path_contains": "src/", "branch": "main"},
            },
        )
        assert created.status_code == 201
        saved = created.json()
        assert saved["query"] == "issue_token"

        listed = client.get("/search/saved")
        assert listed.status_code == 200
        assert len(listed.json()) == 1

        run = client.get(
            "/search/code",
            params={
                "q": listed.json()[0]["query"],
                "path_contains": listed.json()[0]["filters_json"]["path_contains"],
                "branch": listed.json()[0]["filters_json"]["branch"],
            },
        )
        assert run.status_code == 200
        payload = run.json()
        assert payload["total"] == 1
        assert payload["hits"][0]["path"] == "src/auth.py"

        deleted = client.delete(f"/search/saved/{saved['id']}")
        assert deleted.status_code == 204
    finally:
        app.dependency_overrides.clear()
