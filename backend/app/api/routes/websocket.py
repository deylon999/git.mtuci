"""
WebSocket endpoints for real-time activity updates
"""
import asyncio
from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

# RFC 6455: policy violation (invalid/missing auth token)
_WS_CLOSE_POLICY = 1008

from app.core.database import SessionLocal
from app.core.security import get_current_user_from_token
from app.services.notification_realtime import notification_manager, push_notifications_updated
from app.services.notification_service import sync_user_notifications

router = APIRouter(prefix="/ws", tags=["websocket"])

# Store connected clients
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()


@router.websocket("/activity")
async def activity_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time activity updates.
    Broadcasts new activity events to all connected clients.
    """
    await manager.connect(websocket)
    try:
        # Send initial connection message
        await websocket.send_json({"type": "connected", "message": "WebSocket connected"})
        
        while True:
            # Non-blocking wait for client messages with timeout
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send keep-alive every 30 seconds
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        manager.disconnect(websocket)


async def broadcast_new_activity(
    activity_type: str,
    user_name: str,
    repo_name: str,
    message: str,
    timestamp: str
):
    """
    Broadcast a new activity event to all connected clients.
    Called from webhook handlers when new activity is logged.
    """
    await manager.broadcast({
        "type": "new_activity",
        "activity_type": activity_type,
        "user_name": user_name,
        "repo_name": repo_name,
        "message": message,
        "timestamp": timestamp
    })


async def broadcast_stats_update():
    """
    Broadcast that stats have been updated.
    Clients should refresh their data.
    """
    await manager.broadcast({
        "type": "stats_updated"
    })


@router.get("/test-broadcast")
async def test_broadcast():
    """Test endpoint to verify WebSocket broadcasting works."""
    await broadcast_new_activity(
        activity_type="commit",
        user_name="test_user",
        repo_name="test_repo",
        message="Test message",
        timestamp="2024-01-01T00:00:00"
    )
    return {"status": "broadcast sent"}


@router.get("/connections")
async def get_connections_count():
    """Get number of active WebSocket connections."""
    return {"connections": len(manager.active_connections)}


@router.websocket("/notifications")
async def notifications_websocket(websocket: WebSocket, token: str | None = Query(None)):
    """
    Per-user WebSocket for notification updates.
    Client receives `notifications_updated` and should refetch GET /notifications.
    """
    if not token:
        await websocket.close(code=_WS_CLOSE_POLICY, reason="Missing token")
        return

    async with SessionLocal() as session:
        try:
            user = await get_current_user_from_token(token, session)
        except Exception:
            await websocket.close(code=_WS_CLOSE_POLICY, reason="Invalid token")
            return

        user_id: UUID = user.id
        group_name = user.group_name
        role = user.role

    await notification_manager.connect(user_id, websocket)
    try:
        await websocket.send_json({"type": "connected", "message": "Notifications WebSocket connected"})
        await push_notifications_updated(user_id)

        async with SessionLocal() as session:
            await sync_user_notifications(
                session,
                user_id=user_id,
                group_name=group_name,
                role=role,
            )

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
                elif data == "refresh":
                    async with SessionLocal() as session:
                        await sync_user_notifications(
                            session,
                            user_id=user_id,
                            group_name=group_name,
                            role=role,
                        )
                    await push_notifications_updated(user_id)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        notification_manager.disconnect(user_id, websocket)
    except Exception:
        notification_manager.disconnect(user_id, websocket)
