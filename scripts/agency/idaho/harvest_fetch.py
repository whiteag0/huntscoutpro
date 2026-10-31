#!/usr/bin/env python3
"""Download IDFG Hunt Planner harvest-statistics pages (Idaho), 2020-2025.

Source: Idaho Department of Fish and Game, Hunt Planner harvest statistics
  https://idfg.idaho.gov/ifwis/huntplanner/stats/?season=<general|controlled>&game=<game>&yr=<year>
Each page holds one HTML table (#stattable) with every unit/hunt row for that
season type, game and year (all take methods on one page).

Usage:
  python -I scripts/agency/idaho/harvest_fetch.py <raw_dir> [--force]
Raw files are written as <raw_dir>/hp_<season>_<game>_<year>.html.
"""
import os
import sys
import time
import urllib.parse

import requests

BASE = "https://idfg.idaho.gov/ifwis/huntplanner/stats/"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
YEARS = list(range(2020, 2026))
# (season, IDFG game name)
PAGES = [
    ("general", "elk"),
    ("general", "deer"),
    ("general", "bear"),
    ("general", "lion"),
    ("general", "turkey"),
    ("controlled", "elk"),
    ("controlled", "deer"),
    ("controlled", "bear"),
    ("controlled", "moose"),
    ("controlled", "goat"),
    ("controlled", "pronghorn"),
    ("controlled", "rocky mountain sheep"),
    ("controlled", "california sheep"),
    ("controlled", "turkey"),  # IDFG lists controlled turkey only through 2021
]


def page_url(season: str, game: str, year: int) -> str:
    return BASE + "?" + urllib.parse.urlencode({"season": season, "game": game, "yr": year}, quote_via=urllib.parse.quote)


def raw_name(season: str, game: str, year: int) -> str:
    return f"hp_{season}_{game.replace(' ', '-')}_{year}.html"


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    force = "--force" in sys.argv
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for season, game in PAGES:
        for y in YEARS:
            out = os.path.join(raw, raw_name(season, game, y))
            if os.path.exists(out) and not force:
                continue
            u = page_url(season, game, y)
            r = s.get(u, timeout=60)
            print(r.status_code, len(r.content), u)
            if r.status_code == 200:
                with open(out, "wb") as f:
                    f.write(r.content)
            time.sleep(0.5)


if __name__ == "__main__":
    main()
