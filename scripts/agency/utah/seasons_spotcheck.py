#!/usr/bin/env python3
"""Spot-check Utah seasonRanges, key dates and seasons against the raw UDWR documents.

Usage:
  python -I scripts/agency/utah/seasons_spotcheck.py <repo_root> <raw_utah_dir> [n] [seed]

<raw_utah_dir> is agency-raw/utah, holding draw/api/2026_*.json (UDWR draw-odds JSON, from draw_fetch.py) and
seasons/ (guidebook PDFs converted with `pdftotext -layout` to .txt, wildlife.utah.gov pages converted to .txt).
The checks avoid seasons_ranges.py's code path:
  A. n random rows with seasonRanges vs the raw draw-odds JSON (SeasonWeapons start/end/weapon read directly).
  B. n random rows vs the 2026 guidebook hunt tables (dates printed as "Sept. 12-Nov. 10" next to the hunt
     number, converted here with a separate month-name parser).
  C. every 2027 key date and every season in draw-meta.json: the date, written the way UDWR prints it,
     must appear in the cited document's text.
"""
import glob
import json
import os
import random
import re
import sys

MON = {"jan": 1, "feb": 2, "march": 3, "mar": 3, "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
       "aug": 8, "sept": 9, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
MNAME = {1: ["Jan."], 2: ["Feb."], 3: ["March"], 4: ["April"], 5: ["May"], 6: ["June"], 7: ["July"], 8: ["Aug."],
         9: ["Sept."], 10: ["Oct."], 11: ["Nov."], 12: ["Dec."]}
DASH = "[–—-]"
RANGE = re.compile(r"(Jan|Feb|March|Mar|April|Apr|May|June|July|Aug|Sept|Sep|Oct|Nov|Dec)\.? (\d{1,2})(?:, (\d{4}))?"
                   + DASH + r"(?:(Jan|Feb|March|Mar|April|Apr|May|June|July|Aug|Sept|Sep|Oct|Nov|Dec)\.? )?(\d{1,2})(?:, (\d{4}))?")
CODE = re.compile(r"\b([A-Z]{2}\d{4})\b")


def gb_ranges(line, year):
    out = []
    for m1, d1, y1, m2, d2, y2 in RANGE.findall(line):
        a_m, b_m = MON[m1.lower()], MON[(m2 or m1).lower()]
        ay = int(y1) if y1 else None
        by = int(y2) if y2 else None
        if ay is None:
            ay = year if not by else (by if (a_m, int(d1)) <= (b_m, int(d2)) else by - 1)
        if by is None:
            by = ay if (b_m, int(d2)) >= (a_m, int(d1)) else ay + 1
        out.append((f"{ay:04d}-{a_m:02d}-{int(d1):02d}", f"{by:04d}-{b_m:02d}-{int(d2):02d}"))
    return out


def printed(iso):
    """Ways UDWR prints a date: 'Nov. 10, 2026', 'Nov. 10', 'NOV. 10' etc."""
    y, m, d = int(iso[:4]), int(iso[5:7]), int(iso[8:])
    out = []
    for n in MNAME[m] + ([MNAME[m][0].rstrip(".")] if m in (9,) else []):
        out += [f"{n} {d}, {y}", f"{n} {d}"]
    return out


def main(repo, raw, n=30, seed=20261031):
    rnd = random.Random(seed)
    base = os.path.join(repo, "src/data/agency/utah")
    rows = []
    for f in sorted(glob.glob(os.path.join(base, "draw", "*.json"))):
        rows += [r for r in json.load(open(f)) if r.get("seasonRanges")]
    fails = []

    # A. raw draw-odds JSON
    api = {}
    for f in glob.glob(os.path.join(raw, "draw", "api", "2026_*.json")):
        for h in json.load(open(f))["Data"]:
            api[h["HuntCode"]] = h
    sample = rnd.sample(rows, n)
    ok = 0
    for r in sample:
        h = api[r["huntCode"]]
        want = [(s["SeasonStartDate"][:10], s["SeasonEndDate"][:10], None if s.get("WeaponName") in (None, "", "No Weapon") else s["WeaponName"])
                for s in h["SeasonWeapons"] if not s.get("UnCertainDateRange")]
        got = [(g["start"], g["end"], g.get("label")) for g in r["seasonRanges"]]
        if got == want:
            ok += 1
        else:
            fails.append(("A", r["huntCode"], got, want))
    print(f"A. raw draw-odds JSON: {ok}/{len(sample)} rows match exactly ({sum(len(r['seasonRanges']) for r in sample)} segments)")

    # B. guidebook hunt tables
    lines = []
    for name in ("biggameapp.txt", "antlerless_guidebook.txt", "bear_guide.txt", "turkey_guide.txt"):
        lines += open(os.path.join(raw, "seasons", name), encoding="utf-8").read().split("\n")
    by_code = {}
    for i, ln in enumerate(lines):
        for c in CODE.findall(ln):
            by_code.setdefault(c, []).append(i)
    cand = [r for r in rows if r["huntCode"] in by_code]
    sample = rnd.sample(cand, min(n, len(cand)))
    ok = skipped = 0
    for r in sample:
        i = by_code[r["huntCode"]][0]
        gb = gb_ranges(lines[i], r["year"])
        if not gb:
            skipped += 1
            print(f"   B skip {r['huntCode']}: no date on table line: {lines[i].strip()[:90]}")
            continue
        got = {(g["start"], g["end"]) for g in r["seasonRanges"]}
        if set(gb) <= got:
            ok += 1
        else:
            fails.append(("B", r["huntCode"], sorted(got), gb, lines[i].strip()))
    print(f"B. 2026 guidebook hunt tables: {ok}/{len(sample) - skipped} rows match ({skipped} lines without a printed date skipped)")

    # C. key dates (2027 cycle) and seasons vs cited text
    meta = json.load(open(os.path.join(base, "draw-meta.json")))
    txt = {
        "d-news-sportsman-2027": "sportsman.txt", "d-sportsman-page-2027": "p_sportsmanpermits.txt",
        "d-turkey-guide-2026-27": "turkey_guide.txt", "d-bg-guide-2026": "biggameapp.txt",
        "d-bear-guide-2026": "bear_guide.txt", "d-field-regs-2026": "field_regs.txt",
    }
    cache = {k: re.sub(r"\s+", " ", open(os.path.join(raw, "seasons", v), encoding="utf-8").read()).replace("–", "-")
             for k, v in txt.items()}
    checked = ok = 0
    seen = set()
    items = []
    for sp in meta["species"]:
        for d in sp["keyDates"]:
            if d["cycle"] == 2027:
                items.append(("kd", d["label"], d["sourceId"], [d.get("date"), d.get("start"), d.get("end")]))
    ranges_in = {}
    for s in meta["seasons"]:
        key = (s["sourceId"], s["year"])
        if key not in ranges_in:
            ranges_in[key] = set(gb_ranges(cache[s["sourceId"]], s["year"]))
        if (s["start"], s["end"]) in ranges_in[key]:
            checked += 1
            ok += 1  # the whole range is printed as one "Mon. D-[Mon.] D[, YYYY]" span
            continue
        items.append(("season", s["label"], s["sourceId"], [s["start"], s["end"]]))
    for kind, label, sid, dates in items:
        for iso in [x for x in dates if x]:
            key = (sid, iso)
            if key in seen:
                continue
            seen.add(key)
            checked += 1
            t = cache[sid]
            if iso.endswith("-01-01") and "Year-round" in t and "cougar" in label.lower() or iso.endswith("-12-31") and "Year-round" in t and "cougar" in label.lower():
                ok += 1
                continue
            pats = printed(iso)
            if any(p in t for p in pats) or any(p.upper() in t for p in pats):
                ok += 1
            else:
                fails.append(("C", kind, label, sid, iso))
    print(f"C. key dates (2027) and seasons: {ok}/{checked} checks passed (season ranges printed as one span, or each date printed in the cited text)")

    # D. bear harvest-objective units: unit name and its date on the same/adjacent line of the hunt table
    meta_ho = [s for s in meta["seasons"] if s["species"] == "bear" and s.get("units")]
    bl = open(os.path.join(raw, "seasons", "bear_guide.txt"), encoding="utf-8").read().split("\n")
    a = next(i for i, l in enumerate(bl) if l.startswith("Harvest-objective hunts") and "(continued)" not in l and i > 3000)
    table = bl[a:a + 80]
    pairs = ok = 0
    for s in meta_ho:
        for u in s["units"]:
            pairs += 1
            hit = False
            for i, l in enumerate(table):
                if l.strip().startswith(u + " ") or l.strip() == u:
                    near = " ".join(table[max(0, i - 1):i + 2]).replace("–", "-")
                    if any(p in near for p in printed(s["start"])[1::2]):
                        hit = True
            ok += hit
            if not hit:
                fails.append(("D", u, s["start"]))
    print(f"D. bear harvest-objective unit/date pairs: {ok}/{pairs} found in the hunt table")

    for f in fails:
        print("MISMATCH", f)
    return 1 if fails else 0


if __name__ == "__main__":
    a = sys.argv
    sys.exit(main(a[1], a[2], int(a[3]) if len(a) > 3 else 30, int(a[4]) if len(a) > 4 else 20261031))
