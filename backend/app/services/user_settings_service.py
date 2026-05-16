from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from app.models.user import User
from app.schemas.user_settings import NotificationSettingsRead, UserSettingsRead, UserSettingsUpdate

_DEFAULT: dict = {
    "theme": "system",
    "language": "ru",
    "notifications": {
        "email": True,
        "push": True,
        "assignments": True,
        "grades": True,
        "teacher_pr_submitted": True,
        "teacher_pr_stale": True,
        "teacher_deadline_missed": True,
        "teacher_daily_digest": False,
    },
}


def _merge_defaults(raw: dict | None) -> dict:
    base = deepcopy(_DEFAULT)
    if not raw:
        return base
    if isinstance(raw.get("theme"), str):
        base["theme"] = raw["theme"]
    if isinstance(raw.get("language"), str):
        base["language"] = raw["language"]
    notif = raw.get("notifications")
    if isinstance(notif, dict):
        for key in base["notifications"]:
            if key in notif:
                base["notifications"][key] = bool(notif[key])
    if isinstance(raw.get("notifications_meta"), dict):
        base["notifications_meta"] = dict(raw["notifications_meta"])
    return base


def read_user_settings(user: User) -> UserSettingsRead:
    data = _merge_defaults(user.preferences if isinstance(user.preferences, dict) else None)
    return UserSettingsRead(
        theme=data["theme"],
        language=data["language"],
        notifications=NotificationSettingsRead(**data["notifications"]),
    )


def apply_user_settings_update(user: User, payload: UserSettingsUpdate) -> dict:
    data = _merge_defaults(user.preferences if isinstance(user.preferences, dict) else None)
    if payload.theme is not None:
        if payload.theme not in {"light", "dark", "system"}:
            raise ValueError("Invalid theme")
        data["theme"] = payload.theme
    if payload.language is not None:
        lang = (payload.language.strip() or "ru").lower()
        if lang not in {"ru", "en"}:
            raise ValueError("Invalid language")
        data["language"] = lang
    if payload.notifications is not None:
        data["notifications"] = payload.notifications.model_dump()
    if isinstance(user.preferences, dict) and "notifications_meta" in user.preferences:
        data["notifications_meta"] = user.preferences["notifications_meta"]
    return data


def set_last_digest_at(preferences: dict | None, when: datetime) -> dict:
    """Return updated preferences with digest timestamp (ISO UTC)."""
    data = _merge_defaults(preferences)
    meta = data.get("notifications_meta")
    if not isinstance(meta, dict):
        meta = {}
    meta = dict(meta)
    meta["last_digest_at"] = when.astimezone(timezone.utc).isoformat()
    data["notifications_meta"] = meta
    return data
