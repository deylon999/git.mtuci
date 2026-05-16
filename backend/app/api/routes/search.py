from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.search import SearchResponseRead
from app.services.search_service import search_for_user

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponseRead)
async def global_search(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SearchResponseRead:
    return await search_for_user(session, user=current_user, query=q, limit=limit)
