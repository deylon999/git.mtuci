from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RepositoryBranchProtection(Base):
    __tablename__ = "repository_branch_protections"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    repository_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_pattern: Mapped[str] = mapped_column(String(120), nullable=False, default="main")
    required_approvals: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    require_status_checks: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status_check_contexts_csv: Mapped[str] = mapped_column(Text, nullable=False, default="")
    required_reviewer_logins_csv: Mapped[str] = mapped_column(Text, nullable=False, default="")
    dismiss_stale_approvals: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    block_on_rejected_reviews: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RepositoryWebhook(Base):
    __tablename__ = "repository_webhooks"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    repository_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gitea_hook_id: Mapped[int | None] = mapped_column(nullable=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    events_csv: Mapped[str] = mapped_column(Text, nullable=False, default="push")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_delivery_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RepositoryDeployKey(Base):
    __tablename__ = "repository_deploy_keys"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    repository_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    key_fingerprint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    key_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gitea_key_id: Mapped[int | None] = mapped_column(nullable=True)
    read_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class RepositorySecret(Base):
    __tablename__ = "repository_secrets"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    repository_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    value_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RepositoryRequiredReviewer(Base):
    __tablename__ = "repository_required_reviewers"
    __table_args__ = (
        UniqueConstraint("branch_protection_id", "reviewer_login", name="uq_required_reviewer_branch_login"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    repository_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_protection_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("repository_branch_protections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_login: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
