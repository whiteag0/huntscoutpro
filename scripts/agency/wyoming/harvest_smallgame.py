#!/usr/bin/env python3
"""Parse WGFD moose, bighorn sheep and mountain goat harvest reports ("Harvest, hunting
pressure, hunter success by hunt area") into HuntScout Pro HarvestRecord JSON.

Usage: python -I harvest_smallgame.py <raw_dir> <out_dir>

These tables centre the hunt-area name and the license-type label vertically against their
rows, so the parser works from pdfplumber word coordinates:
  * a block of rows ends at each TOTAL row; the hunt-area label (number + name) is the one
    printed in the hunt-area column between the previous TOTAL row and this one
    (closed areas, printed as a row of dashes / "CLOSED", are recognised and skipped);
  * each Resident / Nonresident row takes the nearest license-type label (by vertical
    distance) inside its block;
  * WGFD notes (carry-in / carry-out / donor ...) are attached to the nearest row.
Every value is copied as printed; nothing is computed.
"""
import json
import os
import re
import sys
from collections import Counter

import pdfplumber

YEARS = [2020, 2021, 2022, 2023, 2024, 2025]

# per species: value-column order per report year (read from each report's column headers)
CFG = {
    "moose": lambda y: (["licenses", "hunters", "harvest", "Bull", "Cow", "Calf", "days", "dph", "successPct"]
                        if y <= 2023 else
                        ["licenses", "hunters", "Bull", "Cow", "Calf", "harvest", "days", "dph", "successPct"]),
    "sheep": lambda y: ["licenses", "hunters", "Ram", "Ewe", "Lamb", "harvest", "days", "dph", "successPct"],
    "goat": lambda y: (["licenses", "hunters", "Billy", "Nanny", "harvest", "days", "dph", "successPct"]
                       if y <= 2023 else
                       ["licenses", "hunters", "Billy", "Nanny", "Kid", "harvest", "days", "dph", "successPct"]),
}

RES = {"RESIDENT": "resident", "NONRESIDENT": "nonresident", "TOTAL": "all",
       "NONRESIDNET": "nonresident",  # sic, sheep 2025 hunt area 21
       "NONRESIDENTA": "nonresident"}  # footnote marker
NUM = re.compile(r"^-?[\d,]*\.?\d+%?$")
NULLS = {"-", "–", "--", "NA", "NA%", "Inf", "Inf%", "N/A"}
DASHRUN = re.compile(r"([–-]\s+){3,}")
UNPARSED = []  # numeric lines without a recognised residency word


def num(t):
    if t in NULLS:
        return None
    t = t.replace(",", "").rstrip("%")
    return float(t) if "." in t else int(t)


def lines_of(page):
    ws = page.extract_words(x_tolerance=1.5, y_tolerance=2)
    out = []
    for w in sorted(ws, key=lambda w: (w["top"], w["x0"])):
        if out and abs(out[-1]["top"] - w["top"]) < 2.5:
            out[-1]["words"].append(w)
        else:
            out.append({"top": w["top"], "words": [w]})
    for l in out:
        l["words"].sort(key=lambda w: w["x0"])
        l["text"] = " ".join(w["text"] for w in l["words"])
    return out


def is_area_page(text_top):
    t = text_top.upper()
    if "HERD UNIT" in t:
        return False
    return "BY HUNT AREA" in t or ("(CONTINUED)" in t and "HARVEST STATISTICS" in t)


def parse_page(lines):
    """Split a hunt-area table page into data rows, left-hand label fragments and notes.
    Fragments are tagged 'area' (hunt-area column) or 'type' (license-type column) by their
    x position relative to the TYPE header word."""
    rows, frags, notes = [], [], []
    type_x = None
    for l in lines:
        ws = l["words"]
        up = l["text"].upper()
        if type_x is None:
            if "RESIDENCY" in up:
                tw = [w for w in ws if w["text"].upper() == "TYPE"]
                if not tw:
                    return rows, frags, notes  # table without a type column (herd unit)
                type_x = tw[0]["x0"]
            continue
        if "HERD UNIT" in up or re.match(r"^\s*TABLE\b", up):
            break  # next table on the same page
        if not any(w["text"].upper() in RES for w in ws) and re.search(
                r"\b(LICENSES|HUNTERS|SUCCESS|CENSES|HARVEST|VEST|CESS|NOTES)\b", up) and \
                not re.search(r"\b(INCLD|EXCLD|CARRY|DONOR|DONEE|INCLUDES|EXCLUDES|PLUS)", up):
            continue  # second/third line of the column header
        ri = next((i for i, w in enumerate(ws) if w["text"].upper() in RES), None)
        left = ws
        if ri is not None:
            vals, j = [], ri + 1
            while j < len(ws) and (NUM.match(ws[j]["text"]) or ws[j]["text"] in NULLS):
                vals.append(ws[j])
                j += 1
            if vals:
                rows.append({"top": l["top"], "res": RES[ws[ri]["text"].upper()], "vals": vals})
                if j < len(ws):
                    notes.append({"top": l["top"], "text": " ".join(w["text"] for w in ws[j:])})
                left = ws[:ri]
            else:
                ri = None
        if ri is None and sum(1 for w in ws if NUM.match(w["text"])) >= 5:
            UNPARSED.append(l["text"])
        if ri is None:
            res_x = type_x + 20
            left = [w for w in ws if w["x0"] < res_x + 5]
            right = [w for w in ws if w["x0"] >= res_x + 5]
            txt = " ".join(w["text"] for w in right)
            if right and not DASHRUN.search(txt + " ") and txt.upper() != "CLOSED":
                notes.append({"top": l["top"], "text": txt})
        closed = ri is None and ("CLOSED" in up or bool(DASHRUN.search(l["text"] + " ")))
        acol = [w for w in left if w["x0"] < type_x - 8]
        tcol = [w for w in left if w["x0"] >= type_x - 8 and w["text"] not in NULLS]
        if acol:
            frags.append({"top": l["top"], "col": "area", "text": " ".join(w["text"] for w in acol), "closed": closed})
        if tcol:
            frags.append({"top": l["top"], "col": "type", "text": " ".join(w["text"] for w in tcol), "closed": closed})
    return rows, frags, notes


def block_labels(frags):
    """Assemble hunt-area labels from the area-column fragments of one block (y order)."""
    labels, crosses = [], []
    for fr in sorted(frags, key=lambda f: f["top"]):
        t = DASHRUN.sub(" ", fr["text"] + " ").strip()
        if not t or t in NULLS:
            continue
        mc = re.match(r"^\(([^)]*)\)$", t)
        if mc:
            crosses.append({"top": fr["top"], "cross": mc.group(1)})
            continue
        mc2 = re.search(r"\s*\(([^)]*)\)$", t)
        if mc2 and re.match(r"^\d", t):
            crosses.append({"top": fr["top"], "cross": mc2.group(1)})
            t = t[:mc2.start()].strip()
        m = re.match(r"^(\d{1,3})(?:\s*([A-Za-z\u2019'].*))?$", t)
        if m and any(lb["id"] == m.group(1) for lb in labels):
            continue  # label repeated at the top of a continuation page
        if m:
            labels.append({"id": m.group(1), "parts": [m.group(2)] if m.group(2) else [],
                           "closed": fr["closed"], "top": fr["top"]})
        elif labels:
            labels[-1]["parts"].append(t)
        else:
            labels.append({"id": None, "parts": [t], "closed": fr["closed"], "top": fr["top"]})
    return labels, crosses


TYPE_RE = re.compile(r"^(?:\((?P<cross>[^)]*)\)\s*)?(?:(?:TYPE|Type)\s*)?(?P<t>\d+|[A-Z])$")


def clean_name(parts):
    name = " ".join(p.strip() for p in parts if p.strip())
    name = re.sub(r"\s+", " ", name)
    name = re.sub(r"(\w)- (\w)", r"\1-\2", name)  # "THOROFARE- YELLOWSTONE"
    return name


def parse_report(path, species, year, src, unitnames, problems, closed):
    order = CFG[species](year)
    classes = [c for c in order if c[0].isupper()]
    out = []
    carry_rows, carry_frags = [], []  # an area block split across a page break
    with pdfplumber.open(path) as pdf:
        in_table = False
        for pno, page in enumerate(pdf.pages, 1):
            lines = lines_of(page)
            top = " ".join(l["text"] for l in lines[:8])
            if is_area_page(top):
                in_table = True
            elif not (in_table and "(CONTINUED)" in top.upper() and "HERD" not in top.upper()):
                in_table = False
                continue
            rows, frags, notes = parse_page(lines)
            if not rows:
                continue
            full = [r for r in rows if len(r["vals"]) == len(order)]
            if not full:
                problems.append(f"{species} {year} p{pno}: no complete rows")
                continue
            colx = [sorted(r["vals"][i]["x1"] for r in full)[len(full) // 2] for i in range(len(order))]
            for n in notes:
                best = min(rows, key=lambda r: abs(r["top"] - n["top"]))
                if abs(best["top"] - n["top"]) < 14:
                    best.setdefault("note_parts", []).append((n["top"], n["text"]))
            for r in rows:  # map values to columns by x position (this page's columns)
                r["map"], used = {}, set()
                for v in r["vals"]:
                    ci = min(range(len(colx)), key=lambda i: abs(colx[i] - v["x1"]))
                    if ci in used:
                        problems.append(f"{species} {year} p{pno}: column clash {v['text']}")
                    used.add(ci)
                    r["map"][order[ci]] = num(v["text"])
            if carry_rows:
                rows = carry_rows + rows
                frags = carry_frags + frags
                carry_rows, carry_frags = [], []
            prev_top = -1e9
            block = []
            for r in rows:
                block.append(r)
                if r["res"] != "all":
                    continue
                lo, hi = prev_top, r["top"]
                prev_top = r["top"]
                bf = [f for f in frags if lo < f["top"] <= hi + 0.5]
                labels, crosses = block_labels([f for f in bf if f["col"] == "area"])
                for lb in labels:
                    if lb["closed"] and lb["id"]:
                        closed.add((year, lb["id"], clean_name(lb["parts"])))
                opens = [lb for lb in labels if not lb["closed"] and lb["id"]]
                if len(opens) != 1:
                    problems.append(f"{species} {year} p{pno}: block ending y={hi:.0f} labels {[(l['id'], l['parts'], l['closed']) for l in labels]}")
                    block = []
                    continue
                area = opens[0]
                name = clean_name(area["parts"])
                unitnames[area["id"]] = name
                types = []
                for f in bf:
                    if f["col"] != "type":
                        continue
                    t = f["text"].replace("–", " ").strip()
                    if not t:
                        continue
                    if t.upper() in ("ALL",):
                        continue
                    t = re.sub(r"\s+ALL$", "", t)
                    m = TYPE_RE.match(t) or TYPE_RE.match(re.sub(r"^[a-z]\s+", "", t))
                    if not m:
                        problems.append(f"{species} {year} p{pno} area {area['id']}: odd type label {t!r}")
                        continue
                    types.append({"top": f["top"], "type": m.group("t"), "cross": m.group("cross")})
                # license-type groups: a Resident row opens a group, a second Nonresident row
                # opens one too; when the number of groups equals the number of type labels
                # they are matched in vertical order, otherwise nearest label (by y) is used
                types.sort(key=lambda lb: lb["top"])
                groups, cur = [], None
                for br in block:
                    if br["res"] == "all":
                        continue
                    if cur is None or br["res"] == "resident" or "nonresident" in cur:
                        cur = {}
                        groups.append(cur)
                    cur[br["res"]] = br
                    br["group"] = len(groups) - 1
                ordered = len(groups) == len(types)
                for br in block:
                    vals = br["map"]
                    if vals.get("hunters") is None and vals.get("harvest") is None:
                        continue  # closed / no data printed
                    rec = {"species": species, "year": year, "unit": area["id"], "unitName": name}
                    nparts = []
                    if br["res"] == "all":
                        rec["method"] = "all"
                        rec["methodLabel"] = "All license types"
                        rec["residency"] = "all"
                    else:
                        if types:
                            # a Resident row opens a license-type group (label at or below it);
                            # a Nonresident row closes one (label at or above it)
                            inline = [lb for lb in types if abs(lb["top"] - br["top"]) < 3]
                            if inline:
                                t = inline[0]
                            elif ordered:
                                t = types[br["group"]]
                            else:
                                problems.append(f"{species} {year} area {area['id']}: {len(groups)} row groups vs {len(types)} type labels; nearest label used")
                                t = min(types, key=lambda lb: abs(lb["top"] - br["top"]))
                            rec["hunt"] = t["type"]
                            rec["methodLabel"] = f"License type {t['type']}"
                            cross = t["cross"]
                            if not cross and crosses:
                                c = min(crosses, key=lambda lb: abs(lb["top"] - t["top"]))
                                if abs(c["top"] - t["top"]) < 3:
                                    cross = c["cross"]
                            if cross:
                                nparts.append(f"Cross-area license ({cross})")
                        else:
                            problems.append(f"{species} {year} area {area['id']}: row without type label")
                        rec["residency"] = br["res"]
                    rec["hunters"] = vals.get("hunters")
                    rec["harvest"] = vals.get("harvest")
                    rec["successPct"] = vals.get("successPct")
                    rec["daysHunted"] = vals.get("days")
                    rec["licenses"] = vals.get("licenses")
                    cl = [(c, vals.get(c)) for c in classes]
                    nparts.insert(0, ", ".join(f"{c} {v}" for c, v in cl))
                    # WGFD's per-row license-accounting notes (carry-in/out, donor/donee, Governor's,
                    # Supertag ...) wrap across lines in the PDFs and cannot be re-attached to their
                    # rows reliably, so they are not reproduced (see coverage notes).
                    if rec["harvest"] is not None and sum(v or 0 for _, v in cl) != rec["harvest"]:
                        problems.append(f"{species} {year} area {area['id']} {br['res']}: classes {cl} != total {rec['harvest']}")
                        nparts.append("as printed by WGFD, the harvest classes do not add up to the published total")
                    if rec["successPct"] is not None and rec["successPct"] > 100:
                        nparts.append(f"WGFD printed hunter success {rec['successPct']}%")
                        rec["successPct"] = None
                    if rec["hunters"] and rec["harvest"] is not None and rec["successPct"] is not None:
                        calc = 100 * rec["harvest"] / rec["hunters"]
                        if abs(calc - rec["successPct"]) > 0.15:
                            problems.append(f"{species} {year} area {area['id']} {br['res']} {rec.get('hunt')}: success {rec['successPct']} vs {calc:.2f}")
                        if abs(calc - rec["successPct"]) > 2:
                            nparts.append("as printed by WGFD, hunter success does not equal harvest/hunters")
                    rec["note"] = "; ".join(nparts)
                    rec["sourceId"] = src
                    out.append(rec)
                block = []
            if block:
                # block continues on the next page: shift its y positions before that page's
                carry_rows = [{**r, "top": r["top"] - 10000} for r in block]
                carry_frags = [{**f, "top": f["top"] - 10000} for f in frags if f["top"] > prev_top]
            # closed areas printed after the last TOTAL row on the page
            labels, _ = block_labels([f for f in frags if f["top"] > prev_top and f["col"] == "area"])
            for lb in labels:
                if lb["closed"] and lb["id"]:
                    closed.add((year, lb["id"], clean_name(lb["parts"])))
    return out


def main():
    raw, outdir = sys.argv[1], sys.argv[2]
    problems = []
    allnames, closed_all = {}, {}
    for sp in CFG:
        rows, un, closed = [], {}, set()
        for y in YEARS:
            rows += parse_report(os.path.join(raw, f"{sp}_{y}.pdf"), sp, y, f"h-{sp}-{y}", un, problems, closed)
        rows.sort(key=lambda r: (r["year"], int(r["unit"]), r.get("hunt") or "~", r.get("residency") or ""))
        with open(os.path.join(outdir, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=0, separators=(",", ":"))
            f.write("\n")
        allnames[sp] = dict(sorted(un.items(), key=lambda kv: int(kv[0])))
        closed_all[sp] = sorted(closed)
        print(sp, len(rows), dict(sorted(Counter(r["year"] for r in rows).items())))
    with open(os.path.join(raw, "_smallgame_unitnames.json"), "w") as f:
        json.dump({"unitNames": allnames, "closed": closed_all}, f, indent=1)
    problems += [f"numeric line without residency word: {t}" for t in UNPARSED]
    print("PROBLEMS", len(problems))
    for p in problems:
        print("  ", p)


if __name__ == "__main__":
    main()
