#!/usr/bin/env python3
"""Add seasonRanges (YYYY-MM-DD) to Alaska draw rows from their seasonDates text, and verify the round trip.

seasonDates is the season cell of the ADF&G Drawing Permit Hunt Supplement, prefixed by draw_build.py with the
year column it was printed under ("2026: Aug. 15-Dec. 31"; "2026-2027: Sept. 1-Nov. 15 and Dec. 15 thru Jan. 15";
"2027: Jan. 1-June 30" for a spring hunt of the 2026-2027 regulatory year). A few tables have no year columns and
the text has no prefix ("Sept. 1-Nov. 30"); the row's draw year is used then.

Rules (deterministic, no guessing beyond the printed text):
  * segments are separated by " and "; a segment is "Mon. D-Mon. D", "Mon. D-D" or "Mon. D thru Mon. D";
  * the first segment starts in the first printed year (or the row year without a prefix);
  * a segment whose end month/day is before its start rolls into the next calendar year ("Dec. 15 thru Jan. 15");
  * a later segment that starts before the previous segment ended (in month/day order) is in the following year
    ("Oct. 1-Oct. 31 and Mar. 1-Mar. 31" -> October, then March of the next year). ADF&G regulatory years run
    July 1 - June 30, so this is the only reading in which the segments are in order.
Anything the grammar does not cover raises an error; the row is then left without seasonRanges and reported.

Round trip: every range is rendered back to the supplement's notation and compared with seasonDates after
normalizing only spacing, "thru" vs "-" and "Nov. 1-30" vs "Nov. 1-Nov. 30"; printed year prefixes must equal the
years of the ranges (a single-year prefix whose segments roll into the next year is reported separately).

seasonSourceId is d-supp-<year>: the season text comes from the hunt tables of the <year>-<year+1> supplement,
while the counts (sourceId) come from the back page of the next one.

Usage:
  python -I seasons_ranges.py <repo_root>            # write seasonRanges/seasonSourceId on every row with seasonDates
  python -I seasons_ranges.py <repo_root> --check    # parse + round-trip report only
Run after draw_build.py. Tests: python -I seasons_ranges_test.py
"""
import datetime as dt
import json
import os
import re
import sys

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7, "aug": 8,
          "sept": 9, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
ABBR = {1: "Jan.", 2: "Feb.", 3: "Mar.", 4: "Apr.", 5: "May", 6: "June", 7: "July", 8: "Aug.", 9: "Sept.", 10: "Oct.",
        11: "Nov.", 12: "Dec."}
MON = r"(Jan|Feb|Mar|Apr|May|June|Jun|July|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?"
SEG = re.compile(rf"^{MON}\s*(\d{{1,2}})\s*(?:-|thru)\s*(?:{MON}\s*)?(\d{{1,2}})$")
PFX = re.compile(r"^(\d{4})(?:-(\d{4}))?:\s*(.+)$")
SPECIES = ("moose", "sheep", "goat", "bear", "elk")


class SeasonParseError(ValueError):
    pass


def _md(month, day):
    return (month, day)


def parse_group(text, year):
    """One 'PFX: seg and seg' group -> (prefix_years or None, [(start_date, end_date)])."""
    text = re.sub(r"\s+", " ", text.strip())
    m = PFX.match(text)
    if m:
        y1 = int(m.group(1))
        pfx = (y1, int(m.group(2)) if m.group(2) else None)
        body = m.group(3)
    else:
        y1, pfx, body = year, None, text
    out = []
    cur = y1
    prev_end = None
    for seg in body.split(" and "):
        sm = SEG.match(seg.strip())
        if not sm:
            raise SeasonParseError(f"unrecognized segment {seg!r} in {text!r}")
        m1 = MONTHS[sm.group(1).lower()]
        d1 = int(sm.group(2))
        m2 = MONTHS[sm.group(3).lower()] if sm.group(3) else m1
        d2 = int(sm.group(4))
        if prev_end is not None and _md(m1, d1) < _md(prev_end.month, prev_end.day):
            cur += 1
        try:
            start = dt.date(cur, m1, d1)
            if _md(m2, d2) < _md(m1, d1):
                cur += 1
            end = dt.date(cur, m2, d2)
        except ValueError as e:  # e.g. Feb. 29 in a non-leap year
            raise SeasonParseError(f"{e} in {text!r}") from None
        out.append((start, end))
        prev_end = end
    return pfx, out


LABEL = re.compile(r"^(.*?)\s*\(([^()]+)\)\s*$")


def split_label(group):
    """'2026: Sept. 5-Sept. 25 (Nonresidents Only)' -> ('2026: Sept. 5-Sept. 25', 'Nonresidents Only').
    A trailing parenthesised label marks a season the supplement prints separately for one class of hunter
    within the same hunt (e.g. DM920/DM922: residents Sept. 1-25, nonresidents Sept. 5-25)."""
    m = LABEL.match(group.strip())
    return (m.group(1), m.group(2).strip()) if m else (group, None)


def parse(text, year):
    """seasonDates -> [{'start','end'[,'label']}], plus the list of (prefix, ranges) groups for the round trip."""
    groups, ranges = [], []
    for g in text.split("; "):
        body, label = split_label(g)
        pfx, rr = parse_group(body, year)
        groups.append((pfx, rr))
        for s, e in rr:
            r = {"start": s.isoformat(), "end": e.isoformat()}
            if label:
                r["label"] = label
            ranges.append(r)
    return ranges, groups


def _seg_text(s, e):
    if (s.month, s.year) == (e.month, e.year):
        return f"{ABBR[s.month]} {s.day}-{ABBR[e.month]} {e.day}"
    return f"{ABBR[s.month]} {s.day}-{ABBR[e.month]} {e.day}"


def render(groups):
    """Inverse of parse: groups -> canonical text ('YYYY[-YYYY]: Mon. D-Mon. D and ...')."""
    parts = []
    for pfx, rr in groups:
        y1, y2 = rr[0][0].year, max(e.year for _, e in rr)
        lead = "" if pfx is None else (f"{y1}: " if y1 == y2 else f"{y1}-{y2}: ")
        parts.append(lead + " and ".join(_seg_text(s, e) for s, e in rr))
    return "; ".join(parts)


def canonical(text):
    """Normalize printed seasonDates the way render() writes it (spacing, 'thru' -> '-', 'Nov. 1-30' -> 'Nov. 1-Nov. 30',
    month spellings), keeping the printed year prefix."""
    out = []
    for g in text.split("; "):
        g = re.sub(r"\s+", " ", split_label(g)[0].strip())
        m = PFX.match(g)
        lead, body = (g[:m.start(3)], m.group(3)) if m else ("", g)
        segs = []
        for seg in body.split(" and "):
            sm = SEG.match(seg.strip())
            m1 = MONTHS[sm.group(1).lower()]
            m2 = MONTHS[sm.group(3).lower()] if sm.group(3) else m1
            segs.append(f"{ABBR[m1]} {int(sm.group(2))}-{ABBR[m2]} {int(sm.group(4))}")
        out.append(lead + " and ".join(segs))
    return "; ".join(out)


def round_trip(text, year):
    """-> (ok, kind, rendered). kind: 'exact' | 'rollover-beyond-prefix' | 'no-prefix' | 'mismatch'."""
    ranges, groups = parse(text, year)
    # rebuild groups from the stored ISO ranges, independent of parse()'s intermediate dates
    it = iter(ranges)
    rebuilt = []
    for pfx, rr in groups:
        rebuilt.append((pfx, [(dt.date.fromisoformat(r["start"]), dt.date.fromisoformat(r["end"])) for r in (next(it) for _ in rr)]))
    rend = render(rebuilt)
    can = canonical(text)
    if rend == can:
        return True, "no-prefix" if all(p is None for p, _ in groups) else "exact", rend
    # a single printed year whose segments run into the next calendar year (regulatory year July-June)
    alt = render([(None, rr) for _, rr in rebuilt])
    if all(p is not None and p[1] is None for p, _ in groups) and re.sub(r"^\d{4}: ", "", can) == alt \
            and all(rr[0][0].year == p[0] for p, rr in rebuilt):
        return True, "rollover-beyond-prefix", rend
    return False, "mismatch", rend


def _with_ranges(row, ranges):
    new = {}
    for k, v in row.items():
        if k in ("seasonRanges", "seasonSourceId"):
            continue
        new[k] = v
        if k == "seasonDates":
            new["seasonRanges"] = ranges
            new["seasonSourceId"] = f"d-supp-{row['year']}"
    return new


def main():
    repo = sys.argv[1]
    check = "--check" in sys.argv
    report = {}
    problems = []
    for sp in SPECIES:
        path = os.path.join(repo, "src/data/agency/alaska/draw", f"{sp}.json")
        rows = json.load(open(path))
        out = []
        st = {}
        for r in rows:
            y = r["year"]
            s = st.setdefault(y, {"rows": 0, "withSeasonDates": 0, "withSeasonRanges": 0, "noSeasonDates": [], "unparsed": [], "kinds": {}})
            s["rows"] += 1
            if not r.get("seasonDates"):
                s["noSeasonDates"].append(r["huntCode"])
                out.append(r)
                continue
            s["withSeasonDates"] += 1
            try:
                ranges, _ = parse(r["seasonDates"], y)
                ok, kind, rend = round_trip(r["seasonDates"], y)
            except SeasonParseError as e:
                s["unparsed"].append(r["huntCode"])
                problems.append(f"{sp} {y} {r['huntCode']}: {e}")
                out.append(r)
                continue
            if not ok:
                s["unparsed"].append(r["huntCode"])
                problems.append(f"{sp} {y} {r['huntCode']}: round trip {r['seasonDates']!r} -> {rend!r}")
                out.append(r)
                continue
            s["kinds"][kind] = s["kinds"].get(kind, 0) + 1
            s["withSeasonRanges"] += 1
            out.append(_with_ranges(r, ranges))
        report[sp] = st
        if not check:
            with open(path, "w") as f:
                json.dump(out, f, indent=1, ensure_ascii=False)
                f.write("\n")
    print(json.dumps(report, indent=1))
    for p in problems:
        print("PROBLEM", p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
