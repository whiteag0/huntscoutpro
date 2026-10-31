"""Parse WDFW game harvest report pages into HuntScout Pro HarvestRecord JSON.

Usage:
  python -I harvest_parse.py <raw_dir> <repo_root>

<raw_dir> holds <year>/<report>.html as saved by harvest_download.py.
Writes src/data/agency/washington/harvest/<species>.json and harvest-meta.json.

Every number is copied from a WDFW HTML table cell. Nothing is estimated.
WDFW publishes deer harvest for all deer species combined (white-tailed, mule
and black-tailed deer); rows are written to both mule-deer.json and
whitetail.json unless the permit hunt name names one species.
"""
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

from bs4 import BeautifulSoup

YEARS = list(range(2020, 2026))
BASE = "https://wdfw.wa.gov/hunting/management/game-harvest"
INDEX = BASE
RETRIEVED = "2026-10-31"
PUBLISHER = "Washington Department of Fish and Wildlife"

METHOD = {
    "Archery": "archery",
    "Modern Firearm": "rifle",
    "Muzzleloader": "muzzleloader",
    "Multiple Weapons": "other",
}
MW_NOTE = ("WDFW's statewide totals equal archery + modern firearm + muzzleloader; harvest by multiple weapons "
           "tag holders is published in WDFW's separate statewide 'multiple weapons' table (Multiple Weapons rows) and is not "
           "in this total, while WDFW's GMU and district totals do include Multiple Weapons harvest")
DEER_COMBINED = "All deer species combined (WDFW does not split this table by species)"

sources = OrderedDict()
unit_names = defaultdict(dict)
problems = []


def clean(s):
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def num(s):
    s = clean(s)
    if s in ("", "n/a", "N/A", "-", "--"):
        return None
    s2 = s.replace(",", "")
    if re.fullmatch(r"-?\d+", s2):
        return int(s2)
    if re.fullmatch(r"-?\d+\.\d+", s2):
        return float(s2)
    problems.append(f"non-numeric cell {s!r}")
    return None


def pct(s):
    s = clean(s)
    if s in ("", "n/a", "N/A"):
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*%", s)
    if not m:
        problems.append(f"bad pct {s!r}")
        return None
    v = float(m.group(1))
    return int(v) if v.is_integer() else v


def load(raw, year, rep):
    p = os.path.join(raw, str(year), rep + ".html")
    if not os.path.exists(p):
        return None
    soup = BeautifulSoup(open(p, "rb").read(), "lxml")
    title = clean(soup.title.get_text()).split(" | ")[0] if soup.title else rep
    sid = f"h-{year}-{rep}"
    sources[sid] = {
        "id": sid,
        "title": title,
        "publisher": PUBLISHER,
        "url": f"{BASE}/{year}/{rep}",
        "pageUrl": INDEX,
        "dataYear": year,
        "retrieved": RETRIEVED,
    }
    return soup.find("main") or soup, sid


def rows_of(table):
    return [[clean(c.get_text(" ", strip=True)) for c in tr.find_all(["th", "td"])] for tr in table.find_all("tr")]


def caption(table):
    c = table.find("caption")
    return clean(c.get_text(" ", strip=True)) if c else None


def heading(table):
    h = table.find_previous(["h2", "h3", "h4"])
    return clean(h.get_text(" ", strip=True)) if h else None


def split_gmu(label):
    m = re.match(r"^(\d{3})\s*-\s*(.+)$", label)
    return (m.group(1), m.group(2)) if m else (None, None)


def put(d, k, v):
    if v is not None:
        d[k] = v


def points_note(hdr, row, start):
    """Antler point classes as published, e.g. '1 pt 63, 2 pt 75'."""
    parts = []
    for h, v in zip(hdr[start:], row[start:]):
        m = re.fullmatch(r"(\d\+?) Point", h)
        if not m:
            break
        parts.append(f"{m.group(1)} pt {v}")
    return ", ".join(parts)


def rec(species, year, unit, sid, **kw):
    sp_ = kw.get("successPct")
    if sp_ is not None and sp_ > 100:
        # Schema allows 0-100; keep WDFW's printed figure in the note instead.
        kw["successPct"] = None
        extra = f"WDFW prints hunter success {sp_}% (its harvest estimate exceeds its hunter estimate); not stored as a percentage"
        kw["note"] = f"{kw['note']}; {extra}" if kw.get("note") else extra
    r = OrderedDict(species=species, year=year, unit=unit)
    for k in ("unitName", "hunt", "method", "methodLabel", "sex", "residency"):
        if kw.get(k) is not None:
            r[k] = kw[k]
    r["hunters"] = kw.get("hunters")
    r["harvest"] = kw.get("harvest")
    for k in ("harvestMale", "harvestFemale"):
        if kw.get(k) is not None:
            r[k] = kw[k]
    r["successPct"] = kw.get("successPct")
    if kw.get("successComputed"):
        r["successComputed"] = True
    for k in ("daysHunted", "licenses", "note"):
        if kw.get(k) is not None:
            r[k] = kw[k]
    r["sourceId"] = sid
    return r


def antler_note(antlered, antlerless, pts, extra=None):
    s = f"Antlered {antlered}" + (f" ({pts})" if pts else "") + f"; antlerless {antlerless}"
    if extra:
        s += "; " + extra
    return s


# ---------------------------------------------------------------- deer / elk
def cervid_gmu(raw, sp, year, out, deer):
    """combo, general (by method), special rows per GMU and district."""
    pre = "deer" if deer else "elk"
    base_note = DEER_COMBINED if deer else None

    def n(*xs):
        return "; ".join(x for x in xs if x)

    member = {}  # (row index, table kind) -> district heading the row sits under
    # combined general + special
    combo = load(raw, year, f"{pre}-combo")
    combo_rows = []
    if combo:
        main, sid = combo
        for t in main.find_all("table"):
            rows = rows_of(t)
            hdr = rows[0]
            dist = heading(t)
            for row in rows[1:]:
                gmu, name = split_gmu(row[0])
                if gmu:
                    unit, uname, kind = gmu, name, None
                    unit_names[sp][gmu] = name
                elif row[0] == "Totals" and dist and dist.startswith("District"):
                    unit, uname, kind = dist, None, "WDFW district total"
                else:
                    problems.append(f"{year} {pre}-combo row {row[0]!r}")
                    continue
                if all(clean(x) in ("n/a", "") for x in row[1:]):
                    continue  # WDFW prints n/a in every cell: nothing published
                antlerless, antlered, total = row[1], row[2], num(row[3])
                member[len(combo_rows), "c"] = dist
                combo_rows.append(rec(sp, year, unit, sid, unitName=uname, method="all",
                                      methodLabel="General + permit (all weapons)",
                                      hunters=None, harvest=total, successPct=None,
                                      note=n(antler_note(antlered, antlerless, points_note(hdr, row, 4)), kind, base_note)))
    general = load(raw, year, f"{pre}-general")
    gen_rows = []
    if general:
        main, sid = general
        for t in main.find_all("table"):
            cap = caption(t) or ""
            gmu, name = split_gmu(cap)
            m = re.fullmatch(r"(District \d+) Totals", cap)
            if gmu:
                unit, uname, kind = gmu, name, None
                unit_names[sp][gmu] = name
            elif m:
                unit, uname, kind = m.group(1), None, "WDFW district total"
            else:
                problems.append(f"{year} {pre}-general caption {cap!r}")
                continue
            rows = rows_of(t)
            hdr = rows[0]
            ih = hdr.index("Number Hunters")
            for row in rows[1:]:
                meth = row[0]
                if all(clean(x) in ("n/a", "") for x in row[1:]):
                    continue  # WDFW prints n/a in every cell: nothing published
                antlerless, antlered, total = row[1], row[2], num(row[3])
                hunters, succ, days, dpk = num(row[ih]), pct(row[ih + 1]), num(row[ih + 2]), row[ih + 3]
                extra = f"days/kill {dpk}" if dpk not in ("n/a", "") else None
                if meth == "Totals":
                    method, label = "all", "General season total"
                elif meth in METHOD:
                    method, label = METHOD[meth], f"{meth} (general)"
                else:
                    problems.append(f"{year} {pre}-general method {meth!r}")
                    continue
                member[len(gen_rows), "g"] = heading(t)
                gen_rows.append(rec(sp, year, unit, sid, unitName=uname, method=method, methodLabel=label,
                                    hunters=hunters, harvest=total, successPct=succ, daysHunted=days,
                                    note=n(antler_note(antlered, antlerless, points_note(hdr, row, 4), extra), kind, base_note)))
    special = load(raw, year, f"{pre}-special")
    spec_rows = []
    if special:
        main, sid = special
        for t in main.find_all("table"):
            rows = rows_of(t)
            hdr = rows[0]
            dist = heading(t)
            for row in rows[1:]:
                gmu, name = split_gmu(row[0])
                if gmu:
                    unit, uname, kind = gmu, name, None
                elif row[0] == "Totals" and dist and dist.startswith("District"):
                    unit, uname, kind = dist, None, "WDFW district total"
                else:
                    problems.append(f"{year} {pre}-special row {row[0]!r}")
                    continue
                if all(clean(x) in ("n/a", "") for x in row[1:]):
                    continue  # WDFW prints n/a in every cell: nothing published
                antlerless, antlered, total = row[1], row[2], num(row[3])
                member[len(spec_rows), "s"] = dist
                spec_rows.append(rec(sp, year, unit, sid, unitName=uname, method="all",
                                     methodLabel="Special permits (all)", hunters=None, harvest=total, successPct=None,
                                     note=n(antler_note(antlered, antlerless, points_note(hdr, row, 4)), kind, base_note)))
    # Flag district totals WDFW printed that do not equal the sum of their own GMU rows.
    for kind, rows in (("c", combo_rows), ("g", gen_rows), ("s", spec_rows)):
        sums = defaultdict(int)
        for i, r in enumerate(rows):
            if re.fullmatch(r"\d{3}", r["unit"]) and r["harvest"] is not None:
                sums[member[i, kind], r["methodLabel"]] += r["harvest"]
        for r in rows:
            if r["unit"].startswith("District") and r["harvest"] is not None:
                g = sums.get((r["unit"], r["methodLabel"]), 0)
                if g != r["harvest"]:
                    r["note"] += (f"; WDFW's printed district total ({r['harvest']}) does not equal the sum of the GMU "
                                  f"rows WDFW lists under {r['unit']} ({g})")
                    problems.append(f"INFO {year} {pre} {kind} {r['unit']} {r['methodLabel']}: printed {r['harvest']} vs GMU sum {g}")
    out.extend(combo_rows + gen_rows + spec_rows)


def cervid_statewide(raw, sp, year, out, deer):
    pre = "deer" if deer else "elk"
    got = load(raw, year, f"{pre}-statewide")
    if not got:
        return
    main, sid = got
    base_note = DEER_COMBINED if deer else None
    tables = main.find_all("table")
    for t in tables:
        rows = rows_of(t)
        hdr = rows[0]
        H = {h: i for i, h in enumerate(hdr)}
        for row in rows[1:]:
            v = lambda k: row[H[k]]
            key = row[0]
            if hdr[0] == "Weapon Type":
                if key == "Statewide Total":
                    method, wl = "all", "All weapons"
                elif key in METHOD:
                    method, wl = METHOD[key], key
                else:
                    problems.append(f"{year} {pre}-statewide weapon {key!r}")
                    continue
            if "General Season Harvest" in H:  # totals by weapon type
                label = f"{wl} (general + permit)" if method != "all" else "General + permit (all weapons)"
                note = f"General season {v('General Season Harvest')}; permit season {v('Permit Season Harvest')}; antlered {v('Antlered Harvest')}; antlerless {v('Antlerless Harvest')}"
                if method == "all":
                    note += "; " + MW_NOTE
                out.append(rec(sp, year, "Statewide", sid, method=method, methodLabel=label,
                               hunters=num(v("Hunters")), harvest=num(v("Total Harvest")),
                               successPct=pct(v("Hunter Success")), note="; ".join(x for x in (note, base_note) if x)))
            elif hdr[0] == "Weapon Type" and "Permit Hunters" in H:
                label = f"{wl} (permit)" if method != "all" else "Special permits (all)"
                note = f"Antlered {v('Antlered Harvest')}; antlerless {v('Antlerless Harvest')}"
                if method == "all":
                    note += "; " + MW_NOTE
                out.append(rec(sp, year, "Statewide", sid, method=method, methodLabel=label,
                               hunters=num(v("Permit Hunters")), harvest=num(v("Total Harvest")),
                               successPct=pct(v("Hunter Success")), note="; ".join(x for x in (note, base_note) if x)))
            elif hdr[0] == "Weapon Type":  # general season
                tags = [k for k in H if k.endswith("Tags Purchased")][0]
                hunters_k = [k for k in H if k.endswith(" Hunters")][0]
                label = f"{wl} (general)" if method != "all" else "General season total"
                note = f"Antlered {v('Antlered Harvest')}; antlerless {v('Antlerless Harvest')}; licenses = WDFW '{tags}'"
                if method == "all":
                    note += "; " + MW_NOTE
                out.append(rec(sp, year, "Statewide", sid, method=method, methodLabel=label,
                               hunters=num(v(hunters_k)), harvest=num(v("Total Harvest")),
                               successPct=pct(v("Hunter Success")), licenses=num(v(tags)),
                               note="; ".join(x for x in (note, base_note) if x)))
            elif hdr[0] == "Season Type":  # multiple weapons
                tags = [k for k in H if k.endswith("Tags Purchased")][0]
                hunters_k = [k for k in H if k.endswith(" Hunters")][0]
                st = key
                if st not in ("General", "Special"):
                    problems.append(f"{year} {pre}-statewide season type {st!r}")
                    continue
                label = "Multiple Weapons (general)" if st == "General" else "Multiple Weapons (permit)"
                note = (f"WDFW multiple weapons tag holders, {st.lower()} season; antlered {v('Antlered Harvest')}; "
                        f"antlerless {v('Antlerless Harvest')}; licenses = multiple weapons tags purchased (WDFW prints the same figure on the General and Special rows)")
                out.append(rec(sp, year, "Statewide", sid, method="other", methodLabel=label,
                               hunters=num(v(hunters_k)), harvest=num(v("Total Harvest")),
                               successPct=pct(v("Hunter Success")), licenses=num(v(tags)),
                               note="; ".join(x for x in (note, base_note) if x)))
            else:
                problems.append(f"{year} {pre}-statewide header {hdr!r}")


def deer_species_of(name):
    low = name.lower()
    if "white-tail" in low or "whitetail" in low or "white tail" in low:
        return ["whitetail"]
    if "mule" in low:
        return ["mule-deer"]
    return ["mule-deer", "whitetail"]


def cervid_individual(raw, year, deer, outs):
    pre = "deer" if deer else "elk"
    got = load(raw, year, f"{pre}-individual")
    if not got:
        return
    main, sid = got
    for t in main.find_all("table"):
        cap = caption(t) or ""
        m = re.match(r"^(\d{4})\s*-\s*(.+)$", cap)
        if not m:
            problems.append(f"{year} {pre}-individual caption {cap!r}")
            continue
        code, name = m.group(1), m.group(2)
        rows = rows_of(t)
        hdr, data = rows[0], rows[1:]
        if len(data) != 1:
            problems.append(f"{year} {pre}-individual {code} has {len(data)} data rows")
            if not data:
                continue
        row = data[0]
        H = {h: i for i, h in enumerate(hdr)}
        v = lambda k: row[H[k]]
        sps = deer_species_of(name) if deer else ["elk"]
        note = (f"Applicants {v('Total Applicants')}; reports returned {v('Reports Returned')}; "
                + antler_note(v("Antlered Harvest"), v("Antlerless Harvest"), points_note(hdr, row, H["1 Point"])))
        if deer and len(sps) == 2:
            note += "; " + DEER_COMBINED
        for sp in sps:
            outs[sp].append(rec(sp, year, name, sid, hunt=code, methodLabel="Special permit hunt",
                                hunters=num(v("Hunters")), harvest=num(v("Total Harvest")),
                                successPct=pct(v("Hunter Success")), licenses=num(v("Permits Issued")), note=note))


# ---------------------------------------------------------------- bear
def bear(raw, year, out):
    got = load(raw, year, "black-bear-general")
    label = "General season (fall)"
    if got:
        main, sid = got
        for t in main.find_all("table"):
            mu = heading(t)  # "BMU 1" / "BBMU 1"
            rows = rows_of(t)
            hdr = rows[0]
            H = {h: i for i, h in enumerate(hdr)}
            for row in rows[1:]:
                v = lambda k: row[H[k]]
                gmu, name = split_gmu(row[0])
                if not gmu:
                    problems.append(f"{year} bear-general row {row[0]!r}")
                    continue
                unit_names["bear"][gmu] = name
                out.append(rec("bear", year, gmu, sid, unitName=name, method="all", methodLabel=label,
                               hunters=num(v("Number Hunters")), harvest=num(v("Total Harvest")),
                               harvestMale=num(v("Fall Male Harvest")), harvestFemale=num(v("Fall Female Harvest")),
                               successPct=pct(v("Hunter Success")), daysHunted=num(v("Hunter Days")),
                               note=f"{mu}; days/kill {v('Days/Kill')}"))
    got = load(raw, year, "black-bear-statewide")
    if got:
        main, sid = got
        for t in main.find_all("table"):
            rows = rows_of(t)
            hdr = rows[0]
            H = {h: i for i, h in enumerate(hdr)}
            for row in rows[1:]:
                v = lambda k: row[H[k]]
                if hdr[0] in ("BMU", "BBMU"):
                    unit = f"{hdr[0]} {row[0]}"
                    out.append(rec("bear", year, unit, sid, unitName=v("Unit Name"), method="all", methodLabel=label,
                                   hunters=num(v("Number Hunters")), harvest=num(v("Total Harvest")),
                                   successPct=pct(v("Hunter Success Rate")), daysHunted=num(v("Hunter Days")),
                                   note=f"WDFW {'Black Bear Management Unit' if hdr[0] == 'BBMU' else 'Bear Management Unit'} total (general season); days/kill {v('Days/Kill')}"))
                elif hdr[0] == "Hunt":
                    h = row[0]
                    if h == "General Hunting Season":
                        method, lab = "all", label
                    elif h == "Spring Bear Permit Hunt":
                        method, lab = None, "Spring permit hunt"
                    elif h == "Recreational Harvest Total":
                        method, lab = "all", "Recreational harvest total (general + spring permit)"
                    else:
                        problems.append(f"{year} bear statewide hunt {h!r}")
                        continue
                    hunters = num(v("Number Hunters"))
                    succ = pct(v("Hunter Success Rate"))
                    note = f"WDFW '{h}'" + (f"; days/kill {v('Days/Kill')}" if v("Days/Kill") != "n/a" else "")
                    if h == "Spring Bear Permit Hunt" and hunters == 0:
                        succ = None
                        note += "; WDFW prints 0 hunters / 0% (no spring permit hunt harvest reported)"
                    out.append(rec("bear", year, "Statewide", sid, method=method, methodLabel=lab,
                                   hunters=hunters, harvest=num(v("Total Harvest")), successPct=succ,
                                   daysHunted=num(v("Hunter Days")), note=note))
                else:
                    problems.append(f"{year} bear statewide header {hdr!r}")
    got = load(raw, year, "black-bear-spring")
    if got:
        main, sid = got
        for t in main.find_all("table"):
            hd = clean(t.find_previous(["h2", "h3", "h4"]).get_text(" ", strip=True))
            m = re.search(r"(\d{4})", hd)
            if not m:
                problems.append(f"{year} spring bear heading {hd!r}")
                continue
            code = m.group(1)
            rows = rows_of(t)
            hdr = rows[0]
            H = {h: i for i, h in enumerate(hdr)}
            for row in rows[1:]:
                v = lambda k: row[H[k]]
                area = v("Hunt Area")
                mm = re.fullmatch(r"GMU (\d{3})", area)
                unit = mm.group(1) if mm else area
                out.append(rec("bear", year, unit, sid, unitName=v("Hunt Name"), hunt=code, methodLabel="Spring permit hunt",
                               hunters=num(v("Hunters")), harvest=num(v("Total Killed")),
                               harvestMale=num(v("Males Killed")), harvestFemale=num(v("Females Killed")),
                               successPct=pct(v("Hunter Success")), licenses=num(v("Permits Issued")),
                               note=f"Hunt area {area}; applicants {v('Total Applicants')}; reports returned {v('Reports Returned')}"))


# ---------------------------------------------------------------- cougar
def cougar(raw, year, out):
    got = load(raw, year, "cougar")
    if not got:
        return
    main, sid = got
    label = "General hunting"
    for t in main.find_all("table"):
        rows = rows_of(t)
        hdr = rows[0]
        if hdr[0] == "Mortalities":
            for row in rows[1:]:
                if row[0] == "General Season":
                    out.append(rec("lion", year, "Statewide", sid, method="all", methodLabel=label, hunters=None,
                                   harvest=num(row[4]), harvestMale=num(row[1]), harvestFemale=num(row[2]), successPct=None,
                                   note=f"WDFW known mortalities, general season; unknown sex {row[3]}"))
            continue
        if hdr[0] != "Location":
            problems.append(f"{year} cougar header {hdr!r}")
            continue
        sec = heading(t)  # "All CMUs" / "CMU 1" / "CHMU 1"
        is_all = sec.startswith("All ")
        for row in rows[2:]:
            gmu, name = split_gmu(row[0])
            m = re.fullmatch(r"((?:CMU|CHMU) \d+) Totals", row[0])
            if gmu and is_all:
                unit_names["lion"][gmu] = name
                out.append(rec("lion", year, gmu, sid, unitName=name, method="all", methodLabel=label, hunters=None,
                               harvest=num(row[4]), harvestMale=num(row[1]), harvestFemale=num(row[2]), successPct=None,
                               note=f"General hunting harvest; unknown sex {row[3]}"))
            elif gmu or row[0] == "All GMU Totals":
                continue  # GMU rows repeat inside each CMU table; statewide comes from Known Mortalities
            elif m:
                if m.group(1) != sec:
                    problems.append(f"{year} cougar {row[0]} under {sec}")
                kind = "Cougar Hunt Management Unit" if m.group(1).startswith("CHMU") else "Cougar Management Unit"
                out.append(rec("lion", year, m.group(1), sid, method="all", methodLabel=label, hunters=None,
                               harvest=num(row[4]), harvestMale=num(row[1]), harvestFemale=num(row[2]), successPct=None,
                               note=f"WDFW {kind} total, general hunting; unknown sex {row[3]}"))
            else:
                problems.append(f"{year} cougar row {row[0]!r}")


# ---------------------------------------------------------------- permit species
def permit_species(raw, year, rep, sp, out):
    got = load(raw, year, rep)
    if not got:
        return
    main, sid = got
    for t in main.find_all("table"):
        cap = caption(t) or ""
        m = re.match(r"^(\d{4})\s*-\s*(.+)$", cap)
        if not m:
            problems.append(f"{year} {rep} caption {cap!r}")
            continue
        code, rest = m.group(1), m.group(2)
        unit, uname = rest, None
        if sp == "sheep":
            mm = re.fullmatch(r"(.+?) - (Sheep Unit (\S+)|GMU (\d{3}))", rest)
            if mm:
                uname = mm.group(1)
                unit = mm.group(3) if mm.group(3) else f"GMU {mm.group(4)}"
            else:
                problems.append(f"{year} sheep caption {cap!r}")
        elif sp == "goat":
            mm = re.fullmatch(r"(.+?) - Mountain Goat Unit (\S+)", rest)
            if mm:
                uname, unit = mm.group(1), mm.group(2)
            else:
                problems.append(f"{year} goat caption {cap!r}")
        rows = rows_of(t)
        hdr, data = rows[0], rows[1:]
        if len(data) != 1:
            problems.append(f"{year} {rep} {code} has {len(data)} data rows")
            if not data:
                continue
        row = data[0]
        H = {h: i for i, h in enumerate(hdr)}
        v = lambda k: row[H[k]]
        note = f"Applicants {v('Total Applicants')}; quota {v('Quota')}; reports returned {v('Reports Returned')}; days/kill {v('Days/Kill')}"
        out.append(rec(sp, year, unit, sid, unitName=uname, hunt=code, methodLabel="Special permit hunt",
                       hunters=num(v("Hunters")), harvest=num(v("Total Harvest")),
                       harvestMale=num(v("Males Killed")) if "Males Killed" in H else None,
                       harvestFemale=num(v("Females Killed")) if "Females Killed" in H else None,
                       successPct=pct(v("Hunter Success")), daysHunted=num(v("Hunter Days")),
                       licenses=num(v("Permits Issued")), note=note))


# ---------------------------------------------------------------- turkey
def turkey(raw, year, out):
    got = load(raw, year, "turkey-statewide")
    if not got:
        return
    main, sid = got
    for t in main.find_all("table"):
        rows = rows_of(t)
        hdr = rows[0]
        H = {h: i for i, h in enumerate(hdr)}
        for row in rows[1:]:
            if row[0] in ("Spring", "Fall"):
                v = lambda k: row[H[k]]
                unit_names["turkey"][v("PMU")] = v("PMU Name")
                out.append(rec("turkey", year, v("PMU"), sid, unitName=v("PMU Name"), method="all",
                               methodLabel=f"{row[0]} season", hunters=num(v("Number Hunters")),
                               harvest=num(v("Total Harvest")), successPct=pct(v("Hunter Success Rate")),
                               daysHunted=num(v("Hunter Days")), note=f"WDFW Population Management Unit; days/kill {v('Days/Kill')}"))
            elif row[0] == "Permit Hunts":
                out.append(rec("turkey", year, "Statewide", sid, methodLabel="Permit hunts", hunters=None,
                               harvest=num(row[1]), successPct=None, note="WDFW 'Permit Hunts' harvest (not assigned to a PMU)"))
            elif row[0] == "Total":
                out.append(rec("turkey", year, "Statewide", sid, method="all", methodLabel="All seasons (spring + fall + permit)",
                               hunters=None, harvest=num(row[1]), successPct=None, note="WDFW statewide 'Total' (spring, fall and permit hunts)"))
            else:
                problems.append(f"{year} turkey row {row!r}")


_CERVID = (
    "Source: WDFW game harvest reports (wdfw.wa.gov/hunting/management/game-harvest), one HTML report page per year and "
    "report, built from mandatory hunter reports. Per GMU (id as published, e.g. '101', '382') and per WDFW district: "
    "'General + permit (all weapons)' = WDFW 'combined general and special permits' table (harvest only); "
    "'General season total' and Archery / Modern Firearm (method rifle) / Muzzleloader / Multiple Weapons (method other) "
    "'(general)' rows = WDFW general season table with hunters, hunter success, hunter days as published (GMU 'Totals' "
    "rows: WDFW prints n/a for hunters, so null); 'Special permits (all)' = WDFW special permit table by GMU (harvest only). "
    "Antlered/antlerless counts and antler point classes are in each row note exactly as published (harvestMale/"
    "harvestFemale are not filled because antlerless is not the same as female). Special permit hunts: hunt = WDFW 4-digit "
    "hunt number, unit = WDFW hunt name as published (hunt areas are not GMU ids), licenses = permits issued, applicants and "
    "reports returned in the note. Statewide rows come from WDFW's statewide pages. Hunters are not additive across GMUs. "
    "Cross-checks: GMU per-weapon sums equal WDFW statewide archery/modern firearm/muzzleloader figures (elk every year; deer "
    "2020-2023 exactly, 2024-2025 within 10 per weapon); WDFW's statewide totals exclude multiple weapons tag holders (published separately) while GMU "
    "totals include them, so GMU sums exceed the statewide total by that amount. A few WDFW district totals do not equal "
    "the sum of the GMU rows WDFW lists under them (elk combined 2020 District 5, 2021 District 6, 2022 District 5 printed as 0; "
    "deer District 13 in 2024-2025 printed 2-16 higher); those district rows keep WDFW's printed figure and say so in the note. Rows where WDFW printed n/a in every cell are omitted. Three tiny multiple-weapons "
    "rows where WDFW prints success above 100% keep that figure in the note with successPct null."
)
COVERAGE_NOTES = OrderedDict([
    ("elk", _CERVID),
    ("mule-deer", "IMPORTANT: WDFW publishes GMU, district and statewide deer harvest for all deer species combined "
     "(mule deer, white-tailed deer and black-tailed deer); those rows are identical in mule-deer.json and whitetail.json, "
     "so never add the two files. Special permit hunts that are white-tailed only (by WDFW hunt name or the pamphlet's "
     "legal-deer column) are only in whitetail.json; hunts named or listed as mule deer / black-tailed only, and hunts "
     "outside the white-tailed range, are only in mule-deer.json; other eastern hunts are in both files. "
     "Black-tailed deer (western Washington, GMUs 400-699) have no separate key and are inside the mule-deer rows. "
     "The 186 '9xxx' land-manager access hunts in the 2021 deer report (all with 0 hunters and 0 harvest, 42 of them "
     "elk hunts) are omitted. " + _CERVID),
    ("whitetail", "IMPORTANT: WDFW publishes GMU, district and statewide deer harvest for all deer species combined "
     "(mule deer, white-tailed deer and black-tailed deer); those rows are identical in mule-deer.json and whitetail.json, "
     "so never add the two files. whitetail.json keeps only GMUs where WDFW opens a white-tailed deer general season "
     "(2026 pamphlet: GMUs 101-186, 203-284, 373, 379, 381; WDFW: 'White-tailed deer are found east of the Cascade crest "
     "in Regions 1, 2 and 3', Columbian white-tailed deer are protected), the districts containing them, and statewide "
     "rows; western Washington (black-tailed) and mule-deer-only GMUs are only in mule-deer.json. Permit hunts are "
     "included when they are white-tailed only, or when the pamphlet's legal-deer column is not mule/black-tailed only "
     "and the hunt area is in the white-tailed range. Combined rows still include mule deer taken in those GMUs. " + _CERVID),
    ("pronghorn", "Washington has no pronghorn hunting season; WDFW publishes no pronghorn harvest."),
    ("moose", "Source: WDFW moose special permit harvest reports, one row per permit hunt (hunt = WDFW hunt number 8000-8027, "
     "unit = WDFW hunt name as published, whitespace collapsed; 2020 names use an en dash, e.g. 'Douglas A – Early'). "
     "Hunters, harvest, males/females killed, hunter days and hunter success as published; licenses = permits issued; "
     "applicants, quota, reports returned and days/kill in the note. Moose is permit-only in Washington; no statewide row "
     "is published."),
    ("bear", "Source: WDFW black bear harvest reports. GMU rows = general (fall) season by GMU with male/female harvest, "
     "hunters, success, hunter days as published. BMU/BBMU rows = WDFW statewide table by bear management unit (2020-2024 "
     "'BMU 1'-'BMU 9'; for license year 2025 WDFW changed to 14 Black Bear Management Units, 'BBMU 1'-'BBMU 14', with "
     "different GMU membership, so BMU and BBMU rows are not comparable). Statewide rows: general season, spring permit hunt "
     "and WDFW 'Recreational Harvest Total'. Spring bear permit hunts were reported for 2020 and 2021 (21 hunts each, "
     "hunt = WDFW hunt number 7000-7020, unit = GMU in the WDFW 'Hunt Area' column); WDFW shows 0 spring permit harvest for "
     "2022-2025 and publishes no spring hunt page for those years. Cross-check: GMU sums equal WDFW's statewide general "
     "season harvest every year (e.g. 2024: 1,793)."),
    ("sheep", "Source: WDFW bighorn sheep special permit harvest reports, one row per permit hunt. hunt = WDFW hunt number "
     "(5000-5031; WDFW re-numbers hunts between years, so compare by unit, not hunt number). unit = WDFW sheep unit id "
     "('7', '4A', ...) or 'GMU 169'/'GMU 172' where WDFW names a GMU; unitName = hunt name as published (asterisks are "
     "WDFW's own marks; the report page does not explain them). Hunters, harvest, hunter days, success as published; "
     "licenses = permits issued; applicants, quota, reports returned in the note. Sex of harvest is not published in the "
     "sheep report."),
    ("goat", "Source: WDFW mountain goat special permit harvest reports, one row per permit hunt. hunt = WDFW hunt number, "
     "unit = WDFW mountain goat unit id ('3-6', '5-4', ...), unitName = hunt name as published. Hunters, harvest, "
     "males/females killed, hunter days, success as published; licenses = permits issued; applicants and quota in the note. "
     "WDFW lists 12 hunts for 2020, 15 for 2021, 12 for 2022, 9 for 2023-2024 and 5 for 2025."),
    ("lion", "Source: WDFW statewide cougar harvest statistics, one page per year. Rows are WDFW's "
     "'General Hunting' known mortalities by GMU, by cougar management unit (2020-2024 'CMU n'; for 2025 WDFW changed to "
     "Cougar Hunt Management Units 'CHMU n' with different GMU membership) and statewide, with male/female as published "
     "and unknown-sex count in the note. WDFW does not publish cougar hunter numbers or success, so hunters/successPct "
     "are null. Conflict/depredation and other mortalities (roadkill, poaching, etc.) published by WDFW are not hunting "
     "harvest and are not included. WDFW: statistics are 'based on the best available data at the time of publication and "
     "are subject to change'. Cross-check: GMU sums equal the statewide general season figure every year."),
    ("turkey", "Source: WDFW statewide turkey harvest statistics. WDFW publishes turkey harvest by Population Management "
     "Unit (unit 'P10'...'P50' with WDFW PMU name) and season (methodLabel 'Spring season' / 'Fall season'), with hunters, "
     "success and hunter days, plus a statewide 'Permit Hunts' harvest and statewide 'Total'. No GMU-level turkey harvest "
     "is published. Cross-check: PMU sums + permit hunts equal WDFW's statewide total every year (e.g. 2024: 8,885). "
     "Seasons WDFW did not list for a PMU in a year (e.g. P20 fall 2020) are absent, not zero."),
])


# ---------------------------------------------------------------- verifier fix 2026-10-31: deer species split
# WDFW 2026 pamphlet p. 2281-2305 (deer identification): "Columbian white-tailed deer found in SW Washington are a
# protected species and are not legal to hunt. White-tailed deer are found east of the Cascade crest in Regions 1, 2
# and 3." White-tailed general seasons (2026 pamphlet, modern/archery/muzzleloader tables) are open only in GMUs
# 101-186, 203-284, 373, 379 and 381. Combined-species GMU rows for any other GMU are mule deer / black-tailed deer
# harvest only, so they are kept in mule-deer.json and no longer copied into whitetail.json.
WT_GMUS = {str(g) for g in list(range(101, 187)) + list(range(203, 285)) + [373, 379, 381]}


def deer_districts(raw, year):
    """{'District N': set(GMU ids)} as WDFW groups GMUs on the deer combo page."""
    got = load(raw, year, "deer-combo")
    out = defaultdict(set)
    if not got:
        return out
    main_, _ = got
    for t in main_.find_all("table"):
        dist = heading(t)
        for row in rows_of(t)[1:]:
            gmu, _n = split_gmu(row[0])
            if gmu and dist:
                out[dist].add(gmu)
    return out


def load_draw_classes(repo):
    """(year, hunt code) -> (draw file, description, units) from the Washington draw files (pamphlet-derived
    legal animal and units), used to tell which deer permit hunts can take white-tailed deer."""
    d = {}
    for sp in ("mule-deer", "whitetail"):
        p = os.path.join(repo, "src/data/agency/washington/draw", sp + ".json")
        if os.path.exists(p):
            for r in json.load(open(p)):
                d[(r["year"], r["huntCode"])] = (sp, r["description"], r.get("units") or [])
    return d


def wt_area(desc, units):
    for u in units:
        m = re.fullmatch(r"(\d{3})", u)
        if m and u in WT_GMUS:
            return True
        m = re.fullmatch(r"Deer Area ([12])\d{3}", u)
        if m:
            return True
    return bool(re.search(r"Designated Areas in Region [123]\b", desc))


def split_deer(outs, raw, repo):
    draw = load_draw_classes(repo)
    dropped = defaultdict(int)
    keep_md, keep_wt = [], []
    dists = {y: deer_districts(raw, y) for y in YEARS}
    for r in outs["mule-deer"]:
        if r.get("hunt") and r["year"] == 2021 and r["hunt"].startswith("9"):
            dropped["2021 9xxx land-manager access hunts"] += 1
            continue
        keep_md.append(r)
    for r in outs["whitetail"]:
        u = r["unit"]
        if r.get("hunt"):
            if r["year"] == 2021 and r["hunt"].startswith("9"):
                dropped["2021 9xxx land-manager access hunts"] += 1
                continue
            keep_wt.append(r)
            continue
        if re.fullmatch(r"\d{3}", u) and u not in WT_GMUS:
            dropped["GMU rows outside white-tailed range"] += 1
            continue
        if u.startswith("District") and not (dists[r["year"]].get(u, set()) & WT_GMUS):
            dropped["district rows with no white-tailed GMU"] += 1
            continue
        keep_wt.append(r)
    # permit hunts: decide by the pamphlet legal-animal column and hunt units (via the draw files)
    md_codes = {(r["year"], r["hunt"]) for r in keep_md if r.get("hunt")}
    wt_codes = {(r["year"], r["hunt"]) for r in keep_wt if r.get("hunt")}
    final_md, final_wt = [], []
    for r in keep_md:
        k = (r["year"], r.get("hunt"))
        if r.get("hunt") and k in draw and draw[k][0] == "whitetail" and k in wt_codes:
            dropped["white-tailed-only permit hunts removed from mule-deer"] += 1
            continue
        final_md.append(r)
    for r in keep_wt:
        k = (r["year"], r.get("hunt"))
        if r.get("hunt") and k in md_codes and k in draw and draw[k][0] == "mule-deer":
            _sp, desc, units = draw[k]
            legal = desc.split(" — ")[-1] if " — " in desc else desc
            if re.search(r"mule deer|black-tail", legal, re.I) or not wt_area(desc, units):
                dropped["mule/black-tailed-only permit hunts removed from whitetail"] += 1
                continue
        final_wt.append(r)
    outs["mule-deer"], outs["whitetail"] = final_md, final_wt
    print("deer split:", dict(dropped))


def main(raw, repo):
    outs = defaultdict(list)
    for y in YEARS:
        for deer in (True, False):
            if deer:
                tmp = []
                cervid_gmu(raw, "mule-deer", y, tmp, True)
                cervid_statewide(raw, "mule-deer", y, tmp, True)
                for r in tmp:
                    outs["mule-deer"].append(r)
                    w = OrderedDict(r)
                    w["species"] = "whitetail"
                    outs["whitetail"].append(w)
                for k, v in list(unit_names["mule-deer"].items()):
                    unit_names["whitetail"][k] = v
            else:
                cervid_gmu(raw, "elk", y, outs["elk"], False)
                cervid_statewide(raw, "elk", y, outs["elk"], False)
            cervid_individual(raw, y, deer, outs)
        bear(raw, y, outs["bear"])
        cougar(raw, y, outs["lion"])
        permit_species(raw, y, "moose", "moose", outs["moose"])
        permit_species(raw, y, "bighorn-sheep", "sheep", outs["sheep"])
        permit_species(raw, y, "mountain-goat", "goat", outs["goat"])
        turkey(raw, y, outs["turkey"])
    split_deer(outs, raw, repo)
    wt_units = {r["unit"] for r in outs["whitetail"]}
    unit_names["whitetail"] = {k: v for k, v in unit_names["whitetail"].items() if k in wt_units}

    dest = os.path.join(repo, "src/data/agency/washington")
    os.makedirs(os.path.join(dest, "harvest"), exist_ok=True)
    for sp, rows in outs.items():
        with open(os.path.join(dest, "harvest", sp + ".json"), "w") as f:
            f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
        print(sp, len(rows), sorted({r["year"] for r in rows}))
    meta_path = os.path.join(dest, "harvest-meta.json")
    coverage = [OrderedDict(species=sp, years=[], notes=COVERAGE_NOTES[sp]) for sp in COVERAGE_NOTES]
    years_by = {sp: sorted({r["year"] for r in rows}) for sp, rows in outs.items()}
    for c in coverage:
        c["years"] = years_by.get(c["species"], [])
    meta = OrderedDict(
        unitNames={sp: dict(sorted(d.items())) for sp, d in sorted(unit_names.items())},
        coverage=coverage,
        sources=list(sources.values()),
    )
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("sources", len(sources))
    for p in problems:
        print("PROBLEM", p)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
