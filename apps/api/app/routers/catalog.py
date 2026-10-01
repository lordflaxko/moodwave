"""Public showcase data: real artwork and artist portraits for marketing surfaces."""

from collections import Counter, defaultdict
from functools import cache

from fastapi import APIRouter, Response

from app.data.catalog import CATALOG, CatalogRow
from app.schemas import FeaturedArtist, FeaturedOut
from app.services.spotify.catalog_scoring import artist_image_map, artwork_map, catalog_id, row_to_track

router = APIRouter(prefix="/catalog", tags=["catalog"])
_FEATURED_TRACKS = 40


@cache
def _featured() -> FeaturedOut:
    covers, portraits = artwork_map(), artist_image_map()

    # One song per artist, most recognisable first, only where we have real artwork.
    seen: set[str] = set()
    tracks = []
    for row in sorted(CATALOG, key=lambda r: r.popularity, reverse=True):
        if row.artist in seen or catalog_id(row) not in covers:
            continue
        seen.add(row.artist)
        tracks.append(row_to_track(row))
        if len(tracks) >= _FEATURED_TRACKS:
            break

    genres: dict[str, Counter[str]] = defaultdict(Counter)
    best: dict[str, CatalogRow] = {}
    for row in CATALOG:
        genres[row.artist][row.genre] += 1
        current = best.get(row.artist)
        # Prefer a record with artwork, then the most popular one.
        rank = (catalog_id(row) in covers, row.popularity)
        if current is None or rank > (catalog_id(current) in covers, current.popularity):
            best[row.artist] = row
    artists = [
        FeaturedArtist(
            name=name,
            image_url=url,
            genre=genres[name].most_common(1)[0][0],
            track_count=sum(genres[name].values()),
            top_track=best[name].title,
            album=best[name].album,
            cover_url=covers.get(catalog_id(best[name])),
        )
        for name, url in portraits.items()
        if name in genres
    ]
    artists.sort(key=lambda a: (-a.track_count, a.name))
    return FeaturedOut(tracks=tracks, artists=artists)


@router.get("/featured", response_model=FeaturedOut)
def featured(response: Response) -> FeaturedOut:
    response.headers["Cache-Control"] = "public, max-age=3600"
    return _featured()
