#!/usr/bin/env python3
"""Spot-check Montana harvest JSON rows against the raw FWP documents.

Usage: python -I harvest_spotcheck.py <raw_dir> <repo_root> [n_per_species] [seed]

For the six Harvest-Estimates-Search species the check reads the *PDF* output
(pdftotext -layout), independent of the CSV the parser used. Bear and lion are
checked against their PDF report text, turkey against the workbook cells.
Prints each row, the raw line it was checked against, and OK/MISMATCH.
"""
import json
import os
import random
import re
import subprocess
import sys

import openpyxl

CODES = {"elk": "EL", "mule-deer": "DE", "whitetail": "DE", "pronghorn": "PA", "moose": "MO", "sheep": "BS", "goat": "MG"}
RESC = {"all": "SUM", "resident": "R", "nonresident": "N"}
RESW = {"all": "Sum", "resident": "Resident", "nonresident": "Non-Resident"}
_txt = {}


def text(pdf):
    if pdf not in _txt:
        _txt[pdf] = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    return _txt[pdf]


def n(v):
    return None if v in ("-", None) else float(str(v).replace(",", ""))


def check_search(raw, r):
    code = CODES[r["species"]]
    unit = "State" if r["unit"] == "Statewide" else r["unit"]
    parts = [str(r["year"]), re.escape(unit)]
    if code == "DE":
        parts.append({"mule-deer": "md", "whitetail": "wt"}[r["species"]])
    parts.append(RESC[r["residency"]])
    pat = re.compile(r"^\s*" + r"\s+".join(parts) + r"\s+([\d\s]+)$")
    for ln in text(os.path.join(raw, f"search_{code}_{r['year']}.pdf")).splitlines():
        m = pat.match(ln)
        if not m:
            continue
        v = [float(x) for x in m.group(1).split()]
        hunters, days, _dph, total, male, female = v[0:6]
        exp = {}
        if r["method"] == "all":
            exp = {"harvest": total, "harvestMale": male, "harvestFemale": female}
            if r["hunters"] is not None:
                exp["hunters"] = hunters
            if r.get("daysHunted") is not None:
                exp["daysHunted"] = days
            if code == "DE" and r["hunters"] is None and hunters:
                ok_note = f"combined): {int(hunters)}," in r.get("note", "")
                exp["_deer_hunters_in_note"] = 1.0 if ok_note else 0.0
        else:
            bow, rifle = v[7], v[8]
            exp = {"harvest": bow if r["method"] == "archery" else rifle}
        bad = {k: (r.get(k), e) for k, e in exp.items()
               if (k == "_deer_hunters_in_note" and e != 1.0) or (not k.startswith("_") and float(r.get(k)) != e)}
        if r.get("successComputed"):
            calc = round(100 * r["harvest"] / r["hunters"], 1)
            if calc != r["successPct"]:
                bad["successPct"] = (r["successPct"], calc)
        return ln.strip(), bad
    return None, {"row": "not found in PDF text"}


def check_pdf_report(raw, r, kind):
    unit = "State" if r["unit"] == "Statewide" else r["unit"]
    txt = text(os.path.join(raw, f"repo_{kind}_{r['year']}.pdf"))
    if kind == "bear":
        season = r["methodLabel"].replace(" seasons", "").replace(" season", "")
        pat = re.compile(r"^\s*" + re.escape(unit) + r"\s+" + re.escape(season) + r"\s+" + RESW[r["residency"]] + r"\s+([-\d,\s]+)$")
    else:
        pat = re.compile(r"^\s*" + re.escape(unit) + r"\s+" + RESW[r["residency"]] + r"\s+([-\d,\s]+)$")
    hits = [ln for ln in txt.splitlines() if pat.match(ln)]
    if kind == "bear" and r["year"] == 2020 and r["residency"] == "resident":
        lines = txt.splitlines()
        hits = [lines[i] for i, ln in enumerate(lines) if pat.match(ln) and i > 0 and "Non-Resident" in lines[i - 1]]
    if not hits:
        return None, {"row": "not found"}
    ln = hits[0]
    v = pat.match(ln).group(1).split()
    if kind == "bear" and r["year"] == 2024:
        f, m, t = n(v[0]), n(v[1]), n(v[3])
    else:
        f, m, t = n(v[0]), n(v[1]), n(v[2])
    bad = {k: (r[k], e) for k, e in (("harvestFemale", f), ("harvestMale", m), ("harvest", t)) if float(r[k]) != e}
    return ln.strip(), bad


def check_turkey(raw, r):
    wb = openpyxl.load_workbook(os.path.join(raw, f"repo_turkey_{r['year']}.xlsx"), data_only=True, read_only=True)
    d = "State" if r["unit"] == "Statewide" else r["unit"]
    res = RESC[r["residency"]]
    lpt = r.get("hunt", "SUM")
    hrow = next(x for x in wb["turkey_harvest_total"].iter_rows(values_only=True) if x[0] == d and x[1] == res and x[2] == lpt)
    label = r["methodLabel"]
    season = "Combined" if "combined" in label else ("Spring" if label.startswith("Spring") else "Fall")
    exp = {"harvest": {"Combined": hrow[4], "Spring": hrow[9], "Fall": hrow[10]}[season]}
    if lpt == "SUM":
        erow = next((x for x in wb["turkey_effort"].iter_rows(values_only=True) if x[0] == season and x[1] == d and x[2] == res and x[3] == "SUM"), None)
        if erow:
            exp["hunters"] = erow[4]
            exp["daysHunted"] = erow[7]
    bad = {k: (r.get(k), e) for k, e in exp.items() if r.get(k) != e}
    return f"harvest row {hrow[:5]} ...", bad


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    k = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    rng = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 20261031)
    total = fails = 0
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "bear", "lion", "turkey"]:
        rows = json.load(open(os.path.join(repo, "src/data/agency/montana/harvest", f"{sp}.json")))
        for r in rng.sample(rows, k):
            if sp in CODES:
                raw_line, bad = check_search(raw, r)
            elif sp in ("bear", "lion"):
                raw_line, bad = check_pdf_report(raw, r, sp)
            else:
                raw_line, bad = check_turkey(raw, r)
            total += 1
            fails += bool(bad)
            short = {x: r.get(x) for x in ("year", "unit", "hunt", "method", "methodLabel", "residency", "hunters", "harvest", "harvestMale", "harvestFemale", "successPct", "daysHunted") if x in r}
            print(("OK      " if not bad else "MISMATCH"), sp, json.dumps(short))
            print("         raw:", raw_line)
            if bad:
                print("         diff:", bad)
    print(f"{total} rows checked, {fails} mismatches")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
