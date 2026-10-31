#!/usr/bin/env python3
"""Parse South Dakota GFP harvest reports into HuntScout Pro HarvestRecord JSON.

Usage: harvest_parse.py <raw_dir> <repo_root>

Reads the pdftotext -layout output written by harvest_download.py and writes
  src/data/agency/south-dakota/harvest/<species>.json
  src/data/agency/south-dakota/harvest-meta.json

Two kinds of rows are produced:
  1. Season rows (unit "Statewide" or a named area) from the multi-year comparison
     tables printed in GFP's most recent report for each season type. These cover
     2020 through the latest season GFP has published.
  2. Unit / hunt rows from each year's "Harvest Projections" and "Harvest Distribution"
     tables (2020-2024 from the annual Big Game Harvest Projections reports, 2025 from
     GFP's current per-season reports, spring turkey 2025 from Internet Archive copies of
     GFP's reports, spring turkey 2026 from GFP's current reports).
Every number is copied from the agency table. The only arithmetic is:
  - deer harvest per species = sum of GFP's whitetail (or mule deer) buck/doe columns,
    because GFP projects harvest per license for all deer combined;
  - male / female harvest = sum of GFP's adult + young columns for that sex;
  - licenses = resident sold + nonresident sold where GFP prints them separately;
  - success for the lion season rows = harvest / active hunters (successComputed).
Nothing is estimated or filled; a value GFP does not print is null or omitted.
"""
import json
import os
import re
import sys
from collections import defaultdict

RAW = sys.argv[1]
REPO = sys.argv[2]
RETRIEVED = "2026-10-31"
PUB = "South Dakota Game, Fish and Parks"
HUNT_SURVEYS = "https://gfp.sd.gov/hunt-surveys/"
HR = "https://gfp.sd.gov/images/Harvest_Reports/"
WB_TS = "20260301145707"

# ---------------------------------------------------------------- sources
SOURCES = {}
ANNUAL_URL = {
    2020: ("https://gfp.sd.gov/userdocs/docs/-_2020_big_game_annual_report.pdf", "2021-12"),
    2021: ("https://gfp.sd.gov/userdocs/docs/-_2021_big_game_annual_report.pdf", "2022-08"),
    2022: ("https://gfp.sd.gov/userdocs/docs/-_2022_big_game_annual_report.pdf", "2023-05"),
    2023: ("https://gfp.sd.gov/userdocs/docs/-_2023_big_game_annual_report.pdf", "2024-04"),
    2024: ("https://gfp.sd.gov/userdocs/docs/2024_big_game_annual_report.pdf", "2025-07"),
}


def annual_source(y):
    sid = f"h-gfp-bg-annual-{y}"
    if sid not in SOURCES:
        url, rep = ANNUAL_URL[y]
        SOURCES[sid] = {
            "id": sid,
            "title": f"South Dakota Game Report No. {rep} – {y} Annual Report, Big Game Harvest Projections",
            "publisher": PUB,
            "url": url,
            "pageUrl": HUNT_SURVEYS,
            "dataYear": y,
            "retrieved": RETRIEVED,
            "notes": "Survey-based harvest projections for every big game and turkey season of the year "
                     "(mountain lion section covers the season ending in this year).",
        }
    return sid


def current_source(fname, data_year, title):
    """GFP report currently linked from the Hunt Surveys page (URL is reused every year)."""
    slug = fname.lower().replace("_", "-")
    sid = f"h-gfp-{slug}-{data_year}"
    if sid not in SOURCES:
        SOURCES[sid] = {
            "id": sid,
            "title": title,
            "publisher": PUB,
            "url": HR + fname.replace("_", "%20") + ".pdf",
            "pageUrl": HUNT_SURVEYS,
            "dataYear": data_year,
            "retrieved": RETRIEVED,
            "notes": "GFP reuses this URL each year; the copy retrieved on 2026-10-31 is the "
                     f"{data_year} report. Its multi-year comparison table is the source for earlier seasons cited from it.",
        }
    return sid


def wayback_source(fname, data_year, title):
    slug = fname.lower().replace("_", "-")
    sid = f"h-gfp-{slug}-{data_year}"
    if sid not in SOURCES:
        orig = HR + fname.replace("_", "%20") + ".pdf"
        SOURCES[sid] = {
            "id": sid,
            "title": title,
            "publisher": PUB,
            "url": f"https://web.archive.org/web/{WB_TS}/{orig}",
            "pageUrl": HUNT_SURVEYS,
            "dataYear": data_year,
            "retrieved": RETRIEVED,
            "notes": f"Unaltered GFP PDF as captured by the Internet Archive on 2026-03-01 at {orig}; "
                     "GFP has since replaced that URL with the 2026 report and the 2025 annual report is not yet published.",
        }
    return sid


# ---------------------------------------------------------------- helpers
NA = {"Unlim", "Unltd", "Unlimited", "NA", "N/A", "-", "--", "leftovers", "Leftovers", "Closed", ""}


def num(t):
    """Parse one table token. Returns int/float, or None for NA-style tokens."""
    t = t.strip().rstrip("*")
    if t in NA:
        return None
    pct = t.endswith("%")
    t2 = t.rstrip("%").replace(",", "")
    if re.fullmatch(r"-?\d+", t2):
        return int(t2)
    if re.fullmatch(r"-?\d*\.\d+", t2):
        return float(t2)
    raise ValueError(f"bad number token {t!r}")


def is_num(t):
    try:
        num(t)
        return True
    except ValueError:
        return False


def toks(s):
    return s.split()


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read().split("\n")


def ssum(*vals):
    if any(v is None for v in vals):
        return None
    return sum(vals)


RECORDS = defaultdict(list)
UNIT_NAMES = defaultdict(dict)
CHECKS = []  # (label, ok, detail)
WARN = []


def add(rec):
    clean = {k: v for k, v in rec.items() if v is not None or k in ("hunters", "harvest", "successPct")}
    RECORDS[clean["species"]].append(clean)


def check(label, a, b, tol=0):
    ok = a is not None and b is not None and abs(a - b) <= tol
    CHECKS.append((label, ok, f"{a} vs {b} (tol {tol})"))
    return ok


# ---------------------------------------------------------------- deer helpers
def deer_split(base, comps, all_total, all_success, success_label, extra_note=""):
    """comps: dict wt_buck, wt_doe, md_buck, md_doe (each a published number or sum of published
    adult+fawn numbers). Emits one whitetail and one mule-deer record."""
    for sp, pre, name in (("whitetail", "wt", "whitetail"), ("mule-deer", "md", "mule deer")):
        m, f = comps.get(pre + "_buck"), comps.get(pre + "_doe")
        if m is None and f is None:
            continue
        h = ssum(m if m is not None else 0, f if f is not None else 0)
        note = (f"Harvest = GFP projected {name} bucks + does on these licenses. GFP reports licenses and "
                f"success for all deer combined: {success_label} {fmt_pct(all_success)}, total deer harvest "
                f"{all_total if all_total is not None else 'not printed'}; success is not split by species.")
        if extra_note:
            note += " " + extra_note
        rec = dict(base)
        rec.update(species=sp, hunters=None, harvest=h, harvestMale=m, harvestFemale=f, successPct=None, note=note)
        add(rec)


def fmt_pct(v):
    return "not printed" if v is None else f"{v}%"


# ================================================================ TREND TABLES
def trend_rows(lines, title_re, ncols, first_year=2020, slash=False, stop_after=40):
    """Find a comparison table and return {year: [numbers]} for rows with exactly ncols numbers."""
    for i, l in enumerate(lines):
        if re.search(title_re, l):
            out = {}
            last = None
            for x in lines[i + 1:i + stop_after]:
                # the table ends at the next table title, or when the year sequence restarts
                if re.match(r"^\s*(Comparison|Summary|Harvest statistics|Harvest summaries|Reported participation|\d{4}(/\d{2,4})? .*(Projections?|Harvest|Distribution)\s*$)", x) \
                        or re.search(r"National Wildlife Refuge\s*$", x):
                    break
                ym = re.match(r"^\s*(\d{4})(?:[/-]\d{2,4})?\s", x)
                if ym:
                    yy = int(ym.group(1))
                    if last is not None and yy <= last:
                        break
                    last = yy
                if slash:
                    m = re.match(r"^\s*(\d{4})/(\d{2})\s+(.*)$", x)
                    if not m:
                        continue
                    y = int(m.group(1)) + 1  # license year = year the season ends
                    rest = m.group(3)
                else:
                    m = re.match(r"^\s*(\d{4})\s+(.*)$", x)
                    if not m:
                        if out and re.match(r"^\s*[A-Z][a-z]", x) and "Season" not in x and "Closed" not in x:
                            pass
                        continue
                    y = int(m.group(1))
                    rest = m.group(2)
                if y < first_year:
                    continue
                t = toks(rest)
                if not all(is_num(v) or v in NA for v in t):
                    continue
                if len(t) != ncols:
                    WARN.append(f"trend {title_re} {y}: {len(t)} cols, expected {ncols}: {rest.strip()}")
                    continue
                out[y] = [num(v) for v in t]
            return out
    WARN.append(f"trend table not found: {title_re}")
    return {}


def parse_trends():
    R = RAW

    def L(f):
        return read(os.path.join(R, f + ".txt"))

    # ---------------- TURKEY
    f = "SPRING_FIREARM_PRAIRIE_TURKEY"
    sid = current_source(f, 2026, "2026 Spring Prairie Turkey harvest report (Spring Firearm Prairie Turkey)")
    for y, v in trend_rows(L(f), r"Comparison of the \d{4}-\d{4} Spring Prairie Turkey Seasons", 8).items():
        rl, nl, tags, males, hens, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="Statewide", method=None, methodLabel="Spring Prairie Turkey (firearm, all prairie units)",
                 hunters=None, harvest=ssum(males, hens), harvestMale=males, harvestFemale=hens, successPct=succ,
                 licenses=ssum(rl, nl), daysHunted=days,
                 note=f"Licenses sold {rl} resident + {nl} nonresident; {tags} tags. Harvest = GFP males + hens; success as published by GFP.",
                 sourceId=sid))
    f = "BLACK_HILLS_SPRING_TURKEY"
    sid = current_source(f, 2026, "2026 Spring Black Hills Turkey harvest report")
    for y, v in trend_rows(L(f), r"Comparison of the \d{4}-\d{4} Spring Black Hills Turkey Seasons", 5).items():
        lic, harv, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="BH1", unitName="Black Hills", method=None, methodLabel="Spring Black Hills Turkey (firearm)",
                 hunters=None, harvest=harv, successPct=succ, licenses=lic, daysHunted=days,
                 note="Licenses issued; success is GFP tag success.", sourceId=sid))
    f = "SPRING_ARCHERY_TURKEY"
    sid = current_source(f, 2026, "2026 Spring Archery Turkey harvest report")
    for y, v in trend_rows(L(f), r"Comparison of the \d{4}-\d{4} Spring Archery Turkey Seasons", 6).items():
        rl, nl, harv, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="Statewide", method="archery", methodLabel="Spring Archery Turkey (statewide license)",
                 hunters=None, harvest=harv, successPct=succ, licenses=ssum(rl, nl), daysHunted=days,
                 note=f"Licenses sold {rl} resident + {nl} nonresident.", sourceId=sid))
    f = "SPRING_MENTORED_YOUTH_TURKEY"
    sid = current_source(f, 2026, "2026 Spring Mentored Youth Turkey harvest report")
    for y, v in trend_rows(L(f), r"Summary of the \d{4}-\d{4} Spring Mentored Youth Turkey Seasons", 7).items():
        lic, males, hens, total, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="Statewide", method=None, methodLabel="Spring Mentored Youth Turkey (statewide license)",
                 hunters=None, harvest=total, harvestMale=males, harvestFemale=hens, successPct=succ, licenses=lic, daysHunted=days,
                 sourceId=sid))
    f = "CUSTER_STATE_PARK_SPRING_TURKEY"
    sid = current_source(f, 2026, "2026 Custer State Park Spring Turkey harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Custer State Park Spring Turkey seasons", 5).items():
        lic, harv, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="CU1", unitName="Custer State Park", method=None, methodLabel="Spring Custer State Park Turkey",
                 hunters=None, harvest=harv, successPct=succ, licenses=lic, daysHunted=days, sourceId=sid))
    f = "FALL_PRAIRIE_TURKEY"
    sid = current_source(f, 2025, "2025 Fall Prairie Turkey harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Fall Prairie Turkey seasons", 8).items():
        lic, tags, males, hens, total, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="Statewide", method=None, methodLabel="Fall Prairie Turkey (all prairie units)",
                 hunters=None, harvest=total, harvestMale=males, harvestFemale=hens, successPct=succ, licenses=lic, daysHunted=days,
                 note=f"{tags} tags sold.", sourceId=sid))
    f = "FALL_BLACK_HILLS_TURKEY"
    sid = current_source(f, 2025, "2025 Fall Black Hills Turkey harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Fall Black Hills Turkey seasons", 8).items():
        rl, nl, males, hens, total, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="BH1", unitName="Black Hills", method=None, methodLabel="Fall Black Hills Turkey",
                 hunters=None, harvest=total, harvestMale=males, harvestFemale=hens, successPct=succ, licenses=ssum(rl, nl), daysHunted=days,
                 note=f"Licenses sold {rl} resident + {nl} nonresident.", sourceId=sid))
    f = "FALL_MENTORED_YOUTH_TURKEY"
    sid = current_source(f, 2025, "2025 Fall Mentored Youth Turkey harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Fall Mentored Youth Turkey seasons", 7).items():
        lic, males, hens, total, succ, days, sat = v
        add(dict(species="turkey", year=y, unit="Statewide", method=None, methodLabel="Fall Mentored Youth Turkey (statewide license)",
                 hunters=None, harvest=total, harvestMale=males, harvestFemale=hens, successPct=succ, licenses=lic, daysHunted=days,
                 sourceId=sid))

    # ---------------- PRONGHORN
    f = "ARCHERY_ANTELOPE"
    sid = current_source(f, 2025, "2025 Archery Antelope harvest report")
    for y, v in trend_rows(L(f), r"Harvest summaries for the \d{4}-\d{4} Archery Antelope seasons", 7).items():
        rl, nl, bucks, does, succ, days, sat = v
        add(dict(species="pronghorn", year=y, unit="Statewide", method="archery", methodLabel="Archery Antelope (statewide license)",
                 hunters=None, harvest=ssum(bucks, does), harvestMale=bucks, harvestFemale=does, successPct=succ, licenses=ssum(rl, nl), daysHunted=days,
                 note=f"Licenses sold {rl} resident + {nl} nonresident. Harvest = GFP bucks + does.", sourceId=sid))
    f = "FIREARM_ANTELOPE"
    sid = current_source(f, 2025, "2025 Firearm Antelope harvest report")
    for y, v in trend_rows(L(f), r"Harvest summaries for the \d{4}-\d{4} Firearm Antelope seasons", 8).items():
        rl, nl, bucks, does, total, succ, days, sat = v
        add(dict(species="pronghorn", year=y, unit="Statewide", method="rifle", methodLabel="Firearm Antelope (all units incl. landowner own land)",
                 hunters=None, harvest=total, harvestMale=bucks, harvestFemale=does, successPct=succ, licenses=ssum(rl, nl), daysHunted=days,
                 note=f"Licenses sold {rl} resident + {nl} nonresident, as printed in GFP's 2025 comparison table.", sourceId=sid))
    f = "MENTORED_YOUTH_ANTELOPE"
    sid = current_source(f, 2025, "2025 Mentored Youth Antelope harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Mentored Youth Antelope", 8).items():
        lic, bkid, dad, dkid, total, succ, days, sat = v
        add(dict(species="pronghorn", year=y, unit="Statewide", method=None, methodLabel="Mentored Youth Antelope (antlerless, statewide)",
                 hunters=None, harvest=total, harvestMale=bkid, harvestFemale=ssum(dad, dkid), successPct=succ, licenses=lic, daysHunted=days,
                 note="Male harvest = buck kids; female = adult does + doe kids.", sourceId=sid))
    f = "SPECIAL_ANTELOPE"
    sid = current_source(f, 2025, "2025 Special Antelope harvest report")
    for y, v in trend_rows(L(f), r"Harvest summaries for the \d{4}-\d{4} Special Antelope seasons", 7).items():
        rl, nl, bucks, does, succ, days, sat = v
        if bucks is None and succ is None:
            continue  # 2021: GFP prints NA for harvest
        add(dict(species="pronghorn", year=y, unit="Statewide", method="rifle", methodLabel="Special Antelope (statewide firearm license)",
                 hunters=None, harvest=ssum(bucks, does), harvestMale=bucks, harvestFemale=does, successPct=succ, licenses=ssum(rl, nl), daysHunted=days,
                 note=f"Licenses sold {rl} resident + {nl} nonresident.", sourceId=sid))
    f = "CUSTER_STATE_PARK_ANTELOPE"
    sid = current_source(f, 2025, "2025 Custer State Park Antelope harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Custer State Park Antelope seasons", 8).items():
        apps, lic, bucks, does, total, succ, days, sat = v
        add(dict(species="pronghorn", year=y, unit="CU1", unitName="Custer State Park", method=None, methodLabel="Custer State Park Antelope",
                 hunters=None, harvest=total, harvestMale=bucks, harvestFemale=does, successPct=succ, licenses=lic, daysHunted=days,
                 note=f"{apps} applications.", sourceId=sid))

    # ---------------- ELK
    f = "BLACK_HILLS_CSP_PRAIRIE_ELK"
    lines = L(f)
    sid = current_source(f, 2025, "2025 Black Hills, Custer State Park & Prairie Elk harvest report")
    for title, label, unit, uname, meth, n in (
        (r"Summary comparison of the \d{4}-\d{4} Archery Elk seasons", "Archery Elk (all archery units)", "Statewide", None, "archery", 8),
        (r"Summary comparison of the \d{4}-\d{4} Black Hills Firearm Elk seasons", "Black Hills Firearm Elk (all Black Hills units)", "Black Hills", None, "rifle", 8),
        (r"Summary comparison for \d{4}-\d{4} Prairie Firearm Elk seasons", "Prairie Firearm Elk (all prairie units)", "Prairie", None, "rifle", 7),
    ):
        for y, v in trend_rows(lines, title, n).items():
            if n == 8:
                apps, lic, bulls, cows, total, succ, days, sat = v
                note = f"{apps} first-choice applications."
            else:
                lic, bulls, cows, total, succ, days, sat = v
                note = None
            add(dict(species="elk", year=y, unit=unit, method=meth, methodLabel=label, hunters=None, harvest=total,
                     harvestMale=bulls, harvestFemale=cows, successPct=succ, licenses=lic, daysHunted=days, note=note, sourceId=sid))
    for title, label in ((r"Summary comparison of the \d{4}-\d{4} CSP Archery elk seasons", "Custer State Park Archery Elk"),
                         (r"Summary comparison of the \d{4}-\d{4} CSP Firearm Any elk seasons", "Custer State Park Firearm Any Elk")):
        for y, v in trend_rows(lines, title, 7).items():
            apps, lic, bulls, cows, succ, days, sat = v
            add(dict(species="elk", year=y, unit="CU1", unitName="Custer State Park", method="archery" if "Archery" in label else "rifle",
                     methodLabel=label, hunters=None, harvest=ssum(bulls, cows), harvestMale=bulls, harvestFemale=cows, successPct=succ,
                     licenses=lic, daysHunted=days, note=f"{apps} applications. Harvest = GFP bull + cow harvest.", sourceId=sid))

    # ---------------- DEER (species split)
    deer_trends = [
        ("ARCHERY_DEER", 2025, "2025 Archery Deer harvest report", r"Summary comparison of the \d{4}-\d{4} Archery Deer seasons", 10, "res_nr",
         "Statewide", "archery", "Archery Deer (all archery licenses)", "tag success"),
        ("MUZZLELOADER_DEER", 2025, "2025 Muzzleloader Deer harvest report", r"Summary comparison of the \d{4}-\d{4} Muzzleloader Deer seasons", 10, "res_nr",
         "Statewide", "muzzleloader", "Muzzleloader Deer (statewide licenses)", "success"),
        ("WEST_RIVER_PRAIRIE_FIREARM_DEER", 2025, "2025 West River Prairie Firearm Deer harvest report",
         r"Summary comparison of the \d{4}-\d{4} West River Deer seasons", 12, "res_tags_nr_tags", "West River", "rifle",
         "West River Firearm Deer (incl. Special Buck and Landowner Own Land)", "tag success"),
        ("EAST_RIVER_FIREARM_DEER", 2025, "2025 East River Firearm Deer harvest report",
         r"Summary comparison of the \d{4}-\d{4} East River Deer seasons", 12, "res_tags_nr_tags", "East River", "rifle",
         "East River Firearm Deer (incl. Special Buck and Landowner Own Land)", "success"),
        ("BLACK_HILLS_DEER", 2025, "2025 Black Hills Deer harvest report",
         r"Harvest summaries for the \d{4}-\d{4} Black Hills Deer seasons", 10, "res_nr", "Black Hills", "rifle",
         "Black Hills Firearm Deer (incl. Landowner Own Land)", "success"),
        ("APPRENTICE_DEER", 2025, "2025 Apprentice Deer harvest report", r"Comparison of the \d{4} - \d{4} Apprentice Deer hunting seasons", 9, "lic",
         "Statewide", None, "Apprentice Deer (statewide antlerless license)", "success"),
        ("YOUTH_DEER", 2025, "2025 Youth Deer harvest report", r"Comparison of the \d{4} - \d{4} Youth Deer hunting seasons", 9, "lic",
         "Statewide", None, "Youth Deer (statewide antlerless license)", "success"),
        ("MENTORED_YOUTH_DEER", 2025, "2025 Mentored Youth Deer harvest report", r"Summary for the \d{4}-\d{4} Mentored Youth Deer hunting seasons", 9, "lic",
         "Statewide", None, "Mentored Youth Deer (statewide antlerless license)", "success"),
        ("LANDOWNER_ANTLERLESS_DEER", 2025, "2025 Landowner Free Antlerless Deer harvest report",
         r"Summary of the \d{4}-\d{4} Free Landowner Antlerless Deer", 9, "lic", "Statewide", None,
         "Free Landowner Own Land Antlerless Deer", "success"),
    ]
    for f, dy, title, tre, n, lay, unit, meth, label, slabel in deer_trends:
        sid = current_source(f, dy, title)
        for y, v in trend_rows(L(f), tre, n).items():
            if lay == "res_nr":
                rl, nl, wtb, mdb, wtd, mdd, total, succ, days, sat = v
                lic, licnote = ssum(rl, nl), f"Licenses sold {rl} resident + {nl} nonresident."
            elif lay == "res_tags_nr_tags":
                rl, rt, nl, nt, wtb, mdb, wtd, mdd, total, succ, days, sat = v
                lic, licnote = ssum(rl, nl), f"Licenses sold {rl} resident ({rt} tags) + {nl} nonresident ({nt} tags)."
            else:
                l0, wtb, mdb, wtd, mdd, total, succ, days, sat = v
                lic, licnote = l0, None
            base = dict(year=y, unit=unit, method=meth, methodLabel=label, licenses=lic, daysHunted=days, sourceId=sid)
            deer_split(base, dict(wt_buck=wtb, wt_doe=wtd, md_buck=mdb, md_doe=mdd), total, succ, "GFP " + slabel, licnote or "")
    f = "CUSTER_STATE_PARK_DEER"
    sid = current_source(f, 2025, "2025 Custer State Park Deer harvest report")
    for y, v in trend_rows(L(f), r"Summary comparison of the \d{4}-\d{4} Custer State Park Deer seasons", 9).items():
        apps, lic, wtb, wtd, mdb, mdd, total, succ, days = v
        base = dict(year=y, unit="CU1", unitName="Custer State Park", method=None, methodLabel="Custer State Park Deer",
                    licenses=lic, daysHunted=days, sourceId=sid)
        deer_split(base, dict(wt_buck=wtb, wt_doe=wtd, md_buck=mdb, md_doe=mdd), total, succ, "GFP success", f"{apps} applications.")
    f = "NATIONAL_WILDLIFE_REFUGE_FIREARM_DEER"
    sid = current_source(f, 2025, "2025 National Wildlife Refuge Firearm Deer harvest report")
    lines = L(f)
    for refuge, code in (("Sand Lake", "SL"), ("Lacreek", "LC"), ("Waubay", "WA")):
        for y, v in trend_rows(lines, rf"^{refuge} National Wildlife Refuge", 5, stop_after=14).items():
            lic, bucks, does, succ, days = v
            add(dict(species="whitetail", year=y, unit=f"{refuge} NWR", unitName=f"{refuge} National Wildlife Refuge", method=None,
                     methodLabel="National Wildlife Refuge Deer", hunters=None, harvest=ssum(bucks, does), harvestMale=bucks, harvestFemale=does,
                     successPct=succ, licenses=lic, daysHunted=days,
                     note="GFP's refuge projections list whitetail columns only, so the refuge harvest is reported as whitetail.",
                     sourceId=sid))

    # ---------------- SHEEP / GOAT
    f = "MOUNTAIN_GOAT_and_BIGHORN"
    lines = L(f)
    sid = current_source(f, 2025, "2025 Mountain Goat and Bighorn Sheep harvest report")
    for y, v in trend_rows(lines, r"Comparison of the \d{4}-\d{4} Black Hills Bighorn Sheep seasons", 5).items():
        apps, lic, rams, succ, days = v
        add(dict(species="sheep", year=y, unit="Black Hills", unitName="Black Hills units (outside Custer State Park)", method=None,
                 methodLabel="Bighorn Sheep (any ram) — Black Hills", hunters=None, harvest=rams, harvestMale=rams,
                 successPct=succ, licenses=lic, daysHunted=days,
                 note=f"{apps} applications. Licenses include the auction license where GFP counts it.", sourceId=sid))
    for y, v in trend_rows(lines, r"Comparison of the \d{4}-\d{4} Custer State Park Bighorn Sheep seasons", 5).items():
        apps, lic, rams, succ, days = v
        add(dict(species="sheep", year=y, unit="CU1", unitName="Custer State Park", method=None,
                 methodLabel="Bighorn Sheep (any ram) — Custer State Park", hunters=None, harvest=rams, harvestMale=rams,
                 successPct=succ, licenses=lic, daysHunted=days, note=f"{apps} applications.", sourceId=sid))
    for i, l in enumerate(lines):
        if re.search(r"Comparison of the \d{4}-\d{4} Black Hills Mountain Goat seasons", l):
            for x in lines[i + 1:i + 20]:
                m = re.match(r"^\s*(\d{4})\s+([\d,]+)/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+([\d.]+)\s*$", x)
                if m and int(m.group(1)) >= 2020:
                    y, apps, lic, bil, nan, succ, days = int(m.group(1)), num(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6)), num(m.group(7))
                    add(dict(species="goat", year=y, unit="Black Hills", unitName="Black Hills", method=None, methodLabel="Mountain Goat — Black Hills",
                             hunters=None, harvest=bil + nan, harvestMale=bil, harvestFemale=nan, successPct=succ, licenses=lic, daysHunted=days,
                             note=f"{apps} applications. Harvest = GFP billies + nannies.", sourceId=sid))
            break

    # ---------------- LION
    f = "MOUNTAIN_LION"
    lines = L(f)
    sid = current_source(f, 2026, "2025/26 Mountain Lion harvest report")
    for y, v in trend_rows(lines, r"Harvest statistics for \d{4}/\d{2} - \d{4}/\d{2} Black Hills Mountain Lion seasons", 7, slash=True).items():
        length, lic, active, males, females, days, sat = v
        h = ssum(males, females)
        add(dict(species="lion", year=y, unit="Black Hills", unitName="Black Hills Fire Protection District (excluding Custer State Park / dog access permits)",
                 method=None, methodLabel=f"Black Hills Mountain Lion season {y-1}/{str(y)[2:]}", hunters=active, harvest=h,
                 harvestMale=males, harvestFemale=females, successPct=round(100 * h / active, 1) if active else None,
                 successComputed=True, licenses=lic, daysHunted=days,
                 note=f"Season {y-1}/{str(y)[2:]} ({length} days, Dec 26 start), recorded under license year {y}. hunters = GFP projected active hunters; "
                      "success = harvest / active hunters. GFP's table title excludes the CSP/Dog Access Permit Area (see separate row).",
                 sourceId=sid))
    # Current-season projections row for Dog Access Permit holders (GFP's own active-hunter count and success).
    # From 2025/26 CSP was open to all lion license holders, so the comparison table's CSP "Active Hunters"
    # includes hunters without a permit while its harvest is permit-holder harvest only; harvest/active would
    # understate permit success. Use GFP's published permit-holder figures for that season instead.
    dap = None
    for x in lines:
        m = re.match(r"^\s*Dog Access Permit holders\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)%", x)
        if m:
            dap = dict(active=int(m.group(7)), success=float(m.group(8)))
            break
    for y, v in trend_rows(lines, r"Harvest statistics for \d{4}/\d{2} - \d{4}/\d{2} in the Dog Access Permit Area", 7, slash=True).items():
        length, permits, active, males, females, days, sat = v
        h = ssum(males, females)
        if y >= 2026 and dap:
            add(dict(species="lion", year=y, unit="CU1", unitName="Custer State Park / Dog Access Permit Area", method=None,
                     methodLabel=f"Dog Access Permit holders season {y-1}/{str(y)[2:]}", hunters=dap["active"], harvest=h,
                     harvestMale=males, harvestFemale=females, successPct=dap["success"],
                     successComputed=False, licenses=permits, daysHunted=days,
                     note=f"Season {y-1}/{str(y)[2:]}, recorded under license year {y}. licenses = dog access permits issued. From 2025/26 CSP was "
                          f"open to all lion license holders and the dog access area was expanded beyond CSP; hunters = GFP's projected active "
                          f"permit holders ({dap['active']}) and successPct = GFP's published permit-holder success. GFP's comparison table lists "
                          f"{active} active hunters in CSP for 2025/26, which includes hunters without a permit.",
                     sourceId=sid))
            continue
        add(dict(species="lion", year=y, unit="CU1", unitName="Custer State Park / Dog Access Permit Area", method=None,
                 methodLabel=f"Custer State Park / Dog Access Permit season {y-1}/{str(y)[2:]}", hunters=active, harvest=h,
                 harvestMale=males, harvestFemale=females, successPct=round(100 * h / active, 1) if active else None,
                 successComputed=True, licenses=permits, daysHunted=days,
                 note=f"Season {y-1}/{str(y)[2:]}, recorded under license year {y}. licenses = Custer State Park access permits issued; "
                      "hunters = projected active hunters; success = harvest / active hunters.",
                 sourceId=sid))


COMMON = ("All figures are GFP survey-based harvest projections (\"Harvest Projections\"), not check-station counts. "
          "Season rows (unit Statewide / East River / West River / Black Hills / CU1 etc. with no hunt code) come from the "
          "multi-year comparison table in GFP's most recent report for that season; unit and hunt rows come from each year's "
          "projection and distribution tables (2020-2024: GFP annual Big Game Harvest Projections reports; 2025+: GFP's current "
          "season reports). Rows labelled '— harvest by unit' are GFP harvest-distribution tables for statewide licenses: they give "
          "harvest by the unit where the animal was taken and carry no hunters or success; GFP rounds each unit, so their sum can differ "
          "from GFP's total by a few percent. daysHunted is GFP's average days hunted per hunter. licenses = licenses sold "
          "(resident + nonresident where GFP prints both).")
COVERAGE_NOTES = {
    "turkey": COMMON + " Spring seasons 2020-2026 (GFP's 2026 spring reports are out); fall seasons 2020-2025. Spring 2025 unit tables "
              "come from unaltered Internet Archive copies (2026-03-01) of GFP's PDFs because GFP has replaced them with the 2026 editions and the "
              "2025 annual report is not yet published. Spring Prairie unit rows: successPct = GFP hunter success, hunters = GFP 'Hunters' column; "
              "Fall Prairie unit rows: successPct = GFP tag success. In 2020-2021 GFP listed Fall Prairie units by name only (no unit number); those "
              "rows keep the name as the unit. Units GFP printed with no harvest (58B Oahe Downstream every year, 18A fall 2023) are omitted. "
              "Spring 2020-2021 archery distribution tables have no hen column (female harvest omitted).",
    "pronghorn": COMMON + " 2020-2025. Firearm unit rows: successPct = GFP hunter success where printed (2020-2021), otherwise tag success. "
                 "2025 firearm licenses were buck-only, so GFP printed adult-buck and kid-buck harvest only. Custer State Park antelope was closed 2017-2024 "
                 "(2025 only). Mentored Youth Antelope was closed 2024-2025. Special Antelope began in 2021; GFP printed NA for 2021 harvest, so 2021 is omitted.",
    "elk": COMMON + " 2020-2025. Hunt rows carry GFP's unit-type code (e.g. H2A-21); licenses = resident licenses sold (SD elk is resident-only). "
           "Custer State Park antlerless elk was closed 2019-2025. Landowner Own Land Prairie Elk projections are tabulated only for 2024-2025. "
           "2025 archery H5A-21 (1 license, no survey response) printed no harvest and is omitted. GFP does not name elk units in these reports.",
    "whitetail": COMMON + " 2020-2025. GFP projects deer harvest per license for whitetail and mule deer together; this file holds the "
                 "whitetail share (sum of GFP's whitetail buck/doe adult+fawn columns). Hunters and success are published only for all deer combined, so "
                 "hunters and successPct are null and GFP's all-deer success and total are in each row's note. Youth Deer was part of Apprentice Deer in 2018-2020 "
                 "(Youth rows start 2021). National Wildlife Refuge tables list whitetail only. West River 2020 hunt 45C-19: GFP left the nonresident-sold cell blank, "
                 "so licenses is omitted (resident sold is in the note). 2025 West River LOL WR1-01 has blank harvest cells read as 0 after confirming against GFP's Totals row. "
                 "'Archery Deer — nonresident license types' (2023+) re-tabulates the nonresident ST1-01/LM1-13 archery rows by "
                 "nonresident license type (ADN / ADNP), so do not add the two together. Hunt codes are GFP unit-license-type codes "
                 "(e.g. 01A-01); license-area codes ST1/LM1/APD/YOD/MHD are reported under unit 'Statewide' and ER1/WR1 under 'East River'/'West River'.",
    "mule-deer": COMMON + " 2020-2025. Mule deer share of GFP's combined deer projections (sum of GFP's mule deer buck/doe adult+fawn columns); hunters "
                 "and success are published only for all deer combined (see each row's note). Hunts where GFP projected no mule deer harvest are kept with harvest 0. "
                 "Free Landowner antlerless distribution tables list mule deer only in 2021. "
                 "'Archery Deer — nonresident license types' (2023+) overlaps the nonresident archery rows (do not add them).",
    "sheep": COMMON + " 2020-2025, Black Hills (outside Custer State Park, any-ram licenses incl. the auction license) and Custer State Park, from GFP's "
             "comparison tables. GFP does not tabulate harvest by sheep unit; per-unit applicant counts appear only in the report text.",
    "goat": COMMON + " Black Hills mountain goat 2020-2022. The season was closed 2023-2025.",
    "lion": "GFP survey projections for the Black Hills season (Dec 26 - Apr 30) excluding Custer State Park / Dog Access Permit Area, and for "
            "CSP / Dog Access Permit holders, from GFP's 2025/26 report comparison tables. Each season is recorded under the license year in which it ends "
            "(2019/20 -> 2020 ... 2025/26 -> 2026). hunters = GFP projected active hunters; successPct = harvest / active hunters (computed), except the 2025/26 "
            "Dog Access Permit row, which uses GFP's published permit-holder active hunters and success (CSP was open to all license holders that season). "
            "Prairie (outside the Black Hills Fire Protection District) lion harvest, which GFP reports only in its narrative text, is not included.",
    "moose": "South Dakota has no moose hunting season.",
    "bear": "South Dakota has no black bear hunting season.",
}

# ================================================================ main
def write():
    out_dir = os.path.join(REPO, "src/data/agency/south-dakota/harvest")
    os.makedirs(out_dir, exist_ok=True)
    order = {"Statewide": 0}
    for sp, rows in RECORDS.items():
        rows.sort(key=lambda r: (r["year"], r.get("methodLabel", ""), order.get(r["unit"], 1), r["unit"], r.get("hunt", ""), r.get("residency", "")))
        with open(os.path.join(out_dir, f"{sp}.json"), "w") as fh:
            json.dump(rows, fh, indent=1, ensure_ascii=False)
            fh.write("\n")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    parse_trends()
    import harvest_units  # noqa: E402  (unit-level tables)
    harvest_units.run(sys.modules[__name__])
    write()
    import harvest_meta  # noqa: E402
    harvest_meta.run(sys.modules[__name__])
    bad = [c for c in CHECKS if not c[1]]
    print(f"records: " + ", ".join(f"{k}={len(v)}" for k, v in sorted(RECORDS.items())))
    print(f"checks: {len(CHECKS)} run, {len(bad)} failed")
    with open(os.path.join(os.path.dirname(RAW.rstrip("/")), "harvest_parse_report.txt") if False else "/dev/null", "w"):
        pass
    for c in bad:
        print("  CHECK FAIL", c[0], c[2])
    for w in WARN:
        print("  WARN", w)
