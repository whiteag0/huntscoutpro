#!/usr/bin/env python3
"""Parse Utah DWR drawing-odds sources into src/data/agency/utah/draw/<species>.json.

Usage:
  python -I scripts/agency/utah/draw_parse.py <raw_dir> <repo_root>

<raw_dir> is the folder filled by draw_fetch.py (pdf/*.txt from pdftotext -layout,
api/2026_*.json from the UDWR draw-odds system). Every count is copied from the
source. Only oddsPct is derived (drawn / applicants x 100, 2 decimals, the same
formula UDWR's own draw-odds page uses), and is flagged oddsComputed = true.
All counts are FIRST-CHOICE applications, as UDWR publishes them.
"""
import glob
import json
import os
import re
import sys

PREFIX_SPECIES = {
    "DB": "mule-deer", "DA": "mule-deer",
    "EB": "elk", "EA": "elk",
    "PB": "pronghorn", "PD": "pronghorn",
    "MB": "moose", "MA": "moose",
    "DS": "sheep", "RS": "sheep", "RE": "sheep",
    "GO": "goat",
    "BR": "bear",
    "TK": "turkey",
    "CG": "lion",
}
# BI (bison) is out of scope.

# PDF file -> (draw year, sourceId, note)
PDF_SOURCES = {}
for y in (2022, 2023, 2024, 2025):
    yy = str(y)[2:]
    PDF_SOURCES[f"{yy}_bg-odds.txt"] = (y, f"d-le-odds-{y}")
    PDF_SOURCES[f"{yy}_deer_odds.txt"] = (y, f"d-gen-deer-odds-{y}")
    PDF_SOURCES[f"{yy}_antlerless_drawing_odds_report.txt"] = (y, f"d-antlerless-odds-{y}")
    PDF_SOURCES[f"{yy}_bear.txt"] = (y, f"d-bear-odds-{y}")
    PDF_SOURCES[f"{y}_turkey.txt"] = (y, f"d-turkey-odds-{y}")
# Cougar: 2022_cougar_odds_report.pdf is "2022 Draw R" run 10/19/2021 (2021-22 season);
# 2023_cougar_odds_report.pdf is "2022 Draw 1" run 06/09/2022 (2022-23 season).
PDF_SOURCES["2022_cougar.txt"] = (2021, "d-cougar-odds-2021-22")
PDF_SOURCES["2023_cougar.txt"] = (2022, "d-cougar-odds-2022-23")

COUGAR_NOTE = {
    2021: "UDWR titles this report '2022 Draw R' (cougar 2021-22 season); the draw was run in October 2021, so it is filed under draw year 2021.",
    2022: "UDWR titles this report '2022 Draw 1' (cougar 2022-23 season, drawn June 2022).",
}

NUM = r"(\d[\d,]*)"
RATIO = r"((?:1 )?in [\d,]+\.\d+|N/A)"  # PDF sometimes clips the leading "1"
ROW_RE = re.compile(
    r"^\s*(\d+)\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + RATIO +
    r"\s+(\d+)\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + RATIO + r"\s*$")
TOT_RE = re.compile(
    r"^\s*Totals\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + RATIO +
    r"\s+Totals\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + RATIO + r"\s*$")
HUNT_RE = re.compile(r"^\s*Hunt:\s+([A-Z]{2}\d{4})\s+(.*?)\s*(Page\s+\d+)?\s*$")


def n(s):
    return int(s.replace(",", ""))


def method_of(label):
    l = label.lower()
    if "multiseason" in l or "multi-season" in l or "multi season" in l or " / " in l:
        return "all"
    if "any legal weapon" in l:
        return "all"
    if l in ("archery", "late archery", "early archery", "september archery", "extended archery"):
        return "archery"
    if l in ("muzzleloader", "restricted muzzleloader", "late muzzleloader", "early muzzleloader"):
        return "muzzleloader"
    if l == "restricted rifle":
        return "rifle"
    return "other"


def sex_of(code, desc):
    p = code[:2]
    d = desc.lower()
    if p in ("DA", "EA", "PD", "MA", "RE"):
        return "female"
    if p in ("DB", "EB", "PB", "MB"):
        return "male"
    if p in ("DS", "RS"):
        return None  # report does not state ram/ewe in every description
    return None


def odds(drawn, apps):
    if not apps:
        return None
    return round(100.0 * drawn / apps, 2)


def stats(apps, drawn, quota=None, min_pts=None):
    st = {}
    if quota is not None:
        st["quota"] = quota
    st["applicants"] = apps
    st["drawn"] = drawn
    o = odds(drawn, apps)
    st["oddsPct"] = o
    if o is not None:
        st["oddsComputed"] = True
    st["minPoints"] = min_pts
    return st


def pdf_headers(pdf_path):
    """Hunt header text via pdfplumber (pdftotext -layout inserts spurious spaces
    inside some words, e.g. 'An y Legal Weapon'). Returns {code: [desc, ...]} in page order."""
    import pdfplumber
    out = {}
    with pdfplumber.open(pdf_path) as pdf:
        for pg in pdf.pages:
            for ln in (pg.extract_text() or "").splitlines():
                m = re.match(r"^\s*Hunt:\s+([A-Z]{2}\d{4})\s+(.*?)\s*(Page\s+\d+)?\s*$", ln)
                if m:
                    out.setdefault(m.group(1), []).append(re.sub(r"\s+", " ", m.group(2)).strip())
    return out


def parse_pdf_text(path):
    """Yield dicts: code, desc, rows[(pts, rA, rB, rR, rT, nA, nB, nR, nT)], totals."""
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    cur = None
    out = []
    for ln in lines:
        m = HUNT_RE.match(ln)
        if m:
            if cur is not None:
                raise ValueError(f"{path}: hunt {cur['code']} has no Totals line")
            cur = {"code": m.group(1), "desc": re.sub(r"\s+", " ", m.group(2)).strip(), "rows": [], "tot": None}
            continue
        if cur is None:
            continue
        if "Species:" in ln:
            raise ValueError(f"{path}: Species header inside hunt {cur['code']}")
        m = ROW_RE.match(ln)
        if m:
            g = m.groups()
            pr, pn = int(g[0]), int(g[6])
            if pr != pn:
                raise ValueError(f"{path}: {cur['code']} point mismatch {pr} vs {pn}")
            cur["rows"].append((pr, n(g[1]), n(g[2]), n(g[3]), n(g[4]), n(g[7]), n(g[8]), n(g[9]), n(g[10])))
            continue
        m = TOT_RE.match(ln)
        if m:
            g = m.groups()
            cur["tot"] = (n(g[0]), n(g[1]), n(g[2]), n(g[3]), g[4], n(g[5]), n(g[6]), n(g[7]), n(g[8]), g[9])
            out.append(cur)
            cur = None
            continue
        s = ln.strip()
        if re.match(r"^\d+\s+\d", s):
            raise ValueError(f"{path}: unparsed numeric row in {cur['code']}: {ln!r}")
    if cur is not None:
        raise ValueError(f"{path}: trailing hunt {cur['code']} without Totals")
    return out


COLNAME = {1: "applicants", 2: "bonus permits", 3: "regular permits", 4: "total permits"}
ISSUES = []  # (file, code, text) — printed at the end for review


def check_hunt(h, path):
    """Internal consistency checks on the published table. Returns human-readable
    issues (agency-side arithmetic inconsistencies); values are kept as printed."""
    rows, t = h["rows"], h["tot"]
    issues = []
    for side, base, tbase in (("resident", 1, 0), ("nonresident", 5, 5)):
        for k in range(4):
            s = sum(r[base + k] for r in rows)
            if s != t[tbase + k]:
                issues.append(f"{side} {COLNAME[k + 1]} by point level sum to {s} but the published Totals line shows {t[tbase + k]}")
    for r in rows:
        if r[2] + r[3] != r[4]:
            issues.append(f"resident {r[0]}-point row shows bonus {r[2]} + regular {r[3]} but total {r[4]}")
        if r[6] + r[7] != r[8]:
            issues.append(f"nonresident {r[0]}-point row shows bonus {r[6]} + regular {r[7]} but total {r[8]}")
    for i in issues:
        ISSUES.append((os.path.basename(path), h["code"], i))
    return issues


WEAPON_RE = re.compile(r"^(Archery|Any Legal Weapon|Muzzleloader|Multiseason|Multi-season|Restricted|Shotgun|Hunter'?s? Choice|Spot|Pursuit|Spring|Summer|Fall|Early|Mid|Late|September|Extended|H\.a\.m\.s|Cwmu)", re.I)
HEADER_SPLIT = re.compile(r"\s+-\s*")  # UDWR separates fields with " - " or " -" (space before the dash)


def split_desc(code, desc, fname):
    """Return (units, methodLabel) from the published description, only when the
    description splits unambiguously; otherwise the field is left empty."""
    parts = [p.strip() for p in HEADER_SPLIT.split(desc)]
    has_w = len(parts) >= 2 and bool(WEAPON_RE.match(parts[-1]))
    if "bg-odds" in fname or "antlerless" in fname:
        # "<hunt type> - <unit> - <weapon>" or "<hunt type> - Early|Mid|Late - <unit> - <weapon>"
        if has_w and len(parts) == 3:
            return [parts[1]], parts[2]
        if has_w and len(parts) == 4 and parts[1] in ("Early", "Mid", "Late"):
            return [parts[2]], parts[3]
        if not has_w and len(parts) == 2:
            return [parts[1]], None
        return [], (parts[-1] if has_w else None)
    # "<unit> - <weapon>"
    if has_w and len(parts) == 2:
        return [parts[0]], parts[1]
    return [], (parts[-1] if has_w else None)


def min_points(rows, side_base):
    """Lowest point level where any permit was issued (total, or bonus+regular)."""
    lv = [r[0] for r in rows if r[side_base + 3] > 0 or r[side_base + 1] + r[side_base + 2] > 0]
    return min(lv) if lv else None


def pdf_records(raw):
    recs = []
    for fname, (year, sid) in PDF_SOURCES.items():
        path = os.path.join(raw, "pdf", fname)
        hunts = parse_pdf_text(path)
        if not hunts:
            raise ValueError(f"{fname}: no hunts parsed")
        cache = path[:-4] + ".headers.json"
        if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(path[:-4] + ".pdf"):
            heads = json.load(open(cache))
        else:
            heads = pdf_headers(path[:-4] + ".pdf")
            json.dump(heads, open(cache, "w"))
        seen_ct = {}
        for h in hunts:
            k = seen_ct.get(h["code"], 0)
            seen_ct[h["code"]] = k + 1
            lst = heads.get(h["code"], [])
            if k >= len(lst):
                raise ValueError(f"{fname}: no pdfplumber header for {h['code']}")
            if re.sub(r"\s", "", lst[k]) != re.sub(r"\s", "", h["desc"]):
                raise ValueError(f"{fname}: header mismatch {h['code']}: {lst[k]!r} vs {h['desc']!r}")
            h["desc"] = lst[k]
        for h in hunts:
            issues = check_hunt(h, fname)
            code, desc = h["code"], h["desc"]
            sp = PREFIX_SPECIES.get(code[:2])
            if sp is None:
                continue
            if fname.endswith("_bear.txt") and desc.lower().endswith("pursuit"):
                continue  # pursuit-only (no harvest) permits are out of scope
            rows, t = h["rows"], h["tot"]
            units, wlabel = split_desc(code, desc, fname)
            rec = {
                "species": sp,
                "year": year,
                "huntCode": code,
                "units": units,
                "description": desc,
            }
            if wlabel:
                rec["method"] = method_of(wlabel)
                rec["methodLabel"] = wlabel
            sx = sex_of(code, desc)
            if sx:
                rec["sex"] = sx
            rec["choice"] = "first"
            rec["resident"] = stats(t[0], t[3], None, min_points(rows, 1))
            rec["nonresident"] = stats(t[5], t[8], None, min_points(rows, 5))
            rec["total"] = stats(t[0] + t[5], t[3] + t[8])
            bp = []
            for r in sorted(rows, key=lambda r: -r[0]):
                if r[1] == 0 and r[5] == 0:
                    continue
                bp.append({"points": r[0],
                           "resident": {"applicants": r[1], "drawn": r[4]},
                           "nonresident": {"applicants": r[5], "drawn": r[8]}})
            if sp != "lion":
                rec["byPoints"] = bp
            note = "Counts are first-choice applications only, as published by UDWR. Drawn = total permits (max-point/bonus round + regular round). Quota not printed in this report."
            if sp == "lion":
                note += (" " + COUGAR_NOTE[year] + " Utah ended limited-entry cougar draws in 2023 (cougar now needs only a hunting license),"
                         " so point-level rows are not carried here; they are printed in the source report.")
            if "deer_odds" in fname:
                note += " Adult applicants only; UDWR publishes youth general-season deer results in a separate report."
            if "antlerless" in fname:
                note += " Antlerless draw (preference points for deer, elk and pronghorn; bonus points for moose and bighorn ewe)."
            if fname.endswith("_turkey.txt"):
                note += " Adult applicants only; UDWR publishes youth turkey results separately."
            if issues:
                note += (" Agency report inconsistency (values kept exactly as printed; headline counts use the printed Totals line): "
                         + "; ".join(issues) + ".")
            rec["note"] = note
            rec["sourceId"] = sid
            recs.append(rec)
    return recs


API_FILES = {
    "general_deer": "d-api-2026-general-deer",
    "le_deer": "d-api-2026-le-deer",
    "le_elk": "d-api-2026-le-elk",
    "le_pronghorn": "d-api-2026-le-pronghorn",
    "moose": "d-api-2026-moose",
    "desert_sheep": "d-api-2026-desert-sheep",
    "rm_sheep": "d-api-2026-rm-sheep",
    "goat": "d-api-2026-goat",
    "bear": "d-api-2026-bear",
    "turkey": "d-api-2026-turkey",
    "antlerless_deer": "d-api-2026-antlerless-deer",
    "antlerless_elk": "d-api-2026-antlerless-elk",
    "antlerless_moose": "d-api-2026-antlerless-moose",
    "doe_pronghorn": "d-api-2026-doe-pronghorn",
    "ewe_rm_sheep": "d-api-2026-ewe-sheep",
}


def season_str(sw):
    out = []
    for s in sw:
        w = "" if s.get("WeaponName") in (None, "", "No Weapon") else f" ({s['WeaponName']})"
        if s.get("UnCertainDateRange"):
            if (s.get("SpecialInstruction") or "").strip():
                out.append(s["SpecialInstruction"].strip() + w)
        else:
            out.append(f"{s['SeasonStartDate'][:10]} to {s['SeasonEndDate'][:10]}{w}")
    return "; ".join(out) if out else None


def api_records(raw):
    sup = json.load(open(os.path.join(raw, "api", "supplement.json")))["Data"]["DrawNameAvailableLicenseYears"]
    split_youth = {r["MasterHuntTypeID"]: r["DrawOddsCalculationSplitYouth"] for r in sup}
    recs = []
    for stem, sid in API_FILES.items():
        data = json.load(open(os.path.join(raw, "api", f"2026_{stem}.json")))["Data"]
        for h in data:
            if h["HuntCategoryName"] in ("Bonus Point", "Preference Point"):
                continue  # point-only application codes, not hunts
            code = h["HuntCode"]
            sp = PREFIX_SPECIES.get(code[:2])
            if sp is None:
                raise ValueError(f"{stem}: unknown prefix {code}")
            youth_split = split_youth.get(h["MasterHuntTypeID"], False)
            odds_rows = [o for o in h["OddsList"] if not (youth_split and o["IsYouth"])]
            if any(o.get("IsHistoricalData") for o in odds_rows):
                raise ValueError(f"{code}: historical rows")
            levels = {}
            for o in odds_rows:
                p = o["Point"]
                if p != int(p):
                    raise ValueError(f"{code}: fractional point {p}")
                p = int(p)
                side = "resident" if o["ResidencyTypeID"] == 1 else "nonresident" if o["ResidencyTypeID"] == 2 else None
                if side is None:
                    raise ValueError(f"{code}: residency {o['ResidencyTypeID']}")
                lv = levels.setdefault(p, {"resident": [0, 0], "nonresident": [0, 0]})
                lv[side][0] += o["ParticipantCount"]
                lv[side][1] += o["SuccessfulCount"]
            ra = sum(v["resident"][0] for v in levels.values())
            rd = sum(v["resident"][1] for v in levels.values())
            na = sum(v["nonresident"][0] for v in levels.values())
            nd = sum(v["nonresident"][1] for v in levels.values())
            rmin = min([p for p, v in levels.items() if v["resident"][1] > 0], default=None)
            nmin = min([p for p, v in levels.items() if v["nonresident"][1] > 0], default=None)
            sws = [s for s in (h.get("SeasonWeapons") or []) if s.get("WeaponName") != "No Weapon"]
            weapons = [s["WeaponName"] for s in sws]
            wl = " / ".join(dict.fromkeys(weapons)) if weapons else None
            desc = f"{h['SpeciesSubtypeName']} - {h['HuntName']}" + (f" - {wl}" if wl else "")
            rec = {"species": sp, "year": 2026, "huntCode": code, "units": [h["HuntName"]], "description": desc}
            if wl:
                rec["method"] = "all" if (h.get("IsMultiseasonHunt") or len(set(weapons)) > 1) else method_of(wl)
                rec["methodLabel"] = wl
            sx = sex_of(code, desc)
            if sx:
                rec["sex"] = sx
            ss = season_str(h.get("SeasonWeapons") or [])
            if ss:
                rec["seasonDates"] = ss
            rec["choice"] = "first"
            qr, qn, qt = h.get("ResidentQuotaQuantity"), h.get("NonResidentQuotaQuantity"), h.get("QuotaQuantity")
            area_quota = h.get("QuotaFromArea") is True
            if area_quota:
                # General-season deer: quota is an area-level figure shared with youth/other allocations;
                # it does not line up with first-choice permits drawn, so it is reported in the note only.
                rec["resident"] = stats(ra, rd, None, rmin)
                rec["nonresident"] = stats(na, nd, None, nmin)
                rec["total"] = stats(ra + na, rd + nd, None)
            else:
                rec["resident"] = stats(ra, rd, qr, rmin)
                rec["nonresident"] = stats(na, nd, qn, nmin)
                rec["total"] = stats(ra + na, rd + nd, qt)
            bp = []
            for p in sorted(levels, reverse=True):
                v = levels[p]
                if v["resident"][0] == 0 and v["nonresident"][0] == 0:
                    continue
                bp.append({"points": p,
                           "resident": {"applicants": v["resident"][0], "drawn": v["resident"][1]},
                           "nonresident": {"applicants": v["nonresident"][0], "drawn": v["nonresident"][1]}})
            rec["byPoints"] = bp
            note = ("2026 results from UDWR's online draw-odds system (utahdraws.com), which replaced the PDF report for 2026. "
                    "Counts are '1st Choice Apps' and '1st Choice Permits' as UDWR shows them; quotas are the hunt's published permit numbers. "
                    "Description is assembled from UDWR's species-subtype, hunt-name and weapon fields.")
            if youth_split:
                note += " Adult applicants only (UDWR reports youth applicants separately for this hunt type)."
                yq = h.get("YouthQuotaQuantity")
                if yq and not area_quota:
                    note += (f" The listed quota includes the youth allocation of {yq} permit(s), which are drawn among youth applicants "
                             "not counted here, so adult permits drawn can be below the listed quota.")
            if area_quota:
                note += (f" UDWR's draw-odds system lists an area quota for this general-season hunt (total {qt}, resident {qr}, nonresident {qn}; "
                         f"youth allocation {h.get('YouthQuotaQuantity')}); these do not reconcile with first-choice permits drawn, so quota fields are left empty.")
            else:
                if qt is not None and qr is not None and qn is not None and qt != qr + qn:
                    note += f" UDWR lists total quota {qt} vs resident {qr} + nonresident {qn}; the difference is not broken out on the draw-odds page."
                over = [f"{lab} drawn {d} exceeds listed quota {q}" for lab, d, q in (("resident", rd, qr), ("nonresident", nd, qn), ("total", rd + nd, qt))
                        if q is not None and d > q]
                if over:
                    note += " As published: " + "; ".join(over) + "."
            rec["note"] = note
            rec["sourceId"] = sid
            recs.append(rec)
    return recs


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    recs = pdf_records(raw) + api_records(raw)
    for f, c, i in ISSUES:
        print("AGENCY-INCONSISTENCY", f, c, i)
    out_dir = os.path.join(repo, "src/data/agency/utah/draw")
    os.makedirs(out_dir, exist_ok=True)
    by = {}
    for r in recs:
        by.setdefault(r["species"], []).append(r)
    for sp, rows in sorted(by.items()):
        rows.sort(key=lambda r: (r["year"], r["huntCode"]))
        p = os.path.join(out_dir, f"{sp}.json")
        with open(p, "w") as f:
            # one record per line keeps files diffable and well under the 6 MB limit
            f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n")
        years = sorted({r["year"] for r in rows})
        print(sp, len(rows), years, os.path.getsize(p))


if __name__ == "__main__":
    main()
