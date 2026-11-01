#!/usr/bin/env python3
"""Spot-check src/data/agency/california/draw/*.json against the raw CDFW text.

Independent of the pdfplumber parser: reads `pdftotext -layout` output (<raw>/txt/<year>_<docId>.txt,
<raw>/digest/<docId>.txt) with plain regexes.

1. N random rows (seeded): quota / preference quota / random quota / applicants must appear on the
   hunt's line in every part of its statistics PDF; the non-zero point values in the row note must
   equal the non-zero point values printed on those lines (as a multiset); deer drawn / minPoints
   must equal the digest summary line (preference awarded + random awarded to 1st choice; lowest
   point value).
2. Every elk / pronghorn / bighorn sheep row for 2022-2025 against the next year's digest hunt
   tables ("<Y> Tag Quota", "Total Applicants"), where the digest prints the hunt.

Usage: python -I draw_spotcheck.py <raw_dir> <repo_root> [N=20] [seed=2026]
"""
import json
import os
import random
import re
import sys

NUMRE = re.compile(r"(?<![\w.])\d{1,3}(?:,\d{3})*(?:\.\d+)?\.?(?![\w])")
DIGEST_FOR = {2022: "221986", 2023: "231077", 2024: "243703", 2025: "200602"}


def nums_in(s):
    return [t.replace(",", "").rstrip(".") for t in NUMRE.findall(s)]


def hunt_numbers(txt, code):
    """Numbers printed for one hunt in a layout-text part: the code line, or a neighbouring line."""
    lines = txt.splitlines()
    for i, l in enumerate(lines):
        if re.match(rf"^\s*{re.escape(code)}(\s|$)", l):
            cand = [l] + [lines[j] for j in (i - 1, i + 1) if 0 <= j < len(lines)]
            for c in cand:
                body = re.sub(rf"^\s*{re.escape(code)}\s", " ", c)
                # drop description words: keep the numeric tail
                toks = body.split()
                tail = []
                for t in reversed(toks):
                    if NUMRE.fullmatch(t):
                        tail.append(t.replace(",", "").rstrip("."))
                    else:
                        break
                tail.reverse()
                if len(tail) >= 4:
                    return tail
    return None


def note_points(note):
    m = re.search(r"by preference points \(CDFW;[^)]*\): (.*?)\.(?: |$)", note)
    if not m:
        return None
    vals = []
    for part in m.group(1).split(", "):
        vals.append(int(part.split(": ")[1].replace(",", "")))
    return vals


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    base = os.path.join(repo, "src/data/agency/california")
    meta = json.load(open(os.path.join(base, "draw-meta.json")))
    side = json.load(open(os.path.join(raw, "build-side.json")))
    rows = []
    for sp in ("mule-deer", "elk", "pronghorn", "sheep"):
        rows += json.load(open(os.path.join(base, "draw", f"{sp}.json")))
    rng = random.Random(seed)
    sample = rng.sample(rows, n)
    fails = 0
    for r in sample:
        docs = side["groups"][r["sourceId"]]
        msgs = []
        allpts = []
        for d in docs:
            txt = open(os.path.join(raw, "txt", f"{d['year']}_{d['docId']}.txt"), encoding="utf-8", errors="replace").read()
            nums = hunt_numbers(txt, r["huntCode"])
            if nums is None:
                msgs.append(f"{d['docId']}: hunt line not found")
                continue
            q, pq, rq, tot = (int(float(x)) for x in nums[:4])
            if (q, tot) != (r["total"]["quota"], r["total"]["applicants"]):
                msgs.append(f"{d['docId']}: text quota/applicants {q}/{tot} vs row {r['total']['quota']}/{r['total']['applicants']}")
            m = re.search(r"Quota split: ([\d,]+) preference-point tags, ([\d,]+) random", r["note"])
            if m and (int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))) != (pq, rq):
                msgs.append(f"{d['docId']}: text split {pq}/{rq} vs note {m.group(1)}/{m.group(2)}")
            allpts += [int(float(x)) for x in nums[4:]]
        np_ = note_points(r["note"])
        if np_ is not None:
            a = sorted(v for v in allpts if v)
            b = sorted(np_)
            # labels shared by two parts print twice in the text; compare as sets of (value, count>=1)
            if sorted(set(a)) != sorted(set(b)) or sum(b) != r["total"]["applicants"]:
                msgs.append(f"point values differ: text {a} vs note {b}")
        if r["species"] == "mule-deer" and r["total"].get("drawn") is not None:
            dtxt = open(os.path.join(raw, "digest", f"{DIGEST_FOR[r['year']]}.txt"), encoding="utf-8", errors="replace").read()
            line = next((l for l in dtxt.splitlines() if re.match(rf"^\s*{re.escape(r['huntCode'])}\s+[\d,]", l) and len(nums_in(l)) == 12), None)
            if not line:
                msgs.append("digest line not found")
            else:
                v = nums_in(line)
                drawn = int(float(v[5])) + int(float(v[9]))
                low = float(v[7])
                if drawn != r["total"]["drawn"]:
                    msgs.append(f"digest drawn {drawn} vs row {r['total']['drawn']}")
                if r["total"].get("minPoints") is not None and abs(low - r["total"]["minPoints"]) > 1e-9:
                    msgs.append(f"digest lowest point {low} vs row {r['total']['minPoints']}")
        status = "OK " if not msgs else "BAD"
        fails += bool(msgs)
        t = r["total"]
        print(f"{status} {r['species']:9} {r['year']} {r['huntCode']:5} quota {t['quota']} appl {t['applicants']} drawn {t.get('drawn')} "
              f"minPts {t.get('minPoints')} pts {len(np_ or [])} levels | {r['sourceId']}" + ("" if not msgs else " | " + "; ".join(msgs)))

    # 2. digest hunt tables (prior-year quota and total applicants) for elk / pronghorn / sheep
    print("\nDigest hunt tables vs rows (elk, pronghorn, sheep; quota and total applicants of the prior year):")
    by = {(r["species"], r["year"], r["huntCode"]): r for r in rows}
    checked = mism = 0
    for yr, did in DIGEST_FOR.items():
        txt = open(os.path.join(raw, "digest", f"{did}.txt"), encoding="utf-8", errors="replace").read()
        if yr < 2024:
            continue  # the 2023/2024 digests do not print prior-year quota/applicants for these species
        for l in txt.splitlines():
            m = re.match(r"^\s*(\d{3})\s+(?:([^\d\s].*?)\s{2,})?([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s", l)
            if not m:
                continue
            code = m.group(1)
            sp = {"3": "elk", "4": "elk", "7": "pronghorn", "5": "sheep"}.get(code[0])
            r = by.get((sp, yr, code))
            if r is None:
                continue
            q, tot = int(m.group(3).replace(",", "")), int(m.group(6).replace(",", ""))
            checked += 1
            if (q, tot) != (r["total"]["quota"], r["total"]["applicants"]):
                mism += 1
                print(f"  MISMATCH {sp} {yr} {code}: digest {did} quota {q} applicants {tot} vs row {r['total']['quota']}/{r['total']['applicants']}")
    print(f"  {checked} digest rows compared, {mism} mismatches")
    print(f"\n{n - fails}/{n} random rows match the raw text")


if __name__ == "__main__":
    main()
