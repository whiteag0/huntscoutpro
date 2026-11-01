#!/usr/bin/env python3
"""Independent check of the Wyoming season dates written by seasons_parse.py.

Usage:  python -I scripts/agency/wyoming/seasons_spotcheck.py <raw_dir> <repo_root> [--sample N] [--seed S]

seasons_parse.py reads the chapter PDFs by pdfplumber word positions. This check instead reads
poppler's `pdftotext -layout` text (<raw_dir>/m*.txt) with regular expressions: for a draw row
<area>-<type> it finds every table line that starts with that hunt area (alone or first in a
list such as "9, 10" or "11,") and that license type, takes the printed dates on those lines in
order, and compares them with the row's seasonDates text and seasonRanges (month/day and the
Aug-Dec = 2026, Jan-Mar = 2027 year rule). It checks every 2026 row with seasonRanges and prints
a random sample of N (default 40) side by side with the chapter line. Exit 1 on any mismatch.
"""
import json
import os
import random
import re
import sys

MON = r"(?:Jan\.|Feb\.|Mar\.|Apr\.|May|June?|July?|Aug\.|Sept?\.|Oct\.|Nov\.|Dec\.)"
DATE = re.compile(rf"({MON})\s?(\d{{1,2}})")
NUM = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
CHAPTER = {"elk": "m33695", "mule-deer": "m33694", "whitetail": "m33694", "pronghorn": "m33693", "moose": "m33696",
           "sheep": "m33697", "goat": "m33697"}


def section_lines(path, species):
    lines = open(path, encoding="utf-8").read().split("\n")
    if species == "goat":
        a = next(i for i, l in enumerate(lines) if "Section 7." in l and "Mountain Goat Hunting Seasons" in l)
        b = next(i for i, l in enumerate(lines) if i > a and "Section 8." in l)
    elif species == "sheep":
        a = next(i for i, l in enumerate(lines) if "Section 3." in l and "Bighorn Sheep Hunting Seasons" in l)
        b = next(i for i, l in enumerate(lines) if i > a and "Section 4." in l)
    else:
        a = next(i for i, l in enumerate(lines) if "Section 2." in l and "Hunting Seasons" in l)
        b = next(i for i, l in enumerate(lines) if i > a and re.match(r"\s*Section 3\.", l))
    return lines[a:b]


def chapter_dates(lines, area, typ):
    """All printed dates (in order) on lines whose first column is `area` (or a list starting with it) and type `typ`."""
    out, hits = [], []
    pat = re.compile(rf"^\s*{area}(?:,\s*\d{{1,3}})*,?\s+{re.escape(typ)}\s+(.*)$")
    reg_col = None
    archery = 0
    for l in lines:
        opens = [m.start() for m in re.finditer(r"Opens", l)]
        if len(opens) >= 2:
            reg_col = opens[1]  # header: second "Opens" = regular season column
        m = pat.match(l)
        if m:
            found = list(DATE.finditer(l))
            ds = [(NUM[x.group(1)[:3]], int(x.group(2)), f"{x.group(1)} {x.group(2)}") for x in found]
            if len(found) == 4 or (len(found) == 2 and reg_col is not None and found[0].start() < reg_col - 6):
                archery += 1
            out += ds
            hits.append(l.strip())
    chapter_dates.archery = archery
    return out, hits


def turkey_dates(raw, code):
    m = re.match(r"^(?:(\d{3})-(\d)|GEN) \((Spring|Fall)\)$", code)
    typ = m.group(2) or "Gen"
    path = os.path.join(raw, "wb_m32329.txt" if m.group(3) == "Spring" else "m33701.txt")
    lines = open(path, encoding="utf-8").read().split("\n")
    head = "2026 Spring Season" if m.group(3) == "Spring" else "2026 Fall Season"
    a = next(i for i, l in enumerate(lines) if head in l)
    b = next(i for i, l in enumerate(lines) if i > a and ("Spring Season" in l or "Section 3." in l))
    return chapter_dates(lines[a:b], "1", typ)


def strip_parens(t):
    out, depth = [], 0
    for ch in t:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def year_of(mo, spring):
    if spring:
        return None
    return 2026 if mo >= 8 else 2027


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[sys.argv.index("--sample") + 1]) if "--sample" in sys.argv else 40
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 2026
    rows = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "turkey"]:
        for r in json.load(open(os.path.join(repo, "src/data/agency/wyoming/draw", f"{sp}.json"))):
            if r["year"] == 2026 and r.get("seasonRanges"):
                rows.append((sp, r))
    cache = {}
    bad, checked, lines_for = [], 0, {}
    for sp, r in rows:
        code = r["huntCode"]
        if sp == "turkey":
            dates, hits = turkey_dates(raw, code)
            spring = "Spring" in code
        else:
            m = re.match(r"^(\d{3})-(\d)", code)
            if sp not in cache:
                cache[sp] = section_lines(os.path.join(raw, CHAPTER[sp] + ".txt"), sp)
            dates, hits = chapter_dates(cache[sp], str(int(m.group(1))), m.group(2))
            spring = False
        lines_for[(sp, code)] = hits
        printed = [d[2] for d in dates]
        # dates outside the parenthesised limitation texts (one limitation itself mentions "Nov. 20")
        ours_printed = DATE.findall(strip_parens(r["seasonDates"]))
        ours_printed = [f"{mo} {d}" for mo, d in ours_printed]
        ranges = [x for g in r["seasonRanges"] for x in (g["start"], g["end"])]
        exp = []
        for mo, d, _ in dates:
            y = 2026 if spring else year_of(mo, spring)
            exp.append(f"{y:04d}-{mo:02d}-{d:02d}")
        checked += 1
        arch_ours = sum(1 for g in r["seasonRanges"] if g.get("label", "").startswith("Special archery"))
        arch_pdf = 0 if sp == "turkey" else chapter_dates.archery
        if printed != ours_printed or exp != ranges or arch_ours != arch_pdf:
            bad.append((sp, code, printed, ours_printed, exp, ranges, hits))
    random.seed(seed)
    sample = random.sample(rows, min(n, len(rows)))
    for sp, r in sample:
        print(f"{sp:10s} {r['huntCode']:22s} ours: {r['seasonDates'][:90]}")
        for h in lines_for[(sp, r["huntCode"])]:
            print(f"{'':33s} pdf : {re.sub(r' {2,}', ' | ', h)[:110]}")
    print(f"\nchecked {checked} rows with seasonRanges; mismatches: {len(bad)}")
    for b in bad[:30]:
        print("MISMATCH", b)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
