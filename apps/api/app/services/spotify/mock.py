"""Demo-mode Spotify client backed by the bundled sample catalog."""

import uuid
from collections import defaultdict

from rapidfuzz import fuzz

from app.data.catalog import CATALOG
from app.schemas import MusicalIntent, SpotifyPlaylistOut, Track
from app.services.spotify.base import SavedPlaylist
from app.services.spotify.catalog_scoring import rank_catalog, row_to_track

# Playlists "saved to Spotify" in demo mode live in memory for the process lifetime.
_DEMO_SAVED: dict[str, list[SpotifyPlaylistOut]] = defaultdict(list)


class MockSpotifyClient:
    is_demo = True

    def __init__(self, user_id: str = "demo"):
        self.user_id = user_id

    async def search_track(self, title: str, artist: str) -> list[Track]:
        scored = []
        for row in CATALOG:
            title_score = fuzz.token_set_ratio(title.lower(), row.title.lower())
            artist_score = fuzz.token_set_ratio(artist.lower(), row.artist.lower())
            scored.append((title_score * 0.6 + artist_score * 0.4, row))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [row_to_track(row) for score, row in scored[:3] if score > 55]

    async def search(self, query: str, limit: int = 10) -> list[Track]:
        q = query.lower().strip()
        if not q:
            return []
        scored = [
            (max(fuzz.partial_ratio(q, row.title.lower()), fuzz.partial_ratio(q, row.artist.lower())), row)
            for row in CATALOG
        ]
        scored.sort(key=lambda pair: (pair[0], pair[1].popularity), reverse=True)
        return [row_to_track(row) for score, row in scored[:limit] if score >= 60]

    async def discover(self, intent: MusicalIntent, exclude_ids: set[str], limit: int) -> list[Track]:
        rows = rank_catalog(intent, exclude_ids)[:limit]
        return [
            row_to_track(row, reason=f"Matches the {intent.moods[0] if intent.moods else 'overall'} feel")
            for row in rows
        ]

    async def artist_tracks(self, artist: str, limit: int = 100) -> list[Track]:
        rows = [row for row in CATALOG if fuzz.ratio(artist.lower(), row.artist.lower()) >= 90]
        rows.sort(key=lambda row: row.popularity, reverse=True)
        return [row_to_track(row) for row in rows[:limit]]

    async def attach_artist_images(self, tracks: list[Track]) -> list[Track]:
        return tracks  # catalog tracks already carry portraits

    async def top_artists(self, limit: int = 10) -> list[str]:
        return ["Phoebe Bridgers", "Tame Impala", "SZA", "Frank Ocean", "Daft Punk"][:limit]

    async def create_playlist(self, name: str, description: str, uris: list[str]) -> SavedPlaylist:
        playlist_id = "demo-" + uuid.uuid4().hex[:10]
        _DEMO_SAVED[self.user_id].insert(
            0,
            SpotifyPlaylistOut(id=playlist_id, name=name, image_url=None, track_count=len(uris), external_url=None),
        )
        return SavedPlaylist(id=playlist_id, url=None)

    async def list_playlists(self, limit: int = 30) -> list[SpotifyPlaylistOut]:
        return _DEMO_SAVED[self.user_id][:limit]
