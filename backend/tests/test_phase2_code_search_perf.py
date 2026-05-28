from __future__ import annotations

import asyncio
import time
from uuid import uuid4


def test_code_search_perf_large_repo(monkeypatch) -> None:
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
                {"id": uuid4(), "name": "big-repo", "owner_id": uuid4(), "gitea_repo_name": "big", "repo_type": "public"},
            )()
            return _Result([repo])

        async def get(self, model, key):
            return type("Owner", (), {"mtuci_login": "owner", "email": "owner@test.local"})()

    paths = [f"src/module_{i}.py" for i in range(3000)] + [f"docs/note_{i}.md" for i in range(2000)]

    async def _paths(*args, **kwargs):
        return paths

    async def _content(*args, **kwargs):
        fp = kwargs.get("filepath", "")
        if fp.endswith("module_42.py"):
            return "def issue_token():\n    return 'ok'\n"
        return "def noop():\n    return 0\n"

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

    started = time.perf_counter()
    hits, facets = asyncio.run(
        svc.search_code_for_user(
            _Session(),
            user=user,
            query="issue_token",
            limit=20,
            filters=svc.CodeSearchFilters(path_prefix="src", symbol="issue_token"),
        )
    )
    elapsed = time.perf_counter() - started
    assert hits
    assert hits[0].path.endswith("module_42.py")
    assert "extensions" in facets
    # Smoke perf guardrail to detect accidental O(n^2) regressions.
    assert elapsed < 3.0
