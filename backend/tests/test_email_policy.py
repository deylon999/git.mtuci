import pytest
from pydantic import ValidationError

from app.schemas.auth import AuthLoginRequest


def test_local_domain_is_accepted():
    # The documented dev admin (README, docker-compose ADMIN_EMAIL) must be able to sign in.
    assert AuthLoginRequest(email="admin@mtuci.local", password="x").email == "admin@mtuci.local"


def test_other_special_use_domains_stay_rejected():
    with pytest.raises(ValidationError):
        AuthLoginRequest(email="someone@example.invalid", password="x")
