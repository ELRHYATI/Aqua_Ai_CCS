"""Password hashing and JWT access tokens."""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.core.config import Settings, get_settings


def verify_password(plain_password: str, password_hash: Optional[str]) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(user_id: UUID, settings: Optional[Settings] = None) -> str:
    s = settings or get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=s.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str, settings: Optional[Settings] = None) -> Optional[UUID]:
    s = settings or get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
        sub = payload.get("sub")
        if not sub:
            return None
        return UUID(str(sub))
    except (JWTError, ValueError, TypeError):
        return None
