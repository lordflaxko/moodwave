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
        "guest_allowed": False,
        "guest_playlists_per_day": 5,
        "guest_max_tracks": 30,
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


def test_error_reports_are_logged_and_rate_limited(client):
    client.cookies.clear()
    ok = client.post("/telemetry/error", json={"message": "TypeError: boom", "stack": "at x", "page": "/create"})
    assert ok.status_code == 204
    statuses = [client.post("/telemetry/error", json={"message": f"e{i}"}).status_code for i in range(25)]
    assert 429 in statuses


def test_error_log_is_private(client, demo_client):
    # Signed out → 401; demo sessions can't read it either.
    client.cookies.clear()
    assert client.get("/telemetry/errors").status_code == 401
    demo_client.post("/auth/demo")
    assert demo_client.get("/telemetry/errors").status_code == 403


def test_error_log_groups_for_owner(client):
    from sqlmodel import Session

    from app.core.security import sign_session
    from app.db import engine
    from app.models import User
    from app.routers.telemetry import record_error

    with Session(engine) as db:
        owner = User(display_name="Owner", spotify_id="owner-1")
        db.add(owner)
        db.commit()
        db.refresh(owner)
        for _ in range(3):
            record_error(db, source="web", message="Grouped failure")
        record_error(db, source="api", message="Other failure")
        token = sign_session(owner.id)

    groups = client.get("/telemetry/errors", headers={"Authorization": f"Bearer {token}"}).json()
    by_message = {g["message"]: g for g in groups}
    assert by_message["Grouped failure"]["count"] == 3
    assert by_message["Other failure"]["source"] == "api"


def test_missing_columns_are_added(tmp_path):
    from sqlalchemy import inspect, text
    from sqlmodel import create_engine

    from app.db import add_missing_columns

    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as conn:  # an old, narrower version of the error table
        conn.execute(text("CREATE TABLE clienterror (id INTEGER PRIMARY KEY, message VARCHAR NOT NULL)"))
    added = add_missing_columns(eng)
    assert "clienterror.page" in added and "clienterror.source" in added
    assert {"page", "source", "stack"} <= {c["name"] for c in inspect(eng).get_columns("clienterror")}
    assert add_missing_columns(eng) == []  # idempotent


def test_feedback_roundtrip_and_clear(demo_client):
    body = {"track_id": "abc", "title": "Song", "artist": "Someone", "verdict": "down"}
    assert demo_client.post("/feedback", json=body).status_code == 204
    assert demo_client.post("/feedback", json=body | {"verdict": "up"}).status_code == 204
    assert demo_client.get("/feedback").json() == [{"track_id": "abc", "verdict": "up"}]
    assert demo_client.post("/feedback", json=body | {"verdict": "clear"}).status_code == 204
    assert demo_client.get("/feedback").json() == []


def test_generate_stream_emits_progress_then_playlist(demo_client):
    import json

    with demo_client.stream(
        "POST", "/playlists/generate/stream", json={"prompt": "late night city", "length": 15}
    ) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in res.iter_lines() if line.startswith("data: ")]
    kinds = [e["type"] for e in events]
    assert kinds[0] == "stage" and "intent" in kinds and "track" in kinds
    assert kinds[-1] == "done"
    playlist = events[-1]["playlist"]
    assert len(playlist["tracks"]) >= 15
    assert demo_client.get(f"/playlists/{playlist['id']}").status_code == 200


def test_generate_stream_reports_errors(demo_client):
    import json

    with demo_client.stream("POST", "/playlists/generate/stream", json={"prompt": "x" * 5, "length": 15}) as res:
        events = [json.loads(line[6:]) for line in res.iter_lines() if line.startswith("data: ")]
    assert events[-1]["type"] in ("done", "error")


def _make_playlist(client) -> dict:
    res = client.post("/playlists/generate", json={"prompt": "warm evening jazz", "length": 15})
    assert res.status_code == 201
    return res.json()


def test_save_then_edit_marks_out_of_sync_until_synced(demo_client):
    playlist = _make_playlist(demo_client)
    saved = demo_client.post(f"/playlists/{playlist['id']}/save").json()
    assert saved["spotify_playlist_id"] and saved["synced_at"] and saved["needs_sync"] is False

    import time

    time.sleep(1.1)
    edited = demo_client.put(f"/playlists/{playlist['id']}/tracks", json={"tracks": saved["tracks"][1:]}).json()
    assert edited["needs_sync"] is True
    synced = demo_client.post(f"/playlists/{playlist['id']}/sync").json()
    assert synced["needs_sync"] is False


def test_sync_requires_saved_playlist(demo_client):
    playlist = _make_playlist(demo_client)
    assert demo_client.post(f"/playlists/{playlist['id']}/sync").status_code == 409


def test_generate_from_song_link_opens_with_it(demo_client):
    from app.data.catalog import CATALOG
    from app.services.spotify.catalog_scoring import row_to_track

    seed = row_to_track(CATALOG[0])
    res = demo_client.post(
        "/playlists/generate",
        json={"prompt": "more like this", "length": 15, "seed_url": f"https://open.spotify.com/track/{seed.id}?si=x"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["tracks"][0]["id"] == seed.id


def test_generate_rejects_bad_seed_link(demo_client):
    res = demo_client.post(
        "/playlists/generate", json={"prompt": "more like this", "length": 15, "seed_url": "https://example.com/x"}
    )
    assert res.status_code == 422


def test_cover_grid_single_and_auto(demo_client):
    playlist = _make_playlist(demo_client)
    seen, ids = set(), []
    for t in playlist["tracks"]:
        if t["image_url"] and t["image_url"] not in seen:
            seen.add(t["image_url"])
            ids.append(t["id"])
    url = f"/playlists/{playlist['id']}/cover"

    grid = demo_client.put(url, json={"mode": "grid", "track_ids": ids[:4]}).json()
    assert grid["cover"]["mode"] == "grid" and grid["cover"]["track_ids"] == ids[:4]
    assert len(grid["cover"]["images"]) == 4

    single = demo_client.put(url, json={"mode": "single", "track_ids": [ids[2]]}).json()
    assert single["cover"]["images"] == [next(t["image_url"] for t in playlist["tracks"] if t["id"] == ids[2])]
    summary = next(p for p in demo_client.get("/playlists").json() if p["id"] == playlist["id"])
    assert summary["cover_images"] == single["cover"]["images"]

    assert demo_client.put(url, json={"mode": "grid", "track_ids": ids[:2]}).status_code == 422
    assert demo_client.put(url, json={"mode": "single", "track_ids": ["nope"]}).status_code == 422
    assert demo_client.put(url, json={"mode": "auto"}).json()["cover"]["mode"] == "auto"


def test_cover_upload_is_served_and_cleaned_up(demo_client):
    import base64
    import io

    from PIL import Image

    playlist = _make_playlist(demo_client)
    buffer = io.BytesIO()
    Image.new("RGBA", (900, 500), (200, 50, 90, 255)).save(buffer, "PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()

    out = demo_client.put(f"/playlists/{playlist['id']}/cover/image", json={"image": data_url}).json()
    assert out["cover"]["mode"] == "upload"
    path = out["cover"]["images"][0]
    demo_client.cookies.clear()  # the image is public by id
    image = demo_client.get(path)
    assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(image.content)).size == (640, 640)


def test_cover_upload_rejects_non_images(demo_client):
    playlist = _make_playlist(demo_client)
    junk = "data:image/png;base64," + "QUJD" * 40
    assert demo_client.put(f"/playlists/{playlist['id']}/cover/image", json={"image": junk}).status_code == 422


def test_deleting_playlist_removes_uploaded_cover(demo_client):
    import base64
    import io

    from PIL import Image

    playlist = _make_playlist(demo_client)
    buffer = io.BytesIO()
    Image.new("RGB", (300, 300), (10, 120, 200)).save(buffer, "JPEG")
    body = {"image": base64.b64encode(buffer.getvalue()).decode()}
    path = demo_client.put(f"/playlists/{playlist['id']}/cover/image", json=body).json()["cover"]["images"][0]
    assert demo_client.delete(f"/playlists/{playlist['id']}").status_code == 204
    assert demo_client.get(path).status_code == 404


def test_share_link_lifecycle(demo_client):
    playlist = _make_playlist(demo_client)
    shared = demo_client.post(f"/playlists/{playlist['id']}/share").json()
    slug = shared["share_slug"]
    assert slug and demo_client.post(f"/playlists/{playlist['id']}/share").json()["share_slug"] == slug

    demo_client.cookies.clear()  # public from here on
    public = demo_client.get(f"/share/{slug}")
    assert public.status_code == 200
    body = public.json()
    assert body["title"] == playlist["title"] and len(body["tracks"]) == len(playlist["tracks"])
    assert "spotify_playlist_id" not in body and "user_id" not in body

    page = demo_client.get(f"/s/{slug}")
    assert page.status_code == 200 and page.headers["content-type"].startswith("text/html")
    assert 'property="og:title"' in page.text and f"/s/{slug}/cover.jpg" in page.text
    assert f"/p?s={slug}" in page.text


def test_share_link_escapes_and_revokes(demo_client):
    res = demo_client.post("/playlists/generate", json={"prompt": '<script>alert("x")</script> beach', "length": 15})
    playlist = res.json()
    slug = demo_client.post(f"/playlists/{playlist['id']}/share").json()["share_slug"]
    page = demo_client.get(f"/s/{slug}").text
    assert "<script>alert" not in page
    assert demo_client.delete(f"/playlists/{playlist['id']}/share").json()["share_slug"] is None
    assert demo_client.get(f"/share/{slug}").status_code == 404
    assert demo_client.get(f"/s/{slug}").status_code == 404


def test_shared_cover_uses_uploaded_image(demo_client):
    import base64
    import io

    from PIL import Image

    playlist = _make_playlist(demo_client)
    buffer = io.BytesIO()
    Image.new("RGB", (300, 300), (40, 160, 90)).save(buffer, "JPEG")
    demo_client.put(
        f"/playlists/{playlist['id']}/cover/image", json={"image": base64.b64encode(buffer.getvalue()).decode()}
    )
    slug = demo_client.post(f"/playlists/{playlist['id']}/share").json()["share_slug"]
    cover = demo_client.get(f"/s/{slug}/cover.jpg")
    assert cover.status_code == 200 and cover.headers["content-type"] == "image/jpeg"


def test_duplicate_makes_private_copy(demo_client):
    playlist = _make_playlist(demo_client)
    demo_client.post(f"/playlists/{playlist['id']}/share")
    copy = demo_client.post(f"/playlists/{playlist['id']}/duplicate")
    assert copy.status_code == 201
    body = copy.json()
    assert body["id"] != playlist["id"] and body["title"].endswith("(copy)")
    assert [t["id"] for t in body["tracks"]] == [t["id"] for t in playlist["tracks"]]
    assert body["share_slug"] is None and body["spotify_playlist_id"] is None


def test_summary_lists_artists_and_genres(demo_client):
    playlist = _make_playlist(demo_client)
    summary = next(p for p in demo_client.get("/playlists").json() if p["id"] == playlist["id"])
    assert summary["artists"] and summary["artists"][0] in {a for t in playlist["tracks"] for a in t["artists"]}
    assert isinstance(summary["genres"], list)


def test_health_answers_head_for_uptime_monitors(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.head("/health").status_code == 200
