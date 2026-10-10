"""Guest mode: limits, no saving, and moving guest playlists into a signed-in account."""

import pytest
from sqlmodel import Session

from app.core.security import sign_handoff, sign_session
from app.db import engine
from app.deps import get_spotify
from app.main import app
from app.models import User
from app.services.spotify.mock import MockSpotifyClient


def _user(**fields) -> User:
    with Session(engine) as db:
        user = User(**fields)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


@pytest.fixture
def guest_client(client):
    # Guests normally search with the app's Spotify token; use the demo catalog offline.
    app.dependency_overrides[get_spotify] = lambda: MockSpotifyClient("guest")
    guest = _user(display_name="Guest", is_guest=True)
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {sign_session(guest.id)}"
    yield client, guest
    app.dependency_overrides.pop(get_spotify, None)
    client.headers.pop("Authorization", None)


def test_guest_mode_is_off_without_spotify_credentials(client):
    assert client.post("/auth/guest/token").status_code == 403


def test_guest_generation_caps_length_and_daily_count(guest_client):
    client, guest = guest_client
    assert client.get("/auth/me").json()["is_guest"] is True
    first = client.post("/playlists/generate", json={"prompt": "late night jazz bar", "length": 60})
    assert first.status_code == 201
    body = first.json()
    assert len(body["tracks"]) <= 30
    assert "up to 30 songs" in (body["notice"] or "")
    for _ in range(4):
        assert client.post("/playlists/generate", json={"prompt": "sunny road trip", "length": 15}).status_code == 201
    over = client.post("/playlists/generate", json={"prompt": "one more please", "length": 15})
    assert over.status_code == 429 and "as a guest" in over.json()["detail"]


def test_guest_cannot_save_or_sync(guest_client):
    client, _ = guest_client
    playlist = client.post("/playlists/generate", json={"prompt": "rainy reading nook", "length": 15}).json()
    save = client.post(f"/playlists/{playlist['id']}/save")
    assert save.status_code == 403 and "Sign in with Spotify" in save.json()["detail"]
    assert client.post(f"/playlists/{playlist['id']}/sync").status_code == 403


def test_signing_in_moves_guest_playlists(guest_client):
    client, guest = guest_client
    playlist = client.post("/playlists/generate", json={"prompt": "warm morning coffee", "length": 15}).json()
    member = _user(display_name="Real Listener", spotify_id="spotify-user-merge-test")
    guest_token = client.headers.pop("Authorization").split(" ", 1)[1]

    out = client.post("/auth/exchange", json={"code": sign_handoff(member.id), "guest_token": guest_token})
    assert out.status_code == 200
    client.headers["Authorization"] = f"Bearer {out.json()['token']}"
    mine = {p["id"] for p in client.get("/playlists").json()}
    assert playlist["id"] in mine


def test_exchange_ignores_non_guest_tokens(client):
    owner = _user(display_name="Owner", spotify_id="spotify-owner-x")
    other = _user(display_name="Other", spotify_id="spotify-other-x")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {sign_session(owner.id)}"
    playlist = None
    app.dependency_overrides[get_spotify] = lambda: MockSpotifyClient("owner")
    try:
        playlist = client.post("/playlists/generate", json={"prompt": "focus music", "length": 15}).json()
    finally:
        app.dependency_overrides.pop(get_spotify, None)
    owner_token = client.headers.pop("Authorization").split(" ", 1)[1]
    client.post("/auth/exchange", json={"code": sign_handoff(other.id), "guest_token": owner_token})
    client.headers["Authorization"] = f"Bearer {owner_token}"
    assert playlist["id"] in {p["id"] for p in client.get("/playlists").json()}
    client.headers.pop("Authorization", None)


def test_guest_ai_budget_counts_ai_generations_and_refinements():
    from app.models import Playlist, RefinementTurn
    from app.services.guest import guest_ai_available, guest_ai_used_today

    guest = _user(display_name="Guest", is_guest=True)
    with Session(engine) as db:
        before = guest_ai_used_today(db)
        ai_made = Playlist(user_id=guest.id, title="t", prompt="p", intent={}, ai_source="claude")
        offline = Playlist(user_id=guest.id, title="t", prompt="p", intent={}, ai_source="heuristic")
        db.add(ai_made)
        db.add(offline)
        db.commit()
        db.add(RefinementTurn(playlist_id=offline.id, instruction="more", summary="ok"))
        db.commit()
        assert guest_ai_used_today(db) == before + 2

        from app.core.config import get_settings

        settings = get_settings()
        original = settings.guest_ai_per_day
        try:
            settings.guest_ai_per_day = before + 2
            assert guest_ai_available(db) is False
            settings.guest_ai_per_day = before + 3
            assert guest_ai_available(db) is True
        finally:
            settings.guest_ai_per_day = original


def test_delete_me_removes_everything(client):
    import base64
    import io

    from PIL import Image

    from app.models import Playlist, PlaylistCover, PlaylistTrack, TrackFeedback

    member = _user(display_name="Leaving Soon", spotify_id="spotify-leaving")
    app.dependency_overrides[get_spotify] = lambda: MockSpotifyClient("leaving")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {sign_session(member.id)}"
    try:
        playlist = client.post("/playlists/generate", json={"prompt": "goodbye songs", "length": 15}).json()
        buffer = io.BytesIO()
        Image.new("RGB", (200, 200), (9, 9, 9)).save(buffer, "JPEG")
        client.put(
            f"/playlists/{playlist['id']}/cover/image", json={"image": base64.b64encode(buffer.getvalue()).decode()}
        )
        client.post(f"/playlists/{playlist['id']}/refine", json={"instruction": "more upbeat"})
        client.post("/feedback", json={"track_id": playlist["tracks"][0]["id"], "verdict": "up"})

        assert client.delete("/auth/me").status_code == 204
        assert client.get("/auth/me").json() is None
    finally:
        app.dependency_overrides.pop(get_spotify, None)
        client.headers.pop("Authorization", None)

    with Session(engine) as db:
        assert db.get(User, member.id) is None
        assert db.get(Playlist, playlist["id"]) is None
        assert db.get(PlaylistCover, playlist["id"]) is None
        from sqlmodel import select

        assert not db.exec(select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist["id"])).all()
        assert not db.exec(select(TrackFeedback).where(TrackFeedback.user_id == member.id)).all()


def test_delete_me_requires_sign_in(client):
    client.cookies.clear()
    assert client.delete("/auth/me").status_code == 401
