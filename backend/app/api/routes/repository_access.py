from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.repo_access import (
    RepoAccessAuditConsistencyRead,
    RepoAccessAuditRead,
    RepoAccessInviteRead,
    RepoAccessSummaryRead,
    RepoCollaboratorBulkResult,
    RepoCollaboratorBulkUpsertBody,
    RepoCollaboratorCreateBody,
    RepoCollaboratorRead,
    RepoCollaboratorUpdateBody,
    RepoInviteCreateBody,
    RepoTeamAccessCreateBody,
    RepoTeamAccessRead,
    RepoTeamAccessUpdateBody,
)
from app.services.repo_access_service import (
    _resolve_target_user,
    audit_consistency_check,
    add_collaborator,
    add_team_access,
    bulk_upsert_collaborators,
    build_access_summary,
    create_invite,
    ensure_can_manage_repo_access,
    ensure_can_view_repo_access,
    list_access_audit,
    remove_collaborator,
    remove_team_access,
    revoke_invite,
    _get_repo_or_404,
)
from app.services.repository_access_service import ensure_repository_accessible

router = APIRouter(tags=["repository-access"])


@router.get("/{repository_id}/access", response_model=RepoAccessSummaryRead)
async def get_repository_access(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoAccessSummaryRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_view_repo_access(session, user=current_user, repo=repo)
    return await build_access_summary(session, repo=repo, viewer=current_user)


@router.get("/{repository_id}/access/audit", response_model=list[RepoAccessAuditRead])
async def get_repository_access_audit(
    repository_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[RepoAccessAuditRead]:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    return await list_access_audit(session, repo=repo, limit=limit)


@router.get("/{repository_id}/access/audit/consistency", response_model=RepoAccessAuditConsistencyRead)
async def get_repository_access_audit_consistency(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoAccessAuditConsistencyRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    return await audit_consistency_check(session, repo=repo)


@router.post("/{repository_id}/access/collaborators", response_model=RepoCollaboratorRead)
async def post_repository_collaborator(
    repository_id: UUID,
    body: RepoCollaboratorCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoCollaboratorRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    target = await _resolve_target_user(session, user_id=body.user_id, email=body.email)
    result = await add_collaborator(
        session, repo=repo, actor=current_user, target_user=target, role=body.role
    )
    await session.commit()
    return result


@router.patch("/{repository_id}/access/collaborators/{user_id}", response_model=RepoCollaboratorRead)
async def patch_repository_collaborator(
    repository_id: UUID,
    user_id: UUID,
    body: RepoCollaboratorUpdateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoCollaboratorRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    target = await _resolve_target_user(session, user_id=user_id, email=None)
    result = await add_collaborator(
        session, repo=repo, actor=current_user, target_user=target, role=body.role
    )
    await session.commit()
    return result


@router.post("/{repository_id}/access/collaborators/bulk", response_model=RepoCollaboratorBulkResult)
async def post_repository_collaborators_bulk(
    repository_id: UUID,
    body: RepoCollaboratorBulkUpsertBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoCollaboratorBulkResult:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    result = await bulk_upsert_collaborators(
        session, repo=repo, actor=current_user, items=body.items
    )
    await session.commit()
    return result


@router.delete("/{repository_id}/access/collaborators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository_collaborator(
    repository_id: UUID,
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    await remove_collaborator(session, repo=repo, actor=current_user, target_user_id=user_id)
    await session.commit()


@router.post("/{repository_id}/access/teams", response_model=RepoTeamAccessRead)
async def post_repository_team(
    repository_id: UUID,
    body: RepoTeamAccessCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoTeamAccessRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    result = await add_team_access(
        session, repo=repo, actor=current_user, team_name=body.team_name, role=body.role
    )
    await session.commit()
    return result


@router.patch("/{repository_id}/access/teams/{team_id}", response_model=RepoTeamAccessRead)
async def patch_repository_team(
    repository_id: UUID,
    team_id: UUID,
    body: RepoTeamAccessUpdateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoTeamAccessRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    from app.models.repo_access import RepositoryTeamAccess

    row = await session.get(RepositoryTeamAccess, team_id)
    if not row or row.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team access not found")
    result = await add_team_access(
        session, repo=repo, actor=current_user, team_name=row.team_name, role=body.role
    )
    await session.commit()
    return result


@router.delete("/{repository_id}/access/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository_team(
    repository_id: UUID,
    team_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    await remove_team_access(session, repo=repo, actor=current_user, team_id=team_id)
    await session.commit()


@router.post("/{repository_id}/access/invites", response_model=RepoAccessInviteRead)
async def post_repository_invite(
    repository_id: UUID,
    body: RepoInviteCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RepoAccessInviteRead:
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    invitee = await _resolve_target_user(session, user_id=body.user_id, email=body.email)
    result = await create_invite(
        session, repo=repo, actor=current_user, invitee=invitee, role=body.role
    )
    await session.commit()
    return result


@router.delete("/{repository_id}/access/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository_invite(
    repository_id: UUID,
    invite_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = await _get_repo_or_404(session, repository_id)
    await ensure_repository_accessible(repo, current_user, session)
    await ensure_can_manage_repo_access(session, user=current_user, repo=repo)
    await revoke_invite(session, repo=repo, actor=current_user, invite_id=invite_id)
    await session.commit()
