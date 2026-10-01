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

    async def top_artists(self, limit: int = 10) -> list[str]: ...

    async def create_playlist(self, name: str, description: str, uris: list[str]) -> SavedPlaylist: ...

    async def list_playlists(self, limit: int = 30) -> list[SpotifyPlaylistOut]: ...
