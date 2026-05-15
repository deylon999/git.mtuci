from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Enum as SAEnum

from app.models.base import Base


class ActivityType(str, Enum):
    """Types of activity events."""
    commit = "commit"
    push = "push"
    pull_request = "pull_request"
    pr_merge = "pr_merge"
    fork = "fork"
    repo_created = "repo_created"
    repo_deleted = "repo_deleted"
    login = "login"
    logout = "logout"
    file_upload = "file_upload"
    pr_comment = "pr_comment"


class ActivityLog(Base):
    """
    Activity log for user actions across the platform.
    Used for statistics, audit trails, and activity feeds.
    """
    __tablename__ = "activity_log"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    user_login: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Store username from Gitea if user not in DB
    activity_type: Mapped[ActivityType] = mapped_column(
        SAEnum(ActivityType, native_enum=False), nullable=False
    )
    repo_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Additional metadata (stored as JSON-like fields)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    
    def __repr__(self) -> str:
        return f"<ActivityLog id={self.id} type={self.activity_type} user={self.user_id}>"
