"""Per-user WebSocket push when notifications change."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models.notification import Notification


class NotificationConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = {}

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        conns = self._connections.get(user_id)
        if not conns:
            return
        conns.discard(websocket)
        if not conns:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: UUID, message: dict[str, Any]) -> None:
        conns = self._connections.get(user_id)
        if not conns:
            return
        dead: list[WebSocket] = []
        for ws in list(conns):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)


notification_manager = NotificationConnectionManager()


async def count_unread_for_user(user_id: UUID) -> int:
    async with SessionLocal() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.read.is_(False))
        )
        return int(count or 0)


async def push_notifications_updated(user_id: UUID) -> None:
    unread = await count_unread_for_user(user_id)
    await notification_manager.send_to_user(
        user_id,
        {"type": "notifications_updated", "unread_count": unread},
    )
