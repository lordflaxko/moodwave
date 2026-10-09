"""Moodwave API entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.db import init_db
from app.routers import auth, catalog, playlists, spotify
from app.services.ai.base import AIError
from app.services.spotify.base import SpotifyError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    mode = "demo catalog" if settings.demo_mode else "Spotify Web API"
    ai = settings.anthropic_model if settings.ai_enabled else "heuristic curator"
    logging.getLogger("moodwave").info("Moodwave API ready: music=%s, ai=%s", mode, ai)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

# The Next.js app reaches us through its same-origin proxy. The Framer site (EXTRA_ORIGINS)
# calls the API directly with a bearer token, which is what CORS is for.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(SpotifyError)
async def spotify_error_handler(_: Request, exc: SpotifyError) -> JSONResponse:
    status = exc.status if exc.status in (401, 403, 404, 429) else 502
    return JSONResponse({"detail": str(exc)}, status_code=status)


@app.exception_handler(AIError)
async def ai_error_handler(_: Request, exc: AIError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=503)


@app.exception_handler(LookupError)
async def lookup_error_handler(_: Request, exc: LookupError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(playlists.router)
app.include_router(spotify.router)
app.include_router(catalog.router)
