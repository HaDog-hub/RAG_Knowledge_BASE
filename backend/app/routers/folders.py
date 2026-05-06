from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.folder_settings import FolderSettings
from app.models.folder_share import FolderShare
from app.models.user import User
from app.services.auth import get_current_user
from app.services.vector_store import (
    delete_folder,
    list_sources_by_folder,
    rename_folder,
)

router = APIRouter(prefix="/api/folders", tags=["folders"])


class RenameFolderRequest(BaseModel):
    new_name: str


class ShareRequest(BaseModel):
    email: str


class ShareEntry(BaseModel):
    username: str
    email: str | None
    grantee_id: str


class SharedFolderEntry(BaseModel):
    owner: str
    owner_id: str
    folder: str
    files: list[str]


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_user_by_email(email: str, db: Session) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def _folder_exists(user_id: str, folder_name: str) -> bool:
    from app.services.vector_store import get_files_in_folder
    return len(get_files_in_folder(user_id, folder_name)) > 0


# ── folder management ────────────────────────────────────────────────────────

@router.patch("/{folder_name}")
def rename_folder_endpoint(
    folder_name: str,
    body: RenameFolderRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    new_name = body.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="新資料夾名稱不能為空。")
    if new_name == folder_name:
        raise HTTPException(status_code=400, detail="新名稱與原名稱相同。")
    updated = rename_folder(folder_name, new_name, current_user.id)
    if updated == 0:
        raise HTTPException(status_code=404, detail="資料夾不存在或無文件。")
    # Update FolderShare records
    db.query(FolderShare).filter(
        FolderShare.owner_id == current_user.id,
        FolderShare.folder_name == folder_name,
    ).update({"folder_name": new_name})
    # Update FolderSettings record
    db.query(FolderSettings).filter(
        FolderSettings.user_id == current_user.id,
        FolderSettings.folder_name == folder_name,
    ).update({"folder_name": new_name})
    db.commit()
    return {"old_name": folder_name, "new_name": new_name, "updated_chunks": updated}


@router.delete("/{folder_name}", status_code=status.HTTP_200_OK)
def delete_folder_endpoint(
    folder_name: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    deleted = delete_folder(folder_name, current_user.id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="資料夾不存在或無文件。")
    # Clean up FolderShare records
    db.query(FolderShare).filter(
        FolderShare.owner_id == current_user.id,
        FolderShare.folder_name == folder_name,
    ).delete()
    # Clean up FolderSettings
    db.query(FolderSettings).filter(
        FolderSettings.user_id == current_user.id,
        FolderSettings.folder_name == folder_name,
    ).delete()
    db.commit()
    return {"folder": folder_name, "deleted_chunks": deleted}


class VisibilityRequest(BaseModel):
    is_public: bool


@router.put("/{folder_name}/visibility")
def set_folder_visibility(
    folder_name: str,
    body: VisibilityRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Toggle a folder between public and private."""
    existing = (
        db.query(FolderSettings)
        .filter_by(user_id=current_user.id, folder_name=folder_name)
        .first()
    )
    if existing:
        existing.is_public = body.is_public
    else:
        db.add(FolderSettings(user_id=current_user.id, folder_name=folder_name, is_public=body.is_public))
    db.commit()
    return {"folder": folder_name, "is_public": body.is_public}


# ── share management ─────────────────────────────────────────────────────────

@router.get("/{folder_name}/shares", response_model=list[ShareEntry])
def list_shares(
    folder_name: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    shares = (
        db.query(FolderShare)
        .filter(FolderShare.owner_id == current_user.id, FolderShare.folder_name == folder_name)
        .all()
    )
    result = []
    for s in shares:
        grantee = db.get(User, s.grantee_id)
        if grantee:
            result.append(ShareEntry(username=grantee.username, email=grantee.email, grantee_id=grantee.id))
    return result


@router.post("/{folder_name}/shares", status_code=status.HTTP_201_CREATED)
def add_share(
    folder_name: str,
    body: ShareRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if not _folder_exists(current_user.id, folder_name):
        raise HTTPException(status_code=404, detail="資料夾不存在。")

    grantee = _get_user_by_email(body.email, db)
    if grantee is None:
        raise HTTPException(status_code=404, detail="找不到使用此 Email 的用戶。")
    if grantee.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能與自己分享。")

    existing = (
        db.query(FolderShare)
        .filter(
            FolderShare.owner_id == current_user.id,
            FolderShare.folder_name == folder_name,
            FolderShare.grantee_id == grantee.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="已分享給此用戶。")

    share = FolderShare(owner_id=current_user.id, folder_name=folder_name, grantee_id=grantee.id)
    db.add(share)
    db.commit()
    return {"folder": folder_name, "grantee": grantee.username}


@router.delete("/{folder_name}/shares/{email}", status_code=status.HTTP_204_NO_CONTENT)
def remove_share(
    folder_name: str,
    email: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    grantee = _get_user_by_email(email, db)
    if grantee is None:
        raise HTTPException(status_code=404, detail="找不到使用此 Email 的用戶。")

    share = (
        db.query(FolderShare)
        .filter(
            FolderShare.owner_id == current_user.id,
            FolderShare.folder_name == folder_name,
            FolderShare.grantee_id == grantee.id,
        )
        .first()
    )
    if share is None:
        raise HTTPException(status_code=404, detail="分享記錄不存在。")

    db.delete(share)
    db.commit()


@router.get("/shared-with-me", response_model=list[SharedFolderEntry])
def shared_with_me(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Return all folders that other users have shared with the current user."""
    from app.services.vector_store import get_files_in_folder

    shares = (
        db.query(FolderShare)
        .filter(FolderShare.grantee_id == current_user.id)
        .all()
    )
    result = []
    for s in shares:
        owner = db.get(User, s.owner_id)
        if owner:
            files = get_files_in_folder(s.owner_id, s.folder_name)
            result.append(SharedFolderEntry(
                owner=owner.username,
                owner_id=s.owner_id,
                folder=s.folder_name,
                files=files,
            ))
    return result
