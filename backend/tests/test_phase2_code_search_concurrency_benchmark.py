from __future__ import annotations

import asyncio
import time
from uuid import uuid4


def test_code_search_concurrency_benchmark(monkeypatch) -> None:
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
                {"id": uuid4(), "name": "mono", "owner_id": uuid4(), "gitea_repo_name": "mono", "repo_type": "public"},
            )()
            return _Result([repo])

        async def get(self, model, key):
            return type("Owner", (), {"mtuci_login": "owner", "email": "owner@test.local"})()

    paths = [f"src/pkg_{i}/file_{j}.py" for i in range(120) for j in range(12)]

    async def _paths(*args, **kwargs):
        return paths

    async def _content(*args, **kwargs):
        fp = kwargs.get("filepath", "")
        if fp.endswith("file_7.py"):
            return "def issue_token(value):\n    return value\n"
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

    async def _one():
        hits, _ = await svc.search_code_for_user(
            _Session(),
            user=user,
            query="issue_token",
            limit=10,
            filters=svc.CodeSearchFilters(path_prefix="src", symbol="issue_token"),
        )
        return hits

    async def _run_many():
        return await asyncio.gather(*[_one() for _ in range(12)])

    started = time.perf_counter()
    results = asyncio.run(_run_many())
    elapsed = time.perf_counter() - started
    assert all(r for r in results)
    # Concurrency smoke benchmark for CI to catch major regressions.
    assert elapsed < 5.0
