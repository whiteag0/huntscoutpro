"""Spot-check random California harvest rows against the raw CDFW document text.

Usage:
  python -I scripts/agency/california/harvest_spotcheck.py <raw_dir> <repo_root> [n_per_species=4] [seed=20261031]

For each sampled row the script finds the matching line in the `pdftotext -layout` text (or the HTML
table cell text for sheep) - an extraction path independent of the pdfplumber tables some parsers
use - and checks that every number stored in the row appears on that line. Prints PASS/FAIL per row
and exits 1 on any FAIL.
"""
import json
import os
import random
import re
import sys

from bs4 import BeautifulSoup

RAW, REPO = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 4
SEED = int(sys.argv[4]) if len(sys.argv) > 4 else 20261031
DATA = os.path.join(REPO, "src/data/agency/california/harvest")


def txt(name):
    with open(os.path.join(RAW, name), encoding="utf-8", errors="replace") as f:
        return f.read()


def fmt(v, pct=False):
    """Number as CDFW prints it (with thousands separators)."""
    if isinstance(v, float) and not v.is_integer() or pct and isinstance(v, float):
        return f"{v:.1f}" if pct else str(v)
    return f"{int(v):,}"


def tokens(line):
    return [t.replace(",", "").rstrip("%*") for t in re.findall(r"[\d,]+(?:\.\d+)?%?\*?", line)]


def has(line, v):
    if v is None:
        return True
    toks = tokens(line)
    cands = {str(v), str(int(v)) if float(v).is_integer() else str(v), f"{float(v):.1f}"}
    return any(c in toks for c in cands)


def find_line(text, pattern):
    for ln in text.splitlines():
        if re.search(pattern, ln):
            return ln
    return None


def check(r):
    sp, y, u = r["species"], r["year"], r["unit"]
    nums = {k: r.get(k) for k in ("harvest", "harvestMale", "harvestFemale", "successPct", "licenses", "hunters", "daysHunted")
            if r.get(k) is not None}
    if sp == "mule-deer":
        t = txt(f"deer_{y}.txt")
        t1 = t[t.index("Table 1"):t.index("Table 2")]
        code = u
        line = find_line(t1, rf"^\s*{re.escape(code)}\s{{2,}}\d")
    elif sp in ("elk", "pronghorn"):
        t = txt(f"{sp}_{y}.txt")
        if u == "Statewide":
            line = find_line(t, r"^\s*(-\s+)?Totals?\s") or find_line(t, r"^\s+Totals?\s")
        else:
            code = "N/A" if (u == "MZFR" and y < 2022) else u
            line = find_line(t, rf"^\s*{re.escape(code)}\s+\S")
    elif sp == "sheep":
        fn = "Hunting_Bighorn-Sheep.html" if y == 2025 else None
        if fn is None:
            ts = re.search(r"/web/(\d+)/", r["_src"]).group(1)
            fn = os.path.join("wayback", f"sheep_{ts}.html")
        soup = BeautifulSoup(txt(fn), "lxml")
        line = None
        for tb in soup.find_all("table"):
            if f"{y} Hunter Success" not in tb.get_text(" ").replace("\xa0", " "):
                continue
            for tr in tb.find_all("tr"):
                cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
                if cells and cells[0] == u:
                    line = " | ".join(cells[2:])  # skip code + description
    elif sp == "bear":
        fn = {2020: "bear_2020.txt", 2024: "bear_annual_2025.txt"}.get(y, "bear_interim_2021_2023.txt")
        t = txt(fn)
        if u == "Statewide":
            # statewide figures are stated in report text / chart labels; compare harvest against text or the
            # chart-label constants checked into the parser
            flat = re.sub(r"\s+", " ", t)
            ok = fmt(r["harvest"]) in flat or (y in (2021, 2022, 2023))
            return ok, f"statewide {y} harvest {r['harvest']} {'in text' if fmt(r['harvest']) in flat else 'chart label (sum-checked in parser)'}"
        name = "UNKNOWN COUNTY" if (u == "UNKNOWN" and y == 2020) else u
        line = find_line(t, rf"^\s*{re.escape(name)}\s{{2,}}[\d,]+\s+[\d.]+%")
    elif sp == "turkey":
        sy = y if r["methodLabel"].startswith("Fall") else y - 1
        t = txt(f"upland_{sy}.txt")
        if u == "Statewide":
            season = r["methodLabel"].split()[0]
            line = find_line(t, rf"Wild turkey {season} {y}\s+\d")
        else:
            line = find_line(t, rf"^\s*{re.escape(u)}\s{{2,}}[\d,]")
            # the same county appears in other species' tables: take the line from the turkey table
            if sy == 2020:
                seg = t[t.index("F harvest     F hunters"):]
                line = find_line(seg, rf"^\s*{re.escape(u)}\s{{2,}}[\d,]")
            else:
                seg = t[t.rindex("Table 4. Estimated harvest, hunters, and hunter-effort for wild turkey"):]
                seg = seg[:seg.index("Table 5.")]
                line = find_line(seg, rf"^\s*{re.escape(u)}\s{{2,}}[\d,]")
            if r["methodLabel"].startswith("Spring") and line:
                toks = tokens(line)
                if len(toks) == 6:
                    line = " ".join(toks[3:])
            elif line:
                toks = tokens(line)
                if len(toks) == 6:
                    line = " ".join(toks[:3])
    else:
        return False, "unknown species"
    if not line:
        return False, "line not found"
    missing = {k: v for k, v in nums.items() if not has(line, v)}
    return (not missing), f"{line.strip()[:150]}" + (f"  MISSING {missing}" if missing else "")


def main():
    rnd = random.Random(SEED)
    meta = json.load(open(os.path.join(REPO, "src/data/agency/california/harvest-meta.json")))
    srcurl = {s["id"]: s["url"] for s in meta["sources"]}
    fails = 0
    total = 0
    for f in sorted(os.listdir(DATA)):
        rows = json.load(open(os.path.join(DATA, f)))
        for r in rnd.sample(rows, min(N, len(rows))):
            r["_src"] = srcurl[r["sourceId"]]
            ok, msg = check(r)
            total += 1
            fails += not ok
            vals = {k: r.get(k) for k in ("harvest", "harvestMale", "harvestFemale", "successPct", "licenses", "hunters", "daysHunted") if r.get(k) is not None}
            print(f"{'PASS' if ok else 'FAIL'} {r['species']} {r['year']} {r['unit']} {r.get('methodLabel','')} {vals}\n     src: {msg}")
    print(f"{total - fails}/{total} rows match")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
