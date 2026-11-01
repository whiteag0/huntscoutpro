#!/usr/bin/env python3
"""Spot-check Colorado season dates and key dates against the raw CPW text, by other means than the parser.

Usage:
  python -I scripts/agency/colorado/seasons_spotcheck.py <raw_dir> <repo_root> [--n 60] [--seed 2026]

1. Cross-check every 2026 draw row dated from the Chapter W-2/W-3 tables against the brochure hunt
   tables (seasons_brochure.py output, a different document read by a different method). Prints
   agreements, disagreements (to be resolved by reading both documents) and rows the brochure does
   not date.
2. Random sample of --n filled rows: looks for each hunt code in the poppler `pdftotext -layout`
   text of its source (not the pdfplumber grid the parser used) and checks that each date of the row,
   written the way that document prints it, appears near the code. Prints the source lines for reading.
3. Every key date and season in draw-meta.json: checks the date, written as the source prints it,
   appears in the source document's text.
"""
import datetime as dt
import json
import os
import random
import re
import sys

MON_BRO = {1: "Jan.", 2: "Feb.", 3: "March", 4: "April", 5: "May", 6: "June", 7: "July", 8: "Aug.", 9: "Sept.", 10: "Oct.", 11: "Nov.", 12: "Dec."}
TXT = {"d-regs-w2-2026": "chw02.txt", "d-regs-w3-2026": "ch03.txt", "d-brochure-biggame-2026": "bg-brochure.txt",
       "d-brochure-sheepgoat-2026": "sg-brochure.txt", "d-brochure-turkey-2026": "turkey-brochure.txt",
       "d-brochure-lion-2026": "lion-brochure.txt", "d-bgss-2025-2029": "bgss2025-2029.txt"}


def d(iso):
    return dt.date.fromisoformat(iso)


def reg_forms(g):
    """How the regulations print a range: 10/14/2026 - 10/18/2026, 10/14 - 10/18 (annually), 9/2 ..."""
    a, b = d(g["start"]), d(g["end"])
    out = []
    for fa in (f"{a.month:02d}/{a.day:02d}/{a.year}", f"{a.month:02d}/{a.day:02d}", f"{a.month}/{a.day}", f"{a.month:02d}/{a.day:02d}{a.year}"):
        for fb in (f"{b.month:02d}/{b.day:02d}/{b.year}", f"{b.month:02d}/{b.day:02d}", f"{b.month}/{b.day}", f"{b.month:02d}/{b.day:02d}{b.year}"):
            out.append((fa, fb))
    return out


def bro_form(g):
    a, b = d(g["start"]), d(g["end"])
    if a.month == b.month:
        return f"{MON_BRO[a.month]} {a.day}–{b.day}"
    return f"{MON_BRO[a.month]} {a.day}–{MON_BRO[b.month]} {b.day}"


def squash(s):
    return re.sub(r"\s+", " ", s.replace("–", "–").replace("—", "–"))


def found_reg(g, text):
    t = re.sub(r"\s+", "", text.replace("–", "-").replace("—", "-"))
    for fa, fb in reg_forms(g):
        if re.search(re.escape(fa) + r"/?-+" + re.escape(fb), t):
            return True
    return False


def found_bro(g, text):
    t = squash(text).replace(" –", "–").replace("– ", "–")
    f = bro_form(g)
    return f in t or f.replace("Sept.", "Sep.") in t


def dashed(code):
    return f"{code[0]}-{code[1]}-{code[2:5]}-{code[5:7]}-{code[7]}"


def window(lines, idx, k):
    return "\n".join(lines[max(0, idx - k): idx + k + 1])


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 60
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 2026
    texts = {k: open(os.path.join(raw, v)).read() for k, v in TXT.items() if os.path.exists(os.path.join(raw, v))}
    bro = {}
    for f in ("bg-brochure-hunts.json", "sg-brochure-hunts.json", "turkey-brochure-hunts.json"):
        if os.path.exists(os.path.join(raw, f)):
            bro.update(json.load(open(os.path.join(raw, f))))
    ddir = os.path.join(repo, "src/data/agency/colorado/draw")
    rows = []
    for f in sorted(os.listdir(ddir)):
        for r in json.load(open(os.path.join(ddir, f))):
            if r.get("seasonRanges"):
                rows.append(r)
    parsed = json.load(open(os.path.join(raw, "seasons_parsed.json")))

    # 1. regulation vs brochure, per hunt code
    agree, disagree, nobro = 0, [], 0
    for r in rows:
        if not r["seasonSourceId"].startswith("d-regs"):
            continue
        for code in r["huntCode"].split():
            reg = parsed[code]["ranges"]
            b = bro.get(code)
            if not b or not b["ranges"]:
                nobro += 1
                continue
            if sorted((g["start"], g["end"]) for g in reg) == sorted((g["start"], g["end"]) for g in b["ranges"]):
                agree += 1
            else:
                disagree.append((code, parsed[code]["text"], b["dates"], parsed[code].get("how"), parsed[code].get("page"), b["pages"]))
    print(f"1. regulation vs brochure: {agree} hunt codes agree, {len(disagree)} differ, {nobro} not dated in the brochure tables")
    for x in disagree:
        print("   DIFF", x)

    # 2. random sample, re-read in the pdftotext text
    random.seed(seed)
    sample = random.sample(rows, min(n, len(rows)))
    ok = bad = 0
    for r in sample:
        src = r["seasonSourceId"]
        lines = texts[src].split("\n")
        code = r["huntCode"].split()[0]
        key = dashed(code) if "brochure" in src else code
        idxs = [i for i, l in enumerate(lines) if key in l]
        verdicts = []
        for g in r["seasonRanges"]:
            hit = False
            for i in idxs:
                w = window(lines, i, 6)
                if (found_bro(g, w) if "brochure" in src else found_reg(g, w)):
                    hit = True
                    break
            verdicts.append(hit)
        how = parsed.get(code, {}).get("how")
        # independent second reading: the brochure's own hunt table for every code of the row
        bro_ok = all(bro.get(c, {}).get("ranges") and sorted((g["start"], g["end"]) for g in bro[c]["ranges"]) ==
                     sorted((g["start"], g["end"]) for g in parsed[c]["ranges"]) for c in r["huntCode"].split())
        if all(verdicts):
            status = "OK"
        elif bro_ok and not src.startswith("d-brochure"):
            status = "OK-BRO"  # found as the brochure prints it for this hunt code
        else:
            status = "DEFAULT" if how and "default" in how else "CHECK"
        ok += status in ("OK", "OK-BRO")
        bad += status == "CHECK"
        print(f"\n2. {status:7s} {r['species']} {r['huntCode']} [{src}, {how}] seasonDates={r['seasonDates']!r}")
        if status != "OK":
            print("   ranges:", [(g['start'], g['end']) for g in r["seasonRanges"]], "per-range found:", verdicts)
            if idxs:
                print("   " + window(lines, idxs[0], 4).replace("\n", "\n   ")[:1500])
    print(f"\n2. sample of {len(sample)} rows: {ok} confirmed (dates next to the hunt code in the pdftotext text, or the "
          f"brochure prints the same dates for the code); {len(sample) - ok - bad} table defaults the brochure does not "
          f"confirm (read the table heading); {bad} to check by hand")

    # 3. key dates and seasons
    meta = json.load(open(os.path.join(repo, "src/data/agency/colorado/draw-meta.json")))
    miss = 0
    tot = 0
    for s in meta["species"]:
        for k in s["keyDates"]:
            src = k["sourceId"]
            t = squash(texts.get(src, ""))
            for iso in [x for x in (k.get("date"), k.get("start"), k.get("end")) if x]:
                tot += 1
                dd = d(iso)
                forms = [f"{MON_BRO[dd.month]} {dd.day}", f"{MON_BRO[dd.month].rstrip('.')} {dd.day}", f"{dd.month}/{dd.day}/{str(dd.year)[2:]}"]
                if k.get("start") and k.get("end") and iso == k["end"]:
                    s0 = d(k["start"])
                    if s0.month == dd.month:
                        forms.append(f"{MON_BRO[dd.month]} {s0.day}–{dd.day}")
                if not any(re.search(re.escape(f) + r"(?!\d)", t) for f in forms):
                    miss += 1
                    print("3. KEYDATE not found", s["species"], k["label"], iso, src)
    for se in meta["seasons"]:
        src = se["sourceId"]
        t = texts.get(src, "")
        g = {"start": se["start"], "end": se["end"]}
        tot += 1
        if "brochure" in src:
            ok3 = found_bro(g, t) or (bro_form({"start": se["start"], "end": se["start"]})[:-2] in squash(t))
            if not ok3:
                # brochure prints e.g. "Sept. 1–Jan. 31, 2027" or "Nov. 23, 2026–March 31, 2027"
                a, b = d(se["start"]), d(se["end"])
                alt = [f"{MON_BRO[a.month]} {a.day}–{MON_BRO[b.month]} {b.day}, {b.year}", f"{MON_BRO[a.month]} {a.day}, {a.year}–{MON_BRO[b.month]} {b.day}, {b.year}"]
                ok3 = any(x in squash(t) for x in alt)
        else:
            ok3 = found_reg(g, t)
            a0, b0 = d(se["start"]), d(se["end"])
            if not ok3 and f"{a0.month:02d}/{a0.day:02d}/{a0.year} -" in t and f"{b0.month:02d}/{b0.day:02d}/{b0.year}" in t:
                ok3 = True  # "License year" table cells wrap: "09/11/2027 -" above "09/19/2027"
            if not ok3:
                a, b = d(se["start"]), d(se["end"])
                ok3 = bool(re.search(rf"{a.month:02d}/{a.day:02d}\s*[-–]\s*{b.month:02d}/{b.day:02d}\s*,?\s*annually", t, re.I)) or \
                    (f"{a.year}: {a.month:02d}/{a.day:02d} - {b.month:02d}/{b.day:02d}" in t)
        if not ok3:
            miss += 1
            print("3. SEASON not found as a range", se["species"], se["label"], se["start"], se["end"], src)
    print(f"3. key dates + seasons: {tot - miss} of {tot} dates found in their source text; {miss} to check by hand")


if __name__ == "__main__":
    main()
