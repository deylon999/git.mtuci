from __future__ import annotations

import pytest

from app.services.git_auth_service import evaluate_git_operation_access


@pytest.mark.parametrize(
    "operation,private,role,method,scopes,ssh_key,allowed,reason",
    [
        # Public clone
        ("clone", False, None, "anonymous", [], False, True, "ok_public_anonymous_clone"),
        ("clone", False, None, "pat", [], False, True, "ok"),
        ("clone", False, "read", "pat", [], False, True, "ok"),
        ("clone", False, "read", "ssh", [], True, True, "ok"),
        ("clone", False, "read", "ssh", [], False, False, "ssh_key_missing"),
        # Public push
        ("push", False, None, "anonymous", [], False, False, "insufficient_repo_role_for_push"),
        ("push", False, "read", "pat", ["repo:write"], False, False, "insufficient_repo_role_for_push"),
        ("push", False, "write", "pat", ["repo:read"], False, False, "pat_scope_missing_for_push"),
        ("push", False, "write", "pat", ["repo:write"], False, True, "ok"),
        ("push", False, "admin", "pat", ["repo:admin"], False, True, "ok"),
        ("push", False, "admin", "ssh", [], True, True, "ok"),
        ("push", False, "admin", "ssh", [], False, False, "ssh_key_missing"),
        # Private clone
        ("clone", True, None, "anonymous", [], False, False, "insufficient_repo_role_for_private_read"),
        ("clone", True, None, "pat", ["repo:read"], False, False, "insufficient_repo_role_for_private_read"),
        ("clone", True, "read", "anonymous", [], False, False, "authentication_required"),
        ("clone", True, "read", "pat", [], False, False, "pat_scope_missing_for_private_repo"),
        ("clone", True, "read", "pat", ["repo:read"], False, True, "ok"),
        ("clone", True, "read", "pat", ["repo"], False, True, "ok"),
        ("clone", True, "write", "pat", ["repo:write"], False, True, "ok"),
        ("clone", True, "admin", "pat", ["repo:admin"], False, True, "ok"),
        ("clone", True, "admin", "ssh", [], True, True, "ok"),
        ("clone", True, "admin", "ssh", [], False, False, "ssh_key_missing"),
        # Private push
        ("push", True, None, "ssh", [], True, False, "insufficient_repo_role_for_private_read"),
        ("push", True, "read", "ssh", [], True, False, "insufficient_repo_role_for_push"),
        ("push", True, "write", "anonymous", [], False, False, "authentication_required"),
        ("push", True, "write", "pat", ["repo:read"], False, False, "pat_scope_missing_for_push"),
        ("push", True, "write", "pat", ["repo:write"], False, True, "ok"),
        ("push", True, "admin", "pat", ["repo"], False, True, "ok"),
        ("push", True, "admin", "ssh", [], True, True, "ok"),
        ("push", True, "admin", "ssh", [], False, False, "ssh_key_missing"),
        # Scope normalization / case-insensitive checks
        ("push", True, "write", "pat", [" REPO:WRITE ", "x"], False, True, "ok"),
        ("clone", True, "read", "pat", [" Repo:Read "], False, True, "ok"),
        ("clone", True, "read", "pat", None, False, False, "pat_scope_missing_for_private_repo"),
        ("push", True, "write", "pat", None, False, False, "pat_scope_missing_for_private_repo"),
        ("push", False, "write", "pat", [], False, False, "pat_scope_missing_for_push"),
        ("clone", False, "   ", "anonymous", [], False, True, "ok_public_anonymous_clone"),
        ("clone", True, "   ", "anonymous", [], False, False, "insufficient_repo_role_for_private_read"),
        ("clone", True, "WRITE", "pat", ["repo:write"], False, True, "ok"),
        ("push", True, "AdMiN", "pat", ["repo:admin"], False, True, "ok"),
        ("push", True, "admin", "pat", ["repo:read", "x:y"], False, False, "pat_scope_missing_for_push"),
        ("clone", True, "read", "ssh", [], False, False, "ssh_key_missing"),
        ("push", False, "write", "ssh", [], False, False, "ssh_key_missing"),
        ("push", False, "write", "ssh", [], True, True, "ok"),
        # Operation/auth normalization
        ("  PUSH ", True, "write", " PAT ", ["repo:write"], False, True, "ok"),
        ("clone", True, "read", " SSH ", [], True, True, "ok"),
        # Unsupported operation / auth method
        ("fetch", False, "read", "pat", ["repo:read"], False, False, "unsupported_operation"),
        ("clone", False, "read", "oauth", ["repo:read"], False, False, "unsupported_auth_method"),
        ("push", False, "maintain", "pat", ["repo:write"], False, False, "insufficient_repo_role_for_push"),
    ],
)
def test_git_auth_matrix(operation, private, role, method, scopes, ssh_key, allowed, reason) -> None:
    ok, why = evaluate_git_operation_access(
        operation=operation,
        repository_private=private,
        repo_role=role,
        auth_method=method,
        pat_scopes=scopes,
        has_ssh_key=ssh_key,
    )
    assert ok is allowed
    assert why == reason
