"""Rule-based AI fallback, used when ANTHROPIC_API_KEY is not set or Claude is unavailable.

It parses the prompt with a keyword lexicon into the same `MusicalIntent` structure Claude
produces, then picks songs from the curated catalog by feature similarity. That keeps the
whole product demonstrable offline, and the pipeline never needs to know which provider ran.
"""

import re
import zlib
from dataclasses import dataclass, field
from typing import Literal

from app.data.catalog import CATALOG
from app.schemas import Candidate, MusicalIntent, PlaylistPlan, RefinementPlan, Track
from app.services.ai.base import CatalogPick
from app.services.spotify.catalog_scoring import (
    CATALOG_BY_ID,
    DEEP_CUTS_TRAIT,
    catalog_id,
    expand_genres,
    rank_catalog,
)


def hash_text(text: str) -> int:
    """Stable across processes (unlike built-in hash), so reasons don't shuffle on restart."""
    return zlib.crc32(text.encode())


@dataclass
class _Rule:
    keywords: tuple[str, ...]
    title: str
    moods: list[str]
    energy: float | None = None
    valence: float | None = None
    genres: list[str] = field(default_factory=list)
    traits: list[str] = field(default_factory=list)
    tempo: tuple[int, int] | None = None
    scene: str = "your moment"


_RULES: list[_Rule] = [
    _Rule(
        ("study*", "focus*", "concentrat*", "working", "deep work", "coding", "homework", "reading"),
        "Deep Focus",
        ["focused", "calm"],
        0.32,
        0.45,
        ["lo-fi", "ambient", "jazz"],
        ["minimal vocals", "steady, unobtrusive grooves"],
        (60, 110),
        scene="long focus sessions",
    ),
    _Rule(
        ("late night", "late-night", "midnight", "night*", "3am", "2am"),
        "After Hours",
        ["nocturnal", "introspective"],
        0.4,
        0.3,
        [],
        ["hazy, reverb-soaked textures", "slow-burning builds"],
        scene="the late hours",
    ),
    _Rule(
        ("sleep*", "wind down", "unwind*", "relax*", "calm*", "meditat*", "spa"),
        "Soft Landing",
        ["serene", "restful"],
        0.18,
        0.35,
        ["ambient", "classical"],
        ["gentle dynamics", "warm, sparse arrangements"],
        (50, 95),
        scene="winding down",
    ),
    _Rule(
        ("chill", "mellow", "laid back", "laid-back", "lazy", "cozy", "cosy"),
        "Slow Glow",
        ["mellow", "easygoing"],
        0.38,
        0.55,
        [],
        ["soft edges", "unhurried tempos"],
        scene="easy, unhurried listening",
    ),
    _Rule(
        ("workout*", "gym", "run", "running", "lifting", "cardio", "training"),
        "Redline",
        ["driven", "relentless"],
        0.9,
        0.6,
        ["edm", "hip hop", "rock"],
        ["punchy drums", "big drops and hooks"],
        (120, 180),
        scene="pushing your limits",
    ),
    _Rule(
        ("party", "pregame", "hype", "turn up", "banger"),
        "Main Character Energy",
        ["euphoric", "celebratory"],
        0.86,
        0.8,
        ["dance pop", "hip hop", "house"],
        ["huge choruses", "four-on-the-floor"],
        (110, 140),
        scene="getting the night started",
    ),
    _Rule(
        ("dance", "club*", "rave", "dancing"),
        "Floor Fillers",
        ["euphoric", "kinetic"],
        0.84,
        0.7,
        ["house", "dance pop", "electronic"],
        ["driving basslines", "steady four-on-the-floor"],
        (115, 130),
        scene="the dance floor",
    ),
    _Rule(
        ("happy", "sunny", "summer", "upbeat", "good vibes", "feel good", "feel-good", "joy*"),
        "Golden Hour Glow",
        ["joyful", "sunny"],
        0.72,
        0.88,
        ["pop", "funk", "indie"],
        ["bright melodies", "bouncy rhythms"],
        scene="sunny, carefree days",
    ),
    _Rule(
        ("sad", "heartbreak*", "breakup", "break up", "cry*", "melanchol*", "lonely", "rainy", "rain"),
        "Rain on Glass",
        ["melancholic", "tender"],
        0.3,
        0.15,
        ["indie folk", "alt pop"],
        ["intimate vocals", "aching melodies"],
        (60, 120),
        scene="quiet reflection",
    ),
    _Rule(
        ("road trip", "roadtrip", "drive", "driving", "highway", "cruise"),
        "Open Road",
        ["free", "adventurous"],
        0.68,
        0.68,
        ["indie rock", "rock", "pop"],
        ["sing-along choruses", "momentum"],
        scene="the open road",
    ),
    _Rule(
        ("romantic", "love", "date night", "candle*", "intimate", "slow dance"),
        "Velvet Hours",
        ["romantic", "intimate"],
        0.45,
        0.6,
        ["r&b", "soul"],
        ["silky vocals", "slow grooves"],
        (65, 115),
        scene="a slow evening together",
    ),
    _Rule(
        ("dinner*", "cooking", "coffee*", "morning*", "sunday", "brunch", "cafe"),
        "Sunday Kitchen",
        ["warm", "easygoing"],
        0.45,
        0.72,
        ["soul", "jazz", "acoustic"],
        ["organic instruments", "warm grooves"],
        scene="slow mornings and kitchen time",
    ),
    _Rule(
        ("angry", "anger", "rage", "aggressive", "scream*"),
        "Pressure Valve",
        ["fierce", "cathartic"],
        0.93,
        0.3,
        ["metal", "rock"],
        ["distorted guitars", "pounding drums"],
        (100, 180),
        scene="letting off steam",
    ),
    _Rule(
        ("nostalg*", "throwback*", "retro", "memories", "old school", "oldies"),
        "Rewind",
        ["nostalgic", "wistful"],
        None,
        0.6,
        [],
        ["timeless production"],
        scene="looking back",
    ),
    _Rule(
        ("rainforest", "nature", "space", "dream", "float", "ethereal"),
        "Weightless",
        ["dreamy", "ethereal"],
        0.35,
        0.4,
        ["dream pop", "ambient"],
        ["shimmering synths", "airy vocals"],
        scene="drifting somewhere else",
    ),
]

_GENRE_ALIASES: dict[str, str] = {
    "hip-hop": "hip hop",
    "hiphop": "hip hop",
    "rap": "hip hop",
    "lofi": "lo-fi",
    "lo fi": "lo-fi",
    "edm": "edm",
    "piano": "classical",
    "synth": "synthwave",
    "kpop": "k-pop",
    "k-pop": "k-pop",
    "afro": "afrobeats",
    "latin": "latin",
    "rnb": "r&b",
    "r&b": "r&b",
    "electronic": "electronic",
    "techno": "house",
    "shoegaze": "dream pop",
    "bedroom": "dream pop",
    "grunge": "rock",
    "punk": "punk",
}
_KNOWN_GENRES = sorted(
    {
        "indie",
        "alternative",
        "pop",
        "electronic",
        "dance",
        "house",
        "hip hop",
        "r&b",
        "soul",
        "funk",
        "rock",
        "metal",
        "jazz",
        "lo-fi",
        "ambient",
        "classical",
        "folk",
        "acoustic",
        "country",
        "reggaeton",
        "afrobeats",
        "k-pop",
        "synthwave",
        "dream pop",
        "trip hop",
        "disco",
    },
    key=len,
    reverse=True,
)
_ARTISTS = sorted({row.artist for row in CATALOG}, key=len, reverse=True)


def _contains(text: str, keyword: str) -> bool:
    """Whole-word match; a trailing '*' marks a stem that may continue (e.g. 'relax*')."""
    if keyword.endswith("*"):
        pattern = r"(?<![a-z])" + re.escape(keyword[:-1])
    else:
        pattern = r"(?<![a-z])" + re.escape(keyword) + r"(?![a-z])"
    return re.search(pattern, text) is not None


def _detect_genres(text: str) -> list[str]:
    found: list[str] = []
    for alias, genre in _GENRE_ALIASES.items():
        if _contains(text, alias) and genre not in found:
            found.append(genre)
    for genre in _KNOWN_GENRES:
        if _contains(text, genre) and genre not in found:
            found.append(genre)
    return found


def _detect_vocals(text: str) -> str:
    if any(_contains(text, k) for k in ("instrumental", "no vocals", "no lyrics", "without lyrics")):
        return "instrumental"
    if any(_contains(text, k) for k in ("female", "women", "woman", "girl")):
        return "female"
    if any(_contains(text, k) for k in ("male vocal", "male vocals", "male artist", "men", "guys")):
        return "male"
    return "any"


def _detect_era(text: str) -> str | None:
    match = re.search(r"\b(?:19)?([6-9]0)'?s\b|\b20([0-2]0)'?s\b", text)
    if match:
        return f"{match.group(1) or match.group(2)}s"
    if any(_contains(text, k) for k in ("throwback", "retro", "oldies", "classic", "old school")):
        return "classic"
    if any(_contains(text, k) for k in ("new", "recent", "modern", "fresh")):
        return "modern"
    return None


def _describe_energy(value: float) -> str:
    if value < 0.25:
        return "very low-key"
    if value < 0.45:
        return "relaxed"
    if value < 0.65:
        return "mid-tempo"
    if value < 0.8:
        return "lively"
    return "high-octane"


def _sequence(candidates: list[Candidate]) -> list[Candidate]:
    """Arrange songs into a gentle arc: ease in, build to a peak around 70%, then land."""
    ordered = sorted(candidates, key=lambda c: c.energy)
    rising, falling = ordered[::2], ordered[1::2][::-1]
    return rising + falling


def _article(word: str) -> str:
    lowered = word.lower()
    if lowered.startswith(("eu", "uni", "use")):
        return "a"
    return "an" if lowered[:1] in "aeiou" else "a"


def _reason(row, intent: MusicalIntent) -> str:
    """Short, varied, feature-grounded explanation for why a song was picked."""
    if any(a.lower() == row.artist.lower() for a in intent.reference_artists):
        return f"Straight from your reference: {row.artist}"
    energy = _describe_energy(row.energy)
    mood = intent.moods[hash_text(row.title) % len(intent.moods)] if intent.moods else "the mood"
    trait = intent.characteristics[0] if intent.characteristics else None
    in_genre = row.genre in expand_genres(intent.genres)
    options = [
        f"{row.year} {row.genre} pick that leans {mood}",
        f"{energy.capitalize()} {row.genre} that keeps the flow steady",
        f"Adds {_article(mood)} {mood} color at {row.bpm} BPM",
    ]
    if row.popularity >= 80:
        options.append(f"A familiar {row.genre} anchor with a {energy} pulse")
    else:
        options.append(f"A {row.genre} deep cut from {row.year}")
    if trait and in_genre:
        options.append(f"{row.genre.capitalize()} with {trait}")
    if row.valence < 0.3:
        options.append(f"Wistful, {energy} texture for the quieter moments")
    elif row.valence > 0.7:
        options.append(f"Bright {row.genre} lift without breaking the mood")
    if row.vocals == "instrumental":
        options.append("Instrumental, so it stays out of your head")
    return options[hash_text(row.artist + row.title) % len(options)]


def _candidates_for(
    intent: MusicalIntent, count: int, exclude_ids: set[str] | None = None, artists: set[str] | None = None
) -> list[Candidate]:
    rows = rank_catalog(intent, exclude_ids, artists)
    picked, per_artist = [], {}
    for row in rows:
        if per_artist.get(row.artist, 0) >= 2:
            continue
        per_artist[row.artist] = per_artist.get(row.artist, 0) + 1
        picked.append(Candidate(title=row.title, artist=row.artist, energy=row.energy, reason=_reason(row, intent)))
        if len(picked) >= count:
            break
    return picked


_FOCUS_WORDS = r"(?:songs|tracks|music|playlist|hits|deep cuts|records|bangers|classics)"


def detect_focus(text: str) -> list[str]:
    """Artists the prompt asks to hear exclusively ("Don Toliver night songs", "only Drake")."""
    found: list[str] = []
    for artist in _ARTISTS:
        a = re.escape(artist.lower())
        if not re.search(rf"(?<!\w){a}(?!\w)", text) or any(artist.lower() in f.lower() for f in found):
            continue
        if re.search(
            rf"\b(like|similar to|style of|sounds? like|inspired by|vibes? of|reminds? me of)\s+(?:\w+\s+){{0,2}}{a}(?!\w)",
            text,
        ):
            continue
        if re.search(rf"(?<!\w){a}(?:'s)?\s+(vibes?|style|energy|type|esque|adjacent)\b", text):
            continue
        if (
            re.search(rf"\b(only|all|just|songs by|tracks by|music by|by)\s+{a}(?!\w)", text)
            or re.search(rf"(?<!\w){a}(?:'s)?\s+(?:[\w&'-]+\s+){{0,3}}?{_FOCUS_WORDS}\b", text)
            or re.search(rf"(?<!\w){a}\s+only\b", text)
        ):
            found.append(artist)
    return found[:3]


def interpret(prompt: str, *, energy_override: float | None = None, allow_explicit: bool = True) -> MusicalIntent:
    text = prompt.lower()
    matched = [rule for rule in _RULES if any(_contains(text, k) for k in rule.keywords)]

    energies = [r.energy for r in matched if r.energy is not None]
    valences = [r.valence for r in matched if r.valence is not None]
    energy = sum(energies) / len(energies) if energies else 0.55
    valence = sum(valences) / len(valences) if valences else 0.55
    if energy_override is not None:
        energy = energy_override

    genres = _detect_genres(text)
    for rule in matched:
        genres += [g for g in rule.genres if g not in genres]
    genres = genres[:5] or ["indie", "pop", "electronic"]

    moods: list[str] = []
    traits: list[str] = []
    for rule in matched:
        moods += [m for m in rule.moods if m not in moods]
        traits += [t for t in rule.traits if t not in traits]
    moods = moods[:4] or ["balanced", "curious"]

    tempo_lo, tempo_hi = 60, 180
    tempos = [r.tempo for r in matched if r.tempo]
    if tempos:
        tempo_lo, tempo_hi = max(t[0] for t in tempos), min(t[1] for t in tempos)
        if tempo_lo > tempo_hi:
            tempo_lo, tempo_hi = min(t[0] for t in tempos), max(t[1] for t in tempos)

    explicit_allowed = allow_explicit and not any(
        _contains(text, k) for k in ("clean", "no explicit", "family", "kids", "office", "work-safe")
    )
    vocals = _detect_vocals(text)
    era = _detect_era(text)
    references = [artist for artist in _ARTISTS if artist.lower() in text][:5]
    focus = detect_focus(text)

    title = matched[0].title if matched else f"{genres[0].title()} Daydream"
    scene = matched[0].scene if matched else "whatever you're doing"
    genre_text = ", ".join(genres[:3])
    mood_text = " and ".join(moods[:2])
    trait_text = f", with {traits[0]}" if traits else ""
    extras = []
    if vocals == "female":
        extras.append("Female voices lead the way.")
    elif vocals == "male":
        extras.append("Male voices lead the way.")
    elif vocals == "instrumental":
        extras.append("It stays mostly instrumental to keep your head clear.")
    if era:
        extras.append(f"Picks favor the {era} era.")
    if not explicit_allowed:
        extras.append("Everything is clean.")
    if focus:
        extras.append(f"Every song is by or features {' & '.join(focus)}.")
    rationale = (
        f"Built for {scene}: a {_describe_energy(energy)}, {mood_text} mix{trait_text}. "
        f"It leans on {genre_text} and is sequenced to ease in, build gently, then land softly. " + " ".join(extras)
    ).strip()
    description = (
        f"{moods[0].capitalize()} {genres[0]}" + (f" and {genres[1]}" if len(genres) > 1 else "") + f" for {scene}."
    )
    return MusicalIntent(
        title=title,
        description=description,
        moods=moods,
        genres=genres,
        characteristics=traits[:4] or ["cohesive sequencing", "a mix of anchors and deep cuts"],
        energy=round(energy, 2),
        valence=round(valence, 2),
        tempo_min=tempo_lo,
        tempo_max=tempo_hi,
        era=era,
        vocals=vocals,
        explicit_allowed=explicit_allowed,
        reference_artists=references,
        focus_artists=focus,
        rationale=rationale,
    )


def _track_vocals(track: Track) -> str | None:
    row = CATALOG_BY_ID.get(track.id)
    return row.vocals if row else None


class HeuristicProvider:
    source: Literal["heuristic"] = "heuristic"

    async def plan(
        self,
        prompt: str,
        *,
        target: int,
        energy_override: float | None,
        allow_explicit: bool,
        taste_artists: list[str],
        seeds: list[str] | None = None,
    ) -> PlaylistPlan:
        intent = interpret(prompt, energy_override=energy_override, allow_explicit=allow_explicit)
        if intent.focus_artists:
            rows = rank_catalog(intent, artists=set(intent.focus_artists))[: target + 6]
            candidates = _sequence(
                [Candidate(title=r.title, artist=r.artist, energy=r.energy, reason=_reason(r, intent)) for r in rows]
            )
        else:
            candidates = _sequence(_candidates_for(intent, target + 6))
        return PlaylistPlan(intent=intent, candidates=candidates)

    async def refine(self, intent: MusicalIntent, tracks: list[Track], instruction: str) -> RefinementPlan:
        text = instruction.lower()
        new = intent.model_copy(deep=True)
        changes: list[str] = []
        remove: set[str] = set()
        size_delta = 0

        def energy_of(t: Track) -> float:
            return t.energy if t.energy is not None else 0.5

        if any(_contains(text, k) for k in ("upbeat", "energ*", "faster", "hype*", "pump*", "intense", "danc*")):
            new.energy = min(1.0, intent.energy + 0.22)
            new.valence = min(1.0, intent.valence + 0.08)
            low = sorted((t for t in tracks if energy_of(t) < new.energy - 0.2), key=energy_of)
            remove |= {t.id for t in low[: max(3, len(tracks) // 3)]}
            changes.append("raised the energy")
        if any(_contains(text, k) for k in ("chill*", "calm*", "slower", "mellow*", "softer", "relax*", "quieter")):
            new.energy = max(0.0, intent.energy - 0.22)
            high = sorted((t for t in tracks if energy_of(t) > new.energy + 0.2), key=energy_of, reverse=True)
            remove |= {t.id for t in high[: max(3, len(tracks) // 3)]}
            changes.append("brought the energy down")
        if any(_contains(text, k) for k in ("happier", "brighter", "positive", "sunnier")):
            new.valence = min(1.0, intent.valence + 0.25)
            changes.append("brightened the mood")
        if any(_contains(text, k) for k in ("sadder", "darker", "moodier", "melanchol*")):
            new.valence = max(0.0, intent.valence - 0.25)
            changes.append("leaned moodier")
        if "explicit" in text or _contains(text, "clean"):
            new.explicit_allowed = False
            remove |= {t.id for t in tracks if t.explicit}
            changes.append("removed explicit songs")
        vocals = _detect_vocals(text)
        if vocals != "any":
            new.vocals = vocals  # type: ignore[assignment]
            opposite = (
                {"female": {"male"}, "male": {"female"}, "instrumental": {"male", "female", "mixed"}}[vocals]
                if vocals in ("female", "male", "instrumental")
                else set()
            )
            swap = [t for t in tracks if _track_vocals(t) in opposite]
            remove |= {t.id for t in swap[: max(4, len(swap) // 2)]}
            changes.append(f"featured more {vocals} {'tracks' if vocals == 'instrumental' else 'artists'}")
        if any(_contains(text, k) for k in ("nostalg*", "throwback*", "older", "classic*", "retro", "oldies")):
            new.era = "classic"
            newest = sorted((t for t in tracks if (t.release_year or 0) >= 2015), key=lambda t: -(t.release_year or 0))
            remove |= {t.id for t in newest[: max(3, len(tracks) // 3)]}
            changes.append("leaned nostalgic")
        deep_cut_words = ("less mainstream", "deep cut*", "obscure", "underground", "lesser-known", "hidden gem*")
        if any(_contains(text, k) for k in deep_cut_words):
            if DEEP_CUTS_TRAIT not in new.characteristics:
                new.characteristics = [*new.characteristics, DEEP_CUTS_TRAIT]
            hits = sorted((t for t in tracks if (t.popularity or 0) >= 82), key=lambda t: -(t.popularity or 0))
            remove |= {t.id for t in hits[: max(3, len(tracks) // 3)]}
            changes.append("swapped hits for deeper cuts")
        genres = _detect_genres(text)
        if genres:
            new.genres = genres + [g for g in intent.genres if g not in genres]
            changes.append(f"added more {', '.join(genres)}")
            size_delta += 4
        for artist in _ARTISTS:
            if artist.lower() in text and any(k in text for k in ("remove", "no ", "without", "less")):
                remove |= {t.id for t in tracks if artist in t.artists}
                changes.append(f"removed {artist}")
        if any(_contains(text, k) for k in ("shorter", "fewer", "trim")):
            size_delta -= 5
            changes.append("trimmed the playlist")
        if any(_contains(text, k) for k in ("longer", "more songs", "extend")):
            size_delta += 5
            changes.append("extended the playlist")
        if not changes:
            # Unknown instruction: refresh the weakest-fitting third.
            weakest = sorted(tracks, key=lambda t: abs(energy_of(t) - intent.energy), reverse=True)
            remove |= {t.id for t in weakest[: max(3, len(tracks) // 4)]}
            changes.append("swapped in fresher picks")

        if size_delta < 0:
            weakest = sorted(
                (t for t in tracks if t.id not in remove), key=lambda t: abs(energy_of(t) - new.energy), reverse=True
            )
            remove |= {t.id for t in weakest[:-size_delta]}

        new.rationale = f"{intent.rationale.split(' Update:')[0]} Update: {', '.join(changes)} per your note “{instruction.strip()}”."
        add_count = max(0, len(remove) + size_delta) + 4
        # Exclude everything currently in the playlist, including songs being removed.
        current_ids = {t.id for t in tracks}
        candidates: list[Candidate] = []
        if any(_contains(text, k) for k in ("same artists", "same artist", "keep the artists")):
            line_up = {t.artists[0] for t in tracks if t.id not in remove and t.artists}
            candidates = _candidates_for(new, add_count, current_ids, artists=line_up)
        if len(candidates) < add_count:
            picked = {(c.title, c.artist) for c in candidates}
            taken = {catalog_id(r) for r in CATALOG if (r.title, r.artist) in picked}
            candidates += _candidates_for(new, add_count - len(candidates), current_ids | taken)
        summary = f"I {', '.join(changes)}."
        summary = summary[0].upper() + summary[1:]
        return RefinementPlan(
            intent=new,
            remove_track_ids=sorted(remove),
            candidates=candidates,
            target_length=len(tracks) + size_delta,
            summary=summary,
        )

    async def more_candidates(self, intent: MusicalIntent, exclude: list[str], count: int) -> list[Candidate]:
        excluded_ids = {catalog_id(r) for r in CATALOG if f"{r.title} — {r.artist}" in set(exclude)}
        return _candidates_for(intent, count, excluded_ids)

    async def alternatives(
        self, intent: MusicalIntent, track: Track, exclude: list[str], count: int
    ) -> list[Candidate]:
        local = intent.model_copy(update={"energy": track.energy if track.energy is not None else intent.energy})
        excluded_ids = {catalog_id(r) for r in CATALOG if f"{r.title} — {r.artist}" in set(exclude)}
        return _candidates_for(local, count, excluded_ids | {track.id})

    async def pick_from_catalog(self, intent: MusicalIntent, catalog: list[Track], count: int) -> list[CatalogPick]:
        # Closest energy first, popularity as the tie-breaker.
        def score(t: Track) -> float:
            energy = t.energy if t.energy is not None else intent.energy
            return abs(energy - intent.energy) - (t.popularity or 0) / 400

        ranked = sorted(range(len(catalog)), key=lambda i: score(catalog[i]))[:count]
        mood = intent.moods[0] if intent.moods else "the"
        return [
            CatalogPick(
                i,
                catalog[i].energy if catalog[i].energy is not None else intent.energy,
                f"From {catalog[i].artists[0]}'s catalog, fits the {mood} mood",
            )
            for i in ranked
        ]

    async def similar_candidates(self, intent: MusicalIntent, exclude: list[str], count: int) -> list[Candidate]:
        focus = {a.lower() for a in intent.focus_artists}
        excluded_ids = {catalog_id(r) for r in CATALOG if f"{r.title} — {r.artist}" in set(exclude)}
        excluded_ids |= {catalog_id(r) for r in CATALOG if r.artist.lower() in focus}
        open_intent = intent.model_copy(update={"focus_artists": []})
        return _candidates_for(open_intent, count, excluded_ids)
