"""Read the hunt-area season tables out of the Wyoming Game and Fish Commission
regulation chapters (PDF), using pdfplumber word positions.

Big game chapters (5 antelope, 6 deer, 7 elk, 8 moose, 9 bighorn sheep / mountain goat)
print one table per species with the columns

    Hunt Area | Type | Special Archery Dates Opens Closes | Regular Season Dates Opens Closes | Quota | Limitations

Chapter 20 (wild turkey) prints Hunt Area | Type | Season Dates Opens Closes | Quota | Limitations.
A hunt area + type can take several rows (split seasons, different limitations). Area lists
("9, 10", "12,/13,/15,/110") and type labels ("Gen-/Youth/only") wrap onto the next lines, as
do limitation texts. Dates carry no year; the caller maps months to years.

Used by seasons_parse.py and seasons_spotcheck.py. Only parses; never executes downloaded content.
"""
import re

import pdfplumber

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8,
          "sep": 9, "oct": 10, "nov": 11, "dec": 12}
MON_RE = re.compile(r"^(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?$")
GLUED_RE = re.compile(r"^((?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?)(\d{1,2})$")
DAY_RE = re.compile(r"^\d{1,2}$")
AREA_RE = re.compile(r"^\d{1,3}(-\d{1,3})?,?$")
QUOTA_RE = re.compile(r"^(\d[\d,]*|Unlimited)$")


def month_num(tok):
    return MONTHS[tok.rstrip(".").lower()[:3]]


def _lines(page):
    words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
    rows = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if rows and abs(rows[-1][0] - w["top"]) <= 2.5:
            rows[-1][1].append(w)
        else:
            rows.append([w["top"], [w]])
    return [(top, sorted(ws, key=lambda w: w["x0"])) for top, ws in rows]


def _header(ws):
    texts = [w["text"] for w in ws]
    if "Area" in texts and "Type" in texts and "Opens" in texts and ("Limitations" in texts or "Quota" in texts):
        return {
            "area": next(w for w in ws if w["text"] == "Area"),
            "type": next(w for w in ws if w["text"] == "Type"),
            "opens": [w for w in ws if w["text"] == "Opens"],
            "closes": [w for w in ws if w["text"] == "Closes"],
            "quota": next((w for w in ws if w["text"] == "Quota"), None),
            "lim": next((w for w in ws if w["text"] == "Limitations"), None),
        }
    return None


def _cx(w):
    return (w["x0"] + w["x1"]) / 2


def parse_tables(pdf_path):
    """Return a list of tables; each table is a list of row dicts:
    {area: str, type: str, archery: (open, close) | None, regular: (open, close) | None,
     quota: str | None, limitation: str, page: int, closed: bool}
    open/close are (month, day, text) tuples, text as printed, e.g. "Sep. 1"."""
    tables = []
    cur_table = None
    hdr = None
    rec = None
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            hdr = None  # header repeats on every table page
            for top, ws in _lines(page):
                h = _header(ws)
                if h:
                    hdr = h
                    if cur_table is None:
                        cur_table = []
                        tables.append(cur_table)
                    continue
                first = ws[0]["text"]
                if cur_table is not None and ws[0]["x0"] < 112 and (first in ("Section", "Please", "*Annual") or first.startswith("(")):
                    # end of the table (next section / note / sub-section heading)
                    cur_table = None
                    hdr = None
                    rec = None
                    continue
                if hdr is None or cur_table is None:
                    continue
                if len(ws) == 1 and re.match(r"^\d{1,2}-\d{1,2}$", first):
                    continue  # page number footer, e.g. "7-12"
                cols = [(_cx(w), i) for i, w in enumerate(hdr["opens"] + hdr["closes"])]
                date_left = min(w["x0"] for w in hdr["opens"]) - 12
                date_right = max(w["x1"] for w in hdr["closes"]) + 6
                type_left = hdr["type"]["x0"] - 5
                area_w, type_w, lim_w, quota_w, dates = [], [], [], [], []
                i = 0
                while i < len(ws):
                    w = ws[i]
                    t = w["text"]
                    if w["x0"] < type_left:
                        area_w.append(t)
                    elif w["x0"] < date_left:
                        type_w.append(t)
                    elif w["x0"] < date_right and GLUED_RE.match(t):
                        m = GLUED_RE.match(t)
                        dates.append((month_num(m.group(1)), int(m.group(2)), f"{m.group(1)} {m.group(2)}", _cx(w)))
                    elif w["x0"] < date_right and MON_RE.match(t) and i + 1 < len(ws) and DAY_RE.match(ws[i + 1]["text"]):
                        dates.append((month_num(t), int(ws[i + 1]["text"]), f"{t} {ws[i + 1]['text']}", _cx(w)))
                        i += 1
                    elif (not lim_w and QUOTA_RE.match(t) and w["x0"] >= date_right - 6
                          and (hdr["lim"] is None or w["x0"] < hdr["lim"]["x0"] - 20)):
                        quota_w.append(t)
                    else:
                        lim_w.append(t)
                    i += 1
                is_new = bool(dates) or (type_w and not (rec and rec["type"].endswith("-")) and type_w[0] not in ("Youth", "only"))
                closed = (not dates and not type_w and lim_w == ["Closed"])
                if closed:
                    rec = {"area": " ".join(area_w), "type": "", "archery": None, "regular": None, "quota": None,
                           "limitation": "Closed", "page": pno, "closed": True}
                    cur_table.append(rec)
                    continue
                if is_new:
                    n_open = len(hdr["opens"])
                    slots = {}
                    for mo, d, txt, x in dates:
                        k = min(cols, key=lambda c: abs(c[0] - x))[1]
                        # k: 0..n_open-1 = opens, n_open.. = closes
                        if k in slots:
                            raise ValueError(f"{pdf_path} p{pno}: two dates in one column: {[w['text'] for w in ws]}")
                        slots[k] = (mo, d, txt)
                    segs = []
                    for j in range(n_open):
                        o, c = slots.get(j), slots.get(n_open + j)
                        if (o is None) != (c is None):
                            raise ValueError(f"{pdf_path} p{pno}: open/close mismatch: {[w['text'] for w in ws]}")
                        segs.append((o, c) if o else None)
                    if n_open == 2:
                        archery, regular = segs
                    else:
                        archery, regular = None, segs[0]
                    rec = {"area": " ".join(area_w) if area_w else (rec["area"] if rec else ""),
                           "areaInherited": not area_w,
                           "type": " ".join(type_w),
                           "typeInherited": not type_w,
                           "archery": archery, "regular": regular,
                           "quota": " ".join(quota_w) or None, "limitation": " ".join(lim_w),
                           "page": pno, "closed": False}
                    cur_table.append(rec)
                elif rec is not None:
                    if area_w:
                        if rec["area"].endswith(","):
                            rec["area"] += " " + " ".join(area_w)
                        else:
                            raise ValueError(f"{pdf_path} p{pno}: stray area words {area_w} after {rec['area']}")
                    if type_w:
                        rec["type"] += (" " if not rec["type"].endswith("-") else "") + " ".join(type_w)
                    if quota_w:
                        lim_w = quota_w + lim_w
                    if lim_w:
                        rec["limitation"] = (rec["limitation"] + " " + " ".join(lim_w)).strip()
    for t in tables:
        for r in t:
            r["limitation"] = re.sub(r"(\w)- (\w)", r"\1-\2", r["limitation"]).replace("white- tailed", "white-tailed")
    return tables


def split_areas(area):
    """'9, 10' -> ['9', '10']; '12, 13, 15, 110' -> [...]."""
    out = []
    for a in re.split(r"[,\s]+", area.strip()):
        if not a:
            continue
        if not re.match(r"^\d{1,3}$", a):
            raise ValueError(f"unexpected hunt area token {a!r} in {area!r}")
        out.append(a)
    return out
