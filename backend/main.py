from __future__ import annotations

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.routes.auth import router as auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.users import router as users_router
from app.api.routes.courses import router as courses_router
from app.api.routes.repositories import router as repositories_router
from app.api.routes.repository_access import router as repository_access_router
from app.api.routes.groups import router as groups_router
from app.api.routes.stats import router as stats_router
from app.api.routes.roles import router as roles_router
from app.api.routes.webhooks import router as webhooks_router
from app.api.routes.websocket import router as websocket_router
from app.api.routes.activity import router as activity_router
from app.api.routes.student_dashboard import router as student_dashboard_router
from app.api.routes.teacher_dashboard import router as teacher_dashboard_router
from app.api.routes.teacher_repositories import router as teacher_repositories_router
from app.api.routes.assistants_dashboard import router as assistants_dashboard_router
from app.api.routes.search import router as search_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.system import router as system_router
from app.api.routes.git_auth import router as git_auth_router
from app.api.routes.repository_settings import router as repository_settings_router
from app.api.routes.issues import router as issues_router
from app.api.routes.reviews import router as reviews_router
from app.api.routes.releases import router as releases_router
from app.api.routes.observability import router as observability_router
from app.core.config import settings
from app.services.gitea_service import check_gitea_api_access
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.logging_middleware import LoggingMiddleware
from app.core.metrics_middleware import MetricsMiddleware
from app.core.rate_limit_middleware import RateLimitMiddleware
from app.core.tracing_middleware import TracingMiddleware
from app.models.user import User, UserRole
from app.models.assignment_file import AssignmentFile  # Import BEFORE Assignment
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.repository import Repository
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from app.models.git_auth import UserGitToken, UserSshKey
from app.models.repo_settings import RepositoryBranchProtection, RepositoryWebhook, RepositoryDeployKey, RepositorySecret
from app.models.issue import Issue, IssueLabel, IssueMilestone, IssueComment, IssueReaction
from app.models.review import PullRequestReview, ReviewThread, ReviewComment
from app.models.search import SavedSearch
from app.models.release import RepositoryRelease, ReleaseAsset, RepositoryRegistryIntegration
from app.services.user_service import get_user_by_email, normalize_email


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_super_admin_if_missing()
    await verify_gitea_on_startup()
    yield


app = FastAPI(
    title="MTUCI API",
    description="MTUCI Git Management API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (dev + docker)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://frontend:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware for automatic request logging
app.add_middleware(LoggingMiddleware)

# Add metrics middleware for HTTP request statistics
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.RATE_LIMIT_RPM)
app.add_middleware(TracingMiddleware)

# Only avatars are public. Submissions and course files live in the same UPLOAD_DIR but are
# served by permission-checked endpoints, so the whole directory must not be mounted.
avatars_dir = Path(settings.UPLOAD_DIR) / "avatars"
avatars_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory=avatars_dir), name="avatars")

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(courses_router)
app.include_router(groups_router)
app.include_router(repositories_router, prefix="/repositories")
app.include_router(repository_access_router, prefix="/repositories")
app.include_router(stats_router)
app.include_router(roles_router)
app.include_router(webhooks_router)
app.include_router(websocket_router)
app.include_router(activity_router)
app.include_router(student_dashboard_router)
app.include_router(teacher_dashboard_router)
app.include_router(teacher_repositories_router)
app.include_router(assistants_dashboard_router)
app.include_router(search_router)
app.include_router(notifications_router)
app.include_router(system_router)
app.include_router(git_auth_router)
app.include_router(repository_settings_router)
app.include_router(issues_router)
app.include_router(reviews_router)
app.include_router(releases_router)
app.include_router(observability_router)
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


async def create_super_admin_if_missing() -> None:
    admin_email = (os.getenv("ADMIN_EMAIL") or "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD") or ""
    if not admin_email or not admin_password:
        return

    try:
        async with SessionLocal() as session:
            existing = await get_user_by_email(session, admin_email)
            if existing:
                # Only bootstrap a missing account. Re-promoting/unblocking an existing one on
                # every restart would undo a deliberate block and would hand admin rights to
                # whoever registered this email after the original account was deleted.
                if existing.role != UserRole.admin or existing.is_blocked:
                    print(f"[startup] ADMIN_EMAIL {admin_email} exists but is not an active admin; left unchanged")
                return

            session.add(
                User(
                    email=normalize_email(admin_email),
                    password_hash=hash_password(admin_password),
                    full_name="Super Admin",
                    role=UserRole.admin,
                    is_blocked=False,
                    is_pending=False,
                )
            )
            await session.commit()
    except Exception as e:
        # Не валим старт сервиса из-за проблем с созданием админа.
        print(f"[startup] Failed to create super admin: {e}")


async def verify_gitea_on_startup() -> None:
    ok, message = await check_gitea_api_access()
    if ok:
        print(f"[startup] {message}")
    else:
        print(f"[startup] WARNING: {message}")

