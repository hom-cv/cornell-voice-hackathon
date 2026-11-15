import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.user import bearer, get_current_user
from app.core.security import as_utc, hash_pin, hash_token, utc_now, verify_pin
from app.core.settings import get_settings
from app.db.session import get_db
from app.models import LoginSession, User
from app.schemas.auth import EmployeeOut, LoginInput, LoginOut

router = APIRouter(prefix="/auth", tags=["Authentication"])
DUMMY_HASH = hash_pin(secrets.token_hex(16))


@router.get("/employees", response_model=list[EmployeeOut])
def employees(db: Session = Depends(get_db)):
    return db.scalars(
        select(User).where(User.active.is_(True)).order_by(User.name)
    ).all()


@router.post("/login", response_model=LoginOut)
def login(body: LoginInput, response: Response, db: Session = Depends(get_db)):
    # Serialize attempts for the employee across API workers.
    user = db.scalar(select(User).where(User.id == body.user_id).with_for_update())
    now = utc_now()
    if user and user.locked_until and as_utc(user.locked_until) > now:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    if not user or not user.active:
        verify_pin(body.pin, DUMMY_HASH)
        raise HTTPException(401, "Invalid employee or PIN.")
    if user.locked_until:
        user.failed_attempts = 0
        user.locked_until = None
    if not verify_pin(body.pin, user.pin_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
        db.commit()
        raise HTTPException(401, "Invalid employee or PIN.")
    user.failed_attempts = 0
    user.locked_until = None
    token = secrets.token_urlsafe(32)
    db.add(
        LoginSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=now + timedelta(hours=get_settings().SESSION_HOURS),
        )
    )
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return LoginOut(token=token, employee=EmployeeOut.model_validate(user))


@router.post("/logout", status_code=204)
def logout(
    user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    session = db.get(LoginSession, hash_token(credentials.credentials))
    db.delete(session)
    db.commit()
