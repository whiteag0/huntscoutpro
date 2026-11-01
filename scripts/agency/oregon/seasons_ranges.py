#!/usr/bin/env python3
"""Add structured season ranges to Oregon draw rows (src/data/agency/oregon/draw/*.json).

Usage:
  python -I seasons_ranges.py <raw_draw_dir> <repo_root>          # rewrite draw/*.json in place
  python -I seasons_ranges.py <raw_draw_dir> <repo_root> --check  # report only, write nothing

<raw_draw_dir> is the folder draw_download.py fills (agency-raw/oregon/draw); it must hold
regs_<year>.txt (`pdftotext -layout` of the Oregon Big Game Hunting Regulations) for the years
in REGS_YEARS. Run after draw_parse.py (which writes the rows this script edits).

What it does, per row:
  1. seasonDates missing and the row's year has a retrieved booklet: read the hunt's OPEN SEASON
     cell from the booklet's controlled hunt tables (regs_hunt_seasons), including cells that
     wrap onto the lines above/below and cells that end ", 2027". The row is filled only when the
     hunt code appears once with a season and the booklet's "<year> TAGS" equals the draw report's
     quota (the same safety check draw_parse.py uses). The text is stored exactly as printed.
  2. seasonSourceId = d-or-regs-<year> for every row with seasonDates: ODFW's draw reports carry no
     season dates; all of them come from that year's regulations booklet.
  3. seasonRanges = parse(seasonDates, year), kept only if render(parse(text)) round-trips to the
     printed text (after normalizing "Sept."/"Sep." and spacing). Nothing is guessed: a text that
     does not parse or does not round-trip gets no seasonRanges.

Year rule: ODFW prints hunt seasons without a year unless the season ends in the next calendar
year, where the booklet prints the year on the end date ("Dec. 15 - Jan. 5, 2027",
"Jan. 2 - Jan. 17, 2027"). So: segments start in the row (draw) year; an end date earlier than its
start, or a segment starting before the previous one ended, rolls into the next year; a printed
year on the final end date is authoritative, and if it is one year later than computed the whole
season moves to that year (e.g. "Jan. 2 - Jan. 17, 2027" on a 2026 hunt).

The file format is preserved exactly: "[\\n" + ",\\n".join(compact rows) + "\\n]\\n", ASCII-escaped.
Re-running is idempotent.
"""
import datetime
import json
import os
import re
import sys

REGS_YEARS = [2022, 2023, 2024, 2026]  # the 2025 booklet was not retrievable (see draw_parse.py)
SPECIES = ("elk", "mule-deer", "whitetail", "pronghorn", "bear", "sheep", "goat")
MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8,
          "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}
ABBR = {1: "Jan.", 2: "Feb.", 3: "Mar.", 4: "Apr.", 5: "May", 6: "Jun.", 7: "Jul.", 8: "Aug.",
        9: "Sep.", 10: "Oct.", 11: "Nov.", 12: "Dec."}
MON_RE = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)"
SEG_RE = re.compile(rf"^(?:({MON_RE})\.?\s*)?(\d{{1,2}})(?:\s*-\s*(?:({MON_RE})\.?\s*)?(\d{{1,2}}))?$", re.I)


# ---------------------------------------------------------------- parse / render
def _clean(text):
    return re.sub(r"\s+", " ", text.replace("–", "-").replace("—", "-")).strip()


def parse(text, row_year):
    """'Sept. 15 - Nov. 30' (+ row year) -> [{'start': 'YYYY-09-15', 'end': 'YYYY-11-30'}]; None if unparseable."""
    if not text:
        return None
    t = _clean(text)
    explicit = None
    m = re.search(r",\s*(20\d\d)$", t)
    if m:
        explicit = int(m.group(1))
        t = t[: m.start()].strip()
    if re.search(r"\d{4}", t):
        return None  # a year anywhere but on the final end date: not a format this parser knows
    parts = [p for p in re.split(r"\s*(?:,|&|\band\b)\s*", t) if p]
    if not parts:
        return None
    segs = []
    cur_month = None
    for p in parts:
        sm = SEG_RE.match(p)
        if not sm:
            return None
        m1, d1, m2, d2 = sm.groups()
        smon = MONTHS[m1.lower()] if m1 else cur_month
        if smon is None:
            return None
        emon = MONTHS[m2.lower()] if m2 else smon
        sday = int(d1)
        eday = int(d2) if d2 else sday
        segs.append((smon, sday, emon, eday))
        cur_month = emon
    y = row_year
    prev_end = None
    out = []
    for smon, sday, emon, eday in segs:
        if prev_end and (y, smon, sday) <= prev_end:
            y += 1
        ey = y + 1 if (emon, eday) < (smon, sday) else y
        out.append([(y, smon, sday), (ey, emon, eday)])
        prev_end = (ey, emon, eday)
        y = ey
    if explicit is not None:
        shift = explicit - out[-1][1][0]
        if shift not in (0, 1):
            return None
        if shift:
            out = [[(a[0] + shift, a[1], a[2]), (b[0] + shift, b[1], b[2])] for a, b in out]
    res = []
    for a, b in out:
        try:
            s, e = datetime.date(*a), datetime.date(*b)
        except ValueError:
            return None
        if s > e:
            return None
        res.append({"start": s.isoformat(), "end": e.isoformat()})
    return res


def _norm(text):
    t = _clean(text).lower().replace("sept.", "sep.").replace("sept ", "sep. ")
    t = re.sub(r"\s*-\s*", "-", t)
    t = re.sub(r"\s*(,|&)\s*", r"\1 ", t)
    t = t.replace(" & ", ", ").replace("&", ", ")
    t = re.sub(r"\s+and\s+", ", ", t)
    t = t.replace(".", "")
    t = re.sub(r"([a-z])(\d)", r"\1 \2", t)  # "Aug.1" prints without the space
    return re.sub(r"\s+", " ", t).strip()


def render(ranges, row_year, compact=False, year_suffix=False):
    """Inverse of parse in ODFW's style ('Nov. 7 - Nov. 15'; compact: 'Nov. 7-8, 14-15')."""
    segs = []
    prev_month = None
    for g in ranges:
        s = datetime.date.fromisoformat(g["start"])
        e = datetime.date.fromisoformat(g["end"])
        if compact and s.month == e.month:
            head = f"{s.day}" if prev_month == s.month else f"{ABBR[s.month]} {s.day}"
            segs.append(head if s == e else f"{head}-{e.day}")
        else:
            segs.append(f"{ABBR[s.month]} {s.day}" if s == e else f"{ABBR[s.month]} {s.day} - {ABBR[e.month]} {e.day}")
        prev_month = e.month
    out = ", ".join(segs)
    if year_suffix:
        out += f", {datetime.date.fromisoformat(ranges[-1]['end']).year}"
    return out


def round_trips(text, ranges, row_year):
    if not ranges:
        return False
    ys = bool(re.search(r",\s*20\d\d\s*$", text))
    target = _norm(text)
    return any(_norm(render(ranges, row_year, compact=c, year_suffix=ys)) == target for c in (False, True))


# ---------------------------------------------------------------- booklet hunt tables
NUM = r"(?:[\d,]+|NEW|N/A)"
# a tags cell can hold two numbers when the booklet prints a corrected tag number next to the old one ("1,308 850")
NUM_CELL = re.compile(rf"^{NUM}(?: {NUM})*$")
STARTS_MONTH = re.compile(rf"^{MON_RE}\.? ?\d", re.I)
CODE_LIKE = re.compile(r"^(?:[1-9]\d\d(?:[A-Z][A-Z0-9-]*)?|[A-Z]{2}\d{3}[A-Z0-9-]*)$")  # not a bare year like 2027
FRAG = re.compile(rf"^(?:{MON_RE}\.? ?\d|\d{{1,2}}\b|20\d\d$)", re.I)


def cells(line):
    """Split a pdftotext -layout line into (start_col, text) cells at runs of 2+ spaces."""
    return [(m.start(), m.group()) for m in re.finditer(r"\S+(?: \S+)*", line)]


def regs_hunt_seasons(path, codes):
    """{code: [(season_text, tags)]} for the hunt codes given, read from the booklet's hunt tables.
    season_text is the OPEN SEASON cell joined across wrapped lines; tags = first number after it."""
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().split("\n")
    found = {}
    season_col = None
    for i, line in enumerate(lines):
        if "OPEN SEASON" in line:
            season_col = line.index("OPEN SEASON")
        cs = cells(line)
        if not cs or cs[0][1].split(" ")[0] not in codes:
            continue
        code = cs[0][1].split(" ")[0]
        # first cell may be "CODE NAME" when separated by a single space
        tail = []
        k = len(cs) - 1
        while k > 0 and NUM_CELL.match(cs[k][1]):
            tail.insert(0, cs[k])
            k -= 1
        if not tail:
            continue
        tags_col = tail[0][0]
        tags = tuple(int(x.replace(",", "")) for x in tail[0][1].split(" ") if re.match(r"^[\d,]+$", x))
        season = None
        if k > 0 and STARTS_MONTH.match(cs[k][1]):
            season = cs[k][1]
        elif k > 0:
            # a season cell may sit at the end of a bag-limit cell joined by one space only
            mm = re.search(rf"({MON_RE}\.? ?\d{{1,2}}\s?-\s?{MON_RE}\.? ?\d{{1,2}}(?:, 20\d\d)?)$", cs[k][1])
            if mm and season_col is not None and cs[k][0] + mm.start() >= season_col - 15:
                season = mm.group(1)
        lo = (season_col - 15) if season_col is not None else tags_col - 40

        def frag(j):
            if j < 0 or j >= len(lines):
                return None
            lc = cells(lines[j])
            if lc and (lc[0][1].split(" ")[0] in codes or CODE_LIKE.match(lc[0][1].split(" ")[0])):
                return None  # another hunt's row
            got = [t for c0, t in lc if lo <= c0 < tags_col and FRAG.match(t)]
            return " ".join(got) if got else None

        if season is None:
            above, below = frag(i - 1), frag(i + 1)
            if above and below:
                season = f"{above} {below}"
            else:
                season = None
        elif re.search(r"(,|-|&|\band)$", season):
            below = frag(i + 1)
            season = f"{season} {below}" if below else None
        elif frag(i + 1) and STARTS_MONTH.match(frag(i + 1)) and not frag(i - 1):
            # a date fragment right under a complete-looking cell could be a second season segment
            # (or the upper half of the next hunt's wrapped cell): do not use it
            season = None
        if season:
            found.setdefault(code, []).append((_clean(season), tags))
        else:
            found.setdefault(code, []).append((None, tags))
    return found


# ---------------------------------------------------------------- rows
def dump_rows(rows):
    return "[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=True) for r in rows) + "\n]\n"


def insert_after(row, after_key, items):
    """Return a copy of row with items (key, value) placed right after after_key (replacing old copies)."""
    keys = [k for k, _ in items]
    out = {}
    for k, v in row.items():
        if k in keys:
            continue
        out[k] = v
        if k == after_key:
            for kk, vv in items:
                out[kk] = vv
    return out


def process(raw, repo, check=False):
    draw_dir = os.path.join(repo, "src/data/agency/oregon/draw")
    files = {sp: os.path.join(draw_dir, f"{sp}.json") for sp in SPECIES}
    data = {sp: json.load(open(p)) for sp, p in files.items()}
    codes = {y: {r["huntCode"] for rows in data.values() for r in rows if r["year"] == y} for y in REGS_YEARS}
    table = {y: regs_hunt_seasons(os.path.join(raw, f"regs_{y}.txt"), codes[y]) for y in REGS_YEARS}
    stats = {}
    problems = []
    for sp, rows in data.items():
        new_rows = []
        for r in rows:
            y = r["year"]
            st = stats.setdefault((sp, y), {"rows": 0, "ranges": 0, "filled": 0, "no_text": 0, "no_parse": 0})
            st["rows"] += 1
            sid = f"d-or-regs-{y}" if y in REGS_YEARS else None
            if not r.get("seasonDates") and y in REGS_YEARS:
                cands = [c for c in table[y].get(r["huntCode"], []) if c[0]]
                quota = (r.get("total") or {}).get("quota")
                if len(cands) == 1 and quota is not None and quota in cands[0][1]:
                    note = r.get("note") or ""
                    add = f"Season dates from the {y} Oregon Big Game Hunting Regulations ({sid})."
                    r = insert_after(r, "sex" if "sex" in r else ("methodLabel" if "methodLabel" in r else "description"),
                                     [("seasonDates", cands[0][0])])
                    if add not in note:
                        r["note"] = (note + " " + add).strip()
                    st["filled"] += 1
                elif cands:
                    problems.append(f"{sp} {y} {r['huntCode']}: booklet season candidates {cands} vs quota {quota} - not filled")
            if r.get("seasonDates") and y in REGS_YEARS:
                # cross-check text already on the row against the booklet table
                cands = [c[0] for c in table[y].get(r["huntCode"], []) if c[0]]
                if cands and r["seasonDates"] not in cands and not r["huntCode"][0] in "LMN":
                    problems.append(f"{sp} {y} {r['huntCode']}: row '{r['seasonDates']}' vs booklet {cands}")
            if not r.get("seasonDates"):
                st["no_text"] += 1
                new_rows.append({k: v for k, v in r.items() if k not in ("seasonRanges", "seasonSourceId")})
                continue
            rng = parse(r["seasonDates"], y)
            items = []
            if rng and round_trips(r["seasonDates"], rng, y):
                items.append(("seasonRanges", rng))
                st["ranges"] += 1
            else:
                st["no_parse"] += 1
                problems.append(f"{sp} {y} {r['huntCode']}: '{r['seasonDates']}' does not parse/round-trip")
            if sid and sid != r["sourceId"]:
                items.append(("seasonSourceId", sid))
            new_rows.append(insert_after(r, "seasonDates", items))
        data[sp] = new_rows
    if not check:
        for sp, p in files.items():
            out = dump_rows(data[sp])
            if open(p).read() != out:
                with open(p, "w") as fh:
                    fh.write(out)
    return stats, problems


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    check = "--check" in sys.argv
    stats, problems = process(raw, repo, check)
    for (sp, y), st in sorted(stats.items()):
        print(f"{sp:10s} {y}: rows {st['rows']:4d}  seasonRanges {st['ranges']:4d}  filled now {st['filled']:3d}  "
              f"no seasonDates {st['no_text']:4d}  unparsed {st['no_parse']}")
    for p in problems:
        print("NOTE", p)


if __name__ == "__main__":
    main()
