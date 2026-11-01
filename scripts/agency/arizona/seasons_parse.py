"""Season dates for Arizona: per-hunt seasonRanges on draw rows and draw-meta.seasons[].

Usage (from repo root; run AFTER draw_parse.py and draw_meta.py):
  python -I scripts/agency/arizona/seasons_parse.py --test
  python -I scripts/agency/arizona/seasons_parse.py <seasons_raw_dir>

<seasons_raw_dir> holds the AZGFD regulation booklets (PDF + `pdftotext -layout` .txt, same
basename as the published file):
  2026-Pronghorn-and-Elk-Regulations_251223.pdf   (d-az-regs-pe2026)
  2026-27-Arizona-Hunting-Regulations.pdf          (d-az-regs-hunt2026)
  2026-Spring-Regulations_250908.pdf               (d-az-regs-spring2026)
  2027-Spring-Regulations.pdf                      (d-az-regs-spring2027)

What it does
  1. Draw rows (all years): every row with `seasonDates` gets `seasonRanges` parsed from that
     text, inserted right after `seasonDates`, and `seasonSourceId` = the document the dates
     were printed in (the draw-odds summary or regulation booklet named in the row note; the
     rows' sourceId is the Bonus Pass draw report, which prints no dates). Each parse is
     re-formatted in the text's own style and must reproduce the text exactly (round trip).
  2. 2026 rows without seasonDates are looked up by exact hunt number in the 2026 booklet
     for their draw; those AZGFD prints without a hunt number ("----") stay empty.
  3. draw-meta.seasons[] is rebuilt from the booklets' hunt tables (numbered draw hunts,
     un-numbered special-area hunts and nonpermit-tag/OTC seasons) for elk, pronghorn, deer,
     bighorn sheep, turkey and bear. Mountain lion entries written by draw_meta.py are kept.
     Hunts with identical species + label + method + legal wildlife + dates are grouped into
     one SeasonDate carrying huntCodes/units. Split seasons give one SeasonDate per segment.

Season text formats (every distinct one in the draw rows, 2023-2026):
  "4/28/2023 - 5/4/2023"                       draw-odds summaries / spring booklets as M/D/YYYY
  "4/28/2023 - 5/4/2023 and 5/12/2023 - 5/25/2023"
  "Sep 25 - Oct 1, 2026"                       regulation booklets: year printed once, after the end
  "Apr 24 - Apr 30, 2026 and May 8 - May 21, 2026"
Booklet tables also print "Aug 21 - Sep 10, 2026, Dec 11 - Dec 31, 2026, and Jan 1 - Jan 31, 2027",
"Sep 1, 2026 – Feb 7, 2027" and (none in AZ rows, supported for completeness) text with no year.
Year rule: a year printed after a date applies to it; a start date without a year takes the end
date's year, or the year before when its month/day is after the end's (a season crossing New
Year). Text with no year at all takes the row's year, rolling the end into the next year when
it is before the start.
"""
import json, os, re, sys

sys.dont_write_bytecode = True  # keep the repo free of __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ROOT = os.path.join(REPO, "src", "data", "agency", "arizona")
SPECIES_FILES = ["elk", "pronghorn", "mule-deer", "whitetail", "sheep", "turkey"]

MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MNUM = {m: i for i, m in enumerate(MONS, 1)}
MON_RE = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
DATE_MON = r"(" + MON_RE + r")\.? (\d{1,2})(?:, (\d{4}))?"
SEG_MON = re.compile(r"^" + DATE_MON + r" ([-–]) " + DATE_MON + r"$")
SEG_MDY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4}) - (\d{1,2})/(\d{1,2})/(\d{4})$")
SEP = re.compile(r"(, and |,? and |, )(?=(?:" + MON_RE + r"|\d{1,2}/))")


class ParseError(ValueError):
    pass


def _iso(y, m, d):
    import datetime
    try:
        return datetime.date(y, m, d).isoformat()
    except ValueError:
        raise ParseError(f"not a real date {y}-{m}-{d}")


def parse_season_text(text, default_year=None):
    """Return (ranges, style). ranges = [{"start","end"}]; style describes how to print it back."""
    s = text.strip()
    parts, seps = [], []
    pos = 0
    for m in SEP.finditer(s):
        parts.append(s[pos:m.start()])
        seps.append(m.group(1))
        pos = m.end()
    parts.append(s[pos:])
    ranges, segstyle = [], []
    for p in parts:
        p = p.strip()
        mm = SEG_MDY.match(p)
        if mm:
            a = _iso(int(mm.group(3)), int(mm.group(1)), int(mm.group(2)))
            b = _iso(int(mm.group(6)), int(mm.group(4)), int(mm.group(5)))
            ranges.append({"start": a, "end": b})
            segstyle.append(("mdy",))
            continue
        mm = SEG_MON.match(p)
        if not mm:
            raise ParseError(f"unrecognised season segment {p!r} in {text!r}")
        am, ad, ay, dash, bm, bd, by = mm.groups()
        am, ad, bm, bd = MNUM[am], int(ad), MNUM[bm], int(bd)
        if by is None and ay is not None:
            raise ParseError(f"start year without end year in {text!r}")
        if by is not None:
            eyear = int(by)
            syear = int(ay) if ay else (eyear if (am, ad) <= (bm, bd) else eyear - 1)
        else:
            if default_year is None:
                raise ParseError(f"no year in {text!r} and no default year")
            syear = default_year
            eyear = syear if (bm, bd) >= (am, ad) else syear + 1
        ranges.append({"start": _iso(syear, am, ad), "end": _iso(eyear, bm, bd)})
        segstyle.append(("mon", ay is not None, by is not None, dash, len(mm.group(2)) == 2 and mm.group(2)[0] == "0",
                         len(mm.group(6)) == 2 and mm.group(6)[0] == "0"))
    for r in ranges:
        if r["start"] > r["end"]:
            raise ParseError(f"start after end in {text!r}")
    return ranges, {"segs": segstyle, "seps": seps}


def format_season(ranges, style):
    out = []
    for i, (r, st) in enumerate(zip(ranges, style["segs"])):
        (sy, sm, sd), (ey, em, ed) = ([int(x) for x in r[k].split("-")] for k in ("start", "end"))
        if st[0] == "mdy":
            seg = f"{sm}/{sd}/{sy} - {em}/{ed}/{ey}"
        else:
            _, show_sy, show_ey, dash, pad_s, pad_e = st
            fd = lambda d, pad: f"{d:02d}" if pad else str(d)
            seg = (f"{MONS[sm-1]} {fd(sd, pad_s)}" + (f", {sy}" if show_sy else "") + f" {dash} {MONS[em-1]} {fd(ed, pad_e)}"
                   + (f", {ey}" if show_ey else ""))
        if i:
            out.append(style["seps"][i - 1])
        out.append(seg)
    return "".join(out)


def self_test():
    cases = [
        ("Sep 25 - Oct 1, 2026", 2026, [("2026-09-25", "2026-10-01")]),
        ("4/28/2023 - 5/4/2023 and 5/12/2023 - 5/25/2023", 2023, [("2023-04-28", "2023-05-04"), ("2023-05-12", "2023-05-25")]),
        ("Apr 24 - Apr 30, 2026 and May 8 - May 21, 2026", 2026, [("2026-04-24", "2026-04-30"), ("2026-05-08", "2026-05-21")]),
        ("Jan 1 - Jan 31, 2027", 2026, [("2027-01-01", "2027-01-31")]),
        ("Dec 4 - Jan 31, 2027", 2026, [("2026-12-04", "2027-01-31")]),
        ("Dec 11 - Dec 31, 2026 and Jan 1 - Jan 31, 2027", 2026, [("2026-12-11", "2026-12-31"), ("2027-01-01", "2027-01-31")]),
        ("Aug 21 - Sep 10, 2026, Dec 11 - Dec 31, 2026, and Jan 1 - Jan 31, 2027", 2026,
         [("2026-08-21", "2026-09-10"), ("2026-12-11", "2026-12-31"), ("2027-01-01", "2027-01-31")]),
        ("Sep 1, 2026 – Feb 7, 2027", 2026, [("2026-09-01", "2027-02-07")]),
        ("Oct 01 - Jan 01", 2025, [("2025-10-01", "2026-01-01")]),          # no year: row year, roll over
        ("12/1/2025 - 12/31/2025", 2025, [("2025-12-01", "2025-12-31")]),
        ("11/28/2025 - 1/31/2026", 2025, [("2025-11-28", "2026-01-31")]),
    ]
    bad = 0
    for text, y, want in cases:
        got, style = parse_season_text(text, y)
        g = [(r["start"], r["end"]) for r in got]
        back = format_season(got, style)
        ok = g == want and back == text
        bad += not ok
        print(("ok  " if ok else "FAIL"), repr(text), g, "" if back == text else f"round-trip {back!r}")
    for text in ("Sep 31 - Oct 2, 2026", "Sept 1 - Oct 2, 2026", "Oct 5, 2026 - Oct 1, 2026", "TBD"):
        try:
            parse_season_text(text, 2026)
            print("FAIL accepted", repr(text)); bad += 1
        except ParseError:
            print("ok   rejects", repr(text))
    print(f"self-test: {bad} failures")
    return bad == 0


# ---------------------------------------------------------------- draw rows
def season_source(row):
    note = row.get("note") or ""
    m = re.search(r"Season dates from (d-az-[a-z0-9-]+)", note)
    if m:
        return m.group(1)
    m = re.search(r"Hunt description: (d-az-[a-z0-9-]+)", note)
    return m.group(1) if m else None


def with_ranges(row, ranges, sid):
    out = {}
    for k, v in row.items():
        if k in ("seasonRanges", "seasonSourceId"):
            continue
        out[k] = v
        if k == "seasonDates":
            out["seasonRanges"] = ranges
            if sid and sid != row.get("sourceId"):
                out["seasonSourceId"] = sid
    return out


def insert_dates(row, text, ranges, sid, extra_note):
    out = {}
    for k, v in row.items():
        if k == "choice":
            out["seasonDates"] = text
            out["seasonRanges"] = ranges
            out["seasonSourceId"] = sid
        if k == "note" and extra_note:
            v = v + "; " + extra_note
        out[k] = v
    return out


def write_rows(path, rows):
    with open(path, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n")


# ---------------------------------------------------------------- booklets
SECTION = re.compile(r"^\s*([A-Z][A-Z0-9 ()\-–,/'’]+?(?:ELK|PRONGHORN|DEER|SHEEP|TURKEY|JAVELINA|BISON|CRANE|BEAR|LION))\b(.*)$")
DATE_CELL = re.compile(r"^" + MON_RE + r"\.? \d{1,2}")


def clean(c):
    return re.sub(r"\s+", " ", (c or "").replace("\n", " ").replace("\u2019", "'")).strip()


def walk_tables(pdf_path):
    """Every data row of every ruled hunt table: section title, hunt no. (or '----' / None for
    nonpermit-tag tables), dates, notes, open areas, legal wildlife, last column."""
    import pdfplumber
    out = []
    section, header, sub = None, None, None
    with pdfplumber.open(pdf_path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            for t in sorted(pg.find_tables(), key=lambda t: (t.bbox[1], t.bbox[0])):
                for r in t.extract():
                    cells = [clean(c) for c in r]
                    ne = [c for c in cells if c]
                    if not ne:
                        continue
                    if len(ne) == 1:
                        m = SECTION.match(ne[0])
                        if m and m.group(1) == m.group(1).upper() and not ne[0].startswith(("Total",)):
                            section, header, sub = m.group(1).strip(), None, None
                        elif ne[0] == ne[0].upper() and re.search(r"[A-Z]{4}", ne[0]):
                            # another upper-case table title (e.g. RAPTOR CAPTURE): not a species we keep
                            section, header, sub = ne[0], None, None
                        elif header is not None and not DATE_CELL.match(ne[0]):
                            sub = ne[0]
                        continue
                    if any(c.startswith("Season Dates") for c in cells):
                        header = {}
                        for i, c in enumerate(cells):
                            for k in ("Hunt No", "Season Dates", "Notes", "Open Areas", "Legal Wildlife", "Permits", "Female Harvest", "Fem Harv", "Harvest Limit"):
                                if c.startswith(k) and k not in header:
                                    header[k] = i
                        continue
                    if header is None or "Season Dates" not in header:
                        continue
                    get = lambda k: cells[header[k]] if k in header and header[k] < len(cells) else ""
                    d = get("Season Dates")
                    if not DATE_CELL.match(d):
                        continue
                    hunt = get("Hunt No") if "Hunt No" in header else None
                    out.append({"page": pi + 1, "section": section, "sub": sub, "hunt": hunt or None, "dates": d,
                                "notes": re.sub(r",\s+", ",", get("Notes")) or None, "openAreas": get("Open Areas"),
                                "legal": get("Legal Wildlife")})
    return out


def label_case(sec):
    keep = {"HAM", "CHAMP"}
    words = sec.split(" ")
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Z]", "", w)
        if core in keep:
            out.append(w)
        else:
            lw = w.lower()
            out.append(lw[:1].upper() + lw[1:] if i == 0 else lw)
    s = " ".join(out)
    return re.sub(r"^\(([a-z])", lambda m: "(" + m.group(1).upper(), s)


def method_for(sec):
    u = sec.upper()
    if "ARCHERY" in u:
        return "archery"
    if "MUZZLELOADER" in u:
        return "muzzleloader"
    if "SHOTGUN" in u:
        return "shotgun"
    if "HAM" in re.split(r"[^A-Z]+", u):
        return "other"
    return None


def species_for(sec, legal):
    u = sec.upper()
    if "POPULATION MANAGEMENT" in u:
        return []
    for word, sp in (("ELK", "elk"), ("PRONGHORN", "pronghorn"), ("SHEEP", "sheep"), ("TURKEY", "turkey"), ("BEAR", "bear")):
        if re.search(r"\b" + word + r"\b", u):
            return [sp]
    if re.search(r"\bDEER\b", u):
        l = (legal or "").lower()
        if "mule deer" in l:
            return ["mule-deer"]
        if "white" in l:
            return ["whitetail"]
        return ["mule-deer", "whitetail"]
    return []


def main(raw):
    from draw_reports import parse_regs
    from draw_parse import units_from_regs
    meta_path = os.path.join(ROOT, "draw-meta.json")
    meta = json.load(open(meta_path))
    src_by_id = {s["id"]: s for s in meta["sources"]}
    BOOKS = [("d-az-regs-pe2026", 2026), ("d-az-regs-hunt2026", 2026), ("d-az-regs-spring2026", 2026), ("d-az-regs-spring2027", 2027)]
    pdf_of = {sid: os.path.join(raw, os.path.basename(src_by_id[sid]["url"])) for sid, _ in BOOKS}
    for p in pdf_of.values():
        if not os.path.exists(p) or not os.path.exists(p[:-4] + ".txt"):
            sys.exit(f"missing {p} (and its pdftotext -layout .txt)")
    regs = {sid: parse_regs(p, p[:-4] + ".txt") for sid, p in pdf_of.items()}
    walked = {sid: walk_tables(p) for sid, p in pdf_of.items()}

    # cross-check: numbered hunts from the table walker agree with parse_regs (used by draw_parse)
    xmis = []
    for sid in regs:
        for w in walked[sid]:
            h = w["hunt"]
            if h and re.match(r"^\d{4}$", h) and h in regs[sid] and not regs[sid][h].get("bonusOnly"):
                if regs[sid][h].get("dates") != w["dates"]:
                    xmis.append(f"{sid} {h}: parse_regs {regs[sid][h].get('dates')!r} vs table {w['dates']!r}")
    print(f"booklet cross-check (table walker vs parse_regs dates): {len(xmis)} mismatches", *xmis[:10], sep="\n  ")

    # ---------------- 1+2. draw rows
    draw_regs = {"M": "d-az-regs-pe2026", "S": "d-az-regs-spring2026", "F": "d-az-regs-hunt2026"}
    stats, rt_fail, filled, empty = {}, [], [], []
    for sp in SPECIES_FILES:
        p = os.path.join(ROOT, "draw", f"{sp}.json")
        rows = json.load(open(p))
        latest = max(r["year"] for r in rows)
        out = []
        for r in rows:
            if r.get("seasonDates"):
                rng, style = parse_season_text(r["seasonDates"], r["year"])
                if format_season(rng, style) != r["seasonDates"]:
                    rt_fail.append(f"{sp} {r['year']} {r['huntCode']}: {r['seasonDates']!r} -> {format_season(rng, style)!r}")
                sid = r.get("seasonSourceId") or season_source(r)
                if sid is None or sid not in src_by_id:
                    raise SystemExit(f"no season source for {sp} {r['year']} {r['huntCode']}")
                r = with_ranges(r, rng, sid)
            elif r["year"] == 2026:
                sm = re.match(r"^d-az-2026([msf])-bonus$", r["sourceId"])
                if not sm:
                    raise SystemExit(f"unexpected sourceId {r['sourceId']} for {sp} {r['huntCode']}")
                sid = draw_regs[sm.group(1).upper()]
                rec = regs[sid].get(r["huntCode"])
                if rec and rec.get("dates") and not rec.get("bonusOnly"):
                    rng, style = parse_season_text(rec["dates"], r["year"])
                    r = insert_dates(r, rec["dates"], rng, sid, f"Season dates from {sid} (hunt {r['huntCode']})")
                    filled.append(f"{sp} {r['huntCode']}")
                else:
                    empty.append(f"{sp} {r['huntCode']}")
            out.append(r)
            st = stats.setdefault(sp, {"latestYear": latest, "latestRows": 0, "latestWithRanges": 0, "allRows": 0, "allWithRanges": 0})
            st["allRows"] += 1
            st["allWithRanges"] += bool(r.get("seasonRanges"))
            if r["year"] == latest:
                st["latestRows"] += 1
                st["latestWithRanges"] += bool(r.get("seasonRanges"))
        write_rows(p, out)
    print("round-trip failures:", len(rt_fail), *rt_fail[:20], sep="\n  ")
    print("2026 rows filled from booklets:", len(filled), filled[:20])
    print("2026 rows left without dates (not in booklet by hunt number):", len(empty), empty)
    print(json.dumps(stats, indent=1))

    # ---------------- 3. draw-meta.seasons[]
    groups = {}
    order = []
    for sid, year in BOOKS:
        for w in walked[sid]:
            sec = w["section"] or ""
            sps = species_for(sec, w["legal"])
            if not sps:
                continue
            h = w["hunt"]
            if h and re.match(r"^\d{4}$", h):
                rec = regs[sid].get(h)
                if rec and rec.get("bonusOnly"):
                    continue
                kind = "draw"
            elif h == "----":
                kind = "special"
            else:
                kind = "nonpermit"
            rng, _ = parse_season_text(w["dates"], year)
            # (sub-headings such as "Merriam's Turkey" are not repeated on every page, so they are left out)
            base = label_case(sec) + f" — {w['legal']}"
            if kind == "special":
                base += f" — {w['openAreas']}"
            method = method_for(sec)
            for i, g in enumerate(rng):
                label = base + (f" (season part {i+1} of {len(rng)})" if len(rng) > 1 else "")
                for sp in sps:
                    key = (sp, label, method, g["start"], g["end"], year, sid, kind)
                    if key not in groups:
                        groups[key] = {"huntCodes": [], "units": [], "areas": [], "legal": w["legal"]}
                        order.append(key)
                    G = groups[key]
                    if kind == "draw" and h not in G["huntCodes"]:
                        G["huntCodes"].append(h)
                    us = units_from_regs(w["openAreas"])
                    for u in us:
                        if u not in G["units"]:
                            G["units"].append(u)
                    # keep the printed open-area text when it is more than a plain unit list
                    # (hunt areas, exclusions, Hopi/Camp Navajo), so units are not read as whole units
                    rest = re.sub(r"\b\d{1,2}[A-Z]{0,3}\b|\b(?:North|South|East|West|and|Units?)\b|[,\s]", "", w["openAreas"])
                    if (not us or rest) and w["openAreas"] not in G["areas"]:
                        G["areas"].append(w["openAreas"])
    seasons = [s for s in meta["seasons"] if s["species"] == "lion"]
    sp_order = {s: i for i, s in enumerate(["elk", "pronghorn", "mule-deer", "whitetail", "sheep", "turkey", "bear", "lion"])}
    built = []
    for key in order:
        sp, label, method, a, b, year, sid, kind = key
        G = groups[key]
        s = {"species": sp, "label": label}
        if method:
            s["method"] = method
        if G["units"]:
            s["units"] = G["units"]
        if G["huntCodes"]:
            s["huntCodes"] = G["huntCodes"]
        s.update({"start": a, "end": b, "year": year})
        notes = []
        if kind == "draw":
            notes.append("Draw hunt permit-tag (hunt numbers listed)")
        elif kind == "special":
            notes.append("Draw hunt AZGFD prints without a hunt number (special-area/eligibility hunt)")
        else:
            notes.append("Nonpermit-tag (over the counter, no draw); unit harvest limits apply")
        if sp in ("mule-deer", "whitetail") and "mule deer" not in G["legal"].lower() and "white" not in G["legal"].lower():
            notes.append("legal wildlife is either deer species")
        if G["areas"]:
            notes.append("Open areas: " + "; ".join(G["areas"]))
        s["note"] = "; ".join(notes) + "."
        s["sourceId"] = sid
        built.append(s)
    built.sort(key=lambda s: (sp_order[s["species"]], s["year"], s["start"], s["label"]))
    meta["seasons"] = built + seasons
    with open(meta_path, "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
        f.write("\n")
    by = {}
    for s in meta["seasons"]:
        by[(s["species"], s["year"])] = by.get((s["species"], s["year"]), 0) + 1
    print("draw-meta.seasons:", len(meta["seasons"]), {f"{k[0]} {k[1]}": v for k, v in sorted(by.items())})
    if rt_fail:
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        sys.exit(0 if self_test() else 1)
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
