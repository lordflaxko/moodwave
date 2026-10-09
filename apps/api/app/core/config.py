"""Application settings, loaded from environment variables (and an optional .env file).

Every secret lives here and only here. Nothing in this module is ever sent to the
browser; the Next.js frontend talks to this service through a same-origin proxy, and
the Framer site calls it directly with a bearer token.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # .env is resolved relative to apps/api so the service works from any working directory.
    model_config = SettingsConfigDict(env_file=API_ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---------------------------------------------------------------
    app_name: str = "Moodwave API"
    environment: str = Field(default="development", description="development | production | test")
    frontend_url: str = "http://127.0.0.1:3000"
    # Extra sites (comma-separated origins) allowed to call the API directly with a bearer
    # token and to receive Spotify sign-ins, e.g. the published Framer site.
    extra_origins: str = ""
    database_url: str = f"sqlite:///{(API_ROOT / 'moodwave.db').as_posix()}"
    # Anonymous demo sessions. Turn off on a public deploy so strangers can't spend AI credits.
    allow_demo: bool = True

    # Used to sign the session cookie and derive the token-encryption key.
    session_secret: str = "dev-only-change-me-please-0123456789abcdef"
    session_cookie_name: str = "mw_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 14

    # --- Spotify -------------------------------------------------------------
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    spotify_redirect_uri: str = "http://127.0.0.1:3000/api/auth/callback"
    spotify_market: str = "US"

    # --- Anthropic -------------------------------------------------------------
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_effort: str = "medium"
    # Server-side refusal fallback ("default" routing). Disable if your account lacks the beta.
    anthropic_enable_fallbacks: bool = True

    # --- Generation limits -------------------------------------------------------
    generate_rate_limit_per_minute: int = 8
    min_tracks: int = 15
    max_tracks: int = 30

    @property
    def allowed_origins(self) -> list[str]:
        extra = [o.strip().rstrip("/") for o in self.extra_origins.split(",") if o.strip()]
        return [self.frontend_url.rstrip("/"), *extra]

    @property
    def sqlalchemy_url(self) -> str:
        """Hosted Postgres URLs usually say `postgres://`; SQLAlchemy wants an explicit driver."""
        for prefix in ("postgres://", "postgresql://"):
            if self.database_url.startswith(prefix):
                return "postgresql+psycopg://" + self.database_url.removeprefix(prefix)
        return self.database_url

    @property
    def spotify_enabled(self) -> bool:
        return bool(self.spotify_client_id and self.spotify_client_secret)

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def demo_mode(self) -> bool:
        """Demo mode swaps the real Spotify client for the bundled sample catalog."""
        return not self.spotify_enabled

    @property
    def secure_cookies(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
