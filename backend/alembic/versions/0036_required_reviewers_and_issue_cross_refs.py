"""required reviewers table and issue cross references

Revision ID: 0036
Revises: 0035
Create Date: 2026-05-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def _uuid_type() -> sa.types.TypeEngine:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=36)


def upgrade() -> None:
    uuid_t = _uuid_type()

    op.create_table(
        "repository_required_reviewers",
        sa.Column("id", uuid_t, nullable=False),
        sa.Column("repository_id", uuid_t, nullable=False),
        sa.Column("branch_protection_id", uuid_t, nullable=False),
        sa.Column("reviewer_login", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["branch_protection_id"], ["repository_branch_protections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_protection_id", "reviewer_login", name="uq_required_reviewer_branch_login"),
    )
    op.create_index("ix_required_reviewers_repository", "repository_required_reviewers", ["repository_id"])
    op.create_index("ix_required_reviewers_branch", "repository_required_reviewers", ["branch_protection_id"])

    op.create_table(
        "issue_cross_references",
        sa.Column("id", uuid_t, nullable=False),
        sa.Column("repository_id", uuid_t, nullable=False),
        sa.Column("source_issue_id", uuid_t, nullable=False),
        sa.Column("source_comment_id", uuid_t, nullable=True),
        sa.Column("reference_type", sa.String(length=20), nullable=False),
        sa.Column("reference_value", sa.String(length=120), nullable=False),
        sa.Column("target_issue_id", uuid_t, nullable=True),
        sa.Column("target_pr_number", sa.Integer(), nullable=True),
        sa.Column("target_commit_sha", sa.String(length=40), nullable=True),
        sa.Column("target_exists", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_issue_id"], ["issues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_comment_id"], ["issue_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_issue_id"], ["issues.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "repository_id",
            "source_issue_id",
            "source_comment_id",
            "reference_type",
            "reference_value",
            name="uq_issue_cross_reference_identity",
        ),
    )
    op.create_index("ix_issue_xref_repository", "issue_cross_references", ["repository_id"])
    op.create_index("ix_issue_xref_source_issue", "issue_cross_references", ["source_issue_id"])
    op.create_index("ix_issue_xref_target_issue", "issue_cross_references", ["target_issue_id"])


def downgrade() -> None:
    op.drop_index("ix_issue_xref_target_issue", table_name="issue_cross_references")
    op.drop_index("ix_issue_xref_source_issue", table_name="issue_cross_references")
    op.drop_index("ix_issue_xref_repository", table_name="issue_cross_references")
    op.drop_table("issue_cross_references")

    op.drop_index("ix_required_reviewers_branch", table_name="repository_required_reviewers")
    op.drop_index("ix_required_reviewers_repository", table_name="repository_required_reviewers")
    op.drop_table("repository_required_reviewers")
