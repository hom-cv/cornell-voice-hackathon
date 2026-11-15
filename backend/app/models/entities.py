from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models._base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    pin_hash: Mapped[str] = mapped_column(String(256))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Aircraft(Base):
    __tablename__ = "aircraft"
    __table_args__ = (
        CheckConstraint("open_items >= 0", name="ck_aircraft_open_items"),
        CheckConstraint(
            "completed_items >= 0 AND total_items >= completed_items",
            name="ck_aircraft_progress",
        ),
    )

    registration: Mapped[str] = mapped_column(String(20), primary_key=True)
    model: Mapped[str] = mapped_column(String(80))
    location: Mapped[str] = mapped_column(String(160))
    work: Mapped[str] = mapped_column(String(300))
    due: Mapped[str] = mapped_column(String(100))
    open_items: Mapped[int] = mapped_column(default=0)
    completed_items: Mapped[int] = mapped_column(default=0)
    total_items: Mapped[int] = mapped_column(default=0)


class AircraftAssignment(Base):
    __tablename__ = "aircraft_assignments"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    aircraft_registration: Mapped[str] = mapped_column(
        ForeignKey("aircraft.registration", ondelete="CASCADE"), primary_key=True
    )


class LoginSession(Base):
    __tablename__ = "login_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WorkItem(Base):
    __tablename__ = "work_items"
    __table_args__ = (
        CheckConstraint(
            "status IN ('not_started', 'open', 'in_progress', 'blocked', 'done')",
            name="ck_work_items_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    aircraft_registration: Mapped[str] = mapped_column(
        ForeignKey("aircraft.registration", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    area: Mapped[str] = mapped_column(String(160))
    assignee_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(20), default="not_started")
    stopped_at: Mapped[str] = mapped_column(String(1000), default="")
    left_open: Mapped[bool] = mapped_column(Boolean, default=False)
    manual_reference: Mapped[str] = mapped_column(
        String(300), default="", server_default=""
    )
    found: Mapped[str] = mapped_column(String(2000), default="", server_default="")
    work_done: Mapped[str] = mapped_column(String(2000), default="", server_default="")
    next_action: Mapped[str] = mapped_column(
        String(1000), default="", server_default=""
    )
    photo_data: Mapped[str] = mapped_column(Text, default="", server_default="")
    handoff_review_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )


class Handoff(Base):
    __tablename__ = "handoffs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'confirmed', 'completed')",
            name="ck_handoffs_status",
        ),
        CheckConstraint(
            "incoming_user_id IS NULL OR incoming_user_id <> outgoing_user_id",
            name="ck_handoffs_different_employees",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    aircraft_registration: Mapped[str] = mapped_column(
        ForeignKey("aircraft.registration", ondelete="RESTRICT"), index=True
    )
    outgoing_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    incoming_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    status: Mapped[str] = mapped_column(String(20), default="draft")
    snapshot: Mapped[dict] = mapped_column(JSON)
    snapshot_hash: Mapped[str] = mapped_column(String(64))
    report: Mapped[str] = mapped_column(Text)
    answers: Mapped[list] = mapped_column(JSON, default=list)
    acknowledgements: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HandoffPreview(Base):
    __tablename__ = "handoff_previews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    aircraft_registration: Mapped[str] = mapped_column(
        ForeignKey("aircraft.registration", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    board_hash: Mapped[str] = mapped_column(String(64))
    answers: Mapped[list] = mapped_column(JSON)
    candidates: Mapped[dict] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    handoff_id: Mapped[str | None] = mapped_column(
        ForeignKey("handoffs.id", ondelete="RESTRICT")
    )
