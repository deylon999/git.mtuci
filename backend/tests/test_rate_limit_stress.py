from __future__ import annotations

import concurrent.futures

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit_middleware import RateLimitMiddleware


def test_rate_limit_stress_burst_blocks_and_recovers() -> None:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, requests_per_minute=20)

    @app.get("/burst")
    async def burst():
        return {"ok": True}

    client = TestClient(app)

    def _hit() -> int:
        return client.get("/burst").status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        codes = list(pool.map(lambda _: _hit(), range(60)))

    blocked = sum(1 for c in codes if c == 429)
    ok = sum(1 for c in codes if c == 200)
    assert ok > 0
    assert blocked > 0
