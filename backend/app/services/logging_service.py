"""
Service for logging system events, errors, and audit trails.
Provides functions to track backend events across different modules.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_log import SystemLog, LogLevel, LogSource
from app.services.system_log_display import resolve_log_display_user


async def log_event(
    session: AsyncSession,
    level: LogLevel,
    source: LogSource,
    message: str,
    ip_address: str,
    user_id: Optional[UUID] = None,
    user_email: Optional[str] = None,
    user_full_name: Optional[str] = None,
    detail: Optional[str] = None,
    http_status: Optional[int] = None,
    request_id: Optional[str] = None,
) -> SystemLog:
    """
    Log a system event.

    Args:
        session: Database session
        level: Log level (ERROR, WARNING, INFO, DEBUG)
        source: Source of the event (auth, repositories, webhooks, admin, gitea, permissions, courses)
        message: Log message
        ip_address: IP address of the request
        user_id: Optional ID of the user
        user_email: Optional email of the user
        user_full_name: Optional full name of the user
        detail: Optional detailed information (stack trace, context)
        http_status: Optional HTTP status code
        request_id: Optional request ID for tracing

    Returns:
        The created SystemLog entry
    """
    user_email, user_full_name = await resolve_log_display_user(
        session,
        user_id=user_id,
        user_email=user_email,
        user_full_name=user_full_name,
        message=message,
    )
    log_entry = SystemLog(
        level=level,
        source=source,
        user_id=user_id,
        user_email=user_email,
        user_full_name=user_full_name,
        message=message,
        detail=detail,
        ip_address=ip_address,
        http_status=http_status,
        request_id=request_id,
        created_at=datetime.now(timezone.utc),
    )
    
    session.add(log_entry)
    await session.flush()
    await session.refresh(log_entry)
    
    return log_entry


async def log_event_background(
    level: LogLevel,
    source: LogSource,
    message: str,
    ip_address: str,
    user_id: Optional[UUID] = None,
    user_email: Optional[str] = None,
    user_full_name: Optional[str] = None,
    detail: Optional[str] = None,
    http_status: Optional[int] = None,
    request_id: Optional[str] = None,
) -> None:
    """
    Log a system event in background (non-blocking).
    Creates a new database session for the background task.
    
    This is useful for logging that shouldn't block the main request flow.
    """
    from app.core.database import SessionLocal
    
    async with SessionLocal() as session:
        try:
            user_email, user_full_name = await resolve_log_display_user(
                session,
                user_id=user_id,
                user_email=user_email,
                user_full_name=user_full_name,
                message=message,
            )
            log_entry = SystemLog(
                level=level,
                source=source,
                user_id=user_id,
                user_email=user_email,
                user_full_name=user_full_name,
                message=message,
                detail=detail,
                ip_address=ip_address,
                http_status=http_status,
                request_id=request_id,
                created_at=datetime.now(timezone.utc),
            )
            session.add(log_entry)
            await session.commit()
        except Exception as e:
            # Log to stdout if DB write fails
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to log event in background: {e}")


async def log_error(
    session: AsyncSession,
    source: LogSource,
    message: str,
    ip_address: str,
    detail: Optional[str] = None,
    user_id: Optional[UUID] = None,
    user_email: Optional[str] = None,
    user_full_name: Optional[str] = None,
    http_status: Optional[int] = None,
    request_id: Optional[str] = None,
) -> SystemLog:
    """Convenience function to log an ERROR level event."""
    return await log_event(
        session=session,
        level=LogLevel.ERROR,
        source=source,
        message=message,
        ip_address=ip_address,
        user_id=user_id,
        user_email=user_email,
        user_full_name=user_full_name,
        detail=detail,
        http_status=http_status,
        request_id=request_id,
    )


async def log_warning(
    session: AsyncSession,
    source: LogSource,
    message: str,
    ip_address: str,
    detail: Optional[str] = None,
    user_id: Optional[UUID] = None,
    user_email: Optional[str] = None,
    user_full_name: Optional[str] = None,
    http_status: Optional[int] = None,
    request_id: Optional[str] = None,
) -> SystemLog:
    """Convenience function to log a WARNING level event."""
    return await log_event(
        session=session,
        level=LogLevel.WARNING,
        source=source,
        message=message,
        ip_address=ip_address,
        user_id=user_id,
        user_email=user_email,
        user_full_name=user_full_name,
        detail=detail,
        http_status=http_status,
        request_id=request_id,
    )


async def log_info(
    session: AsyncSession,
    source: LogSource,
    message: str,
    ip_address: str,
    user_id: Optional[UUID] = None,
    user_email: Optional[str] = None,
    user_full_name: Optional[str] = None,
    http_status: Optional[int] = None,
    request_id: Optional[str] = None,
) -> SystemLog:
    """Convenience function to log an INFO level event."""
    return await log_event(
        session=session,
        level=LogLevel.INFO,
        source=source,
        message=message,
        ip_address=ip_address,
        user_id=user_id,
        user_email=user_email,
        user_full_name=user_full_name,
        http_status=http_status,
        request_id=request_id,
    )


async def log_debug(
    session: AsyncSession,
    source: LogSource,
    message: str,
    ip_address: str,
    user_id: Optional[UUID] = None,
    user_email: Optional[str] = None,
    user_full_name: Optional[str] = None,
    request_id: Optional[str] = None,
) -> SystemLog:
    """Convenience function to log a DEBUG level event."""
    return await log_event(
        session=session,
        level=LogLevel.DEBUG,
        source=source,
        message=message,
        ip_address=ip_address,
        user_id=user_id,
        user_email=user_email,
        user_full_name=user_full_name,
        request_id=request_id,
    )
