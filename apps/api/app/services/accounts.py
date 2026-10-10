"""Removing an account and everything stored for it (self-serve delete and guest expiry)."""

from sqlmodel import Session, col, select

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
