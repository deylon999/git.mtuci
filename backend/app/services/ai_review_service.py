from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.ai_review_cache import AiReviewCache
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.submission import Submission
from app.models.user import User
from app.services.gitea_service import (
    get_pull_request_diff_text,
    list_repo_commits_page,
    list_repo_pulls_page,
)
from app.services.plagiarism_service import _extract_attachment_text
from app.services.student_repository_service import resolve_assignment_repo_owner_and_name


_MAX_REPORT_CHARS = 5000
_MAX_CODE_CHARS = 7000
_MAX_DIFF_CHARS = 7000
_MAX_PROMPT_FILES = 6
_MAX_PROMPT_FILE_CHARS = 1800
_MAX_PROMPT_DIFF_FILES = 5
_AI_REVIEW_CACHE_VERSION = "2026-06-09-v1"


@dataclass
class _ReviewCacheEntry:
    fingerprint: str
    payload: dict[str, Any]
    expires_at: float


_review_cache: dict[tuple[UUID, UUID, str], _ReviewCacheEntry] = {}
_review_inflight: dict[tuple[UUID, UUID, str], asyncio.Future[dict[str, Any]]] = {}
_review_cache_lock = asyncio.Lock()
_llm_client: httpx.AsyncClient | None = None
_ollama_warm_until = 0.0


@dataclass
class _RepoContext:
    owner: str | None = None
    repo: str | None = None
    commits: list[dict[str, str]] | None = None
    pull: dict[str, Any] | None = None
    diff: str = ""
    error: str | None = None


def _trim(value: str, limit: int) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "\n\n[...context trimmed...]"


def _stable_hash(*parts: Any) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(repr(part).encode("utf-8", errors="ignore"))
        digest.update(b"\0")
    return digest.hexdigest()


def _word_count(value: str) -> int:
    return len(re.findall(r"[0-9A-Za-zА-Яа-яЁё_-]{3,}", value or ""))


def _keyword_tokens(value: str) -> set[str]:
    words = re.findall(r"[0-9A-Za-zА-Яа-яЁё]+", (value or "").lower())
    stop_words = {
        "для",
        "или",
        "при",
        "что",
        "как",
        "это",
        "the",
        "and",
        "with",
        "from",
        "project",
        "работа",
        "работу",
        "работы",
        "задание",
        "задания",
        "отчет",
        "отчёт",
        "проект",
        "практика",
        "практике",
        "практическая",
        "лабораторная",
        "реализация",
        "реализовать",
        "описание",
        "выполнить",
        "выполнение",
    }
    return {word for word in words if len(word) >= 4 and word not in stop_words}


def _assignment_keywords(assignment: Assignment) -> set[str]:
    text = f"{assignment.title} {assignment.description}"
    title_tokens = _keyword_tokens(assignment.title)
    description_tokens = _keyword_tokens(assignment.description or "")
    tokens = set(title_tokens)
    if len(tokens) < 3:
        tokens.update(sorted(description_tokens)[: 8 - len(tokens)])
    normalized_text = text.lower()
    if "bubble" in normalized_text or "пузыр" in normalized_text:
        tokens.update({"bubble", "sort", "sorting", "пузыр", "пузырь", "сортировка", "сортировки"})
    if "sort" in normalized_text or "сорт" in normalized_text:
        tokens.update({"sort", "sorting", "сортировка", "сортировки", "алгоритм"})
    return tokens


def _report_relevance(report_text: str, assignment: Assignment) -> dict[str, Any]:
    required = _assignment_keywords(assignment)
    if not required:
        return {"score": 1.0, "matched_terms": [], "missing_terms": [], "required_terms": []}

    report_tokens = _keyword_tokens(report_text)
    matched = sorted(term for term in required if term in report_tokens or any(token.startswith(term) for token in report_tokens))
    missing = sorted(term for term in required if term not in matched)
    score = len(matched) / max(1, min(len(required), 8))
    return {
        "score": round(min(1.0, score), 2),
        "matched_terms": matched[:12],
        "missing_terms": missing[:12],
        "required_terms": sorted(required)[:16],
    }


def _line_count(value: str) -> int:
    return len([line for line in (value or "").splitlines() if line.strip()])


def _split_report_sections(report_text: str) -> list[str]:
    sections = [section.strip() for section in re.split(r"\n\s*\n+", report_text or "") if section.strip()]
    return sections if sections else ([report_text.strip()] if (report_text or "").strip() else [])


def _section_score(section: str, keywords: set[str], *, index: int, total: int) -> float:
    tokens = _keyword_tokens(section)
    matched = len(keywords & tokens)
    score = matched * 3.0
    if index < 2:
        score += 1.5
    if index >= max(0, total - 2):
        score += 0.5
    if re.search(r"^[#№0-9А-ЯA-Z]", section.strip(), flags=re.MULTILINE):
        score += 0.5
    if len(section) > 200:
        score += 0.25
    if "вывод" in section.lower() or "result" in section.lower():
        score += 0.75
    return score


def _select_report_excerpt(report_text: str, assignment: Assignment) -> str:
    sections = _split_report_sections(report_text)
    if not sections:
        return ""
    keywords = _assignment_keywords(assignment)
    ranked = [
        (_section_score(section, keywords, index=index, total=len(sections)), index, section)
        for index, section in enumerate(sections)
    ]
    ranked.sort(key=lambda item: (-item[0], item[1]))
    selected_indexes: list[int] = []
    for _, index, _ in ranked:
        if index not in selected_indexes:
            selected_indexes.append(index)
        if len(selected_indexes) >= 5:
            break
    if not selected_indexes:
        selected_indexes = list(range(min(3, len(sections))))
    selected_indexes = sorted(set(selected_indexes))
    excerpt_parts: list[str] = []
    for index in selected_indexes:
        excerpt_parts.append(sections[index])
    excerpt = "\n\n".join(excerpt_parts).strip()
    return _trim(excerpt, _MAX_REPORT_CHARS)


def _split_code_blocks(code_text: str) -> list[tuple[str, str]]:
    pattern = re.compile(r"^# FILE: (.+)$", flags=re.MULTILINE)
    matches = list(pattern.finditer(code_text or ""))
    if not matches:
        return [("bundle", (code_text or "").strip())] if (code_text or "").strip() else []
    blocks: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        path = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(code_text)
        content = code_text[start:end].strip()
        blocks.append((path, content))
    return blocks


def _file_score(path: str, content: str, keywords: set[str]) -> float:
    path_tokens = set(re.findall(r"[0-9A-Za-zА-Яа-яЁё]+", path.lower()))
    content_tokens = _keyword_tokens(content)
    matched = len((path_tokens | content_tokens) & keywords)
    score = matched * 4.0
    if any(token in path.lower() for token in ("main", "app", "index", "program", "solution")):
        score += 1.25
    if len(content.splitlines()) < 80:
        score += 0.25
    if "test" in path.lower() or "spec" in path.lower():
        score += 0.75
    return score


def _select_code_excerpt(code_text: str, assignment: Assignment) -> str:
    blocks = _split_code_blocks(code_text)
    if not blocks:
        return ""
    keywords = _assignment_keywords(assignment)
    ranked = [
        (_file_score(path, content, keywords), index, path, content)
        for index, (path, content) in enumerate(blocks)
    ]
    ranked.sort(key=lambda item: (-item[0], item[1]))
    selected: list[tuple[str, str]] = []
    total_chars = 0
    for _, _, path, content in ranked:
        if len(selected) >= _MAX_PROMPT_FILES:
            break
        snippet = content.strip()
        if len(snippet) > _MAX_PROMPT_FILE_CHARS:
            snippet = snippet[:_MAX_PROMPT_FILE_CHARS] + "\n[...file trimmed...]"
        block_text = f"# FILE: {path}\n{snippet}".strip()
        if total_chars + len(block_text) > _MAX_CODE_CHARS:
            continue
        selected.append((path, snippet))
        total_chars += len(block_text) + 2
    if not selected:
        return _trim(code_text, _MAX_CODE_CHARS)
    return "\n\n".join(f"# FILE: {path}\n{snippet}" for path, snippet in selected).strip()


def _split_diff_blocks(diff_text: str) -> list[tuple[str, str]]:
    if not (diff_text or "").strip():
        return []
    pattern = re.compile(r"^diff --git a/(.+?) b/(.+?)$", flags=re.MULTILINE)
    matches = list(pattern.finditer(diff_text))
    if not matches:
        return [("diff", diff_text.strip())]
    blocks: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        path = match.group(2).strip()
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(diff_text)
        blocks.append((path, diff_text[start:end].strip()))
    return blocks


def _select_diff_excerpt(diff_text: str, assignment: Assignment) -> str:
    blocks = _split_diff_blocks(diff_text)
    if not blocks:
        return ""
    keywords = _assignment_keywords(assignment)
    ranked = []
    for index, (path, content) in enumerate(blocks):
        path_tokens = set(re.findall(r"[0-9A-Za-zА-Яа-яЁё]+", path.lower()))
        content_tokens = _keyword_tokens(content)
        matched = len((path_tokens | content_tokens) & keywords)
        score = matched * 3.0
        if any(token in path.lower() for token in ("main", "app", "index", "solution", "report")):
            score += 1.0
        if "@@" in content:
            score += 0.5
        ranked.append((score, index, path, content))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    selected: list[str] = []
    for _, _, path, content in ranked:
        if len(selected) >= _MAX_PROMPT_DIFF_FILES:
            break
        block = content
        if len(block) > _MAX_DIFF_CHARS // 2:
            block = block[: _MAX_DIFF_CHARS // 2] + "\n[...diff trimmed...]"
        selected.append(f"# DIFF FILE: {path}\n{block}".strip())
    return "\n\n".join(selected).strip() or _trim(diff_text, _MAX_DIFF_CHARS)


def _diff_stats(diff: str) -> dict[str, int]:
    files = len(re.findall(r"^diff --git ", diff or "", flags=re.MULTILINE))
    additions = 0
    deletions = 0
    for line in (diff or "").splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            additions += 1
        elif line.startswith("-"):
            deletions += 1
    return {"files_changed": files, "additions": additions, "deletions": deletions}


def _submission_document_text(submission: Submission | None) -> tuple[str, list[dict[str, Any]]]:
    if not submission:
        return "", []

    chunks: list[str] = []
    sources: list[dict[str, Any]] = []
    answer_text = (submission.answer_text or "").strip()
    if answer_text:
        chunks.append(f"# ANSWER_TEXT\n{answer_text}\n")
        sources.append(
            {
                "kind": "answer_text",
                "filename": "answer_text",
                "extracted": True,
                "chars": len(answer_text),
            }
        )

    if not isinstance(submission.attachments, list):
        return "\n".join(chunks), sources

    for raw in submission.attachments:
        if not isinstance(raw, dict):
            continue
        original = str(raw.get("original_filename") or raw.get("filename") or "attachment").strip()
        kind = str(raw.get("kind") or "attachment").strip()
        text = _extract_attachment_text(raw).strip()
        source = {
            "kind": kind,
            "filename": original,
            "extracted": bool(text),
            "chars": len(text),
        }
        sources.append(source)
        if text:
            chunks.append(f"# ATTACHMENT kind={kind} filename={original}\n{text}\n")

    return "\n".join(chunks), sources


def _commit_message(item: dict[str, Any]) -> str:
    commit = item.get("commit") if isinstance(item.get("commit"), dict) else item
    if not isinstance(commit, dict):
        return "commit"
    message = str(commit.get("message") or "").strip()
    return (message.split("\n", 1)[0].strip() or "commit")[:160]


def _commit_date(item: dict[str, Any]) -> str:
    commit = item.get("commit") if isinstance(item.get("commit"), dict) else item
    author = commit.get("author") if isinstance(commit, dict) and isinstance(commit.get("author"), dict) else {}
    return str(author.get("date") or item.get("created") or "")[:32]


def _score_context(
    *,
    assignment: Assignment,
    report_text: str,
    code_text: str,
    repo: _RepoContext,
    submission: Submission | None,
    document_sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    report_words = _word_count(report_text)
    relevance = _report_relevance(report_text, assignment)
    relevance_score = float(relevance["score"])
    code_lines = _line_count(code_text)
    commits_count = len(repo.commits or [])
    sources = document_sources or []
    extracted_documents_count = len([item for item in sources if item.get("extracted")])
    document_attachments_count = len([item for item in sources if item.get("kind") != "answer_text"])
    diff = repo.diff or ""
    diff_meta = _diff_stats(diff)
    has_pr = repo.pull is not None
    has_submission = submission is not None

    report_score = (min(30.0, report_words / 1200 * 30.0) * relevance_score) if report_words else 0.0
    code_score = min(30.0, code_lines / 320 * 30.0) if code_lines else 0.0
    process_score = min(20.0, commits_count * 3.0 + (8.0 if has_pr else 0.0) + (4.0 if has_submission else 0.0))
    evidence_score = min(
        20.0,
        (8.0 if report_words >= 250 and relevance_score >= 0.35 else 0.0)
        + (6.0 if diff_meta["files_changed"] > 0 else 0.0)
        + (3.0 if commits_count >= 2 else 0.0)
        + (3.0 if submission and (submission.answer_text or "").strip() else 0.0),
    )
    overall = round(report_score + code_score + process_score + evidence_score, 1)

    risk_flags: list[str] = []
    if report_words < 250:
        risk_flags.append("Отчёт отсутствует или слишком короткий для уверенной проверки.")
    if document_attachments_count > 0 and extracted_documents_count == 0:
        risk_flags.append("Файлы приложены, но текст из них не извлечён: нужна ручная проверка формата/содержимого.")
    elif relevance_score < 0.35:
        risk_flags.append(
            "Отчёт слабо соответствует теме задания: длинный текст не засчитывается как качественный отчёт по работе."
        )
    if code_lines < 40:
        risk_flags.append("В репозитории мало кода или он не загрузился из Gitea.")
    if commits_count == 0:
        risk_flags.append("Коммиты не найдены: сложно оценить процесс разработки.")
    if not has_pr:
        risk_flags.append("PR не найден: diff-анализ ограничен текущим состоянием репозитория.")

    confidence = 0.35
    confidence += 0.25 if report_words >= 250 else 0.0
    confidence += 0.25 if code_lines >= 40 else 0.0
    confidence += 0.15 if has_pr or commits_count > 0 else 0.0
    confidence = round(min(0.95, confidence), 2)

    rubric = [
        {
            "criterion": "Отчёт и постановка результата",
            "weight": 30,
            "score": round(report_score, 1),
            "evidence": f"{report_words} слов в отчёте, релевантность теме {round(relevance_score * 100)}%",
        },
        {
            "criterion": "Кодовая база",
            "weight": 30,
            "score": round(code_score, 1),
            "evidence": f"{code_lines} непустых строк кода",
        },
        {
            "criterion": "Процесс разработки",
            "weight": 20,
            "score": round(process_score, 1),
            "evidence": f"{commits_count} коммитов, PR: {'есть' if has_pr else 'нет'}",
        },
        {
            "criterion": "Проверяемость доказательств",
            "weight": 20,
            "score": round(evidence_score, 1),
            "evidence": f"{diff_meta['files_changed']} файлов в diff, {diff_meta['additions']} добавлений",
        },
    ]

    return {
        "overall_score": overall,
        "confidence": confidence,
        "risk_flags": risk_flags,
        "rubric": rubric,
        "metrics": {
            "report_words": report_words,
            "report_relevance": relevance_score,
            "report_matched_terms": relevance["matched_terms"],
            "report_missing_terms": relevance["missing_terms"],
            "document_sources": sources,
            "document_attachments_count": document_attachments_count,
            "extracted_documents_count": extracted_documents_count,
            "code_lines": code_lines,
            "commits_count": commits_count,
            **diff_meta,
        },
    }


def _normalize_list(value: Any, *, limit: int = 6) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()][:limit]
    if isinstance(value, str) and value.strip():
        return [value.strip()][:limit]
    return []


def _fallback_review(
    *,
    student: User,
    assignment: Assignment,
    score: dict[str, Any],
    provider_error: str | None = None,
) -> dict[str, Any]:
    risk_flags = list(score["risk_flags"])
    strengths = []
    metrics = score["metrics"]
    report_relevance = float(metrics.get("report_relevance") or 0.0)
    if metrics["report_words"] >= 250 and report_relevance >= 0.35:
        strengths.append("Есть текстовый отчёт, по нему можно проверить постановку задачи и результат.")
    if metrics["code_lines"] >= 40:
        strengths.append("Репозиторий содержит достаточно кода для первичного анализа.")
    if metrics["commits_count"] > 0:
        strengths.append("Есть коммиты, можно восстановить ход работы.")
    if metrics["files_changed"] > 0:
        strengths.append("Найден PR/diff, доступен анализ внесённых изменений.")
    if not strengths:
        strengths.append("Сдача зарегистрирована, но доказательной базы пока мало.")

    concerns = risk_flags or ["Явных технических рисков по локальным метрикам не найдено."]
    questions = [
        "Какая часть результата была реализована самостоятельно?",
        "Какие ограничения или известные проблемы остались после сдачи?",
        "Где в репозитории находится основной вход в реализованную функциональность?",
    ]
    if metrics["files_changed"] > 0:
        questions.append("Почему в PR изменены именно эти файлы и какие сценарии проверялись?")

    suffix = f" Ошибка LLM: {provider_error}" if provider_error else ""
    return {
        "mode": "local_fallback" if provider_error else "local_rules",
        "model": "local-review-rules",
        "summary": (
            f"Локальный анализ работы студента {student.full_name} по заданию "
            f"«{assignment.title}». Индекс готовности: {score['overall_score']} из 100.{suffix}"
        ),
        "strengths": strengths,
        "concerns": concerns,
        "questions": questions[:6],
        "pr_review": [
            "Проверьте соответствие diff требованиям задания.",
            "Обратите внимание на тесты, обработку ошибок и связность изменений.",
        ],
        "report_review": [
            (
                "Отчёт нужно сверить с темой задания: текущая релевантность по ключевым признакам низкая."
                if report_relevance < 0.35 and metrics["report_words"] >= 250
                else "Проверьте, есть ли цель, описание архитектуры, результаты и вывод."
            ),
            "Сопоставьте утверждения отчёта с фактическими файлами репозитория.",
        ],
        "recommended_comment": (
            "Работа предварительно проанализирована AI-помощником. "
            "Перед выставлением оценки рекомендую сверить отчёт, PR/diff и запустить ключевые сценарии."
        ),
        "confidence": score["confidence"],
    }


async def _repo_context_for_repo(*, owner: str, repo_name: str) -> _RepoContext:
    ctx = _RepoContext(owner=owner, repo=repo_name, commits=[])
    try:
        raw_commits, _ = await list_repo_commits_page(owner=owner, repo=repo_name, limit=20, page=1)
        ctx.commits = [
            {
                "sha": str(item.get("sha") or "")[:12],
                "message": _commit_message(item),
                "date": _commit_date(item),
            }
            for item in raw_commits
            if isinstance(item, dict)
        ]

        pulls, _ = await list_repo_pulls_page(owner=owner, repo=repo_name, limit=10, page=1, state="all")
        pull = next((item for item in pulls if isinstance(item, dict) and item.get("state") == "open"), None)
        if pull is None:
            pull = next((item for item in pulls if isinstance(item, dict)), None)
        if isinstance(pull, dict):
            number = int(pull.get("number") or pull.get("index") or 0)
            ctx.pull = {
                "number": number,
                "title": str(pull.get("title") or ""),
                "state": str(pull.get("state") or ""),
                "base": str(((pull.get("base") or {}) if isinstance(pull.get("base"), dict) else {}).get("ref") or ""),
                "head": str(((pull.get("head") or {}) if isinstance(pull.get("head"), dict) else {}).get("ref") or ""),
            }
            if number > 0:
                ctx.diff = await get_pull_request_diff_text(owner=owner, repo=repo_name, index=number)
    except Exception as exc:
        ctx.error = str(exc)
    return ctx


async def _safe_student_code(owner: str, repo_name: str) -> str:
    try:
        return await get_student_code(owner, repo_name)
    except Exception:
        return ""


def _build_prompt(
    *,
    course: Course,
    assignment: Assignment,
    student: User,
    submission: Submission | None,
    report_text: str,
    code_text: str,
    repo: _RepoContext,
    score: dict[str, Any],
) -> list[dict[str, str]]:
    evidence_summary = {
        "report_words": score["metrics"]["report_words"],
        "report_relevance": score["metrics"]["report_relevance"],
        "report_matched_terms": score["metrics"]["report_matched_terms"],
        "report_missing_terms": score["metrics"]["report_missing_terms"],
        "document_sources": score["metrics"]["document_sources"],
        "code_lines": score["metrics"]["code_lines"],
        "commits_count": score["metrics"]["commits_count"],
        "files_changed": score["metrics"]["files_changed"],
        "additions": score["metrics"]["additions"],
        "deletions": score["metrics"]["deletions"],
        "has_pr": bool(repo.pull),
        "repo_error": repo.error,
        "risk_flags": score["risk_flags"],
        "rubric": score["rubric"],
    }
    payload = {
        "course": {"title": course.title, "description": course.description},
        "assignment": {
            "title": assignment.title,
            "description": assignment.description,
            "deadline": assignment.deadline.isoformat() if assignment.deadline else None,
        },
        "student": {"full_name": student.full_name, "email": student.email},
        "submission": {
            "answer_text": (submission.answer_text if submission else None),
            "repository_url": (submission.repository_url if submission else None),
            "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
            "attachments": submission.attachments if submission else [],
        },
        "local_metrics": score,
        "evidence_summary": evidence_summary,
        "repo": {
            "owner": repo.owner,
            "name": repo.repo,
            "commits": repo.commits or [],
            "pull": repo.pull,
            "repo_error": repo.error,
        },
        "report_excerpt": _select_report_excerpt(report_text, assignment),
        "code_excerpt": _select_code_excerpt(code_text, assignment),
        "pull_diff_excerpt": _select_diff_excerpt(repo.diff, assignment),
    }
    return [
        {
            "role": "system",
            "content": (
                "Ты AI-помощник преподавателя технического вуза. "
                "Твоя задача - сделать предметный предварительный разбор сдачи студента: отчёт, код и PR. "
                "Не ставь финальную оценку и не выдумывай факты. Если данных мало, прямо укажи это. "
                "Сначала опирайся на факты из evidence_summary, затем на excerpts. "
                "Если report_relevance ниже 0.35, считай отчёт нерелевантным теме задания: "
                "не хвали структуру и объём отчёта, а прямо укажи, что отчёт не по существу задания. "
                "Если document_sources показывает extracted=false, не утверждай, что файл был прочитан; "
                "укажи, что текст из файла не извлечён и нужна ручная проверка. "
                "Пиши только по делу, без общих фраз вроде 'хорошая работа' или 'всё выполнено'. "
                "В каждом массиве strengths, concerns, questions, pr_review и report_review должно быть 2-4 конкретных пункта. "
                "Каждый пункт должен быть коротким, содержать сущность замечания и, если возможно, ссылку на наблюдаемый признак. "
                "Если в контексте нет данных, прямо напиши, чего именно не хватает. "
                "recommended_comment должен быть 2-4 предложения, пригодные для вставки преподавателем без переписывания. "
                "Ответь строго валидным JSON без markdown. JSON должен содержать ключи: "
                "summary, strengths, concerns, questions, pr_review, report_review, recommended_comment, confidence."
            ),
        },
        {
            "role": "user",
            "content": (
                "Сделай качественный преподавательский анализ сдачи. "
                "Нужны конкретные замечания, вопросы студенту и комментарий, который преподаватель может вставить в оценивание. "
                "Проверь отдельно: соответствие заданию, полноту отчёта, качество кода, качество PR/diff, воспроизводимость результата. "
                "Верни JSON.\n\n"
                + json.dumps(payload, ensure_ascii=False)
            ),
        },
    ]


def _ollama_base_url() -> str | None:
    parsed = urlparse(settings.OPENAI_BASE_URL.rstrip("/"))
    if "ollama" not in (parsed.hostname or "") and "11434" not in str(settings.OPENAI_BASE_URL):
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


async def _ensure_llm_warm() -> None:
    global _ollama_warm_until
    base_url = _ollama_base_url()
    if not base_url:
        return
    now = time.monotonic()
    if now < _ollama_warm_until:
        return
    payload = {
        "model": settings.OPENAI_MODEL,
        "prompt": " ",
        "stream": False,
        "keep_alive": f"{settings.AI_REVIEW_MODEL_KEEP_ALIVE_SECONDS}s",
        "options": {"num_predict": 1},
    }
    timeout = httpx.Timeout(30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{base_url}/api/generate", json=payload)
            response.raise_for_status()
        _ollama_warm_until = now + max(60.0, settings.AI_REVIEW_MODEL_KEEP_ALIVE_SECONDS * 0.8)
    except Exception:
        _ollama_warm_until = now + 60.0


def _get_llm_client() -> httpx.AsyncClient:
    global _llm_client
    if _llm_client is None:
        limits = httpx.Limits(max_connections=10, max_keepalive_connections=5, keepalive_expiry=300.0)
        _llm_client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.AI_REVIEW_TIMEOUT_SECONDS),
            limits=limits,
        )
    return _llm_client


async def _call_openai(messages: list[dict[str, str]]) -> dict[str, Any]:
    api_key = settings.OPENAI_API_KEY.strip()

    base_url = settings.OPENAI_BASE_URL.rstrip("/")
    url = f"{base_url}/chat/completions"
    payload = {
        "model": settings.OPENAI_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    await _ensure_llm_warm()
    client = _get_llm_client()
    response = await client.post(url, json=payload, headers=headers)
    if response.status_code >= 400:
        raise RuntimeError(f"LLM request failed: {response.status_code} {(response.text or '')[:300]}")
    data = response.json()
    content = (
        (((data.get("choices") or [{}])[0].get("message") or {}).get("content"))
        if isinstance(data, dict)
        else None
    )
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("LLM returned empty content")
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise RuntimeError("LLM returned non-object JSON")
    return parsed


def _merge_llm_review(
    llm: dict[str, Any],
    *,
    score: dict[str, Any],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    def _list_or_fallback(value: Any, fallback_value: list[str]) -> list[str]:
        items = _normalize_list(value)
        return items or list(fallback_value)

    review = {
        "mode": "llm",
        "model": settings.OPENAI_MODEL,
        "summary": str(llm.get("summary") or "").strip() or str(fallback["summary"]),
        "strengths": _list_or_fallback(llm.get("strengths"), fallback["strengths"]),
        "concerns": _list_or_fallback(llm.get("concerns"), fallback["concerns"]),
        "questions": _list_or_fallback(llm.get("questions"), fallback["questions"]),
        "pr_review": _list_or_fallback(llm.get("pr_review"), fallback["pr_review"]),
        "report_review": _list_or_fallback(llm.get("report_review"), fallback["report_review"]),
        "recommended_comment": str(llm.get("recommended_comment") or "").strip()
        or str(fallback["recommended_comment"]),
        "confidence": round(float(llm.get("confidence") or score["confidence"]), 2),
    }
    return _enforce_relevance_review(review, score=score)


def _prepend_unique(items: list[str], item: str, *, limit: int = 6) -> list[str]:
    normalized = [value for value in items if value != item]
    return [item, *normalized][:limit]


def _enforce_relevance_review(review: dict[str, Any], *, score: dict[str, Any]) -> dict[str, Any]:
    metrics = score["metrics"]
    report_words = int(metrics.get("report_words") or 0)
    relevance = float(metrics.get("report_relevance") or 0.0)
    if report_words >= 250 and relevance < 0.35:
        missing = ", ".join(metrics.get("report_missing_terms") or []) or "ключевые термины задания"
        warning = (
            f"Отчёт выглядит нерелевантным теме задания: релевантность {round(relevance * 100)}%, "
            f"не найдены признаки по теме ({missing})."
        )
        review["summary"] = (
            f"{warning} {review['summary']}"
            if warning not in str(review.get("summary") or "")
            else review["summary"]
        )
        review["concerns"] = _prepend_unique(list(review["concerns"]), warning)
        review["report_review"] = _prepend_unique(
            list(review["report_review"]),
            "Проверьте отчёт вручную: по ключевым признакам он не соответствует теме задания и не должен засчитываться только за объём.",
        )
        review["questions"] = _prepend_unique(
            list(review["questions"]),
            "Почему содержание отчёта не содержит ключевых признаков темы задания?",
        )
        review["recommended_comment"] = (
            "Отчёт необходимо переработать по существу задания: текущий текст не подтверждает выполнение именно этой работы. "
            + str(review.get("recommended_comment") or "")
        ).strip()
        review["confidence"] = min(float(review.get("confidence") or score["confidence"]), 0.75)
    return review


def _review_fingerprint(*, assignment: Assignment, student_id: UUID, submission: Submission | None, repo: _RepoContext, score: dict[str, Any], report_text: str, code_text: str) -> str:
    submission_attachment_meta = []
    if submission and isinstance(submission.attachments, list):
        for item in submission.attachments:
            if isinstance(item, dict):
                submission_attachment_meta.append(
                    {
                        "id": item.get("id"),
                        "kind": item.get("kind"),
                        "filename": item.get("original_filename") or item.get("filename"),
                        "size": item.get("file_size") or item.get("size"),
                        "uploaded_at": item.get("uploaded_at"),
                    }
                )
    repo_commit_meta = [
        {
            "sha": item.get("sha"),
            "message": item.get("message"),
            "date": item.get("date"),
        }
        for item in (repo.commits or [])[:10]
        if isinstance(item, dict)
    ]
    payload = {
        "cache_version": _AI_REVIEW_CACHE_VERSION,
        "assignment_id": str(assignment.id),
        "student_id": str(student_id),
        "submission": {
            "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
            "graded_at": submission.graded_at.isoformat() if submission and submission.graded_at else None,
            "answer_text": submission.answer_text if submission else None,
            "repository_url": submission.repository_url if submission else None,
            "attachments": submission_attachment_meta,
        },
        "repo": {
            "owner": repo.owner,
            "repo": repo.repo,
            "pull": repo.pull,
            "commits": repo_commit_meta,
            "diff": _trim(repo.diff, 2000),
        },
        "score": {
            "report_words": score["metrics"]["report_words"],
            "report_relevance": score["metrics"]["report_relevance"],
            "code_lines": score["metrics"]["code_lines"],
            "commits_count": score["metrics"]["commits_count"],
            "files_changed": score["metrics"]["files_changed"],
            "additions": score["metrics"]["additions"],
            "deletions": score["metrics"]["deletions"],
        },
        "report": report_text,
        "code": code_text,
        "diff": repo.diff,
    }
    return _stable_hash(payload)


def _cache_lookup(key: tuple[UUID, UUID, str], fingerprint: str) -> dict[str, Any] | None:
    entry = _review_cache.get(key)
    if not entry:
        return None
    if entry.fingerprint != fingerprint:
        return None
    if time.monotonic() >= entry.expires_at:
        _review_cache.pop(key, None)
        return None
    result = dict(entry.payload)
    metrics = result.get("metrics")
    if isinstance(metrics, dict):
        result["metrics"] = {**metrics, "analysis_cache_hit": True}
    return result


def _cache_store_memory(
    key: tuple[UUID, UUID, str],
    *,
    fingerprint: str,
    payload: dict[str, Any],
    provider_error: str | None,
) -> None:
    ttl = settings.AI_REVIEW_CACHE_TTL_SECONDS if not provider_error else min(120, settings.AI_REVIEW_CACHE_TTL_SECONDS)
    _review_cache[key] = _ReviewCacheEntry(
        fingerprint=fingerprint,
        payload=dict(payload),
        expires_at=time.monotonic() + max(10, ttl),
    )


def _cache_payload_for_db(payload: dict[str, Any]) -> dict[str, Any]:
    def _json_safe(value: Any) -> Any:
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {str(key): _json_safe(item) for key, item in value.items()}
        if isinstance(value, list):
            return [_json_safe(item) for item in value]
        if isinstance(value, tuple):
            return [_json_safe(item) for item in value]
        return value

    stored = _json_safe(dict(payload))
    if isinstance(stored, dict):
        stored.pop("generated_at", None)
    metrics = stored.get("metrics")
    if isinstance(metrics, dict):
        stored["metrics"] = {**metrics, "analysis_cache_hit": False}
    return stored


async def _persistent_cache_lookup(
    key: tuple[UUID, UUID, str],
    *,
    fingerprint: str,
) -> dict[str, Any] | None:
    assignment_id, student_id, model = key
    now = datetime.now(timezone.utc)
    async with SessionLocal() as cache_session:
        result = await cache_session.execute(
            select(AiReviewCache).where(
                AiReviewCache.assignment_id == assignment_id,
                AiReviewCache.student_id == student_id,
                AiReviewCache.model == model,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            return None
        if row.expires_at <= now:
            await cache_session.delete(row)
            await cache_session.commit()
            return None
        if row.fingerprint != fingerprint:
            return None
        payload = dict(row.payload or {})
        payload["generated_at"] = row.generated_at
        metrics = payload.get("metrics")
        if isinstance(metrics, dict):
            payload["metrics"] = {**metrics, "analysis_cache_hit": True}
        ttl_seconds = max(10, int((row.expires_at - now).total_seconds()))
        _review_cache[key] = _ReviewCacheEntry(
            fingerprint=fingerprint,
            payload=dict(payload),
            expires_at=time.monotonic() + ttl_seconds,
        )
        return payload


async def _persistent_cache_store(
    key: tuple[UUID, UUID, str],
    *,
    fingerprint: str,
    payload: dict[str, Any],
    provider_error: str | None,
) -> None:
    assignment_id, student_id, model = key
    now = datetime.now(timezone.utc)
    ttl = settings.AI_REVIEW_CACHE_TTL_SECONDS if not provider_error else min(120, settings.AI_REVIEW_CACHE_TTL_SECONDS)
    expires_at = now + timedelta(seconds=max(10, ttl))
    record = {
        "id": uuid4(),
        "assignment_id": assignment_id,
        "student_id": student_id,
        "model": model,
        "fingerprint": fingerprint,
        "payload": _cache_payload_for_db(payload),
        "provider_error": provider_error,
        "generated_at": payload.get("generated_at") or now,
        "expires_at": expires_at,
    }
    stmt = pg_insert(AiReviewCache).values(**record)
    stmt = stmt.on_conflict_do_update(
        index_elements=["assignment_id", "student_id", "model"],
        set_={
            "fingerprint": stmt.excluded.fingerprint,
            "payload": stmt.excluded.payload,
            "provider_error": stmt.excluded.provider_error,
            "generated_at": stmt.excluded.generated_at,
            "expires_at": stmt.excluded.expires_at,
            "updated_at": now,
        },
    )
    async with SessionLocal() as cache_session:
        await cache_session.execute(stmt)
        await cache_session.commit()


async def build_assignment_ai_review(
    session: AsyncSession,
    *,
    course: Course,
    assignment: Assignment,
    student_id: UUID,
) -> dict[str, Any]:
    cache_key = (assignment.id, student_id, settings.OPENAI_MODEL)
    loop = asyncio.get_running_loop()
    future: asyncio.Future[dict[str, Any]]
    creator = False
    async with _review_cache_lock:
        existing = _review_inflight.get(cache_key)
        if existing is None:
            future = loop.create_future()
            _review_inflight[cache_key] = future
            creator = True
        else:
            future = existing
    if not creator:
        return await future

    try:
        student = await session.get(User, student_id)
        if not student:
            raise ValueError("Student not found")

        submission_q = await session.execute(
            select(Submission).where(
                Submission.assignment_id == assignment.id,
                Submission.student_id == student_id,
            )
        )
        submission = submission_q.scalar_one_or_none()

        owner, repo_name = await resolve_assignment_repo_owner_and_name(
            session,
            assignment_id=assignment.id,
            student_id=student_id,
        )

        report_task = asyncio.to_thread(_submission_document_text, submission)
        code_task = _safe_student_code(owner, repo_name)
        repo_task = _repo_context_for_repo(owner=owner, repo_name=repo_name)
        (report_bundle, code_text, repo) = await asyncio.gather(report_task, code_task, repo_task)
        report_text, document_sources = report_bundle

        score = _score_context(
            assignment=assignment,
            report_text=report_text,
            code_text=code_text,
            repo=repo,
            submission=submission,
            document_sources=document_sources,
        )
        fingerprint = _review_fingerprint(
            assignment=assignment,
            student_id=student_id,
            submission=submission,
            repo=repo,
            score=score,
            report_text=report_text,
            code_text=code_text,
        )

        cached = _cache_lookup(cache_key, fingerprint)
        if cached is not None:
            async with _review_cache_lock:
                _review_inflight.pop(cache_key, None)
                if not future.done():
                    future.set_result(cached)
            return cached

        cached = await _persistent_cache_lookup(cache_key, fingerprint=fingerprint)
        if cached is not None:
            async with _review_cache_lock:
                _review_inflight.pop(cache_key, None)
                if not future.done():
                    future.set_result(cached)
            return cached

        provider_error: str | None = None
        try:
            fallback = _fallback_review(
                student=student,
                assignment=assignment,
                score=score,
                provider_error=None,
            )
            llm = await _call_openai(
                _build_prompt(
                    course=course,
                    assignment=assignment,
                    student=student,
                    submission=submission,
                    report_text=report_text,
                    code_text=code_text,
                    repo=repo,
                    score=score,
                )
            )
            review = _merge_llm_review(llm, score=score, fallback=fallback)
        except Exception as exc:
            provider_error = str(exc)
            review = _fallback_review(student=student, assignment=assignment, score=score, provider_error=provider_error)

        result = {
            "student_id": student.id,
            "student_full_name": student.full_name,
            "assignment_id": assignment.id,
            "generated_at": datetime.now(timezone.utc),
            "mode": review["mode"],
            "model": review["model"],
            "provider_error": provider_error,
            "overall_score": score["overall_score"],
            "confidence": review["confidence"],
            "summary": review["summary"],
            "strengths": review["strengths"],
            "concerns": review["concerns"],
            "questions": review["questions"],
            "pr_review": review["pr_review"],
            "report_review": review["report_review"],
            "recommended_comment": review["recommended_comment"],
            "rubric": score["rubric"],
            "metrics": {
                **score["metrics"],
                "analysis_cache_hit": False,
            },
        }
        _cache_store_memory(cache_key, fingerprint=fingerprint, payload=result, provider_error=provider_error)
        try:
            await _persistent_cache_store(
                cache_key,
                fingerprint=fingerprint,
                payload=result,
                provider_error=provider_error,
            )
        except Exception:
            pass
        async with _review_cache_lock:
            _review_inflight.pop(cache_key, None)
            if not future.done():
                future.set_result(result)
        return result
    except Exception as exc:
        async with _review_cache_lock:
            _review_inflight.pop(cache_key, None)
            if not future.done():
                future.set_exception(exc)
        raise
