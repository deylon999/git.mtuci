"""add last_pushed_at to repositories

Revision ID: 0041_add_last_pushed_at
Revises: 0040_add_laborant_role
Create Date: 2026-06-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0041_add_last_pushed_at"
down_revision: Union[str, None] = "0040_add_laborant_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "repositories",
        sa.Column("last_pushed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_repositories_last_pushed_at",
        "repositories",
        ["last_pushed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_repositories_last_pushed_at", table_name="repositories")
    op.drop_column("repositories", "last_pushed_at")
