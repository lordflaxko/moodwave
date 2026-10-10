"""Spotify Web API client (async httpx) with rate-limit backoff.

Note: apps created after Nov 2024 cannot call /recommendations, /audio-features or
/artists/{id}/related-artists, and `preview_url` is null. This client therefore only
relies on search, profile, top items and playlist endpoints.
"""

import asyncio
import base64
import logging
import random
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas import MusicalIntent, SpotifyPlaylistOut, Track
from app.services.spotify.base import SavedPlaylist, SpotifyAuthError, SpotifyError

log = logging.getLogger(__name__)
API = "https://api.spotify.com/v1"
_MAX_RETRIES = 3
# Spotify has lowered the max `limit` for search in development mode; stay under it.
_SEARCH_LIMIT = 10


def _escape(value: str) -> str:
    return value.replace('"', "").strip()


def _pick_image(images: list[dict[str, Any]], target: int) -> str | None:
    """The smallest album image at least `target` px wide (Spotify sends 640, 300 and 64)."""
    sized = sorted((img for img in images if img.get("url")), key=lambda img: img.get("width") or 0)
    for img in sized:
        if (img.get("width") or 0) >= target:
            return img["url"]
    return sized[-1]["url"] if sized else None


def parse_track(item: dict[str, Any], reason: str | None = None, energy: float | None = None) -> Track:
    album = item.get("album") or {}
    images = album.get("images") or []
    release = (album.get("release_date") or "")[:4]
    return Track(
        id=item["id"],
        uri=item.get("uri") or f"spotify:track:{item['id']}",
        title=item.get("name", "Unknown"),
        artists=[a.get("name", "") for a in item.get("artists", [])] or ["Unknown"],
        artist_ids=[a.get("id", "") for a in item.get("artists", []) if a.get("id")],
        album=album.get("name", ""),
        image_url=_pick_image(images, 300),
        image_large=_pick_image(images, 600),
        duration_ms=item.get("duration_ms", 0),
        explicit=bool(item.get("explicit")),
        popularity=item.get("popularity"),
        external_url=(item.get("external_urls") or {}).get("spotify"),
        release_year=int(release) if release.isdigit() else None,
        energy=energy,
        reason=reason,
    )


class SpotifyHttpClient:
    is_demo = False

    def __init__(self, token_provider: Callable[[], Awaitable[str]]):
        self._token_provider = token_provider
        self._market = get_settings().spotify_market
        self._me: dict | None = None

    async def _request(self, method: str, path: str, *, headers: dict[str, str] | None = None, **kwargs: Any) -> Any:
        token = await self._token_provider()
        url = path if path.startswith("http") else f"{API}{path}"
        sent = {"Authorization": f"Bearer {token}", **(headers or {})}
        async with httpx.AsyncClient(timeout=15) as client:
            for attempt in range(_MAX_RETRIES + 1):
                response = await client.request(method, url, headers=sent, **kwargs)
                if response.status_code == 429 and attempt < _MAX_RETRIES:
                    delay = float(response.headers.get("Retry-After", "1"))
                    await asyncio.sleep(min(delay, 5) + random.random() * 0.3)
                    continue
                if response.status_code >= 500 and attempt < _MAX_RETRIES:
                    await asyncio.sleep(0.4 * (attempt + 1))
                    continue
                break
        if response.status_code == 401:
            raise SpotifyAuthError()
        if response.status_code == 429:
            raise SpotifyError("Spotify is rate-limiting requests. Try again in a moment.", status=429)
        if response.status_code >= 400:
            log.warning("Spotify %s %s -> %s %s", method, path, response.status_code, response.text[:200])
            raise SpotifyError(f"Spotify request failed ({response.status_code})", status=response.status_code)
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return None

    async def _items(self, method: str, playlist_id: str, **kwargs: Any) -> Any:
        """Playlist items endpoint (newer `/items`, falling back to the older `/tracks`)."""
        try:
            return await self._request(method, f"/playlists/{playlist_id}/items", **kwargs)
        except SpotifyError as exc:
            if exc.status not in (403, 404, 405):
                raise
            return await self._request(method, f"/playlists/{playlist_id}/tracks", **kwargs)

    async def _search_tracks(self, q: str, limit: int = _SEARCH_LIMIT, offset: int = 0) -> list[Track]:
        data = await self._request(
            "GET",
            "/search",
            params={
                "q": q,
                "type": "track",
                "limit": min(limit, _SEARCH_LIMIT),
                "offset": offset,
                "market": self._market,
            },
        )
        items = ((data or {}).get("tracks") or {}).get("items") or []
        return [parse_track(item) for item in items if item and item.get("id")]

    async def search_track(self, title: str, artist: str) -> list[Track]:
        results = await self._search_tracks(f'track:"{_escape(title)}" artist:"{_escape(artist)}"', limit=5)
        if not results:
            # Field filters are strict; a looser query rescues remasters/alternate titles.
            results = await self._search_tracks(f"{_escape(title)} {_escape(artist)}", limit=5)
        return results

    async def search(self, query: str, limit: int = 10) -> list[Track]:
        return await self._search_tracks(query, limit=limit)

    async def artist_tracks(self, artist: str, limit: int = 100) -> list[Track]:
        # The artist filter matches any credited artist, so features come back too. Search pages
        # are small in development mode, so fetch a few at a time to stay clear of rate limits.
        gate = asyncio.Semaphore(4)

        async def page(offset: int) -> list[Track]:
            async with gate:
                return await self._search_tracks(f'artist:"{_escape(artist)}"', offset=offset)

        batches = await asyncio.gather(
            *(page(o) for o in range(0, min(limit, 100), _SEARCH_LIMIT)), return_exceptions=True
        )
        found: list[Track] = []
        seen: set[str] = set()
        for batch in batches:
            if isinstance(batch, BaseException):
                continue
            for track in batch:
                if track.id not in seen:
                    seen.add(track.id)
                    found.append(track)
        return found

    async def discover(self, intent: MusicalIntent, exclude_ids: set[str], limit: int) -> list[Track]:
        queries = [f'genre:"{_escape(g)}"' for g in intent.genres[:3]]
        queries += [f'artist:"{_escape(a)}"' for a in intent.reference_artists[:3]]
        if not queries:
            queries = [" ".join(intent.moods[:2]) or "chill"]
        batches = await asyncio.gather(
            *(self._search_tracks(q, offset=random.randint(0, 40)) for q in queries), return_exceptions=True
        )
        found: list[Track] = []
        seen = set(exclude_ids)
        for batch in batches:
            if isinstance(batch, BaseException):
                continue
            for track in batch:
                if track.id in seen or (track.explicit and not intent.explicit_allowed):
                    continue
                seen.add(track.id)
                found.append(track.model_copy(update={"reason": "Discovered via genre & artist search"}))
        return found[:limit]

    async def attach_artist_images(self, tracks: list[Track]) -> list[Track]:
        """Fill `artist_images` with one batched /artists lookup per 50 unique ids."""
        ids = list(dict.fromkeys(i for t in tracks if not t.artist_images for i in t.artist_ids))
        images: dict[str, str | None] = {}
        for start in range(0, len(ids), 50):
            try:
                data = await self._request("GET", "/artists", params={"ids": ",".join(ids[start : start + 50])})
            except SpotifyError as exc:
                log.info("Artist image lookup skipped: %s", exc)
                return tracks
            for artist in (data or {}).get("artists") or []:
                if artist:
                    pics = artist.get("images") or []
                    images[artist["id"]] = pics[0]["url"] if pics else None
        return [
            t if t.artist_images else t.model_copy(update={"artist_images": [images.get(i) for i in t.artist_ids]})
            for t in tracks
        ]

    async def top_artists(self, limit: int = 10) -> list[str]:
        try:
            data = await self._request("GET", "/me/top/artists", params={"limit": limit, "time_range": "medium_term"})
        except SpotifyError:
            return []
        return [a["name"] for a in (data or {}).get("items", []) if a.get("name")]

    async def me(self) -> dict:
        if self._me is None:
            self._me = await self._request("GET", "/me")
        return self._me

    async def create_playlist(self, name: str, description: str, uris: list[str]) -> SavedPlaylist:
        body = {"name": name[:100], "description": description[:300], "public": False}
        try:
            playlist = await self._request("POST", "/me/playlists", json=body)
        except SpotifyError as exc:
            if exc.status not in (403, 404, 405):
                raise
            me = await self.me()
            playlist = await self._request("POST", f"/users/{me['id']}/playlists", json=body)
        for start in range(0, len(uris), 100):
            await self._items("POST", playlist["id"], json={"uris": uris[start : start + 100]})
        return SavedPlaylist(id=playlist["id"], url=(playlist.get("external_urls") or {}).get("spotify"))

    async def set_cover(self, playlist_id: str, jpeg: bytes) -> None:
        await self._request(
            "PUT",
            f"/playlists/{playlist_id}/images",
            content=base64.b64encode(jpeg),
            headers={"Content-Type": "image/jpeg"},
        )

    async def replace_playlist(self, playlist_id: str, name: str, description: str, uris: list[str]) -> None:
        await self._request(
            "PUT", f"/playlists/{playlist_id}", json={"name": name[:100], "description": description[:300]}
        )
        # PUT replaces everything with the first 100; the rest are appended in order.
        await self._items("PUT", playlist_id, json={"uris": uris[:100]})
        for start in range(100, len(uris), 100):
            await self._items("POST", playlist_id, json={"uris": uris[start : start + 100]})

    async def get_track(self, track_id: str) -> Track:
        return parse_track(await self._request("GET", f"/tracks/{track_id}", params={"market": self._market}))

    async def playlist_tracks(self, playlist_id: str, limit: int = 50) -> list[Track]:
        data = await self._items("GET", playlist_id, params={"limit": min(limit, 50), "market": self._market})
        tracks = []
        for row in (data or {}).get("items", []):
            item = (row or {}).get("item") or (row or {}).get("track")
            if item and item.get("id") and item.get("type", "track") == "track":
                tracks.append(parse_track(item))
        return tracks

    async def list_playlists(self, limit: int = 30) -> list[SpotifyPlaylistOut]:
        data = await self._request("GET", "/me/playlists", params={"limit": min(limit, 50)})
        out = []
        for item in (data or {}).get("items", []):
            if not item:
                continue
            images = item.get("images") or []
            tracks = item.get("items") or item.get("tracks") or {}
            out.append(
                SpotifyPlaylistOut(
                    id=item["id"],
                    name=item.get("name", "Untitled"),
                    image_url=images[0]["url"] if images else None,
                    track_count=tracks.get("total", 0) if isinstance(tracks, dict) else 0,
                    external_url=(item.get("external_urls") or {}).get("spotify"),
                )
            )
        return out
