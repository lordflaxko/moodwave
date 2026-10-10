"""Guest mode: try Moodwave without a Spotify account.

Guests search the real Spotify catalog with the app's own client-credentials token (no
user data), get the real AI within limits, and can't save to Spotify. Limits are counted
from the database so they survive restarts:

- each guest makes at most `guest_playlists_per_day` playlists a day (UTC);
- all guests together get `guest_ai_per_day` AI generations + refinements a day, after
  which they quietly get the offline curator instead.
"""

import asyncio
import time
from collections import defaultdict
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.models import Playlist, RefinementTurn, User
from app.services.spotify.base import SpotifyError
from app.services.spotify.oauth import TOKEN_URL, _basic_auth_header

GUEST_BUSY_NOTICE = (
    "Guest AI is at today's limit, so this one comes from Moodwave's offline curator. "
    "Sign in with Spotify for the full AI."
)

_app_token: tuple[str, float] | None = None
_app_token_lock = asyncio.Lock()
_guest_starts: dict[str, list[float]] = defaultdict(list)


async def app_access_token() -> str:
    """A cached client-credentials token: catalog access only, no user data."""
    global _app_token
    if _app_token and _app_token[1] - time.time() > 60:
        return _app_token[0]
    async with _app_token_lock:
        if _app_token and _app_token[1] - time.time() > 60:
            return _app_token[0]
        import httpx

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TOKEN_URL, data={"grant_type": "client_credentials"}, headers=_basic_auth_header()
            )
        if response.status_code >= 400:
            raise SpotifyError(f"Spotify app token request failed ({response.status_code})")
        body = response.json()
        _app_token = (body["access_token"], time.time() + float(body.get("expires_in", 3600)))
        return _app_token[0]


def check_guest_start(ip: str) -> None:
    """At most 6 new guest sessions per address per day (stops trivially resetting limits)."""
    now = time.time()
    starts = [t for t in _guest_starts[ip] if now - t < 86_400]
    if len(starts) >= 6:
        raise HTTPException(429, "Too many guest sessions from here today. Sign in with Spotify, or try tomorrow.")
    starts.append(now)
    _guest_starts[ip] = starts


def _today() -> datetime:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def guest_playlists_today(db: Session, user_id: str) -> int:
    return db.exec(
        select(func.count()).select_from(Playlist).where(Playlist.user_id == user_id, Playlist.created_at >= _today())
    ).one()


def guest_ai_used_today(db: Session) -> int:
    """AI work done for all guests today: generations by the AI, plus refinements."""
    since = _today()
    generated = db.exec(
        select(func.count())
        .select_from(Playlist)
        .join(User, col(User.id) == col(Playlist.user_id))
        .where(User.is_guest, Playlist.created_at >= since, Playlist.ai_source == "claude")
    ).one()
    refined = db.exec(
        select(func.count())
        .select_from(RefinementTurn)
        .join(Playlist, col(Playlist.id) == col(RefinementTurn.playlist_id))
        .join(User, col(User.id) == col(Playlist.user_id))
        .where(User.is_guest, RefinementTurn.created_at >= since)
    ).one()
    return int(generated) + int(refined)


def guest_ai_available(db: Session) -> bool:
    return guest_ai_used_today(db) < get_settings().guest_ai_per_day


def enforce_guest_generation(db: Session, user: User) -> None:
    limit = get_settings().guest_playlists_per_day
    if guest_playlists_today(db, user.id) >= limit:
        raise HTTPException(
            429,
            f"You've made {limit} playlists today as a guest. Come back tomorrow, or sign in with Spotify for more.",
        )


def merge_guest_into(db: Session, guest: User, user: User) -> int:
    """Move a guest's playlists (and thumbs) to the account they just signed in with."""
    from app.models import TrackFeedback

    moved = 0
    for playlist in db.exec(select(Playlist).where(Playlist.user_id == guest.id)).all():
        playlist.user_id = user.id
        db.add(playlist)
        moved += 1
    for feedback in db.exec(select(TrackFeedback).where(TrackFeedback.user_id == guest.id)).all():
        feedback.user_id = user.id
        db.add(feedback)
    db.commit()
    return moved
