#!/usr/bin/env python3
"""Per-hunt-code season dates from CPW's regulations, written onto the latest draw rows.

Usage:
  python -I scripts/agency/colorado/seasons_parse.py <raw_dir> <repo_root> [--year 2026]

Inputs (from seasons_fetch.py): <raw_dir>/chw02.pdf (Chapter W-2 Big Game, the season tables for
deer, elk, pronghorn, moose, bear, bighorn sheep and mountain goat) and <raw_dir>/ch03.pdf
(Chapter W-3, the turkey season tables); plus <raw_dir>/{bg,sg,turkey}-brochure-hunts.json written by
seasons_brochure.py, used only for hunt codes the regulation tables do not date (Ranching for
Wildlife hunts appear only in the brochures).

How a hunt code gets its dates (all from the regulation tables; nothing is inferred):
  1. Dates printed in the hunt code's own row (a "Season Dates" column, or method columns such as
     Archery / Muzzleloader / Rifle for moose). A vertically merged date cell (one date printed for
     several rows) applies to every row it spans.
  2. Otherwise the table's "Season dates unless otherwise shown" for the draw year: the multi-year
     "License year" table above the hunt table, a "Season Dates: ... Annually Unless Otherwise Shown"
     table heading (per license-type column where CPW prints one per column), the regular rifle table
     that gives first/second/third/fourth rifle dates for the hunt-code suffixes it names
     (-O1R, -O2R/-K2R, ...), or the labeled Archery/Muzzleloader/Rifle dates of season-choice tables.
  A default is dropped at every new regulation section (#2xx) or numbered/lettered subsection
  heading, and a default from an archery/muzzleloader/rifle section is only applied to hunt codes of
  that method. Hunt codes not found, or found without dates, are left without season dates.

Order for a refresh (each script's docstring has its usage line):
  seasons_fetch.py <raw>  ->  seasons_brochure.py <raw>/{bg,sg,turkey}-brochure.pdf <raw>/<same>-hunts.json
  ->  seasons_parse.py <raw> <repo>  ->  draw_meta.py <draw raw> <repo>  ->  seasons_spotcheck.py <raw> <repo>
Run after draw_build.py (which rewrites draw/<species>.json without season fields). Writes
seasonDates / seasonRanges / seasonSourceId on the rows of --year in every draw/<species>.json,
keeping the one-row-per-line format, and <raw_dir>/seasons_parsed.json (hunt code -> dates, page)
plus <raw_dir>/seasons_report.json (counts, unresolved codes).
"""
import datetime as dt
import json
import os
import re
import sys

import pdfplumber

W2_SOURCE = "d-regs-w2-2026"
W3_SOURCE = "d-regs-w3-2026"
# Hunt codes whose regulation and brochure dates disagree (checked by reading both documents on
# 2026-10-31). They are left without season dates rather than picking one.
CONFLICTS = {
    "DM851O1R": "Chapter W-2 #250 gives no special dates (first rifle, 10/14-10/18/2026); the brochure prints Oct. 10-14.",
    "EF054P5R": "Chapter W-2 #257 prints 09/01/2026 - 11/22/2026; the brochure prints Aug. 31-Nov. 22.",
    "SMS61O1R": "Chapter W-2 #218 prints 09/01/2026 - 09/20/2026; the brochure prints Sept. 1-20 and Dec. 1-31.",
    "SFS34O1A": "Chapter W-2 #218 prints 10/01 - 10/14 annually; the brochure prints Oct. 1-15.",
}
BROCHURES = [("bg-brochure-hunts.json", "d-brochure-biggame-2026"), ("sg-brochure-hunts.json", "d-brochure-sheepgoat-2026"),
             ("turkey-brochure-hunts.json", "d-brochure-turkey-2026")]

CODE_RE = re.compile(r"\b([A-Z]{2}[A-Z0-9]{3}[A-Z][0-9][A-Z])\b")
# one date: MM/DD, MM/DD/YYYY (CPW sometimes drops the second slash: 10/072026)
D = r"(?<![\d/])(\d{1,2})/(\d{1,2})(?:/?(\d{4}))?/?(?![\d])"
SEP = r"\s*(?:[-–—]+|to|through)\s*"
RANGE_RE = re.compile(D + SEP + D)
# CPW once leaves out the dash: "11/01 12/31 annually"
RANGE_NODASH_RE = re.compile(D + r"\s+" + D + r"(?=\s*,?\s*annually)", re.I)
SINGLE_RE = re.compile(r"^\s*" + D + r"\s*$")
SECTION_RE = re.compile(r"^\s*#(\d{3}(?:\.\d)?)\s*[–-]\s*(.*)")
SUBSECTION_RE = re.compile(r"^\s*(?:[A-Z]{1,2}|\d{1,2})\.\s+\S")
METHOD_WORDS = (("archery", "A"), ("muzzle", "M"), ("rifle", "R"))


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("–", "–").replace("—", "–")).strip()


def ranges_in(text, year):
    """All date ranges in a cell, resolved to ISO dates. A date printed without a year ('annually') is in
    the license year, except January-March, which close a license year's seasons in the next calendar
    year (CPW prints e.g. '12/01/2026 - 01/31/2027' where it gives years)."""
    out = []
    t = (text or "").replace("\n", " ")
    ms = list(RANGE_RE.finditer(t)) or list(RANGE_NODASH_RE.finditer(t))
    for m in ms:
        m1, d1, y1, m2, d2, y2 = (int(x) if x else None for x in m.groups())
        if not (1 <= m1 <= 12 and 1 <= m2 <= 12 and 1 <= d1 <= 31 and 1 <= d2 <= 31):
            continue
        sy = y1 or (year + 1 if m1 <= 3 else year)
        ey = y2 or (year + 1 if m2 <= 3 else year)
        if y2 and not y1 and (m1, d1) > (m2, d2):
            sy = y2 - 1
        try:
            out.append({"start": dt.date(sy, m1, d1).isoformat(), "end": dt.date(ey, m2, d2).isoformat()})
        except ValueError:
            continue
    return out


def method_of(code):
    return code[-1]  # A archery, M muzzleloader, R rifle/any legal weapon, X season choice


def page_events(pg):
    tables = pg.find_tables()
    boxes = [t.bbox for t in tables]
    ev = []
    for ln in pg.extract_text_lines():
        x0, top = ln["x0"], ln["top"]
        if any(b[0] - 2 <= x0 <= b[2] + 2 and b[1] - 2 <= top <= b[3] + 2 for b in boxes):
            continue
        txt = ln["text"]
        if SECTION_RE.match(txt):
            ev.append((top, "section", txt))
        elif SUBSECTION_RE.match(txt):
            ev.append((top, "sub", txt))
    for t in tables:
        ev.append((t.bbox[1], "table", t.extract()))
    ev.sort(key=lambda e: e[0])
    return ev


def is_date_cell(v):
    """True when a cell holds only season dates (ranges, 'annually', 'and', a method label)."""
    t = norm(v)
    if not t or CODE_RE.search(t) or not (RANGE_RE.search(t) or RANGE_NODASH_RE.search(t) or SINGLE_RE.match(t)):
        return False
    rest = re.sub(D, " ", RANGE_NODASH_RE.sub(" ", RANGE_RE.sub(" ", t)))
    rest = re.sub(r"(?i)^(archery|muzzleloader|muzzle-loader|rifle) season dates:", " ", rest)
    rest = re.sub(r"(?i)\b(annually|and|or|through|weekdays only|unless otherwise (shown|noted))\b", " ", rest)
    rest = re.sub(r"[\s,;:/–-]+", "", rest)
    return len(rest) <= 2


def code_at(cell):
    m = CODE_RE.match(norm(cell)) if cell else None
    return m.group(1) if m else None


class Parser:
    def __init__(self, year, source):
        self.year = year
        self.source = source
        self.found = {}  # code -> record
        self.dupes = []
        self.reversed = []  # (code, text) printed with the end before the start
        self.section = ""
        self.section_method = None
        self.d_season = {}  # suffix like "O1R" -> (text, ranges); kept for the whole #section
        self.layout = None  # column layout of the last hunt table (continuation pages repeat no header)
        self.last_code = None  # last hunt code read, for a date cell that spilled onto the next page
        self.just_set = False
        self.last_title = None
        self.reset()

    def reset(self):
        self.d_all = None  # (text, ranges)
        self.d_labeled = None  # [(label, text, ranges)]

    def on_heading(self, kind, txt):
        if kind == "section":
            m = SECTION_RE.match(txt)
            self.section = "#" + m.group(1)
            low = m.group(2).lower()
            self.section_method = next((c for w, c in METHOD_WORDS if low.startswith(w)), None)
            self.d_season = {}
            self.layout = None
            self.last_code = None
        self.just_set = False
        self.reset()

    def headings_in_cell(self, cell):
        title = norm(cell)
        if not any(SECTION_RE.match(l) or SUBSECTION_RE.match(l) for l in (cell or "").split("\n")):
            return
        if title == self.last_title:
            return  # the table title repeated on a continuation page
        self.last_title = title
        for line in (cell or "").split("\n"):
            if SECTION_RE.match(line):
                self.on_heading("section", line)
            elif SUBSECTION_RE.match(line):
                self.on_heading("sub", line)

    # --- default tables -------------------------------------------------
    def split_license_year(self, rows):
        """'License year | 2025 | 2026 ...' table: set the draw year's default; return any hunt rows below it."""
        if not rows or not rows[0]:
            return None
        off = next((i for i, c in enumerate(rows[0][:2]) if norm(c).lower().startswith("license year")), None)
        if off is None:
            return None
        hdr = [norm(c) for c in rows[0]]
        years = [i for i, h in enumerate(hdr) if re.fullmatch(r"20\d\d", h)]
        if str(self.year) not in hdr:
            raise RuntimeError("license-year table without %d: %s" % (self.year, hdr))
        ci = hdr.index(str(self.year))
        nxt = min([i for i in years if i > ci] + [len(hdr)])
        texts = []
        k = 1
        while k < len(rows) and not (any(norm(c).lower().startswith("unit") or SUBSECTION_RE.match(norm(c)) for c in rows[k][:2])
                                     or any(code_at(c) for c in rows[k])):
            for c in range(ci, nxt):
                if c < len(rows[k]) and rows[k][c] and is_date_cell(rows[k][c]):
                    texts.append(norm(rows[k][c]))
            k += 1
        rg = [g for t in texts for g in ranges_in(t, self.year)]
        if not rg:
            raise RuntimeError("license-year table: no %d dates" % self.year)
        self.d_all = (", ".join(texts), rg)
        self.d_labeled = None
        self.d_season = {}  # a later "unless otherwise shown" table replaces the first-fourth rifle defaults
        self.just_set = True  # the hunt table that follows may repeat its subsection title; keep this default
        return rows[k:]

    def try_rifle_by_season(self, rows):
        flat = " ".join(norm(c) for r in rows for c in r if c)
        if "first rifle" not in flat.lower():
            return False
        ncol = max(len(r) for r in rows)
        groups = []  # column-major header text, one group per "Season dates for ... rifle" heading
        for c in range(1, ncol):
            txt = " ".join(norm(r[c]) for r in rows if c < len(r) and r[c] and not re.match(r"^\d{2}/", norm(r[c])))
            if "season dates" in txt.lower():
                groups.append(txt)
            elif groups and re.search(r"[A-Z]\dR", txt):
                groups[-1] += " " + txt
        groups = [g for g in groups if re.search(r"[A-Z]\dR", g)]
        yr = next((r for r in rows if r and norm(r[0]) == str(self.year)), None)
        if not yr:
            if any(code_at(c) for r in rows for c in r):
                raise RuntimeError("rifle season table without %d" % self.year)
            return True  # a heading fragment of the table (the grid is read from the full table)
        vals = [c for c in yr[1:] if c and ranges_in(c, self.year)]
        if len(vals) != len(groups):
            raise RuntimeError(f"rifle season table: {len(vals)} values vs {len(groups)} header groups: {groups}")
        for g, v in zip(groups, vals):
            for suf in re.findall(r"([A-Z]\dR)\b", g):
                self.d_season[suf] = (norm(v), ranges_in(v, self.year))
        return True

    # --- hunt tables ----------------------------------------------------
    def hunt_table(self, rows, page_top=False):
        first = next((i for i, r in enumerate(rows) if any(code_at(c) for c in r)), None)
        keep = (self.d_all, self.d_labeled) if self.just_set else None
        self.just_set = False
        for r in rows[: first if first is not None else len(rows)]:
            if r and r[0]:
                self.headings_in_cell(r[0])
        if keep and not self.d_all and not self.d_labeled:
            self.d_all, self.d_labeled = keep
        if first is None:
            return
        ncol = max(len(r) for r in rows)
        plain = lambda c: (not c) or (is_date_cell(c) and "season dates" not in norm(c).lower())
        spill = [r for r in rows[:first] if page_top and all(plain(c) for c in r)]
        header = [r for r in rows[:first] if r not in spill]
        if header:
            colhdr = [" ".join(norm(r[c]) for r in header if c < len(r) and r[c]) for c in range(ncol)]
            col_default, labeled = {}, []
            for c in range(ncol):
                for part in [norm(r[c]) for r in header if c < len(r) and r[c]]:
                    lab = re.match(r"^(Archery|Muzzleloader|Muzzle-loader|Rifle) season dates:\s*(.*)$", part, re.I)
                    if lab and ranges_in(lab.group(2), self.year):
                        labeled.append((lab.group(1).capitalize(), lab.group(2), ranges_in(lab.group(2), self.year)))
                    elif re.search(r"(?i)season\s*dates", part) and ranges_in(part, self.year):
                        txt = re.sub(r"(?i).*?season\s*dates:?\s*", "", part)
                        txt = re.sub(r"(?i)\s*(unless otherwise shown|antlered|antlerless|either-sex)\s*$", "", txt)
                        col_default[c] = (norm(txt), ranges_in(part, self.year))
            if labeled:
                self.d_labeled = labeled
            if col_default and len({json.dumps(v[1]) for v in col_default.values()}) == 1:
                self.d_all = next(iter(col_default.values()))
                col_default = {}
            method_cols = {c: m.group(1) for c, h in enumerate(colhdr)
                           for m in [re.match(r"^(Archery|Muzzleloader|Rifle)\b", h)] if m}
            self.layout = (ncol, method_cols, col_default)
        elif self.layout and self.layout[0] == ncol:
            ncol, method_cols, col_default = self.layout
        else:
            method_cols, col_default = {}, {}
        # a date cell printed above the first row of a continuation page belongs to the last row of the previous page
        for r in spill:
            dates = [norm(c) for c in r if c and is_date_cell(c)]
            lc = self.last_code
            if dates and lc and self.found.get(lc, {}).get("how") != "row":
                rec = self.record([(None, d, ranges_in(d, self.year)) for d in dates], "row (continued from previous page)")
                rec.update(section=self.found[lc]["section"], page=self.found[lc].get("page"))
                self.found[lc] = rec
        prev = {}
        prev_method = None
        unit_txt = None
        for r in rows[first:]:
            cells = list(r) + [None] * (ncol - len(r))
            if cells[0] is not None and not code_at(cells[0]):
                unit_txt = norm(cells[0]) or unit_txt
            codes = [(c, code_at(cell), norm(cell)[8:].strip()) for c, cell in enumerate(cells) if code_at(cell)]
            if not codes:
                continue
            # a vertically merged date cell covers rows of the same method only (moose tables print the
            # archery, muzzleloader and rifle codes of one hunt on consecutive rows)
            same_method = prev_method == codes[0][1][-1]
            for c in range(ncol):
                if cells[c] is None and c in prev and same_method:
                    cells[c] = prev[c]
            for i, (c, code, rest) in enumerate(codes):
                lo = codes[i - 1][0] + 1 if i else 0
                if len(codes) > 1:
                    lo = c + 1
                hi = codes[i + 1][0] if i + 1 < len(codes) else ncol
                explicit = []  # (label, text, ranges)
                if rest and ranges_in(rest, self.year):
                    explicit.append((None, norm(rest), ranges_in(rest, self.year)))
                singles = []
                for cc in range(lo, hi):
                    v = cells[cc]
                    if cc == c or not v or not is_date_cell(v):
                        continue
                    rg = ranges_in(v, self.year)
                    lab = method_cols.get(cc)
                    if lab and code[-1] in "AMR" and lab[0] != code[-1]:
                        continue  # a date in another method's column (e.g. the muzzleloader row of a float group)
                    if rg:
                        explicit.append((lab, norm(v), rg))
                    else:
                        singles.append(norm(v))
                if not explicit and len(singles) == 2:  # "Date Open" / "Date Closed" columns
                    explicit.append((None, singles[0] + " - " + singles[1], ranges_in(singles[0] + " - " + singles[1], self.year)))
                rec = self.record(explicit, "row") if explicit else self.default_for(code, cells, c, hi, col_default)
                if rec and any(g["start"] > g["end"] for g in rec["ranges"]):
                    self.reversed.append((code, rec["text"]))
                    rec = {"ranges": [], "text": None, "how": "end before start: " + rec["text"]}
                if rec is None:
                    rec = {"ranges": [], "text": None, "how": "no dates"}
                rec["section"] = self.section
                if c > 0 and unit_txt:
                    rec["unitsText"] = unit_txt
                old = self.found.get(code)
                if old and old["ranges"] and rec["ranges"] and old["ranges"] != rec["ranges"]:
                    self.dupes.append((code, old, rec))
                if not old or (rec["ranges"] and not old["ranges"]):
                    self.found[code] = rec
                self.last_code = code
            prev_method = codes[0][1][-1]
            for c in range(ncol):
                if r[c] if c < len(r) else None:
                    prev[c] = cells[c] if is_date_cell(cells[c]) else None
                elif c < len(r) and r[c] == "":
                    prev.pop(c, None)

    def record(self, parts, how):
        ranges, texts = [], []
        labels = {p[0] for p in parts}
        for lab, txt, rg in parts:
            for g in rg:
                g = dict(g)
                if lab and len(labels) > 1:
                    g["label"] = lab
                ranges.append(g)
            texts.append(f"{lab}: {txt}" if lab and len(labels) > 1 else txt)
        return {"ranges": ranges, "text": "; ".join(texts), "how": how}

    def default_for(self, code, cells, c, hi, col_default):
        meth = method_of(code)
        if col_default:
            for cc in sorted(col_default):
                if c < cc < hi and cells[cc] and norm(cells[cc]):
                    t, rg = col_default[cc]
                    return self.record([(None, t, rg)], "column default")
            left = [cc for cc in col_default if cc <= c]
            if left:
                t, rg = col_default[max(left)]
                return self.record([(None, t, rg)], "column default")
        if code[-3:] in self.d_season:
            t, rg = self.d_season[code[-3:]]
            return self.record([(None, t, rg)], "rifle season default")
        if self.d_labeled and meth == "X":
            return self.record(list(self.d_labeled), "season-choice default")
        if self.d_all:
            if self.section_method and meth != self.section_method:
                return None
            t, rg = self.d_all
            return self.record([(None, t, rg)], "table default")
        return None

    def run(self, pdf_path):
        with pdfplumber.open(pdf_path) as pdf:
            for pno, pg in enumerate(pdf.pages, 1):
                events = page_events(pg)
                first_event = (events[0][0], events[0][1]) if events else None
                for top, kind, payload in events:
                    if kind in ("section", "sub"):
                        self.on_heading(kind, payload)
                        continue
                    rows = [r for r in payload if any(c for c in r)]
                    if not rows:
                        continue
                    if self.try_rifle_by_season(rows):
                        continue
                    rest = self.split_license_year(rows)
                    if rest is not None:
                        rows = rest
                        if not rows:
                            continue
                    before = {k: id(v) for k, v in self.found.items()}
                    self.hunt_table(rows, page_top=(top, kind) == first_event)
                    for code, rec in self.found.items():
                        if before.get(code) != id(rec) and "page" not in rec:
                            rec["page"] = pno
        return self.found


def dump_rows(path, rows):
    with open(path, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=False) for r in rows) + "\n]\n")


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    year = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else 2026
    w2 = Parser(year, W2_SOURCE)
    w2.run(os.path.join(raw, "chw02.pdf"))
    w3 = Parser(year, W3_SOURCE)
    w3.run(os.path.join(raw, "ch03.pdf"))
    parsed = {}
    for p in (w2, w3):
        for code, rec in p.found.items():
            parsed[code] = dict(rec, source=p.source)
    # Hunt codes the regulation tables do not date (Ranching for Wildlife hunts are listed only in the
    # brochures): take the brochure's hunt table dates (seasons_brochure.py output), when unambiguous.
    for fname, src in BROCHURES:
        fp = os.path.join(raw, fname)
        if not os.path.exists(fp):
            print("missing", fp, "- run seasons_brochure.py first")
            continue
        for code, rec in json.load(open(fp)).items():
            if rec["ranges"] and not rec["conflict"] and not (parsed.get(code) or {}).get("ranges"):
                parsed[code] = {"ranges": rec["ranges"], "text": "; ".join(rec["dates"]), "how": "brochure table",
                                "page": rec["pages"][0], "source": src}
    json.dump(parsed, open(os.path.join(raw, "seasons_parsed.json"), "w"), indent=1)
    report = {"year": year, "parsed_codes": len(parsed), "w2_conflicting_duplicates": [d[0] for d in w2.dupes],
              "species": {}}
    ddir = os.path.join(repo, "src/data/agency/colorado/draw")
    for f in sorted(os.listdir(ddir)):
        if not f.endswith(".json"):
            continue
        path = os.path.join(ddir, f)
        raw_text = open(path).read()
        rows = json.loads(raw_text)
        n = filled = 0
        missing = []
        for r in rows:
            for k in ("seasonDates", "seasonRanges", "seasonSourceId"):
                if r.get("year") == year:
                    r.pop(k, None)
            if r["year"] != year:
                continue
            n += 1
            codes = r["huntCode"].split()
            if any(c in CONFLICTS for c in codes):
                missing.append({"huntCode": r["huntCode"], "why": [CONFLICTS[c] for c in codes if c in CONFLICTS]})
                continue
            recs = [parsed.get(c) for c in codes]
            if not all(x and x["ranges"] for x in recs):
                missing.append({"huntCode": r["huntCode"],
                                "why": ["not in regulation tables" if not x else x["how"] for x in recs]})
                continue
            srcs = {x["source"] for x in recs}
            if len(codes) == 1:
                text, ranges = recs[0]["text"], recs[0]["ranges"]
            else:
                # float group: one license quota shared by several hunt codes; list each code's dates
                text = "; ".join(f"{c}: {x['text']}" for c, x in zip(codes, recs))
                ranges = []
                for c, x in zip(codes, recs):
                    lab = {"A": "Archery", "M": "Muzzleloader", "R": "Rifle"}.get(c[-1], c)
                    for g in x["ranges"]:
                        g2 = {"start": g["start"], "end": g["end"], "label": g.get("label") or lab}
                        if g2 not in ranges:
                            ranges.append(g2)
                ranges.sort(key=lambda g: (g["start"], g["end"]))
            bad = [g for g in ranges if not (g["start"][:4] == str(year) or (g["start"][:4] == str(year + 1) and g["start"][5:] <= "03-31"))]
            if bad or len(srcs) != 1:
                missing.append({"huntCode": r["huntCode"], "why": [f"out-of-year or mixed source {bad} {srcs}"]})
                continue
            r["seasonDates"] = text
            r["seasonRanges"] = ranges
            r["seasonSourceId"] = srcs.pop()
            filled += 1
        dump_rows(path, rows)
        report["species"][f[:-5]] = {"rows": n, "withSeasonRanges": filled, "missing": missing}
        print(f"{f[:-5]:10s} {year} rows {n:5d}  with seasonRanges {filled:5d}  missing {len(missing)}")
    json.dump(report, open(os.path.join(raw, "seasons_report.json"), "w"), indent=1)
    for p in (w2, w3):
        for code, txt in p.reversed:
            print(f"{p.source}: {code} printed as {txt!r} (end before start); dates taken from the brochure if it has them")
    report["reversed"] = [c for p in (w2, w3) for c, _ in p.reversed]
    json.dump(report, open(os.path.join(raw, "seasons_report.json"), "w"), indent=1)
    if w2.dupes:
        print("W-2 hunt codes printed twice with different dates (first kept):", [d[0] for d in w2.dupes])


if __name__ == "__main__":
    main()
