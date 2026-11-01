#!/usr/bin/env python3
"""Spot-check Alaska draw-row seasonRanges (seasons_ranges.py) with methods independent of that parser.

1. 2026 rows vs ADF&G's per-hunt pages for regulatory year 2026 (<draw_raw>/hunts/hd2026_<code>.html, saved by
   draw_fetch.py), which print the season as numeric dates ("09/01/2026 - 01/15/2027"; one span for the whole
   season): the first range's start and the last range's end must equal that span exactly.
2. Every row of every year vs the `pdftotext -layout` text of the supplement the season came from
   (supp_<Y>-<Y+1>.txt, before its results page): each range, written back in ADF&G notation from the ISO dates,
   must be printed within a few lines of the hunt number ("Dec. 15 thru Jan. 15" and "Nov. 1-30" accepted).
3. A seeded random sample of N rows is printed with the evidence used.

Usage: python -I seasons_spotcheck.py <draw_raw_dir> <repo_root> [N=40] [seed=2026]
"""
import datetime as dt
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_huntpage  # noqa: E402  (regex reader of the saved hunt pages)

ABBR = {1: "Jan.", 2: "Feb.", 3: "Mar.", 4: "Apr.", 5: "May", 6: "June", 7: "July", 8: "Aug.", 9: "Sept.", 10: "Oct.",
        11: "Nov.", 12: "Dec."}
SPECIES = ("moose", "sheep", "goat", "bear", "elk")


def norm(s):
    s = s.replace("–", "-")
    s = re.sub(r"\b(Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec)\.", r"\1", s)
    s = re.sub(r"\s*thru\s*", "-", s)
    s = re.sub(r"\s*-\s*", "-", s)
    return re.sub(r"\s+", " ", s)


def printed_forms(start, end):
    s, e = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    forms = [f"{ABBR[s.month]} {s.day}-{ABBR[e.month]} {e.day}"]
    if s.month == e.month:
        forms.append(f"{ABBR[s.month]} {s.day}-{e.day}")
    return [norm(f) for f in forms]


def supp_windows(raw, year):
    t = open(os.path.join(raw, f"supp_{year}-{year + 1}.txt"), encoding="utf-8", errors="replace").read()
    cut = t.find(f"Results of the {year - 1} Permit Hunt Drawing")
    if cut < 0:
        cut = t.find("Results of the")
    lines = (t[:cut] if cut > 0 else t).splitlines()
    return lines


MONTOK = re.compile(r"^(Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec)\.?$")


def date_tokens(text):
    """Keep only the date words of a column slice (months, their day numbers, '-', 'thru', 'and'), dropping words
    of neighbouring columns that the character slice cuts into ('Aug. 25- Antlerless Sept. 25' -> 'Aug. 25- Sept. 25')."""
    keep, prev = [], ""
    for t in text.replace("–", "-").split():
        if MONTOK.match(t) or t in ("-", "thru", "and"):
            keep.append(t)
        elif re.fullmatch(r"\d{1,2}-?(\d{1,2})?", t) and (MONTOK.match(prev) or MONTOK.match(prev.split("-")[-1]) or prev in ("-", "thru") or prev.endswith("-")):
            keep.append(t)
        elif re.fullmatch(r"\d{1,2}-(Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec)\.?", t) and MONTOK.match(prev):
            keep.append(t)
        else:
            continue
        prev = t
    return " ".join(keep)


def near_code(lines, code, width=8):
    """Text that can hold the hunt's season cell: the lines around each occurrence of the hunt number, plus the
    season column of its table block (from the header line holding "Season" above it to the next such header).
    The column is read by character position, so a season cell printed once for several hunts (merged cell)
    and wrapped over two lines ("Aug. 25-" / "Sept. 25") is still found."""
    out = []
    heads = [i for i, l in enumerate(lines) if re.search(r"\bSeason\b", l)]
    for i, l in enumerate(lines):
        if not re.search(rf"\b{code}\b", l):
            continue
        out.append(norm(" ".join(lines[max(0, i - width):i + width + 1])))
        above = [h for h in heads if h <= i]
        if not above:
            continue
        h = above[-1]
        nxt = next((x for x in heads if x > i), len(lines))
        c = lines[h].index("Season")
        right = c + 40
        for hh in range(h, min(h + 6, len(lines))):
            m = re.search(r"\bLegal\b|\bHunt Area\b|\bReporting\b|\bSpecimens\b", lines[hh][c + 6:])
            if m:
                right = c + 6 + m.start()
                break
        col = " ".join(x[max(0, c - 8):right] for x in lines[h:nxt])
        out.append(norm(date_tokens(col)))
    return out


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    rows = []
    for sp in SPECIES:
        for r in json.load(open(os.path.join(repo, "src/data/agency/alaska/draw", f"{sp}.json"))):
            if r.get("seasonRanges"):
                rows.append((sp, r))
    # 1. hunt pages (2026)
    pages, p_bad, p_n, p_missing = {}, [], 0, []
    for sp, r in rows:
        if r["year"] != 2026:
            continue
        f = os.path.join(raw, "hunts", f"hd2026_{r['huntCode']}.html")
        if not os.path.exists(f):
            p_missing.append(r["huntCode"])
            continue
        pg = draw_huntpage.parse(f)
        m = re.match(r"(\d\d)/(\d\d)/(\d{4}) - (\d\d)/(\d\d)/(\d{4})", pg.get("season") or "")
        p_n += 1
        span = (f"{m.group(3)}-{m.group(1)}-{m.group(2)}", f"{m.group(6)}-{m.group(4)}-{m.group(5)}") if m else None
        pages[r["huntCode"]] = (pg.get("season"), span)
        got = (r["seasonRanges"][0]["start"], r["seasonRanges"][-1]["end"])
        if got != span:
            p_bad.append(f"{sp} {r['huntCode']}: rows {got} vs hunt page {pg.get('season')!r}")
    print(f"1. 2026 rows vs ADF&G hunt pages: {p_n} compared, {p_n - len(p_bad)} match, {len(p_bad)} differ, {len(p_missing)} without a saved page")
    for b in p_bad:
        print("   DIFF", b)
    # 2. supplement text, every row
    cache, s_bad, s_n = {}, [], 0
    for sp, r in rows:
        y = r["year"]
        if y not in cache:
            cache[y] = supp_windows(raw, y)
        wins = near_code(cache[y], r["huntCode"])
        for g in r["seasonRanges"]:
            s_n += 1
            if not any(any(f in w for f in printed_forms(g["start"], g["end"])) for w in wins):
                s_bad.append(f"{sp} {y} {r['huntCode']}: {printed_forms(g['start'], g['end'])[0]!r} not printed near the hunt number ({r['seasonDates']!r})")
    print(f"2. ranges vs supplement text: {s_n} ranges in {len(rows)} rows, {s_n - len(s_bad)} found, {len(s_bad)} not found")
    for b in s_bad:
        print("   NOTFOUND", b)
    # 3. sample
    random.seed(seed)
    print(f"3. random sample of {n} rows (seed {seed}):")
    for sp, r in random.sample(rows, min(n, len(rows))):
        rr = "; ".join(f"{g['start']}..{g['end']}" for g in r["seasonRanges"])
        ev = pages.get(r["huntCode"], (None,))[0] if r["year"] == 2026 else "supplement text"
        print(f"   {sp:5} {r['year']} {r['huntCode']:6} {r['seasonDates']!r:58} -> {rr:46} | {ev}")
    # section 2 is informational: a season cell printed once for a block of hunts or split across columns
    # cannot always be located in layout text; section 1 is the pass/fail check.
    sys.exit(1 if p_bad else 0)


if __name__ == "__main__":
    main()
