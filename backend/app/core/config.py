import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
load_dotenv(BASE_DIR / ".env")


def _build_database_url() -> str:
    """
    Собирает DATABASE_URL из POSTGRES_* переменных.
    Используем asyncpg для SQLAlchemy async.
    """
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "postgres")
    host = os.getenv("POSTGRES_HOST", "localhost")
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

    # Gitea (REST API)
    GITEA_URL: str = Field(default_factory=lambda: os.getenv("GITEA_URL", "http://gitea:3000"))
    GITEA_TOKEN: str = Field(default_factory=lambda: os.getenv("GITEA_TOKEN", ""))
    GITEA_ADMIN_USERNAME: str = Field(default_factory=lambda: os.getenv("GITEA_ADMIN_USERNAME", "gitea_admin"))
    GITEA_ADMIN_PASSWORD: str = Field(default_factory=lambda: os.getenv("GITEA_ADMIN_PASSWORD", "admin12345"))

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

