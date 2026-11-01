#!/usr/bin/env python3
"""Download the CPW documents used for key dates and season dates.

Usage:
  python -I scripts/agency/colorado/seasons_fetch.py <raw_dir> [key ...]

Writes <raw_dir>/<key>.pdf + <key>.txt (pdftotext -layout) for each document,
<raw_dir>/<key>.html for each web page, and <raw_dir>/manifest.json
(key -> share url, direct url, file name, retrieved date, PDF dates).

Sources (all Colorado Parks and Wildlife):
  * the brochures linked from cpw.state.co.us/rules-and-regulations and the species pages
    (cpw.widen.net share pages; the share page carries a "/content/<id>/original/<file>?download=true" link),
  * Chapter W-2 (Big Game) and Chapter W-3 regulations (the "Download" links on the same page),
  * the 2025-2029 Big Game Season Structure adopted by the Parks and Wildlife Commission (June 2024),
  * the CPW pages whose "Important Hunting Dates" boxes announce draw dates.

For a new year: CPW replaces brochures at the same share link or publishes a new share link;
update DOCS (check the rules-and-regulations page and each species page), re-run, then re-run
seasons_parse.py. Downloaded files are untrusted data; nothing in them is executed.
"""
import json
import os
import re
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

DOCS = {
    # brochures (share links as linked on cpw.state.co.us on 2026-10-31)
    "bg-brochure": "https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure",
    "sg-brochure": "https://cpw.widen.net/s/n87kwmkzbt/colorado-sheep-and-goat-brochure",
    "turkey-brochure": "https://cpw.widen.net/s/dm7sggcmdk/colorado-turkey-hunting-brochure",
    "turkey-brochure-rr": "https://cpw.widen.net/s/cnnjzm8x85/colorado-turkey-hunting-brochure",  # rules-and-regulations page link
    "lion-brochure": "https://cpw.widen.net/s/wdhnb9pcvs/colorado-mountain-lion-hunting-brochure",
    "lion-brochure-rr": "https://cpw.widen.net/s/jtlhggpqnv/colorado-mountain-lion-hunting-brochure",  # rules-and-regulations page link
    # regulations
    "chw02": "https://cpw.widen.net/s/s97gq9wqrf/chapter-w-2---big-game-regulations",
    "ch03": "https://cpw.widen.net/s/kmpdszcx6j/ch03",
    "reg-schedule": "https://cpw.widen.net/s/hv8jnwptml/cpw-regulatory-schedule",
}
DIRECT = {
    "bgss2025-2029": "https://cpw.state.co.us/sites/default/files/dam/ifgylu070o/final_bgss2025-2029.pdf",
}
PAGES = {
    "pg-big-game": "https://cpw.state.co.us/activities/hunting/big-game",
    "pg-hunting": "https://cpw.state.co.us/activities/hunting",
    "pg-elk": "https://cpw.state.co.us/activities/hunting/big-game/hunting-elk",
    "pg-deer": "https://cpw.state.co.us/activities/hunting/big-game/hunting-deer",
    "pg-pronghorn": "https://cpw.state.co.us/activities/hunting/big-game/hunting-pronghorn",
    "pg-moose": "https://cpw.state.co.us/activities/hunting/big-game/hunting-moose",
    "pg-bear": "https://cpw.state.co.us/activities/hunting/big-game/hunting-bear",
    "pg-sheep": "https://cpw.state.co.us/activities/hunting/big-game/hunting-bighorn-sheep",
    "pg-goat": "https://cpw.state.co.us/activities/hunting/big-game/hunting-mountain-goat",
    "pg-lion": "https://cpw.state.co.us/activities/hunting/big-game/hunting-mountain-lion",
    "pg-turkey": "https://cpw.state.co.us/activities/hunting/turkey-hunting",
    "pg-rules": "https://cpw.state.co.us/rules-and-regulations",
    "pg-draw-2028": "https://cpw.state.co.us/2028-draw",
}


def resolve(sess, share):
    """Return the direct PDF URL behind a widen share page (some share links serve the PDF itself)."""
    with sess.get(share, timeout=60, stream=True) as r:
        r.raise_for_status()
        if r.headers.get("content-type", "").startswith("application/pdf"):
            return share
    r = sess.get(share, timeout=60)
    r.raise_for_status()
    m = re.search(r'href="(/content/[^"]+?download=true)"', r.text)
    if not m:
        raise RuntimeError("no download href on " + share)
    return "https://cpw.widen.net" + m.group(1).replace("&amp;", "&")


def pdf_dates(pdf):
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    return {k: v.strip() for k, v in re.findall(r"^(CreationDate|ModDate|Title|Pages):\s*(.*)$", out, re.M)}


def main():
    raw = sys.argv[1]
    only = set(sys.argv[2:])
    os.makedirs(raw, exist_ok=True)
    man_path = os.path.join(raw, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    today = time.strftime("%Y-%m-%d")
    for key, share in list(DOCS.items()) + [(k, None) for k in DIRECT]:
        if only and key not in only:
            continue
        direct = DIRECT.get(key) or resolve(sess, share)
        r = sess.get(direct, timeout=300)
        r.raise_for_status()
        if not r.content.startswith(b"%PDF"):
            raise RuntimeError(key + ": not a PDF")
        pdf = os.path.join(raw, key + ".pdf")
        open(pdf, "wb").write(r.content)
        subprocess.run(["pdftotext", "-layout", pdf, os.path.join(raw, key + ".txt")], check=True)
        fname = re.search(r"/original/([^?]+)", direct)
        manifest[key] = {"share": share, "direct": direct.split("?")[0],
                         "file": fname.group(1) if fname else os.path.basename(direct),
                         "bytes": len(r.content), "retrieved": today, **pdf_dates(pdf)}
        print("ok", key, len(r.content), manifest[key].get("CreationDate"))
        json.dump(manifest, open(man_path, "w"), indent=1)
    for key, url in PAGES.items():
        if only and key not in only:
            continue
        r = sess.get(url, timeout=60)
        open(os.path.join(raw, key + ".html"), "w", encoding="utf-8").write(r.text)
        manifest[key] = {"url": url, "status": r.status_code, "retrieved": today}
        print("page", key, r.status_code, len(r.text))
    json.dump(manifest, open(man_path, "w"), indent=1)


if __name__ == "__main__":
    main()
