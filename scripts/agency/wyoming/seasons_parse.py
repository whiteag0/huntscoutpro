#!/usr/bin/env python3
"""Wyoming 2026 hunting season dates -> draw-meta.seasons[] and per-hunt season dates on the
2026 draw rows.

Usage:  python -I scripts/agency/wyoming/seasons_parse.py <raw_dir> <repo_root>

<raw_dir> is the folder written by seasons_fetch.py. Run after draw_parse.py and draw_meta.py
(both rewrite the files this script edits). It

  * reads the hunt-area tables of Commission Chapters 5 (antelope), 6 (deer), 7 (elk),
    8 (moose), 9 (bighorn sheep, mountain goat) and 20 (wild turkey) with seasons_tables.py,
    and the black bear (Chapter 3, Section 9) and mountain lion (Chapter 42, Section 3(i))
    tables from the pdftotext layout text;
  * for every 2026 draw row whose hunt code is <area>-<type> (plus " (NR Special)" or the
    turkey " (Spring)"/" (Fall)" suffix) sets seasonDates (the chapter's dates, as printed),
    seasonRanges (one YYYY-MM-DD range per printed segment) and seasonSourceId. A row matches
    when the chapter lists that license type for a hunt-area list whose first area is the
    hunt code's area (WGFD numbers multi-area hunts by their first area, e.g. "9, 10  Type 7"
    = 009-7). Region general (A, B, ..., GEN) codes, and codes the chapter does not list, get
    no dates and are counted in the report;
  * replaces draw-meta.seasons[] with the chapter seasons grouped by species, license class
    (general / limited quota), segment (special archery / regular) and dates, each with the
    hunt areas (units, as printed) and, for limited quota, the hunt codes;
  * adds the season SourceRefs to draw-meta.sources.

Years: the chapters print month and day only. The big game chapters (dated April 22, 2026)
are the 2026 seasons: Aug-Dec dates are 2026 and Jan-Mar dates are 2027 (a close date earlier
in the year than its open date is in the next year). Chapter 20 (April 22, 2026) prints the
"2026 Fall Season" and "2027 Spring Season"; the April 23, 2025 Chapter 20 prints the
"2026 Spring Season" used for the 2026 spring turkey draw rows. Black bear (Chapter 3, January 13,
2026; 2026 Black Bear Regulations) seasons are 2026. Mountain lion (Chapter 42, July 16, 2025,
reprinted in the 2026 Mountain Lion Regulations dated August 2026) seasons open September 1,
2026 and close in 2027.

Writes <raw_dir>/seasons_report.json (counts, unmatched codes). Never hand-edit the JSON output.
"""
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seasons_tables import MONTHS, parse_tables, split_areas  # noqa: E402

R = "2026-10-31"
P = "Wyoming Game and Fish Commission"
W = "https://wgfd.wyo.gov"
REGS = f"{W}/regulations"

SOURCES = [
    {"id": "d-wy-ch5-antelope", "title": "Chapter 5 - Antelope Hunting Seasons", "publisher": P,
     "url": f"{W}/media/33693/download", "pageUrl": REGS, "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated April 22, 2026; Section 2 hunt areas, season dates and limitations (dates printed without a year)"},
    {"id": "d-wy-ch6-deer", "title": "Chapter 6 - Deer Hunting Seasons", "publisher": P,
     "url": f"{W}/media/33694/download", "pageUrl": REGS, "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated April 22, 2026; Section 2 hunt areas, season dates and limitations (dates printed without a year)"},
    {"id": "d-wy-ch7-elk", "title": "Chapter 7 - Elk Hunting Seasons", "publisher": P,
     "url": f"{W}/media/33695/download", "pageUrl": REGS, "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated April 22, 2026; Section 2 hunt areas, season dates and limitations (dates printed without a year)"},
    {"id": "d-wy-ch8-moose", "title": "Chapter 8 - Moose Hunting Seasons", "publisher": P,
     "url": f"{W}/media/33696/download", "pageUrl": REGS, "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated April 22, 2026; Section 2 hunt areas, season dates and limitations (dates printed without a year)"},
    {"id": "d-wy-ch9-sheep-goat", "title": "Chapter 9 - Bighorn Sheep and Mountain Goat Hunting Seasons", "publisher": P,
     "url": f"{W}/media/33697/download", "pageUrl": REGS, "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated April 22, 2026; Sections 3 (bighorn sheep) and 7 (mountain goat) (dates printed without a year)"},
    {"id": "d-wy-ch20-wild-turkey-2025", "title": "Chapter 20 - Wild Turkey Hunting Seasons (2025 fall / 2026 spring)", "publisher": P,
     "url": "https://web.archive.org/web/2026id_/https://wgfd.wyo.gov/media/32329/download", "pageUrl": REGS, "dataYear": 2026,
     "retrieved": R,
     "notes": ("Commission regulation dated April 23, 2025, Section 2(g) 2026 Spring Season. WGFD no longer serves media 32329 (HTTP 404 on "
               "2026-10-31); Internet Archive copy of the WGFD file. The same 2026 spring table is printed in WGFD's 2025 Game Bird & Small Game, "
               "Migratory Game Bird and Wild Turkey brochure (https://wgfd.wyo.gov/media/32876/download)")},
    {"id": "d-wy-2026-mountain-lion-brochure", "title": "2026 Mountain Lion Regulations", "publisher": P,
     "url": f"{W}/media/34092/download", "pageUrl": REGS, "dataYear": 2026, "retrieved": R,
     "notes": "Brochure (PDF created August 11, 2026) reprinting Chapter 42 Section 3(i) hunt areas and season dates (no year printed)"},
]

# chapter file -> [(table index, sourceId, species tag)]
BIG = [
    ("m33693.pdf", [(0, "d-wy-ch5-antelope", "pronghorn")]),
    ("m33694.pdf", [(0, "d-wy-ch6-deer", "deer")]),
    ("m33695.pdf", [(0, "d-wy-ch7-elk", "elk")]),
    ("m33696.pdf", [(0, "d-wy-ch8-moose", "moose")]),
    ("m33697.pdf", [(0, "d-wy-ch9-sheep-goat", "sheep"), (1, "d-wy-ch9-sheep-goat", "goat")]),
]
TURKEY_NEW = "d-wy-ch20-wild-turkey"       # Apr 22, 2026: table 0 = 2026 fall, table 1 = 2027 spring
TURKEY_OLD = "d-wy-ch20-wild-turkey-2025"  # Apr 23, 2025: table 1 = 2026 spring
BEAR = "d-wy-ch3-black-bear"
LION = "d-wy-ch42-mountain-lion"
SPECIES_LABEL = {"pronghorn": "Antelope", "elk": "Elk", "moose": "Moose", "sheep": "Bighorn sheep", "goat": "Mountain goat",
                 "mule-deer": "Deer", "whitetail": "Deer", "turkey": "Wild turkey"}
DRAW_FILE_CHAPTER = {"elk": "elk", "mule-deer": "deer", "whitetail": "deer", "pronghorn": "pronghorn", "moose": "moose",
                     "sheep": "sheep", "goat": "goat"}


def iso(year, mo, d):
    return f"{year:04d}-{mo:02d}-{d:02d}"


def fall_range(o, c, base=2026):
    """Big game/fall dates: Aug-Dec = base year, Jan-Mar = base+1."""
    def yr(mo):
        if mo >= 8:
            return base
        if mo <= 3:
            return base + 1
        raise ValueError(f"unexpected month {mo} in a {base} fall season")
    s = iso(yr(o[0]), o[0], o[1])
    e = iso(yr(c[0]), c[0], c[1])
    if s > e:
        raise ValueError(f"range {s} > {e}")
    return s, e


def spring_range(o, c, year):
    s, e = iso(year, o[0], o[1]), iso(year, c[0], c[1])
    if s > e:
        raise ValueError(f"range {s} > {e}")
    return s, e


def deer_species(lim):
    """Which HuntScout species a Chapter 6 row applies to, from its limitation text."""
    t = lim.lower()
    wt = "white-tailed" in t
    md = "mule deer" in t
    other = re.sub(r"(any |antlered |doe or fawn )?white-tailed deer|(any |antlered )?mule deer", "", t)
    generic = "deer" in other  # e.g. "Antlered deer", "Any deer", "Doe or fawn"
    if "doe or fawn" in t and not wt and not md:
        generic = True
    if wt and not md and not generic:
        return ["whitetail"]
    if md and not wt and not generic:
        return ["mule-deer"]
    return ["mule-deer", "whitetail"]


def segments(row, rng, single=False):
    """Printed segments of one chapter row -> [(kind, start, end, printed, limitation)].
    single=True for Chapter 20, whose tables have one 'Season Dates' column."""
    out = []
    for kind in ("archery", "regular"):
        seg = row.get(kind)
        if not seg:
            continue
        o, c = seg
        s, e = rng(o, c)
        out.append({"kind": "season" if single else kind, "start": s, "end": e, "printed": f"{o[2]} - {c[2]}",
                    "limitation": row["limitation"]})
    return out


def load_big(raw):
    """-> rows: list of dict(chapter species tag, sourceId, areas, type, segs, limitation, quota, page)."""
    rows = []
    for fname, specs in BIG:
        tables = parse_tables(os.path.join(raw, fname))
        for ti, sid, tag in specs:
            for r in tables[ti]:
                if r["closed"]:
                    continue
                rows.append({"tag": tag, "sourceId": sid, "areas": split_areas(r["area"]), "areaText": r["area"],
                             "type": r["type"], "segs": segments(r, fall_range), "limitation": r["limitation"],
                             "quota": r["quota"], "page": r["page"], "file": fname})
    return rows


def load_turkey(raw):
    new = parse_tables(os.path.join(raw, "m33701.pdf"))
    old = parse_tables(os.path.join(raw, "wb_m32329.pdf"))
    out = []
    for season, table, sid, rng in (("Fall", new[0], TURKEY_NEW, lambda o, c: fall_range(o, c, 2026)),
                                    ("Spring2027", new[1], TURKEY_NEW, lambda o, c: spring_range(o, c, 2027)),
                                    ("Spring", old[1], TURKEY_OLD, lambda o, c: spring_range(o, c, 2026))):
        for r in table:
            out.append({"tag": "turkey", "season": season, "sourceId": sid, "areas": split_areas(r["area"]),
                        "areaText": r["area"], "type": r["type"], "segs": segments(r, rng, single=True), "limitation": r["limitation"],
                        "quota": r["quota"], "page": r["page"]})
    return out


# ---------------- black bear (Chapter 3, Section 9) ----------------
MON = r"(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?"
RANGE_RE = re.compile(rf"({MON})\s+(\d{{1,2}})\s*[-–]\s*(?:({MON})\s+)?(\d{{1,2}})")


def _mo(tok):
    return MONTHS[tok.rstrip(".").lower()[:3]]


def parse_bear(txt_path):
    lines = open(txt_path, encoding="utf-8").read().split("\n")
    start = next(i for i, l in enumerate(lines) if "Section 9." in l and "Hunt Areas, Season Dates" in l)
    end = next(i for i, l in enumerate(lines) if i > start and "Section 10." in l)
    recs, cur = [], None
    reg_col = None
    for l in lines[start:end]:
        if "Regular Season" in l:
            reg_col = l.index("Regular Season") - 2
            continue
        if not l.strip() or re.match(r"^\s*\d+-\d+\s*$", l) or "Hunt Area(s)" in l or l.strip().startswith(("Dates", "Section 9", "*Annual")):
            continue
        m = re.match(r"^\s*(\d[\d,\s]*?)(?=\s{2,}|$)", l)
        area_txt = m.group(1).strip() if m and m.start(1) < 6 else None
        if area_txt:
            if cur and cur["area"].endswith(","):
                cur["area"] += " " + area_txt
            else:
                cur = {"area": area_txt, "segs": []}
                recs.append(cur)
        ranges = list(RANGE_RE.finditer(l))
        for rm in ranges:
            mo1, d1, mo2, d2 = rm.group(1), int(rm.group(2)), rm.group(3) or rm.group(1), int(rm.group(4))
            kind = "archery" if rm.start() < reg_col else "regular"
            s, e = iso(2026, _mo(mo1), d1), iso(2026, _mo(mo2), d2)
            if s > e:
                raise ValueError(f"bear range {rm.group(0)}")
            cur["segs"].append({"kind": kind, "start": s, "end": e, "printed": rm.group(0), "note": ""})
        blank = l
        for rm in ranges:
            blank = blank[:rm.start()] + " " * (rm.end() - rm.start()) + blank[rm.end():]
        tail = blank[reg_col:] if reg_col else ""
        tail = re.sub(r"\d+\s+(Spring|Fall)\*?", "", tail).strip(" ,")
        if tail and cur and cur["segs"]:
            last = cur["segs"][-1]
            last["note"] = (last["note"] + " " + tail).strip()
    for r in recs:
        r["areas"] = split_areas(r["area"])
    return recs


# ---------------- mountain lion (Chapter 42, Section 3(i)) ----------------
def parse_lion(txt_path):
    lines = open(txt_path, encoding="utf-8").read().split("\n")
    start = next(i for i, l in enumerate(lines) if "Hunt Areas, Season Dates and Limitations." in l)
    end = next(i for i, l in enumerate(lines) if i > start and "(j)" in l)
    recs, cur = [], None
    for l in lines[start + 1:end]:
        rms = list(RANGE_RE.finditer(l))
        if not rms:
            continue
        m = re.match(r"^\s*(\d{1,2})\s{2,}", l)
        if m:
            cur = {"area": m.group(1), "segs": []}
            recs.append(cur)
        for rm in rms:
            mo1, d1, mo2, d2 = _mo(rm.group(1)), int(rm.group(2)), _mo(rm.group(3) or rm.group(1)), int(rm.group(4))
            y1 = 2026 if mo1 >= 9 else 2027
            y2 = 2026 if (mo2 >= 9 and y1 == 2026) else 2027
            s, e = iso(y1, mo1, d1), iso(y2, mo2, d2)
            if s > e:
                raise ValueError(f"lion range {rm.group(0)}")
            note = "Valid off national forest" if "Valid off national forest" in l else ""
            cur["segs"].append({"kind": "regular", "start": s, "end": e, "printed": rm.group(0).replace("–", "-"), "note": note})
    return recs


def fmt_dates(segs, multi_lim):
    parts = []
    for s in segs:
        p = ("Special archery " if s["kind"] == "archery" else "") + s["printed"]
        if multi_lim:
            p += f" ({s['limitation']})"
        parts.append(p)
    return "; ".join(parts)


def range_label(s):
    lab = {"archery": "Special archery", "regular": "Regular season", "season": "Season"}[s["kind"]]
    return f"{lab}: {s['limitation']}" if s["limitation"] else lab


CODE_RE = re.compile(r"^(\d{3})-(\d)(?: \(NR Special\))?$")
TURKEY_RE = re.compile(r"^(?:(\d{3})-(\d)|GEN) \((Spring|Fall)\)$")


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    base = os.path.join(repo, "src/data/agency/wyoming")
    big = load_big(raw)
    turkey = load_turkey(raw)

    # index: (tag, first area, type) -> rows in chapter order; also any-area index for diagnostics
    first_idx, any_idx = defaultdict(list), defaultdict(list)
    for r in big + turkey:
        key_tag = r["tag"] if r["tag"] != "turkey" else ("turkey", r["season"])
        first_idx[(key_tag, r["areas"][0], r["type"])].append(r)
        for a in r["areas"][1:]:
            any_idx[(key_tag, a, r["type"])].append(r)

    report = {"matched": {}, "total2026": {}, "unmatched": {}, "nonFirstArea": {}}
    code_for = {}  # (tag, areas tuple, type) -> draw hunt code (for seasons[] huntCodes)
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "turkey"]:
        path = os.path.join(base, "draw", f"{sp}.json")
        rows = json.load(open(path))
        n = m = 0
        unmatched, nonfirst = [], []
        for i, row in enumerate(rows):
            for k in ("seasonDates", "seasonRanges", "seasonSourceId"):
                row.pop(k, None)
            if row["year"] != 2026:
                continue
            n += 1
            code = row["huntCode"]
            if sp == "turkey":
                tm = TURKEY_RE.match(code)
                if not tm:
                    unmatched.append(code)
                    continue
                area = str(int(tm.group(1))) if tm.group(1) else "1"
                typ = tm.group(2) or "Gen"
                key = (("turkey", tm.group(3)), area, typ)
            else:
                cm = CODE_RE.match(code)
                if not cm:
                    unmatched.append(code)
                    continue
                area, typ = str(int(cm.group(1))), cm.group(2)
                key = (DRAW_FILE_CHAPTER[sp], area, typ)
            hits = first_idx.get(key, [])
            if not hits:
                (nonfirst if key in any_idx else unmatched).append(code)
                continue
            if len({tuple(h["areas"]) for h in hits}) != 1:
                raise ValueError(f"{sp} {code}: several area lists {[h['areaText'] for h in hits]}")
            segs = [s for h in hits for s in h["segs"]]
            lims = {s["limitation"] for s in segs}
            row_out = OrderedDict()
            for k, v in row.items():
                if k == "choice":
                    row_out["seasonDates"] = fmt_dates(segs, len(lims) > 1)
                    row_out["seasonRanges"] = [{"start": s["start"], "end": s["end"], "label": range_label(s)} for s in segs]
                    row_out["seasonSourceId"] = hits[0]["sourceId"]
                row_out[k] = v
            rows[i] = dict(row_out)
            m += 1
            code_for[(key[0], tuple(hits[0]["areas"]), typ)] = re.sub(r" \(NR Special\)$", "", code)
        with open(path, "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=False) for r in rows) + "\n]\n")
        report["matched"][sp], report["total2026"][sp] = m, n
        report["unmatched"][sp], report["nonFirstArea"][sp] = unmatched, nonfirst
        print(f"{sp}: {m}/{n} 2026 rows with season dates; unmatched {len(unmatched)}, non-first-area {len(nonfirst)}")

    # ---------------- seasons[] ----------------
    groups = OrderedDict()

    def add(species, label, method, start, end, year, unit, code, sid, note=None):
        k = (species, label, method, start, end, sid)
        g = groups.setdefault(k, {"units": [], "codes": [], "notes": [], "year": year})
        if unit and unit not in g["units"]:
            g["units"].append(unit)
        if code and code not in g["codes"]:
            g["codes"].append(code)
        if note and note not in g["notes"]:
            g["notes"].append(note)

    for r in big:
        sps = deer_species(r["limitation"]) if r["tag"] == "deer" else [r["tag"]]
        gen = r["type"].startswith("Gen")
        youth = "Youth" in r["type"]
        for s in r["segs"]:
            archery = s["kind"] == "archery" or "archery only" in r["limitation"].lower()
            for sp in sps:
                name = SPECIES_LABEL[sp]
                if gen:
                    cls = f"{name} general license" + (" (youth only)" if youth else "")
                elif r["type"]:
                    cls = f"{name} limited quota"
                else:
                    cls = f"{name} general and unused limited quota licenses"
                label = f"{cls} - {'special archery season' if s['kind'] == 'archery' else 'regular season'}"
                code = None
                if not gen and r["type"]:
                    code = code_for.get((DRAW_FILE_CHAPTER[sp], tuple(r["areas"]), r["type"])) or f"{int(r['areas'][0]):03d}-{r['type']}"
                for a in r["areas"]:
                    add(sp, label, "archery" if archery else None, s["start"], s["end"], 2026, a, code, r["sourceId"])
    for r in turkey:
        if r["season"] == "Spring":
            continue  # 2026 spring (past); kept on the 2026 spring draw rows only
        year = 2026 if r["season"] == "Fall" else 2027
        season = "fall" if r["season"] == "Fall" else "spring"
        for s in r["segs"]:
            archery = "archery only" in r["limitation"].lower()
            cls = "general license" if r["type"] == "Gen" else f"limited quota Type {r['type']}"
            label = f"Wild turkey {year} {season} {cls}" + (" (archery only)" if archery else "")
            code = None if r["type"] == "Gen" else f"{int(r['areas'][0]):03d}-{r['type']}"
            add("turkey", label, "archery" if archery else None, s["start"], s["end"], year, "1", code, r["sourceId"],
                note=(f"Quota {r['quota']}; " if r["quota"] else "") + r["limitation"])
    for r in parse_bear(os.path.join(raw, "m33353.txt")):
        for s in r["segs"]:
            spring = s["start"] < "2026-07-01"
            label = f"Black bear {'spring' if spring else 'fall'} - {'special archery season' if s['kind'] == 'archery' else 'regular season'}"
            for a in r["areas"]:
                add("bear", label, "archery" if s["kind"] == "archery" else None, s["start"], s["end"], 2026, a, None, BEAR,
                    note=s["note"] or None)
    lion_src = LION
    for r in parse_lion(os.path.join(raw, "m32904.txt")):
        for s in r["segs"]:
            add("lion", "Mountain lion season", None, s["start"], s["end"], 2026, r["area"], None, lion_src, note=s["note"] or None)

    seasons = []
    for (sp, label, method, start, end, sid), g in groups.items():
        e = {"species": sp, "label": label}
        if method:
            e["method"] = method
        if g["units"]:
            e["units"] = g["units"]
        if g["codes"]:
            e["huntCodes"] = g["codes"]
        e.update({"start": start, "end": end, "year": g["year"]})
        notes = list(g["notes"])
        if sp == "lion":
            notes.append("Chapter 42 prints month and day only; the 2026 Mountain Lion Regulations (August 2026) reprint these dates for the "
                         "season opening September 1, 2026. Each area closes early when its mortality limit is reached.")
        elif sp == "bear":
            notes.append("Each area or group of areas closes early when its female mortality limit is reached.")
        elif sp != "turkey":
            notes.append("Dates printed without a year in the April 22, 2026 chapter; limitations vary by hunt area and type "
                         "(see each hunt's draw row).")
        if notes:
            e["note"] = " ".join(n[0].upper() + n[1:].rstrip(".") + "." for n in notes)
        e["sourceId"] = sid
        seasons.append(e)
    order = {s: i for i, s in enumerate(["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "bear", "lion", "turkey"])}
    seasons.sort(key=lambda e: (order[e["species"]], e["start"], e["end"], e["label"]))

    mpath = os.path.join(base, "draw-meta.json")
    meta = json.load(open(mpath))
    meta["seasons"] = seasons
    have = {s["id"] for s in meta["sources"]}
    ids_new = {s["id"] for s in SOURCES}
    meta["sources"] = [s for s in meta["sources"] if s["id"] not in ids_new] + SOURCES
    for info in meta["species"]:
        add_ids = {"elk": ["d-wy-ch7-elk"], "mule-deer": ["d-wy-ch6-deer"], "whitetail": ["d-wy-ch6-deer"],
                   "pronghorn": ["d-wy-ch5-antelope"], "moose": ["d-wy-ch8-moose"], "sheep": ["d-wy-ch9-sheep-goat"],
                   "goat": ["d-wy-ch9-sheep-goat"], "turkey": [TURKEY_OLD], "lion": ["d-wy-2026-mountain-lion-brochure"]}.get(info["species"], [])
        for sid in add_ids:
            if sid not in info["sourceIds"]:
                info["sourceIds"].append(sid)
    with open(mpath, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    report["seasons"] = len(seasons)
    report["seasonsBySpecies"] = {sp: sum(1 for e in seasons if e["species"] == sp) for sp in order}
    json.dump(report, open(os.path.join(raw, "seasons_report.json"), "w"), indent=1)
    print("seasons[]:", report["seasonsBySpecies"], "new sources:", sorted(ids_new - have))


if __name__ == "__main__":
    main()
