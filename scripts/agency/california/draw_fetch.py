#!/usr/bin/env python3
"""Download CDFW Big Game Drawing Statistics PDFs (draw years 2022-2026) and the CDFW pages
used for draw-meta facts.

Reads the CDFW "Big Game Hunting Drawing Statistics" page, collects every
nrm.dfg.ca.gov FileHandler document listed under the <h2> year headings 2022..2026, and saves
each PDF plus a manifest (docs.json: year, document id, link text, url) into <raw>/pdf/.

Usage: python -I draw_fetch.py <raw_dir>
  <raw_dir> e.g. .../scratchpad/agency-raw/california/draw   (untrusted data; keep outside repo)
Then convert:  for f in <raw>/pdf/*.pdf; do pdftotext -layout $f <raw>/txt/$(basename ${f%.pdf}).txt; done
               for f in <raw>/digest/*.pdf; do pdftotext -layout $f ${f%.pdf}.txt; done
(draw_build.py reads the PDFs with pdfplumber and the digest .txt files.)
"""
import json
import os
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
PAGE = "https://wildlife.ca.gov/Licensing/Statistics/Big-Game-Drawing"
YEARS = range(2022, 2027)
# Pages with draw facts (draw-meta.json), saved as HTML for reference.
EXTRA_PAGES = {
    "bg-drawing.html": PAGE,
    "big-game-drawing.html": "https://wildlife.ca.gov/Licensing/Hunting/Big-Game-Drawing",
    "preference-points.html": "https://wildlife.ca.gov/Licensing/Hunting/Big-Game-Drawing/Preference-Points",
    "hunting-items.html": "https://wildlife.ca.gov/Licensing/Hunting/Items",
    "digest.html": "https://wildlife.ca.gov/Publications/Hunting-Digest",
    "pages_Hunting_Bear.html": "https://wildlife.ca.gov/Hunting/Bear",
    "pages_Hunting_Upland-Game-Birds.html": "https://wildlife.ca.gov/Hunting/Upland-Game-Birds",
    "pages_Hunting_Deer.html": "https://wildlife.ca.gov/Hunting/Deer",
}
# Big Game Hunting Digests (digest year -> DocumentID). Digest Y carries the Y-1 deer drawing
# summary (tags awarded by preference/random drawing) and elk/pronghorn/sheep hunt tables.
DIGESTS = {2026: "200602", 2025: "243703", 2024: "231077", 2023: "221986"}


def get(sess, url, path):
    for attempt in range(4):
        r = sess.get(url, timeout=90)
        if r.status_code == 200:
            with open(path, "wb") as f:
                f.write(r.content)
            return r
        time.sleep(3 * (attempt + 1))
    raise SystemExit(f"HTTP {r.status_code} for {url}")


def main():
    raw = sys.argv[1]
    os.makedirs(os.path.join(raw, "pdf"), exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for name, url in EXTRA_PAGES.items():
        try:
            get(s, url, os.path.join(raw, name))
        except SystemExit as e:
            print("WARN", e)
    soup = BeautifulSoup(open(os.path.join(raw, "bg-drawing.html"), "rb").read(), "lxml")
    docs, year = [], None
    for el in soup.find_all(["h2", "a"]):
        if el.name == "h2":
            t = el.get_text(" ", strip=True)
            year = int(t) if re.fullmatch(r"20\d\d", t) else None
            continue
        href = el.get("href", "")
        m = re.search(r"DocumentID=(\d+)", href)
        if year in YEARS and m:
            docs.append({"year": year, "docId": m.group(1), "title": el.get_text(" ", strip=True),
                         "url": f"https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID={m.group(1)}"})
    for d in docs:
        p = os.path.join(raw, "pdf", f"{d['year']}_{d['docId']}.pdf")
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            get(s, d["url"], p)
            time.sleep(0.5)
        print(d["year"], d["docId"], os.path.getsize(p), d["title"])
    json.dump(docs, open(os.path.join(raw, "pdf", "docs.json"), "w"), indent=1)
    os.makedirs(os.path.join(raw, "digest"), exist_ok=True)
    for yr, did in DIGESTS.items():
        p = os.path.join(raw, "digest", f"{did}.pdf")
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            get(s, f"https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID={did}", p)
        print("digest", yr, did, os.path.getsize(p))
    print("Next: pdftotext -layout each PDF into <raw>/txt (pdf/*.pdf) and <raw>/digest/<id>.txt")


if __name__ == "__main__":
    main()
