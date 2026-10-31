#!/usr/bin/env python3
"""Parse raw Montana FWP harvest downloads into HuntScout Pro agency JSON.

Usage:
  python -I harvest_parse.py <raw_dir> <repo_root>

Inputs (written by harvest_download.py into <raw_dir>):
  search_<SP>_<year>.csv   FWP Harvest Estimates Search CSV, District=ALL
                           (SP = DE deer, EL elk, PA antelope, MO moose, BS sheep, MG goat)
  repo_bear_<year>.pdf     FWP black bear harvest report (mandatory-report counts)
  repo_lion_<year>.pdf     FWP reported mountain lion harvest
  repo_turkey_<year>.xlsx  FWP turkey harvest estimates workbook
  harvestReports.html      the FWP index page (document titles / objectIDs)

Outputs:
  <repo_root>/src/data/agency/montana/harvest/<species>.json
  <repo_root>/src/data/agency/montana/harvest-meta.json

Rules: values are copied exactly as published. Nothing is estimated or rounded.
Rows FWP publishes as 0 hunters/0 days in years where it did not estimate
district-level hunters are written as null (see coverage notes).
"""
import csv
import json
import os
import re
import subprocess
import sys

import openpyxl
from bs4 import BeautifulSoup

RETRIEVED = "2026-10-31"
PUBLISHER = "Montana Fish, Wildlife & Parks"
INDEX_URL = "https://myfwp.mt.gov/fwpPub/harvestReports"
REPO_URL = "https://myfwp.mt.gov/getRepositoryFile?objectID={}"
YEARS = range(2020, 2026)
RES = {"N": "nonresident", "R": "resident", "SUM": "all",
       "Non-Resident": "nonresident", "Resident": "resident", "Sum": "all"}

SEARCH = {
    # code: (species list, label, male col, female col, young col, young label)
    "EL": ("Elk", "Bulls", "Cows", "Calves"),
    "DE": ("Deer", "Bucks", "Does", "Fawns"),
    "PA": ("Antelope", "Bucks", "Does", "Fawns"),
    "MO": ("Moose", "Bulls", "Cows", "Calves"),
    "BS": ("Sheep", "Rams", "Ewes", "Lambs"),
    "MG": ("Mountain Goat", "Billies", "Nannies", "Kids"),
}
SEARCH_SPECIES = {"EL": "elk", "PA": "pronghorn", "MO": "moose", "BS": "sheep", "MG": "goat"}
DEER_SPECIES = {"md": "mule-deer", "wt": "whitetail"}


def num(v):
    v = str(v).strip().replace(",", "")
    if v in ("", "-"):
        return None
    f = float(v)
    return int(f) if f.is_integer() and "." not in v else f


def is_district(u):
    """True for a published hunting-district id; False for FWP roll-ups/unknowns
    (State, Reg_1..Reg_7, Reg_X, XXX, 1XX..7XX, 2**, ...)."""
    return bool(re.match(r"^\d{3}", u)) and "X" not in u and "*" not in u


def success(hunters, harvest):
    if isinstance(hunters, (int, float)) and isinstance(harvest, (int, float)) and hunters > 0:
        return round(100.0 * harvest / hunters, 1), True
    return None, False


# ---------------------------------------------------------------- sources
class Sources:
    def __init__(self):
        self.items = {}

    def add(self, sid, **kw):
        if sid not in self.items:
            self.items[sid] = {"id": sid, "publisher": PUBLISHER, "retrieved": RETRIEVED, **kw}
        return sid


def repo_titles(raw):
    soup = BeautifulSoup(open(os.path.join(raw, "harvestReports.html"), "rb").read(), "lxml")
    out = {}
    for a in soup.find_all("a", href=True):
        m = re.search(r"objectID=(\d+)", a["href"])
        if m:
            t = a.get_text(" ", strip=True)
            t = re.sub(r"\s*Owned by.*$", "", t)
            out.setdefault(int(m.group(1)), t)
    return out


# ---------------------------------------------------------------- search CSVs
def parse_search(raw, srcs):
    out = {s: [] for s in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat"]}
    meta = {}
    for code, (label, mcol, fcol, ycol) in SEARCH.items():
        for y in YEARS:
            path = os.path.join(raw, f"search_{code}_{y}.csv")
            rows = list(csv.reader(open(path, newline="")))
            hdr = [h.strip() for h in rows[0]]
            data = [dict(zip(hdr, [c.strip() for c in r])) for r in rows[1:] if r and r[0].strip()]
            dist = [r for r in data if is_district(r["Hunting District"])]
            # FWP leaves district hunters/days at 0 in years it did not estimate them.
            hunters_published = any(num(r["Hunters"]) for r in dist)
            meta[(code, y)] = hunters_published
            sid = srcs.add(
                f"h-search-{code.lower()}-{y}",
                title=f"{label} Harvest Estimates - {y} - {y}",
                url=INDEX_URL,
                dataYear=y,
                notes=(f"FWP Harvest Estimates Search (myfwp.mt.gov): Species={label}, Start Year={y}, "
                       f"End Year={y}, District=ALL, 'Generate CSV' (also checked against the 'Generate PDF' "
                       "output). Survey-based estimates; FWP reports whole numbers."),
            )
            for r in data:
                u = r["Hunting District"]
                if u == "State":
                    unit = "Statewide"
                elif is_district(u):
                    unit = u
                else:
                    continue  # regional roll-ups and unknown-district rows
                if code == "DE":
                    sp = DEER_SPECIES.get(r["Deer Species"])
                    if not sp:
                        continue  # all_deer combined rows
                else:
                    sp = SEARCH_SPECIES[code]
                res = RES[r["Residency"]]
                hunters, days = num(r["Hunters"]), num(r["Days"])
                notes = []
                if unit != "Statewide" and not hunters_published:
                    hunters = days = None
                    notes.append(f"FWP did not publish district-level hunter or day estimates for {label.lower()} in {y} (reported as 0); harvest only.")
                if unit == "Statewide" and days == 0 and hunters:
                    days = None
                deer_hunters = None
                if code == "DE" and hunters is not None:
                    # FWP hunter/day counts are for deer hunters of both species combined.
                    deer_hunters = (hunters, days)
                    hunters = days = None
                harvest = num(r["Total Harvest"])
                male, female, young = num(r[mcol]), num(r[fcol]), num(r[ycol])
                base = {"species": sp, "year": y, "unit": unit}
                if code == "EL":
                    notes.append(f"Bulls by class: spike {r['Spike Bull Elk']}, less than 6 points {r['Less than 6 Points']}, 6 or more points {r['6 or More Points']}.")
                if code == "DE":
                    notes.append(f"Bucks by class: less than 4 points {r['Less than 4 Points']}, 4 or more points {r['4 or More Points']}.")
                    if deer_hunters:
                        days_txt = (f"days {deer_hunters[1]}" if deer_hunters[1] is not None
                                    else "days not published for this year")
                        notes.append(f"FWP deer hunters in this area (mule deer and white-tailed deer combined): {deer_hunters[0]}, {days_txt}; FWP does not split hunters by deer species, so success is not computed.")
                if young:
                    notes.append(f"{ycol}: {young} (included in total harvest, not in male/female).")
                sp_pct, comp = success(hunters, harvest)
                if sp_pct is not None and sp_pct > 100:
                    sp_pct, comp = None, False
                    notes.append("Harvest exceeds hunters (hunters can hold more than one license), so harvest/hunters is not a success rate and is not given.")
                rec = {**base, "method": "all", "methodLabel": "All weapons", "residency": res,
                       "hunters": hunters, "harvest": harvest, "harvestMale": male, "harvestFemale": female,
                       "successPct": sp_pct}
                if comp:
                    rec["successComputed"] = True
                rec["daysHunted"] = days
                if notes:
                    rec["note"] = " ".join(notes)
                rec["sourceId"] = sid
                out[sp].append(rec)
                if "Bow" in r and "Rifle" in r:
                    for meth, col in (("archery", "Bow"), ("rifle", "Rifle")):
                        out[sp].append({**base, "method": meth, "methodLabel": col, "residency": res,
                                        "hunters": None, "harvest": num(r[col]), "successPct": None,
                                        "note": f"FWP publishes harvest by weapon ({col} column) but not hunters by weapon.",
                                        "sourceId": sid})
    return out, meta


# ---------------------------------------------------------------- bear PDFs
BEAR_RE = re.compile(r"^\s*(?P<area>\S.*?)\s+(?P<season>Spring & Fall|Spring|Fall)\s+"
                     r"(?P<res>Non-Resident|Resident|Sum|Unknown)\s+(?P<rest>[-\d,\s]+)$")
LIC_RE = re.compile(r"Total license sales:?\s*([\d,]+)\s*\(([\d,]+) Resident,\s*([\d,]+) Non-Resident\)")


def pdftext(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout


def bear_cols(y):
    if y <= 2022:
        return ["F", "M", "T"]
    if y == 2023:
        return ["F", "M", "T", "PF"]
    if y == 2024:
        return ["F", "M", "U", "T", "PF", "ND", "D", "NA"]
    return ["F", "M", "T", "PF", "ND", "D", "NA"]


def parse_bear(raw, srcs, titles, oids):
    out = []
    for y in YEARS:
        pdf = os.path.join(raw, f"repo_bear_{y}.pdf")
        txt = pdftext(pdf)
        sid = srcs.add(f"h-bear-{y}", title=titles.get(oids[y], f"{y} Black Bear Harvest Report"),
                       url=REPO_URL.format(oids[y]), pageUrl=INDEX_URL, dataYear=y,
                       notes="FWP black bear harvest report (spring and fall seasons). Counts from mandatory harvest reporting; FWP does not publish bear hunter numbers by district.")
        lic = LIC_RE.search(txt)
        lic_tot, lic_r, lic_n = (num(lic.group(i)) for i in (1, 2, 3))
        cols = bear_cols(y)
        groups = {}
        order = []
        for ln in txt.splitlines():
            m = BEAR_RE.match(ln.rstrip())
            if not m:
                continue
            vals = m["rest"].split()
            if len(vals) != len(cols):
                raise SystemExit(f"bear {y}: column count {len(vals)} != {len(cols)}: {ln!r}")
            key = (m["area"], m["season"])
            if key not in groups:
                groups[key] = []
                order.append(key)
            groups[key].append((m["res"], dict(zip(cols, vals))))
        for key in order:
            area, season = key
            if area == "State":
                unit = "Statewide"
            elif re.match(r"^\d{3}", area):
                unit = area  # BMU/HD id; 2025 also lists '700 With Hounds' as its own area
            else:
                continue  # regions and BMU-area roll-ups (Central, East, ...)
            g = groups[key]
            seq = [r for r, _ in g]
            extra = False
            for i, (res, v) in enumerate(g):
                if res == "Unknown":
                    extra = True
                    continue
                if res == "Resident" and seq.count("Resident") > 1:
                    # 2020 report lists unlabeled extra rows as "Resident"; the true resident
                    # row is the one immediately after the Non-Resident row.
                    if not (i > 0 and seq[i - 1] == "Non-Resident"):
                        extra = True
                        continue
                    if "Non-Resident" not in seq:
                        continue
                rec = {"species": "bear", "year": y, "unit": unit, "method": "all",
                       "methodLabel": f"{season} season" + ("s" if season == "Spring & Fall" else ""),
                       "residency": RES[res], "hunters": None, "harvest": num(v["T"]),
                       "harvestMale": num(v["M"]), "harvestFemale": num(v["F"]), "successPct": None}
                notes = []
                if v.get("U") not in (None, "0"):
                    notes.append(f"Sex unknown: {v['U']} (included in total).")
                if unit == "Statewide" and season == "Spring & Fall":
                    if res == "Sum":
                        rec["licenses"] = lic_tot
                    elif res == "Non-Resident":
                        rec["licenses"] = lic_n
                    elif res == "Resident":
                        rec["licenses"] = lic_r
                    if y == 2020 and res == "Resident":
                        rec["licenses"] = None
                        notes.append("FWP's 2020 report prints resident license sales as 31,465, which does not match its own breakdown (25,983 Sportsman + 11,708 bear-only); left blank.")
                if unit.endswith("With Hounds"):
                    notes.append("FWP lists this area separately from HD 700 (bear hunting with hounds); its harvest is not included in the '700' rows.")
                if res == "Sum" and extra:
                    notes.append("Sum includes harvest FWP did not label as resident or nonresident.")
                if notes:
                    rec["note"] = " ".join(notes)
                rec["sourceId"] = sid
                out.append(rec)
    return out


# ---------------------------------------------------------------- lion PDFs
LION_RE = re.compile(r"^\s*(?P<area>\S.*?)\s+(?P<res>Non-Resident|Resident|Sum)\s+(?P<rest>[-\d,\s]+)$")


def parse_lion(raw, srcs, titles, oids):
    out = []
    for y in YEARS:
        txt = pdftext(os.path.join(raw, f"repo_lion_{y}.pdf"))
        unit_term = "lion management unit (LMU)" if y >= 2024 else "hunting district"
        sid = srcs.add(f"h-lion-{y}", title=titles.get(oids[y], f"{y} Mountain Lion Harvest Report"),
                       url=REPO_URL.format(oids[y]), pageUrl=INDEX_URL, dataYear=y,
                       notes=f"FWP reported mountain lion harvest (mandatory reporting) by {unit_term}; FWP does not publish lion hunter numbers by area.")
        lic = LIC_RE.search(txt)
        lic_tot, lic_r, lic_n = (num(lic.group(i)) for i in (1, 2, 3))
        ncols = 3 if y <= 2023 else 6
        seen = set()
        for ln in txt.splitlines():
            if "license sales" in ln:
                continue
            m = LION_RE.match(ln.rstrip())
            if not m:
                continue
            vals = m["rest"].split()
            if len(vals) != ncols:
                raise SystemExit(f"lion {y}: bad columns {ln!r}")
            area = m["area"]
            if area == "State":
                unit = "Statewide"
            elif re.match(r"^\d{3}", area) and "*" not in area:
                unit = area
            else:
                continue
            key = (unit, m["res"])
            if key in seen:
                raise SystemExit(f"lion {y}: duplicate {key}")
            seen.add(key)
            f, mm, t = (num(v) for v in vals[:3])
            rec = {"species": "lion", "year": y, "unit": unit, "method": "all", "methodLabel": "All methods",
                   "residency": RES[m["res"]], "hunters": None, "harvest": t, "harvestMale": mm,
                   "harvestFemale": f, "successPct": None}
            if unit == "Statewide":
                rec["licenses"] = {"Sum": lic_tot, "Resident": lic_r, "Non-Resident": lic_n}[m["res"]]
            if ncols == 6:
                rec["note"] = f"Harvested without hounds {vals[3]}, with hounds {vals[4]}, no answer {vals[5]}."
            rec["sourceId"] = sid
            out.append(rec)
    return out


# ---------------------------------------------------------------- turkey XLSX
def county_name(d):
    special = {"Bighorn": "Big Horn", "Choteau": "Chouteau", "Sweetgrass": "Sweet Grass"}
    n = d.replace("_", " ")
    return special.get(d, n) + " County"


def parse_turkey(raw, srcs, titles, oids):
    out, names = [], {}
    for y in YEARS:
        wb = openpyxl.load_workbook(os.path.join(raw, f"repo_turkey_{y}.xlsx"), data_only=True, read_only=True)
        sid = srcs.add(f"h-turkey-{y}", title=titles.get(oids[y], f"{y} Turkey Harvest Report"),
                       url=REPO_URL.format(oids[y]), pageUrl=INDEX_URL, dataYear=y,
                       notes="FWP turkey harvest estimates workbook (sheets turkey_harvest_total, turkey_effort, hunter_success). Survey estimates by county; values copied unrounded as published.")

        def sheet(name):
            ws = wb[name]
            it = ws.iter_rows(values_only=True)
            hdr = [h for h in next(it)]
            return [dict(zip(hdr, r)) for r in it if r and r[0] is not None]

        harv = sheet("turkey_harvest_total")
        eff = sheet("turkey_effort")
        succ = {r["Res"]: r["pct_success"] for r in sheet("hunter_success") if r["district"] == "State"}
        effort = {(r["season"], r["district"], r["Res"]): r for r in eff if r["LPT"] == "SUM"}
        fem_col = "females_harvest_fall/female_harvest_total"
        spring_col = "spring_total/spring_male_total"
        for r in harv:
            d = r["district"]
            if d == "State":
                unit = "Statewide"
            elif d.startswith("Region") or "unknown" in d.lower():
                continue
            else:
                unit = d
                names[d] = county_name(d)
            res = RES[r["Res"]]
            lpt = r["LPT"]
            base = {"species": "turkey", "year": y, "unit": unit}
            if lpt == "SUM":
                seasons = [("Combined", "Spring & fall seasons combined", r["total_harvest"], r["total_males"], r[fem_col]),
                           ("Spring", "Spring season", r[spring_col], r[spring_col], None),
                           ("Fall", "Fall season", r["fall_harvest_total"], r["fall_harvest_males"], r[fem_col])]
                for season, label, h, m, f in seasons:
                    e = effort.get((season, d, r["Res"]))
                    rec = {**base, "method": "all", "methodLabel": label, "residency": res,
                           "hunters": e["hunters"] if e else None, "harvest": h, "harvestMale": m}
                    if f is not None:
                        rec["harvestFemale"] = f
                    rec["successPct"] = succ.get(r["Res"]) if (unit == "Statewide" and season == "Combined") else None
                    if e:
                        rec["daysHunted"] = e["days"]
                    notes = []
                    if unit == "Statewide":
                        rec["licenses"] = r["number_issued"]
                        if season == "Combined":
                            notes.append("Success = FWP hunter_success sheet: percent of license holders who hunted that harvested at least one turkey.")
                    if season == "Spring":
                        notes.append("Spring harvest is males only (FWP column spring_total/spring_male_total).")
                    if not e:
                        notes.append("No effort (hunter) estimate published for this area/season.")
                    elif isinstance(h, (int, float)) and isinstance(e["hunters"], (int, float)) and h > e["hunters"]:
                        notes.append("Estimated harvest exceeds estimated hunters: turkey licenses/permits allow more than one bird, and both figures are survey estimates.")
                    if notes:
                        rec["note"] = " ".join(notes)
                    rec["sourceId"] = sid
                    out.append(rec)
            else:
                rec = {**base, "hunt": lpt, "method": "all", "methodLabel": "Spring & fall seasons combined",
                       "residency": res, "hunters": None, "harvest": r["total_harvest"],
                       "harvestMale": r["total_males"], "harvestFemale": r[fem_col], "successPct": None}
                if re.fullmatch(r"\d{3}-\d{2}", str(lpt)) or unit == "Statewide":
                    rec["licenses"] = r["number_issued"]
                rec["note"] = ("Harvest by FWP license/permit type (LPT) " + str(lpt) +
                               "; FWP publishes hunters only for all license types combined.")
                rec["sourceId"] = sid
                out.append(rec)
    return out, names


# ---------------------------------------------------------------- main
def main():
    raw, repo = sys.argv[1], sys.argv[2]
    outdir = os.path.join(repo, "src/data/agency/montana")
    os.makedirs(os.path.join(outdir, "harvest"), exist_ok=True)
    srcs = Sources()
    titles = repo_titles(raw)
    soup_ids = {"bear": {2025: 117272, 2024: 113505, 2023: 112156, 2022: 110285, 2021: 106594, 2020: 103066},
                "lion": {2025: 117273, 2024: 113504, 2023: 112158, 2022: 110286, 2021: 106593, 2020: 103068},
                "turkey": {}}
    for oid, t in titles.items():
        m = re.match(r"(\d{4}) .*turkey", t, re.I)
        if m and int(m.group(1)) in YEARS:
            soup_ids["turkey"].setdefault(int(m.group(1)), oid)

    data, pub = parse_search(raw, srcs)
    data["bear"] = parse_bear(raw, srcs, titles, soup_ids["bear"])
    data["lion"] = parse_lion(raw, srcs, titles, soup_ids["lion"])
    data["turkey"], turkey_names = parse_turkey(raw, srcs, titles, soup_ids["turkey"])

    for sp, rows in data.items():
        rows.sort(key=lambda r: (r["year"], r["unit"] != "Statewide", r["unit"], r.get("hunt", ""),
                                 r.get("methodLabel", ""), r["method"] != "all", r["residency"] != "all", r["residency"]))
        p = os.path.join(outdir, "harvest", f"{sp}.json")
        with open(p, "w") as fh:
            fh.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
        print(sp, len(rows), os.path.getsize(p))

    def yrs(sp):
        return sorted({r["year"] for r in data[sp]})

    def hunter_years(code):
        return [y for y in YEARS if pub[(code, y)]]

    cov = []
    gen = ("Unit-level rows are FWP hunting districts (ids as published, e.g. '411E', '580N'); FWP regional roll-ups "
           "(Reg_1..Reg_7), unknown-district rows (XXX, 1XX..7XX) are omitted, so district sums fall short of the "
           "'Statewide' row by the harvest FWP could not assign to a district. Rows are given for residency all "
           "(FWP 'SUM'), resident and nonresident. Success % is not published by FWP for this species; it is "
           "computed as harvest / hunters (1 decimal, successComputed) and is harvest per hunter, not the share of "
           "hunters who filled a tag (some hunters hold more than one license). Archery/rifle rows carry harvest only "
           "(FWP does not publish hunters by weapon). Hunters are not additive across districts (one hunter can hunt several).")
    el_h = hunter_years("EL")
    cov.append({"species": "elk", "years": yrs("elk"), "notes": gen + f" District-level hunters and days were published for {el_h}; in the other years FWP reports them as 0 at district level, so they are null (harvest only); statewide hunters are present every year. Bull antler-class counts (spike / <6 / 6+ points) are in each row's note."})
    de_h = hunter_years("DE")
    for sp, lab in (("mule-deer", "mule deer"), ("whitetail", "white-tailed deer")):
        cov.append({"species": sp, "years": yrs(sp), "notes": gen.replace(" it is computed as harvest / hunters (1 decimal, successComputed) and is harvest per hunter, not the share of hunters who filled a tag (some hunters hold more than one license).", " it is not computed for deer.") + f" FWP's deer survey reports {lab} harvest separately but hunters and days only for deer hunters of both species combined; that count is given in each row's note (district level only in {de_h}; statewide every year) and 'hunters' is null. Buck antler-class counts (<4 / 4+ points) are in each row's note."})
    pa_h = hunter_years("PA")
    cov.append({"species": "pronghorn", "years": yrs("pronghorn"), "notes": gen.replace(" Archery/rifle rows carry harvest only (FWP does not publish hunters by weapon).", "") + f" FWP calls the species antelope. District hunters/days published for {pa_h}; other years harvest only at district level (statewide hunters every year, statewide days null where FWP printed 0). FWP's antelope output has no weapon split."})
    for sp, lab in (("moose", "moose"), ("sheep", "bighorn sheep"), ("goat", "mountain goat")):
        cov.append({"species": sp, "years": yrs(sp), "notes": gen.replace(" Archery/rifle rows carry harvest only (FWP does not publish hunters by weapon).", "") + f" Limited-license {lab} hunting; hunters and days are published every year for every district. Small samples: one or two hunters per district is common. FWP publishes no weapon split for {lab}." + (" Montana has Rocky Mountain bighorn sheep only." if sp == "sheep" else "")})
    cov.append({"species": "bear", "years": yrs("bear"), "notes": "Black bear harvest counts by bear management unit/hunting district from FWP's annual black bear harvest reports (mandatory harvest reporting). Rows per season (methodLabel 'Spring & Fall seasons', 'Spring season', 'Fall season') and residency. FWP does not publish hunter numbers by district, so hunters and success are null; statewide license sales are given as licenses on the Statewide combined-season rows. Regional and BMU-area (Central/East/Northwest/Southwest/West) roll-ups are omitted; 2025 lists '700 With Hounds' as its own area (kept as its own unit, not part of '700'). Rows FWP listed with unknown or unlabeled residency (2020, 2023) are omitted from resident/nonresident but are included in FWP's Sum rows."})
    cov.append({"species": "lion", "years": yrs("lion"), "notes": "Reported mountain lion harvest (mandatory reporting) by hunting district (2020-2023) and by lion management unit (2024-2025, FWP 'Area/LMU'; ids are similar 3-digit numbers but boundaries changed, so compare across that break with care). FWP publishes no lion hunter numbers by area; hunters and success are null; statewide license sales are given as licenses on Statewide rows. 2024-2025 rows note harvest with/without hounds. Regional, ecoregion and unknown ('2**', '6**', '7**') rows are omitted."})
    cov.append({"species": "turkey", "years": yrs("turkey"), "notes": "FWP reports turkey harvest by county (unit = county as FWP writes it, e.g. 'Lewis_and_Clark'; unitNames gives the county name), not by hunting district. Survey estimates are published with decimals and copied unrounded. Rows per season (combined/spring/fall) with hunters and days from FWP's effort sheet, plus harvest by license/permit type (hunt = FWP LPT code such as '799-00', or General_License / Regional_License) where hunters are not published. Success % is published statewide only (percent of license holders who hunted that harvested at least one turkey); county success is null because turkey licenses allow more than one bird, so harvest/hunters would not be a success rate. Fall harvest includes birds FWP did not classify by sex, so harvestMale + harvestFemale can be less than harvest. Regional and county-unknown rows omitted, so county sums fall short of Statewide. FWP's hunter_success sheet definition mentions 'pronghorn' (a template typo in FWP's workbook); it is the turkey success figure."})

    meta = {"unitNames": {"turkey": dict(sorted(turkey_names.items()))}, "coverage": cov,
            "sources": sorted(srcs.items.values(), key=lambda s: s["id"])}
    with open(os.path.join(outdir, "harvest-meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("sources", len(srcs.items))


if __name__ == "__main__":
    main()
