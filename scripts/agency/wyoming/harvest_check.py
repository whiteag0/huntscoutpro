#!/usr/bin/env python3
"""Internal-consistency and statewide cross-checks for the parsed WGFD harvest JSON.

Usage: python -I harvest_check.py <harvest_json_dir>
For every species/year:
  * each hunt area has exactly one pooled Total/Resident/Nonresident row;
  * sum of license-type harvest == pooled total harvest (per area);
  * archery + firearm harvest == pooled total harvest (per area, residency 'all');
  * resident + nonresident pooled harvest == pooled total harvest;
  * sum over areas of pooled total harvest is printed next to the statewide total
    published in the agency's ten-year table (STATEWIDE below, copied from the 2025 reports).
"""
import json
import os
import sys
from collections import defaultdict

# Statewide total harvest as printed by WGFD: big game from the 2025 reports' ten-year comparison
# tables (elk Table 2, antelope Table 2, deer Tables 5 and 6); moose / sheep / goat from each year's
# statewide summary (Table I / Table 1).  Typed from the PDFs.
STATEWIDE = {
    "elk": {"2020": 26491, "2021": 24333, "2022": 27011, "2023": 28353, "2024": 30744, "2025": 30568},
    "pronghorn": {"2020": 40410, "2021": 31965, "2022": 28254, "2023": 21228, "2024": 22218, "2025": 22766},
    "mule-deer": {"2020": 21370, "2021": 18944, "2022": 17785, "2023": 13572, "2024": 15004, "2025": 16688},
    "whitetail": {"2020": 19904, "2021": 16117, "2022": 11530, "2023": 10844, "2024": 11633, "2025": 10258},
    "moose": {"2020": 310, "2021": 329, "2022": 334, "2023": 331, "2024": 317, "2025": 338},
    "sheep": {"2020": 132, "2021": 148, "2022": 162, "2023": 182, "2024": 185, "2025": 242},
    "goat": {"2020": 56, "2021": 40, "2022": 43, "2023": 39, "2024": 35, "2025": 27},
    "bear": {"2020": 537, "2021": 563, "2022": 526, "2023": 582, "2024": 631, "2025": 656},
    "lion": {"2021": 323, "2022": 317, "2023": 340, "2024": 354, "2025": 277},
}


def main():
    d = sys.argv[1]
    for sp in ("elk", "pronghorn", "mule-deer", "whitetail", "moose", "sheep", "goat", "bear", "lion", "turkey"):
        p = os.path.join(d, f"{sp}.json")
        if not os.path.exists(p):
            continue
        rows = json.load(open(p))
        by = defaultdict(lambda: defaultdict(list))
        for r in rows:
            by[r["year"]][r["unit"]].append(r)
        for yr in sorted(by):
            tot = 0
            issues = []
            for unit, rs in by[yr].items():
                pooled = {r["residency"]: r for r in rs if r.get("method") == "all"}
                types = [r for r in rs if r.get("hunt")]
                meth = [r for r in rs if r.get("method") in ("archery", "other") and r.get("residency") == "all"]
                if not pooled:
                    continue
                if sp == "turkey":
                    continue  # fall + spring share a year; see harvest_turkey.py output
                if set(pooled) not in ({"all", "resident", "nonresident"}, {"all"}) or (set(pooled) != {"all"} and sum(1 for r in rs if r.get("method") == "all") != 3):
                    issues.append(f"{unit}: pooled rows {sorted(pooled)}")
                t = pooled.get("all")
                if not t:
                    continue
                tot += t["harvest"] or 0
                if types and sum(r["harvest"] or 0 for r in types) != t["harvest"]:
                    issues.append(f"{unit}: type sum {sum(r['harvest'] or 0 for r in types)} != pooled {t['harvest']}")
                if "resident" in pooled and "nonresident" in pooled:
                    rn = (pooled["resident"]["harvest"] or 0) + (pooled["nonresident"]["harvest"] or 0)
                    if rn != t["harvest"]:
                        issues.append(f"{unit}: res+nonres {rn} != pooled {t['harvest']}")
                if meth and sum(r["harvest"] for r in meth) != t["harvest"]:
                    issues.append(f"{unit}: archery+firearm {sum(r['harvest'] for r in meth)} != pooled {t['harvest']}")
            sw = STATEWIDE.get(sp, {}).get(str(yr))
            print(f"{sp} {yr}: areas={len(by[yr])} sum(area totals)={tot} statewide={sw} diff={None if sw is None else tot - sw} issues={len(issues)}")
            for i in issues:
                print("    ", i)


if __name__ == "__main__":
    main()
