#!/usr/bin/env python3
"""Independent check of the South Dakota season dates written by seasons_parse.py.

Usage:  python -I scripts/agency/south-dakota/seasons_spotcheck.py <raw_dir> <repo_root> [--sample N] [--seed S]

seasons_parse.py reads poppler `pdftotext -layout` text and converts dates with seasons_dates.parse.
This check re-extracts each source PDF with pdfplumber (a different text extractor) and, for every
2026 draw row with seasonRanges:
  1. every date fragment of the row's seasonDates appears in the PDF text (or, for the Key Dates
     page, the page lists that start/end under the season's title);
  2. the (month, day) pairs read from the fragments with a separate tokenizer, in order, equal the
     start/end pairs of seasonRanges, and every range year is printed in its fragment (fragments
     without a year: the sheet year 2026) - except the nonresident archery antelope row, whose two
     ranges are the printed season minus the printed firearms season, checked by arithmetic;
  3. unit-specific dates sit on the same PDF line as the unit (refuge units, prairie spring turkey
     units, Black Hills elk unit lists, Custer State Park antlerless elk).
Prints a random sample of N rows (default 40) next to the PDF line found. Exit 1 on any failure.
"""
import datetime
import json
import os
import random
import re
import sys

import pdfplumber

SRC_FILE = {
    "d-sd-elk-2026": "2026elk", "d-sd-wrdeer-2026": "2026westriverdeer-app", "d-sd-erdeer-2026": "2026eastriverdeer-app",
    "d-sd-bhdeer-2026": "2026blackhills-CSPdeer-app", "d-sd-muzzdeer-2026": "2026muzzleloaderdeer-app",
    "d-sd-refugedeer-2026": "2026refugedeer-app", "d-sd-specialbuck-2026": "2026specialbuck-app",
    "d-sd-nrarchdeer-2026": "nonresident-archery-deer-app", "d-sd-antelope-2026": "firearmsantelope", "d-sd-sheep-2026": "2026bhsheep",
    "d-sd-springturkey-prairie-2026": "2026springturkey-prairie-app", "d-sd-springturkey-bh-2026": "2026springturkey-AST_BST_CST_MST-app",
    "d-sd-fallturkey-2026": "fallturkey-app",
}
MONTH = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september",
                                         "october", "november", "december"])}
ABBR = {k[:3]: v for k, v in MONTH.items()}
LABEL_PREFIX = re.compile(r"^(?:[A-Za-z ()-]+?(?: \(antlerless tag only\))?|30A, \d(?:st|nd) Interval|58D|CU\d|West River \(WSD\)|"
                          r"Gregory County only|East River \(ESD\)|Private Land|Public Land): ")


def md_pairs(fragment):
    """Separate tokenizer: walk words; a month name sets the month, each 1-2 digit number is a day."""
    out, cur = [], None
    for tok in re.findall(r"[A-Za-z]+|\d+", fragment):
        low = tok.lower()
        if low in MONTH or low[:3] in ABBR and len(low) <= 4:
            cur = MONTH.get(low) or ABBR[low[:3]]
        elif tok.isdigit() and len(tok) <= 2 and cur:
            out.append((cur, int(tok)))
    return out


def pdf_lines(raw, stem, cache={}):
    if stem not in cache:
        with pdfplumber.open(os.path.join(raw, stem + ".pdf")) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        cache[stem] = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
    return cache[stem]


def keydates_text(raw, cache={}):
    if "t" not in cache:
        from bs4 import BeautifulSoup
        s = BeautifulSoup(open(os.path.join(raw, "keydates.html"), encoding="utf-8").read(), "html.parser")
        cache["t"] = re.sub(r"\s+", " ", s.get_text(" | ", strip=True))
    return cache["t"]


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[sys.argv.index("--sample") + 1]) if "--sample" in sys.argv else 40
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 2026
    rows = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "lion", "turkey"]:
        for r in json.load(open(os.path.join(repo, "src/data/agency/south-dakota/draw", f"{sp}.json"))):
            if r["year"] == 2026 and r.get("seasonRanges"):
                rows.append((sp, r))
    fails, evidence = [], {}
    for sp, r in rows:
        code = r["huntCode"]
        frags = [LABEL_PREFIX.sub("", f.strip()) for f in r["seasonDates"].split(";")]
        sid = r["seasonSourceId"]
        ev = []
        # 1. presence in the source
        if sid == "d-sd-keydates":
            t = keydates_text(raw)
            for f in frags:
                core = f.split(" (season closed")[0]
                s, e = core.split(" - ")
                if f"Start: | {s} | End: | {e}" not in t:
                    fails.append((code, "not on Key Dates page", f))
                ev.append(f"Key Dates: Start {s} End {e}")
        else:
            lines = pdf_lines(raw, SRC_FILE[sid])
            for f in frags:
                hit = next((l for l in lines if f in l), None)
                if not hit and " to " in f:
                    # a date printed across two lines of a two-column sheet ("... 2026 to" / "December 6, 2026")
                    a, b = f.split(" to ", 1)
                    ha = next((l for l in lines if a + " to" in l), None)
                    hb = next((l for l in lines if b in l), None)
                    hit = f"{ha} / {hb}" if ha and hb else None
                if not hit:
                    fails.append((code, "fragment not in PDF text", f, SRC_FILE[sid]))
                else:
                    ev.append(hit)
        # 2. ranges vs fragments
        if code.startswith("ST142"):
            m = re.match(r"(\w+ \d+, \d{4}) - (\w+ \d+, \d{4}) \(season closed during firearms season, (\w+) (\d+)-(\d+), (\d{4})\)", r["seasonDates"])
            p = lambda x: datetime.datetime.strptime(x, "%b %d, %Y").date()
            fs = datetime.date(int(m[6]), MONTH[m[3].lower()], int(m[4]))
            fe = datetime.date(int(m[6]), MONTH[m[3].lower()], int(m[5]))
            want = [(p(m[1]).isoformat(), (fs - datetime.timedelta(days=1)).isoformat()),
                    ((fe + datetime.timedelta(days=1)).isoformat(), p(m[2]).isoformat())]
            got = [(g["start"], g["end"]) for g in r["seasonRanges"]]
            if want != got:
                fails.append((code, "archery antelope split", want, got))
        else:
            pairs = [p for f in frags for p in md_pairs(re.sub(r"\b\d{4}\b", "", f))]
            got = [(int(d[5:7]), int(d[8:10])) for g in r["seasonRanges"] for d in (g["start"], g["end"])]
            # same set of printed (start, end) pairs (the Gregory County line repeats "14-29")
            if set(zip(pairs[::2], pairs[1::2])) != set(zip(got[::2], got[1::2])) or len(pairs) % 2:
                fails.append((code, "month/day mismatch", pairs, got))
            years_printed = set(re.findall(r"\b(20\d\d)\b", r["seasonDates"])) or {"2026"}
            for g in r["seasonRanges"]:
                for d in (g["start"], g["end"]):
                    if d[:4] not in years_printed:
                        fails.append((code, "year not printed", d, r["seasonDates"]))
        # 3. unit on the same line
        unit = r["units"][0] if r["units"] else None
        cat = code.split(" (", 1)[1]
        if unit and (cat.startswith("Refuge Deer") or (cat.startswith("Prairie Spring Turkey") and unit in ("08A", "08B", "44A", "44B", "58B"))):
            lines = pdf_lines(raw, SRC_FILE[sid])
            if not any(unit in l and frags[0] in l for l in lines):
                fails.append((code, "unit and date not on one line", unit, frags[0]))
        if cat.startswith("Black Hills Elk"):
            lines = pdf_lines(raw, "2026elk")
            # GFP prints each date line followed by the unit list it applies to
            dexp = re.compile(r"(?:January|February|March|April|May|June|July|August|September|October|November|December) "
                              r"\d{1,2}(?:-\d{1,2})?, \d{4}(?: AND (?:October|November|December) \d{1,2}-\d{1,2}, \d{4})?")
            idx = [i for i, l in enumerate(lines) if frags[0] in dexp.findall(l)]
            ok_unit = False
            for i in idx:
                # the unit list follows its date line (possibly after one interleaved table line)
                for l in lines[i + 1:i + 3]:
                    lst = re.findall(r"\bH\d[A-J]\b", re.sub(r"BHE-H\d[A-J]", "", l))
                    if unit in lst:
                        ok_unit = True
                        ev.append(f"{lines[i]} / {l}")
            if not ok_unit:
                fails.append((code, "BH elk unit list", unit, [lines[i:i + 3] for i in idx]))
        evidence[(sp, code)] = ev
    random.seed(seed)
    for sp, r in random.sample(rows, min(n, len(rows))):
        print(f"{sp:10s} {r['huntCode'][:48]:48s} ours: {r['seasonDates'][:80]}")
        for e in evidence[(sp, r["huntCode"])][:2]:
            print(f"{'':59s} src : {e[:110]}")
    print(f"\nchecked {len(rows)} rows with seasonRanges; failures: {len(fails)}")
    for f in fails[:40]:
        print("FAIL", f)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
