"""store avatar urls as site-relative paths

Revision ID: 0045_relative_avatar_urls
Revises: 0044_course_files, 0044_ai_review_cache
Create Date: 2026-09-29 12:00:00
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0045_relative_avatar_urls"
down_revision: Union[str, Sequence[str], None] = ("0044_course_files", "0044_ai_review_cache")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Avatars used to be saved as absolute API URLs (FRONTEND_URL with 3001 -> 8000), which
    # break once the API port is not public. Keep only the path: nginx and Vite now serve
    # /uploads/avatars/ from the frontend origin.
    op.execute(
        """
        UPDATE users
        SET avatar_url = substring(avatar_url from '(/uploads/avatars/[^?#]+)')
        WHERE avatar_url ~ '^https?://[^/]+/uploads/avatars/[^?#]+'
        """
    )


def downgrade() -> None:
    # The original host is not recoverable; relative paths keep working, so nothing to undo.
    pass
