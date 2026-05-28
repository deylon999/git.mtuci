"""add repository access control tables

Revision ID: 0030
Revises: 0029
Create Date: 2026-05-27

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None

repo_access_role = postgresql.ENUM("read", "write", "admin", name="repo_access_role", create_type=False)
repo_invite_status = postgresql.ENUM(
    "pending", "accepted", "declined", "revoked", name="repo_invite_status", create_type=False
)


def upgrade() -> None:
    op.execute("CREATE TYPE repo_access_role AS ENUM ('read', 'write', 'admin')")
    op.execute(
        "CREATE TYPE repo_invite_status AS ENUM ('pending', 'accepted', 'declined', 'revoked')"
    )

    op.create_table(
        "repository_collaborators",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", repo_access_role, nullable=False, server_default="read"),
        sa.Column("granted_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("repository_id", "user_id", name="uq_repository_collaborator"),
    )
    op.create_index("ix_repository_collaborators_repository_id", "repository_collaborators", ["repository_id"])
    op.create_index("ix_repository_collaborators_user_id", "repository_collaborators", ["user_id"])

    op.create_table(
        "repository_team_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_name", sa.String(50), nullable=False),
        sa.Column("role", repo_access_role, nullable=False, server_default="read"),
        sa.Column("granted_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("repository_id", "team_name", name="uq_repository_team"),
    )
    op.create_index("ix_repository_team_access_repository_id", "repository_team_access", ["repository_id"])
    op.create_index("ix_repository_team_access_team_name", "repository_team_access", ["team_name"])

    op.create_table(
        "repository_access_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", repo_access_role, nullable=False, server_default="read"),
        sa.Column("status", repo_invite_status, nullable=False, server_default="pending"),
        sa.Column("invited_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_repository_access_invites_repository_id", "repository_access_invites", ["repository_id"])
    op.create_index("ix_repository_access_invites_invitee_user_id", "repository_access_invites", ["invitee_user_id"])
    op.create_index("ix_repository_access_invites_token", "repository_access_invites", ["token"])

    op.create_table(
        "repository_access_audit",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("target_type", sa.String(30), nullable=False),
        sa.Column("target_id", sa.String(100), nullable=True),
        sa.Column("target_label", sa.String(255), nullable=True),
        sa.Column("old_role", sa.String(20), nullable=True),
        sa.Column("new_role", sa.String(20), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_repository_access_audit_repository_id", "repository_access_audit", ["repository_id"])
    op.create_index("ix_repository_access_audit_created_at", "repository_access_audit", ["created_at"])


def downgrade() -> None:
    op.drop_table("repository_access_audit")
    op.drop_table("repository_access_invites")
    op.drop_table("repository_team_access")
    op.drop_table("repository_collaborators")
    op.execute("DROP TYPE IF EXISTS repo_invite_status")
    op.execute("DROP TYPE IF EXISTS repo_access_role")
