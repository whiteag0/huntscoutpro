"""Spot-check Washington season data against the raw WDFW text, independently of seasons_ranges.parse.

Usage:  python -I seasons_spotcheck.py <raw_draw_pdf_dir> <raw_seasons_dir> <repo_root> [n] [seed]
  <raw_draw_pdf_dir>  agency-raw/washington/draw/pdf   (pamphlet_<year>.txt = pdftotext -layout of each year's pamphlet,
                                                        pamphlet_2026_corrections.txt)
  <raw_seasons_dir>   agency-raw/washington/seasons    (wsr_*.txt, mywdfw_ms.txt, news_*.txt, gamebird_2026.txt:
                                                        text extracted from the downloaded pages/PDF)
Checks, for n random items of each kind (default 30):
  ranges   a draw row's seasonRanges: the hunt's line(s) in that year's pamphlet (found by hunt code, not by the
           row's seasonDates text) must contain each range's start month+day and end day in order, and every
           Jan-Mar date must be in the next calendar year (pamphlets cover April 1 - March 31) unless printed otherwise.
  bear     every spring bear row's seasonDates/seasonRanges against the WAC 220-415-080 filing text (plain text search).
  seasons  draw-meta seasons[]: a line of the cited document must carry the season's start/end and its first unit.
  keydates every 2027 key date's day must appear in its cited raw page/document.
Prints each check and exits 1 on any mismatch.
"""
import json
import os
import random
import re
import sys

MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def squash(s):
    s = s.lower().replace("–", "-")
    s = re.sub(r"(january|february|march|april|june|july|august|september|october|november|december)",
               lambda m: m.group(1)[:3], s)
    s = s.replace("sept", "sep")
    return re.sub(r"[\s.,]", "", s)


def md(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return y, m, d


def find_in_order(text, tokens):
    pos = 0
    for t in tokens:
        i = text.find(t, pos)
        if i < 0:
            return False
        pos = i + len(t)
    return True


def range_tokens(g):
    (y1, m1, d1), (y2, m2, d2) = md(g["start"]), md(g["end"])
    start = f"{MON[m1 - 1]}{d1}"
    end = f"{MON[m2 - 1]}{d2}" if (m1, y1) != (m2, y2) else f"-{d2}"
    return [start, end]


def check_ranges(rows, pdf_dir, n, rnd, fails):
    texts = {}
    cand = [r for r in rows if r.get("seasonRanges") and r["species"] != "bear"]
    latest = [r for r in cand if r["year"] == 2026]
    pick = rnd.sample(latest, min(len(latest), n // 2)) + rnd.sample(cand, n - n // 2)
    for r in pick:
        name = "pamphlet_2026_corrections" if r["sourceId"] == "d-pamphlet-2026-corrections" else f"pamphlet_{r['year']}"
        if name not in texts:
            texts[name] = open(os.path.join(pdf_dir, name + ".txt"), encoding="utf-8", errors="replace").read().split("\n")
        lines = texts[name]
        ok = False
        for i, line in enumerate(lines):
            if re.match(r"^\s*" + re.escape(r["huntCode"]) + r"\b", line):
                toks = [t for g in r["seasonRanges"] for t in range_tokens(g)]
                blobs = [squash(" ".join(lines[i:i + 3]))]
                # a dates cell wrapped onto the next line(s): read that column only
                m = re.search(r"\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*[.,]?\s*\d", line)
                if m:
                    col = m.start()
                    parts = [re.split(r"\s{3,}", line[col:])[0]]
                    for x in lines[i + 1:i + 3]:
                        if re.match(r"^\s*\d{4}\b", x):
                            break
                        parts.append(re.split(r"\s{3,}", x[max(0, col - 3):].strip())[0])
                    blobs.append(squash(" ".join(parts)))
                alt = [t if not t.startswith("-") else None for t in toks]  # "Nov. 4-Nov. 8" repeats the month
                alt = [t or f"{toks[k - 1][:3]}{toks[k][1:]}" for k, t in enumerate(alt)]
                if any(find_in_order(b, toks) or find_in_order(b, alt) for b in blobs):
                    ok = True
                    break
        # year rule, independent of the parser: Apr-Dec in the draw year, Jan-Mar in the next
        for g in r["seasonRanges"]:
            for iso in (g["start"], g["end"]):
                y, m, _ = md(iso)
                if y != (r["year"] + 1 if m <= 3 else r["year"]):
                    ok = False
        tag = "OK  " if ok else "FAIL"
        print(f"{tag} range {r['species']} {r['year']} {r['huntCode']}: {r['seasonDates']!r} -> {[(g['start'], g['end']) for g in r['seasonRanges']]} [{name}]")
        if not ok:
            fails.append(r["huntCode"])


def check_bear(rows, seasons_dir, fails):
    src = {2021: "wsr_21-02-015.txt", 2020: "wsr_20-10-065.txt"}
    for r in rows:
        if r["species"] != "bear":
            continue
        lines = [l.strip() for l in open(os.path.join(seasons_dir, src[r["year"]]), encoding="utf-8").read().split("\n")]
        name = r["description"].split(" — ")[0]
        ok = False
        for i, l in enumerate(lines):
            if l == name:
                # the next 12 lines hold area, permits and dates; struck-out amendment text is "((...))"
                chunk = " ".join(lines[i + 1:i + 14])
                blob = squash(re.sub(r"\(\(.*?\)\)", " ", chunk))
                g = r["seasonRanges"][0]
                (y1, m1, d1), (y2, m2, d2) = md(g["start"]), md(g["end"])
                want = squash(f"{LONG[m1 - 1]} {d1}") , squash(f"{LONG[m2 - 1]} {d2}")
                ok = find_in_order(blob, list(want)) and y1 == y2 == r["year"] and r["seasonDates"] and \
                    all(u in blob for u in r["units"])
                break
        tag = "OK  " if ok else "FAIL"
        print(f"{tag} bear {r['year']} {r['huntCode']} {name}: {r['seasonDates']!r} {r['seasonRanges']} [{src[r['year']]}]")
        if not ok:
            fails.append(r["huntCode"])


def check_seasons(meta, pdf_dir, seasons_dir, n, rnd, fails):
    files = {"d-pamphlet-2026": os.path.join(pdf_dir, "pamphlet_2026.txt"),
             "d-turkey-spring-2026": os.path.join(pdf_dir, "turkey_spring_2026.txt"),
             "d-gamebird-2026": os.path.join(seasons_dir, "gamebird_2026.txt"),
             "d-cougar-2026": os.path.join(seasons_dir, "regs-cougar.txt")}
    pick = rnd.sample(meta["seasons"], min(n, len(meta["seasons"])))
    for s in pick:
        lines = open(files[s["sourceId"]], encoding="utf-8", errors="replace").read().split("\n")
        g = {"start": s["start"], "end": s["end"]}
        toks = range_tokens(g)
        unit = (s.get("units") or [""])[0]
        unit_sq = squash(re.sub(r"^(Deer|Elk) Area ", "", unit))  # the pamphlet also writes "Elk Areas 3911 and 3912"
        ok = False
        for i, line in enumerate(lines):
            sq = squash(line + " " + (lines[i + 1] if i + 1 < len(lines) else ""))
            if find_in_order(sq, toks) or find_in_order(sq, [toks[0], toks[1].lstrip("-")]):
                if not unit or unit_sq in squash(" ".join(lines[i:i + 4])):
                    ok = True
                    break
        tag = "OK  " if ok else "FAIL"
        print(f"{tag} season {s['species']} {s['label']!r} {s['start']}..{s['end']} units[0]={unit!r} [{s['sourceId']}]")
        if not ok:
            fails.append(s["label"])


def check_keydates(meta, pdf_dir, seasons_dir, fails):
    files = {"d-mywdfw": os.path.join(seasons_dir, "mywdfw_ms.txt"),
             "d-pamphlet-2026": os.path.join(pdf_dir, "pamphlet_2026.txt"),
             "d-news-surplus-ms-2026": os.path.join(seasons_dir, "news_surplus-multi-season-elk-tags-available-aug-25-multi-season-deer-tags-available-aug-27.txt"),
             "d-news-submit-2026": os.path.join(seasons_dir, "news_2026-washington-big-game-hunting-regulations-now-available-special-hunt-submissions-begin-april-20.txt")}
    seen = set()
    for sp in meta["species"]:
        for k in sp["keyDates"]:
            key = (k["label"], k["sourceId"])
            if key in seen or k["sourceId"] not in files:
                continue
            seen.add(key)
            blob = squash(open(files[k["sourceId"]], encoding="utf-8", errors="replace").read())
            ok = True
            for iso in [k.get("date"), k.get("start"), k.get("end")]:
                if not iso:
                    continue
                y, m, d = md(iso)
                if f"{MON[m - 1]}{d}" not in blob:
                    ok = False
            if not k.get("kind"):
                ok = False
            tag = "OK  " if ok else "FAIL"
            print(f"{tag} keydate {k['cycle']} {k['kind']} {k.get('date') or k['start'] + '..' + k['end']} {k['label']!r} [{k['sourceId']}]")
            if not ok:
                fails.append(k["label"])


def main():
    pdf_dir, seasons_dir, repo = sys.argv[1:4]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 30
    rnd = random.Random(int(sys.argv[5]) if len(sys.argv) > 5 else 20261031)
    base = os.path.join(repo, "src", "data", "agency", "washington")
    rows = []
    for f in sorted(os.listdir(os.path.join(base, "draw"))):
        rows += json.load(open(os.path.join(base, "draw", f)))
    meta = json.load(open(os.path.join(base, "draw-meta.json")))
    fails = []
    check_ranges(rows, pdf_dir, n, rnd, fails)
    check_bear(rows, seasons_dir, fails)
    check_seasons(meta, pdf_dir, seasons_dir, n, rnd, fails)
    check_keydates(meta, pdf_dir, seasons_dir, fails)
    print(f"{len(fails)} mismatches")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
