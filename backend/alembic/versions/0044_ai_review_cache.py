"""add ai review cache

Revision ID: 0044_ai_review_cache
Revises: 0043_submission_payload
Create Date: 2026-06-09 17:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0044_ai_review_cache"
down_revision: Union[str, None] = "0043_submission_payload"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_review_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("provider_error", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("assignment_id", "student_id", "model", name="uq_ai_review_cache_assignment_student_model"),
    )
    op.create_index("ix_ai_review_cache_assignment_id", "ai_review_cache", ["assignment_id"], unique=False)
    op.create_index("ix_ai_review_cache_student_id", "ai_review_cache", ["student_id"], unique=False)
    op.create_index("ix_ai_review_cache_model", "ai_review_cache", ["model"], unique=False)
    op.create_index("ix_ai_review_cache_expires_at", "ai_review_cache", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_review_cache_expires_at", table_name="ai_review_cache")
    op.drop_index("ix_ai_review_cache_model", table_name="ai_review_cache")
    op.drop_index("ix_ai_review_cache_student_id", table_name="ai_review_cache")
    op.drop_index("ix_ai_review_cache_assignment_id", table_name="ai_review_cache")
    op.drop_table("ai_review_cache")
