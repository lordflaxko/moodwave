"""The recommendation pipeline: interpret → resolve → verify → filter → sequence.

The AI layer proposes songs by name; Spotify search turns them into real catalog
tracks. A fuzzy matcher rejects search hits that aren't actually the requested song,
which guards against hallucinated titles. Thin results are backfilled first by asking
the AI for more songs, then by intent-driven discovery search.

Artist-only requests ("Don Toliver night songs") set `intent.focus_artists`. Then only songs
crediting those artists (features count) are kept, filled first from the artist's real
Spotify catalog, and only then from similar artists, which are tagged `similar`.
"""

import asyncio
import logging
import math
import re
from dataclasses import dataclass

from rapidfuzz import fuzz

from app.core.config import get_settings
from app.schemas import Candidate, MusicalIntent, PlaylistStats, Track
from app.services.ai.base import AIError, AIProvider
from app.services.ai.heuristic import HeuristicProvider
from app.services.spotify.base import SpotifyClient, SpotifyError

log = logging.getLogger(__name__)

_RESOLVE_CONCURRENCY = 8
# Songs allowed per lead artist, before scaling up for long playlists (see `artist_cap`).
_MAX_PER_ARTIST = 2
_MIN_DURATION_MS = 60_000
_MAX_DURATION_MS = 12 * 60_000
_SUFFIX = re.compile(r"\s*[\(\[\-–].*?(remaster|version|edit|mix|live|mono|stereo|feat|ft\.|with ).*$", re.I)
_PUNCT = re.compile(r"[^\w\s]")
# Alternate versions skipped when filling from an artist's catalog (unless asked for).
_ALT_VERSION = re.compile(r"\b(remix|sped up|slowed|reverb|live|instrumental|acapella|a cappella|karaoke|8d)\b", re.I)


@dataclass
class GenerationResult:
    intent: MusicalIntent
    tracks: list[Track]
    source: str
    notice: str | None = None


@dataclass
class RefinementResult:
    intent: MusicalIntent
    tracks: list[Track]
    summary: str
    added: int
    removed: int
    source: str
    notice: str | None = None


# --- Matching -----------------------------------------------------------------------------


def normalize(text: str) -> str:
    text = _SUFFIX.sub("", text)
    return " ".join(_PUNCT.sub(" ", text.lower()).split())


def is_match(candidate: Candidate, track: Track) -> bool:
    title_score = fuzz.token_set_ratio(normalize(candidate.title), normalize(track.title))
    artist_score = max(fuzz.token_set_ratio(normalize(candidate.artist), normalize(a)) for a in track.artists)
    return title_score >= 85 and artist_score >= 80


def credits(track: Track, artists: list[str]) -> bool:
    """True if any of `artists` is credited on the track (lead or featured)."""
    names = [normalize(a) for a in track.artists]
    return any(fuzz.ratio(normalize(artist), name) >= 90 for artist in artists for name in names)


def candidate_line(track: Track) -> str:
    return f"{track.title} — {track.artists[0] if track.artists else ''}"


async def resolve(candidates: list[Candidate], spotify: SpotifyClient) -> list[Track]:
    """Resolve candidates to verified Spotify tracks, preserving candidate order."""
    semaphore = asyncio.Semaphore(_RESOLVE_CONCURRENCY)

    async def one(candidate: Candidate) -> Track | None:
        async with semaphore:
            try:
                results = await spotify.search_track(candidate.title, candidate.artist)
            except SpotifyError as exc:
                if exc.status in (401, 429):
                    raise
                log.info("Search failed for %s — %s: %s", candidate.title, candidate.artist, exc)
                return None
        match = next((track for track in results if is_match(candidate, track)), None)
        if match is None:
            return None
        return match.model_copy(update={"energy": candidate.energy, "reason": candidate.reason})

    resolved = await asyncio.gather(*(one(c) for c in candidates))
    return [track for track in resolved if track is not None]


def artist_cap(limit: int, single_artist_request: bool) -> int:
    """How many songs one lead artist may have: 2 in a 24-song mix, 5 in a 100-song one."""
    if single_artist_request:
        return max(4, math.ceil(limit / 8))
    return max(_MAX_PER_ARTIST, math.ceil(limit / 24))


def filter_tracks(
    tracks: list[Track],
    intent: MusicalIntent,
    limit: int,
    seed: list[Track] | None = None,
    *,
    allow_similar: bool = False,
) -> list[Track]:
    """Apply hard constraints, de-duplicate, cap per-artist repeats, and truncate.

    With `intent.focus_artists`, only tracks crediting them pass (uncapped), unless
    `allow_similar` lets other artists through for the tagged similar-artist fill.
    """
    focus = intent.focus_artists
    kept: list[Track] = list(seed or [])
    seen_ids = {t.id for t in kept}
    seen_keys = {(normalize(t.title), normalize(t.artists[0])) for t in kept if t.artists}
    per_artist: dict[str, int] = {}
    for t in kept:
        per_artist[t.artists[0]] = per_artist.get(t.artists[0], 0) + 1
    single_artist_request = len(intent.reference_artists) == 1
    cap = artist_cap(limit, single_artist_request)

    for track in tracks:
        if len(kept) >= limit:
            break
        key = (normalize(track.title), normalize(track.artists[0]) if track.artists else "")
        if track.id in seen_ids or key in seen_keys:
            continue
        if track.explicit and not intent.explicit_allowed:
            continue
        if not (_MIN_DURATION_MS <= track.duration_ms <= _MAX_DURATION_MS):
            continue
        focused = bool(focus) and credits(track, focus)
        if focus and not focused and not allow_similar:
            continue
        artist = track.artists[0] if track.artists else ""
        if not focused and per_artist.get(artist, 0) >= cap:
            continue
        per_artist[artist] = per_artist.get(artist, 0) + 1
        seen_ids.add(track.id)
        seen_keys.add(key)
        kept.append(track)
    return kept[:limit]


def compute_stats(tracks: list[Track]) -> PlaylistStats:
    energies = [t.energy for t in tracks if t.energy is not None]
    return PlaylistStats(
        track_count=len(tracks),
        total_duration_ms=sum(t.duration_ms for t in tracks),
        artist_count=len({a for t in tracks for a in t.artists[:1]}),
        explicit_count=sum(1 for t in tracks if t.explicit),
        avg_energy=round(sum(energies) / len(energies), 2) if energies else None,
        energy_curve=[round(t.energy if t.energy is not None else 0.5, 2) for t in tracks],
    )


# --- Orchestration ------------------------------------------------------------------------------


class PlaylistPipeline:
    def __init__(self, ai: AIProvider, spotify: SpotifyClient):
        self.ai = ai
        self.spotify = spotify
        self.settings = get_settings()

    async def _with_fallback(self, label: str, call, fallback_call):
        """Run an AI call; if Claude fails, degrade to the heuristic curator with a notice."""
        try:
            return await call(self.ai), self.ai.source, None
        except AIError as exc:
            if self.ai.source == "heuristic":
                raise
            log.warning("%s failed on %s, falling back to heuristic: %s", label, self.ai.source, exc)
            notice = f"{exc} Moodwave used its offline curator instead."
            return await fallback_call(HeuristicProvider()), "heuristic", notice

    async def _backfill(self, tracks: list[Track], intent: MusicalIntent, target: int, ai: AIProvider) -> list[Track]:
        if len(tracks) >= target:
            return tracks
        try:
            more = await ai.more_candidates(intent, [candidate_line(t) for t in tracks], (target - len(tracks)) * 2)
            tracks = filter_tracks(await resolve(more, self.spotify), intent, target, seed=tracks)
        except AIError as exc:
            log.info("Backfill via AI skipped: %s", exc)
        if len(tracks) < target:
            extra = await self.spotify.discover(intent, {t.id for t in tracks}, (target - len(tracks)) * 2)
            extra = [t if t.energy is not None else t.model_copy(update={"energy": intent.energy}) for t in extra]
            tracks = filter_tracks(extra, intent, target, seed=tracks)
        return tracks

    async def _artist_catalog(self, intent: MusicalIntent, exclude: list[Track]) -> list[Track]:
        """Real tracks crediting the focus artists, minus alternate versions and anything used."""
        wanted_alts = " ".join([intent.title, intent.description, *intent.characteristics]).lower()
        used = {t.id for t in exclude} | {normalize(t.title) for t in exclude}
        batches = await asyncio.gather(
            *(self.spotify.artist_tracks(a) for a in intent.focus_artists[:3]), return_exceptions=True
        )
        catalog: list[Track] = []
        for batch in batches:
            if isinstance(batch, BaseException):
                log.info("Artist catalog lookup failed: %s", batch)
                continue
            for track in batch:
                key = normalize(track.title)
                alt = _ALT_VERSION.search(track.title)
                if track.id in used or key in used or not credits(track, intent.focus_artists):
                    continue
                if alt and alt.group(1).lower() not in wanted_alts:
                    continue
                if track.explicit and not intent.explicit_allowed:
                    continue
                used.update({track.id, key})
                catalog.append(track)
        return catalog

    async def _focus_fill(
        self, tracks: list[Track], intent: MusicalIntent, target: int, ai: AIProvider
    ) -> tuple[list[Track], str | None]:
        """Artist-only requests: fill from the artist's catalog, then from tagged similar artists."""
        if len(tracks) < target:
            catalog = await self._artist_catalog(intent, tracks)
            if catalog:
                need = target - len(tracks)
                try:
                    picks = await ai.pick_from_catalog(intent, catalog, need)
                except AIError as exc:
                    log.info("Catalog pick via AI skipped: %s", exc)
                    picks = await HeuristicProvider().pick_from_catalog(intent, catalog, need)
                chosen = [catalog[p.index].model_copy(update={"energy": p.energy, "reason": p.reason}) for p in picks]
                tracks = filter_tracks(chosen, intent, target, seed=tracks)

        artist_count = len(tracks)
        if len(tracks) < target:
            names = " & ".join(intent.focus_artists)
            similar: list[Track] = []
            try:
                more = await ai.similar_candidates(
                    intent, [candidate_line(t) for t in tracks], (target - len(tracks)) * 2
                )
                similar = await resolve(more, self.spotify)
            except AIError as exc:
                log.info("Similar-artist fill via AI skipped: %s", exc)
            if len(similar) < target - len(tracks):
                open_intent = intent.model_copy(update={"focus_artists": []})
                found = await self.spotify.discover(open_intent, {t.id for t in tracks}, (target - len(tracks)) * 2)
                similar += [
                    t if t.energy is not None else t.model_copy(update={"energy": intent.energy}) for t in found
                ]
            tagged = [
                t.model_copy(update={"similar": True, "reason": f"Similar to {names}: {t.reason or 'close in sound'}"})
                for t in similar
                if not credits(t, intent.focus_artists)
            ]
            tracks = filter_tracks(tagged, intent, target, seed=tracks, allow_similar=True)

        added = len(tracks) - artist_count
        if not added:
            return tracks, None
        names = " & ".join(intent.focus_artists)
        return tracks, (
            f"{names} had {artist_count} songs that fit — the last {added} are from similar artists (tagged)."
        )

    async def generate(
        self, prompt: str, *, target: int, energy: float | None, allow_explicit: bool, use_my_taste: bool
    ) -> GenerationResult:
        taste = await self.spotify.top_artists() if use_my_taste else []

        async def run(ai: AIProvider):
            return await ai.plan(
                prompt, target=target, energy_override=energy, allow_explicit=allow_explicit, taste_artists=taste
            )

        plan, source, notice = await self._with_fallback("plan", run, run)
        ai_for_backfill = self.ai if source == self.ai.source else HeuristicProvider()

        tracks = filter_tracks(await resolve(plan.candidates, self.spotify), plan.intent, target)
        if plan.intent.focus_artists:
            tracks, focus_notice = await self._focus_fill(tracks, plan.intent, target, ai_for_backfill)
            if focus_notice:
                notice = (notice + " " if notice else "") + focus_notice
        else:
            tracks = await self._backfill(tracks, plan.intent, target, ai_for_backfill)

        tracks = await self.spotify.attach_artist_images(tracks)
        if len(tracks) < self.settings.min_tracks:
            notice = (notice + " " if notice else "") + (
                f"Only {len(tracks)} matching songs were found. Try broadening your request."
            )
        return GenerationResult(intent=plan.intent, tracks=tracks, source=source, notice=notice)

    async def refine(self, intent: MusicalIntent, tracks: list[Track], instruction: str) -> RefinementResult:
        async def run(ai: AIProvider):
            return await ai.refine(intent, tracks, instruction)

        plan, source, notice = await self._with_fallback("refine", run, run)
        target = max(8, min(self.settings.max_tracks, plan.target_length))
        remove = set(plan.remove_track_ids)
        kept = [t for t in tracks if t.id not in remove]

        resolved = await resolve(plan.candidates, self.spotify)
        # Validate new songs against everything that stays, then slot them into removed positions.
        fresh = filter_tracks(resolved, plan.intent, len(kept) + len(resolved), seed=kept)[len(kept) :]
        fresh = [t for t in fresh if t.id not in {x.id for x in tracks}]

        merged: list[Track] = []
        queue = list(fresh)
        for track in tracks:
            if track.id in remove:
                if queue:
                    merged.append(queue.pop(0))
            else:
                merged.append(track)
        merged.extend(queue)
        # Respect explicit constraints that may have tightened on refinement.
        merged = [t for t in merged if plan.intent.explicit_allowed or not t.explicit]
        if len(merged) > target:
            merged = merged[:target]
        elif len(merged) < target:
            backfill_ai = self.ai if source == self.ai.source else HeuristicProvider()
            if plan.intent.focus_artists:
                merged, _ = await self._focus_fill(merged, plan.intent, target, backfill_ai)
            else:
                merged = await self._backfill(merged, plan.intent, target, backfill_ai)

        merged = await self.spotify.attach_artist_images(merged)
        old_ids, new_ids = {t.id for t in tracks}, {t.id for t in merged}
        return RefinementResult(
            intent=plan.intent,
            tracks=merged,
            summary=plan.summary,
            added=len(new_ids - old_ids),
            removed=len(old_ids - new_ids),
            source=source,
            notice=notice,
        )

    async def replace_track(self, intent: MusicalIntent, tracks: list[Track], track_id: str) -> list[Track]:
        index = next((i for i, t in enumerate(tracks) if t.id == track_id), None)
        if index is None:
            raise ValueError("Track not found in playlist")
        target = tracks[index]
        exclude_lines = [candidate_line(t) for t in tracks]

        async def run(ai: AIProvider):
            return await ai.alternatives(intent, target, exclude_lines, 6)

        alternatives, _, _ = await self._with_fallback("replace", run, run)
        others = [t for t in tracks if t.id != track_id]
        resolved = await resolve(alternatives, self.spotify)
        pick = filter_tracks(resolved, intent, len(others) + 1, seed=others)[len(others) :]
        if not pick and intent.focus_artists:
            catalog = await self._artist_catalog(intent, tracks)
            energy = target.energy if target.energy is not None else intent.energy
            catalog.sort(key=lambda t: abs((t.energy if t.energy is not None else energy) - energy))
            pick = filter_tracks(catalog, intent, len(others) + 1, seed=others)[len(others) :]
        if not pick:
            discovered = await self.spotify.discover(intent, {t.id for t in tracks}, 6)
            pick = filter_tracks(
                discovered, intent, len(others) + 1, seed=others, allow_similar=bool(intent.focus_artists)
            )[len(others) :]
        if not pick:
            raise LookupError("Couldn't find a good replacement for that song.")
        replacement = (await self.spotify.attach_artist_images(pick[:1]))[0]
        if replacement.energy is None:
            replacement = replacement.model_copy(update={"energy": target.energy})
        return tracks[:index] + [replacement] + tracks[index + 1 :]
