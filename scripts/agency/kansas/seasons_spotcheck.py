#!/usr/bin/env python3
"""Spot-check Kansas season dates against KDWP's pages by an independent route.

Usage:  python -I scripts/agency/kansas/seasons_spotcheck.py <raw_dir> <repo_root> [n=40] [seed=11]

seasons_parse.py turns KDWP's date text into YYYY-MM-DD. This check goes the other way: it writes
each sampled date back out the way KDWP prints it ("September 19-27, 2026", "September
28-October 5, 2026", "December 14, 2026-January 31, 2027", "September 1-30 each year") and
requires that text to appear in the raw HTML of the When to Hunt page (tags stripped with a plain
regex, not the parser's HTML reader) within the block that starts at the season's heading. It does
this for n random draw-meta seasons and n random draw-row seasonRanges, and checks every 2026 key
date against the page it cites.
"""
import datetime
import html
import json
import os
import random
import re
import sys

HEAD = {  # draw-meta label prefix -> heading text on the When to Hunt page
    "Antelope - Archery": "Antelope - Archery", "Antelope - Muzzleloader Only": "Antelope - Muzzleloader Only",
    "Antelope - Firearms": "Antelope - Firearms", "Youth and Disability (deer)": "Deer - Youth and Disability",
    "Muzzleloader Only (deer)": "Deer - Muzzleloader Only", "Regular Archery (deer)": "Regular Archery",
    "Extended Archery Whitetail Antlerless Only (WAO) - Unit 19": "Unit 19 Only",
    "Pre-Rut, Whitetail Antlerless Only (WAO)": "Pre-Rut, Whitetail", "Extended Pre-Rut": "Extended Pre-Rut",
    "Regular Firearms (deer)": "Regular Firearms", "Extended Whitetail Antlerless Only (WAO) - 1st segment": "1st Segment, Unit 3",
    "Extended Whitetail Antlerless Only (WAO) - 2nd segment": "2nd Segment, Units 4", "Extended Whitetail Antlerless Only (WAO) - 3rd segment": "3rd Segment, Units 11",
    "Fort Riley Subunit 8A - Regular Firearms": "Regular Firearms: Third Saturday", "Fort Riley Subunit 8A - Firearms WAO, 1st segment": "1st Segment: Friday following",
    "Fort Riley Subunit 8A - Firearms WAO, 2nd segment": "2nd Segment: January 1 through second",
    "Fort Leavenworth Subunit 10A - Regular Firearms, 1st": "1st Segment: Second Saturday prior", "Fort Leavenworth Subunit 10A - Regular Firearms, 2nd": "2nd Segment: Saturday prior",
    "Fort Leavenworth Subunit 10A - Regular Firearms, 3rd": "3rd Segment: Thanksgiving", "Fort Leavenworth Subunit 10A - Regular Firearms, 4th": "4th Segment: Second Saturday after",
    "Fort Leavenworth Subunit 10A - Regular Firearms, 5th": "5th Segment: Third Saturday", "Fort Leavenworth Subunit 10A - Firearms WAO": "Firearms Whitetail Antlerless Only (WAO): January 1 through third",
    "Fort Leavenworth Subunit 10A - Extended Archery WAO": "Extended Archery Whitetail Antlerless Only (WAO): Third Monday",
    "Smoky Hill ANG Range Subunit 4A": "Smoky Hill Air National Guard", "Elk - Archery": "Elk - Archery", "Elk - Muzzleloader Only": "Elk - Muzzleloader Only",
    "Elk - Firearms, 1st Segment": "Elk - Firearms", "Elk - Firearms, 2nd Segment": "2nd Segment", "Elk - Firearms, 3rd Segment": "3rd Segment",
    "Elk on Fort Riley Subunit 2a - Archery & Muzzleloader": "Archery & Muzzleloader Only", "Elk on Fort Riley Subunit 2a - Firearms, 1st": "1st Segment: October",
    "Elk on Fort Riley Subunit 2a - Firearms, 2nd": "2nd Segment: November", "Elk on Fort Riley Subunit 2a - Firearms, 3rd": "3rd Segment: December",
    "Elk on Fort Riley Subunit 2a - Extended": "Extended Season: January", "Fall Turkey - Residents Only": "Fall Turkey - Residents Only",
    "Spring Turkey - Youth and Disability": "Spring Turkey - Youth and Disability", "Spring Turkey - Archery Only": "Spring Turkey - Archery Only",
    "Spring Turkey - Regular": "Spring Turkey - Regular",
}
ROW_LABEL = {  # draw-row range label -> draw-meta season label
    "Archery permit - Regular Archery": "Regular Archery (deer)", "Muzzleloader permit - Muzzleloader Only": "Muzzleloader Only (deer)",
    "Muzzleloader permit - Regular Firearms (muzzleloader equipment only)": "Regular Firearms (deer)", "Firearm permit - Regular Firearms": "Regular Firearms (deer)",
    "Regular Firearms (any legal equipment)": "Regular Firearms (deer)", "Antelope - Firearms": "Antelope - Firearms",
    "Antelope - Muzzleloader Only": "Antelope - Muzzleloader Only", "Archery Only": "Spring Turkey - Archery Only",
    "Regular (Firearms & Archery)": "Spring Turkey - Regular", "Youth and Disability (youth and hunters with disabilities only)": "Spring Turkey - Youth and Disability",
}


def strip(path):
    t = open(path, encoding="utf-8", errors="replace").read()
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t)).replace("\xa0", " ")
    return re.sub(r"\s+:", ":", re.sub(r"\s+", " ", t))


def kdwp(a, b):
    a, b = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
    if a.year != b.year:
        return [f"{a:%B} {a.day}, {a.year}-{b:%B} {b.day}, {b.year}"]
    if a.month != b.month:
        return [f"{a:%B} {a.day}-{b:%B} {b.day}, {a.year}", f"{a:%B} {a.day}-{b:%B} {b.day}"]
    return [f"{a:%B} {a.day}-{b.day}, {a.year}", f"{a:%B} {a.day}-{b.day}", f"{a:%B} {a.day}, {b.day}, {a.year}",
            f"{a:%B} {a.day}-{b.day}, {str(a.year)[:3]}", f"and {a.day}-{b.day}, {a.year}"]


def block(text, heading, start_at):
    i = text.find(heading, start_at)
    if i < 0:
        return None
    return text[i:i + 700]


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    rnd = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 11)
    when = strip(os.path.join(raw, "when.html"))
    big = when.index("Antelope Seasons")
    meta = json.load(open(os.path.join(repo, "src/data/agency/kansas/draw-meta.json")))
    bad, checked = [], 0

    def check_season(s, ctx):
        nonlocal checked
        checked += 1
        key = next((k for k in HEAD if s["label"].startswith(k)), None)
        if not key:
            bad.append((ctx, "no heading mapping", s["label"]))
            return
        head = HEAD[key]
        start = big
        if "Fort Riley Subunit 8A" in s["label"]:
            start = when.index("Fort Riley, Subunit 8A")
        elif "Fort Leavenworth" in s["label"]:
            start = when.index("Fort Leavenworth, Subunit 10A")
        elif s["label"].startswith("Elk on Fort Riley"):
            start = when.index("Elk - On Fort Riley")
        elif s["label"].startswith("Elk - Firearms"):
            start = when.index("Elk - Firearms")
        elif s["label"].startswith("Fall Turkey") or s["label"].startswith("Spring Turkey"):
            start = when.index("Turkey Seasons")
        elif s["label"].startswith("Extended Whitetail"):
            start = when.index("Extended Whitetail Antlerless Only (WAO)")
        blk = block(when, head, start)
        if blk is None:
            bad.append((ctx, "heading not found", head))
            return
        a, b = s["start"], s["end"]
        if "each year" in s.get("note", ""):
            da, db = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
            want = [f"{da:%B} {da.day}-{db.day} each year" if da.month == db.month else f"{da:%B} {da.day}-{db:%B} {db.day} each year"]
        else:
            want = kdwp(a, b)
        ok = any(w in blk for w in want)
        if not ok and "(1st part)" in s["label"] or "(2nd part)" in s["label"]:
            ok = any(w.split(", ")[0] in blk for w in want)
        if not ok:
            bad.append((ctx, f"{s['label']} {a}..{b}", f"none of {want} in block starting {blk[:80]!r}"))

    seasons = meta["seasons"]
    for s in rnd.sample(seasons, min(n, len(seasons))):
        check_season(s, "season")
    rows = []
    for f in sorted(os.listdir(os.path.join(repo, "src/data/agency/kansas/draw"))):
        for r in json.load(open(os.path.join(repo, "src/data/agency/kansas/draw", f))):
            for g in r.get("seasonRanges", []):
                rows.append((r, g))
    for r, g in rnd.sample(rows, min(n, len(rows))):
        lab = g["label"]
        if lab.startswith("Unfilled permits - "):
            target = lab.split(" - ", 1)[1].rsplit(" (", 1)[0]
        else:
            target = ROW_LABEL.get(lab)
        sp = r["species"] if r["species"] != "mule-deer" or "Antelope" in (target or "") else "mule-deer"
        s = [x for x in seasons if x["year"] == r["year"] and x["label"].startswith(target or "?") and
             (x["species"] == sp or (target or "").startswith("Extended Whitetail"))]
        if not s:
            bad.append(("row", r["huntCode"], f"no season for {lab}"))
            continue
        if (s[0]["start"], s[0]["end"]) != (g["start"], g["end"]):
            bad.append(("row", r["huntCode"], f"{lab}: {g} != season {s[0]['start']}..{s[0]['end']}"))
        check_season({**s[0], "start": g["start"], "end": g["end"]}, f"row {r['species']} {r['huntCode']}")
        if r["species"] == "whitetail" and lab.startswith("Unfilled"):
            u = r["units"][0]
            if u in ("1", "2", "17", "18"):
                bad.append(("row", r["huntCode"], "extended season in a unit without one"))
    # key dates (2026): the cited page must print the window
    pages = {"d-ks-fees-page": "fees.html", "d-ks-antelope-page": "antelope.html", "d-ks-elk-page": "elk.html",
             "d-ks-turkey-page": "turkey.html", "d-ks-deer-page": "deer.html"}
    for sp in meta["species"]:
        for k in sp["keyDates"]:
            checked += 1
            t = strip(os.path.join(raw, pages[k["sourceId"]]))
            if "date" in k:
                dd = datetime.date.fromisoformat(k["date"])
                want = [f"{dd:%B} {dd.day}, {dd.year}"]
            else:
                a, b = datetime.date.fromisoformat(k["start"]), datetime.date.fromisoformat(k["end"])
                want = kdwp(k["start"], k["end"]) + [f"{a:%m/%d/%Y} - {b:%m/%d/%Y}", f"{a:%B} {a.day} - {b:%B} {b.day}, {a.year}",
                                                     f"{a:%B} {a.day} thru {b:%B} {b.day}, {a.year}", f"{a:%b}. {a.day} - {b:%b}. {b.day}"]
            if not any(w in t for w in want):
                bad.append(("keyDate", sp["species"], f"{k['label']}: none of {want} on {pages[k['sourceId']]}"))
    print(f"values checked: {checked}")
    for b in bad:
        print("MISMATCH", *b)
    print(f"{len(bad)} mismatches")


if __name__ == "__main__":
    main()
