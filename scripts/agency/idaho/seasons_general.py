#!/usr/bin/env python3
"""Idaho general-season dates for draw-meta.seasons[] (imported by draw_meta.py).

build(raw) reads, from <raw> = agency-raw/idaho/seasons (all fetched 2026-10-31):
  list_g1_t1_2026.json  Hunt Planner list, game=1 (deer), type=1 (general seasons), 2026  -> d-huntlist-general-deer
  list_g2_t1_2026.json  Hunt Planner list, game=2 (elk),  type=1 (general seasons), 2026  -> d-huntlist-general-elk
  seasons-rules-big-game-2026.pdf     "Black Bear Seasons for Fall 2026 and Spring 2027" (pp.69-71),
                                      "July 2026 - June 2027 Mountain Lion Seasons" (pp.75-76)  -> d-rules-big-game-2026
  wb-seasons-rules-big-game-2025.pdf  "Black Bear Seasons for Fall 2025 and Spring 2026" (spring 2026 only) -> d-rules-big-game-2025
Deer and elk: one entry per (species, tag, season type, weapon, antler class, open, close) with the Hunt Planner areas
listed in `units` ("Unit 1" -> "1"; anything else, e.g. "Portion of Unit 50", kept verbatim).
Bear: one entry per take-season date range with the units printed for it. Lion: the take season is printed
as July 1 - June 30 for every unit, so one statewide entry (the script fails if any unit differs).
Turkey general seasons (a short table) are transcribed in draw_meta.py.
Pronghorn, moose, bighorn sheep and mountain goat have no general seasons in Idaho (controlled hunts only;
their dates are on the draw rows).
"""
import datetime as dt
import json
import os
import re

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
RNG = re.compile(r"([A-Z][a-z]+)\.? ?(\d{1,2})\s*[-–]\s*([A-Z][a-z]+)\.? ?(\d{1,2})")
METHOD = {"Any Weapon": "all", "Archery": "archery", "Muzzleloader": "muzzleloader", "Short-Range Weapons": "other"}
SEASON_WORD = {"General Any Weapon": "any weapon", "General Archery": "archery", "General Muzzleloader": "muzzleloader",
               "General Short-Range Weapon": "short-range weapon"}


def mdy(s):
    m, d, y = (int(x) for x in s.split("/"))
    return dt.date(2000 + y if y < 100 else y, m, d)


def md(mon, day, year):
    return dt.date(year, MONTHS[mon[:3].lower()], int(day))


def ranges_in(cell):
    """All 'Mon D - Mon D' ranges in a table cell, in order, as (mon1, d1, mon2, d2)."""
    return RNG.findall(cell or "")


def unit_ids(area):
    """Hunt Planner area -> unit ids: 'Unit 1' -> ['1']; 'Units 75, 77 and 78' / 'Units 22,32,32A' -> ids;
    anything else ('Portion of Unit 50', 'Unit 2, except Farragut SP') is kept verbatim as one entry."""
    m = re.fullmatch(r"Units? (.+)", area)
    if m:
        toks = [t.strip() for t in re.split(r",|\band\b", m.group(1)) if t.strip()]
        if toks and all(re.fullmatch(r"\d{1,2}[A-C]?", t) for t in toks):
            return toks
    return [area]


def unit_sort(u):
    m = re.match(r"(\d+)([A-Z]?)", u)
    return (0, int(m.group(1)), m.group(2), u) if m else (1, 0, "", u)


def hunt_planner(path, species_for, label_for, sid):
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    groups = {}
    for r in d["rows"]:
        if r.get("number") is not None or not r["season"].startswith("General"):
            raise SystemExit(f"{path}: unexpected non-general row {r}")
        o, c = mdy(r["open"]), mdy(r["close"])
        key = (species_for(r), r["tag"], r["season"], r["method"], r["ornament"], o, c)
        groups.setdefault(key, []).extend(unit_ids(r["area"]))
    out = []
    for (sp, tag, season, method, orn, o, c), units in groups.items():
        units = sorted(set(units), key=unit_sort)
        e = {"species": sp, "label": label_for(tag, season, method, orn), "method": METHOD[method], "units": units,
             "start": o.isoformat(), "end": c.isoformat(), "year": o.year if o.month > 3 else o.year - 1, "sourceId": sid}
        out.append(e)
    out.sort(key=lambda e: (e["species"], e["label"].split(":")[0], e["start"], e["end"], e["label"]))
    return out


def deer(raw):
    def sp(r):
        # By the species IDFG lists for the hunt ('game'), not the tag: some Regular Deer Tag seasons (e.g. the
        # Panhandle Nov 15 - Dec 1 any-weapon season) are white-tailed deer only. Same rule as the controlled hunts:
        # whitetail = hunts IDFG lists for 'White-tailed Deer' only; mule-deer = 'Mule and White-tailed Deer'.
        if r["game"] == "White-tailed Deer":
            return "whitetail"
        if r["game"] in ("Mule and White-tailed Deer", "Mule Deer"):
            return "mule-deer"
        raise SystemExit(f"unexpected deer game {r['game']!r}")

    def label(tag, season, method, orn):
        return f"{season} deer, {tag}: {orn}"
    return hunt_planner(os.path.join(raw, "list_g1_t1_2026.json"), sp, label, "d-huntlist-general-deer")


def elk(raw):
    def label(tag, season, method, orn):
        return f"{season} elk, {tag}: {method}, {orn}"
    return hunt_planner(os.path.join(raw, "list_g2_t1_2026.json"), lambda r: "elk", label, "d-huntlist-general-elk")


def _tables(pdf_path, title_re):
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        for p in pdf.pages:
            t = p.extract_text() or ""
            if re.search(title_re, t):
                for tb in p.extract_tables():
                    head = " ".join((c or "") for c in tb[0]) if tb else ""
                    if re.search(title_re, head):
                        yield tb


def split_units(cell):
    return [u.strip() for u in re.split(r"[,\n]+", cell) if u.strip()]


def bear_rows(pdf_path, fall_year):
    """[(units, fall range or None, spring range, extra note)] from 'Black Bear Seasons for Fall Y and Spring Y+1'."""
    title = rf"Black Bear Seasons for Fall {fall_year} and Spring {fall_year + 1}"
    rows, last_units = [], None
    for tb in _tables(pdf_path, title):
        for row in tb[2:]:
            cells = [(c or "").strip() for c in row]
            units, take, note = cells[0], cells[1], cells[-1]
            rs = ranges_in(take)
            if units:
                if len(rs) != 2:
                    raise SystemExit(f"bear row {units!r}: expected fall + spring take season, got {take!r}")
                last_units = split_units(units)
                rows.append((last_units, rs[0], rs[1], None))
            elif rs and last_units:  # continuation line, e.g. Unit 24 'June 8 - June 30 / Portion of Unit 24 only'
                if len(rs) != 1:
                    raise SystemExit(f"bear continuation row {cells!r}")
                rows.append((last_units, None, rs[0], " ".join(note.split()) or None))
    if not rows:
        raise SystemExit(f"no bear season table found in {pdf_path}")
    return rows


def bear(raw):
    out = []

    def add(groups, year, label, sid, note_extra=None):
        for (a_m, a_d, b_m, b_d, note), units in groups.items():
            s, e = md(a_m, a_d, year), md(b_m, b_d, year)
            ent = {"species": "bear", "label": label, "method": "all", "units": sorted(units, key=unit_sort),
                   "start": s.isoformat(), "end": e.isoformat(), "year": year}
            n = " ".join(x.rstrip(".") + "." for x in (note, note_extra) if x)
            if n:
                ent["note"] = n
            ent["sourceId"] = sid
            out.append(ent)

    r26 = bear_rows(os.path.join(raw, "seasons-rules-big-game-2026.pdf"), 2026)
    fall, spring27 = {}, {}
    for units, f, s, note in r26:
        if f:
            fall.setdefault((*f, None), []).extend(units)
        spring27.setdefault((*s, note), []).extend(units)
    NOTE = "Take season; females with young are protected. Dog, bait and second-tag rules vary by unit (see brochure)."
    add(fall, 2026, "General fall black bear take season", "d-rules-big-game-2026", NOTE)
    add(spring27, 2027, "General spring black bear take season", "d-rules-big-game-2026", NOTE)
    spring26 = {}
    for units, f, s, note in bear_rows(os.path.join(raw, "wb-seasons-rules-big-game-2025.pdf"), 2025):
        spring26.setdefault((*s, note), []).extend(units)
    add(spring26, 2026, "General spring black bear take season", "d-rules-big-game-2025", NOTE)
    out.sort(key=lambda e: (e["year"], e["start"], e["end"], e["units"][0]))
    return out


def lion(raw):
    title = r"July 2026 - June 2027\s+Mountain Lion Seasons"
    takes = set()
    n = 0
    for tb in _tables(os.path.join(raw, "seasons-rules-big-game-2026.pdf"), title):
        for row in tb[2:]:
            cells = [(c or "").strip() for c in row]
            if cells[0]:
                takes.add(tuple(ranges_in(cells[1].replace("1-", "1 -"))))
                n += 1
    if takes != {(("July", "1", "June", "30"),)} or n < 30:
        raise SystemExit(f"lion take seasons not uniform: {takes} ({n} rows)")
    return [{"species": "lion", "label": "General mountain lion take season (all units)", "method": "all",
             "start": "2026-07-01", "end": "2027-06-30", "year": 2026,
             "note": f"Printed as July 1 - June 30 for all {n} unit groups in the July 2026 - June 2027 table; hound "
                     "(dogs prohibited) periods and second-tag rules vary by unit.",
             "sourceId": "d-rules-big-game-2026"}]


def build(raw):
    return deer(raw) + elk(raw) + bear(raw) + lion(raw)


if __name__ == "__main__":
    import sys
    s = build(sys.argv[1])
    from collections import Counter
    print(Counter(e["species"] for e in s))
    for e in s:
        print(json.dumps(e, ensure_ascii=False)[:260])
