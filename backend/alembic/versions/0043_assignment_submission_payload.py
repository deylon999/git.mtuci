"""add assignment submission payload

Revision ID: 0043_submission_payload
Revises: 0042_notif_class_fields
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0043_submission_payload"
down_revision: Union[str, None] = "0042_notif_class_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("answer_text", sa.Text(), nullable=True))
    op.add_column("submissions", sa.Column("repository_url", sa.String(length=500), nullable=True))
    op.add_column("submissions", sa.Column("attachments", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("submissions", "attachments")
    op.drop_column("submissions", "repository_url")
    op.drop_column("submissions", "answer_text")
