#!/usr/bin/env python3
"""Parse one ADF&G Alaska Drawing Permit Hunt Supplement PDF (hunt tables + back-page drawing results).

Two parts:
  * results_from_text(txt): the back page "Results of the <year> Permit Hunt Drawing" table, read from
    `pdftotext -layout` text. Every entry is "<hunt no.>[*|**] <apps received> <permits available> <% drawn>".
  * hunts_from_pdf(pdf_path): the species hunt tables (pdfplumber table cells). For every hunt number it keeps
    the cell text of the "Game Management Unit, Area" column, the number of permits, the season dates, the
    legal animal and the "Additional Requirements and Information" column. Merged cells (pdfplumber returns
    None for a cell covered by a merged cell above it) inherit the value of the row above, as printed.

Usage (debug dump): python -I draw_supplement.py <supplement.pdf> [prefixes=DM,YM,DS,DG,DL,DE]
"""
import json
import re
import sys

HUNT = re.compile(r"^[DY][A-Z]\d{3}$")
RESULT_ENTRY = re.compile(r"\b([DY][A-Z]\d{3})(\*{0,2})\s+(\d+)\s+(\d+)\s+(<1|\d+)(?=\s|$)")


def results_from_text(txt):
    """-> (drawing_year, {hunt: {"apps": int, "permits": int, "pct": "<1"|int, "marker": "*"|"**"|""}})"""
    m = re.search(r"Results of the (20\d\d) Permit Hunt Drawing", txt)
    if not m:
        raise ValueError("results table not found")
    sec = txt[m.start():]
    out = {}
    for code, mark, apps, permits, pct in RESULT_ENTRY.findall(sec):
        if code in out:
            raise ValueError(f"duplicate results entry {code}")
        out[code] = {"apps": int(apps), "permits": int(permits), "pct": pct if pct == "<1" else int(pct), "marker": mark}
    return int(m.group(1)), out


def _clean(s):
    if s is None:
        return None
    s = s.replace("’", "'").replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _header_map(cells):
    hdr = {"season": []}
    for i, c in enumerate(cells):
        cl = _clean(c) or ""
        if "Management" in cl or "Unit, Area" in cl:
            hdr["gmu"] = i
        elif re.match(r"^Hunt\s*No\.?$", cl):
            hdr["hunt"] = i
        elif "Permits" in cl:
            hdr["permits"] = i
        elif cl.startswith("Season"):
            hdr["season"].append(i)
            y = re.search(r"(20\d\d)", cl)
            hdr.setdefault("season_years", {})[i] = int(y.group(1)) if y else None
        elif cl.startswith("Legal"):
            hdr["legal"] = i
        elif cl.startswith("Additional"):
            hdr["info"] = i
        elif cl.startswith("Reporting"):
            hdr["reporting"] = i
        elif cl.startswith("Specimens"):
            hdr["specimens"] = i
    return hdr


NEW_MARK = re.compile(r"^[NEW!]+$")  # the "N E W !" badge, in any letter grouping


def _lines(words, tol=2.5):
    """group words into lines by top coordinate, each line sorted by x"""
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(lines[-1][0]["top"] - w["top"]) <= tol:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w["x0"]) for l in lines]


def _segments(line, gap=10):
    segs, cur = [], [line[0]]
    for w in line[1:]:
        if w["x0"] - cur[-1]["x1"] > gap:
            segs.append(cur)
            cur = [w]
        else:
            cur.append(w)
    segs.append(cur)
    return segs


def _phrases(words):
    """split a word stream into phrases that each end with "Only" (trailing words join the last phrase)"""
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if w["text"].rstrip(".,;)") == "Only":
            phrases.append(cur)
            cur = []
    if cur:
        if phrases:
            phrases[-1].extend(cur)
        else:
            phrases.append(cur)
    # a parenthesis left over from the previous phrase, e.g. "(see page 20)", belongs to that phrase
    merged = []
    for p in phrases:
        if merged and p and p[0]["text"].startswith("("):
            k = next((i for i, w in enumerate(p[:4]) if w["text"].endswith(")")), None)
            if k is not None:
                merged[-1].extend(p[: k + 1])
                p = p[k + 1:]
        if p:
            merged.append(p)
    return merged


RES_WORD = re.compile(r"[Rr]esident")
RES_PHRASE = re.compile(r"^(?:Certified )?(?:Alaska )?(?:Residents?|Nonresidents?)\b.{0,50}$")


def _gmu_cell_parts(words, cell, rows_y):
    """Split the words of a (possibly merged) 'Game Management Unit, Area' cell.

    Bold words are the unit/area label. Non-bold words form phrases ending in "Only". A phrase printed at
    the cell's left margin (under the label) applies to every hunt row of the cell. A phrase printed further
    right sits beside the hunt row it belongs to and is given to the nearest hunt row (a hunt open to both
    residencies prints two phrases beside one row); hunts_from_pdf() then extends it to the rows that share
    that row's merged legal-animal cell.
    -> (label, cell_residency, cell_other, {row_index: [positional phrase, ...]})"""
    x0, top, x1, bottom = cell
    inside = [w for w in words if x0 - 2 <= (w["x0"] + w["x1"]) / 2 <= x1 + 2 and top - 1 <= (w["top"] + w["bottom"]) / 2 <= bottom + 1]
    inside = [w for w in inside if not HUNT.match(w["text"].rstrip(",;"))]
    bold = [w for w in inside if "Bold" in w.get("fontname", "") and not NEW_MARK.match(w["text"])]
    plain = [w for w in inside if "Bold" not in w.get("fontname", "") and not NEW_MARK.match(w["text"])]
    blines = _lines(bold)
    keep = blines[:1]
    for l in blines[1:]:
        if l[0]["top"] - keep[-1][0]["top"] > 13:
            break  # the label is one block of lines; bold text further down is another box overlapping the cell
        keep.append(l)
    label = " ".join(" ".join(w["text"] for w in l) for l in keep)
    label = re.sub(r"(\w{2,})- ([a-z])", r"\1\2", label)  # rejoin words hyphenated at a line break
    left, right = [], []
    lm = min([w["x0"] for w in inside], default=x0)  # printed left margin of the cell
    for l in _lines(plain):
        for seg in _segments(l):
            (left if seg[0]["x0"] <= lm + 6 else right).extend(seg)
    order = lambda ws: sorted(ws, key=lambda w: (round(w["top"]), w["x0"]))
    txt = lambda p: " ".join(w["text"] for w in p)
    center = lambda ws: sum((w["top"] + w["bottom"]) / 2 for w in ws) / len(ws)
    n = len(rows_y)
    rc = [(a + b) / 2 for a, b in rows_y]
    cell_res, cell_other, pos = [], [], {}
    known = re.compile(r"Certified|Qualified|Youth Hunters|Cancel")

    def other_ok(p):
        # only eligibility / weapon phrases; running text from an overlapping box is dropped
        return bool(known.search(txt(p))) and len(txt(p)) < 160

    is_res = lambda p: bool(RES_WORD.search(txt(p))) and len(txt(p)) <= 60
    for p in _phrases(order(left)):
        if is_res(p):
            cell_res.append(txt(p))
        elif other_ok(p):
            cell_other.append(txt(p))
    for p in _phrases(order(right)):
        if not is_res(p) and not other_ok(p):
            continue
        if n == 1:
            (cell_res if is_res(p) else cell_other).append(txt(p))
            continue
        if not is_res(p) and re.search(r"Certified|Bowhunters|Muzzleloader|Shotgun|Crossbow", txt(p)):
            cell_other.append(txt(p))
            continue
        k = min(range(n), key=lambda k: abs(rc[k] - center(p)))
        pos.setdefault(k, []).append(txt(p))
    return _clean(label), _clean("; ".join(cell_res)), _clean("; ".join(cell_other)), {k: [_clean(t) for t in v] for k, v in pos.items()}


_MON = r"(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?"
DATE_RANGE = _MON + r"\s*\d{1,2}\s*(?:-\s*(?:" + _MON + r"\s*)?\d{1,2}\b|thru\s+" + _MON + r"\s*\d{1,2})"
HEADER_ANCHORS = [("permits", ("Number", "Permits")), ("season", ("Season",)), ("legal", ("Legal",)),
                  ("specimens", ("Specimens",)), ("reporting", ("Reporting",)), ("info", ("Additional",))]


def _coarse_ranges(words, hrow, hdr):
    """When one grid cell of the header row holds the labels of two or more columns (the table has no vertical
    rule between them), return {column: (x_from, x_to)} from the label positions; else None."""
    hb = hrow.bbox
    hw = [w for w in words if hb[1] - 1 <= (w["top"] + w["bottom"]) / 2 <= hb[3] + 1 and hb[0] - 2 <= w["x0"] <= hb[2]]
    anchors = []
    for name, keys in HEADER_ANCHORS:
        xs = [w["x0"] for w in hw if w["text"] in keys]
        if xs:
            anchors.append((min(xs), name))
    anchors.sort()
    coarse = False
    for bb in hrow.cells:
        if bb is None:
            continue
        inside = {n for x, n in anchors if bb[0] - 2 <= x < bb[2] - 2}
        if len(inside) > 1:
            coarse = True
    if not coarse:
        return None
    out = {}
    for k, (x, name) in enumerate(anchors):
        nx = anchors[k + 1][0] - 4 if k + 1 < len(anchors) else hb[2] + 5
        out[name] = (x - 4, nx)
    return out


def _row_bands(words, rows, trows, hri, hdr):
    """Vertical band of each hunt row below header row hri: from halfway to the previous hunt number to halfway
    to the next one (rows whose grid lines are missing)."""
    hi = hdr.get("hunt")
    anchors = []
    for ri in range(hri + 1, len(rows)):
        c = (_clean(rows[ri][hi]) if hi is not None and hi < len(rows[ri]) else None) or ""
        if re.match(r"^Hunt\s*No", c):
            break
        code = c.split(" ")[0]
        if not HUNT.match(code):
            continue
        rb = trows[ri].bbox
        cw = [w for w in words if w["text"].startswith(code) and rb[1] - 3 <= w["top"] <= rb[3] + 3]
        if cw:
            anchors.append((ri, (cw[0]["top"] + cw[0]["bottom"]) / 2))
    bands = {}
    for k, (ri, y) in enumerate(anchors):
        up = (y - anchors[k - 1][1]) / 2 if k > 0 else None
        dn = (anchors[k + 1][1] - y) / 2 if k + 1 < len(anchors) else None
        up = up if up is not None else (dn if dn is not None else 12)
        dn = dn if dn is not None else up
        bands[ri] = (y - up, y + dn)
    return bands, anchors


def _join(ws, area=False):
    """words -> text in reading order. With area=True and a "Hunt Area:" label present, return only the text
    block that starts at that label: info cells often hold two side-by-side text columns, and a plain
    line-by-line join would interleave them."""
    lines = _lines(ws)
    if area:
        for li, l in enumerate(lines):
            for k, w in enumerate(l[:-1]):
                if w["text"] == "Hunt" and l[k + 1]["text"].startswith("Area"):
                    ax = w["x0"]
                    out, last_top = [], None
                    for l2 in lines[li:]:
                        segs = _segments([v for v in l2 if v["x0"] >= ax - 6] if l2 is l else l2, gap=8)
                        seg = next((sg for sg in segs if abs(sg[0]["x0"] - ax) <= 6), None)
                        if seg is None or (last_top is not None and seg[0]["top"] - last_top > 14):
                            break
                        if l2 is l:
                            seg = [v for v in seg if v["x0"] >= ax - 1]
                        out.append(seg)
                        last_top = seg[0]["top"]
                    return " ".join(" ".join(v["text"] for v in sg) for sg in out)
    return " ".join(" ".join(w["text"] for w in l) for l in lines)


def _hmerged(rowcells, i, colx):
    """True when grid column i of this row is covered by a cell that starts in an earlier column of the same
    row (pdfplumber gives None for the covered column), i.e. one season printed across two year columns."""
    cx = colx.get(i)
    if cx is None:
        return False
    for j in range(i - 1, -1, -1):
        bb = rowcells[j] if j < len(rowcells) else None
        if bb is not None:
            return bb[2] > cx
    return False


def _season_list(seasons, keys):
    return [{"year": yr, "dates": seasons.get(k)} for k, yr in keys]


def hunts_from_pdf(path, prefixes=None):
    import pdfplumber

    out = {}
    with pdfplumber.open(path) as pdf:
        for pn, page in enumerate(pdf.pages):
            # rotated (vertical) labels come out reversed and interleaved with the cell text; drop them
            page = page.filter(lambda o: not (o.get("object_type") == "char" and o.get("upright") is False))
            text = page.extract_text() or ""
            if "Results of the" in text and "Permit Hunt Drawing" in text:
                continue
            words = page.extract_words(extra_attrs=["fontname"])
            for table in page.find_tables():
                rows = table.extract()
                trows = table.rows
                hdr = None
                prev = None
                section = None
                pending = []  # hunt rows of this table: (row dict, row index)
                for ri, r in enumerate(rows):
                    cells = list(r)
                    if any(re.match(r"^Hunt\s*No\.?$", (_clean(c) or "")) for c in cells):
                        hdr = _header_map(cells)
                        hdr["coarse"] = _coarse_ranges(words, trows[ri], hdr)
                        if hdr["coarse"]:
                            hdr["bands"], hdr["anchors"] = _row_bands(words, rows, trows, ri, hdr)
                            hdr["table_top"] = trows[ri].bbox[3]
                        hdr["colx"] = {i: (bb[0] + bb[2]) / 2 for i, bb in enumerate(trows[ri].cells) if bb is not None}
                        prev = None
                        section = None
                        continue
                    if hdr is None or "hunt" not in hdr:
                        continue
                    yrs = [(_clean(c) or "") for c in cells]
                    if prev is None and any(re.fullmatch(r"20\d\d", y) for y in yrs) and not any(HUNT.match(y.split(" ")[0]) for y in yrs if y):
                        cols = [i for i, y in enumerate(yrs) if re.fullmatch(r"20\d\d", y)]
                        hdr["season"] = cols
                        hdr["season_years"] = {i: int(yrs[i]) for i in cols}
                        hdr.setdefault("colx", {}).update({i: (bb[0] + bb[2]) / 2 for i, bb in enumerate(trows[ri].cells) if bb is not None})
                        continue

                    def cell(i, whole=True, area=False):
                        """text of the words lying wholly inside this cell (None for a cell covered by a merged cell).
                        Whole-word containment drops the clipped fragments that text from a neighbouring column or
                        an overlapping text box leaves in pdfplumber's character crop."""
                        if i is None or i >= len(cells) or cells[i] is None:
                            return None
                        bb = trows[ri].cells[i] if i < len(trows[ri].cells) else None
                        if bb is None:
                            return cells[i]
                        x0, t0, x1, b0 = bb
                        if i == 0:
                            x0 = 0
                        if whole:
                            ws = [w for w in words if w["x0"] >= x0 - 1.5 and w["x1"] <= x1 + 1.5 and t0 - 1 <= (w["top"] + w["bottom"]) / 2 <= b0 + 1]
                        else:  # dates/permits: words centred in the cell (draw_build.py keeps only the date ranges)
                            ws = [w for w in words if x0 - 1 <= (w["x0"] + w["x1"]) / 2 <= x1 + 1 and t0 - 1 <= (w["top"] + w["bottom"]) / 2 <= b0 + 1]
                        return _join(ws, area)

                    vals = {}
                    if hdr.get("coarse"):
                        # grid lines missing between some columns: split by the header label positions instead
                        rng = hdr["coarse"]
                        for key in ("permits", "season", "legal", "specimens", "reporting", "info"):
                            if key not in rng:
                                vals[key] = None
                                continue
                            a, b = rng[key]
                            if key in ("permits", "legal", "specimens", "reporting"):
                                # printed once per hunt row: words of this grid row's band only
                                band = hdr.get("bands", {}).get(ri)
                                if band is None:
                                    vals[key] = None
                                    continue
                                ws = [w for w in words if a <= (w["x0"] + w["x1"]) / 2 < b and band[0] <= (w["top"] + w["bottom"]) / 2 < band[1]]
                                vals[key] = _clean(" ".join(" ".join(w["text"] for w in l) for l in _lines(ws))) or None
                                continue
                            band = hdr.get("bands", {}).get(ri)
                            if key == "season" and band is not None:
                                # season lines printed beside this hunt number: each line of the season column goes
                                # to the nearest hunt number; lines more than 14 pt away (a cell centred on several
                                # rows) leave the row to the merged-cell rule below
                                col = [w for w in words if a <= (w["x0"] + w["x1"]) / 2 < b and hdr["table_top"] < w["top"]]
                                anchors = hdr.get("anchors", [])
                                mine, far = [], False
                                for l in _lines(col):
                                    cy = (l[0]["top"] + l[0]["bottom"]) / 2
                                    if not anchors:
                                        break
                                    nr, ny = min(anchors, key=lambda t: abs(t[1] - cy))
                                    if nr == ri:
                                        if abs(ny - cy) <= 14:
                                            mine.append(l)
                                        else:
                                            far = True
                                bt = _clean(" ".join(" ".join(w["text"] for w in l) for l in mine))
                                if bt and not far and re.search(DATE_RANGE, bt):
                                    vals[key] = bt
                                    continue
                            live = [bb for bb in trows[ri].cells if bb is not None and min(bb[2], b) - max(bb[0], a) > 2]
                            if not live:
                                v = (prev or {}).get("seasons", {}).get("c") if key == "season" else (prev or {}).get(key)
                            else:
                                ws = [w for w in words if a <= (w["x0"] + w["x1"]) / 2 < b and any(bb[1] - 1 <= (w["top"] + w["bottom"]) / 2 <= bb[3] + 1 and bb[0] - 2 <= (w["x0"] + w["x1"]) / 2 <= bb[2] + 2 for bb in live)]
                                v = _clean(_join(ws, area=key == "info"))
                            vals[key] = v
                        vals["gmu"] = _clean(cell(hdr.get("gmu"))) if cell(hdr.get("gmu")) is not None else (prev or {}).get("gmu")
                        vals["hunt"] = _clean(cell(hdr.get("hunt")))
                        sy = hdr.get("season_years", {})
                        yr = next(iter(sy.values()), None) if len(sy) == 1 else None
                        vals["seasons"] = {"c": vals.pop("season")}
                        hdr["_season_keys"] = [("c", yr)]
                    for key in (() if hdr.get("coarse") else ("gmu", "hunt", "permits", "legal", "info", "reporting", "specimens")):
                        v = cell(hdr.get(key), whole=key not in ("permits",), area=key == "info")
                        if v is None and prev is not None and key not in ("hunt", "permits") and hdr.get(key) is not None:
                            vals[key] = prev.get(key)
                        else:
                            vals[key] = _clean(v)
                    if not hdr.get("coarse"):
                        vals["seasons"] = {}
                        for i in hdr["season"]:
                            v = cell(i, whole=False)
                            if v is None and _hmerged(trows[ri].cells, i, hdr.get("colx", {})):
                                v = ""  # the cell to the left spans this season column (one season over both years)
                            vals["seasons"][i] = (prev or {}).get("seasons", {}).get(i) if v is None else _clean(v)
                        hdr["_season_keys"] = [(i, hdr.get("season_years", {}).get(i)) for i in hdr["season"]]
                    code = (vals["hunt"] or "").split(" ")[0]
                    if not HUNT.match(code) and not vals["hunt"]:
                        # hunt number printed outside the detected hunt-number column (no grid line around it):
                        # take the single hunt-number word inside this row, left of the permits column
                        pi = hdr.get("permits")
                        pb = trows[ri].cells[pi] if pi is not None and pi < len(trows[ri].cells) else None
                        cands = []
                        if pb is not None:  # this row's own permits cell gives the row's band
                            cands = [w for w in words if HUNT.match(w["text"].rstrip(",;")) and pb[1] - 1 <= (w["top"] + w["bottom"]) / 2 <= pb[3] + 1
                                     and table.bbox[0] - 2 <= w["x0"] and w["x1"] <= pb[0] + 2]
                        if len(cands) == 1:
                            code = cands[0]["text"].rstrip(",;")
                            vals["hunt"] = code
                    gmu_own = cell(hdr.get("gmu"))
                    if not HUNT.match(code):
                        g = _clean(gmu_own) or ""
                        if re.match(r"^Units? \d", g) and not vals["hunt"]:
                            section = g
                        prev = vals
                        continue
                    if len(re.findall(r"\b[DY][A-Z]\d{3}\b", vals["hunt"])) > 1:
                        prev = vals
                        continue  # garbled cell holding several hunts: left for the text fallback
                    row = {"page": pn + 1, "section": section, "permits": vals["permits"], "legal": vals["legal"],
                           "info": vals["info"], "reporting": vals["reporting"],
                           "season": _season_list(vals["seasons"], hdr["_season_keys"]), "coarse": bool(hdr.get("coarse"))}
                    # locate the (possibly merged) GMU cell bbox for this row
                    gi = hdr.get("gmu")
                    gbox = None
                    if gi is not None:
                        for rj in range(ri, -1, -1):
                            cb = trows[rj].cells[gi] if gi < len(trows[rj].cells) else None
                            if cb is not None:
                                gbox = (cb, rj)
                                break
                    row["_gbox"] = gbox
                    li = hdr.get("legal")
                    row["_legal_origin"] = None
                    if li is not None and not hdr.get("coarse"):
                        for rj in range(ri, -1, -1):
                            if li < len(trows[rj].cells) and trows[rj].cells[li] is not None:
                                row["_legal_origin"] = rj
                                break
                    rb = trows[ri].bbox
                    cw = [w for w in words if w["text"].startswith(code) and rb[1] - 3 <= w["top"] <= rb[3] + 3 and rb[0] - 3 <= w["x0"] <= rb[2]]
                    if not cw:
                        cw = [w for w in words if w["text"].rstrip(",;") == code and rb[1] - 3 <= w["top"] <= rb[3] + 3 and table.bbox[0] - 2 <= w["x0"] <= table.bbox[2]]
                    # anchor the row at its hunt-number word (rows of merged cells are not evenly spaced)
                    row["_ybox"] = (cw[0]["top"], cw[0]["bottom"]) if cw else (rb[1], rb[3])
                    row["gmu_text"] = vals["gmu"]
                    pending.append((code, row))
                    prev = vals
                # resolve GMU label / residency per merged cell
                by_cell = {}
                for code, row in pending:
                    by_cell.setdefault(row["_gbox"][0] if row["_gbox"] else None, []).append((code, row))
                for cb, members in by_cell.items():
                    if cb is None:
                        for code, row in members:
                            row.update(label=None, residency=None, residency_from=None, cell_note=None, row_note=None)
                    else:
                        if hdr is not None and hdr.get("gmu") == 0:
                            # first column: the grid line can sit right of the printed text; extend to the margin
                            cb = (0, cb[1], cb[2], cb[3])
                        label, cell_res, cell_other, pos = _gmu_cell_parts(words, cb, [m[1]["_ybox"] for m in members])
                        own = {k: v for k, v in pos.items()}
                        for k, (code, row) in enumerate(members):
                            mine = [t for t in own.get(k, []) if RES_WORD.search(t)]
                            src = "row" if mine else None
                            if not mine:
                                # a residency phrase beside another row that shares this row's merged legal-animal cell
                                for j, (c2, r2) in enumerate(members):
                                    if j != k and r2.get("_legal_origin") is not None and r2.get("_legal_origin") == row.get("_legal_origin"):
                                        mine = [t for t in own.get(j, []) if RES_WORD.search(t)]
                                        if mine:
                                            src = "legal-cell"
                                            break
                            if not mine and cell_res:
                                mine, src = [cell_res], "cell"
                            row.update(label=label, residency="; ".join(mine) or None, residency_from=src,
                                       cell_note=cell_other or None,
                                       row_note="; ".join(t for t in own.get(k, []) if not RES_WORD.search(t)) or None,
                                       group=[m[0] for m in members])
                # hunt area per GMU block: an info cell merged over several GMU blocks holds several "Hunt Area:"
                # labels, and the cell text then starts at the first one for every block (2026-2027 Unit 14C sheep).
                # Take the label printed beside this row's own GMU cell instead.
                tb = table.bbox
                labels = []
                for l in _lines([w for w in words if tb[0] - 2 <= w["x0"] <= tb[2] and tb[1] - 2 <= w["top"] <= tb[3] + 2]):
                    for k, w in enumerate(l[:-1]):
                        if w["text"] == "Hunt" and l[k + 1]["text"].startswith("Area"):
                            labels.append(w)
                for code, row in pending:
                    gb = row.get("_gbox")
                    if not gb or not re.search(r"Hunt Area:", row.get("info") or ""):
                        continue
                    cb = gb[0]
                    inblock = [w for w in labels if w["x0"] > cb[2] - 2 and cb[1] - 3 <= w["top"] <= cb[3] + 3]
                    if len(inblock) != 1:  # none, or several areas for one block (e.g. DM250): keep the cell text
                        continue
                    lab = inblock[0]
                    lline = next(l for l in _lines([w for w in words if abs(w["top"] - lab["top"]) <= 2.5]) if lab in l)
                    lseg = next(sg for sg in _segments([w for w in lline if w["x0"] >= lab["x0"] - 1], gap=8) if lab in sg)
                    norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").split("Area", 1)[-1].lower())
                    own_head = norm(_clean(" ".join(w["text"] for w in lseg)))[:30]
                    # keep the cell text when it already starts at this block's label
                    if not own_head or norm(row["info"]).startswith(own_head):
                        continue
                    right = max(w["x1"] for w in lseg) + 4
                    ws = [w for w in words if w["x0"] >= lab["x0"] - 6 and w["x1"] <= right and lab["top"] - 1 <= w["top"] <= tb[3] + 2]
                    txt = _clean(_join(ws, area=True)) or ""
                    txt = re.split(r"(?<=.)\s+Hunt\s*Area\s*:", txt)[0]  # stop at the next block's label
                    if txt.startswith("Hunt Area"):
                        row["info"] = txt
                for code, row in pending:
                    row.pop("_gbox", None)
                    row.pop("_ybox", None)
                    row.pop("_legal_origin", None)
                    if code in out:
                        out[code].setdefault("_dupes", []).append(row["page"])
                    else:
                        out[code] = row
    if prefixes:
        out = {k: v for k, v in out.items() if k[:2] in prefixes}
    return out


def hunts_fallback(path, codes):
    """Hunts whose table cells pdfplumber could not separate (several hunt numbers in one cell, or hunt numbers
    outside the detected grid). From the page words only: the number of permits printed right after the hunt
    number on the same line, and the nearest bold unit/area label above-left of it."""
    import pdfplumber

    out = {}
    want = set(codes)
    with pdfplumber.open(path) as pdf:
        for pn, page in enumerate(pdf.pages):
            page = page.filter(lambda o: not (o.get("object_type") == "char" and o.get("upright") is False))
            text = page.extract_text() or ""
            if "Results of the" in text and "Permit Hunt Drawing" in text:
                continue
            if not any(c in text for c in want):
                continue
            words = page.extract_words(extra_attrs=["fontname"])
            hdr = [w for w in words if w["text"] == "Management" and "Bold" in w.get("fontname", "")]
            for w in words:
                code = w["text"].rstrip(",;")
                if code not in want or code in out:
                    continue
                same = sorted([v for v in words if abs(v["top"] - w["top"]) <= 3 and v["x0"] > w["x1"]], key=lambda v: v["x0"])
                permits = None
                if same:
                    t0 = same[0]["text"]
                    if re.fullmatch(r"\d+", t0) and same[0]["x0"] - w["x1"] < 60:
                        permits = t0
                    elif t0 == "up" and len(same) > 2 and same[1]["text"] == "to" and re.fullmatch(r"\d+", same[2]["text"]):
                        permits = "up to " + same[2]["text"]
                if permits is None:
                    continue  # a map label or a reference in running text, not a table row
                # header of this table: the nearest "Game Management Unit, Area" above the hunt number
                above = [h for h in hdr if h["top"] < w["top"]]
                htop = max(h["top"] for h in above) if above else 0
                cands = [v for v in words if "Bold" in v.get("fontname", "") and v["x1"] < w["x0"] - 2 and htop + 15 < v["top"] <= w["top"] + 3
                         and re.match(r"^\d{1,2}[A-F]*,?$", v["text"])]
                label = None
                if cands:
                    first = max(cands, key=lambda v: (v["top"], -v["x0"]))
                    line = sorted([v for v in words if abs(v["top"] - first["top"]) <= 2.5 and "Bold" in v.get("fontname", "") and v["x1"] < w["x0"] - 2], key=lambda v: v["x0"])
                    nxt = sorted([v for v in words if 3 < v["top"] - first["top"] <= 14 and "Bold" in v.get("fontname", "") and v["x1"] < w["x0"] - 2 and v["x0"] < first["x0"] + 80], key=lambda v: (v["top"], v["x0"]))
                    label = _clean(" ".join(v["text"] for v in line + nxt if not NEW_MARK.match(v["text"])))
                out[code] = {"page": pn + 1, "section": None, "permits": permits, "legal": None, "info": None, "reporting": None,
                             "season": [], "label": label, "residency": None, "residency_from": None, "cell_note": None, "row_note": None, "fallback": True}
    return out


if __name__ == "__main__":
    pre = tuple(sys.argv[2].split(",")) if len(sys.argv) > 2 else ("DM", "YM", "DS", "DG", "DL", "DE")
    print(json.dumps(hunts_from_pdf(sys.argv[1], pre), indent=1))
