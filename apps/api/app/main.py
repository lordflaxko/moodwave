"""Moodwave API entrypoint."""

import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.core.config import get_settings
from app.db import engine, init_db
from app.routers import auth, catalog, feedback, playlists, share, spotify, telemetry
from app.routers.telemetry import record_error
from app.services.ai.base import AIError
from app.services.guest import purge_expired_guests
from app.services.spotify.base import SpotifyError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    try:
        with Session(engine) as db:
            removed = purge_expired_guests(db, force=True)
        if removed:
            logging.getLogger("moodwave").info("Removed %s expired guest accounts", removed)
    except Exception:  # noqa: BLE001 - housekeeping must never stop the API starting
        logging.getLogger("moodwave").warning("Guest purge failed", exc_info=True)
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


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Record anything unexpected in the built-in error log, then answer with a clean 500."""
    logging.getLogger("moodwave").exception("Unhandled error on %s %s", request.method, request.url.path)
    try:
        with Session(engine) as db:
            record_error(
                db,
                source="api",
                message=f"{type(exc).__name__}: {exc}"[:1000],
                stack="".join(traceback.format_exception(exc))[-4000:],
                page=f"{request.method} {request.url.path}",
                user_agent=request.headers.get("user-agent", ""),
            )
    except Exception:  # noqa: BLE001 - logging must never mask the original error
        logging.getLogger("moodwave").warning("Could not record error", exc_info=True)
    return JSONResponse({"detail": "Something went wrong on our side. It's been logged."}, status_code=500)


# HEAD too: uptime monitors (UptimeRobot) check with HEAD by default.
@app.api_route("/health", methods=["GET", "HEAD"], tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(playlists.router)
app.include_router(spotify.router)
app.include_router(catalog.router)
app.include_router(telemetry.router)
app.include_router(feedback.router)
app.include_router(share.router)
