#!/usr/bin/env python3
"""Parse KDWP harvest reports (pdftotext -layout output) into HuntScout Pro JSON.

Inputs: the .txt files written by harvest_fetch.py.
Outputs (repo-relative, under <repo>/src/data/agency/kansas/):
  harvest/whitetail.json, harvest/mule-deer.json, harvest/elk.json,
  harvest/pronghorn.json, harvest/turkey.json, harvest-meta.json

Usage:
  python -I scripts/agency/kansas/harvest_parse.py <raw_dir> <repo_root>

What KDWP publishes (and therefore what this emits):
  Deer 2020-21, 2021-22: full report. Table 1 = statewide harvest by permit type,
    species, sex and age (permits issued, % active, hunter success).
    Appendix 1 = the same species/sex/age harvest for each of the 19 Deer
    Management Units, by permit type. No hunters or success by unit.
  Deer 2022-23, 2023-24: only the statewide Table 1 was published.
  Elk / pronghorn: statewide numbers stated in report text; unit results only
    appear as charts without numbers, so they are not emitted.
  Spring turkey: Table 2 (statewide permits, harvest, success; fall season too)
    and Table 3 (resident hunter success by turkey unit) from the latest report,
    plus the active-hunter estimate stated in each year's report text.
Nothing is estimated. Where a species total is the sum of published columns
(e.g. whitetail harvest = antlered + antlerless), the note says so.
"""
import json
import os
import re
import sys

RETRIEVED = "2026-10-31"
PUB = "Kansas Department of Wildlife and Parks"
DOC = "https://www.ksoutdoors.gov/home/showpublisheddocument/"
RESEARCH = "https://www.ksoutdoors.gov/programs-services/research"
TURKEY_PAGE = "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/turkey"
LIB_NOTE = ("Served from the KDWP document library on ksoutdoors.gov; the big-game section of the "
            "current Research page reads 'Coming soon', so this report is not linked there.")

SOURCES = {
    "h-kdwp-deer-2020-21": dict(title="2020-21 Kansas Deer Harvest Report", url=DOC + "1374", dataYear=2020, notes=LIB_NOTE),
    "h-kdwp-deer-2021-22": dict(title="2021-22 Kansas Deer Harvest Report", url=DOC + "1376", dataYear=2021, notes=LIB_NOTE),
    "h-kdwp-deer-2022-23": dict(title="2022-23 Kansas Deer Harvest Table", url=DOC + "1378", dataYear=2022,
                                notes="Statewide table only; no unit-level appendix was published for this season. " + LIB_NOTE),
    "h-kdwp-deer-2023-24": dict(title="2023-24 Kansas Deer Harvest Table", url=DOC + "1380", dataYear=2023,
                                notes="Statewide table only; no unit-level appendix was published for this season. " + LIB_NOTE),
    "h-kdwp-elk-2020-21": dict(title="2020-21 Kansas Elk Harvest Report", url=DOC + "1388", dataYear=2020, notes=LIB_NOTE),
    "h-kdwp-elk-2021-22": dict(title="2021-22 Kansas Elk Harvest Report", url=DOC + "1390", dataYear=2021, notes=LIB_NOTE),
    "h-kdwp-elk-2022-23": dict(title="2022-23 Kansas Elk Harvest Report", url=DOC + "1392", dataYear=2022, notes=LIB_NOTE),
    "h-kdwp-elk-2023-24": dict(title="2023-24 Kansas Elk Harvest Report", url=DOC + "1394", dataYear=2023, notes=LIB_NOTE),
    "h-kdwp-elk-2024-25": dict(title="2024-25 Kansas Elk Harvest Report", url=DOC + "1396", dataYear=2024, notes=LIB_NOTE),
    "h-kdwp-pronghorn-2020": dict(title="2020 Kansas Pronghorn Harvest Report", url=DOC + "952", dataYear=2020, notes=LIB_NOTE),
    "h-kdwp-pronghorn-2021": dict(title="2021 Kansas Pronghorn Harvest Report", url=DOC + "956", dataYear=2021, notes=LIB_NOTE),
    "h-kdwp-pronghorn-2022": dict(title="2022 Kansas Pronghorn Harvest Report", url=DOC + "962", dataYear=2022, notes=LIB_NOTE),
    "h-kdwp-pronghorn-2023": dict(title="2023 Kansas Pronghorn Harvest Report", url=DOC + "964", dataYear=2023, notes=LIB_NOTE),
    "h-kdwp-pronghorn-2024": dict(title="2024 Kansas Pronghorn Harvest Report", url=DOC + "968", dataYear=2024, notes=LIB_NOTE),
    "h-kdwp-turkey-2024": dict(title="Spring Turkey Harvest Report - 2024", url=DOC + "2208/639045894482030000", pageUrl=RESEARCH, dataYear=2024),
    "h-kdwp-turkey-2025": dict(title="Spring Turkey Harvest Report - 2025", url=DOC + "2210/639045894484500000", pageUrl=RESEARCH, dataYear=2025),
    "h-kdwp-turkey-2026": dict(title="Spring Turkey Harvest Report - 2026", url=DOC + "2508/639232536438570000", pageUrl=RESEARCH, dataYear=2026,
                               notes="Prepared August 2026. Tables 2 and 3 carry KDWP's current (revised) figures for 2019-2026."),
}

NUM = r"-?[\d,]+(?:\.\d+)?%?"


def num(s):
    s = s.replace(",", "").rstrip("%")
    return float(s) if "." in s else int(s)


def read(raw, name):
    with open(os.path.join(raw, name + ".txt"), encoding="utf-8") as f:
        return f.read()


def flat(text):
    return re.sub(r"\s+", " ", text)


# ---------------------------------------------------------------- deer tables
SUMMARY = {"Resident", "Nonresident", "Total"}


def parse_rows(lines, ncols):
    """Yield (label, [numbers]) for table rows with exactly ncols trailing numbers.

    Long permit-type labels wrap: a text-only prefix line, the number line with no
    label, then a text-only suffix line. Rows must sit inside one table section.
    """
    row_re = re.compile(r"^\s*(.*?)\s*((?:" + NUM + r"\s+){" + str(ncols - 1) + r"}" + NUM + r")\s*$")
    rows = []
    prefix = None
    want_suffix = False
    for ln in lines:
        if not ln.strip():
            continue
        m = row_re.match(ln)
        if m and not re.search(r"[A-Za-z]", m.group(2)):
            label = m.group(1).strip()
            vals = [num(v) for v in m.group(2).split()]
            if label:
                rows.append([label, vals])
                want_suffix = False
            else:
                if prefix is None:
                    raise ValueError(f"number row without label: {ln!r}")
                rows.append([prefix, vals])
                want_suffix = True
            prefix = None
            continue
        t = ln.strip()
        if want_suffix:
            rows[-1][0] = (rows[-1][0] + " " + t).strip()
            want_suffix = False
        else:
            prefix = t
    for r in rows:
        r[0] = re.sub(r"\s+", " ", r[0])
    return rows


def method_of(label):
    if label in SUMMARY:
        return "all", "All permit types"
    if "Archery" in label:
        return "archery", label
    if "Muzzleloader" in label:
        return "muzzleloader", label
    return None, label


def assign_residency(rows, where):
    """Resident permit classes come first, ending with 'WTAO, Gen Res + Youth'."""
    out, res = [], "resident"
    for label, vals in rows:
        if label in SUMMARY:
            out.append((label, vals, {"Resident": "resident", "Nonresident": "nonresident", "Total": "all"}[label]))
            continue
        out.append((label, vals, res))
        if label.startswith("WTAO, Gen Res"):
            res = "nonresident"
    labels = [r[0] for r in rows]
    if labels[-3:] != ["Resident", "Nonresident", "Total"]:
        raise ValueError(f"{where}: summary rows missing: {labels[-3:]}")
    return out


def check_sums(rows, idx, where, tol):
    """Resident/nonresident class rows must add up to the published summary rows."""
    for col in idx:
        for cls in ("resident", "nonresident"):
            s = sum(v[col] for l, v, r in rows if r == cls and l not in SUMMARY)
            pub = next(v[col] for l, v, r in rows if l == cls.capitalize())
            if abs(s - pub) > tol:
                raise ValueError(f"{where}: col {col} {cls} sum {s} != published {pub}")
        tot = next(v[col] for l, v, r in rows if l == "Total")
        rs = next(v[col] for l, v, r in rows if l == "Resident") + next(v[col] for l, v, r in rows if l == "Nonresident")
        if abs(rs - tot) > tol:
            raise ValueError(f"{where}: col {col} resident+nonresident {rs} != total {tot}")


WT_ONLY = re.compile(r"Whitetail|WTAO")


def species_parts(vals, species):
    """vals = antlered buck, adult doe, shed buck, male fawn, female fawn for one species."""
    ab, ad, sb, mf, ff = vals
    return dict(harvest=ab + ad + sb + mf + ff, harvestMale=ab + sb + mf, harvestFemale=ad + ff,
                parts=f"antlered bucks {ab}, adult does {ad}, shed-antler bucks {sb}, male fawns {mf}, female fawns {ff}")


def parse_table1(text, year):
    start = text.index("Kansas state-wide deer harvest by species, sex, and age")
    lines = text[start:].splitlines()[1:]
    cut = next(i for i, l in enumerate(lines) if re.match(r"^\s*Total\s+[\d,]", l))
    rows = parse_rows(lines[: cut + 1], 18)
    rows = assign_residency(rows, f"deer table1 {year}")
    for l, v, r in rows:
        wt = v[3:8]
        md = v[9:14]
        if sum(wt[1:]) != v[8] or sum(md[1:]) != v[14]:
            raise ValueError(f"table1 {year} {l}: antlerless totals do not add up")
        if abs(v[3] + v[8] + v[9] + v[14] - v[17]) > 2:
            raise ValueError(f"table1 {year} {l}: species sum {v[3] + v[8] + v[9] + v[14]} != total {v[17]}")
    check_sums(rows, [0, 3, 4, 8, 9, 14, 17], f"table1 {year}", tol=3)
    return rows


def table1_records(rows, year, source):
    recs = {"whitetail": [], "mule-deer": []}
    for label, v, res in rows:
        method, mlabel = method_of(label)
        base = dict(year=year, unit="Statewide", methodLabel=mlabel, residency=res,
                    hunters=None, licenses=v[0], successPct=v[2], sourceId=source)
        if method:
            base["method"] = method
        common = (f"Permits issued {v[0]:,}; {v[1]}% of permit holders hunted; hunter success {v[2]}% is published "
                  f"per permit type for deer of either species (not species-specific). All-deer harvest on these "
                  f"permits: {v[17]:,}.")
        for sp, sl, antl in (("whitetail", slice(3, 8), 8), ("mule-deer", slice(9, 14), 14)):
            if sp == "mule-deer" and WT_ONLY.search(label) and not any(v[9:15]):
                continue
            p = species_parts(v[sl], sp)
            r = dict(species=sp, **base)
            r["harvest"] = p["harvest"]
            r["harvestMale"] = p["harvestMale"]
            r["harvestFemale"] = p["harvestFemale"]
            r["note"] = (f"{'Whitetail' if sp == 'whitetail' else 'Mule deer'} harvest = antlered {v[sl.start]:,} + "
                         f"total antlerless {v[antl]:,} as published ({p['parts']}). " + common)
            recs[sp].append(r)
    return recs


UNIT19_NOTE = ("KDWP: DMU 19 deer harvest data only estimates antlerless deer harvested using a hunter's second to fifth "
               "antlerless permit; other harvest in DMU 19 is counted in the original DMU (typically 10, also 9, 11 or 14).")


def parse_appendix(text, year, source):
    start = text.index("Appendix 1. KS Deer Harvest by Species, Sex, and Age for Each Deer")
    app = text[start:]
    heads = list(re.finditer(r"^\s*Deer Management Unit (\d{2})(a?)\s*$", app, re.M))
    if len(heads) != 19:
        raise ValueError(f"appendix {year}: found {len(heads)} unit tables")
    recs = {"whitetail": [], "mule-deer": []}
    units = []
    for i, h in enumerate(heads):
        unit = h.group(1)
        units.append(unit)
        seg = app[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(app)]
        lines = seg.splitlines()
        cut = next(j for j, l in enumerate(lines) if re.match(r"^\s*Total\s+\d", l))
        rows = parse_rows(lines[: cut + 1], 11)
        rows = assign_residency(rows, f"appendix {year} DMU {unit}")
        for l, v, r in rows:
            if sum(v[:10]) != v[10]:
                raise ValueError(f"appendix {year} DMU {unit} {l}: columns sum {sum(v[:10])} != total {v[10]}")
        check_sums(rows, list(range(11)), f"appendix {year} DMU {unit}", tol=0)
        for label, v, res in rows:
            method, mlabel = method_of(label)
            for sp, sl in (("whitetail", slice(0, 5)), ("mule-deer", slice(5, 10))):
                if sp == "mule-deer" and WT_ONLY.search(label) and not any(v[5:10]):
                    continue
                p = species_parts(v[sl], sp)
                r = dict(species=sp, year=year, unit=unit, methodLabel=mlabel, residency=res,
                         hunters=None, harvest=p["harvest"], harvestMale=p["harvestMale"],
                         harvestFemale=p["harvestFemale"], successPct=None, sourceId=source)
                if method:
                    r["method"] = method
                note = (f"Estimated harvest from the post-season survey; sum of published columns ({p['parts']}). "
                        f"All-deer total for this row: {v[10]}. KDWP does not publish hunters or success by unit.")
                if unit == "19":
                    note += " " + UNIT19_NOTE
                r["note"] = note
                recs[sp].append(r)
    return recs, units


# ---------------------------------------------------------------- elk
WORDS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
WORDS.update({"twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-four": 24, "twenty-five": 25, "twenty-six": 26,
              "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29, "thirty": 30, "thirty-one": 31, "thirty-two": 32,
              "thirty-three": 33, "thirty-four": 34, "thirty-five": 35, "thirty-six": 36, "thirty-seven": 37})


def wnum(s):
    s = s.strip().lower()
    return int(s) if s.isdigit() else WORDS[s]


W = r"([A-Za-z-]+|\d+)"


def parse_elk(text, year, source):
    t = flat(text)
    permits = int(re.search(r"Hunters purchased (\d+) elk permits for the %d season" % year, t).group(1))
    m = re.search(r"The reported harvest was (\d+) elk \(Figure 3\), including (\d+) elk taken on (\d+) any-elk permits "
                  r"\((\d+)%\) and (\d+) taken on (\d+) antlerless-only elk permits \((\d+)%\)", t)
    total, ae_h, ae_p, ae_s, ao_h, ao_p, ao_s = (int(x) for x in m.groups())
    antlered = wnum(re.search(W + r" of the %d elk taken on any-elk permits were antlered" % ae_h, t).group(1))
    tps = int(re.search(r"Total permit success was (\d+)%", t).group(1))
    fr = re.search(W + r" of (\d+) hunters \((\d+)%\) with Fort Riley any-elk permits and " + W +
                   r" of (\d+) hunters \((\d+)%\) with Fort Riley antlerless-only elk permits harvested elk", t)
    fa_h, fa_n, fa_s = wnum(fr.group(1)), int(fr.group(2)), int(fr.group(3))
    fo_h, fo_n, fo_s = wnum(fr.group(4)), int(fr.group(5)), int(fr.group(6))
    rr = re.search(r"harvest survey response rate was (\d+)%", t).group(1)
    county = re.search(r"(Hunters provided county of harvest for .*?\.) In the last five years", t).group(1)
    exp = re.search(r"Expanding respondent success rates to nonrespondents yields an additional harvest of (\d+) elk", t)
    rep = (f"Reported harvest (survey response rate {rr}%); KDWP does not correct for nonrespondents"
           + (f" - it states that expanding respondent success to nonrespondents would add {exp.group(1)} elk" if exp else "")
           + ". Success is per permit, not per active hunter.")
    rows = []
    any_note = f"Any-elk permits (all units, including Fort Riley). {antlered} of the {ae_h} were antlered (harvestMale = antlered). " + rep
    if year == 2024 and ae_p == 782:
        any_note += (" The report text reads '34 elk taken on 782 any-elk permits (19%)'; 782 conflicts with the 229 total "
                     "permits sold, so the any-elk permit count is left null.")
        ae_lic = None
    else:
        ae_lic = ae_p
    rows.append(dict(species="elk", year=year, unit="Statewide", method="all", methodLabel="All elk permits",
                     hunters=None, harvest=total, successPct=tps, licenses=permits,
                     note=f"{permits} elk permits purchased; total permit success {tps}%. {county} " + rep, sourceId=source))
    rows.append(dict(species="elk", year=year, unit="Statewide", methodLabel="Any-elk permits", sex="either",
                     hunters=None, harvest=ae_h, harvestMale=antlered, successPct=ae_s, licenses=ae_lic,
                     note=any_note, sourceId=source))
    rows.append(dict(species="elk", year=year, unit="Statewide", methodLabel="Antlerless-only elk permits", sex="female",
                     hunters=None, harvest=ao_h, successPct=ao_s, licenses=ao_p,
                     note="Antlerless-only elk permits (all units, including Fort Riley); sex 'female' = antlerless-only permit. " + rep,
                     sourceId=source))
    fort = "Fort Riley permits are limited-draw (resident only) and valid on Fort Riley Military Reservation, which lies in elk Unit 2."
    rows.append(dict(species="elk", year=year, unit="2", hunt="Fort Riley any-elk", methodLabel="Fort Riley any-elk permits",
                     sex="either", hunters=fa_n, harvest=fa_h, successPct=fa_s, note=fort, sourceId=source))
    rows.append(dict(species="elk", year=year, unit="2", hunt="Fort Riley antlerless-only",
                     methodLabel="Fort Riley antlerless-only elk permits", sex="female", hunters=fo_n, harvest=fo_h,
                     successPct=fo_s, note=fort + " Sex 'female' = antlerless-only permit.", sourceId=source))
    if ae_h + ao_h != total:
        raise ValueError(f"elk {year}: {ae_h}+{ao_h} != {total}")
    return rows


# ---------------------------------------------------------------- pronghorn
def parse_pronghorn(text, year, source):
    t = flat(text)
    total = int(re.search(r"estimate of (\d+) pronghorn were harvested in %d" % year, t).group(1))
    m = re.search(r"In %d, an estimated (\d+) bucks and (\d+) (does or fawns|does and fawns|does) were harvested" % year, t)
    bucks, other, what = int(m.group(1)), int(m.group(2)), m.group(3)
    if bucks + other != total:
        raise ValueError(f"pronghorn {year}: {bucks}+{other} != {total}")
    rr = re.search(r"Response rate by permit type in %d was: archery [-–]\s*(\d+)%%; firearms [-–]\s*(\d+)%%; and muzzleloader [-–]\s*(\d+)%%" % year, t)
    note = (f"Statewide estimate (report cards extrapolated to nonrespondents); {bucks} bucks and {other} {what} as published "
            f"(harvestMale = bucks). Harvest, permits and success by unit (2, 17, 18) and by weapon are shown only as charts "
            f"without published numbers.")
    if rr:
        note += f" Survey response rate: archery {rr.group(1)}%, firearms {rr.group(2)}%, muzzleloader {rr.group(3)}%."
    alloc = re.search(r"%d allocations were (\d+) firearms permits and (\d+) muzzleloader permits" % year, t) or \
        re.search(r"\(n=(\d+) firearms permits and (\d+) muzzleloader permits\)", t)
    if alloc:
        note += f" Limited-draw allocations: {alloc.group(1)} firearm and {alloc.group(2)} muzzleloader permits."
    arch = {2020: r"all-time high of (\d+)", 2021: r"third highest on record \(n=(\d+)\)", 2022: r"fourth highest sales total on record \(n=(\d+)\)"}
    if year in arch:
        a = re.search(arch[year], t)
        note += f" Archery permits sold (unlimited, valid in all three units): {a.group(1)}."
    return [dict(species="pronghorn", year=year, unit="Statewide", method="all", methodLabel="All permit types",
                 hunters=None, harvest=total, harvestMale=bucks, successPct=None, note=note, sourceId=source)]


# ---------------------------------------------------------------- turkey
TURKEY_UNITS = {"1": "Northwest", "2": "Northcentral", "3": "Northeast", "4": "Southwest", "5": "Southcentral", "6": "Southeast"}


def parse_turkey(raw):
    latest = read(raw, "turkey_spring_2026")
    src = "h-kdwp-turkey-2026"
    recs = []
    # Table 2
    t2 = latest[latest.index("Table 2. Total permits issued"):latest.index("Table 3.")]
    table2 = {}
    for m in re.finditer(r"^\s*(20\d\d)\s+([\d,]+)\s+([\d,]+)\s+(\d+)(?:\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+(\d+))?\s*(No Season)?\s*$", t2, re.M):
        y = int(m.group(1))
        table2[y] = m.groups()
    # Table 3
    t3 = latest[latest.index("Table 3."):latest.index("Figure 1.")]
    table3 = {}
    for m in re.finditer(r"^\s*(20\d\d)\s+((?:\d+\.\d\s+){6}\d+\.\d)\s*$", t3, re.M):
        table3[int(m.group(1))] = [float(x) for x in m.group(2).split()]
    if sorted(table2) != list(range(2019, 2027)) or sorted(table3) != list(range(2014, 2027)):
        raise ValueError(f"turkey tables: {sorted(table2)} {sorted(table3)}")

    # per-year report text (active hunters etc.)
    text_stats = {}
    for y in (2024, 2025, 2026):
        t = flat(read(raw, f"turkey_spring_{y}"))
        m = re.search(r"An estimated ([\d.]+)% of the ([\d,]+) permit buyers hunted turkeys during the spring season resulting in "
                      r"([\d,]+) active hunters \(([\d,]+) residents and ([\d,]+) non-residents", t)
        h = re.search(r"Total harvest during the spring %d season was ([\d,]+) turkeys" % y, t)
        s = re.search(r"filling their permit was ([\d.]+)%% during the %d season" % y, t)
        d = re.search(r"Those hunters spent an average of ([\d.]+) days", t)
        text_stats[y] = dict(pct=m.group(1), buyers=num(m.group(2)), active=num(m.group(3)), res=num(m.group(4)),
                             nonres=num(m.group(5)), harvest=num(h.group(1)), success=float(s.group(1)), days=d.group(1))

    for y in range(2020, 2027):
        g = table2[y]
        permits, harvest, success = num(g[1]), num(g[2]), int(g[3])
        r = dict(species="turkey", year=y, unit="Statewide", method="all", methodLabel="Spring season", residency="all",
                 hunters=None, harvest=harvest, successPct=success, licenses=permits, sourceId=src)
        note = ("Table 2 of the 2026 report (KDWP's current figures): 'Permits & Game Tags' = licenses; success as published.")
        ts = text_stats.get(y)
        if ts:
            sid = f"h-kdwp-turkey-{y}"
            if ts["harvest"] == harvest:
                r.update(hunters=ts["active"], successPct=ts["success"], sourceId=sid)
                note = (f"From the {y} report text: {ts['pct']}% of {ts['buyers']:,} permit buyers hunted = {ts['active']:,} active "
                        f"hunters ({ts['res']:,} residents, {ts['nonres']:,} non-residents as published; KDWP's resident and non-resident figures do not sum exactly to the total), harvest {ts['harvest']:,}, "
                        f"{ts['success']}% of hunters filled their permit; average {ts['days']} days afield. "
                        f"The 2026 report's Table 2 lists {permits:,} permits & game tags, harvest {harvest:,} and {success}% success.")
            else:
                note += (f" The original {y} report text gave {ts['buyers']:,} permit buyers, {ts['active']:,} active hunters, harvest "
                         f"{ts['harvest']:,} and {ts['success']}% success; KDWP later revised the season figures, so active hunters "
                         f"are left null rather than mixing editions.")
        r["note"] = note
        recs.append(r)
        if g[4]:
            recs.append(dict(species="turkey", year=y, unit="Statewide", method="all", methodLabel="Fall season", residency="all",
                             hunters=None, harvest=num(g[5]), successPct=int(g[7]), licenses=num(g[4]),
                             note=f"Fall turkey season, statewide (Table 2 of the 2026 report). Hens were {g[6]}% of the fall harvest. "
                                  f"No fall season has been held since 2022.", sourceId=src))
        res = table3[y]
        for i, u in enumerate(["1", "2", "3", "4", "5", "6", "Statewide"]):
            recs.append(dict(species="turkey", year=y, unit=u, unitName=TURKEY_UNITS.get(u), method="all",
                             methodLabel="Spring season", residency="resident", hunters=None, harvest=None,
                             successPct=res[i],
                             note="Resident hunter success only (Table 3 of the 2026 report). KDWP shows unit hunters and harvest "
                                  "only in a chart (Figure 6) without published numbers.", sourceId=src))
    # overall (all-hunter) unit success stated in each report's text
    hi = (r"Hunter success was (?:\d+ )?greatest in (?:\d+ )?Unit (\d) where an estimated (\d+)% of all active hunters", "highest")
    lo = (r"Hunt success was (?:\d+ )?lowest in (?:\d+ )?(?:the )?Unit (\d) this spring (?:\d+ )?where an estimated (\d+)% of active hunters?", "lowest")
    phrases = {2024: [hi, lo], 2025: [hi, lo], 2026: [hi, lo]}
    for y, pats in phrases.items():
        t = flat(read(raw, f"turkey_spring_{y}"))
        for pat, which in pats:
            m = re.search(pat, t)
            if not m:
                raise ValueError(f"turkey {y}: {which} phrase not found")
            recs.append(dict(species="turkey", year=y, unit=m.group(1), unitName=TURKEY_UNITS[m.group(1)], method="all",
                             methodLabel="Spring season", residency="all", hunters=None, harvest=None,
                             successPct=float(m.group(2)),
                             note=f"All active hunters (residents and non-residents). Stated in the {y} report text as the {which} "
                                  f"unit success that spring; other units' overall success appears only in a chart (Figure 7).",
                             sourceId=f"h-kdwp-turkey-{y}"))
    for r in recs:
        if r.get("unitName") is None:
            r.pop("unitName", None)
    return recs, sorted(set(table2) & set(range(2020, 2027)))


# ---------------------------------------------------------------- main
def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    raw, repo = sys.argv[1], sys.argv[2]
    out_dir = os.path.join(repo, "src/data/agency/kansas")
    os.makedirs(os.path.join(out_dir, "harvest"), exist_ok=True)
    data = {k: [] for k in ("whitetail", "mule-deer", "elk", "pronghorn", "turkey")}

    deer_units = set()
    for season, year, kind in (("2020-21", 2020, "report"), ("2021-22", 2021, "report"),
                               ("2022-23", 2022, "table"), ("2023-24", 2023, "table")):
        txt = read(raw, f"deer_{season}_{kind}")
        src = f"h-kdwp-deer-{season}"
        rows = parse_table1(txt, year)
        for sp, recs in table1_records(rows, year, src).items():
            data[sp] += recs
        if kind == "report":
            recs, units = parse_appendix(txt, year, src)
            deer_units |= set(units)
            for sp, rr in recs.items():
                data[sp] += rr

    for season, year in (("2020-21", 2020), ("2021-22", 2021), ("2022-23", 2022), ("2023-24", 2023), ("2024-25", 2024)):
        data["elk"] += parse_elk(read(raw, f"elk_{season}"), year, f"h-kdwp-elk-{season}")
    for year in range(2020, 2025):
        data["pronghorn"] += parse_pronghorn(read(raw, f"pronghorn_{year}"), year, f"h-kdwp-pronghorn-{year}")
    turkey, turkey_years = parse_turkey(raw)
    data["turkey"] = turkey

    for sp, rows in data.items():
        rows.sort(key=lambda r: (-r["year"], r["unit"] != "Statewide", r["unit"], r.get("residency", ""), r.get("methodLabel", "")))
        path = os.path.join(out_dir, "harvest", f"{sp}.json")
        with open(path, "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
        print(f"{sp}: {len(rows)} rows -> {path}")

    sources = []
    for sid, s in SOURCES.items():
        d = dict(id=sid, title=s["title"], publisher=PUB, url=s["url"])
        if s.get("pageUrl"):
            d["pageUrl"] = s["pageUrl"]
        d["dataYear"] = s["dataYear"]
        d["retrieved"] = RETRIEVED
        if s.get("notes"):
            d["notes"] = s["notes"]
        sources.append(d)

    deer_note_common = (
        "Season year = the year the season opened (2020 = 2020-21). Unit (Deer Management Unit 01-19) harvest by species, sex, "
        "age and permit type is published only for 2020-21 and 2021-22 (Appendix 1 of the full reports); 2022-23 and 2023-24 "
        "were published as a statewide table only, and no 2024-25 deer harvest report or table is posted on ksoutdoors.gov as "
        "of 2026-10-31. KDWP does not publish hunter numbers or success by unit. Statewide rows carry permits issued "
        "(licenses) and hunter success by permit type, which KDWP reports for deer of either species. Species harvest totals "
        "are the sum of the published antlered and antlerless columns. Harvest by weapon (rifle, bow, crossbow...), "
        "hunters by season and days afield are published only for both species combined, so they are not attributed to a "
        "species here. DMU 19 counts only extra antlerless harvest (see row notes). Cross-check: the 19 unit totals sum to "
        "within 40 deer of the statewide whitetail total (81,314 vs 81,354 in 2020-21; 82,323 vs 82,283 in 2021-22) and within 5 "
        "of the mule deer total; KDWP notes unit estimates may not match the statewide estimate due to rounding. The sex/age split "
        "differs more: unit tables sum to about 520-760 more antlered whitetail bucks and 490-780 fewer adult does than the "
        "statewide table, so use statewide rows for statewide composition.")
    coverage = [
        dict(species="whitetail", years=[2023, 2022, 2021, 2020], notes=deer_note_common),
        dict(species="mule-deer", years=[2023, 2022, 2021, 2020],
             notes=deer_note_common + " Mule deer rows are omitted for whitetail-only permit types when KDWP shows zero mule deer for them; where the table shows mule deer taken on a whitetail permit (e.g. statewide Whitetail Either Sex 2021-22), the row is kept as published."),
        dict(species="elk", years=[2024, 2023, 2022, 2021, 2020],
             notes=("Statewide figures stated in each report's text (2024 = 2024-25 season). KDWP reports harvest as reported by "
                    "respondents with no nonrespondent correction (each statewide note gives the agency's expansion figure). "
                    "Elk harvest by management unit is shown only as a chart without numbers; the only sub-state numbers are the "
                    "Fort Riley draw permits (Fort Riley lies in elk Unit 2) and the county list in the statewide note. "
                    "The 2024-25 report's any-elk permit count ('782') conflicts with the 229 permits sold, so it is left null.")),
        dict(species="pronghorn", years=[2024, 2023, 2022, 2021, 2020],
             notes=("Statewide harvest and buck count only. KDWP's pronghorn reports show permits, harvest and success by unit "
                    "(2, 17, 18) and by weapon only as charts without numbers, so no unit rows are possible. No 2025 pronghorn "
                    "harvest report is posted as of 2026-10-31.")),
        dict(species="turkey", years=sorted(turkey_years, reverse=True),
             notes=("Spring season 2020-2026 (2026 report published August 2026) plus the fall season 2020-2022 (no fall season "
                    "since). Statewide permits, harvest and success use the 2026 report's Table 2 (KDWP revised 2024: the 2024 report "
                    "said 24,834 permits, 11,135 harvest, 51% success; the 2026 table says 26,986, 11,144, 41%). Active hunters come "
                    "from the 2025 and 2026 report text. By unit, KDWP publishes resident hunter success for all six units (Table 3) "
                    "and, in the text, the highest- and lowest-success unit for all hunters in 2024-2026; unit hunters and harvest "
                    "are charts only. Reports for spring 2020-2023 are not posted on ksoutdoors.gov; those years come from the "
                    "2026 report's tables.")),
    ]
    meta = dict(
        unitNames={"turkey": TURKEY_UNITS},
        coverage=coverage,
        sources=sources,
    )
    with open(os.path.join(out_dir, "harvest-meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("deer units:", sorted(deer_units))


if __name__ == "__main__":
    main()
