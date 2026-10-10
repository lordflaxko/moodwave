"""Playlist cover art: a 2x2 grid of the first four distinct album covers with a small mark.

Spotify accepts a base64 JPEG of at most 256 KB, so quality steps down until it fits.
"""

import asyncio
import io
import logging

import httpx
from PIL import Image, ImageDraw, ImageOps

from app.schemas import Track

log = logging.getLogger(__name__)
SIZE = 640
# Uploads: refuse decompression bombs early (a 6000x6000 photo is 36M pixels).
Image.MAX_IMAGE_PIXELS = 50_000_000
_MAX_BASE64 = 256 * 1024
_LILAC = (198, 177, 240)
_INK = (11, 10, 13)


def cover_urls(tracks: list[Track], count: int = 4) -> list[str]:
    """The first `count` distinct cover images, preferring the larger artwork."""
    seen: list[str] = []
    for track in tracks:
        url = track.image_large or track.image_url
        if url and url not in seen:
            seen.append(url)
        if len(seen) == count:
            break
    return seen


async def _fetch(client: httpx.AsyncClient, url: str) -> Image.Image | None:
    try:
        response = await client.get(url)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 - a missing cover just leaves a tile out
        log.info("Cover fetch failed for %s: %s", url, exc)
        return None


class CoverImageError(ValueError):
    """The upload isn't an image we can use."""


def process_upload(data: bytes) -> bytes:
    """Any image upload -> centre-cropped 640px JPEG within Spotify's limit (no mark: it's yours)."""
    if len(data) > 10 * 1024 * 1024:
        raise CoverImageError("That image is too large (10 MB max).")
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGBA")
            background = Image.new("RGB", image.size, _INK)
            background.paste(image, mask=image.getchannel("A"))
            image = background
        image = ImageOps.fit(image.convert("RGB"), (SIZE, SIZE), Image.LANCZOS)
    except CoverImageError:
        raise
    except Exception as exc:  # noqa: BLE001 - corrupt, unsupported or oversized
        raise CoverImageError("That file isn't an image we can use. Try a JPEG or PNG.") from exc
    return to_jpeg(image)


def compose(images: list[Image.Image]) -> Image.Image:
    """Four images make a grid; fewer use the first one full-bleed."""
    canvas = Image.new("RGB", (SIZE, SIZE), _INK)
    if len(images) >= 4:
        half = SIZE // 2
        for i, img in enumerate(images[:4]):
            canvas.paste(img.resize((half, half), Image.LANCZOS), ((i % 2) * half, (i // 2) * half))
    elif images:
        canvas.paste(images[0].resize((SIZE, SIZE), Image.LANCZOS), (0, 0))
    # Small Moodwave mark: a lilac disc with three bars, bottom-right.
    draw = ImageDraw.Draw(canvas)
    r, cx, cy = 34, SIZE - 54, SIZE - 54
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=_LILAC)
    for i, h in enumerate((18, 30, 22)):
        x = cx - 14 + i * 11
        draw.rounded_rectangle((x, cy + 13 - h, x + 6, cy + 13), radius=3, fill=_INK)
    return canvas


def to_jpeg(image: Image.Image) -> bytes:
    """Encode as JPEG small enough for Spotify's upload limit."""
    for quality in (88, 80, 72, 64, 55, 45):
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=quality, optimize=True)
        data = buffer.getvalue()
        if len(data) * 4 / 3 < _MAX_BASE64:
            return data
    buffer = io.BytesIO()
    image.resize((SIZE // 2, SIZE // 2)).save(buffer, "JPEG", quality=70)
    return buffer.getvalue()


async def build_cover(tracks: list[Track], count: int = 4) -> bytes | None:
    """A JPEG cover for these tracks (a grid of 4, or one full-bleed), or None without artwork."""
    urls = cover_urls(tracks, count)
    if not urls:
        return None
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        images = [img for img in await asyncio.gather(*(_fetch(client, u) for u in urls)) if img is not None]
    if not images:
        return None
    return await asyncio.to_thread(lambda: to_jpeg(compose(images)))
