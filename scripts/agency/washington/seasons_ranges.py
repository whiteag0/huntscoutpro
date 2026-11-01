"""Add structured season ranges to src/data/agency/washington/draw/*.json, and fill the spring black bear
rows' season dates from the WAC 220-415-080 rule filings.

Usage:  python -I seasons_ranges.py <raw_seasons_dir> <repo_root>
Run after draw_build.py (which writes draw/*.json without seasonRanges) and before draw_meta.py.
<raw_seasons_dir> holds the Washington State Register filings of WAC 220-415-080 (spring black bear
special permits), saved as wsr_<number>.htm from https://lawfilesext.leg.wa.gov/law/wsr/<yyyy>/<nn>/<number>.htm:
  wsr_21-02-015.htm  permanent rule, 2021 spring black bear special permits (season dates used for 2021 rows)
  wsr_20-10-065.htm  emergency rule WAC 220-415-08000C, 2020 seasons as reopened May 5 (used for 2020 rows)
  wsr_19-22-061.htm  permanent rule, 2020 spring black bear special permits (quoted in the 2020 row notes)

seasonRanges are parsed from each row's seasonDates text (the WDFW pamphlet text, e.g. "Oct. 1-7 and Dec. 16-31",
"Aug. 1, 2021-Mar. 31, 2022"). Year rule: a WDFW big game pamphlet covers one license year, April 1 of the
draw year through March 31 of the next ("Effective April 1, 2026-March 31, 2027", 2026 pamphlet p. 2), so a
date in April-December falls in the draw year and a date in January-March in the next year, unless the text
prints a year, which must agree. Text that does not parse, or does not round-trip, gets no seasonRanges.
The script is idempotent; rows keep their order and the files keep one JSON row per line.
"""
import datetime
import glob
import json
import os
import re
import sys

MONTHS = {"jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
          "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
          "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12}
MON = r"(?P<{0}>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
SEG = re.compile(
    "^" + MON.format("m1") + r"[.,]?\s*(?P<d1>\d{1,2})\.?(?:,\s*(?P<y1>\d{4}))?"
    r"\s*(?:-|to)\s*"
    "(?:" + MON.format("m2") + r"[.,]?\s*)?(?P<d2>\d{1,2})(?:,\s*(?P<y2>\d{4}))?$")
SPLIT = re.compile(r"\s*(?:;\s*(?:and\s+)?|,?\s+and\s+)\s*")

SEASON_SRC_2021 = "d-wsr-21-02-015"
SEASON_SRC_2020 = "d-wsr-20-10-065"


def license_year(month, draw_year):
    """WDFW license year: April-December in the draw year, January-March in the next."""
    return draw_year + 1 if month <= 3 else draw_year


def parse(text, row_year):
    """Season text -> [{"start","end"}] (ISO dates), or None when the text is not a plain list of date ranges."""
    if not text:
        return None
    t = text.strip().lower().replace("–", "-").replace("—", "-")
    t = re.sub(r"\s+", " ", t)
    out = []
    for seg in SPLIT.split(t):
        m = SEG.match(seg.strip())
        if not m:
            return None
        m1 = MONTHS[m["m1"]]
        m2 = MONTHS[m["m2"]] if m["m2"] else m1
        y1 = license_year(m1, row_year)
        y2 = license_year(m2, row_year)
        # a printed year must agree with the license-year rule
        if (m["y1"] and int(m["y1"]) != y1) or (m["y2"] and int(m["y2"]) != y2):
            return None
        try:
            a = datetime.date(y1, m1, int(m["d1"]))
            b = datetime.date(y2, m2, int(m["d2"]))
        except ValueError:
            return None
        if a > b:
            return None
        out.append({"start": a.isoformat(), "end": b.isoformat()})
    return out or None


# ---------- round trip (independent text normalisation, not the parser's regex) ----------
ABBR = {1: "jan", 2: "feb", 3: "mar", 4: "apr", 5: "may", 6: "jun", 7: "jul", 8: "aug", 9: "sep", 10: "oct", 11: "nov", 12: "dec"}


def norm_text(text):
    t = text.lower().replace("–", "-").replace("—", "-").replace(" to ", "-")
    t = re.sub(r",?\s*\b20\d\d\b", "", t)  # drop printed years
    t = re.sub(r"\band\b|;", "|", t)
    t = re.sub(r"[.,]", " ", t)
    for word, n in sorted(MONTHS.items(), key=lambda kv: -len(kv[0])):
        t = re.sub(r"\b" + word + r"\b", ABBR[n], t)
    t = re.sub(r"\s+", "", t)
    t = re.sub(r"\|+", "|", t).strip("|")
    # "oct1-7" -> "oct1-oct7"
    t = re.sub(r"([a-z]{3})(\d+)-(\d+)(?=\||$)", r"\1\2-\1\3", t)
    return t


def render(ranges):
    parts = []
    for g in ranges:
        a, b = datetime.date.fromisoformat(g["start"]), datetime.date.fromisoformat(g["end"])
        parts.append(f"{ABBR[a.month]}{a.day}-{ABBR[b.month]}{b.day}")
    return "|".join(parts)


def round_trips(text, ranges, row_year):
    if norm_text(text) != render(ranges):
        return False
    # every range lies in the license year (Apr 1 of the draw year - Mar 31 of the next)
    lo, hi = f"{row_year}-04-01", f"{row_year + 1}-03-31"
    return all(lo <= g["start"] <= g["end"] <= hi for g in ranges)


# ---------- spring black bear (WAC 220-415-080 filings) ----------
def rule_table(path):
    """Rows (hunt name, area text, permits, season dates) of the 'Hunt Name | Hunt Area | Permits | Season Dates'
    table, with the struck-out '((...))' text of the amendment removed (the rule as adopted)."""
    from bs4 import BeautifulSoup  # noqa: E402  (only needed for the bear fill)
    soup = BeautifulSoup(open(path, encoding="utf-8", errors="replace").read(), "html.parser")
    rows = []
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        head = [re.sub(r"\s+", " ", td.get_text(" ")).strip() for td in trs[0].find_all("td")] if trs else []
        if head[:4] != ["Hunt Name", "Hunt Area", "Permits", "Season Dates"]:
            continue
        for tr in trs[1:]:
            tds = tr.find_all("td")
            if tds and tds[0].get_text(" ").strip().startswith("(("):
                continue  # whole row struck out by the amendment (e.g. Kapowsin in WSR 19-22-061)
            cells = []
            for td in tds:
                s = re.sub(r"\(\(.*?\)\)", " ", td.get_text(" "), flags=re.S)
                s = re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()
                if s:  # the filings carry an empty spacer cell before the dates
                    cells.append(s)
            if len(cells) >= 4:
                rows.append(cells[:4])
    return rows


def gmus(area):
    return sorted(re.findall(r"\b\d{3}\b", area))


def bear_fill(rows, raw):
    tables = {2021: rule_table(os.path.join(raw, "wsr_21-02-015.htm")),
              2020: rule_table(os.path.join(raw, "wsr_20-10-065.htm"))}
    orig2020 = {(r[0], tuple(gmus(r[1]))): r[3] for r in rule_table(os.path.join(raw, "wsr_19-22-061.htm"))}
    filled = missing = 0
    out = []
    for r in rows:
        if r["year"] not in tables:
            out.append(r)
            continue
        name = r["description"].split(" — ")[0]
        hit = [t for t in tables[r["year"]] if t[0] == name and gmus(t[1]) == sorted(r["units"])]
        if len(hit) != 1 or not parse(hit[0][3], r["year"]):
            missing += 1
            out.append(r)
            continue
        dates = hit[0][3]
        new = {}
        for k, v in r.items():
            if k in ("seasonDates", "seasonRanges", "seasonSourceId") or (k == "note" and r["year"] == 2020):
                continue
            if k == "choice":
                new["seasonDates"] = dates
                new["seasonSourceId"] = SEASON_SRC_2021 if r["year"] == 2021 else SEASON_SRC_2020
            if k == "sourceId" and r["year"] == 2020:
                o = orig2020.get((name, tuple(sorted(r["units"]))))
                new["note"] = ("Season dates as reopened by WDFW emergency rule WSR 20-10-065 (WAC 220-415-08000C, effective "
                               "May 5, 2020) after WSR 20-09-043 delayed the April opening (COVID-19)."
                               + (f" The permanent rule for 2020 (WSR 19-22-061) had listed {o}." if o else ""))
            new[k] = v
        filled += 1
        out.append(new)
    return out, filled, missing


def dump(rows, ensure_ascii=False):
    return "[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=ensure_ascii) for r in rows) + "\n]\n"


def add_ranges(r):
    """Return a copy of row r with seasonRanges set (right after seasonDates) or removed when unparseable."""
    rng = parse(r.get("seasonDates"), r["year"])
    if rng and not round_trips(r["seasonDates"], rng, r["year"]):
        rng = None
    new = {}
    for k, v in r.items():
        if k == "seasonRanges":
            continue
        new[k] = v
        if k == "seasonDates" and rng:
            new["seasonRanges"] = rng
    return new, rng is not None


def main(raw, repo):
    d = os.path.join(repo, "src", "data", "agency", "washington", "draw")
    for f in sorted(glob.glob(os.path.join(d, "*.json"))):
        text = open(f, encoding="utf-8").read()
        rows = json.loads(text)
        assert dump(rows) == text, f"{f}: unexpected file format"
        sp = os.path.basename(f)[:-5]
        extra = ""
        if sp == "bear":
            rows, filled, missing = bear_fill(rows, raw)
            extra = f" bear season dates filled {filled}, not found {missing}"
        out, stats = [], {}
        for r in rows:
            nr, ok = add_ranges(r)
            out.append(nr)
            s = stats.setdefault(r["year"], [0, 0, 0])
            s[0] += 1
            s[1] += bool(r.get("seasonDates"))
            s[2] += ok
        open(f, "w", encoding="utf-8").write(dump(out))
        print(sp, " ".join(f"{y}:{a}/{b}/{c}" for y, (c, b, a) in sorted(stats.items())), "(year:ranges/dates/rows)" + extra)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
