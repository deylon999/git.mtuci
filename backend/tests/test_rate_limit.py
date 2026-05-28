from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit_middleware import RateLimitMiddleware


def test_rate_limit_blocks_after_threshold():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, requests_per_minute=3)

    @app.get("/x")
    async def x():
        return {"ok": True}

    client = TestClient(app)
    assert client.get("/x").status_code == 200
    assert client.get("/x").status_code == 200
    assert client.get("/x").status_code == 200
    blocked = client.get("/x")
    assert blocked.status_code == 429
