from __future__ import annotations

from datetime import datetime, timezone
import re
from uuid import UUID

from sqlalchemy import and_, or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.issue import (
    Issue,
    IssueCrossReference,
    IssueLabel,
    IssueMilestone,
    IssueComment,
    IssueReaction,
    issue_labels_association,
    issue_assignees_association,
)
from app.models.user import User
from app.models.repository import Repository
from app.schemas.issue import (
    IssueCreate,
    IssueUpdate,
    IssueLabelCreate,
    IssueLabelUpdate,
    IssueMilestoneCreate,
    IssueMilestoneUpdate,
    IssueCommentCreate,
    IssueCommentUpdate,
    IssueReactionCreate,
)
from app.services.gitea_service import commit_exists, get_pull_request
from app.utils.gitea_user import resolve_gitea_username


_ISSUE_REF_RE = re.compile(r"(?:(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+))?#(?P<number>\d+)")
_COMMIT_REF_RE = re.compile(r"\b([0-9a-f]{7,40})\b", re.IGNORECASE)


class IssueService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Labels
    async def create_label(self, repository_id: UUID, data: IssueLabelCreate) -> IssueLabel:
        label = IssueLabel(
            repository_id=repository_id,
            name=data.name,
            color=data.color,
            description=data.description,
        )
        self.db.add(label)
        await self.db.commit()
        await self.db.refresh(label)
        return label

    async def get_labels(self, repository_id: UUID) -> list[IssueLabel]:
        result = await self.db.execute(
            select(IssueLabel).where(IssueLabel.repository_id == repository_id).order_by(IssueLabel.name)
        )
        return list(result.scalars().all())

    async def get_label(self, label_id: UUID) -> IssueLabel | None:
        result = await self.db.execute(select(IssueLabel).where(IssueLabel.id == label_id))
        return result.scalar_one_or_none()

    async def update_label(self, label_id: UUID, data: IssueLabelUpdate) -> IssueLabel | None:
        label = await self.get_label(label_id)
        if not label:
            return None

        if data.name is not None:
            label.name = data.name
        if data.color is not None:
            label.color = data.color
        if data.description is not None:
            label.description = data.description

        label.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(label)
        return label

    async def delete_label(self, label_id: UUID) -> bool:
        label = await self.get_label(label_id)
        if not label:
            return False
        await self.db.delete(label)
        await self.db.commit()
        return True

    # Milestones
    async def create_milestone(self, repository_id: UUID, data: IssueMilestoneCreate) -> IssueMilestone:
        milestone = IssueMilestone(
            repository_id=repository_id,
            title=data.title,
            description=data.description,
            state=data.state,
            due_date=data.due_date,
        )
        self.db.add(milestone)
        await self.db.commit()
        await self.db.refresh(milestone)
        return milestone

    async def get_milestones(self, repository_id: UUID, state: str | None = None) -> list[IssueMilestone]:
        query = select(IssueMilestone).where(IssueMilestone.repository_id == repository_id)
        if state:
            query = query.where(IssueMilestone.state == state)
        query = query.order_by(IssueMilestone.due_date.asc().nullslast(), IssueMilestone.title)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_milestone(self, milestone_id: UUID) -> IssueMilestone | None:
        result = await self.db.execute(select(IssueMilestone).where(IssueMilestone.id == milestone_id))
        return result.scalar_one_or_none()

    async def update_milestone(self, milestone_id: UUID, data: IssueMilestoneUpdate) -> IssueMilestone | None:
        milestone = await self.get_milestone(milestone_id)
        if not milestone:
            return None

        if data.title is not None:
            milestone.title = data.title
        if data.description is not None:
            milestone.description = data.description
        if data.state is not None:
            milestone.state = data.state
            if data.state == "closed" and not milestone.closed_at:
                milestone.closed_at = datetime.now(timezone.utc)
            elif data.state == "open":
                milestone.closed_at = None
        if data.due_date is not None:
            milestone.due_date = data.due_date

        milestone.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(milestone)
        return milestone

    async def delete_milestone(self, milestone_id: UUID) -> bool:
        milestone = await self.get_milestone(milestone_id)
        if not milestone:
            return False
        await self.db.delete(milestone)
        await self.db.commit()
        return True

    # Issues
    async def _get_next_issue_number(self, repository_id: UUID) -> int:
        result = await self.db.execute(
            select(func.max(Issue.number)).where(Issue.repository_id == repository_id)
        )
        max_number = result.scalar()
        return (max_number or 0) + 1

    async def create_issue(self, repository_id: UUID, author_id: UUID, data: IssueCreate) -> Issue:
        number = await self._get_next_issue_number(repository_id)

        issue = Issue(
            repository_id=repository_id,
            number=number,
            title=data.title,
            body=data.body,
            author_id=author_id,
            milestone_id=data.milestone_id,
        )
        self.db.add(issue)
        await self.db.flush()

        # Add labels
        if data.label_ids:
            for label_id in data.label_ids:
                await self.db.execute(
                    issue_labels_association.insert().values(issue_id=issue.id, label_id=label_id)
                )

        # Add assignees
        if data.assignee_ids:
            for assignee_id in data.assignee_ids:
                await self.db.execute(
                    issue_assignees_association.insert().values(issue_id=issue.id, user_id=assignee_id)
                )

        await self.db.commit()
        await self.db.refresh(issue)
        await self._sync_issue_cross_references(issue)
        await self.db.commit()
        return issue

    async def get_issues(
        self,
        repository_id: UUID,
        state: str | None = None,
        label_ids: list[UUID] | None = None,
        assignee_id: UUID | None = None,
        milestone_id: UUID | None = None,
        author_id: UUID | None = None,
        q: str | None = None,
    ) -> list[Issue]:
        query = (
            select(Issue)
            .where(Issue.repository_id == repository_id)
            .options(selectinload(Issue.labels), selectinload(Issue.assignees))
        )

        if state:
            query = query.where(Issue.state == state)
        if author_id:
            query = query.where(Issue.author_id == author_id)
        if milestone_id:
            query = query.where(Issue.milestone_id == milestone_id)
        if assignee_id:
            query = query.join(issue_assignees_association).where(
                issue_assignees_association.c.user_id == assignee_id
            )
        if label_ids:
            for label_id in label_ids:
                query = query.join(issue_labels_association).where(
                    issue_labels_association.c.label_id == label_id
                )
        if q:
            pattern = f"%{q.strip()}%"
            query = query.where(
                or_(
                    Issue.title.ilike(pattern),
                    Issue.body.ilike(pattern),
                )
            )

        query = query.order_by(Issue.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_issue(self, issue_id: UUID) -> Issue | None:
        result = await self.db.execute(
            select(Issue)
            .where(Issue.id == issue_id)
            .options(selectinload(Issue.labels), selectinload(Issue.assignees))
        )
        return result.scalar_one_or_none()

    async def get_issue_by_number(self, repository_id: UUID, number: int) -> Issue | None:
        result = await self.db.execute(
            select(Issue)
            .where(Issue.repository_id == repository_id, Issue.number == number)
            .options(selectinload(Issue.labels), selectinload(Issue.assignees))
        )
        return result.scalar_one_or_none()

    async def update_issue(self, issue_id: UUID, data: IssueUpdate) -> Issue | None:
        issue = await self.get_issue(issue_id)
        if not issue:
            return None

        if data.title is not None:
            issue.title = data.title
        if data.body is not None:
            issue.body = data.body
        if data.state is not None:
            issue.state = data.state
            if data.state == "closed" and not issue.closed_at:
                issue.closed_at = datetime.now(timezone.utc)
            elif data.state == "open":
                issue.closed_at = None
        if data.milestone_id is not None:
            issue.milestone_id = data.milestone_id
        if data.locked is not None:
            issue.locked = data.locked

        # Update labels
        if data.label_ids is not None:
            await self.db.execute(
                issue_labels_association.delete().where(issue_labels_association.c.issue_id == issue_id)
            )
            for label_id in data.label_ids:
                await self.db.execute(
                    issue_labels_association.insert().values(issue_id=issue_id, label_id=label_id)
                )

        # Update assignees
        if data.assignee_ids is not None:
            await self.db.execute(
                issue_assignees_association.delete().where(issue_assignees_association.c.issue_id == issue_id)
            )
            for assignee_id in data.assignee_ids:
                await self.db.execute(
                    issue_assignees_association.insert().values(issue_id=issue_id, user_id=assignee_id)
                )

        issue.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(issue)
        await self._sync_issue_cross_references(issue)
        await self.db.commit()
        return issue

    async def delete_issue(self, issue_id: UUID) -> bool:
        issue = await self.get_issue(issue_id)
        if not issue:
            return False
        await self.db.delete(issue)
        await self.db.commit()
        return True

    # Comments
    async def create_comment(self, issue_id: UUID, author_id: UUID, data: IssueCommentCreate) -> IssueComment:
        comment = IssueComment(
            issue_id=issue_id,
            author_id=author_id,
            body=data.body,
        )
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)
        issue = await self.get_issue(issue_id)
        if issue:
            await self._sync_comment_cross_references(issue, comment)
            await self.db.commit()
        return comment

    async def get_comments(self, issue_id: UUID) -> list[IssueComment]:
        result = await self.db.execute(
            select(IssueComment).where(IssueComment.issue_id == issue_id).order_by(IssueComment.created_at)
        )
        return list(result.scalars().all())

    async def get_comment(self, comment_id: UUID) -> IssueComment | None:
        result = await self.db.execute(select(IssueComment).where(IssueComment.id == comment_id))
        return result.scalar_one_or_none()

    async def update_comment(self, comment_id: UUID, data: IssueCommentUpdate) -> IssueComment | None:
        comment = await self.get_comment(comment_id)
        if not comment:
            return None

        comment.body = data.body
        comment.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(comment)
        issue = await self.get_issue(comment.issue_id)
        if issue:
            await self._sync_comment_cross_references(issue, comment)
            await self.db.commit()
        return comment

    async def delete_comment(self, comment_id: UUID) -> bool:
        comment = await self.get_comment(comment_id)
        if not comment:
            return False
        await self.db.execute(
            IssueCrossReference.__table__.delete().where(IssueCrossReference.source_comment_id == comment_id)
        )
        await self.db.delete(comment)
        await self.db.commit()
        return True

    async def _resolve_cross_references(
        self,
        *,
        repository: Repository,
        text: str | None,
        source_issue_id: UUID,
        source_comment_id: UUID | None,
        created_at: datetime,
    ) -> list[IssueCrossReference]:
        if not text:
            return []
        owner_user = await self.db.get(User, repository.owner_id) if repository.owner_id else None
        owner = resolve_gitea_username(owner_user) if owner_user else "user"
        repo_name = (repository.gitea_repo_name or repository.name or "").strip()
        refs: list[IssueCrossReference] = []
        seen: set[tuple[str, str]] = set()

        for ref_owner, ref_repo, number in self._iter_issue_refs(text):
            if ref_owner and ref_repo and repo_name:
                # For now we only auto-link issues/PRs within the same repository.
                if ref_owner.lower() != owner.lower() or ref_repo.lower() != repo_name.lower():
                    continue
            issue_ref = await self.get_issue_by_number(repository.id, number)
            target_issue_id = issue_ref.id if issue_ref else None
            target_exists = bool(issue_ref)
            target_pr_number: int | None = None
            if not issue_ref and repo_name:
                try:
                    pr = await get_pull_request(owner=owner, repo=repo_name, index=number)
                    if pr:
                        target_exists = True
                        target_pr_number = number
                except Exception:
                    target_exists = False
            ref_type = "pr" if target_pr_number else "issue"
            ref_value = f"#{number}"
            key = (ref_type, ref_value)
            if key in seen:
                continue
            seen.add(key)
            refs.append(
                IssueCrossReference(
                    repository_id=repository.id,
                    source_issue_id=source_issue_id,
                    source_comment_id=source_comment_id,
                    reference_type=ref_type,
                    reference_value=ref_value,
                    target_issue_id=target_issue_id,
                    target_pr_number=target_pr_number,
                    target_exists=target_exists,
                    created_at=created_at,
                )
            )

        for m in _COMMIT_REF_RE.finditer(text):
            sha = m.group(1)
            key = ("commit", sha.lower())
            if key in seen:
                continue
            seen.add(key)
            exists = False
            if repo_name:
                try:
                    exists = await commit_exists(owner=owner, repo=repo_name, sha=sha)
                except Exception:
                    exists = False
            refs.append(
                IssueCrossReference(
                    repository_id=repository.id,
                    source_issue_id=source_issue_id,
                    source_comment_id=source_comment_id,
                    reference_type="commit",
                    reference_value=sha,
                    target_commit_sha=sha if exists else None,
                    target_exists=exists,
                    created_at=created_at,
                )
            )
        return refs

    async def _sync_issue_cross_references(self, issue: Issue) -> None:
        repository = await self.db.get(Repository, issue.repository_id)
        if not repository:
            return
        await self.db.execute(
            IssueCrossReference.__table__.delete().where(
                IssueCrossReference.source_issue_id == issue.id,
                IssueCrossReference.source_comment_id.is_(None),
            )
        )
        refs = await self._resolve_cross_references(
            repository=repository,
            text=issue.body,
            source_issue_id=issue.id,
            source_comment_id=None,
            created_at=issue.updated_at or issue.created_at,
        )
        for row in refs:
            self.db.add(row)

    async def _sync_comment_cross_references(self, issue: Issue, comment: IssueComment) -> None:
        repository = await self.db.get(Repository, issue.repository_id)
        if not repository:
            return
        await self.db.execute(
            IssueCrossReference.__table__.delete().where(
                IssueCrossReference.source_comment_id == comment.id,
            )
        )
        refs = await self._resolve_cross_references(
            repository=repository,
            text=comment.body,
            source_issue_id=issue.id,
            source_comment_id=comment.id,
            created_at=comment.updated_at or comment.created_at,
        )
        for row in refs:
            self.db.add(row)

    # Reactions
    async def add_reaction(
        self, user_id: UUID, data: IssueReactionCreate, issue_id: UUID | None = None, comment_id: UUID | None = None
    ) -> IssueReaction:
        reaction = IssueReaction(
            issue_id=issue_id,
            comment_id=comment_id,
            user_id=user_id,
            reaction=data.reaction,
        )
        self.db.add(reaction)
        await self.db.commit()
        await self.db.refresh(reaction)
        return reaction

    async def get_reactions(self, issue_id: UUID | None = None, comment_id: UUID | None = None) -> list[IssueReaction]:
        query = select(IssueReaction)
        if issue_id:
            query = query.where(IssueReaction.issue_id == issue_id)
        if comment_id:
            query = query.where(IssueReaction.comment_id == comment_id)
        result = await self.db.execute(query.order_by(IssueReaction.created_at))
        return list(result.scalars().all())

    async def delete_reaction(self, reaction_id: UUID) -> bool:
        result = await self.db.execute(select(IssueReaction).where(IssueReaction.id == reaction_id))
        reaction = result.scalar_one_or_none()
        if not reaction:
            return False
        await self.db.delete(reaction)
        await self.db.commit()
        return True

    async def get_reaction(self, reaction_id: UUID) -> IssueReaction | None:
        result = await self.db.execute(select(IssueReaction).where(IssueReaction.id == reaction_id))
        return result.scalar_one_or_none()

    async def get_issue_timeline(self, repository: Repository, issue: Issue) -> list[dict]:
        events: list[dict] = []

        # Base "created" event.
        author_login = None
        if issue.author_id:
            user_res = await self.db.execute(select(User).where(User.id == issue.author_id))
            user = user_res.scalar_one_or_none()
            author_login = resolve_gitea_username(user) if user else None
        events.append(
            {
                "id": f"issue-created-{issue.id}",
                "type": "created",
                "created_at": issue.created_at,
                "author_id": issue.author_id,
                "author_login": author_login,
                "body": issue.body,
                "reference_type": None,
                "reference_value": None,
                "target_exists": None,
                "target_url": None,
            }
        )

        comments = await self.get_comments(issue.id)
        author_ids = {c.author_id for c in comments if c.author_id}
        author_map: dict[UUID, str | None] = {}
        if author_ids:
            users_res = await self.db.execute(select(User).where(User.id.in_(author_ids)))
            for u in users_res.scalars().all():
                author_map[u.id] = resolve_gitea_username(u)

        for comment in comments:
            events.append(
                {
                    "id": f"issue-comment-{comment.id}",
                    "type": "comment",
                    "created_at": comment.created_at,
                    "author_id": comment.author_id,
                    "author_login": author_map.get(comment.author_id) if comment.author_id else None,
                    "body": comment.body,
                    "reference_type": None,
                    "reference_value": None,
                    "target_exists": None,
                    "target_url": None,
                }
            )

        owner_user = await self.db.get(User, repository.owner_id) if repository.owner_id else None
        owner = resolve_gitea_username(owner_user) if owner_user else "user"
        repo_name = (repository.gitea_repo_name or repository.name or "").strip()

        xref_rows_res = await self.db.execute(
            select(IssueCrossReference).where(
                IssueCrossReference.repository_id == repository.id,
                IssueCrossReference.source_issue_id == issue.id,
            )
        )
        outbound_rows = list(xref_rows_res.scalars().all())
        outbound_source_ids = {row.source_issue_id for row in outbound_rows}
        outbound_comment_ids = {row.source_comment_id for row in outbound_rows if row.source_comment_id}
        outbound_author_map: dict[UUID, tuple[UUID | None, str | None]] = {}
        if outbound_source_ids:
            issue_rows = await self.db.execute(select(Issue).where(Issue.id.in_(outbound_source_ids)))
            issue_author_ids = {r.author_id for r in issue_rows.scalars().all() if r.author_id}
            if issue_author_ids:
                user_rows = await self.db.execute(select(User).where(User.id.in_(issue_author_ids)))
                user_map = {u.id: resolve_gitea_username(u) for u in user_rows.scalars().all()}
                for aid in issue_author_ids:
                    outbound_author_map[aid] = (aid, user_map.get(aid))
        if outbound_comment_ids:
            comment_rows = await self.db.execute(select(IssueComment).where(IssueComment.id.in_(outbound_comment_ids)))
            comment_author_ids = {r.author_id for r in comment_rows.scalars().all() if r.author_id}
            if comment_author_ids:
                user_rows = await self.db.execute(select(User).where(User.id.in_(comment_author_ids)))
                user_map = {u.id: resolve_gitea_username(u) for u in user_rows.scalars().all()}
                for aid in comment_author_ids:
                    outbound_author_map[aid] = (aid, user_map.get(aid))

        for row in outbound_rows:
            source_author_id: UUID | None = None
            source_author_login: str | None = None
            if row.source_comment_id:
                src_comment = await self.get_comment(row.source_comment_id)
                if src_comment and src_comment.author_id and src_comment.author_id in outbound_author_map:
                    source_author_id, source_author_login = outbound_author_map[src_comment.author_id]
            else:
                src_issue = await self.get_issue(row.source_issue_id)
                if src_issue and src_issue.author_id and src_issue.author_id in outbound_author_map:
                    source_author_id, source_author_login = outbound_author_map[src_issue.author_id]
            target_url = None
            if row.reference_type == "pr" and row.target_pr_number:
                target_url = f"/repositories/{repository.id}/pulls/{row.target_pr_number}"
            elif row.reference_type == "issue":
                target_number = None
                if row.target_issue_id:
                    target_issue = await self.get_issue(row.target_issue_id)
                    target_number = target_issue.number if target_issue else None
                target_url = f"/repositories/{repository.id}/issues/{target_number}" if target_number else None
            elif row.reference_type == "commit" and row.target_commit_sha:
                target_url = f"/repositories/{repository.id}/commits/{row.target_commit_sha}"
            events.append(
                {
                    "id": f"xref-{row.id}",
                    "type": "cross_reference",
                    "created_at": row.created_at,
                    "author_id": source_author_id,
                    "author_login": source_author_login,
                    "body": None,
                    "reference_type": row.reference_type,
                    "reference_value": row.reference_value,
                    "target_exists": row.target_exists,
                    "target_url": target_url,
                }
            )

        inbound_rows_res = await self.db.execute(
            select(IssueCrossReference).where(
                IssueCrossReference.repository_id == repository.id,
                IssueCrossReference.target_issue_id == issue.id,
                IssueCrossReference.source_issue_id != issue.id,
            )
        )
        inbound_rows = list(inbound_rows_res.scalars().all())

        # Bidirectional backlinks for shared PR/commit references:
        # if this issue references PR/commit, show other issues that reference the same target.
        referenced_prs = {r.target_pr_number for r in outbound_rows if r.reference_type == "pr" and r.target_pr_number}
        referenced_commits = {r.target_commit_sha for r in outbound_rows if r.reference_type == "commit" and r.target_commit_sha}
        if referenced_prs or referenced_commits:
            shared_conds = []
            if referenced_prs:
                shared_conds.append(
                    and_(
                        IssueCrossReference.reference_type == "pr",
                        IssueCrossReference.target_pr_number.in_(list(referenced_prs)),
                    )
                )
            if referenced_commits:
                shared_conds.append(
                    and_(
                        IssueCrossReference.reference_type == "commit",
                        IssueCrossReference.target_commit_sha.in_(list(referenced_commits)),
                    )
                )
            if shared_conds:
                shared_rows_res = await self.db.execute(
                    select(IssueCrossReference).where(
                        IssueCrossReference.repository_id == repository.id,
                        IssueCrossReference.source_issue_id != issue.id,
                        or_(*shared_conds),
                    )
                )
                inbound_rows.extend(shared_rows_res.scalars().all())

        # Deduplicate inbound rows by identity to keep timeline deterministic.
        uniq_inbound: dict[tuple[str, str, str, str], IssueCrossReference] = {}
        for row in inbound_rows:
            key = (
                str(row.source_issue_id),
                str(row.source_comment_id) if row.source_comment_id else "-",
                row.reference_type,
                row.reference_value,
            )
            if key not in uniq_inbound:
                uniq_inbound[key] = row

        for row in uniq_inbound.values():
            source_issue = await self.get_issue(row.source_issue_id)
            source_number = source_issue.number if source_issue else None
            ref_type = "issue_backlink"
            if row.reference_type == "pr":
                ref_type = "pr_backlink"
            elif row.reference_type == "commit":
                ref_type = "commit_backlink"
            events.append(
                {
                    "id": f"xref-back-{row.id}",
                    "type": "cross_reference_backlink",
                    "created_at": row.created_at,
                    "author_id": None,
                    "author_login": None,
                    "body": None,
                    "reference_type": ref_type,
                    "reference_value": f"#{source_number}" if source_number else "#?",
                    "target_exists": bool(source_number),
                    "target_url": f"/repositories/{repository.id}/issues/{source_number}" if source_number else None,
                }
            )

        events.sort(key=lambda e: (e.get("created_at"), e.get("id")))
        return events
    def _iter_issue_refs(self, text: str) -> list[tuple[str | None, str | None, int]]:
        refs: list[tuple[str | None, str | None, int]] = []
        for m in _ISSUE_REF_RE.finditer(text):
            number = int(m.group("number"))
            owner = m.group("owner")
            repo = m.group("repo")
            refs.append((owner, repo, number))
        return refs
