#!/usr/bin/env python3
"""Spot-check parsed South Dakota draw rows against the raw GFP HTML.

Independent of draw_parse.py: the raw HTML is flattened to plain text with a
regex (no BeautifulSoup), then the numbers are re-read from that text.

Usage:  python -I draw_spotcheck.py <raw_dir> <repo_root> [n=20] [seed=2026]
"""
import html as htmllib
import json
import os
import random
import re
import sys


def flat(path):
    t = open(path, encoding="utf-8").read()
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"(?i)</t[dh]>", " | ", t)
    t = re.sub(r"(?i)</tr>", "\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmllib.unescape(t)
    lines = []
    for ln in t.split("\n"):
        cells = [re.sub(r"\s+", " ", c).strip() for c in ln.split("|")]
        cells = [c for c in cells if c]
        if cells:
            lines.append(cells)
    return lines


def pref_sections(lines):
    secs, cur = {}, None
    for c in lines:
        if len(c) == 1 and not c[0].isdigit():
            cur = c[0]
            secs[cur] = {"pts": {}, "total": None}
        elif cur and len(c) == 3 and c[0] == "Total":
            secs[cur]["total"] = (int(c[1]), int(c[2]))
        elif cur and len(c) == 3 and c[0].isdigit():
            secs[cur]["pts"][int(c[0])] = (int(c[1]), int(c[2]))
    return secs


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    rng = random.Random(seed)
    manifest = json.load(open(os.path.join(raw, "manifest.json")))
    ddir = os.path.join(repo, "src/data/agency/south-dakota/draw")
    rows = []
    for f in sorted(os.listdir(ddir)):
        rows += json.load(open(os.path.join(ddir, f)))
    # stratify: at least one row per species, then random
    by_sp = {}
    for r in rows:
        by_sp.setdefault(r["species"], []).append(r)
    pick = [rng.choice(v) for v in by_sp.values()]
    pick += rng.sample(rows, max(0, n - len(pick)))
    fails = 0
    for r in pick:
        code = r["huntCode"].split(" (")[0]
        cat_phase = r["description"].split(": ")[0]
        cat, phase = cat_phase.rsplit(", ", 1)
        e = next(e for e in manifest if e["year"] == r["year"] and e["category"] == cat
                 and e["phase"].endswith(phase) and e["event"].split(" - ")[0].strip() == code)
        pref = pref_sections(flat(os.path.join(raw, "html", e["stem"] + "_pref.html")))
        res_lines = flat(os.path.join(raw, "html", e["stem"] + "_res.html"))
        checks = []
        rs = next((pref[k] for k in ("Resident Non Landowner", "Resident") if k in pref), None)
        nr = pref.get("Non Resident")
        if r.get("resident"):
            checks.append(("resident applicants/drawn", (r["resident"]["applicants"], r["resident"]["drawn"]), rs and rs["total"]))
            mp = min((p for p, (a, d) in rs["pts"].items() if d > 0), default=None)
            checks.append(("resident minPoints", r["resident"].get("minPoints"), mp))
        if r.get("nonresident"):
            checks.append(("nonresident applicants/drawn", (r["nonresident"]["applicants"], r["nonresident"]["drawn"]), nr and nr["total"]))
        tot = tuple(sum(x) for x in zip(*[s["total"] for s in pref.values() if s["total"]]))
        checks.append(("total applicants/drawn", (r["total"]["applicants"], r["total"]["drawn"]), tot))
        if r.get("byPoints"):
            bp = rng.choice(r["byPoints"])
            if "resident" in bp:
                checks.append((f"byPoints {bp['points']} resident", (bp["resident"]["applicants"], bp["resident"]["drawn"]), rs["pts"].get(bp["points"])))
        if r["total"].get("quota") is not None:
            pools = [c for c in res_lines if len(c) == 5 and c[1].isdigit()]
            q = sum(int(c[3]) for c in pools)
            last = {}
            for c in pools:
                k = "c" if c[0].startswith("Resident / Nonresident") else ("n" if c[0].startswith("Non Resident") else "r")
                last[k] = int(c[4])
            q += sum(last.values())
            checks.append(("total quota (issued + final remaining)", r["total"]["quota"], q))
        bad = [c for c in checks if c[1] != (tuple(c[2]) if isinstance(c[2], (list, tuple)) else c[2])]
        status = "CONFIRMED" if not bad else "MISMATCH"
        fails += bool(bad)
        print(f"{status}: {r['species']} {r['year']} {r['huntCode']} | " + "; ".join(f"{k}={v}" for k, v, _ in checks))
        for k, v, raw_v in bad:
            print(f"    {k}: parsed {v} raw {raw_v}")
    print(f"{len(pick)} rows checked, {fails} mismatches")


if __name__ == "__main__":
    main()
