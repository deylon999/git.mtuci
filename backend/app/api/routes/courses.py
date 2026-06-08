from datetime import datetime, timezone
import math
import os
import re
from pathlib import Path as FsPath
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import select
from fastapi import Path, Query
from fastapi.responses import FileResponse, PlainTextResponse

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permissions import require_any_permission, require_permission
from app.core.permission_checks import (
    ensure_assignment_read,
    ensure_grade_view,
    ensure_lab_workflow,
    ensure_permission,
    ensure_repo_content_access,
)
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_file import CourseFile
from app.models.course_enrollment import CourseEnrollment
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.assignment_stats import AssignmentStatsRead
from app.schemas.course import CourseEnrollmentRead, CourseRead
from app.schemas.course_roster import (
    CourseStudentRead,
    EnrollByGroupRequest,
    EnrollByGroupResult,
)
from app.schemas.assignment import (
    AssignmentCreateRequest,
    GradeSubmissionRequest,
    MyGradeRead,
    AssignmentRead,
    AssignmentSubmissionStatusRead,
    PlagiarismCompareRead,
    PlagiarismCompareRequest,
    PlagiarismCheckRead,
    SubmissionAttachmentRead,
    GiteaCommitRead,
    GiteaFileContentRead,
    GiteaRepoFileRead,
)
from app.services.assignment_service import (
    create_assignment,
    delete_assignment,
    list_assignments_for_student,
    list_assignments_for_teacher,
)
from app.services.notification_service import notify_grade_posted, notify_submission_created
from app.services.course_service import (
    create_course,
    delete_course_for_actor,
    enroll_student_to_course,
    get_course_for_user,
    list_all_courses,
    list_student_courses,
    list_teacher_courses,
)
from app.services.gitea_service import (
    get_repo_contents,
    get_repo_file_content,
    list_repo_commits,
)
from app.services.plagiarism_service import check_assignment_plagiarism, compare_students_plagiarism
from app.services.assignment_stats_service import get_assignment_stats
from app.services.course_roster_service import (
    enroll_group_to_course,
    list_course_students,
    unenroll_student_from_course,
)
from app.services.grades_export_service import build_course_grades_csv
from app.services.student_repository_service import (
    get_student_repo_name,
    resolve_assignment_repo_owner_and_name,
)

router = APIRouter(tags=["courses"])


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _start_of_utc_day(dt: datetime) -> datetime:
    utc = _as_utc(dt)
    return utc.replace(hour=0, minute=0, second=0, microsecond=0)


def _ensure_date_not_before_today(*, label: str, dt: datetime) -> None:
    today = _start_of_utc_day(datetime.now(timezone.utc))
    if _start_of_utc_day(dt) < today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} cannot be before today",
        )


async def _assignment_gitea_owner_and_repo(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_id: UUID,
) -> tuple[str, str]:
    try:
        return await resolve_assignment_repo_owner_and_name(
            session,
            assignment_id=assignment_id,
            student_id=student_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


def _parse_gitea_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    # Gitea отдаёт ISO 8601 строки с суффиксом Z.
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _max_grade_for_weeks_late(periods: list[dict], weeks_late: int) -> float:
    if weeks_late <= 0:
        return float("inf")
    normalized: list[tuple[int, float]] = []
    for p in periods:
        try:
            weeks = int(p.get("weeks", 0))
            max_grade = float(p.get("max_grade", 0))
        except (TypeError, ValueError):
            continue
        if weeks > 0:
            normalized.append((weeks, max_grade))
    normalized.sort(key=lambda x: x[0])
    for max_weeks, max_grade in normalized:
        if weeks_late <= max_weeks:
            return max_grade
    return 0.0


_MAX_SUBMISSION_FILE_BYTES = 50 * 1024 * 1024
_MAX_SUBMISSION_FILES = 10
_MAX_COURSE_FILE_BYTES = 50 * 1024 * 1024
_MAX_COURSE_FILES = 10
_FILENAME_SAFE_RE = re.compile(r"[^0-9A-Za-zА-Яа-яЁё._ -]+")


def _safe_upload_filename(filename: str | None) -> str:
    raw = (filename or "attachment").strip().replace("\\", "_").replace("/", "_")
    cleaned = _FILENAME_SAFE_RE.sub("_", raw).strip(" ._")
    return cleaned[:160] or "attachment"


def _parse_attachment_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return _as_utc(value)
    if isinstance(value, str) and value.strip():
        try:
            return _as_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _submission_attachments(submission: Submission | None) -> list[SubmissionAttachmentRead]:
    raw_items = submission.attachments if submission and isinstance(submission.attachments, list) else []
    result: list[SubmissionAttachmentRead] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        attachment_id = str(raw.get("id") or "").strip()
        original_filename = str(raw.get("original_filename") or "").strip()
        kind = str(raw.get("kind") or "attachment")
        if kind not in {"report", "attachment"} or not attachment_id or not original_filename:
            continue
        try:
            file_size = int(raw.get("file_size") or 0)
        except (TypeError, ValueError):
            file_size = 0
        result.append(
            SubmissionAttachmentRead(
                id=attachment_id,
                kind=kind,
                original_filename=original_filename,
                content_type=raw.get("content_type") if isinstance(raw.get("content_type"), str) else None,
                file_size=max(0, file_size),
                uploaded_at=_parse_attachment_datetime(raw.get("uploaded_at")),
            )
        )
    return result


def _effective_submission_at(
    *,
    submission: Submission | None,
    last_commit_at: datetime | None,
) -> datetime | None:
    manual_at = submission.submitted_at if submission else None
    if manual_at and last_commit_at:
        return max(_as_utc(manual_at), _as_utc(last_commit_at))
    return manual_at or last_commit_at


def _submission_status_read(
    *,
    student: User,
    assignment: Assignment,
    submission: Submission | None,
    last_commit_at: datetime | None,
) -> AssignmentSubmissionStatusRead:
    submitted_at = _effective_submission_at(submission=submission, last_commit_at=last_commit_at)
    return AssignmentSubmissionStatusRead(
        student_id=student.id,
        student_full_name=student.full_name,
        status="submitted" if submitted_at else "not_submitted",
        last_commit_at=last_commit_at,
        grade=submission.grade if submission else None,
        final_grade=submission.final_grade if submission else None,
        penalty_points=submission.penalty_points if submission else 0.0,
        weeks_late=submission.weeks_late if submission else 0,
        late_max_grade=(
            _max_grade_for_weeks_late(assignment.late_penalty_periods, submission.weeks_late)
            if submission and submission.weeks_late > 0
            else None
        ),
        comment=submission.comment if submission else None,
        answer_text=submission.answer_text if submission else None,
        repository_url=submission.repository_url if submission else None,
        attachments=_submission_attachments(submission),
        submitted_at=submitted_at,
        graded_at=submission.graded_at if submission else None,
    )


def _submission_upload_dir(*, course_id: UUID, assignment_id: UUID, student_id: UUID) -> FsPath:
    return FsPath(settings.UPLOAD_DIR) / "submissions" / str(course_id) / str(assignment_id) / str(student_id)


def _course_upload_dir(*, course_id: UUID) -> FsPath:
    return FsPath(settings.UPLOAD_DIR) / "courses" / str(course_id)


async def _store_submission_upload(
    upload: UploadFile,
    *,
    course_id: UUID,
    assignment_id: UUID,
    student_id: UUID,
    kind: str,
    uploaded_at: datetime,
) -> dict:
    target_dir = _submission_upload_dir(course_id=course_id, assignment_id=assignment_id, student_id=student_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    original_filename = _safe_upload_filename(upload.filename)
    stored_filename = f"{uuid4().hex}_{original_filename}"
    storage_path = target_dir / stored_filename

    size = 0
    try:
        with storage_path.open("wb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_SUBMISSION_FILE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Submission file is too large",
                    )
                out.write(chunk)
    except Exception:
        if storage_path.exists():
            storage_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    return {
        "id": uuid4().hex,
        "kind": kind,
        "original_filename": original_filename,
        "storage_path": str(storage_path),
        "content_type": upload.content_type,
        "file_size": size,
        "uploaded_at": uploaded_at.isoformat(),
    }


async def _store_course_upload(upload: UploadFile, *, course_id: UUID) -> dict:
    target_dir = _course_upload_dir(course_id=course_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    original_filename = _safe_upload_filename(upload.filename)
    stored_filename = f"{uuid4().hex}_{original_filename}"
    storage_path = target_dir / stored_filename

    size = 0
    try:
        with storage_path.open("wb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_COURSE_FILE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Course file is too large",
                    )
                out.write(chunk)
    except Exception:
        if storage_path.exists():
            storage_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    return {
        "original_filename": original_filename,
        "storage_path": str(storage_path),
        "content_type": upload.content_type,
        "file_size": size,
    }


def _find_submission_attachment(submission: Submission, attachment_id: str) -> dict:
    for raw in submission.attachments or []:
        if isinstance(raw, dict) and str(raw.get("id") or "") == attachment_id:
            return raw
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")


def _safe_attachment_path(raw: dict) -> FsPath:
    path = FsPath(str(raw.get("storage_path") or "")).resolve()
    root = FsPath(settings.UPLOAD_DIR).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found") from exc
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return path


def _safe_course_file_path(course_file: CourseFile) -> FsPath:
    path = FsPath(course_file.storage_path).resolve()
    root = FsPath(settings.UPLOAD_DIR).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course file not found") from exc
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course file not found")
    return path


async def _get_course_or_404(session: AsyncSession, *, course_id: UUID) -> Course:
    q = await session.execute(select(Course).where(Course.id == course_id))
    course = q.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


async def _get_assignment_or_404(session: AsyncSession, *, course_id: UUID, assignment_id: UUID) -> Assignment:
    q = await session.execute(
        select(Assignment).where(
            Assignment.course_id == course_id,
            Assignment.id == assignment_id,
        )
    )
    assignment = q.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


async def _ensure_teacher_owns_course(*, course: Course, current_user) -> None:
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Teacher access only for this course")


_STAFF_ROLES = {UserRole.teacher, UserRole.laborant, UserRole.admin}


async def _resolve_teacher_id_for_course_actor(
    *,
    session: AsyncSession,
    current_user,
    course_id: UUID,
) -> UUID:
    if current_user.role == UserRole.teacher:
        return current_user.id
    if current_user.role == UserRole.admin:
        course = await _get_course_or_404(session, course_id=course_id)
        return course.teacher_id
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")


async def _ensure_staff_course_access(
    *,
    session: AsyncSession,
    course,
    current_user,
    course_id: UUID,
) -> None:
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    elif current_user.role == UserRole.laborant:
        try:
            await get_course_for_user(session, user=current_user, course_id=course_id)
        except PermissionError as e:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    elif current_user.role == UserRole.admin:
        return
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _resolve_assignment_repo_target(
    *,
    session: AsyncSession,
    course_id: UUID,
    current_user,
    student_id: UUID | None,
) -> UUID:
    """Resolve target student for assignment repo access; enforces permissions."""
    await ensure_assignment_read(current_user, session)
    if current_user.role in _STAFF_ROLES:
        if not student_id:
            raise HTTPException(status_code=400, detail="student_id is required for teacher")
        await _ensure_student_enrolled(session=session, course_id=course_id, student_id=student_id)
        await ensure_repo_content_access(
            current_user, session, target_student_id=student_id
        )
        return student_id
    if current_user.role == UserRole.student:
        await _ensure_student_enrolled(
            session=session, course_id=course_id, student_id=current_user.id
        )
        await ensure_repo_content_access(
            current_user, session, target_student_id=current_user.id
        )
        return current_user.id
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _ensure_student_enrolled(*, session: AsyncSession, course_id: UUID, student_id: UUID) -> None:
    q = await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == student_id,
        )
    )
    if not q.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Student not enrolled")


async def _get_repo_name_for_requester(
    session: AsyncSession,
    *,
    course_id: UUID,
    assignment_id: UUID,
    current_user,
    student_id: UUID | None,
) -> str:
    if current_user.role == UserRole.teacher:
        if not student_id:
            raise HTTPException(status_code=400, detail="student_id is required for teacher")
        await _ensure_student_enrolled(session=session, course_id=course_id, student_id=student_id)
        target_student_id = student_id
    elif current_user.role == UserRole.student:
        await _ensure_student_enrolled(session=session, course_id=course_id, student_id=current_user.id)
        target_student_id = current_user.id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    try:
        return await get_student_repo_name(
            session,
            assignment_id=assignment_id,
            student_id=target_student_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/courses", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
async def create_course_endpoint(
    title: str = Form(...),
    description: str | None = Form(None),
    grade_max: int = Form(100),
    target_groups: str | None = Form(None),
    teacher_id: UUID | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        await ensure_permission(current_user, session, "assignment_create")

    if current_user.role == UserRole.teacher:
        owner_id = current_user.id
    elif current_user.role == UserRole.admin:
        # Admin can create a course as owner (self) or assign ownership to a teacher/admin.
        if teacher_id is None:
            owner_id = current_user.id
        else:
            result = await session.execute(
                select(User).where(
                    User.id == teacher_id,
                    User.role.in_([UserRole.teacher, UserRole.admin]),
                )
            )
            owner_user = result.scalar_one_or_none()
            if not owner_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Owner user not found",
                )
            owner_id = owner_user.id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access only")

    import json
    import shutil

    normalized_groups: list[str] | None = None
    if target_groups and target_groups.strip():
        try:
            parsed_groups = json.loads(target_groups)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid target_groups JSON") from e
        if not isinstance(parsed_groups, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_groups must be a list")
        normalized_groups = [
            str(group).strip()
            for group in parsed_groups
            if str(group).strip()
        ]

    uploads = [upload for upload in files if upload.filename]
    if len(uploads) > _MAX_COURSE_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload up to {_MAX_COURSE_FILES} course files",
        )

    course_id = uuid4()
    file_infos: list[dict] = []
    try:
        for upload in uploads:
            file_infos.append(await _store_course_upload(upload, course_id=course_id))
        course = await create_course(
            session,
            course_id=course_id,
            teacher_id=owner_id,
            title=title,
            description=description,
            grade_max=grade_max,
            target_groups=normalized_groups,
            files=file_infos,
        )
    except HTTPException:
        if file_infos:
            shutil.rmtree(_course_upload_dir(course_id=course_id), ignore_errors=True)
        raise
    except Exception as e:
        if file_infos:
            shutil.rmtree(_course_upload_dir(course_id=course_id), ignore_errors=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return CourseRead.model_validate(course)


@router.get("/courses", response_model=list[CourseRead])
async def list_courses_endpoint(
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    await ensure_assignment_read(current_user, session)
    if current_user.role == UserRole.teacher:
        courses = await list_teacher_courses(session, teacher_id=current_user.id)
        return [CourseRead.model_validate(c) for c in courses]

    if current_user.role == UserRole.student:
        courses = await list_student_courses(
            session, 
            student_id=current_user.id,
            group_name=current_user.group_name
        )
        return [CourseRead.model_validate(c) for c in courses]

    if current_user.role == UserRole.admin:
        courses = await list_all_courses(session)
        return [CourseRead.model_validate(c) for c in courses]

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.get("/courses/{course_id}", response_model=CourseRead)
async def get_course_endpoint(
    course_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> CourseRead:
    if current_user.role not in {UserRole.teacher, UserRole.laborant, UserRole.student, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    await ensure_assignment_read(current_user, session)
    try:
        course = await get_course_for_user(
            session,
            user=current_user,
            course_id=course_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return CourseRead.model_validate(course)


@router.get("/courses/{course_id}/files/{file_id}")
async def download_course_file_endpoint(
    course_id: UUID,
    file_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> FileResponse:
    await ensure_assignment_read(current_user, session)
    try:
        await get_course_for_user(session, user=current_user, course_id=course_id)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    result = await session.execute(
        select(CourseFile).where(
            CourseFile.id == file_id,
            CourseFile.course_id == course_id,
        )
    )
    course_file = result.scalar_one_or_none()
    if not course_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course file not found")

    path = _safe_course_file_path(course_file)
    return FileResponse(
        path,
        media_type=course_file.content_type or "application/octet-stream",
        filename=course_file.original_filename,
    )


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("assignment_delete")
async def delete_course_endpoint(
    course_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")

    try:
        await delete_course_for_actor(
            session,
            actor=current_user,
            course_id=course_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/courses/{course_id}/enroll/{student_id}",
    response_model=CourseEnrollmentRead,
    status_code=status.HTTP_201_CREATED,
)
@require_permission("group_manage")
async def enroll_student_endpoint(
    course_id: UUID,
    student_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")

    try:
        teacher_id = await _resolve_teacher_id_for_course_actor(
            session=session,
            current_user=current_user,
            course_id=course_id,
        )
        enrollment = await enroll_student_to_course(
            session,
            teacher_id=teacher_id,
            course_id=course_id,
            student_id=student_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return CourseEnrollmentRead.model_validate(enrollment)


@router.get("/courses/{course_id}/students", response_model=list[CourseStudentRead])
@require_permission("group_manage")
async def list_course_students_endpoint(
    course_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> list[CourseStudentRead]:
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    return await list_course_students(session, course_id=course_id)


@router.delete(
    "/courses/{course_id}/enroll/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@require_permission("group_manage")
async def unenroll_student_endpoint(
    course_id: UUID,
    student_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> None:
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    try:
        teacher_id = await _resolve_teacher_id_for_course_actor(
            session=session,
            current_user=current_user,
            course_id=course_id,
        )
        await unenroll_student_from_course(
            session,
            teacher_id=teacher_id,
            course_id=course_id,
            student_id=student_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/courses/{course_id}/enroll-by-group",
    response_model=EnrollByGroupResult,
    status_code=status.HTTP_201_CREATED,
)
@require_permission("group_manage")
async def enroll_by_group_endpoint(
    course_id: UUID,
    payload: EnrollByGroupRequest,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> EnrollByGroupResult:
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    try:
        teacher_id = await _resolve_teacher_id_for_course_actor(
            session=session,
            current_user=current_user,
            course_id=course_id,
        )
        return await enroll_group_to_course(
            session,
            teacher_id=teacher_id,
            course_id=course_id,
            group_name=payload.group_name,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/courses/{course_id}/grades/export",
    response_class=PlainTextResponse,
)
@require_permission("grade_edit")
async def export_course_grades_endpoint(
    course_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> PlainTextResponse:
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    try:
        csv_body = await build_course_grades_csv(session, course_id=course_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return PlainTextResponse(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="grades-{course_id}.csv"'},
    )


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/stats",
    response_model=AssignmentStatsRead,
)
async def assignment_stats_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> AssignmentStatsRead:
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    await ensure_assignment_read(current_user, session)
    await ensure_grade_view(current_user, session)
    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    try:
        return await get_assignment_stats(
            session,
            course_id=course_id,
            assignment_id=assignment_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/courses/{course_id}/assignments",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment_endpoint(
    course_id: UUID,
    title: str = Form(...),
    description: str | None = Form(None),
    start_date: str = Form(...),
    deadline: str = Form(...),
    late_penalty_periods: str = Form(...),  # JSON string
    files: list[UploadFile] = File(default=[]),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    # Check permission inline (decorator breaks UploadFile typing)
    from app.core.permissions import get_user_permissions
    user_perms = await get_user_permissions(current_user, session)
    if "assignment_create" not in user_perms:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: assignment_create required")
    
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")

    import json
    from datetime import datetime
    
    try:
        penalty_periods = json.loads(late_penalty_periods)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid late_penalty_periods JSON")
    
    try:
        start_dt = datetime.fromisoformat(start_date)
        deadline_dt = datetime.fromisoformat(deadline)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format")
    
    _ensure_date_not_before_today(label="Start date", dt=start_dt)
    _ensure_date_not_before_today(label="Deadline", dt=deadline_dt)

    if start_dt > deadline_dt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date cannot be after deadline")

    # Process uploaded files
    file_infos = []
    import os
    import shutil
    from pathlib import Path
    
    UPLOAD_DIR = Path("/app/uploads/assignments")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        if file.filename:
            file_id = str(uuid4())
            ext = Path(file.filename).suffix
            storage_name = f"{file_id}{ext}"
            storage_path = UPLOAD_DIR / storage_name
            
            # Save file
            with open(storage_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            
            file_infos.append({
                "original_filename": file.filename,
                "storage_path": str(storage_path),
                "content_type": file.content_type,
                "file_size": os.path.getsize(storage_path),
            })

    try:
        teacher_id = await _resolve_teacher_id_for_course_actor(
            session=session,
            current_user=current_user,
            course_id=course_id,
        )
        assignment = await create_assignment(
            session,
            teacher_id=teacher_id,
            course_id=course_id,
            title=title,
            description=description,
            start_date=start_dt,
            deadline=deadline_dt,
            late_penalty_periods=penalty_periods,
            files=file_infos if file_infos else None,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return AssignmentRead.model_validate(assignment)


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentRead])
async def list_assignments_endpoint(
    course_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    await ensure_assignment_read(current_user, session)
    if current_user.role == UserRole.teacher:
        try:
            assignments = await list_assignments_for_teacher(
                session,
                teacher_id=current_user.id,
                course_id=course_id,
            )
        except PermissionError as e:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        return [AssignmentRead.model_validate(a) for a in assignments]

    if current_user.role == UserRole.student:
        try:
            assignments = await list_assignments_for_student(
                session,
                student_id=current_user.id,
                course_id=course_id,
                student_group_name=current_user.group_name,
            )
        except PermissionError as e:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        return [AssignmentRead.model_validate(a) for a in assignments]
    if current_user.role == UserRole.admin:
        await _get_course_or_404(session, course_id=course_id)
        result = await session.execute(
            select(Assignment)
            .where(Assignment.course_id == course_id)
            .order_by(Assignment.deadline.asc())
        )
        return [AssignmentRead.model_validate(a) for a in result.scalars().all()]

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.delete(
    "/courses/{course_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@require_permission("assignment_delete")
async def delete_assignment_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")

    try:
        teacher_id = await _resolve_teacher_id_for_course_actor(
            session=session,
            current_user=current_user,
            course_id=course_id,
        )
        await delete_assignment(
            session,
            teacher_id=teacher_id,
            course_id=course_id,
            assignment_id=assignment_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/commits",
    response_model=list[GiteaCommitRead],
)
async def list_commits_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    student_id: UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role in _STAFF_ROLES:
        await _ensure_staff_course_access(
            session=session, course=course, current_user=current_user, course_id=course_id
        )
    await _get_assignment_or_404(session, course_id=course_id, assignment_id=assignment_id)
    target_student_id = await _resolve_assignment_repo_target(
        session=session,
        course_id=course_id,
        current_user=current_user,
        student_id=student_id,
    )

    try:
        owner, repo_name = await _assignment_gitea_owner_and_repo(
            session,
            assignment_id=assignment_id,
            student_id=target_student_id,
        )
        commits_raw: list[dict] = await list_repo_commits(
            owner=owner,
            repo=repo_name,
            limit=100,
            max_pages=20,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    result: list[GiteaCommitRead] = []
    for c in commits_raw:
        commit_info = c.get("commit") or {}
        author_info = commit_info.get("author") or {}

        sha = c.get("sha") or ""
        message = commit_info.get("message") or ""

        author_name = author_info.get("name") or ""
        author_email = author_info.get("email")
        if isinstance(author_email, str) and not author_email.strip():
            author_email = None
        if not author_email:
            author_email = None
        if author_email and isinstance(author_email, str) and "@" not in author_email:
            author_email = None
        author = {"name": author_name, "email": author_email}

        date = _parse_gitea_datetime(author_info.get("date") or c.get("created"))
        if not date:
            continue

        result.append(
            GiteaCommitRead(
                sha=str(sha),
                message=message,
                author=author,
                date=date,
            )
        )

    return result


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/submissions",
    response_model=list[AssignmentSubmissionStatusRead],
)
async def list_submissions_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    await ensure_lab_workflow(current_user, session)
    await ensure_grade_view(current_user, session)

    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)

    assignment = await _get_assignment_or_404(
        session,
        course_id=course_id,
        assignment_id=assignment_id,
    )

    # Список студентов курса
    students_q = await session.execute(
        select(User)
        .join(
            CourseEnrollment,
            CourseEnrollment.student_id == User.id,
        )
        .where(CourseEnrollment.course_id == course_id)
        .order_by(User.full_name.asc())
    )
    students = list(students_q.scalars().all())

    last_commit_at_by_student_id: dict[UUID, datetime | None] = {s.id: None for s in students}
    for student in students:
        try:
            owner, repo_name = await _assignment_gitea_owner_and_repo(
                session,
                assignment_id=assignment_id,
                student_id=student.id,
            )
        except HTTPException:
            continue
        try:
            commits_raw = await list_repo_commits(
                owner=owner,
                repo=repo_name,
                limit=100,
                max_pages=10,
            )
        except RuntimeError:
            continue

        latest: datetime | None = None
        for c in commits_raw:
            commit_info = c.get("commit") or {}
            author_info = commit_info.get("author") or {}
            date = _parse_gitea_datetime(author_info.get("date") or c.get("created"))
            if not date:
                continue
            if latest is None or date > latest:
                latest = date
        last_commit_at_by_student_id[student.id] = latest

    submissions_q = await session.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id.in_([s.id for s in students]),
        )
    )
    submissions = list(submissions_q.scalars().all())
    submission_by_student_id = {sub.student_id: sub for sub in submissions}

    return [
        _submission_status_read(
            student=s,
            assignment=assignment,
            submission=submission_by_student_id.get(s.id),
            last_commit_at=last_commit_at_by_student_id[s.id],
        )
        for s in students
    ]


@router.post(
    "/courses/{course_id}/assignments/{assignment_id}/submit",
    response_model=MyGradeRead,
)
async def submit_assignment_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    answer_text: str | None = Form(default=None),
    repository_url: str | None = Form(default=None),
    report_file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> MyGradeRead:
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access only")
    await ensure_assignment_read(current_user, session)
    await _ensure_student_enrolled(session=session, course_id=course_id, student_id=current_user.id)
    course = await _get_course_or_404(session, course_id=course_id)
    assignment = await _get_assignment_or_404(
        session,
        course_id=course_id,
        assignment_id=assignment_id,
    )

    cleaned_answer = (answer_text or "").strip() or None
    cleaned_repo_url = (repository_url or "").strip() or None
    uploads: list[tuple[UploadFile, str]] = []
    if report_file and report_file.filename:
        uploads.append((report_file, "report"))
    for upload in files or []:
        if upload and upload.filename:
            uploads.append((upload, "attachment"))

    if len(uploads) > _MAX_SUBMISSION_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many files. Maximum is {_MAX_SUBMISSION_FILES}.",
        )
    if not cleaned_answer and not cleaned_repo_url and not uploads:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add an answer, repository link, report, or attachment.",
        )

    sub_q = await session.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == current_user.id,
        )
    )
    submission = sub_q.scalar_one_or_none()
    if not submission:
        submission = Submission(assignment_id=assignment_id, student_id=current_user.id)
        session.add(submission)
        await session.flush()

    now = datetime.now(timezone.utc)
    existing_attachments = list(submission.attachments or [])
    if len(existing_attachments) + len(uploads) > _MAX_SUBMISSION_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many stored files. Maximum is {_MAX_SUBMISSION_FILES}.",
        )

    new_attachments = [
        await _store_submission_upload(
            upload,
            course_id=course_id,
            assignment_id=assignment_id,
            student_id=current_user.id,
            kind=kind,
            uploaded_at=now,
        )
        for upload, kind in uploads
    ]

    submission.answer_text = cleaned_answer
    submission.repository_url = cleaned_repo_url
    submission.attachments = existing_attachments + new_attachments
    submission.submitted_at = now
    session.add(submission)
    await session.flush()

    await notify_submission_created(
        session,
        student=current_user,
        assignment=assignment,
        course=course,
        submission=submission,
    )
    await session.commit()
    await session.refresh(submission)

    return MyGradeRead(
        grade=submission.grade,
        final_grade=submission.final_grade,
        penalty_points=submission.penalty_points,
        weeks_late=submission.weeks_late,
        late_max_grade=_max_grade_for_weeks_late(assignment.late_penalty_periods, submission.weeks_late)
        if submission.weeks_late > 0
        else None,
        comment=submission.comment,
        answer_text=submission.answer_text,
        repository_url=submission.repository_url,
        attachments=_submission_attachments(submission),
        submitted_at=submission.submitted_at,
        graded_at=submission.graded_at,
        grade_max=course.grade_max,
    )


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/submissions/{student_id}/attachments/{attachment_id}",
)
async def download_submission_attachment_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    student_id: UUID,
    attachment_id: str,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> FileResponse:
    await ensure_assignment_read(current_user, session)
    course = await _get_course_or_404(session, course_id=course_id)
    await _get_assignment_or_404(session, course_id=course_id, assignment_id=assignment_id)

    if current_user.role == UserRole.student:
        if student_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await _ensure_student_enrolled(session=session, course_id=course_id, student_id=current_user.id)
    elif current_user.role in _STAFF_ROLES:
        await _ensure_staff_course_access(
            session=session,
            course=course,
            current_user=current_user,
            course_id=course_id,
        )
        await ensure_grade_view(current_user, session)
        await _ensure_student_enrolled(session=session, course_id=course_id, student_id=student_id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    sub_q = await session.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == student_id,
        )
    )
    submission = sub_q.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    raw = _find_submission_attachment(submission, attachment_id)
    path = _safe_attachment_path(raw)
    return FileResponse(
        path,
        filename=str(raw.get("original_filename") or path.name),
        media_type=raw.get("content_type") if isinstance(raw.get("content_type"), str) else None,
    )


@router.post(
    "/courses/{course_id}/assignments/{assignment_id}/submissions/{student_id}/grade",
    response_model=AssignmentSubmissionStatusRead,
)
@require_any_permission("grade_edit", "lab_accept")
async def grade_submission_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    student_id: UUID,
    payload: GradeSubmissionRequest,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    await ensure_lab_workflow(current_user, session)

    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    assignment = await _get_assignment_or_404(
        session,
        course_id=course_id,
        assignment_id=assignment_id,
    )
    if payload.grade < 0 or payload.grade > course.grade_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Grade must be between 0 and {course.grade_max}",
        )
    await _ensure_student_enrolled(session=session, course_id=course_id, student_id=student_id)

    student_q = await session.execute(select(User).where(User.id == student_id))
    student = student_q.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    last_commit_at: datetime | None = None
    try:
        owner, repo_name = await _assignment_gitea_owner_and_repo(
            session,
            assignment_id=assignment_id,
            student_id=student_id,
        )
        commits_raw: list[dict] = await list_repo_commits(
            owner=owner,
            repo=repo_name,
            limit=100,
            max_pages=20,
        )
        for c in commits_raw:
            commit_info = c.get("commit") or {}
            author_info = commit_info.get("author") or {}
            date = _parse_gitea_datetime(author_info.get("date") or c.get("created"))
            if not date:
                continue
            if not last_commit_at or date > last_commit_at:
                last_commit_at = date
    except RuntimeError:
        # Оценка должна работать даже если Gitea временно недоступна.
        last_commit_at = None

    sub_q = await session.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == student_id,
        )
    )
    submission = sub_q.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not submission:
        submission = Submission(
            assignment_id=assignment_id,
            student_id=student_id,
        )
        session.add(submission)

    submitted_at_for_grade = _effective_submission_at(
        submission=submission,
        last_commit_at=last_commit_at,
    )
    weeks_late = 0
    if submitted_at_for_grade and submitted_at_for_grade > assignment.deadline:
        days_late = (submitted_at_for_grade - assignment.deadline).days
        weeks_late = max(0, math.ceil(days_late / 7))
    cap_max_grade = _max_grade_for_weeks_late(assignment.late_penalty_periods, weeks_late)
    final_grade = float(payload.grade) if cap_max_grade == float("inf") else min(float(payload.grade), cap_max_grade)
    penalty_points = max(0.0, float(payload.grade) - final_grade)

    submission.grade = payload.grade
    submission.final_grade = final_grade
    submission.penalty_points = penalty_points
    submission.weeks_late = weeks_late
    submission.comment = payload.comment
    submission.graded_at = now
    if submitted_at_for_grade and not submission.submitted_at:
        submission.submitted_at = submitted_at_for_grade

    await session.flush()
    await notify_grade_posted(
        session,
        student=student,
        assignment=assignment,
        course_title=course.title,
        submission=submission,
    )
    await session.commit()
    await session.refresh(submission)

    return _submission_status_read(
        student=student,
        assignment=assignment,
        submission=submission,
        last_commit_at=last_commit_at,
    )


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/my-grade",
    response_model=MyGradeRead,
)
async def get_my_grade_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access only")
    await ensure_assignment_read(current_user, session)

    course = await _get_course_or_404(session, course_id=course_id)
    await _ensure_student_enrolled(session=session, course_id=course_id, student_id=current_user.id)
    assignment = await _get_assignment_or_404(
        session,
        course_id=course_id,
        assignment_id=assignment_id,
    )

    sub_q = await session.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == current_user.id,
        )
    )
    submission = sub_q.scalar_one_or_none()
    if not submission:
        return MyGradeRead(
            grade=None,
            final_grade=None,
            penalty_points=0.0,
            weeks_late=0,
            late_max_grade=None,
            comment=None,
            answer_text=None,
            repository_url=None,
            attachments=[],
            submitted_at=None,
            graded_at=None,
            grade_max=course.grade_max,
        )

    return MyGradeRead(
        grade=submission.grade,
        final_grade=submission.final_grade,
        penalty_points=submission.penalty_points,
        weeks_late=submission.weeks_late,
        late_max_grade=_max_grade_for_weeks_late(assignment.late_penalty_periods, submission.weeks_late)
        if submission.weeks_late > 0
        else None,
        comment=submission.comment,
        answer_text=submission.answer_text,
        repository_url=submission.repository_url,
        attachments=_submission_attachments(submission),
        submitted_at=submission.submitted_at,
        graded_at=submission.graded_at,
        grade_max=course.grade_max,
    )


@router.post(
    "/courses/{course_id}/assignments/{assignment_id}/compare",
    response_model=PlagiarismCompareRead,
)
async def compare_students_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    payload: PlagiarismCompareRequest,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    await ensure_assignment_read(current_user, session)
    await ensure_permission(current_user, session, "repo_view_students")

    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    await _get_assignment_or_404(
        session,
        course_id=course_id,
        assignment_id=assignment_id,
    )

    try:
        result = await compare_students_plagiarism(
            session,
            course_id=course_id,
            assignment_id=assignment_id,
            student1_id=payload.student1_id,
            student2_id=payload.student2_id,
            source=payload.source,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return PlagiarismCompareRead.model_validate(result)


@router.post(
    "/courses/{course_id}/assignments/{assignment_id}/check-plagiarism",
    response_model=PlagiarismCheckRead,
)
async def check_plagiarism_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    source: str = Query(default="code", pattern="^(code|report|combined)$"),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if current_user.role not in {UserRole.teacher, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access only")
    await ensure_assignment_read(current_user, session)
    await ensure_permission(current_user, session, "repo_view_students")

    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role == UserRole.teacher:
        await _ensure_teacher_owns_course(course=course, current_user=current_user)
    await _get_assignment_or_404(
        session,
        course_id=course_id,
        assignment_id=assignment_id,
    )

    try:
        result = await check_assignment_plagiarism(
            session,
            course_id=course_id,
            assignment_id=assignment_id,
            source=source,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return PlagiarismCheckRead.model_validate(result)


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/files",
    response_model=list[GiteaRepoFileRead],
)
async def list_files_root_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    student_id: UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role in _STAFF_ROLES:
        await _ensure_staff_course_access(
            session=session, course=course, current_user=current_user, course_id=course_id
        )
    await _get_assignment_or_404(session, course_id=course_id, assignment_id=assignment_id)
    target_student_id = await _resolve_assignment_repo_target(
        session=session,
        course_id=course_id,
        current_user=current_user,
        student_id=student_id,
    )

    try:
        owner, repo_name = await _assignment_gitea_owner_and_repo(
            session,
            assignment_id=assignment_id,
            student_id=target_student_id,
        )
        contents = await get_repo_contents(owner=owner, repo=repo_name, filepath="")
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    if not isinstance(contents, list):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unexpected Gitea contents response")

    result: list[GiteaRepoFileRead] = []
    for item in contents:
        item_type = item.get("type")
        if item_type not in ("file", "dir"):
            continue
        result.append(
            GiteaRepoFileRead(
                sha=str(item.get("sha") or ""),
                name=str(item.get("name") or ""),
                type=item_type,
                size=item.get("size"),
            )
        )
    return result


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/files/{filepath:path}",
    response_model=GiteaFileContentRead,
)
async def get_file_content_endpoint(
    course_id: UUID,
    assignment_id: UUID,
    filepath: str = Path(..., description="Path inside repository"),
    student_id: UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    if ".." in filepath.split("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filepath")

    course = await _get_course_or_404(session, course_id=course_id)
    if current_user.role in _STAFF_ROLES:
        await _ensure_staff_course_access(
            session=session, course=course, current_user=current_user, course_id=course_id
        )
    await _get_assignment_or_404(session, course_id=course_id, assignment_id=assignment_id)
    target_student_id = await _resolve_assignment_repo_target(
        session=session,
        course_id=course_id,
        current_user=current_user,
        student_id=student_id,
    )

    try:
        owner, repo_name = await _assignment_gitea_owner_and_repo(
            session,
            assignment_id=assignment_id,
            student_id=target_student_id,
        )
        content = await get_repo_file_content(
            owner=owner,
            repo=repo_name,
            filepath=filepath,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return GiteaFileContentRead(filepath=filepath, content=content)

