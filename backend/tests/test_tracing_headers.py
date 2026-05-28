from fastapi.testclient import TestClient

from main import app


def test_tracing_headers_are_present():
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.headers.get("x-request-id")
    assert resp.headers.get("traceparent")


def test_tracing_preserves_incoming_request_id():
    client = TestClient(app)
    resp = client.get("/", headers={"x-request-id": "req-123"})
    assert resp.status_code == 200
    assert resp.headers.get("x-request-id") == "req-123"
