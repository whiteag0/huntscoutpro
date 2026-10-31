#!/usr/bin/env python3
"""Parse South Dakota GFP Draw Statistics HTML (from draw_download.py) into
src/data/agency/south-dakota/draw/<species>.json (DrawRecord[]).

Usage:  python -I draw_parse.py <raw_dir> <repo_root>

Per license (GFP "event") per application period GFP publishes two tables:
  * Draw Results: per preference pool, licenses available / eligible applicants /
    licenses issued / remaining licenses (pools cascade; eligible counts are cumulative).
  * Draw Preference Breakdown: first-choice applicants and successful applicants by
    preference-point level, in sections Landowner / Resident (Non Landowner) /
    Non Resident / Resident / Nonresident, each with a published Total row.

Mapping (nothing is estimated):
  resident     = "Resident" or "Resident Non Landowner" section (the general resident pool)
  nonresident  = "Non Resident" section
  total        = every section (incl. Landowner and combined "Resident / Nonresident")
  applicants / drawn = the section's published Total row (first-choice applicants)
  oddsPct      = drawn / applicants * 100 (oddsComputed = true)
  minPoints    = lowest point level with at least one successful applicant
  quota        = licenses issued in all pools of that residency + licenses remaining in
                 that residency's last pool (sum of published Draw Results figures);
                 null when GFP's Draw Results table is all zeros.
Landowner-pool and second-choice results are written to the row note.
"""
import json
import os
import re
import sys
from collections import defaultdict

from bs4 import BeautifulSoup

RETRIEVED = "2026-10-31"
SOURCE_URL = "https://license.gooutdoorssouthdakota.com/License/DrawStatistics"

# GFP draw "season" (PhaseCategory) -> species ("deer" is split by description)
CATEGORY_SPECIES = [
    (r"Elk", "elk"),
    (r"Antelope", "pronghorn"),
    (r"Bighorn Sheep", "sheep"),
    (r"Mt Goat", "goat"),
    (r"Mountain Lion", "lion"),
    (r"Turkey", "turkey"),
    (r"Deer|Special Buck|Landowner-Own-Land", "deer"),
]
# Re-issue drawings of returned deer licenses are not original draws; excluded.
# Species whose draw-meta pointsMatter is false: point tables go to the note.
NO_BYPOINTS = {"lion", "goat"}
# The data contract allows point levels 0-40 in byPoints.
MAX_POINTS = 40
EXCLUDE_CATEGORY = re.compile(r"^Returned Deer", re.I)

PHASE_SHORT = {
    "First Application Period": None,
    "Second Application Period": "Second Application Period",
    "Third Application Period": "Third Application Period",
    "Fourth Application Period": "Fourth Application Period",
}


def num(s):
    s = s.strip().replace(",", "")
    return int(s) if re.fullmatch(r"-?\d+", s) else None


def cells(tr):
    return [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]


def parse_results(html):
    soup = BeautifulSoup(html, "lxml")
    t = soup.find("table", id="DrawResultsTable")
    if t is None:
        return None
    rows = []
    for tr in t.find_all("tr"):
        c = cells(tr)
        if len(c) == 5 and num(c[1]) is not None:
            rows.append({"pool": c[0], "available": num(c[1]), "eligible": num(c[2]),
                         "issued": num(c[3]), "remaining": num(c[4])})
    return rows


def parse_prefs(html):
    soup = BeautifulSoup(html, "lxml")
    sections = []
    cur = None
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) == 1 and tds[0].get("colspan"):
            cur = {"name": tds[0].get_text(" ", strip=True), "points": [], "total": None}
            sections.append(cur)
            continue
        c = cells(tr)
        if cur is None or len(c) != 3:
            continue
        if c[0] == "Total":
            cur["total"] = (num(c[1]), num(c[2]))
        elif num(c[0]) is not None:
            cur["points"].append((num(c[0]), num(c[1]), num(c[2])))
    return sections


def pool_residency(label):
    l = label.lower()
    if l.startswith("resident / nonresident"):
        return "combined"
    if l.startswith("non resident") or l.startswith("nonresident"):
        return "nonresident"
    if l.startswith("resident"):
        return "resident"
    return "unknown"


def new_share_pool(label, elkish):
    """Pools that GFP's drawing procedure gives a new share of the quota (preference-points
    page): deer/antelope/turkey only the 2+ pool after the landowner pool; elk-type drawings
    (10+/15+ pools) each preference pool. Landowner (no preference) and second/later-choice
    pools only receive leftovers, so growth there means the pool table does not reconcile."""
    l = label.lower()
    if "landowner" in l or "choice" in l:
        return False
    if elkish:
        return bool(re.search(r"\d\+|\b0 preference", l))
    return "2+" in l


def section_kind(name):
    n = name.lower()
    if n == "landowner":
        return "landowner"
    if n in ("resident", "resident non landowner"):
        return "resident"
    if n in ("non resident", "nonresident"):
        return "nonresident"
    if n == "resident / nonresident":
        return "combined"
    return "unknown:" + name


def deer_species(desc):
    # White-tailed only when every "DEER" in the license description is "WHITETAIL DEER".
    d = desc.upper()
    if "WHITETAIL" in d and "DEER" not in re.sub(r"WHITETAIL\s+DEER", "", d):
        return ["whitetail"]
    if "MULE DEER" in d:
        return ["mule-deer"]
    return ["mule-deer", "whitetail"]


def sex_of(desc):
    d = desc.upper()
    if "PERMIT" in d and not re.search(r"DEER|TURKEY|ANTELOPE", d):
        return None
    if re.search(r"ANTLERLESS|ANTERLESS|DOE", d) and not re.search(r"ANY (WHITETAIL )?DEER|ANY ELK|ANY WILD|ANY DEER", d):
        return "female"
    if re.search(r"\bBUCK\b|\bMALE\b|\bRAM\b|ANTLERED", d) and not re.search(r"ANY DEER|ANTLERLESS", d):
        return "male"
    if re.search(r"\bANY\b", d):
        return "either"
    return None


def method_of(category, desc):
    t = (category + " " + desc).upper()
    if "ARCHERY" in t:
        return "archery", "Archery"
    if "MUZZLELOADER" in t:
        return "muzzleloader", "Muzzleloader"
    return None, None


CODE_UNIT = re.compile(r"^([A-Z0-9]{3})(\d{2}P?)$")


def units_of(category, code):
    m = re.fullmatch(r"CAE-(CU\d)", code)
    if m:
        return [m.group(1)]
    # Access permits, municipal hunts, Special Antelope (PSA) and NR Black Hills turkey (NBST)
    # codes do not carry a GFP unit id.
    if re.search(r"Access Permit|Municipal|Special Antelope|Nonresident Black Hills Spring Turkey", category, re.I):
        return []
    m = CODE_UNIT.match(code)
    # "BD1" (2022 Black Hills antlerless whitetail, BD113) is not a unit GFP publishes.
    return [m.group(1)] if m and m.group(1) != "BD1" else []


def stats(applicants, drawn, quota=None, min_points=None):
    st = {}
    if quota is not None:
        st["quota"] = quota
    st["applicants"] = applicants
    st["drawn"] = drawn
    if applicants:
        st["oddsPct"] = round(100.0 * drawn / applicants, 2)
        st["oddsComputed"] = True
    else:
        st["oddsPct"] = None
    if min_points is not None:
        st["minPoints"] = min_points
    return st


def fmt_points(pts):
    return "; ".join(f"{p}: {a}/{d}" for p, a, d in sorted(pts, reverse=True))


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    manifest = json.load(open(os.path.join(raw, "manifest.json")))
    out = defaultdict(list)
    sources = {}
    problems = []
    skipped_empty = 0
    for e in manifest:
        cat = e["category"]
        if EXCLUDE_CATEGORY.search(cat):
            continue
        sp = next((s for pat, s in CATEGORY_SPECIES if re.search(pat, cat, re.I)), None)
        if sp is None:
            continue
        phase = e["phase"].split(" - ")[-1].strip()
        if phase not in PHASE_SHORT:
            problems.append(f"unknown phase {e['phase']}")
            continue
        code, _, desc = e["event"].partition(" - ")
        code, desc = code.strip(), re.sub(r"\s+", " ", desc).strip()
        rp = os.path.join(raw, "html", e["stem"] + "_res.html")
        pp = os.path.join(raw, "html", e["stem"] + "_pref.html")
        if not (os.path.exists(rp) and os.path.exists(pp)):
            problems.append(f"missing html {e['stem']}")
            continue
        res = parse_results(open(rp, encoding="utf-8").read())
        prefs = parse_prefs(open(pp, encoding="utf-8").read())
        if res is None:
            problems.append(f"no results table {e['stem']}")
            continue
        # ---- preference sections
        secs = {}
        for s in prefs:
            k = section_kind(s["name"])
            if k.startswith("unknown"):
                problems.append(f"{e['stem']}: {k}")
            if s["total"] is None:
                problems.append(f"{e['stem']}: section {s['name']} without total")
                continue
            sa = sum(a for _, a, _ in s["points"])
            sd = sum(d for _, _, d in s["points"])
            if (sa, sd) != s["total"]:
                problems.append(f"{e['stem']}: {s['name']} point rows {sa}/{sd} != Total {s['total']}")
            secs[k] = s
        tot_app = sum(s["total"][0] for s in secs.values())
        tot_drawn = sum(s["total"][1] for s in secs.values())
        pool_avail = sum(r["available"] for r in res)
        pool_issued = sum(r["issued"] for r in res)
        if tot_app == 0 and pool_avail == 0 and pool_issued == 0 and all(r["eligible"] == 0 for r in res):
            skipped_empty += 1
            continue
        # ---- quotas by residency from Draw Results
        by_res = defaultdict(list)
        for r in res:
            by_res[pool_residency(r["pool"])].append(r)
        table_zero = pool_avail == 0 and pool_issued == 0
        quota = {}
        broken = []
        elkish = any(re.search(r"10\+|15\+", r["pool"]) for r in res)
        for k, rows in by_res.items():
            # The pool chain must be internally consistent for issued + final remaining
            # to equal the licenses allotted: remaining = available - issued in every pool,
            # and no pool starts with fewer licenses than the previous pool left over.
            ok = all(r["remaining"] == r["available"] - r["issued"] for r in rows) and \
                all(b["available"] >= a["remaining"] for a, b in zip(rows, rows[1:])) and \
                all(b["available"] == a["remaining"] or new_share_pool(b["pool"], elkish)
                    for a, b in zip(rows, rows[1:]))
            if not ok:
                broken.append(k)
            quota[k] = None if (table_zero or not ok) else sum(r["issued"] for r in rows) + rows[-1]["remaining"]
        q_total = None if (table_zero or broken) else sum(v for v in quota.values() if v is not None)
        second_issued = sum(r["issued"] for r in res if re.search(r"(second|2nd|third|fourth|fifth) choice", r["pool"], re.I))
        first_issued = pool_issued - second_issued
        remaining_final = sum(rows[-1]["remaining"] for rows in by_res.values())

        def minpts(s):
            got = [p for p, _, d in s["points"] if d > 0]
            return min(got) if got else None

        # GFP prints an all-zero section/pool for a residency that had no licenses and
        # no applicants (e.g. nonresidents on resident-only access permits): drop it.
        for k in ("resident", "nonresident"):
            if k in secs and secs[k]["total"] == (0, 0) and not quota.get(k):
                del secs[k]
        rec_res = rec_nr = None
        if "resident" in secs:
            s = secs["resident"]
            rec_res = stats(s["total"][0], s["total"][1], quota.get("resident"), minpts(s))
        if "nonresident" in secs:
            s = secs["nonresident"]
            rec_nr = stats(s["total"][0], s["total"][1], quota.get("nonresident"), minpts(s))
        total = stats(tot_app, tot_drawn, q_total)
        notes = []
        if "landowner" in secs:
            s = secs["landowner"]
            notes.append(f"Resident landowner-preference pool (not in resident figures): {s['total'][0]} first-choice applicants, {s['total'][1]} successful")
        if "combined" in secs:
            s = secs["combined"]
            notes.append("GFP publishes residents and nonresidents as one group for this license: "
                         f"{s['total'][0]} first-choice applicants, {s['total'][1]} successful; by points (points: applicants/successful) {fmt_points(s['points'])}")
            mp = minpts(s)
            if mp is not None:
                total["minPoints"] = mp
        if second_issued:
            notes.append(f"{second_issued} additional license(s) went to second- or later-choice applicants")
        if not table_zero:
            notes.append(f"{remaining_final} license(s) remained after this drawing")
            if rec_res and quota.get("resident") is not None and "landowner" in secs:
                notes.append("resident quota includes the resident landowner allocation")
        if broken:
            notes.append("quota not reported: GFP's Draw Results pool figures for " + "/".join(broken) +
                         " do not reconcile (pool licenses do not carry over consistently from one pool to the next)")
        if table_zero and tot_drawn > 0:
            notes.append("GFP's Draw Results table lists 0 licenses for every pool for this license while its preference breakdown lists successful applicants, so quota is not reported")
        if not table_zero and first_issued != tot_drawn:
            notes.append(f"GFP's Draw Results table shows {first_issued} first-choice licenses issued vs {tot_drawn} successful applicants in its preference breakdown")
        if sp in NO_BYPOINTS:
            pts = [(k, s) for k, s in secs.items() if k != "combined"]
            lead = ("Access permit drawing (the mountain lion license itself is sold over the counter)" if sp == "lion"
                    else "Mountain goat season is now closed")
            notes.append(lead + "; by points (points: applicants/successful) " +
                         " | ".join(f"{k}: {fmt_points(s['points'])}" for k, s in pts))
        species_list = deer_species(desc) if sp == "deer" else [sp]
        if sp == "deer" and len(species_list) == 2:
            notes.append("valid for white-tailed or mule deer; listed in both deer files")
        method, mlabel = method_of(cat, desc)
        short = PHASE_SHORT[phase]
        hunt = f"{code} ({cat})" if short is None else f"{code} ({cat}, {short})"
        sid = f"d-sd-drawstats-{e['year']}"
        sources[sid] = e["year"]
        for spx in species_list:
            r = {
                "species": spx,
                "year": e["year"],
                "huntCode": hunt,
                "units": units_of(cat, code),
                "description": f"{cat}, {phase}: {code} - {desc}",
            }
            if method:
                r["method"] = method
                r["methodLabel"] = mlabel
            sx = sex_of(desc)
            if sx:
                r["sex"] = sx
            r["choice"] = "first"
            if rec_res is not None:
                r["resident"] = rec_res
            if rec_nr is not None:
                r["nonresident"] = rec_nr
            r["total"] = total
            if spx not in NO_BYPOINTS:
                bp = defaultdict(dict)
                for k in ("resident", "nonresident"):
                    if k in secs:
                        for p, a, d in secs[k]["points"]:
                            bp[p][k] = {"applicants": a, "drawn": d}
                high = [p for p in bp if p > MAX_POINTS]
                if high:
                    r_note_extra = ("point levels above 40 are not in byPoints; GFP lists (points: resident applicants/successful) " +
                                    "; ".join(f"{p}: {bp[p]['resident']['applicants']}/{bp[p]['resident']['drawn']}" for p in sorted(high, reverse=True)
                                              if 'resident' in bp[p]))
                    notes_r = notes + [r_note_extra]
                else:
                    notes_r = notes
                if bp:
                    r["byPoints"] = [{"points": p, **bp[p]} for p in sorted(bp) if p <= MAX_POINTS]
            else:
                notes_r = notes
            if notes_r:
                r["note"] = "; ".join(notes_r) + "."
            r["sourceId"] = sid
            out[spx].append(r)

    ddir = os.path.join(repo, "src/data/agency/south-dakota/draw")
    os.makedirs(ddir, exist_ok=True)
    for sp, rows in out.items():
        rows.sort(key=lambda r: (-r["year"], r["huntCode"]))
        with open(os.path.join(ddir, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1)
        print(sp, len(rows), sorted({r["year"] for r in rows}))
    json.dump(sorted(sources), open(os.path.join(raw, "parse-sources.json"), "w"))
    print("skipped empty (no licenses, no applicants):", skipped_empty)
    print("problems:", len(problems))
    for p in [q for q in problems if not q.startswith("missing html")][:60]:
        print("  ", p)


if __name__ == "__main__":
    main()
