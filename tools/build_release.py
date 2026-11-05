#!/usr/bin/env python3
"""Gather the files the live website needs into one folder, ready to upload.

Copies the pages, assets and server files (but not media/, tools/ or the README)
into dist/venergy-website/, checks that every file the pages, stylesheet and
script point to is in that folder, and zips it as dist/venergy-website.zip.
The zip holds the files themselves, not a folder, so extracting it inside the
host's web root (public_html on cPanel) puts index.html straight there.

Usage (from the repository root):

    python3 tools/build_release.py
"""

import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = DIST / "venergy-website"
ZIP = DIST / "venergy-website.zip"

FILES = [
    "index.html", "Thankyou.html", "privacy.html", "404.html",
    ".htaccess", "robots.txt", "sitemap.xml", "site.webmanifest",
    "favicon.ico", "favicon.svg", "apple-touch-icon.png",
]
FOLDERS = ["assets"]

# href="…", src="…", srcset="a 1x, b 2x", url(…), and quoted 'assets/…' paths in scripts
REF = re.compile(r"""(?:href|src)="([^"]+)"|srcset="([^"]+)"|url\(["']?([^"')]+)["']?\)|["'](assets/[^"']+)["']""")
SKIP = ("http:", "https:", "mailto:", "tel:", "data:", "#", "javascript:")


def refs(path):
    text = path.read_text(encoding="utf-8")
    for m in REF.finditer(text):
        href, srcset, url, script = m.groups()
        if srcset:
            yield from (part.strip().split(" ")[0] for part in srcset.split(","))
        else:
            yield href or url or script


def missing_refs():
    missing = []
    for page in [*OUT.glob("*.html"), *OUT.rglob("*.css"), *OUT.rglob("*.js"), OUT / "site.webmanifest"]:
        for ref in refs(page):
            ref = ref.split("#")[0].split("?")[0]
            if not ref or ref.startswith(SKIP) or "${" in ref:  # skip links built in the script
                continue
            # /path is from the web root; anything else is next to the file that names it
            target = OUT / ref.lstrip("/") if ref.startswith("/") else page.parent / ref
            if not target.resolve().is_relative_to(OUT.resolve()) or not target.exists():
                missing.append(f"{page.relative_to(OUT)} -> {ref}")
    return missing


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for name in FILES:
        shutil.copy2(ROOT / name, OUT / name)
    for name in FOLDERS:
        shutil.copytree(ROOT / name, OUT / name)

    missing = missing_refs()
    if missing:
        print("Missing files:\n  " + "\n  ".join(missing))
        sys.exit(1)

    ZIP.unlink(missing_ok=True)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(OUT))

    count = sum(1 for f in OUT.rglob("*") if f.is_file())
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"{count} files, {size / 1e6:.1f} MB in {OUT.relative_to(ROOT)}/")
    print(f"zip: {ZIP.relative_to(ROOT)} ({ZIP.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
