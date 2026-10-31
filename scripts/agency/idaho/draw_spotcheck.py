#!/usr/bin/env python3
"""Spot-check random Idaho draw rows against the raw IDFG downloads, independently of draw_build.py.

For each sampled row: re-find the hunt in the raw odds JSON (by year + hunt number), compare every
count field, re-read the raw hunt-area HTML with a plain regex (no BeautifulSoup) for GMUs, and
re-find season dates in the raw Hunt Planner list JSON.

Usage: python -I draw_spotcheck.py <raw_dir> <repo_root> [n=20] [seed=20261031]
"""
import glob
import json
import os
import random
import re
import sys

BG = {"elk": [2], "mule-deer": [1], "whitetail": [1], "pronghorn": [3], "moose": [6], "sheep": [7, 28], "goat": [8], "bear": [4], "turkey": [27]}


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    rnd = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 20261031)
    rows = []
    for f in sorted(glob.glob(os.path.join(repo, "src/data/agency/idaho/draw/*.json"))):
        rows += json.load(open(f))
    # stratify: at least one row per species, rest random
    by_sp = {}
    for r in rows:
        by_sp.setdefault(r["species"], []).append(r)
    sample = [rnd.choice(v) for v in by_sp.values()]
    while len(sample) < n:
        r = rnd.choice(rows)
        if r not in sample:
            sample.append(r)
    fails = 0
    for r in sample:
        raw_rows = []
        for bg in BG[r["species"]]:
            p = os.path.join(raw, "odds", f"odds_bg{bg}_{r['year']}_d1.json")
            raw_rows += [x for x in json.load(open(p))["rows"] if str(x["CHunt"]) == r["huntCode"]]
        problems = []
        if not raw_rows:
            problems.append("hunt not in raw odds")
        else:
            x = raw_rows[0]
            t, res, nr = r.get("total") or {}, r.get("resident") or {}, r.get("nonresident") or {}
            if len(raw_rows) == 1:
                checks = [("applicants", t.get("applicants"), x["ApplChoice1"]), ("drawn", t.get("drawn"), x["SuccChoice1"]),
                          ("res.app", res.get("applicants"), x["ResApp"]), ("res.drawn", res.get("drawn"), x["ResPermit"]),
                          ("nr.app", nr.get("applicants"), x["NonResApp"]), ("nr.drawn", nr.get("drawn"), x["NonResPermit"])]
                if t.get("quota") is not None:
                    checks.append(("quota", t["quota"], x["PermitAvailable"]))
                if not t.get("oddsComputed") and t.get("oddsPct") is not None:
                    checks.append(("odds", t["oddsPct"], x["PercChoice1"]))
                if not res.get("oddsComputed") and res.get("oddsPct") is not None:
                    checks.append(("res.odds", res["oddsPct"], x["PercRes1"]))
                if not nr.get("oddsComputed") and nr.get("oddsPct") is not None:
                    checks.append(("nr.odds", nr["oddsPct"], x["PercNonRes1"]))
                for k, a, b in checks:
                    if a != b:
                        problems.append(f"{k} {a} != raw {b}")
            # GMUs straight from area HTML
            ap = os.path.join(raw, "area", f"area_{x['AreaID']}.html")
            if os.path.exists(ap):
                html = open(ap, encoding="utf-8", errors="replace").read()
                gmus = []
                for u in re.findall(r'unit\.aspx\?ID=\d+"[^>]*>([^<]+)</a>', html, re.I):
                    if u.strip() not in gmus:
                        gmus.append(u.strip())
                if gmus != r["units"]:
                    problems.append(f"units {r['units']} != area page {gmus}")
                sub = re.search(r'id="SubTitle">([^<]*)<', html)
                if sub and " ".join(sub.group(1).split()) not in r["description"].replace("&amp;", "&"):
                    problems.append("area description text differs")
        if r.get("seasonDates") and "brochure" not in (r.get("note") or "").lower() and "Seasons & Rules" not in (r.get("note") or ""):
            first = r["seasonDates"].split(" to ")[0]
            y, m, d = first.split("-")
            mdY = f"{int(m)}/{int(d)}/{y[2:]}"
            found = False
            for f in glob.glob(os.path.join(raw, "list", "list_g*.json")):
                for q in json.load(open(f))["rows"]:
                    if q["number"] == r["huntCode"] and q["open"] == mdY:
                        found = True
            if not found:
                problems.append(f"season open {mdY} not in raw hunt list")
        status = "OK" if not problems else "FAIL: " + "; ".join(problems)
        fails += bool(problems)
        t = r.get("total") or {}
        print(f"{r['species']:10} {r['year']} hunt {r['huntCode']} area-units {','.join(r['units'])[:30]:30} "
              f"quota={t.get('quota')} app={t.get('applicants')} drew={t.get('drawn')} odds={t.get('oddsPct')} "
              f"R={ (r.get('resident') or {}).get('applicants')}/{(r.get('resident') or {}).get('drawn')} "
              f"NR={(r.get('nonresident') or {}).get('applicants')}/{(r.get('nonresident') or {}).get('drawn')} "
              f"season={r.get('seasonDates','-')} -> {status}")
    print(f"{len(sample)} rows checked, {fails} failures")


if __name__ == "__main__":
    main()
