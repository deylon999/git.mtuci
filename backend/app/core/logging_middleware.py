"""
Middleware for automatic HTTP request logging.
Logs all requests, especially 4xx/5xx errors, with timing information.
"""

import time
from typing import Callable
from uuid import UUID

from fastapi import Request, Response
from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models.system_log import LogLevel, LogSource
from app.services.logging_service import log_event_background
from app.services.system_log_display import resolve_log_display_user


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all HTTP requests.
    Logs 4xx/5xx errors automatically with timing information.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ip_address = forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.client.host if request.client else "unknown"

        user_id: UUID | None = None
        user_email: str | None = None
        user_full_name: str | None = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                payload = decode_access_token(auth_header[7:])
                sub = payload.get("sub")
                if sub:
                    user_id = UUID(str(sub))
            except (JWTError, ValueError, TypeError):
                pass

        if user_id:
            async with SessionLocal() as session:
                user_email, user_full_name = await resolve_log_display_user(
                    session,
                    user_id=user_id,
                    user_email=user_email,
                    user_full_name=user_full_name,
                )

        response = await call_next(request)

        duration_ms = (time.time() - start_time) * 1000
        status_code = response.status_code
        if status_code >= 500:
            level = LogLevel.ERROR
        elif status_code >= 400:
            level = LogLevel.WARNING
        elif status_code >= 200:
            level = LogLevel.INFO
        else:
            level = LogLevel.DEBUG

        path = request.url.path
        if path in ["/docs", "/openapi.json", "/health", "/metrics"] or path.startswith("/static"):
            return response

        if status_code == 200 and request.method == "GET":
            return response

        message = f"{request.method} {path} - {status_code} ({duration_ms:.0f}ms)"

        # Await write so user fields are not lost (create_task was unreliable here).
        await log_event_background(
            level=level,
            source=LogSource.admin,
            message=message,
            ip_address=ip_address,
            user_id=user_id,
            user_email=user_email,
            user_full_name=user_full_name,
            http_status=status_code,
        )

        return response
