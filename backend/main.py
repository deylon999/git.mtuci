from __future__ import annotations

import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.routes.auth import router as auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.users import router as users_router
from app.api.routes.courses import router as courses_router
from app.api.routes.repositories import router as repositories_router
from app.api.routes.groups import router as groups_router
from app.api.routes.stats import router as stats_router
from app.api.routes.roles import router as roles_router
from app.api.routes.webhooks import router as webhooks_router
from app.api.routes.websocket import router as websocket_router
from app.api.routes.activity import router as activity_router
from app.api.routes.student_dashboard import router as student_dashboard_router
from app.api.routes.teacher_dashboard import router as teacher_dashboard_router
from app.api.routes.assistants_dashboard import router as assistants_dashboard_router
from app.api.routes.search import router as search_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.system import router as system_router
from app.core.config import settings
from app.services.gitea_service import check_gitea_api_access
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.logging_middleware import LoggingMiddleware
from app.core.metrics_middleware import MetricsMiddleware
from app.models.user import User, UserRole
from app.models.assignment_file import AssignmentFile  # Import BEFORE Assignment
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.repository import Repository
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from sqlalchemy import select


app = FastAPI(
    title="MTUCI API",
    description="MTUCI Git Management API",
    version="1.0.0",
)

# CORS для работы фронтенда в Docker
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://frontend:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware for automatic request logging
app.add_middleware(LoggingMiddleware)

# Add metrics middleware for HTTP request statistics
app.add_middleware(MetricsMiddleware)

# Original FastAPI init continues belowtitle="MTUCI Lab Submission API", version="0.1.0")

# Mount uploads directory for serving avatar images
uploads_dir = Path(settings.UPLOAD_DIR)
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(courses_router)
app.include_router(groups_router)
app.include_router(repositories_router, prefix="/repositories")
app.include_router(stats_router)
app.include_router(roles_router)
app.include_router(webhooks_router)
app.include_router(websocket_router)
app.include_router(activity_router)
app.include_router(student_dashboard_router)
app.include_router(teacher_dashboard_router)
app.include_router(assistants_dashboard_router)
app.include_router(search_router)
app.include_router(notifications_router)
app.include_router(system_router)

# Development CORS:
# Frontend runs on http://localhost:3001 and API on http://localhost:8000.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def force_utf8_charset(request: Request, call_next):
    response = await call_next(request)
    content_type = response.headers.get("content-type")
    if content_type and "charset=" not in content_type.lower():
        response.headers["content-type"] = f"{content_type}; charset=utf-8"
    return response


@app.get("/", tags=["health"])
async def health_check():
    return {"status": "ok"}


@app.on_event("startup")
async def create_super_admin_if_missing() -> None:
    admin_email = (os.getenv("ADMIN_EMAIL") or "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD") or ""
    if not admin_email or not admin_password:
        return

    try:
        async with SessionLocal() as session:
            result = await session.execute(select(User).where(User.email == admin_email))
            existing = result.scalar_one_or_none()

            if not existing:
                existing = User(
                    email=admin_email,
                    password_hash=hash_password(admin_password),
                    full_name="Super Admin",
                    role=UserRole.admin,
                    is_blocked=False,
                    is_pending=False,
                )
                session.add(existing)
                await session.commit()
                await session.refresh(existing)
            else:
                # На случай, если пользователь уже существует, гарантируем права супер-админа.
                existing.role = UserRole.admin
                existing.is_blocked = False
                existing.is_pending = False
                session.add(existing)
                await session.commit()
    except Exception as e:
        # Не валим старт сервиса из-за проблем с созданием админа.
        print(f"[startup] Failed to create super admin: {e}")


@app.on_event("startup")
async def verify_gitea_on_startup() -> None:
    ok, message = await check_gitea_api_access()
    if ok:
        print(f"[startup] {message}")
    else:
        print(f"[startup] WARNING: {message}")

