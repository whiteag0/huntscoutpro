#!/usr/bin/env python3
"""Print random Kansas harvest rows next to the raw pdftotext lines they came from.

Usage:
  python -I scripts/agency/kansas/harvest_spotcheck.py <raw_dir> <repo_root> [n] [seed]
For each sampled row the script shows the JSON values and the matching raw-text
line(s) so a person can confirm every field by eye.
"""
import json
import os
import random
import re
import sys

SRC_FILE = {
    "h-kdwp-deer-2020-21": "deer_2020-21_report", "h-kdwp-deer-2021-22": "deer_2021-22_report",
    "h-kdwp-deer-2022-23": "deer_2022-23_table", "h-kdwp-deer-2023-24": "deer_2023-24_table",
    "h-kdwp-elk-2020-21": "elk_2020-21", "h-kdwp-elk-2021-22": "elk_2021-22", "h-kdwp-elk-2022-23": "elk_2022-23",
    "h-kdwp-elk-2023-24": "elk_2023-24", "h-kdwp-elk-2024-25": "elk_2024-25",
    "h-kdwp-turkey-2024": "turkey_spring_2024", "h-kdwp-turkey-2025": "turkey_spring_2025", "h-kdwp-turkey-2026": "turkey_spring_2026",
}
for y in range(2020, 2025):
    SRC_FILE[f"h-kdwp-pronghorn-{y}"] = f"pronghorn_{y}"


def raw_context(raw, row):
    with open(os.path.join(raw, SRC_FILE[row["sourceId"]] + ".txt"), encoding="utf-8") as f:
        text = f.read()
    lines = text.splitlines()
    sp, unit = row["species"], row["unit"]
    if sp in ("whitetail", "mule-deer"):
        if unit == "Statewide":
            start = next(i for i, l in enumerate(lines) if "state-wide deer harvest by species" in l)
        else:
            start = next(i for i, l in enumerate(lines) if re.match(r"^\s*Deer Management Unit %sa?\s*$" % unit, l))
        label = row["methodLabel"]
        if label == "All permit types":
            label = {"all": "Total", "resident": "Resident", "nonresident": "Nonresident"}[row["residency"]]
        first = label.split(" ")[0]
        block = lines[start:start + 80]
        hits = []
        for j, l in enumerate(block):
            if l.strip().startswith(label) or (first and l.strip().startswith(first) and len(label) > 18):
                hits.append("\n".join(block[max(0, j - 1): j + 3]))
        return f"[{lines[start].strip()}]\n" + "\n---\n".join(hits[:4])
    keys = [str(row.get(k)) for k in ("harvest", "hunters", "successPct", "licenses") if row.get(k) is not None]
    out = []
    for i, l in enumerate(lines):
        if any(re.search(r"(?<![\d.])%s(?![\d])" % re.escape(k.replace(".0", "")), l.replace(",", "")) for k in keys[:1]):
            out.append(l.rstrip())
    return "\n".join(out[:8])


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    rnd = random.Random(seed)
    d = os.path.join(repo, "src/data/agency/kansas/harvest")
    rows = []
    for f in sorted(os.listdir(d)):
        rows += json.load(open(os.path.join(d, f)))
    by_sp = {}
    for r in rows:
        by_sp.setdefault(r["species"], []).append(r)
    picks = []
    quota = {"whitetail": 5, "mule-deer": 4, "elk": 3, "pronghorn": 2, "turkey": 3}
    for sp, k in quota.items():
        picks += rnd.sample(by_sp[sp], min(k, len(by_sp[sp])))
    for i, r in enumerate(picks[:max(n, len(picks))], 1):
        show = {k: v for k, v in r.items() if k not in ("note",)}
        print(f"#{i} {json.dumps(show)}")
        print("   note:", r.get("note", "")[:260])
        print("   RAW:\n      " + raw_context(raw, r).replace("\n", "\n      "))
        print()


if __name__ == "__main__":
    main()
