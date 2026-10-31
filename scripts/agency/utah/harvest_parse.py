#!/usr/bin/env python3
"""Parse Utah DWR harvest publications into HuntScout Pro agency JSON.

Usage (from the repo root, after harvest_download.py):
  python -I scripts/agency/utah/harvest_parse.py <raw_dir>

Writes src/data/agency/utah/harvest/<species>.json and
src/data/agency/utah/harvest-meta.json (see src/data/agency/schema.ts).

Nothing is estimated: every number is read from an agency table. The only
derived value is successPct where the agency publishes hunters and harvest but
no rate (successComputed = true). Rows the agency marks "No data" are skipped.
"""
import collections
import json
import os
import re
import sys

RETRIEVED = "2026-10-31"
PUB = "Utah Division of Wildlife Resources"
BG_PAGE = "https://wildlife.utah.gov/biggame/reports"

RAW = None
OUT = os.path.join("src", "data", "agency", "utah")

NUM = r"(?:-?\d[\d,]*(?:\.\d+)?|—|–|--|-)"
DASHES = {"—", "–", "--", "-"}


def txt(name):
    with open(os.path.join(RAW, name), encoding="utf8") as fh:
        return fh.read().replace("\u0000", "").replace("\f", "").replace("ﬀ", "ff").replace("ﬁ", "fi").replace("ﬂ", "fl")


def val(tok):
    tok = tok.strip().rstrip("*")
    if tok in DASHES or tok == "":
        return None
    tok = tok.replace(",", "")
    if re.fullmatch(r"-?\d+", tok):
        return int(tok)
    if re.fullmatch(r"-?\d+\.\d+", tok):
        return float(tok)
    raise ValueError(tok)


def split_nums(line, n):
    """Split the last n numeric tokens off a line: (leading text, [tokens]) or None."""
    out = []
    s = line.rstrip()
    for _ in range(n):
        m = re.search(r"\s(" + NUM + r")\*{0,2}$", s)
        if not m:
            return None
        out.insert(0, m.group(1))
        s = s[: m.start()].rstrip()
    return s, out


SOURCES = {}


def src(sid, title, url, year=None, notes=None, page=BG_PAGE):
    if sid not in SOURCES:
        d = {"id": sid, "title": title, "publisher": PUB, "url": url}
        if page and page != url:
            d["pageUrl"] = page
        if year is not None:
            d["dataYear"] = year
        d["retrieved"] = RETRIEVED
        if notes:
            d["notes"] = notes
        SOURCES[sid] = d
    return sid


def bg_src(y):
    return src(
        f"h-bg{y}",
        f"Utah Big Game Annual Report {y}",
        f"https://wildlife.utah.gov/pdf/annual-reports/big-game/{str(y)[2:]}_bg_report.pdf",
        y,
        page=None,
    )


ROWS = collections.defaultdict(list)
UNIT_NAMES = collections.defaultdict(dict)
LOG = collections.Counter()


def add(row):
    sp = row["species"]
    notes = [row["note"]] if row.get("note") else []
    u = row.get("unit") or ""
    if any(u == f"{a} {b}" for a, b in DUP_UNIT) and not row.get("hunt"):
        notes.append(DUP_NOTE)
    if u in REPEATED_ROW and not row.get("hunt"):
        notes.append("UDWR's table prints this unit id and name twice with different figures; both rows are kept exactly as printed")
    p = row.get("successPct")
    if isinstance(p, (int, float)) and p > 100:
        if row.get("successComputed"):
            notes.append("Harvest exceeds hunters afield, so no success rate is derived")
        else:
            notes.append(f"UDWR published a success rate of {p:g}% (over 100%); stored as null")
        row["successPct"] = None
        row["successComputed"] = None
    if notes:
        row["note"] = "; ".join(notes)
    clean = {k: v for k, v in row.items() if v is not None or k in ("hunters", "harvest", "successPct")}
    ROWS[sp].append(clean)


def success_fields(hunters, harvest, pct):
    if pct is not None:
        return pct, None
    if hunters and harvest is not None and hunters > 0:
        return round(100.0 * harvest / hunters, 1), True
    return None, None


# ------------------------------------------------------------------
# Big Game Annual Report: unit-level tables
# ------------------------------------------------------------------
UNIT_RE = r"\d{1,2}[A-Za-z]{0,4}(?:/\d{1,2}[A-Za-z]{0,4})*"
TITLE_RE = re.compile(r"^\s*([A-Z][^\n]{8,200}?),\s*Utah\s*(\d{4}(?:–\d{4})?)?\s*(\(continued\))?\.?\s*$")


def bg_lines(y):
    return txt(f"{str(y)[2:]}_bg_report.txt").split("\n")


def iter_tables(lines):
    """Yield (title, year_text, start_idx, end_idx) for every '..., Utah YYYY.' table title."""
    idx = []
    for i, ln in enumerate(lines):
        s = ln.strip()
        if not s or len(s) > 220:
            continue
        # titles can wrap: "... by management unit, Utah" + next line "2023."
        joined = s
        if s.endswith("Utah") and i + 1 < len(lines) and re.fullmatch(r"\d{4}(?:–\d{4})?\.?|\(continued\)\.", lines[i + 1].strip()):
            joined = s + " " + lines[i + 1].strip()
        elif re.search(r"Utah \d{4}(?:–\d{4})?$", s) and i + 1 < len(lines) and lines[i + 1].strip() == "(continued).":
            joined = s + " (continued)."
        m = TITLE_RE.match(joined)
        if m and re.search(r"harvest|statistics|mortality", m.group(1), re.I):
            idx.append((i, m.group(1).strip(), m.group(2), bool(m.group(3))))
    for k, (i, title, yt, cont) in enumerate(idx):
        end = idx[k + 1][0] if k + 1 < len(idx) else len(lines)
        yield title, yt, cont, i, end


def header_text(lines, start, end):
    h = []
    for ln in lines[start + 1 : min(end, start + 8)]:
        h.append(ln)
    return " ".join(h).lower()


def parse_unit_rows(lines, start, end, ncols, sub=False):
    """Rows like '  22    Beaver   793  34 ...' (or 2020 subunit style)."""
    out = []
    for ln in lines[start + 1 : end]:
        if not ln.strip():
            continue
        r = split_nums(ln, ncols)
        if not r:
            continue
        text, nums = r
        text = text.strip()
        if not text or re.fullmatch(r"[\d\s.]+", text):
            continue
        if sub:
            m = re.match(r"^(\d{1,2})\s+(.+?)\s+(—|[A-Z]{1,3}\d?)\s+(\S.*)$", text)
            if m:
                u, nm, sb, sbn = m.groups()
                if sb == "—":
                    out.append((u, nm.strip(), nums))
                else:
                    out.append((u + sb, f"{nm.strip()}, {sbn.strip()}", nums))
                continue
        m = re.match(r"^(" + UNIT_RE + r")\s+(\S.*)$", text)
        if m:
            nm = m.group(2).strip()
            if sub and re.search(r"\S\s{2,}\S", nm):
                # 2020 subunit tables without a subunit letter: "9 South Slope   Vernal"
                a, b = re.split(r"\s{2,}", nm, maxsplit=1)
                nm = f"{a}, {b}"
            out.append((m.group(1), nm, nums))
        else:
            out.append((None, text, nums))
    cnt = collections.Counter(u for u, _, _ in out if u)
    res = []
    seen_pair = collections.Counter()
    for u, nm, nums in out:
        if u and cnt[u] > 1:
            nm1 = re.sub(r"\s{2,}", " ", nm)
            seen_pair[(u, nm1)] += 1
            if seen_pair[(u, nm1)] > 1:
                # the agency printed the same unit id + name twice with different figures
                nm1 = f"{nm1} (row {seen_pair[(u, nm1)]})"
                REPEATED_ROW.add(f"{u} {nm1}")
            DUP_UNIT.add((u, nm1))
            u = f"{u} {nm1}"
        res.append((u, re.sub(r"\s{2,}", " ", nm), nums))
    return res


REPEATED_ROW = set()


DUP_UNIT = set()
DUP_NOTE = "UDWR lists more than one area under this unit id in this table; unit shows the id followed by the area name"


SPECIES_TOTAL = {
    "deer": ("mule-deer", "Buck"),
    "elk": ("elk", "Bull"),
    "pronghorn": ("pronghorn", "Buck"),
    "moose": ("moose", "Bull"),
}


def special_unit(name):
    n = name.strip().rstrip("*")
    if n.lower().startswith("statewide totals"):
        return "TOTAL"
    if n.lower().startswith("statewide"):
        return "Statewide Sportsman/Conservation"
    if n.lower().startswith("unidentified"):
        return "Unidentified"
    return None


def bg_unit_totals(y):
    lines = bg_lines(y)
    sid = bg_src(y)
    found = set()
    for title, yt, cont, s, e in iter_tables(lines):
        m = re.match(r"Total (deer|elk|pronghorn|moose) harvest by management unit( / subunit)?$", title)
        if not m or yt != str(y):
            continue
        key, unitword = SPECIES_TOTAL[m.group(1)]
        sp = key
        hdr = header_text(lines, s, e)
        has_permits = "permits" in hdr
        ncols = 7 if has_permits else 6
        found.add(sp)
        for unit, name, nums in parse_unit_rows(lines, s, e, ncols, sub=bool(m.group(2))):
            v = [val(x) for x in nums]
            if has_permits:
                male, anl, tot, permits, hunters, days, pct = v
            else:
                male, anl, tot, hunters, days, pct = v
                permits = None
            spec = special_unit(name) if unit is None else None
            if unit is None and spec is None:
                LOG[f"unmatched unit-total row {y} {sp}: {name}"] += 1
                continue
            if spec == "TOTAL":
                # cross-check only; statewide rows come from the statewide statistics table
                CHECK[(sp, y, "unit-table statewide total")] = {"harvest": tot, "hunters": hunters}
                continue
            u = unit or spec
            row = {
                "species": sp, "year": y, "unit": u, "unitName": name if unit else None,
                "method": "all", "methodLabel": "All hunts (general season, limited entry, antlerless, CWMU, mitigation)",
                "sex": "all", "hunters": hunters,
                "harvest": tot, "harvestMale": male,
                "successPct": pct, "daysHunted": days, "licenses": permits, "sourceId": sid,
            }
            notes = []
            if anl is not None:
                notes.append(f"Antlerless harvest {anl} ({'doe/fawn' if sp == 'pronghorn' else 'antlerless'} column as published)")
            if spec == "Statewide Sportsman/Conservation":
                row["unitName"] = "Statewide sportsman/conservation permits"
            if spec == "Unidentified":
                row["unitName"] = "Unidentified unit"
                notes.append("Harvest the agency could not assign to a unit")
            if hunters and tot is not None and pct is not None and abs(100.0 * tot / hunters - pct) > 2:
                notes.append("Published success rate is not total harvest ÷ hunters afield (UDWR computes rates from raw survey data; some hunters hold more than one permit)")
            if notes:
                row["note"] = "; ".join(notes)
            if unit and unit not in ("Statewide",):
                UNIT_NAMES[sp][unit] = name  # years run 2020 -> 2024, so the latest name wins
            add(row)
    return found


GS_ELK_METHOD = [
    ("extended archery", "archery"),
    ("archery", "archery"),
    ("muzzleloader", "muzzleloader"),
    ("any legal weapon", "rifle"),
    ("any weapon", "rifle"),
]


def bg_gs_elk(y):
    """General-season elk harvest by management unit, one table per season/weapon."""
    lines = bg_lines(y)
    sid = bg_src(y)
    for title, yt, cont, s, e in iter_tables(lines):
        m = re.match(r"General-season (.+?) elk harvest by management unit( / subunit)?$", title)
        if not m or yt != str(y):
            continue
        label = m.group(1).replace("*", "").strip()
        hdr = header_text(lines, s, e)
        multi = "archery" in hdr and "muzzleloader" in hdr and "hunters" in hdr and "afield" not in hdr
        if "cow" in hdr and "calf" in hdr:
            cols = ["bull", "cow", "calf", "total"]
            if multi:
                cols += ["h_arch", "h_alw", "h_muz"]
            else:
                if "afield" in hdr:
                    cols.append("hunters")
                if "hunted" in hdr:
                    cols.append("days")
                if "rate" in hdr or "success" in hdr:
                    cols.append("pct")
        else:
            cols = ["bull", "hunters", "days", "pct"]
            if "hunted" not in hdr:
                cols.remove("days")
        if "multiseason" in label.lower():
            method = "other"
        else:
            method = next((mm for kw, mm in GS_ELK_METHOD if kw in label.lower()), None)
        rows = parse_unit_rows(lines, s, e, len(cols), sub=bool(m.group(2)))
        for unit, name, nums in rows:
            d = dict(zip(cols, [val(x) for x in nums]))
            spec = special_unit(name) if unit is None else None
            if unit is None and spec is None:
                LOG[f"unmatched gs-elk row {y} {label}: {name}"] += 1
                continue
            if spec == "TOTAL":
                CHECK[("elk", y, f"gs {label} statewide")] = {"harvest": d.get("total", d.get("bull")), "hunters": d.get("hunters")}
                continue
            harvest = d.get("total", d.get("bull"))
            hunters = d.get("hunters")
            if isinstance(hunters, float):
                hunters = int(hunters) if hunters.is_integer() else hunters
            pct, comp = success_fields(hunters, harvest, d.get("pct"))
            if hunters is None and harvest is None and pct is None:
                continue
            notes = []
            if "cow" in d:
                if d.get("cow") is not None or d.get("calf") is not None:
                    notes.append(f"Cow {d.get('cow') if d.get('cow') is not None else '—'}, calf {d.get('calf') if d.get('calf') is not None else '—'}")
            if multi:
                notes.append("Hunters afield published by weapon only: archery {}, any weapon {}, muzzleloader {}".format(*[("—" if d[k] is None else d[k]) for k in ("h_arch", "h_alw", "h_muz")]))
            if hunters and harvest is not None and pct is not None and abs(100.0 * harvest / hunters - pct) > 2 and not comp:
                notes.append("Published success rate is not harvest ÷ hunters afield (UDWR computes rates from raw survey data)")
            row = {
                "species": "elk", "year": y, "unit": unit or spec, "unitName": name,
                "method": method, "methodLabel": f"General season: {label}",
                "sex": "male" if "cow" not in d else None,
                "hunters": hunters, "harvest": harvest, "harvestMale": d.get("bull"),
                "successPct": pct, "successComputed": comp, "daysHunted": d.get("days"),
                "sourceId": sid,
            }
            if notes:
                row["note"] = "; ".join(notes)
            add(row)


CHECK = {}

# Statewide statistics tables (one row per year), read from the 2024 report.
STATEWIDE_TABLES = [
    # (title regex, species, columns, methodLabel)
    (r"Statewide mule deer harvest statistics", "mule-deer", ["male", "anl", "total", "hunters"], None),
    (r"Statewide elk harvest statistics", "elk", ["male", "anl", "total", "hunters"], None),
    (r"Statewide pronghorn harvest statistics", "pronghorn", ["male", "anl", "total", "hunters"], None),
    (r"Statewide moose harvest statistics", "moose", ["male", "anl", "total", "permits", "hunters", "days", "pct"], None),
    (r"Statewide desert bighorn sheep harvest statistics", "sheep", ["total", "permits", "hunters", "days", "pct"], "Desert bighorn sheep, all hunts"),
    (r"Statewide Rocky Mountain bighorn sheep harvest\*? statistics", "sheep", ["total", "permits", "hunters", "days", "pct"], "Rocky Mountain bighorn sheep, all hunts"),
    (r"Statewide mountain goat harvest statistics", "goat", ["male", "female", "total", "permits", "hunters", "days", "pct"], None),
]


def bg_statewide(report_year=2024, years=range(2020, 2025)):
    lines = bg_lines(report_year)
    sid = bg_src(report_year)
    for title, yt, cont, s, e in iter_tables(lines):
        for rx, sp, cols, mlabel in STATEWIDE_TABLES:
            if not re.fullmatch(rx, title):
                continue
            for ln in lines[s + 1 : e]:
                m = re.match(r"^\s*(\d{4})(\**)\s", ln)
                if not m or int(m.group(1)) not in years:
                    continue
                r = split_nums(ln, len(cols))
                if not r:
                    LOG[f"statewide row parse fail {sp} {ln.strip()}"] += 1
                    continue
                d = dict(zip(cols, [val(x) for x in r[1]]))
                yr = int(m.group(1))
                pct, comp = success_fields(d.get("hunters"), d.get("total"), d.get("pct"))
                notes = []
                if sp == "sheep":
                    if "desert" in rx:
                        notes.append("Ram harvest")
                    else:
                        notes.append("UDWR's statewide Rocky Mountain bighorn table excludes Antelope Island hunts")
                        if m.group(2) == "**" and yr == 2020:
                            notes.append("Agency footnote: one ewe-only hunt implemented in 2020")
                if "anl" in d and d["anl"] is not None:
                    notes.append(f"Antlerless harvest {d['anl']}")
                if sp in ("mule-deer", "elk", "pronghorn"):
                    notes.append("Statewide hunters afield count each hunter once even if they hunted several units")
                row = {
                    "species": sp, "year": yr, "unit": "Statewide", "unitName": "Statewide",
                    "method": "all", "methodLabel": mlabel or "All hunts",
                    "sex": "all", "hunters": d.get("hunters"), "harvest": d.get("total"),
                    "harvestMale": d.get("male"), "harvestFemale": d.get("female"),
                    "successPct": pct, "successComputed": comp, "daysHunted": d.get("days"),
                    "licenses": d.get("permits"), "sourceId": sid,
                }
                if notes:
                    row["note"] = "; ".join(notes)
                add(row)


# ------------------------------------------------------------------
# Hunt -> unit map from the Big Game Annual Report hunt tables
# ------------------------------------------------------------------
HUNT_LINE = re.compile(r"^\s*(?:[A-Z][A-Za-z-]*(?: [a-z][a-z-]*)*\s+)?(" + UNIT_RE + r")\s+([A-Z]{2})(\d\.?\d{3}|\d{4})\*?\s+(\S.*)$")


BG_WEAPON = [("extended archery", "archery"), ("archery", "archery"), ("muzzleloader", "muzzleloader"),
             ("any legal weapon", "rifle"), ("any weapon", "rifle"), ("multi-season", "other"), ("multiseason", "other")]
HUNT_METHOD = {}


def bg_hunt_units(y):
    m = collections.defaultdict(collections.Counter)
    lines = bg_lines(y)
    titles = {}
    for title, yt, cont, s, e in iter_tables(lines):
        for k in range(s, e):
            titles[k] = title
    for k, ln in enumerate(lines):
        mm = HUNT_LINE.match(ln)
        if not mm:
            continue
        code = mm.group(2) + mm.group(3).replace(".", "")
        m[code][mm.group(1)] += 1
        pre = re.match(r"^\s*([A-Z][A-Za-z-]*(?: [a-z][a-z-]*)*)\s+" + UNIT_RE + r"\s+[A-Z]{2}", ln)
        src_txt = (pre.group(1) if pre else titles.get(k, "")).lower()
        meth = next((mm2 for kw, mm2 in BG_WEAPON if kw in src_txt), None)
        if meth:
            HUNT_METHOD.setdefault((y, code), set()).add(meth)
    out = {}
    for code, c in m.items():
        if len(c) > 1:
            LOG[f"hunt {code} {y} listed under several units {dict(c)}"] += 1
            out[code] = "/".join(sorted(c))  # keep every published unit, never pick one
        else:
            out[code] = next(iter(c))
    return out


# ------------------------------------------------------------------
# Hunt-level harvest reports (LE/OIAL, antlerless, general-season buck deer)
# ------------------------------------------------------------------
PREFIX_SPECIES = {
    "DB": "mule-deer", "DA": "mule-deer", "DX": "mule-deer", "LD": "mule-deer", "LO": "mule-deer",
    "EB": "elk", "EA": "elk", "EL": "elk",
    "PB": "pronghorn", "PD": "pronghorn", "LP": "pronghorn",
    "MB": "moose", "MA": "moose",
    "DS": "sheep", "RS": "sheep", "RE": "sheep",
    "GO": "goat",
    "BI": None,  # bison: out of scope
}
SPECIES_WORD = {
    "Deer": "mule-deer", "Elk": "elk", "Pronghorn": "pronghorn", "Moose": "moose",
    "Desert Bighorn Sheep": "sheep", "Rocky Mountain Bighorn Sheep": "sheep",
    "Mountain Goat": "goat", "Bison": None,
}
WEAPONS = sorted(
    [
        "Any Legal Weapon", "Any Weapon", "Archery", "Archery, Muzzleloader, Shotgun", "Muzzleloader",
        "Early Any Legal Weapon", "Mid Any Legal Weapon", "Late Any Legal Weapon", "Early Any Weapon",
        "Late Any Weapon", "Mid Any Weapon", "Late Archery", "September Archery", "Multiseason", "Multi-season",
        "Extended Archery", "Dedicated Hunter", "HAMSS", "HAMS", "Rifle Restricted", "Muzzleloader Restricted",
        "ALL", "Any Legal Weapon (Shotgun, Archery, Muzzleloader)", "Shotgun", "Restricted Rifle",
        "Restricted Muzzleloader", "Any Bull", "Spike Bull",
    ],
    key=len, reverse=True,
)
SEXES = {"Hunter's Choice": "either", "Female Only": "female", "Male Only": "male"}
SPECIES_PREFIX_WORDS = sorted(SPECIES_WORD, key=len, reverse=True)


def method_of(weapon, hunt_type=""):
    w = (weapon or "").lower()
    if not w:
        return None
    if w in ("multiseason", "multi-season", "dedicated hunter", "all", "hamss", "hams"):
        return "other"
    if "archery, muzzleloader, shotgun" in w:
        return "other"
    if "archery" in w:
        return "archery"
    if "muzzleloader" in w:
        return "muzzleloader"
    if "shotgun" in w:
        return "shotgun"
    if "weapon" in w or "rifle" in w:
        return "rifle"
    return None


def peel(text, vocab):
    t = text.rstrip()
    for v in vocab:
        if t.endswith(v) and (len(t) == len(v) or True):
            return t[: -len(v)].rstrip(), v
    return t, None


def header_cols(hline, prev):
    h = re.sub(r"\s+", " ", hline.strip())
    hp = re.sub(r"\s+", " ", (prev or "").strip())
    if h.startswith("Hunt # Species Hunt Name Hunt Type Weapon Sex Type"):
        return ["permits", "hunters", "harvest", "pct", "days", "satis"]
    if h.startswith("Species Hunt # Hunt Name Weapon Permits Afield Harvest Success Days"):
        return ["permits", "hunters", "harvest", "pct", "days"]
    if h.startswith("Species Hunt # Hunt name Permits Hunters afield Harvest Average days Percent success"):
        return ["permits", "hunters", "harvest", "days", "pct"]
    if h.endswith("Permits Hunters afield Harvest % success* satisfaction"):
        return ["permits", "hunters", "harvest", "pct", "satis"]
    if h.endswith("Permits afield Harvest harvest harvest days success satisfaction"):
        return ["permits", "hunters", "harvest", "male", "female", "days", "pct", "satis"]
    if re.search(r"Permits afield Harvest days (afield )?success\*? satisfaction\*?$", h):
        return ["permits", "hunters", "harvest", "days", "pct", "satis"]
    raise ValueError(f"unknown header: {h}")


def section_sex(section):
    s = section.lower()
    if re.search(r"\b(buck|bull|ram)\b", s):
        return "male"
    return None


def parse_hunt_report(fname, y, sid, kind, units_by_year):
    lines = txt(fname).split("\n")
    cols = None
    section = ""
    prev = ""
    for i, ln in enumerate(lines):
        s = ln.strip()
        m = re.fullmatch(r"(20\d\d) (.+)", s)
        if m and int(m.group(1)) == y and len(s) < 80 and not re.search(r"\d\s*$", s):
            section = m.group(2)
        if "Hunt #" in ln:
            cols = header_cols(ln, prev)
            prev = ln
            continue
        prev = ln
        if kind == "2025":
            mm = re.match(r"^\s*([A-Z]{2}\d{4})\*?\s+(.*)$", ln)
            spword = None
        elif kind.startswith("antlerless"):
            mm = re.match(r"^\s*([A-Z][A-Za-z -]+?)\s+([A-Z]{2}\d{4})\*?\s+(.*)$", ln)
        else:
            mm = re.match(r"^\s*([A-Z]{2}\d{4})\*?\s+(.*)$", ln)
        if not mm:
            continue
        if kind.startswith("antlerless"):
            spword, code, rest = mm.group(1).strip(), mm.group(2), mm.group(3)
        else:
            code, rest = mm.group(1), mm.group(2)
        if re.search(r"No [Dd]ata|Permits surrendered", rest):
            LOG[f"hunt rows marked 'No data'/surrendered {y}"] += 1
            continue
        if cols is None:
            raise ValueError(f"{fname}:{i+1} data before header")
        r = split_nums(rest, len(cols))
        ncols = cols
        if not r and kind == "2025":
            # trailing columns left blank by the agency (e.g. 0 hunters afield)
            for k in range(len(cols) - 1, 1, -1):
                r = split_nums(rest, k)
                if r and re.search(r"[A-Za-z']$", r[0].strip()):
                    ncols = cols[:k]
                    LOG[f"2025 rows with blank trailing columns ({k} of {len(cols)} numbers)"] += 1
                    break
                r = None
        if not r:
            raise ValueError(f"{fname}:{i+1} cannot split {len(cols)} numbers: {ln}")
        text, nums = r
        d = dict(zip(ncols, [val(x) for x in nums]))
        text = text.strip()
        sex = None
        species_note = None
        if kind == "2025":
            text, sx = peel(text, list(SEXES))
            if not sx:
                raise ValueError(f"{fname}:{i+1} no sex type: {ln}")
            sex = SEXES[sx]
        weapon = None
        if kind in ("le22", "gs", "antlerless21", "2025"):
            text, weapon = peel(text, WEAPONS)
            if weapon is None:
                ps = re.split(r"\s{2,}", text)
                if len(ps) < 2:
                    raise ValueError(f"{fname}:{i+1} no weapon: {ln}")
                weapon = ps[-1]
                text = "  ".join(ps[:-1])
                LOG[f"weapon not in vocab (taken from column): {weapon}"] += 1
        parts = [p for p in re.split(r"\s{2,}", text) if p]
        sp = PREFIX_SPECIES.get(code[:2], "??")
        if kind == "2025":
            spw = next((w for w in SPECIES_PREFIX_WORDS if parts and parts[0].startswith(w)), None)
            if spw is None:
                raise ValueError(f"{fname}:{i+1} no species: {ln}")
            first = parts[0][len(spw):].strip()
            parts = ([first] if first else []) + parts[1:]
            if SPECIES_WORD[spw] != sp:
                species_note = f"Agency table lists species as '{spw}'; hunt code {code} and hunt name are {sp}"
        if sp == "??":
            raise ValueError(f"{fname}:{i+1} unknown prefix {code}")
        if sp is None:
            continue
        if kind in ("antlerless20", "antlerless21"):
            hunt_type = spword
            name = " ".join(parts)
        else:
            if len(parts) >= 2:
                name, hunt_type = "  ".join(parts[:-1]), parts[-1]
            elif len(parts) == 1:
                # name and hunt type glued (pdftotext overlap): split on a known type suffix
                name, hunt_type = peel(parts[0], HUNT_TYPES)
                if hunt_type is None:
                    raise ValueError(f"{fname}:{i+1} cannot split name/type: {ln}")
            else:
                raise ValueError(f"{fname}:{i+1} empty text: {ln}")
        name = re.sub(r"\s{2,}", " ", name).strip()
        if sex is None:
            if kind.startswith("antlerless"):
                sex = None
            else:
                sex = section_sex(section)
        hunters = d.get("hunters")
        harvest = d.get("harvest")
        if isinstance(hunters, float) and hunters.is_integer():
            hunters = int(hunters)
        if hunters is None and harvest is None and d.get("pct") is None:
            LOG[f"hunt rows with no numbers {y}"] += 1
            continue
        pct, comp = success_fields(hunters, harvest, d.get("pct"))
        if y == 2025:
            unit = units_by_year.get(2024, {}).get(code)
            prev_name = NAMES_2024.get(code)
            if unit and prev_name is not None and norm_name(prev_name) != norm_name(name):
                LOG[f"2025 hunt name differs from 2024, unit not carried over: {code} '{prev_name}' -> '{name}'"] += 1
                unit = None
            elif unit and prev_name is None:
                LOG[f"2025 hunt {code} not in 2024 hunt reports; unit from 2024 BG report table"] += 1
            unit_note = "Unit id from the 2024 Big Game Annual Report for this hunt code (the 2025 preliminary report lists hunt names only)" if unit else None
        else:
            unit = units_by_year.get(y, {}).get(code)
            unit_note = None
        if unit is None:
            if "statewide" in name.lower():
                unit = "Statewide"
            else:
                unit = name
                unit_note = "UDWR did not publish a unit id for this hunt; unit shows the hunt name"
                LOG[f"hunt without unit id {y} {sp}"] += 1
        label_type = hunt_type.replace("**", "").strip()
        label = f"{label_type}: {weapon}" if weapon else label_type
        notes = [n for n in (unit_note, species_note) if n]
        if hunters and harvest is not None and pct is not None and not comp and hunters >= 20 and abs(100.0 * harvest / hunters - pct) > 2:
            notes.append("UDWR computes success rates from raw survey data, not the projected estimates shown for hunters and harvest")
        if hunters is not None and harvest is not None and harvest > hunters:
            notes.append("Harvest exceeds hunters afield as published (projected survey estimates)")
        row = {
            "species": sp, "year": y, "unit": unit, "unitName": name, "hunt": code,
            "method": method_of(weapon) if weapon else None, "methodLabel": label,
            "sex": sex, "hunters": hunters, "harvest": harvest,
            "harvestMale": d.get("male"), "harvestFemale": d.get("female"),
            "successPct": pct, "successComputed": comp, "daysHunted": d.get("days"),
            "licenses": int(d["permits"]) if isinstance(d.get("permits"), (int, float)) else None,
            "sourceId": sid,
        }
        if notes:
            row["note"] = "; ".join(notes)
        add(row)


HUNT_TYPES = sorted(
    [
        "Limited Entry on General Season", "Premium Limited Entry", "Limited Entry Landowner", "Limited Entry",
        "Management Buck", "Cactus Buck", "Sportsman/Conservation", "Sportsman", "Conservation", "OIAL",
        "CWMU Antlerless", "CWMU Management", "CWMU Cactus", "CWMU", "Antlerless", "General Season Landowner",
        "General Season Youth**", "General Season", "Dedicated Hunter", "Private Lands Only", "Extended Archery",
    ],
    key=len, reverse=True,
)


NAMES_2024 = {}


def norm_name(n):
    return re.sub(r"[^a-z0-9]", "", n.lower().replace("|", "/"))


BG_HUNT_TABLES = [
    (r"Total desert bighorn sheep harvest by hunt", "sheep", ["male", "permits", "hunters", "days", "pct"], "Desert bighorn sheep"),
    (r"Total Rocky Mountain bighorn sheep harvest by hunt", "sheep", ["total", "permits", "hunters", "days", "pct"], "Rocky Mountain bighorn sheep"),
    (r"Total mountain goat harvest by hunt", "goat", ["male", "female", "total", "permits", "hunters", "days", "pct"], "Mountain goat"),
    (r"Once-in-a-lifetime bull moose harvest", "moose", ["male", "permits", "hunters", "days", "pct"], "Once-in-a-lifetime bull moose"),
]


def bg_hunt_tables_fill(y):
    """Add OIAL hunts (mostly conservation permits) that the BG annual report lists but the
    separate LE/OIAL harvest report for the same year does not."""
    lines = bg_lines(y)
    sid = bg_src(y)
    have = {(sp, r.get("hunt")) for sp, rows in ROWS.items() for r in rows if r["year"] == y and r.get("hunt")}
    # hunt codes printed anywhere in this year's BG report
    bg_codes = set()
    for ln in lines:
        mm = HUNT_LINE.match(ln)
        if mm:
            bg_codes.add(mm.group(2) + mm.group(3).replace(".", ""))
    # LE-report hunts whose code the BG report never prints, by species + normalized name
    orphan_names = collections.defaultdict(set)
    for sp, rows in ROWS.items():
        for r in rows:
            if r["year"] == y and r.get("hunt") and r["hunt"] not in bg_codes:
                orphan_names[sp].add(norm_name(r["unitName"]))
    for title, yt, cont, s0, e in iter_tables(lines):
        for rx, sp, cols, label in BG_HUNT_TABLES:
            if not re.fullmatch(rx, title) or yt != str(y):
                continue
            prefix = {"Desert bighorn sheep": "DS", "Rocky Mountain bighorn sheep": "RS", "Mountain goat": "GO", "Once-in-a-lifetime bull moose": "MB"}[label]
            for ln in lines[s0 + 1 : e]:
                sw = re.match(r"^\s+Statewide Sportsman/Conservation\s+(.*)$", ln)
                if sw:
                    le_has = any(r["year"] == y and (r.get("hunt") or "").startswith(prefix) and "statewide" in r.get("unitName", "").lower()
                                 for r in ROWS.get(sp, []))
                    r = split_nums(" " + sw.group(1), len(cols))
                    if le_has or not r:
                        continue
                    d = dict(zip(cols, [val(x) for x in r[1]]))
                    harvest = d.get("total", d.get("male"))
                    pct, comp = success_fields(d.get("hunters"), harvest, d.get("pct"))
                    add({"species": sp, "year": y, "unit": "Statewide Sportsman/Conservation", "unitName": "Statewide sportsman/conservation permits",
                         "methodLabel": f"{label}: statewide sportsman/conservation permits",
                         "hunters": d.get("hunters"), "harvest": harvest, "harvestMale": d.get("male") if sp == "goat" else None,
                         "harvestFemale": d.get("female"), "successPct": pct, "successComputed": comp, "daysHunted": d.get("days"),
                         "licenses": d.get("permits"),
                         "note": "Statewide permits (hunt code not printed); not listed in UDWR's separate LE/OIAL harvest report for this year, row from the Big Game Annual Report hunt table",
                         "sourceId": sid})
                    LOG[f"BG statewide sportsman/conservation row added {y} {label}"] += 1
                    continue
                mm = HUNT_LINE.match(ln)
                if not mm:
                    continue
                code = mm.group(2) + mm.group(3).replace(".", "")
                if (sp, code) in have:
                    continue
                r = split_nums(" " + mm.group(4), len(cols))
                if not r:
                    LOG[f"bg hunt-table row not parsed {y} {ln.strip()}"] += 1
                    continue
                d = dict(zip(cols, [val(x) for x in r[1]]))
                name = re.sub(r"\s{2,}", " ", r[0]).strip().rstrip("*")
                if norm_name(name) in orphan_names[sp]:
                    # same hunt printed under a different code in the two reports: keep the LE-report row only
                    LOG[f"BG hunt {code} {y} '{name}' matches an LE-report hunt with a code the BG report never prints; not added"] += 1
                    continue
                harvest = d.get("total", d.get("male"))
                pct, comp = success_fields(d.get("hunters"), harvest, d.get("pct"))
                notes = ["Hunt not listed in UDWR's separate LE/OIAL harvest report for this year; row taken from the Big Game Annual Report hunt table"]
                if mm.group(3).find(".") >= 0:
                    notes.append(f"Agency table prints the hunt number as {mm.group(2)}{mm.group(3)}")
                add({"species": sp, "year": y, "unit": mm.group(1), "unitName": name, "hunt": code,
                     "methodLabel": label + (" (conservation permit)" if "conservation" in name.lower() else ""),
                     "sex": "female" if "ewe only" in name.lower() else ("male" if sp in ("moose",) or label.startswith("Desert") else None),
                     "hunters": d.get("hunters"), "harvest": harvest, "harvestMale": d.get("male") if sp == "goat" else None,
                     "harvestFemale": d.get("female"), "successPct": pct, "successComputed": comp,
                     "daysHunted": d.get("days"), "licenses": d.get("permits"), "note": "; ".join(notes), "sourceId": sid})
                have.add((sp, code))
                LOG[f"BG-only OIAL hunts added {y} {sp}"] += 1


def hunt_reports():
    units = {y: bg_hunt_units(y) for y in range(2020, 2025)}
    for y in range(2020, 2025):
        le_kind = "le20" if y <= 2021 else "le22"
        f = f"pdf__bg__{y}__{y}_le_oial_all.txt"
        sid = src(f"h-le{y}", f"{y} Limited-entry and once-in-a-lifetime species harvest report",
                  f"https://wildlife.utah.gov/pdf/bg/{y}/{y}_le_oial_all.pdf", y)
        parse_hunt_report(f, y, sid, le_kind, units)
        f = f"pdf__bg__{y}__{y}_antlerless_hr.txt"
        sid = src(f"h-anl{y}", f"{y} Antlerless big game harvest report",
                  f"https://wildlife.utah.gov/pdf/bg/{y}/{y}_antlerless_hr.pdf", y)
        parse_hunt_report(f, y, sid, "antlerless20" if y == 2020 else "antlerless21", units)
        f = f"pdf__bg__{y}__{y}_gs_buck_deer_hr.txt"
        sid = src(f"h-gsd{y}", f"{y} General-season buck deer harvest report",
                  f"https://wildlife.utah.gov/pdf/bg/{y}/{y}_gs_buck_deer_hr.pdf", y)
        parse_hunt_report(f, y, sid, "gs", units)
    for y in range(2020, 2025):
        bg_hunt_tables_fill(y)
    for sp, rows in ROWS.items():
        for r in rows:
            if r["year"] == 2024 and r.get("hunt"):
                NAMES_2024[r["hunt"]] = r["unitName"]
    sid = src("h-bg2025p", "2025 Utah Big Game Harvest (preliminary, all limited-entry, OIAL, antlerless and general-season hunts)",
              "https://wildlife.utah.gov/pdf/bg/2025/2025_gs_buck_deer_hr-preliminary.pdf", 2025,
              notes="Preliminary — UDWR posted it as the 2025 preliminary harvest report; final 2025 Big Game Annual Report not yet published (checked 2026-10-31)")
    parse_hunt_report("pdf__bg__2025__2025_gs_buck_deer_hr-preliminary.txt", 2025, sid, "2025", units)
    return units


# ------------------------------------------------------------------
# Black bear and cougar annual reports
# ------------------------------------------------------------------
def appendix_tables(fname, title_rx):
    """Yield (name, code, rows_by_year{year: [tokens]}, star_years) from per-unit history tables."""
    lines = txt(fname).split("\n")
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        joined = ln
        if ln and not re.search(r"\d{4}\.\s*$", ln) and i + 1 < len(lines) and re.match(r"^\s*\d{4}\.?\s*$|^\s*\d{4}(–\d{4})?(, \d{4}–\d{4})*\.\s*$", lines[i + 1]):
            joined = ln + " " + lines[i + 1].strip()
        m = re.match(title_rx, joined)
        if not m:
            i += 1
            continue
        name, code = m.group(1).strip(), m.group(2).strip()
        rows = {}
        stars = {}
        j = i + 1
        while j < len(lines) and j < i + 70:
            t = lines[j]
            if re.match(title_rx, t.strip()):
                break
            mm = re.match(r"^\s*(\d{4})\s+(.*)$", t)
            if mm and 2000 <= int(mm.group(1)) <= 2030:
                toks = mm.group(2).replace("Unlimited", "U").split()
                rows[int(mm.group(1))] = toks
            j += 1
        yield name, code, rows, j
        i = j


def tokval(t):
    if t == "U":
        return None
    return val(t.lstrip("/\\"))


def bear_lion_appendix():
    # Bear 2020-2024 from the 2024 report appendix (unit codes as printed, e.g. "10ab")
    sid = src("h-bear2024", "2024 Utah Black Bear Annual Report (appendix: black bear mortality by hunt unit)",
              "https://wildlife.utah.gov/pdf/annual-reports/bear/24_black_bear_report.pdf", 2024,
              page=None)
    rx = r"^Black bear mortality for (.+?)(?: unit)? \((?:unit )?([0-9][0-9a-z/, ]*?)(?:, all subunits)?\),\s*Utah"
    seen = set()
    for name, code, rows, _ in appendix_tables("24_black_bear_report.txt", rx):
        for y in range(2020, 2025):
            if y not in rows:
                continue
            toks = rows[y]
            if len(toks) not in (11, 12):  # 12 = extra "Unknown" depredation column
                LOG[f"bear appendix row with {len(toks)} cols {name} {y}: {toks}"] += 1
                continue
            v = [tokval(t) for t in toks]
            permits, male, female, total, pfill, pfem, padm, age = v[:8]
            notes = []
            if any(t.endswith("*") for t in toks[1:4]):
                notes.append("Total includes harvest of unknown sex (agency footnote)")
            if pfill is not None:
                notes.append(f"{pfill:g}% of permits filled")
            if age is not None:
                notes.append(f"mean age {age:g}")
            notes.append("UDWR does not publish bear hunters afield by unit")
            key = (y, code)
            if key in seen:
                continue
            seen.add(key)
            UNIT_NAMES["bear"].setdefault(code, name)
            add({"species": "bear", "year": y, "unit": code, "unitName": name, "method": "all",
                 "methodLabel": "All hunter harvest (limited entry, harvest objective, conservation; excludes depredation)",
                 "sex": "all", "hunters": None, "harvest": total, "harvestMale": male, "harvestFemale": female,
                 "successPct": None, "licenses": permits, "note": "; ".join(notes), "sourceId": sid})

    sid = src("h-lion2024", "2024 Utah Cougar Annual Report (appendix: cougar mortality by management unit)",
              "https://wildlife.utah.gov/pdf/annual-reports/cougar/24_cougar_annual_report.pdf", 2024,
              page=None)
    rx = r"^Cougar mortality for (.+?) \(([0-9][0-9A-Za-z/ -]*?)(?: - [^)]*)?\),\s*Utah"
    seen = set()
    for name, code, rows, _ in appendix_tables("24_cougar_annual_report.txt", rx):
        for y in range(2020, 2025):
            if y not in rows:
                continue
            toks = rows[y]
            if len(toks) != 15:
                LOG[f"cougar appendix row with {len(toks)} cols {name} {y}: {toks}"] += 1
                continue
            v = [tokval(t) for t in toks]
            le, quota, male, female, total, age, pperm, pquota, pfem, padf, p5, treed, ws, other, totmort = v
            notes = []
            if toks[1] == "U":
                notes.append("Harvest-objective quota: unlimited")
            elif quota is not None:
                notes.append(f"Harvest-objective quota {quota:g}")
            if any(t.endswith("*") for t in toks[2:5]):
                notes.append("Total includes harvest of unknown sex (agency footnote)")
            if pfem is not None:
                notes.append(f"{pfem:g}% females")
            if any(t.startswith("\\") for t in toks):
                notes.append("Agency table prints a stray backslash before the male harvest figure; value read as the digit shown (male + female = total)")
            notes.append("UDWR does not publish cougar hunters afield by unit")
            key = (y, code)
            if key in seen:
                continue
            seen.add(key)
            UNIT_NAMES["lion"].setdefault(code, name)
            add({"species": "lion", "year": y, "unit": code, "unitName": name, "method": "all",
                 "methodLabel": "All hunter harvest (limited entry, harvest objective, conservation; excludes Wildlife Services and other mortality)",
                 "sex": "all", "hunters": None, "harvest": total, "harvestMale": male, "harvestFemale": female,
                 "successPct": None, "licenses": int(le) if le is not None else None, "note": "; ".join(notes), "sourceId": sid})


def plumber_lines(pdfname, page_filter):
    """Text lines of selected pages with superscript footnote marks split out.

    Returns list of (page_no, text, [superscripts]) in reading order."""
    import pdfplumber

    out = []
    with pdfplumber.open(os.path.join(RAW, pdfname)) as pdf:
        for pn, page in enumerate(pdf.pages):
            t = page.extract_text() or ""
            if not page_filter(pn, t):
                continue
            words = page.extract_words(extra_attrs=["size"], keep_blank_chars=False, use_text_flow=False)
            if not words:
                continue
            sizes = sorted(w["size"] for w in words)
            body = sizes[len(sizes) // 2]
            big = [w for w in words if w["size"] >= 0.8 * body]
            small = [w for w in words if w["size"] < 0.8 * body]
            lines = []
            for w in sorted(big, key=lambda w: (round(w["top"]), w["x0"])):
                for L in lines:
                    if abs(L["top"] - w["top"]) < 3:
                        L["w"].append(w)
                        break
                else:
                    lines.append({"top": w["top"], "w": [w], "sup": []})
            for sw in small:
                # a superscript sits just above (or on) the baseline of its row
                cand = [L for L in lines if -1 <= L["top"] - sw["top"] <= 6]
                if cand:
                    min(cand, key=lambda L: abs(L["top"] - sw["top"]))["sup"].append(sw["text"])
            for L in sorted(lines, key=lambda L: L["top"]):
                text = " ".join(w["text"] for w in sorted(L["w"], key=lambda w: w["x0"]))
                out.append((pn, text.replace("ﬀ", "ff").replace("ﬁ", "fi"), L["sup"]))
    return out


def table_rows(lines, start_rx, stop_rx, ncols):
    """Rows of a table: (name, [ncols tokens], sups). Handles names wrapped over 2 lines."""
    rows = []
    on = False
    pending = None
    last_numeric = None
    for pn, text, sups in lines:
        if re.search(start_rx, text):
            on = True
            continue
        if not on:
            continue
        if re.search(stop_rx, text):
            break
        # a lone "*" in a cell means "see footnote" (e.g. unlimited quotas); treat it as an empty cell
        text = re.sub(r"(?<=\s)\*(?=\s|$)", "—", text)
        r = split_nums(" " + text, ncols)
        if r:
            name = r[0].strip()
            if not name:
                rows.append([pending or "", r[1], sups])
                last_numeric = rows[-1]
                pending = None
            else:
                rows.append([name, r[1], sups])
                last_numeric = None
                pending = None
            continue
        if re.search(r"\|\s*20\d\d Utah|Unit name|Permits|harvest|^Unit$|Year", text):
            continue
        if last_numeric is not None and pending is None:
            # second half of a wrapped name
            last_numeric[0] = (last_numeric[0] + " " + text).strip()
            last_numeric = None
            continue
        pending = text
    return rows


def bear_lion_2025():
    sid = src("h-bear2025", "2025 Utah Black Bear Annual Report",
              "https://wildlife.utah.gov/pdf/annual-reports/bear/25_black_bear_report.pdf", 2025,
              page=None)
    lines = plumber_lines("25_black_bear_report.pdf", lambda pn, t: 6 <= pn <= 12)
    rows = table_rows(lines, r"^Table 3\. Black bear hunter harvest", r"^Figure 2\.|^Table 4\.", 10)
    for name, toks, sups in rows:
        v = [val(t) for t in toks]
        permits, male, female, unk, total, pfill, pfem, padm, age, dep = v
        unit = "Statewide" if name == "Totals" else name
        notes = []
        if unk:
            notes.append(f"Includes {unk} of unknown sex")
        if pfill is not None:
            notes.append(f"{pfill:g}% of permits & quota filled")
        if age is not None:
            notes.append(f"mean age {age:g}")
        notes.append("UDWR does not publish bear hunters afield by unit")
        if unit != "Statewide":
            UNIT_NAMES["bear"].setdefault(unit, name)
        add({"species": "bear", "year": 2025, "unit": unit, "unitName": name if unit != "Statewide" else "Statewide",
             "method": "all", "methodLabel": "All hunter harvest (limited entry, harvest objective, conservation; excludes depredation)",
             "sex": "all", "hunters": None, "harvest": total, "harvestMale": male, "harvestFemale": female,
             "successPct": None, "licenses": permits, "note": "; ".join(notes), "sourceId": sid})
        CHECK.setdefault(("bear", 2025, "units"), []).append((unit, total))
    # Statewide 2020-2024 from Table 2 of the 2025 report (superscripts = unknown-sex counts)
    rows = table_rows(lines, r"^Table 2\. Historical black bear harvest", r"Footnotes indicate|^Table 3\.", 8)
    for name, toks, sups in rows:
        if not re.fullmatch(r"20(2[0-4])", name):
            continue
        y = int(name)
        permits, male, female, total, pfem, padm, age, dep = [val(t) for t in toks]
        notes = [f"Permits sold {permits}"]
        if sups:
            notes.append(f"Total includes {''.join(sups)} of unknown sex (agency footnote)")
        notes.append("UDWR does not publish bear hunters afield")
        add({"species": "bear", "year": y, "unit": "Statewide", "unitName": "Statewide", "method": "all",
             "methodLabel": "All hunter harvest (limited entry, harvest objective, conservation; excludes depredation)",
             "sex": "all", "hunters": None, "harvest": total, "harvestMale": male, "harvestFemale": female,
             "successPct": None, "licenses": permits, "note": "; ".join(notes), "sourceId": sid})

    sid = src("h-lion2025", "2025 Utah Cougar Annual Report",
              "https://wildlife.utah.gov/pdf/annual-reports/cougar/25_cougar_annual_report.pdf", 2025,
              page=None)
    lines = plumber_lines("25_cougar_annual_report.pdf", lambda pn, t: 4 <= pn <= 11)
    rows = table_rows(lines, r"^Table 3\. Statewide cougar harvest statistics by management unit", r"^Table 4\.|Footnotes indicate", 8)
    for name, toks, sups in rows:
        male, female, total, age, pfem, udaf, nuis, other = [val(t) for t in toks]
        unit = "Statewide" if name == "Totals" else name
        notes = []
        sup_digits = [s for s in sups if re.fullmatch(r"\d+", s)]
        if sup_digits:
            notes.append(f"Total includes {sup_digits[-1] if unit == 'Statewide' else sup_digits[0]} of unknown sex (agency footnote)")
        if pfem is not None:
            notes.append(f"{pfem:g}% females")
        if age is not None:
            notes.append(f"mean age {age:g}")
        notes.append("UDWR does not publish cougar hunters afield by unit")
        if unit != "Statewide":
            UNIT_NAMES["lion"].setdefault(unit, name)
        add({"species": "lion", "year": 2025, "unit": unit, "unitName": name if unit != "Statewide" else "Statewide",
             "method": "all", "methodLabel": "All hunter harvest (excludes UDAF/Wildlife Services, nuisance/safety and other mortality)",
             "sex": "all", "hunters": None, "harvest": total, "harvestMale": male, "harvestFemale": female,
             "successPct": None, "note": "; ".join(notes), "sourceId": sid})
        CHECK.setdefault(("lion", 2025, "units"), []).append((unit, total, male, female, sup_digits))
    rows = table_rows(lines, r"^Table 2\. Statewide historical cougar harvest", r"^Table 3\.", 11)
    for name, toks, sups in rows:
        if not re.fullmatch(r"20(2[0-4])", name):
            continue
        y = int(name)
        v = [None if t == "*" else val(t) for t in toks]
        le, quota, male, female, total, age, pfem, treed, ws, other, totmort = v
        notes = []
        sup_digits = [s for s in sups if re.fullmatch(r"\d+", s)]
        if sup_digits:
            notes.append(f"Total includes {sup_digits[0]} of unknown sex (agency footnote)")
        notes.append("UDWR does not publish cougar hunters afield")
        add({"species": "lion", "year": y, "unit": "Statewide", "unitName": "Statewide", "method": "all",
             "methodLabel": "All hunter harvest (excludes UDAF/Wildlife Services and other mortality)",
             "sex": "all", "hunters": None, "harvest": total, "harvestMale": male, "harvestFemale": female,
             "successPct": None, "licenses": int(le) if le is not None else None, "note": "; ".join(notes), "sourceId": sid})


# ------------------------------------------------------------------
# Wild turkey (Upland Game Annual Reports)
# ------------------------------------------------------------------
UPLAND = ["2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


def upland_src(season):
    return src(f"h-upland{season}", f"Utah Upland Game Annual Report {season} (wild turkey section)",
               f"https://wildlife.utah.gov/pdf/annual-reports/upland/{season}.pdf", int("20" + season[-2:]),
               page="https://wildlife.utah.gov/uplandgame/reports")


def find_table(lines, title_rx):
    for i, ln in enumerate(lines):
        if re.search(title_rx, ln):
            j = i + 1
            while j < len(lines) and not TITLE_RE.match(lines[j].strip()) and not re.match(r"^\s*(Table|Figure) \d+\.", lines[j]):
                j += 1
            return i, j
    return None


def turkey():
    TK = "turkey"
    for season in UPLAND:
        lines = txt(f"upland_{season}.txt").split("\n")
        sid = upland_src(season)
        spring = int("20" + season[-2:])
        fall = spring - 1
        if season != "2025-26":
            # spring limited entry / CWMU by hunt
            t = find_table(lines, rf"Spring limited entry/CWMU wild turkey spring harvest statistics by hunt, Utah {spring}")
            if not t:
                LOG[f"turkey: no LE table {season}"] += 1
            else:
                for ln in lines[t[0] + 1 : t[1]]:
                    m = re.match(r"^\s*(TK\d{4})\s+(.*)$", ln)
                    if not m:
                        continue
                    r = split_nums(m.group(2), 7)
                    if not r:
                        raise ValueError(f"turkey LE row {season}: {ln}")
                    permits, n, hunters, harvest, dpub, dpriv, pct = [val(x) for x in r[1]]
                    name = r[0].strip()
                    add({"species": TK, "year": spring, "unit": name, "unitName": name, "hunt": m.group(1),
                         "method": "all", "methodLabel": "Spring limited entry/CWMU", "hunters": hunters, "harvest": harvest,
                         "successPct": pct, "licenses": permits,
                         "note": f"Survey sample n={n}; mean days afield public land {dpub if dpub is not None else '—'}, private land {dpriv if dpriv is not None else '—'}",
                         "sourceId": sid})
            # spring general season by region and county
            t = find_table(lines, rf"Spring statewide general-season wild turkey harvest statistics by region and county, Utah {spring}")
            region = None
            for ln in lines[t[0] + 1 : t[1]]:
                st = ln.strip()
                mreg = re.fullmatch(r"([A-Z][a-z]+ Region)(?: areas)?\*?", st)
                if mreg:
                    region = mreg.group(1)
                    last = None
                    continue
                r = split_nums(ln, 6)
                if not r:
                    continue
                name = r[0].strip().rstrip("*")
                n, hunters, harvest, dpub, dpriv, pct = [val(x) for x in r[1]]
                notes = [f"Survey sample n={n}; mean days afield public land {dpub if dpub is not None else '—'}, private land {dpriv if dpriv is not None else '—'}"]
                if name.startswith("Regional total"):
                    unit, uname = region, f"{region} total"
                    notes.append("Regional hunters afield are not the sum of counties (hunters hunted several counties)")
                elif name.startswith("Statewide total"):
                    unit, uname = "Statewide", "Statewide (county table total)"
                    notes.append("Statewide hunters afield are not the sum of counties; this total comes from the county table and differs from the agency's separate statewide general-season summary table")
                elif re.fullmatch(r"[A-Z][a-z]+ Region", name):
                    unit, uname = name, name
                elif name == "Unknown":
                    unit, uname = "Unknown county", "Unknown county"
                else:
                    unit, uname = name, f"{name} County ({region})"
                    UNIT_NAMES[TK].setdefault(name, f"{name} County")
                if hunters is None and harvest is None and pct is None:
                    continue
                add({"species": TK, "year": spring, "unit": unit, "unitName": uname, "method": "all",
                     "methodLabel": "Spring general season (by county of harvest)", "hunters": hunters, "harvest": harvest,
                     "successPct": pct, "note": "; ".join(notes), "sourceId": sid})
            # fall by region and hunt area
            t = find_table(lines, rf"Fall (management )?wild turkey harvest statistics by region and hunt area, Utah {fall}")
            region = None
            last = None
            region_line = None
            for ln in (lines[t[0] + 1 : t[1]] if fall >= 2020 else []):
                st0 = ln.strip()
                if last is not None and st0 and not split_nums(ln, 8) and not re.match(r"[*A-Z][a-z]+ Region|\*|Total permits|[a-z]", st0) and len(ln) - len(ln.lstrip()) >= 4 and len(st0) < 40:
                    last["unit"] = last["unit"].replace(f" ({region})", f" {st0} ({region})")
                    last["unitName"] = last["unit"]
                    last = None
                    continue
                st = ln.strip()
                mreg = re.fullmatch(r"([A-Z][a-z]+ Region)(?: areas)?\*?", st)
                if mreg:
                    region = mreg.group(1)
                    last = None
                    continue
                r = split_nums(ln, 8)
                if not r:
                    continue
                name = r[0].strip().rstrip("*")
                n, hunters, male, female, unk, total, days, pct = [val(x) for x in r[1]]
                notes = [f"Survey sample n={n}"]
                if unk:
                    notes.append(f"{unk} of unknown sex")
                if name.startswith("Regional total"):
                    if region_line == r[1]:
                        continue  # repeats the single region line above
                    unit, uname = region, f"{region} total"
                    notes.append("Regional sample size and hunters afield are not the sum of areas (hunters hunted several areas)")
                elif re.fullmatch(r"[A-Z][a-z]+ Region", name):
                    region = name
                    unit, uname = name, name
                    region_line = r[1]
                    notes.append("Region reported as a single line")
                else:
                    unit, uname = f"{name} ({region})", f"{name} ({region})"
                if hunters is None and total is None and pct is None:
                    continue
                if hunters is not None and total is not None and hunters > 0 and pct is not None and abs(100.0 * total / hunters - pct) > 2:
                    notes.append("Published percent success is not total harvest ÷ hunters (fall hunters may take more than one bird)")
                row = {"species": TK, "year": fall, "unit": unit, "unitName": uname, "method": "all",
                       "methodLabel": "Fall management hunt (by region and hunt area)", "hunters": hunters, "harvest": total,
                       "harvestMale": male, "harvestFemale": female, "successPct": pct, "daysHunted": days,
                       "note": "; ".join(notes), "sourceId": sid}
                add(row)
                last = ROWS[TK][-1] if not name.startswith("Regional") else None
        if season == "2024-25":
            # statewide summaries 2020-2025 (latest edition)
            for rx, label, ncol, yrs in [
                (r"Statewide limited-entry/CWMU wild turkey harvest statistics, Utah 1991–2025", "Spring limited entry/CWMU (statewide summary)", 5, range(2020, 2026)),
                (r"Statewide general-season\* wild turkey harvest statistics, Utah 2010–2025", "Spring general season (statewide summary)", 4, range(2020, 2026)),
                (r"Statewide fall management wild turkey harvest statistics, Utah 2014–2024", "Fall management hunt (statewide summary)", 4, range(2020, 2025)),
            ]:
                t = find_table(lines, rx)
                for ln in lines[t[0] + 1 : t[1]]:
                    m = re.match(r"^\s*(\d{4})\*?\s", ln)
                    if not m or int(m.group(1)) not in yrs:
                        continue
                    r = split_nums(ln, ncol)
                    v = [val(x) for x in r[1]]
                    permits, hunters, harvest = v[0], v[1], v[2]
                    pct = v[-1]
                    add({"species": TK, "year": int(m.group(1)), "unit": "Statewide", "unitName": "Statewide", "method": "all",
                         "methodLabel": label, "hunters": hunters, "harvest": harvest, "successPct": pct, "licenses": permits,
                         "sourceId": sid})
        if season == "2025-26":
            # Table 29: fall 2025 by hunt; Table 31: spring 2026 by hunt
            t = find_table(lines, r"^Table 29\. Fall management wild turkey harvest statistics by region, Utah, 2025")
            for ln in lines[t[0] + 1 : t[0] + 30]:
                if re.match(r"^\s*(Table|Figure|Wild turkey mitigation)", ln):
                    break
                r = split_nums(ln, 11)
                if not r:
                    continue
                permits, n, hunters, male, female, unk, total, daystot, pjuv, sat, crowd = [val(x) for x in r[1]]
                text = r[0].strip()
                m = re.match(r"^(TK\d{4})\s+(.*)$", text)
                notes = [f"Survey sample n={n}; total days afield {daystot}; {pjuv:g}% juveniles"]
                if unk:
                    notes.append(f"{unk} of unknown sex")
                row = {"species": TK, "year": 2025, "method": "all", "methodLabel": "Fall management hunt (by hunt)",
                       "hunters": hunters, "harvest": total, "harvestMale": male, "harvestFemale": female,
                       "licenses": permits, "sourceId": sid}
                # UDWR publishes no success rate here; harvest/hunters would be birds per hunter, not
                # the share of hunters who harvested, so successPct is left null.
                row.update({"successPct": None})
                if m:
                    row.update({"unit": m.group(2), "unitName": m.group(2), "hunt": m.group(1)})
                else:
                    row.update({"unit": "Statewide", "unitName": "Statewide"})
                notes.append("UDWR publishes no success rate for this table (fall hunters may take more than one bird)")
                row["note"] = "; ".join(notes)
                add(row)
            t = find_table(lines, r"^Table 31\. Spring wild turkey harvest statistics by hunt, Utah, 2026")
            for ln in lines[t[0] + 1 : t[0] + 20]:
                m = re.match(r"^\s*(TK\d{4})\s+(.*)$", ln)
                if not m:
                    continue
                r = split_nums(m.group(2), 6)
                permits, n, hunters, harvest, daystot, pct = [val(x) for x in r[1]]
                name = r[0].strip()
                unit = "Statewide" if name.lower().startswith("general season statewide") else re.sub(r"^Limited entry ", "", name)
                add({"species": TK, "year": 2026, "unit": unit[0].upper() + unit[1:], "unitName": name, "hunt": m.group(1),
                     "method": "all", "methodLabel": "Spring general season" + (" (youth hunters)" if "youth" in name else " (adult hunters)") if name.lower().startswith("general") else "Spring limited entry/CWMU",
                     "hunters": hunters, "harvest": harvest, "successPct": pct, "licenses": permits,
                     "note": f"Survey sample n={n}; total days afield {daystot}; percent success published as a whole number",
                     "sourceId": sid})


def sheep_goat_unit_names():
    lines = bg_lines(2024)
    for title, yt, cont, s0, e in iter_tables(lines):
        if re.match(r"Total (ram desert bighorn sheep|Rocky Mountain bighorn sheep|billy mountain goat|nanny mountain goat) harvest\*? by management unit", title):
            sp = "goat" if "goat" in title else "sheep"
            for ln in lines[s0 + 1 : e]:
                m = re.match(r"^\s*(" + UNIT_RE + r")\s+(\S.*?)\s{2,}", ln)
                if m:
                    nm = m.group(2).rstrip("*").strip()
                    names = UNIT_NAMES[sp].setdefault(m.group(1), [])
                    if nm not in names:
                        names.append(nm)
    for sp in ("sheep", "goat"):
        for k, v in list(UNIT_NAMES[sp].items()):
            if isinstance(v, list):
                UNIT_NAMES[sp][k] = " / ".join(v)


def main():
    global RAW
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    RAW = sys.argv[1]
    for y in range(2020, 2025):
        bg_unit_totals(y)
        bg_gs_elk(y)
    bg_statewide()
    hunt_reports()
    sheep_goat_unit_names()
    bear_lion_appendix()
    bear_lion_2025()
    turkey()
    write()
    for k, v in sorted(LOG.items()):
        print(f"LOG {v:5d}  {k}")
    for sp, rows in sorted(ROWS.items()):
        print(sp, len(rows))


COMMON_BG = (
    "Row types: (1) unit totals for all hunts combined (method 'all', no hunt) from each year's Big Game Annual Report, 2020-2024; "
    "(2) one row per hunt code (hunt set) from UDWR's limited-entry/OIAL, antlerless and general-season harvest reports, 2020-2024, "
    "and from the 2025 preliminary harvest report; (3) one 'Statewide' row per year from the statewide statistics table of the 2024 "
    "Big Game Annual Report. Do not add hunt rows to unit totals - the unit totals already include every hunt. "
    "Hunt-row unit ids come from the same year's Big Game Annual Report hunt tables; for 2025 they come from the 2024 report when the hunt "
    "code and hunt name match, otherwise unit is the hunt name (see row note). daysHunted is UDWR's mean days hunted per hunter. "
    "UDWR computes success rates from raw survey data, so they can differ from harvest/hunters; rates are shown as published. "
    "Hunts the agency printed as 'No data' are omitted; the 2023-2024 LE/OIAL reports do not list statewide sportsman/conservation permits for deer, elk or pronghorn "
    "(those permits appear in the unit-total table as 'Statewide Sportsman/Conservation'). 2025 numbers are preliminary; the 2025 Big Game Annual Report (unit totals) "
    "was not published as of 2026-10-31."
)
COVERAGE_NOTES = {
    "elk": COMMON_BG + " Also included for 2020-2024: general-season elk harvest by unit for each season/weapon table (archery, extended archery, "
    "spike and any-bull rifle/any legal weapon, muzzleloader, youth, multiseason); 2020 tables are by unit/subunit (unit id = unit + subunit letter). "
    "Multiseason tables publish hunters only by weapon, so hunters is null and the weapon counts are in the note. "
    "Sum of unit totals vs statewide total: 2020 13,600 vs 13,600; 2021 14,611 vs 14,601; 2022 15,421 vs 15,447; 2023 13,368 vs 13,376; 2024 14,495 vs 14,494 (agency rounding of projected estimates).",
    "mule-deer": COMMON_BG + " Utah's deer are mule deer. Unit-total rows carry buck harvest in harvestMale and antlerless harvest in the note. "
    "Sum of unit totals vs statewide total harvest: 2020 25,367 vs 25,428; 2021 26,341 vs 26,631; 2022 27,460 vs 27,536; 2023 20,338 vs 20,344; 2024 24,699 vs 24,721 "
    "(the agency's unit table does not add up to its statewide figure; both are shown as published).",
    "pronghorn": COMMON_BG + " From 2021 the unit-total table is published by subunit; where several subunits share a unit id the unit field is the id followed by the area name "
    "(e.g. '1 Box Elder, Promontory'). The 2022 table prints 'West Desert, Riverbed' twice with different figures; both rows are kept (second marked 'row 2'). "
    "A 2022 published success rate of 104.5% is stored as null. Harvest can exceed hunters because doe/fawn hunters may hold several permits. "
    "Unit totals sum to the statewide total in 2021-2024 (2020: 2,150 vs 2,157 including the statewide sportsman row).",
    "moose": COMMON_BG + " 2020 unit totals are by unit/subunit (e.g. '8A'). Unit totals (including the statewide sportsman/conservation row) sum exactly to the "
    "statewide harvest in every year 2020-2024 (195, 189, 188, 172, 189); hunt rows sum to the same totals once the 2023-24 statewide permit rows (added from the "
    "Big Game Annual Report) are included.",
    "sheep": COMMON_BG.replace("(1) unit totals for all hunts combined (method 'all', no hunt) from each year's Big Game Annual Report, 2020-2024; ", "")
    + " Desert bighorn (DS hunts) and Rocky Mountain bighorn (RS/RE hunts, including ewe hunts) are combined in this file; statewide rows are given separately "
    "for each subspecies (see methodLabel). UDWR publishes no unit-total table for sheep, only hunt rows. Conservation-permit hunts and statewide "
    "sportsman/conservation permits that the separate LE/OIAL report omits were added from the same year's Big Game Annual Report hunt tables (row note says so); "
    "where the two reports print the same hunt under different codes (2020-21 RS6719/RS6725 Nebo) only the LE-report row is kept. "
    "With that, hunt rows sum exactly to the statewide desert + Rocky Mountain harvest every year 2020-2024 (159, 145, 143, 142, 144).",
    "goat": COMMON_BG.replace("(1) unit totals for all hunts combined (method 'all', no hunt) from each year's Big Game Annual Report, 2020-2024; ", "")
    + " UDWR publishes no unit-total table for mountain goat, only hunt rows (billy/nanny split shown where published). Statewide sportsman/conservation "
    "permits missing from the 2023-24 LE/OIAL reports were added from the Big Game Annual Report; 2020-21 GO6809/GO6810 (Ogden, Willard Peak) is one hunt printed "
    "under different codes, kept once. Hunt rows sum exactly to the statewide harvest every year 2020-2024 (117, 110, 96, 87, 92).",
    "bear": "2020-2024: hunter harvest by unit from the appendix of the 2024 Black Bear Annual Report (unit ids as printed there, e.g. '10ab', '25c/26'); "
    "2025: Table 3 of the 2025 report, which lists units by name only (UDWR stopped publishing unit codes and per-unit history tables in 2025), so 2025 unit ids are the published names. "
    "Statewide rows: 2020-2024 from Table 2 and 2025 from Table 3 of the 2025 report. UDWR does not publish hunters afield for bear, so hunters and successPct are null; "
    "licenses = permits issued (2020-2024) or permits & quota (2025); percent of permits filled is in the note. Harvest excludes depredation/other mortality. "
    "2025 unit rows sum to the published statewide total (479).",
    "lion": "2020-2024: hunter harvest by unit from the appendix of the 2024 Cougar Annual Report (unit ids as printed, e.g. '22b', '10b/11c'); "
    "2025: Table 3 of the 2025 report (units by name only; UDWR stopped publishing unit codes and per-unit tables). Statewide rows 2020-2025 from Tables 2-3 of the 2025 report. "
    "Superscript footnotes (cougars of unknown sex) were read separately from the PDF so they are not merged into the totals. "
    "Most units have been unlimited harvest-objective since 2021 (the 2024 report appendix lists 'Unlimited' for most units from 2021), so licenses is null there and UDWR does not publish hunters afield (hunters and successPct null). "
    "2025 unit rows sum to the published statewide total (381).",
    "turkey": "From UDWR Upland Game Annual Reports 2019-20 through 2025-26. Spring seasons 2020-2026 and fall management seasons 2020-2025. "
    "Rows: spring limited-entry/CWMU by hunt (TK codes, unit = region/CWMU); spring general season by county of harvest (2020-2025, with regional and statewide totals); "
    "fall management hunts by region and hunt area (2020-2024) and by hunt (2025); statewide summary rows from the 2024-25 report's statewide tables. "
    "The spring general-season statewide figure appears twice with different values because UDWR publishes two tables (county table total vs statewide summary table); both are labelled. "
    "Spring 2026 is included only at hunt level (Table 31 of the 2025-26 report); the 2026 county tables were not used. Turkey success = percent of hunters who harvested, as published.",
}


def write():
    os.makedirs(os.path.join(OUT, "harvest"), exist_ok=True)
    used = set()
    cov = []
    for sp in ["elk", "mule-deer", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"]:
        rows = ROWS.get(sp, [])
        used.update(r["sourceId"] for r in rows)
        cov.append({"species": sp, "years": sorted({r["year"] for r in rows}), "notes": COVERAGE_NOTES.get(sp, "")})
    cov.append({"species": "whitetail", "years": [], "notes": "Utah has no white-tailed deer hunting season; UDWR publishes no whitetail harvest."})
    meta = {
        "unitNames": {sp: dict(sorted(UNIT_NAMES[sp].items())) for sp in sorted(UNIT_NAMES)},
        "coverage": cov,
        "sources": [SOURCES[k] for k in SOURCES if k in used],
    }
    with open(os.path.join(OUT, "harvest-meta.json"), "w") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    for sp, rows in ROWS.items():
        rows.sort(key=lambda r: (-r["year"], r.get("hunt") is not None, r["unit"], r.get("hunt", ""), r.get("methodLabel", "")))
        with open(os.path.join(OUT, "harvest", f"{sp}.json"), "w") as fh:
            json.dump(rows, fh, ensure_ascii=False, indent=0)
            fh.write("\n")


if __name__ == "__main__":
    main()
