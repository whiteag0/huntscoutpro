#!/usr/bin/env python3
"""Download the CDFW documents used for California season dates (seasons_digest.py, seasons_spotcheck.py).

Saved into <raw_dir> (untrusted data; keep it outside the repo) and converted with `pdftotext -layout`:
  doc_168214.pdf/.txt  Approved 2026 Deer Seasons by Zone                      (wildlife.ca.gov/Hunting/Deer)
  doc_168215.pdf/.txt  Approved 2026 Deer Seasons - Additional Hunts (G, M, MA, J)
  doc_168216.pdf/.txt  Approved 2026 Deer Seasons - Area-Specific Archery Hunts (A)
  doc_246668.pdf/.txt  2026 Elk Hunt Dates and General Information             (wildlife.ca.gov/Hunting/Elk)
  doc_202568.pdf/.txt  2026-2027 California Mammal Hunting Regulations booklet (Title 14; updated Oct 27, 2026)
  Hunting_*.html, big-game-drawing.html, ...  CDFW pages (sheep season table, 2027 re-check)

The 2026 Big Game Hunting Digest (DocumentID 200602) is downloaded by draw_fetch.py into <draw_raw>/digest/.

Usage: python -I seasons_fetch.py <raw_dir>     e.g. .../agency-raw/california/seasons
"""
import os
import subprocess
import sys
import time
import urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0 Safari/537.36")
FH = "https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID={}&inline"
DOCS = ["168214", "168215", "168216", "246668", "202568"]
PAGES = {
    "big-game-drawing.html": "https://wildlife.ca.gov/Licensing/Hunting/Big-Game-Drawing",
    "Publications_Hunting-Digest.html": "https://wildlife.ca.gov/Publications/Hunting-Digest",
    "Licensing_Hunting.html": "https://wildlife.ca.gov/Licensing/Hunting",
    "Licensing_Statistics_Big-Game-Drawing.html": "https://wildlife.ca.gov/Licensing/Statistics/Big-Game-Drawing",
    "Regulations.html": "https://wildlife.ca.gov/Regulations",
    "Hunting_Deer.html": "https://wildlife.ca.gov/Hunting/Deer",
    "Hunting_Elk.html": "https://wildlife.ca.gov/Hunting/Elk",
    "Hunting_Pronghorn.html": "https://wildlife.ca.gov/Hunting/Pronghorn",
    "Hunting_Bighorn-Sheep.html": "https://wildlife.ca.gov/Hunting/Bighorn-Sheep",
}


def get(url, path):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            print("saved", os.path.basename(path), len(data))
            return
        except Exception as e:  # noqa: BLE001 - retry any network error
            print("retry", url, e)
            time.sleep(3 * (attempt + 1))
    raise SystemExit("failed: " + url)


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    for name, url in PAGES.items():
        get(url, os.path.join(raw, name))
    for d in DOCS:
        pdf = os.path.join(raw, f"doc_{d}.pdf")
        get(FH.format(d), pdf)
        subprocess.run(["pdftotext", "-layout", pdf, pdf[:-4] + ".txt"], check=True)


if __name__ == "__main__":
    main()
