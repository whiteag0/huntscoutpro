#!/usr/bin/env python3
"""Cross-check parsed Nevada draw quotas against NDOW's published hunt totals.

Usage: python -I scripts/agency/nevada/draw_crosscheck.py <raw_dir> <repo_root>

For each draw year and hunt number, compares
  (a) the "Total"/"TOTAL" line NDOW prints under each hunt table in the commission quota regulation
      (CR 22-11, CR 23-14, CR 24-12, CR 25-13; NR guided hunt 1235 from its own regulation),
  (b) the sum of quotas in our bonus-point-report records (choice "first") plus hunt-data
      fallback records (choice "all"),
and prints every difference. Differences are expected where NDOW changed a quota after the
regulation (e.g. the bonus point report's quota is the main-draw quota) or a hunt table total
includes hunts not in the main draw; they are reported, not "fixed".
"""
import json
import os
import re
import sys
from collections import defaultdict

CR = {
    2022: ["CR-22-11-2022-2023-Big-Game-Quotas-Updated.txt", "CR-21-06-2021-22-and-2022-23-NR-Guided-Seasons-and-Quotas-ADA-FINAL1.txt"],
    2023: ["2023-Big-Game-Quotas-CR-23-14-Approved-ADA-2.txt", "CR-23-07-FINAL-2023-24-NR-Guided-Seasons-and-Quotas.txt"],
    2024: ["2024-CR-24-12-BIG-GAME-QUOTAS-COMMISSION-APPROVED-FINAL.txt", "CR-24-09-2024-25-NR-Guided-Seasons-and-Quotas-FINAL.txt"],
    2025: ["CR25-13-2025-Big-Game-Quotas-NBWC-Approved-May-2025-FINAL.txt", "CR-25-10-2025-2026-Restricted-Nonresident-Guided-Mule-Deer-Seasons-Quotas-FINAL.txt"],
}
FIX_2023 = {("Archery", "1331"): "1341", ("Archery", "1332"): "1342",
            ("Muzzleloader", "1331"): "1371", ("Muzzleloader", "1332"): "1372"}


def cr_totals(text, year):
    out = {}
    cur = None
    for line in text.splitlines():
        m = re.search(r"Hunt (?:Resident )?(\d{4,5})\b", line)
        if not m:
            m2 = re.search(r"Archery or Muzzleloader (1105)\b", line)
            m = m2
        if m:
            no = m.group(1)
            if year == 2023:
                for (w, printed), real in FIX_2023.items():
                    if printed == no and w in line:
                        no = real
            cur = no
            continue
        t = re.search(r"\b(?:Total|TOTAL)\s+([\d,]+)\s*$", line)
        if t and cur:
            out.setdefault(cur, int(t.group(1).replace(",", "")))
            cur = None
    return out


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    sums = defaultdict(int)
    d = os.path.join(repo, "src/data/agency/nevada/draw")
    for f in os.listdir(d):
        for r in json.load(open(os.path.join(d, f))):
            st = r.get("resident") or r.get("nonresident")
            no = r["huntCode"].split()[0]
            if st and st.get("quota") is not None:
                sums[(r["year"], no)] += st["quota"]
    n_ok = n_diff = 0
    for y, files in CR.items():
        tot = {}
        for fn in files:
            tot.update(cr_totals(open(os.path.join(raw, "cr", fn)).read(), y))
        for no in sorted(set(tot) | {k[1] for k in sums if k[0] == y}, key=int):
            a, b = tot.get(no), sums.get((y, no))
            if a == b:
                n_ok += 1
            else:
                n_diff += 1
                print(f"{y} hunt {no}: regulation total {a} vs our sum {b}" + (f" (diff {b - a:+d})" if a is not None and b is not None else ""))
    print(f"{n_ok} hunt totals equal, {n_diff} differ")


if __name__ == "__main__":
    main()
