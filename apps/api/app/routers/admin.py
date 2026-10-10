"""The owner dashboard: usage, AI spend and health at a glance (owner only)."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import AIUsage, ClientError, Playlist, User
from app.services.accounts import is_owner
from app.services.guest import guest_ai_used_today

router = APIRouter(prefix="/admin", tags=["admin"])


class DayCount(BaseModel):
    day: str
    ai: int
    offline: int


class AIStats(BaseModel):
    calls_today: int
    tokens_today: int
    calls_month: int
    input_tokens_month: int
    output_tokens_month: int
    est_cost_month_usd: float
    price_input_per_mtok: float
    price_output_per_mtok: float
    model: str


class AdminStats(BaseModel):
    playlists_today: int
    playlists_7d: int
    playlists_30d: int
    playlists_by_day: list[DayCount]  # last 14 days, oldest first
    spotify_users: int
    guests_total: int
    active_users_7d: int
    guest_ai_used_today: int
    guest_ai_limit: int
    ai: AIStats
    shared_playlists: int
    featured_playlists: int
    errors_7d: int


def _owner(user: CurrentUser, db: DbSession) -> User:
    if not is_owner(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The dashboard is private to the site owner.")
    return user


def _count(db: Session, model, *where) -> int:
    return int(db.exec(select(func.count()).select_from(model).where(*where)).one())


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@router.get("/stats", response_model=AdminStats)
def admin_stats(_: Annotated[User, Depends(_owner)], db: DbSession) -> AdminStats:
    settings = get_settings()
    now = datetime.now(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since_14 = today - timedelta(days=13)

    recent = db.exec(
        select(Playlist.created_at, Playlist.ai_source, Playlist.user_id).where(
            Playlist.created_at >= today - timedelta(days=30)
        )
    ).all()
    by_day: dict[str, list[int]] = {(since_14 + timedelta(days=i)).strftime("%Y-%m-%d"): [0, 0] for i in range(14)}
    active: set[str] = set()
    p_today = p_7 = 0
    for created, source, user_id in recent:
        created = _aware(created)
        if created >= today:
            p_today += 1
        if created >= today - timedelta(days=6):
            p_7 += 1
            active.add(user_id)
        key = created.strftime("%Y-%m-%d")
        if key in by_day:
            by_day[key][0 if source == "claude" else 1] += 1

    month_prefix = now.strftime("%Y-%m-")
    usage_rows = db.exec(select(AIUsage).where(col(AIUsage.day).startswith(month_prefix))).all()
    today_row = next((r for r in usage_rows if r.day == now.strftime("%Y-%m-%d")), None)
    tokens_in = sum(r.input_tokens for r in usage_rows)
    tokens_out = sum(r.output_tokens for r in usage_rows)
    cost = tokens_in / 1e6 * settings.ai_price_input_per_mtok + tokens_out / 1e6 * settings.ai_price_output_per_mtok

    return AdminStats(
        playlists_today=p_today,
        playlists_7d=p_7,
        playlists_30d=len(recent),
        playlists_by_day=[DayCount(day=d, ai=v[0], offline=v[1]) for d, v in by_day.items()],
        spotify_users=_count(db, User, col(User.spotify_id).is_not(None)),
        guests_total=_count(db, User, User.is_guest == True),  # noqa: E712
        active_users_7d=len(active),
        guest_ai_used_today=guest_ai_used_today(db),
        guest_ai_limit=settings.guest_ai_per_day,
        ai=AIStats(
            calls_today=today_row.calls if today_row else 0,
            tokens_today=(today_row.input_tokens + today_row.output_tokens) if today_row else 0,
            calls_month=sum(r.calls for r in usage_rows),
            input_tokens_month=tokens_in,
            output_tokens_month=tokens_out,
            est_cost_month_usd=round(cost, 2),
            price_input_per_mtok=settings.ai_price_input_per_mtok,
            price_output_per_mtok=settings.ai_price_output_per_mtok,
            model=settings.anthropic_model,
        ),
        shared_playlists=_count(db, Playlist, col(Playlist.share_slug).is_not(None)),
        featured_playlists=_count(
            db, Playlist, col(Playlist.featured_at).is_not(None), col(Playlist.share_slug).is_not(None)
        ),
        errors_7d=_count(db, ClientError, ClientError.created_at >= today - timedelta(days=6)),
    )
