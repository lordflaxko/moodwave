"""Prompts and JSON schemas for the Claude provider.

The system prompt is static (no timestamps or per-request data) so it can be cached.
Schemas are used with structured outputs (`output_config.format`), which guarantees
the response is JSON matching the schema. Numeric ranges are enforced afterwards by
Pydantic and clamping, since range keywords are not part of the supported schema subset.
"""

SYSTEM_PROMPT = """You are Moodwave's music curator: a world-class DJ and music supervisor with \
encyclopedic knowledge of recorded music across eras, genres and regions.

You turn a listener's natural-language request (a mood, activity, setting, genre or memory) into a \
playlist plan. A separate system resolves your song picks against Spotify's catalog, so:

- Only suggest songs that really exist as commercially released recordings. Use the exact \
canonical song title and the primary credited artist (no "feat." in the artist field).
- Prefer well-known studio versions over live versions, remixes or covers unless asked.
- Never repeat a song, and use at most two songs per artist unless the request is about one artist.
- Mix familiar anchors with deeper cuts so the playlist feels curated, not algorithmic.
- Sequence candidates in a satisfying listening order (opening, build, peak, wind-down as appropriate).
- Respect explicit-content and vocal preferences strictly.
- Estimate each song's energy from 0.0 (very calm) to 1.0 (very intense).
- Keep `reason` fields short (under 14 words), concrete and specific to the song.
- The `rationale` speaks to the listener in 2-3 sentences: why these moods, energy and sounds fit \
their request. Be warm and specific, not generic.
- `title` is an evocative playlist name of at most 5 words; `description` is one sentence.
- energy and valence are 0.0-1.0; tempo values are BPM between 40 and 220.
"""

_INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "moods": {"type": "array", "items": {"type": "string"}},
        "genres": {"type": "array", "items": {"type": "string"}},
        "characteristics": {"type": "array", "items": {"type": "string"}},
        "energy": {"type": "number"},
        "valence": {"type": "number"},
        "tempo_min": {"type": "integer"},
        "tempo_max": {"type": "integer"},
        "era": {"type": ["string", "null"]},
        "vocals": {"type": "string", "enum": ["any", "female", "male", "mixed", "instrumental"]},
        "explicit_allowed": {"type": "boolean"},
        "reference_artists": {"type": "array", "items": {"type": "string"}},
        "rationale": {"type": "string"},
    },
    "required": [
        "title",
        "description",
        "moods",
        "genres",
        "characteristics",
        "energy",
        "valence",
        "tempo_min",
        "tempo_max",
        "era",
        "vocals",
        "explicit_allowed",
        "reference_artists",
        "rationale",
    ],
    "additionalProperties": False,
}

_CANDIDATES_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "artist": {"type": "string"},
            "energy": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": ["title", "artist", "energy", "reason"],
        "additionalProperties": False,
    },
}

PLAN_SCHEMA = {
    "type": "object",
    "properties": {"intent": _INTENT_SCHEMA, "candidates": _CANDIDATES_SCHEMA},
    "required": ["intent", "candidates"],
    "additionalProperties": False,
}

REFINE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": _INTENT_SCHEMA,
        "remove_track_ids": {"type": "array", "items": {"type": "string"}},
        "candidates": _CANDIDATES_SCHEMA,
        "target_length": {"type": "integer"},
        "summary": {"type": "string"},
    },
    "required": ["intent", "remove_track_ids", "candidates", "target_length", "summary"],
    "additionalProperties": False,
}

CANDIDATES_ONLY_SCHEMA = {
    "type": "object",
    "properties": {"candidates": _CANDIDATES_SCHEMA},
    "required": ["candidates"],
    "additionalProperties": False,
}


def plan_message(
    prompt: str, target: int, energy_override: float | None, allow_explicit: bool, taste: list[str]
) -> str:
    lines = [
        f"<request>{prompt}</request>",
        f"Target playlist length: {target} songs. Propose {target + 14} candidates in listening order "
        "(extras absorb songs that can't be found on Spotify).",
        f"Explicit songs allowed: {'yes' if allow_explicit else 'no - set explicit_allowed to false and avoid explicit songs'}.",
    ]
    if energy_override is not None:
        lines.append(f"The listener set the energy dial to {energy_override:.2f}; center the playlist there.")
    if taste:
        lines.append(
            "Listener's top artists (light personalization only; don't let them dominate): " + ", ".join(taste[:10])
        )
    return "\n".join(lines)


def refine_message(intent_json: str, tracks_block: str, instruction: str) -> str:
    return (
        f"<current_intent>{intent_json}</current_intent>\n"
        f"<current_tracks>\n{tracks_block}\n</current_tracks>\n"
        f"<instruction>{instruction}</instruction>\n\n"
        "Update the playlist to follow the instruction. Return the full updated intent (with an updated "
        "rationale), the ids of tracks to remove (use the exact ids shown), and new candidate songs to add. "
        "Propose roughly 1.5x as many candidates as songs removed (plus extras if the listener wants a "
        "longer playlist) so the playlist keeps about the same length unless asked otherwise. Keep tracks "
        "that still fit. `target_length` is how many songs the playlist should have afterwards (keep the "
        "current count unless the listener asks for a shorter or longer playlist). `summary` tells the listener what you changed in one or two sentences."
    )


def more_message(intent_json: str, exclude: list[str], count: int) -> str:
    return (
        f"<intent>{intent_json}</intent>\n"
        f"<already_used>\n" + "\n".join(exclude) + "\n</already_used>\n"
        f"Suggest {count} more songs that fit this intent and are not already used."
    )


def alternatives_message(intent_json: str, track_line: str, exclude: list[str], count: int) -> str:
    return (
        f"<intent>{intent_json}</intent>\n"
        f"<replace>{track_line}</replace>\n"
        f"<already_used>\n" + "\n".join(exclude) + "\n</already_used>\n"
        f"Suggest {count} different songs that could take this song's place: similar energy and role in "
        "the sequence, consistent with the intent, not already used."
    )
