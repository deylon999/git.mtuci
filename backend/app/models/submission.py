from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Submission(Base):
    __tablename__ = "submissions"

    __table_args__ = (
        CheckConstraint("grade IS NULL OR (grade >= 0 AND grade <= 100)", name="ck_submissions_grade_0_100"),
        UniqueConstraint(
            "assignment_id",
            "student_id",
            name="uq_submissions_assignment_id_student_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    assignment_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_grade: Mapped[float | None] = mapped_column(Float, nullable=True)
    penalty_points: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    weeks_late: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    answer_text: Mapped[str | None] = mapped_column(Text(), nullable=True)
    repository_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachments: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text(), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
