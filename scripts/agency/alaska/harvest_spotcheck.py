#!/usr/bin/env python3
"""Spot-check Alaska harvest JSON rows against the raw ADF&G pages, independently of harvest_parse.py.

Reads each sampled row's raw table with pandas.read_html (a different table reader from the
parser's BeautifulSoup walk) and compares hunters / harvest / male / female / permits / percent.

Usage:
  python -I scripts/agency/alaska/harvest_spotcheck.py <raw_dir> <repo_root> [n=40] [seed=7]
"""
import io
import json
import os
import random
import sys

import pandas as pd

SP_CODE = {"moose": ("M", "Moose"), "sheep": ("S", "Sheep"), "goat": ("G", "Goat"), "elk": ("E", "Elk")}
BEAR_T = {"General season": "g", "Drawing": "d", "Registration": "r", "Tier II": "t"}


def tables(path):
    return pd.read_html(io.StringIO(open(path, encoding="utf-8", errors="replace").read()), flavor="lxml")


def n(v):
    return int(str(v).replace(",", "").strip())


def table_330(path):
    t = tables(path)[0]
    out = {}
    for _, r in t.iterrows():
        vals = list(r.values)
        unit = "" if pd.isna(vals[0]) else str(vals[0])
        if unit == "Unit":
            continue
        out["Statewide" if unit == "Total" else unit] = vals
    return out


def table_130(path):
    t = tables(path)[0]
    out = {}
    mtn = "Mtn" in [str(c) for c in t.columns]
    for _, r in t.iterrows():
        vals = list(r.values)
        unit = "" if pd.isna(vals[0]) else str(vals[0])
        unit = "Statewide" if unit == "Overall Total" else unit
        if mtn:  # pandas repeats the colspan=2 "Overall Total" cell, so values start at column 2 here too
            m, f = n(vals[2]), n(vals[4])
        else:
            m, f = n(vals[1]), n(vals[3])
        a = out.setdefault(unit, [0, 0])
        a[0] += m
        a[1] += f
    return out


def check_gr(raw, r):
    code, _ = SP_CODE[r["species"]]
    y = r["year"]
    if r.get("hunt"):
        p = os.path.join(raw, "hunts", f"gr_{code}_{y}_330_{r['hunt']}.html")
    else:
        p = os.path.join(raw, f"gr_{code}_{y}_330.html")
    row = table_330(p)[r["unit"]]
    res = r.get("residency", "all")
    if res == "all":
        exp_h, exp_k = n(row[15]), n(row[7])
    elif res == "resident":
        exp_h, exp_k = n(row[1]) + n(row[8]), n(row[1])
    else:
        exp_h, exp_k = n(row[3]) + n(row[10]), n(row[3])
    errs = []
    if r["hunters"] != exp_h:
        errs.append(f"hunters {r['hunters']} != {exp_h}")
    if r["harvest"] != exp_k:
        errs.append(f"harvest {r['harvest']} != {exp_k}")
    if "harvestMale" in r:
        sx = table_130(os.path.join(raw, f"gr_{code}_{y}_130.html"))[r["unit"]]
        if [r["harvestMale"], r["harvestFemale"]] != sx:
            errs.append(f"sex {r['harvestMale']},{r['harvestFemale']} != {sx}")
    return p, f"raw row: {' | '.join(str(v) for v in row)}", errs


def check_deer(raw, r):
    p = os.path.join(raw, f"deer_{r['year']}.html")
    t = [x for x in tables(p) if "GMU" in " ".join(map(str, x.columns))][0]
    t.columns = ["GMU", "hunters", "male", "female", "total", "dph"]
    row = t[t["GMU"] == r["unit"]].iloc[0]
    errs = []
    for k, col in (("hunters", "hunters"), ("harvestMale", "male"), ("harvestFemale", "female"), ("harvest", "total")):
        if r[k] != n(row[col]):
            errs.append(f"{k} {r[k]} != {row[col]}")
    if f"Deer per hunter {row['dph']} " not in r["note"]:
        errs.append(f"deer/hunter {row['dph']} not in note")
    return p, f"raw row: {list(row.values)}", errs


def check_bear(raw, r):
    t = next(v for k, v in BEAR_T.items() if r["methodLabel"].startswith(k))
    p = os.path.join(raw, f"bb_{r['year']}_{t}.html")
    tb = [x for x in tables(p) if x.shape[1] == 7][0]
    row = [list(v) for v in tb.values if str(v[0]) == r["hunt"]][0]
    exp = {"licenses": n(row[1]), "hunters": n(row[2]), "harvestMale": n(row[3]), "harvestFemale": n(row[4]), "harvest": n(row[5]), "successPct": n(str(row[6]).rstrip("%"))}
    errs = [f"{k} {r[k]} != {v}" for k, v in exp.items() if r[k] != v]
    return p, f"raw row: {row}", errs


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    k = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    rnd = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 7)
    d = os.path.join(repo, "src/data/agency/alaska/harvest")
    rows = []
    for f in sorted(os.listdir(d)):
        rows += json.load(open(os.path.join(d, f)))
    by = {}
    for r in rows:
        by.setdefault(r["species"], []).append(r)
    sample = []
    for sp, rs in sorted(by.items()):
        sample += rnd.sample(rs, min(len(rs), max(3, k * len(rs) // len(rows))))
    bad = 0
    for r in sample:
        if r["species"] in SP_CODE:
            p, raw_txt, errs = check_gr(raw, r)
        elif r["species"] == "mule-deer":
            p, raw_txt, errs = check_deer(raw, r)
        else:
            p, raw_txt, errs = check_bear(raw, r)
        tag = "OK  " if not errs else "FAIL"
        bad += bool(errs)
        print(f"{tag} {r['species']} {r['year']} unit={r['unit']} hunt={r.get('hunt', '-')} res={r.get('residency', '-')} hunters={r['hunters']} harvest={r['harvest']} M/F={r.get('harvestMale')}/{r.get('harvestFemale')} | {os.path.basename(p)} | {raw_txt[:160]}")
        for e in errs:
            print("      ", e)
    print(f"{len(sample)} rows checked, {bad} mismatches")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
