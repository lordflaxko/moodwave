"""Pydantic models shared by the API surface, the AI layer, and the pipeline.

`apps/site/src/components/MoodwaveAPI.tsx` mirrors these shapes for the site.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Vocals = Literal["any", "female", "male", "mixed", "instrumental"]

MIN_TRACKS = 15
MAX_TRACKS = 100


class Track(BaseModel):
    id: str = Field(description="Spotify track id (or catalog id in demo mode)")
    uri: str
    title: str
    artists: list[str]
    artist_ids: list[str] = Field(default_factory=list)
    artist_images: list[str | None] = Field(default_factory=list, description="Portrait per artist, same order")
    album: str
    image_url: str | None = None
    # Bigger artwork (~640px) for large collages; `image_url` is the ~300px thumbnail.
    image_large: str | None = None
    duration_ms: int
    explicit: bool = False
    popularity: int | None = None
    external_url: str | None = None
    release_year: int | None = None
    # AI-provided annotations (Spotify no longer exposes audio features to new apps).
    energy: float | None = Field(default=None, ge=0, le=1)
    reason: str | None = None
    # Backfill from a similar artist when an artist-only request ran out of fitting songs.
    similar: bool = False


class MusicalIntent(BaseModel):
    """The model's structured interpretation of a natural-language request."""

    title: str
    description: str
    moods: list[str]
    genres: list[str]
    characteristics: list[str] = Field(default_factory=list, description="Sonic traits, e.g. 'warm analog synths'")
    energy: float = Field(ge=0, le=1)
    valence: float = Field(ge=0, le=1, description="0 = melancholic, 1 = euphoric")
    tempo_min: int = Field(ge=40, le=220)
    tempo_max: int = Field(ge=40, le=220)
    era: str | None = None
    vocals: Vocals = "any"
    explicit_allowed: bool = True
    reference_artists: list[str] = Field(default_factory=list)
    focus_artists: list[str] = Field(
        default_factory=list,
        description="Artists the listener wants to hear exclusively (songs by or featuring them); empty = no limit",
    )
    rationale: str = Field(description="Why this plan fits the request, written for the listener")


class Candidate(BaseModel):
    title: str
    artist: str
    energy: float = Field(ge=0, le=1)
    reason: str


class PlaylistPlan(BaseModel):
    intent: MusicalIntent
    candidates: list[Candidate]


class RefinementPlan(BaseModel):
    intent: MusicalIntent
    remove_track_ids: list[str]
    candidates: list[Candidate]
    target_length: int = Field(description="How many songs the playlist should have after the change")
    summary: str = Field(description="One or two sentences describing what changed")


# --- Requests ----------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=500)
    length: int = Field(default=24, ge=MIN_TRACKS, le=MAX_TRACKS)
    energy: float | None = Field(default=None, ge=0, le=1, description="Optional energy override")
    allow_explicit: bool = True
    use_my_taste: bool = False
    seed_url: str | None = Field(
        default=None, max_length=300, description="A Spotify song or playlist link to start from"
    )


class CoverRequest(BaseModel):
    """Pick the cover: automatic, a 2x2 grid of four songs' artwork, or one song's artwork."""

    mode: Literal["auto", "grid", "single"]
    track_ids: list[str] = Field(default_factory=list, max_length=4)


class CoverImageRequest(BaseModel):
    """An uploaded image as a data URL or plain base64 (JPEG, PNG, WebP, ...)."""

    image: str = Field(min_length=100, max_length=14_000_000)


class CoverOut(BaseModel):
    mode: Literal["auto", "grid", "single", "upload"] = "auto"
    track_ids: list[str] = Field(default_factory=list)
    # What the cover shows: 4 images (grid), 1 (single/upload). Upload URLs are paths on this API.
    images: list[str | None] = Field(default_factory=list)


class RefineRequest(BaseModel):
    instruction: str = Field(min_length=2, max_length=300)


class UpdatePlaylistRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)


class ReplaceTracksRequest(BaseModel):
    """Full ordered track list; used for reorder, remove and manual add."""

    tracks: list[Track] = Field(min_length=1, max_length=MAX_TRACKS + 20)


# --- Responses -------------------------------------------------------------------------------


class RefinementOut(BaseModel):
    id: int
    instruction: str
    summary: str
    added: int
    removed: int
    created_at: datetime


class PlaylistStats(BaseModel):
    track_count: int
    total_duration_ms: int
    artist_count: int
    explicit_count: int
    avg_energy: float | None
    energy_curve: list[float]


class PlaylistOut(BaseModel):
    id: str
    title: str
    description: str
    prompt: str
    intent: MusicalIntent
    tracks: list[Track]
    stats: PlaylistStats
    refinements: list[RefinementOut]
    ai_source: Literal["claude", "heuristic"]
    spotify_playlist_id: str | None
    spotify_url: str | None
    notice: str | None = None
    created_at: datetime
    updated_at: datetime
    synced_at: datetime | None = None
    # Saved to Spotify, then edited here since: offer "Update on Spotify".
    needs_sync: bool = False
    cover: CoverOut = Field(default_factory=CoverOut)
    share_slug: str | None = None
    featured: bool = False


class PlaylistSummary(BaseModel):
    id: str
    title: str
    prompt: str
    moods: list[str]
    energy: float
    cover_images: list[str | None]
    cover_seeds: list[str]
    # Lead artists, most frequent first (for library search).
    artists: list[str] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    track_count: int
    total_duration_ms: int
    saved_to_spotify: bool
    spotify_url: str | None
    created_at: datetime


class UserOut(BaseModel):
    id: str
    display_name: str
    avatar_url: str | None
    is_demo: bool
    is_guest: bool = False
    # The site owner (dashboard, featuring playlists on Home).
    is_owner: bool = False


class SessionOut(BaseModel):
    """A bearer session for the site."""

    token: str
    user: UserOut


class ExchangeRequest(BaseModel):
    code: str = Field(min_length=10, max_length=500)
    # The guest session in this browser, if any: its playlists move to the signed-in account.
    guest_token: str | None = Field(default=None, max_length=1000)


class AppConfigOut(BaseModel):
    demo_mode: bool
    demo_allowed: bool
    spotify_enabled: bool
    ai_enabled: bool
    guest_allowed: bool = False
    guest_playlists_per_day: int = 0
    guest_max_tracks: int = 0


class FeaturedArtist(BaseModel):
    name: str
    image_url: str
    genre: str
    track_count: int
    # Their most recognisable record in the catalog
    top_track: str
    album: str
    cover_url: str | None


class FeaturedOut(BaseModel):
    """Public showcase data for marketing surfaces (hero, mood cards, artist band)."""

    tracks: list[Track]
    artists: list[FeaturedArtist]


class SpotifyPlaylistOut(BaseModel):
    id: str
    name: str
    image_url: str | None
    track_count: int
    external_url: str | None
