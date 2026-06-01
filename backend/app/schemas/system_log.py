from __future__ import annotations

from datetime import datetime
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from app.models.system_log import LogLevel, LogSource


class LogLevelEnum(str, Enum):
    """Log level enum for API."""
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"
    DEBUG = "DEBUG"


class LogSourceEnum(str, Enum):
    """Log source enum for API."""
    auth = "auth"
    repositories = "repositories"
    webhooks = "webhooks"
    admin = "admin"
    gitea = "gitea"
    permissions = "permissions"
    courses = "courses"


class LogEntry(BaseModel):
    """System log entry for API response."""
    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_log(cls, log, *, joined_email: str | None = None, joined_full_name: str | None = None) -> "LogEntry":
        entry = cls.model_validate(log)
        return entry.model_copy(
            update={
                "user_email": getattr(log, "user_email", None) or joined_email,
                "user_full_name": getattr(log, "user_full_name", None) or joined_full_name,
            }
        )

    id: UUID
    created_at: datetime
    level: LogLevelEnum
    source: LogSourceEnum
    user_id: UUID | None = None
    user_email: str | None = None
    user_full_name: str | None = None
    message: str
    detail: str | None = None
    ip_address: str
    http_status: int | None = None


class LogsResponse(BaseModel):
    """Response with logs list and total count."""
    logs: list[LogEntry]
    total: int


class LogLocateResponse(BaseModel):
    """Response for locating a log position in filtered/paginated list."""
    found: bool
    total: int
    page: int
    pages: int
    limit: int
    offset: int


class LogsStats(BaseModel):
    """Statistics for logs."""
    total: int
    errors_today: int
    warnings_today: int
    success_today: int


class LogsFilters(BaseModel):
    """Query parameters for logs filtering."""
    level: LogLevelEnum | None = None
    source: LogSourceEnum | None = None
    search: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    sort: str = "desc"  # "desc" or "asc"


class LogCreate(BaseModel):
    """Schema for internal log creation."""
    level: LogLevel
    source: LogSource
    user_id: UUID | None = None
    user_email: str | None = None
    user_full_name: str | None = None
    message: str
    detail: str | None = None
    ip_address: str
    http_status: int | None = None
    request_id: str | None = None
