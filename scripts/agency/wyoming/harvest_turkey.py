#!/usr/bin/env python3
"""Parse WGFD wild turkey annual harvest reports (fall + spring "Harvest, hunting pressure,
hunter success by hunt area" / 2025-26 "Harvest Statistics by Management Area") into
HuntScout Pro HarvestRecord JSON.

Usage: python -I harvest_turkey.py <raw_dir> <out_dir>

Each WGFD turkey report covers one fall season and the following spring (e.g. the
"2021-2022" report = fall 2021 + spring 2022); records use the calendar year of the season.
Hunt areas were numbered 1-5 through fall 2023; from spring 2024 WGFD reports by named
management areas, which are kept as the unit id exactly as named (county list in unitName).
Rows: one per license type x residency (hunt = "General" or the type number) and one
"Area Total" row per area (method "all").  Values copied as printed.
"""
import json
import os
import re
import sys
from collections import Counter

import pdfplumber

REPORTS = [2020, 2021, 2022, 2023, 2024, 2025]  # report key = fall year
# Tables deliberately not used.  The spring 2021 section of the 2020-2021 report repeats
# fall-like figures (same license sales as fall, ~600 hens, statewide total 1,456) that do not
# match the spring 2021 statewide harvest WGFD publishes in every later ten-year comparison
# (3,418), so its hunt-area rows are not imported.
SKIP = {(2020, "spring"): "spring 2021 section of the 2020-2021 report is inconsistent with later WGFD ten-year tables"}
NUM = re.compile(r"^-?[\d,]*\.?\d+%?$")
NULLS = {"-", "–", "--", "NA", "Inf", "Inf%"}
RESW = re.compile(r"^(RESIDENT|NONRESIDENT|TOTAL)[a-z]?$", re.I)
COLS = ["hunters", "Tom", "Hen", "harvest", "days", "dph", "successPct"]


def rightmost_per_line(cands):
    """'AREA TOTAL  TOTAL': keep only the right-most residency word on each line."""
    out = []
    for w in sorted(cands, key=lambda w: (w["top"], w["x0"])):
        if out and abs(out[-1]["top"] - w["top"]) < 3:
            if w["x0"] > out[-1]["x0"]:
                out[-1] = w
        else:
            out.append(w)
    return out


def num(t):
    if t in NULLS:
        return None
    t = t.replace(",", "").rstrip("%")
    return float(t) if "." in t else int(t)


def lines_of(words):
    out = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if out and abs(out[-1]["top"] - w["top"]) < 3:
            out[-1]["words"].append(w)
        else:
            out.append({"top": w["top"], "words": [w]})
    for l in out:
        l["words"].sort(key=lambda w: w["x0"])
        l["text"] = " ".join(w["text"] for w in l["words"])
    return out


def smart_title(s):
    if not s.isupper():
        return s
    return " ".join(w[:1] + w[1:].lower() if not w.startswith("(") else "(" + w[1:2] + w[2:].lower()
                    for w in s.split()).replace("/c", "/C")


def find_tables(pdf):
    """Yield (season, season_year, page, y0, y1) regions for each hunt/management-area table,
    following a table onto the next page when it is not closed on its first page."""
    regions = []
    for pi, page in enumerate(pdf.pages):
        ws = page.extract_words(x_tolerance=1.5, y_tolerance=2)
        ls = lines_of(ws)
        titles = [l for l in ls if re.match(r"^(TABLE|Table)\b", l["text"])]
        for i, l in enumerate(ls):
            t = l["text"].upper()
            if t in ("BY HUNT AREA", "BY MANAGEMENT AREA"):
                prev = " ".join(x["text"].upper() for x in ls[max(0, i - 4):i])
                season = "fall" if "FALL WILD TURKEY" in prev else "spring" if "SPRING WILD TURKEY" in prev else None
                yr = next((int(x["text"]) for x in ls[i + 1:i + 3] if re.match(r"^20\d\d$", x["text"])), None)
                nxt = [tt["top"] for tt in titles if tt["top"] > l["top"] + 20]
                regions.append({"season": season, "year": yr, "page": pi, "y0": l["top"],
                                "y1": min(nxt) if nxt else 1e9, "open_end": not nxt})
    return regions


def parse_region(page, y0, y1, problems, ctx):
    ws = [w for w in page.extract_words(x_tolerance=1.5, y_tolerance=2) if y0 < w["top"] < y1]
    hdr = [w for w in ws if w["text"].upper() == "RESIDENCY"]
    if not hdr:
        return None
    h = min(hdr, key=lambda w: w["top"])
    th = [w for w in ws if w["text"].upper() == "TYPE" and abs(w["top"] - h["top"]) < 12]
    type_x = th[0]["x0"] if th else h["x0"] - 60
    body = [w for w in ws if w["top"] > h["top"] + 4]
    labs = rightmost_per_line([w for w in body if RESW.match(w["text"]) and abs(w["x0"] - h["x0"]) < 30])
    if not labs:
        return {"rows": [], "frags": []}
    rx1 = max(w["x1"] for w in labs)
    vw = sorted([w for w in body if w["x0"] > rx1 + 2 and (NUM.match(w["text"]) or w["text"] in NULLS)],
                key=lambda w: (w["top"], w["x0"]))
    vrows = []
    for w in vw:
        if vrows and abs(vrows[-1][0]["top"] - w["top"]) < 3:
            vrows[-1].append(w)
        else:
            vrows.append([w])
    vrows = [sorted(r, key=lambda w: w["x0"]) for r in vrows if len(r) >= 6]
    if len(vrows) != len(labs):
        problems.append(f"{ctx}: {len(labs)} residency labels vs {len(vrows)} value rows")
        return None
    rows = []
    for lab, vr in zip(labs, vrows):
        rows.append({"top": lab["top"], "res": {"RESIDENT": "resident", "NONRESIDENT": "nonresident", "TOTAL": "all"}[
            RESW.match(lab["text"]).group(1).upper()], "vals": [w["text"] for w in vr]})
    used = {id(w) for w in labs} | {id(w) for r in vrows for w in r}
    rest = [w for w in body if id(w) not in used and w["x1"] < h["x0"] - 2]
    frags = []
    for l in lines_of(rest):
        aw = [w for w in l["words"] if w["x1"] < type_x - 4]
        tw = [w for w in l["words"] if w["x1"] >= type_x - 4]
        if aw:
            frags.append({"top": l["top"], "col": "area", "text": " ".join(w["text"] for w in aw)})
        if tw:
            frags.append({"top": l["top"], "col": "type", "text": " ".join(w["text"] for w in tw)})
    return {"rows": rows, "frags": frags}


def map_vals(vals):
    v = list(vals)
    if len(v) == 6:
        v.insert(5, "-")  # blank days/harvest
    if len(v) != 7:
        return None
    return {c: num(x) for c, x in zip(COLS, v)}


def main():
    raw, outdir = sys.argv[1], sys.argv[2]
    problems = []
    out = []
    names = {}
    for rep in REPORTS:
        path = os.path.join(raw, f"turkey_{rep}.pdf")
        src = f"h-turkey-{rep}"
        seen = {}
        with pdfplumber.open(path) as pdf:
            regs = find_tables(pdf)
            for reg in regs:
                if (rep, reg["season"]) in SKIP:
                    problems.append(f"turkey {rep} {reg['season']}: skipped - {SKIP[(rep, reg['season'])]}")
                    continue
                if reg["season"] is None or reg["year"] is None:
                    problems.append(f"turkey {rep}: table without season/year {reg}")
                    continue
                parts = [parse_region(pdf.pages[reg["page"]], reg["y0"], reg["y1"], problems, f"turkey {rep} p{reg['page'] + 1}")]
                if reg["open_end"] and reg["page"] + 1 < len(pdf.pages):
                    nxt = pdf.pages[reg["page"] + 1]
                    nws = nxt.extract_words(x_tolerance=1.5, y_tolerance=2)
                    tt = [w["top"] for w in nws if w["text"] in ("TABLE", "Table")]
                    cut = min(tt) if tt else 1e9
                    # continuation rows only (no header): reuse header geometry from the first part
                    cont = parse_continuation(nxt, cut, pdf.pages[reg["page"]], reg, problems)
                    if cont:
                        parts.append(cont)
                if any(p is None for p in parts):
                    continue
                rows = [r for p in parts for r in p["rows"]]
                frags = [f for p in parts for f in p["frags"]]
                prev = -1e9
                block = []
                for r in rows:
                    block.append(r)
                    if r["res"] != "all":
                        continue
                    bf = [f for f in frags if prev < f["top"] <= r["top"] + 6]
                    prev = r["top"] + 6
                    afr = [f["text"] for f in sorted(bf, key=lambda f: f["top"]) if f["col"] == "area"]
                    afr = [a for a in afr if a.upper() not in ("AREA", "MANAGEMENT", "HUNT AREA")]
                    label = " ".join(afr).strip()
                    label = re.sub(r"\s+", " ", label)
                    m = re.match(r"^(\d{1,2})\s+(.*)$", label)
                    if m:
                        unit, uname = m.group(1), smart_title(m.group(2))
                    else:
                        mm = re.match(r"^(.*?)\s*(\(.*\))?$", label)
                        base = smart_title(mm.group(1).strip())
                        unit = base
                        uname = smart_title(label)
                    if not label:
                        problems.append(f"turkey {rep} {reg['season']}: block without area label")
                        block = []
                        continue
                    names.setdefault(unit, {})[reg["year"]] = uname
                    types = []
                    for f in bf:
                        if f["col"] != "type":
                            continue
                        t = f["text"].upper()
                        if "TOTAL" in t:
                            continue
                        mt = re.match(r"^(GENERAL|TYPE\s*(\d+))$", t)
                        if not mt:
                            problems.append(f"turkey {rep} {reg['season']} {unit}: odd type {f['text']!r}")
                            continue
                        types.append({"top": f["top"], "hunt": "General" if t == "GENERAL" else mt.group(2)})
                    for br in block:
                        v = map_vals(br["vals"])
                        if v is None:
                            problems.append(f"turkey {rep} {unit}: bad values {br['vals']}")
                            continue
                        season = reg["season"].capitalize()
                        rec = {"species": "turkey", "year": reg["year"], "unit": unit, "unitName": uname}
                        if br["res"] == "all":
                            rec["method"] = "all"
                            rec["methodLabel"] = f"{season} season, all license types"
                        else:
                            t = min(types, key=lambda x: abs(x["top"] - br["top"])) if types else None
                            if t is None:
                                problems.append(f"turkey {rep} {unit}: row without type")
                                continue
                            rec["hunt"] = t["hunt"]
                            rec["methodLabel"] = f"{season} season, " + ("general license" if t["hunt"] == "General" else f"license type {t['hunt']}")
                        rec["residency"] = br["res"]
                        rec["hunters"] = v["hunters"]
                        rec["harvest"] = v["harvest"]
                        rec["successPct"] = v["successPct"]
                        rec["daysHunted"] = v["days"]
                        note = [f"Tom {v['Tom']}, Hen {v['Hen']}"]
                        if (v["Tom"] or 0) + (v["Hen"] or 0) != (v["harvest"] or 0):
                            note.append(f"as printed by WGFD, tom + hen ({(v['Tom'] or 0) + (v['Hen'] or 0)}) differs from the published total")
                            problems.append(f"turkey {rep} {unit} {br['res']}: tom+hen != total {v}")
                        if v["successPct"] is not None and v["hunters"]:
                            calc = 100 * v["harvest"] / v["hunters"]
                            if v["successPct"] > 100:
                                note.append(f"WGFD printed hunter success {v['successPct']}% (above 100%: some hunters hold more than one license)")
                                rec["successPct"] = None
                            elif abs(calc - v["successPct"]) > 2:
                                note.append("as printed by WGFD, hunter success does not equal harvest/hunters")
                        if v["hunters"] is not None and v["harvest"] is not None and v["harvest"] > v["hunters"]:
                            note.append("harvest exceeds active hunters as published (more than one license per hunter allowed)")
                        rec["note"] = "; ".join(note)
                        rec["sourceId"] = src
                        key = (rec["year"], rec["unit"], rec.get("hunt"), rec["methodLabel"], rec["residency"])
                        if key in seen:
                            if seen[key] != (rec["hunters"], rec["harvest"]):
                                problems.append(f"turkey {rep}: duplicate table copy disagrees for {key}: kept first {seen[key]}, ignored {(rec['hunters'], rec['harvest'])}")
                            continue
                        seen[key] = (rec["hunters"], rec["harvest"])
                        out.append(rec)
                    block = []
                if block:
                    problems.append(f"turkey {rep} {reg['season']}: {len(block)} rows without Area Total")
    canon = {}
    for r in sorted(out, key=lambda r: r["year"]):
        k = r["unit"].lower()
        if k not in canon or not r["unitName"].isupper():
            if not (k in canon and r["unitName"].split("(")[0].strip().isupper()):
                canon[k] = (re.sub(r"\s*\(.*$", "", r["unitName"]).strip(), r["unitName"]) if not r["unit"].isdigit() else (r["unit"], r["unitName"])
    for r in out:
        r["unit"], r["unitName"] = canon[r["unit"].lower()]
    out.sort(key=lambda r: (r["year"], r["methodLabel"].split(",")[0], r["unit"].zfill(3), r.get("hunt") or "~", r["residency"]))
    with open(os.path.join(outdir, "turkey.json"), "w") as f:
        json.dump(out, f, indent=0, separators=(",", ":"))
        f.write("\n")
    with open(os.path.join(raw, "_turkey_unitnames.json"), "w") as f:
        json.dump(names, f, indent=1)
    print("turkey", len(out), dict(sorted(Counter((r["year"], r["methodLabel"].split(" ")[0]) for r in out).items())))
    print("PROBLEMS", len(problems))
    for p in problems:
        print("  ", p)


def parse_continuation(page, cut, first_page, reg, problems):
    """Rows at the top of the next page (before its first table title) that continue a table."""
    ws = [w for w in page.extract_words(x_tolerance=1.5, y_tolerance=2) if w["top"] < cut - 2]
    fws = first_page.extract_words(x_tolerance=1.5, y_tolerance=2)
    h = [w for w in fws if w["text"].upper() == "RESIDENCY" and reg["y0"] < w["top"] < reg["y1"]]
    if not h or not ws:
        return None
    h = min(h, key=lambda w: w["top"])
    labs = rightmost_per_line([w for w in ws if RESW.match(w["text"]) and abs(w["x0"] - h["x0"]) < 30])
    if not labs:
        return None
    th = [w for w in fws if w["text"].upper() == "TYPE" and abs(w["top"] - h["top"]) < 12]
    type_x = th[0]["x0"] if th else h["x0"] - 60
    rx1 = max(w["x1"] for w in labs)
    vw = sorted([w for w in ws if w["x0"] > rx1 + 2 and (NUM.match(w["text"]) or w["text"] in NULLS)],
                key=lambda w: (w["top"], w["x0"]))
    vrows = []
    for w in vw:
        if vrows and abs(vrows[-1][0]["top"] - w["top"]) < 3:
            vrows[-1].append(w)
        else:
            vrows.append([w])
    vrows = [sorted(r, key=lambda w: w["x0"]) for r in vrows if len(r) >= 6]
    if len(vrows) != len(labs):
        problems.append(f"turkey continuation p{page.page_number}: {len(labs)} labels vs {len(vrows)} rows")
        return None
    rows = [{"top": 5000 + l["top"], "res": {"RESIDENT": "resident", "NONRESIDENT": "nonresident", "TOTAL": "all"}[
        RESW.match(l["text"]).group(1).upper()], "vals": [w["text"] for w in vr]} for l, vr in zip(labs, vrows)]
    used = {id(w) for w in labs} | {id(w) for r in vrows for w in r}
    rest = [w for w in ws if id(w) not in used and w["x1"] < h["x0"] - 2]
    frags = []
    for l in lines_of(rest):
        aw = [w for w in l["words"] if w["x1"] < type_x - 4]
        tw = [w for w in l["words"] if w["x1"] >= type_x - 4]
        if aw:
            frags.append({"top": 5000 + l["top"], "col": "area", "text": " ".join(w["text"] for w in aw)})
        if tw:
            frags.append({"top": 5000 + l["top"], "col": "type", "text": " ".join(w["text"] for w in tw)})
    return {"rows": rows, "frags": frags}


if __name__ == "__main__":
    main()
