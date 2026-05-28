"""phase1 git auth and repository settings

Revision ID: 0031
Revises: 0030
Create Date: 2026-05-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_git_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("scopes_csv", sa.Text(), nullable=False, server_default=""),
        sa.Column("gitea_token_id", sa.Integer(), nullable=True),
        sa.Column("gitea_token_name", sa.String(160), nullable=True),
        sa.Column("token_preview", sa.String(16), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_git_tokens_user_id", "user_git_tokens", ["user_id"])

    op.create_table(
        "user_ssh_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("key_fingerprint", sa.String(255), nullable=True),
        sa.Column("key_type", sa.String(64), nullable=True),
        sa.Column("public_key_preview", sa.String(255), nullable=True),
        sa.Column("gitea_key_id", sa.Integer(), nullable=True),
        sa.Column("read_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_ssh_keys_user_id", "user_ssh_keys", ["user_id"])

    op.create_table(
        "repository_branch_protections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_pattern", sa.String(120), nullable=False, server_default="main"),
        sa.Column("required_approvals", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("require_status_checks", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status_check_contexts_csv", sa.Text(), nullable=False, server_default=""),
        sa.Column("dismiss_stale_approvals", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("block_on_rejected_reviews", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_repository_branch_protections_repository_id", "repository_branch_protections", ["repository_id"])

    op.create_table(
        "repository_webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gitea_hook_id", sa.Integer(), nullable=True),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("events_csv", sa.Text(), nullable=False, server_default="push"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("secret_encrypted", sa.Text(), nullable=True),
        sa.Column("last_delivery_status", sa.String(64), nullable=True),
        sa.Column("last_delivery_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_repository_webhooks_repository_id", "repository_webhooks", ["repository_id"])

    op.create_table(
        "repository_deploy_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("key_fingerprint", sa.String(255), nullable=True),
        sa.Column("key_type", sa.String(64), nullable=True),
        sa.Column("gitea_key_id", sa.Integer(), nullable=True),
        sa.Column("read_only", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_repository_deploy_keys_repository_id", "repository_deploy_keys", ["repository_id"])

    op.create_table(
        "repository_secrets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("value_encrypted", sa.Text(), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("repository_id", "name", name="uq_repository_secret_name"),
    )
    op.create_index("ix_repository_secrets_repository_id", "repository_secrets", ["repository_id"])


def downgrade() -> None:
    op.drop_index("ix_repository_secrets_repository_id", table_name="repository_secrets")
    op.drop_table("repository_secrets")
    op.drop_index("ix_repository_deploy_keys_repository_id", table_name="repository_deploy_keys")
    op.drop_table("repository_deploy_keys")
    op.drop_index("ix_repository_webhooks_repository_id", table_name="repository_webhooks")
    op.drop_table("repository_webhooks")
    op.drop_index("ix_repository_branch_protections_repository_id", table_name="repository_branch_protections")
    op.drop_table("repository_branch_protections")
    op.drop_index("ix_user_ssh_keys_user_id", table_name="user_ssh_keys")
    op.drop_table("user_ssh_keys")
    op.drop_index("ix_user_git_tokens_user_id", table_name="user_git_tokens")
    op.drop_table("user_git_tokens")
