from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.assignment import GiteaCommitRead


def test_gitea_commit_allows_local_author_email() -> None:
    commit = GiteaCommitRead(
        sha="abc123",
        message="Initial commit",
        author={"name": "Gitea Admin", "email": "admin@gitea.local"},
        date=datetime.now(timezone.utc),
    )

    assert commit.author.email == "admin@gitea.local"
