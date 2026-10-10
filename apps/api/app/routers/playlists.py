"""Playlist generation, refinement, editing, persistence and saving to Spotify."""

import asyncio
import json
import logging
import traceback
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlmodel import col, select

from app.deps import CurrentUser, DbSession, generation_rate_limit, get_pipeline, get_spotify
from app.models import Playlist, PlaylistTrack, RefinementTurn
from app.routers.feedback import load_preferences
from app.routers.telemetry import record_error
from app.schemas import (
    GenerateRequest,
    MusicalIntent,
    PlaylistOut,
    PlaylistSummary,
    RefinementOut,
    RefineRequest,
    ReplaceTracksRequest,
    Track,
    UpdatePlaylistRequest,
)
from app.services.ai.base import AIError
from app.services.pipeline import PlaylistPipeline, compute_stats
from app.services.spotify.base import SpotifyClient, SpotifyError
from app.services.spotify.catalog_scoring import CATALOG_BY_ID, artist_image_map, artwork_map

router = APIRouter(prefix="/playlists", tags=["playlists"])
log = logging.getLogger(__name__)


def get_steered_pipeline(
    pipeline: Annotated[PlaylistPipeline, Depends(get_pipeline)], user: CurrentUser, db: DbSession
) -> PlaylistPipeline:
    """The pipeline, steered by this listener's thumbs up/down."""
    prefs = load_preferences(db, user.id)
    pipeline.use_preferences(prefs.avoid_ids, prefs.avoid_artists, prefs.prompt_lines())
    return pipeline


PipelineDep = Annotated[PlaylistPipeline, Depends(get_steered_pipeline)]
SpotifyDep = Annotated[SpotifyClient, Depends(get_spotify)]


# --- Helpers -------------------------------------------------------------------------------


def _tracks(playlist: Playlist) -> list[Track]:
    return [_with_current_artwork(Track(**row.data)) for row in playlist.tracks]


def _with_current_artwork(track: Track) -> Track:
    """Demo-catalog tracks always show the latest committed artwork, so playlists saved
    before artwork existed (or before a fix) pick it up without a migration."""
    if not track.id.startswith("demo_"):
        return track
    cover = artwork_map().get(track.id)
    row = CATALOG_BY_ID.get(track.id)
    portrait = artist_image_map().get(row.artist) if row else None
    return track.model_copy(
        update={
            "image_url": cover or track.image_url,
            "artist_images": [portrait] if portrait else track.artist_images,
        }
    )


def _set_tracks(playlist: Playlist, tracks: list[Track]) -> None:
    playlist.tracks = [PlaylistTrack(position=i, data=t.model_dump()) for i, t in enumerate(tracks)]
    playlist.updated_at = datetime.now(UTC)


def _to_out(playlist: Playlist, notice: str | None = None) -> PlaylistOut:
    tracks = _tracks(playlist)
    return PlaylistOut(
        id=playlist.id,
        title=playlist.title,
        description=playlist.description,
        prompt=playlist.prompt,
        intent=MusicalIntent(**playlist.intent),
        tracks=tracks,
        stats=compute_stats(tracks),
        refinements=[
            RefinementOut(
                id=r.id or 0,
                instruction=r.instruction,
                summary=r.summary,
                added=r.added,
                removed=r.removed,
                created_at=r.created_at,
            )
            for r in playlist.refinements
        ],
        ai_source="claude" if playlist.ai_source == "claude" else "heuristic",
        spotify_playlist_id=playlist.spotify_playlist_id,
        spotify_url=playlist.spotify_url,
        notice=notice,
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
    )


def _get_owned(db: DbSession, user: CurrentUser, playlist_id: str) -> Playlist:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None or playlist.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Playlist not found.")
    return playlist


# --- Routes --------------------------------------------------------------------------------------


@router.post(
    "/generate",
    response_model=PlaylistOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(generation_rate_limit)],
)
async def generate(body: GenerateRequest, user: CurrentUser, db: DbSession, pipeline: PipelineDep) -> PlaylistOut:
    return await _generate_and_store(body, user, db, pipeline)


async def _generate_and_store(
    body: GenerateRequest, user: CurrentUser, db: DbSession, pipeline: PlaylistPipeline
) -> PlaylistOut:
    result = await pipeline.generate(
        body.prompt.strip(),
        target=body.length,
        energy=body.energy,
        allow_explicit=body.allow_explicit,
        use_my_taste=body.use_my_taste,
    )
    if not result.tracks:
        raise HTTPException(422, "No songs matched that request. Try describing it differently.")
    playlist = Playlist(
        user_id=user.id,
        title=result.intent.title,
        description=result.intent.description,
        prompt=body.prompt.strip(),
        intent=result.intent.model_dump(),
        ai_source=result.source,
    )
    _set_tracks(playlist, result.tracks)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist, result.notice)


# Streamed generations keep running if the tab closes; the playlist still lands in the library.
_background: set[asyncio.Task] = set()


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, separators=(',', ':'))}\n\n"


@router.post("/generate/stream", dependencies=[Depends(generation_rate_limit)])
async def generate_stream(
    body: GenerateRequest, request: Request, user: CurrentUser, db: DbSession, pipeline: PipelineDep
) -> StreamingResponse:
    """Same as /generate, but streams progress as Server-Sent Events, ending in `done` or `error`."""
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def progress(event: dict) -> None:
        await queue.put(event)

    pipeline.progress = progress

    async def work() -> None:
        try:
            out = await _generate_and_store(body, user, db, pipeline)
            await queue.put({"type": "done", "playlist": out.model_dump(mode="json")})
        except HTTPException as exc:
            await queue.put({"type": "error", "status": exc.status_code, "detail": exc.detail})
        except SpotifyError as exc:
            code = exc.status if exc.status in (401, 403, 404, 429) else 502
            await queue.put({"type": "error", "status": code, "detail": str(exc)})
        except AIError as exc:
            await queue.put({"type": "error", "status": 503, "detail": str(exc)})
        except Exception as exc:  # noqa: BLE001 - reported to the client and the error log
            log.exception("Streamed generation failed")
            try:
                record_error(
                    db,
                    source="api",
                    message=f"{type(exc).__name__}: {exc}"[:1000],
                    stack="".join(traceback.format_exception(exc))[-4000:],
                    page="POST /playlists/generate/stream",
                    user_agent=request.headers.get("user-agent", ""),
                )
            except Exception:  # noqa: BLE001
                log.warning("Could not record error", exc_info=True)
            await queue.put(
                {"type": "error", "status": 500, "detail": "Something went wrong on our side. It's been logged."}
            )
        finally:
            await queue.put(None)

    async def events() -> AsyncIterator[str]:
        # Padding defeats proxy buffering so the first events arrive immediately.
        yield ":" + " " * 2048 + "\n\n"
        task = asyncio.create_task(work())
        _background.add(task)
        task.add_done_callback(_background.discard)
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if event is None:
                break
            yield _sse(event)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("", response_model=list[PlaylistSummary])
def list_playlists(user: CurrentUser, db: DbSession) -> list[PlaylistSummary]:
    playlists = db.exec(
        select(Playlist).where(Playlist.user_id == user.id).order_by(col(Playlist.created_at).desc())
    ).all()
    out = []
    for p in playlists:
        tracks = _tracks(p)
        out.append(
            PlaylistSummary(
                id=p.id,
                title=p.title,
                prompt=p.prompt,
                moods=p.intent.get("moods", [])[:3],
                energy=p.intent.get("energy", 0.5),
                cover_images=[t.image_url for t in tracks[:4]],
                cover_seeds=[t.album for t in tracks[:4]],
                track_count=len(tracks),
                total_duration_ms=sum(t.duration_ms for t in tracks),
                saved_to_spotify=p.spotify_playlist_id is not None,
                spotify_url=p.spotify_url,
                created_at=p.created_at,
            )
        )
    return out


@router.get("/{playlist_id}", response_model=PlaylistOut)
def get_playlist(playlist_id: str, user: CurrentUser, db: DbSession) -> PlaylistOut:
    return _to_out(_get_owned(db, user, playlist_id))


@router.patch("/{playlist_id}", response_model=PlaylistOut)
def update_playlist(playlist_id: str, body: UpdatePlaylistRequest, user: CurrentUser, db: DbSession) -> PlaylistOut:
    playlist = _get_owned(db, user, playlist_id)
    if body.title is not None:
        playlist.title = body.title.strip()
    if body.description is not None:
        playlist.description = body.description.strip()
    playlist.updated_at = datetime.now(UTC)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.put("/{playlist_id}/tracks", response_model=PlaylistOut)
def replace_tracks(playlist_id: str, body: ReplaceTracksRequest, user: CurrentUser, db: DbSession) -> PlaylistOut:
    """Persist a reordered / edited track list from the editor."""
    playlist = _get_owned(db, user, playlist_id)
    ids = [t.id for t in body.tracks]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "A song can only appear once in a playlist.")
    _set_tracks(playlist, body.tracks)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.post("/{playlist_id}/refine", response_model=PlaylistOut, dependencies=[Depends(generation_rate_limit)])
async def refine(
    playlist_id: str, body: RefineRequest, user: CurrentUser, db: DbSession, pipeline: PipelineDep
) -> PlaylistOut:
    playlist = _get_owned(db, user, playlist_id)
    result = await pipeline.refine(MusicalIntent(**playlist.intent), _tracks(playlist), body.instruction.strip())
    playlist.intent = result.intent.model_dump()
    _set_tracks(playlist, result.tracks)
    playlist.refinements.append(
        RefinementTurn(
            instruction=body.instruction.strip(), summary=result.summary, added=result.added, removed=result.removed
        )
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist, result.notice)


@router.post("/{playlist_id}/regenerate", response_model=PlaylistOut, dependencies=[Depends(generation_rate_limit)])
async def regenerate(playlist_id: str, user: CurrentUser, db: DbSession, pipeline: PipelineDep) -> PlaylistOut:
    playlist = _get_owned(db, user, playlist_id)
    intent = MusicalIntent(**playlist.intent)
    current = _tracks(playlist)
    result = await pipeline.generate(
        playlist.prompt,
        target=max(15, min(30, len(current))),
        energy=None,
        allow_explicit=intent.explicit_allowed,
        use_my_taste=False,
    )
    if not result.tracks:
        raise HTTPException(422, "Couldn't regenerate this playlist right now.")
    playlist.intent = result.intent.model_dump()
    playlist.title, playlist.description = result.intent.title, result.intent.description
    playlist.ai_source = result.source
    _set_tracks(playlist, result.tracks)
    playlist.refinements.append(
        RefinementTurn(
            instruction="Regenerate",
            summary="Started fresh from your original prompt.",
            added=len({t.id for t in result.tracks} - {t.id for t in current}),
            removed=len({t.id for t in current} - {t.id for t in result.tracks}),
        )
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist, result.notice)


@router.post("/{playlist_id}/tracks/{track_id}/replace", response_model=PlaylistOut)
async def replace_one(
    playlist_id: str, track_id: str, user: CurrentUser, db: DbSession, pipeline: PipelineDep
) -> PlaylistOut:
    playlist = _get_owned(db, user, playlist_id)
    try:
        tracks = await pipeline.replace_track(MusicalIntent(**playlist.intent), _tracks(playlist), track_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    _set_tracks(playlist, tracks)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.post("/{playlist_id}/save", response_model=PlaylistOut)
async def save_to_spotify(playlist_id: str, user: CurrentUser, db: DbSession, spotify: SpotifyDep) -> PlaylistOut:
    playlist = _get_owned(db, user, playlist_id)
    tracks = _tracks(playlist)
    description = f"{playlist.description} Made with Moodwave from: “{playlist.prompt}”"
    saved = await spotify.create_playlist(playlist.title, description, [t.uri for t in tracks])
    playlist.spotify_playlist_id, playlist.spotify_url = saved.id, saved.url
    playlist.updated_at = datetime.now(UTC)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: str, user: CurrentUser, db: DbSession) -> None:
    db.delete(_get_owned(db, user, playlist_id))
    db.commit()
