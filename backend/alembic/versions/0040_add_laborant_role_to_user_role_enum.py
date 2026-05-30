"""add laborant role to user_role enum

Revision ID: 0040_add_laborant_role
Revises: 0039_release_publish_jobs
Create Date: 2026-05-30
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0040_add_laborant_role"
down_revision: Union[str, None] = "0039_release_publish_jobs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'laborant'")


def downgrade() -> None:
    # Replace removed value with teacher before recreating enum.
    op.execute("UPDATE users SET role = 'teacher' WHERE role = 'laborant'")
    op.execute("ALTER TYPE user_role RENAME TO user_role_old")
    op.execute("CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin')")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role"
    )
    op.execute("DROP TYPE user_role_old")
