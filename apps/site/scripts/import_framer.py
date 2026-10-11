"""One-off import of the Framer site into apps/site.

Reads the read-only export (page trees, layout template, CMS with field IDs, styles) plus the
live HTML of every page, then writes:
  src/content/pages/*.json, template.json, cms.json, meta.json, icons.json, presets.json
  src/styles/framer-base.css   Framer's generic text/layout rules (same as the live site)
  src/styles/presets.css       text and link style presets, per breakpoint
  src/styles/fonts.css         the exact @font-face set, served from /fonts
  public/fonts/*, public/media/*  local copies of every font and image

Usage: python scripts/import_framer.py <export dir>
"""

import base64
import hashlib
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

EXPORT = Path(sys.argv[1])
SITE = Path(__file__).resolve().parent.parent
CONTENT = SITE / "src" / "content"
STYLES = SITE / "src" / "styles"
MEDIA = SITE / "public" / "media"
FONTS = SITE / "public" / "fonts"
for d in (CONTENT / "pages", STYLES, MEDIA, FONTS):
    d.mkdir(parents=True, exist_ok=True)

PAGES = {
    "/": "home", "/how-it-works": "how_it_works", "/create": "create", "/playlist": "playlist",
    "/library": "library", "/p": "p", "/admin": "admin", "/errors": "errors", "/faq": "faq",
    "/privacy": "privacy", "/terms": "terms", "/404": "404",
}
UA = {"User-Agent": "Mozilla/5.0 (moodwave-site import)"}


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def local_name(url: str) -> str:
    base = url.split("?")[0].rstrip("/").split("/")[-1]
    if "." not in base:
        base += ".bin"
    return base


# ---------------------------------------------------------------- media
MEDIA_RE = re.compile(r"https://framerusercontent\.com/(?:images|assets)/[A-Za-z0-9_\-]+\.[a-z0-9]+(?:\?[^\"'\s)]*)?")
media_map: dict[str, str] = {}


def localize(text: str) -> str:
    def repl(m: re.Match) -> str:
        url = m.group(0).split("?")[0]
        if url not in media_map:
            name = local_name(url)
            dest = MEDIA / name
            if not dest.exists():
                dest.write_bytes(fetch(url))
            media_map[url] = "/media/" + name
        return media_map[url]

    return MEDIA_RE.sub(repl, text)


# ---------------------------------------------------------------- trees
DROP_KEYS = {"$rect", "$originalId", "$replicaId", "$parentId", "$layoutTemplateDisplayName", "$isReplica"}
DROP_ATTRS = {"constraintsLocked", "centerAnchorX", "centerAnchorY", "textDecorationStyle"}


def clean(node):
    if isinstance(node, list):
        return [clean(n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {}
    for k, v in node.items():
        if k in DROP_KEYS:
            continue
        if k == "attributes":
            v = {ak: av for ak, av in v.items() if ak not in DROP_ATTRS and av != "null"}
        out[k] = clean(v)
    return out


def write_json(path: Path, data) -> None:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(localize(text), encoding="utf-8")


for path, key in PAGES.items():
    src = EXPORT / ("page_home.json" if path == "/" else f"page_{key}.json")
    write_json(CONTENT / "pages" / f"{key}.json", clean(json.loads(src.read_text(encoding="utf-8"))))
write_json(CONTENT / "template.json", clean(json.loads((EXPORT / "template.json").read_text(encoding="utf-8"))))

cms = json.loads((EXPORT / "cms_ids.json").read_text(encoding="utf-8"))
write_json(CONTENT / "cms.json", {name: {"fields": c["fields"], "items": [i for i in c["items"] if not i.get("draft")]} for name, c in cms.items()})

# ---------------------------------------------------------------- live HTML: meta, icons, css
live = {}
for path, key in PAGES.items():
    f = EXPORT / ("live_home.html" if path == "/" else f"live_{key}.html")
    live[path] = f.read_text(encoding="utf-8")

meta = {}
for path, h in live.items():
    head = h[: h.find("<body")]

    def m(pattern: str) -> str | None:
        r = re.search(pattern, head)
        return html.unescape(r.group(1)) if r else None

    meta[path] = {
        "title": m(r"<title>([^<]*)</title>"),
        "description": m(r'<meta name="description" content="([^"]*)"'),
        "robots": m(r'<meta name="robots" content="([^"]*)"'),
        "ogImage": m(r'<meta property="og:image" content="([^"]*)"'),
    }
meta["/"]["favicon"] = re.search(r'<link href="([^"]+)" rel="icon"', live["/"]).group(1)
meta["/"]["appleTouchIcon"] = re.search(r'rel="apple-touch-icon" href="([^"]+)"', live["/"]).group(1)
write_json(CONTENT / "meta.json", meta)

icons = {}
ICON_IDS = {"2873462264": "Github Logo", "388653749": "Arrow Right", "4175524542": "House", "465907804": "Plus"}
for h in live.values():
    for mm in re.finditer(r'<svg id="(\d+)"[^>]*>(.*?)</svg>', h, re.S):
        if mm.group(1) in ICON_IDS:
            icons[ICON_IDS[mm.group(1)]] = mm.group(2)
(CONTENT / "icons.json").write_text(json.dumps(icons, ensure_ascii=False, indent=1), encoding="utf-8")


def parse_rules(css: str, media: str = "", out=None):
    out = [] if out is None else out
    pos = 0
    while True:
        mm = re.compile(r"([^{}]+)\{").search(css, pos)
        if not mm:
            break
        sel = mm.group(1).strip()
        if sel.startswith("@media") or sel.startswith("@supports"):
            depth, j = 1, mm.end()
            while depth:
                depth += {"{": 1, "}": -1}.get(css[j], 0)
                j += 1
            parse_rules(css[mm.end() : j - 1], sel, out)
            pos = j
        else:
            j = css.index("}", mm.end())
            out.append((media, sel, css[mm.end() : j]))
            pos = j + 1
    return out


all_css = []
for h in live.values():
    all_css += re.findall(r"<style[^>]*>(.*?)</style>", h, re.S)
css_text = "\n".join(all_css)
css_text = re.sub(r"/\*.*?\*/", "", css_text, flags=re.S)

# fonts: exact set, self-hosted
font_faces = []
seen_ff = set()
for ff in re.findall(r"@font-face\s*\{[^}]*\}", css_text):
    if ff in seen_ff:
        continue
    seen_ff.add(ff)

    def font_repl(mm: re.Match) -> str:
        url = mm.group(1)
        name = hashlib.sha1(url.encode()).hexdigest()[:12] + "-" + local_name(url)
        dest = FONTS / name
        if not dest.exists():
            dest.write_bytes(fetch(url))
        return f'url("/fonts/{name}")'

    font_faces.append(re.sub(r'url\("?(https://[^")]+)"?\)', font_repl, ff))
css_wo_fonts = re.sub(r"@font-face\s*\{[^}]*\}", "", css_text)
(STYLES / "fonts.css").write_text("/* Generated by scripts/import_framer.py: same faces as the Framer site, self-hosted. */\n" + "\n".join(font_faces) + "\n", encoding="utf-8")

rules = []
for chunk in all_css:
    chunk = re.sub(r"/\*.*?\*/", "", chunk, flags=re.S)
    chunk = re.sub(r"@font-face\s*\{[^}]*\}", "", chunk)
    rules += parse_rules(chunk)

# preset class -> preset id -> name
preset_ids = {}
for h in live.values():
    for cls, pid in re.findall(r'framer-styles-preset-([a-z0-9]+)" data-styles-preset="([A-Za-z0-9_]+)"', h):
        preset_ids[cls] = pid
styles = json.loads((EXPORT / "styles.json").read_text(encoding="utf-8"))
id_to_name = {t["id"]: t["name"] for t in styles["texts"]}
id_to_name["YzaH1pv6j"] = "Nav Link"  # the one link style; not part of the text styles export
NODE_RULE = re.compile(r"^\.framer-[A-Za-z0-9]{5}[ .]\.?framer-[a-z0-9]+")
base, presets, seen = [], [], set()
for media, sel, body in rules:
    key = (media, sel, body)
    if key in seen:
        continue
    seen.add(key)
    if "framer-styles-preset-" in sel:
        sel = re.sub(r"\.framer-[A-Za-z0-9]{5} (\.framer-styles-preset-)", r"\1", sel)
        presets.append((media, sel, body))
        continue
    if "__framer-badge" in sel or sel.startswith(".hidden-") or "#__framer" in sel:
        continue
    if "[data-border=true]:after" in sel:
        sel = "[data-border=true]:after"
    elif NODE_RULE.match(sel) or sel.startswith(".framer-") and not sel.startswith(".framer-text") and "framer-cursor" not in sel and "framer-pointer" not in sel and "framer-image" not in sel and "framer-table" not in sel and "framer-fit-text" not in sel and "framer-lightbox" not in sel:
        continue
    base.append((media, sel, body))


def emit(rs) -> str:
    out = []
    for media, sel, body in rs:
        rule = f"{sel}{{{body}}}"
        out.append(f"{media}{{{rule}}}" if media else rule)
    return "\n".join(out) + "\n"


(STYLES / "framer-base.css").write_text("/* Generated by scripts/import_framer.py: Framer's generic runtime rules from the live site. */\n" + emit(base), encoding="utf-8")
(STYLES / "presets.css").write_text("/* Generated by scripts/import_framer.py: text and link style presets. */\n" + emit(presets), encoding="utf-8")
(CONTENT / "presets.json").write_text(json.dumps({id_to_name.get(pid, pid): cls for cls, pid in sorted(preset_ids.items())}, indent=1), encoding="utf-8")

# meta images
for path, mt in meta.items():
    for k in ("ogImage", "favicon", "appleTouchIcon"):
        if mt.get(k):
            mt[k] = localize(mt[k])
write_json(CONTENT / "meta.json", meta)

# Framer served these scaled down (scale-down-to=512); nothing on the site shows them wider than
# ~320 CSS px, so cap them at 640 px (2x) instead of shipping the 1000 px originals.
from PIL import Image  # noqa: E402

KEEP_FULL = {Path(meta["/"][k]).name for k in ("ogImage", "favicon", "appleTouchIcon")}
for f in MEDIA.iterdir():
    if f.name in KEEP_FULL or f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        continue
    with Image.open(f) as im:
        if max(im.size) <= 640:
            continue
        im.thumbnail((640, 640), Image.LANCZOS)
        if f.suffix.lower() in (".jpg", ".jpeg"):
            im.convert("RGB").save(f, quality=84, optimize=True, progressive=True)
        else:
            im.save(f, optimize=True)

print("pages", len(PAGES), "| media", len(list(MEDIA.iterdir())), "| fonts", len(list(FONTS.iterdir())), "| base rules", len(base), "| preset rules", len(presets))
print("presets", json.loads((CONTENT / "presets.json").read_text()))
