from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationRead(BaseModel):
    id: UUID
    title: str
    message: str
    type: str = Field(description="info | success | warning | error")
    read: bool
    href: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminNotificationActionRead(BaseModel):
    kind: str
    label: str
    href: str | None = None
    payload: dict[str, str] | None = None


class AdminNotificationRead(NotificationRead):
    category: Literal["users", "system", "security"]
    severity: Literal["info", "warning", "critical", "success"]
    unread_color: Literal["blue", "yellow", "red"] | None = None
    actionable: bool = False
    virtual: bool = False
    actions: list[AdminNotificationActionRead] = Field(default_factory=list)


class AdminNotificationsResponse(BaseModel):
    items: list[AdminNotificationRead]
    total: int
    page: int
    pages: int


class AdminNotificationsStatsResponse(BaseModel):
    total: int
    unread: int
    action_required: int
    critical: int
    users: int
    system: int
    security: int
