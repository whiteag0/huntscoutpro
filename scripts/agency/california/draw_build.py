#!/usr/bin/env python3
"""Build src/data/agency/california/draw/<species>.json from CDFW Big Game Drawing Statistics.

Inputs (downloaded by draw_fetch.py into <raw>):
  <raw>/pdf/docs.json + <raw>/pdf/<year>_<docId>.pdf
      "<Species> Tag Drawing Statistics - ... - Number of Applicants by Point Value" (2022-2026).
      Per hunt: tag quota, preference-point / random quota split, total (1st-choice) applicants
      and applicants at each preference-point value. Deer hunt groups are split over several PDFs
      by point range; rows are merged by (year, hunt code) and the point columns must add up to
      the total, or the point breakdown is dropped from the note.
  <raw>/digest/<docId>.txt  (pdftotext -layout of the Big Game Hunting Digest)
      Digest Y prints "<Y-1> DEER TAG DRAWING STATISTICS": tags awarded in the preference drawing
      (highest / lowest point value drawn) and in the random draw-by-choice drawing (to 1st, 2nd,
      3rd choice applicants). Used for deer drawn counts 2022-2025. Elk "Hunts" tables give the
      elk subspecies (Roosevelt / Tule / Rocky Mountain) by hunt code.

CDFW does not split applicants by residency and does not publish tags drawn for elk, pronghorn
or bighorn sheep, or tags drawn by point level, so rows carry `total` only and no byPoints.

Usage: python -I draw_build.py <raw_dir> <repo_root>
"""
import collections
import json
import os
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from draw_pdfparse import parse_pdf  # noqa: E402

YEARS = range(2022, 2027)
DIGEST_FOR_DRAW_YEAR = {2022: "221986", 2023: "231077", 2024: "243703", 2025: "200602"}
DIGEST_YEAR = {"221986": 2023, "231077": 2024, "243703": 2025, "200602": 2026}
PREF_ONLY = {"PD", "499", "599", "799"}


def species_of(title):
    t = title.lower()
    if t.startswith("deer"):
        return "mule-deer"
    if t.startswith("elk"):
        return "elk"
    if t.startswith("pronghorn"):
        return "pronghorn"
    if t.startswith("bighorn"):
        return "sheep"
    raise ValueError(title)


def group_of(title):
    """Hunt group, e.g. 'Zone Hunts', from the link text."""
    t = re.sub(r"\s*\(PDF\)\s*$", "", title)
    t = re.sub(r"\s*(by|-)?\s*Point Value.*$", "", t, flags=re.I)
    parts = re.split(r"\s+-\s+", t, maxsplit=1)
    g = parts[1] if len(parts) > 1 else "All Hunts"
    g = re.sub(r"\s+by$", "", g.strip(), flags=re.I)
    g = re.sub(r"^Applicants$", "All Hunts", g)
    g = re.sub(r"^Hunts$", "All Hunts", g)
    g = re.sub(r"^General Method Hunts$", "All Hunts", g)
    g = re.sub(r"^Archery and General Hunts$", "All Hunts", g)
    return g


def src_id(sp, year, group):
    slug = re.sub(r"[^a-z0-9]+", "-", group.lower()).strip("-")
    short = {"mule-deer": "deer"}.get(sp, sp)
    return f"d-stats-{short}-{slug}-{year}"


# ---------------- digest parsing ----------------
DNUM = r"[\d,]+(?:\.\d+)?\.?"
DROW = re.compile(r"^\s*(PD|[A-Z]{1,2}\d{0,2}[A-Z]?)\s+((?:" + DNUM + r"\s+){11}" + DNUM + r")\s*$")
# The 2022 summary (Digest 2023) prints a stray letter for one hunt's highest point value
# (A5: "40 36 4 109 0 36 L 2 4 4 0 0"). That column only feeds the note, so accept a single
# letter there and keep highPt = None; every count column must still be numeric.
DROW_HIGH_MISPRINT = re.compile(r"^\s*(PD|[A-Z]{1,2}\d{0,2}[A-Z]?)\s+((?:" + DNUM + r"\s+){6}[A-Z]\s+(?:" + DNUM + r"\s+){4}" + DNUM + r")\s*$")


def dnum(t, as_int=True):
    if re.fullmatch(r"[A-Z]", t):
        return None
    t = t.replace(",", "").rstrip(".")
    v = float(t)
    if as_int:
        if v != int(v):
            raise ValueError(f"non-integer count {t}")
        return int(v)
    return int(v) if v == int(v) else v


def parse_digest_deer(txt, draw_year):
    lines = txt.splitlines()
    head = f"{draw_year} DEER TAG DRAWING STATISTICS"
    idx = [i for i, l in enumerate(lines) if head in l]
    if not idx:
        raise SystemExit(f"no '{head}' in digest")
    out = {}
    start, end = idx[0], idx[-1] + 120
    for l in lines[start:end]:
        m = DROW.match(l) or DROW_HIGH_MISPRINT.match(l)
        if not m:
            continue
        code = m.group(1)
        t = m.group(2).split()
        rec = {
            "quota": dnum(t[0]), "prefQuota": dnum(t[1]), "randQuota": dnum(t[2]), "total1st": dnum(t[3]),
            "maxPtApplicants": dnum(t[4]), "prefAwarded": dnum(t[5]),
            "highPt": dnum(t[6], False), "lowPt": dnum(t[7], False),
            "randAwarded": dnum(t[8]), "rand1st": dnum(t[9]), "rand2nd": dnum(t[10]), "rand3rd": dnum(t[11]),
            "raw": l.strip(),
        }
        if code in out:
            raise SystemExit(f"duplicate digest row {code} {draw_year}")
        out[code] = rec
    mp = re.search(r"Max Point\s*\n?.*?\((\d+)\)", "\n".join(lines[start:start + 30]), re.S)
    return out, (int(mp.group(1)) if mp else None)


def parse_digest_elk_subspecies(txt):
    """hunt code -> 'Roosevelt' | 'Tule' | 'Rocky Mountain' | 'Roosevelt/Tule' from elk hunt tables."""
    sub = {}
    lines = txt.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if re.search(r"\b20\d\d ELK HUNTS\b", l))
    except StopIteration:
        return sub
    end = next((i for i, l in enumerate(lines[start:], start) if re.search(r"PRONGHORN (HUNTS|HUNT ZONES)", l)), len(lines))
    heading = None
    for l in lines[start:end]:
        s = l.strip()
        hm = re.match(r"^(?:General Methods|Muzzleloader(?:/Archery)?|Archery)(?: Hunts)?\s*-\s*(Roosevelt/Tule|Roosevelt|Tule|Rocky Mountain)(?: Elk)?(?:,? Continued)?$", s, re.I)
        if hm:
            heading = {"roosevelt/tule": "Roosevelt/Tule", "roosevelt": "Roosevelt", "tule": "Tule", "rocky mountain": "Rocky Mountain"}[hm.group(1).lower()]
            continue
        if re.match(r"^(Apprentice Hunts|APPRENTICE HUNTS|Archery Hunts|ARCHERY( HUNTS)?|MUZZLELOADER|General Methods Hunts|GENERAL METHODS HUNTS|Preference Point Only|PREFERENCE POINT ONLY)\b", s):
            heading = None
            continue
        m = re.match(r"^(\d{3})\s+(.+?)\s{2,}", s) or None
        code, name = (m.group(1), m.group(2)) if m else (None, None)
        if not m:
            m2 = re.match(r"^(.+?)\s{2,}(\d{3})\s{2,}", s)
            if m2:
                code, name = m2.group(2), m2.group(1)
        if not code:
            continue
        pm = re.search(r"\((?:Apprentice,\s*)?(Roosevelt/Tule|Roosevelt|Tule|Rocky Mountain)\)", name)
        val = pm.group(1) if pm else heading
        if val and code not in sub:
            sub[code] = val
    return sub


# ---------------- row helpers ----------------
def method_of(desc):
    d = desc.lower()
    if re.search(r"muzzleload\w*( rifle)?/archery|muzzleloader/archery|rifle/archery", d):
        return "other", "Muzzleloader/Archery"
    if re.search(r"shotgun\s*/\s*archery\s*/\s*crossbow", d):
        return "other", "Shotgun/Archery/Crossbow"
    if "archery and general" in d:
        return "all", "Archery and General Seasons"
    if "archery" in d:
        return "archery", "Archery"
    if "muzzleload" in d:
        return "muzzleloader", "Muzzleloader" if "muzzleloader" in d else "Muzzleloading Rifle"
    if "shotgun" in d:
        return "shotgun", "Shotgun"
    if "general method" in d:
        return "all", "General Methods"
    if "general season" in d:
        return "all", "General Season"
    return None, None


def sex_of(desc):
    d = desc.lower()
    if re.search(r"either[\s-]*sex", d):
        return "either"
    if "antlerless" in d:
        return "female"
    if re.search(r"\b(buck|bull|ram)\b", d):
        return "male"
    return None


C_ZONES = ["C1", "C2", "C3", "C4"]


def units_of(sp, code, desc):
    if sp == "mule-deer":
        if code == "C":
            return C_ZONES
        if re.fullmatch(r"[DX]\d{1,2}[A-C]?", code):
            return [code]
        if re.search(r"\bin C Zones\b", desc, re.I):
            return C_ZONES
        m = re.search(r"\bZone\s+([A-DX]\d{1,2}[A-C]?)\b", desc, re.I)
        if m:
            return [m.group(1).upper()]
        m = re.match(r"^([DX])-?(\d{1,2}[A-C]?)\s", desc)
        if m:
            return [(m.group(1) + m.group(2)).upper()]
        return []
    if sp in ("pronghorn", "sheep"):
        m = re.search(r"\bZone\s*(\d+)", desc, re.I)
        return [f"Zone {m.group(1)}"] if m else []
    # elk: hunt zone name as CDFW writes it at the start of the hunt name
    z = re.split(r"\s+-\s+|\s+–\s+", desc)[0]
    z = re.sub(r"\s+(Period\s+\d+|Apprentice|Archery|Muzzleloader|General Methods?).*$", "", z, flags=re.I)
    return [z.strip()] if z.strip() else []


def fmt_pts(points):
    def key(lbl):
        a = lbl.split("-")
        return float(a[-1]) + (0.0 if len(a) == 1 else -0.001)
    items = sorted(((k, v) for k, v in points.items() if v), key=lambda kv: -key(kv[0]))
    return ", ".join(f"{k}: {v:,}" for k, v in items)


def fmt_pt(v):
    return f"{v:g}" if isinstance(v, float) else str(v)


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    docs = json.load(open(os.path.join(raw, "pdf", "docs.json")))
    merged = {}  # (sp, year, code) -> dict
    descs = collections.defaultdict(collections.Counter)
    groups = collections.defaultdict(list)  # source id -> docs
    problems = []
    pd_rows = collections.defaultdict(dict)    # (sp, year) -> docId -> PD/499/599/799 point values
    row_docs = collections.defaultdict(list)   # (sp, year, code) -> [(docId, points)]
    for d in docs:
        if d["year"] not in YEARS:
            continue
        sp = species_of(d["title"])
        grp = group_of(d["title"])
        sid = src_id(sp, d["year"], grp)
        groups[sid].append(d)
        rows = parse_pdf(os.path.join(raw, "pdf", f"{d['year']}_{d['docId']}.pdf"))
        if not rows:
            problems.append(f"no rows in {d['docId']}")
        for r in rows:
            k = (sp, d["year"], r["code"])
            descs[k][r["desc"]] += 1
            if r["code"] in PREF_ONLY and r["points"]:
                pd_rows[(sp, d["year"])][d["docId"]] = r["points"]
            row_docs[k].append((d["docId"], r["points"]))
            if r["points"] is None:
                problems.append(f"{d['docId']} {r['code']}: {r['nPointCols']} point values vs {len(r['labels'])} labels")
            m = merged.get(k)
            if m is None:
                merged[k] = {"sp": sp, "year": d["year"], "code": r["code"], "quota": r["quota"], "prefQuota": r["prefQuota"],
                             "randQuota": r["randQuota"], "total": r["total"], "points": dict(r["points"] or {}),
                             "pointsOk": r["points"] is not None, "sid": sid, "docs": [d["docId"]], "group": grp}
                continue
            if m["sid"] != sid and r["code"] not in PREF_ONLY:
                problems.append(f"{k} appears in two hunt groups ({m['sid']}, {sid})")
            for f in ("quota", "prefQuota", "randQuota", "total"):
                if m[f] != r[f]:
                    problems.append(f"{k} {f} differs between docs {m['docs']} ({m[f]}) and {d['docId']} ({r[f]})")
            m["docs"].append(d["docId"])
            if r["points"] is None:
                m["pointsOk"] = False
            for lbl, v in (r["points"] or {}).items():
                if lbl in m["points"] and m["points"][lbl] != v:
                    m["pointsOk"] = False
                    if r["code"] not in PREF_ONLY:
                        problems.append(f"{k} point {lbl}: {m['points'][lbl]} vs {v}")
                m["points"][lbl] = v

    # The preference-point-only row is printed in every part of a year's statistics; a part whose
    # values for that row disagree with the other parts has its point columns misaligned, so the
    # point breakdown of every hunt drawn from that part is dropped.
    bad_docs = {}
    for (sp, year), per_doc in pd_rows.items():
        votes = collections.defaultdict(collections.Counter)
        for did, pts in per_doc.items():
            for lbl, v in pts.items():
                votes[lbl][v] += 1
        for did, pts in per_doc.items():
            bad = [lbl for lbl, v in pts.items() if len(votes[lbl]) > 1 and votes[lbl].most_common(1)[0][0] != v
                   and votes[lbl].most_common(1)[0][1] > votes[lbl][v]]
            if bad:
                bad_docs[did] = bad
                problems.append(f"{sp} {year} doc {did}: preference-point-only row disagrees with other parts at {bad}")
    for k, lst in row_docs.items():
        if k in merged and any(did in bad_docs for did, _ in lst):
            merged[k]["pointsOk"] = False
            merged[k]["badDoc"] = [did for did, _ in lst if did in bad_docs]

    # deer drawing summary from the digests
    digest_deer, maxpts = {}, {}
    for yr, did in DIGEST_FOR_DRAW_YEAR.items():
        txt = open(os.path.join(raw, "digest", f"{did}.txt"), encoding="utf-8", errors="replace").read()
        digest_deer[yr], maxpts[yr] = parse_digest_deer(txt, yr)
    elk_sub = {}
    for did in ("200602", "243703", "231077", "221986"):  # newest first
        txt = open(os.path.join(raw, "digest", f"{did}.txt"), encoding="utf-8", errors="replace").read()
        for c, v in parse_digest_elk_subspecies(txt).items():
            elk_sub.setdefault(c, (v, did))

    # zone-level fallback: a zone whose coded hunts in the digests all carry one subspecies
    zone_sub = collections.defaultdict(set)
    for (sp, year, code), m in merged.items():
        if sp == "elk" and code in elk_sub:
            for z in units_of(sp, code, descs[(sp, year, code)].most_common(1)[0][0]):
                zone_sub[z].add(elk_sub[code][0])
    out = collections.defaultdict(list)
    pref_only = collections.defaultdict(dict)
    used_digest = collections.defaultdict(set)
    for k in sorted(merged, key=lambda k: (k[0], k[1], k[2])):
        m = merged[k]
        sp, year, code = k
        desc = descs[k].most_common()
        top = desc[0][1]
        desc_txt = max([t for t, n in desc if n == top], key=len)
        if m["pointsOk"] and m["points"]:
            s = sum(m["points"].values())
            if s != m["total"]:
                problems.append(f"{k}: point columns sum {s} != total {m['total']}")
                m["pointsOk"] = False
        if code in PREF_ONLY or desc_txt.lower().startswith("preference point only"):
            pref_only[sp][year] = m["total"]
            continue
        notes = []
        total = {"quota": m["quota"], "applicants": m["total"]}
        description = desc_txt
        if sp == "elk":
            if code in elk_sub:
                description = f"{desc_txt} ({elk_sub[code][0]} elk)"
            else:
                zs = [zone_sub.get(z, set()) for z in units_of(sp, code, desc_txt)]
                if len(zs) == 1 and len(zs[0]) == 1:
                    description = f"{desc_txt} ({next(iter(zs[0]))} elk zone)"
        if sp == "mule-deer":
            dg = digest_deer.get(year, {}).get(code)
            if year in digest_deer and dg is None:
                notes.append(f"Hunt not listed in CDFW's {year} deer drawing summary (Big Game Hunting Digest {year + 1}), so tags drawn are not available.")
            if dg:
                used_digest[year].add(code)
                if dg["rand1st"] + dg["rand2nd"] + dg["rand3rd"] != dg["randAwarded"]:
                    problems.append(f"{k}: digest random split {dg['raw']}")
                if dg["quota"] != m["quota"] or dg["total1st"] != m["total"] or dg["prefQuota"] != m["prefQuota"]:
                    problems.append(f"{k}: digest vs PDF quota/pref/applicants {dg['quota']}/{dg['prefQuota']}/{dg['total1st']} vs {m['quota']}/{m['prefQuota']}/{m['total']} (drawn omitted)")
                    notes.append(f"Tags drawn omitted: the row for hunt {code} in CDFW's {year} deer drawing summary (Big Game Hunting Digest {year + 1}) "
                                 f"lists quota {dg['quota']:,} and {dg['total1st']:,} first-choice applicants, which does not match this hunt in the drawing-statistics PDF "
                                 f"(quota {m['quota']:,}, {m['total']:,} applicants), so the summary row cannot be tied to this hunt.")
                    dg = None
            if dg:
                drawn = dg["prefAwarded"] + dg["rand1st"]
                total["drawn"] = drawn
                total["oddsPct"] = round(100.0 * drawn / m["total"], 2) if m["total"] else None
                if total["oddsPct"] is not None:
                    total["oddsComputed"] = True
                if dg["prefAwarded"] > 0:
                    total["minPoints"] = dg["lowPt"]
                pts = (f"point values {fmt_pt(dg['highPt'])} down to {fmt_pt(dg['lowPt'])}" if dg["highPt"] is not None else
                       f"lowest point value {fmt_pt(dg['lowPt'])}; CDFW's summary misprints the highest point value as a letter")
                notes.append(
                    f"Drawn = first-choice applicants awarded a tag: {dg['prefAwarded']:,} in the preference-point drawing "
                    f"({pts}) + {dg['rand1st']:,} in the random draw-by-choice drawing. "
                    f"The random drawing also awarded {dg['rand2nd']:,} tags to 2nd-choice and {dg['rand3rd']:,} to 3rd-choice applicants; "
                    f"{dg['prefAwarded'] + dg['randAwarded']:,} of {dg['quota']:,} tags were awarded in the drawing. "
                    f"{dg['maxPtApplicants']:,} first-choice applicants held the maximum {maxpts.get(year) or ''} points. "
                    f"minPoints is the lowest point value drawn in the preference drawing (CDFW Big Game Hunting Digest {year + 1}, source d-digest-{year + 1})."
                    .replace("maximum  points", "maximum points"))
            elif year == 2026:
                notes.append("Tags drawn in the 2026 drawing are not yet published: CDFW prints each year's deer drawing summary in the following year's Big Game Hunting Digest.")
        else:
            notes.append("CDFW does not publish the number of tags drawn for elk, pronghorn or bighorn sheep hunts. One hunt choice per application.")
        notes.insert(0, f"Quota split: {m['prefQuota']:,} preference-point tags, {m['randQuota']:,} random (draw-by-choice) tags.")
        if m["pointsOk"] and m["points"]:
            notes.append(f"{'First-choice a' if sp == 'mule-deer' else 'A'}pplicants by preference points (CDFW; 'a-b' = unrounded party point average between a and b): {fmt_pts(m['points'])}.")
        elif m.get("badDoc"):
            notes.append(f"Applicants by point value omitted: in CDFW's part for this point range (DocumentID {', '.join(m['badDoc'])}) the "
                         "preference-point-only row disagrees with the other parts, so its point columns cannot be relied on.")
        elif m["points"] and not any(m["points"].values()):
            notes.append("Applicants by point value omitted: CDFW's PDF prints 0 in every point column although the hunt has applicants.")
        elif m["points"]:
            notes.append("Applicants by point value omitted: the point columns in CDFW's PDF do not add up to the total applicants.")
        meth, mlabel = method_of(desc_txt)
        if sp == "sheep" and not meth:
            # every CDFW bighorn hunt is listed under "General Methods Hunts" (2026 digest; 2022-2023 PDF titles)
            meth, mlabel = "all", "General Method"
        rec = {"species": sp, "year": year, "huntCode": code, "units": units_of(sp, code, desc_txt), "description": description}
        if meth:
            rec["method"] = meth
            rec["methodLabel"] = mlabel
        sx = sex_of(desc_txt)
        if sx:
            rec["sex"] = sx
        rec["choice"] = "first" if sp == "mule-deer" else "all"
        rec["total"] = total
        rec["note"] = " ".join(notes)
        rec["sourceId"] = m["sid"]
        out[sp].append(rec)

    for yr, rows in digest_deer.items():
        for code in rows:
            if code not in used_digest[yr] and code not in PREF_ONLY:
                problems.append(f"digest {yr} deer row {code} has no drawing-statistics PDF row")

    dst = os.path.join(repo, "src/data/agency/california/draw")
    os.makedirs(dst, exist_ok=True)
    for sp, rows in out.items():
        with open(os.path.join(dst, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
            f.write("\n")
        yrs = sorted({r["year"] for r in rows})
        print(f"{sp}: {len(rows)} rows, years {yrs}")
    # side files for draw_meta.py (coverage notes / sources)
    side = {"prefOnly": {sp: v for sp, v in pref_only.items()},
            "groups": {sid: [{"docId": d["docId"], "title": d["title"], "url": d["url"], "year": d["year"]} for d in ds] for sid, ds in groups.items()},
            "maxPoints": maxpts, "elkSubspecies": {c: v for c, (v, _) in elk_sub.items()}}
    json.dump(side, open(os.path.join(raw, "build-side.json"), "w"), indent=1)
    print(f"{len(problems)} problems")
    for p in problems:
        print("PROBLEM", p)


if __name__ == "__main__":
    main()
