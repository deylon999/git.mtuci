from fastapi.testclient import TestClient

from main import app


def test_health_check_returns_ok_status() -> None:
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

