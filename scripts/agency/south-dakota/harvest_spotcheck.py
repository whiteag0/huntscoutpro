#!/usr/bin/env python3
"""Spot-check South Dakota harvest rows against the raw pdftotext output.

Usage: harvest_spotcheck.py <raw_dir> <repo_root> [n] [seed]
       n = 0 checks every row (prints only rows without a matching source line)

Picks n random rows (spread over species and years), finds the source line in the GFP text
the row was parsed from, prints both, and checks automatically that the row's copied numbers
(total harvest or GFP's all-deer total, success, days, licenses parts) appear as cells of that line.
The printed pairs are for a human re-read of every field.
"""
import json
import os
import random
import re
import sys

RAW, REPO = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 20
SEED = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
HD = os.path.join(REPO, "src/data/agency/south-dakota")
meta = json.load(open(os.path.join(HD, "harvest-meta.json")))
src = {s["id"]: s for s in meta["sources"]}


def path_for(sid):
    s = src[sid]
    if sid.startswith("h-gfp-bg-annual-"):
        return os.path.join(RAW, "annual", f"bg_annual_{s['dataYear']}.txt")
    name = s["url"].split("/")[-1][:-4].replace("%20", "_")
    if "web.archive.org" in s["url"]:
        return os.path.join(RAW, "wayback", "20260301145707_" + name + ".txt")
    return os.path.join(RAW, name + ".txt")


def fmt(v):
    if isinstance(v, float):
        return {f"{v}", f"{v:.1f}", f"{v:.2f}", f"{v}%", f"{v:.1f}%"}
    return {f"{v}", f"{v:,}", f"{v}%"}


TITLES = [  # methodLabel prefix -> table title (year is prefixed), checked in order
    ("Spring Prairie Turkey (firearm)", "Spring Prairie Turkey Harvest Projections"),
    ("Fall Prairie Turkey", "Fall Prairie Turkey Harvest Projections"),
    ("Spring Archery Turkey (statewide license) — harvest by unit", "Spring Archery Turkey Harvest Distribution"),
    ("Spring Mentored Youth Turkey (statewide license) — harvest by unit", "Spring Ment Youth Turkey Harvest Distribution"),
    ("Fall Mentored Youth Turkey (statewide license) — harvest by unit", "Fall Mentored Youth Turkey Harvest Distribution"),
    ("Firearm Antelope Landowner Own Land — harvest by unit", "Antelope LOL Harvest Distribution"),
    ("Firearm Antelope", "Firearm Antelope Harvest Projections"),
    ("Archery Antelope (statewide license) — harvest by unit", "Archery Antelope Harvest by Management Unit"),
    ("Special Antelope (statewide license) — harvest by unit", "Special Antelope Harvest by Management Unit"),
    ("Mentored Youth Antelope (statewide license) — harvest by unit", "Mentored Antelope Harvest Distribution"),
    ("Archery Elk", "Archery Elk Harvest Projections"),
    ("Black Hills Firearm Elk", "Black Hills Firearm Elk Harvest Projections"),
    ("Prairie Firearm Elk", "Prairie Firearm Elk Harvest Projections"),
    ("Landowner Own Land Prairie Elk", "Landowner Prairie Elk Harvest Projections"),
    ("West River Firearm Deer", "West River Deer Harvest Projections"),
    ("East River Firearm Deer", "East River Deer Harvest Projections"),
    ("Black Hills Firearm Deer", "Black Hills Deer Harvest Projections"),
    ("West River Landowner Own Land Deer — harvest by unit", "West River LOL Harvest Distribution"),
    ("East River Landowner Own Land Deer — harvest by unit", "East River LOL Harvest Distribution"),
    ("West River Landowner Own Land Deer", "West River Landowner Own Land Harvest Projections"),
    ("East River Landowner Own Land Deer", "East River Landowner Own Land Harvest Projections"),
    ("Black Hills Landowner Own Land Deer", "Black Hills Landowner Own Land Harvest Projections"),
    ("West River Special Buck Deer — harvest by unit", "West River Special Buck Harvest Distribution"),
    ("East River Special Buck Deer — harvest by unit", "East River Special Buck Harvest Distribution"),
    ("West River Special Buck Deer", "West River Special Buck Harvest Projections"),
    ("East River Special Buck Deer", "East River Special Buck Harvest Projections"),
    ("Archery Deer — nonresident license types", "Nonresident Archery Deer Harvest Projections"),
    ("Archery Deer — harvest by unit|resident", "Resident Archery Deer Harvest Dist"),
    ("Archery Deer — harvest by unit|nonresident", "Nonresident Archery Deer Harvest Dist"),
    ("Archery Deer — harvest by unit", "Archery Deer Harvest Distribution by Management Unit"),
    ("Archery Deer", "Archery Deer Harvest Projections"),
    ("Muzzleloader Deer — harvest by unit", "Muzzleloader Deer Harvest Distribution"),
    ("Muzzleloader Deer", "Muzzleloader Deer Harvest Projections"),
    ("Apprentice Deer — harvest by unit", "Apprentice Deer Harvest Distribution"),
    ("Apprentice Deer (statewide license)", "Apprentice Deer Harvest Projections"),
    ("Youth Deer — harvest by unit", "Youth Deer Harvest Distribution"),
    ("Youth Deer (statewide license)", "Youth Deer Harvest Projections"),
    ("Mentored Youth Deer — harvest by unit", "Mentored Youth Deer Harvest Distribution"),
    ("Mentored Youth Deer (statewide license)", "Mentored Youth Deer Harvest Projections"),
    ("Free Landowner Own Land Antlerless Deer — harvest by unit", "Antlerless LOL Harvest Distribution"),
    ("National Wildlife Refuge Deer", "Refuge Deer Harvest Projections"),
]
TREND_TITLES = [
    ("Custer State Park / Dog Access", "in the Dog Access Permit Area"),
    ("Black Hills Mountain Lion", "Black Hills Mountain Lion seasons"),
    ("Bighorn Sheep (any ram) — Custer", "Custer State Park Bighorn Sheep seasons"),
    ("Bighorn Sheep (any ram) — Black Hills", "Black Hills Bighorn Sheep seasons"),
    ("Custer State Park Archery Elk", "CSP Archery elk seasons"),
    ("Custer State Park Firearm Any Elk", "CSP Firearm Any elk seasons"),
    ("Archery Elk", "Archery Elk seasons"),
    ("Black Hills Firearm Elk", "Black Hills Firearm Elk seasons"),
    ("Prairie Firearm Elk", "Prairie Firearm Elk seasons"),
    ("National Wildlife Refuge Deer", "National Wildlife Refuge"),
]


def find_line(r, lines):
    year, hunt, unit, label = r["year"], r.get("hunt"), r["unit"], r.get("methodLabel", "")
    is_row = bool(hunt) or "harvest by unit" in label or label.startswith("Fall Prairie Turkey") and unit != "Statewide" \
        or label == "National Wildlife Refuge Deer" and hunt
    if is_row:
        title = None
        for pre, t in TITLES:
            p, _, res = pre.partition("|")
            if label.startswith(p) and (not res or r.get("residency") == res):
                title = t
                break
        if hunt and r["species"] == "turkey":  # GFP prints turkey unit and license type in separate cells
            u, ty = hunt.split("-")
            key = re.compile(rf"^\s*{re.escape(u)}\s+{ty}\s")
        elif hunt:
            key = re.compile(rf"^\s*(?:.*?)?{re.escape(hunt)}\s")
        elif unit.endswith("County") or not re.match(r"^[0-9A-Z,]+$", unit):
            key = re.compile(rf"^\s*{re.escape(unit)}\s")
        else:
            key = re.compile(rf"^\s*{re.escape(unit)}\s+\(|^\s*.*\s{re.escape(unit)}\s+\d")
        out, on = [], False
        for l in lines:
            if re.match(rf"^\s*{year} .*{re.escape(title)}", l):
                on = True
                continue
            if on and re.match(r"^\s*(TOTALS|Totals|Use these figures)", l):
                on = False
            if on and key.match(l):
                out.append(l)
        return out
    # season row: line starting with the year inside the matching comparison table
    tt = next((t for pre, t in TREND_TITLES if label.startswith(pre)), None)
    pat = rf"^\s*{year - 1}/{str(year)[2:]}\s" if r["species"] == "lion" else rf"^\s*{year}\s"
    if r["species"] == "whitetail" and label == "National Wildlife Refuge Deer":
        tt = r["unitName"]
    out, on = [], tt is None
    for l in lines:
        if tt and tt in l:
            on = True
            continue
        if on and re.match(pat, l):
            out.append(l)
            if tt:
                break
    return out


def expected(r):
    exp = []
    note = r.get("note", "")
    m = re.search(r"total deer harvest (\d+)", note) or re.search(r"all deer (\d+)\.", note)
    if m:
        exp.append(int(m.group(1)))
        m2 = re.search(r"GFP [a-z ]*success ([\d.]+)%", note)
        if m2:
            exp.append(float(m2.group(1)) if "." in m2.group(1) else int(m2.group(1)))
    elif r["species"] not in ("lion",) and r.get("harvest") is not None and "Harvest =" not in note:
        exp.append(r["harvest"])
    if r.get("successPct") is not None and not r.get("successComputed"):
        exp.append(r["successPct"])
    for a in re.findall(r"Licenses sold (\d+) resident \+ (\d+) nonresident", note):
        exp += [int(a[0]), int(a[1])]
    return exp


def main():
    rows = []
    for f in sorted(os.listdir(os.path.join(HD, "harvest"))):
        rows += json.load(open(os.path.join(HD, "harvest", f)))
    rnd = random.Random(SEED)
    by = {}
    for r in rows:
        by.setdefault((r["species"], r["year"]), []).append(r)
    keys = sorted(by)
    rnd.shuffle(keys)
    picks = []
    if N == 0:
        picks = rows
    while N and len(picks) < N:
        for k in keys:
            if len(picks) >= N:
                break
            picks.append(rnd.choice(by[k]))
    bad = 0
    for r in picks:
        lines = open(path_for(r["sourceId"]), encoding="utf-8").read().split("\n")
        cands = find_line(r, lines)
        exp = expected(r)
        ok_line = None
        for c in cands:
            cells = set(re.split(r"\s+", c.strip()))
            if all(any(t in cells for t in fmt(e)) for e in exp):
                ok_line = c
                break
        status = "OK " if ok_line else "???"
        if not ok_line:
            bad += 1
        elif N == 0:
            continue
        print(f"{status} {r['species']} {r['year']} unit={r['unit']} hunt={r.get('hunt')} res={r.get('residency')} | {r.get('methodLabel')}")
        print(f"     row: harvest={r.get('harvest')} M={r.get('harvestMale')} F={r.get('harvestFemale')} hunters={r.get('hunters')} "
              f"succ={r.get('successPct')} lic={r.get('licenses')} days={r.get('daysHunted')} src={r['sourceId']}")
        print(f"     src: {(ok_line or (cands[0] if cands else 'NOT FOUND')).strip()[:230]}")
        print(f"     checked cells: {exp}")
    print(f"{len(picks)} rows checked, {bad} without a matching source line")


if __name__ == "__main__":
    main()
