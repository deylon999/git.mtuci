from __future__ import annotations

import ast
import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Literal

Severity = Literal["error", "warning", "info"]

_MAX_LINT_BYTES = 512_000


def _diag(
    *,
    line: int,
    column: int,
    message: str,
    severity: Severity = "error",
    end_line: int | None = None,
    end_column: int | None = None,
) -> dict[str, Any]:
    el = end_line if end_line is not None else line
    ec = end_column if end_column is not None else column + 1
    return {
        "line": max(1, line),
        "column": max(1, column),
        "end_line": max(1, el),
        "end_column": max(1, ec),
        "message": message,
        "severity": severity,
    }


def detect_language(filepath: str) -> str:
    name = (filepath or "").lower().rsplit("/", 1)[-1]
    if "." not in name:
        return "plaintext"
    ext = name.rsplit(".", 1)[-1]
    return {
        "py": "python",
        "pyw": "python",
        "js": "javascript",
        "jsx": "javascript",
        "mjs": "javascript",
        "cjs": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "json": "json",
        "yaml": "yaml",
        "yml": "yaml",
        "html": "html",
        "htm": "html",
        "css": "css",
        "scss": "scss",
        "less": "less",
        "md": "markdown",
        "sql": "sql",
        "sh": "shell",
        "bash": "shell",
        "go": "go",
        "rs": "rust",
        "java": "java",
        "c": "c",
        "h": "c",
        "cpp": "cpp",
        "cc": "cpp",
        "hpp": "cpp",
        "cs": "csharp",
        "php": "php",
        "rb": "ruby",
        "xml": "xml",
        "vue": "html",
    }.get(ext, "plaintext")


def _lint_python(content: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        ast.parse(content)
    except SyntaxError as exc:
        out.append(
            _diag(
                line=exc.lineno or 1,
                column=exc.offset or 1,
                message=f"Синтаксис Python: {exc.msg}",
            )
        )
        return out

    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "snippet.py"
            path.write_text(content, encoding="utf-8")
            proc = subprocess.run(
                ["ruff", "check", "--output-format=json", str(path)],
                capture_output=True,
                text=True,
                timeout=4,
            )
        if proc.stdout.strip():
            items = json.loads(proc.stdout)
            if isinstance(items, list):
                for item in items[:40]:
                    if not isinstance(item, dict):
                        continue
                    loc = item.get("location") if isinstance(item.get("location"), dict) else {}
                    out.append(
                        _diag(
                            line=int(loc.get("row") or 1),
                            column=int(loc.get("column") or 1),
                            end_line=int(loc.get("end_row") or loc.get("row") or 1),
                            end_column=int(loc.get("end_column") or loc.get("column") or 1) + 1,
                            message=str(item.get("message") or "Ruff"),
                            severity="warning"
                            if str(item.get("code") or "").startswith("W")
                            else "error",
                        )
                    )
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        pass

    return out


def _lint_json(content: str) -> list[dict[str, Any]]:
    try:
        json.loads(content)
    except json.JSONDecodeError as exc:
        return [
            _diag(
                line=exc.lineno or 1,
                column=exc.colno or 1,
                message=f"JSON: {exc.msg}",
            )
        ]
    return []


def _lint_yaml_basic(content: str) -> list[dict[str, Any]]:
    """Простые эвристики без PyYAML."""
    out: list[dict[str, Any]] = []
    for i, line in enumerate(content.splitlines(), start=1):
        if "\t" in line:
            out.append(
                _diag(
                    line=i,
                    column=line.index("\t") + 1,
                    message="YAML: лучше использовать пробелы, не табы",
                    severity="warning",
                )
            )
        if re.match(r"^\s*-\s*$", line):
            out.append(
                _diag(
                    line=i,
                    column=1,
                    message="YAML: пустой элемент списка",
                    severity="warning",
                )
            )
    return out[:20]


def _lint_shell_basic(content: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        if stripped.endswith(" ;"):
            out.append(
                _diag(
                    line=i,
                    column=len(line) - 1,
                    message="Лишний пробел перед «;»",
                    severity="warning",
                )
            )
    return out[:15]


def lint_file_content(filepath: str, content: str) -> dict[str, Any]:
    if len(content.encode("utf-8", errors="replace")) > _MAX_LINT_BYTES:
        return {
            "language": detect_language(filepath),
            "diagnostics": [],
            "linter": "none",
            "skipped": True,
            "message": "Файл слишком большой для проверки",
        }

    language = detect_language(filepath)
    diagnostics: list[dict[str, Any]] = []
    linter = "monaco"

    if language == "python":
        diagnostics = _lint_python(content)
        linter = "python-ast+ruff"
    elif language == "json":
        diagnostics = _lint_json(content)
        linter = "json"
    elif language in ("yaml", "yml"):
        language = "yaml"
        diagnostics = _lint_yaml_basic(content)
        linter = "yaml-basic"
    elif language == "shell":
        diagnostics = _lint_shell_basic(content)
        linter = "shell-basic"
    elif language in ("javascript", "typescript", "css", "html", "scss", "less"):
        linter = "monaco"

    return {
        "language": language,
        "diagnostics": diagnostics,
        "linter": linter,
        "skipped": False,
        "message": None,
    }
