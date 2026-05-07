from __future__ import annotations

import base64
from typing import Any

import httpx

from app.core.config import settings

GITEA_ADMIN_USERNAME = settings.GITEA_ADMIN_USERNAME


def _get_auth_headers() -> dict[str, str]:
    """
    Возвращает заголовки авторизации для Gitea API.
    Использует token если задан, иначе basic auth с admin credentials.
    """
    if settings.GITEA_TOKEN:
        return {"Authorization": f"token {settings.GITEA_TOKEN}"}

    # Basic auth с admin credentials
    credentials = f"{settings.GITEA_ADMIN_USERNAME}:{settings.GITEA_ADMIN_PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


async def create_repo(repo_name: str) -> str:
    """
    Создаёт репозиторий в Gitea через REST API.
    Repo создаётся как публичный/приватный по дефолту: public (private=false).
    """
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/user/repos"

    headers = _get_auth_headers()
    payload = {"name": repo_name, "private": False}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(api_url, headers=headers, json=payload)

    if resp.status_code == 409:
        # Репозиторий уже существует — считаем это idempotent-успехом.
        return repo_name

    if resp.status_code not in (200, 201):
        # Пытаемся отдать понятную ошибку.
        raise RuntimeError(f"Gitea create repo failed: {resp.status_code} {resp.text}")

    return repo_name


async def list_repo_commits_page(
    *,
    owner: str,
    repo: str,
    limit: int = 100,
    page: int = 1,
) -> tuple[list[dict[str, Any]], bool]:
    """
    Возвращает одну страницу коммитов репозитория.
    Порядок в ответе Gitea обычно от новых к старым, но для корректности логику
    лучше делать с учётом этого уже на уровне маршрута.
    """
    base_url = settings.GITEA_URL.rstrip("/")
    api_url = f"{base_url}/api/v1/repos/{owner}/{repo}/commits"
    headers = _get_auth_headers()

    params = {"limit": limit, "page": page}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(api_url, headers=headers, params=params)

    # Gitea возвращает 409, если репозиторий пустой (нет ни одного коммита).
    if resp.status_code == 409:
        return [], False

    if resp.status_code != 200:
        raise RuntimeError(f"Gitea list commits failed: {resp.status_code} {resp.text}")

    data = resp.json()
    has_more_raw = resp.headers.get("X-HasMore")
    if has_more_raw is None:
        # Fallback, если заголовок не пришёл.
        has_more = isinstance(data, list) and len(data) == limit
    else:
        has_more = str(has_more_raw).lower() == "true"
    return data, has_more


async def list_repo_commits(
    *,
    owner: str,
    repo: str,
    limit: int = 100,
    max_pages: int = 20,
) -> list[dict[str, Any]]:
    commits: list[dict[str, Any]] = []
    page = 1

    while page <= max_pages:
        chunk, has_more = await list_repo_commits_page(
            owner=owner,
            repo=repo,
            limit=limit,
            page=page,
        )
        commits.extend(chunk)
        if not has_more or not chunk:
            break
        page += 1

    return commits


async def get_repo_contents(*, owner: str, repo: str, filepath: str = "") -> Any:
    """
    Обёртка над Gitea Contents API:
    GET /api/v1/repos/{owner}/{repo}/contents/{filepath}
    """
    base_url = settings.GITEA_URL.rstrip("/")
    headers = _get_auth_headers()

    cleaned = filepath.lstrip("/")
    if cleaned:
        api_url = f"{base_url}/api/v1/repos/{owner}/{repo}/contents/{cleaned}"
    else:
        # Для корня Gitea ожидает /contents/ (с trailing slash).
        api_url = f"{base_url}/api/v1/repos/{owner}/{repo}/contents/"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(api_url, headers=headers)

    if resp.status_code != 200:
        raise RuntimeError(f"Gitea get contents failed: {resp.status_code} {resp.text}")

    return resp.json()


async def get_repo_file_content(*, owner: str, repo: str, filepath: str) -> str:
    """
    Возвращает декодированный текст файла из Content API (base64 -> UTF-8).
    """
    data = await get_repo_contents(owner=owner, repo=repo, filepath=filepath)
    if not isinstance(data, dict) or data.get("type") != "file":
        raise RuntimeError(f"Gitea file not found: {filepath}")

    content_b64 = data.get("content")
    if not content_b64:
        raise RuntimeError(f"Gitea file has empty content: {filepath}")

    raw = base64.b64decode(content_b64)
    return raw.decode("utf-8", errors="replace")

