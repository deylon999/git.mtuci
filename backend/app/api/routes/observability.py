from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.metrics_middleware import get_http_metrics, get_prometheus_metrics_text
from app.core.tracing_middleware import current_request_id, current_trace_id

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/metrics")
async def observability_metrics() -> dict:
    return {
        "http": get_http_metrics(),
        "trace": {
            "request_id": current_request_id(),
            "trace_id": current_trace_id(),
        },
    }


@router.get("/metrics/prometheus")
async def observability_metrics_prometheus() -> Response:
    return Response(content=get_prometheus_metrics_text(), media_type="text/plain; version=0.0.4")
