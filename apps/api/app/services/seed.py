"""Start from a song or playlist: turn a Spotify link into seed songs for the plan."""

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Literal

from fastapi import HTTPException

from app.schemas import Track
from app.services.spotify.base import SpotifyClient, SpotifyError

# open.spotify.com/track/ID, open.spotify.com/intl-de/playlist/ID?si=…, spotify:track:ID
_LINK = re.compile(
    r"(?:open\.spotify\.com/(?:intl-[a-z-]+/)?(?:embed/)?|spotify:)(track|playlist)[/:]([A-Za-z0-9_]{10,40})"
)


@dataclass
class Seed:
    kind: Literal["track", "playlist"]
    tracks: list[Track]
    artists: list[str] = field(default_factory=list)

    @property
    def lines(self) -> list[str]:
        return [f"{t.title} — {', '.join(t.artists[:2])}" for t in self.tracks[:15]]

    @property
    def lead(self) -> Track | None:
        """A single seed song opens the playlist."""
        return self.tracks[0] if self.kind == "track" and self.tracks else None


def parse_link(url: str) -> tuple[Literal["track", "playlist"], str] | None:
    match = _LINK.search(url.strip())
    if not match:
        return None
    return match.group(1), match.group(2)  # type: ignore[return-value]


async def load_seed(url: str, spotify: SpotifyClient) -> Seed:
    parsed = parse_link(url)
    if parsed is None:
        raise HTTPException(422, "That doesn't look like a Spotify song or playlist link.")
    kind, spotify_id = parsed
    try:
        if kind == "track":
            tracks = [await spotify.get_track(spotify_id)]
        else:
            tracks = await spotify.playlist_tracks(spotify_id)
    except SpotifyError as exc:
        if exc.status in (403, 404) and kind == "playlist":
            raise HTTPException(
                422,
                "Spotify doesn't let apps read that playlist (Spotify-made playlists are blocked). "
                "Try one of your own playlists, or a song link.",
            ) from exc
        if exc.status in (400, 404):
            raise HTTPException(422, "Couldn't find that song on Spotify.") from exc
        raise
    if not tracks:
        raise HTTPException(422, "That playlist is empty.")
    counts = Counter(a for t in tracks for a in t.artists[:1])
    return Seed(kind=kind, tracks=tracks, artists=[a for a, _ in counts.most_common(5)])
