#!/usr/bin/env python3
"""Spot-check Oregon season data against the raw ODFW documents by a different code path.

Usage:
  <venv>/bin/python -I seasons_spotcheck.py <raw_draw_dir> <raw_seasons_dir> <repo_root> [--n 40] [--seed 7]

Independent of seasons_ranges.py (which reads `pdftotext -layout` text):
  * draw rows: opens regs_<year>.pdf with pdfplumber, finds the hunt code word, collects the words in
    that page's OPEN SEASON column within +-1 text line of it, and compares the joined text with the
    row's seasonDates; then rebuilds every date with its own month table and checks seasonRanges.
  * draw-meta seasons: looks up each start/end in ODFW's "2026 big game seasons" web page
    (big game) or in the game bird booklet PDF text read with pdfplumber (turkey).
  * key dates: each 2026 date must appear in the cited document's text.
Prints one line per check and a summary; exits 1 on a mismatch.
"""
import json
import os
import random
import re
import sys
from html.parser import HTMLParser

import pdfplumber

MON = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
LONG = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def norm(t):
    t = t.lower().replace("sept", "sep").replace(".", "").replace("–", "-")
    t = re.sub(r"\s*-\s*", "-", t)
    t = re.sub(r"\s*,\s*", ", ", t)
    t = re.sub(r"([a-z])(\d)", r"\1 \2", t)
    return re.sub(r"\s+", " ", t).strip()


def tokens(text):
    """Month/day tokens in order, months carried forward: 'Nov. 7-8, 14-15' -> [(11,7),(11,8),(11,14),(11,15)]."""
    out, cur = [], None
    for m in re.finditer(r"([A-Za-z]{3,4})\.?\s*(\d{1,2})|(\d{1,2})", re.sub(r",\s*20\d\d", "", text)):
        if m.group(1):
            k = m.group(1).lower()[:3]
            if k not in MON:
                continue
            cur = MON[k]
            out.append((cur, int(m.group(2))))
        elif cur:
            out.append((cur, int(m.group(3))))
    return out


class PdfIndex:
    """Word index of one booklet PDF (pdfplumber), built once."""

    def __init__(self, path):
        self.pages = []
        self.where = {}
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                ws = page.extract_words(keep_blank_chars=False, use_text_flow=False)
                self.pages.append(ws)
                for w in ws:
                    self.where.setdefault(w["text"], []).append((i, w))

    def find_code(self, code, year):
        hits = []
        for i, w in self.where.get(code, []):
            ws = self.pages[i]
            hdr = [h for h in ws if h["text"] == "OPEN" and h["top"] < w["top"]]
            tags = [h for h in ws if h["text"] == "TAGS" and h["top"] < w["top"]]
            if hdr and tags:
                t = max(tags, key=lambda h: h["top"])
                # left edge of the "<year> TAGS" header = the year word just left of TAGS
                yw = [h for h in ws if abs(h["top"] - t["top"]) < 2 and h["x1"] <= t["x0"] and re.match(r"^20\d\d$", h["text"])]
                right = max(yw, key=lambda h: h["x0"])["x0"] if yw else t["x0"]
                hits.append((i, w, max(hdr, key=lambda h: h["top"]), right))
        return hits

    def season_text(self, i, w, hdr, right):
        ws = self.pages[i]
        x0 = hdr["x0"] - 40
        col = [v for v in ws if x0 <= v["x0"] < right - 2
               and re.match(r"^(?:[A-Za-z]{3,4}\.?|\d{1,2}[-,]?.*|\d{4}|-|&|and)$", v["text"])]
        own = [v for v in col if abs(v["top"] - w["top"]) < 3]
        if not any(tokens(v["text"]) or re.match(r"^[A-Za-z]{3,4}\.?$", v["text"]) for v in own) or own and own[-1]["text"].endswith(","):
            # wrapped cell: halves sit on the lines just above/below the code line
            own += [v for v in col if 3 <= abs(v["top"] - w["top"]) < 12]
        own.sort(key=lambda v: (round(v["top"]), v["x0"]))
        return " ".join(v["text"] for v in own)


def check_rows(raw, repo, n, rnd):
    rows = []
    for sp in ("elk", "mule-deer", "whitetail", "pronghorn", "bear", "sheep", "goat"):
        for r in json.load(open(os.path.join(repo, "src/data/agency/oregon/draw", f"{sp}.json"))):
            if r.get("seasonRanges") and not r["huntCode"][0] in "LMN":
                rows.append(r)
    latest = [r for r in rows if r["year"] == 2026]
    wrapped = [r for r in rows if re.search(r",\s*20\d\d|\d-\d", r["seasonDates"]) or r["seasonDates"].count("-") > 1]
    older = [r for r in rows if r["year"] < 2026]
    pick = rnd.sample(latest, n // 2) + rnd.sample(wrapped, n // 4) + rnd.sample(older, n - n // 2 - n // 4)
    # always include the multi-segment (weekend) hunts and every 2026 row whose dates run into 2027
    pick += [r for r in rows if r not in pick and (r["seasonDates"].count(",") >= 2 or (r["year"] == 2026 and "2027" in r["seasonDates"]))]
    pdfs = {}
    ok = bad = 0
    for r in pick:
        y = r["year"]
        if y not in pdfs:
            pdfs[y] = PdfIndex(os.path.join(raw, f"regs_{y}.pdf"))
        hits = pdfs[y].find_code(r["huntCode"], y)
        texts = [pdfs[y].season_text(*h) for h in hits]
        texts = [t for t in texts if tokens(t)]
        match_text = any(norm(t) == norm(r["seasonDates"]) for t in texts)
        # independent date rebuild from the row text
        tk = tokens(r["seasonDates"])
        yr = re.search(r",\s*(20\d\d)\s*$", r["seasonDates"])
        flat = []
        for g in r["seasonRanges"]:
            for d in (g["start"], g["end"]):
                yy, mm, dd = map(int, d.split("-"))
                flat.append((yy, mm, dd))
        # ranges of a single day print once; compare token list against range endpoints
        ends = []
        for g in r["seasonRanges"]:
            ends.append(tuple(map(int, g["start"].split("-")[1:])))
            if g["end"] != g["start"]:
                ends.append(tuple(map(int, g["end"].split("-")[1:])))
        years_ok = all(f[0] in (y, y + 1) for f in flat) and (not yr or flat[-1][0] == int(yr.group(1)))
        if not yr:
            years_ok = years_ok and flat[0][0] == y
        ordered = all(flat[i] <= flat[i + 1] for i in range(len(flat) - 1))
        good = match_text and tk == ends and years_ok and ordered
        ok += good
        bad += not good
        print(("OK  " if good else "BAD ") + f"row {r['species']} {y} {r['huntCode']}: row '{r['seasonDates']}' -> "
              f"{[(g['start'], g['end']) for g in r['seasonRanges']]} | pdf {texts}")
    return ok, bad


def html_text(path):
    class P(HTMLParser):
        def __init__(s):
            super().__init__()
            s.out, s.skip = [], 0

        def handle_starttag(s, t, a):
            if t in ("script", "style"):
                s.skip += 1
            s.out.append(" ")

        def handle_endtag(s, t):
            if t in ("script", "style"):
                s.skip -= 1

        def handle_data(s, d):
            if not s.skip:
                s.out.append(d)
    p = P()
    p.feed(open(path, encoding="utf-8", errors="replace").read())
    return re.sub(r"\s+", " ", "".join(p.out).replace("–", "-").replace("\xa0", " "))


def md(d):
    y, m, dd = map(int, d.split("-"))
    return m, dd


def present(text, m, d):
    pats = [rf"{NAMES[m]}\.?\s*{d}\b", rf"{LONG[m]}\s*{d}\b"]
    if m == 9:
        pats.append(rf"Sept\.?\s*{d}\b")
    return any(re.search(p, text) for p in pats)


def check_meta(raw, seasons_dir, repo):
    meta = json.load(open(os.path.join(repo, "src/data/agency/oregon/draw-meta.json")))
    page = html_text(os.path.join(seasons_dir, "bg-seasons.html"))
    with pdfplumber.open(os.path.join(raw, "gamebird_2026.pdf")) as pdf:
        gb = " ".join((pdf.pages[i].extract_text() or "") for i in range(len(pdf.pages)))
    gb = re.sub(r"\s+", " ", gb)
    with pdfplumber.open(os.path.join(raw, "regs_2026.pdf")) as pdf:
        regs = " ".join((pdf.pages[i].extract_text() or "") for i in range(len(pdf.pages)))
    regs = re.sub(r"\s+", " ", regs.replace("–", "-"))
    ok = bad = 0
    for s in meta["seasons"]:
        text = gb if s["sourceId"] == "d-or-gamebird-2026" else page + " " + regs
        sm, sd = md(s["start"])
        em, ed = md(s["end"])
        good = present(text, sm, sd) and (present(text, em, ed) or re.search(rf"{NAMES[sm]}\.?\s*{sd}\s*-\s*{ed}\b", text))
        ok += bool(good)
        bad += not good
        print(("OK  " if good else "BAD ") + f"season {s['species']} '{s['label']}' {s['start']}..{s['end']}")
    docs = {"d-or-regs-2026": regs, "d-or-how-apply": html_text(os.path.join(raw, "page_how-apply-controlled-hunt.html"))}
    seen = set()
    for sp in meta["species"]:
        for k in sp["keyDates"]:
            key = (k["label"], k.get("date"), k.get("start"))
            if key in seen:
                continue
            seen.add(key)
            text = docs[k["sourceId"]]
            ds = [k[x] for x in ("date", "start", "end") if k.get(x)]
            good = all(present(text, *md(d)) for d in ds) and k.get("kind")
            ok += bool(good)
            bad += not good
            print(("OK  " if good else "BAD ") + f"keyDate [{k.get('kind')}] '{k['label']}' {ds}")
    return ok, bad


def main():
    raw, seasons_dir, repo = sys.argv[1:4]
    n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 40
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
    rnd = random.Random(seed)
    a, b = check_rows(raw, repo, n, rnd)
    c, d = check_meta(raw, seasons_dir, repo)
    print(f"rows: {a} ok, {b} mismatch; meta: {c} ok, {d} mismatch")
    sys.exit(1 if b or d else 0)


if __name__ == "__main__":
    main()
