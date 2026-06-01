from __future__ import annotations

from typing import Any

from app.data.repo_create_templates import build_readme_markdown, resolve_gitea_license_key
from app.services.gitea_service import create_repo_file, create_repository_for_owner


async def create_personal_repository_in_gitea(
    *,
    owner_username: str,
    owner_email: str | None = None,
    name: str,
    description: str | None,
    private: bool,
    add_readme: bool,
    gitignore_template: str | None,
    license_template: str | None,
) -> dict[str, Any]:
    """
    Create a Gitea repo with optional initial files.

  Uses Gitea native gitignores/license/readme when possible; custom README when only readme is requested.
    """
    gitignore = (gitignore_template or "").strip() or None
    license_key = resolve_gitea_license_key(license_template)

    if not add_readme and not gitignore and not license_key:
        return await create_repository_for_owner(
            owner_username=owner_username,
            owner_email=owner_email,
            name=name,
            description=description,
            private=private,
            auto_init=False,
        )

    readme_only = add_readme and not gitignore and not license_key

    if readme_only:
        meta = await create_repository_for_owner(
            owner_username=owner_username,
            owner_email=owner_email,
            name=name,
            description=description,
            private=private,
            auto_init=False,
        )
        actual_owner = (
            ((meta.get("owner") if isinstance(meta, dict) else {}) or {}).get("login")
            if isinstance(meta, dict)
            else None
        ) or owner_username
        await create_repo_file(
            owner=str(actual_owner),
            repo=name,
            filepath="README.md",
            content=build_readme_markdown(name=name, description=description),
            branch="main",
            message="Initial commit: add README",
        )
        return meta

    return await create_repository_for_owner(
        owner_username=owner_username,
        owner_email=owner_email,
        name=name,
        description=description,
        private=private,
        auto_init=True,
        gitignores=gitignore,
        license_key=license_key,
        readme="Default" if add_readme else None,
    )
