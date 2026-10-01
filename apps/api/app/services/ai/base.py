"""The AI provider contract used by the playlist pipeline."""

from typing import Literal, Protocol

from app.schemas import Candidate, MusicalIntent, PlaylistPlan, RefinementPlan, Track


class AIError(Exception):
    """Raised when the model call fails, refuses, or returns unusable output."""


class AIProvider(Protocol):
    source: Literal["claude", "heuristic"]

    async def plan(
        self,
        prompt: str,
        *,
        target: int,
        energy_override: float | None,
        allow_explicit: bool,
        taste_artists: list[str],
    ) -> PlaylistPlan:
        """Interpret a prompt into a musical intent plus candidate songs."""
        ...

    async def refine(self, intent: MusicalIntent, tracks: list[Track], instruction: str) -> RefinementPlan:
        """Apply a follow-up instruction to an existing playlist."""
        ...

    async def more_candidates(self, intent: MusicalIntent, exclude: list[str], count: int) -> list[Candidate]:
        """Backfill: propose additional songs not in `exclude` ("Title — Artist")."""
        ...

    async def alternatives(
        self, intent: MusicalIntent, track: Track, exclude: list[str], count: int
    ) -> list[Candidate]:
        """Propose replacements for one song that keep the playlist's flow."""
        ...
