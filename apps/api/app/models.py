"""Persistence models (SQLModel). JSON columns hold structured AI output verbatim."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Column, LargeBinary
from sqlmodel import Field, Relationship, SQLModel


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return uuid.uuid4().hex


class User(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    spotify_id: str | None = Field(default=None, index=True, unique=True)
    display_name: str
    email: str | None = None
    avatar_url: str | None = None
    is_demo: bool = False
    # Tried Moodwave without Spotify: catalog via the app token, limits apply, can't save.
    is_guest: bool = False
    created_at: datetime = Field(default_factory=_now)


class SpotifyToken(SQLModel, table=True):
    """OAuth tokens, encrypted at rest with a key derived from SESSION_SECRET."""

    user_id: str = Field(foreign_key="user.id", primary_key=True)
    access_token_enc: str
    refresh_token_enc: str
    expires_at: datetime
    scope: str = ""


class Playlist(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    title: str
    description: str = ""
    prompt: str
    intent: dict = Field(sa_column=Column(JSON, nullable=False))
    ai_source: str = "heuristic"
    spotify_playlist_id: str | None = None
    spotify_url: str | None = None
    # When the Spotify copy last matched this playlist (save or sync).
    synced_at: datetime | None = None
    # Public read-only link (/s/{share_slug}); None when sharing is off.
    share_slug: str | None = Field(default=None, index=True)
    # Shown in "Made with Moodwave" on Home (owner only, and only while shared).
    featured_at: datetime | None = None
    # Cover choice: {"mode": "auto" | "grid" | "single" | "upload", "track_ids": [...], "v": version}.
    cover: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    created_at: datetime = Field(default_factory=_now, index=True)
    updated_at: datetime = Field(default_factory=_now)

    tracks: list["PlaylistTrack"] = Relationship(
        back_populates="playlist",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "PlaylistTrack.position"},
    )
    refinements: list["RefinementTurn"] = Relationship(
        back_populates="playlist",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "RefinementTurn.id"},
    )


class PlaylistTrack(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    playlist_id: str = Field(foreign_key="playlist.id", index=True)
    position: int
    # Serialized `schemas.Track`; tracks are always read and written as a whole list.
    data: dict = Field(sa_column=Column(JSON, nullable=False))

    playlist: Playlist | None = Relationship(back_populates="tracks")


class RefinementTurn(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    playlist_id: str = Field(foreign_key="playlist.id", index=True)
    instruction: str
    summary: str
    added: int = 0
    removed: int = 0
    created_at: datetime = Field(default_factory=_now)

    playlist: Playlist | None = Relationship(back_populates="refinements")


class ClientError(SQLModel, table=True):
    """Errors from the site (front-end crashes) and the API (unhandled exceptions)."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now, index=True)
    source: str = Field(default="web", description="web | api")
    page: str = ""
    message: str
    stack: str = ""
    user_agent: str = ""
    user_id: str | None = Field(default=None, index=True)


class TrackFeedback(SQLModel, table=True):
    """A listener's thumbs up/down on a song; shapes future picks."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    track_id: str = Field(index=True)
    title: str = ""
    artist: str = ""
    verdict: str = Field(description="up | down")
    created_at: datetime = Field(default_factory=_now)


class PlaylistCover(SQLModel, table=True):
    """An uploaded cover image (processed 640px JPEG), kept apart so playlist rows stay light."""

    playlist_id: str = Field(foreign_key="playlist.id", primary_key=True)
    jpeg: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    updated_at: datetime = Field(default_factory=_now)


class AIUsage(SQLModel, table=True):
    """Tokens the AI used per day (UTC), for the owner dashboard's cost estimate."""

    day: str = Field(primary_key=True)  # YYYY-MM-DD
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
