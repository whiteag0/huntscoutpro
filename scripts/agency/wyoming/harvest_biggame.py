#!/usr/bin/env python3
"""Parse WGFD elk / deer / antelope annual harvest reports (pdftotext -layout output)
into HuntScout Pro HarvestRecord JSON.

Usage: python -I harvest_biggame.py <raw_dir> <out_dir>
  raw_dir: holds elk_<yr>.txt, deer_<yr>.txt, pronghorn_<yr>.txt (see harvest_download.py)
  out_dir: src/data/agency/wyoming/harvest  (writes elk.json, mule-deer.json, whitetail.json,
           pronghorn.json and _biggame_unitnames.json used by harvest_meta.py)

Tables used (hunt-area level only; herd-unit and nonresident-region tables are skipped):
  * "Harvest, hunting pressure, hunter success by hunt area" (2020-2024 Table I-A / III-A / VI-A;
    2025 "Harvest Statistics by Hunt Area") -> one row per license type + pooled total /
    resident / nonresident rows.
  * "Harvest by method by hunt area" (2020-2024) / "Harvest by Weapon Type and Hunt Area" (2025)
    -> archery / firearm harvest rows (no hunter counts are published for these).
Every number is copied as printed. Nothing is computed except success where noted.
"""
import json
import os
import re
import sys

YEARS = [2020, 2021, 2022, 2023, 2024, 2025]

# report file key -> list of (species key, page-species marker or None, harvest column labels)
SPECIES = {
    "elk": [("elk", None, ["Bull", "Spike", "Cow", "Calf"])],
    "pronghorn": [("pronghorn", None, ["Buck", "Doe", "Fawn"])],
    "deer": [
        ("mule-deer", "MULE DEER", ["Buck", "Doe", "Fawn"]),
        ("whitetail", "WHITE-TAILED DEER", ["Buck", "Doe", "Fawn"]),
    ],
}

NUM = re.compile(r"^-?[\d,]*\.?\d+%?$|^-$")
AREA_HDR = re.compile(r"^\s*(\d{1,3})\s+([A-Za-z][^\d%]*?)\s*(\s\d.*)?$")
POOLED = re.compile(r"^(Pooled Total|Pooled Resident|Pooled Nonresident|Total|Resident|Nonresident)$")


def num(tok):
    if tok == "-":
        return None
    t = tok.replace(",", "").rstrip("%")
    return float(t) if "." in t else int(t)


def classify(page, marker):
    """Return 'stats', 'method' or None for a page (hunt-area tables only)."""
    lines = [l for l in page.split("\n") if l.strip()]
    if not lines:
        return None
    top = " ".join(" ".join(l.split()) for l in lines[:30]).upper()
    if marker:
        # Deer reports: the page title names the species.
        head = " ".join(" ".join(l.split()) for l in lines[:4]).upper()
        other = "WHITE-TAILED DEER" if marker == "MULE DEER" else "MULE DEER"
        if marker not in head or other in head:
            return None
    # column header line of a statistics table
    for l in lines[:40]:
        s = " ".join(l.split()).upper()
        if "TYPE" in s and ("ACTIVE" in s or "LICS/HTRS" in s) and "HARVEST" in s:
            if s.startswith("AREA") or s.startswith("HUNT AREA"):
                return "stats"
            return None
    if ("BY METHOD" in top or "WEAPON TYPE" in top) and "HUNT AREA" in top and "HERD UNIT" not in top:
        return "method"
    return None


NULLTOK = ("-", "Inf", "NA")


def is_val(t):
    return bool(NUM.match(t)) or t in NULLTOK


def split_cross(s):
    """Strip leading balanced '(...)' groups (cross-hunt-area annotations, possibly nested
    or several, e.g. '(88, 89) (also valid from 65)'). Returns (cross_text or None, rest)."""
    s = s.strip()
    groups = []
    while s.startswith("("):
        depth = 0
        for i, ch in enumerate(s):
            depth += ch == "("
            depth -= ch == ")"
            if depth == 0:
                break
        else:
            break
        groups.append(s[1:i].strip())
        s = s[i + 1:].strip()
    return ("; ".join(groups) if groups else None), s


def parse_stats_line(line, k, era):
    """Parse one data line of a hunt-area statistics table.
    Returns {"kind", "label", "f": fields} / {"error": line} / None.
    k = number of harvest-class columns.
    Legacy (2021-2024) column order after the label:
        active, k classes, total, success%, [days/harvest], days, [licenses sold]
    2025 column order:
        active, k classes, total, hunter days, success, days/harvest|-, [licenses sold|-]
    """
    s = " ".join(line.split())
    if not s:
        return None
    m = re.match(r"^(Pooled Total|Pooled Resident|Pooled Nonresident|Total|Resident|Nonresident)\s+(.*)$", s)
    if m:
        kind, label, rest = "pooled", m.group(1), m.group(2)
    else:
        kind = "type"
        cx, s2 = split_cross(s)
        cross = f"({cx}) " if cx else ""
        toks = s2.split()
        if era == "new":
            if not toks or not re.match(r"^(\d+|GEN)$", toks[0]):
                return None
            label, rest = cross + toks[0], " ".join(toks[1:])
        else:
            pct = [i for i, t in enumerate(toks) if t.endswith("%")]
            if not pct:
                # zero-hunter rows print "-" for success
                pct = [i for i, t in enumerate(toks) if t == "-" and i >= k + 2][:1]
            if len(pct) != 1:
                return None
            st = pct[0] - (k + 2)
            if st < 1:
                return {"error": line}
            label, rest = cross + " ".join(toks[:st]), " ".join(toks[st:])
    vals = rest.split()
    if not vals or not all(is_val(v) for v in vals):
        return {"error": line} if kind == "pooled" else None
    n = num
    if len(vals) < k + 3:
        return {"error": line}
    f = {"hunters": n(vals[0]), "classes": [n(v) for v in vals[1:1 + k]], "harvest": n(vals[1 + k])}
    tail = vals[2 + k:]
    if era == "legacy":
        if not (tail[0].endswith("%") or tail[0] == "-"):
            return {"error": line}
        f["successPct"] = n(tail[0])
        t = tail[1:]
        if kind == "pooled":
            if len(t) == 2:
                f["dph"], f["days"] = t
            elif len(t) == 1 and f["harvest"] == 0:
                f["dph"], f["days"] = None, t[0]
            elif len(t) == 1 and f["harvest"] is None:
                f["dph"], f["days"] = None, t[0]
            else:
                return {"error": line}
            f["licenses"] = None
        else:
            general = "General" in label
            if len(t) == 3:
                f["dph"], f["days"], f["licenses"] = t
            elif len(t) == 2 and general:
                f["dph"], f["days"], f["licenses"] = t[0], t[1], None
            elif len(t) == 2 and f["harvest"] == 0 and t[0] not in NULLTOK and "." not in t[0]:
                f["dph"], f["days"], f["licenses"] = None, t[0], t[1]
            elif len(t) == 2 and f["harvest"] == 0:
                f["dph"], f["days"], f["licenses"] = t[0], t[1], None
            elif len(t) == 1 and f["harvest"] == 0 and general:
                f["dph"], f["days"], f["licenses"] = None, t[0], None
            else:
                return {"error": line}
    else:
        if len(tail) < 3 or len(tail) > 4:
            return {"error": line}
        f["days"], f["successPct"], f["dph"] = tail[0], n(tail[1]), tail[2]
        f["licenses"] = tail[3] if len(tail) == 4 else None
    for key in ("dph", "days", "licenses"):
        v = f.get(key)
        f[key] = None if (v is None or v in NULLTOK) else n(v)
    return {"kind": kind, "label": label, "f": f}


def parse_type_label(label):
    """Split '(10) Limited 7' / '(also valid from 28) Limited 6' / '(129) 6' / 'GEN' into
    (cross_text, published_type, hunt)."""
    cross, label = split_cross(label)
    pub = label.strip()
    if pub in ("General", "GEN"):
        hunt = "General"
    else:
        m2 = re.search(r"(\d+)$", pub)
        hunt = m2.group(1) if m2 else pub
    if cross == "Other":
        # Hunt Area 77 (National Elk Refuge), 2025: licenses issued for other areas
        hunt = f"{hunt} (Other)"
    return cross, pub, hunt


def classes_note(names, classes):
    return ", ".join(f"{n} {c}" for n, c in zip(names, classes))


def parse_report(text, year, species, marker, names, source_id, unitnames, problems):
    era = "new" if year >= 2025 else "legacy"
    k = len(names)
    rows = []
    pages = text.split("\f")
    area = None
    cur_kind = None
    method_state = {}
    for pno, page in enumerate(pages, 1):
        kind = classify(page, marker)
        if kind != cur_kind:
            area = None
            cur_kind = kind
        if kind is None:
            continue
        for line in page.split("\n"):
            if not line.strip():
                continue
            if re.match(r"^\s*[.*]+\s", line):  # stray '.' / '*' printed before some rows
                problems.append(f"{species} {year} p{pno}: stripped stray mark: {line.strip()[:60]}")
                line = re.sub(r"^\s*[.*]+\s", " ", line)
            m = AREA_HDR.match(line)
            if m and not re.match(r"^\s*\d+\s*(TABLE|Table)\s+[IVX\d]", line):
                if m.group(3):
                    problems.append(f"{species} {year} p{pno}: ignored stray numbers on area header line: {line.strip()}")
                area = m.group(1)
                unitnames.setdefault(area, " ".join(m.group(2).split()))
                method_state = {}
                continue
            if area is None:
                continue
            if kind == "stats":
                r = parse_stats_line(line, k, era)
                if r is None:
                    if sum(1 for t in line.split() if NUM.match(t)) >= k + 4:
                        problems.append(f"{species} {year} p{pno} area {area}: skipped numeric line: {line.strip()}")
                    continue
                if "error" in r:
                    problems.append(f"{species} {year} p{pno} area {area}: unparsed: {line.strip()}")
                    continue
                f = r["f"]
                rec = {"species": species, "year": year, "unit": area,
                       "unitName": unitnames.get(area)}
                if r["kind"] == "pooled":
                    lab = r["label"].replace("Pooled ", "")
                    rec["method"] = "all"
                    rec["methodLabel"] = "All license types (pooled)"
                    rec["residency"] = {"Total": "all", "Resident": "resident", "Nonresident": "nonresident"}[lab]
                    note = None
                else:
                    cross, pub, hunt = parse_type_label(r["label"])
                    rec["hunt"] = hunt
                    rec["methodLabel"] = f"License type {pub}" if hunt != "General" else "General license"
                    if cross == "Other":
                        note = "WGFD: 'Other' = licenses issued for other hunt areas"
                    elif cross:
                        note = f"Cross-area license ({cross})"
                    else:
                        note = None
                rec["hunters"] = f["hunters"]
                rec["harvest"] = f["harvest"]
                rec["successPct"] = f["successPct"]
                if f["successPct"] is not None and f["successPct"] > 100:
                    # some hunters hold more than one license; keep the printed value in the note
                    note = ((note + "; ") if note else "") + f"WGFD printed hunter success {f['successPct']}% (above 100% because some hunters hold more than one license)"
                    rec["successPct"] = None
                rec["daysHunted"] = f["days"]
                if r["kind"] == "type":
                    rec["licenses"] = f["licenses"]
                parts = [classes_note(names, f["classes"])]
                if note:
                    parts.append(note)
                rec["note"] = "; ".join(parts)
                rec["sourceId"] = source_id
                # integrity checks against the printed row
                if f["harvest"] is not None and sum(c or 0 for c in f["classes"]) != f["harvest"]:
                    problems.append(f"{species} {year} area {area} {r['label']}: class sum {sum(f['classes'])} != total {f['harvest']}")
                    rec["note"] += "; as printed by WGFD, the harvest classes do not add up to the published total"
                if f["hunters"] and f["successPct"] is not None and f["hunters"] >= 20:
                    calc = 100 * f["harvest"] / f["hunters"]
                    if abs(calc - f["successPct"]) > 0.15:
                        problems.append(f"{species} {year} area {area} {r['label']}: success {f['successPct']} vs calc {calc:.2f}")
                    if abs(calc - f["successPct"]) > 2:
                        rec["note"] += "; as printed by WGFD, hunter success does not equal harvest/hunters"
                rows.append(rec)
            else:  # method table
                toks = line.split()
                words = []
                while toks and not NUM.match(toks[0]):
                    words.append(toks.pop(0))
                if len(toks) != k + 1 or not all(NUM.match(t) for t in toks):
                    if words and any(w in ("Archery", "Firearm") for w in words):
                        problems.append(f"{species} {year} p{pno} area {area}: unparsed method line: {line.strip()}")
                    continue
                for w in words:
                    if w in ("Archery", "Firearm"):
                        method_state["m"] = w
                    elif w in ("Total", "Resident", "Nonresident"):
                        method_state["r"] = w
                    else:
                        problems.append(f"{species} {year} area {area}: odd method word {w}: {line.strip()}")
                if "m" not in method_state or "r" not in method_state:
                    problems.append(f"{species} {year} area {area}: method row without state: {line.strip()}")
                    continue
                v = [num(t) for t in toks]
                bad = sum(v[:k]) != v[k]
                if bad:
                    problems.append(f"{species} {year} area {area} method {method_state}: class sum != total: {line.strip()}")
                mth = method_state["m"]
                rec = {"species": species, "year": year, "unit": area, "unitName": unitnames.get(area),
                       "method": "archery" if mth == "Archery" else "other",
                       "methodLabel": mth,
                       "residency": {"Total": "all", "Resident": "resident", "Nonresident": "nonresident"}[method_state["r"]],
                       "hunters": None, "harvest": v[k], "successPct": None,
                       "note": classes_note(names, v[:k]) + "; harvest by weapon used (hunter counts by weapon not published)",
                       "sourceId": source_id}
                if bad:
                    rec["note"] += "; as printed by WGFD, the harvest classes do not add up to the published total"
                rows.append(rec)
    return rows


def main():
    raw, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    allnames = {}
    problems = []
    for key, specs in SPECIES.items():
        for species, marker, names in specs:
            rows = []
            unitnames_latest = {}
            for year in YEARS:
                path = os.path.join(raw, f"{key}_{year}.txt")
                text = open(path, encoding="utf-8", errors="replace").read()
                un = {}
                src = f"h-{key}-{year}"
                rows += parse_report(text, year, species, marker, names, src, un, problems)
                for a, n in un.items():
                    unitnames_latest[a] = n  # latest year wins
            # unitName on each row: as published that year (already set)
            rows.sort(key=lambda r: (r["year"], int(r["unit"]), r.get("hunt") or "", r.get("method") or "", r.get("residency") or ""))
            with open(os.path.join(out, f"{species}.json"), "w") as f:
                json.dump(rows, f, indent=0, separators=(",", ":"))
                f.write("\n")
            allnames[species] = dict(sorted(unitnames_latest.items(), key=lambda kv: int(kv[0])))
            from collections import Counter
            c = Counter(r["year"] for r in rows)
            print(species, len(rows), dict(sorted(c.items())))
    with open(os.path.join(raw, "_biggame_unitnames.json"), "w") as f:
        json.dump(allnames, f, indent=1)
    print("PROBLEMS", len(problems))
    for p in problems:
        print("  ", p)


if __name__ == "__main__":
    main()
