"""Thin Spotify passthroughs used by the editor and library."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import get_spotify
from app.schemas import SpotifyPlaylistOut, Track
from app.services.spotify.base import SpotifyClient

router = APIRouter(prefix="/spotify", tags=["spotify"])
SpotifyDep = Annotated[SpotifyClient, Depends(get_spotify)]


@router.get("/search", response_model=list[Track])
async def search(spotify: SpotifyDep, q: Annotated[str, Query(min_length=1, max_length=100)]) -> list[Track]:
    return await spotify.search(q.strip(), limit=10)


@router.get("/playlists", response_model=list[SpotifyPlaylistOut])
async def my_playlists(spotify: SpotifyDep) -> list[SpotifyPlaylistOut]:
    return await spotify.list_playlists()
