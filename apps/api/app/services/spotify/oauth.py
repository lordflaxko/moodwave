"""Spotify Authorization Code + PKCE flow and token lifecycle (exchange, store, refresh)."""

import base64
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlmodel import Session

from app.core.config import get_settings
from app.core.security import decrypt, encrypt
from app.models import SpotifyToken
from app.services.spotify.base import SpotifyAuthError, SpotifyError

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
SCOPES = " ".join(
    [
        "user-read-private",
        "user-read-email",
        "user-top-read",
        "playlist-read-private",
        "playlist-modify-private",
        "playlist-modify-public",
    ]
)
_REFRESH_MARGIN = timedelta(seconds=60)


def authorize_url(state: str, code_challenge: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": settings.spotify_redirect_uri,
        "scope": SCOPES,
        "state": state,
        "code_challenge_method": "S256",
        "code_challenge": code_challenge,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def _basic_auth_header() -> dict[str, str]:
    settings = get_settings()
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()
    return {"Authorization": "Basic " + base64.b64encode(raw).decode()}


async def _token_request(data: dict[str, str]) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(TOKEN_URL, data=data, headers=_basic_auth_header())
    if response.status_code in (400, 401):
        raise SpotifyAuthError()
    if response.status_code >= 400:
        raise SpotifyError(f"Spotify token endpoint returned {response.status_code}")
    return response.json()


async def exchange_code(code: str, verifier: str) -> dict:
    settings = get_settings()
    return await _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.spotify_redirect_uri,
            "code_verifier": verifier,
        }
    )


def store_tokens(db: Session, user_id: str, payload: dict) -> SpotifyToken:
    token = db.get(SpotifyToken, user_id)
    expires_at = datetime.now(UTC) + timedelta(seconds=int(payload.get("expires_in", 3600)))
    if token is None:
        token = SpotifyToken(
            user_id=user_id,
            access_token_enc=encrypt(payload["access_token"]),
            refresh_token_enc=encrypt(payload["refresh_token"]),
            expires_at=expires_at,
            scope=payload.get("scope", ""),
        )
    else:
        token.access_token_enc = encrypt(payload["access_token"])
        # Spotify may or may not rotate the refresh token.
        if payload.get("refresh_token"):
            token.refresh_token_enc = encrypt(payload["refresh_token"])
        token.expires_at = expires_at
        token.scope = payload.get("scope", token.scope)
    db.add(token)
    db.commit()
    return token


async def get_valid_access_token(db: Session, user_id: str) -> str:
    """Return a non-expired access token, refreshing it transparently when needed."""
    token = db.get(SpotifyToken, user_id)
    if token is None:
        raise SpotifyAuthError("Connect your Spotify account to continue.")
    expires_at = token.expires_at if token.expires_at.tzinfo else token.expires_at.replace(tzinfo=UTC)
    if expires_at - _REFRESH_MARGIN > datetime.now(UTC):
        access = decrypt(token.access_token_enc)
        if access:
            return access
    refresh = decrypt(token.refresh_token_enc)
    if not refresh:
        raise SpotifyAuthError()
    payload = await _token_request({"grant_type": "refresh_token", "refresh_token": refresh})
    store_tokens(db, user_id, payload)
    return payload["access_token"]
