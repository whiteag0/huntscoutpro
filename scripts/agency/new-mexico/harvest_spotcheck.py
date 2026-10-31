#!/usr/bin/env python3
"""Spot-check parsed New Mexico harvest rows against the raw report text.

Usage (from the repo root):
    python -I scripts/agency/new-mexico/harvest_spotcheck.py <raw_dir> [n_per_species] [seed]

For each sampled row the script prints the JSON row and every raw text line that
holds its hunt code / unit, then checks that the row's numbers occur, in order, in one
of those lines (the raw -layout text is read directly, without the parser).
"""
import json
import os
import random
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA = os.path.join(REPO, "src", "data", "agency", "new-mexico")


def nums_in_order(line, values):
    toks = [t.replace(",", "").rstrip("%") for t in line.split()]
    i = 0
    for v in values:
        sv = str(v)
        while i < len(toks) and toks[i] != sv:
            i += 1
        if i == len(toks):
            return False
        i += 1
    return True


def main():
    raw = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 20261031
    rng = random.Random(seed)
    meta = json.load(open(os.path.join(DATA, "harvest-meta.json")))
    src_key = {s["id"]: s["id"][2:] for s in meta["sources"]}
    ok = bad = 0
    for sp in ("elk", "mule-deer", "whitetail", "pronghorn", "sheep", "turkey", "bear", "lion"):
        rows = json.load(open(os.path.join(DATA, "harvest", sp + ".json")))
        for r in rng.sample(rows, min(n, len(rows))):
            key = src_key[r["sourceId"]]
            txt = open(os.path.join(raw, key + ".txt"), encoding="utf-8", errors="replace").read()
            lines = txt.splitlines()
            if r.get("hunt"):
                needle = r["hunt"] if not r["hunt"].startswith("BHS") else r["hunt"][4:]
                cand = [l for l in lines if needle in l]
            elif sp in ("bear", "lion") and r["unit"].startswith("Zone"):
                z = r["unit"].split()[1]
                yr = r["year"]
                # restrict to that year's table
                start = next(i for i, l in enumerate(lines) if re.search(r"Mortality in New Mexico, %d" % yr, l))
                cand = [l for l in lines[start:start + 30] if re.match(r"\s*%s\s" % re.escape(z), l)][:1]
            elif sp == "turkey" and r["unit"] != "Statewide":
                u = "UNK" if r["unit"] == "Unknown GMU" else r["unit"]
                cand = [l for l in lines if re.match(r"\s*%s\**\s" % re.escape(u), l)]
            else:
                cand = [l for l in lines if "Total" in l or "TOTAL" in l or re.match(r"^\s*[\d,]+(\s+[\d,.%]+){6,}\s*$", l)]
            if sp in ("bear", "lion"):
                vals = [v for v in (r.get("harvestFemale"), r.get("harvestMale")) if v is not None]
            elif sp == "turkey":
                vals = [v for v in (r.get("hunters"), r.get("daysHunted"), r.get("harvest")) if v is not None]
                if r["unit"] == "Statewide":
                    vals = []
            else:
                vals = [v for v in (r.get("licenses"), r.get("hunters"), r.get("successPct"), r.get("harvestMale"),
                                    r.get("harvestFemale")) if v is not None]
                if sp == "sheep":
                    vals = [v for v in (r.get("licenses"), r.get("successPct"),
                                        r.get("harvestMale") if r.get("sex") != "female" else r.get("harvestFemale"))
                            if v is not None]
            hit = [l for l in cand if nums_in_order(l, vals)] if vals else []
            status = "OK " if hit else "?? "
            if hit:
                ok += 1
            else:
                bad += 1
            show = {k: r.get(k) for k in ("year", "unit", "hunt", "methodLabel", "licenses", "hunters", "harvest",
                                          "harvestMale", "harvestFemale", "successPct", "daysHunted") if r.get(k) is not None}
            print(f"{status}{sp} {key}: {json.dumps(show)}")
            for l in (hit or cand)[:3]:
                print("      raw| " + re.sub(r"\s+", " ", l.strip())[:170])
    print(f"auto-matched {ok}, needs manual look {bad}")


if __name__ == "__main__":
    main()
