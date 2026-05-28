from fastapi.testclient import TestClient

from main import app


def test_e2e_health_and_system_info():
    client = TestClient(app)
    r1 = client.get("/")
    assert r1.status_code == 200
    assert r1.json().get("status") == "ok"

    r2 = client.get("/system/info")
    assert r2.status_code == 200
    assert "version" in r2.json()


def test_e2e_observability_endpoints():
    client = TestClient(app)
    r1 = client.get("/observability/metrics")
    assert r1.status_code == 200
    assert "http" in r1.json()

    r2 = client.get("/observability/metrics/prometheus")
    assert r2.status_code == 200
    assert "app_http_requests_hour" in r2.text
