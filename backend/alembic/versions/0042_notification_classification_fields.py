"""add notification classification fields

Revision ID: 0042_notif_class_fields
Revises: 0041_add_last_pushed_at
Create Date: 2026-06-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0042_notif_class_fields"
down_revision: Union[str, None] = "0041_add_last_pushed_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="info"),
    )
    op.add_column(
        "notifications",
        sa.Column("actionable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "notifications",
        sa.Column("event_type", sa.String(length=50), nullable=True),
    )

    op.alter_column("notifications", "severity", server_default=None)
    op.alter_column("notifications", "actionable", server_default=None)


def downgrade() -> None:
    op.drop_column("notifications", "event_type")
    op.drop_column("notifications", "actionable")
    op.drop_column("notifications", "severity")
