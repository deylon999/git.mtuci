"""Helpers for turning client-supplied upload names into safe on-disk paths."""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import HTTPException, status

_FILENAME_SAFE_RE = re.compile(r"[^0-9A-Za-zА-Яа-яЁё._ -]+")


def safe_upload_filename(filename: str | None) -> str:
    raw = (filename or "attachment").strip().replace("\\", "_").replace("/", "_")
    cleaned = _FILENAME_SAFE_RE.sub("_", raw).strip(" ._")
    return cleaned[:160] or "attachment"


def path_within(base_dir: Path, filename: str) -> Path:
    """Join ``filename`` onto ``base_dir`` and reject anything that escapes it."""
    base = os.path.normpath(os.path.abspath(base_dir))
    full = os.path.normpath(os.path.join(base, filename))
    if not full.startswith(base + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file name")
    return Path(full)
