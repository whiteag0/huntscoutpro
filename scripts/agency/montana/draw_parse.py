#!/usr/bin/env python3
"""Parse Montana FWP drawing statistics (draw years 2022-2026) into
src/data/agency/montana/draw/<species>.json (DrawRecord[], see schema.ts).

Inputs (downloaded by draw_download.py into <raw_dir>):
  pdf/<objectID>.pdf  FWP drawing reports (PDF; 2022 reports are legacy .xls)
  txt/<objectID>.txt  pdftotext -layout output of the PDFs
  regs/*.txt          pdftotext -layout output of FWP hunting regulations
                      (used only for hunt descriptions, deer species and HD lists)

Two FWP report types are combined per license number ("District" column):
  * "Drawing Statistics Report (ALS30401)": quota, landowner-preference pool and
    regular pool, resident / nonresident, applicants and successful by 1st/2nd/3rd
    choice, total successful, surplus.
  * "Detailed Bonus Point Drawing Statistics": first-choice applications and
    successes per bonus-point level, per residency (regular and landowner pools),
    plus a published TOTAL line per license number.

Nothing is estimated. Odds for resident/nonresident are drawn/applicants
(oddsComputed=true); total odds are FWP's published "% Successful" from the bonus
point report TOTAL line when available.

Usage: python -I draw_parse.py <raw_dir> <repo_root>
"""
import collections
import json
import os
import re
import sys

import xlrd

RETRIEVED = "2026-10-31"
FILE_URL = "https://myfwp.mt.gov/getRepositoryFile?objectID={}"
PAGE_URL = "https://myfwp.mt.gov/fwpPub/drawingStatistics"

# (year, kind) -> (drawing report objectID, bonus point report objectID)
REPORTS = {
    (2022, "elk-permit"): ("106439", "106438"),
    (2022, "elk-b"): ("106987", "107106"),
    (2022, "deer-permit"): ("106437", "106436"),
    (2022, "deer-b"): ("106988", "107105"),
    (2022, "antelope"): ("106986", "107104"),
    (2022, "antelope-b"): ("106984", "107104"),
    (2022, "antelope-archery"): ("106983", "107104"),
    (2022, "moose"): ("106454", "106453"),
    (2022, "sheep"): ("106455", "106453"),
    (2022, "goat"): ("106456", "106453"),
    (2022, "lion"): ("107573", "107572"),
    (2023, "elk-permit"): ("109344", "108847"),
    (2023, "elk-b"): ("109343", "109342"),
    (2023, "deer-permit"): ("108846", "108845"),
    (2023, "deer-b"): ("109341", "109340"),
    (2023, "antelope"): ("109602", "109601"),
    (2023, "antelope-b"): ("109600", "109599"),
    (2023, "antelope-archery"): ("109339", "109807"),
    (2023, "moose"): ("109078", "109079"),
    (2023, "sheep"): ("109080", "109081"),
    (2023, "goat"): ("109076", "109077"),
    (2023, "lion"): ("109520", "109519"),
    (2024, "elk-permit"): ("110886", "110885"),
    (2024, "elk-b"): ("111146", "111145"),
    (2024, "deer-permit"): ("110884", "110883"),
    (2024, "deer-b"): ("111144", "111143"),
    (2024, "antelope"): ("111316", "111317"),
    (2024, "antelope-b"): ("111318", "111319"),
    (2024, "antelope-archery"): ("111142", "111141"),
    (2024, "moose"): ("110967", "110966"),
    (2024, "sheep"): ("110969", "110968"),
    (2024, "goat"): ("110965", "110964"),
    (2024, "lion"): ("111266", "111267"),
    (2025, "elk-permit"): ("112971", "112970"),
    (2025, "elk-b"): ("113237", "113236"),
    (2025, "deer-permit"): ("112969", "112968"),
    (2025, "deer-b"): ("113235", "113234"),
    (2025, "antelope"): ("113586", "113585"),
    (2025, "antelope-b"): ("113584", "113583"),
    (2025, "antelope-archery"): ("113233", "113232"),
    (2025, "moose"): ("113052", "113051"),
    (2025, "sheep"): ("113049", "113048"),
    (2025, "goat"): ("113054", "113053"),
    (2025, "lion"): ("113588", "113587"),
    (2026, "elk-permit"): ("116131", "116130"),
    (2026, "elk-b"): ("116767", "116776"),
    (2026, "deer-permit"): ("116129", "116128"),
    (2026, "deer-b"): ("116766", "116774"),
    (2026, "antelope"): ("117235", "117234"),
    (2026, "antelope-b"): ("117233", "117232"),
    (2026, "antelope-archery"): ("116771", "116773"),
    (2026, "moose"): ("116351", "116359"),
    (2026, "sheep"): ("116346", "116345"),
    (2026, "goat"): ("116353", "116352"),
    (2026, "bear"): ("116050", "116049"),
}

# Bonus-point report "Item Description" values that belong to each kind (used to
# split combined reports such as 2022 antelope/antelope B/900 and 2022 moose/sheep/goat).
BP_ITEMS = {
    "elk-permit": ["ELK PERMIT"],
    "elk-b": ["ELK B LICENSE"],
    "deer-permit": ["DEER PERMIT"],
    "deer-b": ["DEER B LICENSE"],
    "antelope": ["ANTELOPE LICENSE"],
    "antelope-b": ["ANTELOPE B LICENSE"],
    "antelope-archery": ["ANTELOPE 900-20 ARCHERY ONLY", "ANTELOPE 900-20 ARCHERY", "ANTELOPE LICENSE - ARCHERY ONLY"],
    "moose": ["MOOSE LICENSE"],
    "sheep": ["SHEEP LICENSE", "BIGHORN SHEEP LICENSE"],
    "goat": ["GOAT LICENSE", "MOUNTAIN GOAT LICENSE"],
    "lion": ["SPECIAL LIMITED MOUNTAIN LION DRAWING", "LIMITED MOUNTAIN LION DRAWING", "MOUNTAIN LION - LIMITED"],
    "bear": ["BLACK BEAR PERMIT"],
}

KIND_SPECIES = {
    "elk-permit": "elk", "elk-b": "elk", "antelope": "pronghorn", "antelope-b": "pronghorn",
    "antelope-archery": "pronghorn", "moose": "moose", "sheep": "sheep", "goat": "goat",
    "lion": "lion", "bear": "bear",
}
# regulations license type label for DEA kinds
KIND_REGS_TYPE = {
    "elk-permit": "Elk Permit", "elk-b": "Elk B License", "deer-permit": "Deer Permit",
    "deer-b": "Deer B License", "antelope": "Antelope License", "antelope-b": "Antelope B License",
    "antelope-archery": "Antelope License",
}
KIND_LABEL = {
    "elk-permit": "Elk permit", "elk-b": "Elk B license", "deer-permit": "Deer permit",
    "deer-b": "Deer B license", "antelope": "Antelope license", "antelope-b": "Antelope B license",
    "antelope-archery": "Archery-only antelope license", "moose": "Moose license",
    "sheep": "Bighorn sheep license", "goat": "Mountain goat license",
    "lion": "Limited mountain lion license", "bear": "Black bear permit",
}

REGS_DEA = {
    2022: "2022-dea-regulations-final-for-web.txt",
    2023: "2023-dea-regulations-final-for-web.txt",
    2024: "2024-dea-regulations-final-for-web-with-web-quality-maps.txt",
    2025: "2025-dea-regulations-final-for-web.txt",
    2026: "2026-dea-regulations-final-with-low-resolution-maps-for-web.txt",
}
REGS_MSGB = {
    2023: "2023-msgb-final-for-web.txt",
    2024: "2024-msgb-final-for-web.txt",
    2025: "2025-msgb-final-for-web-2.txt",
    2026: "2026-msgb-final-for-web.txt",
}

CODE = r"\d{3}-\d{2}"
NUMTOK = re.compile(r"^(\d+|UNL)$")
log = []


def warn(msg):
    log.append(msg)


# ---------------------------------------------------------------- regulations
def parse_dea_regs(path):
    """code -> {type, desc, hds:set} from the hunting-district tables."""
    pat = re.compile(r"((?:Deer|Elk|Antelope)(?: B)? (?:Permit|License)):\s+(" + CODE + r")(?:\s+(.+?))?(?:\s{2,}|$)")
    hd_pat = re.compile(r"^\s*(?:Portions? of\s+)?HDs?\s+(\d{3}(?:(?:,\s*|\s+and\s+|,\s*and\s+)\d{3})*)\b(?!\s*Check)")
    out = {}
    cur = set()
    lines = [l.rstrip("\n") for l in open(path, encoding="utf-8", errors="replace")]
    # description-only lines (used when a license line wraps, e.g. Deer Permit 455-60)
    desc_only = re.compile(r"^\s{20,}((?:Antlered Buck|Antlerless|Either-sex) (?:Mule|White-tailed) Deer)\s+(?:April|June|Jun)\s+\d")
    for idx, line in enumerate(lines):
        m = hd_pat.match(line)
        if m and not line.strip().startswith("NOTE"):
            cur = set(re.findall(r"\d{3}", m.group(1)))
        for m in pat.finditer(line):
            typ, code, desc = m.groups()
            desc = re.sub(r"\s+(April|Apr|June|Jun|March|Mar|May)\s+\d+.*$", "", desc or "").strip()
            if desc in ("", "OTC:", "April 1", "June 1", "Only youth ages 12-15.") or re.match(r"^\d", desc):
                desc = None
            if desc and desc.endswith(" Only youth ages 12-15."):
                desc = desc[: -len(" Only youth ages 12-15.")] + " (youth ages 12-15 only)"
            e = out.setdefault((typ, code), {"descs": [], "hds": set()})
            if desc and desc not in e["descs"]:
                e["descs"].append(desc)
            if not desc and 0 < idx < len(lines) - 1:
                # description wrapped onto the lines above/below (2022-2025 layout)
                prev = next((re.split(r"\s{2,}", lines[j].strip())[0] for j in range(idx - 1, max(0, idx - 4), -1)
                             if re.match(r"^(Antlered|Antlerless|Either)", lines[j].strip())), "")
                nxt = next((re.split(r"\s{2,}", lines[j].strip())[0] for j in range(idx + 1, min(len(lines), idx + 3))
                            if re.match(r"^(sex |White-tailed|Mule|Deer|Elk)", lines[j].strip())), "")
                if prev and len(prev) < 60:
                    wrapped = prev + ("" if prev.endswith("-") or not nxt else " ") + nxt
                    if wrapped not in e["descs"]:
                        e["descs"].append(wrapped)
            if not desc and not e["descs"]:
                for j in range(max(0, idx - 4), min(len(lines), idx + 5)):
                    dm = desc_only.match(lines[j])
                    if dm and dm.group(1) not in e["descs"]:
                        e["descs"].append(dm.group(1))
            e["hds"].update(cur)
    return out


def parse_msgb_regs(path):
    """species -> code -> [descriptions]; the species is taken from the page side label
    (Moose / Bighorn Sheep / Mountain Goat / Bison) because sheep and goat license
    numbers overlap (e.g. both use -20 / -30)."""
    pat = re.compile(r"(" + CODE + r")\*?\s+([A-Z][A-Za-z/ -]+?)\s+(?:May|Jun|June)\s+\d")
    label = re.compile(r"^\s*(Moose|Bighorn Sheep|Mountain Goat|Bison)\s*$")
    out = collections.defaultdict(dict)
    sect = None
    for line in open(path, encoding="utf-8", errors="replace"):
        m = label.match(line)
        if m:
            sect = {"Moose": "moose", "Bighorn Sheep": "sheep", "Mountain Goat": "goat", "Bison": "bison"}[m.group(1)]
            continue
        if not sect:
            continue
        for m in pat.finditer(line):
            code, desc = m.group(1), m.group(2).strip()
            out[sect].setdefault(code, [])
            if desc not in out[sect][code]:
                out[sect][code].append(desc)
    return out


# ---------------------------------------------------------------- report readers
def xls_rows(path):
    book = xlrd.open_workbook(path)
    sh = book.sheet_by_index(0)
    return [[sh.cell_value(r, c) for c in range(sh.ncols)] for r in range(sh.nrows)]


def num(v):
    if isinstance(v, float):
        if v != int(v):
            raise ValueError(v)
        return int(v)
    v = str(v).strip()
    if v == "UNL":
        return "UNL"
    return int(v)


def parse_drawing_report(raw, oid):
    """code -> {qualifier, vals[23]} ; also returns statewide totals row."""
    out = collections.OrderedDict()
    totals = None
    pdf = os.path.join(raw, "pdf", f"{oid}.pdf")
    head = open(pdf, "rb").read(5)
    if head == b"%PDF-":
        lines = open(os.path.join(raw, "txt", f"{oid}.txt"), encoding="utf-8").read().replace("&amp;", "&").splitlines()
        title = next(l.strip() for l in lines if l.strip())
        after_totals = False
        for ln in lines:
            s = ln.split()
            if not s:
                continue
            if "Totals" in ln and not re.search(r"\d", ln):
                after_totals = True
                continue
            if re.match("^" + CODE + "$", s[0]):
                code = s[0]
                rest = s[1:]
                i = 0
                while i < len(rest) and not NUMTOK.match(rest[i]):
                    i += 1
                qual = " ".join(rest[:i])
                vals = rest[i:]
                if len(vals) != 23 or not all(NUMTOK.match(v) for v in vals):
                    warn(f"{oid}: unparsed drawing row: {ln.strip()[:120]}")
                    continue
                if code in out:
                    warn(f"{oid}: duplicate code {code}")
                out[code] = {"qualifier": qual, "vals": [num(v) for v in vals]}
            elif s[0].startswith("ANY-"):
                warn(f"{oid}: skipped non-district row {s[0]}")
            elif after_totals and len(s) == 23 and all(NUMTOK.match(v) for v in s):
                totals = [num(v) for v in s]
    else:
        rows = xls_rows(pdf)
        title = str(rows[0][0]).strip()
        for i, r in enumerate(rows):
            c0 = str(r[0]).strip()
            if re.match("^" + CODE, c0):
                code = c0[:6]
                qual = c0[6:].strip()
                vals = r[1:24]
                out[code] = {"qualifier": qual, "vals": [num(v) for v in vals]}
            elif c0 == "" and i > 5 and all(isinstance(v, float) for v in r[1:24]):
                totals = [num(v) for v in r[1:24]]
    for e in out.values():
        e["vals"] = [None if v in ("UNL", 99999) else v for v in e["vals"]]
        e["unlimited"] = e["vals"][0] is None
    return title, out, totals


RES_RE = r"(?P<res>NONRESIDENT LANDOWNER|RESIDENT LANDOWNER|NONRESIDENT|RESIDENT)"
BP_ROW = re.compile(
    r"^\s*(?P<item>[A-Z][A-Z0-9 /&\-]*?[A-Z0-9])\s+(?P<code>" + CODE + r")\s+(?:(?P<qt>\S.*?)\s+)??"
    + RES_RE + r"(?:\s+(?P<pts>\d+))?\s+(?P<apps>\d+)\s+(?P<succ>\d+)\s+(?P<pct>[\d.]+)\s*$"
)
BP_TOT = re.compile(
    r"^\s*(?P<item>[A-Z][A-Z0-9 /&\-]*?) TOTAL\s+(?P<code>" + CODE + r")(?:\s+(?P<qt>\S.*?))?\s+(?P<apps>\d+)\s+(?P<succ>\d+)\s+(?P<pct>[\d.]+)\s*$"
)
# Fallback for rows whose qualifier text wraps over 2-3 lines (2023 elk permit report):
# the residency word may be glued to the qualifier, e.g. "(FirstRESIDENT / & Only) / LANDOWNER 1 25 17 68".
BP_WRAP = re.compile(
    r"^\s*(?P<item>[A-Z][A-Z0-9 /&\-]*?[A-Z0-9])(?P<tot> TOTAL)?\s+(?P<code>" + CODE + r")\s+(?P<mid>.*?)"
    r"(?:\s+(?P<pts>\d+))?\s+(?P<apps>\d+)\s+(?P<succ>\d+)\s+(?P<pct>[\d.]+)\s*$"
)


def wrapped_row(text):
    m = BP_WRAP.match(text)
    if not m:
        return None
    mid = m["mid"]
    if m["tot"]:
        return {"item": m["item"], "code": m["code"], "total": True, "qt": mid.strip(),
                "apps": int(m["apps"]), "succ": int(m["succ"]), "pct": float(m["pct"])}
    if "NONRESIDENT" in mid:
        base = "NONRESIDENT"
    elif "RESIDENT" in mid:
        base = "RESIDENT"
    else:
        return None
    res = base + (" LANDOWNER" if "LANDOWNER" in mid else "")
    qt = re.sub(r"\s+", " ", mid.replace("NONRESIDENT", " ").replace("RESIDENT", " ").replace("LANDOWNER", " ")).strip()
    qt = qt.replace("( ", "(").replace(" )", ")")
    return {"item": m["item"], "code": m["code"], "total": False, "res": res, "qt": qt,
            "pts": int(m["pts"]) if m["pts"] is not None else None,
            "apps": int(m["apps"]), "succ": int(m["succ"]), "pct": float(m["pct"])}


def norm_item(s):
    return re.sub(r"\s+", " ", s.strip())


def parse_bp_report(raw, oid):
    """item -> code -> {qt, rows:[(res, pts|None, apps, succ, pct)], total:(apps,succ,pct)}"""
    out = collections.defaultdict(dict)
    pdf = os.path.join(raw, "pdf", f"{oid}.pdf")
    if open(pdf, "rb").read(5) == b"%PDF-":
        lines = [l.rstrip("\n").replace("&amp;", "&") for l in
                 open(os.path.join(raw, "txt", f"{oid}.txt"), encoding="utf-8")]
        i = 0
        while i < len(lines):
            ln = lines[i]
            i += 1
            if not re.search(CODE, ln):
                continue
            m = BP_TOT.match(ln)
            if m:
                e = out[norm_item(m["item"])].setdefault(m["code"], {"qt": set(), "rows": [], "total": None})
                e["total"] = (int(m["apps"]), int(m["succ"]), float(m["pct"]))
                continue
            m = BP_ROW.match(ln)
            if m:
                e = out[norm_item(m["item"])].setdefault(m["code"], {"qt": set(), "rows": [], "total": None})
                if m["qt"]:
                    e["qt"].add(m["qt"].strip())
                e["rows"].append((m["res"], int(m["pts"]) if m["pts"] is not None else None,
                                  int(m["apps"]), int(m["succ"]), float(m["pct"])))
                continue
            # wrapped row: join following indented continuation lines (max 3)
            joined, k = ln, 0
            w = None
            while k < 3 and i + k < len(lines) and lines[i + k].startswith(" ") and not re.search(CODE, lines[i + k]):
                joined += " " + lines[i + k].strip()
                k += 1
                w = wrapped_row(joined)
                if w:
                    break
            if w:
                i += k
                e = out[norm_item(w["item"])].setdefault(w["code"], {"qt": set(), "rows": [], "total": None})
                if w["qt"]:
                    e["qt"].add(w["qt"])
                if w["total"]:
                    e["total"] = (w["apps"], w["succ"], w["pct"])
                else:
                    e["rows"].append((w["res"], w["pts"], w["apps"], w["succ"], w["pct"]))
                continue
            warn(f"{oid}: unparsed BP line: {ln.strip()[:130]}")
    else:
        rows = xls_rows(pdf)
        hdr = None
        for r in rows:
            cells = [str(x).strip() for x in r]
            if "Item Description" in cells:
                hdr = cells
                continue
            if not hdr:
                continue
            d = dict(zip(hdr, r))
            item = norm_item(str(d["Item Description"]))
            code = str(d["District"]).strip()
            if not re.match("^" + CODE + "$", code):
                continue
            is_tot = item.endswith(" TOTAL")
            item = item[:-6].strip() if is_tot else item
            e = out[item].setdefault(code, {"qt": set(), "rows": [], "total": None})
            qt = str(d.get("Quota Type", "")).strip()
            if qt:
                e["qt"].add(qt)
            apps, succ, pct = int(d["Number of Applications"]), int(d["Number of Successes"]), float(d["% Successful"])
            if is_tot:
                e["total"] = (apps, succ, pct)
            else:
                p = d["Number of Points"]
                e["rows"].append((str(d["Residency"]).strip(), None if p == "" else num(p), apps, succ, pct))
    return out


# ---------------------------------------------------------------- record building
def odds(drawn, apps):
    if apps in (None, 0) or drawn is None:
        return None
    return round(100.0 * drawn / apps, 2)


def by_points(rows, year, code, oid):
    """Regular-pool (non-landowner) applications/successes per point level."""
    levels = collections.OrderedDict()
    merged = False
    for res, pts, apps, succ, _pct in rows:
        if res not in ("RESIDENT", "NONRESIDENT"):
            continue
        p = 0 if pts is None else pts
        key = (p, res)
        if key in levels:
            a, s, n = levels[key]
            levels[key] = (a + apps, s + succ, n + 1)
            merged = True
        else:
            levels[key] = (apps, succ, 1)
    pts_sorted = sorted({k[0] for k in levels})
    out = []
    for p in pts_sorted:
        row = {"points": p}
        for res, k in (("RESIDENT", "resident"), ("NONRESIDENT", "nonresident")):
            if (p, res) in levels:
                a, s, _ = levels[(p, res)]
                row[k] = {"applicants": a, "drawn": s}
        out.append(row)
    return out, merged


def min_points(bp_rows, key):
    drawn = [r["points"] for r in bp_rows if r.get(key) and r[key]["drawn"] > 0]
    return min(drawn) if drawn else None


def sex_of(text):
    t = text.lower()
    if "or antlerless" in t or "either" in t or "mule or wt" in t:
        return "either"
    if any(k in t for k in ("antlered", "bull", "ram", "buck")):
        return "male"
    if any(k in t for k in ("antlerless", "doe/fawn", "ewe", "cow", "nanny", "female")):
        return "female"
    return None


def deer_species(desc, qt):
    """Return list of species keys for a deer license, from FWP's own text only."""
    t = (desc or "").lower() + " | " + (qt or "").lower()
    sp = []
    if "mule" in t:
        sp.append("mule-deer")
    if "white-tailed" in t or re.search(r"\bwt\b", t):
        sp.append("whitetail")
    return sp


def main(raw, repo):
    regs_dir = os.path.join(raw, "regs")
    dea = {y: parse_dea_regs(os.path.join(regs_dir, f)) for y, f in REGS_DEA.items()}
    msgb = {y: parse_msgb_regs(os.path.join(regs_dir, f)) for y, f in REGS_MSGB.items()}
    manifest = json.load(open(os.path.join(raw, "manifest.json")))
    bp_cache = {}
    records = collections.defaultdict(list)
    used_sources = {}
    crosscheck = []

    for (year, kind), (doid, boid) in sorted(REPORTS.items()):
        title, draw, totals = parse_drawing_report(raw, doid)
        if boid not in bp_cache:
            bp_cache[boid] = parse_bp_report(raw, boid)
        bp_all = bp_cache[boid]
        bp = {}
        for it in BP_ITEMS[kind]:
            if it in bp_all:
                bp.update(bp_all[it])
        dsid, bsid = f"d-fwp-{doid}", f"d-fwp-{boid}"
        used_sources[dsid] = doid
        used_sources[bsid] = boid
        # statewide cross-check: sum of district rows vs FWP totals row
        if totals:
            sums = [sum((e["vals"][i] or 0) for e in draw.values()) for i in range(23)]
            diffs = {i: (sums[i], totals[i]) for i in (0, 8, 11, 15, 18, 21) if totals[i] is not None and sums[i] != totals[i]}
            crosscheck.append((year, kind, doid, len(draw), {k: v for k, v in diffs.items()}))
        for code, e in draw.items():
            v = e["vals"]
            (quota, lr_qta, lr_a1, lr_s1, ln_qta, ln_a1, ln_s1, r_qta, r_a1, r_a2, r_a3, r_s1, r_s2, r_s3,
             n_qta, n_a1, n_a2, n_a3, n_s1, n_s2, n_s3, tot_succ, surplus) = v
            b = bp.get(code)
            qual = e["qualifier"]
            qt = " / ".join(sorted(b["qt"])) if b and b["qt"] else ""
            notes = []
            # ---- description
            regs_desc = None
            units = []
            if kind in KIND_REGS_TYPE:
                rg = dea[year].get((KIND_REGS_TYPE[kind], code))
                if rg:
                    ds = [d for d in rg["descs"] if not any(o != d and o.startswith(d) for o in rg["descs"])]
                    regs_desc = "; ".join(ds) if ds else None
                    units = sorted(rg["hds"])
            else:
                if kind in ("moose", "sheep", "goat") and year in msgb and code in msgb[year].get(kind, {}):
                    regs_desc = "; ".join(msgb[year][kind][code])
                units = [code[:3]]
            label = KIND_LABEL[kind]
            desc = f"{label} {code}"
            if regs_desc:
                desc += f": {regs_desc}"
            # FWP's MULE/WT quota-type codes are redundant once the regulations description is present
            extra = " ".join(dict.fromkeys(x for x in (qual, qt) if x and not (regs_desc and x in ("WT", "MULE", "MULE OR WT"))))
            if extra and (not regs_desc or extra.lower() not in regs_desc.lower()):
                desc += f" [{extra}]"
            if kind in ("antelope-archery",):
                method, method_label = "archery", "Archery only"
            elif "ARCHERY" in qual.upper():
                method, method_label = "archery", "Archery only"
            else:
                method, method_label = None, None
            sex = sex_of(" ".join(x for x in (regs_desc or "", qual, qt)))
            # ---- species
            if kind.startswith("deer"):
                species_list = deer_species(regs_desc, qt)
                if not species_list:
                    warn(f"{year} {kind} {code}: deer species not stated in FWP regs/report -> skipped")
                    continue
                if len(species_list) == 2:
                    notes.append("FWP lists this license as valid for mule deer or white-tailed deer; the same record appears in both the mule-deer and whitetail files.")
            else:
                species_list = [KIND_SPECIES[kind]]
            # ---- stats
            bpr, merged = by_points(b["rows"], year, code, boid) if b else ([], False)
            res = {"quota": r_qta, "applicants": r_a1, "drawn": r_s1,
                   "oddsPct": odds(r_s1, r_a1), "oddsComputed": True}
            nres = {"quota": n_qta, "applicants": n_a1, "drawn": n_s1,
                    "oddsPct": odds(n_s1, n_a1), "oddsComputed": True}
            if bpr:
                res["minPoints"] = min_points(bpr, "resident")
                nres["minPoints"] = min_points(bpr, "nonresident")
            if b and b["total"]:
                ta, ts, tp = b["total"]
                total = {"quota": quota, "applicants": ta, "drawn": ts, "oddsPct": tp}
                notes.append("Total = FWP bonus-point report TOTAL line (all first-choice applications incl. landowner pool).")
            else:
                ta = lr_a1 + ln_a1 + r_a1 + n_a1
                ts = lr_s1 + ln_s1 + r_s1 + n_s1
                total = {"quota": quota, "applicants": ta, "drawn": ts, "oddsPct": odds(ts, ta), "oddsComputed": True}
                notes.append("Total = sum of FWP first-choice columns (landowner + regular, resident + nonresident).")
            for lab, st in (("resident", res), ("nonresident", nres)):
                if st["applicants"] is not None and st["drawn"] is not None and st["drawn"] > st["applicants"]:
                    st["oddsPct"] = None
                    notes.append(f"FWP reports more {lab} first-choice successes ({st['drawn']}) than first-choice applicants "
                                 f"({st['applicants']}) for this license; {lab} odds are not computed.")
            if e["unlimited"]:
                notes.append("FWP lists the quota as unlimited (UNL/99999); quota fields are null.")
                res["oddsComputed"] = True
            if lr_a1 or ln_a1:
                notes.append(f"Landowner-preference pool, first choice: resident {lr_a1} applicants / {lr_s1} successful (quota {lr_qta}), "
                             f"nonresident {ln_a1} / {ln_s1} (quota {ln_qta}).")
            if any((r_a2, r_a3, n_a2, n_a3, r_s2, r_s3, n_s2, n_s3)):
                notes.append(f"2nd/3rd-choice applicants: resident {r_a2}/{r_a3} (successful {r_s2}/{r_s3}); "
                             f"nonresident {n_a2}/{n_a3} (successful {n_s2}/{n_s3}).")
            notes.append(f"Total successful, all choices: {tot_succ}; surplus: {surplus}.")
            if b:
                bres = sum(r[2] for r in b["rows"] if r[0] == "RESIDENT")
                bnr = sum(r[2] for r in b["rows"] if r[0] == "NONRESIDENT")
                if bres != r_a1 or bnr != n_a1:
                    notes.append(f"FWP's bonus-point report lists {bres} resident / {bnr} nonresident first-choice applications vs "
                                 f"{r_a1} / {n_a1} in its drawing statistics report (counts shown as published in each).")
                if merged:
                    notes.append("FWP's bonus-point report lists separate '0' and blank point rows; both are zero-point applications and are summed at the 0 level.")
            else:
                notes.append("No bonus-point breakdown published for this license number.")
            if kind == "elk-permit" and year == 2022:
                notes.append("FWP titles the 2022 elk permit reports 'Original Drawing'.")
            if qual:
                notes.append(f"FWP report qualifier: {qual}.")
            if kind in KIND_REGS_TYPE and (regs_desc or units):
                notes.append(f"Hunt description and hunting districts from FWP {year} Deer, Elk & Antelope regulations (source d-fwp-regs-dea-{year}).")
            elif regs_desc:
                notes.append(f"Hunt description from FWP {year} Moose, Sheep, Goat & Bison regulations (source d-fwp-regs-msgb-{year}).")
            for sp in species_list:
                rec = {
                    "species": sp, "year": year, "huntCode": code, "units": units,
                    "description": desc,
                }
                if method:
                    rec["method"] = method
                    rec["methodLabel"] = method_label
                if sex:
                    rec["sex"] = sex
                rec.update({"choice": "first", "resident": res, "nonresident": nres, "total": total})
                if bpr:
                    rec["byPoints"] = bpr
                rec["note"] = " ".join(notes)
                rec["sourceId"] = dsid
                rec["bonusPointSourceId"] = bsid if b else None
                records[sp].append(rec)
        # BP codes missing from drawing report
        for code in bp:
            if code not in draw:
                warn(f"{year} {kind}: code {code} in BP report {boid} but not in drawing report {doid}")

    # ------------------------------------------------ NR combination licenses
    combo = parse_combo(raw)
    for rec in combo:
        for sp in rec.pop("_species"):
            r = dict(rec)
            r["species"] = sp
            records[sp].append(r)
            used_sources[r["sourceId"]] = r["sourceId"].split("-")[-1]

    outdir = os.path.join(repo, "src/data/agency/montana/draw")
    os.makedirs(outdir, exist_ok=True)
    counts = {}
    for sp, rows in records.items():
        rows.sort(key=lambda r: (-r["year"], r["huntCode"]))
        # the schema has one sourceId per row; keep bonus-point source in the note
        for r in rows:
            b = r.pop("bonusPointSourceId", None)
            if b:
                r["note"] = (r.get("note", "") + f" Point-level data: source {b}.").strip()
        with open(os.path.join(outdir, f"{sp}.json"), "w") as fh:
            json.dump(rows, fh, indent=1)
        counts[sp] = collections.Counter(r["year"] for r in rows)
    srcs = []
    for sid, oid in sorted(used_sources.items()):
        m = manifest[oid]
        srcs.append({"id": sid, "title": m["title"], "publisher": "Montana Fish, Wildlife & Parks",
                     "url": FILE_URL.format(oid), "pageUrl": PAGE_URL, "dataYear": int(m["title"][:4]),
                     "retrieved": RETRIEVED,
                     "notes": f"FWP document repository objectID {oid}; file format {m['contentType'].upper()}."})
    with open(os.path.join(raw, "parsed-sources.json"), "w") as fh:
        json.dump(srcs, fh, indent=1)
    with open(os.path.join(raw, "parse-log.json"), "w") as fh:
        json.dump({"warnings": log, "crosscheck": crosscheck,
                   "counts": {k: dict(v) for k, v in counts.items()}}, fh, indent=1)
    for k, v in sorted(counts.items()):
        print(k, dict(sorted(v.items())), sum(v.values()))
    print("warnings:", len(log))
    for w in log[:80]:
        print("  ", w)
    print("statewide cross-check (district sum vs FWP totals row; only mismatching columns shown):")
    for c in crosscheck:
        print("  ", c)


# ---------------------------------------------------------------- NR combos
COMBO_FILES = {  # draw year -> objectID of the year's NR combination preference point statistics
    2022: ["106434", "106435"], 2023: ["108844"], 2024: ["110887"], 2025: ["112967"], 2026: ["116132"],
}


def parse_combo(raw):
    """One record per draw year per combination license (big game/elk, deer).

    FWP publishes these as short text summaries by preference-point tier (with
    fractional party-average tiers), so they are kept as published in the note and
    only the total application count is put in a numeric field."""
    out = []
    for year, oids in COMBO_FILES.items():
        for oid in oids:
            txt = open(os.path.join(raw, "txt", f"{oid}.txt"), encoding="utf-8").read()
            blocks = re.split(r"\n(?=\s*(?:General )?(?:Big Game/Elk|Deer) Combo|\s*\d{4} (?:Deer Combo|Big Game))", txt)
            cur = None
            sections = collections.defaultdict(list)
            for ln in txt.splitlines():
                s = ln.strip()
                if not s:
                    continue
                if "Combo" in s and "Drawing Stats" in s:
                    cur = "deer" if "Deer Combo" in s else "biggame"
                    continue
                sections[cur].append(s)
            for kind, lines in sections.items():
                # find the block for this year
                blk, take = [], False
                for s in lines:
                    m = re.match(r"^(\d{4})\b(.*)", s)
                    if m:
                        take = int(m.group(1)) == year and "Landowner" not in s
                        lo = int(m.group(1)) == year and "Landowner" in s
                        if take:
                            blk.append(s)
                        elif lo:
                            blk.append(s)
                            take = True
                        continue
                    if take:
                        blk.append(s)
                if not blk:
                    continue
                tot = re.search(r"\d{4}(?: Regular)? \(Total apps ([\d,]+)\)", blk[0])
                apps = int(tot.group(1).replace(",", "")) if tot else None
                name = ("Nonresident General Big Game/Elk Combination" if kind == "biggame"
                        else "Nonresident General Deer Combination")
                rec = {
                    "_species": ["elk"] if kind == "biggame" else ["mule-deer", "whitetail"],
                    "year": year, "huntCode": "NR-BIGGAME-ELK-COMBO" if kind == "biggame" else "NR-DEER-COMBO",
                    "units": [], "description": name + " (primary drawing, preference points)",
                    "choice": "all",
                    "nonresident": {"applicants": apps},
                    "note": ("FWP preference-point summary as published: " + " | ".join(blk) +
                             ". 75% of nonresident combination licenses go to applicants with the most preference points; "
                             "25% are drawn at random among applicants with no preference points. Fractional point tiers are party averages."
                             + (" Valid for mule deer or white-tailed deer (general deer license); the same record appears in both deer files."
                                if kind == "deer" else " The Big Game Combination includes general deer and elk licenses; the Elk Combination includes the general elk license.")),
                    "sourceId": f"d-fwp-{oid}",
                }
                if apps is None:
                    warn(f"combo {year} {kind} {oid}: total applications not found: {blk[:2]}")
                    continue
                out.append(rec)
    return out


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
