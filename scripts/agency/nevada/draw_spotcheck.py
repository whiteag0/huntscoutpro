#!/usr/bin/env python3
"""Print random parsed Nevada draw records next to the raw pdftotext block they came from.

Usage: python -I scripts/agency/nevada/draw_spotcheck.py <raw_dir> <repo_root> [n] [seed]

For each sampled record (choice "first"), finds the block in the pdftotext -layout text of the
source PDF whose header, Units and Season lines match, prints that block verbatim and our values,
and checks automatically that the first-choice Total-row values, the quota and each by-point row
appear on the matching raw text lines (column positions from the raw text header).
"""
import json
import os
import random
import re
import sys


def blocks_of(txt):
    lines = txt.splitlines()
    starts = [i for i, l in enumerate(lines) if re.match(r"^\s*(Res|NR) \S", l) and i + 1 < len(lines) and "Units:" in lines[i + 1]]
    out = []
    for k, s in enumerate(starts):
        e = starts[k + 1] if k + 1 < len(starts) else len(lines)
        out.append(lines[s:e])
    return out


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 18
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 20261031
    srcs = {s["id"]: s for s in json.load(open(os.path.join(raw, "draw_sources.json")))}
    d = os.path.join(repo, "src/data/agency/nevada/draw")
    recs = []
    for f in sorted(os.listdir(d)):
        recs += [r for r in json.load(open(os.path.join(d, f))) if r["choice"] == "first"]
    rnd = random.Random(seed)
    # make sure every species appears, then fill randomly
    by_sp = {}
    for r in recs:
        by_sp.setdefault(r["species"], []).append(r)
    sample = [rnd.choice(v) for v in by_sp.values()]
    while len(sample) < n:
        r = rnd.choice(recs)
        if r not in sample:
            sample.append(r)
    fails = 0
    for r in sample:
        base = os.path.basename(srcs[r["sourceId"]]["url"])
        txt = open(os.path.join(raw, "trend", base[:-4] + ".txt")).read()
        hdr = r["description"].split(" - Hunt ")[0]
        units = r["description"].split(", Units ", 1)[1].rsplit(", ", 1)[0]
        cands = [b for b in blocks_of(txt) if b[0].strip() == hdr and re.sub(r"\s+", " ", b[1]).strip().startswith("Units: " + units.split(" ")[0])
                 and r["seasonDates"] in b[2]]
        cands = [b for b in cands if re.sub(r"\s+", " ", " ".join(x.strip() for x in b[1:3])).find(re.sub(r"\s+", " ", units)[:40]) >= 0] or cands
        st = r.get("resident") or r.get("nonresident")
        print("=" * 100)
        print(f"{r['year']} {r['huntCode']} | {r['description']} | season {r['seasonDates']} | {base}")
        print(f"  ours: quota {st['quota']} 1st-choice applicants {st['applicants']} drawn {st['drawn']} odds {st['oddsPct']} minPts {st['minPoints']}")
        print("  byPoints: " + ", ".join(f"{p['points']}:{list(p.values())[1]['applicants']}/{list(p.values())[1]['drawn']}" for p in r["byPoints"]))
        if len(cands) != 1:
            print(f"  !! found {len(cands)} raw blocks")
            fails += 1
            continue
        blk = cands[0]
        for l in blk:
            if l.strip() and not re.search(r"Page \d+ of", l) and "Nevada Bonus Point" not in l and "Big Game Main Draw" not in l:
                print("  | " + l.rstrip())
        ok = True
        q = [l for l in blk if "Quota:" in l][0]
        ok &= int(q.split("Quota:")[1].strip()) == st["quota"]
        tot = [l for l in blk if re.match(r"^\s*Total\s+\d", l)][0]
        tk = tot.split()
        ok_tot = int(tk[1].replace(",", "")) == st["drawn"] and int(tk[6].replace(",", "")) == st["applicants"]
        ok_pts = True
        if r.get("byPoints") is not None:
            res = "resident" if r.get("resident") else "nonresident"
            ours = {p["points"]: p[res]["applicants"] for p in r["byPoints"]}
            for l in blk:
                t = l.split()
                if t and t[0].isdigit() and len(t) >= 6 and all(x.replace(",", "").isdigit() for x in t):
                    a1 = int(t[-5].replace(",", ""))
                    if ours.get(int(t[0]), 0) != a1:
                        ok_pts = False
                        print(f"  !! points {t[0]}: raw 1st-choice applicants {a1} vs ours {ours.get(int(t[0]))}")
        ok = ok and ok_tot and ok_pts
        print(f"  auto-check quota/total/by-point applicants: {'OK' if ok else 'MISMATCH'}; Total row: {tot.strip()}")
        if not ok:
            fails += 1
    print(f"\n{len(sample)} records sampled, {fails} automatic failures")


if __name__ == "__main__":
    main()
