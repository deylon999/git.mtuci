from __future__ import annotations

from fastapi.testclient import TestClient

from main import app


def test_e2e_reliability_flow_observability_and_tracing_headers() -> None:
    client = TestClient(app)

    root = client.get("/")
    assert root.status_code == 200

    metrics = client.get("/observability/metrics")
    assert metrics.status_code == 200
    payload = metrics.json()
    assert "http" in payload
    assert "trace" in payload

    prom = client.get("/observability/metrics/prometheus")
    assert prom.status_code == 200
    assert "app_http_requests_hour" in prom.text

    with_header = client.get("/", headers={"x-request-id": "e2e-rel-flow"})
    assert with_header.status_code == 200
    assert with_header.headers.get("x-request-id") == "e2e-rel-flow"
