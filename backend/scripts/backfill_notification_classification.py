from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import SessionLocal
from app.models.notification import Notification
from app.services.notification_classification import (
    NotificationEventType,
    NotificationSeverity,
    build_classification_context,
    classify_notification,
    detect_notification_event_type,
)


@dataclass
class BackfillPlanRow:
    id: UUID
    user_id: UUID
    event_type: NotificationEventType
    severity: NotificationSeverity
    actionable: bool
    title: str
    dedupe_key: str


def _event_from_dedupe_or_text(row: Notification) -> NotificationEventType:
    dedupe = (row.dedupe_key or "").lower()
    title = (row.title or "").lower()
    message = (row.message or "").lower()
    href = row.href
    ntype = row.type or "info"

    if dedupe == "admin:pending-users" or "pending" in dedupe:
        return "pending_user"
    if dedupe.startswith("backup:success:") or "backup success" in dedupe:
        return "backup_success"
    if dedupe.startswith("backup:error:") or "backup error" in dedupe:
        return "backup_failed"
    if "webhook" in dedupe or "вебхук" in dedupe:
        return "webhook_failed"
    if "disk" in dedupe or "диск" in dedupe:
        return "disk_warning"
    if "service" in dedupe or "gitea" in dedupe or "smtp" in dedupe:
        return "service_down"
    if "5xx" in dedupe:
        return "http_5xx"
    if "failed_login" in dedupe or "failed-login" in dedupe:
        return "failed_login"
    if "suspicious" in dedupe or "security" in dedupe:
        return "suspicious_login"

    return detect_notification_event_type(
        title=title,
        message=message,
        href=href,
        ntype=ntype,
    )


async def _build_plan(limit: int | None = None) -> list[BackfillPlanRow]:
    async with SessionLocal() as session:
        stmt = (
            select(Notification)
            .where(Notification.event_type.is_(None))
            .order_by(Notification.created_at.asc())
        )
        if limit is not None and limit > 0:
            stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = list(result.scalars().all())

        plan: list[BackfillPlanRow] = []
        for row in rows:
            event_type = _event_from_dedupe_or_text(row)
            context = await build_classification_context(
                session,
                user_id=row.user_id,
                event_type=event_type,
                title=row.title,
                message=row.message,
                href=row.href,
                created_at=row.created_at,
            )
            severity, actionable = classify_notification(event_type, context)
            plan.append(
                BackfillPlanRow(
                    id=row.id,
                    user_id=row.user_id,
                    event_type=event_type,
                    severity=severity,
                    actionable=actionable,
                    title=row.title,
                    dedupe_key=row.dedupe_key,
                )
            )

        return plan


def _print_plan(plan: list[BackfillPlanRow], *, sample: int = 20) -> None:
    total = len(plan)
    by_event = Counter(item.event_type for item in plan)
    by_severity = Counter(item.severity for item in plan)
    actionable_count = sum(1 for item in plan if item.actionable)

    print(f"rows to backfill: {total}")
    print(f"actionable=true: {actionable_count}")
    print("by event_type:")
    for key, count in sorted(by_event.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  - {key}: {count}")
    print("by severity:")
    for key, count in sorted(by_severity.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  - {key}: {count}")

    if not plan:
        return

    print(f"sample ({min(sample, total)}):")
    for item in plan[:sample]:
        short_title = (item.title or "").strip().replace("\n", " ")
        if len(short_title) > 80:
            short_title = short_title[:77] + "..."
        print(
            f"  - id={item.id} event={item.event_type} severity={item.severity} "
            f"actionable={item.actionable} dedupe={item.dedupe_key!r} title={short_title!r}"
        )


async def _apply_plan(plan: list[BackfillPlanRow]) -> int:
    if not plan:
        return 0

    updates_by_id = {item.id: item for item in plan}
    updated = 0
    async with SessionLocal() as session:
        result = await session.execute(
            select(Notification).where(Notification.id.in_(list(updates_by_id.keys())))
        )
        rows = list(result.scalars().all())
        for row in rows:
            item = updates_by_id.get(row.id)
            if item is None:
                continue
            row.event_type = item.event_type
            row.severity = item.severity
            row.actionable = item.actionable
            updated += 1

        await session.commit()

    return updated


async def run(*, dry_run: bool, apply: bool, limit: int | None) -> int:
    if dry_run == apply:
        raise ValueError("Use exactly one mode: --dry-run or --apply")

    plan = await _build_plan(limit=limit)
    _print_plan(plan)

    if dry_run:
        print("dry-run mode: no data changed")
        return 0

    updated = await _apply_plan(plan)
    print(f"applied: {updated}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill notifications.event_type/severity/actionable for legacy rows (event_type IS NULL)"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Show backfill plan only")
    mode.add_argument("--apply", action="store_true", help="Apply backfill changes")
    parser.add_argument("--limit", type=int, default=None, help="Optional limit for testing")
    args = parser.parse_args()

    raise SystemExit(
        asyncio.run(
            run(
                dry_run=bool(args.dry_run),
                apply=bool(args.apply),
                limit=args.limit,
            )
        )
    )


if __name__ == "__main__":
    main()

