"""Parse CDFW harvest documents into HuntScout agency JSON (harvest side).

Usage:
  python -I scripts/agency/california/harvest_parse.py <raw_dir> <repo_root>

<raw_dir> is the folder written by harvest_fetch.py. Writes
  <repo_root>/src/data/agency/california/harvest/{mule-deer,elk,pronghorn,sheep,bear,turkey}.json
  <repo_root>/src/data/agency/california/harvest-meta.json

Rules: every number is copied from a CDFW document. Nothing is estimated; blank or "N/A" cells
are null/omitted. Where a figure is the agency's own estimate (deer "Total Estimated", the upland
survey estimates) the row note says so.
"""
import json
import os
import re
import sys

import pdfplumber
from bs4 import BeautifulSoup

RETRIEVED = "2026-10-31"
PUB = "California Department of Fish and Wildlife"
FH = "https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID={}&inline"

RAW = sys.argv[1]
REPO = sys.argv[2]
OUT = os.path.join(REPO, "src/data/agency/california")

SOURCES = []


def src(sid, title, url, page, year, notes=None):
    s = {"id": sid, "title": title, "publisher": PUB, "url": url, "pageUrl": page,
         "dataYear": year, "retrieved": RETRIEVED}
    if notes:
        s["notes"] = notes
    s = {k: v for k, v in s.items() if v is not None}
    SOURCES.append(s)
    return sid


def raw(name):
    return os.path.join(RAW, name)


def txt(name):
    with open(raw(name), encoding="utf-8", errors="replace") as f:
        return f.read()


def num(s):
    """'1,234' -> 1234, '12.5%' -> 12.5; '-', 'N/A', '' -> None."""
    if s is None:
        return None
    s = s.strip().replace(",", "").replace("%", "").replace("*", "")
    s = re.sub(r"\(b\)|\(c\)", "", s).strip()
    if s in ("", "-", "N/A", "NA", "–"):
        return None
    v = float(s)
    return int(v) if v.is_integer() and "." not in s else v


def clean(d):
    return {k: v for k, v in d.items() if v is not None or k in ("hunters", "harvest", "successPct")}


# ----------------------------------------------------------------------------------------------
# DEER  (Deer Harvest Report, Table 1 "Statewide Deer Harvest and Hunter Success by Hunt")
# ----------------------------------------------------------------------------------------------
DEER_DOCS = {2025: 245246, 2024: 232831, 2023: 222330, 2022: 212676, 2021: 200551, 2020: 197194}
DEER_PAGE = "https://wildlife.ca.gov/Hunting/Deer"
ZONE_RE = re.compile(r"^(A|B[1-6]|C[1-4]|D\d{1,2}|X\d{1,2}[ABC]?)$")
GROUPS = {"B": "B1-B6", "C": "C1-C4", "D3": "D3-D5", "D4": "D3-D5", "D5": "D3-D5"}


def deer_hunt_names():
    """Hunt titles from CDFW's approved 2026 deer season tables (zone / additional / archery)."""
    names = {}
    for fn in ("deer_seasons_additional.txt", "deer_seasons_archery.txt"):
        lines = txt(fn).splitlines()
        for i, ln in enumerate(lines):
            m = re.match(r"^\s*(AO|[A-Z]{1,2}-\d+)\s{2,}(.+?)\s{2,}(\d{1,2}/\d{1,2}/\d{4}|Oct |Valid)", ln)
            if not m:
                continue
            code = m.group(1).replace("-", "")
            title = m.group(2).strip()
            # continuation line: only text in the title column, no date and no new hunt number
            if i + 1 < len(lines):
                nxt = lines[i + 1]
                if nxt.strip() and not re.search(r"\d{1,2}/\d{1,2}/\d{4}|^\s*[A-Z]{1,2}-\d+\s", nxt) \
                        and not re.search(r"Hunt\s+Number|Approved|Title/Description", nxt):
                    cont = re.split(r"\s{3,}", nxt.strip())[0]
                    if cont and cont != "Only" and not cont.startswith("in the") and not cont.startswith("(Archery"):
                        title = f"{title} {cont}"
            title = re.sub(r"\s*\((Split season|Zone C-\d Season)\)", "", title)
            title = re.sub(r"\s*\((Hunt Day Restrictions)\)", "", title)
            names.setdefault(code, unwrap(title))
    # Hunts dropped before 2026: titles from the 2022 Deer Harvest Report drawing tables (Tables 3-9).
    names.setdefault("G8", "Fort Hunter Liggett Antlerless - General Methods")
    names["AO"] = "Archery Only Tag"
    names["A1"] = "C Zones Archery Only Hunt"
    return names


def deer_zone_name(z):
    if z == "A":
        return "Zone A (South Unit 110 and North Unit 160)"
    m = re.match(r"^([A-Z])(\d+)([ABC]?)$", z)
    return f"Zone {m.group(1)}-{m.group(2)}{m.group(3).lower()}"


def deer_method(code, title):
    t = (title or "").lower()
    if ZONE_RE.match(code):
        return "all", "Zone tag (archery and general seasons as the zone allows)"
    if code == "AO" or re.match(r"^A\d+$", code):
        return "archery", "Archery"
    if code.startswith("MA"):
        return "other", "Muzzleloading rifle/archery"
    if code.startswith("M"):
        return "muzzleloader", "Muzzleloading rifle"
    if "shotgun" in t and "archery" not in t:
        return "shotgun", "Shotgun"
    if code in ("Gold Opp", "Open Zone"):
        return "all", "Fund-raising tag"
    return "all", "General methods"


def deer_sex(title):
    t = (title or "").lower()
    if "either-sex" in t or "either sex" in t:
        return "either"
    if "antlerless" in t:
        return None
    if "buck" in t:
        return "male"
    return None


def deer():
    names = deer_hunt_names()
    rows = []
    unit_names = {}
    for year, docid in DEER_DOCS.items():
        sid = src(f"h-cdfw-deer-{year}", f"{year} Deer Harvest Report (California Deer Harvest Statistics)",
                  FH.format(docid), DEER_PAGE, year,
                  "Table 1: reported and estimated deer harvest and hunter success by zone/hunt, from hunter "
                  "license (tag) reports in CDFW's Automated License Data System. Excludes Section 554 "
                  "landowner (PLM) harvest.")
        t = txt(f"deer_{year}.txt")
        t1 = t[t.index("Table 1"):t.index("Table 2")]
        asof = re.search(r"received by the Department as of ([A-Za-z]+ \d+,\s*\d{4})", t1.replace("\n", " "))
        has_issued = "Tags" in t1.split("Reported")[0] and "Issued" in t1.split("Reported")[0]
        for ln in t1.splitlines():
            m = re.match(r"^\s*([A-Z][A-Za-z0-9]*(?: Opp| Zone)?)\s{2,}(\d.*%.*)$", ln)
            if not m:
                continue
            code = m.group(1).strip()
            cells = re.findall(r"[\d,.]+%?(?:\s\(b\))?", m.group(2))
            cells = [c.strip() for c in cells]
            ncol = 10 if has_issued else 9
            if len(cells) != ncol:
                raise SystemExit(f"deer {year} {code}: {len(cells)} cells: {ln}")
            vals = [num(c) for c in cells]
            grp = [c.endswith("(b)") for c in cells]
            if has_issued:
                nrr, quota, issued, rd, rb, rt, ed, eb, et, succ = vals
            else:
                nrr, quota, rd, rb, rt, ed, eb, et, succ = vals
                issued = None
            unit = "Statewide" if code == "Statewide" else code
            is_zone = bool(ZONE_RE.match(code))
            title = None if code in ("Statewide",) else (deer_zone_name(code) if is_zone else names.get(code))
            if code == "Gold Opp":
                title = "Fund-raising tag printed as \"Gold Opp\" (Golden Opportunity)"
            if code == "Open Zone":
                title = "Fund-raising tag printed as \"Open Zone\""
            method, mlabel = ("all", "All hunts") if code == "Statewide" else deer_method(code, title)
            group = GROUPS.get(code[:2] if code.startswith("D") else code[:1]) if is_zone else None
            if group == "D3-D5" and code not in ("D3", "D4", "D5"):
                group = None
            notes = [f"harvest = CDFW 'Total Estimated' (reported harvest adjusted for the non-reporting rate); "
                     f"reported harvest {rt:,} ({rb:,} bucks, {rd:,} does)",
                     f"tag quota {quota:,}", f"non-reporting rate {nrr}%"]
            if issued is not None:
                notes.append(f"tags issued {issued:,}")
            if group and any(grp):
                notes.append(f"quota{', tags issued' if has_issued else ''}, hunter success"
                             f"{' and non-reporting rate' if grp[0] else ''} are CDFW totals for the {group} "
                             f"zone group (one tag valid in any zone of the group); harvest is for this zone only")
            notes.append("hunter success = CDFW's total estimated kill / tags issued")
            if asof:
                notes.append(f"reports received as of {asof.group(1)}")
            if code.startswith("J"):
                notes.append("apprentice (junior) hunt")
            r = {
                "species": "mule-deer", "year": year, "unit": unit, "unitName": title,
                "hunt": None if (is_zone or code == "Statewide") else code,
                "method": method, "methodLabel": mlabel, "sex": deer_sex(title),
                "hunters": None, "harvest": et, "harvestMale": eb, "harvestFemale": ed,
                "successPct": succ,
                "licenses": None if (issued is None or (group and grp[2])) else issued,
                "note": "; ".join(notes), "sourceId": sid,
            }
            rows.append(clean(r))
            if title and unit != "Statewide":
                unit_names.setdefault(unit, title)
    return rows, unit_names


# ----------------------------------------------------------------------------------------------
# ELK and PRONGHORN  (Hunt Statistics PDFs, one table per year)
# ----------------------------------------------------------------------------------------------
SECTION = re.compile(r"Hunts$")
CODE = re.compile(r"^(\d{3}|MZFR|N/A|-|Totals?|Total)$")
SUBSP = {"Rs": "Roosevelt", "Rm": "Rocky Mountain", "Tule": "tule", "T": "tule",
         "Rs/Tule": "Roosevelt/tule", "Rs/Rm/T": "Roosevelt/Rocky Mountain/tule"}


def table_rows(pdfname):
    """Compressed pdfplumber table rows with wrapped-description rows merged into the row above."""
    out = []
    with pdfplumber.open(raw(pdfname)) as pdf:
        for pg in pdf.pages:
            for tb in pg.extract_tables():
                for row in tb:
                    vals = [re.sub(r"\s+", " ", c).strip() for c in row if c not in (None, "")]
                    vals = [v for v in vals if v]
                    if not vals:
                        continue
                    if CODE.match(vals[0]) or vals[0] == "Total":
                        out.append(vals)
                    elif out and len(vals) <= 2 and not SECTION.search(vals[0]) and not re.search(r"\d", "".join(vals)) \
                            and vals[0] not in ("Code", "Hunt Zone") and "Reported" not in vals[0]:
                        # continuation of a wrapped description (and/or sex cell)
                        out[-1] = out[-1] + ["+" + v for v in vals]
    return out


def merge_cont(vals):
    """Fold '+continuation' cells back into the text cells they continue (desc, then sex)."""
    base = [v for v in vals if not v.startswith("+")]
    cont = [v[1:] for v in vals if v.startswith("+")]
    return base, cont


def unwrap(desc):
    """Undo PDF line-wrap artifacts inside a hyphenated word ("Either- sex" -> "Either-sex")."""
    return re.sub(r"\b(Either)- (sex|Sex)\b", r"\1-\2", desc)


def sex_of(desc):
    d = desc.lower()
    if "either" in d:
        return "either"
    if "antlerless" in d:
        return None
    if "bull" in d or "buck" in d:
        return "male"
    return None


def method_of(desc):
    d = desc.lower()
    if "muzzleloader/archery" in d or "muzzlerloader/archery" in d:
        return "other", "Muzzleloader/archery"
    if "archery" in d:
        return "archery", "Archery only"
    if "muzzleloader" in d or "muzzloader" in d:
        return "muzzleloader", "Muzzleloader"
    if "fund" in d:
        return "all", "Fund-raising tag"
    return "all", "General methods"


ELK_DOCS = {2022: 211299, 2021: 200680, 2020: 192238}
ELK_PAGE = "https://wildlife.ca.gov/Hunting/Elk"
PRONG_DOCS = {2023: 220233, 2022: 211300, 2021: 200681, 2020: 192261}
PRONG_PAGE = "https://wildlife.ca.gov/Hunting/Pronghorn-Antelope"


def elk():
    rows, unit_names, subsp_by_code = [], {}, {}
    for year in sorted(ELK_DOCS, reverse=True):
        sid = src(f"h-cdfw-elk-{year}", f"{year} Elk Hunt Statistics", FH.format(ELK_DOCS[year]), ELK_PAGE, year,
                  "Per-hunt applicants, tag quota, tags reported, reported harvest and success rate.")
        for vals in table_rows(f"elk_{year}.pdf"):
            base, cont = merge_cont(vals)
            code = base[0]
            if code in ("499",):
                continue  # preference point only: applicants, no hunt
            if year == 2022:
                if code == "Total":
                    apps, quota, issued, rep, harv, succ = base[1:7]
                    desc, sub = "Total", None
                else:
                    if len(base) != 10:
                        raise SystemExit(f"elk {year} {code}: {base}")
                    _, sub, desc, apps, quota, apt, issued, rep, harv, succ = base
                    desc = " ".join([desc] + cont)
            else:
                if base[0] in ("Totals", "Total"):
                    _, quota, apps, rep, harv, succ = base[:6]
                    desc, issued, sub = "Total", None, None
                else:
                    if len(base) != 7:
                        raise SystemExit(f"elk {year} {code}: {base}")
                    _, desc, quota, apps, rep, harv, succ = base
                    desc = " ".join([desc] + cont)
                    issued, sub = None, None
            if all(num(x) is None for x in (quota, rep, harv, succ)):
                continue  # hunt listed with dashes only (not offered that year)
            desc = unwrap(re.sub(r"\s+", " ", desc).strip())
            total = desc in ("Total", "Totals") or code in ("Total", "Totals")
            unit = "Statewide" if total else ("MZFR" if code == "N/A" else code)
            if sub:
                subsp_by_code[unit] = SUBSP.get(sub, sub)
            notes = [f"harvest = CDFW reported harvest; tag quota {num(quota)}"]
            if num(apps) is not None:
                notes.append(f"applicants {num(apps):,}")
            if num(rep) is not None:
                notes.append(f"tags reported {num(rep)}{' (one tag reported \"did not hunt\")' if '*' in rep else ''}")
            if issued is not None and num(issued) is not None:
                notes.append(f"tags issued {num(issued)}")
            notes.append("success rate = reported harvest / tag quota (CDFW definition)" if year >= 2022 else
                         "success rate as printed (equals reported harvest / tag quota; CDFW states this definition "
                         "from its 2022 table on)")
            if code == "N/A":
                notes.append("CDFW printed the hunt code as 'N/A' in this year's table; stored as MZFR, the code CDFW "
                             "uses for the Statewide Multi-Zone Fundraising bull tag in its 2022 table")
            if year in (2020, 2021):
                notes.append(f"CDFW: many areas were affected by forest closures in {year}; rates may not be "
                             "representative")
            if total:
                notes.append("CDFW table total")
            m, ml = ("all", "All hunts") if total else method_of(desc)
            r = {"species": "elk", "year": year, "unit": unit,
                 "unitName": None if total else desc,
                 "hunt": None if total else unit, "method": m, "methodLabel": ml,
                 "sex": None if total else sex_of(desc),
                 "hunters": None, "harvest": num(harv), "successPct": num(succ),
                 "licenses": num(issued) if issued is not None else None,
                 "note": "; ".join(notes), "sourceId": sid}
            rows.append(clean(r))
            if not total:
                unit_names.setdefault(unit, desc)
    for u, n in unit_names.items():
        if u in subsp_by_code:
            unit_names[u] = f"{n} ({subsp_by_code[u]} elk)"
    for r in rows:
        if r["unit"] in subsp_by_code:
            r["note"] += f"; subspecies: {subsp_by_code[r['unit']]} (per CDFW 2022 table)"
    return rows, unit_names


def pronghorn():
    rows, unit_names = [], {}
    for year in sorted(PRONG_DOCS, reverse=True):
        sid = src(f"h-cdfw-pronghorn-{year}", f"{year} Pronghorn Hunt Statistics", FH.format(PRONG_DOCS[year]),
                  PRONG_PAGE, year, "Per-hunt applicants, quota, tags issued, tags reported, reported harvest and success.")
        for vals in table_rows(f"pronghorn_{year}.pdf"):
            base, cont = merge_cont(vals)
            code = base[0]
            if code == "799":
                continue
            total = code in ("Total", "-") or (len(base) > 1 and base[1] == "Total")
            sex = None
            if year in (2022, 2023):
                if total:
                    _, _, apps, quota, issued, rep, harv, succ = base[:8]
                    desc = "Total"
                else:
                    if len(base) != 9:
                        raise SystemExit(f"pronghorn {year} {code}: {base}")
                    _, desc, apps, quota, apt, issued, rep, harv, succ = base
                    desc = " ".join([desc] + cont)
                rule = "success rate = reported harvest / quota (CDFW)"
            elif year == 2021:
                if total:
                    _, apps, quota, issued, rep, harv, succ = base[:7]
                    desc = "Total"
                else:
                    if len(base) != 10:
                        raise SystemExit(f"pronghorn {year} {code}: {base}")
                    _, apps, quota, issued, apt, rep, harv, succ, desc, sx = base
                    desc = " ".join([desc] + [c for c in cont if c not in ("SEX",)])
                    sex = "either" if "EITHER" in sx else ("male" if sx == "BUCK" else None)
                rule = "success % as printed by CDFW (equals reported harvest / tags issued in this table)"
            else:  # 2020
                quota = None
                if total:
                    _, apps, issued, rep, harv, succ = base[:6]
                    desc = "Total"
                else:
                    if len(base) != 9:
                        raise SystemExit(f"pronghorn {year} {code}: {base}")
                    _, apps, issued, apt, rep, harv, succ, desc, sx = base
                    desc = " ".join([desc] + [c for c in cont if c not in ("SEX",)])
                    sex = "either" if "EITHER" in sx else ("male" if sx == "BUCK" else None)
                rule = "success % as printed by CDFW (equals reported harvest / tags issued in this table)"
            desc = unwrap(re.sub(r"\s+", " ", desc).replace("–", "-").strip())
            if sex is None and not total:
                sex = sex_of(desc)
            unit = "Statewide" if total else code
            notes = ["harvest = CDFW reported harvest"]
            if quota is not None and num(quota) is not None:
                notes.append(f"quota {num(quota)}")
            if num(apps) is not None:
                notes.append(f"applicants {num(apps):,}")
            if num(rep) is not None:
                notes.append(f"tags reported {num(rep)}")
            notes.append(rule)
            if total:
                notes.append("CDFW table total")
            if year == 2020 and code == "755":
                notes.append("as printed: 0 tags reported and 1 animal harvested")
            m, ml = ("all", "All hunts") if total else method_of(desc)
            if "apprentice" in desc.lower():
                notes.append("apprentice hunt")
            r = {"species": "pronghorn", "year": year, "unit": unit, "unitName": None if total else desc,
                 "hunt": None if total else unit, "method": m, "methodLabel": ml, "sex": None if total else sex,
                 "hunters": None, "harvest": num(harv), "successPct": num(succ), "licenses": num(issued),
                 "note": "; ".join(notes), "sourceId": sid}
            rows.append(clean(r))
            if not total:
                unit_names.setdefault(unit, desc)
    return rows, unit_names


# ----------------------------------------------------------------------------------------------
# DESERT BIGHORN SHEEP  (Bighorn Sheep Hunting page, "Tag Drawing Statistics" table)
# ----------------------------------------------------------------------------------------------
SHEEP_PAGE = "https://wildlife.ca.gov/Hunting/Bighorn-Sheep"
SHEEP_WAYBACK = {2020: "20211128030800", 2021: "20221225140234", 2022: "20231201054539",
                 2023: "20240717133526", 2024: "20251218020221"}


def sheep():
    rows, unit_names = [], {}
    files = [(y, os.path.join("wayback", f"sheep_{ts}.html"), ts) for y, ts in SHEEP_WAYBACK.items()]
    files.append((2025, "Hunting_Bighorn-Sheep.html", None))
    for year, fn, ts in files:
        if ts:
            url = f"https://web.archive.org/web/{ts}/https://wildlife.ca.gov/Hunting/Bighorn-Sheep"
            sid = src(f"h-cdfw-sheep-{year}", f"{year} Desert Bighorn Sheep Tag Drawing Statistics (Hunter Success)",
                      url, SHEEP_PAGE, year,
                      f"Table on CDFW's Bighorn Sheep Hunting page, read from the Internet Archive capture of "
                      f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}; CDFW replaces the table with the next year's each season.")
        else:
            sid = src(f"h-cdfw-sheep-{year}", f"{year} Desert Bighorn Sheep Tag Drawing Statistics (Hunter Success)",
                      SHEEP_PAGE, None, year, "Table on CDFW's Bighorn Sheep Hunting page (current).")
        with open(raw(fn), encoding="utf-8", errors="replace") as f:
            soup = BeautifulSoup(f.read(), "lxml")
        found = False
        for tb in soup.find_all("table"):
            trs = tb.find_all("tr")
            head = [c.get_text(" ", strip=True).replace("\xa0", " ") for c in trs[0].find_all(["th", "td"])]
            if not any("Hunter Success" in h for h in head):
                continue
            hy = int(re.search(r"(\d{4}) Hunter Success", " ".join(head)).group(1))
            assert hy == year, (fn, hy, year)
            found = True
            idx = {k: next(i for i, h in enumerate(head) if k in h) for k in
                   ("Hunt Code", "Description", "Total Applicants", "Tag Quota", "Preference Point Tag Quota",
                    "Random Tag Quota", "Hunter Success")}
            idx["Tag Quota"] = next(i for i, h in enumerate(head) if re.search(r"\d{4} Tag Quota$", h))
            for tr in trs[1:]:
                c = [x.get_text(" ", strip=True).replace("\xa0", " ") for x in tr.find_all(["td", "th"])]
                code = c[idx["Hunt Code"]]
                if code == "599":
                    continue
                desc = re.sub(r"\s+", " ", c[idx["Description"]])
                succ = num(c[idx["Hunter Success"]])
                if succ is None:
                    continue
                q, pq, rq = (num(c[idx[k]]) for k in ("Tag Quota", "Preference Point Tag Quota", "Random Tag Quota"))
                apps = num(c[idx["Total Applicants"]])
                notes = [f"CDFW publishes only hunter success (%) per hunt; harvest and hunter counts not published",
                         f"tag quota {q} ({pq} preference-point, {rq} random)", f"total applicants {apps:,}",
                         "Nelson desert bighorn sheep; ram-only hunts"]
                r = {"species": "sheep", "year": year, "unit": code, "unitName": desc, "hunt": code,
                     "method": "all", "methodLabel": "General method", "sex": "male",
                     "hunters": None, "harvest": None, "successPct": succ,
                     "note": "; ".join(notes), "sourceId": sid}
                rows.append(clean(r))
                unit_names.setdefault(code, desc) if year < 2025 else unit_names.__setitem__(code, desc)
        if not found:
            raise SystemExit(f"no success table in {fn}")
    return rows, unit_names


# ----------------------------------------------------------------------------------------------
# BLACK BEAR  (Bear Take Reports / Black Bear Program Annual Report)
# ----------------------------------------------------------------------------------------------
BEAR_PAGE = "https://wildlife.ca.gov/Hunting/Bear"


def county_table(text, start, stop):
    seg = text[text.index(start):]
    seg = seg[:seg.index(stop)] if stop in seg else seg
    out = []
    for ln in seg.splitlines():
        m = re.match(r"^\s*([A-Z][A-Z .]+?)\s{2,}([\d,]+)\s+([\d.]+)%\s*$", ln)
        if m and m.group(1).strip() not in ("TOTAL", "COUNTY"):
            out.append((m.group(1).strip(), num(m.group(2)), m.group(3)))
        t = re.match(r"^\s*TOTAL\s+([\d,]+)", ln)
        if t:
            out.append(("TOTAL", num(t.group(1)), None))
    return out


def bear():
    rows = []
    s20 = src("h-cdfw-bear-2020", "2020 Bear Take Report", FH.format(195525), BEAR_PAGE, 2020,
              "Black bear take from returned/ALDS harvest report tags; Table 2 = take by county.")
    s2123 = src("h-cdfw-bear-2021-2023", "Interim Black Bear Take Report 2021-2023", FH.format(231210), BEAR_PAGE, 2023,
                "Covers the 2021, 2022 and 2023 seasons combined; per-year take only as data labels in Figure 1.")
    s24 = src("h-cdfw-bear-2024", "2025 Black Bear Program Annual Report (2024 hunt season)", FH.format(246936),
              BEAR_PAGE, 2024, "Published July 2026; reports the 2024 hunt season (Table 3 = harvest by county).")

    t = txt("bear_2020.txt")
    ct = county_table(t, "Table 2. Bear Take by County", "Estimated")
    tot = [x for x in ct if x[0] == "TOTAL"][0][1]
    assert tot == 1028 and sum(x[1] for x in ct if x[0] != "TOTAL") == tot, "bear 2020 county sum"
    for name, n, pct in ct:
        if name == "TOTAL":
            continue
        unit = "UNKNOWN" if name.startswith("UNKNOWN") else name
        note = f"reported take ({pct}% of statewide)"
        if unit == "UNKNOWN":
            note += "; printed as 'UNKNOWN COUNTY' (county not reported)"
        rows.append(clean({"species": "bear", "year": 2020, "unit": unit, "method": "all", "hunters": None,
                           "harvest": n, "successPct": None, "note": note, "sourceId": s20}))
    flat = re.sub(r"\s+", " ", t)
    assert "resulted in 1,028 bears taken" in flat and "A total of 30,387 bear tags were issued" in flat
    assert "Overall hunter success was 3%" in flat and "630 (61.3%) were male, 387 (37.6%) were female" in flat
    rows.append(clean({"species": "bear", "year": 2020, "unit": "Statewide", "method": "all", "hunters": None,
                       "harvest": 1028, "harvestMale": 630, "harvestFemale": 387, "successPct": 3,
                       "licenses": 30387,
                       "note": "licenses = bear tags sold (30,249 resident incl. junior, 138 nonresident); CDFW "
                               "'overall hunter success' 3% (7% among hunters who reported an attempt to hunt); "
                               "11 report tags did not give sex; season closes at 1,700 reported bears or the last "
                               "Sunday in December (closed Dec 27, 2020); PLM program harvest of 4 not included",
                       "sourceId": s20}))

    # 2021-2023: per-year totals are the data labels of Figure 1 ("Reported California Black Bear Harvest
    # 2004-2023", an image) and the same labels in Figure 3 of the 2025 Annual Report. Checked: they sum to the
    # 3,915 bears the interim report states in text.
    t = re.sub(r"\s+", " ", txt("bear_interim_2021_2023.txt"))
    fig = {2021: 1315, 2022: 1421, 2023: 1179}
    assert "total of 3,915 black bears taken" in t and sum(fig.values()) == 3915
    t24 = re.sub(r"\s+", " ", txt("bear_annual_2025.txt"))
    assert "lower than 2023 black bear tag sales (32,475)" in t24
    for y, n in fig.items():
        r = {"species": "bear", "year": y, "unit": "Statewide", "method": "all", "hunters": None, "harvest": n,
             "successPct": None,
             "note": "statewide reported take from the data label of CDFW's annual-take chart (Interim Take Report "
                     "2021-2023 Fig. 1; same value in 2025 Annual Report Fig. 3); the three years sum to the 3,915 "
                     "bears CDFW states for 2021-2023. Per-year county, sex and tag figures are not published "
                     "(2021-2023 combined: 97,151 tags sold, 2,253 male / 1,524 female, county table combined)",
             "sourceId": s2123}
        if y == 2023:
            r["licenses"] = 32475
            r["note"] += "; licenses = 2023 bear tag sales as stated in the 2025 Annual Report"
        rows.append(clean(r))

    t = txt("bear_annual_2025.txt")
    ct = county_table(t, "Table 3: 2024 black bear harvest by county", "Harvest Rates")
    tot = sum(x[1] for x in ct if x[0] != "TOTAL")
    assert tot == 979, f"bear 2024 county sum {tot}"
    for name, n, pct in ct:
        if name == "TOTAL":
            continue
        rows.append(clean({"species": "bear", "year": 2024, "unit": name, "method": "all", "hunters": None,
                           "harvest": n, "successPct": None,
                           "note": f"reported harvest ({pct}% of statewide)" + ("; county not reported" if name == "UNKNOWN" else ""),
                           "sourceId": s24}))
    assert "A total of 979 black bears were harvested during the 2024 hunting season" in t24
    assert "576 (58.8%) were male, 327 (33.4%) were female" in t24 and "30,999 black bear hunting tags were sold" in t24
    rows.append(clean({"species": "bear", "year": 2024, "unit": "Statewide", "method": "all", "hunters": None,
                       "harvest": 979, "harvestMale": 576, "harvestFemale": 327, "successPct": None,
                       "licenses": 30999,
                       "note": "licenses = bear tags sold (30,773 resident incl. junior, 226 nonresident); 76 report "
                               "tags did not give sex; hunter success not published; season closed Dec 29, 2024 "
                               "(1,700-bear threshold not reached); PLM program harvest of 2 not included; lowest "
                               "harvest on record per CDFW",
                       "sourceId": s24}))
    return rows


# ----------------------------------------------------------------------------------------------
# WILD TURKEY  (Upland Game Bird Harvest Survey; survey-based estimates)
# ----------------------------------------------------------------------------------------------
UPLAND_PAGE = "https://wildlife.ca.gov/Hunting/Upland-Game-Birds"


def turkey():
    rows = []
    sv = {
        2020: src("h-cdfw-upland-2020", "Upland Game Bird Harvest Survey 2020-2021", FH.format(195214), UPLAND_PAGE, 2020,
                  "Survey estimates for Fall 2020 and Spring 2021 turkey seasons (Table 1 statewide, Table 2 by county)."),
        2022: src("h-cdfw-upland-2022", "Upland Game Bird and Small Game Mammal Harvest Survey 2022-2023", FH.format(225246),
                  UPLAND_PAGE, 2022, "Survey estimates for Fall 2022 and Spring 2023 turkey seasons (Table 1 statewide, Table 4 by county)."),
        2023: src("h-cdfw-upland-2023", "Upland Game Bird Harvest Survey 2023-2024", FH.format(243717), UPLAND_PAGE, 2023,
                  "Survey estimates for Fall 2023 and Spring 2024 turkey seasons (Table 1 statewide)."),
    }
    # statewide (Table 1)
    for sy, sid in sv.items():
        t = txt(f"upland_{sy}.txt")
        t1 = t[t.index("Table 1. Statewide"):]
        for season in ("Fall", "Spring"):
            yr = sy if season == "Fall" else sy + 1
            m = re.search(rf"Wild turkey {season} {yr}\s+(\d[\d,]*\s.+)", t1)
            line = m.group(1)
            if sy == 2023:
                nums = re.findall(r"([\d,]+) \([\d,]+ – [\d,]+\)", line)
                harv, hunters, days = (num(x) for x in nums[:3])
                bag = None
            else:
                harv, hunters, bag, days, avgd = (num(x) for x in line.split()[:5])
            note = (f"CDFW survey estimate (not a count) for the {season} {yr} season, statewide; harvest "
                    f"may exceed hunters (multi-bird bag)")
            if bag is not None:
                note += f"; average bag per hunter {bag}"
            if sy == 2023:
                ci = re.findall(r"\(([\d,]+ – [\d,]+)\)", line)
                note += f"; 95% CI harvest {ci[0]}, hunters {ci[1]}, days {ci[2]}"
            rows.append(clean({"species": "turkey", "year": yr, "unit": "Statewide", "method": "all",
                               "methodLabel": f"{season} season", "hunters": hunters, "harvest": harv,
                               "successPct": None, "daysHunted": days, "note": note, "sourceId": sid}))
    # county tables: 2020-21 survey Table 2 (pdftotext lines, all six cells always printed) and
    # 2022-23 survey Table 4 (pdfplumber cells, blank cells present). 2023-24 Table 5 not used (see coverage).
    county = {}
    t = txt("upland_2020.txt")
    i = t.index("F harvest     F hunters")
    seg = t[t.rindex("Table 2.", 0, i):]
    seg = seg[:seg.index("Ruf f ed")]
    for ln in seg.splitlines():
        m = re.match(r"^\s*([A-Z][A-Za-z .]+?)\s{2,}([\d,]+(?:\s+[\d,]+){5})\s*$", ln)
        if m:
            county.setdefault(2020, []).append((m.group(1).strip(), [num(x) for x in m.group(2).split()]))
    with pdfplumber.open(raw("upland_2022.pdf")) as pdf:
        pages = [i for i, pg in enumerate(pdf.pages)
                 if "Table 4. Estimated harvest, hunters, and hunter-effort for wild turkey" in (pg.extract_text() or "")]
        pi = [i for i in pages if "turkey F" in (pdf.pages[i].extract_text() or "")][0]
        for pg in pdf.pages[pi:pi + 2]:
            for tb in pg.extract_tables():
                hdr = " ".join((c or "") for c in tb[0])
                if pg.page_number != pi + 1 and ("Ruffed" in hdr or "grouse" in hdr):
                    continue
                if pg.page_number == pi + 1 and "turkey" not in hdr:
                    continue
                for row in tb:
                    if len(row) != 7 or not row[0] or row[0] == "County":
                        continue
                    county.setdefault(2022, []).append((re.sub(r"\s+", " ", row[0]).strip(),
                                                         [num(c) if c else None for c in row[1:]]))
    for sy, items in county.items():
        names = [n for n, _ in items]
        assert len(names) == len(set(names)) == 58, (sy, len(names))
        for name, vals in items:
            for season, (h, n, d), yr in (("Fall", vals[:3], sy), ("Spring", vals[3:], sy + 1)):
                if all(v is None for v in (h, n, d)):
                    continue
                if (h or 0) == 0 and (n or 0) == 0 and (d or 0) == 0:
                    continue  # CDFW lists 0/0/0 for counties with no reported turkey hunting
                if n is None:
                    raise SystemExit(f"turkey {sy} {name}: hunters blank {vals}")
                note = f"CDFW survey estimate (not a count) for the {season} {yr} season"
                if h is not None and h > n:
                    note += "; estimated harvest exceeds estimated hunters as published"
                rows.append(clean({"species": "turkey", "year": yr, "unit": name, "method": "all",
                                   "methodLabel": f"{season} season", "hunters": n, "harvest": h,
                                   "successPct": None, "daysHunted": d, "note": note, "sourceId": sv[sy]}))
    return rows


def write(name, rows):
    rows.sort(key=lambda r: (-r["year"], r["unit"] != "Statewide", r["unit"], r.get("hunt") or "", r.get("methodLabel") or ""))
    with open(os.path.join(OUT, "harvest", name), "w") as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return len(rows)


def main():
    os.makedirs(os.path.join(OUT, "harvest"), exist_ok=True)
    d, dn = deer()
    e, en = elk()
    p, pn = pronghorn()
    s, sn = sheep()
    b = bear()
    tk = turkey()
    counts = {f: write(f, r) for f, r in (("mule-deer.json", d), ("elk.json", e), ("pronghorn.json", p),
                                          ("sheep.json", s), ("bear.json", b), ("turkey.json", tk))}
    bear_units = {r["unit"]: r["unit"].title() + " County" for r in b if r["unit"] not in ("Statewide", "UNKNOWN")}
    bear_units["UNKNOWN"] = "County not reported"
    tk_units = {r["unit"]: r["unit"] + " County" for r in tk if r["unit"] != "Statewide"}

    def yrs(rows):
        return sorted({r["year"] for r in rows})

    meta = {
        "unitNames": {"mule-deer": dict(sorted(dn.items())), "elk": dict(sorted(en.items())),
                      "pronghorn": dict(sorted(pn.items())), "sheep": dict(sorted(sn.items())),
                      "bear": dict(sorted(bear_units.items())), "turkey": dict(sorted(tk_units.items()))},
        "coverage": [
            {"species": "mule-deer", "years": yrs(d), "notes": (
                "Deer (mule & black-tailed). Source: CDFW Deer Harvest Report Table 1 for each season 2020-2025 "
                "(hunter tag reports in ALDS; excludes PLM / Section 554 landowner harvest). One row per zone "
                "(A, B1-B6, C1-C4, D3-D19, X1-X12; unit = zone as printed) or per additional/archery hunt (unit = "
                "hunt = CDFW hunt code, e.g. A22, G1, J10, M6, MA1), plus CDFW's Statewide row. harvest/"
                "harvestMale/harvestFemale = CDFW 'Total Estimated' / 'Estimated Bucks' / 'Estimated Does' "
                "(reported harvest corrected for the non-reporting rate); reported counts, tag quota and "
                "non-reporting rate are in each row note. successPct = CDFW 'Percent Hunter Success' = total "
                "estimated kill / tags issued. B, C and D3-5 tags are valid in any zone of their group, so for "
                "those zones quota, tags issued and success (and in 2020-2021 the non-reporting rate) are group "
                "totals printed on each zone row, while harvest is zone-specific. licenses = tags issued, printed "
                "only in the 2020-2022 reports (left null for group zones, where it is a group total). hunters is "
                "null: CDFW does not publish hunters afield. Hunt names (unitNames) are CDFW's 2026 season titles; "
                "G8 (dropped after 2022) uses the 2022 drawing-table title. Antler-class tables (Table 2) are not "
                "loaded. California has no whitetail deer season.")},
            {"species": "elk", "years": yrs(e), "notes": (
                "Source: CDFW Elk Hunt Statistics PDFs 2020-2022, one row per hunt code (unit = hunt = CDFW hunt "
                "code) plus the table total as Statewide. Roosevelt, Rocky Mountain and tule elk; the subspecies "
                "column printed in the 2022 table is carried into unitNames and row notes. harvest = reported "
                "harvest; successPct = CDFW success rate (reported harvest / tag quota). licenses = tags issued "
                "(printed only in 2022). Tag quota, applicants and tags reported are in notes; hunter counts are not "
                "published. Preference-point-only code 499 and hunts printed with dashes only (2022: 333 Alameda, "
                "334 Santa Clara) are omitted. GAP: CDFW has not posted 2023, 2024 or 2025 elk hunt statistics "
                "(wildlife.ca.gov/Hunting/Elk lists 2004-2022 as of 2026-10-31); the elk tooth-age PDFs for 2023-2024 "
                "list only submitted teeth and are not harvest totals, so they are not used.")},
            {"species": "pronghorn", "years": yrs(p), "notes": (
                "Source: CDFW Pronghorn Hunt Statistics PDFs 2020-2023, one row per hunt code (710-790 zone hunts, "
                "700 fund-raising) plus the table total as Statewide. harvest = reported harvest; licenses = tags "
                "issued; quota, applicants and tags reported in notes. successPct as printed: 2022-2023 CDFW "
                "defines it as reported harvest / quota; in 2020-2021 the printed % equals harvest / tags issued. "
                "GAP: 2024 and 2025 pronghorn hunt statistics are not posted as of 2026-10-31. CDFW's ArcGIS "
                "'Pronghorn Harvest Dashboard' layer of reported kill locations was checked but not used: its 2023 "
                "record count (140) does not match the 124 reported harvest in CDFW's 2023 hunt statistics.")},
            {"species": "sheep", "years": yrs(s), "notes": (
                "Nelson desert bighorn sheep, ram-only general-method hunts (Sierra Nevada and Peninsular bighorn "
                "are not hunted). CDFW publishes per-hunt 'Hunter Success (%)' with applicants and tag quotas in the "
                "'Tag Drawing Statistics' table on wildlife.ca.gov/Hunting/Bighorn-Sheep and replaces it every year: "
                "2025 is read from the live page, 2020-2024 from Internet Archive captures of the same CDFW page. "
                "Harvest and hunter counts are not published, so harvest and hunters are null (not derived from "
                "success x quota). Fund-raising sheep tags are not in the table. Hunt 510 (Zone 10) was split into "
                "512/513 and Zone 7 into 507/511 from 2025.")},
            {"species": "bear", "years": yrs(b), "notes": (
                "Black bear, general (OTC) bear tags; statewide season closes when 1,700 bears are reported or on "
                "the last Sunday of December. Units are counties as printed by CDFW (upper case); CDFW reports "
                "bear harvest by county, not by hunt zone. 2020: county table + statewide (2020 Bear Take Report). "
                "2021-2023: CDFW published only a combined 2021-2023 Interim Take Report; its county table and sex "
                "split are 3-year totals and are NOT loaded as single years. Per-year statewide take 2021/2022/2023 "
                "is taken from the data labels of CDFW's annual-take chart (sums to the 3,915 stated in text). "
                "2024: county table + statewide from the 2025 Black Bear Program Annual Report (published July "
                "2026, which reports the 2024 season). GAP: the 2025 season bear report is not published as of "
                "2026-10-31. licenses = bear tags sold; hunter counts not published.")},
            {"species": "turkey", "years": yrs(tk), "notes": (
                "Wild turkey (general OTC upland game licenses; harvest is estimated from CDFW's Upland Game Bird "
                "Harvest Survey, not counted). Rows are per season: 'Fall season' (year = fall year) and 'Spring "
                "season' (year = spring year), Statewide from each survey's Table 1 and by county (unit = county "
                "name as printed) from the 2020-21 (Table 2) and 2022-23 (Table 4) surveys; hunters, harvest and "
                "daysHunted are CDFW estimates. Counties CDFW lists as 0/0/0 or blank are omitted. Survey seasons "
                "covered: Fall 2020, Spring 2021, Fall 2022, Spring 2023, Fall 2023, Spring 2024. GAPS: no survey "
                "for Fall 2021/Spring 2022 (CDFW ran the survey biennially) and none yet for Fall 2024 onward. The "
                "2023-24 county table (Table 5) is not loaded: its first row (Alameda) repeats the statewide totals "
                "and several counties are visibly misaligned, so county values cannot be assigned reliably. Draw "
                "turkey hunts (e.g. on wildlife areas) have no published harvest.")},
        ],
        "sources": SOURCES,
    }
    with open(os.path.join(OUT, "harvest-meta.json"), "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(json.dumps(counts))
    for c in meta["coverage"]:
        print(c["species"], c["years"])


if __name__ == "__main__":
    main()
