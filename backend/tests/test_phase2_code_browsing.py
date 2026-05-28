from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest


def test_file_history_rejects_invalid_path() -> None:
    import app.services.student_dashboard_service as svc

    with pytest.raises(ValueError):
        asyncio.run(
            svc.get_student_repository_file_history(
                session=object(),
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                filepath="../secret.txt",
                branch="main",
            )
        )


def test_compare_refs_requires_base_and_head() -> None:
    import app.services.student_dashboard_service as svc

    with pytest.raises(ValueError):
        asyncio.run(
            svc.get_student_repository_compare_refs(
                session=object(),
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                base_ref="",
                head_ref="feature",
            )
        )


def test_compare_refs_rejects_invalid_git_ref() -> None:
    import app.services.student_dashboard_service as svc

    with pytest.raises(ValueError):
        asyncio.run(
            svc.get_student_repository_compare_refs(
                session=object(),
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                base_ref="../main",
                head_ref="feature",
            )
        )


def test_compare_refs_maps_response(monkeypatch) -> None:
    import app.services.gitea_service as gitea_service
    import app.services.student_dashboard_service as svc

    async def _fake_target(*args, **kwargs):
        return type("T", (), {"owner": "owner1", "repo_name": "repo1"})()

    async def _fake_compare(*args, **kwargs):
        return {
            "status": "ahead",
            "ahead_by": 3,
            "behind_by": 0,
            "total_commits": 3,
            "files": [
                {
                    "filename": "src/main.py",
                    "previous_filename": "src/old_main.py",
                    "status": "modified",
                    "additions": 5,
                    "deletions": 2,
                    "changes": 7,
                    "is_binary": False,
                    "too_large": False,
                    "truncated": False,
                }
            ],
        }

    monkeypatch.setattr(svc, "resolve_student_repo_gitea_target", _fake_target)
    monkeypatch.setattr(gitea_service, "compare_branches", _fake_compare)

    data = asyncio.run(
        svc.get_student_repository_compare_refs(
            session=object(),
            student_id=uuid4(),
            repo_item_id=str(uuid4()),
            base_ref="main",
            head_ref="feature",
        )
    )
    assert data["base"] == "main"
    assert data["head"] == "feature"
    assert data["ahead_by"] == 3
    assert data["files"][0]["filename"] == "src/main.py"
    assert data["files"][0]["previous_filename"] == "src/old_main.py"


def test_file_blame_rejects_invalid_path() -> None:
    import app.services.student_dashboard_service as svc

    with pytest.raises(ValueError):
        asyncio.run(
            svc.get_student_repository_file_blame(
                session=object(),
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                filepath="../secret.txt",
                branch="main",
            )
        )


def test_file_history_rejects_invalid_branch_ref() -> None:
    import app.services.student_dashboard_service as svc

    with pytest.raises(ValueError):
        asyncio.run(
            svc.get_student_repository_file_history(
                session=object(),
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                filepath="src/main.py",
                branch="../main",
            )
        )


def test_file_blame_maps_response(monkeypatch) -> None:
    import app.services.gitea_service as gitea_service
    import app.services.student_dashboard_service as svc

    async def _fake_target(*args, **kwargs):
        return type("T", (), {"owner": "owner1", "repo_name": "repo1"})()

    async def _fake_blame(*args, **kwargs):
        return [
            {
                "sha": "abcdef1234567890",
                "lines": ["a = 1", "b = 2"],
                "commit": {
                    "message": "init commit\nmore",
                    "author": {"name": "Dev One", "date": "2026-05-27T10:00:00Z"},
                },
                "author": {"login": "dev1"},
            }
        ]

    monkeypatch.setattr(svc, "resolve_student_repo_gitea_target", _fake_target)
    monkeypatch.setattr(gitea_service, "get_repo_file_blame", _fake_blame)

    data = asyncio.run(
        svc.get_student_repository_file_blame(
            session=object(),
            student_id=uuid4(),
            repo_item_id=str(uuid4()),
            filepath="src/main.py",
            branch="main",
        )
    )
    assert data["path"] == "src/main.py"
    assert len(data["chunks"]) == 1
    chunk = data["chunks"][0]
    assert chunk["sha"] == "abcdef1234567890"
    assert chunk["message"] == "init commit"
    assert chunk["start_line"] == 1
    assert chunk["end_line"] == 2


def test_file_history_uses_default_branch_when_not_provided(monkeypatch) -> None:
    import app.services.gitea_service as gitea_service
    import app.services.student_dashboard_service as svc

    async def _fake_target(*args, **kwargs):
        return type("T", (), {"owner": "owner1", "repo_name": "repo1"})()

    async def _fake_meta(*args, **kwargs):
        return {"default_branch": "develop"}

    async def _fake_commits(*args, **kwargs):
        assert kwargs.get("ref") == "develop"
        return ([], False)

    monkeypatch.setattr(svc, "resolve_student_repo_gitea_target", _fake_target)
    monkeypatch.setattr(gitea_service, "get_repo_metadata", _fake_meta)
    monkeypatch.setattr(gitea_service, "list_repo_commits_page", _fake_commits)

    data = asyncio.run(
        svc.get_student_repository_file_history(
            session=object(),
            student_id=uuid4(),
            repo_item_id=str(uuid4()),
            filepath="src/main.py",
            branch=None,
        )
    )
    assert data["branch"] == "develop"


def test_file_history_rejects_invalid_default_branch_from_metadata(monkeypatch) -> None:
    import app.services.gitea_service as gitea_service
    import app.services.student_dashboard_service as svc

    async def _fake_target(*args, **kwargs):
        return type("T", (), {"owner": "owner1", "repo_name": "repo1"})()

    async def _fake_meta(*args, **kwargs):
        return {"default_branch": "../bad"}

    async def _fake_commits(*args, **kwargs):
        return ([], False)

    monkeypatch.setattr(svc, "resolve_student_repo_gitea_target", _fake_target)
    monkeypatch.setattr(gitea_service, "get_repo_metadata", _fake_meta)
    monkeypatch.setattr(gitea_service, "list_repo_commits_page", _fake_commits)

    with pytest.raises(ValueError):
        asyncio.run(
            svc.get_student_repository_file_history(
                session=object(),
                student_id=uuid4(),
                repo_item_id=str(uuid4()),
                filepath="src/main.py",
                branch=None,
            )
        )


def test_compare_refs_skips_empty_filenames_and_normalizes_negative_counts(monkeypatch) -> None:
    import app.services.gitea_service as gitea_service
    import app.services.student_dashboard_service as svc

    async def _fake_target(*args, **kwargs):
        return type("T", (), {"owner": "owner1", "repo_name": "repo1"})()

    async def _fake_compare(*args, **kwargs):
        return {
            "status": "ahead",
            "ahead_by": 1,
            "behind_by": 0,
            "total_commits": 1,
            "files": [
                {"filename": "", "additions": 5, "deletions": 2, "changes": 7},
                {"filename": "src/main.py", "additions": -5, "deletions": -1, "changes": -9},
            ],
        }

    monkeypatch.setattr(svc, "resolve_student_repo_gitea_target", _fake_target)
    monkeypatch.setattr(gitea_service, "compare_branches", _fake_compare)

    data = asyncio.run(
        svc.get_student_repository_compare_refs(
            session=object(),
            student_id=uuid4(),
            repo_item_id=str(uuid4()),
            base_ref="main",
            head_ref="feature",
        )
    )
    assert len(data["files"]) == 1
    assert data["files"][0]["filename"] == "src/main.py"
    assert data["files"][0]["additions"] == 0
    assert data["files"][0]["deletions"] == 0
    assert data["files"][0]["changes"] == 0
