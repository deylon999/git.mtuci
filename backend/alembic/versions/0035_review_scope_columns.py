"""add repository_id and pull_number to review entities

Revision ID: 0035
Revises: 0034
Create Date: 2026-05-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pull_request_reviews",
        sa.Column(
            "repository_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column("pull_request_reviews", sa.Column("pull_number", sa.Integer(), nullable=True))
    op.create_index(
        "ix_pull_request_reviews_repository_pull",
        "pull_request_reviews",
        ["repository_id", "pull_number"],
    )

    op.add_column(
        "review_threads",
        sa.Column(
            "repository_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column("review_threads", sa.Column("pull_number", sa.Integer(), nullable=True))
    op.create_index("ix_review_threads_repository_pull", "review_threads", ["repository_id", "pull_number"])


def downgrade() -> None:
    op.drop_index("ix_review_threads_repository_pull", table_name="review_threads")
    op.drop_column("review_threads", "pull_number")
    op.drop_column("review_threads", "repository_id")

    op.drop_index("ix_pull_request_reviews_repository_pull", table_name="pull_request_reviews")
    op.drop_column("pull_request_reviews", "pull_number")
    op.drop_column("pull_request_reviews", "repository_id")
