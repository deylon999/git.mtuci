"""encrypt stored MTUCI LK passwords

Revision ID: 0029
Revises: 0028
Create Date: 2026-05-27

"""
from __future__ import annotations

from base64 import urlsafe_b64encode
from hashlib import sha256
import os

from alembic import op
from cryptography.fernet import Fernet
import sqlalchemy as sa


revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

PREFIX = "enc:v1:"


def _fernet() -> Fernet:
    secret = (
        os.getenv("MTUCI_CREDENTIALS_SECRET")
        or os.getenv("JWT_SECRET_KEY")
        or "change-me"
    )
    key = urlsafe_b64encode(sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def upgrade() -> None:
    op.alter_column(
        "users",
        "mtuci_password",
        existing_type=sa.String(length=255),
        type_=sa.String(length=1024),
        existing_nullable=True,
    )

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT id, mtuci_password
            FROM users
            WHERE mtuci_password IS NOT NULL
              AND mtuci_password <> ''
              AND mtuci_password NOT LIKE :encrypted_prefix
            """
        ),
        {"encrypted_prefix": f"{PREFIX}%"},
    ).mappings()

    fernet = _fernet()
    for row in rows:
        encrypted = PREFIX + fernet.encrypt(
            str(row["mtuci_password"]).encode("utf-8")
        ).decode("ascii")
        bind.execute(
            sa.text("UPDATE users SET mtuci_password = :password WHERE id = :id"),
            {"password": encrypted, "id": row["id"]},
        )


def downgrade() -> None:
    # Keep encrypted values intact; shrinking back to 255 could truncate tokens.
    pass
