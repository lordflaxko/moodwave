"""End-to-end API tests in demo mode (no external services)."""

from app.core.config import get_settings
from app.core.security import new_oauth_challenge, oauth_return_to, read_handoff, sign_handoff, verify_oauth_state


def test_config_reports_demo_mode(client):
    data = client.get("/auth/config").json()
    assert data == {
        "demo_mode": True,
        "demo_allowed": True,
        "spotify_enabled": False,
        "ai_enabled": False,
        "ai_model": None,
    }


def test_requires_auth(client):
    client.cookies.clear()
    assert client.get("/playlists").status_code == 401
    assert client.get("/auth/me").json() is None


def test_login_disabled_without_spotify(client):
    assert client.get("/auth/login", follow_redirects=False).status_code == 400


def test_oauth_state_roundtrip():
    challenge = new_oauth_challenge()
    assert verify_oauth_state(challenge.cookie_value, challenge.state) == challenge.verifier
    assert verify_oauth_state(challenge.cookie_value, "tampered") is None
    assert verify_oauth_state("garbage", challenge.state) is None


def test_oauth_cookie_carries_return_to():
    challenge = new_oauth_challenge("https://site.example/create")
    assert oauth_return_to(challenge.cookie_value) == "https://site.example/create"
    assert oauth_return_to(new_oauth_challenge().cookie_value) is None


def test_bearer_demo_session(client):
    client.cookies.clear()
    session = client.post("/auth/demo/token").json()
    assert session["user"]["is_demo"] is True
    assert "mw_session" not in client.cookies

    headers = {"Authorization": f"Bearer {session['token']}"}
    assert client.get("/auth/me", headers=headers).json()["id"] == session["user"]["id"]
    res = client.post("/playlists/generate", json={"prompt": "sunday morning coffee", "length": 15}, headers=headers)
    assert res.status_code == 201, res.text
    assert client.get("/playlists", headers={"Authorization": "Bearer forged"}).status_code == 401


def test_handoff_exchange_is_single_use(client):
    client.cookies.clear()
    user_id = client.post("/auth/demo/token").json()["user"]["id"]
    code = sign_handoff(user_id)
    assert read_handoff(code) == user_id

    first = client.post("/auth/exchange", json={"code": code})
    assert first.status_code == 200
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {first.json()['token']}"}).json()["id"] == user_id
    assert client.post("/auth/exchange", json={"code": code}).status_code == 400
    assert client.post("/auth/exchange", json={"code": "not-a-real-code"}).status_code == 400


def test_demo_can_be_switched_off(client):
    settings = get_settings()
    settings.allow_demo = False
    try:
        client.cookies.clear()
        assert client.post("/auth/demo").status_code == 403
        assert client.post("/auth/demo/token").status_code == 403
        assert client.get("/auth/config").json()["demo_allowed"] is False
    finally:
        settings.allow_demo = True


def test_cors_allows_extra_origins():
    settings = get_settings().model_copy(update={"extra_origins": "https://a.example/, https://b.example"})
    assert settings.allowed_origins == [settings.frontend_url, "https://a.example", "https://b.example"]


def test_postgres_urls_get_a_driver():
    settings = get_settings().model_copy(update={"database_url": "postgres://u:p@host/db"})
    assert settings.sqlalchemy_url == "postgresql+psycopg://u:p@host/db"


def test_full_playlist_lifecycle(demo_client):
    me = demo_client.get("/auth/me").json()
    assert me["is_demo"] is True

    res = demo_client.post("/playlists/generate", json={"prompt": "late-night study with mellow indie", "length": 18})
    assert res.status_code == 201, res.text
    playlist = res.json()
    assert playlist["stats"]["track_count"] == 18
    assert playlist["intent"]["rationale"]
    pid = playlist["id"]

    # Reorder + remove one
    tracks = playlist["tracks"]
    edited = list(reversed(tracks))[:-1]
    res = demo_client.put(f"/playlists/{pid}/tracks", json={"tracks": edited})
    assert res.status_code == 200
    assert [t["id"] for t in res.json()["tracks"]] == [t["id"] for t in edited]

    # Duplicates rejected
    res = demo_client.put(f"/playlists/{pid}/tracks", json={"tracks": [edited[0], edited[0]]})
    assert res.status_code == 422

    # Refine
    res = demo_client.post(f"/playlists/{pid}/refine", json={"instruction": "Make it more upbeat"})
    assert res.status_code == 200
    assert res.json()["refinements"][-1]["instruction"] == "Make it more upbeat"

    # Replace one
    first_id = res.json()["tracks"][0]["id"]
    res = demo_client.post(f"/playlists/{pid}/tracks/{first_id}/replace")
    assert res.status_code == 200
    assert res.json()["tracks"][0]["id"] != first_id

    # Rename
    res = demo_client.patch(f"/playlists/{pid}", json={"title": "My Mix"})
    assert res.json()["title"] == "My Mix"

    # Save to (demo) Spotify, then it appears in the library and Spotify list
    res = demo_client.post(f"/playlists/{pid}/save")
    assert res.json()["spotify_playlist_id"].startswith("demo-")
    library = demo_client.get("/playlists").json()
    assert library[0]["id"] == pid and library[0]["saved_to_spotify"] is True
    assert demo_client.get("/spotify/playlists").json()[0]["name"] == "My Mix"

    # Search for manual add
    assert demo_client.get("/spotify/search", params={"q": "daft punk"}).json()

    # Delete
    assert demo_client.delete(f"/playlists/{pid}").status_code == 204
    assert demo_client.get(f"/playlists/{pid}").status_code == 404


def test_validation_errors(demo_client):
    assert demo_client.post("/playlists/generate", json={"prompt": "x"}).status_code == 422
    assert demo_client.post("/playlists/generate", json={"prompt": "chill", "length": 101}).status_code == 422
    assert demo_client.post("/playlists/generate", json={"prompt": "chill", "length": 14}).status_code == 422


def test_login_only_returns_to_allowed_origins(client):
    settings = get_settings()
    saved = (settings.spotify_client_id, settings.spotify_client_secret, settings.extra_origins)
    settings.spotify_client_id, settings.spotify_client_secret = "id", "secret"
    settings.extra_origins = "https://site.example"
    try:
        ok = client.get("/auth/login", params={"return_to": "https://site.example/create"}, follow_redirects=False)
        assert ok.status_code == 302
        assert ok.headers["location"].startswith("https://accounts.spotify.com/")
        assert oauth_return_to(ok.cookies.get("mw_oauth")) == "https://site.example/create"
        bad = client.get("/auth/login", params={"return_to": "https://evil.example/"}, follow_redirects=False)
        assert bad.status_code == 400
    finally:
        settings.spotify_client_id, settings.spotify_client_secret, settings.extra_origins = saved
