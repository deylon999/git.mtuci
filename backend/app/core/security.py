from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt

from app.core.config import settings
from app.core.database import get_session
from app.models.user import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def require_role(*roles: UserRole):
    """Dependency factory to require specific user roles."""
    async def checker(current_user = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return checker


def require_admin():
    """Dependency to require admin role."""
    return require_role(UserRole.admin)

def hash_password(password: str) -> str:
    # bcrypt работает с байтами, поэтому кодируем пароль и декодируем результат.
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(
        password.encode("utf-8"),
        password_hash.encode("utf-8"),
    )


def create_access_token(
    subject: str,
    *,
    extra_claims: dict[str, Any] | None = None,
    expires_days: int | None = None,
    expires_at: datetime | None = None,
) -> str:
    if expires_at:
        expire = expires_at
    elif expires_days:
        expire = datetime.now(timezone.utc) + timedelta(days=expires_days)
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


async def _user_from_token(token: str, session: AsyncSession):
    from app.services.user_service import get_user_by_id  # import внутри, чтобы снизить циклы

    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = UUID(str(sub))
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    user = await get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    # Tokens without "tv" predate token versioning and count as version 0.
    if int(payload.get("tv") or 0) != (getattr(user, "token_version", None) or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is blocked")
    return user


def _reject_pending_student(user) -> None:
    # Self-registered students wait for admin approval; until then only /auth/me and
    # UI settings stay reachable (the frontend shows its pending screen).
    if user.role == UserRole.student and getattr(user, "is_pending", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is pending approval")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
):
    user = await _user_from_token(token, session)
    _reject_pending_student(user)
    return user


async def get_current_user_allow_pending(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
):
    return await _user_from_token(token, session)


async def get_current_user_from_token(
    token: str,
    session: AsyncSession,
):
    user = await _user_from_token(token, session)
    _reject_pending_student(user)
    return user

