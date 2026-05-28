from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.repo_access import RepoAccessRole
from app.models.repository import Repository
from app.models.user import User
from app.schemas.issue import (
    IssueCommentCreate,
    IssueCommentResponse,
    IssueCommentUpdate,
    IssueCreate,
    IssueLabelCreate,
    IssueLabelResponse,
    IssueLabelUpdate,
    IssueListResponse,
    IssueMilestoneCreate,
    IssueMilestoneResponse,
    IssueMilestoneUpdate,
    IssueReactionCreate,
    IssueReactionResponse,
    IssueResponse,
    IssueTimelineEventResponse,
    IssueUpdate,
)
from app.services.issue_service import IssueService
from app.services.repo_access_service import ensure_min_repo_role
from app.services.repository_access_service import ensure_repository_accessible

router = APIRouter()


async def _repo_or_404(db: AsyncSession, repository_id: UUID) -> Repository:
    repo = await db.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repo


async def _require_repo_access(
    db: AsyncSession,
    *,
    user: User,
    repository_id: UUID,
    min_role: RepoAccessRole,
) -> None:
    repo = await _repo_or_404(db, repository_id)
    await ensure_repository_accessible(repo, user, db)
    await ensure_min_repo_role(db, user=user, repo=repo, min_role=min_role)


async def _issue_for_comment_or_404(service: IssueService, comment_id: UUID):
    comment = await service.get_comment(comment_id)
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    issue = await service.get_issue(comment.issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


# Labels
@router.post("/repositories/{repository_id}/labels", response_model=IssueLabelResponse, status_code=status.HTTP_201_CREATED)
async def create_label(
    repository_id: UUID,
    data: IssueLabelCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.write)
    service = IssueService(db)
    return await service.create_label(repository_id, data)


@router.get("/repositories/{repository_id}/labels", response_model=list[IssueLabelResponse])
async def get_labels(
    repository_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = IssueService(db)
    return await service.get_labels(repository_id)


@router.get("/labels/{label_id}", response_model=IssueLabelResponse)
async def get_label(
    label_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    label = await service.get_label(label_id)
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    await _require_repo_access(db, user=current_user, repository_id=label.repository_id, min_role=RepoAccessRole.read)
    return label


@router.patch("/labels/{label_id}", response_model=IssueLabelResponse)
async def update_label(
    label_id: UUID,
    data: IssueLabelUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    label = await service.get_label(label_id)
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    await _require_repo_access(db, user=current_user, repository_id=label.repository_id, min_role=RepoAccessRole.write)
    updated = await service.update_label(label_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    return updated


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(
    label_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    label = await service.get_label(label_id)
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    await _require_repo_access(db, user=current_user, repository_id=label.repository_id, min_role=RepoAccessRole.write)
    ok = await service.delete_label(label_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")


# Milestones
@router.post("/repositories/{repository_id}/milestones", response_model=IssueMilestoneResponse, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    repository_id: UUID,
    data: IssueMilestoneCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.write)
    service = IssueService(db)
    return await service.create_milestone(repository_id, data)


@router.get("/repositories/{repository_id}/milestones", response_model=list[IssueMilestoneResponse])
async def get_milestones(
    repository_id: UUID,
    state: str | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = IssueService(db)
    return await service.get_milestones(repository_id, state)


@router.get("/milestones/{milestone_id}", response_model=IssueMilestoneResponse)
async def get_milestone(
    milestone_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    milestone = await service.get_milestone(milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    await _require_repo_access(db, user=current_user, repository_id=milestone.repository_id, min_role=RepoAccessRole.read)
    return milestone


@router.patch("/milestones/{milestone_id}", response_model=IssueMilestoneResponse)
async def update_milestone(
    milestone_id: UUID,
    data: IssueMilestoneUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    milestone = await service.get_milestone(milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    await _require_repo_access(db, user=current_user, repository_id=milestone.repository_id, min_role=RepoAccessRole.write)
    updated = await service.update_milestone(milestone_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    return updated


@router.delete("/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    milestone_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    milestone = await service.get_milestone(milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    await _require_repo_access(db, user=current_user, repository_id=milestone.repository_id, min_role=RepoAccessRole.write)
    ok = await service.delete_milestone(milestone_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")


# Issues
@router.post("/repositories/{repository_id}/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(
    repository_id: UUID,
    data: IssueCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.write)
    service = IssueService(db)
    return await service.create_issue(repository_id, current_user.id, data)


@router.get("/repositories/{repository_id}/issues", response_model=list[IssueListResponse])
async def get_issues(
    repository_id: UUID,
    state: str | None = None,
    author_id: UUID | None = None,
    assignee_id: UUID | None = None,
    milestone_id: UUID | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = IssueService(db)
    return await service.get_issues(
        repository_id,
        state=state,
        author_id=author_id,
        assignee_id=assignee_id,
        milestone_id=milestone_id,
        q=q,
    )


@router.get("/repositories/{repository_id}/issues/{number}", response_model=IssueResponse)
async def get_issue_by_number(
    repository_id: UUID,
    number: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = IssueService(db)
    issue = await service.get_issue_by_number(repository_id, number)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


@router.get("/repositories/{repository_id}/issues/{number}/timeline", response_model=list[IssueTimelineEventResponse])
async def get_issue_timeline(
    repository_id: UUID,
    number: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = IssueService(db)
    issue = await service.get_issue_by_number(repository_id, number)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    repo = await _repo_or_404(db, repository_id)
    data = await service.get_issue_timeline(repo, issue)
    return [IssueTimelineEventResponse.model_validate(row) for row in data]


@router.patch("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue(
    issue_id: UUID,
    data: IssueUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await service.get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    updated = await service.update_issue(issue_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return updated


@router.delete("/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue(
    issue_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await service.get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    ok = await service.delete_issue(issue_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")


# Comments
@router.post("/issues/{issue_id}/comments", response_model=IssueCommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    issue_id: UUID,
    data: IssueCommentCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await service.get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    return await service.create_comment(issue_id, current_user.id, data)


@router.get("/issues/{issue_id}/comments", response_model=list[IssueCommentResponse])
async def get_comments(
    issue_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await service.get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.read)
    return await service.get_comments(issue_id)


@router.patch("/comments/{comment_id}", response_model=IssueCommentResponse)
async def update_comment(
    comment_id: UUID,
    data: IssueCommentUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await _issue_for_comment_or_404(service, comment_id)
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    updated = await service.update_comment(comment_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return updated


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await _issue_for_comment_or_404(service, comment_id)
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    ok = await service.delete_comment(comment_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")


# Reactions
@router.post("/issues/{issue_id}/reactions", response_model=IssueReactionResponse, status_code=status.HTTP_201_CREATED)
async def add_issue_reaction(
    issue_id: UUID,
    data: IssueReactionCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await service.get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    return await service.add_reaction(current_user.id, data, issue_id=issue_id)


@router.post("/comments/{comment_id}/reactions", response_model=IssueReactionResponse, status_code=status.HTTP_201_CREATED)
async def add_comment_reaction(
    comment_id: UUID,
    data: IssueReactionCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await _issue_for_comment_or_404(service, comment_id)
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    return await service.add_reaction(current_user.id, data, comment_id=comment_id)


@router.get("/issues/{issue_id}/reactions", response_model=list[IssueReactionResponse])
async def get_issue_reactions(
    issue_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    issue = await service.get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.read)
    return await service.get_reactions(issue_id=issue_id)


@router.delete("/reactions/{reaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reaction(
    reaction_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = IssueService(db)
    reaction = await service.get_reaction(reaction_id)
    if not reaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reaction not found")

    if reaction.issue_id:
        issue = await service.get_issue(reaction.issue_id)
    elif reaction.comment_id:
        issue = await _issue_for_comment_or_404(service, reaction.comment_id)
    else:
        issue = None
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    await _require_repo_access(db, user=current_user, repository_id=issue.repository_id, min_role=RepoAccessRole.write)
    ok = await service.delete_reaction(reaction_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reaction not found")
