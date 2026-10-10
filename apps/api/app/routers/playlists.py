"""Playlist generation, refinement, editing, persistence and saving to Spotify."""

import asyncio
import base64
import binascii
import json
import logging
import secrets
import traceback
from collections import Counter
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlmodel import col, select

from app.core.config import get_settings
from app.deps import CurrentUser, DbSession, generation_rate_limit, get_pipeline, get_spotify
from app.models import Playlist, PlaylistCover, PlaylistTrack, RefinementTurn
from app.routers.feedback import load_preferences
from app.routers.telemetry import record_error
from app.schemas import (
    CoverImageRequest,
    CoverOut,
    CoverRequest,
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
from app.services.ai.heuristic import HeuristicProvider
from app.services.cover import CoverImageError, build_cover, process_upload
from app.services.guest import GUEST_BUSY_NOTICE, enforce_guest_generation, guest_ai_available
from app.services.pipeline import PlaylistPipeline, compute_stats
from app.services.seed import load_seed
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
    # Guests share a daily AI budget; past it they get the offline curator.
    if user.is_guest and pipeline.ai.source != "heuristic" and not guest_ai_available(db):
        pipeline.ai = HeuristicProvider()
        pipeline.guest_notice = GUEST_BUSY_NOTICE
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
        synced_at=playlist.synced_at,
        needs_sync=_needs_sync(playlist),
        cover=_cover_out(playlist, tracks),
        share_slug=playlist.share_slug,
    )


def _chosen(playlist: Playlist, tracks: list[Track]) -> tuple[str, list[Track]]:
    """The effective cover mode and the songs whose artwork it uses.

    A grid or single choice whose songs were since removed falls back to automatic.
    """
    config = playlist.cover or {}
    mode = config.get("mode", "auto")
    if mode == "upload":
        return mode, []
    if mode in ("grid", "single"):
        by_id = {t.id: t for t in tracks}
        chosen = [by_id[i] for i in config.get("track_ids", []) if i in by_id and by_id[i].image_url]
        if len(chosen) >= (4 if mode == "grid" else 1):
            return mode, chosen[: 4 if mode == "grid" else 1]
    return "auto", tracks


def _cover_images(playlist: Playlist, tracks: list[Track]) -> list[str | None]:
    mode, chosen = _chosen(playlist, tracks)
    if mode == "upload":
        return [f"/playlists/{playlist.id}/cover.jpg?v={(playlist.cover or {}).get('v', 0)}"]
    if mode == "auto":
        return [t.image_url for t in tracks[:4]]
    return [t.image_url for t in chosen]


def _cover_out(playlist: Playlist, tracks: list[Track]) -> CoverOut:
    mode, chosen = _chosen(playlist, tracks)
    return CoverOut(
        mode=mode,
        track_ids=[t.id for t in chosen] if mode in ("grid", "single") else [],
        images=_cover_images(playlist, tracks),
    )


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _needs_sync(playlist: Playlist) -> bool:
    if not playlist.spotify_playlist_id or playlist.synced_at is None:
        return False
    return (_aware(playlist.updated_at) - _aware(playlist.synced_at)).total_seconds() > 1


def _no_guests(user: CurrentUser) -> None:
    if user.is_guest:
        raise HTTPException(
            403, "Guest playlists can't be saved to Spotify. Sign in with Spotify and this playlist comes with you."
        )


def _spotify_description(playlist: Playlist) -> str:
    return f"{playlist.description} Made with Moodwave from: “{playlist.prompt}”"


async def _cover_jpeg(db: DbSession, playlist: Playlist, tracks: list[Track]) -> bytes | None:
    mode, chosen = _chosen(playlist, tracks)
    if mode == "upload":
        stored = db.get(PlaylistCover, playlist.id)
        return stored.jpeg if stored else None
    return await build_cover(chosen, 1 if mode == "single" else 4)


async def _apply_cover(
    spotify: SpotifyClient, spotify_id: str, db: DbSession, playlist: Playlist, tracks: list[Track]
) -> str | None:
    """Upload the chosen cover. Never fails the save; returns a notice when the cover couldn't be set."""
    if spotify.is_demo:
        return None
    try:
        jpeg = await _cover_jpeg(db, playlist, tracks)
        if jpeg:
            await spotify.set_cover(spotify_id, jpeg)
        return None
    except SpotifyError as exc:
        log.info("Cover upload failed: %s", exc)
        if exc.status in (401, 403):
            return (
                "Saved. To add Moodwave's custom cover too, sign in with Spotify again (it needs one new permission)."
            )
        return None
    except Exception:  # noqa: BLE001 - the cover is a nice-to-have
        log.warning("Cover build failed", exc_info=True)
        return None


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
    guest_notes: list[str] = []
    if user.is_guest:
        enforce_guest_generation(db, user)
        limit = get_settings().guest_max_tracks
        if body.length > limit:
            body = body.model_copy(update={"length": limit})
            guest_notes.append(f"Guest playlists are up to {limit} songs; sign in with Spotify for up to 100.")
        body = body.model_copy(update={"use_my_taste": False})
        if getattr(pipeline, "guest_notice", None):
            guest_notes.append(pipeline.guest_notice)
    seed = await load_seed(body.seed_url, pipeline.spotify) if body.seed_url else None
    result = await pipeline.generate(
        body.prompt.strip(),
        target=body.length,
        energy=body.energy,
        allow_explicit=body.allow_explicit,
        use_my_taste=body.use_my_taste,
        seed=seed,
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
    notice = " ".join(n for n in [result.notice, *guest_notes] if n) or None
    return _to_out(playlist, notice)


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
                cover_images=_cover_images(p, tracks),
                cover_seeds=[t.album for t in tracks[:4]],
                artists=[a for a, _ in Counter(t.artists[0] for t in tracks if t.artists).most_common(30)],
                genres=p.intent.get("genres", [])[:4],
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
    _no_guests(user)
    playlist = _get_owned(db, user, playlist_id)
    tracks = _tracks(playlist)
    saved = await spotify.create_playlist(playlist.title, _spotify_description(playlist), [t.uri for t in tracks])
    notice = await _apply_cover(spotify, saved.id, db, playlist, tracks)
    now = datetime.now(UTC)
    playlist.spotify_playlist_id, playlist.spotify_url = saved.id, saved.url
    playlist.updated_at = playlist.synced_at = now
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist, notice)


@router.post("/{playlist_id}/sync", response_model=PlaylistOut)
async def sync_to_spotify(playlist_id: str, user: CurrentUser, db: DbSession, spotify: SpotifyDep) -> PlaylistOut:
    """Make the saved Spotify copy match: name, description, songs in order, and the cover."""
    _no_guests(user)
    playlist = _get_owned(db, user, playlist_id)
    if not playlist.spotify_playlist_id:
        raise HTTPException(409, "Save this playlist to Spotify first.")
    tracks = _tracks(playlist)
    try:
        await spotify.replace_playlist(
            playlist.spotify_playlist_id, playlist.title, _spotify_description(playlist), [t.uri for t in tracks]
        )
    except SpotifyError as exc:
        if exc.status == 404:
            raise HTTPException(
                404, "That playlist is gone from your Spotify. Save it again to make a new copy."
            ) from exc
        raise
    notice = await _apply_cover(spotify, playlist.spotify_playlist_id, db, playlist, tracks)
    now = datetime.now(UTC)
    playlist.updated_at = playlist.synced_at = now
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist, notice)


@router.post("/{playlist_id}/share", response_model=PlaylistOut)
def share_playlist(playlist_id: str, user: CurrentUser, db: DbSession) -> PlaylistOut:
    """Turn on a public, read-only link (idempotent: the same link comes back)."""
    playlist = _get_owned(db, user, playlist_id)
    if not playlist.share_slug:
        while True:
            slug = secrets.token_urlsafe(7).replace("-", "x").replace("_", "y")
            if db.exec(select(Playlist).where(Playlist.share_slug == slug)).first() is None:
                break
        playlist.share_slug = slug
        db.add(playlist)
        db.commit()
        db.refresh(playlist)
    return _to_out(playlist)


@router.delete("/{playlist_id}/share", response_model=PlaylistOut)
def unshare_playlist(playlist_id: str, user: CurrentUser, db: DbSession) -> PlaylistOut:
    """Turn the link off; it stops working everywhere (a new share makes a new link)."""
    playlist = _get_owned(db, user, playlist_id)
    playlist.share_slug = None
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.post("/{playlist_id}/duplicate", response_model=PlaylistOut, status_code=status.HTTP_201_CREATED)
def duplicate_playlist(playlist_id: str, user: CurrentUser, db: DbSession) -> PlaylistOut:
    """A private copy to take somewhere else: same songs, cover and intent; not shared or saved."""
    source = _get_owned(db, user, playlist_id)
    copy = Playlist(
        user_id=user.id,
        title=f"{source.title} (copy)"[:100],
        description=source.description,
        prompt=source.prompt,
        intent=dict(source.intent),
        ai_source=source.ai_source,
        cover=dict(source.cover) if source.cover else None,
    )
    _set_tracks(copy, _tracks(source))
    db.add(copy)
    db.flush()
    upload = db.get(PlaylistCover, source.id)
    if upload is not None:
        db.add(PlaylistCover(playlist_id=copy.id, jpeg=upload.jpeg))
    db.commit()
    db.refresh(copy)
    return _to_out(copy)


@router.put("/{playlist_id}/cover", response_model=PlaylistOut)
def set_cover(playlist_id: str, body: CoverRequest, user: CurrentUser, db: DbSession) -> PlaylistOut:
    """Choose the cover: automatic, a grid of four songs' artwork, or one song's artwork."""
    playlist = _get_owned(db, user, playlist_id)
    tracks = {t.id: t for t in _tracks(playlist)}
    ids = list(dict.fromkeys(body.track_ids))
    need = {"auto": 0, "grid": 4, "single": 1}[body.mode]
    if len(ids) != need:
        raise HTTPException(422, f"Pick {need} song{'s' if need != 1 else ''} for this cover.")
    if any(i not in tracks or not tracks[i].image_url for i in ids):
        raise HTTPException(422, "Pick songs from this playlist that have artwork.")
    if body.mode == "grid" and len({tracks[i].image_url for i in ids}) < 4:
        raise HTTPException(422, "Pick four songs with different artwork for a grid.")
    _drop_upload(db, playlist.id)
    playlist.cover = None if body.mode == "auto" else {"mode": body.mode, "track_ids": ids}
    playlist.updated_at = datetime.now(UTC)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.put("/{playlist_id}/cover/image", response_model=PlaylistOut)
async def upload_cover(playlist_id: str, body: CoverImageRequest, user: CurrentUser, db: DbSession) -> PlaylistOut:
    """Use your own image as the cover (cropped square, 640px, within Spotify's size limit)."""
    playlist = _get_owned(db, user, playlist_id)
    raw = body.image.split(",", 1)[1] if body.image.startswith("data:") else body.image
    try:
        data = base64.b64decode(raw, validate=False)
        jpeg = await asyncio.to_thread(process_upload, data)
    except (CoverImageError, binascii.Error, ValueError) as exc:
        message = str(exc) if isinstance(exc, CoverImageError) else "That file isn't an image we can use."
        raise HTTPException(422, message) from exc
    now = datetime.now(UTC)
    stored = db.get(PlaylistCover, playlist.id)
    if stored is None:
        stored = PlaylistCover(playlist_id=playlist.id, jpeg=jpeg, updated_at=now)
    else:
        stored.jpeg, stored.updated_at = jpeg, now
    db.add(stored)
    playlist.cover = {"mode": "upload", "v": int(now.timestamp())}
    playlist.updated_at = now
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_out(playlist)


@router.get("/{playlist_id}/cover.jpg", include_in_schema=False)
def cover_image(playlist_id: str, db: DbSession) -> Response:
    """An uploaded cover. Public by unguessable id so <img> tags can load it; versioned by `?v=`."""
    stored = db.get(PlaylistCover, playlist_id)
    if stored is None:
        raise HTTPException(404, "No uploaded cover.")
    return Response(
        stored.jpeg, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )


def _drop_upload(db: DbSession, playlist_id: str) -> None:
    stored = db.get(PlaylistCover, playlist_id)
    if stored is not None:
        db.delete(stored)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: str, user: CurrentUser, db: DbSession) -> None:
    playlist = _get_owned(db, user, playlist_id)
    _drop_upload(db, playlist.id)
    db.flush()
    db.delete(playlist)
    db.commit()
