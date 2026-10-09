"""Session cookies, OAuth state/PKCE helpers, and at-rest token encryption."""

import base64
import hashlib
import secrets
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import get_settings

_SESSION_SALT = "mw-session"
_OAUTH_SALT = "mw-oauth-state"
OAUTH_COOKIE_NAME = "mw_oauth"
OAUTH_COOKIE_MAX_AGE = 600  # 10 minutes to finish the Spotify consent screen


def _serializer(salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt=salt)


# --- Session ------------------------------------------------------------------


def sign_session(user_id: str) -> str:
    return _serializer(_SESSION_SALT).dumps({"uid": user_id})


def read_session(token: str | None) -> str | None:
    if not token:
        return None
    try:
        data = _serializer(_SESSION_SALT).loads(token, max_age=get_settings().session_max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("uid") if isinstance(data, dict) else None


# --- OAuth state + PKCE ---------------------------------------------------------------


@dataclass(frozen=True)
class OAuthChallenge:
    state: str
    verifier: str
    challenge: str
    cookie_value: str


def new_oauth_challenge(return_to: str | None = None) -> OAuthChallenge:
    """Create a CSRF `state` and a PKCE verifier/challenge pair (RFC 7636, S256).

    `return_to` (an already-validated URL on an allowed origin) rides along in the signed
    cookie so the callback knows which site to send the user back to.
    """
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    payload = {"state": state, "verifier": verifier, "return_to": return_to}
    cookie_value = _serializer(_OAUTH_SALT).dumps(payload)
    return OAuthChallenge(state=state, verifier=verifier, challenge=challenge, cookie_value=cookie_value)


def oauth_return_to(cookie_value: str | None) -> str | None:
    if not cookie_value:
        return None
    try:
        data = _serializer(_OAUTH_SALT).loads(cookie_value, max_age=OAUTH_COOKIE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("return_to") if isinstance(data, dict) else None


def verify_oauth_state(cookie_value: str | None, returned_state: str | None) -> str | None:
    """Return the PKCE verifier if the callback `state` matches the signed cookie."""
    if not cookie_value or not returned_state:
        return None
    try:
        data = _serializer(_OAUTH_SALT).loads(cookie_value, max_age=OAUTH_COOKIE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    if not secrets.compare_digest(str(data.get("state", "")), returned_state):
        return None
    return data.get("verifier")


# --- Cross-site sign-in hand-off --------------------------------------------------------
#
# After Spotify sign-in for an external site (the Framer front end), the callback can't set
# a cookie that site would ever send back. Instead it redirects with a short-lived code in
# the URL fragment (never sent to servers or in Referer), which the page swaps for a
# bearer token via POST /auth/exchange.

_HANDOFF_SALT = "mw-handoff"
HANDOFF_MAX_AGE = 120


def sign_handoff(user_id: str) -> str:
    return _serializer(_HANDOFF_SALT).dumps({"uid": user_id, "n": secrets.token_urlsafe(8)})


def read_handoff(code: str | None) -> str | None:
    if not code:
        return None
    try:
        data = _serializer(_HANDOFF_SALT).loads(code, max_age=HANDOFF_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("uid") if isinstance(data, dict) else None


# --- Token encryption -----------------------------------------------------------------


def _fernet() -> Fernet:
    key = hashlib.sha256(("mw-token-key:" + get_settings().session_secret).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None
