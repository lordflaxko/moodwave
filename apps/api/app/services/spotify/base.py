"""The Spotify service contract. Routers and the pipeline only depend on this protocol,
so the real HTTP client and the demo catalog are interchangeable."""

from dataclasses import dataclass
from typing import Protocol

from app.schemas import MusicalIntent, SpotifyPlaylistOut, Track


class SpotifyError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class SpotifyAuthError(SpotifyError):
    def __init__(self, message: str = "Spotify session expired. Please sign in again."):
        super().__init__(message, status=401)


@dataclass(frozen=True)
class SavedPlaylist:
    id: str
    url: str | None


class SpotifyClient(Protocol):
    is_demo: bool

    async def search_track(self, title: str, artist: str) -> list[Track]:
        """Look up a specific song. Returns a few best candidates (unverified)."""
        ...

    async def search(self, query: str, limit: int = 10) -> list[Track]:
        """Free-text track search (used by the "add a song" dialog)."""
        ...

    async def discover(self, intent: MusicalIntent, exclude_ids: set[str], limit: int) -> list[Track]:
        """Find additional tracks matching an intent, used to backfill thin results."""
        ...

    async def attach_artist_images(self, tracks: list[Track]) -> list[Track]:
        """Return tracks with `artist_images` filled in where possible."""
        ...

    async def artist_tracks(self, artist: str, limit: int = 100) -> list[Track]:
        """Tracks crediting `artist` (their own and features), most popular first (unverified)."""
        ...

    async def top_artists(self, limit: int = 10) -> list[str]: ...

    async def create_playlist(self, name: str, description: str, uris: list[str]) -> SavedPlaylist: ...

    async def list_playlists(self, limit: int = 30) -> list[SpotifyPlaylistOut]: ...

    async def set_cover(self, playlist_id: str, jpeg: bytes) -> None:
        """Upload a custom cover (JPEG, <256 KB once base64-encoded). Needs `ugc-image-upload`."""
        ...

    async def replace_playlist(self, playlist_id: str, name: str, description: str, uris: list[str]) -> None:
        """Make an existing Spotify playlist match: details and the full ordered item list."""
        ...

    async def get_track(self, track_id: str) -> Track:
        """One track by id (for "start from a song")."""
        ...

    async def playlist_tracks(self, playlist_id: str, limit: int = 50) -> list[Track]:
        """A playlist's tracks (for "start from a playlist"). Spotify-made playlists raise 403/404."""
        ...
