"""Public system metadata for the frontend footer and health displays."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.system import SystemInfoRead, build_system_info_read

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/info", response_model=SystemInfoRead)
async def system_info() -> SystemInfoRead:
    """Lightweight build info (no auth). Used by the app footer."""
    return build_system_info_read()
