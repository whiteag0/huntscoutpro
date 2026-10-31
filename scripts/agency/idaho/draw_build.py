#!/usr/bin/env python3
"""Build src/data/agency/idaho/draw/<species>.json from raw IDFG downloads.

Inputs (from draw_fetch.py): <raw>/odds/*.json, <raw>/list/*.json, <raw>/area/*.html
Output: <repo>/src/data/agency/idaho/draw/<species>.json  (DrawRecord[])

Mapping (IDFG drawing-odds API fields -> schema), first drawing only:
  total.quota      = PermitAvailable (999999 = "Unlimited" -> null + note)
  total.applicants = ApplChoice1   (first-choice applicants)
  total.drawn      = SuccChoice1   (first-choice applicants drawn)
  total.oddsPct    = PercChoice1   (published, whole percent; null when 0 applicants; computed from the
                                   counts with oddsComputed=true when IDFG's percent contradicts its counts)
  resident         = ResApp / ResPermit / PercRes1          (first choice)
  nonresident      = NonResApp / NonResPermit / PercNonRes1 (first choice)
Second-choice results of the first drawing and the IDFG second drawing (leftover tags)
are reported in the row note exactly as published.
Hunt type, antler class, weapon and season dates come from the IDFG Hunt Planner
controlled-hunt list for the same hunt number, hunt area and season year; hunt-area
boundary text and GMUs come from the IDFG hunt-area page for the odds row's AreaID.
Nothing is estimated: if a value is not published it is left out.

Usage: python -I draw_build.py <raw_dir> <repo_root>
"""
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

from bs4 import BeautifulSoup

ODDS_BG_TO_SPECIES = {1: "deer", 2: "elk", 3: "pronghorn", 4: "bear", 6: "moose", 28: "sheep", 7: "sheep", 8: "goat", 27: "turkey"}
ODDS_BG_LABEL = {28: "California bighorn sheep", 7: "Rocky Mountain bighorn sheep"}
LIST_GAME_FOR_BG = {1: 1, 2: 2, 3: 3, 6: 6, 28: 119, 7: 119, 8: 8}  # bear/turkey are not in the list API
SOURCE_FOR_BG = {1: "d-odds-deer", 2: "d-odds-elk", 3: "d-odds-pronghorn", 4: "d-odds-bear", 6: "d-odds-moose",
                 28: "d-odds-ca-sheep", 7: "d-odds-rm-sheep", 8: "d-odds-goat", 27: "d-odds-turkey"}
METHOD = {"Any Weapon": "all", "Archery": "archery", "Muzzleloader": "muzzleloader",
          "Short-Range Weapons": "other", "Archery or Muzzleloader": "other"}
SEX = {"Antlered": "male", "Rams Only": "male", "Bucks Only": "male", "Antlerless": "female",
       "Doe or Fawn": "female", "Antlerless or Antlered": "either", "Either-sex": "either"}
UNLIMITED = 999999
LIST_UNLIMITED = {99999, 999999}


def mdY(s):
    m, d, y = s.split("/")
    y = int(y)
    if y < 100:
        y += 2000
    return dt.date(y, int(m), int(d))


def load_areas(raw):
    areas = {}
    for f in glob.glob(os.path.join(raw, "area", "area_*.html")):
        aid = int(re.search(r"area_(\d+)\.html", f).group(1))
        with open(f, encoding="utf-8", errors="replace") as fh:
            s = BeautifulSoup(fh.read(), "lxml")
        sub = s.find(id="SubTitle")
        desc = " ".join(sub.get_text(" ", strip=True).split()) if sub else None
        units = []
        for a in s.find_all("a", href=re.compile(r"unit\.aspx\?ID=", re.I)):
            u = a.get_text(strip=True)
            if u and u not in units:
                units.append(u)
        areas[aid] = {"desc": desc or None, "units": units}
    return areas


def load_lists(raw):
    """(listGame, number, areaid) -> {tagid: [rows]}"""
    idx = defaultdict(lambda: defaultdict(list))
    for f in glob.glob(os.path.join(raw, "list", "list_g*.json")):
        g = int(re.search(r"list_g(\d+)_", f).group(1))
        with open(f) as fh:
            d = json.load(fh)
        for r in d.get("rows") or []:
            idx[(g, str(r["number"]), r["areaid"])][r["tagid"]].append(r)
    return idx


def season_year(rows):
    """Draw year a tag belongs to: the year its first season opens, except that
    January-March openings belong to the previous year's draw (IDFG "January/February
    Extra hunts" are drawn in the summer and hunted the following winter)."""
    first = min(mdY(r["open"]) for r in rows)
    return first.year - 1 if first.month <= 3 else first.year


def hunt_meta(lists, g, number, area_id, year):
    """Return the list rows of the tag for this hunt number + AreaID + draw year, or None."""
    cands = lists.get((g, number, area_id))
    if not cands:
        return None
    hits = [rows for rows in cands.values() if season_year(rows) == year]
    if len(hits) != 1:
        return None
    return sorted(hits[0], key=lambda r: mdY(r["open"]))


MSG_PDF = "seasons-rules-moose-sheep-goat-2025-26.pdf"
MSG_ROW = re.compile(r"\b([3-7]\d{3})\s+([0-9]{1,2}[A-C]?(?:-\d+)?X?)\*?\s+(\d{1,3})\s+([A-Z][a-z]{2} \d{1,2}\s?-\s?[A-Z][a-z]{2} \d{1,2})")
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def load_msg_2026(raw):
    """2026 moose/sheep/goat hunt rows from the IDFG '2025 & 2026 Moose, Bighorn Sheep & Mountain Goat
    Seasons & Rules' (updated March 2026): hunt no -> (area, tags, season text, section)."""
    pdf = os.path.join(raw, "docs", MSG_PDF)
    txt = pdf[:-4] + ".txt"
    if not os.path.exists(txt):
        subprocess.run(["pdftotext", "-layout", pdf, txt], check=True, stderr=subprocess.DEVNULL)
    rows, section = {}, None
    with open(txt, encoding="utf-8") as fh:
        for line in fh:
            if "Antlered Moose Controlled Hunts" in line:
                section = "Antlered"
            elif "Antlerless Moose Controlled Hunts" in line:
                section = "Antlerless"
            elif "Bighorn Sheep Controlled Hunts - Rams Only" in line:
                section = "Rams Only"
            elif "MOUNTAIN GOAT HUNTING SEASONS" in line:
                section = None
            for m in MSG_ROW.finditer(line):
                hn, area, tags, season = m.groups()
                rows.setdefault(hn, []).append((area, int(tags), season, section))
    return {k: v[0] for k, v in rows.items() if len(v) == 1}


def msg_dates(season, year):
    out = []
    a, b = [x.strip() for x in season.split("-")]
    for part in (a, b):
        mon, day = part.split()
        out.append(dt.date(year, MONTHS[mon], int(day)).isoformat())
    return f"{out[0]} to {out[1]}"


# 2026 bear (fall) and turkey controlled hunts transcribed from IDFG brochures (no API carries them):
#   bear:   Idaho Big Game 2026 Seasons & Rules, p.72 ("2026 Fall Black Bear Controlled Hunts")
#   turkey: Upland Game, Turkey & Furbearer 2026 & 2027 Seasons & Rules, pp.24-25
# hunt no -> (brochure area label, tags, season start MM-DD, season end MM-DD, class label, sourceId)
BROCHURE_2026 = {
    "8501": ("1-1", 15, "09-15", "10-09", "Fall Black Bear Controlled Hunt", "d-rules-big-game-2026"),
    "8502": ("22-1", 100, "09-01", "10-31", "Fall Black Bear Controlled Hunt", "d-rules-big-game-2026"),
    "8503": ("32A", 100, "09-01", "10-31", "Fall Black Bear Controlled Hunt", "d-rules-big-game-2026"),
    "8504": ("22-1", 25, "09-01", "10-31", "Youth only Fall Black Bear Controlled Hunt", "d-rules-big-game-2026"),
    "9001": ("50-1", 100, "04-08", "05-25", "Spring Controlled Hunt, Youth Only - Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9002": ("54-1", 25, "04-08", "05-25", "Spring Controlled Hunt, Youth Only - Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9003": ("21-1", 70, "04-15", "05-25", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9004": ("38-1", 100, "04-15", "04-30", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9005": ("38-1", 100, "05-01", "05-25", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9006": ("50-2", 200, "04-15", "05-25", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9007": ("54-1", 25, "04-15", "05-25", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9008": ("60-1", 100, "04-15", "05-25", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9009": ("63A", 50, "04-15", "04-30", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9010": ("63A", 50, "05-01", "05-25", "Spring Controlled Hunt, Male or Bearded Turkey", "d-rules-upland-2026-27"),
    "9011": ("22-1", 20, "08-30", "10-09", "Fall Controlled Hunt, Youth Only - Either Sex Turkey", "d-rules-upland-2026-27"),
    "9012": ("50-1", 25, "09-15", "12-31", "Fall Controlled Hunt, Youth Only - Either Sex Turkey", "d-rules-upland-2026-27"),
    "9013": ("22-2", 75, "10-10", "12-31", "Fall Controlled Hunt, Either Sex Turkey", "d-rules-upland-2026-27"),
    "9014": ("36B-1", 30, "08-30", "12-31", "Fall Controlled Hunt, Either Sex Turkey", "d-rules-upland-2026-27"),
    "9015": ("38-1", 60, "09-15", "10-09", "Fall Controlled Hunt, Either Sex Turkey", "d-rules-upland-2026-27"),
    "9016": ("54-2", 50, "10-10", "12-31", "Fall Controlled Hunt, Either Sex Turkey", "d-rules-upland-2026-27"),
}
BROCHURE_TITLES = {"d-rules-big-game-2026": "IDFG Idaho Big Game 2026 Seasons & Rules",
                   "d-rules-upland-2026-27": "IDFG Upland Game, Turkey & Furbearer 2026 & 2027 Seasons & Rules"}

COUNT_FIELDS = ["ApplChoice1", "SuccChoice1", "ApplChoice2", "SuccChoice2", "ResApp", "NonResApp", "ResPermit", "NonResPermit", "PermitTotal"]


def row_text(r):
    return (f"[permits {r['PermitAvailable']}; first choice {r['ApplChoice1']} applied, {r['SuccChoice1']} drew{pct_txt(r['ApplChoice1'], r['SuccChoice1'], r['PercChoice1'])}; "
            f"residents {r['ResApp']} applied, {r['ResPermit']} drew; nonresidents {r['NonResApp']} applied, {r['NonResPermit']} drew]")


def dedupe(rows):
    """IDFG's odds table occasionally lists a hunt number more than once in a year.
    Returns [(row, note_or_None, conflict_bool)] with one entry per hunt number."""
    groups = defaultdict(list)
    for r in rows:
        groups[r["CHunt"]].append(r)
    out = []
    for code, g in groups.items():
        if len(g) == 1:
            out.append((g[0], None, False))
            continue
        if all(x == g[0] for x in g):
            out.append((g[0], "IDFG drawing-odds table lists this hunt twice with identical figures.", False))
            continue
        nonzero = [x for x in g if any(x[k] for k in COUNT_FIELDS)]
        zero = [x for x in g if x not in nonzero]
        if len(nonzero) == 1:
            z = "; ".join(str(x["PermitAvailable"]) for x in zero)
            out.append((nonzero[0], f"IDFG drawing-odds table also lists this hunt with {z} permits and no applicants; that row is not used.", False))
            continue
        uniq = []
        for x in nonzero:
            if x not in uniq:
                uniq.append(x)
        if len(uniq) == 1:
            out.append((uniq[0], "IDFG drawing-odds table lists this hunt twice with identical figures.", False))
            continue
        out.append((uniq[0], f"IDFG drawing-odds table lists this hunt {len(uniq)} times with different figures, so counts are not shown as a single value: "
                    + " ".join(row_text(x) for x in uniq) + ".", True))
    return out


def pct_ok(app, drawn, pct):
    """IDFG publishes whole-number percentages; a few disagree with IDFG's own counts
    (e.g. 125% or 0% when tags were drawn). Accept a published value only if it is
    within 1 point of drawn/applicants."""
    return app > 0 and abs(100.0 * drawn / app - pct) <= 1.0


def pct_txt(app, drawn, pct):
    return f" ({pct}%)" if pct_ok(app, drawn, pct) else ""


def stats(app, drawn, pct, notes, label, quota=None, with_quota=False):
    st = {"applicants": app, "drawn": drawn}
    if app == 0:
        st["oddsPct"] = None
    elif pct_ok(app, drawn, pct):
        st["oddsPct"] = pct
    else:
        st["oddsPct"] = round(100.0 * drawn / app, 1)
        st["oddsComputed"] = True
        notes.append(f"IDFG lists {label} odds as {pct}%, which does not match its own counts ({drawn} of {app}); odds shown are computed from the counts.")
    if with_quota:
        st = {"quota": quota, **st}
    return st


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    out_dir = os.path.join(repo, "src", "data", "agency", "idaho", "draw")
    os.makedirs(out_dir, exist_ok=True)
    areas = load_areas(raw)
    lists = load_lists(raw)
    msg26 = load_msg_2026(raw)
    out = defaultdict(list)
    report = defaultdict(int)
    for f in sorted(glob.glob(os.path.join(raw, "odds", "odds_bg*_d1.json"))):
        bg, year = map(int, re.search(r"odds_bg(\d+)_(\d{4})_d1", f).groups())
        with open(f) as fh:
            rows = json.load(fh).get("rows") or []
        d2 = {}
        f2 = f.replace("_d1.json", "_d2.json")
        if os.path.exists(f2):
            with open(f2) as fh:
                for r2, n2, c2 in dedupe(json.load(fh).get("rows") or []):
                    d2[r2["CHunt"]] = (r2, n2, c2)
        used_d2 = set()
        for r, dup_note, conflict in dedupe(rows):
            assert str(r["Yr"]) == str(year) and r["Draw"] == 1
            code = str(r["CHunt"])
            area = r["CHuntArea"]
            ainfo = areas.get(r["AreaID"]) or {"desc": None, "units": []}
            meta = None
            if bg in LIST_GAME_FOR_BG:
                meta = hunt_meta(lists, LIST_GAME_FOR_BG[bg], code, r["AreaID"], year)
                report["meta_hit" if meta else "meta_miss"] += 1
            sp = ODDS_BG_TO_SPECIES[bg]
            notes = []
            if sp == "deer":
                game = meta[0]["game"] if meta else None
                if game == "White-tailed Deer":
                    sp = "whitetail"
                else:
                    sp = "mule-deer"
                    if game == "Mule and White-tailed Deer":
                        notes.append("IDFG lists this hunt for mule deer and white-tailed deer.")
                    elif game is None:
                        notes.append("Deer hunt; IDFG hunt list for this year was not matched, so the mule deer/white-tailed deer restriction is not shown.")
            season = meta[0]["season"] if meta else None
            if season and "Outfitter Allocated" in season:
                if not any(r[k] for k in ("ApplChoice1", "ApplChoice2", "SuccChoice1", "SuccChoice2")):
                    # Not a public draw: IDFG lists these with tags but no applicants. Leaving them out keeps
                    # customers from reading "0 applicants" as an easy draw.
                    report["outfitter_no_applicants_skipped"] += 1
                    continue
                notes.append("Outfitter-allocated controlled hunt: IDFG says these tags are available only to people with a signed agreement "
                             "with a licensed outfitter, so applicant counts are not comparable to public hunts.")
            head = season if season else "Controlled Hunt"
            if bg in ODDS_BG_LABEL:
                head = f"{ODDS_BG_LABEL[bg]} — {head}"
            area_label = meta[0]["tagarea"] if meta else area
            desc = f"{head} — Hunt Area {area_label}"
            if area_label != area:
                notes.append(f"Drawing-odds table labels the hunt area \"{area}\"; IDFG hunt list names it \"{area_label}\".")
            if ainfo["desc"]:
                desc += f": {ainfo['desc']}"
            rec = {"species": sp, "year": year, "huntCode": code, "units": ainfo["units"], "description": desc}
            if meta:
                mlabel = meta[0]["method"]
                if all(m["method"] == mlabel for m in meta):
                    rec["method"] = METHOD.get(mlabel, "other")
                    rec["methodLabel"] = mlabel
                orn = meta[0]["ornament"]
                if all(m["ornament"] == orn for m in meta) and orn in SEX:
                    rec["sex"] = SEX[orn]
                    rec["description"] += f" ({orn})"
                rec["seasonDates"] = "; ".join(
                    f"{mdY(m['open']).isoformat()} to {mdY(m['close']).isoformat()}" for m in meta)
            elif year == 2026 and bg in (6, 7, 28, 8) and code in msg26:
                b_area, b_tags, b_season, b_section = msg26[code]
                if b_area == area and b_tags == r["PermitAvailable"]:
                    report["msg_brochure_hit"] += 1
                    rec["seasonDates"] = msg_dates(b_season, year)
                    if b_section:
                        rec["sex"] = SEX[b_section]
                        rec["description"] += f" ({b_section})"
                    rec["sourceNote"] = True
                else:
                    report["msg_brochure_mismatch"] += 1
            elif year == 2026 and bg in (4, 27) and code in BROCHURE_2026:
                b_area, b_tags, b_start, b_end, b_label, b_src = BROCHURE_2026[code]
                if b_tags == r["PermitAvailable"]:
                    report["brochure26_hit"] += 1
                    rec["description"] = rec["description"].replace("Controlled Hunt — Hunt Area", f"{b_label} — Hunt Area", 1)
                    rec["seasonDates"] = f"{year}-{b_start} to {year}-{b_end}"
                    if "Male or Bearded" in b_label:
                        rec["sex"] = "male"
                    elif "Either Sex" in b_label:
                        rec["sex"] = "either"
                    msg = f"Season dates and hunt type from the {BROCHURE_TITLES[b_src]}"
                    if b_area != area:
                        msg += f", which labels the hunt area \"{b_area}\" (drawing-odds table: \"{area}\")"
                    notes.append(msg + ".")
                else:
                    report["brochure26_mismatch"] += 1
            rec["choice"] = "first"
            list_unlimited = bool(meta) and meta[0]["permits"] in LIST_UNLIMITED
            unlimited = r["PermitAvailable"] == UNLIMITED or list_unlimited
            quota = None if unlimited else r["PermitAvailable"]
            if list_unlimited:
                report["unlimited_hunt"] += 1
                notes.append(f"Unlimited controlled hunt (IDFG hunt list); the drawing-odds table's Permits column shows {r['PermitAvailable']}, so no tag quota is given.")
            elif unlimited:
                notes.append("Unlimited tags.")
            elif meta and meta[0]["permits"] != r["PermitAvailable"]:
                report["permit_mismatch"] += 1
                notes.append(f"IDFG hunt list shows {meta[0]['permits']} tags for this hunt; drawing-odds table shows {r['PermitAvailable']} (quota uses the drawing-odds table).")
            if conflict:
                report["dup_conflict"] += 1
                rec["total"] = {"quota": quota}
                notes.append(dup_note)
            else:
                if dup_note:
                    report["dup_resolved"] += 1
                    notes.append(dup_note)
                rec["resident"] = stats(r["ResApp"], r["ResPermit"], r["PercRes1"], notes, "resident")
                rec["nonresident"] = stats(r["NonResApp"], r["NonResPermit"], r["PercNonRes1"], notes, "nonresident")
                rec["total"] = stats(r["ApplChoice1"], r["SuccChoice1"], r["PercChoice1"], notes, "first-choice", quota, True)
            if not conflict and (r["ApplChoice2"] or r["SuccChoice2"]):
                notes.append(
                    f"First drawing, second-choice applicants: {r['ApplChoice2']} applied, {r['SuccChoice2']} drew{pct_txt(r['ApplChoice2'], r['SuccChoice2'], r['PercChoice2'])}; "
                    f"total tags drawn in first drawing {r['PermitTotal']}.")
            s2, n2, c2 = d2.get(r["CHunt"], (None, None, False))
            if s2 and s2["CHuntArea"] != r["CHuntArea"]:
                report["d2_area_differs"] += 1
                s2 = None
            if s2:
                used_d2.add(r["CHunt"])
                if c2:
                    notes.append("Second drawing: " + n2)
                elif s2["PermitAvailable"] or s2["ApplChoice1"] or s2["ApplChoice2"]:
                    tags2 = "unlimited" if s2["PermitAvailable"] == UNLIMITED else s2["PermitAvailable"]
                    t = (f"Second drawing (leftover tags): {tags2} tags; first choice {s2['ApplChoice1']} applied, "
                         f"{s2['SuccChoice1']} drew{pct_txt(s2['ApplChoice1'], s2['SuccChoice1'], s2['PercChoice1'])}")
                    if s2["ApplChoice2"] or s2["SuccChoice2"]:
                        t += f"; second choice {s2['ApplChoice2']} applied, {s2['SuccChoice2']} drew{pct_txt(s2['ApplChoice2'], s2['SuccChoice2'], s2['PercChoice2'])}"
                    t += f"; residents {s2['ResApp']} applied, {s2['ResPermit']} drew; nonresidents {s2['NonResApp']} applied, {s2['NonResPermit']} drew."
                    notes.append(t)
            if not ainfo["desc"]:
                report["area_missing"] += 1
            if rec.pop("sourceNote", False):
                notes.append("Season dates and antler/ram class from the IDFG 2025 & 2026 Moose, Bighorn Sheep & Mountain Goat Seasons & Rules (updated March 2026).")
            if notes:
                rec["note"] = " ".join(notes)
            rec["sourceId"] = SOURCE_FOR_BG[bg]
            out[rec["species"]].append(rec)
        for k in d2:
            if k not in used_d2:
                report[f"d2_unmatched_bg{bg}_{year}"] += 1
    for sp, recs in out.items():
        recs.sort(key=lambda x: (-x["year"], x["huntCode"]))
        p = os.path.join(out_dir, f"{sp}.json")
        with open(p, "w") as fh:
            json.dump(recs, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
        yrs = sorted({x["year"] for x in recs})
        print(f"{sp}: {len(recs)} rows, years {yrs}, {os.path.getsize(p)/1e6:.2f} MB")
    print(dict(report))


if __name__ == "__main__":
    main()
