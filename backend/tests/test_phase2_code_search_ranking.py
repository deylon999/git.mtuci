from __future__ import annotations

import asyncio
from uuid import uuid4


def test_score_match_prefers_symbol_and_returns_highlights() -> None:
    import app.services.code_search_service as svc

    score, snippet, highlights = svc._score_match(
        "auth token",
        "src/auth/service.py",
        "class AuthService:\n    def issue_token(self):\n        return 'x'\n",
        symbol="issue_token",
    )
    assert score > 0
    assert snippet is None or isinstance(snippet, str)
    assert highlights
    assert any("issue_token" in h for h in highlights)


def test_search_code_filters_path_contains_and_symbol(monkeypatch) -> None:
    import app.services.code_search_service as svc
    from app.models.user import User, UserRole

    class _Result:
        def __init__(self, rows):
            self._rows = rows

        def scalars(self):
            return self

        def all(self):
            return self._rows

    class _Session:
        async def execute(self, stmt):
            repo = type(
                "Repo",
                (),
                {"id": uuid4(), "name": "r1", "owner_id": uuid4(), "gitea_repo_name": "r1", "repo_type": "public"},
            )()
            return _Result([repo])

        async def get(self, model, key):
            return type("Owner", (), {"mtuci_login": "owner", "email": "owner@test.local"})()

    async def _paths(*args, **kwargs):
        return ["src/a.py", "docs/readme.md", "src/auth.py"]

    async def _content(*args, **kwargs):
        fp = kwargs.get("filepath", "")
        if fp == "src/auth.py":
            return "def issue_token():\n    return 1\n"
        if fp == "src/a.py":
            return "def ping():\n    return 1\n"
        return "# docs"

    monkeypatch.setattr(svc, "list_repo_file_paths", _paths)
    monkeypatch.setattr(svc, "get_repo_file_content", _content)

    user = User(
        id=uuid4(),
        email="u@test.local",
        password_hash="x",
        full_name="U",
        role=UserRole.admin,
        is_pending=False,
        is_blocked=False,
    )
    data, facets = asyncio.run(
        svc.search_code_for_user(
            _Session(),
            user=user,
            query="token",
            limit=20,
            filters=svc.CodeSearchFilters(path_contains="src/", symbol="issue_token"),
        )
    )
    assert len(data) == 1
    assert data[0].path == "src/auth.py"
    assert isinstance(facets, dict)
