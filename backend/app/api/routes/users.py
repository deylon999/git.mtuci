import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_current_user,
    get_current_user_allow_pending,
    oauth2_scheme,
    verify_password,
)
from app.core.permissions import require_permission
from app.models.user import UserRole
from app.schemas.auth import TokenResponse
from app.schemas.user import ChangePasswordRequest, StudentUserRead, UpdateAvatarDisplayModeRequest, UserRead
from app.schemas.user_settings import UserSettingsRead, UserSettingsUpdate
from app.services.user_settings_service import (
    apply_user_settings_update,
    read_user_settings,
)
from app.services.user_service import get_user_by_id, get_users_by_role, set_user_password

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/me/avatar", response_model=UserRead)
async def upload_avatar(
    file: UploadFile = File(...),
    avatar_display_mode: str = Form("cover"),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files (JPEG, PNG, GIF, WebP) are allowed",
        )
    
    # Create uploads directory if not exists
    uploads_dir = Path(settings.UPLOAD_DIR) / "avatars"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    file_ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if file_ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        file_ext = ".jpg"
    
    filename = f"{current_user.id}{file_ext}"
    file_path = uploads_dir / filename
    
    # Save file
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # Site-relative: served from the frontend origin (nginx / Vite proxy /uploads/avatars/).
    current_user.avatar_url = f"/uploads/avatars/{filename}"
    
    # Update display mode if valid
    from app.models.user import AvatarDisplayMode
    try:
        current_user.avatar_display_mode = AvatarDisplayMode(avatar_display_mode)
    except ValueError:
        pass  # Keep default if invalid
    
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    
    return UserRead.model_validate(current_user)


@router.patch("/me/avatar-display-mode", response_model=UserRead)
async def update_avatar_display_mode(
    payload: UpdateAvatarDisplayModeRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from app.models.user import AvatarDisplayMode
    current_user.avatar_display_mode = AvatarDisplayMode(payload.avatar_display_mode)
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.get("/me/settings", response_model=UserSettingsRead)
async def get_my_settings(
    current_user=Depends(get_current_user_allow_pending),
) -> UserSettingsRead:
    return read_user_settings(current_user)


@router.patch("/me/settings", response_model=UserSettingsRead)
async def patch_my_settings(
    payload: UserSettingsUpdate,
    current_user=Depends(get_current_user_allow_pending),
    session: AsyncSession = Depends(get_session),
) -> UserSettingsRead:
    try:
        current_user.preferences = apply_user_settings_update(current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return read_user_settings(current_user)


@router.patch("/me/password", response_model=TokenResponse)
async def change_my_password(
    payload: ChangePasswordRequest,
    token: str = Depends(oauth2_scheme),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    if not verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old password is incorrect",
        )
    if payload.old_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from old password",
        )

    # Bumps token_version: every other session is logged out. This one gets a fresh
    # token with the same expiry so the user stays signed in here.
    set_user_password(current_user, payload.new_password)
    session.add(current_user)
    await session.commit()
    expires_at = datetime.fromtimestamp(decode_access_token(token)["exp"], tz=timezone.utc)
    return TokenResponse(
        access_token=create_access_token(
            str(current_user.id),
            extra_claims={"tv": current_user.token_version},
            expires_at=expires_at,
        )
    )


@router.get("/students", response_model=list[StudentUserRead])
@require_permission("user_view")
async def get_students_endpoint(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[StudentUserRead]:
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )

    students = await get_users_by_role(session, UserRole.student)
    return [StudentUserRead.model_validate(student) for student in students]


@router.get("/{user_id}", response_model=UserRead)
@require_permission("user_view")
async def get_user_by_id_endpoint(
    user_id: UUID,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if current_user.role != UserRole.admin and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )

    user = await get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserRead.model_validate(user)

