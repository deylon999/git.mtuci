"""Curated templates for repository creation (Gitea-compatible names + fallbacks)."""

from __future__ import annotations

GITIGNORE_OPTIONS: list[dict[str, str]] = [
    {"id": "", "label": "Без .gitignore"},
    {"id": "Python", "label": "Python"},
    {"id": "Node", "label": "Node"},
    {"id": "Go", "label": "Go"},
    {"id": "Rust", "label": "Rust"},
    {"id": "Java", "label": "Java"},
    {"id": "C++", "label": "C++"},
    {"id": "VisualStudio", "label": "Visual Studio"},
    {"id": "JetBrains", "label": "JetBrains (IDEA, PyCharm…)"},
]

# id must match Gitea options/license/* filenames (case-sensitive), not GitHub SPDX slugs.
LICENSE_OPTIONS: list[dict[str, str]] = [
    {"id": "", "label": "Без лицензии"},
    {"id": "MIT", "label": "MIT License"},
    {"id": "Apache-2.0", "label": "Apache License 2.0"},
    {"id": "GPL-3.0-only", "label": "GNU GPLv3"},
    {"id": "AGPL-3.0-only", "label": "GNU AGPLv3"},
    {"id": "BSD-2-Clause", "label": "BSD 2-Clause"},
    {"id": "BSD-3-Clause", "label": "BSD 3-Clause"},
    {"id": "Unlicense", "label": "The Unlicense"},
]

# Legacy API payloads (GitHub-style slugs) → Gitea license file names.
GITEA_LICENSE_ALIASES: dict[str, str] = {
    "mit": "MIT",
    "apache-2.0": "Apache-2.0",
    "gpl-3.0": "GPL-3.0-only",
    "agpl-3.0": "AGPL-3.0-only",
    "bsd-2-clause": "BSD-2-Clause",
    "bsd-3-clause": "BSD-3-Clause",
    "unlicense": "Unlicense",
}


VALID_GITIGNORE_IDS = {o["id"] for o in GITIGNORE_OPTIONS if o["id"]}
VALID_LICENSE_IDS = {o["id"] for o in LICENSE_OPTIONS if o["id"]}


def resolve_gitea_license_key(template_id: str | None) -> str | None:
    key = (template_id or "").strip()
    if not key:
        return None
    if key in VALID_LICENSE_IDS:
        return key
    return GITEA_LICENSE_ALIASES.get(key.lower())


def build_readme_markdown(*, name: str, description: str | None) -> str:
    desc = (description or "").strip()
    lines = [
        f"# {name}",
        "",
    ]
    if desc:
        lines.extend([desc, ""])
    lines.extend(
        [
            "Репозиторий на платформе **MTUCI Git**.",
            "",
            "## Быстрый старт",
            "",
            "```bash",
            "git clone <url-репозитория>",
            "cd " + name,
            "```",
            "",
        ]
    )
    return "\n".join(lines)
