import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.folder_settings import FolderSettings
from app.models.folder_share import FolderShare
from app.models.user import User
from app.services.auth import get_current_user
from app.services.llm import generate_answer, stream_answer
from app.services.vector_store import similarity_search_comprehensive

router = APIRouter(prefix="/api", tags=["query"])


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class QueryRequest(BaseModel):
    question: str
    k: int = 4  # retained for API compatibility; actual retrieval uses comprehensive mode
    chat_history: list[ChatMessage] = []
    folders: list[str] = []  # empty = search all own folders


class QueryResponse(BaseModel):
    answer: str
    sources: list[str]


@router.post("/query", response_model=QueryResponse)
async def query(
    request: QueryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    folders = request.folders if request.folders else None

    # Automatically include all folders shared with current user
    shares = (
        db.query(FolderShare)
        .filter(FolderShare.grantee_id == current_user.id)
        .all()
    )
    shared_accesses = [(s.owner_id, s.folder_name) for s in shares]

    # Include all public folders from other users
    public_rows = (
        db.query(FolderSettings)
        .filter(FolderSettings.is_public == True, FolderSettings.user_id != current_user.id)  # noqa: E712
        .all()
    )
    public_accesses = [(row.user_id, row.folder_name) for row in public_rows]
    all_accesses = list({*map(tuple, shared_accesses), *map(tuple, public_accesses)}) or None

    docs = similarity_search_comprehensive(
        request.question,
        user_id=current_user.id,
        folders=folders,
        shared_accesses=all_accesses,
    )

    history = [m.model_dump() for m in request.chat_history]

    try:
        answer = generate_answer(request.question, docs, chat_history=history)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    sources = [s for s in {doc.metadata.get("source", "") for doc in docs} if s]
    return QueryResponse(answer=answer, sources=sources)


@router.post("/query/stream")
async def query_stream(
    request: QueryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """SSE endpoint: streams LLM tokens then emits sources and done signals."""
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

    docs = similarity_search_comprehensive(
        request.question,
        user_id=current_user.id,
        folders=folders,
        shared_accesses=all_accesses,
    )

    history = [m.model_dump() for m in request.chat_history]
    sources = [s for s in {doc.metadata.get("source", "") for doc in docs} if s]

    async def event_generator():
        try:
            async for token in stream_answer(request.question, docs, chat_history=history):
                yield f"data: {json.dumps(token)}\n\n"
            yield f"data: {json.dumps({'sources': sources})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except RuntimeError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
