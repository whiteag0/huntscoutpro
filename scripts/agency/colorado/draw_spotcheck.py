#!/usr/bin/env python3
"""Spot-check draw/<species>.json rows against the recap PDFs' `pdftotext -layout` text.

Usage: python -I scripts/agency/colorado/draw_spotcheck.py <raw_dir> <repo_root> [n=20] [seed=2026]

Independent of the bbox parser: for randomly chosen rows it finds the hunt block in the
layout text, reads the "Total Quota Amount", the first-choice "Total Choice 1" rows
(pre-draw applicants / post-draw successful), the adult "Drawn Out At" cells and every
point-level row, and compares them with the JSON. Prints the raw lines it used so a
person can confirm by eye.
"""
import json
import os
import random
import re
import sys

SRC2KEY = lambda s: s.replace("d-recap-", "")  # noqa: E731


def block_text(txt, code):
    lines = txt.split("\n")
    title = code  # float groups are space separated in the title line
    starts = [i for i, l in enumerate(lines) if re.fullmatch(r"\s*" + re.escape(title).replace(r"\ ", r"\s+") + r"\s*", l)]
    if not starts:
        return None
    s = starts[0]
    e = len(lines)
    for j in range(s + 1, len(lines)):
        if re.fullmatch(r"\s*([A-Z][A-Z][A-Z0-9]{3}[A-Z][0-9A-Z][A-Z]\s*)+", lines[j]) or re.fullmatch(r"\s*[A-Z][A-Z]99999P\s*", lines[j]):
            e = j
            break
    return lines[s:e]


def ints(toks):
    return [0 if t == "-" else int(t) for t in toks]


def check(rec, raw):
    key = SRC2KEY(rec["sourceId"])
    txt = open(os.path.join(raw, key + ".txt")).read()
    blk = block_text(txt, rec["huntCode"])
    out = {"row": f"{rec['species']} {rec['year']} {rec['huntCode']}", "source": key, "mismatches": [], "evidence": []}
    if blk is None:
        out["mismatches"].append("hunt block not found in layout text")
        return out
    weighted = any("Weighted" in l for l in blk)
    # Total quota amount: first number after the 'Amount' line in the left margin
    for i, l in enumerate(blk):
        if re.match(r"^\s*Amount\b", l):
            for l2 in blk[i + 1:i + 5]:
                m = re.match(r"^\s{0,12}(\d+)\b", l2)
                if m:
                    tq = int(m.group(1))
                    out["evidence"].append(l2.strip()[:60])
                    if tq != rec["total"].get("quota"):
                        out["mismatches"].append(f"total quota {tq} vs {rec['total'].get('quota')}")
                    break
            break
    # first-choice totals
    tc = [l for l in blk if re.match(r"^\s*Total Choice 1\s+\d", l) and l.count("Total Choice 1") == 2]
    if not tc:
        out["mismatches"].append("Total Choice 1 point-table row not found")
        return out
    parts = tc[0].split("Total Choice 1")
    pre, post = ints(parts[1].split()[:6]), ints(parts[2].split()[:6])
    out["evidence"].append("Total Choice 1: pre " + str(pre) + " post " + str(post))
    for nm, i in (("resident", 0), ("nonresident", 1)):
        if rec[nm].get("applicants") != pre[i]:
            out["mismatches"].append(f"{nm} applicants {rec[nm].get('applicants')} vs text {pre[i]}")
        if rec[nm].get("drawn") != post[i]:
            out["mismatches"].append(f"{nm} drawn {rec[nm].get('drawn')} vs text {post[i]}")
    if rec["total"].get("drawn") != sum(post[:4]):
        out["mismatches"].append(f"total drawn {rec['total'].get('drawn')} vs text {sum(post[:4])}")
    mini = [l for l in blk if re.search(r"Total Choice 1\s+\d+\s+\d+\s*$", l) and l.count("Total Choice 1") == 1]
    if mini:
        ga = int(re.search(r"Total Choice 1\s+(\d+)\s+(\d+)\s*$", mini[0]).group(1))
        if ga != rec["total"].get("applicants"):
            out["mismatches"].append(f"total applicants {rec['total'].get('applicants')} vs text {ga}")
        out["evidence"].append("General apps choice 1: " + str(ga))
    # Drawn Out At (adult): numeric "N Pref" tokens on the 3 lines around the label
    for i, l in enumerate(blk):
        if "Drawn Out At" in l:
            ctx = " ".join(blk[max(0, i - 2):i + 1])
            prefs = re.findall(r"(\d+)\+? Pref", ctx)
            out["evidence"].append("Drawn Out At ctx: " + re.sub(r"\s+", " ", ctx)[:120])
            exp = [rec["resident"].get("minPoints"), rec["nonresident"].get("minPoints")]
            got = [int(p) for p in prefs[:2]]
            if rec["species"] != "sheep" or not rec["huntCode"].startswith("C"):
                for e in exp:
                    if e is not None and e not in got:
                        out["mismatches"].append(f"minPoints {e} not among Drawn Out At values {got}")
            break
    # point rows
    rows = {}
    start = next((i for i, l in enumerate(blk) if "Pre-Draw Applicants" in l), None)
    for l in blk[(start or 0) + 1:]:
        if l.count("Total Choice 1") == 2:
            break
        toks = l.split()
        if not toks or not all(re.fullmatch(r"\d+|-", t) for t in toks):
            continue
        width = 8 if weighted else 7
        if len(toks) == 2 * width + 2:
            toks = toks[1:width + 1] + toks[width + 2:]
        elif len(toks) == 2 * width + 1:
            out["mismatches"].append("ambiguous point line (one choice label): " + l.strip()[:80])
            continue
        if len(toks) != 2 * width:
            continue
        v = ints(toks)
        p = v[0] + (v[1] if weighted else 0)
        k = 2 if weighted else 1
        rows[p] = {"ra": v[k], "na": v[k + 1], "rd": v[width + k], "nd": v[width + k + 1]}
    if not (rec["species"] == "sheep" and rec["huntCode"].startswith("C")):
        js = {r["points"]: r for r in rec.get("byPoints", [])}
        for p, v in rows.items():
            j = js.get(p, {})
            ja = (j.get("resident") or {}).get("applicants", 0), (j.get("nonresident") or {}).get("applicants", 0)
            jd = (j.get("resident") or {}).get("drawn", 0), (j.get("nonresident") or {}).get("drawn", 0)
            if (v["ra"], v["na"]) != ja or (v["rd"], v["nd"]) != jd:
                out["mismatches"].append(f"points {p}: text apps {v['ra']},{v['na']} drawn {v['rd']},{v['nd']} vs json {ja} {jd}")
        extra = set(js) - set(rows)
        if extra:
            out["mismatches"].append(f"json point levels not in text: {sorted(extra)}")
        out["evidence"].append(f"{len(rows)} point rows compared")
    return out


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    rnd = random.Random(seed)
    d = os.path.join(repo, "src/data/agency/colorado/draw")
    allrows = []
    for f in sorted(os.listdir(d)):
        allrows += [r for r in json.load(open(os.path.join(d, f)))]
    # stratify: at least one row per species file, rest random
    picks = []
    by_sp = {}
    for r in allrows:
        by_sp.setdefault(r["species"], []).append(r)
    for sp, rs in sorted(by_sp.items()):
        picks.append(rnd.choice(rs))
    while len(picks) < n:
        picks.append(rnd.choice(allrows))
    bad = 0
    for r in picks:
        res = check(r, raw)
        ok = not res["mismatches"]
        bad += 0 if ok else 1
        print(("OK   " if ok else "FAIL ") + res["row"], "|", res["source"])
        print("     res", r["resident"], "| non", r["nonresident"], "| total", r["total"])
        for e in res["evidence"]:
            print("     ", e)
        for m in res["mismatches"]:
            print("     !!", m)
    print(f"{len(picks)} rows checked, {bad} with mismatches")


if __name__ == "__main__":
    main()
