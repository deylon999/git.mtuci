from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.git_auth import UserGitToken, UserSshKey
from app.models.user import User
from app.schemas.git_auth import GitTokenCreateRead, GitTokenRead, UserSshKeyRead
from app.services.gitea_service import (
    add_gitea_user_ssh_key,
    create_gitea_user_access_token,
    delete_gitea_user_access_token,
    delete_gitea_user_ssh_key,
    ensure_gitea_user,
    list_gitea_user_access_tokens,
)
from app.utils.gitea_user import resolve_gitea_username

MAX_ACTIVE_GIT_TOKENS_PER_USER = 10
ACTIVE_GIT_TOKENS_LIMIT_ERROR = "Отключите старый токен или перевыпустите существующий"


def _split_scopes(scopes_csv: str) -> list[str]:
    return [s for s in (x.strip() for x in scopes_csv.split(",")) if s]


def _token_read(row: UserGitToken) -> GitTokenRead:
    return GitTokenRead(
        id=row.id,
        name=row.name,
        scopes=_split_scopes(row.scopes_csv),
        token_preview=row.token_preview,
        expires_at=row.expires_at,
        last_used_at=row.last_used_at,
        created_at=row.created_at,
        is_active=row.is_active,
    )


def _ssh_read(row: UserSshKey) -> UserSshKeyRead:
    return UserSshKeyRead(
        id=row.id,
        title=row.title,
        key_fingerprint=row.key_fingerprint,
        key_type=row.key_type,
        public_key_preview=row.public_key_preview,
        read_only=row.read_only,
        created_at=row.created_at,
    )


def evaluate_git_operation_access(
    *,
    operation: str,
    repository_private: bool,
    repo_role: str | None,
    auth_method: str,
    pat_scopes: list[str] | None = None,
    has_ssh_key: bool = False,
) -> tuple[bool, str]:
    op = operation.strip().lower()
    method = auth_method.strip().lower()
    role = (repo_role or "").strip().lower()
    scopes = {s.strip().lower() for s in (pat_scopes or []) if s and s.strip()}

    if op not in {"clone", "push"}:
        return False, "unsupported_operation"
    if method not in {"anonymous", "pat", "ssh"}:
        return False, "unsupported_auth_method"

    can_read = role in {"read", "write", "admin"}
    can_write = role in {"write", "admin"}

    if op == "clone" and not repository_private and method == "anonymous":
        return True, "ok_public_anonymous_clone"

    if repository_private and not can_read:
        return False, "insufficient_repo_role_for_private_read"
    if op == "push" and not can_write:
        return False, "insufficient_repo_role_for_push"

    if method == "ssh":
        if not has_ssh_key:
            return False, "ssh_key_missing"
        return True, "ok"

    if method == "pat":
        if repository_private:
            if not ({"repo", "repo:read", "repo:write", "repo:admin"} & scopes):
                return False, "pat_scope_missing_for_private_repo"
        if op == "push" and not ({"repo", "repo:write", "repo:admin"} & scopes):
            return False, "pat_scope_missing_for_push"
        return True, "ok"

    # anonymous + private, or anonymous push
    return False, "authentication_required"


async def list_git_tokens(session: AsyncSession, *, user: User) -> list[GitTokenRead]:
    rows = await session.execute(
        select(UserGitToken)
        .where(UserGitToken.user_id == user.id)
        .order_by(UserGitToken.created_at.desc())
    )
    return [_token_read(r) for r in rows.scalars().all()]


async def create_git_token(
    session: AsyncSession,
    *,
    user: User,
    name: str,
    scopes: list[str],
    expires_at: datetime | None,
) -> GitTokenCreateRead:
    # Serialize token creation per user to avoid race conditions on limit checks.
    await session.execute(select(User.id).where(User.id == user.id).with_for_update())
    active_tokens_count = await session.scalar(
        select(func.count())
        .select_from(UserGitToken)
        .where(
            UserGitToken.user_id == user.id,
            UserGitToken.is_active.is_(True),
        )
    )
    if int(active_tokens_count or 0) >= MAX_ACTIVE_GIT_TOKENS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ACTIVE_GIT_TOKENS_LIMIT_ERROR,
        )

    username = await ensure_gitea_user(
        resolve_gitea_username(user),
        email=user.email,
    )
    gitea_name = f"mtuci-{name.strip()[:80]}"
    raw = await create_gitea_user_access_token(username, name=gitea_name)
    gitea_tokens = await list_gitea_user_access_tokens(username)
    matched = next((t for t in gitea_tokens if str(t.get("name") or "") == gitea_name), None)
    row = UserGitToken(
        user_id=user.id,
        name=name.strip(),
        scopes_csv=",".join(dict.fromkeys(s.strip() for s in scopes if s.strip())),
        gitea_token_id=int(matched.get("id")) if isinstance(matched, dict) and matched.get("id") is not None else None,
        gitea_token_name=gitea_name,
        token_preview=f"{raw[:4]}...{raw[-4:]}" if len(raw) >= 8 else "****",
        expires_at=expires_at,
        is_active=True,
    )
    session.add(row)
    await session.flush()
    base = _token_read(row)
    return GitTokenCreateRead(**base.model_dump(), token=raw)


async def revoke_git_token(session: AsyncSession, *, user: User, token_id: UUID) -> None:
    row = await session.get(UserGitToken, token_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    if row.gitea_token_id is not None:
        username = await ensure_gitea_user(
            resolve_gitea_username(user),
            email=user.email,
        )
        await delete_gitea_user_access_token(username, row.gitea_token_id)
    row.is_active = False
    row.updated_at = datetime.now(timezone.utc)
    await session.delete(row)


async def rotate_git_token(
    session: AsyncSession,
    *,
    user: User,
    token_id: UUID,
    new_name: str | None,
    new_scopes: list[str] | None,
    new_expires_at: datetime | None,
) -> GitTokenCreateRead:
    row = await session.get(UserGitToken, token_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    await revoke_git_token(session, user=user, token_id=token_id)
    return await create_git_token(
        session,
        user=user,
        name=(new_name or row.name),
        scopes=(new_scopes if new_scopes is not None else _split_scopes(row.scopes_csv)),
        expires_at=new_expires_at if new_expires_at is not None else row.expires_at,
    )


async def list_ssh_keys(session: AsyncSession, *, user: User) -> list[UserSshKeyRead]:
    rows = await session.execute(
        select(UserSshKey).where(UserSshKey.user_id == user.id).order_by(UserSshKey.created_at.desc())
    )
    return [_ssh_read(r) for r in rows.scalars().all()]


async def add_ssh_key(
    session: AsyncSession,
    *,
    user: User,
    title: str,
    public_key: str,
    read_only: bool,
) -> UserSshKeyRead:
    username = await ensure_gitea_user(
        resolve_gitea_username(user),
        email=user.email,
    )
    data = await add_gitea_user_ssh_key(
        username=username,
        title=title.strip(),
        public_key=public_key.strip(),
        read_only=read_only,
    )
    row = UserSshKey(
        user_id=user.id,
        title=title.strip(),
        key_fingerprint=str(data.get("fingerprint") or "") or None,
        key_type=str(data.get("key_type") or "") or None,
        public_key_preview=public_key.strip()[:42],
        gitea_key_id=int(data.get("id")) if data.get("id") is not None else None,
        read_only=read_only,
    )
    session.add(row)
    await session.flush()
    return _ssh_read(row)


async def delete_ssh_key(session: AsyncSession, *, user: User, key_id: UUID) -> None:
    row = await session.get(UserSshKey, key_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSH key not found")
    if row.gitea_key_id is not None:
        username = await ensure_gitea_user(
            resolve_gitea_username(user),
            email=user.email,
        )
        await delete_gitea_user_ssh_key(username=username, key_id=row.gitea_key_id)
    await session.delete(row)
