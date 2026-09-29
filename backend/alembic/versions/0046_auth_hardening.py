"""token version, student id sequence, case-insensitive email index

Revision ID: 0046_auth_hardening
Revises: 0045_relative_avatar_urls
Create Date: 2026-09-29 14:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0046_auth_hardening"
down_revision: Union[str, Sequence[str], None] = "0045_relative_avatar_urls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Password changes bump this; JWTs issued before the bump are rejected.
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )

    # Atomic student ID allocation (max+1 raced between concurrent registrations).
    # Start after the highest purely numeric ID; IDs like "БВТ2201-12" are ignored.
    op.execute("CREATE SEQUENCE IF NOT EXISTS student_id_seq AS BIGINT MINVALUE 1")
    op.execute(
        """
        SELECT setval(
            'student_id_seq',
            COALESCE(m.max_id, 1),
            m.max_id IS NOT NULL
        )
        FROM (
            SELECT MAX(CAST(student_id AS BIGINT)) AS max_id
            FROM users
            WHERE student_id ~ '^[0-9]{1,18}$'
        ) AS m
        """
    )

    # Logins look emails up case-insensitively. Not unique: existing rows may differ only by case.
    op.create_index("ix_users_email_lower", "users", [sa.text("lower(email)")])


def downgrade() -> None:
    op.drop_index("ix_users_email_lower", table_name="users")
    op.execute("DROP SEQUENCE IF EXISTS student_id_seq")
    op.drop_column("users", "token_version")
