"""Authentication: Spotify OAuth (Authorization Code + PKCE), demo sessions, and logout."""

import logging
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlmodel import col, select

from app.core.config import Settings
from app.core.security import (
    OAUTH_COOKIE_MAX_AGE,
    OAUTH_COOKIE_NAME,
    new_oauth_challenge,
    oauth_return_to,
    read_handoff,
    read_session,
    sign_handoff,
    sign_session,
    verify_oauth_state,
)
from app.deps import CurrentUser, DbSession, SettingsDep, get_optional_user
from app.models import (
    ClientError,
    Playlist,
    PlaylistCover,
    PlaylistTrack,
    RefinementTurn,
    SpotifyToken,
    TrackFeedback,
    User,
)
from app.schemas import AppConfigOut, ExchangeRequest, SessionOut, UserOut
from app.services.guest import check_guest_start, merge_guest_into
from app.services.spotify.base import SpotifyError
from app.services.spotify.oauth import authorize_url, exchange_code, store_tokens

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        is_demo=user.is_demo,
        is_guest=user.is_guest,
    )


def _safe_return_to(url: str | None, settings: Settings) -> str | None:
    """Accept only http(s) URLs on an allowed origin; drop any fragment."""
    if not url:
        return None
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or f"{parts.scheme}://{parts.netloc}" not in settings.allowed_origins:
        return None
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


# Hand-off codes already swapped for a token (single instance, so memory is enough).
_used_handoffs: set[str] = set()


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
        demo_allowed=settings.allow_demo,
        spotify_enabled=settings.spotify_enabled,
        ai_enabled=settings.ai_enabled,
        guest_allowed=_guest_allowed(settings),
        guest_playlists_per_day=settings.guest_playlists_per_day,
        guest_max_tracks=settings.guest_max_tracks,
    )


def _guest_allowed(settings: Settings) -> bool:
    # Guests need the app's Spotify credentials for catalog search.
    return settings.allow_guest and settings.spotify_enabled and not settings.demo_mode


@router.get("/me", response_model=UserOut | None)
def me(request: Request, db: DbSession, settings: SettingsDep) -> UserOut | None:
    user = get_optional_user(request, db, settings)
    return _user_out(user) if user else None


@router.delete("/me", status_code=204)
def delete_me(user: CurrentUser, db: DbSession, response: Response, settings: SettingsDep) -> Response:
    """Delete this account and everything stored for it: playlists (songs, changes, covers,
    share links), thumbs, Spotify tokens, and the account itself. Error-log rows keep the
    message but lose the link to the account."""
    playlist_ids = [p.id for p in db.exec(select(Playlist).where(Playlist.user_id == user.id)).all()]
    if playlist_ids:
        for model in (PlaylistTrack, RefinementTurn, PlaylistCover):
            for row in db.exec(select(model).where(col(model.playlist_id).in_(playlist_ids))).all():
                db.delete(row)
        db.flush()
        for playlist in db.exec(select(Playlist).where(col(Playlist.id).in_(playlist_ids))).all():
            db.delete(playlist)
    for model in (TrackFeedback, SpotifyToken):
        for row in db.exec(select(model).where(model.user_id == user.id)).all():
            db.delete(row)
    for row in db.exec(select(ClientError).where(ClientError.user_id == user.id)).all():
        row.user_id = None
        db.add(row)
    db.flush()
    db.delete(db.get(User, user.id))
    db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/login")
def login(settings: SettingsDep, return_to: str | None = None) -> RedirectResponse:
    """Start Spotify sign-in. External sites pass `return_to` (a page on an allowed origin)."""
    if not settings.spotify_enabled:
        raise HTTPException(400, "Spotify is not configured on this server. Use the demo instead.")
    safe_return = _safe_return_to(return_to, settings)
    if return_to and not safe_return:
        raise HTTPException(400, "That return address isn't allowed.")
    challenge = new_oauth_challenge(safe_return)
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
    return_to = _safe_return_to(oauth_return_to(request.cookies.get(OAUTH_COOKIE_NAME)), settings)

    def fail(reason: str) -> RedirectResponse:
        target = return_to.split("?")[0] if return_to else f"{settings.frontend_url}/"
        response = RedirectResponse(f"{target}?{urlencode({'auth_error': reason})}", status_code=302)
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

    if return_to:
        response = RedirectResponse(f"{return_to}#{urlencode({'mw_code': sign_handoff(user.id)})}", status_code=302)
        response.delete_cookie(OAUTH_COOKIE_NAME, path="/")
        return response

    response = RedirectResponse(f"{settings.frontend_url}/generate", status_code=302)
    response.delete_cookie(OAUTH_COOKIE_NAME, path="/")
    _set_session_cookie(response, settings, user.id)
    return response


@router.post("/exchange", response_model=SessionOut)
def exchange(body: ExchangeRequest, db: DbSession) -> SessionOut:
    """Swap a sign-in hand-off code (from the callback redirect) for a bearer session."""
    user_id = read_handoff(body.code)
    user = db.get(User, user_id) if user_id else None
    if user is None or body.code in _used_handoffs:
        raise HTTPException(400, "That sign-in link has expired. Please sign in again.")
    _used_handoffs.add(body.code)
    # Signing in from a guest session: bring the guest's playlists along.
    guest_id = read_session(body.guest_token) if body.guest_token else None
    guest = db.get(User, guest_id) if guest_id else None
    if guest is not None and guest.is_guest and guest.id != user.id:
        moved = merge_guest_into(db, guest, user)
        log.info("Moved %s guest playlists into a signed-in account", moved)
    return SessionOut(token=sign_session(user.id), user=_user_out(user))


def _new_demo_user(db: DbSession, settings: Settings) -> User:
    if not settings.allow_demo:
        raise HTTPException(403, "The demo is switched off here. Sign in with Spotify instead.")
    user = User(display_name="Demo Listener", is_demo=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/demo", response_model=UserOut)
def start_demo(request: Request, response: Response, db: DbSession, settings: SettingsDep) -> UserOut:
    existing = get_optional_user(request, db, settings)
    if existing is not None:
        return _user_out(existing)
    user = _new_demo_user(db, settings)
    _set_session_cookie(response, settings, user.id)
    return _user_out(user)


@router.post("/demo/token", response_model=SessionOut)
def start_demo_token(db: DbSession, settings: SettingsDep) -> SessionOut:
    """Demo session as a bearer token, for the Framer site."""
    user = _new_demo_user(db, settings)
    return SessionOut(token=sign_session(user.id), user=_user_out(user))


@router.post("/guest/token", response_model=SessionOut)
def start_guest(request: Request, db: DbSession, settings: SettingsDep) -> SessionOut:
    """Try Moodwave without Spotify: real catalog and AI within daily limits, no saving."""
    if not _guest_allowed(settings):
        raise HTTPException(403, "Guest mode is switched off here. Sign in with Spotify instead.")
    forwarded = request.headers.get("x-forwarded-for", "")
    check_guest_start(forwarded.split(",")[0].strip() or (request.client.host if request.client else "?"))
    user = User(display_name="Guest", is_guest=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return SessionOut(token=sign_session(user.id), user=_user_out(user))


@router.post("/logout", status_code=204)
def logout(response: Response, settings: SettingsDep) -> Response:
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = 204
    return response
