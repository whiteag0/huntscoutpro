#!/usr/bin/env python3
"""Season dates for New Mexico from the NMDOW Hunting Rules and Information booklet (RIB).

Usage:
  python3 -I scripts/agency/new-mexico/seasons_parse.py <rib_pdf> <repo_root>
  python3 -I scripts/agency/new-mexico/seasons_parse.py --test

Run AFTER draw_parse.py and draw_meta.py (draw_meta.py rewrites seasons[] with its fallback list).
<rib_pdf> is the 2026-2027 booklet (d-nm-rib-2026,
https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-hunting-rules-and-info/?wpdmdl=52826),
kept outside the repo (agency-raw/new-mexico/seasons/d-nm-rib-2026.pdf). Needs poppler's pdftotext.

What it writes:
  * draw/<species>.json, 2026 rows: seasonDates (the booklet's "Hunt Dates" cell, as printed),
    seasonRanges (YYYY-MM-DD) and seasonSourceId = d-nm-rib-2026. Both rows of a hunt code
    (choice=first and choice=all) get the same dates. Hunt codes not printed in the booklet are left
    without dates and listed (the private-land-only deer codes for Units 2A/2B/2C/4/5A are issued by
    landowners and not printed).
  * draw-meta.json seasons[]: every hunt-table row of the booklet for elk, deer, pronghorn, bighorn
    sheep, bear (draw permits and OTC zones), turkey (draw permits and OTC) and cougar, grouped by
    species + label + dates into one SeasonDate with huntCodes/units.

Dates: the license year is April 1, 2026 - March 31, 2027. A printed date without a year is in 2026;
a trailing ", '27" gives the year of the end date (the start is in the same year unless its month is
later than the end month, i.e. the hunt runs over New Year). Every parsed range is re-formatted and
compared with the printed text (round trip); any mismatch aborts.
"""
import json, os, re, subprocess, sys
from datetime import date

sys.dont_write_bytecode = True

SRC = "d-nm-rib-2026"
BASE = 2026  # license year 2026-27
DRAW_YEAR = 2026

MONTHS = {"jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
          "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
          "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12}
MON_RE = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
ABBR = {1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun", 7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"}
YR = r"(?:,?\s*(?:'(?P<{0}s>\d\d)|(?P<{0}l>20\d\d)))"
RANGE_RE = re.compile(
    r"^(?P<m1>" + MON_RE + r")\.?\s*(?P<d1>\d{1,2})" + YR.format("y1") + r"?\s*-\s*"
    r"(?:(?P<m2>" + MON_RE + r")\.?\s*)?(?P<d2>\d{1,2})" + YR.format("y2") + r"?$", re.I)


def norm(s):
    """Typographic normalization only: quotes, dashes, whitespace."""
    s = s.replace("‘", "'").replace("’", "'").replace("–", "-").replace("—", "-").replace("‑", "-")
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"\s*-\s*", "-", s)


def _yr(m, k):
    if m.group(k + "s"):
        return 2000 + int(m.group(k + "s"))
    if m.group(k + "l"):
        return int(m.group(k + "l"))
    return None


def parse_range(text, base=BASE):
    """One printed range -> (date start, date end). Raises ValueError when it can't be read unambiguously."""
    t = norm(text)
    m = RANGE_RE.match(t)
    if not m:
        raise ValueError(f"unreadable date range {text!r}")
    m1 = MONTHS[m.group("m1").lower().rstrip(".")]
    m2 = MONTHS[m.group("m2").lower().rstrip(".")] if m.group("m2") else m1
    d1, d2 = int(m.group("d1")), int(m.group("d2"))
    y1, y2 = _yr(m, "y1"), _yr(m, "y2")
    if y2 is None and y1 is not None:
        y2 = y1 if (m2, d2) >= (m1, d1) else y1 + 1
    if y2 is None:
        y2 = base
        if m1 <= 3 or m2 <= 3:
            raise ValueError(f"Jan-Mar date without a year in {text!r}")
    if y1 is None:
        y1 = y2 if (m1, d1) <= (m2, d2) else y2 - 1
    s, e = date(y1, m1, d1), date(y2, m2, d2)
    if e < s:
        raise ValueError(f"end before start in {text!r}")
    if not (date(base, 4, 1) <= s <= date(base + 1, 3, 31)):
        raise ValueError(f"start outside license year in {text!r}")
    return s, e


def canon(text):
    t = norm(text).lower()
    t = re.sub(r"\b(january|february|march|april|june|july|august|september|october|november|december|sept)\b",
               lambda m: m.group(1)[:3], t)
    return re.sub(r"[\s.,]", "", t)


def fmt_range(s, e, base=BASE):
    """Inverse of parse_range in canonical spelling (no spaces/periods): Sep1-14, Dec26-Jan1'27, Apr1,2026-Mar31,2027."""
    out = f"{ABBR[s.month]}{s.day}-" + (f"{ABBR[e.month]}" if (e.month, e.year) != (s.month, s.year) else "") + f"{e.day}"
    if e.year != base:
        out += f"'{e.year % 100:02d}"
    return out.lower()


def round_trip_ok(text, s, e, base=BASE):
    c = canon(text)
    f = fmt_range(s, e, base)
    if c == f:
        return True
    if s.month == e.month and s.year == e.year and c == f.replace("-", "-" + ABBR[e.month].lower(), 1):
        return True  # "Apr. 15 - Apr 30" repeats the month
    # long form with explicit full years on both ends: "April 1, 2026-March 31, 2027"
    long_form = f"{ABBR[s.month]}{s.day}{s.year}-{ABBR[e.month]}{e.day}{e.year}".lower()
    return c == long_form


def self_test():
    cases = [
        ("Sept. 1-14", "2026-09-01", "2026-09-14"),
        ("Oct. 31-Nov.4", "2026-10-31", "2026-11-04"),
        ("Oct. 31-Nov. 4", "2026-10-31", "2026-11-04"),
        ("Sep. 26-28", "2026-09-26", "2026-09-28"),
        ("Jan. 1-15, ‘27", "2027-01-01", "2027-01-15"),
        ("Dec. 26-Jan.1, ‘27", "2026-12-26", "2027-01-01"),
        ("Sept. 1-Jan.31, ‘27", "2026-09-01", "2027-01-31"),
        ("Dec. 27-Jan. 3 '27", "2026-12-27", "2027-01-03"),
        ("Aug. 15-Jan. 15, '27", "2026-08-15", "2027-01-15"),
        ("Apr. 1-Mar. 31, '27", "2026-04-01", "2027-03-31"),
        ("Feb. 1-Mar.31, '27", "2027-02-01", "2027-03-31"),
        ("March 5-7, '27", "2027-03-05", "2027-03-07"),
        ("Aug. 1–31", "2026-08-01", "2026-08-31"),
        ("Apr. 15 - Apr 30", "2026-04-15", "2026-04-30"),
        ("April 1, 2026–March 31, 2027", "2026-04-01", "2027-03-31"),
        ("April 10-12", "2026-04-10", "2026-04-12"),
    ]
    bad = 0
    for text, s, e in cases:
        a, b = parse_range(text)
        ok = (a.isoformat(), b.isoformat()) == (s, e) and round_trip_ok(text, a, b)
        bad += not ok
        print("ok  " if ok else "FAIL", repr(text), a, b)
    for text in ["Feb. 1-28", "Dec. 1-Jan. 5", "Oct. 1-", "Sept. 31-Oct. 2", "EAST SIDE:"]:
        try:
            parse_range(text)
            print("FAIL accepted", repr(text)); bad += 1
        except ValueError:
            print("ok   rejected", repr(text))
    print("self-test:", "PASS" if not bad else f"{bad} FAILURES")
    return bad == 0


# ---------------------------------------------------------------- booklet text
CODE_RE = re.compile(r"\b(ELK|DER|ANT|BHS|BER|TUR|BBY|IBX|ORX|JAV|PHE)-(\d)-(\d{3})\b")
DATE_START = re.compile(r"\b" + MON_RE + r"\.?\s*\d", re.I)
FOOTER = re.compile(r"^\s*(\d{1,3}\s+2026[-–]2027|2026[-–]2027\s+\d{1,3})\s*$")
HEADER_HINT = re.compile(r"^\s*(Units?\b|GMUs?\b|Premium\b|Zone\b)")
SPECIES_OF = {"ELK": "elk", "ANT": "pronghorn", "BHS": "sheep", "BER": "bear", "TUR": "turkey"}
KEEP = {"ELK", "DER", "ANT", "BER", "TUR"}


def booklet_lines(pdf):
    out = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, check=True).stdout.decode("utf-8")
    return [l.replace("–", "-").replace("‑", "-") if CODE_RE.search(l.replace("–", "-")) else l for l in out.split("\n")]


def lnorm(s):
    """Label text: typographic normalization, footnote digits glued to the end removed ("Bow1", "(Pecos) 3, 5")."""
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"(?<=[a-z])\d$", "", s)
    s = re.sub(r"(?<=\))\s*\d(?:,\s*\d)*$", "", s)
    return s.strip()


def units_from_header(h):
    """'Units 4, 50 and 52' / 'GMUs 49, 50 and 53 (Rio Grande Gorge)' / 'Units 4-7, 51, 52' -> unit ids as written."""
    m = re.search(r"\b(?:Units?|GMUs?)\s+(.*)$", lnorm(h))
    if not m:
        return []
    body = re.split(r"\(|\b(?:Including|Public|Private|Only|North|South|East|West|excluding|Excluding|Sargent|Humphries|Rio|Marquez|Valle|Carson|Sugarite|Urraca)\b", m.group(1))[0]
    out = []
    for p in re.split(r",|\band\b|&", body):
        p = p.strip()
        if re.fullmatch(r"\d{1,2}[A-E]?(?:-\d{1,2}[A-E]?)?", p):
            out.append(p)
    return out


def hunt_table_rows(lines):
    """Rows of the hunt tables: code -> dict(dates printed, label, area, ctx, bag)."""
    rows, dup = {}, []
    area, ctx = "", ""
    for i, raw in enumerate(lines):
        l = raw.rstrip()
        if re.search(r"Private[-–]Land (Deer|Pronghorn) Hunting in Units", l) and not re.search(r"2A, 2B, 2C", l):
            ctx = "private-land"
        elif re.search(r"Draw Hunts|Draw Permit Seasons|Bear Draw Seasons|Draw Hunt Seasons", l):
            ctx = "draw"
        elif l.strip() == "Youth Encouragement Elk Licenses":
            ctx = "youth-encouragement"
        m = CODE_RE.search(l)
        if not m:
            if HEADER_HINT.match(l) and not FOOTER.match(l) and len(l.strip()) < 110:
                area = norm(l)
                if i + 1 < len(lines) and lines[i + 1].strip() and not CODE_RE.search(lines[i + 1]) \
                        and not DATE_START.search(lines[i + 1]) and len(lines[i + 1].strip()) < 60 and not HEADER_HINT.match(lines[i + 1]):
                    area = norm(area + " " + lines[i + 1])
            continue
        pre = l[:m.start()]
        dm = DATE_START.search(pre) or re.search(r"\b[A-Z]+ SIDE:", pre)
        if not dm or CODE_RE.search(l[m.end():]) or m.group(1) not in KEEP:
            continue
        code = "-".join(m.groups())
        dcol = dm.start()
        label = pre[:dcol].strip()
        dates = pre[dcol:].strip()
        tail = l[m.end():].split()
        # continuation lines (wrapped date cell and/or wrapped label cell)
        j = i + 1
        while j < len(lines) and j <= i + 6:
            nxt = lines[j].rstrip()
            if not nxt.strip() or CODE_RE.search(nxt) or FOOTER.match(nxt) or HEADER_HINT.match(nxt):
                break
            left, right = nxt[:max(dcol - 2, 0)].strip(), nxt[max(dcol - 2, 0):].strip()
            if right and (re.search(r"SIDE:", dates) or not RANGE_RE.match(norm(dates))):
                dates = dates + " " + right
            elif right:
                break
            if left:
                if len(left) > 40 or re.match(r"^\d$", left):
                    break
                label = label + " " + left
            j += 1
        rec = dict(code=code, dates=re.sub(r"\s+", " ", dates).strip(), label=lnorm(label), area=area, ctx=ctx,
                   bag=tail[-1] if tail else "", line=i + 1)
        rows.setdefault(code, []).append(rec)
    # A code can be printed twice (pronghorn codes in both the private-land and the draw table, with
    # different license counts). The dates must agree; the draw-table occurrence is kept.
    out = {}
    for code, recs in rows.items():
        if len({canon(r["dates"]) for r in recs}) > 1:
            raise SystemExit(f"FAIL {code}: printed with different dates: {[(r['line'], r['dates']) for r in recs]}")
        if len(recs) > 1:
            dup.append((code, [r["line"] for r in recs]))
        out[code] = next((r for r in recs if r["ctx"] == "draw"), recs[-1])
    return out, dup


def sheep_rows(lines):
    """BHS hunt codes: code -> list of (area, printed dates)."""
    out, code, head = {}, None, ""
    for i, raw in enumerate(lines):
        l = raw.rstrip()
        m = re.match(r"^\s*(Rocky Mountain Bighorn (?:Ram|Ewe)|Desert Bighorn (?:Ram|Ewe)): Hunt Code (BHS-\d-\d{3})\s*$", l)
        if m:
            head, code = m.group(1), m.group(2)
            out[code] = dict(title=head, rows=[])
            continue
        if not code:
            continue
        if re.match(r"^\s*\d\s+\S", l) or l.strip().startswith("Licenses, applications") or re.match(r"^\s*(Ibex|Barbary|Persian)", l):
            if out[code]["rows"]:
                code = None if re.match(r"^\s*\d\s+\S", l) is None else code
            continue
        # dates wrapped onto the next line ("Aug. 15-Jan." / "15, '27")
        mw = re.match(r"^\s*(GMUs? .*?)\s{2,}(" + MON_RE + r"\.?\s*\d+-\s*" + MON_RE + r"\.?)\s+(\d+)\s+(Ram|Ewe)\s*$", l, re.I)
        if mw and i + 1 < len(lines):
            out[code]["rows"].append(dict(area=lnorm(mw.group(1)), dates=mw.group(2).strip() + " " + lines[i + 1].strip(), line=i + 1))
            continue
        mm = re.match(r"^\s*(GMUs? .*?)\s{2,}(" + MON_RE + r"\.?\s*\d.*?)\s{2,}(\d+)\s+(Ram|Ewe)\s*$", l, re.I)
        if mm:
            out[code]["rows"].append(dict(area=lnorm(mm.group(1)), dates=mm.group(2).strip(), line=i + 1))
            continue
        # area on one line (footnote marks), dates/licenses on the next
        ma = re.match(r"^\s*(GMUs? .*?\)(?: - Youth Only)?)(\s+[\d,\s]+)?\s*$", l)
        if ma and i + 1 < len(lines):
            nx = lines[i + 1]
            mn = re.match(r"^\s{20,}(" + MON_RE + r"\.?\s*\d.*?)\s{2,}(\d+)\s+(Ram|Ewe)\s*$", nx, re.I)
            if mn:
                d = mn.group(1).strip()
                if i + 2 < len(lines) and re.match(r"^\s{40,}\d{1,2}, '\d\d\s*$", lines[i + 2].replace("’", "'").replace("‘", "'")):
                    d += " " + lines[i + 2].strip()
                out[code]["rows"].append(dict(area=lnorm(ma.group(1)), dates=d, line=i + 1))
                continue
    return {k: v for k, v in out.items() if v["rows"]}


def bear_zones(lines):
    """OTC bear zones: list of dict(zone, units, dates, arm)."""
    out, zone = [], None
    start = next(i for i, l in enumerate(lines) if l.strip() == "Over-the-Counter Seasons")
    for i in range(start, len(lines)):
        l = lines[i].rstrip()
        if l.strip().startswith("Bear Draw Permits"):
            break
        m = re.match(r"^Zone (\d+) (Units? .*?)(?:\s{2,}(\d+)\s+(\d+))?\s*$", l)
        if m:
            zone = dict(zone=int(m.group(1)), units_text=m.group(2).strip(), limits=(m.group(3), m.group(4)))
            if not m.group(3):  # header wrapped onto the next line
                n = lines[i + 1]
                mn = re.match(r"^(\S.*?)\s{2,}(\d+)\s+(\d+)\s*$", n)
                zone["units_text"] += " " + mn.group(1).strip()
                zone["limits"] = (mn.group(2), mn.group(3))
            continue
        md = re.match(r"^\s{20,}(" + MON_RE + r"\.?\s*\d+[–\-]\s*(?:" + MON_RE + r"\.?\s*)?\d+)\s+(Bow Only|Any Legal)( \*)?\s+(Allowed|Not Allowed)\s*$", l)
        if md and zone:
            out.append(dict(zone=zone["zone"], units_text=zone["units_text"], limits=zone["limits"], dates=md.group(1).strip(),
                            arm=md.group(2), star=bool(md.group(3)), dogs=md.group(4), line=i + 1))
    return out


def find_line(lines, pattern):
    for i, l in enumerate(lines):
        m = re.search(pattern, l)
        if m:
            return m, i + 1
    raise SystemExit(f"FAIL pattern not found: {pattern}")


def ranges_for(dates_text):
    """Printed cell -> (seasonRanges, segments for round trip). Handles 'EAST SIDE: ... WEST SIDE: ...'."""
    t = norm(dates_text)
    segs = re.findall(r"([A-Z]+ SIDE):\s*(" + MON_RE + r"\.?\s*\d+-\s*(?:" + MON_RE + r"\.?\s*)?\d+)", t, re.I)
    if segs:
        return [(lab.title(), s) for lab, s in segs]
    return [(None, t)]


def main():
    if sys.argv[1:] == ["--test"]:
        sys.exit(0 if self_test() else 1)
    pdf, repo = sys.argv[1], sys.argv[2]
    if not self_test():
        sys.exit(1)
    base = os.path.join(repo, "src/data/agency/new-mexico")
    lines = booklet_lines(pdf)
    table, dup = hunt_table_rows(lines)
    sheep = sheep_rows(lines)
    fails = []

    def to_ranges(cell, label=None):
        rs = []
        for lab, seg in ranges_for(cell):
            s, e = parse_range(seg)
            if not round_trip_ok(seg, s, e):
                fails.append(f"round trip {seg!r} -> {s}..{e}")
            r = dict(start=s.isoformat(), end=e.isoformat())
            if lab or label:
                r["label"] = lab or label
            rs.append(r)
        return rs

    # ---- per-code printed text + ranges
    info = {}
    for code, r in table.items():
        try:
            rs = to_ranges(r["dates"])
        except ValueError as ex:
            fails.append(f"{code} line {r['line']}: {ex}")
            continue
        printed = r["dates"]
        if len(rs) > 1:  # "EAST SIDE: Apr. 15 - May 15 WEST SIDE: ..." -> separate the segments with "; "
            printed = re.sub(r"\s+(?=[A-Z]+ SIDE:)", "; ", printed)
        info[code] = dict(seasonDates=printed, seasonRanges=rs, **r)
    for code, s in sheep.items():
        rs, txt = [], []
        for row in s["rows"]:
            try:
                rr = to_ranges(row["dates"], label=row["area"])
            except ValueError as ex:
                fails.append(f"{code} line {row['line']}: {ex}")
                continue
            rs += rr
            txt.append(f"{row['area']}: {row['dates']}")
        info[code] = dict(seasonDates="; ".join(txt), seasonRanges=rs, code=code, label=s["title"], area="", ctx="draw", bag="",
                          rows=s["rows"])
    if fails:
        print("\n".join("FAIL " + f for f in fails))
        sys.exit(1)

    # ---- draw rows
    unmatched, counts = {}, {}
    code_units, code_species = {}, {}
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "turkey"]:
        p = os.path.join(base, "draw", sp + ".json")
        rows = json.load(open(p, encoding="utf-8"))
        n = filled = 0
        for idx, r in enumerate(rows):
            # idempotent: drop fields this script owns, then re-add
            for k in ("seasonDates", "seasonRanges", "seasonSourceId"):
                r.pop(k, None)
            if r["year"] != DRAW_YEAR:
                continue
            n += 1
            code_units.setdefault(r["huntCode"], r["units"])
            code_species[r["huntCode"]] = sp
            hit = info.get(r["huntCode"])
            if not hit:
                unmatched.setdefault(sp, set()).add(r["huntCode"])
                continue
            filled += 1
            new = {}
            for k, v in r.items():
                if k == "choice":
                    new["seasonDates"] = hit["seasonDates"]
                    new["seasonRanges"] = hit["seasonRanges"]
                    new["seasonSourceId"] = SRC
                new[k] = v
            rows[idx] = new
        counts[sp] = (filled, n)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n")
    for sp, (f, n) in counts.items():
        print(f"{sp}: {f}/{n} 2026 rows with seasonRanges; unmatched codes: {sorted(unmatched.get(sp, []))}")
    if dup:
        print(f"NOTE {len(dup)} codes printed twice with identical dates (draw-table line kept), e.g. {dup[:3]}")

    # ---- draw-meta seasons[]
    seasons = []
    groups = {}

    def method_of(label):
        l = label.lower()
        if l.startswith("bow"):
            return "archery"
        if l.startswith("muzzle"):
            return "muzzleloader"
        return None

    SPN = {"elk": "Elk", "mule-deer": "Deer", "whitetail": "White-tailed deer", "pronghorn": "Pronghorn", "bear": "Bear", "turkey": "Turkey"}
    not_in_draw = []
    for code, h in sorted(info.items()):
        pref = code[:3]
        if pref == "BHS":
            continue
        if pref == "DER":
            sp = code_species.get(code) or ("whitetail" if h["bag"] in ("FAWTD", "ESWTD") else "mule-deer")
        else:
            sp = SPECIES_OF[pref]
        in_draw = code in code_species
        if not in_draw:
            not_in_draw.append(code)
        kind = "draw hunt" if in_draw else {"private-land": "private-land hunt code (OTC private-land license)",
                                             "youth-encouragement": "youth encouragement hunt (online first-come license)"}.get(h["ctx"])
        if not kind:
            raise SystemExit(f"FAIL {code}: printed outside the draw, private-land and youth-encouragement tables (line {h['line']})")
        if pref in ("BER", "TUR") and in_draw:
            kind = "draw permit"
        label = f"{SPN[sp]} {kind}: {h['label'] or 'Any Legal'}"
        units = code_units.get(code) or units_from_header(h["area"])
        for rg in h["seasonRanges"]:
            key = (sp, label + (f" ({rg['label']})" if rg.get("label") else ""), rg["start"], rg["end"])
            g = groups.setdefault(key, dict(codes=[], units=[]))
            g["codes"].append(code)
            for u in units:
                if u not in g["units"]:
                    g["units"].append(u)
    for (sp, label, s, e), g in groups.items():
        d = dict(species=sp, label=label)
        mth = method_of(label.split(": ", 1)[1])
        if mth:
            d["method"] = mth
        if g["units"]:
            d["units"] = g["units"]
        d["huntCodes"] = g["codes"]
        if re.search(r"NM Residents? Only", label):
            d["residency"] = "resident"
        d.update(start=s, end=e, year=BASE, sourceId=SRC)
        seasons.append(d)
    # sheep: one season per hunt area/date row
    for code, h in sorted(info.items()):
        if not code.startswith("BHS"):
            continue
        for row, rg in zip(h["rows"], h["seasonRanges"]):
            d = dict(species="sheep", label=f"{h['label']} ({code}): {row['area']}")
            if code.startswith("BHS-2"):
                d["method"] = "archery"
            u = units_from_header(row["area"])
            if u:
                d["units"] = u
            d["huntCodes"] = [code]
            if "Youth Only" in row["area"]:
                d["note"] = "Youth only."
            d.update(start=rg["start"], end=rg["end"], year=BASE, sourceId=SRC)
            seasons.append(d)
    # OTC bear zones
    for z in bear_zones(lines):
        s, e = parse_range(z["dates"])
        if not round_trip_ok(z["dates"], s, e):
            fails.append(f"bear zone round trip {z['dates']!r}")
        d = dict(species="bear", label=f"OTC bear, Zone {z['zone']} ({norm(z['units_text'])}): {z['arm']}")
        if z["arm"] == "Bow Only":
            d["method"] = "archery"
        d["units"] = units_from_header(z["units_text"])
        note = f"Zone harvest limit {z['limits'][0]} total / {z['limits'][1]} female; zone closes when reached. Dogs {z['dogs'].lower()}."
        if z["star"]:
            note += " USFS Sandia Ranger District is bow only."
        d.update(start=s.isoformat(), end=e.isoformat(), year=BASE, note=note, sourceId=SRC)
        seasons.append(d)
    # OTC turkey and cougar (single statements in the booklet text)
    m, _ = find_line(lines, r"Youth-Only Spring OTC License Hunt: (" + MON_RE + r" \d+-\d+)")
    s, e = parse_range(m.group(1))
    seasons.append(dict(species="turkey", label="Youth-only spring OTC turkey hunt (all units open for spring OTC)", start=s.isoformat(), end=e.isoformat(),
                        year=BASE, note="Draw-permit areas are not open for youth-only spring OTC license holders.", sourceId=SRC))
    m, _ = find_line(lines, r"Areas Open for Spring OTC License Hunts: (" + MON_RE + r" \d+[–-]" + MON_RE + r" \d+)")
    s, e = parse_range(m.group(1))
    seasons.append(dict(species="turkey", label="Spring OTC turkey (statewide except closed areas)", start=s.isoformat(), end=e.isoformat(), year=BASE,
                        note="Bag two bearded turkeys.", sourceId=SRC))
    m, _ = find_line(lines, r"^(" + MON_RE + r"\. \d+[–-]\d+) \(bow only\) and (" + MON_RE + r"\. \d+[–-]\d+) \(shotgun, bow or crossbow\)")
    for txt, lab, mth in [(m.group(1), "Fall OTC turkey - bow only", "archery"), (m.group(2), "Fall OTC turkey - shotgun, bow or crossbow", None)]:
        s, e = parse_range(txt)
        d = dict(species="turkey", label=lab)
        if mth:
            d["method"] = mth
        d.update(start=s.isoformat(), end=e.isoformat(), year=BASE, note="Bag any one turkey (fall season total).", sourceId=SRC)
        seasons.append(d)
    m, _ = find_line(lines, r"Statewide Cougar Season: (" + MON_RE + r" \d+, 20\d\d[–-]" + MON_RE + r" \d+, 20\d\d)")
    s, e = parse_range(m.group(1))
    if not round_trip_ok(m.group(1), s, e):
        fails.append("cougar round trip")
    seasons.append(dict(species="lion", label="Statewide cougar season (zones close at 90% of harvest limits)", start=s.isoformat(), end=e.isoformat(),
                        year=BASE, sourceId=SRC))
    if fails:
        print("\n".join("FAIL " + f for f in fails))
        sys.exit(1)
    order = ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "turkey", "lion"]
    seasons.sort(key=lambda d: (order.index(d["species"]), d["start"], d["end"], d["label"]))
    mp = os.path.join(base, "draw-meta.json")
    meta = json.load(open(mp, encoding="utf-8"))
    meta["seasons"] = seasons
    with open(mp, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    by = {}
    for d in seasons:
        by[d["species"]] = by.get(d["species"], 0) + 1
    print("draw-meta seasons:", len(seasons), by)
    print(f"booklet hunt codes not in 2026 draw rows (season entries only): {len(not_in_draw)}")
    tot_un = sum(len(v) for v in unmatched.values())
    print(f"unmatched 2026 draw hunt codes (left without dates): {tot_un}")


if __name__ == "__main__":
    main()
