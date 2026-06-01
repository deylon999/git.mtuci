from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.search import SavedSearch
from app.models.user import User
from app.schemas.search import SearchResponseRead
from app.schemas.search_extended import (
    CodeSearchResponseRead,
    SavedSearchCreate,
    SavedSearchRead,
    SavedSearchUpdate,
)
from app.services.code_search_service import (
    CodeSearchFilters,
    create_saved_search,
    list_saved_searches,
    search_code_for_user,
)
from app.services.search_service import search_for_user

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponseRead)
async def global_search(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
    page: int = Query(default=1, ge=1),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SearchResponseRead:
    return await search_for_user(session, user=current_user, query=q, limit=limit, page=page)


@router.get("/code", response_model=CodeSearchResponseRead)
async def code_search(
    q: str = Query(min_length=1, max_length=200),
    extension: str | None = Query(default=None, max_length=20),
    path_prefix: str | None = Query(default=None, max_length=200),
    path_contains: str | None = Query(default=None, max_length=200),
    symbol: str | None = Query(default=None, max_length=120),
    repo_id: str | None = Query(default=None, max_length=64),
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    sort: str = Query(default="relevance", pattern="^(relevance|path)$"),
    branch: str = Query(default="main", max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CodeSearchResponseRead:
    filters = CodeSearchFilters(
        extension=extension,
        path_prefix=path_prefix,
        path_contains=path_contains,
        symbol=symbol,
        repo_id=repo_id,
        min_score=min_score,
        sort=sort,
        branch=branch,
    )
    hits, facets = await search_code_for_user(session, user=current_user, query=q, limit=limit, filters=filters)
    return CodeSearchResponseRead(query=q, total=len(hits), facets=facets, hits=hits)


@router.get("/saved", response_model=list[SavedSearchRead])
async def saved_searches(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[SavedSearchRead]:
    return await list_saved_searches(session, user_id=current_user.id)


@router.post("/saved", response_model=SavedSearchRead, status_code=status.HTTP_201_CREATED)
async def saved_search_create(
    body: SavedSearchCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SavedSearchRead:
    entity = SavedSearch(
        user_id=current_user.id,
        name=body.name.strip(),
        query=body.query.strip(),
        search_type=body.search_type,
        filters_json=body.filters,
    )
    return await create_saved_search(session, entity=entity)


@router.patch("/saved/{saved_search_id}", response_model=SavedSearchRead)
async def saved_search_update(
    saved_search_id: str,
    body: SavedSearchUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SavedSearchRead:
    entity = await session.get(SavedSearch, saved_search_id)
    if not entity or entity.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found")
    if body.name is not None:
        entity.name = body.name.strip()
    if body.query is not None:
        entity.query = body.query.strip()
    if body.filters is not None:
        entity.filters_json = body.filters
    await session.commit()
    await session.refresh(entity)
    return entity


@router.delete("/saved/{saved_search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def saved_search_delete(
    saved_search_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    entity = await session.get(SavedSearch, saved_search_id)
    if not entity or entity.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found")
    await session.delete(entity)
    await session.commit()
