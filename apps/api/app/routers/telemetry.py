"""Built-in error log: the site reports crashes here; the API records its own failures."""

import logging
from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.deps import CurrentUser, DbSession, SettingsDep, get_optional_user, rate_limiter
from app.models import ClientError, User
from app.services.accounts import is_owner

log = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["telemetry"])

_MAX_STORED = 2000  # keep the table small on the free database


class ErrorReport(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    stack: str = Field(default="", max_length=4000)
    page: str = Field(default="", max_length=300)


class ErrorOut(BaseModel):
    id: int
    created_at: str
    source: str
    page: str
    message: str
    stack: str
    user_agent: str


class ErrorGroup(BaseModel):
    message: str
    source: str
    count: int
    last_seen: str
    sample: ErrorOut


def record_error(
    db: Session,
    *,
    source: str,
    message: str,
    stack: str = "",
    page: str = "",
    user_agent: str = "",
    user_id: str | None = None,
) -> None:
    db.add(
        ClientError(
            source=source,
            message=message[:1000],
            stack=stack[:4000],
            page=page[:300],
            user_agent=user_agent[:300],
            user_id=user_id,
        )
    )
    db.commit()
    # Trim the oldest rows so the log never grows without bound.
    ids = db.exec(select(ClientError.id).order_by(ClientError.id.desc()).offset(_MAX_STORED)).all()
    for stale in ids:
        row = db.get(ClientError, stale)
        if row:
            db.delete(row)
    if ids:
        db.commit()


@router.post("/error", status_code=status.HTTP_204_NO_CONTENT)
def report_error(body: ErrorReport, request: Request, db: DbSession, settings: SettingsDep) -> None:
    client = request.client.host if request.client else "unknown"
    rate_limiter.check(f"telemetry:{client}", 20)
    user: User | None = get_optional_user(request, db, settings)
    record_error(
        db,
        source="web",
        message=body.message,
        stack=body.stack,
        page=body.page,
        user_agent=request.headers.get("user-agent", ""),
        user_id=user.id if user else None,
    )


def _owner(user: CurrentUser, db: DbSession) -> User:
    if not is_owner(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The error log is private to the site owner.")
    return user


@router.get("/errors", response_model=list[ErrorGroup])
def list_errors(_: Annotated[User, Depends(_owner)], db: DbSession, limit: int = 300) -> list[ErrorGroup]:
    rows = db.exec(select(ClientError).order_by(ClientError.id.desc()).limit(min(limit, 1000))).all()
    counts = Counter((r.source, r.message) for r in rows)
    groups: dict[tuple[str, str], ErrorGroup] = {}
    for r in rows:  # newest first, so the first row per message is the latest sample
        key = (r.source, r.message)
        if key not in groups:
            sample = ErrorOut(
                id=r.id or 0,
                created_at=r.created_at.isoformat(),
                source=r.source,
                page=r.page,
                message=r.message,
                stack=r.stack,
                user_agent=r.user_agent,
            )
            groups[key] = ErrorGroup(
                message=r.message, source=r.source, count=counts[key], last_seen=sample.created_at, sample=sample
            )
    return list(groups.values())
