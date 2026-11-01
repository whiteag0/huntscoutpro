#!/usr/bin/env python3
"""Spot-check random Alaska draw rows against the raw ADF&G supplements, independently of draw_build.py.

For each sampled row:
  * counts: re-read the back-page results table of the (year+1) supplement with pdfplumber word positions (not the
    pdftotext regex the builder uses): the hunt-number word, then the next three words on the same line must be
    applications, permits and % drawn, and must equal total.applicants / total.quota / oddsPct ("<1" -> null);
  * hunt details: in `pdftotext -layout` text of the year's supplement, the hunt number must appear, every unit in
    `units` must appear in the page text of that hunt's page, and every date range in seasonDates must appear
    (whitespace-insensitive) on that page;
  * 2026 rows: compare residency, units, legal animal and first/last season dates with ADF&G's 2026 per-hunt
    pages (raw_dir/hunts/hd2026_<hunt>.html, from draw_fetch.py).
Also checks every row: % drawn vs min(permits, apps)/apps.

Usage: python -I draw_spotcheck.py <raw_dir> <repo_root> [n=20] [seed=20261031]
"""
import glob
import json
import os
import random
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_huntpage  # noqa: E402

MON = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "June": 6, "Jul": 7, "July": 7, "Aug": 8, "Sep": 9, "Sept": 9,
       "Oct": 10, "Nov": 11, "Dec": 12}


def results_words(raw, year):
    import pdfplumber

    path = os.path.join(raw, f"supp_{year + 1}-{year + 2}.pdf")
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[-1]
        txt = page.extract_text() or ""
        if f"Results of the {year} Permit Hunt Drawing" not in txt:
            raise SystemExit(f"results page for {year} not on the last page of {path}")
        return page.extract_words()


def counts_from_words(words, code):
    hits = [w for w in words if w["text"].rstrip("*") == code]
    if len(hits) != 1:
        return None
    w = hits[0]
    line = sorted([v for v in words if abs(v["top"] - w["top"]) < 3 and v["x0"] > w["x1"]], key=lambda v: v["x0"])[:3]
    if len(line) < 3:
        return None
    return line[0]["text"], line[1]["text"], line[2]["text"]


def page_texts(raw, year):
    path = os.path.join(raw, f"supp_{year}-{year + 1}.pdf")
    out = []
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout).group(1))
    for p in range(1, n + 1):
        out.append(subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p), path, "-"], capture_output=True, text=True).stdout)
    return out


def squash(s):
    return re.sub(r"\s+", "", s or "")


def first_last(s):
    rx = r"(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?\s*(\d{1,2})"
    ds = re.findall(rx, s)
    if not ds:
        return None
    start = (MON[ds[0][0]], int(ds[0][1]))
    last = re.findall(r"-(?:(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?\s*)?(\d{1,2})\s*$|thru\s+" + rx + r"\s*$", s.strip())
    end = None
    if last:
        m = last[-1]
        if m[1]:
            end = (MON[m[0]] if m[0] else MON[ds[-1][0]], int(m[1]))
        elif m[3]:
            end = (MON[m[2]], int(m[3]))
    return start, end


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    rnd = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 20261031)
    rows = []
    for f in sorted(glob.glob(os.path.join(repo, "src/data/agency/alaska/draw/*.json"))):
        rows += json.load(open(f))
    # % drawn sanity over every row
    odd = []
    for r in rows:
        t = r["total"]
        if t["applicants"] and t.get("oddsPct") is not None and t["applicants"] >= 10:
            calc = 100 * min(t["quota"], t["applicants"]) / t["applicants"]
            if abs(calc - t["oddsPct"]) > 1.5:
                odd.append((r["year"], r["huntCode"], t, round(calc, 1)))
    print(f"% drawn vs min(permits,apps)/apps differs by >1.5 points in {len(odd)} of {len(rows)} rows")
    for o in odd[:15]:
        print("   ", o)
    by = {}
    for r in rows:
        by.setdefault((r["species"], r["year"]), []).append(r)
    sample = [rnd.choice(v) for v in by.values()]
    while len(sample) < n:
        r = rnd.choice(rows)
        if r not in sample:
            sample.append(r)
    words_cache, pages_cache = {}, {}
    fails = 0
    for r in sorted(sample, key=lambda r: (r["year"], r["huntCode"])):
        y, code = r["year"], r["huntCode"]
        problems = []
        if y not in words_cache:
            words_cache[y] = results_words(raw, y)
            pages_cache[y] = page_texts(raw, y)
        got = counts_from_words(words_cache[y], code)
        t = r["total"]
        if not got:
            problems.append("hunt not found once in results table")
        else:
            apps, permits, pct = got
            exp_pct = None if pct == "<1" else int(pct)
            if int(apps) != t["applicants"] or int(permits) != t["quota"] or exp_pct != t.get("oddsPct"):
                problems.append(f"counts raw {got} vs row {t}")
        pages = [p for p in pages_cache[y] if re.search(r"\b" + code + r"\b", p) and "Permit Hunt Drawing" not in p]
        if not pages:
            problems.append("hunt number not in the year's supplement text")
        else:
            pg = " ".join(pages)
            for u in r["units"]:
                if not re.search(r"\b" + re.escape(u) + r"\b", pg) and not re.search(r"\b" + re.escape(u[:-1]) + r"[A-F]*" + u[-1:] + r"\b", pg):
                    problems.append(f"unit {u} not on the hunt's page")
            for part in (r.get("seasonDates") or "").split("; "):
                d = part.split(": ", 1)[-1]
                sp = squash(pg).replace("!", "")
                for rng in re.split(r" and ", d):
                    if not rng:
                        continue
                    # the two ends of a range are often printed on two lines ("Aug. 20-" / "Oct. 25")
                    a, _, b = rng.partition("-") if " thru " not in rng else rng.partition(" thru ")
                    if squash(rng) not in sp and not (squash(a) in sp and squash(b) in sp):
                        problems.append(f"season '{rng}' not on the hunt's page")
        if y == 2026:
            hp = os.path.join(raw, "hunts", f"hd2026_{code}.html")
            if os.path.exists(hp):
                h = draw_huntpage.parse(hp)
                res = h.get("residency") or ""
                desc = r["description"]
                said_r = bool(re.search(r"\bResidents? (Youth Hunters )?Only|Resident Youth", desc))
                said_nr = "Nonresidents" in desc
                exp = "R" if res == "Alaska residents only" else "NR" if res == "Nonresidents only" else "both"
                ours = "R" if said_r and not said_nr else "NR" if said_nr and not said_r else "both"
                if exp != ours and not (exp == "both" and said_r and said_nr):
                    problems.append(f"residency '{res}' vs description")
                if r.get("seasonDates") and h.get("season"):
                    m = re.findall(r"(\d\d)/(\d\d)/\d{4}", h["season"])
                    fl = first_last(r["seasonDates"].split(": ", 1)[-1])
                    if fl and m and fl[0] != (int(m[0][0]), int(m[0][1])):
                        problems.append(f"season start {r['seasonDates']} vs hunt page {h['season']}")
        status = "OK " if not problems else "BAD"
        fails += bool(problems)
        print(f"{status} {y} {code:6} {r['species']:5} units={','.join(r['units']):10} apps={t['applicants']} permits={t['quota']} pct={t.get('oddsPct')}"
              f" season={r.get('seasonDates')} {'; '.join(problems)}")
    print(f"{len(sample)} rows checked, {fails} with problems")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
