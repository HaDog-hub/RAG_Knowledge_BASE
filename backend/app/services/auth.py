from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User

# ── password hashing ─────────────────────────────────────────────────────────

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pre-computed dummy hash used during login to maintain constant-time behaviour
# even when the username does not exist (prevents user-enumeration via timing).
_DUMMY_HASH: str = _pwd_context.hash("__timing_sentinel__")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {
        "sub": user_id,
        "username": username,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ── auth dependency ──────────────────────────────────────────────────────────

_bearer = HTTPBearer()

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="認證失敗，請重新登入。",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """FastAPI dependency — validates JWT and returns the authenticated User."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise _CREDENTIALS_EXCEPTION
    except JWTError:
        raise _CREDENTIALS_EXCEPTION

    user = db.get(User, user_id)
    if user is None:
        raise _CREDENTIALS_EXCEPTION
    return user
