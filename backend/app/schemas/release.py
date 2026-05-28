from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReleaseCreate(BaseModel):
    tag_name: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    body: str = Field(default="", max_length=50000)
    target_commitish: str = Field(default="main", max_length=120)
    is_prerelease: bool = False
    is_draft: bool = False
    auto_generate_changelog: bool = False


class ReleaseAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    storage_path: str
    uploaded_at: datetime


class ReleaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    tag_name: str
    name: str
    body: str
    target_commitish: str
    is_prerelease: bool
    is_draft: bool
    created_by: UUID
    created_at: datetime
    assets: list[ReleaseAssetRead] = Field(default_factory=list)


class RegistryIntegrationCreate(BaseModel):
    registry_type: str = Field(pattern="^(npm|pypi|docker)$")
    endpoint: str = Field(min_length=3, max_length=255)
    namespace: str = Field(min_length=1, max_length=255)
    token: str = Field(min_length=6, max_length=255)


class RegistryIntegrationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    registry_type: str
    endpoint: str
    namespace: str
    token_masked: str
    created_at: datetime


class ReleasePublishJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    release_id: UUID
    registry_integration_id: UUID
    requested_by: UUID
    package_name: str
    version: str
    dry_run: bool
    command_line: str
    state: str
    attempt: int
    error_text: str | None = None
    log_text: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class ReleasePublishRequest(BaseModel):
    registry_integration_id: UUID
    package_name: str = Field(min_length=1, max_length=255)
    version: str | None = Field(default=None, max_length=120)
    dry_run: bool = True


class ReleasePublishResult(BaseModel):
    release_id: UUID
    registry_integration_id: UUID
    registry_type: str
    package_name: str
    version: str
    dry_run: bool
    ok: bool
    command_preview: str
    errors: list[str] = Field(default_factory=list)
    job_id: UUID | None = None
