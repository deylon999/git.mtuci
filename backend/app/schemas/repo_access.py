from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.repo_access import RepoAccessRole, RepoInviteStatus


class RepoAccessUserRead(BaseModel):
    id: UUID
    full_name: str
    email: str
    group_name: str | None = None


class RepoCollaboratorRead(BaseModel):
    user: RepoAccessUserRead
    role: RepoAccessRole
    granted_at: datetime
    is_owner: bool = False


class RepoTeamAccessRead(BaseModel):
    id: UUID
    team_name: str
    role: RepoAccessRole
    member_count: int = 0
    granted_at: datetime


class RepoAccessInviteRead(BaseModel):
    id: UUID
    user: RepoAccessUserRead
    role: RepoAccessRole
    status: RepoInviteStatus
    invited_by: RepoAccessUserRead | None = None
    created_at: datetime
    expires_at: datetime | None = None


class RepoAccessAuditRead(BaseModel):
    id: UUID
    action: str
    target_type: str
    target_label: str | None = None
    old_role: str | None = None
    new_role: str | None = None
    actor: RepoAccessUserRead | None = None
    created_at: datetime


class RepoAccessSummaryRead(BaseModel):
    repository_id: UUID
    can_manage: bool
    my_role: RepoAccessRole | None = None
    owner: RepoAccessUserRead
    collaborators: list[RepoCollaboratorRead]
    teams: list[RepoTeamAccessRead]
    invites: list[RepoAccessInviteRead]


class RepoCollaboratorCreateBody(BaseModel):
    user_id: UUID | None = None
    email: str | None = Field(default=None, max_length=255)
    role: RepoAccessRole = RepoAccessRole.read


class RepoCollaboratorUpdateBody(BaseModel):
    role: RepoAccessRole


class RepoTeamAccessCreateBody(BaseModel):
    team_name: str = Field(min_length=1, max_length=50)
    role: RepoAccessRole = RepoAccessRole.read


class RepoTeamAccessUpdateBody(BaseModel):
    role: RepoAccessRole


class RepoInviteCreateBody(BaseModel):
    user_id: UUID | None = None
    email: str | None = Field(default=None, max_length=255)
    role: RepoAccessRole = RepoAccessRole.read


class RepoInviteRespondBody(BaseModel):
    accept: bool = True


class RepoCollaboratorBulkItem(BaseModel):
    user_id: UUID | None = None
    email: str | None = Field(default=None, max_length=255)
    role: RepoAccessRole


class RepoCollaboratorBulkUpsertBody(BaseModel):
    items: list[RepoCollaboratorBulkItem] = Field(default_factory=list, min_length=1, max_length=100)


class RepoCollaboratorBulkResultItem(BaseModel):
    key: str
    status: str
    detail: str | None = None
    collaborator: RepoCollaboratorRead | None = None


class RepoCollaboratorBulkResult(BaseModel):
    processed: int
    success: int
    failed: int
    results: list[RepoCollaboratorBulkResultItem]


class RepoAccessAuditConsistencyRead(BaseModel):
    repository_id: UUID
    checked_at: datetime
    ok: bool
    issues: list[str] = Field(default_factory=list)
    counters: dict[str, int] = Field(default_factory=dict)
