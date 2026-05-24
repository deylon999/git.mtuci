"""System monitoring helpers: network rates, service probes, DB metrics."""
from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import psutil
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.repository import Repository
from app.models.student_repository import StudentRepository

_net_sample: tuple[float, int, int] | None = None


def sample_network_mbps() -> tuple[float, float]:
    """Return upload/download Mbps since the previous sample (or 0 on first call)."""
    global _net_sample
    counters = psutil.net_io_counters()
    now = time.time()
    sent = int(counters.bytes_sent)
    recv = int(counters.bytes_recv)

    if _net_sample is None:
        _net_sample = (now, sent, recv)
        return 0.0, 0.0

    prev_t, prev_sent, prev_recv = _net_sample
    elapsed = max(now - prev_t, 0.001)
    upload_mbps = round(((sent - prev_sent) * 8) / (elapsed * 1_000_000), 2)
    download_mbps = round(((recv - prev_recv) * 8) / (elapsed * 1_000_000), 2)
    _net_sample = (now, sent, recv)
    return max(upload_mbps, 0.0), max(download_mbps, 0.0)


def format_uptime(seconds: float | None) -> str | None:
    if seconds is None or seconds < 0:
        return None
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    if days > 0:
        return f"{days} д {hours} ч"
    if hours > 0:
        return f"{hours} ч {minutes} мин"
    return f"{minutes} мин"


def read_cpu_model() -> str:
    try:
        if os.path.exists("/proc/cpuinfo"):
            with open("/proc/cpuinfo", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "model name" in line.lower():
                        return line.split(":", 1)[1].strip()
        freq = psutil.cpu_freq()
        cores = psutil.cpu_count(logical=False) or psutil.cpu_count() or 1
        if freq and freq.max:
            return f"{cores} cores @ {freq.max:.0f} MHz"
        return f"{cores} cores"
    except Exception:
        return "Unknown"


def probe_http(url: str, *, timeout: float = 2.5) -> bool:
    try:
        response = httpx.get(url, timeout=timeout, follow_redirects=True)
        return response.status_code < 500
    except Exception:
        return False


def get_app_version() -> str:
    return os.getenv("APP_VERSION", "").strip() or "1.0.0"


def websocket_connection_count() -> int:
    total = 0
    try:
        from app.api.routes.websocket import manager as activity_manager

        total += len(activity_manager.active_connections)
    except Exception:
        pass
    try:
        from app.services.notification_realtime import notification_manager

        for conns in notification_manager._connections.values():
            total += len(conns)
    except Exception:
        pass
    return total


async def collect_database_metrics(session: AsyncSession) -> dict[str, Any]:
    connections_active: int | None = None
    connections_max: int | None = None
    size_mb: float | None = None
    tables_count: int | None = None
    last_migration: str | None = None
    cache_hit_rate: float | None = None
    deadlocks: int | None = None
    top_tables: list[dict[str, Any]] | None = None
    queries_per_sec: float | None = None
    avg_query_ms: float | None = None

    try:
        result = await session.execute(
            text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
        )
        connections_active = int(result.scalar() or 0)

        result = await session.execute(
            text("SELECT setting::int FROM pg_settings WHERE name = 'max_connections'")
        )
        connections_max = int(result.scalar() or 100)

        result = await session.execute(
            text("SELECT pg_database_size(current_database()) / 1024.0 / 1024.0")
        )
        size_mb = round(float(result.scalar() or 0), 1)

        result = await session.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        )
        tables_count = int(result.scalar() or 0)

        result = await session.execute(
            text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1")
        )
        row = result.scalar()
        last_migration = str(row) if row else None

        result = await session.execute(
            text(
                """
                SELECT round(
                    sum(blks_hit)::numeric / nullif(sum(blks_hit + blks_read), 0) * 100, 2
                )
                FROM pg_stat_database
                WHERE datname = current_database()
                """
            )
        )
        cache_hit_rate = float(result.scalar()) if result.scalar() is not None else None

        result = await session.execute(
            text(
                """
                SELECT deadlocks
                FROM pg_stat_database
                WHERE datname = current_database()
                """
            )
        )
        deadlocks = int(result.scalar() or 0)

        result = await session.execute(
            text(
                """
                SELECT
                    tablename,
                    pg_size_pretty(pg_total_relation_size('public.' || quote_ident(tablename))) AS size,
                    pg_total_relation_size('public.' || quote_ident(tablename)) AS size_bytes
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size('public.' || quote_ident(tablename)) DESC
                LIMIT 5
                """
            )
        )
        top_tables = [
            {
                "name": row.tablename,
                "size": row.size,
                "size_mb": round(float(row.size_bytes) / 1024 / 1024, 1),
            }
            for row in result
        ]

        try:
            result = await session.execute(
                text(
                    """
                    SELECT
                        COALESCE(sum(calls), 0)::float
                        / NULLIF(
                            EXTRACT(
                                EPOCH FROM (
                                    now() - COALESCE(
                                        (SELECT stats_reset FROM pg_stat_statements_info),
                                        now() - interval '1 hour'
                                    )
                                )
                            ),
                            0
                        ) AS qps,
                        avg(mean_exec_time) AS avg_time
                    FROM pg_stat_statements
                    """
                )
            )
            row = result.fetchone()
            if row and row.qps is not None:
                queries_per_sec = round(float(row.qps), 1)
            if row and row.avg_time is not None:
                avg_query_ms = round(float(row.avg_time), 1)
        except Exception:
            queries_per_sec = None
            avg_query_ms = None
    except Exception:
        pass

    return {
        "connections_active": connections_active,
        "connections_max": connections_max or 100,
        "size_mb": size_mb,
        "tables_count": tables_count,
        "queries_per_sec": queries_per_sec,
        "avg_query_ms": avg_query_ms,
        "cache_hit_rate": cache_hit_rate,
        "deadlocks": deadlocks,
        "last_migration": last_migration,
        "top_tables": top_tables,
    }


async def count_platform_repositories(session: AsyncSession) -> int:
    total = 0
    try:
        r1 = await session.execute(select(func.count(Repository.id)))
        total += int(r1.scalar() or 0)
    except Exception:
        pass
    try:
        r2 = await session.execute(select(func.count(StudentRepository.id)))
        total += int(r2.scalar() or 0)
    except Exception:
        pass
    return total


async def probe_gitea() -> dict[str, Any]:
    gitea_url = settings.GITEA_URL.rstrip("/")
    online = False
    version: str | None = None
    try:
        response = httpx.get(f"{gitea_url}/api/v1/version", timeout=2.5)
        if response.status_code == 200:
            online = True
            try:
                payload = response.json()
                version = str(payload.get("version") or "").strip() or None
            except Exception:
                version = response.text.strip('"').strip() or None
    except Exception:
        pass
    return {"online": online, "version": version, "uptime": None}


async def build_service_status(session: AsyncSession) -> dict[str, Any]:
    gitea = await probe_gitea()
    repo_count = await count_platform_repositories(session)

    api_uptime: str | None = None
    try:
        api_uptime = format_uptime(time.time() - psutil.Process().create_time())
    except Exception:
        api_uptime = None

    db_uptime: str | None = None
    db_version: str | None = None
    try:
        result = await session.execute(text("SELECT pg_postmaster_start_time()"))
        start_time = result.scalar()
        if start_time:
            started = start_time.replace(tzinfo=timezone.utc)
            uptime = datetime.now(timezone.utc) - started
            db_uptime = format_uptime(uptime.total_seconds())
    except Exception:
        db_uptime = None
    try:
        result = await session.execute(text("SELECT version()"))
        version_str = result.scalar()
        if version_str:
            match = re.search(r"PostgreSQL (\d+\.\d+)", version_str)
            if match:
                db_version = match.group(1)
    except Exception:
        db_version = None

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    frontend_probe_url = (settings.FRONTEND_HEALTH_URL or frontend_url).rstrip("/")
    frontend_online = probe_http(frontend_probe_url)
    ws_connections = websocket_connection_count()
    ws_online = True  # same process as API; endpoint is registered if we run

    services = [
        {
            "id": "api",
            "name": "FastAPI (mtuci-api)",
            "port": ":8000",
            "online": True,
            "uptime": api_uptime,
            "detail": get_app_version(),
        },
        {
            "id": "db",
            "name": "PostgreSQL (mtuci-postgres)",
            "port": ":5432",
            "online": True,
            "uptime": db_uptime,
            "detail": db_version,
        },
        {
            "id": "git",
            "name": "Gitea (mtuci-gitea)",
            "port": ":3000",
            "online": gitea["online"],
            "uptime": gitea.get("uptime"),
            "detail": gitea.get("version"),
        },
        {
            "id": "frontend",
            "name": "React Frontend (mtuci-frontend)",
            "port": ":3001",
            "online": frontend_online,
            "uptime": None,
            "detail": frontend_url if frontend_online else None,
        },
        {
            "id": "websocket",
            "name": "WebSocket (/ws/activity)",
            "port": "ws",
            "online": ws_online,
            "uptime": None,
            "detail": str(ws_connections),
        },
    ]

    return {
        "api": True,
        "db": True,
        "git": bool(gitea["online"]),
        "frontend": frontend_online,
        "websocket": ws_online,
        "git_uptime": gitea.get("uptime"),
        "git_version": gitea.get("version"),
        "db_uptime": db_uptime,
        "db_version": db_version,
        "api_uptime": api_uptime,
        "api_version": get_app_version(),
        "git_repos_count": repo_count,
        "websocket_connections": ws_connections,
        "frontend_url": frontend_url,
        "services": services,
    }
