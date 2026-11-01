#!/usr/bin/env python3
"""Parse ADF&G harvest statistics (Alaska) into HuntScout harvest JSON.

Inputs are the raw files written by harvest_fetch.py (see its docstring for sources).
Writes:
  src/data/agency/alaska/harvest/{moose,sheep,goat,elk,mule-deer,bear}.json
  src/data/agency/alaska/harvest-meta.json

Usage:
  python -I scripts/agency/alaska/harvest_parse.py <raw_dir> <repo_root> [--units-only]
  (--units-only skips the per-hunt rows, e.g. while the per-hunt downloads are incomplete)

Row types
  * Unit rows (moose, sheep, goat, elk): ADF&G Harvest General Report 330 "Hunter AK Residency
    and Success by Unit" for all hunts combined. hunters = "Total Hunters", harvest = successful
    total; resident / nonresident rows = that residency's successful + unsuccessful hunters.
    successPct = harvest / hunters (ADF&G prints shares of all hunters, not a success rate) and
    successComputed = true. harvestMale / harvestFemale from report 130. The report's "Total" row
    is stored as unit "Statewide". (Report 510, effort, is not used: its hunter counts differ.)
  * Hunt rows (same species): report 330 filtered to one hunt number; one row per unit the hunt
    reported hunters in (residency all only).
  * Deer (mule-deer key = Sitka black-tailed deer): "Deer Hunting Statistics" by GMU.
  * Black bear: "Black Bear Hunt Statistics (Reported Harvest)" per hunt number. GMU per hunt
    comes from the 2026-2027 Alaska Hunting Regulations unit pages (HUNT_UNITS below).
Nothing is estimated; blank-unit rows are not stored (counted in coverage notes).
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict

import bs4

RETRIEVED = "2026-10-31"
PUB = "Alaska Department of Fish and Game, Division of Wildlife Conservation"
GR_URL = "https://secure.wildlife.alaska.gov/DWC/HarvestInformation/GeneralReports/"
GR_PAGE = "https://secure.wildlife.alaska.gov/DWC/HarvestInformation/"
DEER_URL = "https://www.adfg.alaska.gov/index.cfm?adfg=deerhunting.deerharvest"
BEAR_URL = "https://www.adfg.alaska.gov/index.cfm?adfg=blackbearhunting.harvest"
REGS_URL = "https://www.adfg.alaska.gov/static/regulations/wildliferegulations/pdfs/gmu{n}.pdf"
OVERVIEW_URL = "https://www.adfg.alaska.gov/static/regulations/wildliferegulations/pdfs/gmu_overview.pdf"
YEARS = list(range(2020, 2026))
GR_SPECIES = {"M": ("moose", "Moose"), "S": ("sheep", "Sheep"), "G": ("goat", "Goat"), "E": ("elk", "Elk")}
ALL_LABEL = "All hunts combined"

# Hunt-number prefix legend printed in the Alaska Hunting Regulations ("D" = Drawing,
# "HT" = Harvest ticket, "R" = Registration, "T" = Tier II, "C" = Community). ADF&G's report form
# labels GM000 "General Season". Other prefixes are left as "Permit hunt (prefix X)".
HUNT_TYPE = {
    "D": "Drawing permit hunt",
    "R": "Registration permit hunt",
    "T": "Tier II subsistence permit hunt",
    "C": "Community subsistence harvest hunt",
    "G": "General season (harvest ticket)",
}

# Black bear hunt -> unit, read from the 2026-2027 Alaska Hunting Regulations unit pages
# (raw: regs/gmu<n>.txt). method only where the regulation restricts the weapon.
HUNT_UNITS = {
    "DL018": ("1C", None, None, "Unit 1C Taku area; nonresidents not using a registered guide or second-degree kindred", 1),
    "DL027": ("2", None, None, "Unit 2; nonresidents not using a registered guide or second-degree kindred; Sept 1-Dec 31", 2),
    "DL028": ("2", None, None, "Unit 2; nonresidents not using a registered guide or second-degree kindred; Jan 1-June 30", 2),
    "DL029": ("3", None, None, "Unit 3 Kuiu and Kupreanof islands; nonresidents not using a registered guide or second-degree kindred", 3),
    "DL030": ("3", None, None, "Unit 3 Kuiu and Kupreanof islands; nonresidents not using a registered guide or second-degree kindred", 3),
    "RL065": ("6D", None, None, "Unit 6D", 6),
    "RL450": ("14C", "other", "Bow and arrow, crossbow, or muzzleloader only", "Unit 14C Lower Eagle River Valley", 14),
    "RL460": ("14C", None, None, "Unit 14C Upper Eagle River Valley", 14),
    "DL455": ("14C", "shotgun", "Shotgun only", "Unit 14C, a portion of Joint Base Elmendorf-Richardson", 14),
    "DL457": ("14C", "other", "Bow and arrow, shotgun or muzzleloader only", "Unit 14C McHugh Creek", 14),
}
BEAR_TYPES = {"g": "General Season", "d": "Draw", "r": "Registration", "t": "Tier II"}
BEAR_LABEL = {"g": "General season (harvest ticket)", "d": "Drawing permit hunt", "r": "Registration permit hunt", "t": "Tier II subsistence permit hunt"}

# Regions from "Game Management Units" (2026-2027 Alaska Hunting Regulations overview map).
REGION = {}
for _u in range(1, 6):
    REGION[str(_u)] = "Region 1 - Southeast"
for _u in ["6", "7", "8", "14C", "15"]:
    REGION[_u] = "Region 2 - Southcentral"
for _u in ["12", "19", "20", "21", "24", "25", "26B", "26C"]:
    REGION[_u] = "Region 3 - Interior and Northeast"
for _u in ["9", "10", "11", "13", "14A", "14B", "16", "17"]:
    REGION[_u] = "Region 4 - Central/Southwestern"
for _u in ["18", "22", "23", "26A"]:
    REGION[_u] = "Region 5 - Northwestern and Western"
# Units that have lettered subunits in the regulations (others have none).
SUBUNITS = {"1", "5", "6", "9", "13", "14", "15", "16", "17", "19", "20", "21", "22", "24", "25", "26"}


def region_of(num: str, letter: str) -> str | None:
    return REGION.get(num + letter) or REGION.get(num)


def unit_name(code: str) -> str | None:
    """'01A' -> 'Unit 1A (Region 1 - Southeast)'; '02Z' -> 'Unit 2 (...)'; '13Z' -> 'Unit 13, ADF&G code 13Z'."""
    m = re.fullmatch(r"(\d{1,2})([A-Z]?)", code)
    if not m:
        return None
    num, letter = str(int(m.group(1))), m.group(2)
    if int(num) > 26:
        return None
    if letter == "Z":
        if num in SUBUNITS:
            r = REGION.get(num)
            return f"Unit {num}, ADF&G code {code} (no subunit letter)" + (f" ({r})" if r else "")
        letter = ""
    r = region_of(num, letter)
    return f"Unit {num}{letter}" + (f" ({r})" if r else "")


def num(s: str) -> int:
    s = s.strip().replace(",", "")
    if not re.fullmatch(r"\d+", s):
        raise ValueError(f"not an integer: {s!r}")
    return int(s)


def pct(h: int, n: int):
    return round(100 * h / n, 1) if n else None


def soup(path: str):
    return bs4.BeautifulSoup(open(path, encoding="utf-8", errors="replace").read(), "lxml")


def results(path: str, year: int, must: str):
    b = soup(path)
    rc = b.find(id="resultsContainer")
    head = " ".join(h.get_text(" ", strip=True) for h in rc.find_all(["h3", "h4"]))
    if str(year) not in head or must.lower() not in head.lower():
        raise RuntimeError(f"{path}: heading {head!r} does not match {year} {must}")
    return rc, head


def cells(tr):
    return [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]


def parse_330(path: str, year: int, spname: str):
    rc, head = results(path, year, spname)
    t = rc.find("table")
    if t is None:
        return head, [], None
    rows, total = [], None
    for tr in t.find_all("tr")[2:]:
        c = cells(tr)
        if len(c) != 16:
            raise RuntimeError(f"{path}: row width {len(c)} {c}")
        unit = c[0]
        v = [num(c[i]) for i in (1, 3, 5, 7, 8, 10, 12, 14, 15)]
        d = dict(zip(["rs", "ns", "us", "ts", "ru", "nu", "uu", "tu", "hunters"], v))
        if d["rs"] + d["ns"] + d["us"] != d["ts"] or d["ru"] + d["nu"] + d["uu"] != d["tu"] or d["ts"] + d["tu"] != d["hunters"]:
            raise RuntimeError(f"{path}: row does not add up {c}")
        d["unit"] = unit
        d["cells"] = c
        if unit == "Total":
            total = d
        else:
            rows.append(d)
    if total is None:
        raise RuntimeError(f"{path}: no Total row")
    for k in ("ts", "tu", "hunters", "rs", "ns"):
        if sum(r[k] for r in rows) != total[k]:
            raise RuntimeError(f"{path}: column {k} sum {sum(r[k] for r in rows)} != Total {total[k]}")
    return head, rows, total


def parse_130(path: str, year: int, spname: str):
    """-> {unit: [males, females, unspecified, total, [mountain ranges]]}, overall"""
    rc, _ = results(path, year, spname)
    t = rc.find("table")
    hdr = cells(t.find("tr"))
    has_mtn = hdr[1] == "Mtn"
    out, overall = {}, None
    for tr in t.find_all("tr")[1:]:
        c = cells(tr)
        if c[0] == "Overall Total":
            vals = c[1:]
            overall = [num(vals[0]), num(vals[2]), num(vals[4]), num(vals[6])]
            continue
        unit = c[0]
        mtn = c[1] if has_mtn else None
        vals = c[2:] if has_mtn else c[1:]
        m, f, u, tot = num(vals[0]), num(vals[2]), num(vals[4]), num(vals[6])
        if m + f + u != tot:
            raise RuntimeError(f"{path}: sex row does not add up {c}")
        e = out.setdefault(unit, [0, 0, 0, 0, []])
        e[0] += m
        e[1] += f
        e[2] += u
        e[3] += tot
        if mtn:
            e[4].append(mtn)
    return out, overall


def hunt_label(h: str) -> str:
    return HUNT_TYPE.get(h[0], f"Permit hunt (prefix {h[0]})")


def gr_species(raw: str, code: str, key: str, spname: str, sources: list, cov_notes: dict, unit_codes: set):
    out = []
    years = []
    stats = defaultdict(int)
    for y in YEARS:
        sid = f"h-adfg-{key}-{y}"
        p330 = os.path.join(raw, f"gr_{code}_{y}_330.html")
        head, rows, total = parse_330(p330, y, spname)
        sex, sex_overall = parse_130(os.path.join(raw, f"gr_{code}_{y}_130.html"), y, spname)
        if not rows:
            continue
        years.append(y)
        sources.append({
            "id": sid,
            "title": f"{head} (reports 330 Hunter AK Residency and Success by Unit and 130 Sex Composition of Harvest by Subunit; RY{y}; all hunts and per hunt number)",
            "publisher": PUB, "url": GR_URL, "pageUrl": GR_PAGE, "dataYear": y, "retrieved": RETRIEVED,
            "notes": "ADF&G labels these reports 'Interim' (harvest data subject to revision). Regulatory year RY%d = July 1, %d - June 30, %d. Interactive report: Regulatory Year %d, Species %s." % (y, y, y + 1, y, spname),
        })
        for r in rows + [dict(total, unit="Statewide")]:
            u = r["unit"]
            if u == "":
                stats[f"blank_hunters_{y}"] = r["hunters"]
                stats[f"blank_harvest_{y}"] = r["ts"]
                continue
            unit_codes.add(u)
            base = {"species": key, "year": y, "unit": u}
            if u != "Statewide" and unit_name(u):
                base["unitName"] = unit_name(u)
            rec = dict(base, method="all", methodLabel=ALL_LABEL, residency="all", hunters=r["hunters"], harvest=r["ts"])
            sx = sex_overall if u == "Statewide" else sex.get(u)
            note = []
            if sx is not None:
                if sx[3] != r["ts"]:
                    note.append(f"ADF&G sex-composition report total ({sx[3]}) differs from success report harvest ({r['ts']}); sex counts as printed in report 130")
                rec["harvestMale"], rec["harvestFemale"] = sx[0], sx[1]
                if sx[2]:
                    note.append(f"{sx[2]} harvested animal(s) of unspecified sex")
                if u != "Statewide" and len(sx[4]) > 1:
                    note.append("harvestMale/harvestFemale summed over ADF&G mountain-range rows: " + ", ".join(sx[4]))
            elif r["ts"] > 0:
                stats["no_sex_row"] += 1
            rec["successPct"] = pct(r["ts"], r["hunters"])
            if rec["successPct"] is not None:
                rec["successComputed"] = True
            if r["us"] or r["uu"]:
                note.append(f"includes {r['us'] + r['uu']} hunter(s) of unspecified residency")
            if u == "Statewide":
                note.append("ADF&G report Total row; includes hunters with no unit reported" if stats.get(f"blank_hunters_{y}") else "ADF&G report Total row")
            if note:
                rec["note"] = "; ".join(note)
            rec["sourceId"] = sid
            if rec["hunters"] or rec["harvest"]:
                out.append(rec)
            for res, hk, sk in (("resident", ("rs", "ru"), "rs"), ("nonresident", ("ns", "nu"), "ns")):
                n = r[hk[0]] + r[hk[1]]
                if n == 0:
                    continue
                rr = dict(base, method="all", methodLabel=ALL_LABEL, residency=res, hunters=n, harvest=r[sk], successPct=pct(r[sk], n), successComputed=True, sourceId=sid)
                out.append(rr)
        # per-hunt rows
        if "--units-only" in sys.argv:
            continue
        hunt_files = sorted(glob.glob(os.path.join(raw, "hunts", f"gr_{code}_{y}_330_*.html")))
        hunt_list = json.load(open(os.path.join(raw, f"hunts_{code}_{y}.json")))
        got = {os.path.basename(f).rsplit("_", 1)[1][:-5] for f in hunt_files}
        missing = sorted(set(hunt_list) - got)
        if missing:
            raise RuntimeError(f"{key} {y}: per-hunt reports missing for {missing}")
        for f in hunt_files:
            h = os.path.basename(f).rsplit("_", 1)[1][:-5]
            _, hrows, htotal = parse_330(f, y, spname)
            if not hrows:
                stats["hunts_no_records"] += 1
                continue
            stats["hunts"] += 1
            for r in hrows:
                if r["unit"] == "":
                    stats["hunt_blank_unit_rows"] += 1
                    stats["hunt_blank_unit_hunters"] += r["hunters"]
                    continue
                if r["hunters"] == 0:
                    continue
                unit_codes.add(r["unit"])
                rec = {"species": key, "year": y, "unit": r["unit"]}
                if unit_name(r["unit"]):
                    rec["unitName"] = unit_name(r["unit"])
                rec.update(hunt=h, methodLabel=hunt_label(h), hunters=r["hunters"], harvest=r["ts"], successPct=pct(r["ts"], r["hunters"]), successComputed=True)
                if r["ns"] + r["nu"]:
                    rec["note"] = f"Nonresidents: {r['ns'] + r['nu']} hunters, {r['ns']} harvested"
                rec["sourceId"] = sid
                out.append(rec)
    cov_notes[key] = stats
    return out, years


def parse_deer(raw: str, sources: list, unit_codes: set):
    out, years = [], []
    for y in YEARS:
        p = os.path.join(raw, f"deer_{y}.html")
        b = soup(p)
        h3 = [h.get_text(" ", strip=True) for h in b.find_all("h3") if "Deer Hunting Statistics" in h.get_text()]
        if not h3 or not h3[0].startswith(str(y)):
            raise RuntimeError(f"{p}: heading {h3}")
        t = b.find("table", class_="basic")
        hdr = [th.get_text(" ", strip=True) for th in t.find("thead").find_all("tr")[1].find_all("th")]
        if hdr != ["GMU", "# of Hunters", "Male", "Female", "Total", "Deer per Hunter"]:
            raise RuntimeError(f"{p}: header {hdr}")
        sid = f"h-adfg-deer-{y}"
        n = 0
        for tr in t.find("tbody").find_all("tr"):
            c = cells(tr)
            unit = c[0]
            hunters, male, female, total = (num(x) for x in c[1:5])
            if male + female != total:
                raise RuntimeError(f"{p}: {c}")
            rec = {"species": "mule-deer", "year": y, "unit": unit}
            if unit_name(unit):
                rec["unitName"] = unit_name(unit)
            rec.update(method="all", methodLabel="All hunts (Deer Hunting Statistics)", hunters=hunters, harvest=total, harvestMale=male, harvestFemale=female, successPct=None,
                       note=f"Deer per hunter {c[5]} (ADF&G). Bag limits allow more than one deer, so ADF&G publishes deer per hunter, not percent success.", sourceId=sid)
            unit_codes.add(unit)
            out.append(rec)
            n += 1
        if n:
            years.append(y)
            sources.append({"id": sid, "title": f"{y} Deer Hunting Statistics (Sitka Black-tailed Deer Hunting in Alaska - Harvest Statistics, by Hunt GMU)", "publisher": PUB,
                            "url": DEER_URL, "dataYear": y, "retrieved": RETRIEVED, "notes": f"Interactive page; year {y} selected (form field selected_regyear)."})
    return out, years


def parse_bear(raw: str, sources: list):
    out, years = [], []
    for y in YEARS:
        sid = f"h-adfg-blackbear-{y}"
        n = 0
        for t, tname in BEAR_TYPES.items():
            p = os.path.join(raw, f"bb_{y}_{t}.html")
            b = soup(p)
            h3 = [h.get_text(" ", strip=True) for h in b.find_all("h2") if "Hunt Statistics" in h.get_text()]
            if not h3 or not re.match(rf"{y}\s+Black Bear\s+{re.escape(tname)}\s+Hunt Statistics", re.sub(r"\s+", " ", h3[0])):
                raise RuntimeError(f"{p}: heading {h3}")
            for tr in b.find_all("tr"):
                c = cells(tr)
                if len(c) != 7 or not re.fullmatch(r"[A-Z]{2}\d{3}", c[0]):
                    continue
                hunt = c[0]
                permits, hunters, male, female, total = (num(x) for x in c[1:6])
                m = re.fullmatch(r"(\d+)%", c[6])
                if not m or male + female != total:
                    raise RuntimeError(f"{p}: {c}")
                rec = {"species": "bear", "year": y}
                if hunt == "GL000":
                    rec["unit"] = "Statewide"
                    note = "General season (GL000) harvest-ticket hunt only; drawing and registration hunts are separate rows. ADF&G publishes no unit breakdown on this page."
                    meth = (None, None)
                else:
                    if hunt not in HUNT_UNITS:
                        raise RuntimeError(f"{p}: no unit mapping for {hunt}")
                    unit, mth, mlabel, desc, _ = HUNT_UNITS[hunt]  # _ = regulation unit page number
                    rec["unit"] = unit
                    rec["unitName"] = unit_name(unit)
                    note = f"Hunt area per 2026-2027 Alaska Hunting Regulations, Unit {_} page: {desc}"
                    meth = (mth, mlabel)
                rec["hunt"] = hunt
                if meth[0]:
                    rec["method"] = meth[0]
                rec["methodLabel"] = BEAR_LABEL[t] + (f" - {meth[1]}" if meth[1] else "")
                rec.update(hunters=hunters, harvest=total, harvestMale=male, harvestFemale=female, successPct=int(m.group(1)), licenses=permits, note=note, sourceId=sid)
                out.append(rec)
                n += 1
        if n:
            years.append(y)
            sources.append({"id": sid, "title": f"{y} Black Bear Hunt Statistics (Reported Harvest) - General Season, Draw, Registration and Tier II", "publisher": PUB,
                            "url": BEAR_URL, "dataYear": y, "retrieved": RETRIEVED,
                            "notes": "Interactive page; one table per hunt type. 'Number of hunters = Number of people that actually went hunting.' # of Permits stored as licenses."})
    return out, years


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    raw, repo = sys.argv[1], sys.argv[2]
    dest = os.path.join(repo, "src/data/agency/alaska")
    os.makedirs(os.path.join(dest, "harvest"), exist_ok=True)
    sources, coverage, unit_names = [], [], {}
    cov_stats = {}
    files = {}
    for code, (key, spname) in GR_SPECIES.items():
        codes = set()
        rows, years = gr_species(raw, code, key, spname, sources, cov_stats, codes)
        files[key] = (rows, years)
        unit_names[key] = {u: unit_name(u) for u in sorted(codes) if unit_name(u)}
    codes = set()
    drows, dyears = parse_deer(raw, sources, codes)
    files["mule-deer"] = (drows, dyears)
    unit_names["mule-deer"] = {u: unit_name(u) for u in sorted(codes) if unit_name(u)}
    brows, byears = parse_bear(raw, sources)
    files["bear"] = (brows, byears)
    unit_names["bear"] = {u: unit_name(u) for u in sorted({r["unit"] for r in brows if r["unit"] != "Statewide"})}
    for n in sorted({v[4] for v in HUNT_UNITS.values()}):
        sources.append({"id": f"h-adfg-regs-gmu{n}", "title": f"2026-2027 Alaska Hunting Regulations - Unit {n}", "publisher": PUB, "url": REGS_URL.format(n=n),
                        "pageUrl": "https://www.adfg.alaska.gov/index.cfm?adfg=wildliferegulations.hunting", "dataYear": 2026, "retrieved": RETRIEVED,
                        "notes": "Used only to map black bear hunt numbers to their unit (no harvest numbers taken from it)."})
    sources.append({"id": "h-adfg-gmu-overview", "title": "Game Management Units (2026-2027 Alaska Hunting Regulations)", "publisher": PUB, "url": OVERVIEW_URL, "dataYear": 2026,
                    "retrieved": RETRIEVED, "notes": "Region assignment of units used in unitNames."})

    common = ("Source: ADF&G Harvest General Reports (secure.wildlife.alaska.gov/DWC/HarvestInformation/GeneralReports), titled 'Interim ... Harvest Report' by ADF&G "
              "(subject to revision; RY2025 = July 2025-June 2026 may still receive late reports). year = regulatory year start (RY runs July 1-June 30). "
              "Unit codes exactly as ADF&G prints them ('01A', '13E', '02Z'); 'Z' marks a unit with no subunit letter in the record, and '27Z' is printed by ADF&G but is not one of Alaska's GMUs 1-26 and is not defined on the report page (kept as published, no unitName). "
              "Rows with method 'all' / methodLabel 'All hunts combined' are report 330 for all hunts (general season harvest tickets, drawing, registration, Tier I/II and community hunts together); residency 'resident'/'nonresident' rows are that residency's successful + unsuccessful hunters (ADF&G's 'Unspec' residency hunters are only in the 'all' row). "
              "ADF&G prints each count as a share of all hunters, not a success rate, so successPct = harvest/hunters (successComputed). harvestMale/harvestFemale from report 130 (its total can differ by 1 from report 330; noted per row). daysHunted is not stored: ADF&G's effort report 510 counts hunters differently from report 330 in many units, so its day totals do not pair with these hunter counts. "
              "'Statewide' = the report's Total row. Rows with a hunt number are report 330 filtered to that hunt, one per unit where the hunt reported hunters (residency all; nonresident counts in the row note); methodLabel is the hunt type from the regulations' prefix legend (D drawing, R registration, T Tier II, C community, GM000 general season). "
              "Do not add hunt rows to unit rows: unit rows already include every hunt.")
    for key in ["moose", "sheep", "goat", "elk"]:
        st = cov_stats[key]
        blanks = [f"RY{y}: {st[f'blank_hunters_{y}']} hunters/{st[f'blank_harvest_{y}']} harvested" for y in YEARS if f"blank_hunters_{y}" in st]
        extra = {
            "moose": "Not included for Alaska: caribou, bison, muskox and wolf (ADF&G publishes them, but they are not HuntScout species keys) and brown/grizzly bear. ",
            "sheep": "sheep = Dall sheep (ADF&G species 'Sheep'). Report 130 for sheep is split by mountain range within a GMU; harvestMale/harvestFemale sum those rows where a GMU has more than one (noted per row). ",
            "goat": "goat = mountain goat. ",
            "elk": "Alaska elk are introduced herds on Afognak/Raspberry islands (Unit 8) and Etolin/Zarembo islands (Unit 3). ",
        }[key]
        notes = extra + common
        if blanks:
            notes += " ADF&G also prints a row with no unit (not stored, but included in Statewide): " + "; ".join(blanks) + "."
        if st.get("hunt_blank_unit_rows"):
            notes += f" Per-hunt reports had {st['hunt_blank_unit_rows']} no-unit rows ({st['hunt_blank_unit_hunters']} hunters) that are not stored."
        if st.get("hunts_no_records"):
            notes += f" {st['hunts_no_records']} hunt-year reports returned no records (hunt listed on the form but no hunters reported)."
        coverage.append({"species": key, "years": files[key][1], "notes": notes})
    coverage.append({"species": "mule-deer", "years": dyears, "notes": (
        "mule-deer key = Sitka black-tailed deer (Odocoileus hemionus sitkensis), ADF&G 'Deer Hunting Statistics' by Hunt GMU (adfg.alaska.gov deerhunting.deerharvest). "
        "ADF&G publishes hunters, male/female/total harvest and deer per hunter; it does not publish percent success, so successPct is null (deer per hunter in the row note; bag limits allow several deer, so harvest can exceed hunters). "
        "Only the GMUs ADF&G lists for each year appear. No statewide total is printed, so none is stored. '27Z' kept as published (not a GMU 1-26; undefined on the page). No residency or method split published.")})
    coverage.append({"species": "bear", "years": byears, "notes": (
        "bear = black bear only. Brown/grizzly bear is not one of HuntScout's species keys and is excluded. Source: ADF&G 'Black Bear Hunt Statistics (Reported Harvest)' per hunt number for General Season, Draw, Registration and Tier II (adfg.alaska.gov blackbearhunting.harvest); no Tier II black bear hunts were listed 2020-2025. "
        "ADF&G publishes black bear harvest per hunt, not per unit: the general season is one statewide hunt (GL000, stored as unit 'Statewide', general season only - not an all-hunts statewide total), and unit for drawing/registration hunts (DL018 1C, DL027/DL028 2, DL029/DL030 3, RL065 6D, RL450/RL460/DL455/DL457 14C) is read from the 2026-2027 hunting regulations, so hunt-area boundaries for 2020-2025 may have differed. "
        "successPct is ADF&G's published percent; licenses = '# of Permits' (harvest tickets for GL000); hunters = people who actually went hunting. ADF&G's per-GMU sealing records for black bear are not published in this form and are not included.")})

    for key, (rows, _) in files.items():
        rows.sort(key=lambda r: (-r["year"], r["hunt"] if "hunt" in r else "", r["unit"] != "Statewide", r["unit"], ["all", "resident", "nonresident"].index(r.get("residency", "all"))))
        with open(os.path.join(dest, "harvest", f"{key}.json"), "w") as f:
            f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n")
        print(key, len(rows), "rows", files[key][1])
    meta = {"unitNames": unit_names, "coverage": coverage, "sources": sources}
    with open(os.path.join(dest, "harvest-meta.json"), "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
