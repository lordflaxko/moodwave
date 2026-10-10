"""Showcase data, committed artwork, and the newer refinement vocabulary."""

from app.data.catalog import CATALOG
from app.services.ai.heuristic import HeuristicProvider
from app.services.pipeline import PlaylistPipeline
from app.services.spotify.catalog_scoring import (
    CATALOG_BY_ID,
    DEEP_CUTS_TRAIT,
    artist_image_map,
    artwork_map,
    catalog_id,
    row_to_track,
)
from app.services.spotify.mock import MockSpotifyClient


def test_committed_artwork_covers_most_of_the_catalog():
    covers, portraits = artwork_map(), artist_image_map()
    assert len(covers) / len(CATALOG) > 0.95
    assert len(portraits) / len({r.artist for r in CATALOG}) > 0.9
    assert all(url.startswith("https://") for url in [*covers.values(), *portraits.values()])
    # Every key refers to something that exists in the catalog.
    assert set(covers) <= {catalog_id(r) for r in CATALOG}


def test_catalog_tracks_carry_cover_and_portrait():
    row = next(r for r in CATALOG if catalog_id(r) in artwork_map() and r.artist in artist_image_map())
    track = row_to_track(row)
    art = artwork_map()[catalog_id(row)]
    assert track.image_large == art
    assert track.image_url and track.image_url != "" and "1000x1000" not in track.image_url
    assert track.artist_images == [artist_image_map()[row.artist]]


def test_featured_endpoint_is_public_and_complete(client):
    client.cookies.clear()
    res = client.get("/catalog/featured")
    assert res.status_code == 200
    data = res.json()
    assert len(data["tracks"]) == 40
    assert len({t["artists"][0] for t in data["tracks"]}) == 40  # one song per artist
    assert all(t["image_url"] for t in data["tracks"])
    weeknd = next(a for a in data["artists"] if a["name"] == "The Weeknd")
    assert weeknd["image_url"] and weeknd["cover_url"] and weeknd["top_track"]


async def _first(prompt: str, target: int = 20):
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient())
    result = await pipeline.generate(prompt, target=target, energy=None, allow_explicit=True, use_my_taste=False)
    return pipeline, result


async def test_refine_less_mainstream_trades_hits_for_deep_cuts():
    pipeline, first = await _first("upbeat pop party")
    refined = await pipeline.refine(first.intent, first.tracks, "Make it less mainstream with more deep cuts")
    assert DEEP_CUTS_TRAIT in refined.intent.characteristics

    def avg_pop(tracks):
        return sum(t.popularity or 0 for t in tracks) / len(tracks)

    assert avg_pop(refined.tracks) < avg_pop(first.tracks)


async def test_refine_nostalgic_leans_older():
    pipeline, first = await _first("feel good summer songs")
    refined = await pipeline.refine(first.intent, first.tracks, "Make it more nostalgic with some throwbacks")
    assert refined.intent.era == "classic"

    def avg_year(tracks):
        return sum(t.release_year or 2000 for t in tracks) / len(tracks)

    assert avg_year(refined.tracks) < avg_year(first.tracks)


async def test_refine_keep_same_artists_prefers_current_lineup():
    pipeline, first = await _first("moody r&b late night", target=24)
    refined = await pipeline.refine(first.intent, first.tracks, "Make it more chill but keep the same artists")
    before = {t.artists[0] for t in first.tracks}
    added = [t for t in refined.tracks if t.id not in {x.id for x in first.tracks}]
    assert added, "refinement should swap something"
    same = sum(1 for t in added if t.artists[0] in before)
    assert same >= len(added) / 2


def test_stored_demo_tracks_pick_up_current_artwork(demo_client):
    res = demo_client.post("/playlists/generate", json={"prompt": "warm soul for a sunday morning", "length": 15})
    pid = res.json()["id"]
    stale = [{**t, "image_url": None, "artist_images": []} for t in res.json()["tracks"]]
    demo_client.put(f"/playlists/{pid}/tracks", json={"tracks": stale})
    tracks = demo_client.get(f"/playlists/{pid}").json()["tracks"]
    covered = [t for t in tracks if t["id"] in artwork_map()]
    assert covered and all(t["image_url"] == artwork_map()[t["id"]] for t in covered)
    assert any(CATALOG_BY_ID[t["id"]].artist in artist_image_map() and t["artist_images"] for t in tracks)
