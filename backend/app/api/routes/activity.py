"""
Activity log endpoints for recent activity feed
"""
import csv
import io
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from datetime import datetime, timedelta, timezone

from app.core.database import get_session
from app.models import ActivityLog, User, ActivityType
from app.models.user import UserRole
from app.core.security import get_current_user

router = APIRouter(prefix="/activity", tags=["activity"])


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _apply_activity_filters(
    count_query,
    query,
    *,
    activity_type: Optional[str] = None,
    search: Optional[str] = None,
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    if activity_type:
        try:
            act_type = ActivityType(activity_type)
            count_query = count_query.where(ActivityLog.activity_type == act_type)
            query = query.where(ActivityLog.activity_type == act_type)
        except ValueError:
            pass

    if user_id:
        try:
            uid = UUID(user_id)
            count_query = count_query.where(ActivityLog.user_id == uid)
            query = query.where(ActivityLog.user_id == uid)
        except ValueError:
            count_query = count_query.where(ActivityLog.user_login == user_id)
            query = query.where(ActivityLog.user_login == user_id)

    if search:
        search_pattern = f"%{search}%"
        count_query = count_query.where(
            (ActivityLog.repo_name.ilike(search_pattern))
            | (ActivityLog.message.ilike(search_pattern))
            | (ActivityLog.user_login.ilike(search_pattern))
        )
        query = query.where(
            (ActivityLog.repo_name.ilike(search_pattern))
            | (ActivityLog.message.ilike(search_pattern))
            | (ActivityLog.user_login.ilike(search_pattern))
        )

    if date_from:
        try:
            from_dt = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            count_query = count_query.where(ActivityLog.created_at >= from_dt)
            query = query.where(ActivityLog.created_at >= from_dt)
        except ValueError:
            pass

    if date_to:
        try:
            to_dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            count_query = count_query.where(ActivityLog.created_at <= to_dt)
            query = query.where(ActivityLog.created_at <= to_dt)
        except ValueError:
            pass

    return count_query, query


@router.get("/recent")
async def get_recent_activity(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    activity_type: Optional[str] = None,
    search: Optional[str] = None,
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get recent activity log entries with pagination and filters.
    """
    # Build base query for counting
    count_query = select(func.count(ActivityLog.id))
    
    # Build data query
    query = (
        select(ActivityLog, User.full_name, User.email)
        .join(User, ActivityLog.user_id == User.id, isouter=True)
    )
    
    count_query, query = _apply_activity_filters(
        count_query,
        query,
        activity_type=activity_type,
        search=search,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )

    # Get total count
    total_result = await session.execute(count_query)
    total_count = total_result.scalar() or 0
    
    # Complete query
    query = query.order_by(desc(ActivityLog.created_at)).offset(offset).limit(limit)
    
    result = await session.execute(query)
    rows = result.all()
    
    activities = []
    for row in rows:
        activity, full_name, email = row
        # Use user_login from Gitea if user not found in DB
        user_name = full_name or email or activity.user_login or "Unknown"

        # Generate initials from user name
        initials = "".join([n[0].upper() for n in user_name.split() if n])[:2]
        if not initials:
            initials = "??"
        
        # Map activity type to tag
        type_tags = {
            ActivityType.commit: "Коммит",
            ActivityType.push: "Push",
            ActivityType.pull_request: "Pull Request",
            ActivityType.pr_merge: "Merge",
            ActivityType.fork: "Форк",
            ActivityType.repo_created: "Создание",
            ActivityType.repo_deleted: "Удаление",
            ActivityType.login: "Вход",
            ActivityType.logout: "Выход",
        }
        
        # Color based on activity type
        type_colors = {
            ActivityType.commit: "#60a5fa",
            ActivityType.push: "#fbbf24",
            ActivityType.pull_request: "#4caf50",
            ActivityType.pr_merge: "#a78bfa",
            ActivityType.fork: "#e24b4a",
            ActivityType.repo_created: "#4caf50",
            ActivityType.repo_deleted: "#e24b4a",
            ActivityType.login: "#60a5fa",
            ActivityType.logout: "#9ca3af",
        }
        
        # Convert UTC to Moscow time (UTC+3)
        moscow_time = activity.created_at.replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=3))) if activity.created_at else None

        activities.append({
            "id": str(activity.id),
            "type": activity.activity_type.value,
            "user": user_name,
            "initials": initials,
            "color": type_colors.get(activity.activity_type, "#60a5fa"),
            "repo": activity.repo_name or "",
            "message": activity.message or "",
            "time": moscow_time.strftime("%H:%M") if moscow_time else "",
            "tag": type_tags.get(activity.activity_type, activity.activity_type.value),
            "timestamp": moscow_time.isoformat() if moscow_time else None,
        })
    
    return {"activities": activities, "count": len(activities), "total": total_count}


@router.get("/export")
async def export_activity_csv(
    activity_type: Optional[str] = None,
    search: Optional[str] = None,
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Export activity log to CSV (respects current filters)."""
    _require_admin(current_user)

    query = (
        select(ActivityLog, User.full_name, User.email)
        .join(User, ActivityLog.user_id == User.id, isouter=True)
    )
    _, query = _apply_activity_filters(
        select(func.count(ActivityLog.id)),
        query,
        activity_type=activity_type,
        search=search,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    query = query.order_by(desc(ActivityLog.created_at))

    result = await session.execute(query)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "created_at",
        "activity_type",
        "user_id",
        "user_name",
        "user_login",
        "repo_name",
        "message",
        "ip_address",
    ])

    for activity, full_name, email in rows:
        user_name = full_name or email or activity.user_login or ""
        writer.writerow([
            str(activity.id),
            activity.created_at.isoformat() if activity.created_at else "",
            activity.activity_type.value,
            str(activity.user_id) if activity.user_id else "",
            user_name,
            activity.user_login or "",
            activity.repo_name or "",
            activity.message or "",
            activity.ip_address or "",
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="activity_{datetime.now(timezone.utc).isoformat()}.csv"'
        },
    )
