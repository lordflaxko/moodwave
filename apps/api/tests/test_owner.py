"""Owner dashboard, AI usage accounting and featured playlists."""

import pytest
from sqlmodel import Session

from app.core.config import get_settings
from app.core.security import sign_session
from app.db import engine
from app.deps import get_spotify
from app.main import app
from app.models import AIUsage, User
from app.services.spotify.mock import MockSpotifyClient


def _user(**fields) -> User:
    from sqlmodel import select

    with Session(engine) as db:
        if fields.get("spotify_id"):
            existing = db.exec(select(User).where(User.spotify_id == fields["spotify_id"])).first()
            if existing:
                return existing
        user = User(**fields)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


@pytest.fixture
def owner_client(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "owner_spotify_ids", "owner-test")
    owner = _user(display_name="Owner", spotify_id="owner-test")
    app.dependency_overrides[get_spotify] = lambda: MockSpotifyClient("owner")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {sign_session(owner.id)}"
    yield client
    app.dependency_overrides.pop(get_spotify, None)
    client.headers.pop("Authorization", None)


def test_me_flags_the_owner(owner_client):
    assert owner_client.get("/auth/me").json()["is_owner"] is True


def test_stats_are_owner_only(owner_client, monkeypatch):
    stats = owner_client.get("/admin/stats")
    assert stats.status_code == 200
    body = stats.json()
    assert len(body["playlists_by_day"]) == 14
    assert {"est_cost_month_usd", "calls_today", "model"} <= set(body["ai"])

    other = _user(display_name="Friend", spotify_id="friend-test")
    guest = _user(display_name="Guest", is_guest=True)
    for u in (other, guest):
        owner_client.headers["Authorization"] = f"Bearer {sign_session(u.id)}"
        assert owner_client.get("/admin/stats").status_code == 403


def test_ai_usage_is_recorded_and_priced(owner_client, monkeypatch):
    from types import SimpleNamespace

    from app.services.ai.claude import record_ai_usage

    monkeypatch.setattr(get_settings(), "ai_price_input_per_mtok", 3.0)
    monkeypatch.setattr(get_settings(), "ai_price_output_per_mtok", 15.0)
    before = owner_client.get("/admin/stats").json()["ai"]
    usage = SimpleNamespace(
        input_tokens=600_000, cache_read_input_tokens=400_000, cache_creation_input_tokens=0, output_tokens=200_000
    )
    record_ai_usage(SimpleNamespace(usage=usage))
    after = owner_client.get("/admin/stats").json()["ai"]
    assert after["calls_today"] == before["calls_today"] + 1
    # 1M input tokens at $3 + 0.2M output at $15 = $6.00 more
    assert round(after["est_cost_month_usd"] - before["est_cost_month_usd"], 2) == 6.0
    with Session(engine) as db:
        assert db.exec(__import__("sqlmodel").select(AIUsage)).first() is not None


def test_feature_flow_and_public_list(owner_client):
    playlist = owner_client.post("/playlists/generate", json={"prompt": "golden hour picnic", "length": 15}).json()
    featured = owner_client.post(f"/playlists/{playlist['id']}/feature").json()
    assert featured["featured"] is True and featured["share_slug"]  # sharing turned on

    owner_client.headers.pop("Authorization")
    public = owner_client.get("/share/featured").json()
    assert any(p["slug"] == featured["share_slug"] and p["track_count"] >= 15 for p in public)


def test_unsharing_removes_feature(owner_client):
    playlist = owner_client.post("/playlists/generate", json={"prompt": "late night study", "length": 15}).json()
    slug = owner_client.post(f"/playlists/{playlist['id']}/feature").json()["share_slug"]
    off = owner_client.delete(f"/playlists/{playlist['id']}/share").json()
    assert off["featured"] is False
    assert all(p["slug"] != slug for p in owner_client.get("/share/featured").json())


def test_only_the_owner_can_feature(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "owner_spotify_ids", "someone-else")
    member = _user(display_name="Member", spotify_id="member-test")
    app.dependency_overrides[get_spotify] = lambda: MockSpotifyClient("member")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {sign_session(member.id)}"
    try:
        playlist = client.post("/playlists/generate", json={"prompt": "rainy commute", "length": 15}).json()
        assert client.post(f"/playlists/{playlist['id']}/feature").status_code == 403
        assert client.get("/auth/me").json()["is_owner"] is False
    finally:
        app.dependency_overrides.pop(get_spotify, None)
        client.headers.pop("Authorization", None)
