# mtuci-private-api integration

The backend uses the package `mtuci-private-api` for LK MTUCI profile/attendance sync.

## Install

The dependency is already listed in `backend/requirements.txt`:

```bash
pip install -r backend/requirements.txt
```

If your environment cannot access the package index where `mtuci-private-api` is published, use one of the options below.

## Option A: internal mirror (recommended for production)

1. Publish `mtuci-private-api` to your internal PyPI mirror.
2. Configure pip index URL for backend builds.
3. Reinstall requirements.

## Option B: local wheel

1. Build/download a wheel file, e.g. `mtuci_private_api-0.1.2-py3-none-any.whl`.
2. Install it before backend startup:

```bash
pip install ./wheels/mtuci_private_api-0.1.2-py3-none-any.whl
pip install -r backend/requirements.txt
```

## Runtime behavior when package is unavailable

Backend startup no longer crashes if `mtuci-private-api` is missing.
Endpoints that require LK integration return a clear integration-unavailable error instead.

This lets core repo/course functionality stay operational even if LK integration is temporarily unavailable.
