"""add required reviewers to branch protection

Revision ID: 0034
Revises: 0033
Create Date: 2026-05-27 23:20:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "repository_branch_protections",
        sa.Column("required_reviewer_logins_csv", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("repository_branch_protections", "required_reviewer_logins_csv")
