#!/usr/bin/env python3
"""Spot-check the 2026 seasonRanges on California draw rows (written by seasons_digest.py from the 2026 Big
Game Hunting Digest) against OTHER CDFW publications, read with separate regexes:

  deer       Approved 2026 Deer Seasons by Zone / Area-Specific Archery Hunts / Additional Hunts
             (doc_168214/168216/168215.txt; full m/d/yyyy dates)
  elk        2026 Elk Hunt Dates and General Information (doc_246668.txt; "Hunt Code 447 ...: December 22, 2026 -
             January 3, 2027")
  sheep      Title 14 CCR section 362(b)(4) as printed in the 2026-2027 Mammal Hunting Regulations booklet
             (doc_202568.txt): rule dates ("first Saturday in December ... first Sunday in February") computed
             with a weekday calendar, independent of the digest's printed dates and of the license-year rule
  pronghorn  the "2026 Pronghorn Antelope Hunts" table of the same booklet (hunt names, no codes)
  all        elk and sheep tables of the booklet are also compared and every disagreement is listed.

Every 2026 row is checked; a seeded random sample of N rows is printed with the evidence.
Also checks draw-meta.json seasons[] entries that cite d-digest-2026 for deer zones against the zone PDF.

Usage: python -I seasons_spotcheck.py <seasons_raw_dir> <repo_root> [N=30] [seed=2026]
"""
import calendar
import datetime as dt
import json
import os
import random
import re
import sys

MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
NUMR = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})\s*[–-]\s*(\d{1,2})/(\d{1,2})/(\d{4})")


def iso(y, m, d):
    return dt.date(int(y), int(m), int(d)).isoformat()


def numeric_ranges(line):
    return [(iso(a[2], a[0], a[1]), iso(a[5], a[3], a[4])) for a in NUMR.findall(line)]


def doc_code(code):
    m = re.fullmatch(r"([A-Z]+)(\d+)([A-Z]?)", code)
    return f"{m.group(1)}-{m.group(2)}{m.group(3).lower()}" if m else code


# ---------------- deer: Approved 2026 Deer Seasons PDFs ----------------
def deer_expected(raw):
    zone = open(os.path.join(raw, "doc_168214.txt"), encoding="utf-8").read().splitlines()
    arch = open(os.path.join(raw, "doc_168216.txt"), encoding="utf-8").read().splitlines()
    addl = open(os.path.join(raw, "doc_168215.txt"), encoding="utf-8").read().splitlines()
    exp = {}
    zl = {}
    for l in zone:
        m = re.match(r"^\s*(A|[BCDX]-\d+[a-c]?)\b", l)
        if m and numeric_ranges(l):
            zl[m.group(1)] = (numeric_ranges(l), l.strip())
    for k in range(1, 5):
        exp.setdefault("C", []).append((zl[f"C-{k}"][0][-1], zl[f"C-{k}"][1]))
    for z in ("D-12", "D-14", "D-17"):
        exp[z.replace("-", "")] = [(r, zl[z][1]) for r in zl[z][0]]
    for z, v in zl.items():
        if z.startswith("X-"):
            exp["X" + z[2:].upper()] = [(v[0][-1], v[1])]
    for l in arch + addl:
        m = re.match(r"^\s*([A-Z]{1,2}-\d+)\s", l)
        if m:
            code = m.group(1).replace("-", "")
            rr = numeric_ranges(l)
            if not rr and code == "J10":
                # "Oct 3-4, Oct 10-12" (no year printed; the table is "Approved 2026 Deer Seasons")
                rr = [(iso(2026, 10, int(a)), iso(2026, 10, int(b))) for a, b in re.findall(r"Oct (\d+)-(\d+)", l)]
            for r in rr:
                exp.setdefault(code, []).append((r, l.strip()))
    return {k: [x[0] for x in v] for k, v in exp.items()}, {k: v[0][1] for k, v in exp.items()}


# ---------------- elk: 2026 Elk Hunt Dates ----------------
ELKDATE = re.compile(r"([A-Z][a-z]+) (\d{1,2})(?:, (\d{4}))?\s*[–-]\s*(?:([A-Z][a-z]+) )?(\d{1,2}),? ?(\d{4})?")


def elk_expected(raw):
    t = open(os.path.join(raw, "doc_246668.txt"), encoding="utf-8").read()
    t = t[t.index("HUNT DATES"):t.index("GENERAL ELK HUNT INFORMATION")]
    entries = []
    for l in t.splitlines():
        s = l.strip()
        if not s or s.startswith("California Department") or re.fullmatch(r"[A-Z /]+", s):
            continue
        if s.startswith("Hunt Code") or not entries:
            entries.append(s)
        else:
            entries[-1] += " " + s
    exp, ev = {}, {}
    for e in entries:
        codes = re.findall(r"Hunt Code (\d{3})", e)
        tail = e.rsplit(":", 1)[1]
        m = ELKDATE.search(tail)
        mo1, d1, y1, mo2, d2, y2 = m.groups()
        y2 = int(y2 or 2026)
        y1 = int(y1 or y2)
        r = (iso(y1, MONTHS[mo1.lower()], d1), iso(y2, MONTHS[(mo2 or mo1).lower()], d2))
        for c in codes:
            exp[c] = [r]
            ev[c] = e
    return exp, ev


# ---------------- sheep: Title 14 section 362(b)(4) rules ----------------
def nth_weekday(year, month, weekday, n):
    """n-th (1-based; -1 = last) weekday (Mon=0) of month."""
    days = [d for d in calendar.Calendar().itermonthdates(year, month) if d.month == month and d.weekday() == weekday]
    return days[n - 1] if n > 0 else days[-1]


SAT, SUN = 5, 6


def sheep_expected(raw):
    t = open(os.path.join(raw, "doc_202568.txt"), encoding="utf-8").read()
    # confirm the rule text we transcribe below is what the booklet prints
    needed = ["(A) Zones 1 through 4, 6, 8, 9, 11, 12, and 13: Beginning", "the first Saturday in December and extend extend-",
              "ing through the first Sunday in February.", "(B) Zone 5: Beginning the third Saturday in December",
              "and extending through the third Sunday in February.", "1. Zone 7 (Period 1): Beginning the third Saturday in",
              "August and extending through the last Sunday in", "2. Zone 7 (Period 2): Beginning the first Saturday in",
              "January and extending through the first Sunday in", "1. Zone 10 (Period 1): Beginning the first Saturday in",
              "December and extending through the first Saturday", "2. Zone 10 (Period 2): Beginning the first Sunday in"]
    flat = re.sub(r"\s+", " ", t)
    for n in needed:
        if re.sub(r"\s+", " ", n) not in flat:
            raise SystemExit(f"booklet: Title 14 sheep text changed, missing {n!r}")
    y = 2026
    std = (nth_weekday(y, 12, SAT, 1), nth_weekday(y + 1, 2, SUN, 1))
    z5 = (nth_weekday(y, 12, SAT, 3), nth_weekday(y + 1, 2, SUN, 3))
    z7a = (nth_weekday(y, 8, SAT, 3), nth_weekday(y, 9, SUN, -1))
    z7b = (nth_weekday(y + 1, 1, SAT, 1), nth_weekday(y + 1, 2, SUN, 1))
    z10a = (nth_weekday(y, 12, SAT, 1), nth_weekday(y + 1, 1, SAT, 1))
    z10b = (nth_weekday(y + 1, 1, SUN, 1), nth_weekday(y + 1, 2, SUN, 1))
    by = {"501": std, "502": std, "503": std, "504": std, "505": z5, "506": std, "507": z7a, "511": z7b, "508": std,
          "509": std, "512": z10a, "513": z10b, "514": std, "515": std, "516": std}
    return {c: [(a.isoformat(), b.isoformat())] for c, (a, b) in by.items()}, {c: "T14 CCR 362(b)(4) rule" for c in by}


# ---------------- booklet hunt tables (elk, pronghorn, sheep), matched by hunt name ----------------
SHORT = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)"
BRANGE = re.compile(rf"{SHORT}\s*(\d{{1,2}})\s*-\s*{SHORT}?\s*(\d{{1,2}})\s*$")
MNUM = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}


def booklet_table(raw, heading):
    t = open(os.path.join(raw, "doc_202568.txt"), encoding="utf-8").read().splitlines()
    out = {}
    on = False
    for l in t:
        if heading in l:
            on = True
        if not on:
            continue
        m = BRANGE.search(l.rstrip())
        if m:
            name = re.sub(r"\s{2,}\d+\s*$", "", l[:m.start()].rstrip()).strip()
            name = re.sub(r"\s+", " ", name.replace("–", "-"))
            if name:
                out[name] = m.group(0).strip()
    return out


def mmdd(s):
    m = BRANGE.search(s)
    a = (MNUM[m.group(1).lower()], int(m.group(2)))
    b = (MNUM[(m.group(3) or m.group(1)).lower()], int(m.group(4)))
    return a, b


PRONGHORN_NAMES = {  # booklet "2026 Pronghorn Antelope Hunts" hunt names (no codes printed there)
    "710": "Zone 1 Mount Dome General Methods Buck", "720": "Zone 2 Clear Lake General Methods Buck",
    "728": "Zone 2 Clear Lake Archery Buck", "730": "Zone 3 Likely Tables Period 1 General Methods Buck",
    "740": "Zone 4 Lassen Period 1 General Methods Buck", "742": "Zone 4 Lassen Period 2 General Methods Buck",
    "745": "Zone 4 Lassen Archery Buck", "750": "Zone 5 Big Valley General Methods Buck", "755": "Zone 5 Big Valley Archery Buck",
    "760": "Zone 6 Surprise Valley General Methods Buck", "765": "Zone 6 Surprise Valley Archery Buck",
    "766": "Zone 6 Surprise Valley Either-sex Apprentice", "780": "Zone 5 Big Valley Either-sex Apprentice",
    "790": "Zone 4 Lassen Period 1 Either-sex Apprentice",
}


def lyear(m, d):
    return dt.date(2026 if m >= 7 else 2027, m, d).isoformat()


def pronghorn_expected(raw):
    tab = booklet_table(raw, "2026 PRONGHORN ANTELOPE HUNTS")
    exp, ev = {}, {}
    for c, n in PRONGHORN_NAMES.items():
        a, b = mmdd(tab[n])
        exp[c] = [(lyear(*a), lyear(*b))]
        ev[c] = f"booklet: {n} {tab[n]}"
    return exp, ev


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    sources = {"mule-deer": deer_expected(raw), "elk": elk_expected(raw), "sheep": sheep_expected(raw),
               "pronghorn": pronghorn_expected(raw)}
    checked, bad, rows_all = 0, [], []
    for sp, (exp, ev) in sources.items():
        rows = [r for r in json.load(open(os.path.join(repo, "src/data/agency/california/draw", f"{sp}.json"))) if r["year"] == 2026]
        for r in rows:
            got = [(g["start"], g["end"]) for g in r.get("seasonRanges", [])]
            want = exp.get(r["huntCode"])
            checked += 1
            rows_all.append((sp, r, got, want, ev.get(r["huntCode"])))
            if want is None:
                bad.append(f"{sp} {r['huntCode']}: not in the independent source")
            elif got != want:
                bad.append(f"{sp} {r['huntCode']}: row {got} != source {want}  [{ev.get(r['huntCode'])}]")
    # booklet tables vs digest for elk and sheep (informational: list every disagreement). Hunt names are taken
    # from the digest table line of each code and must equal the booklet name (punctuation/case ignored).
    booklet_diffs, compared = [], 0
    digest = open(os.path.join(os.path.dirname(os.path.abspath(raw)), "draw", "digest", "200602.txt"), encoding="utf-8").read()
    norm = lambda x: re.sub(r"[^a-z0-9]+", " ", x.lower().replace("sept", "sep")).strip()
    for sp, heading, dhead in (("elk", "2026 ELK HUNTS", ("2026 ELK HUNTS", "PRONGHORN HUNT ZONES")),
                               ("sheep", "2026 BIGHORN SHEEP HUNTS", ("2026 BIGHORN SHEEP HUNTS", "WILD PIG HUNTING"))):
        tab = {norm(k): (k, v) for k, v in booklet_table(raw, heading).items()}
        i = digest.index(dhead[0])
        dl = digest[i:digest.index(dhead[1], i)].splitlines()
        rows = [r for r in json.load(open(os.path.join(repo, "src/data/agency/california/draw", f"{sp}.json"))) if r["year"] == 2026]
        for r in rows:
            m = next((re.match(rf"^\s*{r['huntCode']}\s+(.+?)\s{{2,}}", l) for l in dl if re.match(rf"^\s*{r['huntCode']}\s+\S", l)), None)
            if not m or norm(m.group(1)) not in tab:
                continue
            compared += 1
            name, d = tab[norm(m.group(1))]
            g = r["seasonRanges"][0]
            a, b = mmdd(d)
            if (lyear(*a), lyear(*b)) != (g["start"], g["end"]):
                booklet_diffs.append(f"{sp} {r['huntCode']} '{name}': booklet prints '{d}', digest and the other source give {g['start']}..{g['end']}")
    random.seed(seed)
    print(f"Checked {checked} rows (2026) against independent CDFW documents: {checked - len(bad)} match, {len(bad)} mismatch")
    for b in bad:
        print("  MISMATCH", b)
    print(f"\nRandom sample of {n} (seed {seed}):")
    for sp, r, got, want, e in random.sample(rows_all, min(n, len(rows_all))):
        print(f"  {'OK ' if got == want else 'BAD'} {sp:9} {r['huntCode']:5} {r['seasonDates']!r:62} -> {got}  | {str(e)[:110]}")
    print(f"\nBooklet hunt tables: {compared} elk/sheep hunts matched by name, {len(booklet_diffs)} print other dates than the digest")
    for d in booklet_diffs:
        print("  ", d)
    # draw-meta seasons for deer zones vs zone PDF
    meta = json.load(open(os.path.join(repo, "src/data/agency/california/draw-meta.json")))
    zone = open(os.path.join(raw, "doc_168214.txt"), encoding="utf-8").read().splitlines()
    zl = {}
    for l in zone:
        m = re.match(r"^\s*(A|[BCDX]-\d+[a-c]?)\b", l)
        if m and numeric_ranges(l):
            rr = numeric_ranges(l)
            zl[m.group(1).replace("-", "").upper()] = {"archery": rr[0] if len(rr) == 2 else None, "general": rr[-1]}
    mbad, mn = [], 0
    for s in meta["seasons"]:
        if s["species"] != "mule-deer" or not s.get("units"):
            continue
        kind = "archery" if s.get("method") == "archery" else "general"
        if s.get("huntCodes") and any(re.fullmatch(r"A\d+", c) for c in s["huntCodes"]):
            continue  # premium archery hunts (A1, A3-A20) are checked on the rows above
        for u in s["units"]:
            mn += 1
            want = zl.get(u.upper(), {}).get(kind)
            if want != (s["start"], s["end"]):
                mbad.append(f"{s['label']} unit {u}: meta {s['start']}..{s['end']} vs zone PDF {want}")
    print(f"\ndraw-meta deer zone seasons: {mn} unit/season pairs checked against Approved 2026 Deer Seasons by Zone, {len(mbad)} mismatch")
    for b in mbad:
        print("  MISMATCH", b)
    sys.exit(1 if bad or mbad else 0)


if __name__ == "__main__":
    main()
