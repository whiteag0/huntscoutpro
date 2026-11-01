#!/usr/bin/env python3
"""South Dakota 2026 hunting season dates -> draw-meta.seasons[] and per-hunt season dates on
the 2026 draw rows.

Usage:  python -I scripts/agency/south-dakota/seasons_parse.py <raw_dir> <repo_root>

<raw_dir> is the folder written by seasons_fetch.py (GFP's 2026 application sheets as
pdftotext -layout text, plus the Key Dates page). Run after draw_parse.py and draw_meta.py.

GFP prints season dates per season on each application sheet, with unit exceptions in the
sheet's season-dates block or in the unit rows. Every printed date string used below (PRINTED /
the unit-row regexes) is looked up in the sheet text and the script stops if it is missing, so
a new edition of a sheet cannot silently reuse old dates. The strings are converted to ranges by
seasons_dates.parse. Draw rows are matched by GFP season (the huntCode's parenthesised season,
without the application-period suffix) and by the unit taken from the license code; seasons whose
dates GFP does not print on these sheets (municipal archery deer, archery deer and antelope
access permits, mountain lion dog-hunting access permit intervals) get no dates and are counted.

Writes <raw_dir>/seasons_report.json. Never hand-edit the JSON output.
"""
import json
import os
import re
import sys
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seasons_dates import parse as parse_dates  # noqa: E402

YEAR = 2026
DOC_SRC = {
    "2026elk": "d-sd-elk-2026", "2026westriverdeer-app": "d-sd-wrdeer-2026", "2026eastriverdeer-app": "d-sd-erdeer-2026",
    "2026blackhills-CSPdeer-app": "d-sd-bhdeer-2026", "2026muzzleloaderdeer-app": "d-sd-muzzdeer-2026",
    "2026refugedeer-app": "d-sd-refugedeer-2026", "2026specialbuck-app": "d-sd-specialbuck-2026",
    "nonresident-archery-deer-app": "d-sd-nrarchdeer-2026", "resident-archery-deer-app": "d-sd-resarchdeer-2026",
    "firearmsantelope": "d-sd-antelope-2026", "2026bhsheep": "d-sd-sheep-2026",
    "2026springturkey-prairie-app": "d-sd-springturkey-prairie-2026",
    "2026springturkey-AST_BST_CST_MST-app": "d-sd-springturkey-bh-2026", "fallturkey-app": "d-sd-fallturkey-2026",
    "2026mountainlion": "d-sd-lion-2026", "keydates": "d-sd-keydates",
}

# Printed season dates: key -> (sheet, printed text that must appear in the sheet, text to parse (default = printed)).
PRINTED = {
    "AEE": ("2026elk", "September 1-30, 2026", None),
    "PRE": ("2026elk", "September 1 - December 31, 2026", None),
    "BHE-A": ("2026elk", "H1A, H2A, H3A, H4A, H5A, H7A, and H9A", "October 1-31, 2026"),
    "BHE-H4B": ("2026elk", "October 1-31, 2026 AND December 1-16, 2026", None),
    "BHE-B1": ("2026elk", "October 15-31, 2026 AND December 1-16, 2026", None),
    "BHE-B2": ("2026elk", "H2B, H2E, H2H, H3B, and H3E", "October 15-31, 2026"),
    "BHE-C": ("2026elk", "H2C, H2F, H2I, H3C, and H3F", "December 1-16, 2026"),
    "BHE-G": ("2026elk", "December 17-31, 2026", None),
    "CAE-CU1": ("2026elk", "CU1 - October 15-31, 2026", None),
    "CAE-CU2": ("2026elk", "CU2 - December 1-16, 2026", None),
    "CEE": ("2026elk", "CSP Early Archery Elk (CEE)", "September 1-30, 2026"),
    "CUE": ("2026elk", "CSP Firearms Elk (CUE)", "October 1-31, 2026"),
    "WRD": ("2026westriverdeer-app", "November 14-29, 2026", None),
    "WRD-30A-1": ("2026westriverdeer-app", "30A, 1st Interval: November 7-10, 2026", None),
    "WRD-30A-2": ("2026westriverdeer-app", "30A, 2nd Interval: November 23-29, 2026", None),
    "WRD-58D": ("2026westriverdeer-app", "58D: November 21-22, 2026", None),
    "WRD-ANTLERLESS": ("2026westriverdeer-app", "designated as \"antlerless\" are valid from December 12-20.", "December 12-20"),
    "ERD": ("2026eastriverdeer-app", "November 21 - December 6, 2026", None),
    "ERD-ANTLERLESS": ("2026eastriverdeer-app", "designated as \"antlerless\" are valid from December 12-20.", "December 12-20"),
    "BHD": ("2026blackhills-CSPdeer-app", "November 1-30, 2026", None),
    "MUZZ": ("2026muzzleloaderdeer-app", "December 1, 2026 - January 1, 2027", None),
    "NRARCH-PRIVATE": ("nonresident-archery-deer-app", "September 1, 2026 - January 1, 2027", None),
    "NRARCH-PUBLIC": ("nonresident-archery-deer-app", "October 1, 2026 - January 1, 2027", None),
    "RESARCH": ("resident-archery-deer-app", "September 1, 2026 to January 1, 2027", None),
    "RESARCH-PARKS": ("resident-archery-deer-app", "October 1, 2026 - January 1, 2027", None),
    "WSD": ("2026specialbuck-app", "West River (WSD): November 14-29, 2026", None),
    "WSD-GREGORY": ("2026specialbuck-app", "Gregory County only: November 7-10, 14-29, 2026", None),
    "ESD": ("2026specialbuck-app", "East River (ESD): November 21, 2026 to", "November 21, 2026 to December 6, 2026"),
    "ANT": ("firearmsantelope", "October 3-18, 2026", None),
    "SHEEP": ("2026bhsheep", "September 1 - December 31, 2026", None),
    "PST": ("2026springturkey-prairie-app", "April 11, 2026 to May 31, 2026*", "April 11, 2026 to May 31, 2026"),
    "FALLT": ("fallturkey-app", "November 1, 2026 - January 31, 2027", None),
    "AP-ADAMS": ("2026springturkey-AST_BST_CST_MST-app", "Access Permit - Adams Homestead & 32 April 11 - 30, 2026", "April 11 - 30, 2026"),
    "AP-GOODEARTH": ("2026springturkey-AST_BST_CST_MST-app", "Access Permit - Good Earth SP Archery 32 April 11 - 30, 2026", "April 11 - 30, 2026"),
    "BST": ("2026springturkey-AST_BST_CST_MST-app", "BH1 Black Hills 32 April 25, 2026 to May 31, 2026", "April 25, 2026 to May 31, 2026"),
    "CST": ("2026springturkey-AST_BST_CST_MST-app", "CU1 Custer State Park 32 April 25, 2026 to May 17, 2026", "April 25, 2026 to May 17, 2026"),
    "AST": ("2026springturkey-AST_BST_CST_MST-app", "ST1 Archery 32 April 11, 2026 to May 31, 2026***", "April 11, 2026 to May 31, 2026"),
    "LION-BH": ("2026mountainlion", "December 26, 2025 to April 30, 2026", None),
    "LION-STATE": ("2026mountainlion", "December 26, 2025 to December 25, 2026", None),
}
# Also required in the sheet (second half of a split line / the unit list a date applies to)
ALSO = {"ESD": ["December 6, 2026"], "BHE-H4B": ["H4B"], "BHE-B1": ["H1B, H7B, and H9B"], "BHE-G": ["H2G, H2J, H3D, and H3G"],
        "BHE-A": ["October 1-31, 2026"], "BHE-B2": ["October 15-31, 2026"], "BHE-C": ["December 1-16, 2026"],
        "CEE": ["September 1-30, 2026"], "CUE": ["October 1-31, 2026"]}
# GFP Key Dates page entries used where the sheets print no season dates for that season.
KEYDATES = {
    "CUD": "Deer Season - Custer State Park",
    "ERLOL": "Deer Season - East River Nonresident Landowner",
    "ARCH-ANT-NR": "Antelope Season - Nonresident Archery Public/Private Land (Season closed during firearms season)",
    "ARCH-ANT": "Antelope Season - Archery (Season closed during firearms season)",
    "CSP-ANT": "Antelope Season - Custer State Park",
}

BHE_UNITS = {"BHE-A": ["H1A", "H2A", "H3A", "H4A", "H5A", "H7A", "H9A"], "BHE-H4B": ["H4B"], "BHE-B1": ["H1B", "H7B", "H9B"],
             "BHE-B2": ["H2B", "H2E", "H2H", "H3B", "H3E"], "BHE-C": ["H2C", "H2F", "H2I", "H3C", "H3F"],
             "BHE-G": ["H2G", "H2J", "H3D", "H3G"]}
# West/East River license types whose tags are all antlerless, and the any + antlerless combination types (08, 18)
ANTLERLESS_ONLY = {"03", "03P", "09P", "13", "13P", "19", "19P"}
ANTLERLESS_COMBO = {"08", "18"}


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def load_texts(raw):
    texts = {}
    for stem in DOC_SRC:
        if stem == "keydates":
            continue
        lines = open(os.path.join(raw, stem + ".txt"), encoding="utf-8").read().split("\n")
        texts[stem] = [norm(l) for l in lines]
    return texts


def load_keydates(raw):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(open(os.path.join(raw, "keydates.html"), encoding="utf-8").read(), "html.parser")
    for t in soup(["script", "style", "nav", "footer", "header"]):
        t.decompose()
    txt = (soup.find("main") or soup).get_text(" | ", strip=True)
    out = {}
    for m in re.finditer(r"(?:^|\| )([^|]+?) \| 2026 \| (?:Season Dates|Date Range) \| Start: \| ([A-Z][a-z]{2} \d{1,2}, \d{4}) \| End: \| ([A-Z][a-z]{2} \d{1,2}, \d{4})", txt):
        out[norm(m.group(1))] = (m.group(2), m.group(3))
    return out


def resolve(raw):
    texts = load_texts(raw)
    kd = load_keydates(raw)
    seasons = {}
    for key, (stem, printed, to_parse) in PRINTED.items():
        lines = texts[stem]
        need = [printed] + ALSO.get(key, [])
        for n in need:
            if not any(n in l for l in lines):
                raise SystemExit(f"{key}: {n!r} not found in {stem}.txt - the sheet changed; re-transcribe")
        shown = to_parse or printed
        seasons[key] = {"printed": shown, "ranges": parse_dates(shown, YEAR), "sid": DOC_SRC[stem]}
    for key, title in KEYDATES.items():
        if title not in kd:
            raise SystemExit(f"Key Dates entry {title!r} not found")
        s, e = kd[title]
        seasons[key] = {"printed": f"{s} - {e}", "ranges": parse_dates(f"{s} - {e}", YEAR), "sid": "d-sd-keydates", "title": title}
    # unit-row dates
    refuge = {}
    for l in texts["2026refugedeer-app"]:
        m = re.match(r"^(LC\d|SL\d|WA\d) (.+?) \(([^)]*\d{4})\)", l)
        if m:
            refuge[m.group(1)] = {"printed": m.group(3), "ranges": parse_dates(m.group(3), YEAR), "sid": DOC_SRC["2026refugedeer-app"],
                                  "area": m.group(2).rstrip(" -")}
    pst_exc = {}
    for l in texts["2026springturkey-prairie-app"]:
        for m in re.finditer(r"\b(\d\d[A-Z]) [A-Za-z/,. ]*?\(((?:Apr|May) \d{1,2} ?- ?\d{1,2})\)", l):
            pst_exc[m.group(1)] = {"printed": m.group(2), "ranges": parse_dates(m.group(2), YEAR), "sid": DOC_SRC["2026springturkey-prairie-app"]}
    if set(pst_exc) != {"08A", "08B", "44A", "44B", "58B"}:
        raise SystemExit(f"prairie spring turkey unit exceptions changed: {sorted(pst_exc)}")
    if len(refuge) != 8:
        raise SystemExit(f"refuge units changed: {sorted(refuge)}")
    return seasons, refuge, pst_exc


def seg(se, label=None, idx=None):
    rs = se["ranges"] if idx is None else [se["ranges"][idx]]
    return [{"start": s, "end": e, **({"label": label} if label else {})} for s, e in rs]


def hunt_dates(cat, code, unit, typ, S, refuge, pst_exc):
    """-> (seasonDates text, ranges, sourceId) or None."""
    if cat in ("Prairie Elk",):
        return S["PRE"]["printed"], seg(S["PRE"]), S["PRE"]["sid"]
    if cat == "Black Hills Archery Elk":
        return S["AEE"]["printed"], seg(S["AEE"]), S["AEE"]["sid"]
    if cat == "Black Hills Elk":
        for k, units in BHE_UNITS.items():
            if unit in units:
                return S[k]["printed"], seg(S[k]), S[k]["sid"]
        return None
    if cat == "Custer Elk":
        return S["CUE"]["printed"], seg(S["CUE"]), S["CUE"]["sid"]
    if cat == "Custer Early Archery Elk":
        return S["CEE"]["printed"], seg(S["CEE"]), S["CEE"]["sid"]
    if cat == "Custer Antlerless Elk":
        k = {"CU1": "CAE-CU1", "CU2": "CAE-CU2"}.get(unit)
        return (S[k]["printed"].split(" - ", 1)[1], seg(S[k]), S[k]["sid"]) if k else None
    if cat in ("West River Deer", "East River Deer"):
        base = "WRD" if cat.startswith("West") else "ERD"
        if base == "WRD" and unit == "30A":
            parts, rs = [S["WRD-30A-1"]["printed"], S["WRD-30A-2"]["printed"]], seg(S["WRD-30A-1"], "1st interval") + seg(S["WRD-30A-2"], "2nd interval")
            special = True
        elif base == "WRD" and unit == "58D":
            parts, rs, special = [S["WRD-58D"]["printed"]], seg(S["WRD-58D"]), True
        else:
            parts, rs, special = [S[base]["printed"]], seg(S[base], "Regular season"), False
        # The antlerless-only season applies to antlerless tags in every West River unit, 30A and
        # 58D included: the sheet lists no unit exception for it, and ARSD 41:06:20:01 opens it to
        # "any hunter possessing a valid antlerless deer or antlerless whitetail deer tag in any West
        # River unit".
        if typ in ANTLERLESS_ONLY | ANTLERLESS_COMBO:
            a = S[base + "-ANTLERLESS"]
            lab = "Antlerless-only season" + (" (antlerless tag only)" if typ in ANTLERLESS_COMBO else "")
            parts.append(f"{lab}: {a['printed']}")
            rs += seg(a, lab)
        return "; ".join(parts), rs, S[base]["sid"]
    if cat == "Black Hills Deer":
        return S["BHD"]["printed"], seg(S["BHD"]), S["BHD"]["sid"]
    if cat == "Custer Deer":
        return S["CUD"]["printed"], seg(S["CUD"]), S["CUD"]["sid"]
    if cat == "Muzzleloader Deer":
        return S["MUZZ"]["printed"], seg(S["MUZZ"]), S["MUZZ"]["sid"]
    if cat == "Nonresident Archery Deer Public & Private":
        return (f"Private Land: {S['NRARCH-PRIVATE']['printed']}; Public Land: {S['NRARCH-PUBLIC']['printed']}",
                seg(S["NRARCH-PRIVATE"], "Private land") + seg(S["NRARCH-PUBLIC"], "Public land (including private lands leased for hunting access by GFP)"),
                S["NRARCH-PRIVATE"]["sid"])
    if cat == "West River Special Buck":
        return (f"{S['WSD']['printed']}; {S['WSD-GREGORY']['printed']}",
                seg(S["WSD-GREGORY"], "Gregory County only", 0) + seg(S["WSD"], "West River (Gregory County included)"), S["WSD"]["sid"])
    if cat == "East River Special Buck":
        return "East River (ESD): " + S["ESD"]["printed"], seg(S["ESD"]), S["ESD"]["sid"]
    if cat == "East River Nonresident Landowner-Own-Land":
        return S["ERLOL"]["printed"], seg(S["ERLOL"]), S["ERLOL"]["sid"]
    if cat == "Refuge Deer":
        r = refuge.get(unit)
        return (r["printed"], seg(r), r["sid"]) if r else None
    if cat in ("Prairie Antelope", "Custer Antelope"):
        return S["ANT"]["printed"], seg(S["ANT"]), S["ANT"]["sid"]
    if cat == "Nonresident Archery Antelope PUBLIC & PRIVATE":
        a, f = S["ARCH-ANT-NR"], S["ANT"]
        (s, e), (fs, fe) = a["ranges"][0], f["ranges"][0]
        day = lambda iso, d: __import__("datetime").date.fromisoformat(iso).__add__(__import__("datetime").timedelta(days=d)).isoformat()
        rs = [{"start": s, "end": day(fs, -1), "label": "Archery (before the firearms season)"},
              {"start": day(fe, 1), "end": e, "label": "Archery (after the firearms season)"}]
        return f"{a['printed']} (season closed during firearms season, {f['printed']})", rs, a["sid"]
    if cat in ("Black Hills Bighorn Sheep", "Custer Bighorn Sheep"):
        return S["SHEEP"]["printed"], seg(S["SHEEP"]), S["SHEEP"]["sid"]
    if cat == "Prairie Fall Turkey":
        return S["FALLT"]["printed"], seg(S["FALLT"]), S["FALLT"]["sid"]
    if cat == "Prairie Spring Turkey":
        r = pst_exc.get(unit)
        if r:
            return r["printed"], seg(r), r["sid"]
        return S["PST"]["printed"], seg(S["PST"]), S["PST"]["sid"]
    if cat == "Access Permit Archery Spring Turkey":
        k = {"AP133": "AP-ADAMS", "GE133": "AP-GOODEARTH"}.get(code)
        return (S[k]["printed"], seg(S[k]), S[k]["sid"]) if k else None
    if cat == "Custer Spring Turkey":
        return S["CST"]["printed"], seg(S["CST"]), S["CST"]["sid"]
    if cat == "Nonresident Black Hills Spring Turkey":
        return S["BST"]["printed"], seg(S["BST"]), S["BST"]["sid"]
    return None


def build_seasons(S, refuge, pst_exc, sheet_units):
    out = []

    def add(species, label, key, method=None, units=None, note=None, idx=None, se=None, residency=None):
        se = se or S[key]
        rs = se["ranges"] if idx is None else [se["ranges"][idx]]
        for s, e in rs:
            d = {"species": species, "label": label}
            if method:
                d["method"] = method
            if units:
                d["units"] = units
            if residency:
                d["residency"] = residency
            d.update({"start": s, "end": e, "year": YEAR})
            if note:
                d["note"] = note
            d["sourceId"] = se["sid"]
            out.append(d)

    add("elk", "Black Hills Archery Elk (AEE)", "AEE", "archery", sheet_units["AEE"])
    add("elk", "Prairie Firearms Elk (PRE)", "PRE", units=sheet_units["PRE"])
    for k, units in BHE_UNITS.items():
        for i, (s, e) in enumerate(S[k]["ranges"]):
            add("elk", "Black Hills Firearms Elk - " + ", ".join(units) + (f" (interval {i + 1})" if len(S[k]["ranges"]) > 1 else ""), k,
                units=units, idx=i)
    add("elk", "Custer State Park Early Archery Elk (CEE)", "CEE", "archery", ["CU1"])
    add("elk", "Custer State Park Firearms Elk (CUE)", "CUE", units=["CU1"])
    add("elk", "CSP Special Antlerless Elk - CU1", "CAE-CU1", units=["CU1"])
    add("elk", "CSP Special Antlerless Elk - CU2", "CAE-CU2", units=["CU2"])
    add("pronghorn", "Firearms antelope (prairie units, Special Antelope, Custer State Park)", "ANT")
    add("pronghorn", "Archery antelope", "ARCH-ANT", "archery", note="Closed during the firearms antelope season (October 3-18, 2026).")
    add("pronghorn", "Nonresident archery antelope (public and private land)", "ARCH-ANT-NR", "archery", residency="nonresident",
        note="Closed during the firearms antelope season (October 3-18, 2026).")
    add("sheep", "Bighorn sheep (Black Hills BH2, BH4 and Custer State Park CU1)", "SHEEP", units=["BH2", "BH4", "CU1"])
    add("lion", "Mountain lion - Black Hills Fire Protection District", "LION-BH", note="Closes early if 60 lions or 40 females are harvested.")
    add("lion", "Mountain lion - statewide outside the Black Hills Fire Protection District", "LION-STATE")
    add("turkey", "Prairie spring turkey", "PST", note="Units 08A, 08B, 44A, 44B and 58B have their own dates; state parks and recreation areas close after April 30 unless specified otherwise in unit descriptions.")
    for u in ("08A", "44A", "58B", "08B", "44B"):
        add("turkey", f"Prairie spring turkey - unit {u}", None, units=[u], se=pst_exc[u])
    add("turkey", "Black Hills spring turkey (BH1)", "BST", units=["BH1"])
    add("turkey", "Custer State Park spring turkey (CU1)", "CST", units=["CU1"],
        note="Dates from the 2026 application sheet; GFP's Key Dates page lists Apr 25 - May 23, 2026.")
    add("turkey", "Spring archery turkey (ST1)", "AST", "archery", note="Archery and mentored hunters cannot hunt the Black Hills unit until April 25.")
    add("turkey", "Spring archery turkey access permits (Adams Homestead & Nature Preserve, Good Earth State Park)", "AP-ADAMS", "archery")
    add("turkey", "Prairie fall turkey", "FALLT")
    for sp in ("mule-deer", "whitetail"):
        add(sp, "West River deer", "WRD", note="Except units 30A and 58D.")
        add(sp, "West River deer - unit 30A (1st interval)", "WRD-30A-1", units=["30A"])
        add(sp, "West River deer - unit 30A (2nd interval)", "WRD-30A-2", units=["30A"])
        add(sp, "West River deer - unit 58D (wheelchair for mobility users only)", "WRD-58D", units=["58D"])
        add(sp, "East River deer", "ERD")
        add(sp, "Antlerless-only deer season (East and West River antlerless tags)", "WRD-ANTLERLESS",
            note="Only tags designated antlerless; any deer, any buck and any whitetail tags do not convert. Special Buck licenses are not valid.")
        add(sp, "Black Hills deer (BH1)", "BHD", units=["BH1"])
        add(sp, "Custer State Park deer (CU1)", "CUD", units=["CU1"])
        add(sp, "Muzzleloader deer", "MUZZ", "muzzleloader")
        add(sp, "Archery deer", "RESARCH", "archery",
            note="Some state parks, recreation areas, nature areas and lakeside use areas open October 1, 2026; nonresident archery on public land opens October 1, 2026.")
        add(sp, "West River Special Buck (WSD)", "WSD", note="Private land only.")
        add(sp, "West River Special Buck - Gregory County only (opening segment)", "WSD-GREGORY", idx=0,
            note="Gregory County only: November 7-10, 14-29, 2026.")
        add(sp, "East River Special Buck (ESD)", "ESD", note="Private land only.")
        add(sp, "East River nonresident landowner-own-land deer", "ERLOL")
        for u in sorted(refuge):
            add(sp, f"National Wildlife Refuge deer - {u} {refuge[u]['area']}", None,
                "muzzleloader" if "muzzleloader only" in refuge[u]["area"].lower() or "muzzeloader only" in refuge[u]["area"].lower() else None,
                units=[u], se=refuge[u])
    return out


CAT_RE = re.compile(r"^(?P<code>\S+) \((?P<cat>.+?)(?:, (?:Second|Third|Fourth|Fifth) Application Period)?\)$")


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    base = os.path.join(repo, "src/data/agency/south-dakota")
    S, refuge, pst_exc = resolve(raw)
    report = {"matched": {}, "total2026": {}, "unmatched": {}}
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "goat", "lion", "turkey"]:
        path = os.path.join(base, "draw", f"{sp}.json")
        rows = json.load(open(path))
        n = m = 0
        unmatched = []
        for i, row in enumerate(rows):
            for k in ("seasonDates", "seasonRanges", "seasonSourceId"):
                row.pop(k, None)
            if row["year"] != YEAR:
                continue
            n += 1
            cm = CAT_RE.match(row["huntCode"])
            code, cat = cm["code"], cm["cat"]
            unit = row["units"][0] if row["units"] else None
            typ = code[3:] if unit and code.startswith(unit) else None
            got = hunt_dates(cat, code, unit, typ, S, refuge, pst_exc)
            if not got:
                unmatched.append(row["huntCode"])
                continue
            text, ranges, sid = got
            out = OrderedDict()
            for k, v in row.items():
                if k == "choice":
                    out["seasonDates"] = text
                    out["seasonRanges"] = ranges
                    out["seasonSourceId"] = sid
                out[k] = v
            rows[i] = dict(out)
            m += 1
        with open(path, "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=False) for r in rows) + "\n]\n")
        report["matched"][sp], report["total2026"][sp], report["unmatched"][sp] = m, n, unmatched
        print(f"{sp}: {m}/{n} 2026 rows with season dates; no published dates: {unmatched}")
    elk_lines = load_texts(raw)["2026elk"]
    sheet_units = {k: sorted({m for l in elk_lines for m in re.findall(rf"\b{k}-([A-Z0-9]{{3}})\b", l)}) for k in ("AEE", "PRE")}
    seasons = build_seasons(S, refuge, pst_exc, sheet_units)
    mpath = os.path.join(base, "draw-meta.json")
    meta = json.load(open(mpath))
    meta["seasons"] = seasons
    with open(mpath, "w") as f:
        json.dump(meta, f, indent=1)
    report["seasons"] = len(seasons)
    json.dump(report, open(os.path.join(raw, "seasons_report.json"), "w"), indent=1)
    print("seasons[]:", len(seasons))


if __name__ == "__main__":
    main()
