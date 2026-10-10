"""Removing an account and everything stored for it (self-serve delete and guest expiry)."""

from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.models import (
    ClientError,
    Playlist,
    PlaylistCover,
    PlaylistTrack,
    RefinementTurn,
    SpotifyToken,
    TrackFeedback,
    User,
)


def delete_user_data(db: Session, user: User, *, commit: bool = True) -> None:
    """Delete the account and its playlists (songs, changes, covers, share links), thumbs and
    Spotify tokens. Error-log rows keep the message but lose the link to the account."""
    playlist_ids = [p.id for p in db.exec(select(Playlist).where(Playlist.user_id == user.id)).all()]
    if playlist_ids:
        for model in (PlaylistTrack, RefinementTurn, PlaylistCover):
            for row in db.exec(select(model).where(col(model.playlist_id).in_(playlist_ids))).all():
                db.delete(row)
        db.flush()
        for playlist in db.exec(select(Playlist).where(col(Playlist.id).in_(playlist_ids))).all():
            db.delete(playlist)
    for model in (TrackFeedback, SpotifyToken):
        for row in db.exec(select(model).where(model.user_id == user.id)).all():
            db.delete(row)
    for row in db.exec(select(ClientError).where(ClientError.user_id == user.id)).all():
        row.user_id = None
        db.add(row)
    db.flush()
    db.delete(user)
    if commit:
        db.commit()


def is_owner(db: Session, user: User) -> bool:
    """The site owner: a Spotify account listed in OWNER_SPOTIFY_IDS, or, when that's unset,
    the first Spotify account ever created here."""
    if user.is_demo or user.is_guest or not user.spotify_id:
        return False
    owners = {s.strip() for s in get_settings().owner_spotify_ids.split(",") if s.strip()}
    if owners:
        return user.spotify_id in owners
    first = db.exec(
        select(User)
        .where(col(User.spotify_id).is_not(None), User.is_demo == False, User.is_guest == False)  # noqa: E712
        .order_by(col(User.created_at).asc())
        .limit(1)
    ).first()
    return first is not None and first.id == user.id
