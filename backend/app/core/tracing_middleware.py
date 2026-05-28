from __future__ import annotations

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
trace_id_ctx: ContextVar[str | None] = ContextVar("trace_id", default=None)


def current_request_id() -> str | None:
    return request_id_ctx.get()


def current_trace_id() -> str | None:
    return trace_id_ctx.get()


class TracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        traceparent = request.headers.get("traceparent")
        trace_id = None
        if traceparent:
            parts = traceparent.split("-")
            if len(parts) >= 2 and len(parts[1]) == 32:
                trace_id = parts[1]
        if not trace_id:
            trace_id = uuid.uuid4().hex

        token_req = request_id_ctx.set(req_id)
        token_trace = trace_id_ctx.set(trace_id)
        try:
            response = await call_next(request)
            response.headers["x-request-id"] = req_id
            response.headers["traceparent"] = f"00-{trace_id}-0000000000000000-01"
            return response
        finally:
            request_id_ctx.reset(token_req)
            trace_id_ctx.reset(token_trace)
