from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class AssignmentCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: datetime
    deadline: datetime
    late_penalty_periods: list[dict[str, int]] = Field(default_factory=list)

    @field_validator("late_penalty_periods")
    @classmethod
    def validate_late_penalty_periods(cls, value: list[dict[str, int]]) -> list[dict[str, int]]:
        prev_weeks: int | None = None
        prev_max_grade: int | None = None
        for idx, period in enumerate(value):
            if "weeks" not in period or "max_grade" not in period:
                raise ValueError("Each penalty period must contain 'weeks' and 'max_grade'")
            weeks = int(period["weeks"])
            max_grade = int(period["max_grade"])
            if weeks <= 0:
                raise ValueError("Penalty period weeks must be greater than 0")
            if max_grade < 0:
                raise ValueError("Penalty period max_grade must be greater than or equal to 0")
            if prev_weeks is not None and weeks <= prev_weeks:
                raise ValueError("Penalty periods must be sorted by weeks in ascending order")
            if prev_max_grade is not None and max_grade >= prev_max_grade:
                raise ValueError("Максимальная оценка должна убывать с увеличением срока просрочки")
            prev_weeks = weeks
            prev_max_grade = max_grade
        return value


class AssignmentFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_filename: str
    content_type: Optional[str]
    file_size: int
    created_at: datetime


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    title: str
    description: Optional[str]
    start_date: datetime
    deadline: datetime
    late_penalty_periods: list[dict[str, int]]
    gitea_repo_name: Optional[str]
    created_at: datetime
    files: list[AssignmentFileRead] = []


class GiteaCommitAuthorRead(BaseModel):
    name: str
    email: str | None = None


class GiteaCommitRead(BaseModel):
    sha: str
    message: str
    author: GiteaCommitAuthorRead
    date: datetime


class AssignmentSubmissionStatusRead(BaseModel):
    student_id: UUID
    student_full_name: str
    status: Literal["submitted", "not_submitted"]
    last_commit_at: datetime | None = None
    grade: int | None = None
    final_grade: float | None = None
    penalty_points: float = 0.0
    weeks_late: int = 0
    late_max_grade: float | None = None
    comment: str | None = None
    answer_text: str | None = None
    repository_url: str | None = None
    attachments: list["SubmissionAttachmentRead"] = Field(default_factory=list)
    submitted_at: datetime | None = None
    graded_at: datetime | None = None


class GradeSubmissionRequest(BaseModel):
    grade: int
    comment: str | None = None


class MyGradeRead(BaseModel):
    grade: int | None = None
    final_grade: float | None = None
    penalty_points: float = 0.0
    weeks_late: int = 0
    late_max_grade: float | None = None
    comment: str | None = None
    answer_text: str | None = None
    repository_url: str | None = None
    attachments: list["SubmissionAttachmentRead"] = Field(default_factory=list)
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    grade_max: int = 100


class SubmissionAttachmentRead(BaseModel):
    id: str
    kind: Literal["report", "attachment"]
    original_filename: str
    content_type: str | None = None
    file_size: int
    uploaded_at: datetime


class PlagiarismStudentRead(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr


class PlagiarismPairRead(BaseModel):
    student1: PlagiarismStudentRead
    student2: PlagiarismStudentRead
    similarity: float
    verdict: Literal["high", "medium", "low"]
    source: Literal["code", "report", "combined"] = "code"


class PlagiarismCheckRead(BaseModel):
    pairs: list[PlagiarismPairRead]
    checked_at: datetime


class PlagiarismCompareRequest(BaseModel):
    student1_id: UUID
    student2_id: UUID
    source: Literal["code", "report", "combined"] = "code"


class PlagiarismLineCompareRead(BaseModel):
    line: str
    status: Literal["exact", "similar", "different"]


class PlagiarismCompareRead(BaseModel):
    similarity: float
    verdict: Literal["high", "medium", "low"]
    source: Literal["code", "report", "combined"] = "code"
    common_features: list[str]
    lines1: list[PlagiarismLineCompareRead]
    lines2: list[PlagiarismLineCompareRead]


class AiReviewRubricItemRead(BaseModel):
    criterion: str
    weight: float
    score: float
    evidence: str


class AiReviewRead(BaseModel):
    student_id: UUID
    student_full_name: str
    assignment_id: UUID
    generated_at: datetime
    mode: Literal["llm", "local_rules", "local_fallback"]
    model: str
    provider_error: str | None = None
    overall_score: float
    confidence: float
    summary: str
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    pr_review: list[str] = Field(default_factory=list)
    report_review: list[str] = Field(default_factory=list)
    recommended_comment: str
    rubric: list[AiReviewRubricItemRead] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)


class GiteaRepoFileRead(BaseModel):
    sha: str
    name: str
    type: Literal["file", "dir"]
    size: int | None = None


class GiteaFileContentRead(BaseModel):
    filepath: str
    content: str

