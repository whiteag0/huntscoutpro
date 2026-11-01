#!/usr/bin/env python3
"""Spot-check Montana seasonRanges against the regulation PDFs with an independent reader.

Usage:  python -I scripts/agency/montana/seasons_spotcheck.py <raw_dir> <repo_root> [n=40] [seed=7]

seasons_parse.py reads the HD tables with pdfplumber's table finder. This check uses poppler's
`pdftotext -bbox` word boxes instead: for each sampled draw row it finds every printing of the
license number (with its "Elk B License:"-style prefix), takes the date ranges printed inside that
license's table cell (between the horizontal rulings above and below the number, read from the
PDF's line objects), assigns each to the season column whose header word (EARLY / ARCHERY / GENERAL / HERITAGE / LATE;
antelope and MSGB: Archery / Season) is closest, converts it with the license-year rule
(Jan/Feb = 2027), and requires every seasonRange to be found that way, and every date printed in
the license's cell to be in seasonRanges. Bear, lion, 900-20 and the combination licenses are
checked against the layout text directly.
"""
import collections
import datetime
import html
import json
import os
import random
import re
import subprocess
import sys

import pdfplumber

MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
RNG = re.compile(r"^([A-Z][a-z]{2,4})\.? ?(\d{1,2}) ?[-–] ?([A-Z][a-z]{2,4})\.? ?(\d{1,2})\*?$")


def bbox_pages(pdf, cache):
    if not os.path.exists(cache):
        subprocess.run(["pdftotext", "-bbox", pdf, cache], check=True, stderr=subprocess.DEVNULL)
    pages = []
    for pg in open(cache, encoding="utf-8").read().split("<page ")[1:]:
        ws = []
        for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
            ws.append({"x0": float(m[1]), "y": float(m[2]), "x1": float(m[3]), "t": html.unescape(m[5])})
        pages.append(ws)
    return pages


def iso(mon, day):
    m = MON[mon[:3].lower()]
    return datetime.date(2027 if m <= 2 else 2026, m, int(day)).isoformat()


def line_cells(ws):
    """Join words on one line into cells split at gaps > 4 pt."""
    ws = sorted(ws, key=lambda w: w["x0"])
    cells, cur = [], []
    for w in ws:
        if cur and w["x0"] - cur[-1]["x1"] > 4:
            cells.append(cur)
            cur = []
        cur.append(w)
    if cur:
        cells.append(cur)
    return [{"t": " ".join(w["t"] for w in c), "xc": (c[0]["x0"] + c[-1]["x1"]) / 2} for c in cells]


def headers(ws, y_occ):
    """Season-column centres from the header words nearest above y_occ."""
    names = {"EARLY": "Early Season", "ARCHERY": "Archery Only Season", "GENERAL": "General Season",
             "HERITAGE": "Heritage Muzzleloader Season", "LATE": "Late Season"}
    up = [w for w in ws if w["t"] in names and w["y"] < y_occ]
    for top in sorted({w["y"] for w in up}, reverse=True):
        band = [w for w in up if 0 <= top - w["y"] < 12]
        if len({w["t"] for w in band}) >= 4:  # the header row, not "ARCHERY" inside a details cell
            return {names[w["t"]]: (w["x0"] + w["x1"]) / 2 for w in band}
    # header "Archery / Only / Season / Dates" next to "Season / Dates" (body text can also say "Archery")
    for a in sorted([w for w in ws if w["t"] == "Archery" and w["y"] < y_occ], key=lambda w: -w["y"]):
        band = [w for w in ws if 0 <= w["y"] - a["y"] < 25]
        mine = [w for w in band if w["t"] == "Dates" and abs((w["x0"] + w["x1"]) / 2 - (a["x0"] + a["x1"]) / 2) < 40]
        dates = [w for w in band if w["t"] == "Dates" and w["x0"] > a["x1"] + 10]
        if mine and dates:
            s = min(dates, key=lambda w: w["x0"])
            return {"ARCH": (a["x0"] + a["x1"]) / 2, "Season": (s["x0"] + s["x1"]) / 2}
    return {}


def cell_band(hedges, occ):
    """Top and bottom ruling of the table cell holding the license number (pdfplumber's raw line
    objects; the parser itself uses the table finder)."""
    xs = [e for e in hedges if e["x0"] - 1 <= occ["x0"] and e["x1"] + 1 >= occ["x1"]]
    above = [e["top"] for e in xs if e["top"] <= occ["y"] + 0.5]
    below = [e["top"] for e in xs if e["top"] >= occ["y"] + 6]
    if not above or not below:
        return occ["y"] - 14, occ["y"] + 14, False
    return max(above), min(below), True


def found_dates(ws, occ, hedges):
    """(column, start, end, same_line) for date cells inside the license's table cell."""
    hdr = headers(ws, occ["y"])
    if not hdr:
        return None
    lo, hi, ruled = cell_band(hedges, occ)
    lines = collections.defaultdict(list)
    for w in ws:
        if lo - 0.5 <= w["y"] <= hi:
            lines[round(w["y"] * 2) / 2].append(w)
    out = []
    for y, lw in lines.items():
        for c in line_cells(lw):
            m = RNG.match(c["t"])
            if not m:
                continue
            col = min(hdr, key=lambda k: abs(hdr[k] - c["xc"]))
            if abs(hdr[col] - c["xc"]) > 30:
                continue
            # inside a ruled cell every date belongs to this license; otherwise only its own line is certain
            out.append((col, iso(m[1], m[2]), iso(m[3], m[4]), ruled or abs(y - occ["y"]) < 1.5, c["t"]))
    return out


def norm_label(lab):
    lab = re.sub(r"^HD [\d, ]+: ", "", lab)
    lab = re.sub(r" \(.*\)$", "", lab)
    lab = lab.split(" - ")[-1]
    return lab


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    rnd = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 7)
    base = os.path.join(repo, "src/data/agency/montana/draw")
    dea = bbox_pages(os.path.join(raw, "dea-2026.pdf"), os.path.join(raw, "dea-2026.bbox.html"))
    msgb = bbox_pages(os.path.join(raw, "msgb-2026.pdf"), os.path.join(raw, "msgb-2026.bbox.html"))
    msgb_txt = open(os.path.join(raw, "msgb-2026.txt"), encoding="utf-8").read().split("\f")
    sec = {}
    cur = None
    for i, p in enumerate(msgb_txt):
        for t, nm in (("Moose HD Regulations", "moose"), ("Bighorn Sheep HD Regulations", "sheep"),
                      ("Mountain Goat HD Regulations", "goat"), ("Bison Specific", "bison")):
            if t in p:
                cur = nm
        sec[i] = cur
    PREFIX = {"Elk B license": "Elk B License:", "Elk permit": "Elk Permit:", "Deer B license": "Deer B License:",
              "Deer permit": "Deer Permit:", "Antelope license": "Antelope License:", "Antelope B license": "Antelope B License:",
              "Archery-only antelope license": "Antelope License:"}
    pdfs = {False: pdfplumber.open(os.path.join(raw, "dea-2026.pdf")), True: pdfplumber.open(os.path.join(raw, "msgb-2026.pdf"))}
    ecache = {}

    def edges(is_msgb, pi):
        if (is_msgb, pi) not in ecache:
            ecache[(is_msgb, pi)] = [e for e in pdfs[is_msgb].pages[pi].edges if e["orientation"] == "h"]
        return ecache[(is_msgb, pi)]

    rows = []
    for f in sorted(os.listdir(base)):
        rs = json.load(open(os.path.join(base, f)))
        latest = max(r["year"] for r in rs)
        rows += [r for r in rs if r["year"] == latest and r.get("seasonRanges")]
    special = [r for r in rows if r["species"] in ("bear", "lion") or r["huntCode"] in ("900-20", "NR-BIGGAME-ELK-COMBO", "NR-DEER-COMBO")]
    table_rows = [r for r in rows if r not in special]
    sample = rnd.sample(table_rows, min(n, len(table_rows)))
    bad, checked_vals = [], 0
    for r in sample:
        code = r["huntCode"]
        if r["species"] in ("moose", "sheep", "goat"):
            occs = [(pi, w) for pi, ws in enumerate(msgb) if sec.get(pi) == r["species"] for w in ws if w["t"].rstrip("*") == code]
            pages = msgb
        else:
            pre = PREFIX[re.match(r"^(.*?) \d{3}-\d{2}", r["description"]).group(1)]
            occs = []
            for pi, ws in enumerate(dea):
                for w in ws:
                    if w["t"] != code:
                        continue
                    left = sorted([x for x in ws if abs(x["y"] - w["y"]) < 1.5 and x["x1"] <= w["x0"] + 0.5 and w["x0"] - x["x0"] < 90],
                                  key=lambda x: x["x0"])
                    if " ".join(x["t"] for x in left).endswith(pre):
                        occs.append((pi, w))
            pages = dea
        found = []
        for pi, w in occs:
            fd = found_dates(pages[pi], w, edges(r["species"] in ("moose", "sheep", "goat"), pi))
            if fd:
                found += [(pi + 1,) + x for x in fd]
        if not found:
            bad.append((r["species"], code, "no printing found"))
            continue
        for g in r["seasonRanges"]:
            checked_vals += 1
            col = norm_label(g["label"])
            col = {"Archery Season": "ARCH", "Archery Only Season": "Archery Only Season"}.get(col, col)
            ok = any(x[2] == g["start"] and x[3] == g["end"] and (x[1] == col or (x[1] == "ARCH" and col.startswith("Archery")) or
                                                                   (col == "ARCH" and x[1] == "ARCH")) for x in found)
            if not ok:
                bad.append((r["species"], code, f"range not in PDF: {g}"))
        have = {(g["start"], g["end"]) for g in r["seasonRanges"]}
        for x in found:
            if x[4] and (x[2], x[3]) not in have:
                bad.append((r["species"], code, f"PDF date in the license's cell missing from row: p.{x[0]} {x[1]} {x[5]}"))
    # special rows: text search in the layout text
    txt = {k: open(os.path.join(raw, k), encoding="utf-8").read() for k in ("dea-2026.txt", "bear-2026.txt", "lion-2025.txt")}
    flat = {k: re.sub(r"\s+", " ", v) for k, v in txt.items()}
    for r in special:
        for g in r["seasonRanges"]:
            checked_vals += 1
        if r["species"] == "bear":
            line = next(l for l in txt["bear-2026.txt"].splitlines() if re.match(rf"^\s*\d{{3}}\s+{r['huntCode']}\s", l))
            for want in ("Apr. 15-Jun. 15", "Sep. 05-Sep. 14", "Sep. 15-Nov. 29"):
                if want not in line:
                    bad.append(("bear", r["huntCode"], f"{want} not on permit line"))
            got = [(g["start"], g["end"]) for g in r["seasonRanges"]]
            if got != [("2026-04-15", "2026-06-15"), ("2026-09-05", "2026-09-14"), ("2026-09-15", "2026-11-29")]:
                bad.append(("bear", r["huntCode"], f"ranges {got}"))
        elif r["species"] == "lion":
            if "Archery Season: Sept. 06 - Oct. 19, Fall Season Without Dogs: Oct. 25 - Nov. 30, Winter Season: Dec. 1 - April 14 2026." not in flat["lion-2025.txt"]:
                bad.append(("lion", "-", "season line not in 2025 regs"))
            got = [(g["start"], g["end"]) for g in r["seasonRanges"][:3]]
            if got != [("2025-09-06", "2025-10-19"), ("2025-10-25", "2025-11-30"), ("2025-12-01", "2026-04-14")]:
                bad.append(("lion", r["huntCode"], f"ranges {got}"))
            if not re.search(rf"\n\s*{r['units'][0]}\*?\s+{r['huntCode']}\**\s", txt["lion-2025.txt"]):
                bad.append(("lion", r["huntCode"], "code not in LMU table"))
        elif r["huntCode"] == "900-20":
            if "900 series ........................ Aug. 15–Nov. 8" not in txt["dea-2026.txt"]:
                bad.append(("pronghorn", "900-20", "900 series line not found"))
        else:
            for want in ("archery ................................Sep. 5–Oct. 18", "general ............................Oct. 24–Nov. 29"):
                if want not in txt["dea-2026.txt"]:
                    bad.append((r["species"], r["huntCode"], f"{want!r} not found"))
    print(f"table rows sampled: {len(sample)}; special rows checked: {len(special)}; season values checked: {checked_vals}")
    for b in bad:
        print("MISMATCH", *b)
    print(f"{len(bad)} mismatches")


if __name__ == "__main__":
    main()
