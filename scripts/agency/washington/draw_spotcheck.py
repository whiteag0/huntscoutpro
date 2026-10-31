"""Spot-check random Washington draw rows against the raw WDFW documents.

Usage:  python -I draw_spotcheck.py <raw_dir> <repo_root> [n] [seed]

For each sampled row prints the JSON record next to the raw evidence:
  - harvest-report rows: the caption + cell text of that hunt's table, cut straight from the HTML with a regex
    (independent of the BeautifulSoup parser used by draw_build.py);
  - every row: the pamphlet text line(s) for that hunt code in the year's pamphlet and the next year's pamphlet
    (pdftotext -layout output), so quota / dates / APPS-AVG POINTS can be read by eye.
"""
import glob
import json
import os
import random
import re
import sys
import html as htmlmod

REPORT = {"elk": "elk-individual", "mule-deer": "deer-individual", "whitetail": "deer-individual", "moose": "moose",
          "sheep": "bighorn-sheep", "goat": "mountain-goat", "bear": "black-bear-spring"}


def harvest_evidence(raw, sp, year, code):
    p = os.path.join(raw, "harvestpages", f"{year}-{REPORT.get(sp, '')}.html")
    if not os.path.exists(p):
        return None
    h = open(p, encoding="utf-8", errors="replace").read()
    if sp == "bear":
        m = re.search(r"Hunt\s+number\s+" + code + r"</h2>.*?</table>", h, re.S)
    else:
        m = re.search(r"<caption>" + code + r" - [^<]*</caption>.*?</table>", h, re.S)
    if not m:
        return "NOT FOUND"
    txt = re.sub(r"<[^>]+>", "|", m.group(0))
    txt = re.sub(r"\s+", " ", htmlmod.unescape(txt))
    return re.sub(r"(\|\s*)+", " | ", txt).strip(" |")


def pamphlet_lines(raw, year, code):
    p = os.path.join(raw, "pdf", f"pamphlet_{year}.txt")
    if not os.path.exists(p):
        return []
    out = []
    for i, l in enumerate(open(p, encoding="utf-8").read().split("\n")):
        if re.match(r"^\s{0,14}" + code + r"\s{2,}", l):
            out.append(f"L{i + 1}: {re.sub(' {3,}', '  ', l.strip())}")
    return out


def main(raw, repo, n=18, seed=20261031):
    rng = random.Random(seed)
    files = sorted(glob.glob(os.path.join(repo, "src/data/agency/washington/draw/*.json")))
    rows = []
    for f in files:
        rows += json.load(open(f))
    by_sp = {}
    for r in rows:
        by_sp.setdefault(r["species"], []).append(r)
    picks = []
    sps = sorted(by_sp)
    while len(picks) < n:
        sp = sps[len(picks) % len(sps)]
        picks.append(rng.choice(by_sp[sp]))
    for k, r in enumerate(picks, 1):
        print(f"=== #{k} {r['species']} {r['year']} {r['huntCode']} [{r['sourceId']}]")
        print("  record :", json.dumps({x: r.get(x) for x in ("description", "units", "seasonDates", "methodLabel", "sex", "total")}, ensure_ascii=False))
        if r.get("note"):
            print("  note   :", r["note"][:400])
        ev = harvest_evidence(raw, r["species"], r["year"], r["huntCode"])
        if ev:
            print("  harvest:", ev[:400])
        for y in (r["year"], r["year"] + 1):
            for l in pamphlet_lines(raw, y, r["huntCode"]):
                print(f"  pam{y}:", l[:230])


if __name__ == "__main__":
    a = sys.argv
    main(a[1], a[2], int(a[3]) if len(a) > 3 else 18, int(a[4]) if len(a) > 4 else 20261031)
