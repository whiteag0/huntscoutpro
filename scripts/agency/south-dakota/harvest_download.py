#!/usr/bin/env python3
"""Download South Dakota GFP big game / turkey harvest reports (2020-2026 seasons).

Usage: harvest_download.py <raw_dir>

Sources
- GFP "Big Game Harvest Projections" annual reports (South Dakota Game Report series),
  one PDF per season year 2020-2024, compiled by GFP's Game Harvest Surveys Coordinator.
- GFP current per-season harvest reports linked from https://gfp.sd.gov/hunt-surveys/
  (each URL is overwritten every year; on 2026-10-31 they hold the 2025 fall seasons,
  the 2025/26 mountain lion season and the 2026 spring turkey seasons).
- Internet Archive captures (2026-03-01) of the same GFP spring-turkey URLs, which at that
  time held the 2025 spring turkey reports (not otherwise available now; the 2025 annual
  report has not been published).
Every file is written to <raw_dir> and converted with `pdftotext -layout`.
"""
import os
import subprocess
import sys
import time
import urllib.parse

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

ANNUAL = {
    2020: "https://gfp.sd.gov/userdocs/docs/-_2020_big_game_annual_report.pdf",
    2021: "https://gfp.sd.gov/userdocs/docs/-_2021_big_game_annual_report.pdf",
    2022: "https://gfp.sd.gov/userdocs/docs/-_2022_big_game_annual_report.pdf",
    2023: "https://gfp.sd.gov/userdocs/docs/-_2023_big_game_annual_report.pdf",
    2024: "https://gfp.sd.gov/userdocs/docs/2024_big_game_annual_report.pdf",
}

HR = "https://gfp.sd.gov/images/Harvest_Reports/"
CURRENT = [
    "APPRENTICE DEER", "ARCHERY ANTELOPE", "ARCHERY DEER", "BLACK HILLS CSP PRAIRIE ELK",
    "BLACK HILLS DEER", "BLACK HILLS SPRING TURKEY", "CUSTER STATE PARK ANTELOPE",
    "CUSTER STATE PARK DEER", "CUSTER STATE PARK SPRING TURKEY", "EAST RIVER FIREARM DEER",
    "FALL BLACK HILLS TURKEY", "FALL MENTORED YOUTH TURKEY", "FALL PRAIRIE TURKEY",
    "FIREARM ANTELOPE", "LANDOWNER ANTLERLESS DEER", "MENTORED YOUTH ANTELOPE",
    "MENTORED YOUTH DEER", "MOUNTAIN GOAT and BIGHORN", "MOUNTAIN LION", "MUZZLELOADER DEER",
    "NATIONAL WILDLIFE REFUGE FIREARM DEER", "SPECIAL ANTELOPE", "SPRING ARCHERY TURKEY",
    "SPRING FIREARM PRAIRIE TURKEY", "SPRING MENTORED YOUTH TURKEY", "STATEWIDE DEER SUMMARY",
    "WEST RIVER PRAIRIE FIREARM DEER", "YOUTH DEER",
]

# Internet Archive captures holding the 2025 spring turkey reports.
WAYBACK_TS = "20260301145707"
WAYBACK = [
    "BLACK HILLS SPRING TURKEY", "CUSTER STATE PARK SPRING TURKEY", "SPRING ARCHERY TURKEY",
    "SPRING FIREARM PRAIRIE TURKEY", "SPRING MENTORED YOUTH TURKEY",
]


def current_url(name):
    return HR + urllib.parse.quote(name) + ".pdf"


def wayback_url(name):
    return f"https://web.archive.org/web/{WAYBACK_TS}id_/{current_url(name)}"


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return
    for attempt in range(6):
        r = requests.get(url, headers={"User-Agent": UA}, timeout=120)
        if r.status_code != 429:
            break
        time.sleep(60 * (attempt + 1))  # Internet Archive rate limit
    r.raise_for_status()
    if not r.content.startswith(b"%PDF"):
        raise RuntimeError(f"not a PDF: {url}")
    with open(dest, "wb") as fh:
        fh.write(r.content)
    time.sleep(30 if "web.archive.org" in url else 1)


def to_text(pdf):
    txt = pdf[:-4] + ".txt"
    subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)


def main():
    raw = sys.argv[1]
    os.makedirs(os.path.join(raw, "annual"), exist_ok=True)
    os.makedirs(os.path.join(raw, "wayback"), exist_ok=True)
    for y, u in ANNUAL.items():
        p = os.path.join(raw, "annual", f"bg_annual_{y}.pdf")
        fetch(u, p)
        to_text(p)
    for n in CURRENT:
        p = os.path.join(raw, n.replace(" ", "_") + ".pdf")
        fetch(current_url(n), p)
        to_text(p)
    for n in WAYBACK:
        p = os.path.join(raw, "wayback", WAYBACK_TS + "_" + n.replace(" ", "_") + ".pdf")
        fetch(wayback_url(n), p)
        to_text(p)
    print("ok")


if __name__ == "__main__":
    main()
