#!/usr/bin/env python3
"""Final step of the Wyoming harvest build: one unit name per hunt area, sources[] and
coverage[] -> src/data/agency/wyoming/harvest-meta.json.

Run order (from the repo root, raw dir outside the repo):
  python -I scripts/agency/wyoming/harvest_download.py  <raw>
  python -I scripts/agency/wyoming/harvest_biggame.py   <raw> src/data/agency/wyoming/harvest
  python -I scripts/agency/wyoming/harvest_smallgame.py <raw> src/data/agency/wyoming/harvest
  python -I scripts/agency/wyoming/harvest_bearlion.py  <raw> src/data/agency/wyoming/harvest
  python -I scripts/agency/wyoming/harvest_turkey.py    <raw> src/data/agency/wyoming/harvest
  python -I scripts/agency/wyoming/harvest_meta.py      <raw> src/data/agency/wyoming
  node scripts/agency/validate.mjs wyoming --part harvest

Unit names: WGFD prints hunt-area names in every report, sometimes in capitals, sometimes with a
typo or footnote letter in a single year.  The name used is the spelling printed in the most
reports (ties -> latest report), shown in the mixed-case form WGFD itself uses where available.
Every row's unitName is set to that name.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

RETRIEVED = "2026-10-31"
INDEX = "https://wgfd.wyo.gov/hunting-trapping/harvest-reports-surveys"
SPECIES_FILES = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "bear", "lion", "turkey"]

# report key -> (display name used on the WGFD index page, species files fed by it)
REPORT_KEYS = {
    "elk": ("Elk", ["elk"]),
    "deer": ("Deer (mule deer & white-tailed deer)", ["mule-deer", "whitetail"]),
    "pronghorn": ("Antelope (pronghorn)", ["pronghorn"]),
    "moose": ("Moose", ["moose"]),
    "sheep": ("Bighorn sheep", ["sheep"]),
    "goat": ("Mountain goat", ["goat"]),
    "bear": ("Black bear", ["bear"]),
    "lion": ("Mountain lion", ["lion"]),
    "turkey": ("Wild turkey", ["turkey"]),
}

# Single deliberate exception to the "most-printed spelling" rule (see docstring).
NAME_OVERRIDES = {
    "bear": {"5": "Upper Nowood"},  # 2025 report spelling (Nowood River); 2020-2024 print "UPPER NORWOOD"
}


COVERAGE_NOTES = {
    "elk": "All figures are WGFD estimates from its voluntary hunter harvest survey, copied as printed. Per hunt area: one row per license type (hunt = WGFD type number, or 'General'; methodLabel keeps the printed label, e.g. 'Limited 1', 'Full 1', 'Reduced 6', 'D/F Type 7'), plus pooled Total / Resident / Nonresident rows (method 'all'), plus harvest by weapon (method 'archery', or 'other' = WGFD 'Firearm'), for which WGFD publishes harvest only, not hunters. For license-type rows 'hunters' = active licenses and 'licenses' = licenses sold incl. cross-area licenses; pooled rows count active hunters, so type rows need not add up to the pooled row (some hunters hold several licenses). Bull / spike / cow / calf ('Bull' = branch-antlered adult male, excludes spikes) counts are in each row's note. Cross-check: the sum of hunt-area totals equals WGFD's published statewide total harvest in every year (2020 26,491; 2021 24,333; 2022 27,011; 2023 28,353; 2024 30,744; 2025 30,568). Where WGFD printed hunter success above 100%, successPct is null and the printed value is in the note. Herd-unit, nonresident-region, confidence-interval and survey-response tables are not imported. 2025 Hunt Area 77 (National Elk Refuge) also lists 'Other' license rows (WGFD: licenses issued for other areas); they are kept with hunt '<type> (Other)'.",
    "mule-deer": "All figures are WGFD estimates from its voluntary hunter harvest survey, copied as printed. Per hunt area: one row per license type (hunt = WGFD type number, or 'General'; methodLabel keeps the printed label, e.g. 'Limited 1', 'Full 1', 'Reduced 6', 'D/F Type 7'), plus pooled Total / Resident / Nonresident rows (method 'all'), plus harvest by weapon (method 'archery', or 'other' = WGFD 'Firearm'), for which WGFD publishes harvest only, not hunters. For license-type rows 'hunters' = active licenses and 'licenses' = licenses sold incl. cross-area licenses; pooled rows count active hunters, so type rows need not add up to the pooled row (some hunters hold several licenses). Buck / doe / fawn counts are in each row's note. Cross-check: the sum of hunt-area totals equals WGFD's published statewide total harvest in every year (2020 21,370; 2021 18,944; 2022 17,785; 2023 13,572; 2024 15,004; 2025 16,688). Where WGFD printed hunter success above 100%, successPct is null and the printed value is in the note. Herd-unit, nonresident-region, confidence-interval and survey-response tables are not imported. Printed anomalies kept as published and flagged in the row note: 2021 HA 35 weapon table (classes do not add to total), 2024 HA 146 pooled nonresident fawn = 170 with total 5. In 2023 the weapon tables for HA 97, 139 and 144 differ by 1 from the hunt-area totals (WGFD footnote: summed values may not match other tables due to rounding). The 2024 report prints a stray copy of HA 131's last row beside the HA 132 heading; it was ignored.",
    "whitetail": "All figures are WGFD estimates from its voluntary hunter harvest survey, copied as printed. Per hunt area: one row per license type (hunt = WGFD type number, or 'General'; methodLabel keeps the printed label, e.g. 'Limited 1', 'Full 1', 'Reduced 6', 'D/F Type 7'), plus pooled Total / Resident / Nonresident rows (method 'all'), plus harvest by weapon (method 'archery', or 'other' = WGFD 'Firearm'), for which WGFD publishes harvest only, not hunters. For license-type rows 'hunters' = active licenses and 'licenses' = licenses sold incl. cross-area licenses; pooled rows count active hunters, so type rows need not add up to the pooled row (some hunters hold several licenses). Buck / doe / fawn counts are in each row's note. Cross-check: the sum of hunt-area totals equals WGFD's published statewide total harvest in every year (2020 19,904; 2021 16,117; 2022 11,530; 2023 10,844; 2024 11,633; 2025 10,258). Where WGFD printed hunter success above 100%, successPct is null and the printed value is in the note. Herd-unit, nonresident-region, confidence-interval and survey-response tables are not imported. In 2023 the weapon tables for HA 25, 31 and 59 differ by 1 from the hunt-area totals (WGFD rounding note).",
    "pronghorn": "All figures are WGFD estimates from its voluntary hunter harvest survey, copied as printed. Per hunt area: one row per license type (hunt = WGFD type number, or 'General'; methodLabel keeps the printed label, e.g. 'Limited 1', 'Full 1', 'Reduced 6', 'D/F Type 7'), plus pooled Total / Resident / Nonresident rows (method 'all'), plus harvest by weapon (method 'archery', or 'other' = WGFD 'Firearm'), for which WGFD publishes harvest only, not hunters. For license-type rows 'hunters' = active licenses and 'licenses' = licenses sold incl. cross-area licenses; pooled rows count active hunters, so type rows need not add up to the pooled row (some hunters hold several licenses). Buck / doe / fawn (WGFD calls the species antelope) counts are in each row's note. Cross-check: the sum of hunt-area totals equals WGFD's published statewide total harvest in every year (2020 40,410; 2021 31,965; 2022 28,254; 2023 21,228; 2024 22,218; 2025 22,766). Where WGFD printed hunter success above 100%, successPct is null and the printed value is in the note. Herd-unit, nonresident-region, confidence-interval and survey-response tables are not imported. 2023 HA 79 weapon table differs by 1 from the hunt-area total.",
    "moose": "WGFD survey estimates, copied as printed. Per hunt area one row per license type x residency (hunt = printed type number; licenses = valid licenses) plus an area total row (method 'all'). Bull / cow / calf counts are in the note. Sum of area totals equals WGFD's statewide harvest every year (2020 310; 2021 329; 2022 334; 2023 331; 2024 317; 2025 338). Areas WGFD printed as closed or with no activity reported (e.g. 7, 8, 14, 15, 19, 32 in 2020-2023) have no rows. WGFD's per-row license-accounting notes (carry-in / carry-out, donor / donee, Governor's, Supertag, Trifecta licenses) are not reproduced. 2021 and 2022 HA 34 bull/cow/calf as printed do not add to the published total (flagged). 2021 report footnote: three Governor's licenses with unknown hunt area are not in the hunt-area table. Herd-unit tables not imported.",
    "sheep": "Bighorn sheep, WGFD survey estimates copied as printed. Per hunt area one row per license type x residency plus an area total row (method 'all'); ram / ewe / lamb in the note. Sum of area totals equals WGFD's statewide harvest every year (2020 132; 2021 148; 2022 162; 2023 182; 2024 185; 2025 242). HA 21 was printed as closed in 2020 and 2022. 2020 report footnote: license holders who did not respond to the survey are assumed to have hunted but not harvested. Hunt-area names use the spelling WGFD printed in most years (the 2025 report misspells several, e.g. 'Wapati Ridge', 'Big Piiney'). License-accounting notes (carry-in/out, donor/donee, Governor's, Supertag, Trifecta) and herd-unit tables are not reproduced.",
    "goat": "Mountain goat, WGFD survey estimates copied as printed. Per hunt area one row per license type x residency (types printed as 1, 2 or A) plus an area total row; billy / nanny (and kid from 2024) in the note. Sum of area totals equals WGFD's statewide harvest every year (2020 56; 2021 40; 2022 43; 2023 39; 2024 35; 2025 27). Hunt areas 4 and 5 drop out of later reports. Herd-unit tables and license-accounting notes not reproduced.",
    "bear": "Black bear, WGFD survey estimates copied as printed. Per hunt area and residency (resident / nonresident / all) three rows: 'Spring season', 'Fall season' and 'Annual (spring + fall)' (method 'all'). WGFD publishes hunter success only for the annual figure; spring/fall success is harvest/hunters (1 decimal, successComputed true) except on the spring/fall 'all' rows, where success and male/female harvest come from WGFD's spring/fall harvest-by-management-unit tables (used only when that table's hunters, days and harvest match the hunt-area table and female + male = total; 7 of 408 season rows lack the split for that reason). Annual hunters are unique hunters, so they are not spring + fall. Sum of annual area totals equals WGFD's statewide harvest every year (2020 537; 2021 563; 2022 526; 2023 582; 2024 631; 2025 656). 2020 HA 15 and 29 (fall and annual): resident + nonresident as printed do not add to the total (flagged). Female mortality limits per management unit are not imported.",
    "lion": "Mountain lion. Year = start of the WGFD harvest year: fall (Sep 1 - Dec 31) of that year plus spring (Jan 1 - Mar 31 / Aug 31) of the next year. Per hunt area and residency three rows: 'Fall season', 'Spring season', 'Annual (spring + fall)' (method 'all', WGFD success; fall/spring success computed). Harvest is lions registered with WGFD; hunters and days come from WGFD's hunter survey, so a few rows show harvest with zero or fewer hunters (WGFD lists these cases in a note under each table). Mortality limits from WGFD's management-unit table are in the annual total row note. Sum of annual area totals equals WGFD's statewide harvest (2021 323; 2022 317; 2023 340; 2024 354; 2025 277). 2025: WGFD totals include illegally harvested lions, which are not assigned a residency (flagged where resident + nonresident differs from total). 2020 not delivered: the file labelled '2020-2021' (wgfd.wyo.gov/media/22073) carries the figures WGFD's later ten-year tables assign to the 2019 season (345 lions) rather than 2020 (391).",
    "turkey": "Wild turkey, WGFD survey estimates copied as printed. Year = calendar year of the season: each WGFD report covers fall Y and spring Y+1 (fall 2020-2025 and spring 2022-2026 delivered). Rows per area: one per license type x residency (hunt 'General' or type number) and an area total (method 'all'); tom / hen in the note. Units: hunt areas 1-5 through spring 2024; from fall 2024 WGFD reports named management areas (unit = area name, counties in unitName), so the two series are not comparable. Area totals match WGFD statewide season totals within 1 (rounding). Not delivered: spring 2021 (the 2020-2021 report's spring section repeats fall-like figures and contradicts the spring 2021 total in later WGFD ten-year tables). The 2024-2025 report prints the spring 2025 table twice with two residency rows swapped; the first copy (which matches WGFD's statewide resident/nonresident totals) is used."
}


def smart_title(s):
    if not s.isupper():
        return s

    def cap(word):
        return re.sub(r"[A-Za-z][A-Za-z’']*", lambda m: m.group(0)[0].upper() + m.group(0)[1:].lower(), word)

    return " ".join(cap(w) for w in s.split())


def canonical_names(rows):
    by_unit = defaultdict(list)
    for r in rows:
        if r.get("unitName"):
            by_unit[r["unit"]].append((r["year"], r["unitName"]))
    out = {}
    for unit, names in by_unit.items():
        per_year = {}
        for y, n in names:
            per_year[y] = n
        key = lambda n: re.sub(r"[^a-z]", "", n.lower().replace("’", "'"))
        cnt = Counter(key(n) for n in per_year.values())
        best_k = max(cnt, key=lambda k: (cnt[k], max(y for y, n in per_year.items() if key(n) == k)))
        variants = sorted([(y, n) for y, n in per_year.items() if key(n) == best_k], reverse=True)
        mixed = [n for y, n in variants if not n.isupper()]
        out[unit] = mixed[0] if mixed else smart_title(variants[0][1])
    return out


def main():
    raw, outdir = sys.argv[1], sys.argv[2]
    hdir = os.path.join(outdir, "harvest")
    unit_names, coverage_years, used_sources = {}, {}, set()
    for sp in SPECIES_FILES:
        p = os.path.join(hdir, f"{sp}.json")
        rows = json.load(open(p))
        names = canonical_names(rows)
        names.update(NAME_OVERRIDES.get(sp, {}))
        for r in rows:
            if r["unit"] in names:
                r["unitName"] = names[r["unit"]]
            used_sources.add(r["sourceId"])
        with open(p, "w") as f:
            json.dump(rows, f, indent=0, separators=(",", ":"))
            f.write("\n")
        unit_names[sp] = dict(sorted(names.items(), key=lambda kv: (not kv[0].isdigit(), int(kv[0]) if kv[0].isdigit() else 0, kv[0])))
        coverage_years[sp] = sorted({r["year"] for r in rows})
        print(sp, len(rows), "rows", coverage_years[sp], f"{os.path.getsize(p) / 1e6:.2f} MB")

    sources = []
    for hdr in sorted(f for f in os.listdir(raw) if f.endswith(".hdr.txt")):
        key, year = hdr[:-8].rsplit("_", 1)
        year = int(year)
        sid = f"h-{key}-{year}"
        if sid not in used_sources:
            continue
        meta = dict(l.split(": ", 1) for l in open(os.path.join(raw, hdr)).read().splitlines() if ": " in l)
        fname = re.search(r'filename="?([^"]+)"?', meta.get("content-disposition", "") or "")
        fname = fname.group(1) if fname else None
        label, _ = REPORT_KEYS[key]
        season = f"{year}-{year + 1}" if key in ("turkey", "lion") else str(year)
        src = {
            "id": sid,
            "title": f"{label} {season} harvest report",
            "publisher": "Wyoming Game and Fish Department" + (" and Wyoming Survey & Analysis Center (University of Wyoming)" if (year >= 2024) else ""),
            "url": meta["url"],
            "dataYear": year,
            "retrieved": RETRIEVED,
        }
        notes = []
        if year >= 2021:
            src["pageUrl"] = INDEX
        else:
            notes.append("2020 report is no longer linked from the WGFD harvest-reports page; file found on wgfd.wyo.gov")
        if fname:
            notes.append(f"WGFD file name: {fname}")
        notes.append("Estimates from WGFD's voluntary hunter harvest survey" if key not in ("lion",) else
                     "Harvest = lions registered with WGFD (mandatory); hunters and days from WGFD's hunter survey")
        if key == "turkey":
            notes.append(f"Covers fall {year} and spring {year + 1}")
        if key == "lion":
            notes.append(f"Harvest year: fall (Sep 1 - Dec 31) {year} and spring {year + 1}")
        src["notes"] = "; ".join(notes)
        sources.append(src)
    sources.sort(key=lambda s: (list(REPORT_KEYS).index(s["id"].split("-")[1]), s["dataYear"]))

    coverage = [{"species": sp, "years": coverage_years[sp], "notes": COVERAGE_NOTES[sp]} for sp in SPECIES_FILES]
    meta = {"unitNames": unit_names, "coverage": coverage, "sources": sources}
    with open(os.path.join(outdir, "harvest-meta.json"), "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("sources", len(sources))


if __name__ == "__main__":
    main()
