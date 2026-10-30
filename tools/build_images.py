#!/usr/bin/env python3
"""Build the responsive image set for the V Energy site.

Reads source photos from media/originals/, crops them to the aspect ratio each
slot needs, applies a light clean-up (contrast, colour, sharpening) and writes
AVIF + WebP files at several widths into assets/img/.

Usage (from the repository root):

    python3 tools/build_images.py            # build everything
    python3 tools/build_images.py hero-main  # build one image

To swap a photo: drop the new file into media/originals/, point the matching
entry in IMAGES below at it (adjust the crop box if needed) and re-run. The
file names in assets/img/ stay the same, so index.html needs no changes.
"""

import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "media" / "originals"
OUT = ROOT / "assets" / "img"

# name: (source file, crop box (left, top, right, bottom) or None, widths, tune)
# tune: "real" = phone photos of our own installs (lift contrast a little more)
IMAGES = {
    "hero-main": ("installers-lifting-panel.jpg", (0, 0, 1229, 768), [480, 720, 960, 1229], "stock"),
    "install-a": ("real-install-deye-svolt-a.jpeg", (236, 200, 1148, 1340), [360, 540, 720, 912], "real"),
    "install-b": ("real-install-deye-svolt-b.jpeg", (128, 200, 1200, 1540), [400, 680, 860, 1072], "real"),
    "install-c": ("real-install-technician.jpeg", (40, 60, 1440, 1110), [480, 800, 1120, 1400], "real"),
    "svc-home": ("tiled-roof-panels.jpg", None, [480, 720, 900], "stock"),
    "svc-business": ("commercial-rooftop-aerial.jpg", (0, 0, 1470, 980), [480, 680, 960, 1200, 1470], "stock"),
    "svc-repairs": ("technician-testing-panels.jpg", (214, 0, 1366, 768), [480, 680, 960, 1152], "stock"),
    "svc-emergency": ("installer-on-roof.jpg", None, [480, 720, 900], "stock"),
    "why-consult": ("consultant-with-panel.jpg", (761, 0, 3980, 4024), [480, 720, 960, 1280], "stock"),
    "band-field": ("panels-in-field.jpg", None, [768, 1280, 1920], "stock"),
    "home-rooftop": ("home-rooftop-solar.jpg", (0, 40, 1024, 520), [480, 720, 1024], "stock"),
    "power-room": ("inverter-power-room.jpg", None, [480, 853], "stock"),
}

AVIF_QUALITY = 58
WEBP_QUALITY = 80


def prepare(img, tune):
    img = ImageOps.exif_transpose(img).convert("RGB")
    if tune == "real":
        img = ImageOps.autocontrast(img, cutoff=0.4)
        img = ImageEnhance.Color(img).enhance(1.08)
    else:
        img = ImageEnhance.Contrast(img).enhance(1.03)
        img = ImageEnhance.Color(img).enhance(1.04)
    return img


def build(name):
    src_name, box, widths, tune = IMAGES[name]
    img = prepare(Image.open(SRC / src_name), tune)
    if box:
        img = img.crop(box)
    w0, h0 = img.size
    for w in widths:
        w = min(w, w0)
        h = round(h0 * w / w0)
        out = img if w == w0 else img.resize((w, h), Image.LANCZOS)
        # Downscaling softens detail; a gentle unsharp mask restores crispness.
        out = out.filter(ImageFilter.UnsharpMask(radius=0.8 if w < 900 else 1.1, percent=55, threshold=2))
        out.save(OUT / f"{name}-{w}.avif", quality=AVIF_QUALITY, speed=4)
        out.save(OUT / f"{name}-{w}.webp", quality=WEBP_QUALITY, method=6)
    print(f"{name}: {w0}x{h0} -> {', '.join(str(min(w, w0)) for w in widths)}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or list(IMAGES)
    for name in names:
        build(name)


if __name__ == "__main__":
    main()
