#!/usr/bin/env python3
"""Spot-check Idaho season data against the raw IDFG documents by a different method than the parsers:
`pdftotext -layout` text and plain regex (the parsers use pdfplumber tables), and per-row lookups in the raw
Hunt Planner JSON (the parser groups rows).

Usage: python -I seasons_spotcheck.py <repo_root> <raw_seasons_dir> <raw_draw_dir> [n_per_group] [seed]
  raw_draw_dir = agency-raw/idaho/draw (Hunt Planner list JSON draw_build.py used)
Prints every check and exits 1 on any mismatch.
"""
import datetime as dt
import glob
import json
import os
import random
import re
import subprocess
import sys

MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
RANGE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.? ?(\d{1,2})\s*[-–]\s*"
                   r"(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.? ?(\d{1,2})\b")
fails = []
checks = 0


def text(pdf):
    txt = pdf[:-4] + ".layout.txt"
    if not os.path.exists(txt):
        subprocess.run(["pdftotext", "-layout", pdf, txt], check=True, stderr=subprocess.DEVNULL)
    with open(txt, encoding="utf-8", errors="replace") as fh:
        return fh.read().split("\n")


def md(m):
    """regex match groups -> ((month, day), (month, day))"""
    a, b, c, d = m
    return (MON[a[:3].lower()], int(b)), (MON[c[:3].lower()], int(d))


def iso_md(s):
    y, m, d = s.split("-")
    return int(m), int(d)


def ok(cond, what):
    global checks
    checks += 1
    print(("OK   " if cond else "FAIL ") + what)
    if not cond:
        fails.append(what)


def ranges_on(lines, i, j):
    return [md(m) for ln in lines[max(0, i):j] for m in RANGE.findall(ln)]


def hunt_line_ranges(lines, hunt):
    """Date ranges printed after `hunt` on its line, up to the next 4-digit hunt number on that line."""
    out = []
    for ln in lines:
        for m in re.finditer(rf"(?<!\d){hunt}(?!\d)", ln):
            rest = ln[m.end():]
            nxt = re.search(r"(?<![\d-])[3-9]\d{3}(?![\d-])", rest)
            seg = rest[:nxt.start()] if nxt else rest
            out += [md(x) for x in RANGE.findall(seg)]
    return out


def hunt_window_ranges(lines, hunt, before=3, after=4):
    out = []
    for i, ln in enumerate(lines):
        if re.match(rf"\s*{hunt}\s", ln):
            out += ranges_on(lines, i - before, i + after)
    return out


def main():
    repo, raw, rawdraw = sys.argv[1:4]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    rnd = random.Random(int(sys.argv[5]) if len(sys.argv) > 5 else 20261031)
    ddir = os.path.join(repo, "src/data/agency/idaho/draw")
    rows = []
    for f in sorted(glob.glob(os.path.join(ddir, "*.json"))):
        with open(f, encoding="utf-8") as fh:
            rows += json.load(fh)
    meta = json.load(open(os.path.join(repo, "src/data/agency/idaho/draw-meta.json"), encoding="utf-8"))

    # 1. Rows filled from brochures (seasonSourceId set to a brochure): pdftotext line text.
    pdf_for = {"d-rules-msg-2025-26": "seasons-rules-moose-sheep-goat-2025-26.pdf",
               "d-rules-big-game-2021": "wb-seasons-rules-big-game-2021.pdf", "d-rules-big-game-2022": "wb-seasons-rules-big-game-2022.pdf",
               "d-rules-big-game-2023": "wb-seasons-rules-big-game-2023-2024.pdf", "d-rules-big-game-2024": "wb-seasons-rules-big-game-2024.pdf",
               "d-rules-big-game-2025": "wb-seasons-rules-big-game-2025.pdf", "d-rules-big-game-2026": "seasons-rules-big-game-2026.pdf",
               "d-rules-upland-2024-25": "wb-seasons-rules-upland-game-2024-2025.pdf",
               "d-rules-upland-2026-27": "seasons-rules-upland-game-2026-2027.pdf"}
    texts = {}
    filled = [r for r in rows if r.get("seasonSourceId") in pdf_for]
    print(f"== brochure-dated rows: {len(filled)}; checking {min(len(filled), 2 * n)}")
    for r in rnd.sample(filled, min(len(filled), 2 * n)):
        sid = r["seasonSourceId"]
        lines = texts.setdefault(sid, text(os.path.join(raw, pdf_for[sid])))
        want = [(iso_md(g["start"]), iso_md(g["end"])) for g in r["seasonRanges"]]
        got = hunt_line_ranges(lines, r["huntCode"])
        if "upland" in sid:
            got += hunt_window_ranges(lines, r["huntCode"])
        # bear spring hunts appear in two editions' worth of tables only once per edition; one line per hunt here
        ok(all(w in got for w in want), f"{r['species']} {r['year']} {r['huntCode']} {r['seasonDates']} in {pdf_for[sid]} (found {sorted(set(got))[:6]})")

    # 2. Rows dated from the Hunt Planner list: per-row lookup in the raw list JSON.
    lists = {}
    for f in glob.glob(os.path.join(rawdraw, "list", "list_g*.json")):
        with open(f) as fh:
            for x in json.load(fh).get("rows") or []:
                lists.setdefault(str(x["number"]), []).append(x)
    hp = [r for r in rows if r.get("seasonSourceId") == "d-huntlist"]
    print(f"== Hunt Planner-dated rows: {len(hp)}; checking {n}")

    def mdy(s):
        m, d, y = (int(v) for v in s.split("/"))
        return dt.date(2000 + y, m, d).isoformat()
    for r in rnd.sample(hp, n):
        cands = lists.get(r["huntCode"], [])
        segs = {(mdy(x["open"]), mdy(x["close"])) for x in cands}
        want = {(g["start"], g["end"]) for g in r["seasonRanges"]}
        ok(want <= segs, f"{r['species']} {r['year']} {r['huntCode']} {r['seasonDates']} in Hunt Planner list rows for hunt {r['huntCode']}")

    # 3. seasons[]: deer/elk against raw Hunt Planner general lists (row filter) and the 2026 brochure text;
    #    bear/lion/turkey against brochure text.
    gl = {}
    for g in (1, 2):
        with open(os.path.join(raw, f"list_g{g}_t1_2026.json")) as fh:
            gl[g] = json.load(fh)["rows"]
    bg26 = text(os.path.join(raw, "seasons-rules-big-game-2026.pdf"))
    bg25 = text(os.path.join(raw, "wb-seasons-rules-big-game-2025.pdf"))
    upl = text(os.path.join(raw, "seasons-rules-upland-game-2026-2027.pdf"))
    seas = meta["seasons"]
    by = {}
    for s in seas:
        by.setdefault(s["species"], []).append(s)
    print(f"== seasons[]: {len(seas)} entries")
    meth = {"all": "Any Weapon", "archery": "Archery", "muzzleloader": "Muzzleloader", "other": "Short-Range Weapons"}
    for sp, g in (("mule-deer", 1), ("whitetail", 1), ("elk", 2)):
        for s in rnd.sample(by[sp], min(len(by[sp]), max(4, n // 2))):
            m = re.match(r"(General [A-Za-z -]+?) (?:deer|elk), (.+?): (?:[A-Za-z -]+, )?(.+)$", s["label"])
            season, tag, orn = m.groups()
            hit = [x for x in gl[g] if x["season"] == season and x["tag"] == tag and x["ornament"] == orn and x["method"] == meth[s["method"]]
                   and mdy(x["open"]) == s["start"] and mdy(x["close"]) == s["end"]]
            raw_units = set()
            for x in hit:
                mm = re.fullmatch(r"Units? ([0-9A-C, ]+(?: and [0-9]+[A-C]?)?)", x["area"])
                raw_units |= set(re.split(r",\s*|\s+and\s+", mm.group(1).strip())) if mm else {x["area"]}
            covered = set(s["units"]) == raw_units
            ok(bool(hit) and covered, f"seasons {sp} '{s['label']}' {s['start']}..{s['end']} units {s['units'][:6]} = {len(hit)} raw Hunt Planner rows")
            # cross-publication: the same dates are printed in the 2026 brochure's general deer/elk pages
            a, b = iso_md(s["start"]), iso_md(s["end"])
            pages = bg26[:3330]  # deer + elk general season sections (before controlled hunt tables end)
            found = any((a, b) == md(x) for ln in pages for x in RANGE.findall(ln))
            ok(found, f"   ...and '{s['start'][5:]}..{s['end'][5:]}' appears in the 2026 brochure deer/elk pages")
    for s in rnd.sample(by["bear"], min(len(by["bear"]), n)):
        lines = bg25 if s["sourceId"] == "d-rules-big-game-2025" else bg26
        a, b = iso_md(s["start"]), iso_md(s["end"])
        unit = s["units"][0]
        hits = []
        for i, ln in enumerate(lines):
            if re.match(rf"\s*{re.escape(unit)}(,|\s{{2,}}|$)", ln) or re.search(rf"\s{re.escape(unit)},", ln[:30]):
                hits += ranges_on(lines, i - 2, i + 3)
        ok((a, b) in hits, f"seasons bear {s['year']} {s['start']}..{s['end']} unit {unit} in {s['sourceId']} text")
    lion = by["lion"][0]
    ok(sum(1 for ln in bg26 if re.search(r"July 1\s*-\s*June 30", ln)) >= 30, "seasons lion: 'July 1 - June 30' printed for >=30 unit rows")
    for s in rnd.sample(by["turkey"], min(len(by["turkey"]), max(4, n // 2))):
        a, b = iso_md(s["start"]), iso_md(s["end"])
        found = any((a, b) == md(x) for ln in upl[1430:1500] for x in RANGE.findall(ln))
        ok(found, f"seasons turkey {s['year']} '{s['label']}' {s['start'][5:]}..{s['end'][5:]} in upland p.22 text")

    # 4. Every 2027 key date: its date text is in the cited document.
    sup = text(os.path.join(raw, "seasons-rules-big-game-supplemental-proclamation-2027.pdf"))
    docs = {"d-nr-supplement-2027": sup, "d-rules-big-game-2026": bg26, "d-rules-upland-2026-27": upl}
    seen = set()
    for spi in meta["species"]:
        for d in spi["keyDates"]:
            if d["cycle"] != 2027:
                continue
            key = (d["label"], d.get("date"), d.get("start"))
            if key in seen:
                continue
            seen.add(key)
            body = re.sub(r"\s+", " ", " ".join(docs[d["sourceId"]]))
            months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
            pats = []
            for k in ("date", "start", "end"):
                if d.get(k):
                    y, m, dd = (int(v) for v in d[k].split("-"))
                    pats.append(rf"\b({months[m - 1]}|{months[m - 1][:3]})\.? {dd}\b")
            if d.get("start"):  # windows are printed 'December 5–15, 2026' (one month name)
                y1, m1, d1 = (int(v) for v in d["start"].split("-"))
                y2, m2, d2 = (int(v) for v in d["end"].split("-"))
                if m1 == m2:
                    pats = [rf"\b{months[m1 - 1]} {d1}\s*[-\u2013]\s*{d2}\b"]
            okk = all(re.search(p, body) for p in pats)
            ok(okk, f"keyDate 2027 [{d.get('kind')}/{d.get('residency', '-')}] {d['label']} {d.get('date') or d['start'] + '..' + d['end']} in {d['sourceId']}")
    print(f"\n{checks} checks, {len(fails)} mismatches")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
