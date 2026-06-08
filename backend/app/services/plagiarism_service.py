from __future__ import annotations

import ast
import difflib
import html
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from xml.etree import ElementTree
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.assignment import Assignment
from app.models.course_enrollment import CourseEnrollment
from app.models.submission import Submission
from app.models.user import User
from app.services.gitea_service import get_repo_contents, get_repo_file_content
from app.services.student_repository_service import resolve_assignment_repo_owner_and_name

PlagiarismSource = str

_VALID_SOURCES = {"code", "report", "combined"}
_CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".kt",
    ".swift",
    ".sql",
    ".html",
    ".css",
    ".scss",
    ".md",
}
_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".rst",
    ".csv",
    ".json",
    ".xml",
    ".html",
    ".htm",
    ".log",
    ".tex",
}
_WORD_RE = re.compile(r"[0-9A-Za-zА-Яа-яЁё_-]{3,}", flags=re.UNICODE)


class _VariableNormalizer(ast.NodeTransformer):
    def visit_Name(self, node: ast.Name) -> ast.AST:
        return ast.copy_location(ast.Name(id="VAR", ctx=node.ctx), node)

    def visit_arg(self, node: ast.arg) -> ast.AST:
        return ast.copy_location(ast.arg(arg="VAR", annotation=node.annotation, type_comment=node.type_comment), node)

    def visit_Constant(self, node: ast.Constant) -> ast.AST:
        value = node.value
        if isinstance(value, str):
            return ast.copy_location(ast.Constant(value="STR"), node)
        if isinstance(value, (int, float, complex)) and not isinstance(value, bool):
            return ast.copy_location(ast.Constant(value="NUM"), node)
        return node


@dataclass
class _AstFeatures:
    function_names: set[str]
    operator_names: set[str]
    node_types: set[str]


def _normalize_source(source: PlagiarismSource | None) -> PlagiarismSource:
    value = (source or "code").strip().lower()
    if value not in _VALID_SOURCES:
        raise ValueError("Invalid plagiarism source")
    return value


async def _collect_code_paths(*, owner: str, repo: str, root: str = "") -> list[str]:
    items = await get_repo_contents(owner=owner, repo=repo, filepath=root)
    if not isinstance(items, list):
        return []

    result: list[str] = []
    for item in items:
        item_type = item.get("type")
        item_path = str(item.get("path") or "").strip("/")
        if not item_path:
            continue
        if item_type == "file" and Path(item_path).suffix.lower() in _CODE_EXTENSIONS:
            result.append(item_path)
        elif item_type == "dir":
            result.extend(await _collect_code_paths(owner=owner, repo=repo, root=item_path))
    return result


async def get_student_code(owner: str, repo_name: str) -> str:
    """
    Загружает основные текстовые/code файлы из репозитория и склеивает в один текст.
    """
    paths = await _collect_code_paths(owner=owner, repo=repo_name)
    chunks: list[str] = []
    for p in sorted(set(paths)):
        try:
            content = await get_repo_file_content(
                owner=owner,
                repo=repo_name,
                filepath=p,
            )
        except RuntimeError:
            continue
        chunks.append(f"# FILE: {p}\n{content}\n")
    return "\n".join(chunks)


def parse_ast_features(code: str) -> _AstFeatures:
    """
    Парсит AST и извлекает имена функций, операторы и типы узлов.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        # Fallback для частично невалидного кода: всё равно пытаемся извлечь
        # имена функций и использованные операторы.
        function_names = set(re.findall(r"^\s*(?:async\s+def|def)\s+([A-Za-z_]\w*)\s*\(", code, flags=re.MULTILINE))
        operator_tokens = {
            "And": r"\band\b",
            "Or": r"\bor\b",
            "Not": r"\bnot\b",
            "Eq": r"==",
            "NotEq": r"!=",
            "Lt": r"<",
            "LtE": r"<=",
            "Gt": r">",
            "GtE": r">=",
            "Add": r"\+",
            "Sub": r"-",
            "Mult": r"\*",
            "Div": r"/",
            "Mod": r"%",
        }
        operator_names = {name for name, pattern in operator_tokens.items() if re.search(pattern, code)}
        return _AstFeatures(
            function_names=function_names,
            operator_names=operator_names,
            node_types=set(),
        )

    function_names: set[str] = set()
    operator_names: set[str] = set()
    node_types: set[str] = set()

    for node in ast.walk(tree):
        node_types.add(type(node).__name__)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            function_names.add(node.name)
        if isinstance(node, ast.operator):
            operator_names.add(type(node).__name__)
        if isinstance(node, ast.unaryop):
            operator_names.add(type(node).__name__)
        if isinstance(node, ast.boolop):
            operator_names.add(type(node).__name__)
        if isinstance(node, ast.cmpop):
            operator_names.add(type(node).__name__)

    return _AstFeatures(
        function_names=function_names,
        operator_names=operator_names,
        node_types=node_types,
    )


def _jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def compare_submissions(code1: str, code2: str) -> dict[str, Any]:
    """
    Возвращает similarity в диапазоне [0, 1] по Jaccard на AST-фичах.
    """
    f1 = parse_ast_features(code1)
    f2 = parse_ast_features(code2)

    nodes_sim = _jaccard_similarity(f1.node_types, f2.node_types)
    funcs_sim = _jaccard_similarity(f1.function_names, f2.function_names)
    ops_sim = _jaccard_similarity(f1.operator_names, f2.operator_names)

    # AST-структура важнее имён.
    score = max(0.0, min(1.0, nodes_sim * 0.7 + funcs_sim * 0.2 + ops_sim * 0.1))

    # Базовое пересечение AST нод.
    common_features = [f"node:{name}" for name in sorted(f1.node_types & f2.node_types)]
    # Если нод нет (или парсинг не дал нод), дополняем функциями и операторами.
    common_features.extend(f"function:{name}" for name in sorted(f1.function_names & f2.function_names))
    common_features.extend(f"operator:{name}" for name in sorted(f1.operator_names & f2.operator_names))

    return {"similarity": score, "common_features": common_features}


def _verdict(similarity: float) -> str:
    if similarity > 0.8:
        return "high"
    if similarity >= 0.6:
        return "medium"
    return "low"


def _compact(s: str) -> str:
    return "".join(s.split())


def _normalize_line_with_ast(line: str) -> str:
    source = line.strip()
    if not source:
        return ""

    parsed: ast.AST | None = None
    parse_candidates = [source]
    if source.endswith(":"):
        parse_candidates.append(f"{source}\n    pass")

    for candidate in parse_candidates:
        for mode in ("exec", "eval"):
            try:
                parsed = ast.parse(candidate, mode=mode)
                break
            except SyntaxError:
                continue
        if parsed is not None:
            break
    if not parsed:
        return _compact(source)

    normalized_tree = _VariableNormalizer().visit(parsed)
    ast.fix_missing_locations(normalized_tree)
    try:
        text = ast.unparse(normalized_tree)
    except Exception:
        text = source
    if source.endswith(":"):
        text = text.replace("\n    pass", "")
    return _compact(text)


def _is_similar_normalized(norm1: str, norm2: str) -> bool:
    if not norm1 or not norm2:
        return False
    ratio = difflib.SequenceMatcher(a=norm1, b=norm2).ratio()
    return ratio >= 0.72


def _status_for_lines(raw1: str, raw2: str) -> str:
    stripped1 = raw1.strip()
    stripped2 = raw2.strip()

    # Пустые строки
    if not stripped1 and not stripped2:
        return "different"

    # Комментарии — сравниваем напрямую
    if stripped1.startswith("#") or stripped2.startswith("#"):
        if _compact(stripped1) == _compact(stripped2):
            return "exact"
        return "different"

    compact1 = _compact(stripped1)
    compact2 = _compact(stripped2)

    # Строки буквально одинаковые (включая имена переменных) -> exact
    if compact1 == compact2:
        return "exact"

    norm1 = _normalize_line_with_ast(stripped1)
    norm2 = _normalize_line_with_ast(stripped2)

    # Нормализованные совпадают (структура одинакова, переменные разные) -> similar
    if norm1 and norm1 == norm2:
        return "similar"

    # Похожи по difflib -> similar
    if _is_similar_normalized(norm1, norm2):
        return "similar"
    return "different"


def _line_score(status: str) -> float:
    if status == "exact":
        return 1.0
    if status == "similar":
        return 0.75
    return 0.0


def _line_similarity(lines: list[dict[str, str]]) -> float:
    if not lines:
        return 0.0
    total_score = sum(_line_score(row.get("status", "different")) for row in lines)
    return max(0.0, min(1.0, total_score / len(lines)))


def line_by_line_compare(code1: str, code2: str) -> dict[str, list[dict[str, str]]]:
    lines1 = code1.splitlines()
    lines2 = code2.splitlines()
    max_len = max(len(lines1), len(lines2))
    result1: list[dict[str, str]] = []
    result2: list[dict[str, str]] = []

    for i in range(max_len):
        raw1 = lines1[i] if i < len(lines1) else ""
        raw2 = lines2[i] if i < len(lines2) else ""
        status = _status_for_lines(raw1, raw2)

        result1.append({"line": raw1, "status": status})
        result2.append({"line": raw2, "status": status})

    return {"lines1": result1, "lines2": result2}


def _safe_stored_attachment_path(raw: dict) -> Path | None:
    try:
        path = Path(str(raw.get("storage_path") or "")).resolve()
        root = Path(settings.UPLOAD_DIR).resolve()
        path.relative_to(root)
    except (TypeError, ValueError, RuntimeError):
        return None
    if not path.exists() or not path.is_file():
        return None
    return path


def _read_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "cp1251", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def _extract_docx_text(path: Path) -> str:
    chunks: list[str] = []
    with zipfile.ZipFile(path) as archive:
        for name in ("word/document.xml", "word/footnotes.xml", "word/endnotes.xml"):
            if name not in archive.namelist():
                continue
            root = ElementTree.fromstring(archive.read(name))
            for node in root.iter():
                if node.text and node.tag.endswith("}t"):
                    chunks.append(node.text)
                elif node.tag.endswith("}p"):
                    chunks.append("\n")
    return html.unescape(" ".join(chunks)).replace(" \n ", "\n")


def _decode_pdf_literal(value: str) -> str:
    value = value[1:-1]
    value = value.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
    value = value.replace(r"\n", "\n").replace(r"\r", "\n").replace(r"\t", "\t")
    return value


def _extract_pdf_text_fallback(path: Path) -> str:
    raw = path.read_bytes().decode("latin-1", errors="ignore")
    literals = re.findall(r"\((?:\\.|[^\\()]){3,}\)", raw)
    text = "\n".join(_decode_pdf_literal(item) for item in literals)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        return _extract_pdf_text_fallback(path)


def _extract_attachment_text(raw: dict) -> str:
    path = _safe_stored_attachment_path(raw)
    if path is None:
        return ""
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            return _extract_pdf_text(path)
        if suffix == ".docx":
            return _extract_docx_text(path)
        if suffix in _TEXT_EXTENSIONS:
            return _read_text_file(path)
    except Exception:
        return ""
    return ""


def _submission_report_text(submission: Submission | None) -> str:
    if not submission or not isinstance(submission.attachments, list):
        return ""
    chunks: list[str] = []
    for raw in submission.attachments:
        if not isinstance(raw, dict) or raw.get("kind") != "report":
            continue
        original = str(raw.get("original_filename") or "report").strip()
        text = _extract_attachment_text(raw).strip()
        if text:
            chunks.append(f"# REPORT: {original}\n{text}\n")
    return "\n".join(chunks)


def _normalize_text_tokens(text: str) -> list[str]:
    return [token.lower().replace("_", "-") for token in _WORD_RE.findall(text)]


def _ngrams(tokens: list[str], size: int) -> set[str]:
    if len(tokens) < size:
        return set(tokens)
    return {" ".join(tokens[i : i + size]) for i in range(len(tokens) - size + 1)}


def compare_text_documents(text1: str, text2: str) -> dict[str, Any]:
    if not text1.strip() or not text2.strip():
        return {"similarity": 0.0, "common_features": []}
    tokens1 = _normalize_text_tokens(text1)
    tokens2 = _normalize_text_tokens(text2)
    token_sim = _jaccard_similarity(set(tokens1), set(tokens2))
    phrase_sim = _jaccard_similarity(_ngrams(tokens1, 3), _ngrams(tokens2, 3))
    compact1 = " ".join(tokens1[:5000])
    compact2 = " ".join(tokens2[:5000])
    sequence_sim = difflib.SequenceMatcher(a=compact1, b=compact2, autojunk=True).ratio()
    score = max(0.0, min(1.0, token_sim * 0.35 + phrase_sim * 0.45 + sequence_sim * 0.20))
    common_phrases = sorted(_ngrams(tokens1, 3) & _ngrams(tokens2, 3), key=len, reverse=True)[:30]
    common_words = sorted((set(tokens1) & set(tokens2)) - set(" ".join(common_phrases).split()))[:30]
    common_features = [f"phrase:{item}" for item in common_phrases]
    common_features.extend(f"word:{item}" for item in common_words)
    return {"similarity": score, "common_features": common_features}


async def _assignment_code_text(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_id: UUID,
) -> str:
    try:
        owner, repo_name = await resolve_assignment_repo_owner_and_name(
            session,
            assignment_id=assignment_id,
            student_id=student_id,
        )
    except ValueError:
        return ""
    return await get_student_code(owner, repo_name)


async def _submission_map_for_students(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_ids: list[UUID],
) -> dict[UUID, Submission]:
    if not student_ids:
        return {}
    submissions_q = await session.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id.in_(student_ids),
        )
    )
    return {item.student_id: item for item in submissions_q.scalars().all()}


async def _student_work_parts(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_id: UUID,
    submission: Submission | None = None,
) -> tuple[str, str]:
    code_text = await _assignment_code_text(session, assignment_id=assignment_id, student_id=student_id)
    report_text = _submission_report_text(submission)
    return code_text, report_text


def _compare_work_text(text1: str, text2: str, *, source: PlagiarismSource) -> dict[str, Any]:
    line_comparison = line_by_line_compare(text1, text2)
    if not text1.strip() or not text2.strip():
        score = 0.0
    elif source == "report":
        score = float(compare_text_documents(text1, text2)["similarity"])
    elif source == "combined":
        line_score = _line_similarity(line_comparison["lines1"])
        text_score = float(compare_text_documents(text1, text2)["similarity"])
        score = max(line_score, text_score)
    else:
        score = _line_similarity(line_comparison["lines1"])

    if source == "code":
        comparison = compare_submissions(text1, text2)
    elif source == "combined":
        code_comparison = compare_submissions(text1, text2)
        text_comparison = compare_text_documents(text1, text2)
        comparison = {
            "common_features": [
                *list(code_comparison["common_features"])[:40],
                *list(text_comparison["common_features"])[:40],
            ],
        }
    else:
        comparison = compare_text_documents(text1, text2)

    return {
        "similarity": round(score, 4),
        "verdict": _verdict(score),
        "source": source,
        "common_features": list(comparison["common_features"]),
        "lines1": line_comparison["lines1"],
        "lines2": line_comparison["lines2"],
    }


def _merge_unique_features(*feature_lists: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for feature_list in feature_lists:
        for feature in feature_list:
            if feature in seen:
                continue
            seen.add(feature)
            merged.append(feature)
    return merged


def _compare_student_work(
    code1: str,
    report1: str,
    code2: str,
    report2: str,
    *,
    source: PlagiarismSource,
) -> dict[str, Any]:
    if source == "code":
        return _compare_work_text(code1, code2, source="code")
    if source == "report":
        return _compare_work_text(report1, report2, source="report")

    code_comparison = _compare_work_text(code1, code2, source="code") if (code1.strip() or code2.strip()) else {
        "similarity": 0.0,
        "verdict": _verdict(0.0),
        "source": source,
        "common_features": [],
        "lines1": [],
        "lines2": [],
    }
    report_comparison = _compare_work_text(report1, report2, source="report") if (report1.strip() or report2.strip()) else {
        "similarity": 0.0,
        "verdict": _verdict(0.0),
        "source": source,
        "common_features": [],
        "lines1": [],
        "lines2": [],
    }
    score = max(float(code_comparison["similarity"]), float(report_comparison["similarity"]))
    combined_text1 = "\n\n".join(part for part in (code1, report1) if part.strip())
    combined_text2 = "\n\n".join(part for part in (code2, report2) if part.strip())
    line_comparison = line_by_line_compare(combined_text1, combined_text2)
    return {
        "similarity": round(score, 4),
        "verdict": _verdict(score),
        "source": source,
        "common_features": _merge_unique_features(
            list(code_comparison["common_features"]),
            list(report_comparison["common_features"]),
        ),
        "lines1": line_comparison["lines1"],
        "lines2": line_comparison["lines2"],
    }


async def compare_students_plagiarism(
    session: AsyncSession,
    *,
    course_id: UUID,
    assignment_id: UUID,
    student1_id: UUID,
    student2_id: UUID,
    source: PlagiarismSource = "code",
) -> dict[str, Any]:
    normalized_source = _normalize_source(source)
    assignment_q = await session.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.course_id == course_id,
        )
    )
    if not assignment_q.scalar_one_or_none():
        raise ValueError("Assignment not found")

    if student1_id == student2_id:
        raise ValueError("Students must be different")

    students_q = await session.execute(
        select(User)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(
            CourseEnrollment.course_id == course_id,
            User.id.in_([student1_id, student2_id]),
        )
    )
    students = list(students_q.scalars().all())
    if len(students) != 2:
        raise ValueError("Students must be enrolled in this course")

    submission_map = await _submission_map_for_students(
        session,
        assignment_id=assignment_id,
        student_ids=[student1_id, student2_id],
    )
    code1, report1 = await _student_work_parts(
        session,
        assignment_id=assignment_id,
        student_id=student1_id,
        submission=submission_map.get(student1_id),
    )
    code2, report2 = await _student_work_parts(
        session,
        assignment_id=assignment_id,
        student_id=student2_id,
        submission=submission_map.get(student2_id),
    )

    return _compare_student_work(code1, report1, code2, report2, source=normalized_source)


async def check_assignment_plagiarism(
    session: AsyncSession,
    *,
    course_id: UUID,
    assignment_id: UUID,
    source: PlagiarismSource = "code",
) -> dict[str, Any]:
    normalized_source = _normalize_source(source)
    assignment_q = await session.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.course_id == course_id,
        )
    )
    if not assignment_q.scalar_one_or_none():
        raise ValueError("Assignment not found")

    students_q = await session.execute(
        select(User)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course_id)
        .order_by(User.full_name.asc())
    )
    students = list(students_q.scalars().all())

    submission_map = await _submission_map_for_students(
        session,
        assignment_id=assignment_id,
        student_ids=[student.id for student in students],
    )
    work_by_student_id: dict[UUID, tuple[str, str]] = {}
    for student in students:
        work_by_student_id[student.id] = await _student_work_parts(
            session,
            assignment_id=assignment_id,
            student_id=student.id,
            submission=submission_map.get(student.id),
        )

    pairs: list[dict[str, Any]] = []
    for s1, s2 in combinations(students, 2):
        code1, report1 = work_by_student_id.get(s1.id, ("", ""))
        code2, report2 = work_by_student_id.get(s2.id, ("", ""))
        comparison = _compare_student_work(code1, report1, code2, report2, source=normalized_source)
        score = float(comparison["similarity"])
        if score <= 0.7:
            continue
        pairs.append(
            {
                "student1": {
                    "id": s1.id,
                    "full_name": s1.full_name,
                    "email": s1.email,
                },
                "student2": {
                    "id": s2.id,
                    "full_name": s2.full_name,
                    "email": s2.email,
                },
                "similarity": round(score, 4),
                "verdict": _verdict(score),
                "source": normalized_source,
            }
        )

    pairs.sort(key=lambda x: x["similarity"], reverse=True)
    return {"pairs": pairs, "checked_at": datetime.now(timezone.utc)}
