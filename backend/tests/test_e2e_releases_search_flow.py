from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from main import app


def test_search_code_route_available():
    client = TestClient(app)
    resp = client.get("/search/code", params={"q": "main"})
    assert resp.status_code in (401, 403)


def test_releases_route_requires_auth_or_valid_repo():
    client = TestClient(app)
    resp = client.get(f"/repositories/{uuid4()}/releases")
    assert resp.status_code in (401, 403)
