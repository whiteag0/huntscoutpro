"""Shared helpers for the New Mexico harvest parsers.

Text is read from `pdftotext -layout` output (<key>.txt next to <key>.pdf).
Public/Private land groups in the deer and pronghorn tables are drawn as
merged cells, so the label sits on one line in the middle of the group; the
group boundaries are recovered from the horizontal rules in the PDF with
pdfplumber.
"""
import os
import re

import pdfplumber

NUM_RE = re.compile(r"^(\d[\d,]*|\d+%|\d+\.\d+%?|-|N/A|Na|NA|NaN)$")


def is_num_tok(t):
    return bool(NUM_RE.match(t))


def to_int(t):
    if t in ("-", "N/A", "Na", "NA", "NaN", ".", ""):
        return None
    return int(t.replace(",", ""))


def to_pct(t):
    if t in ("-", "N/A", "Na", "NA", "NaN", ".", ""):
        return None
    t = t.rstrip("%")
    v = float(t)
    return int(v) if v == int(v) else v


def to_float(t):
    if t in ("-", "N/A", "Na", "NA", "NaN", ".", ""):
        return None
    return float(t)


def read_pages(txt_path):
    with open(txt_path, encoding="utf-8", errors="replace") as f:
        pages = f.read().split("\f")
    return pages


def bbox_words(pdf_path):
    """Word boxes from `pdftotext -bbox` (same text engine as the -layout .txt files).

    Returns a list (one per page) of dicts with text, x0, x1, top, bottom.
    """
    import html
    import subprocess

    out_path = pdf_path[:-4] + ".bbox.html"
    if not os.path.exists(out_path) or os.path.getmtime(out_path) < os.path.getmtime(pdf_path):
        subprocess.run(["pdftotext", "-bbox", pdf_path, out_path], check=True)
    pages = []
    word_re = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
    with open(out_path, encoding="utf-8", errors="replace") as f:
        for chunk in f.read().split("<page ")[1:]:
            ws = []
            for m in word_re.finditer(chunk):
                x0, y0, x1, y1 = map(float, m.groups()[:4])
                ws.append({"text": html.unescape(m.group(5)), "x0": x0, "x1": x1, "top": y0, "bottom": y1})
            pages.append(ws)
    return pages


# ---------------------------------------------------------------- land groups
_PUB = set("bulc")
_PRIV = set("rvate")
_FRAGS = {
    "public", "private", "pu", "pub", "publ", "blic", "lic", "ic", "b", "bl", "bli",
    "pr", "pri", "priv", "iv", "iva", "at", "ate", "e", "te", "vate", "ivate",
}


def _tail(tokens):
    i = len(tokens)
    while i > 0 and is_num_tok(tokens[i - 1]):
        i -= 1
    return tokens[i:]


def is_data_tokens(tokens):
    """A table data row: >= 6 trailing numeric cells, some text before them, no Total label."""
    if any(t.startswith("Total") for t in tokens):
        return False
    tail = _tail(tokens)
    return len(tail) >= 6 and len(tail) < len(tokens)


def land_rows_by_page(pdf_path):
    """Return {page_index: [(numeric_tail_tuple, land)]} for every data row, top to bottom.

    land is "Public", "Private", "AMBIGUOUS" or None. The land label of a row is
    taken from the label words ("Public", "Private" or their vertical fragments)
    that sit in the same merged cell (between the same two horizontal rules) as the row.
    """
    out = {}
    bbox = bbox_words(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        for pi, page in enumerate(pdf.pages):
            words = bbox[pi] if pi < len(bbox) else []
            rules = [
                (r["x0"], r["x1"], (r["top"] + r["bottom"]) / 2)
                for r in page.rects
                if (r["bottom"] - r["top"]) <= 3.5 and (r["x1"] - r["x0"]) > 15
            ]
            rules += [
                (min(l["x0"], l["x1"]), max(l["x0"], l["x1"]), (l["top"] + l["bottom"]) / 2)
                for l in page.lines
                if abs(l["top"] - l["bottom"]) < 1.0 and abs(l["x1"] - l["x0"]) > 15
            ]
            # pdfplumber and poppler use different page origins (crop/media box offsets):
            # shift the rules into poppler coordinates using words found once on both sides.
            pw = {}
            for w in page.extract_words():
                pw.setdefault(w["text"], []).append(w)
            bw = {}
            for w in words:
                bw.setdefault(w["text"], []).append(w)
            dxs, dys = [], []
            for t, lst in bw.items():
                if len(lst) == 1 and len(pw.get(t, [])) == 1 and len(t) >= 4:
                    a, b = lst[0], pw[t][0]
                    dxs.append(((a["x0"] + a["x1"]) - (b["x0"] + b["x1"])) / 2)
                    dys.append(((a["top"] + a["bottom"]) - (b["top"] + b["bottom"])) / 2)
            if dxs:
                dxs.sort()
                dys.sort()
                dx, dy = dxs[len(dxs) // 2], dys[len(dys) // 2]
                rules = [(x0 + dx, x1 + dx, y + dy) for (x0, x1, y) in rules]
            # group words into lines
            lines = []
            for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
                if lines and abs(lines[-1][0] - w["top"]) <= 2.0:
                    lines[-1][1].append(w)
                else:
                    lines.append([w["top"], [w]])
            data = []
            for top, ws in lines:
                ws.sort(key=lambda w: w["x0"])
                toks = [w["text"] for w in ws]
                if is_data_tokens(toks):
                    yc = sum((w["top"] + w["bottom"]) / 2 for w in ws) / len(ws)
                    data.append((tuple(_tail(toks)), yc))
            if not data:
                continue
            labels = [w for w in words if w["text"].lower() in _FRAGS and not w["text"].isupper()]

            def cell(xc, yc):
                above = [y for (x0, x1, y) in rules if x0 - 1 <= xc <= x1 + 1 and y < yc]
                below = [y for (x0, x1, y) in rules if x0 - 1 <= xc <= x1 + 1 and y > yc]
                return (max(above) if above else -1e9, min(below) if below else 1e9)

            lab_cells = []
            for w in labels:
                xc = (w["x0"] + w["x1"]) / 2
                yc = (w["top"] + w["bottom"]) / 2
                lab_cells.append((cell(xc, yc), w["text"].lower(), yc))
            rows = []
            for tail, yc in data:
                frag = "".join(t for (lo, hi), t, _ in lab_cells if lo < yc < hi)
                land = None
                if frag:
                    s = set(frag)
                    if (s & set("bul")) and (s & set("rv")):
                        land = "AMBIGUOUS"
                    elif s & _PUB:
                        land = "Public"
                    elif s & _PRIV:
                        land = "Private"
                rows.append([tail, land, yc])
            # A merged cell holding both a Public and a Private label (missing rule between the
            # groups): labels are vertically centred on their group, so split the rows at the
            # point that best centres each label on its group (Public is always listed first).
            done = set()
            for (lo, hi), t, ly in lab_cells:
                if (lo, hi) in done:
                    continue
                members = [r for r in rows if lo < r[2] < hi and r[1] == "AMBIGUOUS"]
                if not members:
                    continue
                done.add((lo, hi))
                ys_pub = [y for (c, tt, y) in lab_cells if c == (lo, hi) and set(tt) & set("bul")]
                ys_pri = [y for (c, tt, y) in lab_cells if c == (lo, hi) and set(tt) & set("rv")]
                yp, yv = sum(ys_pub) / len(ys_pub), sum(ys_pri) / len(ys_pri)
                if yp > yv:
                    continue
                ys = [r[2] for r in members]
                best = None
                for k in range(1, len(ys)):
                    cost = abs((ys[0] + ys[k - 1]) / 2 - yp) + abs((ys[k] + ys[-1]) / 2 - yv)
                    if best is None or cost < best[0]:
                        best = (cost, k)
                if best:
                    for i, r in enumerate(members):
                        r[1] = "Public" if i < best[1] else "Private"
            rows = [(tail, land) for tail, land, _ in rows]
            out[pi] = rows
    return out
