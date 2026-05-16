from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.repository import RepositoryType


class RepositoryCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    visibility: Literal["public", "private"] = "public"
    add_readme: bool = False
    gitignore_template: Optional[str] = Field(default=None, max_length=64)
    license_template: Optional[str] = Field(default=None, max_length=64)
    repo_type: RepositoryType | None = None
    language: Optional[str] = None


class RepositoryCreateTemplateOption(BaseModel):
    id: str
    label: str


class RepositoryCreateTemplatesRead(BaseModel):
    gitignores: list[RepositoryCreateTemplateOption]
    licenses: list[RepositoryCreateTemplateOption]


class RepositoryUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    repo_type: Optional[RepositoryType] = None
    language: Optional[str] = None
    is_blocked: Optional[bool] = None


class RepositoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: Optional[str]
    gitea_repo_name: Optional[str]
    clone_url: Optional[str]
    owner_id: Optional[UUID] = None
    owner_full_name: Optional[str] = None
    commits_count: int = 0
    is_public: bool = True
    repo_type: RepositoryType = RepositoryType.public
    language: Optional[str] = None
    is_blocked: bool = False
    faculty_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
