#!/usr/bin/env python3
"""Spot-check Nevada season dates against the raw NDOW documents, independently of seasons_parse.py.

Usage: python -I scripts/agency/nevada/seasons_spotcheck.py <raw_nevada_dir> <repo_root> [seed]

<raw_nevada_dir> is agency-raw/nevada (with seasons/ and draw/cr/). Methods differ from the parser:
 A. draw rows: seasonDates is re-read with datetime.strptime (no regex), and the year is taken from the
    regulation's own season-year column; the row's seasonRanges must match.
 B. draw rows (latest year): the same hunt + unit group is looked up in poppler `pdftotext -layout`
    text of that year's quota regulation (CR 25-13 for 2025) and its printed dates must match.
 C. draw-meta.seasons[]: every unit group of a sampled entry is looked up in `pdftotext -layout` text of
    CR 26-11 / CR 26-09 under its hunt number; the printed dates must match start/end.
 D. key dates added this round: the printed date phrase must occur in the cited document's text.
"""
import datetime as dt
import json
import os
import random
import re
import subprocess
import sys

sys.dont_write_bytecode = True
MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}


def layout(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout


def strp_md(tok):
    """'Sept 1' / 'Sep 01' / 'Oct 1' -> (month, day) using strptime on a normalised token."""
    mon, day = tok.replace(".", "").split()
    return dt.datetime.strptime(f"{mon[:3].title()} {int(day)} 2000", "%b %d %Y").timetuple()[1:3]


def season_year_dates(text, season_year):
    """'Aug 22 - Sept 7' in a season year that starts in `season_year` -> (date, date)."""
    a, b = [x.strip() for x in text.replace("–", "-").split(" - ")]
    (m1, d1), (m2, d2) = strp_md(a), strp_md(b)
    y1 = season_year + (1 if m1 <= 3 else 0)
    s = dt.date(y1, m1, d1)
    e = dt.date(y1, m2, d2)
    if e < s:
        e = dt.date(y1 + 1, m2, d2)
    return s.isoformat(), e.isoformat()


def strp_row(text, year):
    out = []
    for seg in text.split("; "):
        a, b = seg.split(" - ")
        if "," in a:
            s = dt.datetime.strptime(a, "%b %d, %Y").date()
            e = dt.datetime.strptime(b, "%b %d, %Y").date()
            out.append((s.isoformat(), e.isoformat()))
        else:
            out.append(season_year_dates(f"{a} - {b}", year))
    return out


def table_lines(text, hunt):
    """Lines of the CR table(s) printed under 'Hunt <no>' up to TOTAL."""
    lines = text.split("\n")
    out = []
    for i, l in enumerate(lines):
        if re.search(rf"(Hunt|Muzzleloader|Archery)( Resident)? {hunt}\*?\s*$", l):
            for l2 in lines[i + 1:i + 120]:
                if re.search(r"\bTOTAL\b", l2, re.I) or re.search(r"Hunt (Resident )?\d{4,5}\*?\s*$", l2):
                    break
                out.append(l2)
    return out


def norm(u):
    u = u.replace("–", "-").replace("*", "").replace("†", "")
    u = re.sub(r"(\d{3})[A-E](?=[\s,]|$)", r"\1", u)  # superscript footnote letters print inline in pdftotext ("108B")
    return re.sub(r"\s+", "", u)


DATE_IN_LINE = re.compile(r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2} - (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2})")


def lookup(text, hunt, unit, season_year):
    hits = []
    for l in table_lines(text, hunt):
        parts = re.split(r"\s{2,}", l.strip())
        if len(parts) >= 2 and norm(parts[0]) == norm(unit):
            m = DATE_IN_LINE.search(l.replace("–", "-"))
            if m:
                hits.append(season_year_dates(m.group(1), season_year))
    return hits


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    rnd = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else 20261031)
    base = os.path.join(repo, "src/data/agency/nevada")
    ok = bad = 0
    log = []

    def res(flag, msg):
        nonlocal ok, bad
        ok += flag
        bad += not flag
        log.append(("OK  " if flag else "MISS") + " " + msg)

    # A + B: draw rows
    rows = []
    for f in sorted(os.listdir(os.path.join(base, "draw"))):
        rows += [r for r in json.load(open(os.path.join(base, "draw", f))) if r.get("seasonRanges")]
    cr2513 = layout(os.path.join(raw, "seasons", "CR25-13-2025-Big-Game-Quotas-NBWC-Approved-May-2025-FINAL.pdf"))
    sample = rnd.sample(rows, 40)
    for r in sample:
        want = strp_row(r["seasonDates"], r["year"])
        got = [(g["start"], g["end"]) for g in r["seasonRanges"]]
        if r.get("seasonSourceId"):  # junior segments from the CR: the printed text is their overall span
            got = [(got[0][0], max(e for _, e in got))]
        res(want == got, f"A {r['species']} {r['year']} {r['huntCode']}: {r['seasonDates']!r} -> {got}")
    latest = [r for r in rows if r["year"] == 2025 and ";" not in r["seasonDates"]]
    n = 0
    for r in rnd.sample(latest, len(latest)):
        hunt, unit = r["huntCode"].split(" ", 1)
        if not re.fullmatch(r"[\d ,\-]+", unit) or hunt in ("1105", "1107"):
            continue
        hits = lookup(cr2513, hunt, unit, 2025)
        if not hits:
            continue
        got = [(g["start"], g["end"]) for g in r["seasonRanges"]]
        res(got[0] in hits, f"B {r['species']} 2025 {r['huntCode']}: row {got} vs CR 25-13 {hits}")
        n += 1
        if n >= 30:
            break

    # E: 2025 junior rows segmented from CR 25-13: read the 3 layout lines around the unit's line
    seg_re = re.compile(r"(Arch|Muzz|ALW) ?- ?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2} - (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2})")
    names = {"Arch": "Archery", "Muzz": "Muzzleloader", "ALW": "Any legal weapon"}
    jr = [r for r in rows if r["year"] == 2025 and r.get("seasonSourceId") == "d-cr-25-13"]
    for r in rnd.sample(jr, min(12, len(jr))):
        hunt, unit = r["huntCode"].split(" ", 1)
        tl = table_lines(cr2513, hunt)
        idx = [i for i, l in enumerate(tl) if re.split(r"\s{2,}", l.strip())[0] and norm(re.split(r"\s{2,}", l.strip())[0]) == norm(unit)]
        got = sorted((g["label"], g["start"], g["end"]) for g in r["seasonRanges"])
        want = None
        if len(idx) == 1:
            i = idx[0]
            want = sorted((names[m.group(1)],) + season_year_dates(m.group(2), 2025) for l in tl[max(0, i - 1):i + 2] for m in seg_re.finditer(l.replace("–", "-")))
        res(got == want, f"E mule-deer 2025 {r['huntCode']}: {got} vs CR 25-13 layout {want}")

    # C: seasons[]
    meta = json.load(open(os.path.join(base, "draw-meta.json")))
    texts = {"d-cr-26-11": layout(os.path.join(raw, "seasons", "CR-26-11-2026-2027-Big-Game-Quota-NBWC-Approved-May-2026.pdf")),
             "d-cr-26-09": layout(os.path.join(raw, "seasons", "CR-26-09-2026-2027-NR-Guided-Seasons-and-Quotas-NBWC-Approved-January-2026.pdf"))}
    cands = [s for s in meta["seasons"] if s["sourceId"] in texts and "segment" not in s["label"]]
    checked = 0
    for s in rnd.sample(cands, len(cands)):
        hunt = s["huntCodes"][0]
        units = [u for u in s["units"] if re.fullmatch(r"[\d ,\-]+(Early|Late|Mid)?", u)]
        if not units:
            continue
        for u in units[:3]:
            hits = lookup(texts[s["sourceId"]], hunt, u, 2026)
            if not hits and len(s["units"]) == 1 and len(u) > 30:  # unit cell printed over several lines (moose 10151)
                blob = norm(" ".join(table_lines(texts[s["sourceId"]], hunt)))
                hits = [season_year_dates(m.group(1), 2026) for m in DATE_IN_LINE.finditer(" ".join(table_lines(texts[s["sourceId"]], hunt)).replace("–", "-"))
                        if all(norm(p) in blob for p in u.split(","))]
            res((s["start"], s["end"]) in hits, f"C {s['species']} hunt {hunt} unit {u!r}: {s['start']}..{s['end']} vs layout {hits}")
        checked += 1
        if checked >= 30:
            break
    # turkey / bear (transcribed): phrase check
    t13 = re.sub(r"\s+", " ", layout(os.path.join(raw, "seasons", "CR26-13-Upland-Furbearer-Seasons.pdf")).replace("–", "-"))
    for phrase in ["Nov. 1 - Nov. 30, 2026", "March 20 - May 2, 2027", "March 27 - April 4, 2027", "April 10 - April 18, 2027", "April 24 - May 2, 2027",
                   "Last Saturday in March - first Sunday in May"]:
        res(phrase in t13, f"C turkey phrase {phrase!r} in CR 26-13")
    res(dt.date(2027, 3, 27).weekday() == 5 and dt.date(2027, 5, 2).weekday() == 6 and (dt.date(2027, 3, 27) + dt.timedelta(7)).month == 4 and (dt.date(2027, 5, 2) - dt.timedelta(7)).month == 4,
        "C 2027-03-27 is the last Saturday in March and 2027-05-02 the first Sunday in May")
    b12 = re.sub(r"\s+", " ", layout(os.path.join(raw, "seasons", "CR-26-12-2026-Black-Bear-Seasons-and-Quotas-NBWC-Approved-May-2026.pdf")))
    res("Sept 15 - Dec 1" in b12, "C bear 'Sept 15 - Dec 1' in CR 26-12")

    # D: key dates
    def flat(p):
        return re.sub(r"\s+", " ", open(p, encoding="utf-8", errors="replace").read() if p.endswith(".txt") else layout(p))
    a1 = flat(os.path.join(raw, "seasons", "CR-26-01-A-1-2026-2027-Application-Deadlines-Draw-Result-Dates.pdf"))
    c2501 = flat(os.path.join(raw, "seasons", "CR25-01-Amendment-1-2025-Application-Deadlines-Draw-Result-and-2026-Spring-Turkey-NBWC-Approved-JUNE-2025-FINAL.pdf"))
    apply_txt = flat(os.path.join(raw, "seasons", "pages", "apply-buy-hunting.txt"))
    for src, phrase in [(a1, "Monday, August 10, 2026"), (a1, "on or before Friday, August 21, 2026"), (a1, "Monday, January 25, 2027"),
                        (a1, "Monday, February 1, 2027"), (a1, "Friday, February 12, 2027"), (a1, "January 31 following the close of the hunt season"),
                        (a1, "February 28 following"), (a1, "May 31, for the spring wild turkey hunt"),
                        (c2501, "Monday, January 26, 2026"), (c2501, "Monday, February 2, 2026"), (c2501, "Friday, February 13, 2026"),
                        (apply_txt, "Turkey Overton WMA Dove Sheldon NWR Sage Grouse Application Period Opens Jan 12"),
                        (apply_txt, "2026 Big Game Application Calendar")]:
        res(phrase in src, f"D phrase {phrase!r}")
    b12b = re.sub(r"\s+", " ", b12)
    res("Thursday July 16, 2026" in b12b and "Saturday, July 25, 2026" in b12b, "D bear indoctrination July 16 / July 25, 2026 in CR 26-12")
    # every keyDate's ISO date must be a real calendar date and the 2027 ones only from CR 26-01 A-1
    for sp in meta["species"]:
        for d in sp["keyDates"]:
            if d["cycle"] == 2027:
                res(d["sourceId"] == "d-cr-26-01-a1", f"D 2027 key date {sp['species']} {d['label']!r} sourced to CR 26-01 A-1")

    for l in log:
        print(l)
    print(f"spot-check: {ok} matched, {bad} mismatched")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
