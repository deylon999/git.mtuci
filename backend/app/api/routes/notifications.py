from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.notification import NotificationRead
from app.services.notification_service import (
    delete_notification,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
async def get_notifications(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[NotificationRead]:
    rows = await list_notifications(
        session,
        user_id=current_user.id,
        group_name=current_user.group_name,
        role=current_user.role,
    )
    return [NotificationRead.model_validate(n) for n in rows]


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def patch_notification_read(
    notification_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    ok = await mark_notification_read(session, user_id=current_user.id, notification_id=notification_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def patch_notifications_read_all(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await mark_all_notifications_read(session, user_id=current_user.id)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_notification(
    notification_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    ok = await delete_notification(session, user_id=current_user.id, notification_id=notification_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
