#!/usr/bin/env python3
"""Verify src/data/agency/nevada/harvest/*.json against the raw NDOW documents.

Usage (from repo root, after harvest_download.py; needs `pdftotext` on PATH):
  python -I scripts/agency/nevada/harvest_verify.py <raw_dir> [--spot N] [--seed S]

Checks
  1. Every per-hunt workbook row is located in the matching NDOW PDF edition
     ("<Species> Harvest by Unit Group", pdftotext -layout) by unit group + season
     + the consecutive figures tags / hunters afield / successful hunters, and its
     success % agrees with the PDF's whole-percent figure.
  2. Prints N random rows with the raw PDF line for manual reading.
  3. Compares per-species statewide sums of tags and successful hunters with the
     Big Game Status Book Table 29 statewide tag/harvest history.
"""
import glob
import json
import os
import random
import re
import subprocess
import sys

REPO = "."
PDF_KEYS = {
    "mule-deer": ["Mule-Deer", "NR-Guided-Mule-Deer", "Junior-Mule-Deer"],
    "elk": ["Elk"],
    "pronghorn": ["Antelope"],
    "bear": ["Black-Bear", "Bear"],
    "goat": ["Mountain-Goat"],
    "moose": ["Moose"],
    "sheep": ["Desert-Bighorn", "California-Bighorn", "Rocky-Bighorn"],
}


def fmt(n):
    return f"{int(n):,}"


def pdf_lines(raw, year, sp):
    out = []
    for key in PDF_KEYS[sp]:
        for pdf in glob.glob(os.path.join(raw, f"{year}-{key}-Harvest-by-Unit*.pdf")):
            txt = os.path.join(raw, "txt", os.path.basename(pdf)[:-4] + ".txt")
            if not os.path.exists(txt):
                os.makedirs(os.path.dirname(txt), exist_ok=True)
                subprocess.run(["pdftotext", "-layout", pdf, txt], check=True, stderr=subprocess.DEVNULL)
            ls = [re.sub(r"\s+", " ", l).strip() for l in open(txt, encoding="utf-8", errors="replace")]
            out += ls
            # pdftotext wraps long season cells: the figures land on the next line
            out += [a + " " + b for a, b in zip(ls, ls[1:]) if re.match(r"^[\d,]+ ", b) and not re.search(r"\d+%", a)]
    return out


def find(rec, lines):
    m = re.match(r"^(.*) \((.*)\)$", rec["hunt"])
    season = m.group(2) if m else ""
    lic = rec.get("licenses")
    nums = [fmt(lic)] if lic is not None else []
    if rec["hunters"] is not None:
        nums.append(fmt(rec["hunters"]))
    if rec["harvest"] is not None:
        nums.append(fmt(rec["harvest"]))
    pat = re.compile(re.escape(rec["unit"]) + r" " + re.escape(season) + r" .*?\b" + r" ".join(nums) + r" ")
    hits = [l for l in lines if pat.search(l)]
    if rec["successPct"] is not None:
        want = f"{round(rec['successPct'] + 1e-9):d}%"  # PDFs print whole percents
        want2 = f"{int(rec['successPct'])}%"
        hits = [l for l in hits if re.search(r"\b(" + re.escape(want) + "|" + re.escape(want2) + r")", l.split(" ".join(nums), 1)[1])]
    return hits


def main():
    raw = sys.argv[1]
    nspot = int(sys.argv[sys.argv.index("--spot") + 1]) if "--spot" in sys.argv else 20
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 1
    data = {}
    for f in glob.glob(os.path.join(REPO, "src/data/agency/nevada/harvest/*.json")):
        data[os.path.basename(f)[:-5]] = json.load(open(f))

    # 1. full cross-check of workbook rows against PDF editions
    cache, missing, checked = {}, [], 0
    for sp, rows in data.items():
        if sp not in PDF_KEYS:
            continue
        for r in rows:
            if not r["sourceId"].startswith("h-nv-hunt-data-"):
                continue
            key = (r["year"], sp)
            if key not in cache:
                cache[key] = pdf_lines(raw, *key)
            if not cache[key]:
                missing.append((r, "no PDF edition downloaded"))
                continue
            checked += 1
            if not find(r, cache[key]):
                missing.append((r, "not found in PDF"))
    print(f"[1] workbook rows checked against PDF editions: {checked}; not matched: {len(missing)}")
    for r, why in missing[:200]:
        print("   ", why, r["year"], r["species"], r["unit"], "|", r["hunt"], r["residency"], r.get("methodLabel"),
              r.get("licenses"), r["hunters"], r["harvest"], r["successPct"])

    # 2. random spot checks
    rng = random.Random(seed)
    pool = [(sp, r) for sp, rows in data.items() for r in rows if r["sourceId"].startswith("h-nv-hunt-data-")]
    print(f"\n[2] {nspot} random spot checks (record -> raw PDF line)")
    for sp, r in rng.sample(pool, nspot):
        hits = find(r, cache.get((r["year"], sp)) or pdf_lines(raw, r["year"], sp))
        print(f" - {r['year']} {sp} unit={r['unit']!r} hunt={r['hunt']!r} res={r['residency']} weapon={r.get('methodLabel')} "
              f"tags={r.get('licenses')} afield={r['hunters']} harvest={r['harvest']} success={r['successPct']}")
        print(f"   PDF: {hits[0] if hits else 'NOT FOUND'}")

    # 3. statewide totals vs Status Book Table 29
    t29 = {}
    txt = os.path.join(raw, "txt", "Big-Game-Status-Book-2025.txt")
    on = False
    for l in open(txt, encoding="utf-8", errors="replace"):
        if "TABLE 29." in l:
            on = True
        if on and "TABLE 30." in l:
            break
        m = re.match(r"^\s*(?:A-61\s+)?(20(?:2[0-4]))\s+(.*)$", l) if on else None
        if m:
            vals = [int(v.replace(",", "")) for v in m.group(2).split()]
            t29[int(m.group(1))] = vals
    cols = ["mule-deer", "pronghorn", "elk", "sheep-desert", "sheep-california", "sheep-rocky", "goat", "moose"]
    print("\n[3] statewide sums of workbook rows vs Status Book Table 29 (tags / harvest)")
    for y in sorted(t29):
        v = t29[y]
        for i, c in enumerate(cols):
            if 2 * i + 1 >= len(v):
                continue
            sp = c.split("-")[0] if c.startswith("sheep") else c
            sub = c.split("-")[1] if c.startswith("sheep") else None
            rows = [r for r in data.get(sp, []) if r["year"] == y and r["sourceId"].startswith("h-nv-hunt-data-")]
            if sub:
                kw = {"desert": "Desert", "california": "California", "rocky": "Rocky"}[sub]
                rows = [r for r in rows if kw in r["hunt"]]
                if sub in ("desert", "california", "rocky"):
                    rows = [r for r in rows if not re.search(r"Ewe", r["hunt"])]
            tags = sum(r.get("licenses") or 0 for r in rows)
            hv = sum(r["harvest"] or 0 for r in rows)
            print(f"   {y} {c:17s} T29 tags {v[2*i]:>6} harvest {v[2*i+1]:>6} | rows tags {tags:>6} successful {hv:>6}")


if __name__ == "__main__":
    main()
