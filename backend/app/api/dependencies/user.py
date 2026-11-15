from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import as_utc, hash_token, utc_now
from app.db.session import get_db
from app.models import LoginSession, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(401, "Please sign in.")
    session = db.get(LoginSession, hash_token(credentials.credentials))
    if session is None or as_utc(session.expires_at) <= utc_now():
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    user = db.get(User, session.user_id)
    if user is None or not user.active:
        raise HTTPException(401, "Please sign in.")
    return user
