"""Parsers for AZGFD draw-report text (pdftotext -layout output).

parse_pass(path)        -> {hunt: {"All": [...], "Res": [...], "NonRes": [...], "flag": str}}
parse_bpr(path)         -> {hunt: [(points, [15 ints]), ...]}
parse_odds(path)        -> {hunt: {...}}
parse_regs(path)        -> {hunt: {...}}

Hunt numbers are returned without the zero-padding / footnote asterisk some reports print
(e.g. 2023 Spring prints "04001*"); the raw spelling is kept in "raw".
"""
import re

NUM = re.compile(r"^-?\d+(?:\.\d+)?$")


def _hunt_key(tok):
    raw = tok
    star = tok.endswith("*")
    tok = tok.rstrip("*")
    if len(tok) == 5 and tok.startswith("0"):
        tok = tok[1:]
    return tok, raw, star


# ---------------------------------------------------------------- PDF rows (char level)
CACHE_DIR = None  # set by caller to cache extracted rows as JSON (outside the repo)


def pdf_rows(pdf_path):
    if CACHE_DIR:
        import json, os
        st = os.stat(pdf_path)
        cp = os.path.join(CACHE_DIR, f"{os.path.basename(pdf_path)}.{st.st_size}.rows.json")
        if os.path.exists(cp):
            return [tuple(r) for r in json.load(open(cp))]
        rows = list(_pdf_rows(pdf_path))
        os.makedirs(CACHE_DIR, exist_ok=True)
        json.dump(rows, open(cp, "w"))
        return [tuple(r) for r in json.load(open(cp))]
    return list(_pdf_rows(pdf_path))


def _pdf_rows(pdf_path):
    """Yield (page, top, [(text, x0, x1), ...]) for every text line of the PDF.

    Built from individual characters with a tight vertical tolerance, because some AZGFD
    reports draw two table rows ~1pt apart (pdftotext merges those into garbage).
    """
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            chars = sorted(pg.chars, key=lambda c: (c["top"], c["x0"]))
            lines = []
            for c in chars:
                if lines and abs(c["top"] - lines[-1][0]) < 0.3:
                    lines[-1][1].append(c)
                else:
                    lines.append([c["top"], [c]])
            for top, cs in lines:
                cs.sort(key=lambda c: c["x0"])
                words = []
                for c in cs:
                    if c["text"].isspace():
                        words.append(None)
                        continue
                    if words and words[-1] is not None and c["x0"] - words[-1][-1]["x1"] < 1.5:
                        words[-1].append(c)
                    else:
                        words.append([c])
                ws = [("".join(c["text"] for c in w), w[0]["x0"], w[-1]["x1"]) for w in words if w]
                if ws:
                    yield pi, top, ws


def _assign(ws, anchors, tol=22):
    """Place right-aligned numeric words into column slots by nearest anchor x1."""
    slots = [None] * len(anchors)
    for (t, x0, x1) in ws:
        best = min(range(len(anchors)), key=lambda i: abs(anchors[i] - x1))
        if abs(anchors[best] - x1) > tol or slots[best] is not None:
            raise ValueError(f"cannot place {t}@{x1:.0f} (anchors {[round(a) for a in anchors]})")
        slots[best] = t
    return slots


def _num(t):
    if t is None:
        return None
    if re.match(r"^-?\d+$", t):
        return int(t)
    raise ValueError(f"not an integer: {t}")


HUNT_TOK = re.compile(r"^\d{4,5}\*?$")
LABELS = ("All", "Res", "NonRes")


def parse_pass(pdf_path, ncols=None):
    """Pass report -> {hunt: {"raw", "star", "All": [..], "Res": [..], "NonRes": [..]}}.

    ncols = 11 for Bonus and 1-2 pass reports: authorized, available, c1_app, c2_app,
    c12_app, c1_drawn, c2_drawn, second_issued_first, issued_this_pass, grand_total_issued,
    unissued. ncols = 8 for 3-4-5 pass: authorized, available, c3_app, c45_app, c345_app,
    issued_this_pass, grand_total_issued, unissued. Blank cells become None. Res/NonRes rows
    have no 'unissued' cell.
    """
    rows = pdf_rows(pdf_path)
    if ncols is None:  # 3-4-5 pass layout changed in 2024 (11 -> 8 columns)
        from collections import Counter
        cnt = Counter(len(ws) - 1 for pi, top, ws in rows if ws[0][0] == "All" and len(ws) - 1 in (8, 11))
        ncols = cnt.most_common(1)[0][0]
    # column anchors from complete All rows, per page with document fallback
    per_page = {}
    for pi, top, ws in rows:
        if ws[0][0] == "All" and len(ws) == ncols + 1:
            per_page.setdefault(pi, []).append([w[2] for w in ws[1:]])
    allx = [x for v in per_page.values() for x in v]
    if not allx:
        raise ValueError(f"{pdf_path}: no complete All rows")
    def med(vals):
        vals = sorted(vals)
        return vals[len(vals) // 2]
    doc_anchor = [med([r[i] for r in allx]) for i in range(ncols)]
    page_anchor = {pi: [med([r[i] for r in v]) for i in range(ncols)] for pi, v in per_page.items()}
    out = {}
    cur = None
    for pi, top, ws in rows:
        if HUNT_TOK.match(ws[0][0]) and all(re.match(r"^-?\d+$", w[0]) for w in ws[1:]) and len(ws) <= 4:
            key, raw, star = _hunt_key(ws[0][0])
            if key in out:
                raise ValueError(f"{pdf_path}: hunt {raw} appears twice")
            cur = out[key] = {"raw": raw, "star": star, "page": pi + 1}
            continue
        if ws[0][0] in LABELS and cur is not None and all(re.match(r"^-?\d+$", w[0]) for w in ws[1:]):
            lab = ws[0][0]
            if lab in cur:
                raise ValueError(f"{pdf_path}: duplicate {lab} for {cur['raw']}")
            anchors = page_anchor.get(pi, doc_anchor)
            vals = [_num(t) for t in _assign(ws[1:], anchors)]
            cur[lab] = vals
    for v in out.values():
        v["ncols"] = ncols
    return out


# ---------------------------------------------------------------- bonus point report
def parse_bpr(pdf_path):
    """Bonus Point Report -> {hunt: [(points, [15 ints]), ...]}.

    15 values: 1st-choice applicants T/R/NR, 2nd-choice T/R/NR, 1st+2nd T/R/NR,
    permits issued in the bonus pass T/R/NR, permits issued bonus + 1-2 pass T/R/NR.
    """
    out = {}
    bad = []
    for pi, top, ws in pdf_rows(pdf_path):
        toks = [w[0] for w in ws]
        if not HUNT_TOK.match(toks[0]) or len(toks) < 2:
            continue
        if not all(re.match(r"^\d+$", t) for t in toks[1:]):
            continue
        if len(toks) != 17:
            bad.append((pi + 1, " ".join(toks)))
            continue
        key, raw, star = _hunt_key(toks[0])
        out.setdefault(key, []).append((int(toks[1]), [int(t) for t in toks[2:]]))
    return out, bad


# ---------------------------------------------------------------- draw-odds summaries
DATE = r"(?:\d{1,2}/\d{1,2}/\d{4}|\d{5})"
ODDS_LINE = re.compile(
    r"^\s*(?P<unit>\S.*?)\s+(?P<hunt>\d{4})\s+(?P<year>20\d\d)\s+(?P<method>\S.*?)\s+"
    r"(?P<open>" + DATE + r")\s+(?P<close>" + DATE + r")\s+(?P<type>\S.*?)"
    r"(?P<nums>(?:\s+(?:\d+|#DIV/0!|[\d.]+))+)\s*$")


def _excel_date(s):
    """Some 2024/2025 odds PDFs print Excel serial dates (e.g. 45527) instead of m/d/yyyy."""
    if "/" in s:
        return s, False
    import datetime
    d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(s))
    return f"{d.month}/{d.day}/{d.year}", True


def parse_odds(path):
    out = {}
    for ln in open(path, encoding="utf-8", errors="replace"):
        m = ODDS_LINE.match(ln.rstrip("\n"))
        if not m:
            continue
        nums = m.group("nums").split()
        o, oc = _excel_date(m.group("open"))
        c, cc = _excel_date(m.group("close"))
        rec = {
            "unit": m.group("unit").strip(),
            "year": int(m.group("year")),
            "method": m.group("method").strip(),
            "open": o, "close": c, "serialDate": oc or cc,
            "type": m.group("type").strip(),
            "nums": nums,  # [fc, sc, issued, odds] when complete; blanks collapse
        }
        prev = out.get(m.group("hunt"))
        if prev is not None:
            # AZGFD prints a few hunt numbers twice with different units/dates; keep every row
            # so draw_parse.py can settle them against the regulation booklet.
            rec["dups"] = prev.pop("dups", []) + [prev]
        out[m.group("hunt")] = rec
    return out


# ---------------------------------------------------------------- regulation hunt tables
MON = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
RANGE = MON + r" \d{1,2}(?:, \d{4})? - " + MON + r" \d{1,2}, \d{4}"
DATES = r"(?:" + RANGE + r")(?:,? and (?:" + RANGE + r"))*"
REG_ROW = re.compile(r"^(?P<lead>\s*)(?P<hunt>\d{4}|----)\s+(?P<rest>.*)$")
SECTION = re.compile(r"^\s*([A-Z][A-Z0-9 ()\-–,/'’]+(?:ELK|PRONGHORN|DEER|SHEEP|TURKEY|JAVELINA|BISON|CRANE|BEAR|LION))\b(.*)$")


def parse_regs_tables(pdf_path):
    """Parse the ruled 'Hunt No. | Season Dates | Notes | Open Areas | Legal Wildlife | Permits'
    tables of an AZGFD regulation booklet with pdfplumber's table finder.

    Returns {hunt: {section, dates, notes, openAreas, legal, permits, bonusOnly, page}}.
    The section is the upper-case title printed above the table (e.g. 'ARCHERY-ONLY ELK').
    """
    import pdfplumber
    out = {}
    section = None
    with pdfplumber.open(pdf_path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            tables = pg.find_tables()
            if not tables:
                continue
            # text lines on the page, to find the section title above each table
            words = pg.extract_words(keep_blank_chars=True, x_tolerance=1.5)
            lines = {}
            for w in words:
                lines.setdefault(round(w["top"]), []).append(w)
            for t in sorted(tables, key=lambda t: (t.bbox[1], t.bbox[0])):
                rows = t.extract()
                if not rows:
                    continue
                hdr = None
                for r in rows[:3]:
                    cells = [(c or "").replace("\n", " ").strip() for c in r]
                    if any(c.startswith("Hunt No") for c in cells):
                        hdr = cells
                        break
                if hdr is None:
                    continue
                def col(name):
                    for i, c in enumerate(hdr):
                        if c.startswith(name):
                            return i
                    return None
                ci = {k: col(k) for k in ("Hunt No", "Season Dates", "Notes", "Open Areas", "Legal Wildlife", "Permits")}
                # nearest title line above the table, horizontally overlapping it
                x0, top, x1, bottom = t.bbox
                best = None
                for y, ws in lines.items():
                    if y >= top or y < top - 40:
                        continue
                    ws = [w for w in ws if w["x1"] > x0 - 5 and w["x0"] < x1 + 5]
                    txt = " ".join(w["text"].strip() for w in sorted(ws, key=lambda w: w["x0"])).strip()
                    m = SECTION.match(txt)
                    if m and m.group(1) == m.group(1).upper():
                        if best is None or y > best[0]:
                            best = (y, txt)
                if best:
                    section = best[1]
                for r in rows:
                    cells = [(c or "").replace("\n", " ").strip() for c in r]
                    h = cells[ci["Hunt No"]] if ci["Hunt No"] is not None else ""
                    if not re.match(r"^\d{4}$", h):
                        continue
                    get = lambda k: cells[ci[k]] if ci[k] is not None and ci[k] < len(cells) else None
                    rec = {"section": section, "page": pi + 1,
                           "dates": get("Season Dates"), "notes": get("Notes") or None,
                           "openAreas": get("Open Areas"), "legal": get("Legal Wildlife"),
                           "permits": get("Permits")}
                    if rec["dates"] and "BONUS POINT ONLY" in " ".join(c for c in cells if c):
                        rec["bonusOnly"] = True
                    if rec["permits"] and re.match(r"^[\d,]+$", rec["permits"]):
                        rec["permits"] = int(rec["permits"].replace(",", ""))
                    if h in out:
                        if out[h] == rec:
                            continue
                        raise ValueError(f"{pdf_path}: hunt {h} in two tables (pages {out[h]['page']} and {pi+1})")
                    out[h] = rec
    return out


def parse_regs_text(txt_path):
    """Text-layout fallback for regulation hunt tables (pdftotext -layout output).

    Used for the section titles and for tables without ruling lines. Open-area text that wraps
    onto lines above/below a hunt row is attached to the nearest hunt row; such rows are
    flagged 'wrapped' so they can be reviewed.
    """
    lines = [l.rstrip("\n") for l in open(txt_path, encoding="utf-8", errors="replace")]
    out = {}
    section = None
    i, n = 0, len(lines)
    while i < n:
        ln = lines[i]
        sm = SECTION.match(ln)
        if sm and "Hunt No" not in ln and sm.group(1).upper() == sm.group(1) and len(sm.group(1).split()) <= 14:
            section = (sm.group(1) + sm.group(2)).strip()
        if "Hunt No." in ln and "Open Areas" in ln and "Permits" in ln:
            oa_col = ln.index("Open Areas")
            lw_col = ln.index("Legal Wildlife")
            j = i + 1
            block = []
            while j < n and not re.match(r"^\s*Total\b", lines[j]) and "Hunt No." not in lines[j]:
                if re.search(r"ARIZONA GAME AND FISH DEPARTMENT|ARIZONA HUNTING REGULATIONS|Commission Order", lines[j]):
                    break
                block.append((j, lines[j]))
                j += 1
            rows, conts = [], []
            for (k, l) in block:
                m = REG_ROW.match(l)
                if m and len(m.group("lead")) <= 12:
                    rest = m.group("rest")
                    rec = {"section": section, "line": k}
                    if "BONUS POINT ONLY" in rest:
                        rec["bonusOnly"] = True
                        rows.append((m.group("hunt"), rec))
                        continue
                    dm = re.match(r"\s*(" + DATES + r")\s*(.*)$", rest)
                    if not dm:
                        rec["unparsed"] = rest
                        rows.append((m.group("hunt"), rec))
                        continue
                    rec["dates"] = dm.group(1)
                    tail = dm.group(2)
                    nm = re.match(r"\s*(\([\d, ]+\))\s*(.*)$", tail)
                    rec["notes"] = nm.group(1) if nm else None
                    if nm:
                        tail = nm.group(2)
                    pm = re.match(r"^(.*?)\s{2,}(\S+(?: \S+)*)\s{2,}([\d,]+)\s*$", "  " + tail)
                    if pm:
                        rec["openAreas"] = pm.group(1).strip()
                        rec["legal"] = pm.group(2).strip()
                        rec["permits"] = int(pm.group(3).replace(",", ""))
                    else:
                        rec["unparsed"] = tail
                    rows.append((m.group("hunt"), rec))
                elif l.strip():
                    start = len(l) - len(l.lstrip())
                    if oa_col - 8 <= start < lw_col:
                        conts.append((k, l.strip()))
            cont_lines = {k for (k, _) in conts}
            for (k, text) in conts:
                if not rows:
                    continue
                d = min(abs(r["line"] - k) for _, r in rows)
                if d > 2:
                    continue
                cands = [(h, r) for h, r in rows if abs(r["line"] - k) == d]
                if len(cands) > 1:
                    # wrapped cells are vertically centred: prefer the row that also has
                    # continuation text mirrored on its other side
                    sym = [(h, r) for h, r in cands if (2 * r["line"] - k) in cont_lines]
                    if len(sym) == 1:
                        cands = sym
                cands[0][1].setdefault("cont", []).append((k, text))
            for h, r in rows:
                if r.get("cont"):
                    above = [t for (k, t) in r["cont"] if k < r["line"]]
                    below = [t for (k, t) in r["cont"] if k > r["line"]]
                    r["openAreas"] = " ".join(above + ([r["openAreas"]] if r.get("openAreas") else []) + below)
                    r["wrapped"] = True
                    del r["cont"]
                if h == "----":  # un-numbered rows (e.g. Camp Navajo hunts) only absorb their own wrapped text
                    continue
                if h not in out:  # two-column pages repeat the same table
                    out[h] = r
            i = j
            continue
        i += 1
    return out


def parse_regs(pdf_path, txt_path):
    """Merge: table-finder cells where available (exact wrapped text), text layout otherwise."""
    tx = parse_regs_text(txt_path)
    tb = parse_regs_tables(pdf_path)
    out = {}
    for h, r in tx.items():
        rec = dict(r)
        rec.pop("line", None)
        if h in tb:
            t = tb[h]
            rec.update({k: t[k] for k in ("dates", "notes", "openAreas", "legal", "permits") if t.get(k) not in (None, "")})
            rec["fromTable"] = True
            rec.pop("wrapped", None)
            rec.pop("unparsed", None)
            if t.get("bonusOnly"):
                rec["bonusOnly"] = True
        out[h] = rec
    for h, t in tb.items():
        if h not in out:
            rec = dict(t)
            rec["fromTable"] = True
            out[h] = rec
    return out
