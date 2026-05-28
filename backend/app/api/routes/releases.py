from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal, get_session
from app.core.security import get_current_user
from app.models.release import ReleaseAsset, ReleasePublishJob, RepositoryRegistryIntegration, RepositoryRelease
from app.models.repo_access import RepoAccessRole
from app.models.repository import Repository
from app.models.user import User
from app.schemas.release import (
    RegistryIntegrationCreate,
    RegistryIntegrationRead,
    ReleaseCreate,
    ReleasePublishJobRead,
    ReleasePublishRequest,
    ReleasePublishResult,
    ReleaseRead,
)
from app.services.gitea_service import list_repo_commits_page
from app.services.repo_access_service import ensure_min_repo_role
from app.services.repository_access_service import ensure_repository_accessible

router = APIRouter(prefix="/repositories/{repository_id}", tags=["releases"])
_release_publish_tasks: dict[str, asyncio.Task] = {}


async def _repo_guard(session: AsyncSession, repository_id: UUID, user: User, role: RepoAccessRole) -> Repository:
    repo = await session.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    await ensure_repository_accessible(repo, user, session)
    await ensure_min_repo_role(session, user=user, repo=repo, min_role=role)
    return repo


def _mask_token(token: str) -> str:
    if len(token) <= 6:
        return "*" * len(token)
    return f"{token[:3]}***{token[-3:]}"


def _is_semver_like(value: str) -> bool:
    import re

    return bool(re.match(r"^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z\.-]+)?$", value))


def _validate_registry_publish(
    *,
    registry_type: str,
    package_name: str,
    version: str,
) -> list[str]:
    import re

    errors: list[str] = []
    if not _is_semver_like(version):
        errors.append("version must be semver-like (e.g. 1.2.3 or v1.2.3)")
    if registry_type == "npm":
        if not re.match(r"^(@[a-z0-9][a-z0-9\-_\.]*/)?[a-z0-9][a-z0-9\-_\.]*$", package_name):
            errors.append("npm package_name is invalid")
    elif registry_type == "pypi":
        if not re.match(r"^[a-z0-9][a-z0-9\-_\.]*$", package_name):
            errors.append("pypi package_name is invalid")
    elif registry_type == "docker":
        if not re.match(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$", package_name):
            errors.append("docker image name is invalid")
    else:
        errors.append("unsupported registry type")
    return errors


async def _run_publish_job(job_id: UUID) -> None:
    async with SessionLocal() as session:
        job = await session.get(ReleasePublishJob, job_id)
        if not job:
            return
        job.state = "running"
        job.started_at = datetime.now(timezone.utc)
        await session.commit()
        cmd = f"{job.command_line} 2>&1"
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            raw, _ = await asyncio.wait_for(proc.communicate(), timeout=600)
            output = (raw or b"").decode("utf-8", errors="replace")
            job.log_text = output[-20000:] if output else ""
            if proc.returncode == 0:
                job.state = "success"
                job.error_text = None
            else:
                job.state = "failed"
                job.error_text = f"publish exited with code {proc.returncode}"
        except Exception as exc:
            job.state = "failed"
            job.error_text = str(exc)
            if not job.log_text:
                job.log_text = str(exc)
        job.finished_at = datetime.now(timezone.utc)
        await session.commit()


def _build_changelog(commits: list[dict]) -> str:
    groups: dict[str, list[str]] = {
        "Features": [],
        "Fixes": [],
        "Docs": [],
        "Chores": [],
        "Other": [],
        "Breaking": [],
    }
    seen: set[str] = set()
    for c in commits[:80]:
        sha = (c.get("sha") or "")[:8]
        msg = ((c.get("commit") or {}).get("message") or "").strip()
        if not msg:
            continue
        first = msg.splitlines()[0].strip()
        lower = first.lower()
        if lower.startswith("merge "):
            continue
        dedupe_key = first.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        line = f"- `{sha}` {first}"
        if "breaking change" in msg.lower() or "!" in first.split(":")[0]:
            groups["Breaking"].append(line)
        if lower.startswith("feat"):
            groups["Features"].append(line)
        elif lower.startswith("fix"):
            groups["Fixes"].append(line)
        elif lower.startswith("docs"):
            groups["Docs"].append(line)
        elif lower.startswith("chore"):
            groups["Chores"].append(line)
        else:
            groups["Other"].append(line)
    lines = ["## Changelog", ""]
    for title in ["Breaking", "Features", "Fixes", "Docs", "Chores", "Other"]:
        rows = groups[title]
        if not rows:
            continue
        lines.append(f"### {title}")
        lines.extend(rows[:20])
        lines.append("")
    if len(lines) <= 2:
        lines.append("- No notable changes")
        lines.append("")
    return "\n".join(lines).strip()


@router.get("/releases", response_model=list[ReleaseRead])
async def list_releases(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ReleaseRead]:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.read)
    rows = (
        await session.execute(
            select(RepositoryRelease).where(RepositoryRelease.repository_id == repository_id).order_by(RepositoryRelease.created_at.desc())
        )
    ).scalars().all()
    out: list[ReleaseRead] = []
    for rel in rows:
        assets = (
            await session.execute(select(ReleaseAsset).where(ReleaseAsset.release_id == rel.id).order_by(ReleaseAsset.uploaded_at.desc()))
        ).scalars().all()
        item = ReleaseRead.model_validate(rel)
        item.assets = [*assets]
        out.append(item)
    return out


@router.post("/releases", response_model=ReleaseRead, status_code=status.HTTP_201_CREATED)
async def create_release(
    repository_id: UUID,
    body: ReleaseCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReleaseRead:
    repo = await _repo_guard(session, repository_id, current_user, RepoAccessRole.write)
    rel_body = body.body
    if body.auto_generate_changelog:
        commits = await list_repo_commits_page(
            owner=str(current_user.id),
            repo=repo.gitea_repo_name or repo.name,
            page=1,
            limit=20,
            sha=body.target_commitish,
        )
        changelog = _build_changelog(commits)
        rel_body = changelog + ("\n\n" + body.body if body.body else "")
    entity = RepositoryRelease(
        repository_id=repository_id,
        tag_name=body.tag_name,
        name=body.name,
        body=rel_body,
        target_commitish=body.target_commitish,
        is_prerelease=body.is_prerelease,
        is_draft=body.is_draft,
        created_by=current_user.id,
    )
    session.add(entity)
    await session.commit()
    await session.refresh(entity)
    item = ReleaseRead.model_validate(entity)
    item.assets = []
    return item


@router.post("/releases/{release_id}/assets", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_release_asset(
    repository_id: UUID,
    release_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.write)
    release = await session.get(RepositoryRelease, release_id)
    if not release or release.repository_id != repository_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")
    base = Path("backend/uploads/releases") / str(repository_id) / str(release_id)
    base.mkdir(parents=True, exist_ok=True)
    target = base / file.filename
    raw = await file.read()
    target.write_bytes(raw)
    asset = ReleaseAsset(
        release_id=release_id,
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(raw),
        storage_path=str(target.as_posix()),
        uploaded_by=current_user.id,
    )
    session.add(asset)
    await session.commit()
    return {"status": "ok", "filename": file.filename, "size_bytes": len(raw)}


@router.get("/registries", response_model=list[RegistryIntegrationRead])
async def list_registries(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[RegistryIntegrationRead]:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.read)
    rows = (
        await session.execute(
            select(RepositoryRegistryIntegration).where(RepositoryRegistryIntegration.repository_id == repository_id)
        )
    ).scalars().all()
    return [RegistryIntegrationRead.model_validate(r) for r in rows]


@router.post("/registries", response_model=RegistryIntegrationRead, status_code=status.HTTP_201_CREATED)
async def create_registry(
    repository_id: UUID,
    body: RegistryIntegrationCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RegistryIntegrationRead:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.admin)
    entity = RepositoryRegistryIntegration(
        repository_id=repository_id,
        registry_type=body.registry_type,
        endpoint=body.endpoint.strip(),
        namespace=body.namespace.strip(),
        token_masked=_mask_token(body.token.strip()),
        token_secret=body.token.strip(),
    )
    session.add(entity)
    await session.commit()
    await session.refresh(entity)
    return RegistryIntegrationRead.model_validate(entity)


@router.post("/releases/{release_id}/publish", response_model=ReleasePublishResult)
async def publish_release(
    repository_id: UUID,
    release_id: UUID,
    body: ReleasePublishRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReleasePublishResult:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.write)
    release = await session.get(RepositoryRelease, release_id)
    if not release or release.repository_id != repository_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")
    reg = await session.get(RepositoryRegistryIntegration, body.registry_integration_id)
    if not reg or reg.repository_id != repository_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registry integration not found")
    version = (body.version or release.tag_name or "").strip()
    if version.startswith("v") and _is_semver_like(version):
        version = version[1:]
    errors = _validate_registry_publish(
        registry_type=reg.registry_type,
        package_name=body.package_name.strip(),
        version=version,
    )
    if reg.registry_type == "npm":
        cmd = f"npm publish --registry {reg.endpoint} --tag {version}"
    elif reg.registry_type == "pypi":
        cmd = f"twine upload --repository-url {reg.endpoint} dist/*"
    else:
        cmd = f"docker push {reg.endpoint.rstrip('/')}/{body.package_name}:{version}"
    if len(errors) == 0 and not body.dry_run:
        job = ReleasePublishJob(
            repository_id=repository_id,
            release_id=release.id,
            registry_integration_id=reg.id,
            requested_by=current_user.id,
            package_name=body.package_name.strip(),
            version=version,
            dry_run=False,
            command_line=cmd,
            state="queued",
            attempt=1,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        task = asyncio.create_task(_run_publish_job(job.id))
        _release_publish_tasks[str(job.id)] = task
        return ReleasePublishResult(
            release_id=release.id,
            registry_integration_id=reg.id,
            registry_type=reg.registry_type,
            package_name=body.package_name.strip(),
            version=version,
            dry_run=body.dry_run,
            ok=True,
            command_preview=cmd,
            errors=[],
            job_id=job.id,
        )
    return ReleasePublishResult(
        release_id=release.id,
        registry_integration_id=reg.id,
        registry_type=reg.registry_type,
        package_name=body.package_name.strip(),
        version=version,
        dry_run=body.dry_run,
        ok=len(errors) == 0,
        command_preview=cmd,
        errors=errors,
        job_id=None,
    )


@router.get("/releases/{release_id}/publish-jobs", response_model=list[ReleasePublishJobRead])
async def list_publish_jobs(
    repository_id: UUID,
    release_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ReleasePublishJobRead]:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.read)
    rows = (
        await session.execute(
            select(ReleasePublishJob)
            .where(
                ReleasePublishJob.repository_id == repository_id,
                ReleasePublishJob.release_id == release_id,
            )
            .order_by(ReleasePublishJob.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    return [ReleasePublishJobRead.model_validate(x) for x in rows]


@router.post("/publish-jobs/{job_id}/retry", response_model=ReleasePublishJobRead)
async def retry_publish_job(
    repository_id: UUID,
    job_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReleasePublishJobRead:
    await _repo_guard(session, repository_id, current_user, RepoAccessRole.write)
    job = await session.get(ReleasePublishJob, job_id)
    if not job or job.repository_id != repository_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Publish job not found")
    if job.state not in {"failed", "success"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job is still running")
    next_job = ReleasePublishJob(
        repository_id=job.repository_id,
        release_id=job.release_id,
        registry_integration_id=job.registry_integration_id,
        requested_by=current_user.id,
        package_name=job.package_name,
        version=job.version,
        dry_run=False,
        command_line=job.command_line,
        state="queued",
        attempt=job.attempt + 1,
    )
    session.add(next_job)
    await session.commit()
    await session.refresh(next_job)
    task = asyncio.create_task(_run_publish_job(next_job.id))
    _release_publish_tasks[str(next_job.id)] = task
    return ReleasePublishJobRead.model_validate(next_job)
