#!/usr/bin/env python3
"""Build src/data/agency/new-mexico/harvest/*.json and harvest-meta.json.

Usage (from the repo root):
    python -I scripts/agency/new-mexico/harvest_download.py <raw_dir>
    python -I scripts/agency/new-mexico/harvest_build.py <raw_dir>

Every number is copied from an NMDGF / NM Department of Wildlife publication.
Nothing is estimated or filled. Sums that this script forms (harvest = bulls + cows,
bucks + does, rams + ewes, sport female + male + unknown) only add cells the agency printed.
"""
import json
import os
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import harvest_dp  # noqa: E402
import harvest_elk  # noqa: E402
import harvest_other as other  # noqa: E402
from harvest_download import BASE, DOCS  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(REPO, "src", "data", "agency", "new-mexico")
RETRIEVED = "2026-10-31"
PUB_OLD = "New Mexico Department of Game and Fish"
PUB_NEW = "New Mexico Department of Wildlife (formerly NM Department of Game and Fish)"
INDEX = "https://wildlife.dgf.nm.gov/hunting/harvest-reporting-information/"
YEARS = range(2020, 2026)

WEAPON_METHOD = {"rifle": "rifle", "archery": "archery", "muzzleloader": "muzzleloader", "bow": "archery"}

LOG = []
SOURCES = []


def src(key, title, year, notes=None, url=None, page_url=INDEX, publisher=PUB_OLD):
    sid = "h-" + key
    s = {
        "id": sid,
        "title": title,
        "publisher": publisher,
        "url": url or BASE + DOCS[key],
        "pageUrl": page_url,
        "dataYear": year,
        "retrieved": RETRIEVED,
    }
    if notes:
        s["notes"] = notes
    SOURCES.append(s)
    return sid


def clean(row):
    return {k: v for k, v in row.items() if v is not None and v != ""}


def add(a, b):
    if a is None and b is None:
        return None
    if a is None or b is None:
        return None
    return a + b


def success_note(row):
    """Explain rows where the published success % is not harvest / hunters (validator check)."""
    h, k, p = row.get("hunters"), row.get("harvest"), row.get("successPct")
    if isinstance(h, (int, float)) and isinstance(k, (int, float)) and isinstance(p, (int, float)) and h >= 20:
        if abs(100.0 * k / h - p) > 2:
            return True
    return False


# ------------------------------------------------------------------ elk
ELK_SEX = {"MB": "male", "A": "female", "ES": "either", "APRE/6": "male"}
BAG_TEXT = {
    "MB": "mature bull", "A": "antlerless", "ES": "either sex", "MB/A": "mature bull or antlerless",
    "APRE/6": "antler point restricted bull", "APRE/6/A": "antler point restricted bull or antlerless",
}
ELK_SUCCESS = ("Success % as published by NMDGF (share of license holders who reported hunting that harvested); "
               "harvest = estimated bulls + estimated cows.")


def build_elk(raw):
    rows, names = [], {}
    for y in YEARS:
        key = f"elk-{y}"
        sid = src(key, f"{y} New Mexico Elk Hunter Harvest Report", y,
                  notes="Hunt-code and GMU totals; harvest columns are agency estimates (bulls, cows).")
        hunts, totals, sw = harvest_elk.parse(raw, key, LOG)
        for t in totals:
            if "Herd" in t["label"]:
                names.setdefault(t["unit"], {})[y] = t["label"].replace(" Totals", "")
        for r in hunts:
            if r["licenses"] is not None and r["successPct"] is None and r["bulls"] is None:
                LOG.append(f"{key}: hunt {r['code']} unit {r['unit']} has no harvest report (Na) - not emitted")
                continue
            note = [f"Bag {r['bag']} ({BAG_TEXT.get(r['bag'], r['bag'])})"]
            if r["type"]:
                note.append(f"type {r['type']}")
            if r["dates"]:
                note.append(f"dates {r['dates']}")
            if r["unit"] != r["block"]:
                note.append(f"listed in the GMU {r['block']} table")
            row = {
                "species": "elk", "year": y, "unit": r["unit"], "hunt": r["code"],
                "method": WEAPON_METHOD.get((r["weapon"] or "").lower()),
                "methodLabel": r["weapon"] if r["code"] else "Private land authorization",
                "sex": ELK_SEX.get(r["bag"]),
                "hunters": None,
                "harvest": add(r["bulls"], r["cows"]),
                "harvestMale": r["bulls"], "harvestFemale": r["cows"],
                "successPct": r["successPct"], "licenses": r["licenses"],
                "note": "; ".join(note) + ".", "sourceId": sid,
            }
            out = clean(row)
            out["hunters"] = None
            rows.append(out)
        for t in totals:
            row = {
                "species": "elk", "year": y, "unit": t["unit"], "method": "all",
                "methodLabel": "All hunts (GMU total)",
                "hunters": None, "harvest": add(t["bulls"], t["cows"]),
                "harvestMale": t["bulls"], "harvestFemale": t["cows"],
                "successPct": t["successPct"], "licenses": t["licenses"],
                "note": f"Agency line: '{t['label']} Totals' (public draw hunts + private-land authorizations).",
                "sourceId": sid,
            }
            out = clean(row)
            out["hunters"] = None
            rows.append(out)
        out = clean({
            "species": "elk", "year": y, "unit": "Statewide", "method": "all", "methodLabel": "All hunts (statewide total)",
            "harvest": add(sw["bulls"], sw["cows"]), "harvestMale": sw["bulls"], "harvestFemale": sw["cows"],
            "successPct": sw["successPct"], "licenses": sw["licenses"],
            "note": "Agency STATEWIDE TOTALS line (includes special authorizations and population-management hunts).",
            "sourceId": sid,
        })
        out["hunters"] = None
        rows.append(out)
    unit_names = {u: v[max(v)] for u, v in names.items()}
    # multi-GMU herd units are named only in the side notes of the latest report,
    # e.g. "Jemez Mountains Herd Unit (GMU 6A-C, 7)"
    with open(os.path.join(raw, f"elk-{max(YEARS)}.txt"), encoding="utf-8", errors="replace") as f:
        txt = f.read()
    for m in re.finditer(r"([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)*(?:/[A-Z][a-z]+(?: [A-Z][a-z]+)*)? Herd Unit) \(GMU ([^)]+)\)", txt):
        name, spec = m.group(1), m.group(2)
        for part in re.split(r",\s*", spec):
            rm = re.fullmatch(r"(\d+)([A-E])-([A-E])", part)
            ids = [rm.group(1) + chr(c) for c in range(ord(rm.group(2)), ord(rm.group(3)) + 1)] if rm else [part]
            for u in ids:
                unit_names.setdefault(u, name)
    return rows, unit_names


# ------------------------------------------------------------------ deer + pronghorn
DEER_SEX = {"FAD": "male", "FAMD": "male", "FAWTD": "male", "ESWTD": "either", "ES": "either", "A": "female"}
DEER_BAG = {
    "FAD": "fork-antlered deer (mule or white-tailed)", "FAMD": "fork-antlered mule deer",
    "FAWTD": "fork-antlered white-tailed deer", "ESWTD": "either-sex white-tailed deer", "ES": "either sex",
    "A": "antlerless",
}
PRONG_SEX = {"MB": "male", "ES": "either", "A": "female"}
PRONG_BAG = {"MB": "mature buck", "ES": "either sex", "A": "antlerless", "F-I": "female or immature",
             "F-IM": "female or immature"}
DP_SUCCESS = ("Success % as published (calculated by NMDGF from license holders who reported hunting); "
              "hunters and harvest are agency estimates.")
DEER_ALL = ("All deer hunts in this GMU: NMDGF does not split deer harvest by species (most licenses are FAD, "
            "fork-antlered mule or white-tailed deer).")


def dp_rows(raw, species_kind, y, key, sid):
    hunts, totals, sw = harvest_dp.parse(raw, key, LOG)
    out = {"mule-deer": [], "whitetail": [], "pronghorn": []}
    skipped = 0
    for r in hunts:
        harvest = add(r["bucks"], r["does"])
        if r["hunters"] is None and harvest is None and r["successPct"] is None:
            skipped += 1
            continue
        if species_kind == "deer":
            sp = "whitetail" if "WTD" in (r["bag"] or "") else "mule-deer"
            bag_text = DEER_BAG.get(r["bag"], r["bag"])
            sex = DEER_SEX.get(r["bag"])
        else:
            sp = "pronghorn"
            bag_text = PRONG_BAG.get(r["bag"], r["bag"])
            sex = PRONG_SEX.get(r["bag"])
        weapon = r["weapon"]
        label = weapon or "Other"
        if r["land"] in ("Public", "Private"):
            label = f"{label} - {r['land']} land"
        note = [f"Bag {r['bag']} ({bag_text})"]
        if r["category"]:
            note.append(f"hunter category {r['category']}")
        if r["dates"]:
            note.append(f"dates {r['dates']}")
        if not r["code"]:
            note.append("no hunt code printed (" + r["text"][:60] + ")")
        if r["land"] is None:
            note.append("Type column shows an area name (WMA / Valle Vidal) instead of Public/Private")
        if r.get("subareas"):
            note.append("GMU total in the report covers sub-areas " + " / ".join(r["subareas"]))
        row = {
            "species": sp, "year": y, "unit": r["unit"], "hunt": r["code"],
            "method": WEAPON_METHOD.get((weapon or "").lower()),
            "methodLabel": label, "sex": sex,
            "hunters": r["hunters"], "harvest": harvest,
            "harvestMale": r["bucks"], "harvestFemale": r["does"],
            "successPct": r["successPct"], "licenses": r["licenses"], "sourceId": sid,
        }
        if success_note(row):
            note.append(DP_SUCCESS)
        row["note"] = "; ".join(note) + "."
        c = clean(row)
        c["hunters"] = r["hunters"]
        c.setdefault("harvest", None)
        c.setdefault("successPct", None)
        out[sp].append(c)
    if skipped:
        LOG.append(f"{key}: {skipped} hunt rows with no reported hunting (all N/A) not emitted")
    tgt = "mule-deer" if species_kind == "deer" else "pronghorn"
    for t in totals + ([dict(sw, unit="Statewide")] if sw else []):
        harvest = add(t["bucks"], t["does"])
        note = []
        if species_kind == "deer":
            note.append(DEER_ALL)
        if t["unit"] == "Statewide":
            note.append("Agency 'Statewide Totals' line (includes special / statewide hunts).")
        row = {
            "species": tgt, "year": y, "unit": t["unit"], "method": "all",
            "methodLabel": "All hunts (GMU total)" if t["unit"] != "Statewide" else "All hunts (statewide total)",
            "hunters": t["hunters"], "harvest": harvest, "harvestMale": t["bucks"], "harvestFemale": t["does"],
            "successPct": t["successPct"], "licenses": t["licenses"], "sourceId": sid,
        }
        if success_note(row):
            note.append(DP_SUCCESS)
        if note:
            row["note"] = " ".join(note)
        c = clean(row)
        c["hunters"] = t["hunters"]
        out[tgt].append(c)
    return out


def build_deer(raw):
    md, wt = [], []
    for y in YEARS:
        key = f"deer-{y}"
        title = f"{y} - {y + 1} Deer Harvest Report" if y <= 2021 else f"{y}-{y + 1} Deer Harvest Report"
        notes = "Hunt-code and GMU totals; Estimated Hunters and Estimated Harvest are agency estimates."
        if y == 2020:
            notes = "Hunt-code and GMU totals; this year's report has no Estimated Hunters column."
        sid = src(key, title, y, notes=notes)
        o = dp_rows(raw, "deer", y, key, sid)
        md += o["mule-deer"]
        wt += o["whitetail"]
    return md, wt


def build_pronghorn(raw):
    rows = []
    for y in (2020, 2022, 2023, 2024, 2025):
        key = f"pronghorn-{y}"
        title = f"{y}-{y + 1} Pronghorn Harvest Report"
        notes = None
        if y == 2022:
            notes = ("Listed by NMDGF as the 2022-2023 Pronghorn Harvest Report; the PDF title line is misprinted "
                     "'2023-2023'.")
        if y in (2020, 2022, 2023):
            notes = ((notes + " ") if notes else "") + "No Estimated Hunters column in this year's report."
        sid = src(key, title, y, notes=notes)
        rows += dp_rows(raw, "pronghorn", y, key, sid)["pronghorn"]
    # 2021: no unit-level report is published; statewide figures from the agency forecast article
    sid = src("pronghorn-2021-statewide", "2023-2024 Pronghorn Hunting Forecast", 2021,
              notes="Agency web article (published 2023-01-16) quoting 2021 statewide pronghorn license and harvest "
                    "figures; no 2021-2022 unit-level pronghorn harvest report is listed by NMDGF.",
              url="https://wildlife.dgf.nm.gov/2023-2024-pronghorn-hunting-forecast/",
              page_url="https://wildlife.dgf.nm.gov/2023-2024-pronghorn-hunting-forecast/")
    rows.append({
        "species": "pronghorn", "year": 2021, "unit": "Statewide", "method": "all",
        "methodLabel": "All hunts (statewide total)", "hunters": None, "harvest": 4655 + 282,
        "harvestMale": 4655, "harvestFemale": 282, "successPct": 70, "licenses": 6857,
        "note": "Statewide only: 'sold 6,857 licenses resulting in 4,655 bucks and 282 does harvested. Average reported "
                "hunt success, across all weapons and license types, was 70%.' No unit-level 2021 data published.",
        "sourceId": sid,
    })
    return rows


# ------------------------------------------------------------------ bighorn sheep
def build_sheep(raw):
    rows = []
    for y in (2020, 2022, 2023, 2024, 2025):
        key = f"sheep-{y}"
        sid = src(key, f"Bighorn Sheep Harvest Results {y}-{y + 1}", y,
                  notes="Statewide hunt codes (Rocky Mountain and desert bighorn); success rate applies to hunters "
                        "that went afield.")
        hunts, total = other.parse_sheep(raw, key, LOG)
        for r in hunts:
            sold, rep, pct, succ, rams, ewes, sat, days = r["cells"]
            rams_i, ewes_i = other.to_int(rams), other.to_int(ewes)
            harvest = rams_i if r["bag"] == "Ram" else ewes_i
            land = r["land"]
            label = f"{r['weapon'] or 'Weapon not printed'} - {land}"
            note = f"Bag {r['bag']}"
            if r["area"]:
                note += f"; area breakdown of hunt {r['code']} ({r['area']})"
            row = {
                "species": "sheep", "year": y, "unit": r["area"] or "Statewide", "hunt": r["code"],
                "method": WEAPON_METHOD.get((r["weapon"] or "").lower()),
                "methodLabel": label, "sex": "male" if r["bag"] == "Ram" else "female",
                "harvest": harvest,
                "harvestMale": rams_i if r["bag"] == "Ram" else None,
                "harvestFemale": ewes_i if r["bag"] == "Ewe" else None,
                "successPct": other.to_pct(succ), "licenses": other.to_int(sold),
                "note": note + ".", "sourceId": sid,
            }
            c = clean(row)
            c["hunters"] = None
            rows.append(c)
        sold, rep, pct, succ, rams, ewes, sat, days = total
        c = clean({
            "species": "sheep", "year": y, "unit": "Statewide", "method": "all",
            "methodLabel": "All hunts (statewide total)",
            "harvest": other.to_int(rams) + other.to_int(ewes), "harvestMale": other.to_int(rams),
            "harvestFemale": other.to_int(ewes), "successPct": other.to_pct(succ), "licenses": other.to_int(sold),
            "note": "Agency totals line of the bighorn sheep harvest results table.", "sourceId": sid,
        })
        c["hunters"] = None
        rows.append(c)
    return rows


# ------------------------------------------------------------------ turkey
TURKEY_FLAG = {
    "*": "GMU is on Reservation lands (not NMDGF jurisdiction); agency notes hunters may have misreported the GMU or "
         "reported a Reservation-permit harvest.",
    "**": "GMU is closed to this season; agency notes hunters may have misreported the GMU of harvest.",
}


def build_turkey(raw):
    rows = []
    for y in YEARS:
        key = f"turkey-{y}"
        sid = src(key, f"{y} New Mexico Turkey Harvest Results", y,
                  notes="GMU tables are reported (not expanded) counts from mandatory harvest reports; statewide "
                        "estimates are in the report text.")
        spring, fall, s_tot, f_tot = other.parse_turkey(raw, key, LOG)
        for season, lst in (("Spring", spring), ("Fall", fall)):
            for r in lst:
                note = []
                if season == "Spring":
                    note.append("Reported counts; successPct = agency 'success on first turkey'; harvest includes "
                                "second birds")
                else:
                    note.append("Reported counts; successPct = agency fall success rate")
                if r["harvest"] is None:
                    note.append("harvest cell blank in the report")
                if r["successPct"] is None:
                    note.append("success cell blank in the report")
                if r["flag"]:
                    note.append(TURKEY_FLAG[r["flag"]])
                row = {
                    "species": "turkey", "year": y, "unit": "Unknown GMU" if r["gmu"] == "UNK" else r["gmu"],
                    "method": "all", "methodLabel": f"{season} season",
                    "hunters": r["hunters"], "harvest": r["harvest"], "successPct": r["successPct"],
                    "daysHunted": r["days"], "sourceId": sid,
                }
                if season == "Fall":
                    row["harvestFemale"] = r["hens"]
                    row["harvestMale"] = r["gobblers"]
                row["note"] = "; ".join(note) + "."
                c = clean(row)
                c.setdefault("harvest", None)
                rows.append(c)
            sw = other.turkey_statewide(raw, key, season.lower())
            if sw["licenses"] is None or sw["hunters"] is None or sw["harvest"] is None:
                raise ValueError(f"{key}: statewide {season} narrative figures not found: {sw}")
            row = {
                "species": "turkey", "year": y, "unit": "Statewide", "method": "all",
                "methodLabel": f"{season} season (statewide estimate)",
                "hunters": sw["hunters"], "harvest": sw["harvest"], "successPct": None,
                "licenses": sw["licenses"], "sourceId": sid,
                "note": "Licenses sold, estimated hunters and estimated harvest as stated in the report text "
                        "(estimates expand reports to non-reporting license holders); no comparable statewide "
                        "success % is published.",
            }
            if season == "Fall":
                row["harvestFemale"] = sw.get("hens")
                row["harvestMale"] = sw.get("toms")
            c = clean(row)
            c["successPct"] = None
            rows.append(c)
    return rows


# ------------------------------------------------------------------ bear / cougar
def build_mortality(raw, kind):
    sp = "bear" if kind == "bear" else "lion"
    name = "Black Bear" if kind == "bear" else "Cougar"
    zkey, skey = f"{sp}-zone-2025", f"{sp}-state-2025"
    zsid = src(zkey, f"Annual {'Bear' if kind == 'bear' else 'Cougar'} Mortality by Zone 2025-2026", 2025,
               notes=f"Tables 1-14 '{name} Mortality in New Mexico' by zone, 2012-2025 license years "
                     "(April 1 - March 31); dated 8/3/2026" + (" and 8/5/2026" if kind == "lion" else "") + ".",
               publisher=PUB_NEW)
    ssid = src(skey, f"Annual {'Bear' if kind == 'bear' else 'Cougar'} Mortality Statewide 2025-2026", 2025,
               notes=f"Table 1 'Annual {name} Mortality Statistics 2001-2025' (statewide).", publisher=PUB_NEW)
    zones = other.parse_mortality_zones(raw, zkey, kind)
    state = other.parse_mortality_statewide(raw, skey, kind)
    rows, names = [], {}
    for y in YEARS:
        tab = zones[y]
        for z in tab["rows"]:
            f_, m_, u_ = z["cells"][0:3]
            unit = f"Zone {z['zone']}"
            if z["zone"] == "N/A":
                if any(z["cells"][0:3]):
                    raise ValueError(f"{zkey} {y}: sport harvest in zone N/A")
                LOG.append(f"{zkey} {y}: row 'N/A / GMU {z['gmus']}' has no sport harvest (only other mortality) - not emitted")
                continue
            note = ["Sport harvest only (female + male + unknown sex); depredation"
                    + (", bighorn-sheep-protection removals" if kind == "lion" else "")
                    + " and road-kill/other mortality excluded"]
            if u_:
                note.append(f"{u_} of unknown sex")
            if f_ is None:
                note.append("female cell blank in the report (row total and the statewide female total are "
                            "consistent with 0); harvest = male + unknown")
                harvest = (m_ or 0) + (u_ or 0)
            else:
                harvest = f_ + m_ + u_
            rows.append({
                "species": sp, "year": y, "unit": unit, "unitName": f"GMUs {z['gmus']}",
                "method": "all", "hunters": None, "harvest": harvest,
                "harvestMale": m_, "harvestFemale": f_, "successPct": None,
                "note": "; ".join(note) + ".", "sourceId": zsid,
            })
            names[unit] = f"GMUs {z['gmus']}"
        if y in state:
            f_, m_, u_ = state[y]
            note = "Statewide sport harvest (female + male + unknown sex) from the statewide mortality table."
            zt = tab["total"][0:3]
            if zt != [f_, m_, u_]:
                note += (f" The by-zone table's statewide line for the same year reads female {zt[0]}, male {zt[1]}, "
                         f"unknown {zt[2]}.")
            rows.append({
                "species": sp, "year": y, "unit": "Statewide", "method": "all", "hunters": None,
                "harvest": f_ + m_ + u_, "harvestMale": m_, "harvestFemale": f_, "successPct": None,
                "note": note, "sourceId": ssid,
            })
    for r in rows:
        if r.get("harvestFemale") is None:
            r["harvestFemale"] = None
    return rows, names


def _key(r):
    return (r["year"], r["unit"], r.get("hunt") or "", r.get("method") or "", r.get("methodLabel") or "",
            r.get("sex") or "", r.get("residency") or "")


def dedupe_keys(sp, rows):
    """The agency occasionally lists one hunt code twice in a GMU (e.g. REG and YOUTH rows, or two private
    rows). Keep every published row and make the label distinguishable instead."""
    seen = {}
    for r in rows:
        k = _key(r)
        if k in seen:
            n = seen[k] + 1
            seen[k] = n
            r["methodLabel"] = f"{r.get('methodLabel', '')} (listing {n})".strip()
            r["note"] = (r.get("note", "") + " The report lists this hunt code more than once for this GMU and land "
                         "type; rows are kept as separate listings.").strip()
            LOG.append(f"{sp}: duplicate key {k} -> labelled listing {n}")
        else:
            seen[k] = 1


COVERAGE_NOTES = {
    "elk": (
        "2020-2025 license years from the NMDGF Elk Hunter Harvest Reports: one row per hunt code (public draw) and "
        "per private-land authorization line, plus the published GMU/herd-unit totals (method 'all') and the "
        "STATEWIDE TOTALS line. hunters is null: the report gives licenses sold and # hunters reporting, not an "
        "estimate of hunters afield; successPct is the agency's own success rate. harvest = estimated bulls + "
        "estimated cows (the report prints the two columns, not their sum). Average days hunted and satisfaction "
        "are not loaded (averages). GMU ids kept as the report prints them (16B/22, 29/30 [GMU 30 in 2020-2022], "
        "39/43 [GMU 43 in 2020-2022], 57/58); private rows carrying a sub-unit prefix (16B, 22, 29, 30, 39, 43, 55A, "
        "55B, 57, 58) use that sub-unit. The 2024-2025 'GMU 42/47/59' block repeats the private rows of GMUs 42, 47 "
        "and 59, so only its public hunt codes are loaded and its block total is omitted; the agency's statewide "
        "licenses line counts those rows twice. Not loaded: multi-GMU herd aggregates (Greater/Lesser Gila, region "
        "totals), Special Authorizations (auction/raffle/enhancement, statewide) and Population Management hunts, "
        "and a few hunts with no harvest report (Na). Hunt rows sum to the GMU totals within +/-2 animals (agency "
        "rounding); the STATEWIDE TOTALS harvest is the agency's own statewide estimate and does not equal the sum "
        "of GMU totals (e.g. 2025: statewide 7,644 bulls / 6,666 cows vs GMU sum 8,431 / 6,793)."
    ),
    "mule-deer": (
        "2020-2025 from the NMDGF Deer Harvest Reports. NMDGF does not split deer harvest by species: most licenses "
        "are FAD (fork-antlered deer, mule OR white-tailed), so this file holds every hunt that is not whitetail-only "
        "(bags FAD and FAMD) plus the published GMU totals and Statewide Totals, which cover ALL deer in the GMU "
        "including whitetail-only hunts. Hunt rows are split Public/Private land as printed (methodLabel); GMU 55 WMA "
        "/ Valle Vidal hunts show the area name instead. hunters = agency Estimated Hunters (2021-2025; the 2020 "
        "report has no such column, so hunters is null for 2020); harvest = estimated bucks + does; successPct as "
        "published (from license holders reporting they went afield). Named sub-areas are kept as their own units "
        "when the report totals them separately (23 Burros, 55 ES Barker / Urraca / Valle Vidal, 57 Sugarite in "
        "2024-2025); otherwise rows sit under the GMU total that covers them (e.g. 23 Burro Mountain / Excluding "
        "Burro Mountain under 23 in 2020-2023). Not loaded: Special Hunts (enhancement, premium statewide, auction "
        "tags) and hunt rows where nobody reported hunting (all cells N/A). Cross-check: GMU totals + Special Hunts "
        "equal the agency Statewide Totals licenses exactly in 2020, 2021 and 2024, and fall short by 61 (2022), "
        "3 (2023) and 72 (2025) licenses (agency figures)."
    ),
    "whitetail": (
        "2020-2025 hunt-code rows whose bag limit is white-tailed deer only (FAWTD fork-antlered whitetail, ESWTD "
        "either-sex whitetail), from the NMDGF Deer Harvest Reports. Many Coues whitetail are also taken on FAD "
        "(any fork-antlered deer) licenses, which are in mule-deer.json because the agency does not report species. "
        "There are no whitetail-only GMU totals: GMU totals in mule-deer.json include these hunts."
    ),
    "pronghorn": (
        "2020 and 2022-2025 hunt-code rows (Public/Private land as printed) plus published GMU-group totals and "
        "Statewide Totals from the NMDGF Pronghorn Harvest Reports; units are the agency's GMU groups exactly as "
        "printed ('2, 7, 9, 10', '25, 26, 27'). hunters = Estimated Hunters only in 2024-2025 (older reports have no "
        "such column). The 2020 report also lists ANT-1-600 / 'Unit NN' private (ranch) licenses inside GMU "
        "groups; they are kept. Not loaded: special-hunt blocks (PCRP, ranch-wide, enhancement, auction, Melrose "
        "AFR, female-immature) which are not reported by GMU. 2021: NMDGF lists no 2021-22 pronghorn harvest report; "
        "only a statewide row (6,857 licenses, 4,655 bucks, 282 does, 70% reported success) quoted in the agency's "
        "2023-2024 Pronghorn Hunting Forecast is included. The file titled '2023-2023' is the agency's 2022-2023 "
        "report (listed as such)."
    ),
    "sheep": (
        "2020 and 2022-2025 from the NMDGF Bighorn Sheep Harvest Results (Rocky Mountain and desert bighorn "
        "combined; the agency reports by statewide hunt code, not by GMU, so unit is 'Statewide', or the Pecos / Rio "
        "Grande Gorge area breakdown printed under the 2020 and 2022 ewe hunts). Hunt codes normalized to the "
        "BHS-1-201 form (some years print 'BHS 1-201'). Public, private-land, auction and raffle licenses are "
        "separate rows (methodLabel). hunters null (only # sold / # reporting printed); success rate applies to "
        "hunters that went afield. No 2021-2022 bighorn harvest report is listed by NMDGF."
    ),
    "bear": (
        "2020-2025 license years (April 1 - March 31) by bear management zone from the 2025-2026 'Annual Bear "
        "Mortality by Zone' tables, plus a statewide row per year from the statewide mortality table. harvest = "
        "SPORT harvest only (female + male + unknown sex); depredation and road-kill/other deaths are excluded. "
        "Zone boundaries changed in 2024 (zone 7 merged into zones 5 and 6): each row's unitName gives that year's "
        "GMU list. NMDGF does not publish bear hunter numbers or success by zone, so hunters and successPct are null. "
        "Zone sums equal the published statewide line for every year."
    ),
    "lion": (
        "2020-2025 license years by cougar zone (A-S) from the 2025-2026 'Annual Cougar Mortality by Zone' tables, "
        "plus a statewide row per year from the statewide table. harvest = SPORT harvest only (female + male + "
        "unknown); depredation, road-kill/other and bighorn-sheep-protection removals are excluded. No hunter or "
        "success figures are published by zone. Cross-check: zone sums match the statewide line in every year "
        "except 2020-21, where the statewide table shows 150 males vs 149 in the zone table (noted on that row)."
    ),
    "turkey": (
        "2020-2025 spring and fall seasons (methodLabel) from the NMDGF Turkey Harvest Results. GMU rows are "
        "REPORTED counts from mandatory harvest reports (not expanded): hunters, total days hunted, harvest and the "
        "agency success rate (spring = success on first turkey; spring harvest includes second birds); fall rows "
        "add hens (harvestFemale) and gobblers (harvestMale). GMU hunter counts can add up to more than the "
        "agency's TOTAL line (hunters who hunted several GMUs); GMU harvest sums equal the TOTAL line in every "
        "year. One 'Statewide' row per season gives licenses sold, estimated hunters and estimated harvest stated "
        "in that year's report text (expanded to non-reporting license holders). GMUs flagged * (Reservation) or ** "
        "(closed season) are kept with the agency's caveat in the note. Note: the 2025 report's Table 1 revises some "
        "earlier estimates (e.g. 2023 fall harvest 983 vs 1,003 in the 2023 report); each year uses its own report."
    ),
}


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: harvest_build.py <raw_dir>")
    raw = sys.argv[1]
    os.makedirs(os.path.join(OUT, "harvest"), exist_ok=True)
    files = {}
    files["elk"], elk_names = build_elk(raw)
    files["mule-deer"], files["whitetail"] = build_deer(raw)
    files["pronghorn"] = build_pronghorn(raw)
    files["sheep"] = build_sheep(raw)
    files["turkey"] = build_turkey(raw)
    files["bear"], bear_names = build_mortality(raw, "bear")
    files["lion"], lion_names = build_mortality(raw, "lion")
    for sp, rows in files.items():
        dedupe_keys(sp, rows)
        rows.sort(key=lambda r: (-r["year"], r["unit"] == "Statewide", r["unit"], r.get("hunt") or "",
                                 r.get("methodLabel") or ""))
        write_json(os.path.join(OUT, "harvest", f"{sp}.json"), rows)
        print(f"{sp}: {len(rows)} rows")
    meta_path = os.path.join(OUT, "harvest-meta.json")
    coverage = []
    for sp in ("elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "lion", "turkey"):
        coverage.append({"species": sp, "years": sorted({r["year"] for r in files[sp]}),
                         "notes": COVERAGE_NOTES[sp]})
    write_json(meta_path, {
        "unitNames": {"elk": elk_names, "bear": bear_names, "lion": lion_names},
        "coverage": coverage,
        "sources": SOURCES,
    })
    with open(os.path.join(raw, "build-log.txt"), "w") as f:
        f.write("\n".join(LOG) + "\n")
    print(f"{len(SOURCES)} sources; {len(LOG)} log lines -> {os.path.join(raw, 'build-log.txt')}")


if __name__ == "__main__":
    main()
