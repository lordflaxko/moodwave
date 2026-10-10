"""Thumbs up/down on songs. Liked songs and artists steer future picks; disliked ones are avoided."""

from dataclasses import dataclass, field
from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.deps import CurrentUser, DbSession
from app.models import TrackFeedback

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackIn(BaseModel):
    track_id: str = Field(min_length=1, max_length=100)
    title: str = Field(default="", max_length=300)
    artist: str = Field(default="", max_length=300)
    verdict: Literal["up", "down", "clear"]


class FeedbackOut(BaseModel):
    track_id: str
    verdict: Literal["up", "down"]


@dataclass
class Preferences:
    """What the listener has told us, ready for the pipeline and prompts."""

    liked: list[str] = field(default_factory=list)  # "Title — Artist"
    disliked: list[str] = field(default_factory=list)
    avoid_ids: set[str] = field(default_factory=set)
    avoid_artists: set[str] = field(default_factory=set)

    def prompt_lines(self) -> list[str]:
        lines = []
        if self.liked:
            lines.append("Songs the listener loved (lean toward this feel): " + "; ".join(self.liked[:15]))
        if self.disliked:
            lines.append("Songs the listener disliked (avoid these and close copies): " + "; ".join(self.disliked[:15]))
        if self.avoid_artists:
            lines.append("Artists to avoid: " + ", ".join(sorted(self.avoid_artists)[:10]))
        return lines


def load_preferences(db: Session, user_id: str) -> Preferences:
    rows = db.exec(
        select(TrackFeedback).where(TrackFeedback.user_id == user_id).order_by(TrackFeedback.id.desc()).limit(200)
    ).all()
    prefs = Preferences()
    downs_per_artist: dict[str, int] = {}
    for r in rows:
        line = f"{r.title} — {r.artist}" if r.title else r.track_id
        if r.verdict == "up":
            prefs.liked.append(line)
        else:
            prefs.disliked.append(line)
            prefs.avoid_ids.add(r.track_id)
            if r.artist:
                downs_per_artist[r.artist] = downs_per_artist.get(r.artist, 0) + 1
    # Two thumbs-down for the same artist means "not this artist".
    prefs.avoid_artists = {a for a, n in downs_per_artist.items() if n >= 2}
    prefs.liked, prefs.disliked = prefs.liked[:30], prefs.disliked[:30]
    return prefs


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
def give_feedback(body: FeedbackIn, user: CurrentUser, db: DbSession) -> None:
    existing = db.exec(
        select(TrackFeedback).where(TrackFeedback.user_id == user.id, TrackFeedback.track_id == body.track_id)
    ).first()
    if body.verdict == "clear":
        if existing:
            db.delete(existing)
            db.commit()
        return
    if existing:
        existing.verdict, existing.title, existing.artist = body.verdict, body.title, body.artist
        db.add(existing)
    else:
        db.add(
            TrackFeedback(
                user_id=user.id, track_id=body.track_id, title=body.title, artist=body.artist, verdict=body.verdict
            )
        )
    db.commit()


@router.get("", response_model=list[FeedbackOut])
def list_feedback(user: CurrentUser, db: DbSession) -> list[FeedbackOut]:
    rows = db.exec(
        select(TrackFeedback).where(TrackFeedback.user_id == user.id).order_by(TrackFeedback.id.desc()).limit(1000)
    ).all()
    return [FeedbackOut(track_id=r.track_id, verdict=r.verdict) for r in rows if r.verdict in ("up", "down")]
