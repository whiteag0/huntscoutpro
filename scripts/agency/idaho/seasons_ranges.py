#!/usr/bin/env python3
"""Add seasonRanges (and seasonSourceId) to src/data/agency/idaho/draw/<species>.json, and fill
season dates for controlled hunts the Hunt Planner list does not carry.

Usage (pdfplumber needed for the fill step):
  python -I seasons_ranges.py <raw_seasons_dir> <repo_root> [--check]

<raw_seasons_dir> = agency-raw/idaho/seasons, holding:
  seasons-rules-moose-sheep-goat-2025-26.pdf   (re-downloaded from idfg.idaho.gov 2026-10-31)
  wb-seasons-rules-big-game-<edition>.pdf     (IDFG big game brochures 2021-2025; the files are no longer
                                              at idfg.idaho.gov, copies from the Internet Archive, see SOURCES)

What it does, in order, for every row of every draw file:
 1. Fill (only rows with no seasonDates):
    - 2026 moose / bighorn sheep / mountain goat: the hunt table of the IDFG "2025 & 2026 Moose, Bighorn Sheep &
      Mountain Goat Seasons & Rules" (updated March 2026). The hunt number and tag count must match the
      drawing-odds row, and the hunt area must match (see msg_area_ok). draw_build.py's text regex missed hunts
      whose area cell carries a footnote letter or whose odds-table area label differs ("51-1" vs "51*",
      "20A" vs "20AL*"); those are matched here with the same rule set and a check that the odds table
      describes the area exactly as it did for the same hunt number in 2025.
    - Black bear (all years): spring hunts drawn in year Y are printed in the year Y-1 big game brochure
      ("Y Spring Black Bear Controlled Hunts"); fall hunts in the year Y brochure ("Y Fall ...").
      Hunt number, hunt area and tags must match (brochure "Unlimited" = an unlimited hunt).
    - Turkey 2024/2025: the "2024 & 2025 Spring/Fall Controlled Hunts" tables of the IDFG Upland Game, Turkey &
      Furbearer 2024 & 2025 Seasons & Rules (wb-seasons-rules-upland-game-2024-2025.pdf, one set of dates for both
      years). Hunt number, hunt area label and tags must match.
 2. seasonRanges: parse(seasonDates) for every row that has seasonDates (all years).
 3. seasonSourceId: the source the dates came from, when it is not the row's sourceId
    (d-huntlist for Hunt Planner dates; the brochure for brochure dates).
The file format (one JSON row per line, ensure_ascii=False) is kept. The script is idempotent.
--check reports what would change without writing.
"""
import datetime as dt
import glob
import json
import os
import re
import sys

ISO_SEG = re.compile(r"^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$")
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
MSG = "d-rules-msg-2025-26"
MSG_PDF = "seasons-rules-moose-sheep-goat-2025-26.pdf"
MSG_NOTE = "Season dates from the IDFG 2025 & 2026 Moose, Bighorn Sheep & Mountain Goat Seasons & Rules (updated March 2026)."
# brochure edition file -> sourceId. An edition prints its own year's fall bear hunts and next year's spring hunts.
BG_EDITIONS = {
    "wb-seasons-rules-big-game-2021.pdf": "d-rules-big-game-2021",
    "wb-seasons-rules-big-game-2022.pdf": "d-rules-big-game-2022",
    "wb-seasons-rules-big-game-2023-2024.pdf": "d-rules-big-game-2023",
    "wb-seasons-rules-big-game-2024.pdf": "d-rules-big-game-2024",
    "wb-seasons-rules-big-game-2025.pdf": "d-rules-big-game-2025",
}
BG_TITLES = {
    "d-rules-big-game-2021": "IDFG Idaho Big Game 2021 Seasons & Rules",
    "d-rules-big-game-2022": "IDFG Idaho Big Game 2022 Seasons & Rules",
    "d-rules-big-game-2023": "IDFG Idaho Big Game 2023 Seasons & Rules",
    "d-rules-big-game-2024": "IDFG Idaho Big Game 2024 Seasons & Rules",
    "d-rules-big-game-2025": "IDFG Idaho Big Game 2025 Seasons and Rules",
}
# Which source a row's existing seasonDates came from, by the sentence draw_build.py wrote into the note.
NOTE_SOURCES = [
    ("Moose, Bighorn Sheep & Mountain Goat Seasons & Rules", MSG),
    ("from the IDFG Idaho Big Game 2026 Seasons & Rules", "d-rules-big-game-2026"),
    ("from the IDFG Upland Game, Turkey & Furbearer 2026 & 2027 Seasons & Rules", "d-rules-upland-2026-27"),
]
for _sid, _t in BG_TITLES.items():
    NOTE_SOURCES.append((f"from the {_t}", _sid))


# ---------------------------------------------------------------- parser
def parse(text, row_year):
    """IDFG seasonDates text -> [{start, end}] in the agency's segment order, or None if the text is not
    entirely ISO 'YYYY-MM-DD to YYYY-MM-DD' segments joined by '; '. Idaho text already carries the year
    (January/February "Extra" hunts drawn in year Y are printed as Y+1 dates), so nothing is inferred;
    row_year is only used to reject a segment outside the draw year .. March of the next year."""
    if not isinstance(text, str) or not text.strip():
        return None
    out = []
    for seg in text.split("; "):
        m = ISO_SEG.match(seg)
        if not m:
            return None
        a, b = m.groups()
        try:
            da, db = dt.date.fromisoformat(a), dt.date.fromisoformat(b)
        except ValueError:
            return None
        if db < da:
            return None
        ok_year = da.year == row_year or (da.year == row_year + 1 and (da.month, da.day) <= (3, 31))
        if not ok_year:
            return None
        out.append({"start": a, "end": b})
    return out


def render(ranges):
    return "; ".join(f"{g['start']} to {g['end']}" for g in ranges)


def md_range(text, year):
    """'Aug 30 - Oct 13' / 'Apr 1 - May 22' (brochure) -> 'YYYY-MM-DD to YYYY-MM-DD' in one calendar year."""
    a, b = [x.strip() for x in re.split(r"\s*[-\u2013]\s*", text.strip())]
    da = dt.date(year, MONTHS[a[:3]], int(a.split()[1]))
    db = dt.date(year, MONTHS[b[:3]], int(b.split()[1]))
    if db < da:
        raise ValueError(f"range crosses a year end: {text}")
    return f"{da.isoformat()} to {db.isoformat()}"


# ---------------------------------------------------------------- brochure tables (pdfplumber)
def _tables(pdf_path, page_filter):
    import pdfplumber  # only needed for the fill step
    with pdfplumber.open(pdf_path) as pdf:
        for p in pdf.pages:
            t = p.extract_text() or ""
            if page_filter(t):
                for tb in p.extract_tables():
                    yield tb


def load_msg(raw):
    """hunt no -> list of (area cell, tags, season) from the moose/sheep/goat hunt tables."""
    out = {}
    for tb in _tables(os.path.join(raw, MSG_PDF), lambda t: "Hunt No." in t):
        for row in tb:
            cells = [(c or "").strip() for c in row]
            for i in range(0, len(cells) - 3):
                hn, area, tags, season = cells[i:i + 4]
                if re.fullmatch(r"[3-7]\d{3}", hn) and re.fullmatch(r"\d{1,3}", tags) and re.fullmatch(r"[A-Z][a-z]{2} \d{1,2}\s*-\s*[A-Z][a-z]{2} \d{1,2}", season):
                    out.setdefault(hn, []).append((area, int(tags), season))
    return out


def load_bear(raw):
    """(hunt year, hunt no) -> (area cell, tags text, season, sourceId) from big game brochure bear tables."""
    out = {}
    for fn, sid in BG_EDITIONS.items():
        path = os.path.join(raw, fn)
        if not os.path.exists(path):
            print(f"missing {fn}; bear fill for that edition skipped")
            continue
        for tb in _tables(path, lambda t: "Black Bear Controlled Hunts" in t):
            year = None
            for row in tb:
                cells = [(c or "").strip() for c in row]
                head = " ".join(cells)
                m = re.search(r"\b(20\d\d) (?:Youth only )?(?:Spring|Fall) Black Bear Controlled Hunts", head)
                if m:
                    year = int(m.group(1))
                    continue
                while cells and not cells[0]:  # some editions have an empty side-tab column first
                    cells = cells[1:]
                if len(cells) >= 4 and re.fullmatch(r"8[05]\d\d", cells[0]) and year:
                    key = (year, cells[0])
                    if key in out and out[key][:3] != (cells[1], cells[2], cells[3]):
                        raise SystemExit(f"conflicting brochure rows for {key}")
                    out[key] = (cells[1], cells[2], cells[3], sid)
    return out


UPL_EDITIONS = {"wb-seasons-rules-upland-game-2024-2025.pdf": "d-rules-upland-2024-25"}
UPL_TITLES = {"d-rules-upland-2024-25": "IDFG Upland Game, Turkey & Furbearer 2024 & 2025 Seasons & Rules"}


def load_turkey(raw):
    """(hunt year, hunt no) -> (area label, tags text, season, sourceId) from a two-year upland brochure's
    'YYYY & YYYY Spring/Fall Controlled Hunts' tables (one set of dates printed for both years)."""
    out = {}
    for fn, sid in UPL_EDITIONS.items():
        path = os.path.join(raw, fn)
        if not os.path.exists(path):
            print(f"missing {fn}; turkey fill for that edition skipped")
            continue
        for tb in _tables(path, lambda t: "Controlled Hunt Area Descriptions" in t):
            years = None
            for row in tb:
                cells = [(c or "").strip() for c in row]
                head = " ".join(cells)
                m = re.search(r"\b(20\d\d) & (20\d\d) (?:Spring|Fall) Controlled Hunts", head)
                if m:
                    years = (int(m.group(1)), int(m.group(2)))
                    continue
                if len(cells) >= 4 and re.fullmatch(r"9\d{3}", cells[0]) and years:
                    sm = re.search(r"([A-Z][a-z]+ \d{1,2}\s*[-\u2013]\s*[A-Z][a-z]+ \d{1,2})", cells[2])
                    if not sm:
                        continue
                    for y in years:
                        out[(y, cells[0])] = (cells[1].split(":")[0].strip(), cells[3], sm.group(1), sid)
    return out


def odds_area(row):
    m = re.search(r"Hunt Area ([^:]+?)(?::|$| \()", row["description"])
    return m.group(1).strip() if m else None


def area_text(row):
    """Hunt-area boundary text of a row's description, without the antler/ram class draw_build appends."""
    d = row["description"]
    if ": " not in d:
        return None
    return re.sub(r" \((?:Antlered|Antlerless|Rams Only|Either-sex|Antlerless or Antlered)\)$", "", d.split(": ", 1)[1])


def bear_area_ok(cell, odds):
    root = re.sub(r"\s*\(See pg \d+\)", "", cell).strip()
    root = re.sub(r"[ab]$", "", root)
    return root == odds


def msg_area_ok(cell, odds, same_desc_prev_year):
    """Brochure area cell ('20AL*a', '51*', '29*') vs odds-table area label ('20A', '51-1', '29, 30, ...')."""
    root = re.sub(r"[*a]+$", "", cell)
    if root == odds:
        return True, "exact"
    first = odds.split(",")[0].strip()
    cands = {root}
    if root.endswith("L"):
        cands.add(root[:-1])  # late-hunt suffix (5021-5028)
    if first in cands or first in {c + "-1" for c in cands}:
        return same_desc_prev_year, "relabeled"
    return False, "differs"


# ---------------------------------------------------------------- row helpers
def with_keys(row, updates):
    """Return row with seasonRanges / seasonSourceId right after seasonDates; a new seasonDates goes right before
    choice (where draw_build.py writes it)."""
    sd = updates.get("seasonDates", row.get("seasonDates"))
    block = {"seasonDates": sd}
    for k in ("seasonRanges", "seasonSourceId"):
        if updates.get(k):
            block[k] = updates[k]
    out = {}
    placed = False
    for k, v in row.items():
        if k in ("seasonRanges", "seasonSourceId"):
            continue
        if k == "seasonDates" or (k == "choice" and not placed and "seasonDates" not in row):
            out.update(block)
            placed = True
            if k == "seasonDates":
                continue
        out[k] = v
    assert placed
    return out


def dates_source(row):
    n = row.get("note") or ""
    for needle, sid in NOTE_SOURCES:
        if needle in n:
            return sid
    return "d-huntlist"


def dump(rows):
    return "[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=False) for r in rows) + "\n]\n"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    raw, repo = args
    ddir = os.path.join(repo, "src", "data", "agency", "idaho", "draw")
    msg = load_msg(raw)
    bear = load_bear(raw)
    turkey = load_turkey(raw)
    report = {}

    def bump(k):
        report[k] = report.get(k, 0) + 1

    for path in sorted(glob.glob(os.path.join(ddir, "*.json"))):
        sp = os.path.basename(path)[:-5]
        with open(path, encoding="utf-8") as fh:
            rawtext = fh.read()
        rows = json.loads(rawtext)
        assert dump(rows) == rawtext, f"{path}: unexpected file format"
        prev = {(r["year"], r["huntCode"]): r for r in rows}
        new_rows = []
        for r in rows:
            upd = {}
            note_add = None
            sd = r.get("seasonDates")
            if not sd and sp in ("moose", "sheep", "goat") and r["year"] == 2026 and r["huntCode"] in msg:
                cands = msg[r["huntCode"]]
                oa = odds_area(r)
                quota = (r.get("total") or {}).get("quota")
                p = prev.get((2025, r["huntCode"]))
                same_desc = bool(p and area_text(p) and area_text(p) == area_text(r))
                hits = []
                for cell, tags, season in cands:
                    ok, why = msg_area_ok(cell, oa or "", same_desc)
                    if ok and tags == quota:
                        hits.append((cell, season, why))
                if len(hits) == 1:
                    cell, season, why = hits[0]
                    sd = md_range(season, 2026)
                    upd["seasonDates"] = sd
                    upd["seasonSourceId"] = MSG
                    note_add = (MSG_NOTE[:-1] + f" ({quota} tags), which labels the hunt area \"{cell.rstrip('*a')}\" "
                                f"(drawing-odds table: \"{oa}\").") if why != "exact" else MSG_NOTE[:-1] + f" ({quota} tags)."
                    bump(f"fill_msg_{sp}")
                else:
                    bump(f"nofill_msg_{sp}")
                    print(f"  no MSG match {sp} {r['year']} {r['huntCode']} odds area {oa!r} quota {quota}: brochure {cands} same_desc={same_desc}")
            elif not sd and sp == "bear" and (r["year"], r["huntCode"]) in bear:
                cell, tags, season, sid = bear[(r["year"], r["huntCode"])]
                oa = odds_area(r)
                quota = (r.get("total") or {}).get("quota")
                tags_ok = (tags == "Unlimited") or (tags.isdigit() and int(tags) == quota)
                if bear_area_ok(cell, oa or "") and tags_ok:
                    sd = md_range(season, r["year"])
                    upd["seasonDates"] = sd
                    upd["seasonSourceId"] = sid
                    t = "unlimited" if tags == "Unlimited" else f"{tags} tags"
                    note_add = f"Season dates from the {BG_TITLES[sid]} ({r['year']} hunt table: hunt area {re.sub(r'[ab]$', '', re.sub(r' *[(]See pg [0-9]+[)]', '', cell))}, {t})."
                    bump("fill_bear")
                else:
                    bump("nofill_bear")
                    print(f"  no bear match {r['year']} {r['huntCode']} odds area {oa!r} quota {quota}: brochure {cell!r} {tags!r}")
            elif not sd and sp == "turkey" and (r["year"], r["huntCode"]) in turkey:
                label, tags, season, sid = turkey[(r["year"], r["huntCode"])]
                oa = odds_area(r)
                quota = (r.get("total") or {}).get("quota")
                if label == oa and tags.isdigit() and int(tags) == quota:
                    sd = md_range(season, r["year"])
                    upd["seasonDates"] = sd
                    upd["seasonSourceId"] = sid
                    note_add = f"Season dates from the {UPL_TITLES[sid]} (hunt area {label}, {tags} tags; one set of dates printed for 2024 and 2025)."
                    bump("fill_turkey")
                else:
                    bump("nofill_turkey")
                    print(f"  no turkey match {r['year']} {r['huntCode']} odds area {oa!r} quota {quota}: brochure {label!r} {tags!r}")
            if sd:
                rng = parse(sd, r["year"])
                if rng is None:
                    bump(f"unparsed_{sp}")
                    print(f"  UNPARSED {sp} {r['year']} {r['huntCode']}: {sd!r}")
                else:
                    assert render(rng) == sd, (sd, rng)
                    upd["seasonRanges"] = rng
                    src = upd.get("seasonSourceId") or r.get("seasonSourceId") or dates_source(r)
                    if src != r["sourceId"]:
                        upd["seasonSourceId"] = src
                    bump(f"ranges_{sp}")
            else:
                bump(f"nodates_{sp}_{r['year']}")
            nr = with_keys(r, upd) if upd else dict(r)
            if note_add and note_add not in (nr.get("note") or ""):
                nr["note"] = (note_add + " " + nr["note"]) if nr.get("note") else note_add
                # keep note right before sourceId, as draw_build.py writes it
                sid_v = nr.pop("sourceId")
                nr["sourceId"] = sid_v
            new_rows.append(nr)
        out = dump(new_rows)
        if out != rawtext:
            bump(f"changed_file_{sp}")
            if not check:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(out)
    for k in sorted(report):
        print(f"{k}: {report[k]}")


if __name__ == "__main__":
    main()
