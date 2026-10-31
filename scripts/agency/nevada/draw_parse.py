#!/usr/bin/env python3
"""Parse NDOW big game draw documents into src/data/agency/nevada/draw/<species>.json.

Usage:
  python -I scripts/agency/nevada/draw_parse.py <raw_dir> <repo_root>

<raw_dir> is the directory filled by draw_download.py (trend/, huntdata/, cr/).

Primary source: "Nevada Bonus Point and Application Choice Trends" PDFs (one per hunt class,
weapon and sometimes residency, per main-draw year). Each hunt block lists, per bonus point level,
successful applicants by choice (1st-5th) and total applicants by choice (1st-5th). We emit one
record per hunt block with choice = "first":
  quota      = "Quota:" printed in the block
  applicants = 1st-choice applicants (Total row, 1st column of "Total Applicants by Choice")
  drawn      = 1st-choice successful applicants (Total row, 1st column of "Successful Applicants")
  oddsPct    = drawn / applicants * 100 (computed, oddsComputed = true)
  minPoints  = lowest bonus point level with a successful 1st-choice applicant
  byPoints   = per point level 1st-choice applicants / successful
Blank cells in the "Successful Applicants" grid mean no successful applicant (NDOW prints zeros
only in the applicant grid); they are read as 0. Every block is checked: the per-point rows must
sum to the printed Total row in all 10 columns, and the 1st-5th totals must sum to the printed
total-applicants figure. Any mismatch aborts.

Secondary source: NDOW "Nevada Big Game Hunt Data" workbooks (Demand, Unique Apps, Quota,
Draw Rate). Matching hunts get those figures in the note. Main-draw hunts that appear in the
workbook but have no trend PDF block become choice = "all" records with applicants = NDOW
"Demand" and oddsPct = NDOW "Draw Rate" (published, not computed).

Hunt numbers (e.g. 1331 = Resident Mule Deer Antlered Any Legal Weapon) come from the NDOW
commission quota regulations (CR 22-11, CR 23-14, CR 24-12, CR 25-13) and NR guided regulations;
huntCode = "<hunt number> <unit group as printed>". The script checks each hunt number occurs in
that year's regulation text.
"""
import json
import os
import re
import sys
from collections import defaultdict

import openpyxl
import pdfplumber

RETRIEVED = "2026-10-31"
UPLOAD = "https://www.ndow.org/wp-content/uploads/"

# ---------------------------------------------------------------- source registry
TREND_DATES = {}  # filled from the download list (basename -> upload path)


def load_trend_paths():
    sys.dont_write_bytecode = True
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location("nv_draw_download", os.path.join(here, "draw_download.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for p in mod.TREND:
        TREND_DATES[os.path.basename(p)] = p


HUNTDATA_URL = {
    2022: "2023/02/2022-Nevada-Big-Game-Hunt-Data.xlsx",
    2023: "2024/02/2023-Nevada-Big-Game-Hunt-Data.xlsx",
    2024: "2025/06/2024-Nevada-Big-Game-Hunt-Data.xlsx",
    2025: "2026/03/2025-Nevada-Big-Game-Hunt-Data.xlsx",
}
QUOTA_CR = {  # year -> (cr text basename, guided cr basename)
    2022: ("CR-22-11-2022-2023-Big-Game-Quotas-Updated.txt", "CR-21-06-2021-22-and-2022-23-NR-Guided-Seasons-and-Quotas-ADA-FINAL1.txt"),
    2023: ("2023-Big-Game-Quotas-CR-23-14-Approved-ADA-2.txt", "CR-23-07-FINAL-2023-24-NR-Guided-Seasons-and-Quotas.txt"),
    2024: ("2024-CR-24-12-BIG-GAME-QUOTAS-COMMISSION-APPROVED-FINAL.txt", "CR-24-09-2024-25-NR-Guided-Seasons-and-Quotas-FINAL.txt"),
    2025: ("CR25-13-2025-Big-Game-Quotas-NBWC-Approved-May-2025-FINAL.txt", "CR-25-10-2025-2026-Restricted-Nonresident-Guided-Mule-Deer-Seasons-Quotas-FINAL.txt"),
}
BEAR_HUNTS = {"6151", "6251"}  # black bear hunts are set in the separate black bear regulations
# CR 23-14 (2023) prints "Hunt 1331"/"Hunt 1332" over its resident/nonresident mule deer archery and
# muzzleloader tables, while CR 22-11, CR 24-12, CR 25-13 and CR 26-11 use 1341/1342 (archery) and
# 1371/1372 (muzzleloader). Records keep the class numbers and say so in the note.
NO_POINT_HUNTS = {"3171", "3172", "4102", "4107"}  # management rams, elk depredation
CR2023_MD = {"1341": "1331", "1342": "1332", "1371": "1331", "1372": "1332"}
CR2023_NOTE = ("Hunt number: NDOW's 2023 quota regulation (CR 23-14) prints this table under hunt {printed}; "
               "the 2022 and 2024-2026 regulations number this weapon class {no}.")


def check_hunt_no(no, year, cr_text):
    """Return an extra note (or '') after confirming the hunt number is printed in that year's regulation."""
    if no in BEAR_HUNTS:
        return ""
    if year == 2023 and no in CR2023_MD:
        if not re.search(rf"\b{CR2023_MD[no]}\b", cr_text[year]):
            raise ValueError(f"2023: {CR2023_MD[no]} missing")
        return CR2023_NOTE.format(printed=CR2023_MD[no], no=no)
    if not re.search(rf"\b{no}\b", cr_text[year]):
        raise ValueError(f"hunt {no} not found in {year} quota regulation")
    return ""


def trend_source_id(basename):
    stem = basename[:-4]
    stem = re.sub(r"-Bonus-Point-and-Application-Trend", "", stem)
    stem = re.sub(r"-(ADA|update|1)$", "", stem)
    stem = re.sub(r"-(ADA|update|1)$", "", stem)
    return "d-bp-" + stem.lower()


def trend_title(basename, year):
    stem = basename[:-4]
    cls = stem.split("-Bonus-Point")[0].replace("-", " ")
    res = ""
    if "NonResident" in stem and "Guided" not in stem:
        res = " (Nonresident)"
    elif "-Resident-" in stem:
        res = " (Resident)"
    return f"Nevada Bonus Point and Application Choice Trends, {year} Big Game Main Draw: {cls}{res}"


# ---------------------------------------------------------------- hunt classification
def file_weapon(basename):
    b = basename.lower()
    if "-archery-" in b:
        return "AR"
    if "-muzzle" in b:
        return "M"
    return "ALW"


def classify(header, weapon_text, basename, year):
    """Return (species, residency, huntNo, sex, method) for a trend block."""
    res = "resident" if header.startswith("Res ") else "nonresident" if header.startswith("NR ") else None
    if res is None:
        raise ValueError(f"no residency in header {header!r}")
    r = header.split(" ", 1)[1]
    nr = res == "nonresident"
    fw = file_weapon(basename)
    wt = weapon_text.lower()
    method = "all" if wt == "any legal weapon" else "archery" if wt == "archery" else "muzzleloader" if wt == "muzzleloader" else "other"

    def pick(alw, ar=None, m=None):
        return {"ALW": alw, "AR": ar, "M": m}[fw]

    if r.startswith("Antelope Horns Longer"):
        no = pick(("2151", "2251"), ("2161", "2261"), ("2171", "2271"))[nr]
        return "pronghorn", res, no, "male", method
    if r.startswith("Antelope Horns Shorter"):
        return "pronghorn", res, "2181", "either", method
    if r.startswith("Junior Antelope"):
        return "pronghorn", res, "2191", "either", method
    if r.startswith("Black Bear"):
        return "bear", res, ("6151", "6251")[nr], "either", method
    if r.startswith("California Bighorn"):
        return "sheep", res, ("8151", "8251")[nr], "male", method
    if r.startswith("Rocky Mountain Bighorn"):
        if nr:
            raise ValueError("unexpected NR Rocky Mountain bighorn")
        return "sheep", res, "9151", "male", method
    if r.startswith("Nelson Desert Bighorn Management Ram - One Horn"):
        return "sheep", res, "3171", "male", method
    if r.startswith("Nelson Desert Bighorn Management Ram - Limit Access"):
        return "sheep", res, "3172", "male", method
    if r.startswith("Nelson (Desert) Bighorn Sheep Any Ewe"):
        return "sheep", res, ("3181", "3281")[nr], "female", method
    if r.startswith("Nelson (Desert) Bighorn Sheep Any Ram"):
        no = pick(("3151", "3251"), ("3161", "3261"))[nr]
        return "sheep", res, no, "male", method
    if r.startswith("Elk Depredation Antlered"):
        return "elk", res, "4102", "male", method
    if r.startswith("Elk Depredation Antlerless"):
        return "elk", res, "4107", "female", method
    if r.startswith("Elk Antlered"):
        no = pick(("4151", "4251"), ("4161", "4261"), ("4156", "4256"))[nr]
        return "elk", res, no, "male", method
    if r.startswith("Elk Antlerless"):
        no = pick(("4181", "4281"), ("4111", "4211"), ("4176", "4276"))[nr]
        return "elk", res, no, "female", method
    if r.startswith("Elk Spike"):
        return "elk", res, "4651", "male", method
    if r.startswith("Moose Antlered"):
        return "moose", res, "10151", "male", method
    if r.startswith("Mountain Goat"):
        return "goat", res, ("7151", "7251")[nr], "either", method
    if r.startswith("Restricted") and "Mule Deer" in r:
        return "mule-deer", res, "1235", "male", method
    if r.startswith("Mule Deer Junior"):
        sex = "either" if "Antlerless" in r else "male"
        if year >= 2024 and wt == "any legal weapon":
            no = "1106"
        elif year >= 2024 and wt in ("primitive", "archery, muzzleloader"):
            no = "1105"
        else:
            no = "1107"
        return "mule-deer", res, no, sex, method
    if r.startswith("Mule Deer Antlerless"):
        return "mule-deer", res, "1181", "female", method
    if r.startswith("Mule Deer Antlered"):
        no = pick(("1331", "1332"), ("1341", "1342"), ("1371", "1372"))[nr]
        return "mule-deer", res, no, "male", method
    raise ValueError(f"unclassified header {header!r} in {basename}")


# ---------------------------------------------------------------- trend PDF parsing
NUM = re.compile(r"^\d[\d,]*$")


def lines_of(page):
    words = sorted(page.extract_words(), key=lambda w: (round(w["top"]), w["x0"]))
    lines, cur, top = [], [], None
    for w in words:
        if top is None or w["top"] - top > 3.5:
            if cur:
                lines.append(sorted(cur, key=lambda w: w["x0"]))
            cur, top = [w], w["top"]
        else:
            cur.append(w)
    if cur:
        lines.append(sorted(cur, key=lambda w: w["x0"]))
    return lines


def ctr(w):
    return (w["x0"] + w["x1"]) / 2


def parse_trend(path):
    base = os.path.basename(path)
    pdf = pdfplumber.open(path)
    year = None
    blocks, blk, cols = [], None, None
    pending_field = None
    for pno, page in enumerate(pdf.pages, 1):
        for ln in lines_of(page):
            texts = [w["text"] for w in ln]
            s = " ".join(texts)
            m = re.match(r"^(20\d\d) Big Game Main Draw$", s)
            if m:
                y = int(m.group(1))
                if year and y != year:
                    raise ValueError(f"{base}: year changes {year}->{y}")
                year = y
                continue
            if s.startswith("Nevada Bonus Point and Application") or re.search(r"Page \d+ of \d+$", s):
                continue
            x0 = ln[0]["x0"]
            if texts[0] in ("Res", "NR") and x0 < 70:
                blk = {"header": s, "units": [], "season": "", "weapon": "", "quota": None,
                       "rows": [], "total": None, "page": pno, "file": base}
                blocks.append(blk)
                pending_field = None
                continue
            if blk is None:
                continue
            if texts[0] == "Units:":
                blk["units"].append(" ".join(texts[1:]))
                pending_field = "units"
                continue
            if texts[0] == "Season:":
                blk["season"] = " ".join(texts[1:])
                pending_field = None
                continue
            if texts[0] == "Weapon":
                blk["weapon"] = " ".join(texts[1:])
                pending_field = None
                continue
            if texts[0] == "Quota:":
                blk["quota"] = int(texts[1].replace(",", ""))
                pending_field = None
                continue
            if texts.count("1st") == 2:
                firsts = [w for w in ln if w["text"] in ("1st", "2nd", "3rd", "4th", "5th")]
                if len(firsts) != 10:
                    raise ValueError(f"{base} p{pno}: header has {len(firsts)} choice columns")
                cols = [ctr(w) for w in firsts]
                bp = [w for w in ln if w["text"] in ("Bonus", "Points")]
                cols_bp = (bp[0]["x0"] + bp[-1]["x1"]) / 2
                blk["_cols"] = (cols_bp, cols)
                continue
            if pending_field == "units" and not any(t in ("Successful", "Total", "Bonus") for t in texts) and not NUM.match(texts[0]):
                blk["units"].append(s)
                continue
            if texts[0] in ("Successful", "Total", "Applicants", "Unique") and len(texts) <= 9 and not any(NUM.match(t) for t in texts):
                pending_field = None
                continue
            is_total = texts[0] == "Total" and len(texts) > 1 and NUM.match(texts[1] or "")
            if NUM.match(texts[0]) or is_total:
                pending_field = None
                if cols is None:
                    raise ValueError(f"{base} p{pno}: data row before column header: {s}")
                succ, tot, uniq = [0] * 5, [None] * 5, None
                nums = ln[1:]
                for w in nums:
                    if re.fullmatch(r"#+", w["text"]) and ctr(w) > cols[9] + 25:
                        # Excel overflow printed instead of the total-applicants figure; not usable
                        uniq = None
                        continue
                    if not NUM.match(w["text"]):
                        raise ValueError(f"{base} p{pno}: non-numeric cell {w['text']!r} in {s}")
                    v = int(w["text"].replace(",", ""))
                    c = ctr(w)
                    d = [abs(c - x) for x in cols]
                    j = min(range(10), key=lambda k: d[k])
                    if c > cols[9] + 25:
                        uniq = v
                        continue
                    if d[j] > 11:
                        raise ValueError(f"{base} p{pno}: cell {v} at x={c:.0f} not near a column ({s})")
                    if j < 5:
                        if succ[j]:
                            raise ValueError(f"{base} p{pno}: two values in one column ({s})")
                        succ[j] = v
                    else:
                        if tot[j - 5] is not None:
                            raise ValueError(f"{base} p{pno}: two values in one column ({s})")
                        tot[j - 5] = v
                if any(t is None for t in tot):
                    raise ValueError(f"{base} p{pno}: missing applicant cell ({s}) -> {tot}")
                if is_total:
                    blk["total"] = {"succ": succ, "tot": tot, "uniq": uniq}
                else:
                    blk["rows"].append({"points": int(texts[0]), "succ": succ, "tot": tot})
                continue
            raise ValueError(f"{base} p{pno}: unrecognised line: {s}")
    for b in blocks:
        b["year"] = year
        b["units"] = " ".join(b["units"]).strip()
        if b["quota"] is None or b["total"] is None:
            raise ValueError(f"{base}: incomplete block {b['header']} {b['units']}")
        for k in ("succ", "tot"):
            for j in range(5):
                ssum = sum(r[k][j] for r in b["rows"])
                if ssum != b["total"][k][j]:
                    raise ValueError(f"{base}: {b['header']} {b['units']}: column {k}{j+1} rows sum {ssum} != Total {b['total'][k][j]}")
        if b["total"]["uniq"] is not None and sum(b["total"]["tot"]) != b["total"]["uniq"]:
            raise ValueError(f"{base}: {b['header']} {b['units']}: choice totals {sum(b['total']['tot'])} != printed total {b['total']['uniq']}")
    return year, blocks


# ---------------------------------------------------------------- helpers
def norm_units(u):
    u = u.replace("–", "-").replace("—", "-")
    u = re.sub(r"\s*-\s*", "-", u)
    u = re.sub(r"\s*,\s*", ",", u)
    return re.sub(r"\s+", " ", u).strip().lower()


DIRS = ("northwest", "northeast", "southwest", "southeast", "north", "south", "east", "west")


def unit_sig(u, with_dirs):
    """Numeric unit tokens (and optionally direction words) of a unit-group label."""
    u = re.sub(r"\((see|See) [^)]*\)", "", u)
    u = re.sub(r"CR \d\d-\d\d\w*", "", u)
    nums = tuple(sorted(set(re.findall(r"\d{3}", u))))
    if not with_dirs:
        return nums
    low = u.lower()
    d = []
    for w in DIRS:
        if re.search(rf"\b{w}\b", low):
            d.append(w)
            low = re.sub(rf"\b{w}\b", "", low)
    for m in re.findall(r"\d{3}([nsew])\b", u.lower()):
        d.append({"n": "north", "s": "south", "e": "east", "w": "west"}[m])
    return nums + tuple(sorted(set(d)))


def strip_notes(u):
    u = re.sub(r"\((see|See) [^)]*\)", "", u)
    u = re.sub(r"(?i)unit restrictions|additional requirement applies", "", u)
    return norm_units(u)


def clean_units(u):
    """Unit group label without regulation cross-references, e.g.
    '280 Unit Restrictions (See CR 25-07) Additional requirement applies' -> '280'."""
    u = re.sub(r"\(\s*(see|See)\s[^)]*\)", "", u)
    u = re.sub(r"(?i)\bunit restrictions\b|\badditional requirement applies\b", "", u)
    return re.sub(r"\s+", " ", u).strip(" ,-")


def unit_list(u):
    return [p.strip() for p in clean_units(u).split(",") if p.strip()]


MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def season_key(s):
    """'Aug 01, 2025 - Aug 15, 2025' / 'Oct 05 - Nov 05' / 'Aug 22 - Sep 07' -> 'Aug 01-Aug 15'."""
    if not s:
        return ""
    s = s.replace("Sept", "Sep")
    parts = re.findall(r"([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2})", s)
    return "-".join(f"{m} {int(d):02d}" for m, d in parts)


def pct(n, d):
    return round(100.0 * n / d, 2) if d else None


# ---------------------------------------------------------------- hunt data workbook
HD_CLASS = {
    "Antelope Horns Longer Than Ears": ("pronghorn", {"ALW": ("2151", "2251"), "AR": ("2161", "2261"), "M": ("2171", "2271")}),
    "Antelope Horns Shorter Than Ears": ("pronghorn", {"ALW": ("2181", None)}),
    "Junior Antelope Horns Shorter Than Ears": ("pronghorn", {"ALW": ("2191", None)}),
    "Black Bear Either Sex": ("bear", {"ALW": ("6151", "6251")}),
    "California Bighorn Sheep Any Ram": ("sheep", {"ALW": ("8151", "8251")}),
    "Desert Bighorn Sheep 1-Horn Ram": ("sheep", {"ALW": ("3171", None)}),
    "Desert Bighorn Sheep 1-Horned Ram": ("sheep", {"ALW": ("3171", None)}),
    "Desert Bighorn Sheep Mgmt Ram": ("sheep", {"ALW": ("3172", None)}),
    "Desert Bighorn Sheep Any Ewe": ("sheep", {"ALW": ("3181", "3281")}),
    "Desert Bighorn Sheep Any Ram": ("sheep", {"ALW": ("3151", "3251"), "AR": ("3161", "3261")}),
    "Elk Antlered": ("elk", {"ALW": ("4151", "4251"), "AR": ("4161", "4261"), "M": ("4156", "4256")}),
    "Elk Antlerless": ("elk", {"ALW": ("4181", "4281"), "AR": ("4111", "4211"), "M": ("4176", "4276")}),
    "Elk Depredation Antlered": ("elk", {"ALW": ("4102", None)}),
    "Elk Depredation Antlerless": ("elk", {"ALW": ("4107", None)}),
    "Elk Spike": ("elk", {"ALW": ("4651", None)}),
    "Moose Antlered": ("moose", {"ALW": ("10151", None)}),
    "Rocky Mountain Bighorn Sheep Any Ram": ("sheep", {"ALW": ("9151", None)}),
    "Mountain Goat Either Sex": ("goat", {"ALW": ("7151", "7251")}),
    "Mule Deer Antlered": ("mule-deer", {"ALW": ("1331", "1332"), "WR": ("1331", "1332"), "AR": ("1341", "1342"), "M": ("1371", "1372")}),
    "Mule Deer Antlerless": ("mule-deer", {"ALW": ("1181", None)}),
    "Mule Deer Guided Antlered": ("mule-deer", {"ALW": (None, "1235"), "WR": (None, "1235")}),
    "Mule Deer Junior": ("mule-deer", {"ALW": ("1106", None), "SWR": ("1107", None), "SWR-Prmtve": ("1105", None)}),
    "Mule Deer Junior Antlered or Antlerless": ("mule-deer", {"SWR": ("1107", None)}),
}
HD_WEAPON = {"ALW": "Any Legal Weapon", "AR": "Archery", "M": "Muzzleloader", "SWR": "Seasonal Weapon Restriction",
             "SWR-Prmtve": "Seasonal Weapon Restriction for Primitive Hunts", "WR": "Weapon Restriction"}
HD_SEX = {"Antelope Horns Longer Than Ears": "male", "Antelope Horns Shorter Than Ears": "either",
          "Junior Antelope Horns Shorter Than Ears": "either", "Black Bear Either Sex": "either",
          "Desert Bighorn Sheep Any Ewe": "female", "Elk Antlerless": "female", "Elk Depredation Antlerless": "female",
          "Mountain Goat Either Sex": "either", "Mule Deer Antlerless": "female",
          "Mule Deer Junior Antlered or Antlerless": "either"}


def load_huntdata(path, year):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h or "").replace("\n", " ").strip() for h in rows[0]]
    ix = {h: i for i, h in enumerate(hdr)}
    dem = ix.get("Demand", ix.get("Apps"))
    q = ix[f"{year} Quota"]
    out = []
    for r in rows[1:]:
        if not r[0]:
            continue
        if int(r[0]) != year:
            raise ValueError(f"hunt data {year}: row year {r[0]}")
        out.append({
            "hunt": r[ix["Hunt"]], "res": {"Res": "resident", "R": "resident", "NR": "nonresident"}.get(r[ix["Residency"]]),
            "weapon": r[ix["Weapon"]], "units": str(r[ix["Unit Group"]]).strip(), "season": r[ix["Season"]],
            "demand": r[dem], "unique": r[ix["Unique Apps"]] if "Unique Apps" in ix else None,
            "quota": r[q], "rate": r[ix["Draw Rate"]],
        })
    return out


# ---------------------------------------------------------------- main
def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    raw, repo = sys.argv[1], sys.argv[2]
    load_trend_paths()
    cr_text = {}
    for y, (q, g) in QUOTA_CR.items():
        cr_text[y] = open(os.path.join(raw, "cr", q)).read() + "\n" + open(os.path.join(raw, "cr", g)).read()

    records = defaultdict(list)
    sources = {}
    used_hd = set()
    hd = {y: load_huntdata(os.path.join(raw, "huntdata", f"{y}.xlsx"), y) for y in HUNTDATA_URL}
    hd_by_hunt = defaultdict(list)
    for y, rows in hd.items():
        for i, r in enumerate(rows):
            if r["weapon"] == "`" and r["hunt"] == "Antelope Horns Longer Than Ears" and y == 2023 and r["units"] == "031":
                # stray backtick in the 2023 workbook's Weapon cell; season/quota are the ALW hunt's
                r["weapon"] = "ALW"
            cls = HD_CLASS.get(r["hunt"])
            if not cls or r["weapon"] not in cls[1] or r["res"] is None:
                continue
            no = cls[1][r["weapon"]][0 if r["res"] == "resident" else 1]
            if no is None:
                raise ValueError(f"hunt data {y}: no hunt number for {r}")
            r["_no"], r["_species"] = no, cls[0]
            hd_by_hunt[(y, no)].append((i, r))

    trend_dir = os.path.join(raw, "trend")
    stats = defaultdict(int)
    parsed = []  # (base, sid, block, classification)
    for base in sorted(TREND_DATES):
        path = os.path.join(trend_dir, base)
        year, blocks = parse_trend(path)
        sid = trend_source_id(base)
        if sid in sources:
            raise ValueError(f"duplicate source id {sid}")
        sources[sid] = {"id": sid, "title": trend_title(base, year), "publisher": "Nevada Department of Wildlife",
                        "url": UPLOAD + TREND_DATES[base], "dataYear": year, "retrieved": RETRIEVED,
                        "notes": "Applicants and successful applicants by bonus point level and application choice (1st-5th) per hunt; main draw."}
        for b in blocks:
            parsed.append((base, sid, b, classify(b["header"], b["weapon"], base, year)))

    # match bonus point report blocks to hunt data rows, strictest rule first
    match = {}
    stages = [
        lambda b, h: norm_units(b["units"]) == norm_units(h["units"]),
        lambda b, h: strip_notes(b["units"]) == strip_notes(h["units"]),
        lambda b, h: unit_sig(b["units"], True) == unit_sig(h["units"], True),
        lambda b, h: unit_sig(b["units"], False) == unit_sig(h["units"], False),
    ]
    for stage in stages:
        for k, (base, sid, b, (sp, res, no, sex, method)) in enumerate(parsed):
            if k in match:
                continue
            cands = [(i, h) for i, h in hd_by_hunt.get((b["year"], no), []) if (b["year"], i) not in used_hd and stage(b, h)]
            if len(cands) > 1:
                sk = season_key(b["season"])
                cands = [c for c in cands if season_key(c[1]["season"]) == sk]
            if len(cands) == 1:
                match[k] = cands[0]
                used_hd.add((b["year"], cands[0][0]))

    for k, (base, sid, b, (sp, res, no, sex, method)) in enumerate(parsed):
            year = b["year"]
            hn_note = check_hunt_no(no, year, cr_text)
            tot1 = b["total"]["tot"][0]
            succ1 = b["total"]["succ"][0]
            all_succ = sum(b["total"]["succ"])
            all_apps = sum(b["total"]["tot"])
            pts_drawn = [r["points"] for r in b["rows"] if r["succ"][0] > 0]
            st = {"quota": b["quota"], "applicants": tot1, "drawn": succ1,
                  "oddsPct": pct(succ1, tot1), "oddsComputed": True,
                  "minPoints": min(pts_drawn) if pts_drawn else None}
            by = []
            for r in b["rows"]:
                if r["tot"][0] == 0 and r["succ"][0] == 0:
                    continue
                by.append({"points": r["points"], res: {"applicants": r["tot"][0], "drawn": r["succ"][0]}})
            notes = [f"All choices (1st-5th): {all_apps} applications listed this hunt; {all_succ} tags awarded in the main draw across all choices."]
            if hn_note:
                notes.append(hn_note)
            if no in NO_POINT_HUNTS:
                st["minPoints"] = None
                by = None
                notes.append("Depredation and management hunts do not award bonus points (NAC 502.4187(7)); "
                             "NDOW's by-point rows for this hunt are therefore not carried as point odds.")
            if all_succ > b["quota"]:
                notes.append("Tags awarded exceed the printed quota (as published).")
            if k in match:
                i, h = match[k]
                rate = h["rate"]
                notes.append(
                    f"NDOW {year} Hunt Data: Demand {h['demand']}, Quota {h['quota']}, Draw Rate "
                    f"{round(rate * 100, 2) if isinstance(rate, (int, float)) else rate}% (NDOW: quota / demand; does not account for bonus points or choice)."
                )
                if h["quota"] != b["quota"]:
                    notes.append(f"Hunt Data quota {h['quota']} differs from bonus point report quota {b['quota']}.")
                stats["hd_matched"] += 1
            else:
                stats["hd_unmatched"] += 1
                print(f"  no hunt data match: {year} {no} {b['units']} | {b['season']}")
            code = f"{no} {clean_units(b['units'])}"
            rec = {
                "species": sp, "year": year, "huntCode": code, "units": unit_list(b["units"]),
                "description": f"{b['header']} - Hunt {no}, Units {b['units']}, {b['weapon']}",
                "method": method, "methodLabel": b["weapon"], "sex": sex, "seasonDates": b["season"],
                "choice": "first", res: st, **({"byPoints": by} if by is not None else {}),
                "note": " ".join(notes), "sourceId": sid,
                "_season": season_key(b["season"]),
            }
            records[sp].append(rec)
            stats["trend_blocks"] += 1

    # fallback: main-draw hunts in hunt data without a bonus point report block
    for y, rows in hd.items():
        sid = f"d-huntdata-{y}"
        sources[sid] = {"id": sid, "title": f"{y} Nevada Big Game Hunt Data", "publisher": "Nevada Department of Wildlife",
                        "url": UPLOAD + HUNTDATA_URL[y], "dataYear": y, "retrieved": RETRIEVED,
                        "notes": "Per-hunt Demand, Unique Apps, Quota, Tags Issued, Draw Rate (Quota/Demand) and harvest survey results."}
        for i, r in enumerate(rows):
            if "_no" not in r or (y, i) in used_hd:
                continue
            no = r["_no"]
            hn_note = check_hunt_no(no, y, cr_text)
            rate = r["rate"]
            st = {"quota": r["quota"], "applicants": r["demand"], "drawn": None,
                  "oddsPct": round(rate * 100, 2) if isinstance(rate, (int, float)) else None, "oddsComputed": False}
            wl = HD_WEAPON.get(r["weapon"], r["weapon"])
            code = f"{no} {clean_units(r['units'])}"
            rec = {
                "species": r["_species"], "year": y, "huntCode": code, "units": unit_list(r["units"]),
                "description": f"{'Res' if r['res'] == 'resident' else 'NR'} {r['hunt']} - Hunt {no}, Units {r['units']}, {wl}",
                "method": {"ALW": "all", "AR": "archery", "M": "muzzleloader"}.get(r["weapon"], "other"),
                "methodLabel": wl, "sex": HD_SEX.get(r["hunt"], "male"), "seasonDates": r["season"],
                "choice": "all", r["res"]: st,
                "note": (f"No NDOW bonus point report block was found for this hunt and year; figures are from NDOW Hunt Data. "
                         f"applicants = NDOW 'Demand' (tags awarded regardless of choice plus unsuccessful 1st-choice applicants); "
                         f"oddsPct = NDOW 'Draw Rate' (quota / demand, does not account for bonus points or choice). "
                         f"Unique Apps (choices 1-5): {r['unique'] if r['unique'] is not None else 'not published'}."
                         + (" " + hn_note if hn_note else "")),
                "sourceId": sid, "_season": season_key(r["season"]),
            }
            records[r["_species"]].append(rec)
            stats["hd_fallback"] += 1

    # disambiguate hunt codes that repeat within a year (same hunt number + unit group, different season)
    for sp, rows in records.items():
        groups = defaultdict(list)
        for r in rows:
            groups[(r["year"], r["huntCode"], r["choice"])].append(r)
        for k, g in groups.items():
            if len(g) > 1:
                for r in g:
                    sk = r["_season"].replace("-", " - ") or r["seasonDates"]
                    r["huntCode"] = f"{r['huntCode']} ({sk})"
        seen = set()
        for r in rows:
            k = (r["year"], r["huntCode"], r["choice"])
            if k in seen:
                raise ValueError(f"duplicate key {k}")
            seen.add(k)
        rows.sort(key=lambda r: (-r["year"], r["huntCode"], r["choice"]))
        for r in rows:
            r.pop("_season", None)

    out_dir = os.path.join(repo, "src/data/agency/nevada/draw")
    os.makedirs(out_dir, exist_ok=True)
    for sp, rows in sorted(records.items()):
        with open(os.path.join(out_dir, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1)
        yrs = sorted({r["year"] for r in rows})
        print(f"{sp}: {len(rows)} rows, years {yrs}, first={sum(r['choice']=='first' for r in rows)} all={sum(r['choice']=='all' for r in rows)}")
    with open(os.path.join(raw, "draw_sources.json"), "w") as f:
        json.dump(sorted(sources.values(), key=lambda s: s["id"]), f, indent=1)
    print(dict(stats))


if __name__ == "__main__":
    main()
