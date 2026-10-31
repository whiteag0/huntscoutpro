#!/usr/bin/env python3
"""Download Wyoming Game and Fish Department (WGFD) initial-draw "Demand Report"
drawing-odds PDFs for draw years 2022-2026 and convert them to text.

Source index: https://wgfd.wyo.gov/licenses-applications/draw-results-odds
(section "Drawing odds"; the "Leftover drawing odds" section is not used).

Usage:
  python -I scripts/agency/wyoming/draw_download.py <raw_dir>
Writes <raw_dir>/index.html, <raw_dir>/manifest.json, <raw_dir>/pdf/<year>_<species>_<cat>_<label>_<mediaId>.pdf
and a pdftotext -layout .txt next to each PDF. Downloaded files are treated as data only.
"""
import json
import os
import re
import subprocess
import sys
import time

import requests
from bs4 import BeautifulSoup

INDEX = "https://wgfd.wyo.gov/licenses-applications/draw-results-odds"
BASE = "https://wgfd.wyo.gov"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
YEARS = {"2022", "2023", "2024", "2025", "2026"}
# WGFD section heading -> our interest (None = skip)
SPECIES = {
    "Antelope": "pronghorn", "Deer": "deer", "Elk": "elk", "Bighorn sheep": "sheep",
    "Moose": "moose", "Mountain goat": "goat", "Wild turkey": "turkey",
}


# The index page's 2022 "Mountain goat" links (media 16745/16751) open the 2020 reports
# (dated 5/1/2020). The 2022 reports (dated 4/25/2022) are on the same WGFD media server
# but not linked from the index; they are added here explicitly.
EXTRA = [
    {"year": 2022, "wgfdSpecies": "Mountain goat", "species": "goat", "category": "", "label": "Nonresident",
     "mediaId": "22160", "unlinked": True},
    {"year": 2022, "wgfdSpecies": "Mountain goat", "species": "goat", "category": "", "label": "Resident",
     "mediaId": "22171", "unlinked": True},
]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_index(html):
    soup = BeautifulSoup(html, "lxml")
    main = soup.find("main") or soup
    out = []
    year = species = cat = None
    in_odds = False
    for el in main.find_all(["h2", "h3", "h4", "strong", "a"]):
        t = el.get_text(" ", strip=True)
        if el.name == "h3":
            in_odds = (t == "Drawing odds")
            continue
        if not in_odds:
            continue
        if el.name == "h4":
            year, species, cat = t, None, None
        elif el.name == "h2":
            species, cat = t, ""
        elif el.name == "strong":
            cat = t
        elif el.name == "a":
            h = el.get("href") or ""
            m = re.match(r"^/media/(\d+)/download", h)
            if not m or year not in YEARS or species not in SPECIES:
                continue
            out.append({"year": int(year), "wgfdSpecies": species, "species": SPECIES[species],
                        "category": cat or "", "label": t, "mediaId": m.group(1),
                        "url": f"{BASE}/media/{m.group(1)}/download"})
    return out


def main():
    raw = sys.argv[1]
    os.makedirs(os.path.join(raw, "pdf"), exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    html = s.get(INDEX, timeout=60).text
    open(os.path.join(raw, "index.html"), "w").write(html)
    items = parse_index(html)
    for e in EXTRA:
        items.append(dict(e, url=f"{BASE}/media/{e['mediaId']}/download"))
    for it in items:
        name = f"{it['year']}_{it['species']}_{slug(it['category']) or 'all'}_{slug(it['label'])}_{it['mediaId']}"
        pdf = os.path.join(raw, "pdf", name + ".pdf")
        it["file"] = os.path.relpath(pdf, raw)
        if not os.path.exists(pdf) or os.path.getsize(pdf) == 0:
            r = s.get(it["url"] + "?inline", timeout=120)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                raise SystemExit(f"not a PDF: {it['url']}")
            open(pdf, "wb").write(r.content)
            time.sleep(0.3)
        txt = pdf[:-4] + ".txt"
        if not os.path.exists(txt):
            subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)
        print(it["year"], it["species"], it["category"], "|", it["label"], it["mediaId"])
    json.dump(items, open(os.path.join(raw, "manifest.json"), "w"), indent=1)
    print(len(items), "documents")


if __name__ == "__main__":
    main()
