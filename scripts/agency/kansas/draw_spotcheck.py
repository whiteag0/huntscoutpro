#!/usr/bin/env python3
"""Print random parsed draw rows next to the raw source text they came from, for manual re-reading.

Usage:
  python -I scripts/agency/kansas/draw_spotcheck.py <raw_dir> <repo_root> [n=18] [seed=20261031]
"""
import json
import os
import random
import re
import subprocess
import sys

RAW, REPO = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 18
SEED = int(sys.argv[4]) if len(sys.argv) > 4 else 20261031
WB = os.path.join(RAW, "wayback")

DOC = {
    "d-ks-deer-quotas-draw-stats-page": os.path.join(RAW, "deer-quotas-and-draw-statistics.txt"),
    "d-ks-nr-deer-draw-report-2025": os.path.join(WB, "nr-deer-20260122.pdf"),
    "d-ks-nr-deer-draw-report-2024": os.path.join(WB, "nr-deer-20241105.pdf"),
    "d-ks-res-deer-draw-report-2025": os.path.join(WB, "res-deer-20260122.pdf"),
    "d-ks-res-deer-draw-report-2024": os.path.join(WB, "res-deer-20250522.pdf"),
    "d-ks-deer-quotas-page-2022": os.path.join(WB, "dq-20221206180810.html"),
    "d-ks-deer-quotas-page-2023": os.path.join(WB, "dq-20230721164947.html"),
    "d-ks-antelope-page": os.path.join(RAW, "antelope-page-stats.txt"),
    "d-ks-antelope-draw-stats-2022": os.path.join(WB, "ant-2022.pdf"),
    "d-ks-antelope-draw-stats-2023": os.path.join(WB, "ant-2023.pdf"),
    "d-ks-antelope-draw-stats-2024": os.path.join(WB, "ant-2024.pdf"),
    "d-ks-turkey-page": os.path.join(RAW, "turkey-page-stats.txt"),
    "d-ks-turkey-unit4-draw-stats-2023": os.path.join(WB, "tky4-2023.pdf"),
    "d-ks-turkey-unit4-draw-stats-2024": os.path.join(WB, "tky4-2024.pdf"),
    "d-ks-turkey-unit4-draw-stats-2025": os.path.join(RAW, "turkey-2025-unit4-draw-stats.pdftext"),
    "d-ks-turkey-nr-draw-stats-2024": os.path.join(WB, "tkynr-2024.pdf"),
    "d-ks-turkey-nr-draw-stats-2025": os.path.join(RAW, "turkey-2025-nr-draw-stats.pdftext"),
}


def text(path):
    if path.endswith(".pdf"):
        return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout
    if path.endswith(".html"):
        from bs4 import BeautifulSoup
        s = BeautifulSoup(open(path, encoding="utf-8", errors="replace").read(), "lxml")
        return " | ".join(t.strip() for t in s.get_text("\n").split("\n") if t.strip())
    return open(path, encoding="utf-8").read()


rows = []
for sp in ("whitetail", "mule-deer", "pronghorn", "turkey"):
    for r in json.load(open(os.path.join(REPO, f"src/data/agency/kansas/draw/{sp}.json"))):
        rows.append(r)
random.seed(SEED)
# stratify: at least 3 per species, rest random
pick = []
for sp in ("whitetail", "mule-deer", "pronghorn", "turkey"):
    pick += random.sample([r for r in rows if r["species"] == sp], 3)
pick += random.sample([r for r in rows if r not in pick], max(0, N - len(pick)))

for i, r in enumerate(pick, 1):
    st = {k: r[k] for k in ("resident", "nonresident", "total") if k in r}
    print(f"\n#{i} {r['species']} {r['year']} {r['huntCode']} [{r['sourceId']}]")
    print("   parsed:", json.dumps(st))
    print("   note:", r.get("note", "")[:400])
    t = text(DOC[r["sourceId"]])
    if DOC[r["sourceId"]].endswith(".html"):
        u = r["units"][0]
        m = re.search(rf"UNIT {u} \| [A-Z ]+ \| \d+ \| \d+", t) if "Unit" in r["huntCode"] or "Stamp" in r["huntCode"] else None
        idx = [mm.start() for mm in re.finditer(rf"\| (UNIT {u}|WMD|EMD) \|", t)]
        for k in idx:
            print("   raw:", t[k:k + 70])
        continue
    key = r["huntCode"].split(" (")[0]
    key = re.escape(key).replace(r"\ ", r"\s*")
    lines = t.split("\n")
    for j, ln in enumerate(lines):
        if re.search(rf"{key}(\D|$)", ln, re.I) or (r["species"] == "pronghorn" and re.search(rf"Unit\s+{r['units'][0]}\s+{r.get('methodLabel','')}", ln)):
            for ln2 in lines[j:j + 9]:
                print("   raw:", ln2.rstrip()[:170])
            print("   ...")
            break
    else:
        print("   raw: (label not found by grep; read the source document)")
