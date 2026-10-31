"""Build src/data/agency/arizona/harvest/*.json and harvest-meta.json from AZGFD PDFs.

Usage:
  python -I harvest_download.py RAW_DIR          # fetch PDFs (+ regs) and pdftotext them
  python -I harvest_build.py RAW_DIR REPO_ROOT   # parse -> JSON, print cross-checks

Rules: every number is copied from the agency document. The only arithmetic is
(a) mule-deer / white-tailed harvest = that species' Buck + Antlerless columns,
(b) elk harvestMale = Bull + Spike columns, and nothing else. Missing cells stay null.
"""
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from harvest_regs import REGS, WAYBACK_2023, legal_animals, sex_for, species_for  # noqa: E402
from harvest_sources import SOURCES  # noqa: E402
from harvest_specs import spec_for  # noqa: E402
from harvest_table import extract, parse_num  # noqa: E402

RETRIEVED = "2026-10-31"
PUB = "Arizona Game and Fish Department"
PAGE = "https://www.azgfd.com/hunting/hunt-draw-and-licenses/harvest-reporting/"

TITLES = {
    "elk": "{y} Arizona Elk Harvest Questionnaire — Harvest Summary",
    "pronghorn": "{y} Arizona Pronghorn Questionnaire — Harvest Summary",
    "deer": "{y} Arizona Deer Harvest Questionnaire (Draw Hunts Only) — Harvest Summary",
    "otcdeer": "{y} Arizona Over-the-Counter Archery Deer Questionnaire — Harvest Summary",
    "sheep": "{y} Arizona Bighorn Sheep Hunt — Harvest Summary",
    "bear": "{y} Arizona Black Bear Harvest (Mandatory Check-In) Summary",
    "lion": "{y} Arizona Mountain Lion Harvest Summary",
    "turkey-spring": "{y} Arizona Spring Turkey Questionnaire — Harvest Summary",
    "turkey-fall": "{y} Arizona Fall Turkey Questionnaire — Harvest Summary",
}

problems = []
checks = []


def prob(msg):
    problems.append(msg)


def norm(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    s = re.sub(r"\s+,", ",", s)          # "39 , 40A" -> "39, 40A"
    return re.sub(r",(?=\S)", ", ", s)    # "35B,FTHU" -> "35B, FTHU" (extraction lost the space)


def is_total(label):
    return bool(re.match(r"^(total|grand total)\b", label.strip(), re.I))


def is_note(label):
    l = label.strip()
    return (len(l) > 70 or re.fullmatch(r"\d+", l) is not None or "may be less" in l
            or "closed the base" in l or l.startswith("*") or l.lower().startswith("report generated"))


def unbalanced(label):
    return label.count("(") > label.count(")")


def method_for(label):
    l = (label or "").lower()
    if re.search(r"\bham\b", l):
        return "other"
    if "archery" in l:
        return "archery"
    if "muzzleloader" in l:
        return "muzzleloader"
    if "shotgun" in l:
        return "shotgun"
    if "general" in l or "champ" in l:
        return "rifle"
    return None


def elk_sex(label):
    l = (label or "").lower()
    if "any elk" in l:
        return "either"
    if "bull" in l:
        return "male"
    return None


UNIT_WORD = re.compile(r"^(?:\(?\d{1,2}[A-Z]{0,2}\)?,?|[A-Z]{1,4}\d?,?|and|&)$")


def unit_like(label):
    return bool(label) and all(UNIT_WORD.match(w) for w in re.split(r"[\s,]+", label.strip(", ")) if w)


def walk(rows, hunt_based=True):
    """Attach section labels, merge wrapped labels. Returns (data_rows, total_rows)."""
    section = None
    category_method = None
    pending = None
    data, totals = [], []
    last = None
    for r in rows:
        lab = norm(r["label"])
        cells = r["cells"]
        real = {k: v for k, v in cells.items() if v not in ("-", ".")}
        if r["kind"] == "section" or (hunt_based and "hunt" not in cells and not is_total(lab) and not real):
            if not lab or is_note(lab):
                continue
            if unbalanced(lab):
                pending = lab
                continue
            if lab.endswith(")") and "(" not in lab and last is not None and pending is None:
                # tail of a wrapped unit label printed below its row
                last["label"] = norm(last["label"] + " " + lab)
                continue
            section = lab
            m = method_for(lab)
            if m:
                category_method = m
            continue
        if is_total(lab):
            totals.append({"label": lab, "cells": cells, "section": section})
            continue
        if pending is not None:
            lab = norm(pending + " " + lab)
            pending = None
        if hunt_based and "hunt" not in cells:
            if "special tag" in lab.lower() or "sptag" in lab.lower():
                continue  # bighorn auction/raffle special tags: statewide, not a unit hunt
            prob(f"row without hunt number: {lab!r} {cells} line={r['line']!r}")
            continue
        if hunt_based and section and "special tag" in section.lower():
            continue
        if not hunt_based and not unit_like(lab):
            if lab.upper() not in ("PERCENT",):
                checks.append(f"skipped non-unit line: {r['line']!r}")
            continue
        if r["extra"]:
            prob(f"extra tokens: {lab!r} {cells} {r['extra']} line={r['line']!r}")
        rec = {"label": lab, "cells": cells, "section": section, "page": r["page"], "line": r["line"],
               "method": method_for(section) or (category_method if (section or "").startswith("Limited Opportunity") else None)}
        data.append(rec)
        last = rec
    if pending:
        prob(f"dangling wrapped label {pending!r}")
    return data, totals


def num(cells, k, dash_zero=False):
    v = cells.get(k)
    if v is None:
        return None
    if v == "-" and dash_zero:
        return 0
    return parse_num(v)


def success_value(cells):
    s = num(cells, "success")
    if s is None:
        return None, None
    if s > 100:
        return None, f"AZGFD printed {cells['success']} success for this hunt (value above 100% not carried)."
    return s, None


def add_note(rec, text):
    if not text:
        return
    rec["note"] = (rec["note"] + " " + text) if rec.get("note") else text


def clean(rec):
    return {k: v for k, v in rec.items() if v is not None or k in ("hunters", "harvest", "successPct")}


def keep(rec, dropped, sid):
    if rec["hunters"] is None and rec["harvest"] is None and rec["successPct"] is None:
        dropped[(rec["species"], sid)] += 1
        return False
    return True


def sum_check(sid, label, rows, totals, fields):
    """Compare sum of parsed rows to the agency's grand total row."""
    gt = [t for t in totals if re.match(r"^(grand total|total)$", t["label"].strip(), re.I) or t["label"].lower().startswith("grand total")]
    if not gt:
        # sum the section totals (excluding TOTAL, <category> lines that double count)
        secs = [t for t in totals if t["label"].startswith("Total,")]
        tot = {f: sum((num(t["cells"], f) or 0) for t in secs) for f in fields}
        src = f"sum of {len(secs)} 'Total, <section>' rows"
    else:
        tot = {f: num(gt[-1]["cells"], f) for f in fields}
        src = gt[-1]["label"]
    mine = {f: sum((num(r["cells"], f, dash_zero=True) or 0) for r in rows) for f in fields}
    diff = {f: (mine[f], tot[f]) for f in fields if tot[f] is not None and mine[f] != tot[f]}
    checks.append(f"{sid} [{label}] vs {src}: " + ("OK " + str(mine) if not diff else "DIFF " + str(diff)))
    return diff


# Hunts AZGFD printed twice with identical results; the unit kept was checked in that
# year's hunt-draw booklet (elk 2023: hunt 3005 = Unit 5B, Bull elk, per the 2023
# Pronghorn and Elk Hunt Draw Information, page listing hunts 3003-3007).
DUP_KEEP = {("h-elk-2023", "3005"): "5B"}
SAME = ("hunters", "days", "total", "issued")


def dedupe(sid, data):
    by = defaultdict(list)
    for r in data:
        by[r["cells"]["hunt"]].append(r)
    drop = set()
    for h, rs in by.items():
        if len(rs) < 2:
            continue
        if any(tuple(x["cells"].get(k) for k in SAME) != tuple(rs[0]["cells"].get(k) for k in SAME) for x in rs):
            prob(f"{sid}: hunt {h} printed {len(rs)} times with different numbers: {[x['label'] for x in rs]}")
            continue
        want = DUP_KEEP.get((sid, h))
        if want:
            keep_r = next(x for x in rs if x["label"] == want)
        else:
            # keep the row whose Permits Authorized is non-zero / label most specific
            keep_r = max(rs, key=lambda x: ((parse_num(x["cells"].get("auth")) or 0) > 0, len(x["label"])))
        others = [x["label"] for x in rs if x is not keep_r]
        keep_r["dup_note"] = (f"AZGFD's report prints hunt {h} {len(rs)} times with identical results "
                              f"(also labelled {', '.join(repr(o) for o in others)}); one row kept. The report's grand total counts it {len(rs)} times.")
        checks.append(f"{sid}: hunt {h} printed {len(rs)}x; kept {keep_r['label']!r}, dropped {others}")
        drop.update(id(x) for x in rs if x is not keep_r)
    return [r for r in data if id(r) not in drop]


# ---------------------------------------------------------------- per group
def build_hunt_rows(sid, grp, year, data, species, dropped):
    out = []
    season = {"turkey-spring": "Spring turkey", "turkey-fall": "Fall turkey"}.get(grp)
    for r in data:
        c = r["cells"]
        hunters = num(c, "hunters")
        harvest = num(c, "total", dash_zero=(grp == "sheep"))
        succ, snote = success_value(c)
        if grp == "sheep" and c.get("success") == "-" and c.get("total") == "-" and hunters is not None:
            succ = None
        rec = {
            "species": species,
            "year": year,
            "unit": r["label"],
            "hunt": c["hunt"],
            "method": None,
            "methodLabel": None,
            "sex": None,
            "hunters": hunters,
            "harvest": harvest,
            "harvestMale": None,
            "harvestFemale": None,
            "successPct": succ,
            "daysHunted": num(c, "days"),
            "licenses": num(c, "issued"),
            "note": None,
            "sourceId": sid,
        }
        sec = r["section"]
        if grp == "elk":
            rec["methodLabel"] = sec
            rec["method"] = r["method"]
            rec["sex"] = elk_sex(sec)
            bull, spike = num(c, "bull"), num(c, "spike")
            rec["harvestMale"] = bull + spike if bull is not None and spike is not None else None
            rec["harvestFemale"] = num(c, "cow") if "cow" in c or year != 2024 else None
        elif grp == "pronghorn":
            rec["methodLabel"] = sec
            rec["method"] = r["method"]
        elif grp == "sheep":
            add_note(rec, f"{sec} bighorn sheep hunt." if sec else None)
            if c.get("total") == "-":
                add_note(rec, "AZGFD printed '-' for harvest (no ram reported); carried as 0.")
        elif season:
            rec["methodLabel"] = f"{season} — {sec}" if sec else season
            rec["method"] = r["method"]
        add_note(rec, snote)
        add_note(rec, r.get("dup_note"))
        if keep(rec, dropped, sid):
            out.append(clean(rec))
    return out


def pct(c):
    v = c.get("success")
    if v in (None, "-", "."):
        return "not printed"
    return v if v.endswith("%") else v + "%"


def build_deer(sid, year, data, legal_map, dropped, otc=False):
    out = {"mule-deer": [], "whitetail": []}
    unknown = []
    for r in data:
        c = r["cells"]
        hunters = num(c, "hunters")
        total = num(c, "total")
        succ, snote = success_value(c)
        if otc:
            legal = "OTC"
            files = {"mule-deer", "whitetail"}
        else:
            legal = legal_map.get(c["hunt"])
            files = species_for(legal)
            if files is None:
                unknown.append((c["hunt"], r["label"], legal))
                files = {"mule-deer", "whitetail"}
        for sp, pre in (("mule-deer", "md"), ("whitetail", "wt")):
            if sp not in files:
                continue
            buck, antl = num(c, f"{pre}_buck"), num(c, f"{pre}_antlerless")
            harvest = buck + antl if buck is not None and antl is not None else None
            other = num(c, "wt_buck" if pre == "md" else "md_buck"), num(c, "wt_antlerless" if pre == "md" else "md_antlerless")
            single = len(files) == 1
            rec = {
                "species": sp,
                "year": year,
                "unit": r["label"],
                "hunt": None if otc else c["hunt"],
                "method": "archery" if otc else r["method"],
                "methodLabel": "Over-the-counter archery (nonpermit-tag)" if otc else r["section"],
                "sex": None if otc else sex_for(legal),
                "hunters": hunters,
                "harvest": harvest,
                "harvestMale": buck,
                "harvestFemale": antl,
                "successPct": succ if single else None,
                "daysHunted": num(c, "days"),
                "licenses": None if otc else num(c, "issued"),
                "note": None,
                "sourceId": sid,
            }
            other_name = "white-tailed" if pre == "md" else "mule"
            if otc:
                add_note(rec, f"OTC archery deer: hunters and hunter days count all deer archers in the unit (hunters who hunted several units are counted in each). "
                              f"AZGFD % success for all deer combined: {pct(c)} ({c.get('total', 'n/a')} deer total).")
            elif legal and not single:
                add_note(rec, f"Legal animal per {REGS[year][0]}: {legal} (mule deer or white-tailed deer). Hunters and hunter days are all hunters on this hunt; "
                              f"AZGFD % success for all deer combined: {pct(c)} ({c.get('total', 'n/a')} deer total).")
            elif legal is None:
                add_note(rec, f"Hunt not listed with a legal animal in {REGS[year][0]}; hunters are all hunters on this hunt. "
                              f"AZGFD % success for all deer combined: {pct(c)} ({c.get('total', 'n/a')} deer total).")
            else:
                ob, oa = other
                if (ob or 0) + (oa or 0) > 0:
                    add_note(rec, f"Legal animal: {legal}. AZGFD also lists {(ob or 0) + (oa or 0)} {other_name} deer on this hunt; % success is AZGFD's figure for all deer ({c.get('total')}).")
            parts = [num(c, k) for k in ("md_buck", "md_antlerless", "wt_buck", "wt_antlerless")]
            if total is not None and None not in parts and sum(parts) != total:
                add_note(rec, f"AZGFD's Total Harvest column for this {'unit' if otc else 'hunt'} is {total}, while its species columns sum to {sum(parts)}.")
            add_note(rec, snote)
            if keep(rec, dropped, sid):
                out[sp].append(clean(rec))
    return out, unknown


def build_checkin(sid, grp, year, data, totals, species, dropped, tags):
    out = []
    dash0 = year >= 2024  # check-in tables print '-' for none; verified against totals below
    for r in data:
        c = r["cells"]
        hunter = num(c, "hunter", dash_zero=dash0)
        rec = {
            "species": species,
            "year": year,
            "unit": r["label"],
            "hunters": None,
            "harvest": hunter,
            "harvestMale": num(c, "male", dash_zero=dash0),
            "harvestFemale": num(c, "female", dash_zero=dash0),
            "successPct": None,
            "note": None,
            "sourceId": sid,
        }
        if keep(rec, dropped, sid):
            out.append(clean(rec))
    gt = [t for t in totals if t["label"].lower() in ("total", "grand total")]
    if gt:
        c = gt[-1]["cells"]
        rec = {
            "species": species, "year": year, "unit": "Statewide",
            "hunters": None,
            "harvest": num(c, "hunter", dash_zero=dash0),
            "harvestMale": num(c, "male", dash_zero=dash0),
            "harvestFemale": num(c, "female", dash_zero=dash0),
            "successPct": None,
            "licenses": tags,
            "note": "Statewide total row as published (sum of all " + ("zones" if (grp == "lion" and year >= 2022) else "units/hunt areas") + ")."
                    + (f" licenses = AZGFD tag sales ({tags:,})." if tags else " AZGFD: tag sales not yet available.")
                    + (" The 2022 and 2023 mountain lion reports print the same tag-sales figure (10,054); shown as published."
                       if grp == "lion" and year in (2022, 2023) and tags == 10054 else ""),
            "sourceId": sid,
        }
        out.append(clean(rec))
    else:
        prob(f"{sid}: no Total row found")
    return out


def tag_sales(txt):
    m = re.search(r"(?:Tag [Ss]ales|TAG SALES)\s*=?\s*([\d,]+)", txt)
    if m:
        return int(m.group(1).replace(",", ""))
    m = re.search(r"Tags Sold\s+([\d,]+)", txt)
    if m:
        return int(m.group(1).replace(",", ""))
    return None


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    docs = os.path.join(raw, "docs")
    regs_dir = os.path.join(raw, "regs")
    outdir = os.path.join(repo, "src/data/agency/arizona")
    os.makedirs(os.path.join(outdir, "harvest"), exist_ok=True)

    files = defaultdict(list)
    dropped = defaultdict(int)
    sources = []
    legal_by_year = {y: legal_animals(os.path.join(regs_dir, REGS[y][2] + ".txt")) for y in REGS}

    for sid, grp, year, url in SOURCES:
        pdf = os.path.join(docs, sid + ".pdf")
        txt = open(os.path.join(docs, sid + ".txt"), encoding="utf-8", errors="replace").read()
        hunt_based = grp not in ("otcdeer", "bear", "lion")
        rows = extract(pdf, spec_for(grp, year))
        for n in getattr(extract, "notes", []):
            checks.append(f"{sid}: {n}")
        data, totals = walk(rows, hunt_based=hunt_based)
        first = txt.strip().splitlines()[0].strip() if txt.strip() else ""
        prelim = "PRELIMINARY" in txt.upper()[:400]
        sources.append({
            "id": sid,
            "title": TITLES[grp].format(y=year),
            "publisher": PUB,
            "url": url,
            "pageUrl": PAGE,
            "dataYear": year,
            "retrieved": RETRIEVED,
            "notes": ("Preliminary — subject to revision. " if prelim else "") + f"Document heading: \"{norm(first)}\".",
        })
        # duplicate hunt numbers inside one report
        if hunt_based:
            data = dedupe(sid, data)
        if grp in ("elk", "pronghorn", "sheep", "turkey-spring", "turkey-fall"):
            sp = {"turkey-spring": "turkey", "turkey-fall": "turkey"}.get(grp, grp)
            files[sp].extend(build_hunt_rows(sid, grp, year, data, sp, dropped))
            sum_check(sid, grp, data, totals, ["hunters", "total"])
        elif grp in ("deer", "otcdeer"):
            res, unknown = build_deer(sid, year, data, legal_by_year.get(year, {}), dropped, otc=(grp == "otcdeer"))
            for sp, recs in res.items():
                files[sp].extend(recs)
            if grp == "otcdeer":
                gt = [t for t in totals if t["label"].lower() == "total"]
                tags = tag_sales(txt)
                if gt:
                    c = gt[-1]["cells"]
                    for sp, pre in (("mule-deer", "md"), ("whitetail", "wt")):
                        b, a = num(c, f"{pre}_buck"), num(c, f"{pre}_antlerless")
                        files[sp].append(clean({
                            "species": sp, "year": year, "unit": "Statewide",
                            "method": "archery", "methodLabel": "Over-the-counter archery (nonpermit-tag)",
                            "hunters": num(c, "hunters"),
                            "harvest": b + a if b is not None and a is not None else None,
                            "harvestMale": b, "harvestFemale": a,
                            "successPct": None,
                            "daysHunted": num(c, "days"),
                            "licenses": tags,
                            "note": "Statewide OTC archery deer total as published: hunters = actual hunters (each counted once), all deer species. "
                                    f"AZGFD % success for all deer combined: {pct(c)} ({c.get('total')} deer)."
                                    + (f" licenses = AZGFD OTC archery deer tag sales ({tags:,})." if tags else ""),
                            "sourceId": sid,
                        }))
                else:
                    prob(f"{sid}: no Total row")
            if unknown:
                checks.append(f"{sid}: {len(unknown)} hunts without legal animal in regs: {unknown}")
            if grp == "deer":
                sum_check(sid, grp, data, totals, ["hunters", "md_buck", "md_antlerless", "wt_buck", "wt_antlerless", "total"])
            else:
                sum_check(sid, grp, data, totals, ["md_buck", "md_antlerless", "wt_buck", "wt_antlerless", "total"])
        elif grp in ("bear", "lion"):
            sp = grp
            files[sp].extend(build_checkin(sid, grp, year, data, totals, sp, dropped, tag_sales(txt)))
            sum_check(sid, grp, data, totals, ["hunter", "male", "female", "unknown"])

    # regs sources (used only to classify deer hunts by legal species)
    for y, (title, url, stem) in REGS.items():
        sources.append({
            "id": f"h-regs-{y}",
            "title": title,
            "publisher": PUB,
            "url": WAYBACK_2023 if y == 2023 else url,
            "pageUrl": url if y == 2023 else "https://www.azgfd.com/hunting/regulations/",
            "dataYear": y,
            "retrieved": RETRIEVED,
            "notes": "Used only for the Legal Animal of each deer draw hunt (mule deer only / white-tailed only / either), to place deer hunt rows in the right species file."
                     + (" The booklet is no longer in AZGFD's document bucket; this is the Internet Archive capture (2024-01-04) of the AZGFD URL in pageUrl." if y == 2023 else "")
                     + (" Also the source of the mountain lion management zone unit lists in unitNames.lion." if y == 2025 else ""),
        })

    sources.append({
        "id": "h-elk-draw-2023",
        "title": "2023 Pronghorn and Elk Hunt Draw Information",
        "publisher": PUB,
        "url": "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/archive/2023-Pronghorn-and-Elk-Regulations_230120.pdf",
        "dataYear": 2023,
        "retrieved": RETRIEVED,
        "notes": "Used only to confirm that elk hunt 3005 (printed twice in the 2023 elk harvest summary, as Unit 5B and Unit 9) is the Unit 5B bull elk hunt.",
    })
    for sp, recs in files.items():
        for r in recs:
            h, k, sp_ = r.get("hunters"), r.get("harvest"), r.get("successPct")
            if isinstance(h, (int, float)) and isinstance(k, (int, float)):
                if k > h:
                    add_note(r, f"As printed: harvest {k} exceeds hunters {h} (AZGFD estimates hunters and harvest separately from questionnaire returns).")
                elif h > 0 and isinstance(sp_, (int, float)) and abs(100 * k / h - sp_) > 2:
                    add_note(r, f"AZGFD's printed % success ({sp_}%) differs from harvest ÷ hunters ({100 * k / h:.1f}%); both are as printed in the report.")
        recs.sort(key=lambda r: (r["year"], r.get("hunt") or "", r["unit"]))
        with open(os.path.join(outdir, "harvest", f"{sp}.json"), "w") as f:
            json.dump(recs, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"{sp}: {len(recs)} rows")

    from harvest_meta_notes import NOTES as notes
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "bear", "sheep", "lion", "turkey", "moose", "goat"]:
        yrs = sorted({r["year"] for r in files.get(sp, [])})
        n = notes.get("coverage", {}).get(sp, "")
        d = {s_: c for (sp_, s_), c in dropped.items() if sp_ == sp}
        if d:
            n += (" Rows omitted because AZGFD printed no hunters, harvest or % success for the hunt (permits issued, no returns): "
                  + ", ".join(f"{k[2:]}: {v}" for k, v in sorted(d.items())) + ".")
        coverage.append({"species": sp, "years": yrs, "notes": n.strip()})
    meta = {"unitNames": notes.get("unitNames", {}), "coverage": coverage, "sources": sources}
    with open(os.path.join(outdir, "harvest-meta.json"), "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print("\n-- dropped rows (no hunters, harvest or success published):", {f"{a}/{b}": c for (a, b), c in dropped.items()})
    print("\n-- cross-checks")
    for c in checks:
        print(c)
    print("\n-- problems", len(problems))
    for p in problems:
        print(p)


if __name__ == "__main__":
    main()
