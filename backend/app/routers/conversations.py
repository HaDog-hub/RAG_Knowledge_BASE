import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.conversation import Conversation, Message
from app.models.user import User
from app.services.auth import get_current_user
from app.services.llm import generate_title


def _parse_folders(folders_json: str) -> list[str]:
    try:
        v = json.loads(folders_json)
        return v if isinstance(v, list) else []
    except (ValueError, TypeError):
        return []


def _parse_sources(sources_json: str | None) -> list[str]:
    if not sources_json:
        return []
    try:
        v = json.loads(sources_json)
        return v if isinstance(v, list) else []
    except (ValueError, TypeError):
        return []


def _get_user_conv_or_404(db: Session, conv_id: int, user_id: str) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if conv is None or conv.user_id != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conv


class CreateConversationRequest(BaseModel):
    folders: list[str] = []


class RenameConversationRequest(BaseModel):
    title: str


class AddMessagesRequest(BaseModel):
    user_msg: str
    assistant_msg: str
    sources: list[str] = []


router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("")
async def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [
        {
            "id": c.id,
            "title": c.title,
            "folders": _parse_folders(c.folders_json),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in rows
    ]


@router.get("/{conv_id}")
async def get_conversation(
    conv_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)
    return {
        "id": conv.id,
        "title": conv.title,
        "folders": _parse_folders(conv.folders_json),
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "sources": _parse_sources(m.sources_json),
            }
            for m in conv.messages
        ],
    }


@router.post("")
async def create_conversation(
    body: CreateConversationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = Conversation(
        user_id=current_user.id,
        title=None,
        folders_json=json.dumps(body.folders, ensure_ascii=False),
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {
        "id": conv.id,
        "title": conv.title,
        "folders": _parse_folders(conv.folders_json),
        "updated_at": conv.updated_at.isoformat(),
    }


@router.patch("/{conv_id}")
async def rename_conversation(
    conv_id: int,
    body: RenameConversationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="標題不能為空。")
    if len(title) > 100:
        raise HTTPException(status_code=400, detail="標題不能超過 100 字元。")
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)
    conv.title = title
    db.commit()
    return {"ok": True}


@router.post("/{conv_id}/messages")
async def add_messages(
    conv_id: int,
    body: AddMessagesRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)

    # Append user message + assistant message in one transaction
    db.add(Message(
        conversation_id=conv.id,
        role="user",
        content=body.user_msg,
        sources_json=None,
    ))
    db.add(Message(
        conversation_id=conv.id,
        role="assistant",
        content=body.assistant_msg,
        sources_json=json.dumps(body.sources, ensure_ascii=False) if body.sources else None,
    ))

    # First turn → generate title
    new_title: str | None = None
    if conv.title is None:
        new_title = generate_title(body.user_msg, body.assistant_msg)
        conv.title = new_title

    conv.updated_at = datetime.now(timezone.utc)
    db.commit()

    response: dict = {"ok": True}
    if new_title is not None:
        response["title"] = new_title
    return response


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)
    db.delete(conv)
    db.commit()
    return {"ok": True}
