from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Enum as SAEnum

from app.models.base import Base


class UserRole(str, Enum):
    student = "student"
    teacher = "teacher"
    admin = "admin"
    laborant = "laborant"


class AvatarDisplayMode(str, Enum):
    cover = "cover"      # Заполнить круг, обрезать лишнее
    contain = "contain"  # Вписать в круг, возможны полосы
    fill = "fill"        # Растянуть до квадрата
    scale_down = "scale-down"  # Уменьшить если больше, иначе оригинал


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.student,
    )
    # Group and student ID fields
    group_name: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    student_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True, index=True)
    
    # MTUCI LK integration fields (optional, for auto-fill)
    mtuci_login: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    mtuci_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Encrypted in application layer
    
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # Ожидает апрува админа
    allow_assistant_grading: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Разрешить лаборантам проверять работы
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_display_mode: Mapped[AvatarDisplayMode] = mapped_column(
        SAEnum(AvatarDisplayMode, name="avatar_display_mode"),
        nullable=False,
        default=AvatarDisplayMode.cover,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_login: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True)
