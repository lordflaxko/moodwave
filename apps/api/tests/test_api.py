"""End-to-end API tests in demo mode (no external services)."""

from app.core.security import new_oauth_challenge, verify_oauth_state


def test_config_reports_demo_mode(client):
    data = client.get("/auth/config").json()
    assert data == {"demo_mode": True, "spotify_enabled": False, "ai_enabled": False, "ai_model": None}


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
    assert demo_client.post("/playlists/generate", json={"prompt": "chill", "length": 99}).status_code == 422
