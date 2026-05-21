"""Public system metadata for the frontend footer and health displays."""

from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/system", tags=["system"])


class SystemInfoRead(BaseModel):
    version: str
    api_version: str
    commits: int = 0


@router.get("/info", response_model=SystemInfoRead)
async def system_info() -> SystemInfoRead:
    """
    Lightweight build info (no auth). Used by the app footer.
    """
    api_version = os.getenv("API_VERSION", "1.0.0")
    app_version = os.getenv("APP_VERSION", f"v{api_version}")
    commits_raw = os.getenv("GIT_COMMIT_COUNT", "0")
    try:
        commits = max(0, int(commits_raw))
    except ValueError:
        commits = 0
    return SystemInfoRead(
        version=app_version,
        api_version=api_version,
        commits=commits,
    )
