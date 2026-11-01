"""Spot-check Arizona season data against the AZGFD PDFs by an independent method.

Usage (from repo root):
  python -I scripts/agency/arizona/seasons_spotcheck.py <agency-raw/arizona> [--rows 40] [--seasons 20] [--seed N]

seasons_parse.py reads the booklets with pdfplumber's table finder and parses date text with
regexes. This check instead extracts each source PDF with `pdftotext -raw` (reading order, no
layout), finds the line(s) holding the hunt number, and looks for the stored ISO dates printed
back in the document's own convention (M/D/YYYY or an Excel serial for draw-odds summaries;
"Mon D" ... "Mon D, YYYY" for regulation booklets). Key dates are checked the same way against
the booklet / news-release text ("Oct. 6, 2026"). Prints every check and a total.
"""
import datetime, json, os, random, re, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ROOT = os.path.join(REPO, "src", "data", "agency", "arizona")
MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
TMP = tempfile.mkdtemp(prefix="az-spot-")
_cache = {}


def find_pdf(raw, url):
    base = os.path.basename(url)
    for d, _, fs in os.walk(raw):
        if base in fs:
            return os.path.join(d, base)
    return None


def raw_lines(pdf, mode="-raw"):
    if (pdf, mode) not in _cache:
        out = os.path.join(TMP, os.path.basename(pdf) + mode + ".txt")
        subprocess.run(["pdftotext", mode, pdf, out], check=True)
        _cache[(pdf, mode)] = [re.sub(r"\s+", " ", l.replace("\u2013", "-")) for l in open(out, encoding="utf-8", errors="replace").read().splitlines()]
    return _cache[(pdf, mode)]


def d(iso):
    y, m, dd = (int(x) for x in iso.split("-"))
    return y, m, dd


def serial(iso):
    return str((datetime.date(*d(iso)) - datetime.date(1899, 12, 30)).days)


def mdy_forms(iso):
    y, m, dd = d(iso)
    return {f"{m}/{dd}/{y}", f"{m:02d}/{dd:02d}/{y}", serial(iso)}


def mon_forms(iso):
    y, m, dd = d(iso)
    return {f"{MONS[m-1]} {dd}", f"{MONS[m-1]} {dd:02d}"}


def has_any(text, forms):
    return any(re.search(r"(?<![\d/])" + re.escape(f) + r"(?![\d])", text) for f in forms)


def window_for(lines, code, nxt=2, prev=0):
    hits = []
    for i, l in enumerate(lines):
        if re.search(r"(?<!\d)0?" + re.escape(code) + r"\*?(?!\d)", l):
            hits.append(" ".join(lines[max(0, i - prev):i + 1 + nxt]))
    return hits


def check_ranges(text_windows, ranges, booklet):
    for w in text_windows:
        ok = True
        for g in ranges:
            if booklet:
                ey = d(g["end"])[0]
                if not (has_any(w, mon_forms(g["start"])) and has_any(w, {f + f", {ey}" for f in mon_forms(g["end"])})):
                    ok = False
            elif not (has_any(w, mdy_forms(g["start"])) and has_any(w, mdy_forms(g["end"]))):
                ok = False
        if ok:
            return True, w
    return False, (text_windows[0] if text_windows else "<hunt number not found>")


def ap(iso):
    y, m, dd = d(iso)
    names = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]
    return {f"{names[m-1]} {dd}, {y}", f"{MONS[m-1]}. {dd}, {y}", f"{names[m-1]} {dd}"}


def main():
    raw = sys.argv[1]
    args = sys.argv[2:]
    opt = lambda k, dflt: int(args[args.index(k) + 1]) if k in args else dflt
    rnd = random.Random(opt("--seed", 20261031))
    meta = json.load(open(os.path.join(ROOT, "draw-meta.json")))
    src = {s["id"]: s for s in meta["sources"]}
    ok = bad = 0

    def report(good, what, ctx):
        nonlocal ok, bad
        ok += good
        bad += not good
        print(("MATCH   " if good else "MISMATCH"), what, "|", ctx[:220])

    # ---- draw rows
    rows = []
    for sp in ["elk", "pronghorn", "mule-deer", "whitetail", "sheep", "turkey"]:
        rows += [r for r in json.load(open(os.path.join(ROOT, "draw", f"{sp}.json"))) if r.get("seasonRanges")]
    latest = [r for r in rows if r["year"] == 2026]
    sample = rnd.sample(latest, opt("--rows", 40) // 2) + rnd.sample([r for r in rows if r["year"] < 2026], opt("--rows", 40) // 2)
    for r in sample:
        sid = r["seasonSourceId"]
        pdf = find_pdf(raw, src[sid]["url"])
        if not pdf:
            report(False, f"{r['species']} {r['year']} {r['huntCode']}", f"no local PDF for {sid}")
            continue
        good, ctx = check_ranges(window_for(raw_lines(pdf), r["huntCode"]), r["seasonRanges"], "regs" in sid)
        report(good, f"row {r['species']} {r['year']} {r['huntCode']} {r['seasonRanges']} [{sid}]", ctx)

    # ---- draw-meta.seasons[] (generated entries; lion entries are draw_meta.py's)
    seas = [s for s in meta["seasons"] if s["species"] != "lion"]
    norm = lambda x: re.sub(r"\s+", " ", x.replace("\u2019", "'"))
    for s in rnd.sample(seas, opt("--seasons", 20)):
        pdf = find_pdf(raw, src[s["sourceId"]]["url"])
        g = [{"start": s["start"], "end": s["end"]}]
        if s.get("huntCodes"):
            h = rnd.choice(s["huntCodes"])
            good, ctx = check_ranges(window_for(raw_lines(pdf), h, 1), g, True)
            if not good:  # wrapped date cell: retry on the layout text, one line either side
                good, ctx = check_ranges(window_for(raw_lines(pdf, "-layout"), h, 1, 1), g, True)
            report(good, f"season {s['species']} hunt {h} {s['start']}..{s['end']} [{s['sourceId']}]", ctx)
            continue
        ey = d(s["end"])[0]
        unit = (s.get("units") or [None])[0]
        parts = re.sub(r" \(season part \d+ of \d+\)$", "", s["label"]).split(" \u2014 ")
        legal = parts[1] if len(parts) > 1 else ""
        area = parts[2] if len(parts) > 2 else ""
        hits = []
        for mode, need_area in (("-raw", True), ("-layout", False)):
            lines = raw_lines(pdf, mode)
            # wrapped open-area/legal cells print on the lines just above and below the dates
            cand = [" ".join(lines[max(0, i - 2):i + 3]) for i, l in enumerate(lines) if has_any(l, mon_forms(s["start"]))]
            hits = [w for w in cand if has_any(w, {f + f", {ey}" for f in mon_forms(s["end"])})
                    and (unit is None or re.search(r"(?<![\dA-Z])" + re.escape(unit) + r"(?![\dA-Za-z])", w))
                    and norm(legal)[:20] in norm(w) and (not need_area or norm(area)[:25] in norm(w))]
            if hits:
                break
        report(bool(hits), f"season {s['species']} '{s['label'][:60]}' unit {unit} {s['start']}..{s['end']} [{s['sourceId']}]",
               hits[0] if hits else "<no line with these dates and unit>")

    # ---- key dates added/split in this pass (2027 cycle + archery-deer sale schedule)
    texts = {}
    for sp in meta["species"]:
        for k in sp["keyDates"]:
            if k["cycle"] != 2027 and "archery-only deer" not in k["label"]:
                continue
            sid = k["sourceId"]
            if sid not in texts:
                url = src[sid]["url"]
                if url.endswith(".pdf"):
                    texts[sid] = " ".join(raw_lines(find_pdf(raw, url)))
                else:
                    p = os.path.join(raw, "seasons", "news-2026-10-23-spring-draw-results-available.txt")
                    texts[sid] = open(p).read()
            t = re.sub(r"\s+", " ", texts[sid])
            good = any(f in t for f in ap(k["date"]))
            report(good, f"keyDate [{sp['species']}] {k['label'][:70]} = {k['date']} [{sid}]", "found " + "/".join(sorted(ap(k["date"]))))
    print(f"spot-check: {ok} match, {bad} mismatch")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
