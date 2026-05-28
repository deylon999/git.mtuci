from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.repo_settings import (
    BranchProtectionRead,
    BranchProtectionUpsertBody,
    MergePolicyCheckBody,
    MergePolicyCheckRead,
    RepoDeployKeyCreateBody,
    RepoDeployKeyRead,
    RepoSecretRead,
    RepoSecretUpsertBody,
    RepoWebhookCreateBody,
    RepoWebhookRead,
)
from app.services.repo_settings_service import (
    create_deploy_key,
    create_webhook,
    delete_deploy_key,
    delete_repo_secret,
    delete_webhook,
    ensure_manageable_repo,
    evaluate_merge_policy,
    list_branch_protections,
    match_branch_protection_rule,
    list_deploy_keys,
    list_repo_secrets,
    list_webhooks,
    redeliver_webhook,
    test_webhook_delivery,
    upsert_branch_protection,
    upsert_repo_secret,
)

router = APIRouter(prefix="/repositories", tags=["repository-settings"])


@router.get("/{repository_id}/settings/branch-protection", response_model=list[BranchProtectionRead])
async def get_branch_protections(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[BranchProtectionRead]:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    return await list_branch_protections(session, repo=repo)


@router.put("/{repository_id}/settings/branch-protection", response_model=BranchProtectionRead)
async def put_branch_protection(
    repository_id: UUID,
    body: BranchProtectionUpsertBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> BranchProtectionRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    result = await upsert_branch_protection(
        session,
        repo=repo,
        branch_pattern=body.branch_pattern,
        required_approvals=body.required_approvals,
        require_status_checks=body.require_status_checks,
        status_check_contexts=body.status_check_contexts,
        required_reviewer_logins=body.required_reviewer_logins,
        dismiss_stale_approvals=body.dismiss_stale_approvals,
        block_on_rejected_reviews=body.block_on_rejected_reviews,
    )
    await session.commit()
    return result


@router.post("/{repository_id}/settings/branch-protection/check-merge", response_model=MergePolicyCheckRead)
async def post_branch_protection_check_merge(
    repository_id: UUID,
    body: MergePolicyCheckBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MergePolicyCheckRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    rules = await list_branch_protections(session, repo=repo)
    rule = match_branch_protection_rule(rules, branch=body.branch)
    if not rule:
        return MergePolicyCheckRead(allowed=True, reasons=[])
    return evaluate_merge_policy(
        required_approvals=rule.required_approvals,
        require_status_checks=rule.require_status_checks,
        required_status_contexts=rule.status_check_contexts,
        required_reviewer_logins=rule.required_reviewer_logins,
        block_on_rejected_reviews=rule.block_on_rejected_reviews,
        approvals=body.approvals,
        successful_checks=body.successful_checks,
        approved_reviewer_logins=body.approved_reviewer_logins,
        has_rejected_review=body.has_rejected_review,
    )


@router.get("/{repository_id}/settings/webhooks", response_model=list[RepoWebhookRead])
async def get_repo_webhooks(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[RepoWebhookRead]:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    return await list_webhooks(session, repo=repo)


@router.post("/{repository_id}/settings/webhooks", response_model=RepoWebhookRead, status_code=status.HTTP_201_CREATED)
async def post_repo_webhook(
    repository_id: UUID,
    body: RepoWebhookCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoWebhookRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    result = await create_webhook(
        session,
        repo=repo,
        url=body.url,
        events=body.events,
        secret=body.secret,
        is_active=body.is_active,
    )
    await session.commit()
    return result


@router.post("/{repository_id}/settings/webhooks/{webhook_id}/test", response_model=RepoWebhookRead)
async def post_repo_webhook_test(
    repository_id: UUID,
    webhook_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoWebhookRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    result = await test_webhook_delivery(session, repo=repo, webhook_id=webhook_id)
    await session.commit()
    return result


@router.post("/{repository_id}/settings/webhooks/{webhook_id}/redeliver", response_model=RepoWebhookRead)
async def post_repo_webhook_redeliver(
    repository_id: UUID,
    webhook_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoWebhookRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    result = await redeliver_webhook(session, repo=repo, webhook_id=webhook_id)
    await session.commit()
    return result


@router.delete("/{repository_id}/settings/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repo_webhook(
    repository_id: UUID,
    webhook_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    await delete_webhook(session, repo=repo, webhook_id=webhook_id)
    await session.commit()


@router.get("/{repository_id}/settings/deploy-keys", response_model=list[RepoDeployKeyRead])
async def get_repo_deploy_keys(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[RepoDeployKeyRead]:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    return await list_deploy_keys(session, repo=repo)


@router.post("/{repository_id}/settings/deploy-keys", response_model=RepoDeployKeyRead, status_code=status.HTTP_201_CREATED)
async def post_repo_deploy_key(
    repository_id: UUID,
    body: RepoDeployKeyCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoDeployKeyRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    result = await create_deploy_key(
        session,
        repo=repo,
        title=body.title,
        public_key=body.public_key,
        read_only=body.read_only,
    )
    await session.commit()
    return result


@router.delete("/{repository_id}/settings/deploy-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repo_deploy_key(
    repository_id: UUID,
    key_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    await delete_deploy_key(session, repo=repo, key_id=key_id)
    await session.commit()


@router.get("/{repository_id}/settings/secrets", response_model=list[RepoSecretRead])
async def get_repo_secrets(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[RepoSecretRead]:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    return await list_repo_secrets(session, repo=repo)


@router.put("/{repository_id}/settings/secrets", response_model=RepoSecretRead)
async def put_repo_secret(
    repository_id: UUID,
    body: RepoSecretUpsertBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoSecretRead:
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    result = await upsert_repo_secret(
        session,
        repo=repo,
        actor=current_user,
        name=body.name,
        value=body.value,
    )
    await session.commit()
    return result


@router.delete("/{repository_id}/settings/secrets/{secret_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_secret(
    repository_id: UUID,
    secret_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = await ensure_manageable_repo(session, repository_id, current_user)
    await delete_repo_secret(session, repo=repo, secret_id=secret_id)
    await session.commit()
