from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationRead(BaseModel):
    id: UUID
    title: str
    message: str
    type: str = Field(description="info | success | warning | error")
    read: bool
    href: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
