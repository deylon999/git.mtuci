from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.git_auth import (
    GitTokenCreateBody,
    GitTokenCreateRead,
    GitTokenRead,
    GitTokenRotateBody,
    UserSshKeyCreateBody,
    UserSshKeyRead,
)
from app.services.git_auth_service import (
    add_ssh_key,
    create_git_token,
    delete_ssh_key,
    list_git_tokens,
    list_ssh_keys,
    revoke_git_token,
    rotate_git_token,
)

router = APIRouter(prefix="/users/me/git-auth", tags=["git-auth"])


@router.get("/tokens", response_model=list[GitTokenRead])
async def get_my_git_tokens(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[GitTokenRead]:
    return await list_git_tokens(session, user=current_user)


@router.post("/tokens", response_model=GitTokenCreateRead, status_code=status.HTTP_201_CREATED)
async def post_my_git_token(
    body: GitTokenCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> GitTokenCreateRead:
    result = await create_git_token(
        session,
        user=current_user,
        name=body.name,
        scopes=body.scopes,
        expires_at=body.expires_at,
    )
    await session.commit()
    return result


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_git_token(
    token_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await revoke_git_token(session, user=current_user, token_id=token_id)
    await session.commit()


@router.post("/tokens/{token_id}/rotate", response_model=GitTokenCreateRead)
async def rotate_my_git_token(
    token_id: UUID,
    body: GitTokenRotateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> GitTokenCreateRead:
    result = await rotate_git_token(
        session,
        user=current_user,
        token_id=token_id,
        new_name=body.name,
        new_scopes=body.scopes,
        new_expires_at=body.expires_at,
    )
    await session.commit()
    return result


@router.get("/ssh-keys", response_model=list[UserSshKeyRead])
async def get_my_ssh_keys(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[UserSshKeyRead]:
    return await list_ssh_keys(session, user=current_user)


@router.post("/ssh-keys", response_model=UserSshKeyRead, status_code=status.HTTP_201_CREATED)
async def post_my_ssh_key(
    body: UserSshKeyCreateBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserSshKeyRead:
    result = await add_ssh_key(
        session,
        user=current_user,
        title=body.title,
        public_key=body.public_key,
        read_only=body.read_only,
    )
    await session.commit()
    return result


@router.delete("/ssh-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_ssh_key(
    key_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await delete_ssh_key(session, user=current_user, key_id=key_id)
    await session.commit()
