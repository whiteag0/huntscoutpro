"""Parse WDFW Big Game Hunting Seasons & Rules pamphlet special-permit tables.

Input: `pdftotext -layout` output of the pamphlet (pamphlet_<year>.txt).
Output rows (dicts) per hunt choice with the fields exactly as printed:
  species group (by hunt-choice number: 1xxx deer, 2xxx elk, 3xxx turkey,
  5xxx bighorn sheep, 6xxx mountain goat, 8xxx moose), category heading,
  huntCode, name, notes, tag, dates, legal, unit, restrictions, permits (raw),
  apps header year, apps/avg points (raw), line number.

Usage (debug):  python -I draw_pamphlet.py <pamphlet.txt> [group]
"""
import re
import sys

GROUP = {"1": "deer", "2": "elk", "3": "turkey", "5": "sheep", "6": "goat", "8": "moose"}
ROW = re.compile(r"^(\s{0,14})(\d{4})(\s{2,})(\S.*)$")
APPS_HDR = re.compile(r"(20\d{2})\s?APPS")
DEER_ELK_HDR = re.compile(r"^\s*((?:[A-Za-z0-9&,'\-]+\s)*?(?:Deer|Elk|Turkey)\s(?:Hunts|Special Permits))(\s*\(Continued\))?\s*$")
# Verifier fix 2026-10-31: the 65-and-over and disabilities tables are titled "Deer Hunters 65 Years or Over",
# "Elk Hunters 65 Years and Older" and "Deer/Elk Hunters with Disabilities" (no "Hunts"), so DEER_ELK_HDR missed
# them and those hunts inherited the preceding "Youth ... Hunts" title.
HUNTERS_HDR = re.compile(r"^\s*((?:Deer|Elk)(?:\s-)?\sHunters\s(?:65 Years (?:or Over|and Older)|with Disabilities))(\s*\(Continued\))?\s*$")
UPPER_HDR = re.compile(r"^\s{0,12}([A-Z0-9][A-Z0-9 &\-–/(),]{3,})\s*$")
UPPER_SKIP = {"HUNT", "CHOICE", "NOTES", "SEASON", "PERMITS", "AVG PTS", "AVG POINTS", "RESTRICTIONS",
              "SPECIAL", "BOUNDARY DESCRIPTION", "TO APPLY", "DRAWN", "MUST", "TAG", "MAPS"}
MONTH = re.compile(r"\b(Jan|Feb|Mar|March|Apr|April|May|June|July|Aug|Sept|Oct|Nov|Dec)\.?\s?\d")
TAG_CODES = re.compile(r"^([EW][FAM])(\s*,\s*[EW][FAM])*$")
TAG_WORDS = re.compile(r"^(Modern|Archery|Muzzleloader|Any|Any elk tag|Any deer tag|Any tag)(\s*,\s*(Modern|Archery|Muzzleloader))*$", re.I)
NOTE_CODES = re.compile(r"^[A-Za-z]{1,2}(\s*,\s*[A-Z]{1,2})*,?$")
UNIT_RE = re.compile(r"(GMU|Deer Area|Elk Area|Moose Area|Sheep Unit|Goat Unit|Region|Designated|Unit\b)", re.I)
PERMITS_RE = re.compile(r"^(\d+)(\S*)$")
APPS_RE = re.compile(r"^(\d+)\s?/\s?(\d+)(\s.*)?$")
STOP = re.compile(r"(Use numbers in this column|Category continued|For (Deer|Elk) Hunt Notes|Hunt Notes|Washington State Big Game Hunting Pamphlet|Report your Big Game)")


def _tokens(line):
    """Split on 2+ spaces, keep start positions."""
    out = []
    for m in re.finditer(r"\S(?:\S| (?=\S))*", line):
        out.append((m.start(), m.group(0)))
    return out


def parse(path, start_marker=None):
    lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    begin = 0
    if start_marker:
        for i, l in enumerate(lines):
            if start_marker in l:
                begin = i
                break
    rows = []
    cat = {g: None for g in GROUP.values()}
    apps_year = None
    cur = None  # row being extended by continuation lines
    blank_run = 0
    for i in range(begin, len(lines)):
        l = lines[i]
        if not l.strip():
            blank_run += 1
            if blank_run >= 2:
                cur = None
            continue
        blank_run = 0
        mh = APPS_HDR.search(l)
        if mh:
            apps_year = int(mh.group(1))
        if STOP.search(l):
            cur = None
            continue
        hm = DEER_ELK_HDR.match(l) or HUNTERS_HDR.match(l)
        if hm:
            name = re.sub(r"\s-\s", " ", hm.group(1))
            if "Deer" in name:
                cat["deer"] = name
            elif "Elk" in name:
                cat["elk"] = name
            cur = None
            continue
        # Verifier fix 2026-10-31: a new species table resets that species' sub-heading, so the 2020 goat table
        # (which has no uppercase sub-heading) no longer inherits the moose "DISABLED HUNTER - ANTLERLESS ONLY".
        tm = re.match(r"^\s*(Moose|Mountain Goat|Bighorn Sheep) Special Permit Hunts:?\s*$", l)
        if tm:
            g = {"Moose": "moose", "Mountain Goat": "goat", "Bighorn Sheep": "sheep"}[tm.group(1)]
            cat[g + "_pending"] = None
            cur = None
            continue
        um = UPPER_HDR.match(l)
        if um and not ROW.match(l):
            t = um.group(1).strip()
            if t not in UPPER_SKIP and not any(t.startswith(s) for s in ("HUNT ", "CHOICE ", "GOAT HUNT")):
                for g in ("moose", "sheep", "goat"):
                    cat[g + "_pending"] = t
                cur = None
                continue
        m = ROW.match(l)
        if m:
            code = m.group(2)
            grp = GROUP.get(code[0])
            if grp is None:
                cur = None
                continue
            toks = _tokens(l)
            # toks[0] is the hunt code
            body = toks[1:]
            r = {"group": grp, "huntCode": code, "line": i + 1, "appsYear": apps_year, "raw": l.rstrip(),
                 "cols": [p for p, _ in body], "fields": [t for _, t in body], "cont": []}
            if grp in ("moose", "sheep", "goat"):
                r["category"] = cat.get(grp + "_pending")
            else:
                r["category"] = cat.get(grp)
            rows.append(r)
            cur = r
            continue
        if cur is not None:
            cur["cont"].append((i + 1, _tokens(l)))
    return rows


def _assign_cont(r):
    """Append continuation-line tokens to the column whose span contains them
    (span = from this column's start to the next column's start)."""
    fields = list(r["fields"])
    cols = r["cols"]
    extra = []
    turkey = r["group"] == "turkey"
    for ln, toks in r["cont"]:
        for pos, t in toks:
            cand = [k for k in range(len(cols)) if cols[k] <= pos + 3]
            if not cand or pos < cols[0] - 6:
                extra.append((ln, pos, t))
                continue
            k = cand[-1]
            if turkey and k > 2:  # turkey tables sit next to right-margin prose; keep name/area/dates only
                extra.append((ln, pos, t))
                continue
            fields[k] = fields[k] + " " + t
    return fields, extra


def interpret(r):
    """Map raw fields to named columns per species-table layout."""
    # Verifier fix 2026-10-31: in the 2023 pamphlet (hunts 1304-1311) the row is split over two lines: code, name and
    # hunt notes on the first, tag/dates/legal/unit/permits/apps on the next. Join such a line as extra columns.
    if len(r["fields"]) <= 2 and r["cont"]:
        ln0, toks0 = r["cont"][0]
        if len(toks0) >= 5 and APPS_RE.match(toks0[-1][1]) and PERMITS_RE.match(toks0[-2][1]):
            r = dict(r, fields=r["fields"] + [t for _, t in toks0], cols=r["cols"] + [p for p, _ in toks0],
                     cont=r["cont"][1:])
    fields, extra = _assign_cont(r)
    g = r["group"]
    out = {k: r[k] for k in ("group", "huntCode", "line", "appsYear", "category")}
    out["extra"] = extra
    out["problems"] = []
    f = list(fields)
    # trailing apps/avg (or NEW) and permits
    apps = f[-1] if f else None
    if apps is not None and (APPS_RE.match(apps) or apps.upper() in ("NEW", "N/A", "NA", "-")):
        f = f[:-1]
    else:
        # turkey row has right-margin text after apps; find the apps token
        idx = next((k for k in range(len(f) - 1, -1, -1) if APPS_RE.match(f[k]) or f[k] == "NEW"), None)
        if idx is None:
            apps = None
        else:
            apps = f[idx]
            out["trailing"] = f[idx + 1:]
            f = f[:idx]
    out["appsRaw"] = apps
    permits = f[-1] if f else None
    pm = PERMITS_RE.match(permits or "")
    if not pm:
        out["problems"].append(f"permits token {permits!r}")
        out["permitsRaw"] = None
    else:
        out["permitsRaw"] = permits
        f = f[:-1]
    out["name"] = f[0] if f else None
    rest = f[1:]
    if g in ("deer", "elk"):
        # ... dates, legal, unit at the end
        if len(rest) < 3:
            out["problems"].append(f"too few fields {rest}")
            return out
        out["unit"], out["legal"], out["dates"] = rest[-1], rest[-2], rest[-3]
        mid = rest[:-3]
        for t in mid:
            if t == out["name"]:
                out["layoutIssue"] = f"pamphlet prints '{t}' in a notes/tag column"
                continue
            if TAG_CODES.match(t) or TAG_WORDS.match(t) or (
                    re.search(r"\b[EW][FAM]\b|\bModern\b|\bArchery\b|\bMuzzleloader\b|\btag\b", t) and not MONTH.search(t)):
                out.setdefault("tag", t)
            elif t in ("Yes", "No"):
                out["secondTag"] = t
            elif NOTE_CODES.match(t):
                out.setdefault("notes", t)
            else:
                out["problems"].append(f"unclassified mid token {t!r}")
        if not MONTH.search(out["dates"]):
            out["problems"].append(f"dates token {out['dates']!r}")
        if "tag" not in out and "layoutIssue" not in out:
            out["problems"].append("no tag")
    elif g == "moose":
        # name, [note], season, boundary
        if rest and NOTE_CODES.match(rest[0]):
            out["notes"] = rest[0]
            rest = rest[1:]
        if len(rest) != 2:
            out["problems"].append(f"moose fields {rest}")
        else:
            out["dates"], out["unit"] = rest
    elif g == "goat":
        if len(rest) != 2:
            out["problems"].append(f"goat fields {rest}")
        else:
            out["dates"], out["restrictions"] = rest
    elif g == "sheep":
        if rest and NOTE_CODES.match(rest[0]):
            out["notes"] = rest[0]
            rest = rest[1:]
        if len(rest) != 3:
            out["problems"].append(f"sheep fields {rest}")
        else:
            out["dates"], out["unit"], out["restrictions"] = rest
    elif g == "turkey":
        if len(rest) != 3:
            out["problems"].append(f"turkey fields {rest}")
        else:
            out["unit"], out["dates"], out["bag"] = rest
    if out.get("dates") and not MONTH.search(out["dates"]):
        out["problems"].append(f"dates token {out['dates']!r}")
    return out


if __name__ == "__main__":
    rows = parse(sys.argv[1], sys.argv[3] if len(sys.argv) > 3 else None)
    grp = sys.argv[2] if len(sys.argv) > 2 else None
    nprob = 0
    for r in rows:
        o = interpret(r)
        if grp and o["group"] != grp:
            continue
        if o["problems"] or o["extra"]:
            nprob += 1
            print(o["line"], o["huntCode"], o["problems"], o["extra"][:3], r["fields"])
    print("rows", len(rows), "with problems", nprob)
