"""Pipeline behaviour against the demo catalog and fake providers."""

from app.schemas import Candidate, MusicalIntent, PlaylistPlan, Track
from app.services.ai.base import AIError
from app.services.ai.heuristic import HeuristicProvider, interpret
from app.services.pipeline import PlaylistPipeline, artist_cap, filter_tracks, is_match, normalize
from app.services.spotify.mock import MockSpotifyClient


def _intent(**overrides) -> MusicalIntent:
    base = dict(
        title="Test",
        description="d",
        moods=["calm"],
        genres=["indie"],
        energy=0.4,
        valence=0.4,
        tempo_min=60,
        tempo_max=140,
        rationale="r",
    )
    return MusicalIntent(**(base | overrides))


def _track(i: int, artist: str = "A", explicit: bool = False) -> Track:
    return Track(
        id=f"t{i}", uri=f"u{i}", title=f"Song {i}", artists=[artist], album="X", duration_ms=200_000, explicit=explicit
    )


def test_normalize_strips_versions():
    assert normalize("Do I Wanna Know? - 2013 Remaster") == "do i wanna know"
    assert normalize("Get Lucky (feat. Pharrell Williams)") == "get lucky"


def test_is_match_rejects_wrong_artist():
    track = Track(id="1", uri="u", title="Dreams", artists=["Fleetwood Mac"], album="Rumours", duration_ms=1)
    assert is_match(Candidate(title="Dreams", artist="Fleetwood Mac", energy=0.5, reason=""), track)
    assert not is_match(Candidate(title="Dreams", artist="Nujabes", energy=0.5, reason=""), track)


def test_filter_enforces_explicit_and_artist_cap():
    tracks = [_track(1, "A"), _track(2, "A"), _track(3, "A"), _track(4, "B", explicit=True), _track(5, "C")]
    kept = filter_tracks(tracks, _intent(explicit_allowed=False), limit=10)
    assert [t.id for t in kept] == ["t1", "t2", "t5"]


def test_artist_cap_grows_with_playlist_length():
    assert artist_cap(24, single_artist_request=False) == 2
    assert artist_cap(100, single_artist_request=False) == 5
    assert artist_cap(24, single_artist_request=True) == 4
    assert artist_cap(100, single_artist_request=True) == 13

    tracks = [_track(i, "A") for i in range(10)] + [_track(100 + i, f"Other {i}") for i in range(95)]
    kept = filter_tracks(tracks, _intent(), limit=100)
    assert len(kept) == 100
    assert sum(1 for t in kept if t.artists == ["A"]) == 5


def test_interpret_extracts_constraints():
    intent = interpret("A clean late-night study playlist with mellow indie and female vocals")
    assert "indie" in intent.genres
    assert intent.vocals == "female"
    assert intent.explicit_allowed is False
    assert intent.energy < 0.5


async def test_generate_with_demo_catalog_hits_target():
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient())
    result = await pipeline.generate(
        "upbeat workout playlist with hip hop", target=20, energy=None, allow_explicit=True, use_my_taste=False
    )
    assert len(result.tracks) == 20
    assert len({t.id for t in result.tracks}) == 20
    assert result.intent.energy > 0.7
    assert result.source == "heuristic"


async def test_refine_removes_explicit_and_keeps_length():
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient())
    first = await pipeline.generate("hip hop party", target=20, energy=None, allow_explicit=True, use_my_taste=False)
    assert any(t.explicit for t in first.tracks)
    refined = await pipeline.refine(first.intent, first.tracks, "Remove explicit songs")
    assert not any(t.explicit for t in refined.tracks)
    assert refined.intent.explicit_allowed is False
    assert len(refined.tracks) == 20
    assert refined.removed > 0


async def test_refine_more_upbeat_raises_energy():
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient())
    first = await pipeline.generate(
        "sad rainy day songs", target=18, energy=None, allow_explicit=True, use_my_taste=False
    )
    refined = await pipeline.refine(first.intent, first.tracks, "make it more upbeat")
    before = sum(t.energy or 0 for t in first.tracks) / len(first.tracks)
    after = sum(t.energy or 0 for t in refined.tracks) / len(refined.tracks)
    assert after > before


async def test_replace_track_swaps_single_slot():
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient())
    first = await pipeline.generate("chill jazz", target=15, energy=None, allow_explicit=True, use_my_taste=False)
    target = first.tracks[3]
    replaced = await pipeline.replace_track(first.intent, first.tracks, target.id)
    assert len(replaced) == len(first.tracks)
    assert replaced[3].id != target.id
    assert replaced[:3] == first.tracks[:3]


class _FailingAI(HeuristicProvider):
    source = "claude"  # type: ignore[assignment]

    async def plan(self, *args, **kwargs) -> PlaylistPlan:
        raise AIError("The AI service is busy right now (rate limited).")


async def test_falls_back_to_heuristic_when_ai_fails():
    pipeline = PlaylistPipeline(_FailingAI(), MockSpotifyClient())
    result = await pipeline.generate("focus music", target=15, energy=None, allow_explicit=True, use_my_taste=False)
    assert result.source == "heuristic"
    assert result.notice and "offline curator" in result.notice
    assert len(result.tracks) == 15


class _HallucinatingAI(HeuristicProvider):
    source = "claude"  # type: ignore[assignment]

    async def plan(self, prompt, **kwargs) -> PlaylistPlan:
        real = await super().plan(prompt, **kwargs)
        fake = [Candidate(title=f"Imaginary Song {i}", artist="Nobody Real", energy=0.5, reason="x") for i in range(10)]
        return PlaylistPlan(intent=real.intent, candidates=fake + real.candidates[:5])


async def test_hallucinated_songs_are_dropped_and_backfilled():
    pipeline = PlaylistPipeline(_HallucinatingAI(), MockSpotifyClient())
    result = await pipeline.generate("indie", target=15, energy=None, allow_explicit=True, use_my_taste=False)
    assert all("Imaginary" not in t.title for t in result.tracks)
    assert len(result.tracks) == 15
