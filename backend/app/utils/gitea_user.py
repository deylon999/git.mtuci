from __future__ import annotations

import re
from urllib.parse import quote

from app.models.user import User

_GITEA_USER_RE = re.compile(r"[^a-zA-Z0-9._-]+")

# Имена, которые Gitea не разрешает обычным пользователям (см. models/user/name.go).
_GITEA_RESERVED_USERNAMES = frozenset(
    {
        "admin",
        "api",
        "git",
        "assets",
        "css",
        "js",
        "img",
        "raw",
        "avatars",
        "explore",
        "issues",
        "pulls",
        "orgs",
        "org",
        "user",
        "repo",
        "login",
        "register",
        "install",
        "swagger",
        "metrics",
        "v2",
        "team",
        "administrator",
        "ghost",
        "notifications",
        "settings",
        "attachments",
    }
)


def _normalize_login_candidate(raw: str) -> str | None:
    login = raw.split("@", 1)[0].strip() if "@" in raw else raw.strip()
    login = _GITEA_USER_RE.sub("-", login).strip("-._")
    if not login:
        return None
    if login.lower() in _GITEA_RESERVED_USERNAMES:
        return None
    return login[:40]


def resolve_gitea_username(user: User | object) -> str:
    """
    Gitea owner for a platform user.
    Prefer email local-part (`name` in `name@example.com`) as canonical Gitea login.
    Never returns empty or strings with '@' (email in owner breaks Gitea API URLs).
    """
    candidates: list[str] = []
    mtuci_login = getattr(user, "mtuci_login", None)
    email = getattr(user, "email", None)
    login = getattr(user, "login", None)
    username = getattr(user, "username", None)

    if isinstance(email, str) and "@" in email:
        candidates.append(email.split("@", 1)[0].strip())
    if isinstance(mtuci_login, str) and mtuci_login.strip():
        candidates.append(mtuci_login.strip())
    if isinstance(login, str) and login.strip():
        candidates.append(login.strip())
    if isinstance(username, str) and username.strip():
        candidates.append(username.strip())

    for raw in candidates:
        login = _normalize_login_candidate(raw)
        if login:
            return login

    user_id = getattr(user, "id", None)
    fallback = f"u{str(user_id).replace('-', '')[:12]}" if user_id else ""
    return fallback or "student"


def gitea_owner_path(owner: str) -> str:
    """Encode owner for use in Gitea API URL paths."""
    return quote(owner, safe="._-")


def normalize_gitea_owner_repo(owner: str, repo: str) -> tuple[str, str]:
    """
    Ensure owner/repo are safe for Gitea API paths.
    Strips accidental emails and rejects empty values (empty owner → Gitea 401 name: ]).
    """
    raw_owner = (owner or "").strip()
    if "@" in raw_owner:
        raw_owner = raw_owner.split("@", 1)[0].strip()
    raw_owner = _GITEA_USER_RE.sub("-", raw_owner).strip("-._")

    repo_name = (repo or "").strip()
    if not raw_owner:
        raise ValueError(
            "Не удалось определить логин Gitea. Укажите mtuci_login в профиле (без @email)."
        )
    if not repo_name:
        raise ValueError("У репозитория нет имени в Gitea — пересоздайте репозиторий.")
    return raw_owner[:40], repo_name
