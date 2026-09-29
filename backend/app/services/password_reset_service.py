from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.email_service import send_reset_email


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def request_password_reset(session: AsyncSession, *, email: str) -> None:
    user_result = await session.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        return

    # Remove old active tokens for this user, keep flow deterministic.
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))

    raw_token = secrets.token_urlsafe(48)
    token_row = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        used_at=None,
    )
    session.add(token_row)
    await session.commit()

    # smtplib is blocking; keep it off the event loop.
    await asyncio.to_thread(send_reset_email, user.email, raw_token)


async def reset_password_by_token(session: AsyncSession, *, token: str, new_password: str) -> bool:
    token_hash = _hash_token(token)
    now = datetime.now(timezone.utc)

    token_result = await session.execute(
        select(PasswordResetToken).where(
            and_(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
        )
    )
    token_row = token_result.scalar_one_or_none()
    if not token_row:
        return False

    user_result = await session.execute(select(User).where(User.id == token_row.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return False

    user.password_hash = hash_password(new_password)
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    await session.commit()
    return True
