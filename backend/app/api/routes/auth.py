from typing import Optional
import asyncio

from fastapi import APIRouter, Depends, HTTPException, status, Request
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.credential_crypto import encrypt_secret
from app.core.database import get_session
from app.core.security import create_access_token, get_current_user, verify_password
from app.models.user import User, UserRole
from app.models.system_log import LogLevel, LogSource
from app.schemas.auth import (
    AuthLoginRequest,
    AuthRegisterRequest,
    StudentRegisterRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserRead
from pydantic import BaseModel
from app.services.password_reset_service import request_password_reset, reset_password_by_token
from app.services.mtuci_service import fetch_student_info, MTUCIAuthError, MTUCIServiceError
from app.services.user_service import get_next_student_id
from app.services.activity_service import log_login
from app.services.logging_service import log_info, log_warning, log_event_background

router = APIRouter(prefix="/auth", tags=["auth"])


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxy headers."""
    # Check X-Forwarded-For header (set by reverse proxy)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
        # Take the first one (original client)
        return forwarded_for.split(",")[0].strip()
    
    # Fallback to direct connection
    return request.client.host if request.client else "unknown"


def _can_switch_student_mode(user: User) -> bool:
    if user.role != UserRole.laborant:
        return False
    prefs = user.preferences if isinstance(user.preferences, dict) else {}
    return bool(prefs.get("can_switch_student_mode") is True)


def _ensure_password_confirmation(password: str, confirm_password: str | None) -> None:
    if confirm_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password confirmation is required",
        )
    if password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    payload: AuthRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    _ensure_password_confirmation(payload.password, payload.confirm_password)
    # Проверяем уникальность email.
    existing = await session.execute(select(User).where(User.email == str(payload.email)))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Хешируем пароль через bcrypt (пароль не храним в открытом виде).
    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Генерируем student_id автоматически
    student_id = await get_next_student_id(session)

    user = User(
        email=str(payload.email),
        password_hash=password_hash,
        full_name=payload.full_name,
        role=UserRole.student,
        group_name=payload.group_name.strip() if payload.group_name and payload.group_name.strip() else None,
        student_id=student_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return UserRead.model_validate(user)


@router.post(
    "/register-student-mtuci",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_student_mtuci(
    payload: StudentRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Student registration with optional MTUCI LK auto-fill.
    If mtuci_login and mtuci_password provided, will auto-fetch name and group.
    """
    # Check email uniqueness
    _ensure_password_confirmation(payload.password, payload.confirm_password)
    existing = await session.execute(select(User).where(User.email == str(payload.email)))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Try to fetch from MTUCI LK if credentials provided
    mtuci_info = None
    if payload.mtuci_login and payload.mtuci_password:
        try:
            mtuci_info = await fetch_student_info(payload.mtuci_login, payload.mtuci_password)
        except MTUCIAuthError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MTUCI LK credentials",
            )
        except MTUCIServiceError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"MTUCI LK service error: {e}",
            )

    # Use MTUCI data or fallback to payload
    full_name = mtuci_info["name"] if mtuci_info else payload.full_name
    group_name = mtuci_info["group"] if mtuci_info else (
        payload.group_name.strip() if payload.group_name and payload.group_name.strip() else None
    )

    if not full_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name is required when not using MTUCI LK auto-fill",
        )

    password_hash = bcrypt.hashpw(
        payload.password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    # Генерируем student_id автоматически
    student_id = await get_next_student_id(session)

    user = User(
        email=str(payload.email),
        password_hash=password_hash,
        full_name=full_name,
        role=UserRole.student,
        group_name=group_name,
        student_id=student_id,
        mtuci_login=payload.mtuci_login if payload.mtuci_login else None,
        mtuci_password=encrypt_secret(payload.mtuci_password) if payload.mtuci_password else None,
        is_pending=False,  # Авто-аппрув через ЛК МТУСИ
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return UserRead.model_validate(user)


@router.post(
    "/register-teacher",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_teacher(
    payload: AuthRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    # Только для разработки и тестирования: без проверки прав.
    existing = await session.execute(select(User).where(User.email == str(payload.email)))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    user = User(
        email=str(payload.email),
        password_hash=password_hash,
        full_name=payload.full_name,
        role=UserRole.teacher,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: AuthLoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    ip_address = get_client_ip(request)
    
    user = await session.execute(select(User).where(User.email == str(payload.email)))
    user_obj = user.scalar_one_or_none()
    if not user_obj:
        # Log failed login attempt in background
        asyncio.create_task(log_event_background(
            level=LogLevel.WARNING,
            source=LogSource.auth,
            message=f"Failed login attempt for email: {payload.email}",
            ip_address=ip_address,
            user_email=str(payload.email),
        ))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )

    is_password_valid = verify_password(payload.password, user_obj.password_hash)
    if not is_password_valid:
        # Log failed login attempt in background
        asyncio.create_task(log_event_background(
            level=LogLevel.WARNING,
            source=LogSource.auth,
            message=f"Failed login attempt for user: {user_obj.email}",
            ip_address=ip_address,
            user_id=user_obj.id,
            user_email=user_obj.email,
            user_full_name=user_obj.full_name,
        ))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )

    if getattr(user_obj, "is_blocked", False):
        # Log blocked user login attempt in background
        asyncio.create_task(log_event_background(
            level=LogLevel.WARNING,
            source=LogSource.auth,
            message=f"Blocked user attempted login: {user_obj.email}",
            ip_address=ip_address,
            user_id=user_obj.id,
            user_email=user_obj.email,
            user_full_name=user_obj.full_name,
        ))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is blocked",
        )

    # Update last login time
    from datetime import datetime, timezone
    user_obj.last_login = datetime.now(timezone.utc)
    await session.commit()

    # Log successful login in background
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.auth,
        message=f"Successful login for user: {user_obj.email}",
        ip_address=ip_address,
        user_id=user_obj.id,
        user_email=user_obj.email,
        user_full_name=user_obj.full_name,
        http_status=200,
    ))

    # Log login activity (activity log)
    await log_login(
        session=session,
        user_id=user_obj.id,
        ip_address=ip_address,
    )

    # JWT будет содержать `sub` = id пользователя (это используется в `/auth/me`)
    # Если remember_me=True, токен живет 30 дней, иначе 1 день
    access_token = create_access_token(
        str(user_obj.id),
        expires_days=30 if payload.remember_me else 1
    )
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserRead)
async def me(current_user=Depends(get_current_user)):
    payload = UserRead.model_validate(current_user)
    return payload.model_copy(update={"can_switch_student_mode": _can_switch_student_mode(current_user)})


class UpdateAssistantGradingRequest(BaseModel):
    allow_assistant_grading: bool


@router.patch("/me/assistant-grading")
async def update_assistant_grading(
    payload: UpdateAssistantGradingRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update allow_assistant_grading setting for current user (teacher only)."""
    if current_user.role != UserRole.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can update this setting"
        )
    
    current_user.allow_assistant_grading = payload.allow_assistant_grading
    await session.commit()
    await session.refresh(current_user)
    
    return {"allow_assistant_grading": current_user.allow_assistant_grading}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    await request_password_reset(session, email=str(payload.email))
    return ForgotPasswordResponse(message="If the email exists, reset instructions were sent.")


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    ok = await reset_password_by_token(
        session,
        token=payload.token,
        new_password=payload.new_password,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

