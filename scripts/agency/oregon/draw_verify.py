#!/usr/bin/env python3
"""Verify parsed ODFW draw JSON against the raw agency documents.

Checks:
 1. Internal arithmetic of every point-report hunt (point classes sum to totals,
    resident + nonresident = total, drawn <= tags).
 2. Cross-document: first-choice applicants in the Preference Point Draw Report vs the
    "1st Choice" column of the Applicants by Hunt Choice report for the same year/series.
 3. Cross-document: tags vs the same-year regulations booklet, and first-choice applicants vs
    the next-year booklet's "previous year 1st choice applicants" column.
 4. Report totals: the "Total" line printed at the end of each Applicants by Hunt Choice PDF
    vs the sum of the per-hunt totals in its XLSX.
 5. Random spot checks (seeded): re-read rows in the pdftotext output of the PDF version
    and compare every number.

Usage: python -I draw_verify.py <raw_dir> <json_dir> [n_spot]
"""
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_parse as P  # noqa: E402

raw, jdir = sys.argv[1], sys.argv[2]
NSPOT = int(sys.argv[3]) if len(sys.argv) > 3 else 20
problems = []


def bad(msg):
    problems.append(msg)


# ---------------- 1 + 2 + 3
regs_lines = {y: P.parse_regs_hunt_lines(os.path.join(raw, f"regs_{y}.txt")) for y in P.REGS_YEARS}
stats = {"tags_match": 0, "tags_mismatch": 0, "prev_match": 0, "prev_mismatch": 0, "choice_match": 0, "choice_mismatch": 0}
mismatch_examples = []
for series in P.POINT_SERIES:
    for y in P.YEARS:
        hunts = P.parse_points(os.path.join(raw, f"{y}_{series}_points.xlsx"))
        choice_path = os.path.join(raw, f"{y}_{series}_choice.xlsx")
        try:
            ch = P.parse_choice(choice_path)
        except StopIteration:
            ch = None  # 2022 spring bear "choice" file is a Tag Status report
        for h in hunts:
            pts = h["pts"]
            at = f"{y} {series} {h['code']}"
            if pts:
                if sum(p[2] or 0 for p in pts) != h["ra"]:
                    bad(f"{at}: point-class resident apps {sum(p[2] or 0 for p in pts)} != {h['ra']}")
                if sum(p[4] or 0 for p in pts) != h["na"]:
                    bad(f"{at}: point-class NR apps {sum(p[4] or 0 for p in pts)} != {h['na']}")
                if any((p[1] or 0) != (p[2] or 0) + (p[4] or 0) for p in pts):
                    bad(f"{at}: point-class applicants != res + NR")
                if sum((p[3] or 0) + (p[5] or 0) for p in pts) > h["td"]:
                    bad(f"{at}: phase-1 drawn exceeds total drawn")
            if h["ta"] != (h["ra"] or 0) + (h["na"] or 0):
                bad(f"{at}: total apps {h['ta']} != {h['ra']}+{h['na']}")
            if h["td"] != (h["rd"] or 0) + (h["nd"] or 0):
                bad(f"{at}: total drawn {h['td']} != {h['rd']}+{h['nd']}")
            if h["tags"] is not None and h["td"] > h["tags"]:
                bad(f"{at}: drawn {h['td']} > tags {h['tags']}")
            if ch is not None:
                if h["code"] in ch:
                    if ch[h["code"]] == h["ta"]:
                        stats["choice_match"] += 1
                    else:
                        stats["choice_mismatch"] += 1
                        mismatch_examples.append(f"choice {at}: points-report apps {h['ta']} vs choice-report 1st {ch[h['code']]}")
            rl = regs_lines.get(y, {}).get(h["code"])
            if rl:
                if rl["tags"] == h["tags"]:
                    stats["tags_match"] += 1
                else:
                    stats["tags_mismatch"] += 1
                    mismatch_examples.append(f"tags {at}: report {h['tags']} vs regs {rl['tags']}")
            rn = regs_lines.get(y + 1, {}).get(h["code"])
            if rn and isinstance(rn["prevApps"], int):
                if rn["prevApps"] == h["ta"]:
                    stats["prev_match"] += 1
                else:
                    stats["prev_mismatch"] += 1
                    mismatch_examples.append(f"prev {at}: report apps {h['ta']} vs {y + 1} regs prev-year {rn['prevApps']}")

# ---------------- 4 choice report totals
tot_checks = []
for f in sorted(os.listdir(raw)):
    if not f.endswith("_choice.txt"):
        continue
    txt = open(os.path.join(raw, f), encoding="utf-8", errors="replace").read()
    m = re.search(r"^\s*Total\s+([\d,]+)\s*$", txt, re.M)
    try:
        import openpyxl
        wb = openpyxl.load_workbook(os.path.join(raw, f.replace(".txt", ".xlsx")), read_only=True, data_only=True)
        xp = os.path.join(raw, f.replace(".txt", ".xlsx"))
        rows = list(wb.worksheets[0].iter_rows(values_only=True)) if wb.worksheets else P._raw_sheet_rows(xp)
        h = next(i for i, r in enumerate(rows) if r and P.code_str(r[0]) == "Hunt Number")
        hdr = [str(c).strip() if c else "" for c in rows[h]]
        ti = hdr.index("Total")
        s = sum(P.num(r[ti]) or 0 for r in rows[h + 1:] if r and P.code_str(r[0]) and re.fullmatch(r"[A-Z0-9][A-Z0-9-]*", P.code_str(r[0])))
    except (StopIteration, ValueError):
        continue
    if m:
        pub = P.num(m.group(1))
        tot_checks.append((f, pub, s, pub == s))

# ---------------- 5 spot checks against PDF text
NUM = re.compile(r"(?<![\w.])\d+(?![\w.])")
SIX = re.compile(r"^(\D*?)(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$")


def pdf_point_stream(lines, heads):
    """Point-class rows in document order: [(line_no, (pts, apps, rapps, rdrawn, napps, ndrawn))].
    heads: {code: [tags, ra, rd, na, nd, ta, td]} used only to skip the head numbers on head lines."""
    out = []
    head_at = {}
    for i, L in enumerate(lines):
        m = re.match(r"^\s*([A-Z0-9][A-Z0-9-]*)\s", L)
        code = m.group(1) if m else None
        if code in heads:
            nums = [int(x) for x in NUM.findall(L[m.end():].replace(",", ""))]
            w = heads[code]
            k = next((j for j in range(len(nums)) if nums[j:j + 7] == w), None)
            if k is not None:
                head_at[code] = i
                rest = nums[k + 7:]
                if len(rest) == 9:  # totalPoints, P1, P2 + one point row
                    out.append((i, tuple(rest[3:])))
                continue
        mm = SIX.match(L)
        if mm and not re.search(r"\d", mm.group(1)) and len(mm.group(1)) > 60:
            out.append((i, tuple(int(v) for v in mm.groups()[1:])))
    return out, head_at


rnd = random.Random(20261031)
spots = []
files = {sp: json.load(open(os.path.join(jdir, f"{sp}.json"))) for sp in ("elk", "mule-deer", "whitetail", "pronghorn", "bear", "sheep", "goat")}
pool = [(sp, r) for sp, rows in files.items() for r in rows]
picked = [rnd.choice([x for x in pool if x[0] == sp]) for sp in files]  # one per species
while len(picked) < NSPOT:
    x = rnd.choice(pool)
    if x not in picked:
        picked.append(x)
cache = {}
for sp, r in picked:
    m = re.match(r"d-or-(\d{4})-(\w+)-(points|choice)$", r["sourceId"])
    y, series, kind = int(m.group(1)), m.group(2), m.group(3)
    lines = open(os.path.join(raw, f"{y}_{series}_{kind}.txt"), encoding="utf-8", errors="replace").read().split("\n")
    code = r["huntCode"]
    if kind == "points":
        key = (y, series)
        if key not in cache:
            hs = P.parse_points(os.path.join(raw, f"{y}_{series}_points.xlsx"))
            heads = {h["code"]: [h["tags"], h["ra"], h["rd"], h["na"], h["nd"], h["ta"], h["td"]] for h in hs}
            cache[key] = pdf_point_stream(lines, heads)
        stream, head_at = cache[key]
        want = [r["total"]["quota"], r["resident"]["applicants"], r["resident"]["drawn"], r["nonresident"]["applicants"],
                r["nonresident"]["drawn"], r["total"]["applicants"], r["total"]["drawn"]]
        # head check straight from the PDF line(s): the 7 values must appear in order on the hunt's line
        hl = next((i for i, L in enumerate(lines) if re.match(rf"^\s*{re.escape(code)}\s", L)), None)
        if hl is None:
            spots.append((sp, y, code, "NOT FOUND in PDF text")); continue
        nums = [int(x) for x in NUM.findall(" ".join(lines[hl:hl + 2]).split(code, 1)[1].replace(",", ""))]
        ok_head = any(all(w is None or w == v for w, v in zip(want, nums[i:i + 7])) and len(nums[i:i + 7]) == 7 for i in range(len(nums)))
        want_pts = sorted((p["points"], (p["resident"] or {}).get("applicants", 0) + (p["nonresident"] or {}).get("applicants", 0),
                           (p["resident"] or {}).get("applicants"), (p["resident"] or {}).get("drawn"),
                           (p["nonresident"] or {}).get("applicants"), (p["nonresident"] or {}).get("drawn")) for p in r.get("byPoints", []))
        n = len(want_pts)
        ok_pts = n == 0
        for s0 in range(len(stream) - n + 1):
            win = stream[s0:s0 + n]
            if sorted(t for _, t in win) == want_pts and win[0][0] - 12 <= hl <= win[-1][0] + 1:
                ok_pts = True
                break
        spots.append((sp, y, code, f"head {want} {'OK' if ok_head else 'MISMATCH pdf=' + str(nums[:20])}; "
                      f"{n} point rows {'OK' if ok_pts else 'MISMATCH json=' + str(want_pts)[:160]}"))
    else:
        hl = next((L for L in lines if re.match(rf"^\s*{re.escape(code)}\s", L)), None)
        nums = [int(x) for x in NUM.findall(hl.split(code, 1)[1].replace(",", ""))] if hl else []
        ok = nums[:1] == [r["total"]["applicants"]]
        spots.append((sp, y, code, f"1st choice {r['total']['applicants']} {'OK' if ok else 'MISMATCH pdf=' + str(nums[:3])}"))

print("== internal arithmetic problems:", len(problems))
for p in problems[:40]:
    print("  ", p)
print("== cross-document:", stats)
for e in mismatch_examples[:40]:
    print("  ", e)
print("== choice-report published totals vs sum of hunts:")
for t in tot_checks:
    print("  ", t)
print(f"== spot checks ({len(spots)}):")
for s in spots:
    print("  ", s)
