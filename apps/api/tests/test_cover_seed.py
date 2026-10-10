"""Cover art and seed-link parsing."""

from PIL import Image

from app.schemas import Track
from app.services.cover import SIZE, compose, cover_urls, to_jpeg
from app.services.seed import parse_link


def test_compose_grid_fits_spotify_limit():
    tiles = [Image.effect_noise((300, 300), 90).convert("RGB") for _ in range(4)]
    image = compose(tiles)
    assert image.size == (SIZE, SIZE)
    jpeg = to_jpeg(image)
    assert jpeg[:2] == b"\xff\xd8"
    assert len(jpeg) * 4 / 3 < 256 * 1024


def test_compose_single_cover_fills_frame():
    image = compose([Image.new("RGB", (100, 100), (255, 0, 0))])
    assert image.getpixel((10, 10)) == (255, 0, 0)


def test_cover_urls_are_distinct_and_prefer_large():
    def t(i, img):
        return Track(
            id=str(i), uri="u", title="s", artists=["a"], album="x", duration_ms=1, image_url=img, image_large=None
        )

    tracks = [t(1, "a"), t(2, "a"), t(3, "b"), t(4, None), t(5, "c"), t(6, "d"), t(7, "e")]
    assert cover_urls(tracks) == ["a", "b", "c", "d"]


def test_parse_spotify_links():
    assert parse_link("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc") == (
        "track",
        "4uLU6hMCjMI75M1A2tKUQC",
    )
    assert parse_link("https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M") == (
        "playlist",
        "37i9dQZF1DXcBWIGoYBM5M",
    )
    assert parse_link("spotify:track:4uLU6hMCjMI75M1A2tKUQC") == ("track", "4uLU6hMCjMI75M1A2tKUQC")
    assert parse_link("https://example.com/track/abc") is None
