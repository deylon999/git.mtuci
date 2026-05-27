from __future__ import annotations

from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


ENCRYPTED_SECRET_PREFIX = "enc:v1:"


def _fernet() -> Fernet:
    secret = settings.MTUCI_CREDENTIALS_SECRET or settings.JWT_SECRET_KEY
    key = urlsafe_b64encode(sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def is_encrypted_secret(value: str | None) -> bool:
    return bool(value and value.startswith(ENCRYPTED_SECRET_PREFIX))


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    if value == "" or is_encrypted_secret(value):
        return value
    token = _fernet().encrypt(value.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_SECRET_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    if not is_encrypted_secret(value):
        return value
    token = value[len(ENCRYPTED_SECRET_PREFIX) :]
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Stored credential cannot be decrypted") from exc
