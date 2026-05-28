"""release publish jobs execution

Revision ID: 0039_release_publish_jobs
Revises: 0038_code_search_fts_index
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0039_release_publish_jobs"
down_revision = "0038_code_search_fts_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "repository_registry_integrations",
        sa.Column("token_secret", sa.String(length=512), nullable=True),
    )
    op.create_table(
        "release_publish_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("release_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("registry_integration_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("package_name", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=120), nullable=False),
        sa.Column("dry_run", sa.Boolean(), nullable=False),
        sa.Column("command_line", sa.Text(), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("log_text", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["registry_integration_id"], ["repository_registry_integrations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["release_id"], ["repository_releases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_release_publish_jobs_repository_id"), "release_publish_jobs", ["repository_id"], unique=False)
    op.create_index(op.f("ix_release_publish_jobs_release_id"), "release_publish_jobs", ["release_id"], unique=False)
    op.create_index(op.f("ix_release_publish_jobs_registry_integration_id"), "release_publish_jobs", ["registry_integration_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_release_publish_jobs_registry_integration_id"), table_name="release_publish_jobs")
    op.drop_index(op.f("ix_release_publish_jobs_release_id"), table_name="release_publish_jobs")
    op.drop_index(op.f("ix_release_publish_jobs_repository_id"), table_name="release_publish_jobs")
    op.drop_table("release_publish_jobs")
    op.drop_column("repository_registry_integrations", "token_secret")

