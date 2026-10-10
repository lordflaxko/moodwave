"""Claude-backed AI provider using structured outputs for guaranteed-valid JSON."""

import json
import logging
from contextvars import ContextVar
from typing import Any, Literal

import anthropic
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas import Candidate, MusicalIntent, PlaylistPlan, RefinementPlan, Track
from app.services.ai import prompts
from app.services.ai.base import AIError, CatalogPick

log = logging.getLogger(__name__)
# The listener's thumbs up/down history for the current request (the provider is shared).
LISTENER_NOTES: ContextVar[tuple[str, ...]] = ContextVar("listener_notes", default=())
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _normalize_intent(raw: dict[str, Any]) -> dict[str, Any]:
    raw["energy"] = _clamp(raw.get("energy", 0.5))
    raw["valence"] = _clamp(raw.get("valence", 0.5))
    lo, hi = int(raw.get("tempo_min", 70)), int(raw.get("tempo_max", 130))
    lo, hi = max(40, min(lo, 220)), max(40, min(hi, 220))
    raw["tempo_min"], raw["tempo_max"] = min(lo, hi), max(lo, hi)
    return raw


def _normalize_candidates(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for candidate in raw:
        candidate["energy"] = _clamp(candidate.get("energy", 0.5))
    return raw


class ClaudeProvider:
    source: Literal["claude"] = "claude"

    def __init__(self, settings: Settings, client: anthropic.AsyncAnthropic | None = None):
        self._settings = settings
        self._client = client or anthropic.AsyncAnthropic(
            # 100-song plans can take a couple of minutes to write.
            api_key=settings.anthropic_api_key,
            max_retries=2,
            timeout=240,
        )

    async def _structured(self, user_message: str, schema: dict, effort: str) -> dict[str, Any]:
        notes = LISTENER_NOTES.get()
        if notes:
            user_message += "\n<listener_feedback>\n" + "\n".join(notes) + "\n</listener_feedback>"
        kwargs: dict[str, Any] = {
            "model": self._settings.anthropic_model,
            # Room for thinking plus ~120 candidates; the SDK's non-streaming ceiling is ~21k.
            "max_tokens": 20000,
            # Static system prompt first so the prefix is cacheable across requests.
            "system": [{"type": "text", "text": prompts.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": user_message}],
            "output_config": {"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        }
        if self._settings.anthropic_enable_fallbacks:
            kwargs["betas"] = [_FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
        try:
            response = await self._client.beta.messages.create(**kwargs)
        except anthropic.RateLimitError as exc:
            raise AIError("The AI service is busy right now (rate limited).") from exc
        except anthropic.APIStatusError as exc:
            log.warning("Claude API error %s: %s", exc.status_code, exc.message)
            raise AIError(f"The AI service returned an error ({exc.status_code}).") from exc
        except anthropic.APIConnectionError as exc:
            raise AIError("Could not reach the AI service.") from exc

        if response.stop_reason == "refusal":
            raise AIError("The AI declined this request. Try rephrasing it.")
        if response.stop_reason == "max_tokens":
            raise AIError("The AI response was cut off.")
        text = next((block.text for block in response.content if block.type == "text"), None)
        if not text:
            raise AIError("The AI returned an empty response.")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise AIError("The AI returned malformed output.") from exc

    async def plan(
        self,
        prompt: str,
        *,
        target: int,
        energy_override: float | None,
        allow_explicit: bool,
        taste_artists: list[str],
    ) -> PlaylistPlan:
        message = prompts.plan_message(prompt, target, energy_override, allow_explicit, taste_artists)
        data = await self._structured(message, prompts.PLAN_SCHEMA, self._settings.anthropic_effort)
        try:
            intent = MusicalIntent(**_normalize_intent(data["intent"]))
            if not allow_explicit:
                intent.explicit_allowed = False
            candidates = [Candidate(**c) for c in _normalize_candidates(data["candidates"])]
        except (KeyError, ValidationError) as exc:
            raise AIError("The AI plan did not match the expected format.") from exc
        return PlaylistPlan(intent=intent, candidates=candidates)

    async def refine(self, intent: MusicalIntent, tracks: list[Track], instruction: str) -> RefinementPlan:
        lines = [
            f"{t.id} | {t.title} — {', '.join(t.artists)} | explicit={'yes' if t.explicit else 'no'}"
            f" | energy={t.energy if t.energy is not None else '?'}"
            for t in tracks
        ]
        message = prompts.refine_message(intent.model_dump_json(), "\n".join(lines), instruction)
        data = await self._structured(message, prompts.REFINE_SCHEMA, "low")
        try:
            return RefinementPlan(
                intent=MusicalIntent(**_normalize_intent(data["intent"])),
                remove_track_ids=data["remove_track_ids"],
                candidates=[Candidate(**c) for c in _normalize_candidates(data["candidates"])],
                target_length=int(data.get("target_length") or len(tracks)),
                summary=data["summary"],
            )
        except (KeyError, ValidationError) as exc:
            raise AIError("The AI refinement did not match the expected format.") from exc

    async def _candidates(self, message: str) -> list[Candidate]:
        data = await self._structured(message, prompts.CANDIDATES_ONLY_SCHEMA, "low")
        try:
            return [Candidate(**c) for c in _normalize_candidates(data["candidates"])]
        except (KeyError, ValidationError) as exc:
            raise AIError("The AI suggestions did not match the expected format.") from exc

    async def more_candidates(self, intent: MusicalIntent, exclude: list[str], count: int) -> list[Candidate]:
        return await self._candidates(prompts.more_message(intent.model_dump_json(), exclude, count))

    async def alternatives(
        self, intent: MusicalIntent, track: Track, exclude: list[str], count: int
    ) -> list[Candidate]:
        line = f"{track.title} — {', '.join(track.artists)} (energy {track.energy})"
        return await self._candidates(prompts.alternatives_message(intent.model_dump_json(), line, exclude, count))

    async def pick_from_catalog(self, intent: MusicalIntent, catalog: list[Track], count: int) -> list[CatalogPick]:
        lines = [
            f"{i} | {t.title} — {', '.join(t.artists)}"
            + (f" | {t.release_year}" if t.release_year else "")
            + (f" | popularity {t.popularity}" if t.popularity is not None else "")
            for i, t in enumerate(catalog)
        ]
        message = prompts.catalog_pick_message(intent.model_dump_json(), lines, count)
        data = await self._structured(message, prompts.PICKS_SCHEMA, "low")
        try:
            picks = [
                CatalogPick(int(p["index"]), _clamp(p.get("energy", 0.5)), str(p["reason"])) for p in data["picks"]
            ]
        except (KeyError, TypeError, ValueError) as exc:
            raise AIError("The AI catalog picks did not match the expected format.") from exc
        # Only indices that exist, each once.
        seen: set[int] = set()
        return [p for p in picks if 0 <= p.index < len(catalog) and not (p.index in seen or seen.add(p.index))]

    async def similar_candidates(self, intent: MusicalIntent, exclude: list[str], count: int) -> list[Candidate]:
        message = prompts.similar_message(intent.model_dump_json(), intent.focus_artists, exclude, count)
        return await self._candidates(message)
