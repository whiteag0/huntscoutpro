#!/usr/bin/env python3
"""Read hunt-code season dates from CPW's brochure hunt tables (pdfplumber table grid).

Usage:
  python -I scripts/agency/colorado/seasons_brochure.py <brochure.pdf> <out.json> [--year 2026] [--pages 51,58]

The brochures print hunt tables as  Unit | Dates | Sex | Hunt Code | List,  often two or three tables
side by side. pdfplumber rebuilds the cell grid from the ruling lines: a merged (spanning) cell comes
back as text in its first grid row and None in the rows it covers, an empty cell as "". So:
  * a date cell in a row whose hunt-code cell is None (covered by the code cell above) is another
    date segment of that hunt (Ranching for Wildlife hunts print 2-3 segments this way);
  * a hunt-code row whose date cell is None shares the date cell above it (one date for two hunts);
  * an empty ("") code cell ends the hunt.
Dates are printed without a year ("Oct. 24–Nov. 1", "Jan. 2–6"); a Jan.-March date without a printed
year is in the year after the license year (CPW prints "Jan. 31, 2027" where it gives one).

Output: {hunt code without dashes: {"dates": [text, ...], "ranges": [...], "pages": [...], "conflict": bool}}.
seasons_parse.py uses it only for hunt codes the regulation tables do not date (Ranching for Wildlife);
seasons_spotcheck.py uses it as the independent reading of the regulation dates.
"""
import json
import re
import sys

import pdfplumber

MONTHS = {"Jan": 1, "Feb": 2, "March": 3, "April": 4, "May": 5, "June": 6, "July": 7, "Aug": 8,
          "Sept": 9, "Oct": 10, "Nov": 11, "Dec": 12}
MON = r"(Jan\.?|Feb\.|March|April|May|June|July|Aug\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)"
CODE_RE = re.compile(r"[*■]*([A-Z]-[A-Z]-[A-Z0-9]{3}-[A-Z][0-9]-[A-Z])\b")
DATE_RE = re.compile(MON + r"\s*(\d{1,2})(?:,\s*(\d{4}))?\s*[–-]\s*(?:" + MON + r"\s*)?(\d{1,2})(?:,\s*(\d{4}))?")


def to_ranges(text, season_year):
    out = []
    for m in DATE_RE.finditer(text or ""):
        m1, d1, y1, m2, d2, y2 = m.groups()
        a = MONTHS[m1.rstrip(".")]
        b = MONTHS[m2.rstrip(".")] if m2 else a
        ya = int(y1) if y1 else (season_year + 1 if a <= 3 else season_year)
        yb = int(y2) if y2 else (season_year + 1 if b <= 3 else season_year)
        if not y1 and y2 and (a, int(d1)) > (b, int(d2)):
            ya = yb - 1
        out.append({"start": "%04d-%02d-%02d" % (ya, a, int(d1)), "end": "%04d-%02d-%02d" % (yb, b, int(d2))})
    return out


def is_date(v):
    return bool(v) and bool(DATE_RE.search(v)) and not CODE_RE.search(v)


def code_in(v):
    m = CODE_RE.search(v or "")
    return m.group(1).replace("-", "") if m else None


def read_table(rows, pno, found):
    ncol = max(len(r) for r in rows)
    rows = [list(r) + [None] * (ncol - len(r)) for r in rows]
    code_cols = [c for c in range(ncol) if sum(1 for r in rows if code_in(r[c])) >= 1]
    prev_c = -1
    for c in code_cols:
        dcols = [d for d in range(prev_c + 1, c) if any(is_date(r[d]) for r in rows)]
        prev_c = c
        if not dcols:
            continue
        d = max(dcols)  # the date column nearest the code column
        cur = None  # occurrence whose (merged) code cell covers the current row
        last_date = None  # text of the last date cell seen in this column
        for r in rows:
            vd, vc = r[d], r[c]
            if vd is not None:
                last_date = vd if is_date(vd) else None
            code = code_in(vc)
            if code:
                cur = {"page": pno, "dates": []}
                found.setdefault(code, []).append(cur)
                if vd is None and last_date:
                    cur["dates"].append(last_date)  # one date cell printed for this hunt and the one above
                elif is_date(vd):
                    cur["dates"].append(vd)
            elif vc is None and cur and is_date(vd):
                cur["dates"].append(vd)  # another segment inside this hunt's merged code cell
            elif vc is not None:
                cur = None


def read(pdf_path, season_year, pages=None):
    found = {}
    with pdfplumber.open(pdf_path) as pdf:
        for pno, pg in enumerate(pdf.pages, 1):
            if pages and pno not in pages:
                continue
            if not CODE_RE.search(pg.extract_text() or ""):
                continue
            for t in pg.find_tables():
                rows = t.extract()
                if rows:
                    read_table(rows, pno, found)
    out = {}
    for code, occ in found.items():
        # keep only the dates themselves (cells can carry words such as "New", "Early", "youth only")
        dated = [[", ".join(m.group(0) for m in DATE_RE.finditer(re.sub(r"\s+", " ", x))) for x in o["dates"]]
                 for o in occ if o["dates"]]
        distinct = {json.dumps(x) for x in dated}
        dates = dated[0] if len(distinct) == 1 else []
        out[code] = {"dates": dates, "ranges": [g for x in dates for g in to_ranges(x, season_year)],
                     "pages": sorted({o["page"] for o in occ}), "conflict": len(distinct) > 1,
                     "readings": dated if len(distinct) > 1 else None}
    return out


def main():
    pdf, dst = sys.argv[1], sys.argv[2]
    year = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else 2026
    pages = {int(x) for x in sys.argv[sys.argv.index("--pages") + 1].split(",")} if "--pages" in sys.argv else None
    res = read(pdf, year, pages)
    json.dump(res, open(dst, "w"), indent=1, ensure_ascii=False)
    print(pdf, len(res), "hunt codes,", sum(1 for v in res.values() if v["ranges"]), "with dates,",
          sum(1 for v in res.values() if v["conflict"]), "conflicting")


if __name__ == "__main__":
    main()
