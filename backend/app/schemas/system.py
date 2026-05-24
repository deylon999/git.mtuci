from __future__ import annotations

import os

from pydantic import BaseModel

from app.services.gitea_service import gitea_public_base_url


class SystemInfoRead(BaseModel):
    version: str
    api_version: str
    commits: int = 0
    gitea_public_url: str = "http://localhost:3000"


def build_system_info_read() -> SystemInfoRead:
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
        gitea_public_url=gitea_public_base_url(),
    )
