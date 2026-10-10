"""Pipeline behaviour against the demo catalog and fake providers."""

from app.schemas import Candidate, MusicalIntent, PlaylistPlan, Track
from app.services.ai.base import AIError
from app.services.ai.heuristic import HeuristicProvider, detect_focus, interpret
from app.services.pipeline import PlaylistPipeline, artist_cap, credits, filter_tracks, is_match, normalize
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


# --- Artist-only requests ("Don Toliver night songs") ---------------------------------------

DON = "Don Toliver"


def _song(i: int, title: str, *artists: str, explicit: bool = False) -> Track:
    return Track(
        id=f"s{i}",
        uri=f"spotify:track:s{i}",
        title=title,
        artists=list(artists),
        album="A",
        duration_ms=200_000,
        explicit=explicit,
        popularity=90 - i,
    )


class _FakeSpotify(MockSpotifyClient):
    """Search and artist catalog backed by a fixed list, so features and versions are controlled."""

    def __init__(self, songs: list[Track], catalog: list[Track]):
        super().__init__()
        self.songs = songs
        self.catalog = catalog

    async def search_track(self, title: str, artist: str) -> list[Track]:
        return [t for t in self.songs if t.title.lower() == title.lower()]

    async def artist_tracks(self, artist: str, limit: int = 100) -> list[Track]:
        return list(self.catalog)

    async def discover(self, intent, exclude_ids, limit):
        return []


class _FocusAI(HeuristicProvider):
    source = "claude"  # type: ignore[assignment]

    def __init__(self, candidates: list[tuple[str, str]], similar: list[tuple[str, str]] | None = None):
        self.candidates = candidates
        self.similar = similar or []

    async def plan(self, prompt, **kwargs) -> PlaylistPlan:
        intent = _intent(focus_artists=[DON], reference_artists=[DON])
        cands = [Candidate(title=t, artist=a, energy=0.4, reason="r") for t, a in self.candidates]
        return PlaylistPlan(intent=intent, candidates=cands)

    async def similar_candidates(self, intent, exclude, count):
        return [Candidate(title=t, artist=a, energy=0.4, reason="close") for t, a in self.similar][:count]


async def test_focus_keeps_only_credited_songs_features_included_and_uncapped():
    songs = [
        _song(1, "After Party", DON),
        _song(2, "No Idea", DON),
        _song(3, "Can't Say", "Travis Scott", DON),  # a feature counts
        _song(4, "Blinding Lights", "The Weeknd"),  # not him: dropped
        _song(5, "Lose My Mind", DON),
        _song(6, "Bandit", DON),
    ]
    catalog = [_song(10 + i, f"Deep Cut {i}", DON) for i in range(10)]
    ai = _FocusAI([(t.title, t.artists[0]) for t in songs])
    result = await PlaylistPipeline(ai, _FakeSpotify(songs, catalog)).generate(
        "Don Toliver night songs", target=8, energy=None, allow_explicit=True, use_my_taste=False
    )
    assert len(result.tracks) == 8
    assert all(credits(t, [DON]) for t in result.tracks)
    assert any(t.title == "Can't Say" for t in result.tracks)
    assert not any(t.similar for t in result.tracks)
    # (Short test playlists also get the generic "only N songs" note; no similar-artist note.)
    assert "similar artists" not in (result.notice or "")


async def test_focus_catalog_fill_skips_alternate_versions():
    catalog = [
        _song(20, "Lemonade (Remix)", DON),
        _song(21, "After Party - Sped Up", DON),
        _song(22, "Private Landing", DON),
        _song(23, "Embarrassed", DON),
    ]
    ai = _FocusAI([])
    result = await PlaylistPipeline(ai, _FakeSpotify([], catalog)).generate(
        "Don Toliver songs", target=2, energy=None, allow_explicit=True, use_my_taste=False
    )
    titles = {t.title for t in result.tracks}
    assert titles == {"Private Landing", "Embarrassed"}


async def test_focus_fills_with_tagged_similar_artists_only_after_catalog_runs_out():
    songs = [_song(1, "After Party", DON), _song(2, "No Idea", DON)]
    catalog = [_song(30, "Cardigan", DON)]
    similar_songs = [_song(40 + i, f"Close Song {i}", f"Similar Artist {i}") for i in range(4)]
    ai = _FocusAI([("After Party", DON), ("No Idea", DON)], similar=[(t.title, t.artists[0]) for t in similar_songs])
    result = await PlaylistPipeline(ai, _FakeSpotify(songs + similar_songs, catalog)).generate(
        "Don Toliver night songs", target=6, energy=None, allow_explicit=True, use_my_taste=False
    )
    assert len(result.tracks) == 6
    head, tail = result.tracks[:3], result.tracks[3:]
    assert all(credits(t, [DON]) and not t.similar for t in head)
    assert all(t.similar and not credits(t, [DON]) for t in tail)
    assert all(t.reason.startswith("Similar to Don Toliver") for t in tail)
    assert result.notice.startswith("Don Toliver had 3 songs that fit — the last 3 are from similar artists (tagged).")


def test_detect_focus_tells_by_from_like():
    assert detect_focus("frank ocean night songs") == ["Frank Ocean"]
    assert detect_focus("only drake for the gym") == ["Drake"]
    assert detect_focus("a sza playlist for sunday") == ["SZA"]
    assert detect_focus("songs like frank ocean") == []
    assert detect_focus("frank ocean vibes for a drive") == []
    assert interpret("Frank Ocean night songs").focus_artists == ["Frank Ocean"]
    assert interpret("music that sounds like Frank Ocean").focus_artists == []


async def test_demo_artist_only_playlist_then_refine_keeps_focus():
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient())
    result = await pipeline.generate(
        "Frank Ocean night songs", target=15, energy=None, allow_explicit=True, use_my_taste=False
    )
    frank = [t for t in result.tracks if not t.similar]
    assert frank and all(credits(t, ["Frank Ocean"]) for t in frank)
    assert result.tracks[: len(frank)] == frank  # the artist's songs come first
    assert all(t.similar for t in result.tracks[len(frank) :])
    assert result.notice and "Frank Ocean had" in result.notice

    refined = await pipeline.refine(result.intent, result.tracks, "make it more upbeat")
    assert refined.intent.focus_artists == ["Frank Ocean"]
    assert all(credits(t, ["Frank Ocean"]) or t.similar for t in refined.tracks)


async def test_pipeline_avoids_thumbed_down_songs_and_artists():
    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient("u"))
    first = await pipeline.generate(
        "rainy night drive", target=15, energy=None, allow_explicit=True, use_my_taste=False
    )
    banned_track = first.tracks[0]
    banned_artist = first.tracks[1].artists[0]
    pipeline.use_preferences({banned_track.id}, {banned_artist}, ["Artists to avoid: " + banned_artist])
    again = await pipeline.generate(
        "rainy night drive", target=15, energy=None, allow_explicit=True, use_my_taste=False
    )
    assert banned_track.id not in {t.id for t in again.tracks}
    assert not any(banned_artist in t.artists for t in again.tracks)


async def test_generate_reports_progress_in_order():
    events: list[dict] = []

    async def listen(event: dict) -> None:
        events.append(event)

    pipeline = PlaylistPipeline(HeuristicProvider(), MockSpotifyClient("u"))
    pipeline.progress = listen
    result = await pipeline.generate(
        "sunday morning coffee", target=15, energy=None, allow_explicit=True, use_my_taste=False
    )
    kinds = [e["type"] for e in events]
    assert kinds[0] == "stage" and kinds[1] == "intent"
    assert events[1]["title"] == result.intent.title
    verifying = [e for e in events if e["type"] == "verifying"]
    assert verifying and verifying[-1]["done"] == verifying[-1]["total"]
    assert any(e["type"] == "track" for e in events)
    assert events[-1] == {"type": "stage", "stage": "finishing", "have": len(result.tracks)}
