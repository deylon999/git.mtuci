from app.services import mtuci_service


def test_mtuci_dependency_guard_raises_when_package_missing(monkeypatch) -> None:
    monkeypatch.setattr(mtuci_service, "_MTUCI_PRIVATE_AVAILABLE", False)

    try:
        mtuci_service._ensure_mtuci_private_available()
    except mtuci_service.MTUCIIntegrationUnavailableError:
        return

    raise AssertionError("Expected MTUCIIntegrationUnavailableError when dependency is missing")
