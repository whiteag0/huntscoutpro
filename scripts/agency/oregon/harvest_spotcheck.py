#!/usr/bin/env python3
"""Spot-check helper: sample random Oregon harvest rows and print, next to each,
the matching lines of the raw report text (pdftotext -layout; pdfplumber layout
text for the 2024 reports, whose pdftotext output is column-scrambled) so a human
can confirm every field.

Usage: python -I harvest_spotcheck.py <raw_dir> <repo_root> [n] [seed]
"""
import json
import os
import random
import re
import sys

raw, repo = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 18
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 20261031
meta = json.load(open(os.path.join(repo, "src/data/agency/oregon/harvest-meta.json")))
src = {s["id"]: s for s in meta["sources"]}
manifest = {m["url"].replace(" ", "%20"): m for m in json.load(open(os.path.join(raw, "manifest.json")))}
rng = random.Random(seed)
species = ["elk", "mule-deer", "whitetail", "pronghorn", "bear", "sheep", "goat", "lion", "turkey"]
picks = []
for i in range(n):
    sp = species[i % len(species)]
    rows = json.load(open(os.path.join(repo, f"src/data/agency/oregon/harvest/{sp}.json")))
    picks.append(rng.choice(rows))
for r in picks:
    s = src[r["sourceId"]]
    m = manifest.get(s["url"])
    if m:
        base = os.path.join(raw, m["file"][:-4])
    elif r["species"] == "turkey" and "turkey-spring" in r["sourceId"]:
        base = os.path.join(raw, f"{r['year']}_turkey")
    else:
        base = None
    print("=" * 100)
    print(json.dumps(r))
    if base is None:
        print("  (statewide line from a staff summary; check by hand)")
        continue
    path = base + (".pl.txt" if r["year"] == 2024 and r["species"] != "turkey" else ".txt")
    lines = open(path).read().split("\n")
    key = r.get("hunt") or ""
    pat = re.escape(key.split()[0]) if key else None
    name = (r.get("unitName") or "").split()[0] if r.get("unitName") else None
    hits = [i for i, ln in enumerate(lines) if (pat and re.search(r"(^|\s)" + pat + r"(\s|$)", ln)) or
            (not pat and r["unit"] == "Statewide" and "Grand" in ln) or
            (not pat and name and re.search(r"\b" + re.escape(name) + r"\b", ln))]
    nm = r.get("unitName", "").split()[0] if r.get("unitName") else ""
    shown = 0
    for i in hits:
        ctx = "\n".join(lines[max(0, i - 6): i + 1])
        if nm and nm not in ctx and r["unit"] != "Statewide" and r["species"] not in ("sheep", "goat"):
            continue
        print(f"  {os.path.basename(path)}:{i + 1}: {re.sub(r' +', ' ', lines[i]).strip()[:200]}")
        shown += 1
        if shown >= 4:
            break
