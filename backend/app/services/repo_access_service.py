from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repo_access import (
    RepoAccessRole,
    RepoInviteStatus,
    RepositoryAccessAudit,
    RepositoryAccessInvite,
    RepositoryCollaborator,
    RepositoryTeamAccess,
)
from app.models.repository import Repository
from app.models.user import User, UserRole
from app.schemas.repo_access import (
    RepoAccessAuditConsistencyRead,
    RepoAccessAuditRead,
    RepoCollaboratorBulkItem,
    RepoCollaboratorBulkResult,
    RepoCollaboratorBulkResultItem,
    RepoAccessInviteRead,
    RepoAccessSummaryRead,
    RepoAccessUserRead,
    RepoCollaboratorRead,
    RepoTeamAccessRead,
)
from app.services.gitea_service import (
    GiteaAuthError,
    remove_repo_collaborator,
    resolve_repo_owner,
    set_repo_collaborator,
)
from app.utils.gitea_user import resolve_gitea_username

def _user_read(user: User) -> RepoAccessUserRead:
    return RepoAccessUserRead(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        group_name=user.group_name,
    )

_ROLE_WEIGHT: dict[RepoAccessRole, int] = {
    RepoAccessRole.read: 1,
    RepoAccessRole.write: 2,
    RepoAccessRole.admin: 3,
}


async def _get_repo_or_404(session: AsyncSession, repository_id: UUID) -> Repository:
    repo = await session.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repo


async def _get_owner_user(session: AsyncSession, repo: Repository) -> User:
    if not repo.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Repository has no owner")
    owner = await session.get(User, repo.owner_id)
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner not found")
    return owner


async def get_user_repo_access_role(
    session: AsyncSession,
    *,
    user: User,
    repo: Repository,
) -> RepoAccessRole | None:
    if repo.owner_id == user.id:
        return RepoAccessRole.admin
    collab = await session.execute(
        select(RepositoryCollaborator).where(
            RepositoryCollaborator.repository_id == repo.id,
            RepositoryCollaborator.user_id == user.id,
        )
    )
    row = collab.scalar_one_or_none()
    if row:
        return row.role
    if user.group_name:
        team = await session.execute(
            select(RepositoryTeamAccess).where(
                RepositoryTeamAccess.repository_id == repo.id,
                RepositoryTeamAccess.team_name == user.group_name,
            )
        )
        team_row = team.scalar_one_or_none()
        if team_row:
            return team_row.role
    return None


async def user_can_manage_repo_access(
    session: AsyncSession,
    *,
    user: User,
    repo: Repository,
) -> bool:
    if user.role == UserRole.admin:
        return True
    if repo.owner_id == user.id:
        return True
    role = await get_user_repo_access_role(session, user=user, repo=repo)
    return role == RepoAccessRole.admin


async def ensure_can_manage_repo_access(
    session: AsyncSession,
    *,
    user: User,
    repo: Repository,
) -> None:
    if not await user_can_manage_repo_access(session, user=user, repo=repo):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only repository owner or admin collaborators can manage access",
        )


async def ensure_can_view_repo_access(
    session: AsyncSession,
    *,
    user: User,
    repo: Repository,
) -> None:
    if await user_can_manage_repo_access(session, user=user, repo=repo):
        return
    role = await get_user_repo_access_role(session, user=user, repo=repo)
    if role is not None:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def ensure_min_repo_role(
    session: AsyncSession,
    *,
    user: User,
    repo: Repository,
    min_role: RepoAccessRole,
) -> None:
    """Ensure user has at least requested repository role (read/write/admin)."""
    if user.role == UserRole.admin:
        return
    role = await get_user_repo_access_role(session, user=user, repo=repo)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if _ROLE_WEIGHT[role] < _ROLE_WEIGHT[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient repository role. Required: {min_role.value}",
        )


async def _log_audit(
    session: AsyncSession,
    *,
    repository_id: UUID,
    actor_id: UUID | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    target_label: str | None = None,
    old_role: str | None = None,
    new_role: str | None = None,
    details: dict | None = None,
) -> None:
    session.add(
        RepositoryAccessAudit(
            repository_id=repository_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_label=target_label,
            old_role=old_role,
            new_role=new_role,
            details=json.dumps(details, ensure_ascii=False) if details else None,
        )
    )


async def _gitea_sync_collaborator(
    session: AsyncSession,
    *,
    repo: Repository,
    target_user: User,
    role: RepoAccessRole | None,
) -> None:
    owner_user = await _get_owner_user(session, repo)
    owner = resolve_gitea_username(owner_user)
    repo_name = (repo.gitea_repo_name or repo.name or "").strip()
    if not repo_name:
        return
    gitea_owner = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
    username = resolve_gitea_username(target_user)
    try:
        if role is None:
            await remove_repo_collaborator(owner=gitea_owner, repo=repo_name, username=username)
        else:
            await set_repo_collaborator(
                owner=gitea_owner,
                repo=repo_name,
                username=username,
                permission=role.value,
            )
    except (GiteaAuthError, RuntimeError):
        pass


async def _resolve_target_user(
    session: AsyncSession,
    *,
    user_id: UUID | None,
    email: str | None,
) -> User:
    if user_id:
        user = await session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user
    if email:
        cleaned = email.strip().lower()
        result = await session.execute(select(User).where(func.lower(User.email) == cleaned))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id or email required")


async def _team_member_count(session: AsyncSession, team_name: str) -> int:
    result = await session.execute(
        select(func.count()).select_from(User).where(User.group_name == team_name)
    )
    return int(result.scalar_one() or 0)


async def _sync_team_to_gitea(
    session: AsyncSession,
    *,
    repo: Repository,
    team_name: str,
    role: RepoAccessRole | None,
) -> None:
    members = await session.execute(select(User).where(User.group_name == team_name))
    for member in members.scalars().all():
        if member.id == repo.owner_id:
            continue
        if role is None:
            collab = await session.execute(
                select(RepositoryCollaborator).where(
                    RepositoryCollaborator.repository_id == repo.id,
                    RepositoryCollaborator.user_id == member.id,
                )
            )
            if collab.scalar_one_or_none():
                continue
        await _gitea_sync_collaborator(session, repo=repo, target_user=member, role=role)



async def build_access_summary(
    session: AsyncSession,
    *,
    repo: Repository,
    viewer: User,
) -> RepoAccessSummaryRead:
    owner = await _get_owner_user(session, repo)
    can_manage = await user_can_manage_repo_access(session, user=viewer, repo=repo)
    my_role = await get_user_repo_access_role(session, user=viewer, repo=repo)

    collab_rows = await session.execute(
        select(RepositoryCollaborator, User)
        .join(User, User.id == RepositoryCollaborator.user_id)
        .where(RepositoryCollaborator.repository_id == repo.id)
        .order_by(RepositoryCollaborator.created_at)
    )
    collaborators: list[RepoCollaboratorRead] = [
        RepoCollaboratorRead(
            user=_user_read(u),
            role=c.role,
            granted_at=c.created_at,
            is_owner=False,
        )
        for c, u in collab_rows.all()
    ]
    collaborators.insert(
        0,
        RepoCollaboratorRead(
            user=_user_read(owner),
            role=RepoAccessRole.admin,
            granted_at=repo.created_at,
            is_owner=True,
        ),
    )

    team_rows = await session.execute(
        select(RepositoryTeamAccess)
        .where(RepositoryTeamAccess.repository_id == repo.id)
        .order_by(RepositoryTeamAccess.team_name)
    )
    teams: list[RepoTeamAccessRead] = []
    for t in team_rows.scalars().all():
        teams.append(
            RepoTeamAccessRead(
                id=t.id,
                team_name=t.team_name,
                role=t.role,
                member_count=await _team_member_count(session, t.team_name),
                granted_at=t.created_at,
            )
        )

    invite_rows = await session.execute(
        select(RepositoryAccessInvite, User)
        .join(User, User.id == RepositoryAccessInvite.invitee_user_id)
        .where(
            RepositoryAccessInvite.repository_id == repo.id,
            RepositoryAccessInvite.status == RepoInviteStatus.pending,
        )
        .order_by(RepositoryAccessInvite.created_at.desc())
    )
    invites: list[RepoAccessInviteRead] = []
    for inv, invitee in invite_rows.all():
        inviter = await session.get(User, inv.invited_by_id) if inv.invited_by_id else None
        invites.append(
            RepoAccessInviteRead(
                id=inv.id,
                user=_user_read(invitee),
                role=inv.role,
                status=inv.status,
                invited_by=_user_read(inviter) if inviter else None,
                created_at=inv.created_at,
                expires_at=inv.expires_at,
            )
        )

    return RepoAccessSummaryRead(
        repository_id=repo.id,
        can_manage=can_manage,
        my_role=my_role,
        owner=_user_read(owner),
        collaborators=collaborators,
        teams=teams,
        invites=invites if can_manage else [],
    )


async def add_collaborator(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    target_user: User,
    role: RepoAccessRole,
) -> RepoCollaboratorRead:
    if target_user.id == repo.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner already has admin access")
    existing = await session.execute(
        select(RepositoryCollaborator).where(
            RepositoryCollaborator.repository_id == repo.id,
            RepositoryCollaborator.user_id == target_user.id,
        )
    )
    row = existing.scalar_one_or_none()
    old_role = row.role.value if row else None
    if row:
        row.role = role
        row.granted_by_id = actor.id
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = RepositoryCollaborator(
            repository_id=repo.id,
            user_id=target_user.id,
            role=role,
            granted_by_id=actor.id,
        )
        session.add(row)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=actor.id,
        action="collaborator_update" if old_role else "collaborator_add",
        target_type="user",
        target_id=str(target_user.id),
        target_label=target_user.email,
        old_role=old_role,
        new_role=role.value,
    )
    await session.flush()
    await _gitea_sync_collaborator(session, repo=repo, target_user=target_user, role=role)
    pending = await session.execute(
        select(RepositoryAccessInvite).where(
            RepositoryAccessInvite.repository_id == repo.id,
            RepositoryAccessInvite.invitee_user_id == target_user.id,
            RepositoryAccessInvite.status == RepoInviteStatus.pending,
        )
    )
    for inv in pending.scalars().all():
        inv.status = RepoInviteStatus.accepted
        inv.responded_at = datetime.now(timezone.utc)
    await session.flush()
    return RepoCollaboratorRead(
        user=_user_read(target_user),
        role=row.role,
        granted_at=row.created_at,
        is_owner=False,
    )


async def remove_collaborator(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    target_user_id: UUID,
) -> None:
    if target_user_id == repo.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove owner")
    result = await session.execute(
        select(RepositoryCollaborator).where(
            RepositoryCollaborator.repository_id == repo.id,
            RepositoryCollaborator.user_id == target_user_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collaborator not found")
    target_user = await session.get(User, target_user_id)
    old_role = row.role.value
    await session.delete(row)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=actor.id,
        action="collaborator_remove",
        target_type="user",
        target_id=str(target_user_id),
        target_label=target_user.email if target_user else None,
        old_role=old_role,
    )
    if target_user:
        await _gitea_sync_collaborator(session, repo=repo, target_user=target_user, role=None)
    await session.flush()


async def add_team_access(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    team_name: str,
    role: RepoAccessRole,
) -> RepoTeamAccessRead:
    cleaned = team_name.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_name required")
    existing = await session.execute(
        select(RepositoryTeamAccess).where(
            RepositoryTeamAccess.repository_id == repo.id,
            RepositoryTeamAccess.team_name == cleaned,
        )
    )
    row = existing.scalar_one_or_none()
    old_role = row.role.value if row else None
    if row:
        row.role = role
        row.granted_by_id = actor.id
    else:
        row = RepositoryTeamAccess(
            repository_id=repo.id,
            team_name=cleaned,
            role=role,
            granted_by_id=actor.id,
        )
        session.add(row)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=actor.id,
        action="team_update" if old_role else "team_add",
        target_type="team",
        target_id=cleaned,
        target_label=cleaned,
        old_role=old_role,
        new_role=role.value,
    )
    await session.flush()
    await _sync_team_to_gitea(session, repo=repo, team_name=cleaned, role=role)
    await session.flush()
    return RepoTeamAccessRead(
        id=row.id,
        team_name=row.team_name,
        role=row.role,
        member_count=await _team_member_count(session, row.team_name),
        granted_at=row.created_at,
    )


async def remove_team_access(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    team_id: UUID,
) -> None:
    row = await session.get(RepositoryTeamAccess, team_id)
    if not row or row.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team access not found")
    team_name = row.team_name
    old_role = row.role.value
    await session.delete(row)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=actor.id,
        action="team_remove",
        target_type="team",
        target_id=team_name,
        target_label=team_name,
        old_role=old_role,
    )
    await _sync_team_to_gitea(session, repo=repo, team_name=team_name, role=None)
    await session.flush()


async def create_invite(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    invitee: User,
    role: RepoAccessRole,
) -> RepoAccessInviteRead:
    if invitee.id == repo.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot invite owner")
    existing_collab = await session.execute(
        select(RepositoryCollaborator).where(
            RepositoryCollaborator.repository_id == repo.id,
            RepositoryCollaborator.user_id == invitee.id,
        )
    )
    if existing_collab.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a collaborator")
    pending = await session.execute(
        select(RepositoryAccessInvite).where(
            RepositoryAccessInvite.repository_id == repo.id,
            RepositoryAccessInvite.invitee_user_id == invitee.id,
            RepositoryAccessInvite.status == RepoInviteStatus.pending,
        )
    )
    if pending.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite already pending")
    inv = RepositoryAccessInvite(
        repository_id=repo.id,
        invitee_user_id=invitee.id,
        role=role,
        invited_by_id=actor.id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    session.add(inv)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=actor.id,
        action="invite_create",
        target_type="user",
        target_id=str(invitee.id),
        target_label=invitee.email,
        new_role=role.value,
    )
    await session.flush()
    return RepoAccessInviteRead(
        id=inv.id,
        user=_user_read(invitee),
        role=inv.role,
        status=inv.status,
        invited_by=_user_read(actor),
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


async def respond_invite(
    session: AsyncSession,
    *,
    invite_id: UUID,
    user: User,
    accept: bool,
) -> RepoAccessInviteRead | None:
    inv = await session.get(RepositoryAccessInvite, invite_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if inv.invitee_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your invite")
    if inv.status != RepoInviteStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending")
    if inv.expires_at and inv.expires_at < datetime.now(timezone.utc):
        inv.status = RepoInviteStatus.revoked
        await session.flush()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite expired")
    repo = await _get_repo_or_404(session, inv.repository_id)
    inv.status = RepoInviteStatus.accepted if accept else RepoInviteStatus.declined
    inv.responded_at = datetime.now(timezone.utc)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=user.id,
        action="invite_accept" if accept else "invite_decline",
        target_type="user",
        target_id=str(user.id),
        target_label=user.email,
        new_role=inv.role.value if accept else None,
    )
    if accept:
        owner = await _get_owner_user(session, repo)
        await add_collaborator(
            session,
            repo=repo,
            actor=owner,
            target_user=user,
            role=inv.role,
        )
    await session.flush()
    return RepoAccessInviteRead(
        id=inv.id,
        user=_user_read(user),
        role=inv.role,
        status=inv.status,
        invited_by=None,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


async def revoke_invite(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    invite_id: UUID,
) -> None:
    inv = await session.get(RepositoryAccessInvite, invite_id)
    if not inv or inv.repository_id != repo.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if inv.status != RepoInviteStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending")
    invitee = await session.get(User, inv.invitee_user_id)
    inv.status = RepoInviteStatus.revoked
    inv.responded_at = datetime.now(timezone.utc)
    await _log_audit(
        session,
        repository_id=repo.id,
        actor_id=actor.id,
        action="invite_revoke",
        target_type="user",
        target_id=str(inv.invitee_user_id),
        target_label=invitee.email if invitee else None,
    )
    await session.flush()


async def list_access_audit(
    session: AsyncSession,
    *,
    repo: Repository,
    limit: int = 50,
) -> list[RepoAccessAuditRead]:
    rows = await session.execute(
        select(RepositoryAccessAudit)
        .where(RepositoryAccessAudit.repository_id == repo.id)
        .order_by(RepositoryAccessAudit.created_at.desc())
        .limit(limit)
    )
    out: list[RepoAccessAuditRead] = []
    for row in rows.scalars().all():
        actor_user = await session.get(User, row.actor_id) if row.actor_id else None
        out.append(
            RepoAccessAuditRead(
                id=row.id,
                action=row.action,
                target_type=row.target_type,
                target_label=row.target_label,
                old_role=row.old_role,
                new_role=row.new_role,
                actor=_user_read(actor_user) if actor_user else None,
                created_at=row.created_at,
            )
        )
    return out


async def list_pending_invites_for_user(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> list[RepoAccessInviteRead]:
    rows = await session.execute(
        select(RepositoryAccessInvite, User, Repository)
        .join(User, User.id == RepositoryAccessInvite.invitee_user_id)
        .join(Repository, Repository.id == RepositoryAccessInvite.repository_id)
        .where(
            RepositoryAccessInvite.invitee_user_id == user_id,
            RepositoryAccessInvite.status == RepoInviteStatus.pending,
        )
        .order_by(RepositoryAccessInvite.created_at.desc())
    )
    out: list[RepoAccessInviteRead] = []
    for inv, invitee, _repo in rows.all():
        inviter = await session.get(User, inv.invited_by_id) if inv.invited_by_id else None
        out.append(
            RepoAccessInviteRead(
                id=inv.id,
                user=_user_read(invitee),
                role=inv.role,
                status=inv.status,
                invited_by=_user_read(inviter) if inviter else None,
                created_at=inv.created_at,
                expires_at=inv.expires_at,
            )
        )
    return out


async def repositories_accessible_by_user(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> list[UUID]:
    """Repository IDs where user is owner, collaborator, or team member."""
    user = await session.get(User, user_id)
    if not user:
        return []
    owned = await session.execute(select(Repository.id).where(Repository.owner_id == user_id))
    ids = {row[0] for row in owned.all()}
    collab = await session.execute(
        select(RepositoryCollaborator.repository_id).where(RepositoryCollaborator.user_id == user_id)
    )
    ids.update(row[0] for row in collab.all())
    if user.group_name:
        team = await session.execute(
            select(RepositoryTeamAccess.repository_id).where(
                RepositoryTeamAccess.team_name == user.group_name
            )
        )
        ids.update(row[0] for row in team.all())
    return list(ids)


async def bulk_upsert_collaborators(
    session: AsyncSession,
    *,
    repo: Repository,
    actor: User,
    items: list[RepoCollaboratorBulkItem],
) -> RepoCollaboratorBulkResult:
    results: list[RepoCollaboratorBulkResultItem] = []
    success = 0
    failed = 0
    for item in items:
        key = str(item.user_id) if item.user_id else (item.email or "")
        try:
            target = await _resolve_target_user(session, user_id=item.user_id, email=item.email)
            collaborator = await add_collaborator(
                session, repo=repo, actor=actor, target_user=target, role=item.role
            )
            results.append(
                RepoCollaboratorBulkResultItem(
                    key=key,
                    status="ok",
                    collaborator=collaborator,
                )
            )
            success += 1
        except HTTPException as exc:
            results.append(
                RepoCollaboratorBulkResultItem(
                    key=key,
                    status="error",
                    detail=str(exc.detail),
                )
            )
            failed += 1
            # Keep partial-success semantics for bulk operation.
            continue
    return RepoCollaboratorBulkResult(
        processed=len(items),
        success=success,
        failed=failed,
        results=results,
    )


async def audit_consistency_check(
    session: AsyncSession,
    *,
    repo: Repository,
) -> RepoAccessAuditConsistencyRead:
    issues: list[str] = []
    counters: dict[str, int] = {}
    now = datetime.now(timezone.utc)

    collab_rows = await session.execute(
        select(RepositoryCollaborator).where(RepositoryCollaborator.repository_id == repo.id)
    )
    team_rows = await session.execute(
        select(RepositoryTeamAccess).where(RepositoryTeamAccess.repository_id == repo.id)
    )
    invite_rows = await session.execute(
        select(RepositoryAccessInvite).where(RepositoryAccessInvite.repository_id == repo.id)
    )
    audit_rows = await session.execute(
        select(RepositoryAccessAudit).where(RepositoryAccessAudit.repository_id == repo.id)
    )
    collaborators = list(collab_rows.scalars().all())
    teams = list(team_rows.scalars().all())
    invites = list(invite_rows.scalars().all())
    audits = list(audit_rows.scalars().all())

    counters["collaborators"] = len(collaborators)
    counters["teams"] = len(teams)
    counters["invites"] = len(invites)
    counters["audits"] = len(audits)

    # Duplicate pending invite guard.
    pending_seen: set[tuple[str, str]] = set()
    for inv in invites:
        if inv.status != RepoInviteStatus.pending:
            continue
        key = (str(inv.invitee_user_id), inv.role.value)
        if key in pending_seen:
            issues.append(f"duplicate pending invite for user={inv.invitee_user_id} role={inv.role.value}")
        pending_seen.add(key)
        if inv.expires_at and inv.expires_at < now:
            issues.append(f"expired invite still pending: {inv.id}")

    # Actor and role-transition sanity in audit.
    for row in audits:
        if row.action.endswith(("add", "update", "remove", "create", "revoke", "accept", "decline")) and row.actor_id is None:
            issues.append(f"audit row {row.id} missing actor_id for action {row.action}")
        if row.action.endswith(("update", "add")) and row.new_role is None:
            issues.append(f"audit row {row.id} missing new_role for action {row.action}")

    # Cross-check that collaborator rows have corresponding add/update audit entries.
    collab_target_ids = {str(c.user_id) for c in collaborators}
    audited_target_ids = {
        (a.target_id or "")
        for a in audits
        if a.action in {"collaborator_add", "collaborator_update"}
    }
    for cid in collab_target_ids:
        if cid not in audited_target_ids:
            issues.append(f"collaborator {cid} has no add/update audit trail")

    return RepoAccessAuditConsistencyRead(
        repository_id=repo.id,
        checked_at=now,
        ok=len(issues) == 0,
        issues=issues,
        counters=counters,
    )
