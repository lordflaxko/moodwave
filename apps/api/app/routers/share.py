"""Public, read-only share links.

`/s/{slug}` is the link people paste: a tiny page with Open Graph / Twitter tags (so chat
apps show a rich preview with the cover) that forwards to the site's shared-playlist page.
`/share/{slug}` is the JSON that page reads. Nothing here needs a session.
"""

import html
import json
from collections import OrderedDict
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlmodel import select

from app.core.config import get_settings
from app.deps import DbSession
from app.models import Playlist, PlaylistCover, User
from app.schemas import CoverOut, MusicalIntent, PlaylistStats, Track
from app.services.cover import build_cover
from app.services.pipeline import compute_stats

router = APIRouter(tags=["share"])

# Built preview covers, keyed by slug + last edit, so a busy link isn't redrawn every hit.
_COVER_CACHE: "OrderedDict[str, bytes]" = OrderedDict()
_COVER_CACHE_SIZE = 64


class SharedPlaylistOut(BaseModel):
    slug: str
    title: str
    description: str
    prompt: str
    intent: MusicalIntent
    tracks: list[Track]
    stats: PlaylistStats
    cover: CoverOut
    curator: str
    created_at: datetime


def find_shared(db: DbSession, slug: str) -> Playlist:
    playlist = db.exec(select(Playlist).where(Playlist.share_slug == slug)).first()
    if playlist is None:
        raise HTTPException(404, "This share link doesn't exist or was turned off.")
    return playlist


def public_base(request: Request) -> str:
    """This API's public address (Render terminates TLS, so trust X-Forwarded-Proto)."""
    configured = get_settings().public_api_url.rstrip("/")
    if configured:
        return configured
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{proto}://{request.headers.get('host', request.url.netloc)}"


def _first_name(db: DbSession, user_id: str) -> str:
    user = db.get(User, user_id)
    name = (user.display_name if user else "") or ""
    return name.split()[0] if name.strip() else "A listener"


@router.get("/share/{slug}", response_model=SharedPlaylistOut)
def shared_playlist(slug: str, db: DbSession) -> SharedPlaylistOut:
    from app.routers.playlists import _cover_out, _tracks  # shared helpers

    playlist = find_shared(db, slug)
    tracks = _tracks(playlist)
    return SharedPlaylistOut(
        slug=slug,
        title=playlist.title,
        description=playlist.description,
        prompt=playlist.prompt,
        intent=MusicalIntent(**playlist.intent),
        tracks=tracks,
        stats=compute_stats(tracks),
        cover=_cover_out(playlist, tracks),
        curator=_first_name(db, playlist.user_id),
        created_at=playlist.created_at,
    )


@router.get("/s/{slug}/cover.jpg", include_in_schema=False)
async def shared_cover(slug: str, db: DbSession) -> Response:
    from app.routers.playlists import _chosen, _tracks

    playlist = find_shared(db, slug)
    key = f"{slug}:{playlist.updated_at.isoformat()}"
    jpeg = _COVER_CACHE.get(key)
    if jpeg is None:
        mode, chosen = _chosen(playlist, _tracks(playlist))
        if mode == "upload":
            stored = db.get(PlaylistCover, playlist.id)
            jpeg = stored.jpeg if stored else None
        else:
            jpeg = await build_cover(chosen, 1 if mode == "single" else 4)
        if jpeg is None:
            raise HTTPException(404, "No cover yet.")
        _COVER_CACHE[key] = jpeg
        while len(_COVER_CACHE) > _COVER_CACHE_SIZE:
            _COVER_CACHE.popitem(last=False)
    return Response(jpeg, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


@router.get("/s/{slug}", response_class=HTMLResponse, include_in_schema=False)
def share_page(slug: str, request: Request, db: DbSession) -> HTMLResponse:
    """A preview card for chat apps and social sites, then straight on to the site."""
    playlist = find_shared(db, slug)
    settings = get_settings()
    target = f"{settings.share_page_url}?s={slug}"
    count = len(playlist.tracks)
    curator = _first_name(db, playlist.user_id)
    title = html.escape(f"{playlist.title} · Moodwave")
    description = html.escape(f"{count} songs from “{playlist.prompt}” — a playlist {curator} made with Moodwave.")
    image = html.escape(f"{public_base(request)}/s/{slug}/cover.jpg?v={int(playlist.updated_at.timestamp())}")
    url = html.escape(target)
    page = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>{title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{description}">
<meta property="og:type" content="music.playlist">
<meta property="og:site_name" content="Moodwave">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="640">
<meta property="og:image:height" content="640">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{image}">
<meta name="theme-color" content="#0b0a0d">
<link rel="canonical" href="{url}">
<meta http-equiv="refresh" content="0; url={url}">
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a0d;color:#b3ada4;font:15px system-ui,sans-serif}}a{{color:#c6b1f0}}</style>
</head><body>
<p>Opening <a href="{url}">{html.escape(playlist.title)}</a> on Moodwave…</p>
<script>location.replace({json.dumps(target)});</script>
</body></html>"""
    return HTMLResponse(page, headers={"Cache-Control": "public, max-age=300"})
