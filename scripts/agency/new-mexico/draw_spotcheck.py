#!/usr/bin/env python3
"""Spot-check NM draw JSON against the raw reports. Usage: draw_spotcheck.py <raw_dir> <repo_root> [n] [seed]
Prints, for random (species, year, hunt) picks, the raw report row labelled with its header cells
(read independently with pandas) or the raw pdftotext line, next to the JSON first/all rows."""
import json, os, random, subprocess, sys
import pandas as pd

raw, repo = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 16
random.seed(int(sys.argv[4]) if len(sys.argv) > 4 else 20261031)
d = os.path.join(repo, "src/data/agency/new-mexico/draw")
SRCFILE = {f"d-nm-odds-{y}": f"{y}-complete.xlsx" for y in range(2022, 2027)}
SRCFILE.update({f"d-nm-bt-{y}": f"{y}-bear-turkey.xlsx" for y in (2022, 2024, 2025, 2026)})
SRCFILE["d-nm-bt-2023"] = "2023-bear-turkey.pdf"
picks = []
for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "turkey"]:
    rows = json.load(open(os.path.join(d, sp + ".json")))
    keys = sorted({(r["year"], r["huntCode"]) for r in rows})
    k = 4 if sp in ("elk", "mule-deer") else 2
    for key in random.sample(keys, k):
        picks.append((sp, key, [r for r in rows if (r["year"], r["huntCode"]) == key]))
for sp, (y, hc), rs in picks[:max(n, len(picks))]:
    f = SRCFILE[rs[0]["sourceId"]]
    print("=" * 100); print(sp, y, hc, f)
    if f.endswith(".pdf"):
        txt = subprocess.run(["pdftotext", "-layout", os.path.join(raw, f), "-"], capture_output=True, text=True).stdout
        print([ln for ln in txt.splitlines() if ln.startswith(hc)][0])
    else:
        df = pd.read_excel(os.path.join(raw, f), header=None, dtype=object)
        idx = df.index[df[0].astype(str).str.strip() == hc][0]
        # nearest header rows above: the "Hunt"/"Hunt Code" row and the group row above it
        h = max(i for i in df.index[:idx] if str(df.iat[i, 0]).strip() in ("Hunt", "Hunt Code"))
        grp, sub, row = df.iloc[h - 1].tolist(), df.iloc[h].tolist(), df.iloc[idx].tolist()
        g = ""
        out = []
        for j, v in enumerate(row):
            if isinstance(grp[j], str) and grp[j].strip():
                g = grp[j].strip()
            if v is None or (isinstance(v, float) and pd.isna(v)):
                continue
            out.append(f"{j}:{g}/{sub[j]}={v}")
        print(" | ".join(out))
    for r in rs:
        print(" JSON", r["choice"], "R", r["resident"], "NR", r["nonresident"], "T", r["total"])
        print("      note:", r["note"][:300], "| units", r["units"], "| desc", r["description"][:70])
