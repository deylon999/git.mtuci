from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from app.models.user import User
from app.services.user_settings_service import _merge_defaults

NotificationCategory = Literal[
    "assignments",
    "grades",
    "teacher_pr_submitted",
    "teacher_pr_stale",
    "teacher_deadline_missed",
]

STALE_REVIEW_HOURS = 24


@dataclass(frozen=True)
class NotificationPrefs:
    email: bool
    push: bool
    assignments: bool
    grades: bool
    teacher_pr_submitted: bool
    teacher_pr_stale: bool
    teacher_deadline_missed: bool
    teacher_daily_digest: bool
    last_digest_at: datetime | None

    def category_enabled(self, category: NotificationCategory) -> bool:
        return getattr(self, category, True)


def notification_prefs_from_user(user: User) -> NotificationPrefs:
    data = _merge_defaults(user.preferences if isinstance(user.preferences, dict) else None)
    notif = data.get("notifications") or {}
    meta = data.get("notifications_meta") if isinstance(data.get("notifications_meta"), dict) else {}
    last_raw = meta.get("last_digest_at")
    last_digest_at: datetime | None = None
    if isinstance(last_raw, str) and last_raw.strip():
        try:
            last_digest_at = datetime.fromisoformat(last_raw.replace("Z", "+00:00"))
            if last_digest_at.tzinfo is None:
                last_digest_at = last_digest_at.replace(tzinfo=timezone.utc)
        except ValueError:
            last_digest_at = None
    return NotificationPrefs(
        email=bool(notif.get("email", True)),
        push=bool(notif.get("push", True)),
        assignments=bool(notif.get("assignments", True)),
        grades=bool(notif.get("grades", True)),
        teacher_pr_submitted=bool(notif.get("teacher_pr_submitted", True)),
        teacher_pr_stale=bool(notif.get("teacher_pr_stale", True)),
        teacher_deadline_missed=bool(notif.get("teacher_deadline_missed", True)),
        teacher_daily_digest=bool(notif.get("teacher_daily_digest", False)),
        last_digest_at=last_digest_at,
    )
