#!/usr/bin/env python3
"""Add KDWP season dates and key-date tags to src/data/agency/kansas/.

Usage:  python -I scripts/agency/kansas/seasons_parse.py <raw_dir> <repo_root>
        <raw_dir> = the folder written by seasons_fetch.py (outside the repo).

Run it AFTER draw_parse.py and draw_meta.py (they rewrite the files this script edits). It is
idempotent.

1. draw-meta.seasons[] is rebuilt from KDWP's "When to Hunt" page, which lists each big game and
   turkey season with its rule and the dates for 2026, 2027 and 2028 (some as "... each year").
   2026 and 2027 are kept. KDWP's deer and elk seasons run into January-March of the next year; a
   January segment is filed under the season it ends (January 2027 = 2026 season) and the note
   quotes KDWP's own year label, which is not consistent across segments.
2. seasonDates / seasonRanges on the 2026 draw rows, from the When to Hunt dates and the permit
   rules on KDWP's Deer, Antelope and Turkey pages (which seasons each permit may be used in):
   * Nonresident white-tailed deer (by unit): the applicant picks archery, muzzleloader or firearm,
     and the draw report does not split by equipment, so every choice is listed and labelled.
     KDWP: "Muzzleloader permit holders may hunt during early muzzleloader season and regular
     firearm season using muzzleloader equipment only"; "All unfilled Either Sex Permits can be
     used in their designated units during the January Extended Season except Units 1, 2, 17, and
     18". The extended segment for the unit is added with that quote.
   * Nonresident Mule Deer Stamp (Units 1, 2, 17, 18): the stamp converts a drawn archery or
     muzzleloader permit, so the archery and muzzleloader seasons are listed.
   * Resident Firearm Either-Species/Either-Sex (East/West zone): "valid ... during the regular
     firearms season using any legal equipment" (+ the January extended segments of the East units).
   * Antelope: firearm permits -> Firearms season; muzzleloader permits -> Muzzleloader Only season.
   * Spring turkey (nonresident units 1, 2, 3, 5, 6; Unit 4): the three spring seasons.
3. keyDates get `kind` and `residency`; KDWP has not published 2027 application dates (checked on
   the Deer, Antelope, Elk, Turkey and Fees pages on 2026-10-31), so no 2027 key dates are added.
   The fall turkey permit sale date (Oct. 1, 2026) and the over-the-counter deer permit sale
   window (Aug. 5 - Dec. 31) are added as 2026 license-sale dates.
"""
import datetime
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

REVIEWED = "2026-10-31"
SEASON_SRC = "d-ks-seasons-page"
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
MON_RE = "(?:" + "|".join(m.capitalize() for m in MONTHS) + ")"


class Text(HTMLParser):
    BLOCK = {"p", "div", "li", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "ul", "ol"}

    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, t, a):
        if t in ("script", "style", "noscript"):
            self.skip += 1
        if t in self.BLOCK:
            self.out.append("\n")
        if t in ("td", "th"):
            self.out.append(" | ")

    def handle_endtag(self, t):
        if t in ("script", "style", "noscript"):
            self.skip -= 1
        if t in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


def page_lines(path):
    p = Text()
    with open(path, encoding="utf-8", errors="replace") as f:
        p.feed(f.read())
    t = html.unescape("".join(p.out)).replace("\xa0", " ")
    return [re.sub(r"[ \t]+", " ", x).strip() for x in t.split("\n") if x.strip()]


def d(y, mon, day):
    return datetime.date(int(y), MONTHS.index(mon.lower()) + 1, int(day)).isoformat()


def parse_dates(txt):
    """KDWP date text -> list of (start, end). Handles 'September 19-27, 2026', 'September 28-October 5, 2026',
    'December 19-23 and 26-31, 2026', 'October 31-December 1, 2026 and December 14, 2026-January 31, 2027',
    'November 14, 2026-January 31, 2027'."""
    txt = txt.strip().rstrip(".")
    out = []
    for part in re.split(r"\s+and\s+", txt):
        part = part.strip()
        m = re.fullmatch(rf"({MON_RE}) (\d{{1,2}}), (\d{{4}}) ?- ?({MON_RE}) (\d{{1,2}}), (\d{{4}})", part)
        if m:
            out.append((d(m[3], m[1], m[2]), d(m[6], m[4], m[5])))
            continue
        m = re.fullmatch(rf"({MON_RE}) (\d{{1,2}}) ?- ?({MON_RE}) (\d{{1,2}}), (\d{{4}})", part)
        if m:
            out.append((d(m[5], m[1], m[2]), d(m[5], m[3], m[4])))
            continue
        m = re.fullmatch(rf"({MON_RE}) (\d{{1,2}}) ?- ?(\d{{1,2}}), (\d{{4}})", part)
        if m:
            out.append((d(m[4], m[1], m[2]), d(m[4], m[1], m[3])))
            continue
        m = re.fullmatch(r"(\d{1,2}) ?- ?(\d{1,2}), (\d{4})", part)  # '26-31, 2026' after 'December 19-23 and'
        if m and out:
            prev = out[-1]
            mon = prev[0][1:] if len(prev) == 3 else MONTHS[int(prev[1][5:7]) - 1]
            out.append((d(m[3], mon, m[1]), d(m[3], mon, m[2])))
            continue
        m = re.fullmatch(rf"({MON_RE}) (\d{{1,2}}) ?- ?(\d{{1,2}})", part)  # 'December 19-23' (year follows later)
        if m:
            out.append(("?" + m[1], m[2], m[3]))
            continue
        raise ValueError(f"unparsed KDWP dates: {txt!r}")
    # resolve 'December 19-23 and 26-31, 2026'
    res = []
    for i, x in enumerate(out):
        if isinstance(x, tuple) and len(x) == 3:
            y = out[i + 1][0][:4]
            res.append((d(y, x[0][1:], x[1]), d(y, x[0][1:], x[2])))
        else:
            res.append(x)
    return res


def each_year(txt, season_year):
    """'September 1-30 each year' / 'January 1-March 15 each year' -> dates for one season year.
    January-March segments follow the fall season, so they fall in season_year + 1."""
    m = re.fullmatch(rf"({MON_RE}) (\d{{1,2}}) ?- ?(?:({MON_RE}) )?(\d{{1,2}}) each year", txt.strip())
    if not m:
        raise ValueError(f"unparsed 'each year' text {txt!r}")
    m2 = m[3] or m[1]
    y = season_year + 1 if MONTHS.index(m[1].lower()) < 3 else season_year
    return d(y, m[1], m[2]), d(y, m2, m[4])


# ---------------------------------------------------------------- When to Hunt page
# (key, species list, label used in draw-meta, method, units, residency, note). The key is the
# page's own heading line (searched in order, starting after the previous key).
S_DEER = ["whitetail", "mule-deer"]
SPEC = [
    ("Antelope - Archery", ["pronghorn"], "Antelope - Archery", "archery", None, None, None),
    ("Antelope - Muzzleloader Only", ["pronghorn"], "Antelope - Muzzleloader Only", "muzzleloader", None, None, None),
    ("Antelope - Firearms", ["pronghorn"], "Antelope - Firearms", "rifle", None, None, "Resident-only draw permits (Units 2, 17, 18)."),
    ("Deer - Youth and Disability", S_DEER, "Youth and Disability (deer)", None, None, None,
     "Youth and hunters with disabilities only."),
    ("Deer - Muzzleloader Only", S_DEER, "Muzzleloader Only (deer)", "muzzleloader", None, None, None),
    ("Regular Archery", S_DEER, "Regular Archery (deer)", "archery", None, None, None),
    ("Extended Archery Whitetail Antlerless Only (WAO), Unit 19 Only", ["whitetail"],
     "Extended Archery Whitetail Antlerless Only (WAO) - Unit 19", "archery", ["19"], None, None),
    ("Pre-Rut, Whitetail Antlerless Only (WAO)", ["whitetail"], "Pre-Rut, Whitetail Antlerless Only (WAO)", "rifle", None, None, None),
    ("Extended Pre-Rut, Whitetail Antlerless Only (WAO) - Unit 12 Only", ["whitetail"],
     "Extended Pre-Rut, Whitetail Antlerless Only (WAO) - Unit 12", "rifle", ["12"], None, None),
    ("Regular Firearms", S_DEER, "Regular Firearms (deer)", "rifle", None, None, "Any legal equipment for the season."),
    ("1st Segment, Unit 3 Only", ["whitetail"], "Extended Whitetail Antlerless Only (WAO) - 1st segment", "rifle", ["3"], None, None),
    ("2nd Segment, Units 4, 5, 6, 7, 8, 9, 10, and 16", ["whitetail"], "Extended Whitetail Antlerless Only (WAO) - 2nd segment",
     "rifle", ["4", "5", "6", "7", "8", "9", "10", "16"], None, None),
    ("3rd Segment, Units 11, 12, 13, 14, 15, and 19", ["whitetail"], "Extended Whitetail Antlerless Only (WAO) - 3rd segment",
     "rifle", ["11", "12", "13", "14", "15", "19"], None, None),
    ("Fort Riley, Subunit 8A", None, None, None, None, None, None),  # marker
    ("Regular Firearms: Third Saturday of December", S_DEER, "Fort Riley Subunit 8A - Regular Firearms", "rifle", ["8A"], None,
     "Fort Riley Outdoor Recreation and Conservation Permits also required; dates subject to cancellation for military training."),
    ("1st Segment: Friday following Thanksgiving", ["whitetail"], "Fort Riley Subunit 8A - Firearms WAO, 1st segment", "rifle", ["8A"], None, None),
    ("2nd Segment: January 1 through second Sunday after January 3", ["whitetail"], "Fort Riley Subunit 8A - Firearms WAO, 2nd segment",
     "rifle", ["8A"], None, None),
    ("Fort Leavenworth, Subunit 10A", None, None, None, None, None, None),  # marker
    ("1st Segment: Second Saturday prior to Thanksgiving", S_DEER, "Fort Leavenworth Subunit 10A - Regular Firearms, 1st segment", "rifle", ["10A"], None, None),
    ("2nd Segment: Saturday prior to Thanksgiving", S_DEER, "Fort Leavenworth Subunit 10A - Regular Firearms, 2nd segment", "rifle", ["10A"], None, None),
    ("3rd Segment: Thanksgiving day", S_DEER, "Fort Leavenworth Subunit 10A - Regular Firearms, 3rd segment", "rifle", ["10A"], None, None),
    ("4th Segment: Second Saturday after Thanksgiving", S_DEER, "Fort Leavenworth Subunit 10A - Regular Firearms, 4th segment", "rifle", ["10A"], None, None),
    ("5th Segment: Third Saturday after Thanksgiving", S_DEER, "Fort Leavenworth Subunit 10A - Regular Firearms, 5th segment", "rifle", ["10A"], None, None),
    ("Firearms Whitetail Antlerless Only (WAO): January 1 through third Sunday", ["whitetail"], "Fort Leavenworth Subunit 10A - Firearms WAO",
     "rifle", ["10A"], None, None),
    ("Extended Archery Whitetail Antlerless Only (WAO): Third Monday", ["whitetail"], "Fort Leavenworth Subunit 10A - Extended Archery WAO",
     "archery", ["10A"], None, None),
    ("Smoky Hill Air National Guard Range, Subunit 4A", S_DEER, "Smoky Hill ANG Range Subunit 4A - Firearms", "rifle", ["4A"], None, None),
    ("Elk - Archery", ["elk"], "Elk - Archery", "archery", None, None, "Statewide except Fort Riley Subunit 2a and Unit 1 (closed to elk hunting)."),
    ("Elk - Muzzleloader Only", ["elk"], "Elk - Muzzleloader Only", "muzzleloader", None, None, "Statewide except Unit 1 (closed to elk hunting)."),
    ("1st Segment", ["elk"], "Elk - Firearms, 1st Segment", "rifle", None, None, "Statewide except Fort Riley Subunit 2a and Unit 1."),
    ("2nd Segment", ["elk"], "Elk - Firearms, 2nd Segment", "rifle", None, None, "Statewide except Fort Riley Subunit 2a and Unit 1."),
    ("3rd Segment", ["elk"], "Elk - Firearms, 3rd Segment", "rifle", None, None, "Statewide except Fort Riley Subunit 2a and Unit 1."),
    ("Archery & Muzzleloader Only", ["elk"], "Elk on Fort Riley Subunit 2a - Archery & Muzzleloader", None, ["2a"], None, None),
    ("1st Segment: October 1-31 each year", ["elk"], "Elk on Fort Riley Subunit 2a - Firearms, 1st Segment", "rifle", ["2a"], None, None),
    ("2nd Segment: November 1-30 each year", ["elk"], "Elk on Fort Riley Subunit 2a - Firearms, 2nd Segment", "rifle", ["2a"], None,
     "KDWP's Elk page lists this antlerless segment as November 1-20 each year; the When to Hunt page says November 1-30."),
    ("3rd Segment: December 1-31 each year", ["elk"], "Elk on Fort Riley Subunit 2a - Firearms, 3rd Segment", "rifle", ["2a"], None, None),
    ("Extended Season: January 1-31 each year", ["elk"], "Elk on Fort Riley Subunit 2a - Extended Season", None, ["2a"], None,
     "KDWP's Elk page: open to all unfilled limited draw permit holders."),
    ("Fall Turkey - Residents Only", ["turkey"], "Fall Turkey - Residents Only", None, None, "resident",
     "Excludes the 12-day deer firearm season."),
    ("Spring Turkey - Youth and Disability", ["turkey"], "Spring Turkey - Youth and Disability", None, None, None,
     "Youth and hunters with disabilities only."),
    ("Spring Turkey - Archery Only", ["turkey"], "Spring Turkey - Archery Only", "archery", None, None, None),
    ("Spring Turkey - Regular (Firearms & Archery)", ["turkey"], "Spring Turkey - Regular (Firearms & Archery)", None, None, None, None),
]
TYPO = {  # KDWP text -> what it means (and the reason), applied before parsing
    "January 1, 17, 2027": ("January 1-17, 2027", "KDWP prints 'January 1, 17, 2027'; read as January 1-17 per its rule 'January 1 through second Sunday after January 3'."),
    "January 1-23, 208": ("January 1-23, 2028", "KDWP prints '2028: January 1-23, 208'; read as January 1-23, 2028 per its rule 'January 1 through third Sunday after January 3'."),
}


def when_to_hunt(lines):
    """Parse the When to Hunt page into {key: {"rule": str, "years": {label_year: (text, note)}, "each": str}}."""
    start = next(i for i, x in enumerate(lines) if x == "Antelope Seasons")
    end = next(i for i, x in enumerate(lines) if x.startswith("Pheasant and Quail Seasons"))
    body = lines[start:end]
    out, pos = {}, 0
    keys = [k for k, *_ in SPEC]
    for ki, key in enumerate(keys):
        i = next((j for j in range(pos, len(body)) if body[j].startswith(key)), None)
        if i is None:
            raise ValueError(f"When to Hunt: heading not found: {key!r}")
        pos = i + 1
        info = {"rule": body[i], "years": {}, "each": None}
        inline = re.search(r":\s*(.+ each year)$", body[i])
        if inline:
            info["each"] = inline.group(1)
        j = i + 1
        nxt = keys[ki + 1] if ki + 1 < len(keys) else None
        while j < len(body) and not (nxt and body[j].startswith(nxt)):
            line = body[j]
            m = re.match(r"^(\d{4})(?:-\d{4})?:\s*(.+)$", line)
            if m:
                txt, note = m.group(2).strip(), None
                if txt in TYPO:
                    txt, note = TYPO[txt]
                info["years"].setdefault(int(m.group(1)), (txt, note))
            elif line.endswith("each year") and not info["each"]:
                info["each"] = line.split(":")[-1].strip()
            elif j > i and info["rule"] == body[i] and not re.match(r"^\d{4}", line) and len(info.get("rule2", "")) == 0:
                info["rule2"] = line
            j += 1
            if re.match(r"^(Deer|Elk|Antelope|Turkey) Seasons$|Seasons in Kansas$", line):
                break
        out[key] = info
    return out


def build_seasons(wth):
    seasons = []
    for key, species, label, method, units, resd, note in SPEC:
        if not species:
            continue
        info = wth[key]
        # season year of each KDWP entry: a segment that falls only in January-March follows the
        # previous fall's season (KDWP labels such segments inconsistently: "2027: January 1-10, 2027"
        # but "2026: January 1-24, 2027")
        by_season = {}
        for ly, (txt, tnote) in info["years"].items():
            if ly > 2028:  # only the 2026 and 2027 seasons are kept (2028 labels can hold the 2027 season's January dates)
                continue
            rs = parse_dates(txt)
            first = rs[0][0]
            sy = int(first[:4]) - 1 if all(r[0][5:7] in ("01", "02", "03") for r in rs) else int(first[:4])
            n = []
            if ly != sy:
                n.append(f"KDWP lists these dates as '{ly}: {txt}'; filed with the {sy} season, which it follows.")
            if tnote:
                n.append(tnote)
            by_season.setdefault(sy, (rs, n))
        for sy in (2026, 2027):
            notes = [note] if note else []
            if info["each"]:
                ranges = [each_year(info["each"], sy)]
                notes.append(f"KDWP: {info['each']}.")
            elif sy in by_season:
                ranges, n = by_season[sy]
                notes += n
            else:
                continue
            for i, (a, b) in enumerate(ranges):
                for sp in species:
                    lab = label if len(ranges) == 1 else f"{label} ({'1st' if i == 0 else '2nd'} part)"
                    s = {"species": sp, "label": lab}
                    if method:
                        s["method"] = method
                    if units:
                        s["units"] = units
                    if resd:
                        s["residency"] = resd
                    s.update({"start": a, "end": b, "year": sy})
                    if notes:
                        s["note"] = " ".join(notes)
                    s["sourceId"] = SEASON_SRC
                    seasons.append(s)
    return seasons


def find(seasons, sp, label, year):
    m = [s for s in seasons if s["species"] == sp and s["label"] == label and s["year"] == year]
    if len(m) != 1:
        raise ValueError(f"season not found: {sp} {label} {year} ({len(m)})")
    return m[0]


def fmt(s):
    a, b = datetime.date.fromisoformat(s["start"]), datetime.date.fromisoformat(s["end"])
    if a.year == b.year:
        return f"{a:%B} {a.day}-{b:%B} {b.day}, {a.year}" if a.month != b.month else f"{a:%B} {a.day}-{b.day}, {a.year}"
    return f"{a:%B} {a.day}, {a.year}-{b:%B} {b.day}, {b.year}"


EXT = {"3": "Extended Whitetail Antlerless Only (WAO) - 1st segment"}
EXT.update({u: "Extended Whitetail Antlerless Only (WAO) - 2nd segment" for u in ["4", "5", "6", "7", "8", "9", "10", "16"]})
EXT.update({u: "Extended Whitetail Antlerless Only (WAO) - 3rd segment" for u in ["11", "12", "13", "14", "15", "19"]})
EXT_QUOTE = "KDWP: 'All unfilled Either Sex Permits can be used in their designated units during the January Extended Season except Units 1, 2, 17, and 18'"


def row_season(r, seasons):
    """(seasonDates, seasonRanges) for one 2026 draw row, or None."""
    Y = 2026
    g = lambda label, sp="whitetail": find(seasons, sp, label, Y)
    parts, ranges = [], []

    def add(lab, s, text_lab=None):
        ranges.append({"start": s["start"], "end": s["end"], "label": lab})
        parts.append(f"{text_lab or lab}: {fmt(s)}")

    sp, hc = r["species"], r["huntCode"]
    if sp == "whitetail" and re.fullmatch(r"Unit \d+", hc):
        unit = r["units"][0]
        add("Archery permit - Regular Archery", g("Regular Archery (deer)"))
        add("Muzzleloader permit - Muzzleloader Only", g("Muzzleloader Only (deer)"))
        add("Muzzleloader permit - Regular Firearms (muzzleloader equipment only)", g("Regular Firearms (deer)"))
        add("Firearm permit - Regular Firearms", g("Regular Firearms (deer)"))
        txt = ("Nonresident applicants choose archery, muzzleloader or firearm; " + "; ".join(parts))
        if unit in EXT:
            s = g(EXT[unit])
            ranges.append({"start": s["start"], "end": s["end"], "label": f"Unfilled permits - {EXT[unit]} (Unit {unit})"})
            txt += f"; January Extended Season (whitetail antlerless only), Unit {unit}: {fmt(s)} ({EXT_QUOTE})"
        else:
            txt += f". No January extended season in Unit {unit}."
        return txt, ranges
    if sp == "mule-deer" and hc.startswith("NR Mule Deer Stamp"):
        add("Archery permit - Regular Archery", g("Regular Archery (deer)", "mule-deer"))
        add("Muzzleloader permit - Muzzleloader Only", g("Muzzleloader Only (deer)", "mule-deer"))
        add("Muzzleloader permit - Regular Firearms (muzzleloader equipment only)", g("Regular Firearms (deer)", "mule-deer"))
        return ("The stamp converts a drawn nonresident archery or muzzleloader white-tailed deer permit to either-species: "
                + "; ".join(parts)), ranges
    if sp == "mule-deer" and r.get("methodLabel") == "Firearms":
        add("Regular Firearms (any legal equipment)", g("Regular Firearms (deer)", "mule-deer"))
        txt = "; ".join(parts)
        ext_units = [u for u in r["units"] if u in EXT]
        for lab in sorted({EXT[u] for u in ext_units}):
            us = [u for u in ext_units if EXT[u] == lab]
            s = g(lab)
            uw = ("Unit " if len(us) == 1 else "Units ") + ", ".join(us)
            ranges.append({"start": s["start"], "end": s["end"], "label": f"Unfilled permits - {lab} ({uw})"})
            txt += f"; January Extended Season (whitetail antlerless only), {uw}: {fmt(s)}"
        if ext_units:
            txt += f" ({EXT_QUOTE})"
        return txt, ranges
    if sp == "pronghorn":
        if r.get("method") == "rifle":
            add("Antelope - Firearms", find(seasons, "pronghorn", "Antelope - Firearms", Y))
        elif r.get("method") == "muzzleloader":
            add("Antelope - Muzzleloader Only", find(seasons, "pronghorn", "Antelope - Muzzleloader Only", Y))
        else:
            return None
        return "; ".join(parts), ranges
    if sp == "turkey" and "Spring" in (r.get("methodLabel") or "") and r["year"] == 2026:
        add("Youth and Disability (youth and hunters with disabilities only)", find(seasons, "turkey", "Spring Turkey - Youth and Disability", Y),
            "Youth and Disability")
        add("Archery Only", find(seasons, "turkey", "Spring Turkey - Archery Only", Y))
        add("Regular (Firearms & Archery)", find(seasons, "turkey", "Spring Turkey - Regular (Firearms & Archery)", Y))
        return "Spring turkey seasons: " + "; ".join(parts), ranges
    return None


KEYDATE_TAGS = {
    "Nonresident deer application period": ("application", "nonresident"),
    "Nonresident preference point purchase period": ("points", "nonresident"),
    "Resident Firearm Either-Species/Either-Sex application period": ("application", "resident"),
    "Resident preference point purchase period": ("points", "resident"),
    "Nonresident deer application period (incl. Mule Deer Stamp)": ("application", "nonresident"),
    "Resident firearm/muzzleloader antelope application period": ("application", "resident"),
    "Preference point purchase period": ("points", "resident"),
    "Resident elk application period": ("application", "resident"),
    "Bonus point purchase period": ("points", "resident"),
    "Nonresident and Unit 4 spring turkey application period": ("application", None),
    "Fall turkey permits go on sale (residents)": ("license-sale", "resident"),
    "Over-the-counter deer permits on sale": ("license-sale", None),
}
OTC_DEER = {"label": "Over-the-counter deer permits on sale", "start": "2026-08-05", "end": "2026-12-31", "cycle": 2026, "status": "confirmed",
            "note": "KDWP Deer page: resident any-season white-tailed, archery and muzzleloader either-species permits, and resident and nonresident "
                    "white-tailed antlerless-only (WAO) permits are available Aug. 5 - Dec. 31. 2027 dates not yet published by KDWP as of 2026-10-31.",
            "sourceId": "d-ks-deer-page"}
EXTRA = {
    "turkey": [{"label": "Fall turkey permits go on sale (residents)", "date": "2026-10-01", "cycle": 2026, "status": "confirmed",
                "note": "KDWP Turkey page: 'Permits will go on sale October 1, 2026.' Fall season reopened in 2026 for Kansas residents only (over the counter).",
                "sourceId": "d-ks-turkey-page"}],
    "whitetail": [OTC_DEER],
    "mule-deer": [OTC_DEER],
}


def dump_rows(path, rows):
    with open(path, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n")


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    raw, repo = sys.argv[1], sys.argv[2]
    base = os.path.join(repo, "src/data/agency/kansas")
    lines = page_lines(os.path.join(raw, "when.html"))
    wth = when_to_hunt(lines)
    seasons = build_seasons(wth)

    # 2027 application dates: confirm none are posted (the check this script relies on)
    for name in ("deer.html", "antelope.html", "elk.html", "turkey.html", "fees.html"):
        for x in page_lines(os.path.join(raw, name)):
            if "2027" in x and re.search(r"appl|draw|point|deadline", x, re.I):
                print(f"NOTE {name}: 2027 application text found, review: {x[:200]}")

    log = {}
    for f in sorted(os.listdir(os.path.join(base, "draw"))):
        path = os.path.join(base, "draw", f)
        with open(path) as fh:
            rows = json.load(fh)
        latest = max(r["year"] for r in rows)
        got = tot = 0
        for r in rows:
            for k in ("seasonDates", "seasonRanges", "seasonSourceId"):
                r.pop(k, None)
            if r["year"] != latest:
                continue
            tot += 1
            res = row_season(r, seasons)
            if res:
                r["seasonDates"], r["seasonRanges"], r["seasonSourceId"] = res[0], res[1], SEASON_SRC
                got += 1
        log[f[:-5]] = (got, tot)
        dump_rows(path, rows)

    mpath = os.path.join(base, "draw-meta.json")
    with open(mpath) as fh:
        meta = json.load(fh)
    for sp in meta["species"]:
        extra = EXTRA.get(sp["species"], [])
        kd = [x for x in sp["keyDates"] if x["label"] not in {e["label"] for e in extra}] + [dict(e) for e in extra]
        out = []
        for x in kd:
            if x["label"] not in KEYDATE_TAGS:
                sys.exit(f"untagged key date {x['label']}")
            kind, resd = KEYDATE_TAGS[x["label"]]
            rest = {k: v for k, v in x.items() if k not in ("label", "kind", "residency")}
            out.append({"label": x["label"], "kind": kind, **({"residency": resd} if resd else {}), **rest})
        sp["keyDates"] = out
        for e in extra:
            if e["sourceId"] not in sp["sourceIds"]:
                sp["sourceIds"].append(e["sourceId"])
    meta["seasons"] = seasons
    for s in meta["sources"]:
        if s["id"] == SEASON_SRC:
            s["title"] = "When to Hunt (season dates)"
            s["notes"] = ("Lists 2026, 2027 and 2028 dates for each big game and turkey season (some as 'each year'); "
                          "2026 and 2027 are used. Read 2026-10-31.")
            s["retrieved"] = REVIEWED
    meta["lastReviewed"] = REVIEWED
    with open(mpath, "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    for k, (g_, t) in log.items():
        print(f"{k}: {g_}/{t} latest-year rows with season dates")
    print(f"seasons: {len(seasons)}")


if __name__ == "__main__":
    main()
