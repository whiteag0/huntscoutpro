#!/usr/bin/env python3
"""Parse NDOW harvest documents into src/data/agency/nevada/harvest/*.json and
src/data/agency/nevada/harvest-meta.json.

Usage (from repo root):
  python -I scripts/agency/nevada/harvest_download.py <raw_dir>
  python -I scripts/agency/nevada/harvest_parse.py <raw_dir> [<repo_root>]

Sources
-------
1. "<year> Nevada Big Game Hunt Data" workbooks (2020-2025): one row per hunt
   (hunt type x residency x weapon x unit group x season). These are the
   filterable editions of NDOW's "<Species> Harvest by Unit Group" PDFs; every
   row is emitted as published (no summing, no filling).
2. NDOW Big Game Status Book "Black Bear Harvest by Unit" tables (male/female
   per unit) for 2020-2025 seasons.
3. NDOW Big Game Status Book "Nevada Mountain Lion Tag Sales, Sport Harvest, and
   Hunter Success" table (statewide only).

Values from Status Book tables are small and printed either as text (parsed
from pdftotext output below, verified by harvest_verify.py) or, for the
2025-2026 edition, as a raster image; those few cells are transcribed in
STATUS_BOOK_IMAGE_VALUES with the page reference and were checked against the
agency's own row totals and percentages.
"""
import json
import os
import re
import sys

import openpyxl

RETRIEVED = "2026-10-31"
PUB = "Nevada Department of Wildlife"
HUNT_STATS_PAGE = "https://www.ndow.org/blog/hunt-statistics/"
LIBRARY_PAGE = "https://www.ndow.org/publications/?phrase=&category=other-hunt-statistics&orderby="
STATUS_PAGE = "https://www.ndow.org/publications/"

XLSX = {
    2020: "https://www.ndow.org/wp-content/uploads/2022/01/2020-Nevada-Big-Game-Hunt-Data-ADA-3.xlsx",
    2021: "https://www.ndow.org/wp-content/uploads/2022/03/2021-Nevada-Big-Game-Hunt-Data.xlsx",
    2022: "https://www.ndow.org/wp-content/uploads/2023/02/2022-Nevada-Big-Game-Hunt-Data.xlsx",
    2023: "https://www.ndow.org/wp-content/uploads/2024/02/2023-Nevada-Big-Game-Hunt-Data.xlsx",
    2024: "https://www.ndow.org/wp-content/uploads/2025/06/2024-Nevada-Big-Game-Hunt-Data.xlsx",
    2025: "https://www.ndow.org/wp-content/uploads/2026/03/2025-Nevada-Big-Game-Hunt-Data.xlsx",
}

SPECIES = {
    "Mule Deer": "mule-deer",
    "Elk": "elk",
    "Antelope": "pronghorn",
    "Black Bear": "bear",
    "Mountain Goat": "goat",
    "Moose": "moose",
}

WEAPON = {
    "ALW": ("all", "Any Legal Weapon"),
    "AR": ("archery", "Archery"),
    "M": ("muzzleloader", "Muzzleloader"),
    "SWR": ("other", "Seasonal Weapon Restriction"),
    "SWR-Prmtve": ("other", "Seasonal Weapon Restriction for Primitive Hunts (i.e., Archery, Muzzleloader)"),
    "WR": ("other", "Weapon Restriction"),
}

# Hunt types that are not public-draw tags; flagged in the row note.
NON_DRAW = [
    (re.compile(r"Damage Comp", re.I), "Landowner damage compensation tag (not available in the public draw)."),
    (re.compile(r"Depredation", re.I), "Elk depredation hunt (not a regular public-draw hunt)."),
    (re.compile(r"Incentive", re.I), "Elk incentive tag issued to landowners (not available in the public draw)."),
    (re.compile(r"Private Lands", re.I), "Private-lands antlerless elk hunt."),
    (re.compile(r"\bDream\b", re.I), "Dream Tag (raffle/auction tag, not the main draw)."),
    (re.compile(r"Silver State", re.I), "Silver State Tag (special drawing tag, not the main draw)."),
    (re.compile(r"\bPIW\b", re.I), "Partnership in Wildlife (PIW) tag."),
    (re.compile(r"Heritage", re.I), "Wildlife Heritage auction tag."),
]


def sex_of(hunt):
    h = hunt.lower()
    if "antlerless" in h and "antlered" in h:
        return "either"
    if "either sex" in h:
        return "either"
    if "antlerless" in h or " ewe" in h:
        return "female"
    if "antlered" in h or " ram" in h or "spike" in h:
        return "male"
    return None


def species_of(raw):
    s = (raw or "").strip()
    if s in SPECIES:
        return SPECIES[s]
    if "Bighorn" in s or "BHS" in s:
        return "sheep"
    raise ValueError(f"unknown species {raw!r}")


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return v
    raise ValueError(f"non-numeric {v!r}")


def clean(s):
    return re.sub(r"\s+", " ", str(s)).strip()


DROPPED = []


def parse_xlsx(path, year, source_id):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = [re.sub(r"\s+", " ", str(h)).strip() if h else "" for h in rows[0]]
    ix = {h: i for i, h in enumerate(head) if h}

    def g(r, *names):
        for n in names:
            if n in ix:
                return r[ix[n]]
        raise KeyError(names)

    out = []
    for r in rows[1:]:
        hunt = g(r, "Hunt")
        if not hunt:
            continue
        hunt = clean(hunt)
        sp = species_of(g(r, "Species"))
        weapon_raw = clean(g(r, "Weapon") or "")
        unit = clean(g(r, "Unit Group"))
        season = clean(g(r, "Season") or "")
        res_raw = clean(g(r, "Residency") or "")
        notes = []
        if weapon_raw not in WEAPON:
            if weapon_raw == "`" and year == 2023:
                # Stray backtick in the 2023 workbook for one row; the PDF edition prints ALW.
                weapon_raw = "ALW"
                notes.append("Weapon cell reads '`' in the NDOW workbook; the NDOW PDF edition prints ALW.")
            else:
                raise ValueError(f"unknown weapon {weapon_raw!r} in {year} {hunt} {unit}")
        method, method_label = WEAPON[weapon_raw]
        residency = {"R": "resident", "Res": "resident", "NR": "nonresident", "": "all"}[res_raw]
        if res_raw == "":
            notes.append("NDOW residency blank = mixed residency.")
        successful = num(g(r, "Successful Hunters"))
        if year == 2020:
            tags = num(g(r, "Hunters"))
            afield = None
            succ = num(g(r, "Success Rate"))
        else:
            tags = num(g(r, "Tags Issued"))
            afield = num(g(r, "Hunters Afield"))
            succ = num(g(r, "Success Rate", "Hunter Success"))
        for pat, msg in NON_DRAW:
            if pat.search(hunt):
                notes.append(msg)
                break
        if year == 2020:
            notes.append(
                "2020 report: NDOW did not publish Hunters Afield; 'Hunters' (tag holders) is stored as licenses and "
                "success = successful hunters / surveys returned."
            )
        rec = {
            "species": sp,
            "year": year,
            "unit": unit,
            "hunt": f"{hunt} ({season})" if season else hunt,
            "method": method,
            "methodLabel": method_label,
        }
        sx = sex_of(hunt)
        if sx:
            rec["sex"] = sx
        rec["residency"] = residency
        rec["hunters"] = afield
        rec["harvest"] = successful
        if succ is not None and succ > 1:
            rec["successPct"] = None
            notes.append(
                f"NDOW prints hunter success {round(succ * 100)}% ({successful} successful hunters vs {afield} hunters "
                "afield), which is internally inconsistent in the agency table; success left blank."
            )
        elif succ is not None:
            rec["successPct"] = round(succ * 100, 1)
        elif afield and successful is not None:
            rec["successPct"] = round(100 * successful / afield, 1)
            rec["successComputed"] = True
        else:
            rec["successPct"] = None
        rec["licenses"] = tags
        if notes:
            rec["note"] = " ".join(notes)
        rec["sourceId"] = source_id
        if rec["hunters"] is None and rec["harvest"] is None and rec["successPct"] is None:
            DROPPED.append((year, sp, unit, hunt, season, tags))
            continue  # tags only: no survey returns, NDOW published no hunter/harvest figures
        out.append(rec)
    return out


# ---------------------------------------------------------------- Status Books
STATUS_BOOKS = {
    # season year -> (source id, url, title, pdf file, text-parsable?)
    2020: ("h-nv-status-2020-21", "https://www.ndow.org/wp-content/uploads/2022/04/2020-21-BIG-GAME-STATUS-BOOK-COMPLETE1.pdf",
           "2020-2021 Nevada Big Game Status", "2020-21-BIG-GAME-STATUS-BOOK-COMPLETE1.pdf"),
    2021: ("h-nv-status-2021-22", "https://www.ndow.org/wp-content/uploads/2022/07/2021-2022-Big-Game-Status-Book.pdf",
           "2021-2022 Nevada Big Game Status", "2021-2022-Big-Game-Status-Book.pdf"),
    2022: ("h-nv-status-2022-23", "https://www.ndow.org/wp-content/uploads/2023/08/2022-23-Big-Game-Status-Book-1.pdf",
           "2022-2023 Nevada Big Game Status", "2022-23-Big-Game-Status-Book-1.pdf"),
    2023: ("h-nv-status-2023-24", "https://www.ndow.org/wp-content/uploads/2024/08/Big-Game-Status-Book_2024_web.pdf",
           "2023-2024 Nevada Big Game Status", "Big-Game-Status-Book_2024_web.pdf"),
    2024: ("h-nv-status-2024-25", "https://www.ndow.org/wp-content/uploads/2025/09/Big-Game-Status-Book-2025.pdf",
           "2024-2025 Nevada Big Game Status", "Big-Game-Status-Book-2025.pdf"),
    2025: ("h-nv-status-2025-26", "https://www.ndow.org/wp-content/uploads/2026/10/Big-Game-Status-Book_2026_10.2.26.pdf",
           "2025-2026 Nevada Big Game Status", "Big-Game-Status-Book_2026_10.2.26.pdf"),
}

# 2025-2026 Status Book prints its appendix tables as raster images (no text
# layer). Cells transcribed from p.155 (Table 14, Black Bear Harvest by Unit)
# and p.170 (Table 31, Mountain Lion). Only rows whose digits are unambiguous
# are used; each was checked against the table's own totals/percentages.
STATUS_BOOK_IMAGE_VALUES = {
    "bear2025": [  # unit, male, female, total
        ("192", 0, 0, 0), ("194", 0, 2, 2), ("195", 1, 1, 2), ("196", 0, 0, 0), ("201", 1, 1, 2),
        ("202", 0, 0, 0), ("203", 0, 0, 0), ("204", 0, 0, 0), ("206", 0, 0, 0), ("291", 3, 3, 6),
    ],
    "bear2025_total": (5, 7, 12),
    # season start year -> (res tags, nr tags, total tags, res harvest, nr harvest, total harvest, res%, nr%, total%)
    "lion": {
        2021: (7806, 631, 8437, 109, 66, 178, 1, 10, 2),
        2023: (7728, 600, 8328, 77, 71, 148, 1, 12, 2),
        2024: (5720, 472, 6192, 66, 43, 109, 1, 9, 2),
        2025: (8245, 362, 8607, 70, 51, 121, 1, 14, 1),
    },
}


def parse_bear_unit_table(txt_path):
    """Parse 'BLACK BEAR HARVEST BY UNIT' (unit, male, female, total) from pdftotext -layout output."""
    lines = open(txt_path, encoding="utf-8", errors="replace").read().splitlines()
    start = next(i for i, l in enumerate(lines) if "BLACK BEAR HARVEST BY UNIT" in l)
    # pdftotext may print another table on the same lines (to the left); only read the bear column
    col = max(0, lines[start].index("BLACK BEAR HARVEST BY UNIT") - 15)
    rows, total = [], None
    for l in lines[start + 1:start + 40]:
        m = re.search(r"(?:^|\s)(\d{3}|TOTAL)\s+(\d+)\s+(\d+)\s+(\d+)\b", l[col:])
        if not m:
            continue
        u, ma, fe, to = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
        if u == "TOTAL":
            total = (ma, fe, to)
            break
        rows.append((u, ma, fe, to))
    if total is None:
        raise ValueError(f"no TOTAL row in bear table {txt_path}")
    return rows, total


def bear_rows(raw_dir):
    out = []
    for year, (sid, *_rest) in STATUS_BOOKS.items():
        if year == 2025:
            rows, total = STATUS_BOOK_IMAGE_VALUES["bear2025"], STATUS_BOOK_IMAGE_VALUES["bear2025_total"]
            how = "Transcribed from the image table (Table 14) on p.155 of the 2025-2026 Status Book."
        else:
            txt = os.path.join(raw_dir, "txt", STATUS_BOOKS[year][3].replace(".pdf", ".txt"))
            rows, total = parse_bear_unit_table(txt)
            how = "From the Status Book table 'Black Bear Harvest by Unit'."
        sm = sum(r[1] for r in rows), sum(r[2] for r in rows), sum(r[3] for r in rows)
        if sm != total:
            raise ValueError(f"bear {year}: unit sum {sm} != TOTAL {total}")
        for u, ma, fe, to in rows:
            if ma + fe != to:
                raise ValueError(f"bear {year} unit {u}: {ma}+{fe} != {to}")
            out.append({
                "species": "bear", "year": year, "unit": u, "residency": "all",
                "hunters": None, "harvest": to, "harvestMale": ma, "harvestFemale": fe, "successPct": None,
                "note": "All black bear tags combined (NDOW does not publish hunters per single unit). " + how,
                "sourceId": sid,
            })
    return out


def parse_lion_text(txt_path):
    """Parse Table 30 (lion) of the 2024-2025 Status Book text: rows 'YYYY - YYYY a b c d e f g% h% i%'."""
    out = {}
    pat = re.compile(r"^\s*(\d{4}) - (\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+(\S+)\s+(\S+)\s+([\d,]+)\s+(\S+)\s+(\S+)\s+(\d+)%")
    for l in open(txt_path, encoding="utf-8", errors="replace"):
        m = pat.match(l)
        if not m:
            continue
        y = int(m.group(1))
        n = lambda s: None if s == "*" else int(s.replace(",", "").rstrip("%"))  # noqa: E731
        out[y] = tuple(n(m.group(k)) for k in range(3, 12))
    return out


def lion_rows(raw_dir):
    text_vals = parse_lion_text(os.path.join(raw_dir, "txt", "Big-Game-Status-Book-2025.txt"))
    out = []
    sid26 = STATUS_BOOKS[2025][0]
    for y, vals in sorted(STATUS_BOOK_IMAGE_VALUES["lion"].items()):
        if y in (2023, 2024):
            # machine-readable 2024-2025 edition; the 2025-2026 edition prints the same values
            if text_vals.get(y) != vals:
                raise ValueError(f"lion {y}: text {text_vals.get(y)} != transcription {vals}")
            sid = STATUS_BOOKS[2024][0]
        else:
            sid = sid26
        rt, nt, tt, rh, nh, th, rp, np_, tp = vals
        season = f"{y}-{y + 1} license year (Mar 1 {y} - end of Feb {y + 1})"
        base_note = (f"Statewide only; NDOW manages lions under a single statewide harvest limit. Season {season}. "
                     "licenses = lion tag sales; hunter success = harvest / tags sold (NDOW, whole percent).")
        if y == 2021:
            base_note += (" Values from the 2025-2026 Status Book, which revised this season (earlier editions printed "
                          "195 total with residency unavailable).")
        for res, lic, hv, pct in (("resident", rt, rh, rp), ("nonresident", nt, nh, np_), ("all", tt, th, tp)):
            out.append({
                "species": "lion", "year": y, "unit": "Statewide", "residency": res,
                "hunters": None, "harvest": hv, "successPct": pct, "licenses": lic,
                "note": base_note + (" Total may exceed resident + nonresident as published by NDOW." if res == "all" and rh + nh != th else ""),
                "sourceId": sid,
            })
    return out


def main():
    raw = sys.argv[1]
    repo = sys.argv[2] if len(sys.argv) > 2 else "."
    outdir = os.path.join(repo, "src/data/agency/nevada")
    os.makedirs(os.path.join(outdir, "harvest"), exist_ok=True)

    sources = []
    by_species = {}
    for year, url in XLSX.items():
        sid = f"h-nv-hunt-data-{year}"
        sources.append({
            "id": sid, "title": f"{year} Nevada Big Game Hunt Data (Hunt Summary)", "publisher": PUB, "url": url,
            "pageUrl": HUNT_STATS_PAGE if year >= 2022 else LIBRARY_PAGE, "dataYear": year, "retrieved": RETRIEVED,
            "notes": "NDOW marks these statistics 'Preliminary - Subject to Revision'. Same rows as the "
                     "'<Species> Harvest by Unit Group' PDFs for that year.",
        })
        for rec in parse_xlsx(os.path.join(raw, url.rsplit("/", 1)[1]), year, sid):
            by_species.setdefault(rec["species"], []).append(rec)

    for year, (sid, url, title, _f) in STATUS_BOOKS.items():
        sources.append({
            "id": sid, "title": title, "publisher": PUB, "url": url, "pageUrl": STATUS_PAGE, "dataYear": year,
            "retrieved": RETRIEVED,
            "notes": "Big Game Status Book; black bear harvest by unit and mountain lion tag sales/harvest tables."
                     + (" Appendix tables are printed as images." if year == 2025 else ""),
        })
    by_species.setdefault("bear", []).extend(bear_rows(raw))
    by_species["lion"] = lion_rows(raw)

    # PDF editions used for verification
    pdf_list = [l for l in open(os.path.join(os.path.dirname(__file__), "harvest_download.py")).read().split('"')
                if l.startswith("https://") and "Harvest-by-Unit" in l]
    for url in pdf_list:
        fn = url.rsplit("/", 1)[1]
        y = int(fn[:4])
        slug = re.sub(r"[^a-z0-9]+", "-", fn.lower().replace(".pdf", "")).strip("-")
        sources.append({
            "id": f"h-nv-pdf-{slug}", "title": f"{y} " + fn[5:].replace("-ADA", "").replace(".pdf", "").replace("-", " "),
            "publisher": PUB, "url": url, "pageUrl": HUNT_STATS_PAGE if y >= 2022 else LIBRARY_PAGE, "dataYear": y,
            "retrieved": RETRIEVED,
            "notes": "PDF edition of the hunt-data workbook rows; used to verify the parsed workbook values.",
        })

    order = {"all": 0, "rifle": 1, "archery": 2, "muzzleloader": 3, "shotgun": 4, "other": 5}
    counts = {}
    for sp, rows in by_species.items():
        rows.sort(key=lambda r: (-r["year"], r["unit"], r.get("hunt", ""), order.get(r.get("method", "all"), 9),
                                 r.get("residency", "")))
        with open(os.path.join(outdir, "harvest", f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
            f.write("\n")
        counts[sp] = len(rows)

    meta_path = os.path.join(outdir, "harvest-meta.json")
    meta = {"unitNames": UNIT_NAMES, "coverage": coverage(by_species), "sources": sources}
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(json.dumps(counts, indent=1))
    print(f"rows with tags only (no survey figures) omitted: {len(DROPPED)}")
    for d in DROPPED:
        print("   ", d)


# Names NDOW itself prints next to unit ids (2024-2025 Big Game Status Book, Table 12;
# black bear Areas from the bear narrative).
UNIT_NAMES = {
    "goat": {
        "101": "East Humboldt Range",
        "102": "Ruby Mountains",
        "103": "Pearl Peak Area, Southern Ruby Mountains",
    },
}


def coverage(by_species):
    def yrs(sp):
        return sorted({r["year"] for r in by_species.get(sp, [])})

    notes = {
        "mule-deer": "Per-hunt rows (hunt type x residency x weapon x unit group x season) exactly as NDOW publishes them, "
                     "2020-2025. Includes junior, nonresident-guided, landowner damage compensation, PIW, Dream, Silver State "
                     "and Heritage tags (flagged in note). Nevada has no separate whitetail hunt. 2020: Hunters Afield not "
                     "published (hunters = null; tag holders in licenses).",
        "elk": "Per-hunt rows 2020-2025 as published, incl. antlered/antlerless/spike plus depredation, incentive and "
               "private-lands hunts (flagged in note). 2020: Hunters Afield not published.",
        "pronghorn": "Per-hunt rows 2020-2025 ('Horns Longer/Shorter Than Ears', junior, damage-comp and special tags). "
                     "2020: Hunters Afield not published.",
        "sheep": "Desert, California and Rocky Mountain bighorn combined; the hunt name says which. Per-hunt rows 2020-2025. "
                 "Some special tags use 'Any Open Unit' or 'Unit restrictions see CR ...' as the unit, as published.",
        "goat": "Per-hunt rows 2020-2025 (units 101-103). Small samples (1-14 tags per hunt).",
        "moose": "Nevada's first moose season was 2024; one resident antlered hunt (2 tags) in 2024 and 2025.",
        "bear": "Two row types: (1) per-hunt rows from the hunt-data workbooks (one unit group, resident/nonresident, "
                "hunters afield, success) 2020-2025; (2) per-unit harvest by sex from the Status Book 'Black Bear Harvest by "
                "Unit' tables 2020-2025 (hunters per unit not published). 2025 unit table transcribed from an image table.",
        "lion": "Statewide only (single statewide harvest limit; NDOW publishes no unit-level lion harvest). Delivered: "
                "2021-22, 2023-24, 2024-25, 2025-26 license years (year = start year). Omitted 2020-21 and 2022-23: the latest "
                "edition (2025-2026 Status Book, Table 31) revised those seasons but prints them in a low-resolution image whose "
                "bold digits cannot be read with certainty, and earlier editions' figures are superseded (2020-21 also "
                "duplicated the 2018-19 row there). Hunters afield not published; licenses = tag sales.",
        "turkey": "No NDOW turkey harvest report (statewide or by unit) was found on ndow.org for 2020-2025; no rows delivered.",
        "whitetail": "Nevada has no white-tailed deer season.",
    }
    cov = []
    for sp in ["mule-deer", "elk", "pronghorn", "sheep", "goat", "moose", "bear", "lion", "turkey", "whitetail"]:
        cov.append({"species": sp, "years": yrs(sp), "notes": notes[sp]})
    return cov


if __name__ == "__main__":
    main()
