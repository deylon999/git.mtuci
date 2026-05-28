"""code search FTS index layer

Revision ID: 0038_code_search_fts_index
Revises: 0037_search_releases_reliability
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0038_code_search_fts_index"
down_revision = "0037_search_releases_reliability"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "search_index_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch", sa.String(length=120), nullable=False),
        sa.Column("path", sa.String(length=1000), nullable=False),
        sa.Column("extension", sa.String(length=24), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_size", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repository_id", "branch", "path", name="uq_search_index_repo_branch_path"),
    )
    op.create_index(op.f("ix_search_index_entries_repository_id"), "search_index_entries", ["repository_id"], unique=False)
    op.create_index(op.f("ix_search_index_entries_extension"), "search_index_entries", ["extension"], unique=False)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_search_index_entries_path_trgm "
        "ON search_index_entries USING gin (path gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_search_index_entries_fts "
        "ON search_index_entries USING gin (to_tsvector('simple', coalesce(path,'') || ' ' || coalesce(content,'')))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_search_index_entries_fts")
    op.execute("DROP INDEX IF EXISTS ix_search_index_entries_path_trgm")
    op.drop_index(op.f("ix_search_index_entries_extension"), table_name="search_index_entries")
    op.drop_index(op.f("ix_search_index_entries_repository_id"), table_name="search_index_entries")
    op.drop_table("search_index_entries")
