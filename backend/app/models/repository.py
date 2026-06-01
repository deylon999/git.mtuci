from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Enum as SAEnum

from app.models.base import Base


class RepositoryType(str, Enum):
    public = "public"
    private = "private"
    course = "course"


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    gitea_repo_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gitea_repo_id: Mapped[int | None] = mapped_column(nullable=True, index=True)  # Gitea repository ID for sync
    clone_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    owner_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    last_pushed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    # Repository visibility type
    repo_type: Mapped[RepositoryType] = mapped_column(
        SAEnum(RepositoryType, name="repository_type"),
        nullable=False,
        default=RepositoryType.public,
    )
    # Primary programming language
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Blocked status
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
