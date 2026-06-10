"""Human-readable Gitea repository names for student assignment repos."""

from __future__ import annotations

import re
from uuid import UUID

# Minimal Cyrillic → Latin for Gitea-safe repo segments (a-z, 0-9, -, _, .)
_CYRILLIC_TO_LATIN: dict[str, str] = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}

_REPO_SEGMENT_RE = re.compile(r"[^a-z0-9._-]+")
_MAX_REPO_NAME_LEN = 100


def _transliterate(text: str) -> str:
    out: list[str] = []
    for ch in text:
        low = ch.lower()
        if low in _CYRILLIC_TO_LATIN:
            out.append(_CYRILLIC_TO_LATIN[low])
        else:
            out.append(ch)
    return "".join(out)


def slugify_repo_segment(text: str, max_len: int = 32) -> str:
    """Latin slug safe for Gitea repo name segments."""
    raw = _transliterate((text or "").strip().lower())
    raw = _REPO_SEGMENT_RE.sub("-", raw)
    raw = re.sub(r"-{2,}", "-", raw).strip("-._")
    if not raw:
        return ""
    return raw[:max_len].strip("-._")


def build_student_assignment_repo_name(
    *,
    course_title: str,
    assignment_title: str,
    assignment_id: UUID,
    student_login: str,
) -> str:
    """
    Globally unique, student-friendly repo name: course-assignment-login-id.
    The assignment id suffix keeps repo names stable and collision-free even
    when teachers reuse the same assignment title across multiple courses or
    recreate assignments with the same name.
    """
    course_part = slugify_repo_segment(course_title, 18) or "course"
    assign_part = slugify_repo_segment(assignment_title, 28) or "assignment"
    student_part = slugify_repo_segment(student_login, 40) or "student"
    short_id = str(assignment_id).replace("-", "")[:6]

    name = f"{course_part}-{assign_part}-{student_part}-{short_id}"
    name = re.sub(r"-{2,}", "-", name).strip("-")
    if len(name) > _MAX_REPO_NAME_LEN:
        name = name[:_MAX_REPO_NAME_LEN].rstrip("-")
    return name or f"hw-{short_id}-{student_part}"


def assignment_repo_display_name(assignment_title: str, *, course_title: str | None = None) -> str:
    """Title shown in the UI (not necessarily equal to Gitea repo slug)."""
    title = (assignment_title or "").strip() or "Задание"
    if course_title and course_title.strip():
        return f"{course_title.strip()} · {title}"
    return title
