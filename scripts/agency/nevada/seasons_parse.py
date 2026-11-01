#!/usr/bin/env python3
"""Nevada season dates: draw-row seasonRanges and draw-meta.seasons[].

Usage:
  python -I scripts/agency/nevada/seasons_parse.py --test
  python -I scripts/agency/nevada/seasons_parse.py <seasons_raw_dir> <repo_root>

Run after draw_parse.py and draw_meta.py. <seasons_raw_dir> holds the NDOW Commission Regulation
PDFs (downloaded from https://www.ndow.org/wp-content/uploads/...; see SEASON_DOCS):
  CR-26-11-2026-2027-Big-Game-Quota-NBWC-Approved-May-2026.pdf        (2026-2027 seasons by hunt + unit group)
  CR-26-09-2026-2027-NR-Guided-Seasons-and-Quotas-NBWC-Approved-January-2026.pdf  (hunt 1235)
  CR-26-12-2026-Black-Bear-Seasons-and-Quotas-NBWC-Approved-May-2026.pdf
  CR26-13-Upland-Furbearer-Seasons.pdf                                (wild turkey fall 2026 / spring 2027)

1. Draw rows (src/data/agency/nevada/draw/<species>.json, every year): the agency's `seasonDates`
   text is parsed into `seasonRanges` (inserted right after seasonDates; nothing else changes).
   Formats in the data: "Aug 01 - Sep 30", "Sep 01, 2025 - Oct 31, 2025", and junior hunts with
   segments joined by "; ". A year printed in the text is used as is. Without a year, the segment
   is placed in NDOW's season year that starts with the draw year: a start in January-March is in
   draw year + 1 (NDOW's own 2025 Hunt Data prints "Jan 05, 2026 - Feb 20, 2026" for hunt 3161,
   and the 2022-2024 no-year rows carry the same Jan 5 - Feb 20 sheep / Jan 2 - Jan 31 elk seasons),
   otherwise the draw year; the end rolls into the next year when it is earlier than the start.
   Every parse is rendered back into the row's own format and must equal seasonDates exactly.
   Text that is not a date range ("See Regulations") is left without seasonRanges and counted.
   Exception, junior hunts 1105/1107 in the latest draw year (2025): NDOW's 2025 bonus point report
   prints only the overall span ("Aug 10, 2025 - Jan 01, 2026" for 1107 unit 015), which hides closed
   gaps between the archery, muzzleloader and any-legal-weapon segments. Those rows get one labelled
   range per segment from CR 25-13 (seasonSourceId d-cr-25-13), and only when the segments' first start
   and last end equal the row's printed span.
2. draw-meta.seasons[] is rebuilt from the 2026-2027 regulations: CR 26-11 tables are read word by
   word (pdfplumber; superscript footnote letters are dropped), each row's quota is summed and must
   equal the table's printed TOTAL, hunts with the same species + hunt + weapon + dates are grouped
   with their unit groups. NR guided (CR 26-09) the same way; bear (CR 26-12) and turkey (CR 26-13)
   are transcribed below and each printed date string is asserted to occur in the PDF text.
"""
import datetime as dt
import json
import os
import re
import sys

sys.dont_write_bytecode = True

MON = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONRE = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"
SEG_RE = re.compile(r"(?:\b(Arch|Muzz|ALW)\s*-\s*)?" + MONRE + r"\s+(\d{1,2})(?:,\s*(\d{4}))?\s*[-–]\s*" + MONRE + r"\s+(\d{1,2})(?:,\s*(\d{4}))?")

SPECIES_FILES = ["elk", "mule-deer", "pronghorn", "moose", "bear", "sheep", "goat"]


# ------------------------------------------------------------------ season text parser
def _date(y, m, d):
    return dt.date(y, m, d)


def parse_segment(m, season_year):
    """m: SEG_RE match. season_year: first calendar year of NDOW's season year (= draw year)."""
    sm, sd, sy, em, ed, ey = MON[m.group(2).lower()], int(m.group(3)), m.group(4), MON[m.group(5).lower()], int(m.group(6)), m.group(7)
    if sy:
        y0 = int(sy)
    elif ey:
        y0 = int(ey) if (sm, sd) <= (em, ed) else int(ey) - 1
    else:
        y0 = season_year + 1 if sm <= 3 else season_year
    start = _date(y0, sm, sd)
    if ey:
        end = _date(int(ey), em, ed)
    else:
        end = _date(y0, em, ed)
        if end < start:
            end = _date(y0 + 1, em, ed)
    if end < start:
        raise ValueError(f"end before start in {m.group(0)!r}")
    return start, end, m.group(1)


def parse_season_text(text, season_year):
    """Parse a draw row's seasonDates. Returns [(start, end)] or None if the text is not dates."""
    parts = [p.strip() for p in text.split(";")]
    out = []
    for p in parts:
        m = SEG_RE.fullmatch(p)
        if not m:
            return None
        s, e, _ = parse_segment(m, season_year)
        out.append((s, e))
    return out


def render(ranges, with_year):
    def one(d):
        return f"{MON_ABBR[d.month - 1]} {d.day:02d}" + (f", {d.year}" if with_year else "")
    return "; ".join(f"{one(s)} - {one(e)}" for s, e in ranges)


def ranges_for_row(text, year):
    """-> (seasonRanges list, None) or (None, reason)."""
    rng = parse_season_text(text, year)
    if rng is None:
        return None, "not a date range"
    with_year = bool(re.search(r"\d{4}", text))
    back = render(rng, with_year)
    if back != text:
        return None, f"round-trip mismatch {back!r}"
    return [{"start": s.isoformat(), "end": e.isoformat()} for s, e in rng], None


def self_test():
    cases = [
        ("Aug 01 - Sep 30", 2025, [("2025-08-01", "2025-09-30")]),
        ("Oct 01 - Jan 01", 2025, [("2025-10-01", "2026-01-01")]),
        ("Sep 01, 2025 - Oct 31, 2025", 2025, [("2025-09-01", "2025-10-31")]),
        ("Jan 05, 2026 - Feb 20, 2026", 2025, [("2026-01-05", "2026-02-20")]),
        ("Jan 05 - Feb 20", 2024, [("2025-01-05", "2025-02-20")]),
        ("Jan 02 - Jan 31", 2022, [("2023-01-02", "2023-01-31")]),
        ("Nov 20, 2025 - Jan 01, 2026", 2025, [("2025-11-20", "2026-01-01")]),
        ("Aug 10 - Sep 09; Sep 10 - Oct 04; Oct 05 - Nov 05", 2024,
         [("2024-08-10", "2024-09-09"), ("2024-09-10", "2024-10-04"), ("2024-10-05", "2024-11-05")]),
        ("Dec 01 - Dec 10; Dec 11 - Dec 20; Dec 21 - Jan 01", 2024,
         [("2024-12-01", "2024-12-10"), ("2024-12-11", "2024-12-20"), ("2024-12-21", "2025-01-01")]),
        ("Aug 10, 2025 - Sep 09, 2025; Sep 10, 2025 - Oct 04, 2025", 2025, [("2025-08-10", "2025-09-09"), ("2025-09-10", "2025-10-04")]),
    ]
    bad = 0
    for text, y, want in cases:
        got, why = ranges_for_row(text, y)
        g = [(r["start"], r["end"]) for r in got] if got else why
        if g != want:
            bad += 1
            print("FAIL", text, y, g, want)
    for text in ["See Regulations", "", "Aug 1 - Sep 30"]:  # last: not NDOW's zero-padded row format -> no round trip
        got, why = ranges_for_row(text, 2025)
        if got is not None:
            bad += 1
            print("FAIL should reject", repr(text), got)
    # CR (regulation) formats used for seasons[]
    for text, y, want in [("Sept 1 - Nov 30", 2026, ("2026-09-01", "2026-11-30")), ("Oct 1 - Jan 1", 2026, ("2026-10-01", "2027-01-01")),
                          ("Jan 5 - Feb 20", 2026, ("2027-01-05", "2027-02-20")), ("ALW -Oct 5 - Nov 5", 2026, ("2026-10-05", "2026-11-05")),
                          ("Nov. 1 – Nov 30, 2026", 2026, ("2026-11-01", "2026-11-30")), ("March 20 – May 2, 2027", 2026, ("2027-03-20", "2027-05-02"))]:
        m = SEG_RE.search(text)
        s, e, _ = parse_segment(m, y)
        if (s.isoformat(), e.isoformat()) != want:
            bad += 1
            print("FAIL CR", text, s, e, want)
    print(f"self-test: {len(cases) + 9} cases, {bad} failures")
    return bad == 0


# ------------------------------------------------------------------ draw rows
def dump_rows(rows):
    return "[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=False) for r in rows) + "\n]\n"


def with_ranges(r, ranges):
    out = {}
    for k, v in r.items():
        if k in ("seasonRanges", "seasonSourceId"):
            continue
        out[k] = v
        if k == "seasonDates":
            out["seasonRanges"] = ranges
            if r.get("seasonSourceId"):
                out["seasonSourceId"] = r["seasonSourceId"]
    return out


SEG_LABEL = {"Arch": "Archery", "Muzz": "Muzzleloader", "ALW": "Any legal weapon"}
JUNIOR_SEGMENTED = {2025: ("CR25-13-2025-Big-Game-Quotas-NBWC-Approved-May-2025-FINAL.pdf", "d-cr-25-13")}


def junior_segments(raw):
    """{(year, hunt, unit-without-spaces): [(start, end, prefix)]} for hunts 1105/1107 from the quota CR."""
    out = {}
    for year, (fn, sid) in JUNIOR_SEGMENTED.items():
        tables = [t for t in parse_cr_tables(os.path.join(raw, fn), year) if t["hunt"] in ("1105", "1107")]
        probs = check_tables(tables, fn)
        if probs or len(tables) != 2:
            raise SystemExit(f"{fn}: junior tables not clean: {probs}")
        for t in tables:
            for r in t["rows"]:
                out[(year, t["hunt"], r["unit"].replace(" ", ""))] = ([(a, b, p) for a, b, p, _ in r["segs"]], sid)
    return out


def update_rows(repo, raw):
    d = os.path.join(repo, "src/data/agency/nevada/draw")
    junior = junior_segments(raw)
    report = {}
    failures = []
    for sp in SPECIES_FILES:
        p = os.path.join(d, f"{sp}.json")
        raw = open(p).read()
        rows = json.loads(raw)
        latest = max(r["year"] for r in rows)
        new = []
        st = {"years": {}, "latest": latest}
        for r in rows:
            y = st["years"].setdefault(r["year"], {"rows": 0, "ranges": 0, "empty": []})
            y["rows"] += 1
            base = {k: v for k, v in r.items() if k != "seasonRanges"}
            txt = r.get("seasonDates")
            if not txt:
                y["empty"].append((r["huntCode"], "no seasonDates"))
                new.append(base)
                continue
            rng, why = ranges_for_row(txt, r["year"])
            if rng is None:
                y["empty"].append((r["huntCode"], f"{txt!r}: {why}"))
                if why != "not a date range":
                    failures.append((sp, r["year"], r["huntCode"], txt, why))
                new.append(base)
                continue
            hunt, _, unit = r["huntCode"].partition(" ")
            jk = (r["year"], hunt, unit.replace(" ", ""))
            if hunt in ("1105", "1107") and r["year"] in JUNIOR_SEGMENTED:
                if jk not in junior:
                    failures.append((sp, r["year"], r["huntCode"], txt, "no CR segment row"))
                else:
                    segs, sid = junior[jk]
                    if segs[0][0].isoformat() != rng[0]["start"] or max(e for _, e, _ in segs).isoformat() != rng[-1]["end"]:
                        failures.append((sp, r["year"], r["huntCode"], txt, f"CR segments {segs} do not span the printed dates"))
                    else:
                        rng = [{"start": a.isoformat(), "end": b.isoformat(), "label": SEG_LABEL[p]} for a, b, p in segs]
                        base["seasonSourceId"] = sid
                        y.setdefault("segmented", 0)
                        y["segmented"] += 1
            y["ranges"] += 1
            new.append(with_ranges(base, rng))
        # only-add check: removing seasonRanges must give back the original rows
        for a, b in zip(rows, new):
            if {k: v for k, v in a.items() if k not in ("seasonRanges", "seasonSourceId")} != {k: v for k, v in b.items() if k not in ("seasonRanges", "seasonSourceId")}:
                raise SystemExit(f"row changed beyond seasonRanges: {sp} {a['huntCode']}")
        open(p, "w").write(dump_rows(new))
        report[sp] = st
    return report, failures


# ------------------------------------------------------------------ regulation tables
SEASON_DOCS = {
    "cr2611": ("CR-26-11-2026-2027-Big-Game-Quota-NBWC-Approved-May-2026.pdf", "d-cr-26-11"),
    "cr2609": ("CR-26-09-2026-2027-NR-Guided-Seasons-and-Quotas-NBWC-Approved-January-2026.pdf", "d-cr-26-09"),
    "cr2612": ("CR-26-12-2026-Black-Bear-Seasons-and-Quotas-NBWC-Approved-May-2026.pdf", "d-cr-26-12"),
    "cr2613": ("CR26-13-Upland-Furbearer-Seasons.pdf", "d-cr-26-13"),
}

# hunt number -> (species, residency, label). Label wording follows the CR table titles.
HUNTS = {
    "2151": ("pronghorn", "resident", "Resident antelope, horns longer than ears - any legal weapon"),
    "2251": ("pronghorn", "nonresident", "Nonresident antelope, horns longer than ears - any legal weapon"),
    "2171": ("pronghorn", "resident", "Resident antelope, horns longer than ears - muzzleloader"),
    "2271": ("pronghorn", "nonresident", "Nonresident antelope, horns longer than ears - muzzleloader"),
    "2161": ("pronghorn", "resident", "Resident antelope, horns longer than ears - archery"),
    "2261": ("pronghorn", "nonresident", "Nonresident antelope, horns longer than ears - archery"),
    "2181": ("pronghorn", "resident", "Resident antelope, horns shorter than ears - any legal weapon"),
    "2191": ("pronghorn", "resident", "Resident junior antelope, horns shorter than ears - any legal weapon"),
    "4102": ("elk", "resident", "Resident elk antlered - any legal weapon depredation hunt"),
    "4151": ("elk", "resident", "Resident elk antlered - any legal weapon"),
    "4251": ("elk", "nonresident", "Nonresident elk antlered - any legal weapon"),
    "4156": ("elk", "resident", "Resident elk antlered - muzzleloader"),
    "4256": ("elk", "nonresident", "Nonresident elk antlered - muzzleloader"),
    "4161": ("elk", "resident", "Resident elk antlered - archery"),
    "4261": ("elk", "nonresident", "Nonresident elk antlered - archery"),
    "4651": ("elk", "resident", "Resident elk spike - any legal weapon"),
    "4181": ("elk", "resident", "Resident elk antlerless - any legal weapon"),
    "4281": ("elk", "nonresident", "Nonresident elk antlerless - any legal weapon"),
    "4176": ("elk", "resident", "Resident elk antlerless - muzzleloader"),
    "4276": ("elk", "nonresident", "Nonresident elk antlerless - muzzleloader"),
    "4111": ("elk", "resident", "Resident elk antlerless - archery"),
    "4211": ("elk", "nonresident", "Nonresident elk antlerless - archery"),
    "4107": ("elk", "resident", "Resident elk antlerless - any legal weapon depredation hunt"),
    "10151": ("moose", "resident", "Resident moose antlered - any legal weapon"),
    "3151": ("sheep", "resident", "Resident Nelson (desert) bighorn sheep any ram - any legal weapon"),
    "3251": ("sheep", "nonresident", "Nonresident Nelson (desert) bighorn sheep any ram - any legal weapon"),
    "3161": ("sheep", "resident", "Resident Nelson (desert) bighorn sheep any ram - archery"),
    "3171": ("sheep", "resident", "Resident Nelson (desert) bighorn sheep management ram, one horn - any legal weapon"),
    "3172": ("sheep", "resident", "Resident Nelson (desert) bighorn sheep management ram - any legal weapon"),
    "3181": ("sheep", "resident", "Resident Nelson (desert) bighorn sheep any ewe - any legal weapon"),
    "3281": ("sheep", "nonresident", "Nonresident Nelson (desert) bighorn sheep any ewe - any legal weapon"),
    "8151": ("sheep", "resident", "Resident California bighorn sheep any ram - any legal weapon"),
    "8251": ("sheep", "nonresident", "Nonresident California bighorn sheep any ram - any legal weapon"),
    "8172": ("sheep", "resident", "Resident California bighorn sheep management ram - any legal weapon"),
    "9151": ("sheep", "resident", "Resident Rocky Mountain bighorn sheep any ram - any legal weapon"),
    "7151": ("goat", "resident", "Resident mountain goat, any goat - any legal weapon"),
    "7251": ("goat", "nonresident", "Nonresident mountain goat, any goat - any legal weapon"),
    "1105": ("mule-deer", "resident", "Resident junior mule deer, primitive antlered only - archery or muzzleloader"),
    "1106": ("mule-deer", "resident", "Resident junior mule deer, antlered only - any legal weapon"),
    "1107": ("mule-deer", "resident", "Resident junior mule deer, antlered only - archery, muzzleloader or any legal weapon classic hunt"),
    "1331": ("mule-deer", "resident", "Resident mule deer antlered - any legal weapon"),
    "1332": ("mule-deer", "nonresident", "Nonresident mule deer antlered - any legal weapon"),
    "1371": ("mule-deer", "resident", "Resident mule deer antlered - muzzleloader"),
    "1372": ("mule-deer", "nonresident", "Nonresident mule deer antlered - muzzleloader"),
    "1341": ("mule-deer", "resident", "Resident mule deer antlered - archery"),
    "1342": ("mule-deer", "nonresident", "Nonresident mule deer antlered - archery"),
    "1235": ("mule-deer", "nonresident", "Restricted nonresident guided mule deer antlered - any legal weapon (must hunt with a licensed guide)"),
}
SEG_METHOD = {"Arch": "archery", "Muzz": "muzzleloader", "ALW": None}
SEG_NAME = {"Arch": "archery segment", "Muzz": "muzzleloader segment", "ALW": "any legal weapon segment"}
HEADER_RE = re.compile(r"(Any Legal Weapon|Archery|Muzzleloader)\b.*?\b(\d{4,5})\*?\s*$")
SKIP_RE = re.compile(r"^\s*(CR \d\d-\d\d(, Big Game Quota Approved)?|\d{1,2}|\d+ of \d+|Unit Group.*|20\d\d Quota|Recommended|Page \d+)\s*$")


def header_method(line):
    if re.search(r"Any Legal Weapon", line):
        return None  # ALW is not limited to one weapon
    if "Archery or Muzzleloader" in line:
        return None
    if "Archery" in line:
        return "archery"
    if "Muzzleloader" in line:
        return "muzzleloader"
    return None


def pdf_lines(path):
    """[(page, top, [(x0, x1, text)])] with superscript (footnote) characters removed."""
    import pdfplumber
    out = []
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            p = page.filter(lambda o: not (o.get("object_type") == "char" and o.get("size", 10) < 8))
            words = p.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
            rows = []
            for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
                if rows and abs(rows[-1][0] - w["top"]) <= 2.5:
                    rows[-1][1].append(w)
                else:
                    rows.append([w["top"], [w]])
            for top, ws in rows:
                ws.sort(key=lambda w: w["x0"])
                out.append((pi, top, [(w["x0"], w["x1"], w["text"]) for w in ws]))
    return out


def join_words(ws):
    s = ""
    last = None
    for x0, x1, t in ws:
        if last is not None:
            s += "   " if x0 - last > 6 else " "
        s += t
        last = x1
    return s


def clean_unit(u):
    u = u.replace("*", "").replace("†", "").replace("–", "-")
    u = re.sub(r"\s+", " ", u)
    u = re.sub(r" ,", ",", u).strip(" ,")
    return u


def parse_cr_tables(path, season_year=2026):
    """Yield dicts: hunt, rows=[{unit, quota, segs=[(start,end,prefix)]}], total, notes."""
    lines = pdf_lines(path)
    tables = []
    cur = None
    in_table = False
    qx = None
    for pi, top, ws in lines:
        text = join_words(ws)
        if HEADER_RE.search(text) and not SEG_RE.search(text):
            cur = {"hunt": HEADER_RE.search(text).group(2), "header": text, "method": header_method(text), "lines": [], "total": None,
                   "season_col": None}
            tables.append(cur)
            in_table = False
            continue
        if cur is None:
            continue
        if text.startswith("Unit Group"):
            in_table = True
            qx = max(x0 for x0, x1, t in ws if t in ("2026", "2026-2027", "Quota", "Approved")) if any(t == "Quota" for _, _, t in ws) else None
            for x0, x1, t in ws:
                if t in ("2026-2027", "2024", "2025-2026"):
                    cur["season_col"] = cur["season_col"] or t
            # quota column: x of the last header word group ("2026 Approved Quota" / "2026-2027 Quota")
            hdr = [w for w in ws if w[2] in ("2026", "2026-2027")]
            # 3171's header reads "2024 Season ... Recommended" with "2026 Quota" on the line above
            qx = hdr[-1][0] if hdr else ws[-1][0]
            continue
        if not in_table:
            continue
        if SKIP_RE.match(text):
            continue
        # a total row: "TOTAL 2,222", or (hunts 4151/4156) the bare total under the quota column
        bare_total = len(ws) == 1 and re.fullmatch(r"[\d,]+", ws[0][2]) and qx is not None and ws[0][0] >= qx - 25
        if re.search(r"\bTOTAL\b", text, re.I) or bare_total:  # 1342 prints "TOTAl"
            m = re.search(r"([\d,]+)\s*$", text)
            cur["total"] = int(m.group(1).replace(",", "")) if m else None
            in_table = False
            continue
        rowlike = SEG_RE.search(text) or re.match(r"^\s*\d{3}", text)
        if not rowlike:
            in_table = False
            continue
        # quota = the line's last word when it is a number standing in the quota column, or set apart by a
        # wide gap (continuation pages shift the columns); never a unit ending a "101 - 103" / "081," run
        quota = None
        rest = list(ws)
        x0, x1, t = ws[-1]
        if re.fullmatch(r"\d[\d,]*", t) and len(ws) > 1:
            px0, px1, pt = ws[-2]
            if not (pt in ("-", "–") or pt.endswith(",")) and ((qx is not None and x0 >= qx - 25) or x0 - px1 > 15):
                quota = int(t.replace(",", ""))
                rest = ws[:-1]
        elif re.fullmatch(r"\d[\d,]*", t) and qx is not None and x0 >= qx - 25:
            quota = int(t.replace(",", ""))
            rest = []
        rt = join_words(rest)
        segs = []
        for m in SEG_RE.finditer(rt):
            s, e, pre = parse_segment(m, season_year)
            segs.append((s, e, pre, m.group(0)))
        unit = SEG_RE.sub(" ", rt)
        cur["lines"].append({"page": pi, "top": top, "quota": quota, "segs": segs, "unit": unit, "text": text})
    # assemble rows: anchors = lines with a quota; other lines join the nearest anchor on the same page
    for t in tables:
        anchors = [ln for ln in t["lines"] if ln["quota"] is not None]
        rows = [{"unit": "", "quota": a["quota"], "segs": [], "_a": a} for a in anchors]
        for ln in t["lines"]:
            same = [r for r in rows if r["_a"]["page"] == ln["page"]]
            if not same:
                raise SystemExit(f"{os.path.basename(path)} hunt {t['hunt']}: orphan line {ln['text']!r}")
            r = min(same, key=lambda r: (abs(r["_a"]["top"] - ln["top"]), -r["_a"]["top"]))
            r.setdefault("_parts", []).append(ln)
        for r in rows:
            parts = sorted(r.pop("_parts"), key=lambda ln: ln["top"])
            r["unit"] = clean_unit(" ".join(p["unit"] for p in parts))
            r["segs"] = [s for p in parts for s in p["segs"]]
            r.pop("_a")
        t["rows"] = rows
    return tables


def check_tables(tables, name):
    problems = []
    for t in tables:
        if t["hunt"] not in HUNTS:
            problems.append(f"{name}: unknown hunt {t['hunt']} ({t['header']})")
        for r in t["rows"]:
            if not r["segs"] or not r["unit"]:
                problems.append(f"{name} {t['hunt']}: incomplete row {r}")
        s = sum(r["quota"] for r in t["rows"])
        if t["total"] is not None and s != t["total"]:
            problems.append(f"{name} {t['hunt']}: quotas sum {s} != printed TOTAL {t['total']}")
    return problems


def tables_to_seasons(tables, source_id, year=2026, extra_note=None):
    groups = {}
    order = []
    for t in tables:
        sp, res, label = HUNTS[t["hunt"]]
        for r in t["rows"]:
            for s, e, pre, raw in r["segs"]:
                method = SEG_METHOD[pre] if pre else t["method"]
                lab = f"{label} (hunt {t['hunt']})" + (f", {SEG_NAME[pre]}" if pre else "")
                key = (t["hunt"], lab, method, s, e)
                if key not in groups:
                    groups[key] = {"species": sp, "label": lab, "units": [], "huntCodes": [t["hunt"]], "residency": res,
                                   "start": s.isoformat(), "end": e.isoformat(), "year": year, "sourceId": source_id, "_season_col": t["season_col"]}
                    if method:
                        groups[key]["method"] = method
                    groups[key]["_quota"] = 0
                    order.append(key)
                if r["unit"] not in groups[key]["units"]:
                    groups[key]["units"].append(r["unit"])
                    groups[key]["_quota"] += r["quota"]
    out = []
    for k in order:
        g = groups[k]
        col = g.pop("_season_col")
        q = g.pop("_quota")
        notes = [f"2026 quota for these unit groups: {q:,} tag{'s' if q != 1 else ''}."]
        if col and col != "2026-2027":
            notes.append(f"CR 26-11 prints this table's season column heading as '{col} Season' under the 2026 quota; dates as printed.")
        if extra_note:
            notes.append(extra_note)
        g["note"] = " ".join(notes)
        # schema key order
        ordered = {kk: g[kk] for kk in ["species", "label", "method", "units", "huntCodes", "residency", "start", "end", "year", "note", "sourceId"] if kk in g}
        out.append(ordered)
    return out


def pdf_text(path):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def must_contain(text, needles, name):
    norm = re.sub(r"\s+", " ", text.replace("–", "-"))
    for n in needles:
        if re.sub(r"\s+", " ", n.replace("–", "-")) not in norm:
            raise SystemExit(f"{name}: expected text not found: {n!r}")


def bear_seasons(raw):
    path = os.path.join(raw, SEASON_DOCS["cr2612"][0])
    must_contain(pdf_text(path), ["Any Legal Weapon Hunt 6151 and 6251", "Sept 15 - Dec 1", "(or until harvest", "2026 Season"], "CR 26-12")
    return [{"species": "bear", "label": "Black bear, either sex - any legal weapon (hunts 6151 resident / 6251 nonresident), all open unit groups",
             "units": ["192, 194, 195, 196", "201, 202, 204, 206", "291, 203"], "huntCodes": ["6151", "6251"],
             "start": "2026-09-15", "end": "2026-12-01", "year": 2026,
             "note": "Or until harvest limits are met; call 1-800-800-1667 before hunting. Portions of 192 and 194 are excluded (CR 26-12 special regulations).",
             "sourceId": "d-cr-26-12"}]


def turkey_seasons(raw):
    """CR 26-13 wild turkey: fall 2026 and spring 2027 (2028 dates in the same regulation are not included)."""
    path = os.path.join(raw, SEASON_DOCS["cr2613"][0])
    txt = pdf_text(path)
    must_contain(txt, ["WILD TURKEY 2026 & 2027 FALL - LIMITED ENTRY - HUNTS 0131 & 0132", "Nov. 1 - Nov. 30, 2026", "Nov. 1 - Nov 30, 2026",
                       "JUNIOR WILD TURKEY 2027 & 2028 SPRING - HUNT 0138", "March 20 - May 2, 2027",
                       "WILD TURKEY 2027 & 2028 SPRING - LIMITED ENTRY - HUNTS 0131 & 0132", "Last Saturday in March - first Sunday in May",
                       "March 27 - April 4, 2027", "April 10 - April 18, 2027", "April 24 - May 2, 2027",
                       "WILD TURKEY 2027 & 2028 SPRING HUNTS - 0135 & 0137", "WILD TURKEY 2026 & 2027 FALL HUNTS - 0135 & 0137", "November 1 - November 30",
                       "Closed to nonresidents"], "CR 26-13")
    # "Last Saturday in March - first Sunday in May" in 2027: computed from the printed rule
    d = dt.date(2027, 3, 31)
    while d.weekday() != 5:
        d -= dt.timedelta(days=1)
    last_sat = d
    d = dt.date(2027, 5, 1)
    while d.weekday() != 6:
        d += dt.timedelta(days=1)
    first_sun = d
    rule = f"CR 26-13 prints 'Last Saturday in March - first Sunday in May'; for 2027 that is {last_sat:%B} {last_sat.day} - {first_sun:%B} {first_sun.day}, 2027."
    S = "d-cr-26-13"
    out = []
    out.append({"species": "turkey", "label": "Fall wild turkey, either sex - limited entry (hunt 0131 resident)", "units": ["Pershing County", "Lincoln County"],
                "huntCodes": ["0131"], "residency": "resident", "start": "2026-11-01", "end": "2026-11-30", "year": 2026, "sourceId": S})
    out.append({"species": "turkey", "label": "Fall wild turkey, either sex - limited entry (hunt 0132 nonresident)", "units": ["Pershing County", "Lincoln County"],
                "huntCodes": ["0132"], "residency": "nonresident", "start": "2026-11-01", "end": "2026-11-30", "year": 2026, "sourceId": S})
    out.append({"species": "turkey", "label": "Fall wild turkey, either sex - private lands of Paradise Valley (hunts 0135 resident / 0137 nonresident)",
                "units": ["051"], "huntCodes": ["0135", "0137"], "start": "2026-11-01", "end": "2026-11-30", "year": 2026,
                "note": "Landowner-signed Paradise Valley application form required; no internet applications.", "sourceId": S})
    out.append({"species": "turkey", "label": "Junior spring wild turkey, bearded (hunt 0138)",
                "units": ["203 of Lyon County", "102 & 065 within Elko County", "103 & 108 within Elko & White Pine County", "115 within White Pine County",
                          "Pershing County", "151 and 152 of Lander County", "154 of Lander County", "Lincoln County"],
                "huntCodes": ["0138"], "residency": "resident", "start": "2027-03-20", "end": "2027-05-02", "year": 2027,
                "note": "Closed to nonresidents. Moapa Valley of Clark County closed.", "sourceId": S})
    rule_units = ["091 of Elko County", "101 of Elko County", "102 and 065 of Elko County", "103 and 108 of Elko County and White Pine County",
                  "154 of Lander County and Eureka County", "223 and 231 of Lincoln County", "241 and 242 of Lincoln County",
                  "That portion of 202 in Lyon County and 204", "Pershing County", "115 of White Pine County"]
    out.append({"species": "turkey", "label": "Spring wild turkey, bearded - limited entry (hunt 0131 resident)", "units": rule_units,
                "huntCodes": ["0131"], "residency": "resident", "start": last_sat.isoformat(), "end": first_sun.isoformat(), "year": 2027,
                "note": rule + " Moapa Valley of Clark County closed.", "sourceId": S})
    out.append({"species": "turkey", "label": "Spring wild turkey, bearded - limited entry (hunt 0132 nonresident)",
                "units": ["102 and 065 of Elko County", "241 and 242 of Lincoln County", "Pershing County"],
                "huntCodes": ["0132"], "residency": "nonresident", "start": last_sat.isoformat(), "end": first_sun.isoformat(), "year": 2027,
                "note": rule + " Nonresident tags only in the listed areas.", "sourceId": S})
    for i, (s, e) in enumerate([("2027-03-27", "2027-04-04"), ("2027-04-10", "2027-04-18"), ("2027-04-24", "2027-05-02")]):
        out.append({"species": "turkey", "label": f"Spring wild turkey, bearded - limited entry, hunt period {i + 1} (hunt 0131 resident)",
                    "units": ["151 and 152 of Lander County", "203 of Lyon County"], "huntCodes": ["0131"], "residency": "resident",
                    "start": s, "end": e, "year": 2027, "sourceId": S})
        if i:
            out.append({"species": "turkey", "label": f"Spring wild turkey, bearded - limited entry, hunt period {i + 1} (hunt 0132 nonresident)",
                        "units": ["203 of Lyon County"], "huntCodes": ["0132"], "residency": "nonresident",
                        "start": s, "end": e, "year": 2027, "sourceId": S})
    out.append({"species": "turkey", "label": "Spring wild turkey, bearded - private lands of Paradise Valley (hunts 0135 resident / 0137 nonresident)",
                "units": ["051"], "huntCodes": ["0135", "0137"], "start": last_sat.isoformat(), "end": first_sun.isoformat(), "year": 2027,
                "note": rule + " Landowner-signed Paradise Valley application form required; no internet applications.", "sourceId": S})
    return out


def build_seasons(raw):
    seasons = []
    problems = []
    stats = {}
    for key in ("cr2611", "cr2609"):
        fn, sid = SEASON_DOCS[key]
        tables = parse_cr_tables(os.path.join(raw, fn))
        problems += check_tables(tables, fn)
        stats[fn] = (len(tables), sum(len(t["rows"]) for t in tables))
        seasons += tables_to_seasons(tables, sid, extra_note=("Some unit groups cover only part of a unit or carry extra restrictions; see the footnotes in "
                                                              + ("CR 26-11." if key == "cr2611" else "CR 26-09.")))
    seasons += bear_seasons(raw)
    seasons += turkey_seasons(raw)
    return seasons, problems, stats


def main():
    if "--test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    raw, repo = sys.argv[1], sys.argv[2]
    if not self_test():
        sys.exit(1)
    report, failures = update_rows(repo, raw)
    for sp, st in report.items():
        for y in sorted(st["years"]):
            v = st["years"][y]
            print(f"{sp:10s} {y}: {v['ranges']}/{v['rows']} rows with seasonRanges" + (f" ({v['segmented']} junior rows segmented from the CR)" if v.get("segmented") else "")
                  + (f"; empty: {v['empty']}" if v["empty"] else ""))
    if failures:
        for f in failures:
            print("PARSE FAILURE", f)
        sys.exit(1)
    seasons, problems, stats = build_seasons(raw)
    for p in problems:
        print("TABLE PROBLEM", p)
    if problems:
        sys.exit(1)
    print("tables:", stats)
    mp = os.path.join(repo, "src/data/agency/nevada/draw-meta.json")
    meta = json.load(open(mp))
    ids = {s["id"] for s in meta["sources"]}
    for s in seasons:
        if s["sourceId"] not in ids:
            raise SystemExit(f"season source {s['sourceId']} missing from draw-meta.sources (run draw_meta.py first)")
    meta["seasons"] = seasons
    with open(mp, "w") as f:
        json.dump(meta, f, indent=1)
    by = {}
    for s in seasons:
        by.setdefault((s["species"], s["year"]), 0)
        by[(s["species"], s["year"])] += 1
    print("draw-meta.seasons:", len(seasons), dict(sorted(by.items())))


if __name__ == "__main__":
    main()
