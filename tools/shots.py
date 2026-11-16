#!/usr/bin/env python3
"""Capture the radar's three screenshots from the written dashboard.

Run after main.ts has written out/: it opens out/dashboard/index.html in Chromium at 1440x900 with a
device scale factor of 1, sets the state each shot needs through the page's own URL hash (the page
reads it on load — a pasted link opens the same view), and writes a PNG into screenshots/.

Then it brings each file into the 300 to 350 KB band the dossier wants, and keeps the short side at
900 px so the gate's 800 px floor is never near.

    python3 tools/shots.py
"""
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / "out" / "dashboard" / "index.html").as_uri()
SHOTS = ROOT / "screenshots"
RAW = Path("/tmp/radar-raw")
VIEWPORT = {"width": 1440, "height": 900}
LOW, HIGH = 300 * 1024, 350 * 1024

# name, hash the page opens with, and an optional drawer scroll
PLAN = [
    # the board as it opens: header, method, filters, the top of the ranking
    ("1-board.png", "", None),
    # a watchlist protocol's detail drawer, opened through the page's own hash
    ("2-detail.png", "#p=gauntlet", 0),
    # a filter applied: one category and one value band, with the chips and the count that follow
    ("3-filtered.png", "#cat=Risk%20Curators&band=b3&sort=multiple&dir=-1", None),
]


def capture() -> None:
    SHOTS.mkdir(exist_ok=True)
    RAW.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
        for name, hash_, scroll in PLAN:
            # A fresh document each time: a goto that only changes the hash would keep the last shot's
            # open drawer and filters, and the screenshots would lie about what each view shows.
            page.goto("about:blank")
            page.goto(PAGE + hash_)
            page.wait_for_timeout(700)
            if scroll is not None:
                page.evaluate("(y) => { const b = document.querySelector('.drawer-body'); if (b) b.scrollTop = y; }", scroll)
                page.wait_for_timeout(250)
            open_drawer = page.evaluate("() => !!(document.querySelector('.drawer') && document.querySelector('.drawer').open)")
            chips = page.evaluate("() => document.querySelectorAll('.fchip').length")
            rows = page.evaluate("() => document.querySelectorAll('.panel tbody tr').length")
            page.screenshot(path=str(RAW / name))
            print(f"captured {name}: {rows} rows, {chips} filter chips, drawer open {open_drawer}, {(RAW / name).stat().st_size} bytes")
        browser.close()


def encodings(img: Image.Image):
    """Every PNG encoding we will try, as (label, bytes).

    The page is flat colour on a dark ground, so a full-colour PNG lands well under the 512 KiB cap;
    the only variable is how hard zlib works. We walk the compression levels from hardest to lightest and
    take the first file inside the 300-350 KB band, so the shot keeps every colour it was rendered with.
    """
    import io

    def encode(**kw) -> bytes:
        buf = io.BytesIO()
        img.save(buf, format="PNG", **kw)
        return buf.getvalue()

    yield "rgb zlib 9 (optimized)", encode(optimize=True)
    for level in (6, 5, 4, 3, 2, 1):
        yield f"rgb zlib {level}", encode(compress_level=level)
    # Last resort: a palette, only if a shot will not reach the cap in full colour.
    for colours in (256, 192, 128, 96, 64):
        buf = io.BytesIO()
        img.quantize(colors=colours, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).save(buf, format="PNG", optimize=True)
        yield f"{colours}-colour palette", buf.getvalue()


def shrink() -> None:
    for raw in sorted(RAW.glob("*.png")):
        img = Image.open(raw).convert("RGB")
        w, h = img.size
        assert max(w, h) <= 1440 and min(w, h) >= 800, (raw.name, img.size)
        inside, under_cap = None, None
        for label, data in encodings(img):
            if len(data) > 512 * 1024:
                continue
            if under_cap is None or len(data) > under_cap[1]:
                under_cap = (label, len(data), data)
            if LOW <= len(data) <= HIGH:
                inside = (label, len(data), data)
                break
        chosen = inside or under_cap
        if chosen is None:
            raise SystemExit(f"{raw.name}: no encoding fits the 512 KiB cap")
        (SHOTS / raw.name).write_bytes(chosen[2])
        note = "" if inside else "  (outside the 300-350 KB band)"
        print(f"{raw.name}: {w}x{h} {chosen[0]} -> {chosen[1]} bytes{note}")


if __name__ == "__main__":
    if "--shrink-only" not in sys.argv:
        capture()
    shrink()
