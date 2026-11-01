#!/usr/bin/env python3
"""Build src/data/agency/alaska/draw/<species>.json from the ADF&G Drawing Permit Hunt Supplements.

For drawing year Y (applications Nov 1 - Dec 15 of Y-1, drawn in February of Y):
  * counts come from the back page of the (Y+1)-(Y+2) supplement, "Results of the Y Permit Hunt Drawing":
    Apps Received -> total.applicants, Permits Available -> total.quota, % Drawn -> total.oddsPct (as published;
    ADF&G prints "<1" for under one percent, which is stored as null with a row note);
  * hunt details (GMU/area, residency, legal animal, season dates, advertised permits, hunt area) come from the
    hunt tables of the Y-(Y+1) supplement, the one applicants applied from.
ADF&G does not split the results by residency and uses no points, so rows carry `total` only, choice "all".

Species: DM/YM moose (YM = youth hunts), DS Dall sheep, DG mountain goat, DL black bear, DE elk.
Not covered (no HuntScout species key): DB brown/grizzly bear, DC/YC caribou, DI bison, DX muskox, DO emperor goose.

Usage: python -I draw_build.py <raw_dir> <repo_root> [--refresh]
  <raw_dir> holds supp_YYYY-YYYY.pdf (from draw_fetch.py); parsed hunt tables are cached there as body_*.json.
"""
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_supplement as ds  # noqa: E402

YEARS = [2022, 2023, 2024, 2025, 2026]
SPECIES = {"DM": "moose", "YM": "moose", "DS": "sheep", "DG": "goat", "DL": "bear", "DE": "elk"}
EXCLUDED = {"DB": "brown/grizzly bear", "DC": "caribou", "YC": "caribou (youth)", "DI": "bison", "DX": "muskox", "DO": "emperor goose"}


def supp_name(y):
    return f"supp_{y}-{y + 1}"


def results_for(raw, y):
    txt = os.path.join(raw, supp_name(y + 1) + ".txt")
    if not os.path.exists(txt):
        subprocess.run(["pdftotext", "-layout", os.path.join(raw, supp_name(y + 1) + ".pdf"), txt], check=True)
    year, res = ds.results_from_text(open(txt, encoding="utf-8", errors="replace").read())
    if year != y:
        raise SystemExit(f"{supp_name(y + 1)}: results table is for {year}, expected {y}")
    return res


def body_for(raw, y, codes, refresh=False):
    cache = os.path.join(raw, f"body_{y}-{y + 1}.json")
    if os.path.exists(cache) and not refresh:
        body = json.load(open(cache))
    else:
        body = ds.hunts_from_pdf(os.path.join(raw, supp_name(y) + ".pdf"), tuple(SPECIES))
        missing = sorted(c for c in codes if c not in body)
        if missing:
            body.update(ds.hunts_fallback(os.path.join(raw, supp_name(y) + ".pdf"), missing))
        json.dump(body, open(cache, "w"), indent=1)
    return body


def expand_unit(u):
    m = re.fullmatch(r"(\d{1,2})([A-F]*)", u)
    if not m:
        return []
    n, letters = m.groups()
    if not 1 <= int(n) <= 26:
        return []
    if len(letters) > 1:  # "21CD" = Units 21C and 21D
        return [n + l for l in letters]
    return [n + letters]


def units_from(label, section):
    for text in (label or "", section or ""):
        t = re.sub(r"^Units?\s+", "", text.strip())
        m = re.match(r"^(\d{1,2}[A-F]*(?:\s*(?:,\s*and|,|and|&)\s*(?:portions? of\s+)?\d{1,2}[A-F]*)*)", t)
        if m:
            units = []
            for u in re.findall(r"\d{1,2}[A-F]*", m.group(1)):
                for x in expand_unit(u):
                    if x not in units:
                        units.append(x)
            if units:
                return units
    return []


MON = r"(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?"
DAY = MON + r"\s*!?\s*\d{1,2}"
RANGE = re.compile(r"(?:\d{2}[A-F]?:\s*)?" + DAY + r"\s*(?:-\s*(?:" + MON + r"\s*)?\d{1,2}|thru\s+" + DAY + r")")


def clean_dates(d):
    """Season cell text -> the date ranges printed in it, or None when the cell holds several ranges separated
    by text that is not "and" (text from a neighbouring column or an inset overlapping the cell)."""
    if not d or re.fullmatch(r"-+", d.strip()):
        return None
    ms = list(RANGE.finditer(d))
    if not ms:
        return None
    for a, b in zip(ms, ms[1:]):
        if d[a.end():b.start()].strip() not in ("and", "&", ",", ";", "and,"):
            return None
    out = " and ".join(m.group(0) for m in ms)
    out = re.sub(r"!\s*", "", out)
    out = re.sub(r"\s*-\s*", "-", out)
    out = re.sub(r"(\.)(\d)", r"\1 \2", out)
    return re.sub(r"\s+", " ", out).strip()


LEGAL = [
    r"Antlerless(?:, taking (?:of )?(?:calves or )?cows (?:accompanied by|with) calves is prohibited)?",
    r"Any moose(?:, except a calf or a cow accompanied by a calf)?(?:,? every 4 regulatory years)?",
    r"Any ram(?: every 4 regulatory years)?",
    r"Either [Ss]ex(?:, taking of nannies with kids is prohibited(?:\. If you harvest a nanny, you will be prohibited from hunting any goats in Units 7 and 15 for 5 regulatory years)?)?",
    r"Bull with [^;]*?on (?:at least )?one (?:side|antler)",
    r"Full curl(?: every 4 regulatory years)?",
    r"One (?:bull|moose) every 4 regulatory years(?:, taking calves or cows accompanied by calves is prohibited)?",
    r"Billy", r"Cow", r"Bull",
]


def clean_legal(t):
    """Legal-animal cell -> the longest known ADF&G legal-animal wording it starts with (drops overlapping text)."""
    if not t:
        return None
    t = re.sub(r"(\w)- (\w)", r"\1\2", t.replace("50- inch", "50-inch")).replace("50inch", "50-inch")
    best = None
    for pat in LEGAL:
        m = re.match(pat, t)
        if not m:
            continue
        rest = t[m.end():].strip()
        # the wording must end here; a lower-case continuation ("Bull with ...", "Antlerless, taking ...") that
        # the patterns did not cover means the cell text is incomplete or mixed, so it is not used
        if rest and (rest[0].islower() or rest[0] in ",;-(" or rest.split(" ")[0].lower() in ("with", "or", "and", "of")):
            continue
        if best is None or len(m.group(0)) > len(best):
            best = m.group(0)
    return best


def sex_from(legal):
    if not legal:
        return None
    l = legal.lower()
    if l.startswith("either sex") or l.startswith("any goat") or l.startswith("any moose") or "either sex" in l[:20]:
        return "either"
    if l.startswith("antlerless") or l.startswith("cow"):
        return "female"
    if re.match(r"^(bull|any bull|spike|full curl|any ram|ram|billy|\d/4 curl)", l):
        return "male"
    return None


def method_from(text):
    t = text or ""
    found = []
    for pat, m in [(r"Bowhunters", "archery"), (r"Muzzleloader", "muzzleloader"), (r"Shotgun", "shotgun"), (r"Crossbow", "other")]:
        if re.search(pat, t):
            found.append(m)
    if not found:
        return None, None
    label = re.search(r"(Certified[^;]*?Only)", t)
    label = label.group(1) if label else None
    return (found[0] if len(found) == 1 else "other"), label


def hunt_area(info):
    if not info:
        return None
    m = re.search(r"Hunt Area:\s*(.+)", info)
    if not m:
        return None
    t = m.group(1).strip()
    # first sentence only: the cell often continues with other notes (and, in multi-column cells, interleaved text)
    end = re.search(r"(?<!\bMt)(?<!\bMtn)(?<!\bMtns)(?<!\bHwy)(?<!\bSt)(?<!\bFt)(?<!\bLk)(?<!\bNo)(?<!\bRd)(?<!\bCr)(?<!\bU\.S)(?<!\b[NSEW])(?<!\bPt)(?<!\bJct)\.\s+(?=[A-Z])", t)
    if end and end.start() >= 10:
        t = t[: end.start() + 1]
    if len(t) <= 320:
        return t if t.endswith((".", ")")) else t + " ..."
    cut = t[:320]
    k = cut.rfind(". ")
    return (cut[: k + 1] if k > 150 else cut.rsplit(" ", 1)[0] + " ...")


def permits_text(s):
    m = re.match(r"(?:up to )?\d+", (s or "").strip())
    return m.group(0) if m else None


def permits_int(s):
    m = re.fullmatch(r"(?:up to )?(\d+)", permits_text(s) or "")
    return int(m.group(1)) if m else None


BEAR_LEGAL = "any black bear except cubs or females accompanied by cubs"


def build_row(y, code, r, b, supp_text=""):
    sp = SPECIES[code[:2]]
    notes = []
    if b is None:
        b = {}
        notes.append(f"Hunt {code} was not found in the hunt tables of the {y}-{y + 1} supplement; only the drawing results are given.")
    label = (b.get("label") or "").rstrip(",").strip()
    section = b.get("section")
    units = units_from(label, section)
    if label.startswith("Unit"):
        area = label
    elif label and label[:1].isdigit():
        area = ("Units " if len(units) > 1 else "Unit ") + label
    elif section and label:
        area = f"{section}, {label}"
    else:
        area = label or section or ""
    restrict = "; ".join(x for x in [b.get("cell_note"), b.get("row_note")] if x)
    restrict = re.sub(r"\s*\((?:see|See) page \d+\)", "", restrict)  # cross-reference to a supplement page
    method, method_label = method_from(restrict)
    parts = [area] if area else []
    if b.get("residency"):
        parts.append(b["residency"])
    if restrict:
        parts.append(restrict)
    legal = clean_legal(b.get("legal"))
    if legal is None and code.startswith("DL") and ("Legal Animal: " + BEAR_LEGAL) in re.sub(r"\s+", " ", supp_text):
        # the black bear page has no legal-animal column; its header bullet gives the legal animal for all DL hunts
        legal = BEAR_LEGAL[0].upper() + BEAR_LEGAL[1:]
    if legal:
        parts.append("Legal animal: " + legal)
    ha = hunt_area(b.get("info"))
    if ha:
        parts.append("Hunt Area: " + ha)
    if code.startswith("Y"):
        parts.insert(1, "Youth drawing hunt")
    desc = " — ".join(parts) if parts else f"Drawing hunt {code}"
    raw_seasons = list(b.get("season") or [])
    seasons = []
    for k, s in enumerate(raw_seasons):
        d = clean_dates(s.get("dates"))
        yr = s.get("year")
        nxt = raw_seasons[k + 1] if k + 1 < len(raw_seasons) else None
        if d and yr and nxt is not None and nxt.get("dates") == "" and nxt.get("year"):
            yr = f"{yr}-{nxt['year']}"  # one season printed across both year columns
        if d:
            seasons.append((yr, d))
    season_txt = "; ".join(f"{yr}: {d}" if yr else d for yr, d in seasons) or None

    total = {"quota": r["permits"], "applicants": r["apps"]}
    if r["pct"] == "<1":
        total["oddsPct"] = None
        notes.append("ADF&G published % drawn as \"<1\".")
    else:
        total["oddsPct"] = r["pct"]
    adv = permits_text(b.get("permits"))
    if adv and permits_int(adv) != r["permits"]:
        notes.append(f"The {y}-{y + 1} supplement advertised {adv} permits; the results table lists {r['permits']} permits available.")
    if r["apps"] == 0:
        notes.append("No applications were received.")
    if r["marker"]:
        notes.append("Marked " + r["marker"] + " in the results table.")
    if b.get("fallback"):
        notes.append("Hunt details read from the supplement page text (the table cells could not be separated); residency, legal animal and season dates not captured.")
    if b.get("residency_from") == "legal-cell":
        pass
    if re.search(r"[Cc]ancel", " ".join(str(b.get(k) or "") for k in ("cell_note", "row_note", "info"))):
        notes.append("The supplement marks this hunt cancelled.")
    row = {"species": sp, "year": y, "huntCode": code, "units": units, "description": desc}
    if method:
        row["method"] = method
        if method_label:
            row["methodLabel"] = method_label
    sx = sex_from(legal)
    if sx:
        row["sex"] = sx
    if season_txt:
        row["seasonDates"] = season_txt
    row["choice"] = "all"
    row["total"] = total
    if notes:
        row["note"] = " ".join(notes)
    row["sourceId"] = f"d-supp-{y + 1}"
    return row


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    refresh = "--refresh" in sys.argv
    out = {}
    stats = {}
    for y in YEARS:
        res = results_for(raw, y)
        codes = [c for c in res if c[:2] in SPECIES]
        body = body_for(raw, y, codes, refresh)
        stxt = os.path.join(raw, supp_name(y) + ".txt")
        if not os.path.exists(stxt):
            subprocess.run(["pdftotext", "-layout", os.path.join(raw, supp_name(y) + ".pdf"), stxt], check=True)
        supp_text = open(stxt, encoding="utf-8", errors="replace").read()
        for c in sorted(codes):
            row = build_row(y, c, res[c], body.get(c), supp_text)
            out.setdefault(row["species"], []).append(row)
        stats[y] = {"results": len(res), "covered": len(codes), "excluded": {v: sum(1 for c in res if c[:2] == k) for k, v in EXCLUDED.items()},
                    "noBody": sorted(c for c in codes if c not in body), "fallback": sorted(c for c in codes if body.get(c, {}).get("fallback"))}
    dest = os.path.join(repo, "src/data/agency/alaska/draw")
    os.makedirs(dest, exist_ok=True)
    for sp, rows in out.items():
        rows.sort(key=lambda r: (-r["year"], r["huntCode"]))
        with open(os.path.join(dest, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(sp, len(rows), sorted({r["year"] for r in rows}))
    json.dump(stats, open(os.path.join(raw, "build_stats.json"), "w"), indent=1)
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
