"""Authentication: Spotify OAuth (Authorization Code + PKCE), demo sessions, and logout."""

import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlmodel import select

from app.core.config import Settings
from app.core.security import (
    OAUTH_COOKIE_MAX_AGE,
    OAUTH_COOKIE_NAME,
    new_oauth_challenge,
    sign_session,
    verify_oauth_state,
)
from app.deps import DbSession, SettingsDep, get_optional_user
from app.models import User
from app.schemas import AppConfigOut, UserOut
from app.services.spotify.base import SpotifyError
from app.services.spotify.oauth import authorize_url, exchange_code, store_tokens

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, display_name=user.display_name, avatar_url=user.avatar_url, is_demo=user.is_demo)


def _set_session_cookie(response: Response, settings: Settings, user_id: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        sign_session(user_id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        path="/",
    )


@router.get("/config", response_model=AppConfigOut)
def app_config(settings: SettingsDep) -> AppConfigOut:
    return AppConfigOut(
        demo_mode=settings.demo_mode,
        spotify_enabled=settings.spotify_enabled,
        ai_enabled=settings.ai_enabled,
        ai_model=settings.anthropic_model if settings.ai_enabled else None,
    )


@router.get("/me", response_model=UserOut | None)
def me(request: Request, db: DbSession, settings: SettingsDep) -> UserOut | None:
    user = get_optional_user(request, db, settings)
    return _user_out(user) if user else None


@router.get("/login")
def login(settings: SettingsDep) -> RedirectResponse:
    if not settings.spotify_enabled:
        raise HTTPException(400, "Spotify is not configured on this server. Use the demo instead.")
    challenge = new_oauth_challenge()
    response = RedirectResponse(authorize_url(challenge.state, challenge.challenge), status_code=302)
    response.set_cookie(
        OAUTH_COOKIE_NAME,
        challenge.cookie_value,
        max_age=OAUTH_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        path="/",
    )
    return response


@router.get("/callback")
async def callback(
    request: Request,
    db: DbSession,
    settings: SettingsDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    def fail(reason: str) -> RedirectResponse:
        response = RedirectResponse(f"{settings.frontend_url}/?{urlencode({'auth_error': reason})}", status_code=302)
        response.delete_cookie(OAUTH_COOKIE_NAME, path="/")
        return response

    if error:
        return fail("access_denied" if error == "access_denied" else "spotify_error")
    verifier = verify_oauth_state(request.cookies.get(OAUTH_COOKIE_NAME), state)
    if not code or not verifier:
        return fail("invalid_state")

    try:
        tokens = await exchange_code(code, verifier)
        async with httpx.AsyncClient(timeout=15) as client:
            profile_res = await client.get(
                "https://api.spotify.com/v1/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
            )
        if profile_res.status_code == 403:
            # Development-mode apps only allow allow-listed users.
            return fail("not_allowlisted")
        profile_res.raise_for_status()
        profile = profile_res.json()
    except (SpotifyError, httpx.HTTPError) as exc:
        log.warning("Spotify OAuth callback failed: %s", exc)
        return fail("token_exchange_failed")

    user = db.exec(select(User).where(User.spotify_id == profile["id"])).first()
    images = profile.get("images") or []
    if user is None:
        user = User(spotify_id=profile["id"], display_name=profile.get("display_name") or profile["id"])
    user.display_name = profile.get("display_name") or user.display_name
    user.email = profile.get("email")
    user.avatar_url = images[0]["url"] if images else None
    db.add(user)
    db.commit()
    db.refresh(user)
    store_tokens(db, user.id, tokens)

    response = RedirectResponse(f"{settings.frontend_url}/generate", status_code=302)
    response.delete_cookie(OAUTH_COOKIE_NAME, path="/")
    _set_session_cookie(response, settings, user.id)
    return response


@router.post("/demo", response_model=UserOut)
def start_demo(request: Request, response: Response, db: DbSession, settings: SettingsDep) -> UserOut:
    existing = get_optional_user(request, db, settings)
    if existing is not None:
        return _user_out(existing)
    user = User(display_name="Demo Listener", is_demo=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_session_cookie(response, settings, user.id)
    return _user_out(user)


@router.post("/logout", status_code=204)
def logout(response: Response, settings: SettingsDep) -> Response:
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = 204
    return response
