#!/usr/bin/env python3
"""Parse IDFG Hunt Planner harvest-statistics pages into HuntScout agency JSON.

Inputs : raw pages saved by harvest_fetch.py (hp_<season>_<game>_<year>.html)
         plus the IDFG 2025 harvest press article (art_2025.html, statewide
         species totals; see STATEWIDE below, transcribed from that article).
Outputs: src/data/agency/idaho/harvest/<species>.json and harvest-meta.json

Usage (from repo root):
  python -I scripts/agency/idaho/harvest_parse.py <raw_dir> [out_dir]

Rules: every value is copied as published. Blank cells -> null/omitted.
Success% is published by IDFG for elk/deer/controlled hunts; it is not
published (and not computed here) for general bear, lion and turkey.
"""
import html
import json
import os
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from harvest_fetch import PAGES, YEARS, page_url, raw_name

RETRIEVED = "2026-10-31"
PUB = "Idaho Department of Fish and Game"
INDEX_URL = "https://idfg.idaho.gov/ifwis/huntplanner/stats/"

METHOD = {
    "All Weapons Combined": "all",
    "Any Weapon": "rifle",
    "Archery": "archery",
    "Muzzleloader": "muzzleloader",
    "Short-Range Weapons": "other",
    "Archery or Muzzleloader": "other",
    "Shotgun or Archery": "other",
}

# IDFG game -> HuntScout species files
GAME_SPECIES = {
    "elk": ["elk"],
    "deer": ["mule-deer", "whitetail"],  # IDFG reports deer combined
    "bear": ["bear"],
    "lion": ["lion"],
    "turkey": ["turkey"],
    "moose": ["moose"],
    "goat": ["goat"],
    "pronghorn": ["pronghorn"],
    "rocky mountain sheep": ["sheep"],
    "california sheep": ["sheep"],
}

# Sex-class columns per game: (male column, female column)
SEXCOLS = {
    "elk": ("Antlered", "Antlerless"),
    "deer": ("Antlered", "Antlerless"),
    "bear": ("Boars", "Sows"),
    "lion": ("Males", "Females"),
    "moose": ("Bulls", "Cows"),
    "goat": ("Billies", "Nannies"),
    "pronghorn": ("Horned", "Hornless"),
    "rocky mountain sheep": ("Rams", "Ewes"),
    "california sheep": ("Rams", "Ewes"),
    "turkey": ("Toms", "Hens"),
}
# Extra published columns kept verbatim in the row note
NOTECOLS = [
    "%Spike", "%6+Pts", "%4+Pts", "%5+Pts", "%Whitetail",
    "Avg. Antler Spread (in.)", "Avg. Horn Length (in.)", "Avg. Horn Circum. (in.)",
    "Fall", "Spring", "Bait", "Days/Hunter", "Birds/Day", "Days/Bird",
]
NOTE_LABEL = {
    "%Spike": "% spikes (of antlered)",
    "%6+Pts": "% 6+ points (of antlered)",
    "%4+Pts": "% 4+ points (mule deer)",
    "%5+Pts": "% 5+ points (white-tailed deer)",
    "%Whitetail": "% of harvest white-tailed deer",
    "Fall": "fall harvest",
    "Spring": "spring harvest",
    "Bait": "bait harvest",
}

# Statewide species totals from the IDFG article (2026-04-10) "Hunter Harvest
# Report: Elk and mule deer keep on climbing in 2025". "By the numbers" boxes.
ARTICLE_URL = "https://idfg.idaho.gov/article/hunter-harvest-report-elk-and-mule-deer-keep-climbing-2025"
ARTICLE_ARCHIVE = "http://web.archive.org/web/20260813085134/" + ARTICLE_URL
STATEWIDE = {
    "elk": {"total": 21505, "prev": 20996, "succ": 23, "male": 13263, "female": 8242,
            "gen": (13524, 18), "ctl": (7981, 40)},
    "mule-deer": {"total": 24588, "prev": 23898, "succ": 32, "male": 21539, "female": 3050,
                  "gen": (18655, 28), "ctl": (5933, 52)},
    "whitetail": {"total": 19702, "prev": 20908, "succ": 38, "male": 13302, "female": 6400,
                  "gen": (18237, 37), "ctl": (1465, 40)},
}
# Strings that must appear in the saved article text for the transcription above.
ARTICLE_CHECKS = [
    "Total elk harvest in 2025: 21,505", "2024 harvest total: 20,996", "Antlered: 13,263", "Antlerless: 8,242",
    "Taken during general hunts: 13,524 (18% success rate)", "Taken during controlled hunts: 7,981 (40% success rate)",
    "Total mule deer harvest in 2025: 24,588", "2024 harvest total: 23,898", "Antlered: 21,539", "Antlerless: 3,050",
    "Taken during general hunts: 18,655 (28% success rate)", "Taken during controlled hunts: 5,933 (52% success rate)",
    "Total white-tailed deer harvest in 2025: 19,702", "2024 harvest total: 20,908", "Antlered: 13,302",
    "Antlerless: 6,400", "Taken during general hunts: 18,237 (37% success rate)",
    "Taken during controlled hunts: 1,465 (40% success rate)",
]


def clean(x: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", x))).strip()


def num(x: str):
    x = x.replace(",", "").strip()
    if x == "":
        return None
    if re.fullmatch(r"-?\d+", x):
        return int(x)
    if re.fullmatch(r"-?\d*\.\d+", x):
        return float(x)
    raise ValueError(f"not a number: {x!r}")


def parse_page(path):
    s = open(path, encoding="utf-8", errors="strict").read()
    h2 = re.findall(r"<h2>(.*?)</h2>", s)
    if "No Harvest Statistics available" in s and "stattable" not in s:
        return None, h2[-1] if h2 else ""
    t0 = s.index('id="stattable"')
    t1 = s.index("</table>", t0)
    tbl = s[t0:t1]
    heads = [clean(x) for x in re.findall(r"<th[^>]*>(.*?)</th>", tbl, flags=re.S)]
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", tbl, flags=re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)
        if not tds:
            continue
        if len(tds) != len(heads):
            raise RuntimeError(f"{path}: {len(tds)} cells vs {len(heads)} headers")
        row = {h: clean(v) for h, v in zip(heads, tds)}
        # area description is in the link title on controlled pages
        for h, v in zip(heads, tds):
            m = re.search(r'title="([^"]*)"', v)
            if m:
                row["__title_" + h] = html.unescape(m.group(1)).strip()
        rows.append(row)
    return rows, h2[-1]


def note_for(game, row, extra=None):
    parts = []
    if game == "deer":
        parts.append("All deer: mule deer and white-tailed deer combined (IDFG does not split hunters/harvest by deer species)")
    for c in NOTECOLS:
        v = row.get(c, "")
        if v != "":
            parts.append(f"{NOTE_LABEL.get(c, c)}: {v}")
    if extra:
        parts.append(extra)
    return "; ".join(parts) if parts else None


STAT_KEYS = ("hunters", "harvest", "successPct", "harvestMale", "harvestFemale", "daysHunted")


def merge_repeats(recs, season, game, y):
    """IDFG controlled pages sometimes repeat one hunt's row (same hunt#, area and
    identical figures), once per take method listed for the hunt, or verbatim.
    The figures are for the hunt, not per method, so keep one row and list
    every take method IDFG shows. Rows whose figures differ are kept apart."""
    groups, order = {}, []
    for r in recs:
        if "hunt" not in r:
            order.append([r])
            continue
        k = (r["year"], r["hunt"], r["unit"]) + tuple(r.get(x) for x in STAT_KEYS)
        if k not in groups:
            groups[k] = [r]
            order.append(groups[k])
        else:
            groups[k].append(r)
    out = []
    for g in order:
        r = dict(g[0])
        if len(g) > 1:
            labels = list(dict.fromkeys(x.get("methodLabel") for x in g if x.get("methodLabel")))
            methods = {x.get("method") for x in g}
            msg = f"IDFG lists this hunt {len(g)} times with identical figures"
            if len(labels) > 1:
                r["methodLabel"] = " / ".join(labels)
                r["method"] = methods.pop() if len(methods) == 1 else "other"
                msg += f" under take methods {', '.join(labels)}; figures are for the hunt as a whole, shown once"
            else:
                msg += "; shown once"
            r["note"] = (r["note"] + "; " if r.get("note") else "") + msg
        out.append(r)
    keys = {}
    for r in out:
        if "hunt" in r:
            kk = (r["year"], r["hunt"], r["unit"], r.get("methodLabel"))
            if kk in keys:
                raise RuntimeError(f"{season} {game} {y}: hunt {r['hunt']} repeated with different figures")
            keys[kk] = 1
    return out


def put(rec, key, val):
    if val is not None:
        rec[key] = val


def build(raw):
    out = {}  # species -> rows
    sources = []
    counts = {}
    skipped = []
    for season, game in PAGES:
        for y in YEARS:
            path = os.path.join(raw, raw_name(season, game, y))
            if not os.path.exists(path):
                skipped.append(f"missing file {path}")
                continue
            rows, title = parse_page(path)
            if rows is None:
                skipped.append(f"{season} {game} {y}: IDFG page says '{title}'")
                continue
            sid = f"h-idfg-{season}-{game.replace(' ', '-')}-{y}"
            sources.append({
                "id": sid,
                "title": re.sub(r"\s+", " ", html.unescape(title)).strip(),
                "publisher": PUB,
                "url": page_url(season, game, y),
                "pageUrl": INDEX_URL,
                "dataYear": y,
                "retrieved": RETRIEVED,
                "notes": ("IDFG Hunt Planner harvest statistics (HTML table). Based on mandatory harvest reports, big game "
                          "mortality reports and check station records."
                          + (" Controlled hunts: moose, sheep and goat hunter numbers and success rates are based on permits issued; "
                             "rain checks from previous years can make harvest exceed tags." if season == "controlled" else "")),
            })
            page_recs = []
            for r in rows:
                ry = int(r["Year"])
                yearnote = None
                if ry != y:  # e.g. 2022 'X' hunts listed only on the 2023 controlled elk page
                    if abs(ry - y) != 1:
                        raise RuntimeError(f"{path}: row year {ry} != {y}")
                    yearnote = f"Listed on IDFG's {y} {season} {game} page with Year {ry}"
                mcol, fcol = SEXCOLS[game]
                base = {"year": ry}
                if season == "general":
                    unit = r["Unit"]
                    base["unit"] = unit
                else:
                    base["unit"] = r["Area"]
                    t = r.get("__title_Area")
                    if t and t != r["Area"]:
                        base["unitName"] = t
                    base["hunt"] = r["Hunt#"]
                ml = r.get("Take Method") or r.get("TakeMethod")
                recs = []
                if game in ("elk", "deer") or season == "controlled":
                    rec = dict(base)
                    if ml:
                        rec["method"] = METHOD[ml]
                        rec["methodLabel"] = ml
                    rec["hunters"] = num(r["Hunters"])
                    rec["harvest"] = num(r["Harvest"])
                    rec["successPct"] = num(r["Success%"])
                    put(rec, "harvestMale", num(r.get(mcol, "")))
                    put(rec, "harvestFemale", num(r.get(fcol, "")))
                    put(rec, "daysHunted", num(r.get("Days", "")))
                    extra = yearnote
                    if season == "controlled" and game == "turkey":
                        extra = (extra + "; " if extra else "") + f"{r['Season']} controlled hunt"
                    if season == "controlled" and "Tag" in r["Area"]:
                        extra = (extra + "; " if extra else "") + "Area as published by IDFG (special tag, not a hunt area)"
                    n = note_for(game, r, extra)
                    if (isinstance(rec["hunters"], int) and isinstance(rec["harvest"], int)
                            and rec["harvest"] > rec["hunters"]):
                        n = (n + "; " if n else "") + "Harvest exceeds hunters as published (IDFG: rain checks from previous years can do this)"
                    put(rec, "note", n)
                    recs.append(rec)
                elif game == "bear":  # general bear: harvest only, with season and method breakdowns
                    rec = dict(base, method="all", hunters=None, harvest=num(r["Harvest"]), successPct=None)
                    put(rec, "harvestMale", num(r["Boars"]))
                    put(rec, "harvestFemale", num(r["Sows"]))
                    recs.append(rec)
                    for col, lab in (("Spring", "Spring season"), ("Fall", "Fall season")):
                        v = num(r[col])
                        if v is not None:
                            recs.append(dict(base, method="all", methodLabel=lab, hunters=None, harvest=v, successPct=None,
                                             note=f"Harvest during the {col.lower()} general season, all methods"))
                    for col in ("Bait", "Hounds", "Still Stalk", "Incidental"):
                        v = num(r[col])
                        if v is not None:
                            recs.append(dict(base, method="other", methodLabel=col, hunters=None, harvest=v, successPct=None,
                                             note=f"Harvest by method of take ({col}), spring and fall combined; IDFG does not publish hunters for this breakdown"))
                elif game == "lion":
                    rec = dict(base, method="all", hunters=None, harvest=num(r["Harvest"]), successPct=None)
                    put(rec, "harvestMale", num(r["Males"]))
                    put(rec, "harvestFemale", num(r["Females"]))
                    recs.append(rec)
                elif game == "turkey":  # general turkey
                    rec = dict(base, method="all", methodLabel=f"{r['Season']} general season",
                               hunters=num(r["Hunters"]), harvest=num(r["Harvest"]), successPct=None)
                    n = note_for(game, r, "Success % not published by IDFG (turkey hunters may hold more than one tag)")
                    if (isinstance(rec["hunters"], int) and isinstance(rec["harvest"], int)
                            and rec["harvest"] > rec["hunters"]):
                        n += "; harvest exceeds hunters as published (multiple tags)"
                    rec["note"] = n
                    recs.append(rec)
                else:
                    raise RuntimeError(game)
                page_recs.extend(recs)
            kept = []
            for rec in page_recs:
                if rec.get("hunters") is None and rec.get("harvest") is None and rec.get("successPct") is None:
                    skipped.append(f"{season} {game} {y} unit {rec['unit']} {rec.get('hunt','')} {rec.get('methodLabel','')}: all blank")
                else:
                    kept.append(rec)
            for rec in merge_repeats(kept, season, game, y):
                sp_ = rec.get("successPct")
                if isinstance(sp_, (int, float)) and sp_ > 100:
                    rec["successPct"] = None
                    rec["note"] = (rec.get("note", "") + "; " if rec.get("note") else "") + f"IDFG publishes Success% {sp_} (above 100%, harvest exceeds hunters); stored as null"
                h_, k_, p_ = rec.get("hunters"), rec.get("harvest"), rec.get("successPct")
                if all(isinstance(v, (int, float)) for v in (h_, k_, p_)) and h_ >= 20 and abs(100 * k_ / h_ - p_) > 2:
                    rec["note"] = (rec["note"] + "; " if rec.get("note") else "") + (
                        f"Success% {p_} as published by IDFG; harvest/hunters as displayed gives {100 * k_ / h_:.1f} "
                        "(IDFG's percentage is likely computed before its figures are rounded)")
                rec["sourceId"] = sid
                for sp in GAME_SPECIES[game]:
                    o = {"species": sp, **rec}
                    if game == "rocky mountain sheep":
                        o["note"] = ("Rocky Mountain bighorn sheep" + ("; " + o["note"] if o.get("note") else ""))
                    if game == "california sheep":
                        o["note"] = ("California bighorn sheep" + ("; " + o["note"] if o.get("note") else ""))
                    out.setdefault(sp, []).append(o)
                    counts[(sp, season, y)] = counts.get((sp, season, y), 0) + 1
    # statewide species totals from the 2025 article
    art = os.path.join(raw, "art_2025.html")
    if os.path.exists(art):
        text = clean(open(art, encoding="utf-8", errors="replace").read())
        missing = [c for c in ARTICLE_CHECKS if c not in text]
        if missing:
            raise RuntimeError(f"article text check failed: {missing}")
        sid = "h-idfg-article-2025-harvest-summary"
        sources.append({
            "id": sid,
            "title": "Hunter Harvest Report: Elk and mule deer keep on climbing in 2025",
            "publisher": PUB,
            "url": ARTICLE_URL,
            "pageUrl": ARTICLE_ARCHIVE,
            "dataYear": 2025,
            "retrieved": RETRIEVED,
            "notes": ("IDFG press article published 2026-04-10; statewide 'By the numbers' totals by species (general + controlled). "
                      "Read from the Internet Archive copy of 2026-08-13 because idfg.idaho.gov was offline for maintenance on 2026-10-31."),
        })
        for sp, d in STATEWIDE.items():
            lab = {"elk": "elk", "mule-deer": "mule deer", "whitetail": "white-tailed deer"}[sp]
            out.setdefault(sp, []).extend([
                {"species": sp, "year": 2025, "unit": "Statewide", "method": "all", "methodLabel": "All hunts (general + controlled)",
                 "hunters": None, "harvest": d["total"], "harvestMale": d["male"], "harvestFemale": d["female"], "successPct": d["succ"],
                 "note": f"Statewide {lab} harvest as stated by IDFG; harvestMale = antlered, harvestFemale = antlerless; hunter count not published",
                 "sourceId": sid},
                {"species": sp, "year": 2025, "unit": "Statewide", "method": "all", "methodLabel": "General hunts",
                 "hunters": None, "harvest": d["gen"][0], "successPct": d["gen"][1],
                 "note": f"Statewide {lab} harvest during general hunts as stated by IDFG", "sourceId": sid},
                {"species": sp, "year": 2025, "unit": "Statewide", "method": "all", "methodLabel": "Controlled hunts",
                 "hunters": None, "harvest": d["ctl"][0], "successPct": d["ctl"][1],
                 "note": f"Statewide {lab} harvest during controlled hunts as stated by IDFG", "sourceId": sid},
                {"species": sp, "year": 2024, "unit": "Statewide", "method": "all", "methodLabel": "All hunts (general + controlled)",
                 "hunters": None, "harvest": d["prev"], "successPct": None,
                 "note": f"Statewide 2024 {lab} harvest total as stated in IDFG's 2025 harvest report", "sourceId": sid},
            ])
    else:
        skipped.append("art_2025.html missing: statewide species totals not added")
    return out, sources, counts, skipped



def main():
    raw = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "src/data/agency/idaho"
    out, sources, counts, skipped = build(raw)
    os.makedirs(os.path.join(outdir, "harvest"), exist_ok=True)
    order = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"]
    for sp in order:
        if sp not in out:
            continue
        rows = sorted(out[sp], key=lambda r: (-r["year"], r["unit"] != "Statewide", "hunt" in r, r.get("hunt", ""),
                                              _unitkey(r["unit"]), r.get("methodLabel", "")))
        p = os.path.join(outdir, "harvest", f"{sp}.json")
        with open(p, "w") as f:
            f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
        print(f"{sp}: {len(rows)} rows, {os.path.getsize(p)/1e6:.2f} MB")
    for k in sorted(counts):
        print("  ", k, counts[k])
    for s in skipped:
        print("SKIP", s)
    meta_path = os.path.join(outdir, "harvest-meta.json")
    # Idaho GMUs are numbered, not named; controlled hunt-area descriptions are per row (unitName).
    meta = {"unitNames": {}, "coverage": coverage(out), "sources": sources}
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"sources: {len(sources)}")


def _sum(rows, year, src, only_all=False):
    rr = [r for r in rows if r["year"] == year and src in r["sourceId"] and (not only_all or r.get("method") == "all")]
    return sum(r["harvest"] or 0 for r in rr)


COMMON = ("Source: IDFG Hunt Planner harvest statistics (based on mandatory harvest reports, big game mortality reports and "
          "check station records). Blank IDFG cells are null/omitted, never zero-filled. ")
CTL = ("Controlled hunts: hunt = IDFG hunt number, unit = IDFG hunt-area id as published (e.g. '22-1', '45-1X'), "
       "unitName = IDFG area description. ")
METH = ("method 'rifle' = IDFG 'Any Weapon'; 'other' = Short-Range Weapons / Archery or Muzzleloader; 'all' = All Weapons Combined. ")
PERMITS = "IDFG: hunter numbers and success rates for moose, sheep and goat are based on permits issued. "


def coverage(out):
    yrs = lambda sp: sorted({r["year"] for r in out.get(sp, [])})
    elk, deer = out.get("elk", []), out.get("mule-deer", [])
    c = []
    c.append({"species": "elk", "years": yrs("elk"), "notes": COMMON + CTL + METH + (
        "General season: one row per GMU per take method plus All Weapons Combined. harvestMale/harvestFemale = IDFG "
        "Antlered/Antlerless; % spikes and % 6+ points in notes. Statewide rows (2025 all/general/controlled, 2024 total) "
        "are from IDFG's 2025 harvest report. Cross-check: 2025 general GMU sum (All Weapons Combined) = "
        f"{_sum(elk, 2025, 'general-elk', True):,} vs IDFG statewide general 13,524 (rounding). Controlled-hunt rows sum to "
        f"{_sum(elk, 2025, 'controlled-elk'):,} for 2025 vs IDFG statewide controlled 7,981 and {_sum(elk, 2024, 'controlled-elk'):,} "
        "for 2024. IDFG does not explain the gap (its statewide controlled figure evidently includes harvest not listed "
        "hunt-by-hunt in the Hunt Planner), so do not sum controlled rows into a statewide figure. Six 2022 antlerless hunts (2280-2285) appear only on IDFG's 2023 page with "
        "Year 2022 and are stored as 2022. 2020 page: 14 blank hunt rows omitted; hunts IDFG lists more than once with "
        "identical figures are stored once (see row notes).")})
    deer_note = COMMON + CTL + METH + (
        "IMPORTANT: IDFG publishes unit and hunt harvest for deer as one combined species (mule deer + white-tailed deer). "
        "Every GMU/hunt row here is that combined-deer figure and is identical in mule-deer.json and whitetail.json - never add "
        "the two files together. Each row note carries IDFG's '% of harvest white-tailed deer', % 4+ points (mule deer) and "
        "% 5+ points (white-tailed deer) where published. Species-specific figures exist only statewide (unit 'Statewide'): "
        "2025 total/general/controlled with success and antlered/antlerless, and the 2024 total, from IDFG's 2025 harvest report. "
        f"Cross-check: 2025 general GMU sum (All Weapons Combined) = {_sum(deer, 2025, 'general-deer', True):,} vs IDFG statewide "
        "general mule deer 18,655 + white-tailed deer 18,237 = 36,892 (rounding). Controlled-hunt rows sum to "
        f"{_sum(deer, 2025, 'controlled-deer'):,} for 2025 vs IDFG statewide controlled 5,933 + 1,465 = 7,398 (gap not explained by IDFG; do not sum controlled rows into a statewide figure). 2020 page: 7 blank "
        "hunt rows omitted; repeated identical hunt rows stored once.")
    c.append({"species": "mule-deer", "years": yrs("mule-deer"), "notes": deer_note})
    c.append({"species": "whitetail", "years": yrs("whitetail"), "notes": deer_note})
    c.append({"species": "pronghorn", "years": yrs("pronghorn"), "notes": COMMON + CTL + METH + (
        "Controlled hunts only: IDFG's Hunt Planner general-season pronghorn statistics end in 2008, so there are no general "
        "pronghorn rows for 2020-2025. harvestMale/harvestFemale = Horned/Hornless; average horn length in notes.")})
    c.append({"species": "moose", "years": yrs("moose"), "notes": COMMON + CTL + PERMITS + (
        "Controlled hunts only (Idaho has no general moose season). harvestMale/harvestFemale = Bulls/Cows; average antler "
        "spread in notes. Where IDFG publishes Success% above 100 (harvest above permits, e.g. rain checks) the value is "
        "kept in the note and successPct is null.")})
    c.append({"species": "bear", "years": yrs("bear"), "notes": COMMON + (
        "General season: per-GMU harvest only - IDFG publishes no hunter numbers or success rate for general black bear. "
        "Per GMU: a total row (method 'all', harvestMale/harvestFemale = boars/sows), 'Spring season' and 'Fall season' "
        "harvest rows, and method-of-take rows (Bait, Hounds, Still Stalk, Incidental; method 'other'). Method rows do not "
        "always add up to the total (as published). About 24 GMUs per year that IDFG lists with every cell blank are omitted. "
        "Controlled bear hunts 2020 and 2022-2025 (IDFG shows 'No Harvest Statistics available' for 2021); controlled rows "
        "carry fall/spring/bait harvest in notes. " + CTL)})
    c.append({"species": "sheep", "years": yrs("sheep"), "notes": COMMON + CTL + PERMITS + (
        "Rocky Mountain bighorn and California bighorn controlled hunts (named in each row note), including auction/lottery "
        "tag rows where IDFG lists them (unit = IDFG label such as 'Auction Tag - 36A'). harvestMale/harvestFemale = Rams/Ewes; "
        "average horn length and circumference in notes.")})
    c.append({"species": "goat", "years": yrs("goat"), "notes": COMMON + CTL + PERMITS + (
        "Controlled hunts only. harvestMale/harvestFemale = Billies/Nannies; average horn length/circumference in notes.")})
    c.append({"species": "lion", "years": yrs("lion"), "notes": COMMON + (
        "Per-GMU harvest with males/females only; IDFG publishes no hunter numbers or success rate for mountain lion. "
        "GMUs that IDFG lists with every cell blank (13-18 per year) are omitted rather than shown as zero.")})
    c.append({"species": "turkey", "years": yrs("turkey"), "notes": COMMON + (
        "Spring general season per GMU 2020-2025 (hunters and harvest). IDFG publishes no success % for turkey and hunters "
        "may hold more than one tag (harvest can exceed hunters), so successPct is null; IDFG's days/hunter, birds/day and "
        "days/bird are in notes. The Hunt Planner has no fall general turkey table. Controlled turkey hunts 2020-2021 only "
        "(IDFG shows no controlled turkey statistics for 2022-2025). Spring 2026 data exists on IDFG but is outside this "
        "2020-2025 dataset.")})
    return c


def _unitkey(u):
    m = re.match(r"(\d+)(.*)", u)
    return (int(m.group(1)), m.group(2)) if m else (10**6, u)


if __name__ == "__main__":
    main()
