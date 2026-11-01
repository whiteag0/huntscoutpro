#!/usr/bin/env python3
"""Per-hunt season dates for California draw rows, read from the 2026 Big Game Hunting Digest hunt tables.

Source: 2026 California Big Game Hunting Digest (DocumentID 200602, `pdftotext -layout` text written by
draw_fetch.py into <draw_raw>/digest/200602.txt), pages 31-38 (premium deer hunts: "2026 Archery Season
Dates" / "2026 General Season Dates"), 48-53 (elk, "2026 Hunt Dates"), 58-59 (pronghorn) and 61 (bighorn
sheep). The digest prints month and day only ("Sep 19 - Oct 18", "Dec 22 - Jan 03", "Dec 5 - Feb 7").
Years follow CDFW's license year (July 1, 2026 - June 30, 2027): July-December dates are 2026 and
January-June dates are 2027. CDFW's own 2026 documents print the years the same way (2026 Elk Hunt Dates:
"December 22, 2026 - January 3, 2027"; Approved 2026 Deer Seasons: m/d/2026).

What is written on each 2026 row of draw/{mule-deer,elk,pronghorn,sheep}.json:
  seasonDates    the digest's date cells joined as printed; a hunt with an archery and a general column is
                 "Archery: Oct 3 - Oct 25; General: Nov 7 - Nov 29"; hunts C and A1 (valid in zones C1-C4 with
                 a season per zone) are "C1: Sep 19 - Oct 18; C2: ...".
  seasonRanges   one {start, end[, label]} per printed segment (label "Archery season" / "General season" /
                 "Zone C1" where the digest splits the hunt).
  seasonSourceId "d-digest-2026".
Rows the digest does not print are left without dates and counted.

Usage:
  python -I seasons_digest.py <draw_raw_dir> <repo_root>            # write the 2026 rows
  python -I seasons_digest.py <draw_raw_dir> <repo_root> --check    # parse and report only
Run after draw_build.py (which rewrites the rows) and before validate.mjs. draw_meta.py imports
meta_seasons() from here for draw-meta.json seasons[] (elk / pronghorn / bighorn sheep hunt periods).
"""
import datetime as dt
import json
import os
import re
import sys

YEAR = 2026
DIGEST_ID = "200602"
SOURCE_ID = "d-digest-2026"
SPECIES = ("mule-deer", "elk", "pronghorn", "sheep")
MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9,
          "oct": 10, "nov": 11, "dec": 12}
MON = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)"
# "Sep 19 - Oct 18", "Aug 01-Aug 09", "Oct 31- Nov 08", "Sept 12 - Sept 27", "Oct 3-4"
RANGE_RE = re.compile(rf"({MON})\s*(\d{{1,2}})\s*-\s*(?:({MON})\s*)?(\d{{1,2}})(?!\d)")
# (start heading, end heading) of each species' hunt tables in the digest text
REGIONS = {
    "mule-deer": ("2026 PREMIUM DEER HUNTS", "2026 RESTRICTED DEER HUNTS"),
    "elk": ("2026 ELK HUNTS", "PRONGHORN HUNT ZONES"),
    "pronghorn": ("2026 PRONGHORN HUNTS", "BIGHORN SHEEP HUNT ZONES"),
    "sheep": ("2026 BIGHORN SHEEP HUNTS", "WILD PIG HUNTING"),
}
# Deer tables with an archery and a general date column ("2026 Archery Season Dates", "2026 General ...").
TWO_COLUMN = {"D12", "D14", "D17"}
# Where CDFW's 2026-2027 Mammal Hunting Regulations booklet hunt table prints other dates than the digest
# (the digest agrees with CDFW's "2026 Elk Hunt Dates and General Information" sheet). Found by seasons_spotcheck.py.
SEASON_NOTES = {
    ("elk", "373"): "Season dates: the 2026 Big Game Hunting Digest and CDFW's 2026 Elk Hunt Dates sheet print Sep 12-27; the hunt table in CDFW's 2026-2027 Mammal Hunting Regulations booklet prints 'Sep 12- Sep 17'.",
    ("elk", "496"): "Season dates: the 2026 Big Game Hunting Digest and CDFW's 2026 Elk Hunt Dates sheet print Oct 17-25; the hunt table in CDFW's 2026-2027 Mammal Hunting Regulations booklet prints 'Oct 03- Oct 11'.",
}


def month_num(tok):
    return MONTHS[tok.lower()[:4] if tok.lower().startswith("sept") else tok.lower()[:3]]


def license_year_date(month, day, year=YEAR):
    """CDFW license year: July-December are `year`, January-June are year + 1."""
    return dt.date(year if month >= 7 else year + 1, month, day)


def parse_ranges(text, year=YEAR):
    """All 'Mon D - [Mon] D' ranges in text -> [(printed, start_iso, end_iso)], in order."""
    out = []
    for m in RANGE_RE.finditer(text):
        m1 = month_num(m.group(1))
        m2 = month_num(m.group(3)) if m.group(3) else m1
        s = license_year_date(m1, int(m.group(2)), year)
        e = license_year_date(m2, int(m.group(4)), year)
        if e < s:
            raise ValueError(f"range ends before it starts: {m.group(0)!r}")
        out.append((re.sub(r"\s+", " ", m.group(0)).strip(), s.isoformat(), e.isoformat()))
    return out


def region_lines(txt, species):
    a, b = REGIONS[species]
    i = txt.find(a)
    j = txt.find(b, i)
    if i < 0 or j < 0:
        raise SystemExit(f"digest: cannot find the {species} tables ({a!r} .. {b!r})")
    return txt[i:j].splitlines()


def _code_line_idx(lines, code):
    pat = re.compile(rf"^\s*{re.escape(code)}\s+\S")
    return [i for i, l in enumerate(lines) if pat.match(l)]


def hunt_dates(lines, code, year=YEAR):
    """-> (seasonDates, [range dicts]) for one hunt code, or None when the digest prints no dates for it."""
    if code == "C":  # zone rows "C1 Zone General Seasons - Buck ... Sep 19 - Oct 18"
        parts, ranges = [], []
        for l in lines:
            m = re.match(r"^\s*(C[1-4]) Zone General Seasons - Buck\b(.*)$", l)
            if m:
                rr = parse_ranges(m.group(2), year)
                if len(rr) != 1:
                    raise ValueError(f"C: expected one range on {l!r}")
                parts.append(f"{m.group(1)}: {rr[0][0]}")
                ranges.append({"start": rr[0][1], "end": rr[0][2], "label": f"Zone {m.group(1)}"})
        return ("; ".join(parts), ranges) if len(parts) == 4 else None
    if code == "A1":  # "C Zones Archery Only Hunt (Zone C-1 Season) ... Aug 15 - Aug 30"
        parts, ranges = [], []
        for l in lines:
            m = re.match(r"^\s*C Zones Archery Only Hunt \(Zone C-([1-4]) Season\)(.*)$", l)
            if m:
                rr = parse_ranges(m.group(2), year)
                if len(rr) != 1:
                    raise ValueError(f"A1: expected one range on {l!r}")
                parts.append(f"C{m.group(1)}: {rr[0][0]}")
                ranges.append({"start": rr[0][1], "end": rr[0][2], "label": f"Zone C{m.group(1)}"})
        return ("; ".join(parts), ranges) if len(parts) == 4 else None
    found = []
    for i in _code_line_idx(lines, code):
        rr = parse_ranges(lines[i], year)
        if rr:
            found.append(rr)
            continue
        # A table row whose date cell wrapped onto the lines above/below (J10: "Oct 3-4 &" / "Oct 10-12").
        if "%" in lines[i]:
            adj = []
            for j in (i - 1, i + 1):
                if 0 <= j < len(lines) and RANGE_RE.search(lines[j]) and not re.match(r"^\s*[A-Z0-9]{1,4}\s+[A-Za-z]", lines[j]):
                    adj.append(lines[j].strip())
            rr = parse_ranges(" ".join(adj), year)
            if rr:
                found.append(rr)
    if not found:
        return None
    if any([x[1:] for x in f] != [x[1:] for x in found[0]] for f in found[1:]):
        raise ValueError(f"{code}: digest prints different dates in two tables: {found}")
    rr = found[0]
    if code in TWO_COLUMN:
        if len(rr) != 2:
            raise ValueError(f"{code}: expected archery and general ranges, got {rr}")
        txt = f"Archery: {rr[0][0]}; General: {rr[1][0]}"
        return txt, [{"start": rr[0][1], "end": rr[0][2], "label": "Archery season"},
                     {"start": rr[1][1], "end": rr[1][2], "label": "General season"}]
    if len(rr) == 1:
        return rr[0][0], [{"start": rr[0][1], "end": rr[0][2]}]
    # several segments printed in one cell (J10 "Oct 3-4 & Oct 10-12")
    return " & ".join(x[0] for x in rr), [{"start": x[1], "end": x[2]} for x in rr]


def digest_text(draw_raw):
    p = os.path.join(draw_raw, "digest", f"{DIGEST_ID}.txt")
    return open(p, encoding="utf-8", errors="replace").read()


def parse_all(draw_raw, codes_by_species):
    txt = digest_text(draw_raw)
    out = {}
    for sp, codes in codes_by_species.items():
        lines = region_lines(txt, sp)
        out[sp] = {c: hunt_dates(lines, c) for c in codes}
    return out


def _with_seasons(row, sd, ranges, extra_note=None):
    new = {}
    if extra_note:
        base = (row.get("note") or "").split(" Season dates: ")[0].strip()
        if base.startswith("Season dates: "):
            base = ""
        row = dict(row, note=(base + " " + extra_note).strip())
    for k, v in row.items():
        if k in ("seasonDates", "seasonRanges", "seasonSourceId"):
            continue
        if k == "choice":
            new["seasonDates"] = sd
            new["seasonRanges"] = ranges
            new["seasonSourceId"] = SOURCE_ID
        new[k] = v
    return new


def load_rows(repo, sp):
    return json.load(open(os.path.join(repo, "src/data/agency/california/draw", f"{sp}.json")))


def meta_seasons(draw_raw, repo):
    """draw-meta seasons[] for elk, pronghorn and bighorn sheep: one entry per hunt period (hunts of one zone
    with the same dates and method grouped), from the same digest tables as the rows."""
    out = []
    for sp in ("elk", "pronghorn", "sheep"):
        rows = [r for r in load_rows(repo, sp) if r["year"] == YEAR]
        parsed = parse_all(draw_raw, {sp: [r["huntCode"] for r in rows]})[sp]
        groups = {}
        for r in sorted(rows, key=lambda r: int(r["huntCode"])):
            got = parsed.get(r["huntCode"])
            if not got:
                continue
            sd, ranges = got
            key = (tuple(r["units"]), r.get("method") or "all", tuple((g["start"], g["end"]) for g in ranges))
            groups.setdefault(key, []).append(r)
        for (units, method, rr), members in sorted(groups.items(), key=lambda kv: (kv[0][2][0][0], kv[0][0])):
            codes = [m["huntCode"] for m in members]
            zone = units[0] if units else ""
            if sp == "elk":
                kinds = {"archery": "archery", "muzzleloader": "muzzleloader", "other": "muzzleloader/archery"}.get(method, "general methods")
                label = f"{zone} elk ({kinds}) — hunt{'s' if len(codes) > 1 else ''} {', '.join(codes)}"
            elif sp == "pronghorn":
                kinds = "archery" if method == "archery" else "general methods"
                label = f"Pronghorn {zone} ({kinds}) — hunt{'s' if len(codes) > 1 else ''} {', '.join(codes)}"
            else:
                label = f"Bighorn sheep {zone} — hunt{'s' if len(codes) > 1 else ''} {', '.join(codes)}"
            descs = "; ".join(f"{m['huntCode']} {m['description']}" for m in members)
            for k, (s, e) in enumerate(rr):
                ent = {"species": sp, "label": label, "method": method, "units": list(units), "huntCodes": codes,
                       "start": s, "end": e, "year": YEAR, "sourceId": SOURCE_ID}
                note = f"2026 Big Game Hunting Digest hunt table: {descs}. Drawing tags only."
                if len(rr) > 1:
                    note = f"Segment {k + 1} of {len(rr)}. " + note
                ent["note"] = note
                out.append(ent)
    return out


def _zone_rows(lines, pat):
    """{zone/code: [(printed, start, end), ...]} for digest deer table lines matching pat (group 1 = id)."""
    out = {}
    for l in lines:
        m = re.match(pat, l)
        if m:
            rr = parse_ranges(l[m.end(1):])
            if rr:
                out[m.group(1)] = rr
    return out


def deer_meta_seasons(draw_raw):
    """draw-meta seasons[] for deer zones not already hand-entered in draw_meta.py: unrestricted D6-D19 zones,
    premium D12/D14/D17 and X zones, and the premium archery hunts in the C and X zones (A1, A3-A20), plus the
    unrestricted X-zone archery hunts A18 and A19. Zones with the same dates are grouped."""
    txt = digest_text(draw_raw)
    a = txt.index("2026 UNRESTRICTED DEER HUNTS")
    unres = txt[a:txt.index("ELK, PRONGHORN & BIGHORN SHEEP", a)].splitlines()
    prem = region_lines(txt, "mule-deer")
    out = []

    def add(label, method, units, codes, rng, note):
        e = {"species": "mule-deer", "label": label, "method": method, "units": units}
        if codes:
            e["huntCodes"] = codes
        e.update({"start": rng[1], "end": rng[2], "year": YEAR, "sourceId": SOURCE_ID, "note": note})
        out.append(e)

    # unrestricted D zones (D3-5 is hand-entered in draw_meta.py)
    dz = _zone_rows(unres, r"^\s*(D\d+)\s+D\d+ Zone - Archery and General")
    groups = {}
    for z, rr in dz.items():
        if len(rr) != 2:
            raise ValueError(f"{z}: expected archery and general dates")
        groups.setdefault(tuple(x[1:] for x in rr), []).append(z)
    for key, zones in sorted(groups.items(), key=lambda kv: int(kv[1][0][1:])):
        rr = dz[zones[0]]
        names = " and ".join([", ".join(zones[:-1]), zones[-1]] if len(zones) > 1 else zones)
        zs = "zone" if len(zones) == 1 else "zones"
        note = "Unrestricted zone tag (issued until the quota fills)."
        if set(zones) >= {"D11", "D13", "D15"}:
            note += " D11, D13 and D15 tags are each valid in all three zones."
        add(f"{names} {zs} archery season (buck)", "archery", zones, None, rr[0], note)
        add(f"{names} {zs} general season (buck)", "all", zones, None, rr[1], note)
    # premium D zones (Big Game Drawing)
    for z in sorted(TWO_COLUMN):
        got = hunt_dates(prem, z)
        if not got:
            raise ValueError(f"{z}: no dates")
        rr = got[1]
        note = "Premium deer hunt (Big Game Drawing); the tag is valid in both seasons."
        add(f"{z} zone archery season (buck, premium {z} tag)", "archery", [z], [z], (None, rr[0]["start"], rr[0]["end"]), note)
        add(f"{z} zone general season (buck, premium {z} tag)", "all", [z], [z], (None, rr[1]["start"], rr[1]["end"]), note)
    # premium X zones, general season
    xz = _zone_rows(prem, r"^\s*(X\d+[A-C]?)\s+Zone X")
    groups = {}
    for z, rr in xz.items():
        groups.setdefault(tuple(x[1:] for x in rr), []).append(z)
    for key, zones in sorted(groups.items(), key=lambda kv: kv[0][0]):
        names = ", ".join(zones)
        add(f"X zone general season (buck): {names}", "all", zones, zones, xz[zones[0]][0],
            "Premium deer hunts (Big Game Drawing), one tag per zone; archery in each X zone is a separate hunt (A3-A20).")
    # premium archery hunts in the C zones (A1) and X zones (A3-A20); A18 and A19 are unrestricted
    a1 = hunt_dates(prem, "A1")
    groups = {}
    for g in a1[1]:
        groups.setdefault((g["start"], g["end"]), []).append(g["label"].replace("Zone ", ""))
    for (s, e), zones in sorted(groups.items()):
        add(f"C zones archery-only hunt A1 (buck): {' and '.join(zones)}", "archery", zones, ["A1"], (None, s, e),
            "Premium hunt A1 (Big Game Drawing) is valid in zones C1-C4 during the archery season only; each zone has its own dates.")
    ax = _zone_rows(prem, r"^\s*(A\d+)\s+Archery Hunt In Zone X")
    ax.update({k: v for k, v in _zone_rows(unres, r"^\s*(A\d+)\s+Archery Hunt in (?:Zone )?X").items()})
    zone_of = {}
    for l in prem + unres:
        m = re.match(r"^\s*(A\d+)\s+Archery Hunt [Ii]n (?:Zone )?(X\d+[a-c]?)\b", l)
        if m:
            zone_of[m.group(1)] = m.group(2).upper()
    groups = {}
    for c, rr in ax.items():
        if len(rr) != 1:
            raise ValueError(f"{c}: expected one archery range")
        groups.setdefault(rr[0][1:], []).append(c)
    for (s, e), codes in sorted(groups.items()):
        codes.sort(key=lambda c: int(c[1:]))
        unr = [c for c in codes if c in ("A18", "A19")]
        note = "Archery-only hunts, one per X zone; premium (Big Game Drawing) except A18 and A19, which are unrestricted."
        if not unr:
            note = "Premium archery-only hunts (Big Game Drawing), one per X zone."
        add(f"X zone archery-only hunts (buck): {', '.join(codes)}", "archery", [zone_of[c] for c in codes], codes, (None, s, e), note)
    return out


def main():
    draw_raw, repo = sys.argv[1], sys.argv[2]
    check = "--check" in sys.argv
    total = {}
    for sp in SPECIES:
        rows = load_rows(repo, sp)
        latest = [r for r in rows if r["year"] == YEAR]
        parsed = parse_all(draw_raw, {sp: [r["huntCode"] for r in latest]})[sp]
        filled, missing = 0, []
        out = []
        for r in rows:
            if r["year"] == YEAR:
                got = parsed.get(r["huntCode"])
                if got:
                    r = _with_seasons(r, *got, SEASON_NOTES.get((sp, r["huntCode"])))
                    filled += 1
                else:
                    missing.append(r["huntCode"])
            out.append(r)
        total[sp] = {"rows2026": len(latest), "withSeasonRanges": filled, "missing": missing}
        if check:
            for r in latest:
                print(sp, r["huntCode"], "|", (parsed.get(r["huntCode"]) or ("-", []))[0])
        else:
            with open(os.path.join(repo, "src/data/agency/california/draw", f"{sp}.json"), "w") as f:
                json.dump(out, f, indent=1, ensure_ascii=False)
                f.write("\n")
    print(json.dumps(total, indent=1))


if __name__ == "__main__":
    main()
