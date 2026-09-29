from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.security import decode_access_token

_SWEEP_EVERY_REQUESTS = 1000


def _client_key(request: Request) -> str:
    # Behind nginx every request can arrive from one proxy IP, so signed-in traffic is
    # bucketed per user; anonymous traffic (login, register) falls back to the client IP.
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            sub = decode_access_token(auth[7:]).get("sub")
        except Exception:
            sub = None
        if sub:
            return f"user:{sub}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, requests_per_minute: int = 120):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._requests_since_sweep = 0

    def _sweep(self, cutoff: float) -> None:
        # Drop idle buckets so one-off clients do not accumulate forever.
        for key in [k for k, b in self._buckets.items() if not b or b[-1] < cutoff]:
            del self._buckets[key]

    async def dispatch(self, request: Request, call_next):
        key = f"{_client_key(request)}:{request.url.path.split('/')[1:2]}"
        now = time.time()
        cutoff = now - 60
        self._requests_since_sweep += 1
        if self._requests_since_sweep >= _SWEEP_EVERY_REQUESTS:
            self._requests_since_sweep = 0
            self._sweep(cutoff)
        bucket = self._buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={"Retry-After": "60"},
            )
        bucket.append(now)
        return await call_next(request)
