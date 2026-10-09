"""FastAPI dependencies: auth, service construction, and rate limiting."""

import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.security import read_session
from app.db import get_session
from app.models import User
from app.services.ai.base import AIProvider
from app.services.ai.claude import ClaudeProvider
from app.services.ai.heuristic import HeuristicProvider
from app.services.pipeline import PlaylistPipeline
from app.services.spotify.base import SpotifyClient
from app.services.spotify.client import SpotifyHttpClient
from app.services.spotify.mock import MockSpotifyClient
from app.services.spotify.oauth import get_valid_access_token

DbSession = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def session_token(request: Request, settings: Settings) -> str | None:
    """The signed session: a bearer token (Framer site) or the httpOnly cookie (Next.js app)."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and token:
        return token.strip()
    return request.cookies.get(settings.session_cookie_name)


def get_optional_user(request: Request, db: DbSession, settings: SettingsDep) -> User | None:
    user_id = read_session(session_token(request, settings))
    return db.get(User, user_id) if user_id else None


def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_spotify(user: CurrentUser, db: DbSession, settings: SettingsDep) -> SpotifyClient:
    if user.is_demo or settings.demo_mode:
        return MockSpotifyClient(user.id)

    async def token_provider() -> str:
        return await get_valid_access_token(db, user.id)

    return SpotifyHttpClient(token_provider)


_claude_singleton: ClaudeProvider | None = None


def get_ai(settings: SettingsDep) -> AIProvider:
    global _claude_singleton
    if not settings.ai_enabled:
        return HeuristicProvider()
    if _claude_singleton is None:
        _claude_singleton = ClaudeProvider(settings)
    return _claude_singleton


def get_pipeline(
    ai: Annotated[AIProvider, Depends(get_ai)], spotify: Annotated[SpotifyClient, Depends(get_spotify)]
) -> PlaylistPipeline:
    return PlaylistPipeline(ai, spotify)


class RateLimiter:
    """Small in-memory sliding-window limiter (per user). Swap for Redis when scaling out."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: float = 60.0) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            retry = int(window - (now - hits[0])) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"You're generating quickly! Try again in {retry}s.",
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)


rate_limiter = RateLimiter()


def generation_rate_limit(user: CurrentUser, settings: SettingsDep) -> None:
    rate_limiter.check(f"gen:{user.id}", settings.generate_rate_limit_per_minute)
