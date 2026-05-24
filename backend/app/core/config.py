import os
import socket
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from dotenv import load_dotenv
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
load_dotenv(BASE_DIR / ".env")

# Docker Compose service names — on the host machine use localhost (port 5432 is published).
_DOCKER_DB_HOSTS = frozenset({"postgres", "db"})


def _resolve_postgres_host(host: str) -> str:
    if host not in _DOCKER_DB_HOSTS:
        return host
    try:
        socket.getaddrinfo(host, None)
        return host
    except socket.gaierror:
        return "localhost"


def _replace_database_url_host(url: str, new_host: str) -> str:
    parsed = urlparse(url)
    if not parsed.hostname or parsed.hostname == new_host:
        return url
    auth = ""
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth += f":{parsed.password}"
        auth += "@"
    port = f":{parsed.port}" if parsed.port else ""
    return urlunparse(parsed._replace(netloc=f"{auth}{new_host}{port}"))


def _build_database_url() -> str:
    """
    Собирает DATABASE_URL из POSTGRES_* переменных.
    Используем asyncpg для SQLAlchemy async.
    """
    explicit = os.getenv("DATABASE_URL", "").strip()
    if explicit:
        parsed = urlparse(explicit)
        if parsed.hostname:
            resolved = _resolve_postgres_host(parsed.hostname)
            explicit = _replace_database_url_host(explicit, resolved)
        return explicit

    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "postgres")
    host = _resolve_postgres_host(os.getenv("POSTGRES_HOST", "localhost"))
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "mtuci")
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}"


class Settings(BaseModel):
    # Database
    DATABASE_URL: str = Field(default_factory=_build_database_url)
    DB_ECHO: bool = Field(default=False)

    # JWT
    JWT_SECRET_KEY: str = Field(default_factory=lambda: os.getenv("JWT_SECRET_KEY", "change-me"))
    JWT_ALGORITHM: str = Field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default_factory=lambda: int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    )

    # Gitea (REST API — internal URL for backend → Gitea in Docker/network)
    GITEA_URL: str = Field(default_factory=lambda: os.getenv("GITEA_URL", "http://gitea:3000"))
    # Public URL shown to students (clone links, open in browser). Defaults to GITEA_URL.
    GITEA_PUBLIC_URL: str = Field(
        default_factory=lambda: os.getenv("GITEA_PUBLIC_URL") or os.getenv("GITEA_URL", "http://localhost:3000")
    )
    GITEA_TOKEN: str = Field(default_factory=lambda: os.getenv("GITEA_TOKEN", ""))
    GITEA_ADMIN_USERNAME: str = Field(default_factory=lambda: os.getenv("GITEA_ADMIN_USERNAME", "gitea_admin"))
    GITEA_ADMIN_PASSWORD: str = Field(default_factory=lambda: os.getenv("GITEA_ADMIN_PASSWORD", "admin12345"))
    GITEA_WEBHOOK_SECRET: str = Field(default_factory=lambda: os.getenv("GITEA_WEBHOOK_SECRET", ""))
    # Base URL Gitea uses to call our webhooks (Docker service name or public API host)
    WEBHOOK_BASE_URL: str = Field(default_factory=lambda: os.getenv("WEBHOOK_BASE_URL", "http://api:8000/webhooks"))

    # Frontend URL for password reset links
    FRONTEND_URL: str = Field(default_factory=lambda: os.getenv("FRONTEND_URL", "http://localhost:3001"))

    # SMTP settings for password recovery emails
    SMTP_HOST: str = Field(default_factory=lambda: os.getenv("SMTP_HOST", ""))
    SMTP_PORT: int = Field(default_factory=lambda: int(os.getenv("SMTP_PORT", "587")))
    SMTP_USER: str = Field(default_factory=lambda: os.getenv("SMTP_USER", ""))
    SMTP_PASS: str = Field(default_factory=lambda: os.getenv("SMTP_PASS", os.getenv("SMTP_PASSWORD", "")))

    # Uploads
    UPLOAD_DIR: str = Field(default_factory=lambda: os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))

settings = Settings()

