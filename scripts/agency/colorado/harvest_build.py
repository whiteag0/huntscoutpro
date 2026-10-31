#!/usr/bin/env python3
"""Build src/data/agency/colorado/harvest/*.json + harvest-meta.json from CPW PDFs.

Run harvest_download.py first.  Usage (from the repo root):

  python -I scripts/agency/colorado/harvest_build.py <raw_dir> [--draw-raw <dir>] [--check]

<dir> (default <raw_dir>/../draw/pdf) holds the big game brochures downloaded by
draw_download.py; the 2025 brochure's 'Limited Licenses - White-tailed Deer Only'
table decides which 2025 by-hunt-code deer rows go to whitetail.json.

Every number written is a value printed in a CPW harvest report.  The only
derived values are successPct (with successComputed=true) where CPW prints
hunters and harvest but no success rate (turkey), and the zero-padding of GMU
numbers (CPW prints "1" in some years and "001" in others; all ids are written
in CPW's 3-digit hunt-code form so years line up).

Rows that do not match the expected column count are reported, never guessed.
"""
import json
import re
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, str(HERE))
from harvest_pdftext import page_lines  # noqa: E402
from draw_build import whitetail_codes  # noqa: E402  (same brochure table the draw files use)

REPO = HERE.parents[2]
OUT = REPO / "src/data/agency/colorado"
PUBLISHER = "Colorado Parks and Wildlife"
NUM = re.compile(r"^-?[\d,]+(\.\d+)?%?$")
PROBLEMS = []  # (file, page, line tokens, reason)


# ---------------------------------------------------------------- helpers
def num(tok):
    t = tok.replace(",", "").rstrip("%")
    return float(t) if "." in t else int(t)


def isnum(tok):
    return bool(NUM.match(tok))


def gmu(u):
    """CPW GMU ids: numeric ones are written 3-digit as in CPW hunt codes."""
    return u.zfill(3) if u.isdigit() else u


def pct(v):
    return float(v) if isinstance(v, float) else v


def text(line):
    return " ".join(line["tokens"]).replace("​", "").strip()


def problem(src, pn, toks, why):
    PROBLEMS.append((src, pn, " ".join(toks)[:140], why))


def is_data_row(t, unit_rx):
    """A table body row: unit id (or Total) followed by at least one number.
    Header lines ("Total Total Percent"), page numbers and footer dates are not."""
    if len(t) < 2 or not (re.match(unit_rx, t[0]) or t[0] == "Total"):
        return False
    if not any(isnum(x) for x in t[1:]):
        return False
    if len(t) == 2 and "/" in t[1]:
        return False  # footer: page number + print date
    if len(t) == 3 and t[1] == "of":
        return False  # footer: "4 of 71"
    return True


SURVEY_TITLE = re.compile(
    r"^(\d{4}) (?:(Elk|Deer|Pronghorn) )?(?:Harvest, Hunters|Hunters, Harvest),? and "
    r"(Recreation Days|Percent Success) for (.+?)\s*$")


def page_title(lines, rx):
    for ln in lines[:3]:
        s = text(ln)
        if "...." in s:
            return None
        m = rx.match(s)
        if m:
            return m
    return None


def code_parts(code):
    """CPW hunt code, e.g. EM012O1R: species, sex, unit, season type, season no., method."""
    m = re.match(r"^([A-Z])([MFE])([A-Z0-9]{3})([A-Z])(\d)([A-Z])$", code)
    if not m:
        return None
    sex = {"M": "male", "F": "female", "E": "either"}[m.group(2)]
    method = {"R": "rifle", "A": "archery", "M": "muzzleloader"}.get(m.group(6))
    return {"sex": sex, "unit": m.group(3), "method": method, "methodLetter": m.group(6)}


def rec(**kw):
    r = OrderedDict()
    for k in ["species", "year", "unit", "unitName", "hunt", "method", "methodLabel", "sex", "residency",
              "hunters", "harvest", "harvestMale", "harvestFemale", "successPct", "successComputed",
              "daysHunted", "licenses", "note", "sourceId"]:
        if k in kw and kw[k] is not None:
            r[k] = kw[k]
        elif k in ("hunters", "harvest", "successPct"):
            r[k] = kw.get(k)
    return r


# ------------------------------------------------- elk / deer / pronghorn 2020-2024
SURVEY_REC = {
    "elk": {"All Manners of Take": "all", "All Rifle Seasons": "rifle", "All Archery Seasons": "archery",
            "All Muzzleloader Seasons": "muzzleloader", "First Rifle Seasons": "rifle",
            "Second Rifle Seasons": "rifle", "Third Rifle Seasons": "rifle", "Fourth Rifle Seasons": "rifle"},
    "deer": {"All Manners of Take": "all", "All Rifle Seasons": "rifle", "All Archery Seasons": "archery",
             "All Muzzleloader Seasons": "muzzleloader", "2nd Rifle Seasons": "rifle",
             "3rd Rifle Seasons": "rifle", "4th Rifle Seasons": "rifle",
             "All Whitetail Only Seasons": "all", "All Whitetail Only Archery Seasons": "archery",
             "All Whitetail Only Muzzleloader Seasons": "muzzleloader",
             "All Whitetail Only Rifle Seasons": "rifle"},
    "pronghorn": {"All Manners of Take": "all", "All Rifle Seasons": "rifle", "All Archery Seasons": "archery",
                  "All Muzzleloader Seasons": "muzzleloader"},
}
SURVEY_PCT = {
    "elk": {"All Rifle Seasons": "rifle", "First Rifle Seasons": "rifle", "Second Rifle Seasons": "rifle",
            "Third Rifle Seasons": "rifle", "Fourth Rifle Seasons": "rifle", "All Muzzleloader Seasons": "muzzleloader"},
    "deer": {"2nd Rifle Seasons": "rifle", "3rd Rifle Seasons": "rifle", "4th Rifle Seasons": "rifle",
             "All Muzzleloader Seasons": "muzzleloader"},
    "pronghorn": {},
}


def norm_table(name):
    n = re.sub(r"\s+", " ", name)
    n = re.sub(r"^(\d) (st|nd|rd|th) ", r"\1\2 ", n)
    n = re.sub(r"\s*\((Does Not Include PLOs|Does not include PLOs|Includes PLOs)\)$", "", n)
    return n.strip()


def parse_survey(doc, out):
    sp, year, sid, pages = doc["key"], doc["year"], doc["sid"], doc["pages"]
    rec_sel, pct_sel = SURVEY_REC[sp], SURVEY_PCT[sp]
    totals = {}
    cur = None
    for pn, lines in enumerate(pages, 1):
        if pn == 1:
            continue  # cover / contents page
        for ln in lines:
            s = text(ln)
            m = SURVEY_TITLE.match(s)
            if m and "...." not in s:
                cur = (m.group(3), norm_table(m.group(4)))
                continue
            if s.startswith(("Methodology", "20")) and "DAU" in s:
                cur = None
            if not cur:
                continue
            kind, table = cur
            sel = rec_sel if kind == "Recreation Days" else pct_sel
            if table not in sel:
                continue
            method = sel[table]
            target = "whitetail" if "Whitetail" in table else ("mule-deer" if sp == "deer" else sp)
            t = ln["tokens"]
            if not is_data_row(t, r"^\d{1,3}$"):
                continue
            vals = t[1:]
            if not all(isnum(v) for v in vals):
                problem(sid, pn, t, "non-numeric cell")
                continue
            unit = "Statewide" if t[0] == "Total" else gmu(t[0])
            v = [num(x) for x in vals]
            if kind == "Recreation Days":
                if len(v) != 7:
                    problem(sid, pn, t, f"expected 7 numbers in {table}")
                    continue
                r = rec(species=target, year=year, unit=unit, method=method, methodLabel=table, sex="all",
                        hunters=v[4], harvest=v[3], harvestMale=v[0], harvestFemale=v[1], successPct=v[5],
                        daysHunted=v[6], sourceId=sid)
                if unit == "Statewide":
                    totals[(target, table)] = r
                out[target].append(r)
            else:
                if len(v) != 6:
                    problem(sid, pn, t, f"expected 6 numbers in pct {table}")
                    continue
                for sx, (h, n, p) in (("male", v[0:3]), ("female", v[3:6])):
                    out[target].append(rec(species=target, year=year, unit=unit, method=method, methodLabel=table,
                                           sex=sx, hunters=n, harvest=h, successPct=p, sourceId=sid))
    return totals


# ------------------------------------------------- 2025 by-hunt-code (elk/deer/pronghorn)
WT_NOTE = "White-tailed deer only hunt code (listed in the white-tailed-deer-only limited license table of CPW's {y} big game brochure)"
DEER_TOTAL_NOTE = ("CPW's Total line for the whole {y} by-hunt-code table; it includes the white-tailed-deer-only hunt codes "
                   "whose rows are in whitetail.json")


def parse_huntcode_survey(doc, out, wt_codes=frozenset()):
    """wt_codes: deer hunt codes in that year's brochure white-tailed-only table -> whitetail.json."""
    sp, year, sid = doc["key"], doc["year"], doc["sid"]
    base = "mule-deer" if sp == "deer" else sp
    target = base
    for pn, lines in enumerate(doc["pages"], 1):
        for ln in lines:
            t = ln["tokens"]
            if not t:
                continue
            code = t[0].rstrip("*")
            few = t[0].endswith("*")
            if t[0] == "Total" and len(t) == 8 and all(isnum(x) for x in t[1:]):
                v = [num(x) for x in t[1:]]
                out[base].append(rec(species=base, year=year, unit="Statewide", method="all",
                                     methodLabel="All hunt codes", sex="all", hunters=v[4], harvest=v[3],
                                     harvestMale=v[0], harvestFemale=v[1], successPct=v[5], daysHunted=v[6],
                                     note=DEER_TOTAL_NOTE.format(y=year) if sp == "deer" else None, sourceId=sid))
                continue
            cp = code_parts(code)
            if not cp:
                continue
            if len(t) != 8 or not all(isnum(x) for x in t[1:]):
                problem(sid, pn, t, "hunt-code row shape")
                continue
            v = [num(x) for x in t[1:]]
            notes = []
            target = base
            if sp == "deer" and code in wt_codes:
                target = "whitetail"
                notes.append(WT_NOTE.format(y=year))
            if few:
                notes.append("CPW flags this hunt code: few hunters responded")
            note = "; ".join(notes) or None
            out[target].append(rec(species=target, year=year, unit=cp["unit"], hunt=code, method=cp["method"],
                                   methodLabel=None if cp["method"] else f"hunt code method letter {cp['methodLetter']}",
                                   sex=cp["sex"], hunters=v[4], harvest=v[3], harvestMale=v[0],
                                   harvestFemale=v[1], successPct=v[5], daysHunted=v[6], note=note, sourceId=sid))


# ------------------------------------------------- bear
BEAR_TITLE = re.compile(r"^(\d{4}) Bear Harvest, Hunters,? and Recreation Days (?:for|by) (.+?)\s*$")
BEAR_SEL = {"All Manners of Take": "all", "September Archery Seasons": "archery",
            "September Muzzleloader Seasons": "muzzleloader", "September Regular Rifle Seasons": "rifle",
            "Concurrent Regular Rifle Seasons": "rifle"}


def parse_bear(doc, out):
    year, sid = doc["year"], doc["sid"]
    cur = None
    note25 = "CPW: Percent Success = total harvest / total licenses sold"
    for pn, lines in enumerate(doc["pages"], 1):
        for ln in lines:
            m = BEAR_TITLE.match(text(ln))
            if m:
                cur = m.group(2)
                continue
            t = ln["tokens"]
            if cur == "Hunt Code":
                if not t:
                    continue
                if t[0] == "Total" and len(t) == 7 and all(isnum(x) for x in t[1:]):
                    v = [num(x) for x in t[1:]]
                    out["bear"].append(rec(species="bear", year=year, unit="Statewide", method="all",
                                           methodLabel="All hunt codes", sex="all", hunters=None, harvest=v[2],
                                           harvestMale=v[0], harvestFemale=v[1], successPct=v[5], daysHunted=v[3],
                                           licenses=v[4], note=note25, sourceId=sid))
                    continue
                cp = code_parts(t[0])
                if not cp:
                    continue
                if len(t) != 7 or not all(isnum(x) for x in t[1:]):
                    problem(sid, pn, t, "bear hunt-code row shape")
                    continue
                v = [num(x) for x in t[1:]]
                out["bear"].append(rec(species="bear", year=year, unit=cp["unit"], hunt=t[0], method=cp["method"],
                                       methodLabel=None if cp["method"] else f"hunt code method letter {cp['methodLetter']}",
                                       sex=cp["sex"], hunters=None, harvest=v[2], harvestMale=v[0], harvestFemale=v[1],
                                       successPct=v[5], daysHunted=v[3], licenses=v[4], note=note25, sourceId=sid))
                continue
            if cur not in BEAR_SEL or not is_data_row(t, r"^\d{1,3}$"):
                continue
            method = BEAR_SEL[cur]
            if not all(isnum(x) for x in t[1:]):
                problem(sid, pn, t, "non-numeric cell")
                continue
            v = [num(x) for x in t[1:]]
            if t[0] == "Total":
                if len(v) != 6:
                    problem(sid, pn, t, "bear total shape")
                    continue
                out["bear"].append(rec(species="bear", year=year, unit="Statewide", method=method, methodLabel=cur,
                                       sex="all", hunters=v[4], harvest=v[2], harvestMale=v[0], harvestFemale=v[1],
                                       successPct=v[5], daysHunted=v[3], sourceId=sid))
            else:
                if len(v) != 4:
                    problem(sid, pn, t, "bear unit row shape")
                    continue
                out["bear"].append(rec(species="bear", year=year, unit=gmu(t[0]), method=method, methodLabel=cur,
                                       sex="all", hunters=None, harvest=v[2], harvestMale=v[0], harvestFemale=v[1],
                                       successPct=None, daysHunted=v[3], sourceId=sid))


# ------------------------------------------------- moose / sheep / goat
MSG_TITLE = re.compile(
    r"^(\d{4}) (Moose|Desert Bighorn Sheep|Rocky Mtn\.? Bighorn Sheep|Rocky Mountain Bighorn Sheep|Mountain Goat)"
    r" (?:Licenses, Hunters, Harvest &|Harvest, Hunters,\s?and) Recreation\s*(?:Days)?.*?(?:for (.+?)|by(?: Hunt Code)?)?\s*$")


def parse_msg(doc, out):
    sp, year, sid = doc["key"], doc["year"], doc["sid"]
    sub = doc.get("sub")  # "Desert Bighorn Sheep" / "Rocky Mountain Bighorn Sheep" for sheep
    label_prefix = f"{sub}: " if sub else ""
    cur = None
    for pn, lines in enumerate(doc["pages"], 1):
        for ln in lines:
            s = text(ln)
            if re.match(r"^\d{4} (Moose|Desert|Rocky|Mountain Goat|Antlered|Antlerless)", s) and (
                    "Recreation" in s or "Licenses" in s):
                if s.endswith("All Manners of Take"):
                    cur = "All Manners of Take"
                elif "Hunt Code" in s or s.endswith(("Recreation", " by")):
                    cur = "Hunt Code"
                else:
                    cur = "other"
                continue
            t = ln["tokens"]
            if cur == "Hunt Code":
                if not t:
                    continue
                if t[0] == "Total" and len(t) == 7 and all(isnum(x) for x in t[1:]):
                    v = [num(x) for x in t[1:]]
                    out[sp].append(rec(species=sp, year=year, unit="Statewide", method="all",
                                       methodLabel=label_prefix + "All hunt codes", sex="all", hunters=v[4],
                                       harvest=v[2], harvestMale=v[0], harvestFemale=v[1], successPct=v[5],
                                       sourceId=sid))
                    continue
                cp = code_parts(t[0])
                if not cp:
                    continue
                if len(t) != 7 or not all(isnum(x) for x in t[1:]):
                    problem(sid, pn, t, "hunt-code row shape")
                    continue
                v = [num(x) for x in t[1:]]
                ml = None if cp["method"] else f"hunt code method letter {cp['methodLetter']}"
                if label_prefix:
                    ml = label_prefix + "by hunt code" + (f" ({ml})" if ml else "")
                out[sp].append(rec(species=sp, year=year, unit=gmu(cp["unit"]), hunt=t[0], method=cp["method"],
                                   methodLabel=ml,
                                   sex=cp["sex"], hunters=v[4], harvest=v[2], harvestMale=v[0], harvestFemale=v[1],
                                   successPct=v[5], sourceId=sid))
                continue
            if cur != "All Manners of Take" or not is_data_row(t, r"^(\d{1,3}|[SG]\d{1,2})$"):
                continue
            label = label_prefix + "All Manners of Take"
            if not all(isnum(x) for x in t[1:]):
                problem(sid, pn, t, "non-numeric cell")
                continue
            v = [num(x) for x in t[1:]]
            unit = "Statewide" if t[0] == "Total" else gmu(t[0])
            if sp == "goat":
                if len(v) not in (7, 6) or (unit == "Statewide") != (len(v) == 6):
                    problem(sid, pn, t, "goat row shape")
                    continue
                lic, hun, hm, hf, ht, sp_ = v[0:6]
                out[sp].append(rec(species=sp, year=year, unit=unit, method="all", methodLabel=label, sex="all",
                                   hunters=hun, harvest=ht, harvestMale=hm, harvestFemale=hf, successPct=sp_,
                                   licenses=lic, sourceId=sid))
                continue
            if len(v) not in (15, 12) or (unit == "Statewide") != (len(v) == 12):
                problem(sid, pn, t, "moose/sheep row shape")
                continue
            lm, lf, lt, um, uf, ut, hm, hf, ht, pm, pf, pt = v[0:12]
            out[sp].append(rec(species=sp, year=year, unit=unit, method="all", methodLabel=label, sex="all",
                               hunters=ut, harvest=ht, harvestMale=hm, harvestFemale=hf, successPct=pt,
                               licenses=lt, sourceId=sid))
            for sx, (l_, u_, h_, p_) in (("male", (lm, um, hm, pm)), ("female", (lf, uf, hf, pf))):
                out[sp].append(rec(species=sp, year=year, unit=unit, method="all", methodLabel=label, sex=sx,
                                   hunters=u_, harvest=h_, successPct=p_, licenses=l_, sourceId=sid))


# ------------------------------------------------- lion
LION_TITLE = re.compile(r"^(\d{4}-\d{4} |\d{4} )?Lion Harvest, Hunters,? and Recreation Days (?:for|by) (.+?)\s*$")


def parse_lion(doc, out):
    year, sid = doc["year"], doc["sid"]
    season = doc["yearLabel"]
    note_season = (f"CPW {season} lion season (license year Apr 1-Mar 31)" if "-" in season else
                   "CPW titles this report '2025'; the report states no season dates")
    note_pct = "CPW: Percent Success = total harvest / total licenses sold"
    cur = None
    pending = []
    for pn, lines in enumerate(doc["pages"], 1):
        for ln in lines:
            s = text(ln)
            m = LION_TITLE.match(s)
            if m:
                cur = m.group(2)
                continue
            t = ln["tokens"]
            if cur == "Hunt Code":
                # 2025: rows are hunts identified by their valid GMU list, which can wrap.
                if not t or s.startswith(("Only includes", "*Percent", "Total Total", "Valid GMUs")):
                    continue
                if t[0] == "Total":
                    v = [num(x) for x in t[1:]]
                    if len(v) != 6:
                        problem(sid, pn, t, "lion total shape")
                        continue
                    out["lion"].append(rec(species="lion", year=year, unit="Statewide", method="all",
                                           methodLabel="All hunts", sex="all", hunters=v[4], harvest=v[2],
                                           harvestMale=v[0], harvestFemale=v[1], successPct=v[5], daysHunted=v[3],
                                           note=note_season + "; " + note_pct, sourceId=sid))
                    continue
                if t[-1].endswith(","):
                    pending.append(s)
                    continue
                if len(t) < 5 or not all(isnum(x) for x in t[-4:]):
                    problem(sid, pn, t, "lion 2025 row shape")
                    continue
                gmus = " ".join(pending + [" ".join(t[:-4])]).strip()
                pending = []
                v = [num(x) for x in t[-4:]]
                out["lion"].append(rec(species="lion", year=year, unit="GMUs " + gmus, method="all",
                                       methodLabel="Hunt (valid GMUs)", sex="all", hunters=None, harvest=v[2],
                                       harvestMale=v[0], harvestFemale=v[1], successPct=None, daysHunted=v[3],
                                       note=note_season, sourceId=sid))
                continue
            if cur != "All Seasons" or not is_data_row(t, r"^\d{1,3}$"):
                continue
            if not all(isnum(x) for x in t[1:]):
                problem(sid, pn, t, "non-numeric")
                continue
            v = [num(x) for x in t[1:]]
            if t[0] == "Total":
                if len(v) != 6:
                    problem(sid, pn, t, "lion total shape")
                    continue
                out["lion"].append(rec(species="lion", year=year, unit="Statewide", method="all",
                                       methodLabel="All Seasons", sex="all", hunters=v[4], harvest=v[2],
                                       harvestMale=v[0], harvestFemale=v[1], successPct=v[5], daysHunted=v[3],
                                       note=note_season, sourceId=sid))
            else:
                if len(v) != 4:
                    problem(sid, pn, t, "lion unit shape")
                    continue
                out["lion"].append(rec(species="lion", year=year, unit=gmu(t[0]), method="all",
                                       methodLabel="All Seasons", sex="all", hunters=None, harvest=v[2],
                                       harvestMale=v[0], harvestFemale=v[1], successPct=None, daysHunted=v[3],
                                       note=note_season, sourceId=sid))


# ------------------------------------------------- turkey (spring)
def turkey_success(hunters, harvest):
    if isinstance(hunters, (int, float)) and hunters > 0 and isinstance(harvest, (int, float)):
        return round(100 * harvest / hunters, 1), True
    return None, None


def parse_turkey(doc, out):
    year, sid = doc["year"], doc["sid"]
    section = None
    for pn, lines in enumerate(doc["pages"], 1):
        for ln in lines:
            t = ln["tokens"]
            s = text(ln)
            if not t:
                continue
            if s.startswith("Unlimited OTC Spring Turkey"):
                section = "otc"
            elif s.startswith("Limited Spring Turkey") or (t[0] == "Hunt" and len(t) > 1 and t[1].startswith("Code")):
                section = "limited"
            elif t[0] == "County*":
                section = "otc"
            cp = code_parts(t[0])
            if cp:
                section = "limited"
                if len(t) != 13:
                    problem(sid, pn, t, "turkey hunt-code shape")
                    continue
                hun, days, harv = t[1], t[5], t[9]
                if not all(isnum(x) for x in (hun, days, harv)):
                    problem(sid, pn, t, "turkey non-numeric")
                    continue
                hun, days, harv = num(hun), num(days), num(harv)
                sp_, comp = turkey_success(hun, harv)
                out["turkey"].append(rec(species="turkey", year=year, unit=cp["unit"], hunt=t[0], method=cp["method"],
                                         methodLabel="Limited spring turkey (estimate by hunt code)", sex=cp["sex"],
                                         hunters=hun, harvest=harv, successPct=sp_, successComputed=comp,
                                         daysHunted=days, sourceId=sid))
                continue
            if section == "otc":
                # County name may be several words; then 12 numbers.
                cells = list(t)
                nums = []
                while cells and (isnum(cells[-1]) or cells[-1] == "NA"):
                    nums.insert(0, cells.pop())
                if len(nums) != 12 or not cells:
                    continue
                name = " ".join(cells)
                if name in ("County*", "Hunt Code*"):
                    continue
                hun, days, harv = (None if x == "NA" else num(x) for x in (nums[0], nums[4], nums[8]))
                if hun is None and harv is None:
                    problem(sid, pn, t, "turkey county: hunters and harvest NA")
                    continue
                sp_, comp = turkey_success(hun, harv)
                unit = "Statewide" if name == "Total" else name
                out["turkey"].append(rec(species="turkey", year=year, unit=unit, method=None,
                                         methodLabel="Unlimited OTC spring turkey (estimate by county)", sex=None,
                                         hunters=hun, harvest=harv, successPct=sp_, successComputed=comp,
                                         daysHunted=days,
                                         note=("CPW printed NA for the harvest estimate" if harv is None else
                                               "County not reported by hunter (as published)" if name == "Unknown" else
                                               "CPW total of the OTC county table" if name == "Total" else None),
                                         sourceId=sid))
    # Statewide (all licenses) from the report narrative.
    body = " ".join(text(l) for pg in doc["pages"] for l in pg)
    m_h = re.search(r"estimated that nearly ([\d,]+) hunters pursued spring turkeys", body)
    m_s = re.search(r"limited and OTC licenses combined, the \d{4} statewide harvest estimate is ([\d,]+)", body)
    m_d = re.search(r"Hunters spent (?:nearly )?([\d,]+) days in the field", body)
    if m_h and m_s:
        hun, harv = num(m_h.group(1)), num(m_s.group(1))
        sp_, comp = turkey_success(hun, harv)
        note = ("From the report text: 'nearly " + m_h.group(1) + " hunters'; statewide harvest estimate (limited + OTC) "
                + m_s.group(1) + ("; days " + ("'nearly " if "nearly " + m_d.group(1) in body else "") + m_d.group(1)
                                  + ("'" if "nearly " + m_d.group(1) in body else "") if m_d else ""))
        if year == 2020:
            note += ". CPW's 2020 text labels this figure 'the 2019 statewide harvest estimate' (apparent typo; it is the 2020 report)"
        out["turkey"].append(rec(species="turkey", year=year, unit="Statewide", method=None,
                                 methodLabel="All spring licenses (limited + OTC)", sex=None, hunters=hun, harvest=harv,
                                 successPct=sp_, successComputed=comp, daysHunted=num(m_d.group(1)) if m_d else None,
                                 note=note, sourceId=sid))
    else:
        problem(sid, 0, [], "turkey statewide narrative not found")


# ------------------------------------------------- row notes for values CPW printed that look odd
SURVEY_SPECIES = {"elk", "mule-deer", "whitetail", "pronghorn", "turkey"}


def add_note(r, text_):
    r["note"] = (r["note"] + "; " + text_) if r.get("note") else text_
    # keep key order stable: note just before sourceId
    sid = r.pop("sourceId")
    r["sourceId"] = sid


def annotate(r):
    h, n, p = r.get("harvest"), r.get("hunters"), r.get("successPct")
    if isinstance(p, (int, float)) and p > 100:
        add_note(r, f"CPW printed a success rate of {p}% (over 100%, from rounded survey estimates); left blank here")
        r["successPct"] = None
        p = None
    if isinstance(h, (int, float)) and isinstance(n, (int, float)) and h > n:
        add_note(r, "As published: CPW's harvest figure exceeds its hunter figure"
                 + (" (independently rounded survey estimates)" if r["species"] in SURVEY_SPECIES else ""))
    if (isinstance(h, (int, float)) and isinstance(n, (int, float)) and isinstance(p, (int, float))
            and n >= 20 and not r.get("successComputed") and abs(100 * h / n - p) > 2):
        lic = r.get("licenses")
        if isinstance(lic, (int, float)) and lic > 0 and abs(100 * h / lic - p) <= 1:
            add_note(r, "CPW's Percent Success in this table equals harvest / licenses issued, not harvest / hunters")
        elif r["species"] in SURVEY_SPECIES:
            add_note(r, "Success % as published; CPW computes it from unrounded survey estimates, so it can differ "
                        "from the rounded harvest / hunters shown")
        else:
            add_note(r, "Success % as published; it does not equal the printed harvest / hunters")


COVERAGE_NOTES = {
    "elk": (
        "Source: CPW annual Big Game Harvest Survey reports (survey-based estimates, not mandatory counts). "
        "2020-2024: per-GMU rows from the tables 'All Manners of Take' (method all), 'All Rifle Seasons', "
        "'All Archery Seasons', 'All Muzzleloader Seasons' and 'First'-'Fourth Rifle Seasons' (sex all; "
        "harvestMale = bulls, harvestFemale = cows; calves are counted in harvest only), plus the 'Percent Success' "
        "tables for All/First-Fourth Rifle and All Muzzleloader as sex male (antlered licenses) and female "
        "(antlerless licenses) rows; CPW notes those tables exclude either-sex hunt codes. unit 'Statewide' rows "
        "are CPW's printed Total lines. 2025: CPW published only a by-hunt-code table (hunts with sufficient "
        "responses) plus a DAU table; rows carry hunt (CPW hunt code) and unit = the GMU digits in the code "
        "(code 000 = multi-unit/OTC hunt, not a GMU); per-GMU totals for 2025 are not published and were not summed. "
        "DAU-level tables, limited-license season tables, PLO/RFW/late/early season tables were not imported. "
        "GMU ids are written 3-digit (CPW prints '1' in 2020-2021 reports and '001' later). "
        "2025 is the most recent season published."),
    "mule-deer": (
        "CPW's deer harvest reports do NOT separate mule deer from white-tailed deer: every row in this file is "
        "ALL deer combined (mostly mule deer) as CPW publishes it. 2020-2024: per-GMU rows from 'All Manners of "
        "Take', 'All Rifle Seasons', 'All Archery Seasons', 'All Muzzleloader Seasons' and '2nd'/'3rd'/'4th Rifle "
        "Seasons' (harvestMale = bucks, harvestFemale = does; fawns only in harvest), plus antlered/antlerless rows "
        "(sex male/female) from the 'Percent Success' tables for 2nd-4th Rifle (CPW: does not include PLOs) and "
        "All Muzzleloader. 2025: by-hunt-code table only (unit = GMU digits of the hunt code); hunt codes listed in "
        "the 2025 big game brochure's white-tailed-deer-only table are in whitetail.json instead, so 2025 rows here "
        "are every other deer hunt code, plus the Statewide 'All hunt codes' row, which is CPW's Total for the whole "
        "table (white-tailed-only codes included). "
        "Survey-based estimates. GMU ids written 3-digit. Unit rows sum to CPW's printed Total within a few "
        "animals (rounding) except 2021 '2nd Rifle Seasons', where CPW's units sum to 13,128 harvest / 27,608 hunters "
        "but its Total line prints 13,016 / 27,333 (both kept as published)."),
    "whitetail": (
        "From CPW's 'All Whitetail Only Seasons' tables (and its Archery/Muzzleloader/Rifle splits) in the deer "
        "harvest reports, 2020-2024: whitetail-only licenses only. 2025: CPW's deer report is by hunt code only; "
        "rows here are the {wt_found} of the {wt_listed} hunt codes in the 'Limited Licenses — White-tailed Deer Only' "
        "table of CPW's 2025 big game brochure (h-co-brochure-biggame-2025, PDF page {wt_pages}) that appear in that "
        "report (unit = GMU digits of the hunt code; {wt_missing} have no row in the report). CPW publishes no 2025 "
        "whitetail-only total; its 2025 deer Total line (in mule-deer.json) covers all deer hunt codes. White-tailed "
        "deer taken on regular deer licenses are inside the deer rows in mule-deer.json and cannot be separated."),
    "pronghorn": (
        "2020-2024: per-GMU rows from 'All Manners of Take', 'All Rifle Seasons', 'All Archery Seasons' and "
        "'All Muzzleloader Seasons' (harvestMale = bucks, harvestFemale = does; fawns only in harvest). 2025: "
        "by-hunt-code table only. Survey-based estimates. GMU ids written 3-digit. The previous repo pronghorn "
        "rows (estimated) are fully replaced by these CPW figures."),
    "bear": (
        "2020-2024: per-GMU harvest (boars, sows, total) and recreation days from 'All Manners of Take' and the "
        "'September Archery', 'September Muzzleloader', 'September Regular Rifle' and 'Concurrent Regular Rifle' "
        "season tables. CPW prints hunters and success only on the statewide Total line, so per-GMU rows have "
        "hunters/successPct null. 2025: by-hunt-code table with licenses sold; CPW's 2025 Percent Success = harvest "
        "/ licenses sold (hunters not published). The 2022 PDF's text layer is unreadable (Type 3 fonts); its values "
        "were decoded glyph-by-glyph and checked against the rendered pages."),
    "moose": (
        "2020-2024: per-GMU 'All Manners of Take' table (mandatory harvest reporting): one sex 'all' row (licenses "
        "issued incl. reissues, hunters, harvest with bulls/cows split, success) plus male and female rows (bull / "
        "antlerless licenses). CPW's 'Average # Days' is an average, not total days, so it is not stored. Antlerless "
        "by-season and Season Choice tables were not imported. 2025: by-hunt-code table (hunt code letter X = CPW "
        "method letter, left unmapped). 2021 and 2022 PDFs have unreadable text layers; values decoded "
        "glyph-by-glyph and checked against the rendered pages and male+female=total arithmetic."),
    "sheep": (
        "Rocky Mountain and desert bighorn are both in this file; methodLabel starts with 'Rocky Mountain Bighorn "
        "Sheep:' or 'Desert Bighorn Sheep:' and each has its own Statewide row. Units are CPW sheep hunt units "
        "(S01...). 2020-2024: 'All Manners of Take' table with sex all/male(ram)/female(ewe) rows; 'Average # Days' "
        "not stored. 2025: by-hunt-code tables. The 2021 Rocky Mountain table has one unlabelled all-zero row that "
        "was skipped. 2020 PDFs read with pdftotext (pdfminer merged adjacent digit columns); checked against the "
        "rendered page."),
    "goat": (
        "Units are CPW goat hunt units (G01...). 2020-2024: 'All Manners of Take' table (licenses, hunters, "
        "harvest billies/nannies). CPW's 2021 Percent Success column equals harvest / licenses issued (noted per "
        "row where it differs from harvest / hunters). 2025: by-hunt-code table. The 2022 PDF text layer is "
        "unreadable; values decoded glyph-by-glyph and checked against the rendered page."),
    "lion": (
        "Lion license year runs April 1 - March 31; year = first year of the license year (2024 = CPW's "
        "'2024-2025' report, which covers the April 2024 and Nov 2024-Mar 2025 seasons). 2020-2024: per-GMU "
        "harvest (males/females) and recreation days from the 'All Seasons' table; hunters and success are printed "
        "only on the statewide Total line (CPW: hunters cannot be calculated per season/unit). Year 2025 is CPW's "
        "report titled '2025' (rows are hunts identified by their list of valid GMUs; CPW's Percent Success = "
        "harvest / licenses sold); the report gives no season dates, so treat 2025 as the most recent license year."),
    "turkey": (
        "Spring season only (CPW posts no fall turkey harvest reports). Rows: limited-license hunts by hunt code "
        "(estimates of hunters, days and harvest; unit = GMU digits of the hunt code), the unlimited OTC table by "
        "county for 2020-2023 (CPW dropped county estimates from 2024), and a Statewide row from the report "
        "narrative (estimated hunters, combined limited + OTC harvest, days). CPW publishes no success rate, so "
        "successPct = harvest / hunters, computed (successComputed). Survey-based estimates with wide confidence "
        "intervals for small hunts. County hunter estimates sum to more than the OTC total because hunters can "
        "hunt several counties. CPW's 2020 county harvest rows sum to 6,477 while its OTC Total line prints 5,873 "
        "(both kept as published). CPW's 2025 report text gives an OTC confidence interval (6,807-7,897) that does "
        "not contain its own OTC estimate (6,746); only point estimates are stored."),
}

SPECIES_KEY = {"elk": "elk", "mule-deer": "deer", "pronghorn": "pronghorn", "bear": "bear", "moose": "moose",
               "sheep": "sheep", "goat": "goat", "lion": "lion", "turkey": "turkey"}
SPECIES_NAME = {"elk": "Elk", "deer": "Deer", "pronghorn": "Pronghorn", "bear": "Black Bear", "moose": "Moose",
                "sheep": "Bighorn Sheep", "goat": "Mountain Goat", "lion": "Mountain Lion", "turkey": "Turkey"}


def jsnum(o):
    """Write integral floats as integers (25.0 -> 25), matching the committed JSON's number style."""
    if isinstance(o, float) and o.is_integer():
        return int(o)
    if isinstance(o, dict):
        return OrderedDict((k, jsnum(v)) for k, v in o.items())
    if isinstance(o, list):
        return [jsnum(v) for v in o]
    return o


WT_YEAR = 2025  # first year CPW's deer harvest report is by hunt code only
WT_BROCHURE_SOURCE = OrderedDict(
    id="h-co-brochure-biggame-2025", title="2025 Colorado Big Game (brochure)", publisher=PUBLISHER,
    url="http://web.archive.org/web/20250214170715/https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure",
    pageUrl="https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure", dataYear=2025,
    retrieved="2026-10-31",
    notes=("Internet Archive capture of CPW's 2025 brochure (CPW replaces the file at the same link every year). Used "
           "only for its 'Limited Licenses — White-tailed Deer Only' hunt code table, which sorts 2025 by-hunt-code "
           "deer harvest rows into whitetail.json (the same table and capture as draw-meta d-brochure-biggame-2025)."))


def main():
    raw = Path(sys.argv[1]).resolve()
    draw_raw = Path(sys.argv[sys.argv.index("--draw-raw") + 1]) if "--draw-raw" in sys.argv else raw.parent / "draw" / "pdf"
    wt_codes, wt_pages, _ = whitetail_codes(str(draw_raw), WT_YEAR)
    if not wt_codes:
        sys.exit(f"no white-tailed-only hunt codes found in the {WT_YEAR} brochure under {draw_raw}")
    manifest = json.loads((raw / "manifest.json").read_text())
    out = defaultdict(list)
    sources = []
    stat_totals = {}
    for m in manifest:
        key = SPECIES_KEY[m["species"]]
        pdf = raw / m["file"]
        pages = page_lines(pdf, raw / "lines")
        sub = None
        if key == "sheep":
            sub = "Desert Bighorn Sheep" if "desert" in m["section"].lower() else "Rocky Mountain Bighorn Sheep"
        tag = {"Desert Bighorn Sheep": "-desert", "Rocky Mountain Bighorn Sheep": "-rm"}.get(sub, "")
        sid = f"h-co-{key}-{m['yearLabel']}{tag}"
        first = next((text(l) for l in pages[0] if text(l)), "")
        title = re.sub(r"\s+", " ", first)
        if key in ("elk", "deer", "pronghorn"):
            title = title  # report cover title, e.g. "2024 Colorado Elk Harvest Estimates"
        notes = []
        if key == "lion":
            notes.append("Season " + m["yearLabel"] + " as labelled on CPW's statistics page")
        if key == "turkey":
            notes.append("Spring season")
        if pdf.stem.replace("_harvest-reports", "") in ("bear_2022", "moose_2021", "moose_2022", "goat_2022"):
            notes.append("PDF text layer uses unmapped Type 3 fonts; values decoded glyph-by-glyph and checked "
                         "against the rendered pages (see scripts/agency/colorado/harvest_pdftext.py)")
        sources.append(OrderedDict(id=sid, title=title, publisher=PUBLISHER, url=m["url"], pageUrl=m["pageUrl"],
                                   dataYear=m["year"], retrieved=m["retrieved"],
                                   **({"notes": "; ".join(notes)} if notes else {})))
        doc = {"key": key, "year": m["year"], "yearLabel": m["yearLabel"], "sid": sid, "pages": pages, "sub": sub}
        if key in ("elk", "deer", "pronghorn"):
            if m["year"] >= 2025:
                parse_huntcode_survey(doc, out, wt_codes if m["year"] == WT_YEAR else frozenset())
            else:
                stat_totals.update({(sid,) + k: v for k, v in parse_survey(doc, out).items()})
        elif key == "bear":
            parse_bear(doc, out)
        elif key in ("moose", "sheep", "goat"):
            parse_msg(doc, out)
        elif key == "lion":
            parse_lion(doc, out)
        elif key == "turkey":
            parse_turkey(doc, out)

    for sp, rows in out.items():
        for r in rows:
            annotate(r)
    wt_found = {r["hunt"] for r in out["whitetail"] if r["year"] == WT_YEAR}
    sources.append(WT_BROCHURE_SOURCE)
    notes_fmt = dict(wt_found=len(wt_found), wt_listed=len(wt_codes), wt_missing=len(wt_codes - wt_found),
                     wt_pages=", ".join(map(str, wt_pages)))

    # ------------- write
    (OUT / "harvest").mkdir(parents=True, exist_ok=True)
    counts = {}
    for sp, rows in sorted(out.items()):
        rows.sort(key=lambda r: (-r["year"], r.get("methodLabel") or "", r["unit"] == "Statewide", ))
        path = OUT / "harvest" / f"{sp}.json"
        body = "[\n" + ",\n".join(json.dumps(jsnum(r), ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n"
        path.write_text(body)
        counts[sp] = (len(rows), path.stat().st_size)
    meta_path = OUT / "harvest-meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta["unitNames"] = {}  # CPW identifies GMUs / hunt units by number only; no names are published
    meta["coverage"] = [
        OrderedDict(species=sp, years=sorted({r["year"] for r in out[sp]}), notes=COVERAGE_NOTES[sp].format(**notes_fmt))
        for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"]
        if out.get(sp)
    ]
    meta["sources"] = sources
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    for sp, (n, b) in counts.items():
        print(f"{sp:10s} {n:6d} rows {b/1e6:5.2f} MB")
    print(len(sources), "sources")
    for p in PROBLEMS:
        print("PROBLEM", p)
    (raw / "build_problems.json").write_text(json.dumps(PROBLEMS, indent=1))


if __name__ == "__main__":
    main()
