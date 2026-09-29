from __future__ import annotations

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User, UserRole


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    """Case-insensitive lookup (new emails are stored lowercased).

    Legacy rows may differ only by case; prefer the exact spelling, then the oldest account.
    """
    result = await session.execute(
        select(User)
        .where(func.lower(User.email) == normalize_email(email))
        .order_by((User.email == email.strip()).desc(), User.created_at)
        .limit(1)
    )
    return result.scalars().first()


def set_user_password(user: User, new_password: str) -> None:
    """Change the password and invalidate every JWT issued before (see User.token_version)."""
    user.password_hash = hash_password(new_password)
    user.token_version = (user.token_version or 0) + 1


async def get_user_by_id(session: AsyncSession, user_id) -> User | None:
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_users_by_role(session: AsyncSession, role: UserRole) -> list[User]:
    result = await session.execute(select(User).where(User.role == role).order_by(User.created_at.desc()))
    return list(result.scalars().all())


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(session, email)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def get_next_student_id(session: AsyncSession) -> str:
    """Next free numeric student ID ('1', '2', ...).

    A DB sequence (migration 0046) gives concurrent registrations distinct values; admins
    can still assign numeric IDs by hand, so values that are already taken are skipped.
    """
    for _ in range(1000):
        candidate = str(await session.scalar(text("SELECT nextval('student_id_seq')")))
        taken = await session.scalar(select(User.id).where(User.student_id == candidate).limit(1))
        if taken is None:
            return candidate
    raise RuntimeError("Could not allocate a free student ID")


async def register_user(session: AsyncSession, *, email: str, password: str, full_name: str, auto_student_id: bool = True) -> User:
    existing = await get_user_by_email(session, email)
    if existing:
        raise ValueError("Email already registered")

    student_id = None
    if auto_student_id:
        student_id = await get_next_student_id(session)

    user = User(
        email=normalize_email(email),
        password_hash=hash_password(password),
        full_name=full_name,
        role=UserRole.student,
        student_id=student_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_all_users(session: AsyncSession) -> list[User]:
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


async def update_user_role_and_block(
    session: AsyncSession,
    *,
    user_id,
    role: UserRole,
    is_blocked: bool,
    is_pending: bool = True,
    group_name: str | None = None,
    student_id: str | None = None,
) -> User:
    user = await get_user_by_id(session, user_id)
    if not user:
        raise ValueError("User not found")

    previous_role = user.role
    user.role = role
    user.is_blocked = is_blocked
    user.is_pending = is_pending
    
    # Compare by value to handle both enum and string inputs
    role_value = role.value if hasattr(role, 'value') else str(role)
    
    if role_value != "student":
        # Clear student_id for non-student roles
        user.student_id = None
    else:
        # Role is student - assign student_id
        if student_id is not None:
            # Use provided ID (from admin panel)
            user.student_id = student_id
        elif not user.student_id:
            # Generate new incremental ID if none exists
            user.student_id = await get_next_student_id(session)
    
    if group_name is not None:
        user.group_name = group_name

    # Preserve dual-role signal when a student is promoted to laborant.
    prefs = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    if role_value == "laborant":
        prev_role_value = previous_role.value if hasattr(previous_role, "value") else str(previous_role)
        if prev_role_value == "student" or prefs.get("can_switch_student_mode") is True:
            prefs["can_switch_student_mode"] = True
    user.preferences = prefs if prefs else None

    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def delete_user_by_id(session: AsyncSession, user_id) -> None:
    user = await get_user_by_id(session, user_id)
    if not user:
        raise ValueError("User not found")

    await session.delete(user)
    await session.commit()


async def reset_user_password(session: AsyncSession, *, user_id, new_password: str) -> None:
    user = await get_user_by_id(session, user_id)
    if not user:
        raise ValueError("User not found")

    set_user_password(user, new_password)
    session.add(user)
    await session.commit()

