"""notification i18n key and params

Revision ID: 0047_notification_i18n
Revises: 0046_auth_hardening
Create Date: 2026-10-10 12:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0047_notification_i18n"
down_revision: Union[str, Sequence[str], None] = "0046_auth_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("i18n_key", sa.String(length=64), nullable=True))
    op.add_column("notifications", sa.Column("i18n_params", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("notifications", "i18n_params")
    op.drop_column("notifications", "i18n_key")
