#!/usr/bin/env python3
"""Parse ODFW big game harvest summary PDFs (rendered by harvest_text.py) into
HuntScout Pro HarvestRecord JSON.

Usage: python -I harvest_parse.py <raw_dir> <repo_root> [--dry]

Inputs (all in <raw_dir>, produced by harvest_download.py / harvest_text.py):
  <year>_<key>.pl.txt   pdfplumber layout text of each ODFW report
  <year>_turkey.txt     pdftotext -layout of the spring turkey reports
  wmu_query.json        ODFW Wildlife Management Unit layer (unit numbers/names)
  manifest.json         URLs of the big game reports

Rules: every number is copied from the report. Unit ids are ODFW Wildlife
Management Unit numbers, resolved from the unit name printed in the report via
ODFW's own WMU layer (UNIT_NUM / Name). Nothing is estimated or filled.
"""
import json
import os
import re
import sys
from collections import defaultdict

RAW = sys.argv[1]
REPO = sys.argv[2]
DRY = "--dry" in sys.argv
OUT = os.path.join(REPO, "src/data/agency/oregon")
RETRIEVED = "2026-10-31"
PUB = "Oregon Department of Fish and Wildlife"
INDEX = "https://myodfw.com/articles/big-game-hunting-harvest-statistics"

NUM_RE = re.compile(r"^(?:-?[\d,]+(?:\.\d+)?%?|NA%?|N/A)$")

# column layouts (numeric columns, left to right)
DEER = ["H", "D", "AL", "AB", "T", "p1", "p2", "p3", "p4", "S"]
ELK = ["H", "D", "AL", "AB", "T", "p1", "p2", "p3", "p4", "p5", "p6", "S"]
OLD_CARN = ["H", "D", "F", "M", "T", "S"]
NEW_CARN = ["H", "D", "T", "S", "M", "F"]
OLD_PRONG = ["H", "D", "F", "M", "T", "S"]
NEW_PRONG = ["H", "M", "F", "D", "T", "S"]

# key -> (species, method, methodLabel by era)
DOCS = {
    "deer_alw": ("deer", "rifle", "Any Legal Weapon"),
    "deer_archery": ("deer", "archery", "Archery"),
    "deer_muzzleloader": ("deer", "muzzleloader", "Muzzleloader"),
    "deer_antlerless": ("deer", None, "Antlerless deer hunts"),
    "elk_alw": ("elk", "rifle", "Any Legal Weapon"),
    "elk_archery": ("elk", "archery", "Archery"),
    "elk_muzzleloader": ("elk", "muzzleloader", "Muzzleloader"),
    "elk_gen_antlerless_damage": ("elk", None, "General Season Antlerless Elk Damage Tag"),
    "bear": ("bear", None, None),
    "cougar": ("lion", None, None),
    "pronghorn": ("pronghorn", None, None),
}
TITLE_LABEL_2020 = {"deer_alw": "Rifle", "elk_alw": "Rifle", "deer_antlerless": "Antlerless deer hunts"}


def cols_for(key, old):
    sp = DOCS[key][0]
    if key == "elk_gen_antlerless_damage":
        return None  # decided per page from the header
    if sp == "deer":
        return DEER
    if sp == "elk":
        return ELK
    if sp in ("bear", "lion"):
        return OLD_CARN if old else NEW_CARN
    if sp == "pronghorn":
        return OLD_PRONG if old else NEW_PRONG
    raise KeyError(key)


# ---------------------------------------------------------------- WMU names
def norm_name(s):
    s = s.lower().replace(".", " ").replace("'", "").replace("-", " ")
    words = []
    for w in s.split():
        if w in ("mountain", "mtn", "mt", "mount", "mtns"):
            w = "mtn"
        elif w in ("creek", "cr", "crk"):
            w = "creek"
        words.append(w)
    return " ".join(words)


def load_wmus():
    d = json.load(open(os.path.join(RAW, "wmu_query.json")))
    by_norm, names = {}, {}
    for f in d["features"]:
        a = f["attributes"]
        num = a["UNIT_NUM"]
        if num is None or num < 10:
            continue
        uid = str(num)
        names[uid] = a["Name"]
        by_norm[norm_name(a["Name"])] = uid
    return by_norm, names


WMU_BY_NORM, WMU_NAMES = load_wmus()


def wmu_id(name):
    return WMU_BY_NORM.get(norm_name(name))


# ---------------------------------------------------------------- helpers
def to_num(tok):
    if tok in ("NA", "NA%", "N/A"):
        return None
    t = tok.rstrip("%").replace(",", "")
    v = float(t)
    return int(v) if re.fullmatch(r"-?\d+", t) else v


def words(line):
    return [(m.start(), m.end(), m.group()) for m in re.finditer(r"\S+", line)]


SEASON_TYPES = {"controlled", "general"}


def is_num(t):
    return bool(NUM_RE.match(t))


def doc_lines(year, key):
    """[(page, top, [cells sorted by x0])] from <year>_<key>.cells.json."""
    pages = json.load(open(os.path.join(RAW, f"{year}_{key}.cells.json")))
    out = []
    for pno, cells in pages:
        cur_top, cur = None, []
        for top, x0, x1, t in cells:
            if cur_top is not None and top != cur_top:
                out.append((pno, cur_top, sorted(cur, key=lambda c: c[0])))
                cur = []
            cur_top = top
            cur.append((x0, x1, t))
        if cur:
            out.append((pno, cur_top, sorted(cur, key=lambda c: c[0])))
    return out


def mode(vals, tol=6):
    """Most common value, clustering values within tol points."""
    best, best_n = None, 0
    for v in vals:
        n = sum(1 for w in vals if abs(w - v) <= tol)
        if n > best_n:
            best, best_n = v, n
    return best


skipped = []


def parse_doc(year, key, issues):
    lines = doc_lines(year, key)
    pages = sorted({p for p, _, _ in lines})
    # ---- header per page
    head = {}
    for p in pages:
        pl = [(t, cs) for pp, t, cs in lines if pp == p]
        hunters = [(t, c) for t, cs in pl for c in cs if c[2].startswith("Hunters") or c[2] == "Name Hunters"]
        if not hunters:
            continue
        htop, hcell = hunters[0]
        hdr_lines = [(t, cs) for t, cs in pl if htop - 25 <= t <= htop]
        has_hunt = any("Season/Tag/Hunt" in c[2] for _, cs in hdr_lines for c in cs)
        num_x = hcell[0] - 12
        # header column centers right of num_x (stacked labels merged)
        spans = []
        for _, cs in hdr_lines:
            for x0, x1, t in cs:
                if x1 <= num_x:
                    continue
                for sp in spans:
                    if x0 < sp[1] and x1 > sp[0]:
                        sp[0], sp[1] = min(sp[0], x0), max(sp[1], x1)
                        break
                else:
                    spans.append([x0, x1])
        spans.sort()
        head[p] = {"top": htop, "has_hunt": has_hunt, "num_x": num_x,
                   "hdr_centers": [(a + b) / 2 for a, b in spans]}
    old = any("Seas Type" in c[2] for _, _, cs in lines for c in cs)
    ncols_default = cols_for(key, old)

    def page_cols(p):
        if ncols_default is not None:
            return ncols_default
        if not head[p]["has_hunt"]:
            return ["H", "D", "T", "S"]
        return ["H", "D", "AL", "AB", "T", "S"] if old else ["H", "D", "T", "S"]

    # ---- pass 1: column geometry
    num_centers = defaultdict(lambda: defaultdict(list))
    text_pairs = defaultdict(list)
    single_text = defaultdict(list)
    data = []
    for p, t, cs in lines:
        if p not in head or t <= head[p]["top"]:
            continue
        nx = head[p]["num_x"]
        nums = [c for c in cs if c[0] >= nx and is_num(c[2].replace(" ", ""))]
        texts = [c for c in cs if c not in nums]
        data.append((p, t, nums, texts))
        cols = page_cols(p)
        if len(nums) == len(cols):
            for i, c in enumerate(nums):
                num_centers[p][i].append((c[0] + c[1]) / 2)
        if nums and len(texts) >= 2:
            text_pairs[p].append((texts[-2][0], texts[-1][0]))
        if nums and len(texts) == 1:
            single_text[p].append(texts[0][0])
    all_pairs = [x for v in text_pairs.values() for x in v]
    geo = {}
    for p in head:
        pairs = text_pairs.get(p) or all_pairs
        cols = page_cols(p)
        if head[p]["has_hunt"]:
            unit_x = mode([a for a, b in pairs]) if pairs else None
            hunt_x = mode([b for a, b in pairs]) if pairs else None
        else:
            unit_x, hunt_x = mode(single_text.get(p, []) + [x for v in single_text.values() for x in v]), None
        cen = [sum(v) / len(v) for i, v in sorted(num_centers[p].items())] if len(num_centers[p]) == len(cols) else None
        if cen is None:
            # fall back to other pages with the same column count, then to header spans
            for q in head:
                if q != p and page_cols(q) == cols and len(num_centers[q]) == len(cols):
                    cen = [sum(v) / len(v) for i, v in sorted(num_centers[q].items())]
                    break
        if cen is None and len(head[p]["hdr_centers"]) == len(cols):
            cen = head[p]["hdr_centers"]
        geo[p] = {"unit_x": unit_x, "hunt_x": hunt_x, "centers": cen, "cols": cols}

    # ---- pass 2: rows
    rows, totals = [], []
    unit_group = None
    prev_had_unit = False
    season_type = zone = None
    for p, t, nums, texts in data:
        g = geo[p]
        ux, hx = g["unit_x"], g["hunt_x"]
        ctx, unit_c, hunt_c = [], [], []
        for c in texts:
            x0 = c[0]
            if ux is not None and x0 < ux - 15:
                ctx.append(c[2])
            elif hx is None or x0 < hx - 15:
                unit_c.append(c[2])
            else:
                hunt_c.append(c[2])
        ctx_t, unit_t, hunt_t = clean(" ".join(ctx)), clean(" ".join(unit_c)), clean(" ".join(hunt_c))
        if not nums:
            if ctx_t and not unit_t and not hunt_t:
                if ctx_t.lower() in SEASON_TYPES:
                    season_type = ctx_t
                elif ctx_t in (".", "(continued)"):
                    pass
                else:
                    zone = ctx_t
                continue
            if unit_t and not hunt_t and not ctx_t and prev_had_unit and unit_group is not None:
                unit_group["name"].append(unit_t)  # unit name wrapped onto the next line
                continue
            if unit_t in (".", "(continued)") or hunt_t in (".",) or re.fullmatch(r"\d{1,2}", unit_t + hunt_t + ctx_t):
                continue
            issues.append(f"{year} {key} p{p}: unclassified text line: {ctx_t} | {unit_t} | {hunt_t}")
            prev_had_unit = False
            continue
        if not texts and len(nums) == 1:
            continue  # page number
        if not texts:
            # numbers with no label at all (the 2022-23 elk damage reports print their grand total this way)
            skipped.append(f"{year} {key} p{p}: unlabeled numeric row skipped {[c[2] for c in nums]}")
            prev_had_unit = False
            continue
        label = " ".join(x for x in (ctx_t, unit_t, hunt_t) if x)
        cols = g["cols"]
        vals = [c[2].replace(" ", "") for c in nums]
        if len(vals) == len(cols):
            rec = dict(zip(cols, vals))
        elif g["centers"] is not None and len(vals) < len(cols):
            rec, used = {}, set()
            for c in nums:
                cx = (c[0] + c[1]) / 2
                i = min(range(len(cols)), key=lambda k: abs(g["centers"][k] - cx))
                if i in used:
                    rec = None
                    break
                used.add(i)
                rec[cols[i]] = c[2].replace(" ", "")
            if rec is None:
                issues.append(f"{year} {key} p{p}: could not place numbers: {label} {vals}")
                continue
        else:
            issues.append(f"{year} {key} p{p}: {len(vals)} numbers, expected {len(cols)}: {label} {vals}")
            continue
        if ctx_t.lower() in SEASON_TYPES and not unit_t and not hunt_t:
            # season-type heading that carries a stray number (e.g. "General ... 0%")
            season_type = ctx_t
            skipped.append(f"{year} {key} p{p}: season heading '{ctx_t}' with numbers {vals} ignored")
            prev_had_unit = False
            continue
        if ctx_t and not unit_t and not hunt_t and "Total" not in ctx_t:
            zone = ctx_t  # 2020-2023 layout prints the zone name on its zone-total line
        if "Total" in label or (ctx_t and not unit_t and not hunt_t):
            totals.append({"label": label, "zone": ctx_t or zone, "season_type": season_type, "vals": rec, "page": p})
            prev_had_unit = False
            continue
        if ctx_t:
            if ctx_t.lower() in SEASON_TYPES:
                season_type = ctx_t
            else:
                zone = ctx_t
        if not unit_t and not hunt_t and g["hunt_x"] is not None:
            if all(to_num(x) in (0, None) for x in vals):
                skipped.append(f"{year} {key} p{p}: unlabeled all-zero row skipped {vals}")
            else:
                issues.append(f"{year} {key} p{p}: unlabeled row with data skipped {vals}")
            prev_had_unit = False
            continue
        if unit_t:
            unit_group = {"name": [unit_t]}
        if unit_group is None:
            issues.append(f"{year} {key} p{p}: data row before any unit: {label}")
            continue
        rows.append({"year": year, "key": key, "unit_group": unit_group, "hunt_text": hunt_t,
                     "season_type": season_type, "zone": zone, "vals": rec, "page": p,
                     "line": f"{label} {' '.join(vals)}"})
        prev_had_unit = bool(unit_t)
    return rows, totals


HUNT_CODE = re.compile(r"^(\d{3}[A-Z]{0,2}\d?)\s+(?!w/)(.*)$")

# White-tailed-deer-only controlled hunts, read from the bag limits in the Oregon Big Game
# Regulations (pdftotext -layout copies kept with the draw raw files: <raw>/../draw/regs_<year>.txt).
# Added by the verification pass: hunts such as 152M Grande Ronde Muzzleloader or 657A Flora are
# white-tailed deer only although their names do not say "Whitetail".
_WT_CODE_RE = re.compile(r"^\s*((?:1|6)\d\d[A-Z0-9]*|[A-Z]{2}(?:1|6)\d\d[A-Z0-9-]*)\s")
_WT_BAG_RE = re.compile(r"One (?:antlerless )?white-tailed deer(?! or)(?:\s+buck with visible antler)?\s*(?:$|\s{2,})")


def _regs_whitetail(year):
    path = os.path.join(RAW, "..", "draw", f"regs_{year}.txt")
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    out = set()
    for i, line in enumerate(lines):
        m = _WT_CODE_RE.match(line)
        if not m:
            continue
        seg = line[m.end():]
        if "white-tailed" in seg:
            after = seg.split("white-tailed", 1)[1][:30].split()
            if _WT_BAG_RE.search(seg) and "or" not in after:
                out.add(m.group(1))
            continue
        if re.search(r"One |deer|buck|elk|antelope|pronghorn", seg):
            continue
        for j in (i - 1, i + 1):
            if 0 <= j < len(lines) and not _WT_CODE_RE.match(lines[j]) and _WT_BAG_RE.search(lines[j]) and len(lines[j].strip()) < 60:
                out.add(m.group(1))
    return out


WT_REGS = {y: _regs_whitetail(y) for y in (2022, 2023, 2024)}
# season year -> regulations year used (2020/2021 and 2025 booklets were not retrieved)
WT_REGS_FOR = {2020: 2022, 2021: 2022, 2022: 2022, 2023: 2023, 2024: 2024, 2025: 2024}


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


def join_name(parts):
    out = ""
    for p in parts:
        if out.endswith("-"):
            out = out[:-1] + p  # hyphenated line break ("De-" + "schutes")
        else:
            out = (out + " " + p).strip()
    return out


def make_record(sp_kind, method, label, year, uid, unit_name, hunt_text, vals, season_type, src):
    ht = clean(hunt_text)
    m = HUNT_CODE.match(ht)
    hunt_code, hunt_name = (m.group(1), clean(m.group(2))) if m else (ht or None, None)
    v = {k: to_num(x) for k, x in vals.items()}
    sp = sp_kind
    wt_regs_year = None
    if sp_kind == "deer":
        if hunt_name and "whitetail" in hunt_name.lower():
            sp = "whitetail"
        elif hunt_code and hunt_code in WT_REGS[WT_REGS_FOR[year]]:
            sp = "whitetail"
            wt_regs_year = WT_REGS_FOR[year]
        else:
            sp = "mule-deer"
    rec = {"species": sp, "year": year, "unit": uid}
    if unit_name:
        rec["unitName"] = unit_name
    if hunt_code:
        rec["hunt"] = hunt_code
    if method:
        rec["method"] = method
    if label:
        rec["methodLabel"] = label
    rec["hunters"] = v.get("H")
    rec["harvest"] = v.get("T")
    if v.get("AB") is not None:
        rec["harvestMale"] = v["AB"]
    if "M" in v:
        rec["harvestMale"] = v["M"]
    if "F" in v:
        rec["harvestFemale"] = v["F"]
    notes = []
    if hunt_name:
        notes.append(f"Hunt: {hunt_code} {hunt_name}")
    if season_type:
        notes.append(f"{season_type} season")
    s = v.get("S")
    raw_s = vals.get("S")
    if s is not None and s > 100:
        notes.append(f"ODFW printed success as {raw_s} (its harvest estimate exceeds its hunter estimate); success left blank")
        s = None
    if raw_s in ("NA%", "NA", "N/A"):
        notes.append(f"ODFW printed success as {raw_s}")
    rec["successPct"] = s
    if v.get("AL") is not None:
        notes.append(f"antlerless harvest {v['AL']}")
    if v.get("D") is not None:
        rec["daysHunted"] = v["D"]
    if wt_regs_year == year:
        notes.append(f"white-tailed deer only: the {year} Oregon Big Game Regulations give this hunt a white-tailed-deer-only bag limit")
    elif wt_regs_year:
        notes.append(f"white-tailed deer only: the {wt_regs_year} Oregon Big Game Regulations give hunt {hunt_code} a white-tailed-deer-only bag limit "
                     f"(the {year} booklet was not retrieved; hunt codes carry over between years)")
    if sp == "mule-deer" and uid.isdigit() and int(uid) <= 30:
        notes.append("western Oregon unit: ODFW reports deer without species; this is black-tailed deer range")
    if notes:
        rec["note"] = "; ".join(notes)
    rec["sourceId"] = src
    return rec


def build_records(sources_by_doc, issues):
    out = defaultdict(list)
    xcheck, dropped = [], []
    for (year, key), src in sorted(sources_by_doc.items()):
        if key not in DOCS:
            continue
        rows, totals = parse_doc(year, key, issues)
        sp_kind, method, label = DOCS[key]
        if year == 2020 and key in TITLE_LABEL_2020:
            label = TITLE_LABEL_2020[key]
        recs = []
        for r in rows:
            unit_name = clean(join_name(r["unit_group"]["name"]))
            uid = wmu_id(unit_name)
            hunt_text = r["hunt_text"]
            m2 = re.match(r"^(.*?)\s+(\d{3}[A-Z]{0,2}\d?\s.*)$", unit_name)
            if uid is None and m2 and wmu_id(m2.group(1)) and not hunt_text:
                # unit name and hunt printed as one run of text
                unit_name, hunt_text, uid = m2.group(1), m2.group(2), wmu_id(m2.group(1))
            if uid is None:
                issues.append(f"{year} {key}: unknown unit name '{unit_name}' line: {r['line'][:100]}")
                continue
            rec = make_record(sp_kind, method, label, year, uid, unit_name, hunt_text, r["vals"], r["season_type"], src)
            rec["_hunt_text"] = clean(hunt_text)
            rec["_page"], rec["_line"], rec["_zone"], rec["_vals"] = r["page"], r["line"], r["zone"], r["vals"]
            recs.append(rec)
        groups = defaultdict(list)
        for rec in recs:
            groups[(rec["species"], rec["unit"], rec.get("hunt"), rec.get("method"), rec.get("methodLabel"))].append(rec)
        for k, g in groups.items():
            if len(g) == 1:
                out[g[0]["species"]].append(g[0])
                continue
            names = {x["_hunt_text"] for x in g}
            if len(names) == len(g):
                # same hunt number printed with different hunt names: keep each under its full published hunt text
                for x in g:
                    x["hunt"] = x["_hunt_text"]
                    x["note"] = (x.get("note", "") + "; " if x.get("note") else "") + \
                        f"ODFW prints hunt number {k[2]} on more than one hunt name here; hunt shown with its full name"
                    out[x["species"]].append(x)
                dropped.append({"year": year, "key": key, "unit": k[1], "hunt": k[2], "action": "kept-by-full-name", "rows": [x["_line"] for x in g]})
                continue
            if all(x["_vals"] == g[0]["_vals"] for x in g):
                g[0]["note"] = (g[0].get("note", "") + "; " if g[0].get("note") else "") + \
                    "ODFW prints this row twice with identical figures; shown once"
                out[g[0]["species"]].append(g[0])
                dropped.append({"year": year, "key": key, "unit": k[1], "hunt": k[2], "action": "identical-kept-once", "rows": [x["_line"] for x in g]})
                continue
            for i, x in enumerate(g):
                if i > 0:
                    x["methodLabel"] = ((x.get("methodLabel") + " - ") if x.get("methodLabel") else "") + f"ODFW listing {i + 1}"
                x["note"] = (x.get("note", "") + "; " if x.get("note") else "") + \
                    f"ODFW lists {len(g)} separate rows for this unit and hunt in this report with different figures; each is shown as printed (listing {i + 1} of {len(g)}) and they are not combined"
                out[x["species"]].append(x)
            dropped.append({"year": year, "key": key, "unit": k[1], "hunt": k[2], "action": "multiple-listings-kept", "rows": [x["_line"] for x in g]})
        # statewide row from the report's Grand Total, plus cross-check sums
        grand = [t for t in totals if "Grand Total" in t["label"]]
        sumH = sum(to_num(r["vals"]["H"]) or 0 for r in rows if "H" in r["vals"])
        sumT = sum(to_num(r["vals"]["T"]) or 0 for r in rows if "T" in r["vals"])
        zone_tot = [t for t in totals if "Grand Total" not in t["label"]]
        zsumH = sum(to_num(t["vals"].get("H", "0")) or 0 for t in zone_tot)
        zsumT = sum(to_num(t["vals"].get("T", "0")) or 0 for t in zone_tot)
        xcheck.append({"year": year, "key": key, "rows": len(rows), "sumHunters": sumH, "sumHarvest": sumT,
                       "zoneTotalsHunters": zsumH, "zoneTotalsHarvest": zsumT,
                       "grand": grand[0]["vals"] if grand else None})
        if grand:
            gv = grand[0]["vals"]
            rec = make_record(sp_kind, method, label, year, "Statewide", None, "", gv, None, src)
            if sp_kind == "deer":
                rec["species"] = "mule-deer"
            extra = "ODFW 'Grand Total' row of this report (all hunts and units it lists, all deer species)" if sp_kind == "deer" \
                else "ODFW 'Grand Total' row of this report (all hunts and units it lists)"
            rec["note"] = extra + ("; " + rec["note"] if rec.get("note") else "")
            rec["_line"] = grand[0]["label"] + " " + " ".join(f"{k}={v}" for k, v in gv.items())
            out[rec["species"]].append(rec)
    return out, xcheck, dropped


# ---------------------------------------------------------------- sheep / goat
def parse_tag_hunts(year, key, issues):
    txt = open(os.path.join(RAW, f"{year}_{key}.txt")).read()
    recs = []
    for ln in txt.split("\n"):
        m = re.match(r"^\s*(\d{3}[A-Z]?\d?)\s+(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)%\s*$", ln)
        if not m:
            if re.match(r"^\s*\d{3}[A-Z]?\d?\s", ln) and not re.match(r"^\s*20\d\d\s", ln):
                issues.append(f"{year} {key}: unparsed hunt line {ln.strip()}")
            continue
        recs.append({"hunt": m.group(1), "name": clean(m.group(2)), "tags": int(m.group(3)),
                     "harvest": int(m.group(4)), "succ": int(m.group(5)), "line": ln.strip()})
    return recs


# ---------------------------------------------------------------- turkey
def parse_turkey(year, issues):
    """Rows: Unit, Unit Name, Hunters, Hunter Days, Days/Hunter, Turkey Harvest,
    Birds/Hunter, Birds/Hunter Day[, % harvested on private land]. Units with no
    harvest may print only Hunters, Days and Harvest, or 'No Data' / '-'."""
    txt = open(os.path.join(RAW, f"{year}_turkey.txt")).read()
    recs = []
    prev = ""
    for ln in txt.split("\n"):
        m = re.match(r"^\s*(\d{1,2}|-)?\s+([A-Za-z][A-Za-z .']*?)\s{2,}(\S.*)$", ln)
        wrapped = prev if re.fullmatch(r"\s*[A-Za-z]+\s*", prev) else ""
        prev = ln
        if not m or "Unit" in ln or "Hunter" in ln:
            continue
        toks = m.group(3).split()
        if not re.fullmatch(r"[\d,]+", toks[0]):
            continue
        unit, name = m.group(1), clean(m.group(2))
        if wrapped:
            name = clean(wrapped) + " " + name  # unit name wrapped above its row ("Columbia" / "Basin")
        if unit is None and name != "Unknown":
            issues.append(f"{year} turkey: row without unit number: {ln.strip()}")
            continue
        tail = [t for t in toks]
        pvt = None
        if tail[-1].endswith("%"):
            pvt = tail.pop()
        elif tail[-1] in ("-",):
            tail.pop()
        elif tail[-2:] == ["No", "Data"] or tail[-2:] == ["No", "Data!"]:
            tail = tail[:-2]
        if len(tail) == 6:
            h, d, dph, hv, bph, bphd = tail
        elif len(tail) == 3:
            h, d, hv = tail
            dph = bph = bphd = None
        else:
            issues.append(f"{year} turkey: unexpected columns: {ln.strip()}")
            continue
        recs.append({"unit": unit, "name": name, "hunters": int(h.replace(",", "")), "days": int(d.replace(",", "")),
                     "days_per": dph, "harvest": int(hv.replace(",", "")), "bph": bph, "bphd": bphd,
                     "pvt": pvt.rstrip("%") if pvt else None, "line": ln.strip()})
    return recs


TURKEY_STATEWIDE = [
    (2025, "h-odfw-gamebird-staff-summary-2026",
     "https://myodfw.com/sites/default/files/2026-04/Exhibit%20B_Attachment%203%202026%20Game%20Bird%20Program%20Staff%20Summary.pdf",
     "Game Bird Program Recommendations for 2026-27 Upland and Migratory Game Bird Seasons (Attachment 3, Game Bird Program Staff Summary)",
     [("Spring Turkey", 13706, 54670, 7514, "0.55"), ("Spring Youth Turkey", 1905, 6428, 1032, "0.54")]),
    (2024, "h-odfw-gamebird-staff-summary-2025",
     "https://www.dfw.state.or.us/agency/commission/minutes/25/04_April/Exhibit%20C%20Game%20Birds/Exhibit%20C_Attachment%204_2025%20Game%20Bird%20Program%20Staff%20Summary.pdf",
     "2025 Game Bird Program Staff Summary (Commission Exhibit C, Attachment 4, April 2025)",
     [("Spring Turkey", 12563, 51397, 5112, "0.41"), ("Spring Youth Turkey", 1807, 6173, 836, "0.46")]),
    (2023, "h-odfw-gamebird-staff-summary-2024",
     "https://www.dfw.state.or.us/agency/commission/minutes/24/04_Apr/EX%20B_PDF%20FILES/Exhibit%20B_Attachment%203%202024%20Game%20Bird%20Program%20Staff%20Summary.pdf",
     "2024 Game Bird Program Staff Summary (Commission Exhibit B, Attachment 3, April 2024)",
     [("Spring Turkey", 12721, 52945, 4815, "0.38"), ("Spring Youth Turkey", 1850, 6646, 804, "0.43")]),
]

COMMON = ("Figures are ODFW estimates from mandatory harvest reporting, copied as printed per hunt and Wildlife Management "
          "Unit (unit id = ODFW WMU number, matched from the printed unit name to ODFW's WMU layer). A hunt that spans "
          "several units is listed under each unit with that unit's share. 'Statewide' rows are the Grand Total line of "
          "each ODFW report (one per weapon/report). Where ODFW printed a success rate above 100% (its harvest estimate "
          "exceeds its hunter estimate in tiny hunts) successPct is left blank. The 2024 PDFs ODFW links carry a large "
          "'DRAFT' watermark. Unit-row sums match ODFW's zone and grand totals except for small rounding gaps and the "
          "agency-side differences named below. ODFW computes success from unrounded estimates, so in small hunts it "
          "can differ by a few points from harvest / hunters.")
COVERAGE_NOTES = {
    "elk": COMMON + " Reports loaded per year: Any Legal Weapon (titled 'Rifle' for 2020), Archery, Muzzleloader and "
    "General Season Antlerless Elk Damage Tag (2020-2024). harvestMale = ODFW 'Total Bull(s)' column; antlerless "
    "harvest is in each row note; antler point classes are not loaded. General-season hunt labels are as printed and "
    "change wording between years (e.g. 'General Elk Rifle - Coast First Season' 2020, 'Coast 1st season' 2025). "
    "Not loaded: the 2025 damage-tag report (it repeats the 2024 report figure for figure; only the title year "
    "differs). Agency-side total differences: 2020 rifle Northeast general zone total (5,854 hunters) omits Heppner's "
    "1,545; 2020 muzzleloader Grand Total 1,721 hunters / 321 elk vs 1,406 / 203 in its unit rows; 2024 damage Grand "
    "Total 5,776 / 2,993 vs 4,906 / 2,577 in its zone totals. Where ODFW lists the same unit and hunt twice with "
    "different figures (2021 archery 'Bow Elk w/ 250R' rows) both are kept and the second is labelled 'ODFW listing 2'.",
    "mule-deer": COMMON + " ODFW reports deer without separating species: this file holds all Oregon deer hunts "
    "except the white-tailed-deer-only controlled hunts (see whitetail). Units 10-30 (western Oregon) are black-tailed deer range "
    "and carry a row note saying so; eastern units are mule deer range and can include some white-tailed deer. Reports "
    "loaded per year: Any Legal Weapon buck (titled 'Rifle' for 2020), Archery, Muzzleloader and Antlerless deer "
    "(titled '600 Series' in 2020). harvestMale = ODFW 'Total Buck(s)' column; antlerless harvest is in each row "
    "note; point classes are not loaded. The 2020 archery report prints unrounded fractional estimates (e.g. 110.5 "
    "hunters), kept as printed. 2020 antlerless Grand Total (6,991 hunters / 3,355 deer) differs from its zone totals "
    "(7,053 / 3,384).",
    "whitetail": "White-tailed-deer-only controlled hunts in ODFW's deer harvest reports: hunts named 'Whitetail' "
    "(146R2 Grant Co Whitetail Bow, from 2024) plus hunts whose regulations bag limit is white-tailed deer only "
    "(151M Baker Muzzleloader, 152M Grande Ronde Muzzleloader, 157A Lower Wallowa Valley, 157M Sled Springs Unit "
    "Muzzleloader, 647B Middle Fork John Day, 649B W Blue Mtns, 651T2 Baker No. 2 Youth, 657A Flora, 657B Lower "
    "Wallowa Valley, 660A Upper Wallowa Valley). Bag limits come from the 2022-2024 regulations; 2020-2021 rows use the "
    "2022 booklet and 2025 rows the 2024 booklet (those years' booklets were not retrieved; hunt codes carry over). "
    "Rows come from the Any Legal Weapon, Archery, Muzzleloader and Antlerless deer reports. All other white-tailed "
    "deer, taken in general eastern Oregon hunts or mixed-species controlled hunts, are inside ODFW's combined deer "
    "figures (mule-deer file). " + COMMON,
    "pronghorn": COMMON + " Per hunt and unit; harvestMale = bucks, harvestFemale = does as printed.",
    "moose": "Oregon has no moose hunting season, so ODFW publishes no moose harvest.",
    "bear": COMMON + " Spring controlled hunts and the general fall season ('Fall Bear', 'Additional Fall Bear' tags) "
    "by unit; harvestMale/Female as printed. In 2024-2025 ODFW lists some unit/hunt pairs twice with different "
    "figures (the second row has a blank unit label, e.g. 2025 Siuslaw 722A: 3 and 474 hunters); both rows are kept "
    "as printed, the second labelled 'ODFW listing 2', and they are not combined.",
    "sheep": "ODFW 'Reported Bighorn Sheep Harvest' tables (Rocky Mountain and California bighorn hunts): one row per "
    "hunt with tags (stored as licenses), animals harvested and percent success; hunter counts are not published "
    "(hunters null). unit = ODFW hunt number, unitName = hunt name. Auction, raffle and tribal tags are described only "
    "in the report footnote (not in hunt rows). Where ODFW printed more harvest than tags (e.g. 2025 546A, 568A1) "
    "success is left blank. 2025 lists hunt 559A1 twice ('N Snake Rvr' and 'S Snake Rvr'); the second is stored "
    "with unit '559A1 S Snake Rvr'.",
    "goat": "ODFW 'Reported Rocky Mountain Goat Harvest' tables: one row per hunt with tags (licenses), harvest and "
    "percent success; hunter counts not published. unit = ODFW hunt number. Auction/raffle tags are described only in "
    "the footnote. Where harvest exceeds tags (2025 946A, 200%) success is left blank.",
    "lion": COMMON + " Cougar is a general-season species in Oregon: rows are per unit for 'Cougar' and 'Additional "
    "Cougar' tags (hunters = estimated tag holders who hunted). harvestMale/Female as printed. 2025 lists Siuslaw and "
    "Wilson twice for 'Cougar' with different figures; both kept as printed ('ODFW listing 2').",
    "turkey": "Spring season only: ODFW's 'Spring Turkey Harvest by Wildlife Management Unit' tables (hunters, hunter "
    "days, harvest, birds per hunter). Hunters and days are counted only in the unit each hunter reported hunting "
    "most. ODFW does not publish percent of hunters successful; successPct is harvest / hunters (successComputed) and "
    "a hunter may take more than one bird. 'Statewide' rows (2023-2025) are the Spring Turkey and Spring Youth Turkey "
    "lines of ODFW's Game Bird Program staff summaries. The unit tables sum to the spring + youth total in 2023 and "
    "2024 but to the adult 'Spring Turkey' line in 2025. ODFW states an error in its mandatory reporting system "
    "likely inflated the 2025 harvest estimate. Fall turkey harvest is not published by unit. Rows with unit "
    "'Unknown' are hunters who did not report a unit.",
}

# Reports not loaded, with the reason (see coverage notes).
EXCLUDED_DOCS = {
    (2025, "elk_gen_antlerless_damage"): "The 2025 General Season Antlerless Elk Damage report ODFW links "
    "(myodfw.com/sites/default/files/2026-04/General_Season_Antlerless_Elk_Damage_Harvest_Summary.pdf) repeats the "
    "2024 report figure for figure (only the title year differs), so it is not loaded.",
}


def strip_private(rec):
    return {k: v for k, v in rec.items() if not k.startswith("_")}


def sort_key(r):
    u = r["unit"]
    return (-r["year"], 0 if u == "Statewide" else 1, int(u) if u.isdigit() else 9999, u, r.get("hunt") or "", r.get("methodLabel") or "")


def write_outputs(out, sources, unit_names, coverage):
    os.makedirs(os.path.join(OUT, "harvest"), exist_ok=True)
    used = set()
    for sp, rows in out.items():
        rows = sorted((strip_private(r) for r in rows), key=sort_key)
        for r in rows:
            used.add(r["sourceId"])
        with open(os.path.join(OUT, "harvest", f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1)
            f.write("\n")
    meta = {"unitNames": unit_names, "coverage": coverage,
            "sources": [s for s in sources if s["id"] in used]}
    with open(os.path.join(OUT, "harvest-meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
        f.write("\n")


# ---------------------------------------------------------------- main
TURKEY_URLS = {
    2020: "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2021/2020%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf",
    2021: "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2021/2021%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf",
    2022: "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2022%20Spring%20Turkey%20Harvest%20Summary.pdf",
    2023: "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2023%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf",
    2024: "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2024%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf",
    2025: "https://myodfw.com/sites/default/files/2026-03/2025%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf",
}


def main():
    issues = []
    manifest = json.load(open(os.path.join(RAW, "manifest.json")))
    sources, src_by_doc = [], {}
    for m in manifest:
        if m["key"] not in DOCS and m["key"] not in ("sheep", "goat"):
            continue
        if (m["year"], m["key"]) in EXCLUDED_DOCS:
            continue
        sid = f"h-odfw-{m['key'].replace('_', '-')}-{m['year']}"
        note = "Estimates from ODFW mandatory harvest reporting."
        if m["year"] == 2024:
            note += " The PDF ODFW links for this season carries a large 'DRAFT' watermark."
        if m["key"] in ("sheep", "goat"):
            note = "Reported (checked) harvest of tag holders."
        sources.append({"id": sid, "title": m["title"], "publisher": PUB,
                        "url": m["url"].replace(" ", "%20"), "pageUrl": INDEX,
                        "dataYear": m["year"], "retrieved": RETRIEVED, "notes": note})
        src_by_doc[(m["year"], m["key"])] = sid
    out, xcheck, dropped = build_records(src_by_doc, issues)

    # sheep and goat: hunt-based tag reports
    unit_names = defaultdict(dict)
    for key, sp in (("sheep", "sheep"), ("goat", "goat")):
        for y in range(2020, 2026):
            if (y, key) not in src_by_doc:
                continue
            seen = set()
            for r in parse_tag_hunts(y, key, issues):
                k = (r["hunt"], r["name"])
                rec = {"species": sp, "year": y, "unit": r["hunt"], "unitName": r["name"], "hunt": r["hunt"],
                       "hunters": None, "harvest": r["harvest"], "successPct": r["succ"] if r["succ"] <= 100 else None,
                       "licenses": r["tags"], "sourceId": src_by_doc[(y, key)]}
                notes = ["ODFW reports tags issued and animals harvested per hunt; success = harvest / tags"]
                if r["succ"] > 100:
                    notes.append(f"ODFW printed {r['succ']}% (more animals reported than tags in this hunt; auction/raffle/tribal tags can be filled in any open hunt area); success left blank")
                if r["hunt"] in {x[0] for x in seen}:
                    notes.append(f"ODFW lists hunt {r['hunt']} twice this year with different names")
                    rec["unit"] = f"{r['hunt']} {r['name']}"
                rec["note"] = "; ".join(notes)
                seen.add(k)
                rec["_line"] = r["line"]
                out[sp].append(rec)
                unit_names[sp][rec["unit"]] = r["name"]  # latest year's hunt name wins

    # turkey
    for y in range(2020, 2026):
        sid = f"h-odfw-turkey-spring-{y}"
        if not os.path.exists(os.path.join(RAW, f"{y}_turkey.txt")):
            continue
        sources.append({"id": sid, "title": f"{y} Spring Turkey Harvest by Wildlife Management Unit", "publisher": PUB,
                        "url": TURKEY_URLS[y], "dataYear": y, "retrieved": RETRIEVED,
                        "notes": "Spring season only. Hunters and hunter days are assigned to the unit each hunter reported hunting most."})
        for r in parse_turkey(y, issues):
            unit = r["unit"]
            if unit in (None, "-"):
                unit = r["name"]  # 'Unknown' unit as published
            elif str(int(unit)) not in WMU_NAMES:
                issues.append(f"{y} turkey unknown unit {unit}")
            else:
                unit = str(int(unit))
            succ = round(100 * r["harvest"] / r["hunters"], 1) if r["hunters"] else None
            note = ("Spring season. ODFW publishes birds per hunter" + (f" ({r['bph']})" if r["bph"] else "") +
                    ", not percent of hunters successful; successPct here is harvest / hunters and a hunter may take more than one bird")
            if r["pvt"]:
                note += f"; {r['pvt']}% of birds harvested on private land"
            rec = {"species": "turkey", "year": y, "unit": unit, "unitName": r["name"], "methodLabel": "Spring",
                   "hunters": r["hunters"], "harvest": r["harvest"], "successPct": succ if succ is not None and succ <= 100 else None,
                   "successComputed": succ is not None and succ <= 100, "daysHunted": r["days"], "note": note,
                   "sourceId": sid, "_line": r["line"]}
            if not rec["successComputed"]:
                del rec["successComputed"]
            out["turkey"].append(rec)

    # turkey statewide lines from ODFW's Game Bird Program staff summaries (Table 3)
    for y, sid, url, title, lines in TURKEY_STATEWIDE:
        sources.append({"id": sid, "title": title, "publisher": PUB, "url": url, "dataYear": y, "retrieved": RETRIEVED,
                        "notes": "Table 3, wild turkey mandatory harvest reporting results (spring lines used)."})
        for label, hunters, days, harvest, bph in lines:
            succ = round(100 * harvest / hunters, 1)
            note = (f"ODFW statewide '{label}' line; ODFW publishes {bph} birds per hunter, not percent of hunters "
                    "successful; successPct here is harvest / hunters")
            if y == 2025:
                note += ("; ODFW: an error in the mandatory reporting system impacted 2025 harvest data and likely "
                         "inflated this estimate")
            out["turkey"].append({"species": "turkey", "year": y, "unit": "Statewide", "methodLabel": label,
                                  "hunters": hunters, "harvest": harvest, "successPct": succ, "successComputed": True,
                                  "daysHunted": days, "note": note, "sourceId": sid,
                                  "_line": f"{label} {hunters} {days} {harvest} {bph}"})
    for r in out["turkey"]:
        if r["year"] == 2025 and r["unit"] != "Statewide":
            r["note"] += ("; ODFW: an error in the mandatory reporting system impacted 2025 harvest data and likely "
                          "inflated the harvest estimate")

    # unit names (ODFW WMU layer names; sheep/goat hunt names as printed)
    for sp, rows in out.items():
        if sp in ("sheep", "goat"):
            continue
        for r in rows:
            u = r["unit"]
            if u.isdigit():
                unit_names[sp][u] = WMU_NAMES[u]
            elif u == "Statewide":
                unit_names[sp][u] = "Statewide"
            elif u == "Unknown":
                unit_names[sp][u] = "Unit not reported"
    unit_names = {sp: dict(sorted(v.items(), key=lambda kv: (not kv[0].isdigit(), int(kv[0]) if kv[0].isdigit() else 0, kv[0])))
                  for sp, v in sorted(unit_names.items())}
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"]:
        years = sorted({r["year"] for r in out.get(sp, [])}, reverse=True)
        coverage.append({"species": sp, "years": years, "notes": COVERAGE_NOTES[sp]})

    for i in skipped:
        print("SKIP", i)
    for i in issues:
        print("ISSUE", i)
    print(len(issues), "issues")
    for sp, rows in sorted(out.items()):
        print(sp, len(rows), sorted({r["year"] for r in rows}))
    json.dump({"out": out, "xcheck": xcheck, "dropped": dropped, "sources": sources, "unit_names": unit_names},
              open(os.path.join(RAW, "_parsed_debug.json"), "w"), indent=0, default=str)
    if DRY:
        return
    write_outputs(out, sources, unit_names, coverage)


if __name__ == "__main__":
    main()
