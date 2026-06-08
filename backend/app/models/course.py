from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, ARRAY
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    grade_min: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    grade_max: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    # Target groups - which student groups can see this course
    target_groups: Mapped[list[str] | None] = mapped_column(
        PG_ARRAY(String(50)),
        nullable=True,
        default=None,
        server_default="{}",
    )
    teacher_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    files: Mapped[list["CourseFile"]] = relationship(
        "CourseFile",
        back_populates="course",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

