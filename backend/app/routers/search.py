from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.folder_settings import FolderSettings
from app.models.folder_share import FolderShare
from app.models.user import User
from app.services.auth import get_current_user
from app.services.vector_store import search_with_scores

router = APIRouter(prefix="/api", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    k: int = 10
    folders: list[str] = []


class SearchResultItem(BaseModel):
    content: str
    source: str
    folder: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    query: str


@router.post("/search", response_model=SearchResponse)
async def search_documents(
    request: SearchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Keyword/semantic search: returns raw chunks ranked by similarity, no LLM involved."""
    folders = request.folders if request.folders else None
    shares = (
        db.query(FolderShare)
        .filter(FolderShare.grantee_id == current_user.id)
        .all()
    )
    shared_accesses = [(s.owner_id, s.folder_name) for s in shares]

    public_rows = (
        db.query(FolderSettings)
        .filter(FolderSettings.is_public == True, FolderSettings.user_id != current_user.id)  # noqa: E712
        .all()
    )
    public_accesses = [(row.user_id, row.folder_name) for row in public_rows]
    all_accesses = list({*map(tuple, shared_accesses), *map(tuple, public_accesses)}) or None

    raw = search_with_scores(
        request.query,
        user_id=current_user.id,
        k=request.k,
        folders=folders,
        shared_accesses=all_accesses,
    )

    results = [
        SearchResultItem(
            content=doc.page_content,
            source=doc.metadata.get("source", ""),
            folder=doc.metadata.get("folder", ""),
            score=score,
        )
        for doc, score in raw
    ]

    return SearchResponse(results=results, query=request.query)
