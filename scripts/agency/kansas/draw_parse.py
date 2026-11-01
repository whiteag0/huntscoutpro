#!/usr/bin/env python3
"""Parse KDWP draw statistics (see draw_download.py) into
src/data/agency/kansas/draw/{whitetail,mule-deer,pronghorn,turkey}.json.

Usage:
  python -I scripts/agency/kansas/draw_parse.py <raw_dir> <repo_root>

After this script, re-run seasons_parse.py: it adds season dates (draw rows) and key-date
tags/seasons (draw-meta) to the files written here.

Every number is copied from a KDWP publication. Derived values (flagged in each row's note):
  * "drawn" for a hunt whose document lists permits issued only by preference-point level is the
    sum of those published rows (checked against KDWP's statewide/zone totals where published);
  * "minPoints" is the lowest preference-point level with at least one permit issued.
No odds are computed: KDWP's first-choice applicant counts and its permits-issued counts do not
come from the same pool (permits can go to 2nd-4th choice applicants, youth/landowner pools).
"""
import json
import os
import re
import sys
from collections import OrderedDict

import pdfplumber
from bs4 import BeautifulSoup

RAW, REPO = sys.argv[1], sys.argv[2]
WB = os.path.join(RAW, "wayback")
OUT = os.path.join(REPO, "src/data/agency/kansas/draw")
WARN = []


def warn(msg):
    WARN.append(msg)
    print("WARN", msg)


def n(s):
    """'1,234' -> 1234; anything else -> ValueError."""
    s = s.strip()
    if not re.fullmatch(r"\d{1,3}(,\d{3})*|\d+", s):
        raise ValueError(f"not a count: {s!r}")
    return int(s.replace(",", ""))


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


# ----------------------------------------------------------------------------- PDF helpers
def pdf_words(path):
    out = []
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            for w in page.extract_words(keep_blank_chars=False, use_text_flow=False):
                out.append({"page": pi, "x0": w["x0"], "x1": w["x1"], "top": w["top"], "text": w["text"],
                            "cx": (w["x0"] + w["x1"]) / 2})
    return out


def group_rows(ws, tol=3.0):
    rows = []
    for w in sorted(ws, key=lambda w: (w["page"], w["top"], w["x0"])):
        if rows and rows[-1]["page"] == w["page"] and abs(rows[-1]["top"] - w["top"]) <= tol:
            rows[-1]["w"].append(w)
        else:
            rows.append({"page": w["page"], "top": w["top"], "w": [w]})
    for r in rows:
        r["w"].sort(key=lambda w: w["x0"])
    return rows


def span_cx(ws, *texts, page=0, near=None):
    """Center of the horizontal span covering the first occurrence of each header word."""
    xs = []
    for t in texts:
        cands = [w for w in ws if w["page"] == page and w["text"] == t and (near is None or abs(w["top"] - near) < 30)]
        if not cands:
            raise ValueError(f"header word {t!r} not found")
        w = min(cands, key=lambda w: w["top"])
        xs += [w["x0"], w["x1"]]
    return (min(xs) + max(xs)) / 2


def labeled_tokens(row_words, cols):
    """Numbers in a row assigned to the nearest column; a number directly followed by a label
    (LO/T, GEN, Gen, YOUTH, Youth, NR TENANT, NR Tenant) becomes (col, label, value)."""
    out = []
    ws = row_words
    i = 0
    while i < len(ws):
        w = ws[i]
        t = w["text"]
        if re.fullmatch(r"\d{1,3}(,\d{3})*|\d+", t):
            label = None
            j = i + 1
            if j < len(ws) and ws[j]["x0"] - w["x1"] < 12 and re.fullmatch(r"LO/T|GEN|Gen|YOUTH|Youth|NR", ws[j]["text"]):
                label = ws[j]["text"].upper()
                j += 1
                if label == "NR" and j < len(ws) and ws[j]["text"].upper() == "TENANT":
                    label = "NR TENANT"
                    j += 1
            col = min(cols, key=lambda c: abs(cols[c] - w["cx"]))
            out.append((col, label, n(t), w))
            i = j
        else:
            i += 1
    return out


# ----------------------------------------------------------------------------- sources
SRC = {
    "page_deer": "d-ks-deer-quotas-draw-stats-page",
    "nr_deer_2025": "d-ks-nr-deer-draw-report-2025",
    "nr_deer_2024": "d-ks-nr-deer-draw-report-2024",
    "res_deer_2025": "d-ks-res-deer-draw-report-2025",
    "res_deer_2024": "d-ks-res-deer-draw-report-2024",
    "quota_2022": "d-ks-deer-quotas-page-2022",
    "quota_2023": "d-ks-deer-quotas-page-2023",
    "page_ant": "d-ks-antelope-page",
    "ant_2022": "d-ks-antelope-draw-stats-2022",
    "ant_2023": "d-ks-antelope-draw-stats-2023",
    "ant_2024": "d-ks-antelope-draw-stats-2024",
    "page_tky": "d-ks-turkey-page",
    "tky4_2023": "d-ks-turkey-unit4-draw-stats-2023",
    "tky4_2024": "d-ks-turkey-unit4-draw-stats-2024",
    "tky4_2025": "d-ks-turkey-unit4-draw-stats-2025",
    "tkynr_2024": "d-ks-turkey-nr-draw-stats-2024",
    "tkynr_2025": "d-ks-turkey-nr-draw-stats-2025",
}


def pts_note(points):
    """points: list of (pp, issued) as published -> 'Permits issued by preference points: 8 pts 1; ...'"""
    return "; ".join(f"{p} pt{'s' if p != 1 else ''}: {c}" for p, c in points)


def min_points(points):
    drawn_levels = [p for p, c in points if c and c > 0]
    return min(drawn_levels) if drawn_levels else None


# ============================================================================= DEER PAGE (2026, 2025)
def parse_page_tables(text):
    """Split a capture into {section heading: [lines]} and tables [(header, rows, context_lines)]."""
    lines = text.split("\n")
    sections = OrderedDict()
    cur = None
    for ln in lines:
        m = re.match(r"^## (\d{4}) ", ln)
        if m:
            cur = int(m.group(1))
            sections[cur] = []
            continue
        if ln.startswith("## "):
            cur = None
            continue
        if cur is not None:
            sections[cur].append(ln)
    return sections


def tables_in(lines):
    out = []
    i = 0
    while i < len(lines):
        if lines[i] == "[TABLE]":
            j = lines.index("[/TABLE]", i)
            rows = [[c.strip() for c in r.split(" | ")] for r in lines[i + 1:j]]
            out.append({"header": rows[0], "rows": rows[1:], "before": lines[max(0, i - 6):i]})
            i = j + 1
        else:
            i += 1
    return out


def deer_page():
    text = read(os.path.join(RAW, "deer-quotas-and-draw-statistics.txt"))
    secs = parse_page_tables(text)
    res = {}
    for year, lines in secs.items():
        d = {"res_quota": {}, "res_apps": {}, "res_pts": {}, "nr_quota": {}, "md_quota": {}, "nr_apps": {},
             "nr_pts": {}, "md": {}, "res_drawn": {}, "lines": lines}
        for t in tables_in(lines):
            h = [c.upper() for c in t["header"]]
            for r in t["rows"]:
                if h[:3] == ["MANAGEMENT UNIT", "PERMIT TYPE", "PERMITS AUTHORIZED"]:
                    if r[0].startswith(("Western", "Eastern")):
                        d["res_quota"][r[0]] = n(r[2])
                    elif r[1] == "Whitetail Either Sex":
                        d["nr_quota"][r[0]] = n(r[2])
                    elif r[1] == "Mule Deer Stamp":
                        d["md_quota"][r[0]] = n(r[2])
                    else:
                        raise ValueError(r)
                elif h == ["UNIT", "PERMIT QUOTA", "APPLICATIONS RECEIVED"]:
                    if r[0].startswith(("Western", "Eastern")):
                        m = re.match(r"([\d,]+) total 1st Choice applications:", r[2])
                        cats = dict((k.strip(), n(v)) for k, v in re.findall(r"1st Choice:? ([A-Za-z ]+?): ?([\d,]+)", r[2]))
                        d["res_apps"][r[0]] = {"quota": n(r[1]), "total": n(m.group(1)), "cats": cats, "label": r[0]}
                    else:
                        ch = dict((int(k), n(v)) for k, v in re.findall(r"(\d)(?:st|nd|rd|th) Choice: ?([\d,]+)", r[2]))
                        d["nr_apps"][r[0]] = {"quota": n(r[1]), "choices": ch}
                elif h == ["UNIT", "PREFERENCE POINTS", "NUMBER OF PERMITS ISSUED BY PP"]:
                    key = "res_pts" if r[0].startswith(("Western", "Eastern")) else "nr_pts"
                    d[key].setdefault(r[0], []).append((int(r[1]), n(r[2])))
                elif h == ["UNIT", "PERMITS ISSUED", "FIRST CHOICE APPLICATIONS RECEIVED"]:
                    d["md"][r[0]] = {"issued": n(r[1]), "apps": n(r[2])}
                else:
                    raise ValueError(f"unknown table header {h}")
        for ln in lines:
            m = re.match(r"^(Western|Eastern) Kansas - Units ([\d, &]+): ([\d,]+) \((\d+) general, (\d+) landowner tenant, (\d+) youth\)$", ln)
            if m:
                d["res_drawn"][f"{m.group(1)} Kansas - Units {m.group(2)}"] = {
                    "total": n(m.group(3)), "general": int(m.group(4)), "lot": int(m.group(5)), "youth": int(m.group(6))}
        def tot(label):
            for ln in lines:
                if ln.startswith(label):
                    return ln
            return None
        d["totals"] = {k: tot(k) for k in ["Total Permits Drawn:", "Total Number of Permit Applications:",
                                            "Total Number of Points Purchased:", "Total Applications:",
                                            "Total Number of Stamps Issued:", "Total Number of Stamp Applications:",
                                            "White Tail Either Sex Permits Authorized:", "Total Permits Authorized:"]}
        res[year] = d
    return res


# ============================================================================= NR DEER PDF (2024, 2025)
def nr_deer_pdf(path):
    ws = pdf_words(path)
    cols = {
        "quota": span_cx(ws, "Quota"),
        "pp": span_cx(ws, "Preference"),
        "issued": span_cx(ws, "issued"),
        "c1": None, "c2": None, "c3": None, "c4": None,
        "over": span_cx(ws, "over"),
    }
    choice = sorted([w for w in ws if w["page"] == 0 and w["text"] == "Choice"], key=lambda w: w["x0"])
    # first 'Choice' is the 'Choice Type and Description' label, then Choice 1..4
    for k, w in zip(["c1", "c2", "c3", "c4"], choice[1:5]):
        cols[k] = w["cx"] + 3
    header_top = min(w["top"] for w in ws if w["page"] == 0 and w["text"] == "Quota")
    units = OrderedDict()
    totals = {}
    cur = None
    stamp = OrderedDict()
    in_stamp = False
    expect = 1
    for row in group_rows(ws):
        txt = " ".join(w["text"] for w in row["w"])
        if row["page"] == 0 and row["top"] <= header_top + 15:
            continue
        if re.search(r"Either Species ?/ ?(Either )?Sex Deer", txt, re.I):
            in_stamp = True
            continue
        if re.match(r"^(Page \d+ of \d+|Limited Draw Statistics|\d{4} - N)", txt, re.I):
            continue
        if in_stamp:
            m = re.match(r"NR Mule Deer Stamp, Unit (\d+) (.*)$", txt)
            if m:
                stamp[m.group(1)] = [n(x) for x in m.group(2).split()]
            elif txt.startswith("# Apps"):
                stamp["_total"] = txt
            continue
        if txt.startswith("# Permit Apps") or txt.startswith("# of Permit Apps"):
            totals["permitApps"] = txt
            continue
        if "Points Only" in txt or txt.startswith("Total Applications") or "Applications:" in txt:
            totals.setdefault("other", []).append(txt)
            continue
        for w in row["w"]:
            m_ = re.fullmatch(r"\((\d+)\)", w["text"])
            if m_:  # over-quota counts are printed in parentheses, e.g. "(4)"
                w["text"] = m_.group(1)
        toks = labeled_tokens(row["w"], {k: v for k, v in cols.items() if v})
        if not toks:
            continue
        bycol = {c: v for c, _l, v, _w in toks}
        if "quota" in bycol:
            m = re.search(r"Unit (\d+)", txt)
            if m:
                unit = m.group(1)
            else:
                unit = str(expect)
                warn(f"{os.path.basename(path)}: unit label garbled on row '{txt}', taking sequence number {unit}")
            if int(unit) != expect:
                raise ValueError(f"unit order {unit} != {expect}")
            expect += 1
            cur = units[unit] = {"quota": bycol["quota"], "points": [], "choices": {i: bycol.get(f"c{i}") for i in range(1, 5)},
                                 "over": bycol.get("over"), "label": f"NonRes Deer Unit {unit}"}
        if "pp" in bycol and "issued" in bycol:
            cur["points"].append((bycol["pp"], bycol["issued"]))
        elif "pp" in bycol or "issued" in bycol:
            raise ValueError(f"half point row: {txt}")
    title = " ".join(w["text"] for w in group_rows([w for w in ws if w["page"] == 0])[1]["w"])
    return {"units": units, "totals": totals, "stamp": stamp, "title": title}


# ============================================================================= RESIDENT DEER PDF (2024, 2025)
def res_deer_pdf(path):
    ws = pdf_words(path)
    cols = {"quota": span_cx(ws, "Authorized"), "apps": span_cx(ws, "Applicants"),
            "pp": span_cx(ws, "Preference"), "issued": span_cx(ws, "issued"),
            "drawn": span_cx(ws, "Drawn"), "over": span_cx(ws, "group")}
    east_top = min(w["top"] for w in ws if w["text"] == "East")
    zones = {"West": {"quota": None, "apps": {}, "pts": [], "drawn": {}, "over": None},
             "East": {"quota": None, "apps": {}, "pts": [], "drawn": {}, "over": None}}
    pending_pp = {}
    extra = []
    for row in group_rows(ws):
        txt = " ".join(w["text"] for w in row["w"])
        if row["top"] < 95 or "DRAW STATS" in txt:
            continue
        if txt.startswith("Preference points purchased") or txt.startswith("Total number of applications"):
            extra.append(txt)
            continue
        zone = "East" if row["top"] >= east_top - 6 else "West"
        z = zones[zone]
        toks = labeled_tokens(row["w"], cols)
        pp = [v for c, l, v, w in toks if c == "pp" and l is None]
        iss = [v for c, l, v, w in toks if c == "issued" and l is None]
        for c, l, v, w in toks:
            if c == "quota":
                z["quota"] = v
            elif c == "apps":
                z["apps"][l or "TOTAL"] = v
            elif c == "drawn":
                z["drawn"][l or "TOTAL"] = v
            elif c == "over":
                z["over"] = v
        if pp and iss:
            z["pts"].append((pp[0], iss[0]))
        elif pp or iss:
            # PDF prints a few PP labels and counts a couple of points apart vertically; pair by order
            pending_pp.setdefault(zone, []).append((pp[0] if pp else None, iss[0] if iss else None, row["top"]))
    for zone, items in pending_pp.items():
        pps = [p for p, i, t in items if p is not None]
        isss = [i for p, i, t in items if i is not None]
        if len(pps) != len(isss):
            raise ValueError(f"{path} {zone}: unpaired PP rows {items}")
        zones[zone]["pts"].extend(zip(pps, isss))
        warn(f"{os.path.basename(path)} {zone}: paired {len(pps)} PP rows printed on offset lines: {list(zip(pps, isss))}")
    for z in zones.values():
        z["pts"].sort(key=lambda t: -t[0])
    return {"zones": zones, "extra": extra}


# ============================================================================= OLD QUOTA PAGES (2022, 2023)
def quota_page(path, year):
    soup = BeautifulSoup(read(path), "lxml")
    toks = [t.strip() for t in soup.get_text("\n").split("\n") if t.strip()]
    i = toks.index(f"{year} RESIDENT EITHER SPECIES, EITHER SEX")
    res = {}
    j = i
    while j < len(toks) and not toks[j].startswith("Resident Either Species, Either Sex Deer Draw Stats Report"):
        if toks[j].startswith(("WMD", "EMD")):
            assert toks[j + 1] == "EITHER SPECIES, EITHER SEX"
            res[toks[j]] = n(toks[j + 2])
        j += 1
    k = toks.index(f"{year} NONRESIDENT DEER PERMIT TYPE")
    nr, md, left = {}, {}, {}
    j = k
    while j < len(toks) and toks[j] != "SOCIAL MEDIA":
        m = re.fullmatch(r"UNIT (\d+)", toks[j])
        if m:
            kind, val = toks[j + 1], n(toks[j + 2])
            nxt = toks[j + 3]
            lo = n(nxt) if re.fullmatch(r"\d+", nxt) else None
            (nr if kind == "WHITETAIL EITHER SEX" else md)[m.group(1)] = val
            left[(m.group(1), kind)] = lo
        j += 1
    return {"res": res, "nr": nr, "md": md, "leftover": left}


# ============================================================================= ANTELOPE
def antelope_pdf(path):
    ws = pdf_words(path)
    cols = {"quota": span_cx(ws, "Authorized"), "apps": span_cx(ws, "(1st)", "Choice"),
            "pp": span_cx(ws, "Points", "(PP)"),
            "lot": None, "gen": None, "drawn": span_cx(ws, "Drawn")}
    prefs = sorted([w for w in ws if w["page"] == 0 and w["text"] == "Pref"], key=lambda w: w["x0"])
    lot_hdr = [w for w in ws if w["page"] == 0 and w["text"] == "LO/T" and w["top"] < 110][0]
    gen_hdr = [w for w in ws if w["page"] == 0 and w["text"] == "GEN" and w["top"] < 110][0]
    cols["lot"] = (prefs[0]["x0"] + lot_hdr["x1"]) / 2
    cols["gen"] = (prefs[1]["x0"] + gen_hdr["x1"]) / 2
    hdr_bottom = max(w["top"] for w in ws if w["text"] in ("Drawn", "GEN") and w["top"] < 115)
    hunts = []
    cur = None
    total = {}
    extra = []
    for row in group_rows([w for w in ws if w["page"] == 0]):
        if row["top"] <= hdr_bottom + 2:
            continue
        txt = " ".join(w["text"] for w in row["w"])
        m = re.match(r"^Unit (\d+) (Muzzleloader|Firearms)\b", txt)
        if m:
            cur = {"unit": m.group(1), "type": m.group(2), "quota": {}, "apps": {}, "pts": [], "drawn": {}}
            hunts.append(cur)
        if txt.startswith("TOTAL"):
            cur = None
        if "Preference points purchased" in txt:
            extra.append(txt.lstrip("."))
            continue
        if txt.startswith("Page"):
            continue
        toks = labeled_tokens(row["w"], cols)
        if m:  # the unit number itself is not a count
            toks = [t for t in toks if not (t[3]["x0"] < 70)]
        target = cur if cur is not None else total
        pp = None
        lot = gen = None
        for c, l, v, w in toks:
            if c == "quota":
                target.setdefault("quota", {})[l or "TOTAL"] = v
            elif c == "apps":
                target.setdefault("apps", {})[l or "TOTAL"] = v
            elif c == "drawn":
                target.setdefault("drawn", {})[l or "TOTAL"] = v
            elif c == "pp":
                pp = v
            elif c == "lot":
                lot = v
            elif c == "gen":
                gen = v
        if cur is not None and pp is not None:
            cur["pts"].append((pp, lot, gen))
        elif lot is not None or gen is not None:
            raise ValueError(f"{path}: issued count without PP: {txt}")
    return {"hunts": hunts, "total": total, "extra": extra}


def antelope_page():
    text = read(os.path.join(RAW, "antelope-page-stats.txt"))
    out = {}
    for block in re.split(r"(?m)^## (?=\d{4} Antelope Draw Statistics)", text)[1:]:
        year = int(block[:4])
        lines = block.split("\n")
        d = {"quota": OrderedDict(), "pts": OrderedDict(), "summary": [l for l in lines[1:5]]}
        for t in tables_in(lines):
            h = [c.upper() for c in t["header"]]
            for r in t["rows"]:
                hunt = re.sub(r"\s*-\s*", " - ", r[0])  # 'Unit 2 -Firearms' -> 'Unit 2 - Firearms'
                if h[:2] == ["UNIT", "PERMIT QUOTA"]:
                    q = dict(re.findall(r"(General|Landowner Tenant): ?(\d+)", r[1]))
                    a = {}
                    for k, v in re.findall(r"(General|Landowner Tenant|Youth): ?(\d*)", r[2]):
                        a[k] = int(v) if v else None
                    d["quota"][hunt] = {"label": r[0], "quota": {k: int(v) for k, v in q.items()}, "apps": a}
                elif h[:2] == ["UNIT", "PREFERENCE POINTS"]:
                    g = None if r[2] == "-" else n(r[2])
                    l = None if r[3] == "-" else n(r[3])
                    d["pts"].setdefault(hunt, []).append((int(r[1]), g, l))
                else:
                    raise ValueError(h)
        out[year] = d
    return out


# ============================================================================= TURKEY
def turkey_u4_pdf(path):
    ws = pdf_words(path)
    cols = {"apps": span_cx(ws, "Applicants"), "pp": span_cx(ws, "Preference"),
            "issued": span_cx(ws, "issued"), "drawn": span_cx(ws, "Drawn")}
    rows = group_rows(ws)
    quota = None
    groups = OrderedDict()
    order = []
    for row in rows:
        txt = " ".join(w["text"] for w in row["w"])
        label_ws = [w for w in row["w"] if not re.fullmatch(r"[\d,]+", w["text"])]
        label = " ".join(w["text"] for w in label_ws)
        order.append((row["top"], label, labeled_tokens(row["w"], cols), txt))
        if re.fullmatch(r"\d+", txt) and quota is None and row["top"] > 115:
            quota = n(txt)
    cls = None
    extra = []
    for top, label, toks, txt in order:
        if top < 118:
            continue
        m = re.match(r"^(TOTAL )?(Gen|GEN|LO/T|NR Tenant)( Combo)?$", label)
        if txt.startswith(("TOTAL APPS", "TOTAL DRAWN", "Preference points")):
            extra.append(txt)
            cls = None
            continue
        if m:
            cls = {"Gen": "General", "GEN": "General", "LO/T": "Landowner/Tenant", "NR Tenant": "Nonresident Tenant"}[m.group(2)]
            g = groups.setdefault(cls, {"apps": {}, "drawn": {}, "pts": []})
            rowname = label
        g = groups[cls] if cls else None
        if g is None:
            continue
        pp = [v for c, l, v, w in toks if c == "pp"]
        iss = [v for c, l, v, w in toks if c == "issued"]
        for c, l, v, w in toks:
            if c == "apps":
                g["apps"][rowname] = v
            elif c == "drawn":
                g["drawn"][rowname] = v
        if len(pp) > 1 or len(iss) > 1 or (iss and not pp):
            raise ValueError(f"{path}: unexpected PP row {txt}")
        if pp and iss:
            g["pts"].append((pp[0], iss[0]))
        # a PP level printed without a count (e.g. '2' on a TOTAL row) means no permit listed for it
    return {"quota": quota, "groups": groups, "extra": extra}


def turkey_nr_pdf(path):
    txt = os.popen(f"pdftotext -layout '{path}' -").read()
    units = OrderedDict()
    for ln in txt.split("\n"):
        m = re.match(r"^\s*(\d+)\s+Unit (\d)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?\s*$", ln)
        if m:
            units[m.group(2)] = {"quota": int(m.group(1)), "c1": int(m.group(3)), "c2": int(m.group(4)),
                                 "drawn": int(m.group(5)), "leftover": int(m.group(6)) if m.group(6) else None}
    tot = {k: int(v) for k, v in re.findall(r"(TOTAL APPS|TOTAL DRAWN|Preference points purchased)\s+(\d+)", txt)}
    auth = re.search(r"^\s*(\d+)\s+\(1st Choice\)", txt, re.M)
    return {"units": units, "totals": tot, "authorized": int(auth.group(1)) if auth else None}


def turkey_page():
    text = read(os.path.join(RAW, "turkey-page-stats.txt"))
    lines = text.split("\n")
    out = {"u4": OrderedDict(), "nr": OrderedDict(), "summary": {}}
    i = 0
    cur = None
    while i < len(lines):
        ln = lines[i]
        m = re.match(r"^Unit 4 - (General|Landowner/Tenant|Nonresident Tenant) Permits$", ln)
        if m:
            cur = ("u4", m.group(1))
            out["u4"][m.group(1)] = {"pts": []}
        m2 = re.match(r"^Unit (\d) - Nonresident Permits$", ln)
        if m2:
            cur = ("nr", m2.group(1))
        m3 = re.match(r"^Total Applicants: ([\d,]+) / Total Permits Drawn: ([\d,]+)$", ln)
        if m3 and cur and cur[0] == "u4":
            out["u4"][cur[1]].update(apps=n(m3.group(1)), drawn=n(m3.group(2)))
        if ln.startswith("Total Applications:"):
            key = "u4" if "u4" not in out["summary"] else "nr"
            out["summary"][key] = ln
        if ln == "[TABLE]":
            j = lines.index("[/TABLE]", i)
            rows = [r.split(" | ") for r in lines[i + 1:j]]
            if cur[0] == "u4":
                out["u4"][cur[1]]["pts"] = [(int(a), n(b)) for a, b in rows[1:]]
            else:
                assert rows[0] == ["# Applicants / 1st Choice", "# Applicants / 2nd Choice", "# Permits Drawn"], rows[0]
                (a, b, c), = rows[1:]
                out["nr"][cur[1]] = {"c1": n(a), "c2": n(b), "drawn": n(c)}
            i = j
        i += 1
    return out


# ============================================================================= BUILD RECORDS
def rec(species, year, code, units, desc, src, choice="first", **kw):
    for k in ("resident", "nonresident", "total"):
        st = kw.get(k)
        if st and st.get("applicants") is not None and st.get("drawn") is not None and st["drawn"] > st["applicants"]:
            kw["note"] = (kw.get("note") or "") + (f" KDWP lists more permits issued ({st['drawn']}) than first-choice applicants "
                                                  f"({st['applicants']}) for this pool; it does not publish the reason.")
    r = OrderedDict(species=species, year=year, huntCode=code, units=units, description=desc)
    for k in ("method", "methodLabel", "sex", "seasonDates"):
        if kw.get(k):
            r[k] = kw[k]
    r["choice"] = choice
    for k in ("resident", "nonresident", "total"):
        if kw.get(k) is not None:
            r[k] = OrderedDict((a, b) for a, b in kw[k].items())
    if kw.get("note"):
        r["note"] = kw["note"]
    r["sourceId"] = src
    return r


def build():
    out = {"whitetail": [], "mule-deer": [], "pronghorn": [], "turkey": []}
    checks = []
    page = deer_page()
    nr24 = nr_deer_pdf(os.path.join(WB, "nr-deer-20241105.pdf"))
    nr25 = nr_deer_pdf(os.path.join(WB, "nr-deer-20260122.pdf"))
    rs24 = res_deer_pdf(os.path.join(WB, "res-deer-20250522.pdf"))
    rs25 = res_deer_pdf(os.path.join(WB, "res-deer-20260122.pdf"))
    q22 = quota_page(os.path.join(WB, "dq-20221206180810.html"), 2022)
    q23 = quota_page(os.path.join(WB, "dq-20230721164947.html"), 2023)
    q24 = quota_page(os.path.join(WB, "dq-20240713073722.html"), 2024)

    # ---------------- NR whitetail ----------------
    for year, q, src in ((2022, q22, SRC["quota_2022"]), (2023, q23, SRC["quota_2023"])):
        for u, quota in q["nr"].items():
            lo = q["leftover"].get((u, "WHITETAIL EITHER SEX"))
            out["whitetail"].append(rec(
                "whitetail", year, f"Unit {u}", [u], f"UNIT {u} - {year} Nonresident Whitetail Either Sex permits authorized", src,
                sex="either", nonresident={"quota": quota},
                note=f"KDWP published only permits authorized for {year} (archived Quotas and Draw Stats page); "
                     f"applicant and draw counts for {year} are no longer posted by KDWP. Leftover permits listed: {lo}."))
    for year, d, src in ((2024, nr24, SRC["nr_deer_2024"]),):
        for u, x in d["units"].items():
            drawn = sum(c for _p, c in x["points"])
            ch = x["choices"]
            assert q24["nr"][u] == x["quota"], (u, q24["nr"][u], x["quota"])
            out["whitetail"].append(rec(
                "whitetail", year, f"Unit {u}", [u], f"{x['label']} - 2024 Nonresident Whitetail Either Sex Deer, first application period", src,
                sex="either",
                nonresident={"quota": x["quota"], "applicants": ch[1], "drawn": drawn, "minPoints": min_points(x["points"])},
                note=f"applicants = Choice 1 total; Choice 2/3/4 totals: {ch[2]}/{ch[3]}/{ch[4]}. drawn = sum of KDWP's "
                     f"permits-issued-by-preference-point rows ({x['over']} over quota due to group draw); these permits may include "
                     f"applicants who listed the unit as a lower choice, so odds are not computed. Permits issued by preference points: "
                     f"{pts_note(x['points'])}."))
    for u, x in nr25["units"].items():
        label = f"Unit {u}"
        pa, pp_ = page[2025]["nr_apps"][label], page[2025]["nr_pts"][label]
        drawn = sum(c for _p, c in x["points"])
        ch = x["choices"]
        diffs = []
        if pa["quota"] != x["quota"]:
            diffs.append(f"quota {pa['quota']}")
        for i in range(1, 5):
            if pa["choices"][i] != ch[i]:
                diffs.append(f"choice-{i} applications {pa['choices'][i]}")
        for (p1, c1), (p2, c2) in zip(pp_, x["points"]):
            if (p1, c1) != (p2, c2):
                diffs.append(f"{p1}-pt permits {c1}")
        if len(pp_) != len(x["points"]):
            diffs.append("a different number of preference-point rows")
        checks.append(f"2025 NR whitetail {label}: web page vs KDWP PDF report: {'match' if not diffs else 'page differs: ' + '; '.join(diffs)}")
        note = (f"applicants = Choice 1 total; Choice 2/3/4 totals: {ch[2]}/{ch[3]}/{ch[4]}. drawn = sum of KDWP's "
                f"permits-issued-by-preference-point rows ({x['over'] or 0} over quota due to group draw); these permits may include "
                f"applicants who listed the unit as a lower choice, so odds are not computed. Permits issued by preference points: "
                f"{pts_note(x['points'])}.")
        if diffs:
            note += (" KDWP's 2025 web table shows " + "; ".join(diffs) + " for this unit; the PDF report is used because its rows add up "
                     "to the unit and statewide totals.")
        out["whitetail"].append(rec(
            "whitetail", 2025, label, [u], f"{x['label']} - 2025 Nonresident Whitetail Either Sex Deer, first application period", SRC["nr_deer_2025"],
            sex="either",
            nonresident={"quota": x["quota"], "applicants": ch[1], "drawn": drawn, "minPoints": min_points(x["points"])}, note=note))
    for year in (2026,):
        d = page[year]
        src = SRC["page_deer"]
        for label, a in d["nr_apps"].items():
            u = label.replace("Unit ", "")
            pts = d["nr_pts"][label]
            drawn = sum(c for _p, c in pts)
            ch = a["choices"]
            note = (f"applicants = 1st-choice applications; 2nd/3rd/4th choice: {ch[2]}/{ch[3]}/{ch[4]}. drawn = sum of KDWP's "
                    f"permits-issued-by-preference-point rows (may include applicants who listed the unit as a lower choice and "
                    f"over-quota group draws), so odds are not computed. Permits issued by preference points: {pts_note(pts)}.")
            assert d["nr_quota"][label] == a["quota"]
            over = drawn - a["quota"]
            checks.append(f"2026 NR whitetail {label}: PP rows sum {drawn} vs quota {a['quota']} (diff {over})")
            if over < 0 or over > 3:
                warn(f"2026 NR {label}: PP rows sum {drawn} vs quota {a['quota']}")
                note += f" Note: KDWP's preference-point rows for this unit sum to {drawn} against a quota of {a['quota']}."
            out["whitetail"].append(rec(
                "whitetail", year, label, [u], f"{label} - Whitetail Either Sex (nonresident)", src, sex="either",
                nonresident={"quota": a["quota"], "applicants": ch[1], "drawn": drawn, "minPoints": min_points(pts)}, note=note))

    # ---------------- NR mule deer stamp ----------------
    for year, q, src in ((2022, q22, SRC["quota_2022"]), (2023, q23, SRC["quota_2023"])):
        for u, quota in q["md"].items():
            out["mule-deer"].append(rec(
                "mule-deer", year, f"NR Mule Deer Stamp, Unit {u}", [u], f"UNIT {u} - {year} Nonresident Mule Deer Stamp permits authorized", src,
                sex="either", nonresident={"quota": quota},
                note=f"KDWP published only stamps authorized for {year}; applicant and draw counts for {year} are no longer posted. "
                     f"Leftover stamps listed: {q['leftover'].get((u, 'MULE DEER STAMP'))}."))
    for u, vals in nr24["stamp"].items():
        if u == "_total":
            continue
        quota, c1, c2, c3, c4, left = vals
        assert q24["md"][u] == quota
        out["mule-deer"].append(rec(
            "mule-deer", 2024, f"NR Mule Deer Stamp, Unit {u}", [u], f"NR Mule Deer Stamp, Unit {u} - 2024 Nonresident Either Species / Either Sex Deer", SRC["nr_deer_2024"],
            sex="either", nonresident={"quota": quota, "applicants": c1, "drawn": None},
            note=f"applicants = Choice 1 total (Choice 2-4: {c2}/{c3}/{c4}); KDWP lists {left} left-over stamps but does not publish the "
                 f"number issued for 2024. Only nonresidents who draw a Unit 1, 2, 17 or 18 archery or muzzleloader whitetail permit are "
                 f"entered in the stamp draw; preference points do not count."))
    for year in (2025, 2026):
        d = page[year]
        for label, x in d["md"].items():
            u = label.replace("Unit ", "")
            if year == 2026:
                quota = d["md_quota"][label]
                qnote = ""
            else:
                s = nr25["stamp"][u]
                quota = s[0]
                qnote = f" Quota from KDWP's 2025 nonresident draw report (points-only column {s[1]}, left over {s[6]})."
                checks.append(f"2025 NR mule deer stamp Unit {u}: page apps {x['apps']} vs PDF choice-1 {s[2]} -> {'match' if s[2] == x['apps'] else 'DIFFER'}")
            out["mule-deer"].append(rec(
                "mule-deer", year, f"NR Mule Deer Stamp, Unit {u}", [u], f"{label} - Nonresident Mule Deer Stamp", SRC["page_deer"],
                sex="either", nonresident={"quota": quota, "applicants": x["apps"], "drawn": x["issued"]},
                note="applicants = first-choice stamp applications; drawn = stamps issued. Only nonresidents who draw a Unit 1, 2, 17 or 18 "
                     "archery or muzzleloader whitetail permit are entered in the stamp draw; preference points do not count; odds not computed." + qnote))

    # ---------------- Resident either-species / either-sex firearm (mule-deer file) ----------------
    W, E = "Western Kansas - Units 1, 2, 17 & 18", "Eastern Kansas - Units 3, 4, 5, 7 & 16"
    for year, q, src in ((2022, q22, SRC["quota_2022"]), (2023, q23, SRC["quota_2023"])):
        for lbl, quota in q["res"].items():
            code = W if lbl.startswith("WMD") else E
            units = ["1", "2", "17", "18"] if code == W else ["3", "4", "5", "7", "16"]
            out["mule-deer"].append(rec(
                "mule-deer", year, code, units, f"{lbl} - {year} Resident Either Species, Either Sex Firearms Deer Permit (white-tailed or mule deer) permits authorized", src,
                method="rifle", methodLabel="Firearms", sex="either", resident={"quota": quota},
                note=f"KDWP published only permits authorized for {year}; applicant and draw counts for {year} are no longer posted."))
    for year, rs, src in ((2024, rs24, SRC["res_deer_2024"]), (2025, rs25, SRC["res_deer_2025"])):
        for zone, z in rs["zones"].items():
            code = W if zone == "West" else E
            units = ["1", "2", "17", "18"] if zone == "West" else ["3", "4", "5", "7", "16"]
            drawn = z["drawn"]["TOTAL"]
            s = sum(c for _p, c in z["pts"])
            if s != drawn:
                warn(f"{year} resident {zone}: PP rows sum {s} != total drawn {drawn}")
            apps = z["apps"]
            cats = {k: v for k, v in apps.items() if k != "TOTAL"}
            if sum(cats.values()) != apps["TOTAL"]:
                warn(f"{year} resident {zone}: applicant categories {cats} != total {apps['TOTAL']}")
            dcat = {k: v for k, v in z["drawn"].items() if k != "TOTAL"}
            note = (f"applicants = 1st-choice applications ({', '.join(f'{v} {k}' for k, v in cats.items())}); drawn: "
                    f"{', '.join(f'{v} {k}' for k, v in dcat.items())}; permits over quota due to group draw: {z['over']}. "
                    f"Permits issued by preference points: {pts_note(z['pts'])}. Odds not computed (landowner/tenant and youth pools).")
            if year == 2025:
                p = page[2025]
                pl = W if zone == "West" else E
                pa = p["res_apps"][[k for k in p["res_apps"] if k.startswith(pl.split(" -")[0])][0]]
                pp = p["res_pts"][pl]
                checks.append(f"2025 resident {zone}: page quota {pa['quota']} / PDF {z['quota']}; page 1st-choice {pa['total']} / PDF {apps['TOTAL']}; "
                              f"page PP rows {pp} vs PDF {z['pts']}")
                if set(pp) != set(z["pts"]):
                    note += (" KDWP's web page omits " + ", ".join(f"the {p_} pt row ({c})" for p_, c in sorted(set(z["pts"]) - set(pp))) +
                             " that its PDF report lists; the PDF is used.")
            out["mule-deer"].append(rec(
                "mule-deer", year, code, units,
                f"{zone} Zone (units {','.join(units)}) - {year} Resident Either Species/Either Sex Firearms Deer Permit (white-tailed or mule deer)", src,
                method="rifle", methodLabel="Firearms", sex="either",
                resident={"quota": z["quota"], "applicants": apps["TOTAL"], "drawn": drawn, "minPoints": min_points(z["pts"])}, note=note))
    d = page[2026]
    for label, a in d["res_apps"].items():
        code = W if label.startswith("Western") else E
        units = ["1", "2", "17", "18"] if code == W else ["3", "4", "5", "7", "16"]
        pts = d["res_pts"][code]
        dr = d["res_drawn"][code]
        s = sum(c for _p, c in pts)
        assert s == dr["total"], (s, dr)
        assert d["res_quota"][code] == a["quota"]
        cats = a["cats"]
        apps_val = a["total"]
        app_note = ""
        if sum(cats.values()) != a["total"]:
            warn(f"2026 resident {code}: categories {cats} sum {sum(cats.values())} != published total {a['total']}")
            apps_val = None
            app_note = (f"applicants left empty: KDWP's table says {a['total']} total 1st-choice applications but its categories add to "
                        f"{sum(cats.values())} (and its statewide total of 2,176 applications equals 2,000 West + {sum(cats.values())}). ")
        out["mule-deer"].append(rec(
            "mule-deer", 2026, code, units, f"{label} - Resident Either Species, Either Sex Firearms Deer Permit (white-tailed or mule deer)", SRC["page_deer"],
            method="rifle", methodLabel="Firearms", sex="either",
            resident={"quota": a["quota"], "applicants": apps_val, "drawn": dr["total"], "minPoints": min_points(pts)},
            note=(app_note + f"applicants = 1st-choice applications ({', '.join(f'{v} {k}' for k, v in cats.items())}); drawn: {dr['general']} general, "
                  f"{dr['lot']} landowner tenant, {dr['youth']} youth. Permits issued by preference points: {pts_note(pts)}. "
                  + ("KDWP's applications table labels this zone 'Units 1, 12, 17 & 18'; its quota and points tables say Units 1, 2, 17 & 18. "
                     if code == W else "") + "Odds not computed (landowner/tenant and youth pools).")))

    # ---------------- Pronghorn (resident firearms / muzzleloader draw) ----------------
    for year in (2022, 2023, 2024):
        a = antelope_pdf(os.path.join(WB, f"ant-{year}.pdf"))
        src = SRC[f"ant_{year}"]
        for h in a["hunts"]:
            hunt = f"Unit {h['unit']} - {h['type']}"
            meth = "muzzleloader" if h["type"] == "Muzzleloader" else "rifle"
            for pool, key, idx in (("General", "GEN", 2), ("Landowner Tenant", "LO/T", 1)):
                pts = [(p[0], p[idx]) for p in h["pts"] if p[idx] is not None]
                drawn = h["drawn"].get(key)
                s = sum(c for _p, c in pts)
                if s != drawn:
                    warn(f"antelope {year} {hunt} {key}: PP sum {s} != drawn {drawn}")
                other = {k: v for k, v in h["apps"].items() if k not in (key, "LO/T", "GEN")}
                out["pronghorn"].append(rec(
                    "pronghorn", year, f"{hunt} ({pool})", [h["unit"]], f"Unit {h['unit']} {h['type']} - {key} permits ({year} Antelope Draw Stats)", src,
                    method=meth, methodLabel=h["type"], sex="either",
                    resident={"quota": h["quota"].get(key), "applicants": h["apps"].get(key), "drawn": drawn, "minPoints": min_points(pts)},
                    note=(f"applicants = {key} 1st-choice applicants. Other 1st-choice applicants for this hunt, pool not stated by KDWP: "
                          f"{', '.join(f'{v} {k}' for k, v in other.items()) or 'none'}. Permits issued by preference points ({key}): {pts_note(pts)}. "
                          + ("" if s == drawn else f"KDWP's preference-point rows sum to {s}. ") + "Odds not computed.")))
        checks.append(f"antelope {year}: totals row {a['total']} {a['extra']}")
    ap = antelope_page()
    for year in (2025, 2026):
        d = ap[year]
        published_issued = n(re.search(r"Total Permits Issued: ([\d,]+)", "\n".join(d["summary"])).group(1))
        pool_sums = {(h, i): sum(r[i] for r in d["pts"].get(h, []) if r[i] is not None) for h in d["quota"] for i in (1, 2)}
        statewide = sum(pool_sums.values())
        checks.append(f"antelope {year}: sum of all preference-point rows {statewide} vs KDWP total permits issued {published_issued}")
        suspect = set()
        if statewide != published_issued:
            for (h, i), s in pool_sums.items():
                if s != d["quota"][h]["quota"]["General" if i == 1 else "Landowner Tenant"]:
                    suspect.add((h, i))
            warn(f"antelope {year}: PP rows sum {statewide} != published {published_issued}; suspect pools {suspect}")
        for hunt, q in d["quota"].items():
            unit, typ = re.match(r"Unit (\d+) - (\w+)", hunt).groups()
            meth = "muzzleloader" if typ == "Muzzleloader" else "rifle"
            rows = d["pts"].get(hunt, [])
            for pool, idx in (("General", 1), ("Landowner Tenant", 2)):
                pts = [(r[0], r[idx]) for r in rows if r[idx] is not None]
                drawn = sum(c for _p, c in pts)
                ap_n = q["apps"].get(pool)
                extra_note = ""
                if (hunt, idx) in suspect:
                    extra_note = (f"drawn left empty: these preference-point rows add to {drawn} against a {pool} quota of "
                                  f"{q['quota'][pool]}, and all {year} rows add to {statewide} while KDWP reports {published_issued} "
                                  f"permits issued. ")
                    drawn = None
                if pool in q["apps"] and q["apps"][pool] is None:
                    extra_note = f"KDWP left the {pool} first-choice applications cell blank. "
                out["pronghorn"].append(rec(
                    "pronghorn", year, f"{hunt} ({pool})", [unit], f"{q['label']} - {pool} permits", SRC["page_ant"],
                    method=meth, methodLabel=typ, sex="either",
                    resident={"quota": q["quota"][pool], "applicants": ap_n, "drawn": drawn, "minPoints": min_points(pts)},
                    note=(f"applicants = {pool} first-choice applications; Youth first-choice applications for this hunt (pool not stated by KDWP): "
                          f"{q['apps'].get('Youth')}. drawn = sum of KDWP's {pool} permits-issued-by-preference-point rows: {pts_note(pts)}. "
                          + extra_note + "Odds not computed.")))
        checks.append(f"antelope {year} page summary: {d['summary']}")

    # ---------------- Turkey ----------------
    for year in (2023, 2024, 2025):
        t = turkey_u4_pdf(os.path.join(WB, f"tky4-{year}.pdf"))
        src = SRC[f"tky4_{year}"]
        for cls, g in t["groups"].items():
            tot_key = [k for k in g["drawn"] if k.startswith("TOTAL")]
            drawn = g["drawn"][tot_key[0]] if tot_key else None
            apps_key = [k for k in g["apps"] if k.startswith("TOTAL")]
            apps = g["apps"][apps_key[0]] if apps_key else None
            pts = g["pts"]
            s = sum(c for _p, c in pts)
            parts = {k: v for k, v in g["apps"].items() if not k.startswith("TOTAL")}
            note = (f"Unit 4 spring turkey permits authorized (all classes): {t['quota']}; per-class quotas not published. "
                    f"Applicant rows: {', '.join(f'{k} {v}' for k, v in parts.items())}. Permits issued by preference points: {pts_note(pts) if pts else 'see source'}.")
            if s != drawn:
                note += f" KDWP's preference-point rows sum to {s} while its class total drawn is {drawn}."
                warn(f"turkey U4 {year} {cls}: PP sum {s} != drawn {drawn}")
            stats = {"quota": None, "applicants": apps, "drawn": drawn, "minPoints": min_points(pts)}
            kw = {"nonresident": stats} if cls == "Nonresident Tenant" else {"resident": stats}
            out["turkey"].append(rec("turkey", year, f"Unit 4 - {cls} Permits", ["4"], f"{year} Spring Turkey Unit 4 Draw - {cls}", src,
                                     methodLabel="Spring", sex="male", note=note + " Odds not computed.", **kw))
        checks.append(f"turkey U4 {year}: {t['extra']}")
    tp = turkey_page()
    for cls, g in tp["u4"].items():
        s = sum(c for _p, c in g["pts"])
        assert s == g["drawn"], (cls, s, g)
        stats = {"quota": None, "applicants": g["apps"], "drawn": g["drawn"], "minPoints": min_points(g["pts"])}
        kw = {"nonresident": stats} if cls == "Nonresident Tenant" else {"resident": stats}
        out["turkey"].append(rec("turkey", 2026, f"Unit 4 - {cls} Permits", ["4"], f"Unit 4 - {cls} Permits (2026 Unit 4 Spring Turkey Season)", SRC["page_tky"],
                                 methodLabel="Spring", sex="male",
                                 note=(f"375 Unit 4 permits authorized in total (200 reserved for landowners/tenants and nonresident tenants); per-class quotas "
                                       f"not published. Permits issued by preference points: {pts_note(g['pts'])}. Odds not computed."), **kw))
    for year in (2024, 2025):
        t = turkey_nr_pdf(os.path.join(WB, f"tkynr-{year}.pdf"))
        for u, x in t["units"].items():
            out["turkey"].append(rec("turkey", year, f"Unit {u}", [u], f"{year} Spring Turkey Nonresident Draw - Unit {u}", SRC[f"tkynr_{year}"],
                                     methodLabel="Spring", sex="male",
                                     nonresident={"quota": x["quota"], "applicants": x["c1"], "drawn": x["drawn"]},
                                     note=(f"applicants = 1st-choice applicants; 2nd-choice applicants: {x['c2']}. drawn may include 2nd-choice "
                                           f"applicants, so odds are not computed." + (f" Leftover permits: {x['leftover']}." if x["leftover"] is not None else ""))))
        s = sum(x["drawn"] for x in t["units"].values())
        checks.append(f"turkey NR {year}: sum drawn {s} vs TOTAL DRAWN {t['totals'].get('TOTAL DRAWN')}; sum c1 "
                      f"{sum(x['c1'] for x in t['units'].values())} vs TOTAL APPS {t['totals'].get('TOTAL APPS')}; authorized {t['authorized']}")
    for u, x in tp["nr"].items():
        out["turkey"].append(rec("turkey", 2026, f"Unit {u}", [u], f"Unit {u} - Nonresident Permits (2026 Nonresident Spring Turkey Season)", SRC["page_tky"],
                                 methodLabel="Spring", sex="male",
                                 nonresident={"quota": None, "applicants": x["c1"], "drawn": x["drawn"]},
                                 note=(f"applicants = 1st-choice applicants; 2nd-choice applicants: {x['c2']}. 9,700 nonresident permits authorized "
                                       f"statewide for 2026; KDWP did not publish 2026 per-unit quotas. drawn may include 2nd-choice applicants, so odds are not computed.")))
    checks.append(f"turkey NR 2026: sum drawn {sum(x['drawn'] for x in tp['nr'].values())} vs page summary {tp['summary']}")

    # ---------------- statewide cross-checks ----------------
    for year, label in ((2026, "page"), (2025, "pdf")):
        s = sum(r["nonresident"]["drawn"] for r in out["whitetail"] if r["year"] == year)
        nr_lines = [l for l in page[year]["lines"] if l.startswith("Total Permits Drawn:")]
        checks.append(f"NR whitetail {year}: sum of unit drawn {s}; KDWP statewide lines: {nr_lines}")
        s = sum(r["nonresident"]["quota"] for r in out["whitetail"] if r["year"] == year)
        checks.append(f"NR whitetail {year}: sum of unit quotas {s}")
        s = sum(r["nonresident"]["applicants"] for r in out["whitetail"] if r["year"] == year)
        checks.append(f"NR whitetail {year}: sum of 1st-choice applicants {s}; KDWP lines: {[l for l in page[year]['lines'] if 'Permit Applications' in l]}")
    s = sum(r["nonresident"]["drawn"] for r in out["whitetail"] if r["year"] == 2024)
    checks.append(f"NR whitetail 2024: sum of unit drawn {s}; sum quotas {sum(r['nonresident']['quota'] for r in out['whitetail'] if r['year'] == 2024)}; "
                  f"sum c1 {sum(r['nonresident']['applicants'] for r in out['whitetail'] if r['year'] == 2024)}; KDWP totals row: {nr24['totals'].get('permitApps')}")
    for y in (2022, 2023):
        checks.append(f"NR whitetail {y}: sum quotas {sum(r['nonresident']['quota'] for r in out['whitetail'] if r['year'] == y)}")
    return out, checks


def main():
    out, checks = build()
    os.makedirs(OUT, exist_ok=True)
    for sp, rows in out.items():
        rows.sort(key=lambda r: (r["year"], r["huntCode"]))
        with open(os.path.join(OUT, f"{sp}.json"), "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
            f.write("\n")
        yrs = sorted({r["year"] for r in rows})
        print(f"{sp}: {len(rows)} rows, years {yrs}")
    print("\nCROSS-CHECKS")
    for c in checks:
        print(" ", c)
    print(f"\n{len(WARN)} warnings")


if __name__ == "__main__":
    main()
