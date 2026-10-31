#!/usr/bin/env python3
"""Parse WGFD black bear and mountain lion harvest reports (pdftotext -layout output)
into HuntScout Pro HarvestRecord JSON.

Usage: python -I harvest_bearlion.py <raw_dir> <out_dir>

Source tables
  * "Harvest, hunting pressure, hunter success by hunt area": per hunt area a Resident,
    Nonresident and Total row, each with spring / fall / annual hunters, days, harvest plus
    annual days/harvest and annual hunter success.  -> three records per residency row:
    "Spring season", "Fall season" and "Annual (spring + fall)" (method "all").
    WGFD publishes success only for the annual figure; spring/fall success is harvest/hunters
    (1 decimal, successComputed = true) except where the bear management-unit tables publish it.
  * Black bear only: "Spring harvest by management unit" and "Fall harvest by management unit"
    -> female / male harvest and published success for the spring / fall Total rows.
  * Mountain lion only: "by management unit" -> mortality limit (quota) per hunt area, kept in
    the annual Total row note.
Lion report years run Sept 1 - Mar 31/Aug 31 of the next year (e.g. "2021-2022"); year = first year.
"""
import json
import os
import re
import sys
from collections import Counter

import pdfplumber

YEARS = [2020, 2021, 2022, 2023, 2024, 2025]
# The lion file labelled "2020-2021" (wgfd.wyo.gov/media/22073) carries the figures that every
# later WGFD ten-year comparison assigns to the 2019 season (statewide 345 lions, 3,540 resident
# licenses) while those tables give 391 lions for 2020; it is therefore not imported.
SKIP_YEARS = {"lion": {2020}}
RES = {"RESIDENT": "resident", "NONRESIDENT": "nonresident", "TOTAL": "all"}
NUM = re.compile(r"^-?[\d,]*\.?\d+%?$")
NULLS = {"-", "–", "--", "NA", "Inf", "Inf%", "NA%"}


def num(t):
    if t in NULLS:
        return None
    t = t.replace(",", "").rstrip("%")
    return float(t) if "." in t else int(t)


def is_val(t):
    return bool(NUM.match(t)) or t in NULLS


def pages(path):
    return open(path, encoding="utf-8", errors="replace").read().split("\f")


def page_kind(page):
    top = " ".join(" ".join(l.split()) for l in page.split("\n")[:12] if l.strip()).upper()
    if "BY HUNT AREA" in top and "MANAGEMENT" not in top.split("BY HUNT AREA")[0][-40:]:
        return "area"
    if "MANAGEMENT UNIT" in top:
        if "SPRING HARVEST" in top:
            return "mu-spring"
        if "FALL HARVEST" in top:
            return "mu-fall"
        return "mu"
    return None


def parse_area_tables(path, species, year, problems):
    """Return {(unit, residency): (values, rawtext)} and unit names, from pdfplumber word
    coordinates. Residency labels and value rows are paired in vertical order within each
    page (some PDFs print a row's values a few points away from its label)."""
    out, names = {}, {}
    area_id = None
    txtpages = pages(path)
    with pdfplumber.open(path[:-4] + ".pdf") as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            ptxt = txtpages[pno - 1] if pno - 1 < len(txtpages) else ""
            flat = " ".join(ptxt.split()).upper()
            cont_page = bool(area_id) and re.match(r"^TABLE " + re.escape(area_id) + r" \(CONTINUED\)", flat)
            if "BY HUNT AREA" in flat and not cont_page:
                ids = re.findall(r"TABLE ([IVX]+-[A-Z]+|\d+)\b", flat[:flat.index("BY HUNT AREA")])
                area_id = ids[-1] if ids else None
            elif not cont_page:
                area_id = None if not cont_page and pno > 1 and area_id and "TABLE" in flat[:60] else area_id
                continue
            ws = page.extract_words(x_tolerance=1.5, y_tolerance=2)
            # y where the hunt-area table starts on this page: its "BY HUNT AREA" title line,
            # or the page top for a "(continued)" page
            lines = {}
            for w in ws:
                k = round(w["top"] / 3)
                lines.setdefault(k, []).append(w)
            start_y = 0 if cont_page else None
            for k in ([] if cont_page else sorted(lines)):
                t = " ".join(w["text"] for w in sorted(lines[k], key=lambda w: w["x0"])).upper()
                if t.endswith("BY HUNT AREA") and ("(CONTINUED)" in t or t == "BY HUNT AREA"):
                    start_y = 0 if "(CONTINUED)" in t else lines[k][0]["top"]
                    break
            if start_y is None:
                continue
            hdr = [w for w in ws if w["text"].upper() == "RESIDENCY" and w["top"] > start_y]
            if not hdr:
                problems.append(f"{species} {year} p{pno}: no RESIDENCY header")
                continue
            h = min(hdr, key=lambda w: w["top"])
            end_y = min([w["top"] for w in ws if w["text"] in ("TABLE", "Table", "Note:", "•") and w["top"] > h["top"]] + [1e9])
            HDRW = {"HUNT", "AREA", "HARVEST", "SUCCESS", "DAYS/", "DAYS", "/", "HUNTER"}
            body = [w for w in ws if h["bottom"] + 1 < w["top"] < end_y - 2
                    and not (w["top"] < h["bottom"] + 12 and w["text"].upper() in HDRW)]
            labels = sorted([w for w in body if w["text"].upper() in RES and abs(w["x0"] - h["x0"]) < 40],
                            key=lambda w: w["top"])
            if not labels:
                continue
            res_x0 = min(w["x0"] for w in labels)
            res_x1 = max(w["x1"] for w in labels)
            # value rows: numeric words right of the residency column, clustered by y
            vw = sorted([w for w in body if w["x0"] > res_x1 + 2 and (NUM.match(w["text"]) or w["text"] in NULLS)],
                        key=lambda w: (w["top"], w["x0"]))
            vrows = []
            for w in vw:
                if vrows and abs(vrows[-1][0]["top"] - w["top"]) < 3:
                    vrows[-1].append(w)
                else:
                    vrows.append([w])
            vrows = [sorted(r, key=lambda w: w["x0"]) for r in vrows if len(r) >= 9]
            if len(vrows) != len(labels):
                problems.append(f"{species} {year} p{pno}: {len(labels)} residency labels vs {len(vrows)} value rows")
                continue
            for lab, vr in zip(labels, vrows):
                if abs(lab["top"] - vr[0]["top"]) > 4:
                    problems.append(f"{species} {year} p{pno}: note - values printed {vr[0]['top'] - lab['top']:+.0f}pt from label {lab['text']}")
            # area-column fragments (left of the residency column), grouped by line
            used = {id(w) for w in labels} | {id(w) for r in vrows for w in r}
            lw = sorted([w for w in body if id(w) not in used and w["x0"] < res_x0 + 60
                         and not (w["text"].upper() in RES)], key=lambda w: (w["top"], w["x0"]))
            frags = []
            for w in lw:
                if frags and abs(frags[-1]["top"] - w["top"]) < 3:
                    frags[-1]["words"].append(w)
                else:
                    frags.append({"top": w["top"], "words": [w]})
            for f in frags:
                f["text"] = " ".join(w["text"] for w in sorted(f["words"], key=lambda w: w["x0"]))
                f["text"] = re.sub(r"(?<=[A-Za-z])[12]$", "", f["text"])  # footnote markers
            prev = -1e9
            block = []
            for lab, vr in zip(labels, vrows):
                block.append((RES[lab["text"].upper()], [w["text"] for w in vr]))
                if lab["text"].upper() != "TOTAL":
                    continue
                fr = [f for f in frags if prev < f["top"] <= lab["top"] + 3]
                prev = lab["top"] + 3
                fr = [f for f in fr if not re.match(r"^\d+$", f["text"]) or len(fr) > 1]
                ids = [re.match(r"^(\d{1,3})\b\s*(.*)$", f["text"]) for f in fr]
                ids = [m for m in ids if m]
                if len(ids) != 1:
                    problems.append(f"{species} {year} p{pno}: block labels {[f['text'] for f in fr]}")
                    block = []
                    continue
                unit = ids[0].group(1)
                rest = [ids[0].group(2)] + [f["text"] for f in fr if not re.match(r"^\d", f["text"])]
                names[unit] = " ".join(x for x in rest if x).strip()
                for res, v in block:
                    if (unit, res) in out:
                        problems.append(f"{species} {year}: duplicate {unit} {res}")
                    out[(unit, res)] = (v, f"p{pno} {unit} {res}: " + " ".join(v))
                block = []
            if block:
                problems.append(f"{species} {year} p{pno}: {len(block)} rows without TOTAL")
    return out, names


def map_area_vals(vals, raw, problems, ctx):
    """spring h,d,k / fall h,d,k / annual h,d,k / dph / success (11 values)."""
    v = list(vals)
    if len(v) == 10:
        # days/harvest left blank when annual harvest is 0
        if num(v[8]) == 0:
            v.insert(9, "-")
        else:
            problems.append(f"{ctx}: 10 values with non-zero harvest: {raw}")
            return None
    if len(v) != 11:
        problems.append(f"{ctx}: {len(v)} values: {raw}")
        return None
    n = [num(x) for x in v]
    return {"first": n[0:3], "second": n[3:6], "annual": n[6:9], "dph": n[9], "success": n[10]}


def parse_bear_mu(path, year, problems):
    """{(season, unit): dict(female, male, total, hunters, days, success)} from bear MU tables."""
    out = {}
    for pno, page in enumerate(pages(path), 1):
        kind = page_kind(page)
        if kind not in ("mu-spring", "mu-fall"):
            continue
        season = "spring" if kind == "mu-spring" else "fall"
        for line in page.split("\n"):
            toks = line.split()
            if not toks:
                continue
            # drop a leading management-unit name (words) and find "<area> [limit] f m t h d dph s"
            vals = [t for t in toks if is_val(t) or t == "UNLIMITED"]
            words = [t for t in toks if not (is_val(t) or t == "UNLIMITED")]
            if "TOTAL" in [w.upper() for w in words]:
                continue
            if len(vals) not in (8, 9) or not re.match(r"^\d{1,3}$", vals[0]):
                continue
            if not vals[-1].endswith("%") and vals[-1] not in NULLS:
                continue
            area = vals[0]
            f, m, t, h, d, dph, sc = vals[-7:]
            rec = {"female": num(f), "male": num(m), "total": num(t), "hunters": num(h),
                   "days": num(d), "success": num(sc)}
            if rec["female"] is not None and rec["male"] is not None and rec["total"] is not None \
                    and rec["female"] + rec["male"] != rec["total"]:
                problems.append(f"bear {year} MU {season} area {area}: f+m != total: {line.strip()}")
            if (season, area) in out:
                problems.append(f"bear {year} MU {season} area {area}: duplicate")
            out[(season, area)] = rec
    return out


def parse_lion_mu(path, year, problems):
    """{unit: mortality limit text} from the lion management-unit table."""
    out = {}
    for page in pages(path):
        if page_kind(page) != "mu":
            continue
        for line in page.split("\n"):
            toks = line.split()
            vals = [t for t in toks if is_val(t) or t == "UNLIMITED"]
            words = [t for t in toks if not (is_val(t) or t == "UNLIMITED")]
            if "TOTAL" in [w.upper() for w in words] or len(vals) != 7:
                continue
            if not re.match(r"^\d{1,3}$", vals[0]):
                continue
            out[vals[0]] = vals[1]
    return out


def build(species, raw, problems):
    rows, allnames = [], {}
    for year in YEARS:
        if year in SKIP_YEARS.get(species, ()):
            continue
        path = os.path.join(raw, f"{species}_{year}.txt")
        src = f"h-{species}-{year}"
        area, names = parse_area_tables(path, species, year, problems)
        for u, n in names.items():
            allnames.setdefault(u, {})[year] = n
        mu = parse_bear_mu(path, year, problems) if species == "bear" else {}
        limits = parse_lion_mu(path, year, problems) if species == "lion" else {}
        used_mu = set()
        for (unit, res), (vals, rawline) in sorted(area.items(), key=lambda kv: (int(kv[0][0]), kv[0][1])):
            m = map_area_vals(vals, rawline, problems, f"{species} {year} area {unit} {res}")
            if not m:
                continue
            # column groups: bear = spring, fall, annual; lion = fall, spring, annual
            m[("spring", "fall")[0] if species == "bear" else "fall"] = m["first"]
            m["fall" if species == "bear" else "spring"] = m["second"]
            first, second = ("spring", "fall") if species == "bear" else ("fall", "spring")
            for season in (first, second):
                h, d, k = m[season]
                rec = {"species": species, "year": year, "unit": unit, "unitName": names[unit],
                       "methodLabel": f"{season.capitalize()} season", "residency": res,
                       "hunters": h, "harvest": k, "successPct": None, "daysHunted": d}
                note = []
                mm = mu.get((season, unit)) if res == "all" else None
                if mm:
                    used_mu.add((season, unit))
                    if mm["hunters"] == h and mm["total"] == k and mm["days"] == d and \
                            mm["female"] is not None and mm["male"] is not None and mm["female"] + mm["male"] == k:
                        rec["harvestMale"] = mm["male"]
                        rec["harvestFemale"] = mm["female"]
                        rec["successPct"] = mm["success"]
                        note.append(f"Male/female harvest and success from WGFD {season} harvest by management unit table")
                        if h and mm["success"] is not None and abs(100 * k / h - mm["success"]) > 2:
                            # e.g. 2024 HA 15 fall: 1 bear / 53 hunters printed as 19.1%
                            note.append(f"as printed by WGFD, hunter success {mm['success']}% does not equal "
                                        f"harvest/hunters ({100 * k / h:.1f}%)")
                    else:
                        problems.append(f"bear {year} area {unit} {season}: MU row {mm} != area row {(h, d, k)}")
                if rec["successPct"] is None and h and k is not None:
                    rec["successPct"] = round(100 * k / h + 1e-9, 1)
                    rec["successComputed"] = True
                if h is not None and k is not None and k > h:
                    note.append("as published: harvest exceeds hunters (survey estimate)")
                if rec["successPct"] is not None and rec["successPct"] > 100:
                    rec["successPct"] = None
                    rec.pop("successComputed", None)
                if note:
                    rec["note"] = "; ".join(note)
                rec["sourceId"] = src
                if h is None and k is None:
                    continue
                rows.append(rec)
            h, d, k = m["annual"]
            rec = {"species": species, "year": year, "unit": unit, "unitName": names[unit],
                   "method": "all", "methodLabel": "Annual (spring + fall)", "residency": res,
                   "hunters": h, "harvest": k, "successPct": m["success"], "daysHunted": d}
            note = []
            if h and k is not None and m["success"] is not None and abs(100 * k / h - m["success"]) > 0.15:
                problems.append(f"{species} {year} area {unit} {res}: success {m['success']} vs {100 * k / h:.2f}")
                if abs(100 * k / h - m["success"]) > 2:
                    note.append("as printed by WGFD, hunter success does not equal harvest/hunters")
            if h is not None and k is not None and k > h:
                note.append("as published: harvest exceeds hunters (survey estimate)")
            if m["success"] is not None and m["success"] > 100:
                note.append(f"WGFD printed hunter success {m['success']}%")
                rec["successPct"] = None
            if res == "all" and unit in limits:
                note.append(f"Mortality limit (WGFD management-unit table): {limits[unit]}")
            if note:
                rec["note"] = "; ".join(note)
            rec["sourceId"] = src
            rows.append(rec)
            # season sums
            if all(x is not None for x in m["first"] + m["second"] + m["annual"]):
                for i, lab in enumerate(("hunters?", "days?", "harvest")):
                    if i < 2:
                        continue  # annual hunters are unique hunters; days are independent survey estimates
                    if m["first"][i] + m["second"][i] != m["annual"][i]:
                        problems.append(f"{species} {year} area {unit} {res}: spring+fall {lab} != annual ({rawline})")
        # flag printed residency splits that do not add up to the total
        idx = {(r["unit"], r["methodLabel"], r["residency"]): r for r in rows if r["year"] == year}
        for (u, lab, res), r in idx.items():
            if res != "all":
                continue
            a, b = idx.get((u, lab, "resident")), idx.get((u, lab, "nonresident"))
            if a and b and (a["harvest"] or 0) + (b["harvest"] or 0) != (r["harvest"] or 0):
                extra = "as printed by WGFD, resident + nonresident harvest does not equal the total"
                if species == "lion" and year >= 2025:
                    extra += " (WGFD: totals include illegally harvested lions, which are not assigned a residency)"
                r["note"] = (r["note"] + "; " if r.get("note") else "") + extra
        for key in mu:
            if key not in used_mu:
                problems.append(f"bear {year}: MU row {key} not matched to a hunt-area row")
    return rows, allnames


def main():
    raw, outdir = sys.argv[1], sys.argv[2]
    problems = []
    names_out = {}
    for sp in ("bear", "lion"):
        rows, names = build(sp, raw, problems)
        rows.sort(key=lambda r: (r["year"], int(r["unit"]), r["methodLabel"], r["residency"]))
        with open(os.path.join(outdir, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=0, separators=(",", ":"))
            f.write("\n")
        names_out[sp] = names
        print(sp, len(rows), dict(sorted(Counter(r["year"] for r in rows).items())))
    with open(os.path.join(raw, "_bearlion_unitnames.json"), "w") as f:
        json.dump(names_out, f, indent=1)
    print("PROBLEMS", len(problems))
    for p in problems:
        print("  ", p)


if __name__ == "__main__":
    main()
