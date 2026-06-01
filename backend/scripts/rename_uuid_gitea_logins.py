from __future__ import annotations

import argparse
import asyncio
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import User
from app.services.gitea_service import _gitea_request
from app.utils.gitea_user import _normalize_login_candidate, gitea_owner_path

UUID_RE = re.compile(
    r"^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{32})$",
    re.IGNORECASE,
)


@dataclass
class PlatformUser:
    id: str
    email: str
    mtuci_login: str | None


@dataclass
class RenamePlan:
    old_login: str
    new_login: str
    user_email: str


def _is_uuid_login(value: str | None) -> bool:
    if not value:
        return False
    return bool(UUID_RE.fullmatch(value.strip()))


def _candidate(base: str, step: int) -> str:
    if step <= 1:
        return base
    suffix = str(step)
    return f"{base[: max(1, 40 - len(suffix))]}{suffix}"


async def _load_platform_users() -> list[PlatformUser]:
    async with SessionLocal() as session:
        rows = await session.execute(select(User.id, User.email, User.mtuci_login))
    result: list[PlatformUser] = []
    for row in rows.all():
        user_id, email, mtuci_login = row
        if not isinstance(email, str) or "@" not in email:
            continue
        result.append(
            PlatformUser(
                id=str(user_id),
                email=email.strip(),
                mtuci_login=mtuci_login.strip() if isinstance(mtuci_login, str) and mtuci_login.strip() else None,
            )
        )
    return result


async def _list_gitea_users(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    base_url = settings.GITEA_URL.rstrip("/")
    page = 1
    users: list[dict[str, Any]] = []
    while True:
        resp = await _gitea_request(
            client,
            "GET",
            f"{base_url}/api/v1/admin/users",
            params={"page": page, "limit": 50},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Gitea list users failed: {resp.status_code} {resp.text[:300]}")
        payload = resp.json()
        if not isinstance(payload, list) or not payload:
            break
        users.extend([item for item in payload if isinstance(item, dict)])
        page += 1
    return users


def _extract_login(user: dict[str, Any]) -> str:
    login = user.get("login") or user.get("username")
    return str(login or "").strip()


def _extract_email(user: dict[str, Any]) -> str | None:
    value = user.get("email")
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _resolve_target_login(base: str, old_login: str, occupied: set[str]) -> str:
    old_lower = old_login.lower()
    for step in range(1, 1000):
        candidate = _candidate(base, step)
        lower = candidate.lower()
        if lower == old_lower:
            return candidate
        if lower not in occupied:
            return candidate
    raise RuntimeError(f"Cannot allocate target login for {old_login}")


async def _rename_gitea_user(client: httpx.AsyncClient, old_login: str, new_login: str) -> None:
    base_url = settings.GITEA_URL.rstrip("/")
    resp = await _gitea_request(
        client,
        "POST",
        f"{base_url}/api/v1/admin/users/{gitea_owner_path(old_login)}/rename",
        headers={"Content-Type": "application/json"},
        json={"new_username": new_login},
    )
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Rename {old_login} -> {new_login} failed: {resp.status_code} {resp.text[:300]}")


async def run(*, apply: bool) -> int:
    platform_users = await _load_platform_users()
    by_email = {u.email.lower(): u for u in platform_users}
    by_mtuci = {u.mtuci_login.lower(): u for u in platform_users if u.mtuci_login}
    by_id = {u.id.lower(): u for u in platform_users}

    async with httpx.AsyncClient(timeout=30) as client:
        gitea_users = await _list_gitea_users(client)

        occupied = {(_extract_login(u)).lower() for u in gitea_users if _extract_login(u)}
        plans: list[RenamePlan] = []

        for gitea_user in gitea_users:
            old_login = _extract_login(gitea_user)
            if not _is_uuid_login(old_login):
                continue

            gitea_email = (_extract_email(gitea_user) or "").lower()
            platform_user = by_email.get(gitea_email) or by_mtuci.get(old_login.lower()) or by_id.get(old_login.lower())
            if not platform_user:
                print(f"skip: {old_login} (no matching platform user)")
                continue

            local_part = platform_user.email.split("@", 1)[0].strip()
            base = _normalize_login_candidate(local_part)
            if not base:
                print(f"skip: {old_login} (invalid email local part: {platform_user.email})")
                continue

            new_login = _resolve_target_login(base, old_login, occupied)
            if new_login.lower() == old_login.lower():
                print(f"keep: {old_login} (already aligned)")
                continue

            plans.append(RenamePlan(old_login=old_login, new_login=new_login, user_email=platform_user.email))
            occupied.discard(old_login.lower())
            occupied.add(new_login.lower())

        if not plans:
            print("nothing to rename")
            return 0

        print("planned renames:")
        for plan in plans:
            print(f"- {plan.old_login} -> {plan.new_login} ({plan.user_email})")

        if not apply:
            print("dry-run mode: add --apply to execute")
            return 0

        print("executing...")
        for plan in plans:
            await _rename_gitea_user(client, plan.old_login, plan.new_login)
            print(f"ok: {plan.old_login} -> {plan.new_login}")

    print("done")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Rename UUID-like Gitea logins to email-based logins")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default: dry-run)")
    args = parser.parse_args()

    raise SystemExit(asyncio.run(run(apply=args.apply)))


if __name__ == "__main__":
    main()
