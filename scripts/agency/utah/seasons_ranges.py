#!/usr/bin/env python3
"""Add structured seasonRanges to src/data/agency/utah/draw/*.json from each row's seasonDates text.

Usage:
  python -I scripts/agency/utah/seasons_ranges.py <repo_root> [--check]

Run after draw_parse.py (which writes seasonDates from UDWR's draw-odds system, d-api-2026-*).
Utah seasonDates are segments joined by "; ", each "YYYY-MM-DD to YYYY-MM-DD (Weapon)" as UDWR's
draw-odds JSON gives them (SeasonWeapons: SeasonStartDate, SeasonEndDate, WeaponName). The weapon
in parentheses becomes the range label. Years are printed by UDWR, so nothing is inferred; a range
must start in the row's draw year or in January-March of the next year (hunts that run into the next
winter), otherwise the script stops so the row can be investigated.

Segments that are not dates ("Contact Operator (CWMU)", "See Guidebook for Units (Archery)") are
left out; a row with no date segment gets no seasonRanges. Segment order is kept as published.
The rewrite is idempotent and keeps the one-row-per-line file format. --check only reports.
"""
import datetime
import glob
import json
import os
import re
import sys

# Season-date conflicts between UDWR documents, found by seasons_spotcheck.py (check B). The row keeps the
# draw-odds system's dates (its sourceId); the note records what the guidebook prints.
BEAR_JULY = ("Season dates: UDWR's draw-odds system gives the summer harvest-objective segment as July 5-31, 2026 (shown); the 2026 "
             "Black Bear, Cougar and Furbearer Guidebook harvest-objective hunt table prints July 6-July 31 for this unit. Confirm with UDWR.")
CONFLICT_NOTES = {
    (2026, "RS6700"): ("Season dates: UDWR's draw-odds system gives Nov. 11-18, 2026 (shown); the 2026 Big Game Application "
                       "Guidebook hunt table prints Nov. 9-Nov. 16 for RS6700. Confirm with UDWR."),
    # Multiseason bear permits: "All open seasons" incl. the unit's harvest-objective seasons (found by the 2026-10-31 verifier).
    (2026, "BR7303"): BEAR_JULY,
    (2026, "BR7305"): BEAR_JULY,
    (2026, "BR7310"): BEAR_JULY,
    (2026, "BR7316"): BEAR_JULY,
    (2026, "BR7320"): BEAR_JULY,
    (2026, "BR7321"): BEAR_JULY,
    (2026, "BR7325"): BEAR_JULY,
}

SEG = re.compile(r"^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})(?: \(([^()]+)\))?$")


def _iso(s):
    return datetime.date.fromisoformat(s)  # raises on impossible dates


def segments(text):
    """Split agency text into (date_segments, other_segments)."""
    dates, other = [], []
    for seg in (text or "").split("; "):
        seg = seg.strip()
        if not seg:
            continue
        (dates if SEG.match(seg) else other).append(seg)
    return dates, other


def parse(text, row_year):
    """Return [{start, end, label?}, ...] in published order, or None if the text has no dates."""
    dates, _ = segments(text)
    out = []
    for seg in dates:
        start, end, label = SEG.match(seg).groups()
        a, b = _iso(start), _iso(end)
        if a > b:
            raise ValueError(f"start after end: {seg!r}")
        if not (a.year == row_year or (a.year == row_year + 1 and a.month <= 3)):
            raise ValueError(f"range {seg!r} starts outside draw year {row_year} (and its Jan-Mar carry-over)")
        r = {"start": start, "end": end}
        if label:
            r["label"] = label
        out.append(r)
    return out or None


def render(ranges):
    """Inverse of parse: the agency text for the date segments."""
    return "; ".join(f"{r['start']} to {r['end']}" + (f" ({r['label']})" if r.get("label") else "") for r in ranges)


def with_ranges(row, ranges):
    """Copy of row with seasonRanges placed right after seasonDates (any old value dropped)."""
    out = {}
    for k, v in row.items():
        if k == "seasonRanges":
            continue
        out[k] = v
        if k == "seasonDates" and ranges:
            out["seasonRanges"] = ranges
    return out


def dump(rows):
    return "[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=True) for r in rows) + "\n]\n"


def main(repo, check=False):
    total = {}
    for path in sorted(glob.glob(os.path.join(repo, "src/data/agency/utah/draw/*.json"))):
        sp = os.path.basename(path)[:-5]
        raw = open(path, encoding="utf-8").read()
        rows = json.loads(raw)
        if dump(rows) != raw:
            raise SystemExit(f"{path}: file format differs from the expected one-row-per-line dump; not rewriting")
        latest = max(r["year"] for r in rows)
        st = {"latest": latest, "latestRows": 0, "latestWithText": 0, "latestRanges": 0, "allRanges": 0,
              "nonDateOnly": 0, "partial": 0, "roundTripFail": 0}
        new = []
        for r in rows:
            text = r.get("seasonDates")
            ranges = parse(text, r["year"]) if text else None
            if text:
                dates, other = segments(text)
                if ranges and render(ranges) != "; ".join(dates):
                    st["roundTripFail"] += 1
                if not ranges:
                    st["nonDateOnly"] += 1
                elif other:
                    st["partial"] += 1
            if r["year"] == latest:
                st["latestRows"] += 1
                st["latestWithText"] += bool(text)
                st["latestRanges"] += bool(ranges)
            st["allRanges"] += bool(ranges)
            extra = CONFLICT_NOTES.get((r["year"], r["huntCode"]))
            if extra and extra not in (r.get("note") or ""):
                r["note"] = (r["note"] + " " + extra) if r.get("note") else extra
            new.append(with_ranges(r, ranges))
        total[sp] = st
        out = dump(new)
        if not check and out != raw:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(out)
    for sp, st in total.items():
        print(sp, json.dumps(st))
    if any(st["roundTripFail"] for st in total.values()):
        raise SystemExit("round-trip failures")


if __name__ == "__main__":
    main(sys.argv[1], "--check" in sys.argv[2:])
