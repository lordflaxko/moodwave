"""Fetch real album covers and artist portraits for the demo catalog.

Run once (or after editing the catalog):  python -m scripts.fetch_artwork

Writes two committed JSON files so the app never calls these services at runtime:
  app/data/artwork.json        catalog id  -> album cover URL
  app/data/artist_images.json  artist name -> portrait URL

Sources (both keyless public APIs):
  * Deezer  https://api.deezer.com/search            covers (cover_xl) and portraits (picture_xl)
  * iTunes  https://itunes.apple.com/search          cover fallback (artworkUrl100 upscaled to 600px)

Every hit is fuzzy-verified against the requested title/artist with the same matcher the
playlist pipeline uses, so a wrong song never gets a cover. Existing entries are kept,
which makes the script resumable and lets hand-fixed URLs survive re-runs.
"""

import asyncio
import json
import re
import sys
from pathlib import Path

import httpx
from rapidfuzz import fuzz

from app.data.catalog import CATALOG, CatalogRow
from app.schemas import Candidate, Track
from app.services.pipeline import is_match, normalize
from app.services.spotify.catalog_scoring import catalog_id

DATA = Path(__file__).resolve().parents[1] / "app" / "data"
ARTWORK = DATA / "artwork.json"
ARTISTS = DATA / "artist_images.json"
# Hand-reviewed exclusions: Deezer images that are placeholders or logos rather than the artist.
# These artists fall back to the UI's initial-letter treatment.
REJECTED_PORTRAITS = {"HOME", "ROSALÍA", "FISHER", "Caribou"}
# Deezer allows ~50 requests / 5 s; go one at a time to stay well under it.
_DEEZER = asyncio.Semaphore(1)


def _load(path: Path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


async def _get(client: httpx.AsyncClient, url: str, params: dict) -> dict:
    for attempt in range(4):
        try:
            response = await client.get(url, params=params, timeout=15)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and data.get("error"):  # Deezer quota errors come back as 200
                    raise httpx.HTTPError(str(data["error"]))
                return data
        except (httpx.HTTPError, ValueError):
            pass
        await asyncio.sleep(1.5 * (attempt + 1))
    return {}


def _candidate(row: CatalogRow) -> Candidate:
    return Candidate(title=row.title, artist=row.artist, energy=0.5, reason="")


_COMPILATION = re.compile(
    r"\b(best of|greatest hits|hits|now that|vol\.|volume|playlist|essentials|compilation|top \d+|\d{4} (?:hits|mix))\b",
    re.I,
)


def _pick_cover(row: CatalogRow, options: list[tuple[str, str]], allow_compilation: bool) -> str | None:
    """Choose among (album title, cover url) for verified matches: the original album first,
    then any non-compilation release, then (if allowed) whatever matched."""
    if not options:
        return None
    target = normalize(row.album)
    for album, cover in options:
        if fuzz.token_set_ratio(normalize(album), target) >= 85:
            return cover
    for album, cover in options:
        if not _COMPILATION.search(album):
            return cover
    return options[0][1] if allow_compilation else None


async def deezer_cover(client: httpx.AsyncClient, row: CatalogRow) -> str | None:
    async with _DEEZER:
        data = await _get(client, "https://api.deezer.com/search", {"q": f"{row.title} {row.artist}"})
        await asyncio.sleep(0.12)
    options = []
    for item in data.get("data", [])[:15]:
        track = Track(
            id=str(item["id"]),
            uri="",
            title=item.get("title", ""),
            artists=[(item.get("artist") or {}).get("name", "")],
            album="",
            duration_ms=0,
        )
        album = item.get("album") or {}
        if album.get("cover_xl") and is_match(_candidate(row), track):
            options.append((album.get("title", ""), album["cover_xl"]))
    # A compilation sleeve misrepresents the record; let iTunes try for the original first.
    return _pick_cover(row, options, allow_compilation=False)


async def itunes_cover(client: httpx.AsyncClient, row: CatalogRow) -> str | None:
    data = await _get(
        client, "https://itunes.apple.com/search", {"term": f"{row.title} {row.artist}", "entity": "song", "limit": 8}
    )
    options = []
    for item in data.get("results", []):
        track = Track(
            id=str(item.get("trackId")),
            uri="",
            title=item.get("trackName", ""),
            artists=[item.get("artistName", "")],
            album="",
            duration_ms=0,
        )
        art = item.get("artworkUrl100")
        if art and is_match(_candidate(row), track):
            options.append((item.get("collectionName", ""), art.replace("100x100bb", "600x600bb")))
    return _pick_cover(row, options, allow_compilation=True)


async def deezer_album_cover(client: httpx.AsyncClient, row: CatalogRow) -> str | None:
    """Last resort: the song's album sleeve, found by album title + artist."""
    async with _DEEZER:
        data = await _get(client, "https://api.deezer.com/search/album", {"q": f"{row.album} {row.artist}"})
        await asyncio.sleep(0.12)
    for item in data.get("data", [])[:10]:
        artist = normalize((item.get("artist") or {}).get("name", ""))
        if (
            item.get("cover_xl")
            and fuzz.token_set_ratio(normalize(item.get("title", "")), normalize(row.album)) >= 85
            and fuzz.ratio(artist, normalize(row.artist)) >= 85
        ):
            return item["cover_xl"]
    return None


async def deezer_artist(client: httpx.AsyncClient, name: str) -> str | None:
    async with _DEEZER:
        data = await _get(client, "https://api.deezer.com/search/artist", {"q": name})
        await asyncio.sleep(0.12)
    target = normalize(name)
    # Several artists can share a name (e.g. "Miguel"); prefer the one with the most fans.
    matches = [
        item
        for item in data.get("data", [])[:10]
        if fuzz.ratio(normalize(item.get("name", "")), target) >= 92
        # Deezer serves a generic silhouette for artists without a photo.
        and item.get("picture_xl")
        and "/artist//" not in item["picture_xl"]
    ]
    if not matches:
        return None
    return max(matches, key=lambda item: item.get("nb_fan", 0))["picture_xl"]


def _save(artwork: dict[str, str], artists: dict[str, str]) -> None:
    artists = {k: v for k, v in artists.items() if k not in REJECTED_PORTRAITS}
    ARTWORK.write_text(json.dumps(dict(sorted(artwork.items())), indent=1, ensure_ascii=False), encoding="utf-8")
    ARTISTS.write_text(json.dumps(dict(sorted(artists.items())), indent=1, ensure_ascii=False), encoding="utf-8")


async def main() -> None:
    artwork, artists = _load(ARTWORK), _load(ARTISTS)
    rows = [row for row in CATALOG if catalog_id(row) not in artwork]
    names = sorted({row.artist for row in CATALOG} - set(artists) - REJECTED_PORTRAITS)
    print(f"covers to fetch: {len(rows)}, portraits to fetch: {len(names)}")

    async with httpx.AsyncClient(headers={"User-Agent": "moodwave-artwork-script/1.0"}) as client:
        covers = await asyncio.gather(*(deezer_cover(client, row) for row in rows))
        missing: list[CatalogRow] = []
        for row, cover in zip(rows, covers, strict=True):
            if cover:
                artwork[catalog_id(row)] = cover
            else:
                missing.append(row)

        pictures = await asyncio.gather(*(deezer_artist(client, name) for name in names))
        for name, picture in zip(names, pictures, strict=True):
            if picture:
                artists[name] = picture
            else:
                print(f"  no portrait: {name}", file=sys.stderr)
        _save(artwork, artists)
        print(f"deezer done; {len(missing)} covers left for iTunes")

        # iTunes rate limit is ~20 req/min, so only use it for Deezer misses, sequentially.
        for row in missing:
            cover = await itunes_cover(client, row) or await deezer_album_cover(client, row)
            if cover:
                artwork[catalog_id(row)] = cover
            else:
                print(f"  no cover: {row.title} — {row.artist}", file=sys.stderr)
            await asyncio.sleep(3.2)

    _save(artwork, artists)
    total_artists = len({row.artist for row in CATALOG})
    print(f"covers: {len(artwork)}/{len(CATALOG)}  portraits: {len(artists)}/{total_artists}")


if __name__ == "__main__":
    try:
        # Use the OS certificate store (works behind corporate/TLS-inspecting proxies).
        import truststore

        truststore.inject_into_ssl()
    except ImportError:
        pass
    asyncio.run(main())
