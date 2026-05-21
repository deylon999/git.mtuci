"""
Merge platform courses with disciplines from MTUCI LK (schedule + attendance).
"""
from __future__ import annotations

import hashlib
import re
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.schemas.student_dashboard import StudentMergedCourseRead
from app.services.course_service import list_student_courses
from app.services.mtuci_service import (
    MtuciLkSubject,
    fetch_lk_subjects_cached,
)
from app.services.student_dashboard_service import (
    _load_student_assignment_context,
    _percent_color,
    _weighted_percent,
    _graded_points,
)


def _normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", title.strip().lower())


def _lk_course_id(subject_name: str) -> str:
    digest = hashlib.sha256(_normalize_title(subject_name).encode()).hexdigest()[:12]
    return f"lk-{digest}"


def _match_platform_course(subject_name: str, platform_courses: list[Course]) -> Course | None:
    key = _normalize_title(subject_name)
    if not key:
        return None
    for course in platform_courses:
        ct = _normalize_title(course.title)
        if key == ct or key in ct or ct in key:
            return course
    return None


async def _platform_course_stats(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    platform_courses: list[Course],
) -> dict[UUID, dict]:
    ctx = await _load_student_assignment_context(
        session, student_id=student_id, group_name=group_name
    )
    course_by_id = {c.id: c for c in ctx.courses}
    stats: dict[UUID, dict] = {}

    for course in platform_courses:
        if course.id not in course_by_id:
            stats[course.id] = {
                "assignments_total": 0,
                "assignments_graded": 0,
                "assignments_submitted": 0,
                "earned": 0.0,
                "max_pts": 0.0,
                "percent": None,
                "teacher_name": "—",
            }
            continue

        course_assignments = [a for a in ctx.all_assignments if a.course_id == course.id]
        earned = 0.0
        max_pts = 0.0
        graded = 0
        submitted = 0
        for a in course_assignments:
            sub = ctx.submissions_map.get(a.id)
            if sub and sub.submitted_at:
                submitted += 1
            points = _graded_points(sub)
            if points is not None:
                graded += 1
                gm = course_by_id[course.id].grade_max
                earned += points
                max_pts += float(gm)

        percent = _weighted_percent(earned, max_pts)
        teacher_id = course.teacher_id
        stats[course.id] = {
            "assignments_total": len(course_assignments),
            "assignments_graded": graded,
            "assignments_submitted": submitted,
            "earned": earned,
            "max_pts": max_pts,
            "percent": percent,
            "teacher_name": "—",
        }

    if ctx.courses:
        from sqlalchemy import select
        from app.models.user import User as UserModel

        teacher_ids = list({c.teacher_id for c in ctx.courses})
        t_result = await session.execute(
            select(UserModel.id, UserModel.full_name).where(UserModel.id.in_(teacher_ids))
        )
        teachers = {row[0]: row[1] for row in t_result.all()}
        for course in platform_courses:
            if course.id in stats:
                stats[course.id]["teacher_name"] = teachers.get(course.teacher_id, "—")

    return stats


def _build_merged_row(
    *,
    list_id: str,
    platform_course_id: UUID | None,
    title: str,
    source: str,
    teacher_name: str | None,
    attendance_percent: float | None,
    attendance_skips: int | None,
    assignments_total: int,
    assignments_graded: int,
    assignments_submitted: int,
    earned: float,
    max_pts: float,
    percent: float | None,
    grade_max: int,
    enrolled_count: int,
) -> StudentMergedCourseRead:
    score_display: int | None = None
    score_label: str | None = None
    if percent is not None and max_pts > 0:
        score_display = int(round(percent))
        score_label = f"{int(earned)} / {int(max_pts)} ({percent}%)"
    elif attendance_percent is not None:
        score_display = int(round(attendance_percent))
        score_label = f"{attendance_percent:.0f}%"
        percent = attendance_percent

    return StudentMergedCourseRead(
        id=list_id,
        platform_course_id=platform_course_id,
        title=title,
        source=source,
        teacher_name=teacher_name,
        attendance_percent=attendance_percent,
        attendance_skips=attendance_skips,
        assignments_total=assignments_total,
        assignments_graded=assignments_graded,
        assignments_submitted=assignments_submitted,
        earned_points=earned,
        max_points=max_pts,
        percent=percent,
        score=score_display,
        score_label=score_label,
        grade_max=grade_max,
        score_color=_percent_color(percent) if percent is not None else "muted",
        enrolled_count=enrolled_count,
        has_platform=platform_course_id is not None,
    )


async def get_student_merged_courses(
    session: AsyncSession,
    *,
    user: User,
    force_lk_refresh: bool = False,
    use_lk_cache_only: bool = False,
) -> tuple[list[StudentMergedCourseRead], str | None]:
    """
    Returns merged course cards and optional warning (no LK credentials, LK error).
    """
    platform_courses = await list_student_courses(
        session,
        student_id=user.id,
        group_name=user.group_name,
    )
    platform_stats = await _platform_course_stats(
        session,
        student_id=user.id,
        group_name=user.group_name,
        platform_courses=platform_courses,
    )

    lk_subjects: list[MtuciLkSubject] = []
    lk_warning: str | None = None

    if user.mtuci_login and user.mtuci_password:
        lk_subjects, lk_err = await fetch_lk_subjects_cached(
            user.mtuci_login,
            user.mtuci_password,
            force_refresh=force_lk_refresh,
            cache_only=use_lk_cache_only,
        )
        lk_warning = lk_err if not use_lk_cache_only else (lk_err if lk_subjects else None)
    else:
        lk_warning = "lk_credentials_missing"

    matched_platform_ids: set[UUID] = set()
    merged: list[StudentMergedCourseRead] = []

    for subject in lk_subjects:
        platform = _match_platform_course(subject.name, platform_courses)
        if platform:
            matched_platform_ids.add(platform.id)
            ps = platform_stats.get(platform.id, {})
            att = subject.attendance_percent
            plat_pct = ps.get("percent")
            display_pct = plat_pct if plat_pct is not None else att
            merged.append(
                _build_merged_row(
                    list_id=str(platform.id),
                    platform_course_id=platform.id,
                    title=platform.title,
                    source="merged",
                    teacher_name=ps.get("teacher_name") or (subject.teachers[0] if subject.teachers else None),
                    attendance_percent=att,
                    attendance_skips=subject.skips,
                    assignments_total=ps.get("assignments_total", 0),
                    assignments_graded=ps.get("assignments_graded", 0),
                    assignments_submitted=ps.get("assignments_submitted", 0),
                    earned=ps.get("earned", 0.0),
                    max_pts=ps.get("max_pts", 0.0),
                    percent=display_pct,
                    grade_max=platform.grade_max,
                    enrolled_count=getattr(platform, "enrolled_count", 0) or 0,
                )
            )
        else:
            att = subject.attendance_percent
            merged.append(
                _build_merged_row(
                    list_id=_lk_course_id(subject.name),
                    platform_course_id=None,
                    title=subject.name,
                    source="lk",
                    teacher_name=subject.teachers[0] if subject.teachers else None,
                    attendance_percent=att,
                    attendance_skips=subject.skips,
                    assignments_total=0,
                    assignments_graded=0,
                    assignments_submitted=0,
                    earned=0.0,
                    max_pts=100.0,
                    percent=att,
                    grade_max=100,
                    enrolled_count=0,
                )
            )

    for course in platform_courses:
        if course.id in matched_platform_ids:
            continue
        ps = platform_stats.get(course.id, {})
        merged.append(
            _build_merged_row(
                list_id=str(course.id),
                platform_course_id=course.id,
                title=course.title,
                source="platform",
                teacher_name=ps.get("teacher_name"),
                attendance_percent=None,
                attendance_skips=None,
                assignments_total=ps.get("assignments_total", 0),
                assignments_graded=ps.get("assignments_graded", 0),
                assignments_submitted=ps.get("assignments_submitted", 0),
                earned=ps.get("earned", 0.0),
                max_pts=ps.get("max_pts", 0.0),
                percent=ps.get("percent"),
                grade_max=course.grade_max,
                enrolled_count=getattr(course, "enrolled_count", 0) or 0,
            )
        )

    if not lk_subjects and not lk_warning:
        pass
    elif not lk_subjects and lk_warning and not platform_courses:
        pass

    merged.sort(key=lambda c: c.title.lower())
    return merged, lk_warning
