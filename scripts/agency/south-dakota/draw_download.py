#!/usr/bin/env python3
"""Download South Dakota GFP draw statistics (draw years 2022-2026).

GFP publishes draw statistics through its licensing site's "Draw Statistics"
tool (linked from https://gfp.sd.gov/draw-stats/):
  https://license.gooutdoorssouthdakota.com/License/DrawStatistics
The page is driven by three AJAX POST endpoints (form fields Year,
PhaseCategoryID, PhaseID, EventID):
  /License/DrawStatistics/FilterDropdowns     -> JSON options (seasons, application periods, licenses)
  /License/DrawStatistics/GetDrawResults      -> HTML table "Draw Results" (preference pools)
  /License/DrawStatistics/GetDrawPreferences  -> HTML table "Draw Preference Breakdown" (by point level)

Usage:  python -I draw_download.py <raw_dir> [--refresh]
Writes <raw_dir>/tree-<year>.json (season -> application period -> license list),
<raw_dir>/html/<year>_<cat>_<phase>_<event>_{res,pref}.html and <raw_dir>/manifest.json.
Already-downloaded files are skipped unless --refresh is given.
Downloaded files are treated as untrusted data (parsed only, never executed).
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
BASE = "https://license.gooutdoorssouthdakota.com"
PAGE = BASE + "/License/DrawStatistics"
YEARS = [2022, 2023, 2024, 2025, 2026]

# Draw "seasons" (PhaseCategory text) for HuntScout species. Paddlefish,
# waterfowl, swan, goose and bison drawings are out of scope.
WANT = re.compile(r"Elk|Deer|Antelope|Bighorn|Mt Goat|Mountain Lion|Turkey|Special Buck|"
                  r"Landowner-Own-Land", re.I)
SKIP = re.compile(r"Bison|Paddlefish|Waterfowl|Swan|Goose", re.I)


def session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "X-Requested-With": "XMLHttpRequest",
                      "Referer": PAGE})
    s.get(PAGE, timeout=60)
    return s


def post(s, path, data, tries=4):
    for i in range(tries):
        try:
            r = s.post(BASE + path, data=data, timeout=60, allow_redirects=False)
            if r.status_code == 200:
                return r
            err = f"HTTP {r.status_code}"
        except requests.RequestException as e:  # network hiccup
            err = str(e)
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"{path} {data}: {err}")


def filt(s, year, cat="", phase=""):
    d = {"Year": year, "PhaseCategoryID": cat, "PhaseID": phase, "EventID": ""}
    return post(s, "/License/DrawStatistics/FilterDropdowns", d).json()


def build_tree(s, raw, year, refresh):
    p = os.path.join(raw, f"tree-{year}.json")
    if os.path.exists(p) and not refresh:
        return json.load(open(p))
    tree = []
    for c in filt(s, year)["Categories"]["Options"]:
        if not WANT.search(c["Text"]) or SKIP.search(c["Text"]):
            continue
        cat = {"id": c["Value"], "text": c["Text"], "phases": []}
        for ph in filt(s, year, c["Value"])["Phases"]["Options"]:
            evs = filt(s, year, c["Value"], ph["Value"])["Events"]["Options"]
            cat["phases"].append({"id": ph["Value"], "text": ph["Text"],
                                  "events": [{"id": e["Value"], "text": e["Text"]} for e in evs]})
        tree.append(cat)
        print(year, c["Text"], [(len(x["events"]), x["text"]) for x in cat["phases"]], flush=True)
    json.dump(tree, open(p, "w"), indent=1)
    return tree


def main():
    raw = sys.argv[1]
    refresh = "--refresh" in sys.argv
    os.makedirs(os.path.join(raw, "html"), exist_ok=True)
    s = session()
    jobs = []
    manifest = []
    for y in YEARS:
        for cat in build_tree(s, raw, y, refresh):
            for ph in cat["phases"]:
                for ev in ph["events"]:
                    stem = f"{y}_{cat['id']}_{ph['id']}_{ev['id']}"
                    manifest.append({"year": y, "categoryId": cat["id"], "category": cat["text"],
                                     "phaseId": ph["id"], "phase": ph["text"],
                                     "eventId": ev["id"], "event": ev["text"], "stem": stem})
                    jobs.append((y, cat["id"], ph["id"], ev["id"], stem))
    json.dump(manifest, open(os.path.join(raw, "manifest.json"), "w"), indent=1)
    print(len(jobs), "licenses to fetch", flush=True)

    def fetch(job):
        y, c, p, e, stem = job
        d = {"Year": y, "PhaseCategoryID": c, "PhaseID": p, "EventID": e}
        for kind, path in (("res", "GetDrawResults"), ("pref", "GetDrawPreferences")):
            out = os.path.join(raw, "html", f"{stem}_{kind}.html")
            if os.path.exists(out) and os.path.getsize(out) > 0 and not refresh:
                continue
            r = post(fetch.s, "/License/DrawStatistics/" + path, d)
            with open(out, "w", encoding="utf-8") as f:
                f.write(r.text)
        return stem

    fetch.s = s
    done = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for _ in ex.map(fetch, jobs):
            done += 1
            if done % 200 == 0:
                print(done, "/", len(jobs), flush=True)
    print("done", done)


if __name__ == "__main__":
    main()
