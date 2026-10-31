#!/usr/bin/env python3
"""Download IDFG controlled-hunt drawing odds + hunt metadata (raw, untouched).

Sources (all Idaho Department of Fish and Game, Idaho Hunt Planner):
  * Drawing odds JSON  https://idfg.idaho.gov/ifwis/huntplanner/api/1.1/odds/?biggame=<id>&yr=<year>&draw=<1|2>
    (the data behind https://idfg.idaho.gov/ifwis/huntplanner/odds/)
  * Controlled-hunt list JSON https://idfg.idaho.gov/ifwis/huntplanner/api/1.1/list/?game=<id>&type=2&start=..&end=..
    (the data behind https://idfg.idaho.gov/ifwis/huntplanner/filter) -> season dates, weapon, antler class
  * Hunt-area pages https://idfg.idaho.gov/ifwis/huntplanner/area.aspx?id=<AreaID> -> area boundary text + GMU list

Usage: python -I draw_fetch.py <raw_dir> [--years 2022-2026]
Downloaded files are treated as untrusted data; this script only saves them.
"""
import json
import os
import sys
import time

import requests

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
BASE = "https://idfg.idaho.gov/ifwis/huntplanner"
# Drawing-odds "biggame" ids as listed in the odds page selector.
ODDS_GAMES = {1: "Deer", 2: "Elk", 3: "Pronghorn", 4: "Bear", 6: "Moose", 28: "California Sheep",
              7: "Rocky Mountain Sheep", 8: "Mountain Goat", 27: "Turkey"}
# Hunt-planner filter "game" ids (filter page checkboxes).
LIST_GAMES = {1: "Deer", 2: "Elk", 3: "Pronghorn", 4: "Black Bear", 6: "Moose", 119: "Bighorn Sheep",
              8: "Mountain Goat", 27: "Turkey"}
# Agency PDFs used for draw-meta facts (fees, dates, rules) and 2026 moose/sheep/goat season dates.
DOCS = [
    "https://idfg.idaho.gov/sites/default/files/seasons-rules-big-game-2026.pdf",
    "https://idfg.idaho.gov/sites/default/files/seasons-rules-moose-sheep-goat-2025-26.pdf",
    "https://idfg.idaho.gov/sites/default/files/seasons-rules-big-game-supplemental-proclamation-2027.pdf",
    "https://idfg.idaho.gov/sites/default/files/seasons-rules-upland-game-2026-2027.pdf",
]


def get(url, dest, session, retries=3):
    for a in range(retries):
        try:
            r = session.get(url, headers=UA, timeout=60)
            if r.status_code == 200:
                with open(dest, "wb") as f:
                    f.write(r.content)
                return True
            print("HTTP", r.status_code, url, file=sys.stderr)
        except requests.RequestException as e:
            print("ERR", e, url, file=sys.stderr)
        time.sleep(2 * (a + 1))
    return False


def main():
    raw = sys.argv[1]
    years = list(range(2022, 2027))
    if "--years" in sys.argv:
        a, b = sys.argv[sys.argv.index("--years") + 1].split("-")
        years = list(range(int(a), int(b) + 1))
    os.makedirs(os.path.join(raw, "odds"), exist_ok=True)
    os.makedirs(os.path.join(raw, "list"), exist_ok=True)
    os.makedirs(os.path.join(raw, "area"), exist_ok=True)
    os.makedirs(os.path.join(raw, "docs"), exist_ok=True)
    s = requests.Session()
    manifest = []
    for url in DOCS:
        dest = os.path.join(raw, "docs", url.rsplit("/", 1)[1])
        if get(url, dest, s):
            manifest.append({"url": url, "file": dest})
    for bg in ODDS_GAMES:
        for y in years:
            for d in (1, 2):
                url = f"{BASE}/api/1.1/odds/?biggame={bg}&yr={y}&draw={d}"
                dest = os.path.join(raw, "odds", f"odds_bg{bg}_{y}_d{d}.json")
                if get(url, dest, s):
                    manifest.append({"url": url, "file": dest})
    lo, hi = min(years), max(years)
    for g in LIST_GAMES:
        url = f"{BASE}/api/1.1/list/?game={g}&type=2&start={lo}-1-1&end={hi + 1}-6-30&limit=5000&offset=0"
        dest = os.path.join(raw, "list", f"list_g{g}_{lo}_{hi}.json")
        if get(url, dest, s):
            manifest.append({"url": url, "file": dest})
    # Area pages for every AreaID seen in odds.
    area_ids = set()
    for fn in os.listdir(os.path.join(raw, "odds")):
        with open(os.path.join(raw, "odds", fn)) as f:
            d = json.load(f)
        for r in d.get("rows") or []:
            if r.get("AreaID") is not None:
                area_ids.add(int(r["AreaID"]))
    for aid in sorted(area_ids):
        dest = os.path.join(raw, "area", f"area_{aid}.html")
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            continue
        url = f"{BASE}/area.aspx?id={aid}"
        if get(url, dest, s):
            manifest.append({"url": url, "file": dest})
        time.sleep(0.2)
    with open(os.path.join(raw, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"saved {len(manifest)} files; {len(area_ids)} areas")


if __name__ == "__main__":
    main()
