#!/usr/bin/env python3
"""Cross-check 2026 first-draw quotas (computed from GFP Draw Results pools) against
the license availability tables printed in GFP's 2026 season application PDFs.

The expected values below were read from pdftotext -layout output of the PDFs
listed in draw-meta.json sources (d-sd-elk-2026, d-sd-sheep-2026,
d-sd-antelope-2026, d-sd-wrdeer-2026, d-sd-refugedeer-2026,
d-sd-springturkey-prairie-2026, d-sd-fallturkey-2026).

Usage:  python -I draw_crosscheck.py <repo_root>
"""
import json
import os
import sys

# (species file, huntCode, resident, nonresident or None, pdf)
EXPECTED = []


def add(sp, cat, pdf, rows):
    for code, res, nr in rows:
        EXPECTED.append((sp, f"{code} ({cat})", res, nr, pdf))


add("elk", "Black Hills Archery Elk", "2026elk", [("H1A21", 30, None), ("H1A23", 5, None), ("H2A21", 130, None), ("H2A23", 30, None),
    ("H3A21", 40, None), ("H3A23", 30, None), ("H4A21", 10, None), ("H4A23", 10, None), ("H5A21", 2, None), ("H7A21", 10, None), ("H7A23", 10, None)])
add("elk", "Prairie Elk", "2026elk", [("09A21", 10, None), ("09A23", 30, None), ("11B21", 32, None), ("11B23", 60, None), ("15A21", 8, None),
    ("15A23", 5, None), ("27A21", 30, None), ("27A23", 40, None), ("35A21", 10, None), ("35A23", 30, None), ("35B21", 10, None), ("35B23", 40, None),
    ("49A21", 10, None), ("49A23", 15, None), ("WRA21", 50, None), ("WRA23", 100, None)])
add("elk", "Black Hills Elk", "2026elk", [("H1A21", 80, None), ("H1B23", 75, None), ("H2A21", 400, None), ("H2B23", 75, None), ("H2C23", 75, None),
    ("H2E23", 25, None), ("H2F23", 10, None), ("H2G23", 10, None), ("H2H23", 5, None), ("H2I23", 5, None), ("H2J23", 5, None), ("H3A21", 120, None),
    ("H3B23", 45, None), ("H3C23", 45, None), ("H3D23", 45, None), ("H3E23", 60, None), ("H3F23", 60, None), ("H3G23", 60, None), ("H4A21", 40, None),
    ("H4B23", 40, None), ("H5A21", 5, None), ("H7A21", 20, None), ("H7B23", 50, None), ("H9A21", 15, None), ("H9B23", 40, None)])
add("elk", "Custer Antlerless Elk", "2026elk", [("CAE-CU1", 25, None), ("CAE-CU2", 25, None)])
add("elk", "Custer Early Archery Elk", "2026elk", [("CU121", 15, None)])
add("elk", "Custer Elk", "2026elk", [("CU121", 35, None)])
add("sheep", "Black Hills Bighorn Sheep", "2026bhsheep", [("BH252", 3, None), ("BH452", 2, None)])
add("sheep", "Custer Bighorn Sheep", "2026bhsheep", [("CU152", 2, None)])
add("pronghorn", "Prairie Antelope", "firearmsantelope", [("02A42", 50, 1), ("11A42", 20, 1), ("15A42", 50, 1), ("15B42", 250, 5), ("20A42", 60, 2),
    ("21A42", 125, 3), ("24A42", 50, 1), ("27A42", 350, 7), ("31A42", 25, 1), ("35A42", 150, 3), ("35B42", 150, 3), ("36A42", 5, 1), ("38A42", 5, 1),
    ("39A42", 50, 1), ("41A42", 5, 1), ("45A42", 5, 1), ("45B42", 5, 1), ("49A42", 150, 3), ("49B42", 50, 1), ("50A42", 20, 1), ("53A42", 75, 2),
    ("53B42", 200, 4), ("58A42", 20, 1), ("59A42", 5, 1), ("60A42", 5, 1), ("63A42", 5, 1), ("64A42", 100, 2)])
add("pronghorn", "Custer Antelope", "firearmsantelope", [("CU142", 5, None)])
add("whitetail", "West River Deer", "2026westriverdeer-app", [("02A13P", 50, 4), ("02A18", 200, 16), ("02C11", 25, 2), ("11A11", 50, 4),
    ("11B11", 50, 4), ("15A18", 600, 48), ("27L11", 10, 1), ("30A11", 450, 36), ("30A13P", 100, 8), ("30B11", 450, 36), ("30B13P", 100, 8),
    ("31A18", 100, 8), ("31A19", 150, 12)])
add("mule-deer", "West River Deer", "2026westriverdeer-app", [("02A01", 400, 32), ("02C02", 100, 8), ("11A02", 125, 10), ("11B02", 25, 2),
    ("15A01", 200, 16), ("27L02", 5, 1), ("31A01", 600, 48), ("31A03P", 100, 8), ("31A08", 75, 6)])
add("mule-deer", "Refuge Deer", "2026refugedeer-app", [("LC101", 10, 1), ("LC201", 10, 1), ("SL101", 20, 2), ("SL201", 20, 2), ("SL401", 20, 2),
    ("SL501", 20, 2), ("WA101", 10, 1), ("WA301", 10, 1)])
add("turkey", "Prairie Spring Turkey", "2026springturkey-prairie-app", [("01A32", 100, 0), ("02A32", 250, 20), ("06A32", 60, 0), ("07A32", 300, 0),
    ("08A32", 100, 0), ("08B32", 100, 0), ("10A32", 50, 0), ("11A32", 10, 1), ("12A32", 300, 0), ("13A32", 175, 0), ("15A32", 400, 32),
    ("16A32", 20, 0), ("17A32", 350, 0), ("19A32", 120, 0), ("20A32", 100, 8), ("21A32", 125, 10), ("22A32", 175, 0), ("23A32", 200, 0),
    ("24A32", 150, 12), ("50A32", 300, 24), ("52A32", 60, 0), ("53A35", 100, 8), ("56A32", 10, 0), ("58A32", 40, 4), ("58B32", 2, 1),
    ("60A32", 400, 32), ("61A32", 30, 0), ("62A32", 120, 0), ("65A32", 40, 4), ("67A32", 50, 4)])
add("turkey", "Prairie Fall Turkey", "fallturkey-app", [("01A31", 25, 0), ("02A31", 50, 4), ("06A31", 20, 0), ("07A31", 175, 0), ("08A31", 50, 0),
    ("10A31", 25, 0), ("12A31", 175, 0), ("13A31", 50, 0), ("15A37", 75, 6), ("17A31", 50, 0), ("21A31", 50, 4), ("24A31", 50, 4), ("29A31", 150, 0)])


def main():
    repo = sys.argv[1]
    ddir = os.path.join(repo, "src/data/agency/south-dakota/draw")
    data = {}
    for f in os.listdir(ddir):
        for r in json.load(open(os.path.join(ddir, f))):
            if r["year"] == 2026:
                data[(r["species"], r["huntCode"])] = r
    ok = bad = missing = 0
    for sp, hc, res, nr, pdf in EXPECTED:
        r = data.get((sp, hc))
        if r is None:
            print(f"MISSING  {hc} ({pdf})")
            missing += 1
            continue
        got_r = (r.get("resident") or {}).get("quota")
        got_n = (r.get("nonresident") or {}).get("quota")
        got_t = (r.get("total") or {}).get("quota")
        exp_t = res + (nr or 0)
        if (got_r is not None or got_n is not None) and "one group" not in (r.get("note") or ""):
            match = got_r == res and (nr in (None, 0) and got_n in (None, 0) or got_n == nr)
            detail = f"resident {got_r} vs {res}, nonresident {got_n} vs {nr}"
        else:
            match = got_t == exp_t
            detail = f"total {got_t} vs {exp_t}"
        if match:
            ok += 1
        else:
            bad += 1
            print(("WITHHELD " if got_t is None and got_r is None else "DIFF     ") + f"{hc}: {detail} ({pdf})")
    print(f"{ok} match, {bad} differ, {missing} missing of {len(EXPECTED)}")


if __name__ == "__main__":
    main()
