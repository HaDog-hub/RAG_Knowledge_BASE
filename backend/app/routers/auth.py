import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth import (
    _DUMMY_HASH,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── request / response schemas ───────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 50:
            raise ValueError("用戶名長度須介於 3–50 字元。")
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
        if not all(c in allowed for c in v):
            raise ValueError("用戶名只能包含英數字、底線（_）和連字號（-）。")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密碼長度至少 8 字元。")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("請輸入有效的 Email 地址。")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    email: str | None = None


class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None
    created_at: str


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此用戶名已被使用。")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此 Email 已被註冊。")
    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        email=body.email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(user.id, user.username),
        username=user.username,
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == body.username).first()
    hash_to_check = user.hashed_password if user else _DUMMY_HASH
    if not verify_password(body.password, hash_to_check) or user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用戶名或密碼錯誤。",
        )
    return TokenResponse(
        access_token=create_access_token(user.id, user.username),
        username=user.username,
        email=user.email,
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at.isoformat(),
    )


class UpdateMeRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("請輸入有效的 Email 地址。")
        return v


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UpdateMeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update current user's email."""
    conflict = db.query(User).filter(User.email == body.email, User.id != current_user.id).first()
    if conflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此 Email 已被其他帳號使用。")
    current_user.email = body.email
    db.commit()
    db.refresh(current_user)
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at.isoformat(),
    )
