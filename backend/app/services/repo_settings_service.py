from __future__ import annotations

import fnmatch
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.credential_crypto import encrypt_secret
from app.models.repo_settings import (
    RepositoryBranchProtection,
    RepositoryDeployKey,
    RepositoryRequiredReviewer,
    RepositorySecret,
    RepositoryWebhook,
)
from app.models.repository import Repository
from app.models.user import User
from app.schemas.repo_settings import (
    BranchProtectionRead,
    MergePolicyCheckRead,
    RepoDeployKeyRead,
    RepoSecretRead,
    RepoWebhookRead,
)
from app.services.gitea_service import resolve_repo_owner
from app.services.gitea_service import (
    create_gitea_deploy_key,
    create_gitea_repo_webhook,
    delete_gitea_deploy_key,
    delete_gitea_repo_webhook,
    upsert_gitea_branch_protection,
)
from app.services.repo_access_service import ensure_can_manage_repo_access
from app.services.repo_access_service import get_user_repo_access_role
from app.utils.gitea_user import resolve_gitea_username


def _csv(values: list[str]) -> str:
    return ",".join(dict.fromkeys(v.strip() for v in values if v.strip()))


def _split(csv: str) -> list[str]:
    return [s for s in (x.strip() for x in csv.split(",")) if s]


async def _validate_required_reviewers(
    session: AsyncSession,
    *,
    repo: Repository,
    required_reviewer_logins: list[str],
) -> list[str]:
    normalized = sorted(
        {str(v).strip().lower() for v in required_reviewer_logins if str(v).strip()}
    )
    if not normalized:
        return []
    users_rows = await session.execute(select(User))
    users = users_rows.scalars().all()
    by_login = {resolve_gitea_username(u).strip().lower(): u for u in users}

    missing_users: list[str] = []
    without_access: list[str] = []
    accepted: list[str] = []
    for login in normalized:
        user = by_login.get(login)
        if not user:
            missing_users.append(login)
            continue
        role = await get_user_repo_access_role(session, user=user, repo=repo)
        if role is None and user.role.value != "admin":
            without_access.append(login)
            continue
        accepted.append(login)
    if missing_users or without_access:
        reasons: list[str] = []
        if missing_users:
            reasons.append(f"Unknown reviewers: {', '.join(sorted(missing_users))}")
        if without_access:
            reasons.append(f"Reviewers without repository access: {', '.join(sorted(without_access))}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(reasons))
    return accepted


def _bp_read(row: RepositoryBranchProtection) -> BranchProtectionRead:
    return BranchProtectionRead(
        id=row.id,
        branch_pattern=row.branch_pattern,
        required_approvals=row.required_approvals,
        require_status_checks=row.require_status_checks,
        status_check_contexts=_split(row.status_check_contexts_csv),
        required_reviewer_logins=_split(row.required_reviewer_logins_csv),
        dismiss_stale_approvals=row.dismiss_stale_approvals,
        block_on_rejected_reviews=row.block_on_rejected_reviews,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _required_reviewer_logins_for_rule(
    session: AsyncSession,
    *,
    rule_id: UUID,
) -> list[str]:
    rows = await session.execute(
        select(RepositoryRequiredReviewer.reviewer_login).where(
            RepositoryRequiredReviewer.branch_protection_id == rule_id
        )
    )
    vals = [str(x).strip().lower() for x in rows.scalars().all() if str(x).strip()]
    if vals:
        return sorted(dict.fromkeys(vals))
    return []


def _hook_read(row: RepositoryWebhook) -> RepoWebhookRead:
    return RepoWebhookRead(
        id=row.id,
        url=row.url,
        events=_split(row.events_csv),
        is_active=row.is_active,
        last_delivery_status=row.last_delivery_status,
        last_delivery_at=row.last_delivery_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _deploy_read(row: RepositoryDeployKey) -> RepoDeployKeyRead:
    return RepoDeployKeyRead(
        id=row.id,
        title=row.title,
        key_fingerprint=row.key_fingerprint,
        key_type=row.key_type,
        read_only=row.read_only,
        created_at=row.created_at,
    )


def _secret_read(row: RepositorySecret) -> RepoSecretRead:
    return RepoSecretRead(id=row.id, name=row.name, updated_at=row.updated_at)


def match_branch_protection_rule(
    rules: list[BranchProtectionRead],
    *,
    branch: str,
) -> BranchProtectionRead | None:
    cleaned_branch = (branch or "").strip()
    if not cleaned_branch:
        return None
    exact = [r for r in rules if (r.branch_pattern or "").strip() == cleaned_branch]
    if exact:
        return sorted(exact, key=lambda r: len((r.branch_pattern or "").strip()), reverse=True)[0]
    wildcards = [
        r for r in rules if (r.branch_pattern or "").strip() and fnmatch.fnmatch(cleaned_branch, (r.branch_pattern or "").strip())
    ]
    if not wildcards:
        return None
    # Most specific wins.
    return sorted(wildcards, key=lambda r: len((r.branch_pattern or "").strip()), reverse=True)[0]


def evaluate_merge_policy(
    *,
    required_approvals: int,
    require_status_checks: bool,
    required_status_contexts: list[str],
    required_reviewer_logins: list[str],
    block_on_rejected_reviews: bool,
    approvals: int,
    successful_checks: list[str],
    approved_reviewer_logins: list[str],
    has_rejected_review: bool,
) -> MergePolicyCheckRead:
    reasons: list[str] = []
    if approvals < required_approvals:
        reasons.append(f"Not enough approvals: {approvals}/{required_approvals}")
    if block_on_rejected_reviews and has_rejected_review:
        reasons.append("Merge blocked by rejected review")
    if require_status_checks:
        ok = {c.strip() for c in successful_checks if c.strip()}
        missing = [c for c in required_status_contexts if c and c not in ok]
        if missing:
            reasons.append(f"Missing required checks: {', '.join(missing)}")
    required_reviewers = {
        login.strip().lower() for login in required_reviewer_logins if login.strip()
    }
    approved_reviewers = {
        login.strip().lower() for login in approved_reviewer_logins if login.strip()
    }
    missing_required_reviewers = sorted(required_reviewers - approved_reviewers)
    if missing_required_reviewers:
        reasons.append(
            "Missing approvals from required reviewers: " + ", ".join(missing_required_reviewers)
        )
    return MergePolicyCheckRead(allowed=not reasons, reasons=reasons)


async def ensure_manageable_repo(session: AsyncSession, repository_id: UUID, user: User) -> Repository:
    repo = await session.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    await ensure_can_manage_repo_access(session, user=user, repo=repo)
    return repo


async def list_branch_protections(session: AsyncSession, *, repo: Repository) -> list[BranchProtectionRead]:
    rows = await session.execute(
        select(RepositoryBranchProtection)
        .where(RepositoryBranchProtection.repository_id == repo.id)
        .order_by(RepositoryBranchProtection.branch_pattern)
    )
    result: list[BranchProtectionRead] = []
    for r in rows.scalars().all():
        item = _bp_read(r)
        required_reviewers = await _required_reviewer_logins_for_rule(session, rule_id=r.id)
        if required_reviewers:
            item.required_reviewer_logins = required_reviewers
        result.append(item)
    return result


async def upsert_branch_protection(
    session: AsyncSession,
    *,
    repo: Repository,
    branch_pattern: str,
    required_approvals: int,
    require_status_checks: bool,
    status_check_contexts: list[str],
    required_reviewer_logins: list[str],
    dismiss_stale_approvals: bool,
    block_on_rejected_reviews: bool,
) -> BranchProtectionRead:
    valid_required_reviewers = await _validate_required_reviewers(
        session,
        repo=repo,
        required_reviewer_logins=required_reviewer_logins,
    )
    owner_user = await session.get(User, repo.owner_id) if repo.owner_id else None
    if owner_user:
        owner = resolve_gitea_username(owner_user)
        repo_name = (repo.gitea_repo_name or repo.name or "").strip()
        if repo_name:
            gitea_owner = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
            await upsert_gitea_branch_protection(
                owner=gitea_owner,
                repo=repo_name,
                branch_pattern=branch_pattern.strip(),
                required_approvals=required_approvals,
                require_status_checks=require_status_checks,
                status_check_contexts=status_check_contexts,
                dismiss_stale_approvals=dismiss_stale_approvals,
                block_on_rejected_reviews=block_on_rejected_reviews,
            )
    rows = await session.execute(
        select(RepositoryBranchProtection).where(
            RepositoryBranchProtection.repository_id == repo.id,
            RepositoryBranchProtection.branch_pattern == branch_pattern.strip(),
        )
    )
    row = rows.scalar_one_or_none()
    if not row:
        row = RepositoryBranchProtection(repository_id=repo.id, branch_pattern=branch_pattern.strip())
        session.add(row)
        await session.flush()
    row.required_approvals = required_approvals
    row.require_status_checks = require_status_checks
    row.status_check_contexts_csv = _csv(status_check_contexts)
    row.required_reviewer_logins_csv = _csv(valid_required_reviewers)
    row.dismiss_stale_approvals = dismiss_stale_approvals
    row.block_on_rejected_reviews = block_on_rejected_reviews
    row.updated_at = datetime.now(timezone.utc)
    await session.execute(
        RepositoryRequiredReviewer.__table__.delete().where(
            RepositoryRequiredReviewer.branch_protection_id == row.id
        )
    )
    for login in valid_required_reviewers:
        session.add(
            RepositoryRequiredReviewer(
                repository_id=repo.id,
                branch_protection_id=row.id,
                reviewer_login=login,
            )
        )
    await session.flush()
    out = _bp_read(row)
    out.required_reviewer_logins = sorted(valid_required_reviewers)
    return out


async def list_webhooks(session: AsyncSession, *, repo: Repository) -> list[RepoWebhookRead]:
    rows = await session.execute(
        select(RepositoryWebhook).where(RepositoryWebhook.repository_id == repo.id).order_by(RepositoryWebhook.created_at.desc())
    )
    return [_hook_read(r) for r in rows.scalars().all()]


async def create_webhook(
    session: AsyncSession,
    *,
    repo: Repository,
    url: str,
    events: list[str],
    secret: str | None,
    is_active: bool,
) -> RepoWebhookRead:
    owner_user = await session.get(User, repo.owner_id) if repo.owner_id else None
    gitea_hook_id: int | None = None
    if owner_user:
        owner = resolve_gitea_username(owner_user)
        repo_name = (repo.gitea_repo_name or repo.name or "").strip()
        if repo_name:
            gitea_owner = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
            data = await create_gitea_repo_webhook(
                owner=gitea_owner,
                repo=repo_name,
                url=url.strip(),
                events=events,
                secret=secret,
                is_active=is_active,
            )
            if data.get("id") is not None:
                gitea_hook_id = int(data.get("id"))
    row = RepositoryWebhook(
        repository_id=repo.id,
        gitea_hook_id=gitea_hook_id,
        url=url.strip(),
        events_csv=_csv(events) or "push",
        secret_encrypted=encrypt_secret(secret.strip()) if secret else None,
        is_active=is_active,
    )
    session.add(row)
    await session.flush()
    return _hook_read(row)


async def test_webhook_delivery(session: AsyncSession, *, repo: Repository, webhook_id: UUID) -> RepoWebhookRead:
    row = await session.get(RepositoryWebhook, webhook_id)
    if not row or row.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    row.last_delivery_status = "test_ok"
    row.last_delivery_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return _hook_read(row)


async def redeliver_webhook(session: AsyncSession, *, repo: Repository, webhook_id: UUID) -> RepoWebhookRead:
    return await test_webhook_delivery(session, repo=repo, webhook_id=webhook_id)


async def delete_webhook(session: AsyncSession, *, repo: Repository, webhook_id: UUID) -> None:
    row = await session.get(RepositoryWebhook, webhook_id)
    if not row or row.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    if row.gitea_hook_id is not None and repo.owner_id:
        owner_user = await session.get(User, repo.owner_id)
        if owner_user:
            owner = resolve_gitea_username(owner_user)
            repo_name = (repo.gitea_repo_name or repo.name or "").strip()
            if repo_name:
                gitea_owner = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
                await delete_gitea_repo_webhook(owner=gitea_owner, repo=repo_name, hook_id=row.gitea_hook_id)
    await session.delete(row)


async def list_deploy_keys(session: AsyncSession, *, repo: Repository) -> list[RepoDeployKeyRead]:
    rows = await session.execute(
        select(RepositoryDeployKey).where(RepositoryDeployKey.repository_id == repo.id).order_by(RepositoryDeployKey.created_at.desc())
    )
    return [_deploy_read(r) for r in rows.scalars().all()]


async def create_deploy_key(
    session: AsyncSession,
    *,
    repo: Repository,
    title: str,
    public_key: str,
    read_only: bool,
) -> RepoDeployKeyRead:
    owner_user = await session.get(User, repo.owner_id) if repo.owner_id else None
    gitea_key_id: int | None = None
    fingerprint: str | None = None
    key_type: str | None = None
    if owner_user:
        owner = resolve_gitea_username(owner_user)
        repo_name = (repo.gitea_repo_name or repo.name or "").strip()
        if repo_name:
            gitea_owner = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
            data = await create_gitea_deploy_key(
                owner=gitea_owner,
                repo=repo_name,
                title=title.strip(),
                key=public_key.strip(),
                read_only=read_only,
            )
            if data.get("id") is not None:
                gitea_key_id = int(data.get("id"))
            fingerprint = str(data.get("fingerprint") or "") or None
            key_type = str(data.get("key_type") or "") or None
    parsed_key_type = public_key.strip().split(" ", 1)[0] if public_key.strip() else None
    row = RepositoryDeployKey(
        repository_id=repo.id,
        title=title.strip(),
        key_type=key_type or parsed_key_type,
        key_fingerprint=fingerprint or public_key.strip()[:42],
        gitea_key_id=gitea_key_id,
        read_only=read_only,
    )
    session.add(row)
    await session.flush()
    return _deploy_read(row)


async def delete_deploy_key(session: AsyncSession, *, repo: Repository, key_id: UUID) -> None:
    row = await session.get(RepositoryDeployKey, key_id)
    if not row or row.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deploy key not found")
    if row.gitea_key_id is not None and repo.owner_id:
        owner_user = await session.get(User, repo.owner_id)
        if owner_user:
            owner = resolve_gitea_username(owner_user)
            repo_name = (repo.gitea_repo_name or repo.name or "").strip()
            if repo_name:
                gitea_owner = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
                await delete_gitea_deploy_key(owner=gitea_owner, repo=repo_name, key_id=row.gitea_key_id)
    await session.delete(row)


async def list_repo_secrets(session: AsyncSession, *, repo: Repository) -> list[RepoSecretRead]:
    rows = await session.execute(
        select(RepositorySecret).where(RepositorySecret.repository_id == repo.id).order_by(RepositorySecret.name)
    )
    return [_secret_read(r) for r in rows.scalars().all()]


async def upsert_repo_secret(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    name: str,
    value: str,
) -> RepoSecretRead:
    cleaned = name.strip().upper()
    rows = await session.execute(
        select(RepositorySecret).where(
            RepositorySecret.repository_id == repo.id,
            RepositorySecret.name == cleaned,
        )
    )
    row = rows.scalar_one_or_none()
    if not row:
        row = RepositorySecret(
            repository_id=repo.id,
            name=cleaned,
            created_by_id=actor.id,
            value_encrypted=encrypt_secret(value) or "",
        )
        session.add(row)
    else:
        row.value_encrypted = encrypt_secret(value) or ""
        row.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return _secret_read(row)


async def delete_repo_secret(session: AsyncSession, *, repo: Repository, secret_id: UUID) -> None:
    row = await session.get(RepositorySecret, secret_id)
    if not row or row.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Secret not found")
    await session.delete(row)
