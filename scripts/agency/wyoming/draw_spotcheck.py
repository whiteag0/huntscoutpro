#!/usr/bin/env python3
"""Spot-check helper: pick random WY draw records and print them next to the raw
pdftotext lines for the same hunt from every source report, for manual comparison.

Usage: python -I scripts/agency/wyoming/draw_spotcheck.py <raw_dir> <repo_root> [n] [seed]
       python -I scripts/agency/wyoming/draw_spotcheck.py <raw_dir> <repo_root> --pick species:year:huntCode ...
"""
import json
import os
import random
import re
import sys


def raw_block(txt_path, area, htype):
    lines = open(txt_path, encoding="utf-8", errors="replace").read().replace("\f", "\n").split("\n")
    out = []
    pat = re.compile(rf"^{re.escape(area)}\s+{re.escape(htype)}\s+\S" if htype else rf"^{re.escape(area)}\s{{2,}}\S")
    sub = ""
    for i, l in enumerate(lines):
        if "Wyoming Game and Fish" in l:
            sub = l.split("Wyoming Game and Fish")[0].strip()
        if pat.match(l):
            out.append(f"   [{sub}] {l.rstrip()}")
            j = i + 1
            while j < len(lines) and (not lines[j].strip() or lines[j].startswith(" ") or lines[j].startswith("Demand")
                                      or lines[j].startswith(("Hunt ", "Area ", "----", "Nonres", "Resid", "NR ", "Res "))):
                if re.match(r"^\s{20,}\d", lines[j]):
                    out.append("      " + lines[j].strip())
                j += 1
                if j - i > 80:
                    break
    return out


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    picks = sys.argv[4:] if len(sys.argv) > 3 and sys.argv[3] == "--pick" else None
    if picks:
        sys.argv = sys.argv[:3]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 20261031
    rng = random.Random(seed)
    sources = {s["id"]: s for s in json.load(open(os.path.join(raw, "sources.json")))}
    manifest = {m["url"]: m for m in json.load(open(os.path.join(raw, "manifest.json")))}
    d = os.path.join(repo, "src/data/agency/wyoming/draw")
    pool = []
    for f in sorted(os.listdir(d)):
        for r in json.load(open(os.path.join(d, f))):
            pool.append(r)
    chosen = rng.sample(pool, n) if not picks else [
        r for r in pool if f"{r['species']}:{r['year']}:{r['huntCode']}" in picks]
    for r in chosen:
        print("=" * 100)
        print(json.dumps(r, separators=(",", ":"))[:1600])
        code = r["huntCode"].split(" (")[0]
        area, htype = (code.split("-") + [""])[:2]
        ids = [r["sourceId"]] + re.findall(r"d-wy-[a-z0-9-]+", r.get("note", "").split("Also from:")[-1] if "Also from:" in r.get("note", "") else "")
        for sid in ids:
            m = manifest[sources[sid]["url"]]
            txt = os.path.join(raw, m["file"][:-4] + ".txt")
            print(f" -- {sid}")
            for l in raw_block(txt, area, htype):
                print(l)


if __name__ == "__main__":
    main()
