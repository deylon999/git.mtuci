from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.search import SavedSearch
from app.models.user import User, UserRole
from main import app


class _SavedSession:
    def __init__(self, store: dict):
        self.store = store

    async def get(self, model, key):
        if model is SavedSearch:
            return self.store.get(str(key))
        return None

    async def delete(self, entity):
        self.store.pop(str(entity.id), None)

    async def commit(self):
        return None

    async def refresh(self, entity):
        return None


def _user(email: str) -> User:
    return User(
        id=uuid4(),
        email=email,
        password_hash="x",
        full_name="User",
        role=UserRole.student,
        is_pending=False,
        is_blocked=False,
    )


def test_saved_search_crud_and_ownership(monkeypatch) -> None:
    import app.api.routes.search as search_route

    owner = _user("owner@test.local")
    stranger = _user("stranger@test.local")
    store: dict[str, object] = {}
    session = _SavedSession(store)

    async def _session_override():
        yield session

    async def _list_saved(_session, *, user_id):
        rows = [v for v in store.values() if getattr(v, "user_id", None) == user_id]
        rows.sort(key=lambda x: getattr(x, "updated_at"), reverse=True)
        return rows

    async def _create_saved(_session, *, entity):
        now = datetime.now(timezone.utc)
        if not getattr(entity, "id", None):
            entity.id = uuid4()
        entity.created_at = now
        entity.updated_at = now
        store[str(entity.id)] = entity
        return entity

    monkeypatch.setattr(search_route, "list_saved_searches", _list_saved)
    monkeypatch.setattr(search_route, "create_saved_search", _create_saved)

    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_current_user] = lambda: owner

    try:
        client = TestClient(app)

        create = client.post(
            "/search/saved",
            json={
                "name": "Token search",
                "query": "auth token",
                "search_type": "code",
                "filters": {"path_contains": "src/", "branch": "main"},
            },
        )
        assert create.status_code == 201
        saved_id = create.json()["id"]

        listed = client.get("/search/saved")
        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert listed.json()[0]["id"] == saved_id

        update = client.patch(
            f"/search/saved/{saved_id}",
            json={"name": "Updated token search", "filters": {"symbol": "issue_token"}},
        )
        assert update.status_code == 200
        assert update.json()["name"] == "Updated token search"
        assert update.json()["filters_json"]["symbol"] == "issue_token"

        app.dependency_overrides[get_current_user] = lambda: stranger
        denied = client.patch(f"/search/saved/{saved_id}", json={"name": "hijack"})
        assert denied.status_code == 404

        app.dependency_overrides[get_current_user] = lambda: owner
        deleted = client.delete(f"/search/saved/{saved_id}")
        assert deleted.status_code == 204

        listed_after = client.get("/search/saved")
        assert listed_after.status_code == 200
        assert listed_after.json() == []
    finally:
        app.dependency_overrides.clear()
