from __future__ import annotations

from pydantic import BaseModel, Field


class NotificationSettingsRead(BaseModel):
    email: bool = True
    push: bool = True
    assignments: bool = True
    grades: bool = True


class UserSettingsRead(BaseModel):
    theme: str = Field(default="system", description="light | dark | system")
    language: str = Field(default="ru")
    notifications: NotificationSettingsRead = Field(default_factory=NotificationSettingsRead)


class UserSettingsUpdate(BaseModel):
    theme: str | None = None
    language: str | None = None
    notifications: NotificationSettingsRead | None = None
