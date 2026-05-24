"""backfill system_logs user_email and user_full_name from users

Revision ID: 0028_backfill_system_log_users
Revises: 0027_add_user_preferences
Create Date: 2026-05-24

"""
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE system_logs AS sl
        SET
            user_email = COALESCE(NULLIF(sl.user_email, ''), u.email),
            user_full_name = COALESCE(NULLIF(sl.user_full_name, ''), u.full_name)
        FROM users AS u
        WHERE sl.user_id = u.id
          AND (
            sl.user_email IS NULL OR sl.user_email = ''
            OR sl.user_full_name IS NULL OR sl.user_full_name = ''
          )
        """
    )


def downgrade() -> None:
    pass
