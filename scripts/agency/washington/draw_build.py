"""Build HuntScout Pro draw data for Washington (WDFW special permit drawings).

Usage:
  python -I draw_build.py <raw_dir> <repo_root>

Inputs (downloaded by draw_fetch.py into <raw_dir>; pamphlet PDFs converted with
`pdftotext -layout <pdf> <txt>` next to them):
  harvestpages/<year>-{deer-individual,elk-individual,moose,bighorn-sheep,
                       mountain-goat,black-bear-spring}.html
  pbi/special_hunt_2021.json
  pdf/pamphlet_<year>.txt (2022-2026)

Writes src/data/agency/washington/draw/<species>.json (DrawRecord[]).
draw_meta.py writes draw-meta.json (sources are shared via SOURCES below).

Rules: numbers are copied exactly as WDFW published them. Odds are computed
(permits issued / applicants) and flagged oddsComputed. Nothing is filled in.
"""
import difflib
import importlib.util
import json
import os
import re
import sys
from collections import Counter, defaultdict

from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pamphlet = _load("draw_pamphlet")
pbi = _load("draw_pbi")

RETRIEVED = "2026-10-31"
HARVEST_URL = "https://wdfw.wa.gov/hunting/management/game-harvest/{y}/{r}"
HARVEST_YEARS = range(2020, 2026)
REPORTS = {  # report slug -> pamphlet group
    "deer-individual": "deer",
    "elk-individual": "elk",
    "moose": "moose",
    "bighorn-sheep": "sheep",
    "mountain-goat": "goat",
    "black-bear-spring": "bear",
}
REPORT_TITLE = {
    "deer-individual": "{y} Deer individual hunts",
    "elk-individual": "{y} Elk individual hunts",
    "moose": "{y} Moose special permit game harvest reports",
    "bighorn-sheep": "{y} Bighorn sheep special permit game harvest reports",
    "mountain-goat": "{y} Mountain goat special permit game harvest reports",
    "black-bear-spring": "{y} Black bear spring special permit game harvest reports",
}
PAMPHLET = {
    2020: ("02255", "wdfw02255.pdf", "2020 Big Game Hunting Seasons and Rules"),
    2021: ("02254", "wdfw02254.pdf", "2021 Big Game Hunting Seasons and Rules"),
    2022: ("02407", "wdfw02407.pdf", "2022 Big Game Hunting Seasons and Rules"),
    2023: ("02422", "wdfw02422.pdf", "2023 Big Game Hunting Seasons and Rules"),
    2024: ("02498", "wdfw02498.pdf", "2024 Big Game Hunting Seasons and Rules"),
    2025: ("02608", "wdfw02608.pdf", "2025 Big Game Hunting Seasons and Rules"),
    2026: ("02706", "wdfw02706.pdf", "2026 Big Game Hunting Seasons and Rules"),
}
# Line in each pamphlet text where the pamphlet proper begins (corrections pages are
# prepended to some PDFs; they are applied separately via CORRECTIONS).
PAMPHLET_START = "Effective April 1, {y}"

# Pamphlet corrections/errata published by WDFW (read in full; only the items that
# change a special-permit hunt row are encoded here).
CORRECTIONS = {
    2024: {  # 2024 BIG GAME ... PAMPHLET CORRECTIONS, updated Sept. 11, 2024
        "2512": {"dates": "Sept. 28 – Oct. 11", "notes": None},
        "2513": {"dates": "Sept. 28 – Oct. 11", "notes": None},
        "2804": {"dates": "Feb. 8 – 17, 2025"},
    },
    2025: {  # 2025 ... Pamphlet Corrections (updated 8/5/25): YTC closure removed these hunts
        **{c: {"removed": True} for c in ["1044", "1225", "1240", "2823", "2812", "2835", "2230", "2231",
                                           "2232", "2287", "2288", "2412", "2422", "2509", "2613"]},
    },
    2026: {},  # filled from the corrections table printed in the 2026 corrections PDF (see parse_corrections_2026)
}

SOURCES = []
DEER_NOTE = "Not a white-tailed-only hunt per WDFW's hunt name / legal-deer column"


def add_source(**kw):
    kw.setdefault("publisher", "Washington Department of Fish and Wildlife")
    kw.setdefault("retrieved", RETRIEVED)
    SOURCES.append(kw)
    return kw["id"]


def harvest_source_id(report, year):
    return f"d-harvest-{report}-{year}"


def register_sources():
    for rep in REPORTS:
        years = range(2020, 2022) if rep == "black-bear-spring" else HARVEST_YEARS
        for y in years:
            add_source(id=harvest_source_id(rep, y), title=REPORT_TITLE[rep].format(y=y),
                       url=HARVEST_URL.format(y=y, r=rep),
                       pageUrl="https://wdfw.wa.gov/hunting/management/game-harvest", dataYear=y,
                       notes="Per-hunt 'Total Applicants' and 'Permits Issued' (and 'Quota' for moose, sheep, goat) "
                             "from WDFW's game harvest report for the special permit hunts of that year.")
    add_source(id="d-pbi-2021", title="Special hunt permit drawing result summaries (Species Breakdown)",
               url="https://app.powerbigov.us/view?r=eyJrIjoiMTUwYmI1Y2ItOWQ2My00YzBmLTkxYzUtYTUxNTQ2ZDA2MzRhIiwidCI6IjExZDBlMjE3LTI2NGUtNDAwYS04YmEwLTU3ZGNjMTI3ZDcyZCJ9",
               pageUrl="https://wdfw.wa.gov/hunting/special-hunts/results", dataYear=2021,
               notes="WDFW Power BI report (table SpecialHuntMetrics_B_Tab03), Season 2021 only. The WDFW page says "
                     "'The content below is out of date due to a technical error' and 'Data last updated June 21, 2021'; "
                     "it is the most recent per-hunt drawing summary WDFW publishes.")
    for y, (num, pdf, title) in PAMPHLET.items():
        add_source(id=f"d-pamphlet-{y}", title=title,
                   url=f"https://wdfw.wa.gov/sites/default/files/publications/{num}/{pdf}",
                   pageUrl=f"https://wdfw.wa.gov/publications/{num}", dataYear=y,
                   notes=f"Special permit tables: {y} hunt choices and permits, plus the prior year's 'APPS/AVG POINTS' column.")
    add_source(id="d-pamphlet-2026-corrections",
               title="2026 Big Game Hunting Seasons and Regulation - Pamphlet Corrections April 22, 2026",
               url="https://wdfw.wa.gov/sites/default/files/publications/02706/2026%20Big%20Game%20Pamphlet%20Corrections_4.22.26_web.pdf",
               pageUrl="https://wdfw.wa.gov/publications/02706", dataYear=2026)
    add_source(id="d-pamphlet-2025-errata", title="2025 Big Game Hunting Seasons & Regulations Pamphlet Corrections (updated 8/5/25)",
               url="https://wdfw.wa.gov/sites/default/files/publications/02608/wdfw02608-errata.pdf",
               pageUrl="https://wdfw.wa.gov/publications/02608", dataYear=2025)
    add_source(id="d-pamphlet-2024-errata", title="2024 Big Game Hunting Seasons & Regulations Pamphlet Corrections (updated Sept. 11, 2024)",
               url="https://wdfw.wa.gov/sites/default/files/publications/02498/2024%20big%20game%20errata.pdf",
               pageUrl="https://wdfw.wa.gov/publications/02498", dataYear=2024)


# ---------------------------------------------------------------- parsing helpers

def num(s):
    s = (s or "").strip().replace(",", "")
    return int(s) if re.fullmatch(r"\d+", s) else None


def parse_harvest(path, report):
    soup = BeautifulSoup(open(path, "rb").read(), "lxml")
    main = soup.find("main") or soup
    out = []
    for t in main.find_all("table"):
        heads = [th.get_text(" ", strip=True) for th in t.find("thead").find_all("th")] if t.find("thead") else []
        body = t.find("tbody")
        if not body:
            continue
        if report == "black-bear-spring":
            h2 = t.find_previous("h2")
            m = re.search(r"Hunt\s+number\s+(\d{4})", h2.get_text(" ", strip=True)) if h2 else None
            if not m:
                continue
            tr = body.find("tr")
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            rec = dict(zip(heads, cells))
            out.append({"code": m.group(1), "name": rec["Hunt Name"], "area": rec.get("Hunt Area"),
                        "applicants": num(rec.get("Total Applicants")), "issued": num(rec.get("Permits Issued")),
                        "quota": None})
            continue
        cap = t.find("caption")
        if not cap:
            continue
        m = re.match(r"^(\d{4}) - (.+)$", cap.get_text(" ", strip=True))
        if not m:
            continue
        rows = body.find_all("tr")
        assert len(rows) == 1, (path, cap)
        cells = [c.get_text(" ", strip=True) for c in rows[0].find_all(["td", "th"])]
        rec = dict(zip(heads, cells))
        out.append({"code": m.group(1), "name": m.group(2), "applicants": num(rec.get("Total Applicants")),
                    "issued": num(rec.get("Permits Issued")), "quota": num(rec.get("Quota")) if "Quota" in rec else None})
    return out


LIG = [("ffi", "f"), ("ffl", "f"), ("ff", "f"), ("fi", "f"), ("fl", "f")]


def lig_key(s):
    s = s.lower()
    for a, b in LIG:
        s = s.replace(a, b)
    return s


def name_key(s):
    s = (s or "").lower().replace("–", "-").replace("—", "-")
    s = re.sub(r"\bmount\b", "mt", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return lig_key(s)


def names_match(a, b):
    ka, kb = name_key(a), name_key(b)
    if not ka or not kb:
        return False
    if ka == kb or ka in kb or kb in ka:
        return True
    return difflib.SequenceMatcher(None, ka, kb).ratio() >= 0.8


class LigatureFixer:
    """The 2026 pamphlet PDF text layer drops the fi/ff/ffi/fl/ffl ligatures to a bare 'f'
    (e.g. 'Lincoln Clifs', 'ofce'). Restore a word only when exactly one spelling found in
    other WDFW sources (2022-2025 pamphlets, harvest report captions) collapses to it."""

    def __init__(self, texts):
        vocab = Counter()
        for t in texts:
            for w in re.findall(r"[A-Za-z][A-Za-z'\-]*", t):
                vocab[w] += 1
        self.by_key = defaultdict(set)
        for w in vocab:
            if any(x in w.lower() for x in ("fi", "ff", "fl")):
                self.by_key[lig_key(w)].add(w)
        self.vocab = set(vocab)
        self.unresolved = Counter()
        self.fixed = Counter()

    def fix(self, s):
        if not s:
            return s

        def rep(m):
            w = m.group(0)
            if "f" not in w.lower():
                return w
            cands = self.by_key.get(lig_key(w), set())
            cands = {c for c in cands if lig_key(c) == lig_key(w)}
            if w in self.vocab:
                return w  # the word as printed is attested in a clean WDFW text
            # prefer a candidate with the same capitalisation pattern
            same = {c for c in cands if c[:1] == w[:1]}
            pick = same or cands
            if len(pick) == 1:
                c = next(iter(pick))
                if c != w:
                    self.fixed[(w, c)] += 1
                return c
            if w not in self.vocab:
                self.unresolved[w] += 1
            return w

        return re.sub(r"[A-Za-z][A-Za-z'\-]*", rep, s)


def parse_corrections_2026(path):
    """Corrections table printed at the front of the 2026 corrections PDF:
    'Hunt Choice  Hunt Name  Tag Required  Hunt Dates  Legal Elk  Unit/Area [Permits]'."""
    out = {}
    lines = open(path, encoding="utf-8").read().split("\n")
    for l in lines:
        m = re.match(r"^\s*(\d{4})\s{2,}(.+)$", l)
        if not m:
            continue
        toks = re.split(r"\s{2,}", m.group(2).strip())
        if m.group(1) == "2238":
            # 'Mallis  WF  Jan. 1-20, 2027 Antlerless  Elk Area 6010  20' (dates and legal share a gap)
            out["2238"] = {"permits": toks[-1]}
            continue
        if len(toks) == 5:
            out[m.group(1)] = {"dates": toks[2]}
    # continuation lines for 2413/2510 unit lists do not change units; only dates/permits are corrections.
    return out


def gmu_units(unit):
    """Unit ids as printed: GMU numbers, or the named area (Deer/Elk/Moose Area, Sheep Unit)."""
    if not unit:
        return []
    u = unit.replace("–", "-")
    out = []
    for m in re.finditer(r"GMUs?\s+((?:\d{3}[a-z]?(?:\s*,\s*|\s+and\s+|\s*&\s*|\s+))+)", u + " "):
        out += re.findall(r"\d{3}", m.group(1))
    for m in re.finditer(r"\b(Deer Area|Elk Area|Moose Area|Sheep Unit|Mountain Goat Unit)\s+([\dA-Za-z\-]+)", u):
        out.append(f"{m.group(1)} {m.group(2)}")
    if not out:
        m = re.search(r"\((\d-\d{1,2})\)", u)  # goat hunt area number, e.g. "Naches Pass (3-6)"
        if m:
            out.append(f"Mountain Goat Unit {m.group(1)}")
    seen = []
    for x in out:
        if x not in seen:
            seen.append(x)
    return seen


def method_of(group, tag, restrictions=None):
    t = (tag or "").strip()
    if group in ("sheep", "goat") and restrictions and "Any Legal Weapon" in restrictions:
        return "all", "Any Legal Weapon"
    if not t:
        return None, None
    parts = [p.strip() for p in re.split(r"[,;/]", t) if p.strip()]
    kinds = set()
    for p in parts:
        pl = p.lower()
        if pl in ("modern",) or re.fullmatch(r"[ew]f", pl):
            kinds.add("rifle")
        elif pl == "archery" or re.fullmatch(r"[ew]a", pl):
            kinds.add("archery")
        elif pl == "muzzleloader" or re.fullmatch(r"[ew]m", pl):
            kinds.add("muzzleloader")
        else:
            kinds.add("all")
    if len(kinds) == 1:
        return kinds.pop(), t
    return "all", t


def sex_of(group, legal, category):
    l = (legal or "").lower()
    c = (category or "").lower()
    if group == "goat":
        return "either"
    if group == "turkey":
        return "either"
    if group == "sheep":
        if "ewe" in l or "ewe" in c:
            return "female"
        if "ram" in l or "ram" in c:
            return "male"
        return None
    if group == "moose":
        if "antlered bull" in c:
            return "male"
        return None
    if "antlerless" in l:
        return None  # antlerless may include young males; legal animal kept in description
    if re.search(r"\bany (deer|elk)\b", l):
        return "either"
    if re.search(r"buck|bull|pt\.|point|spike", l):
        return "male"
    return None


def deer_species(name, legal):
    """whitetail only when the hunt is white-tailed-only: the hunt name says so, or the legal-deer column
    starts with 'White-tailed' / 'Any white-tailed'. Mixed hunts such as 'Any buck, White-tailed antlerless'
    stay in the general deer (mule-deer) file."""
    n = (name or "").lower()
    l = (legal or "").strip().lower()
    if "mule" in n or "mule" in l:
        return "mule-deer"
    if "white-tailed" in n or re.match(r"^(any )?white-tailed", l):
        return "whitetail"
    return "mule-deer"


def _norm(x):
    return re.sub(r"[^a-z0-9]", "", lig_key((x or "").lower().replace("–", "-")))


def same_hunt(a, b):
    """True when two pamphlet rows (consecutive years, same hunt code) describe the same hunt:
    same name, unit/area, legal animal / restrictions, category and tag."""
    if a is None or b is None or a.get("bad") or b.get("bad"):
        return False
    if not names_match(a.get("name"), b.get("name")):
        return False
    for k in ("unit", "legal", "restrictions", "tag"):
        if _norm(a.get(k)) != _norm(b.get(k)):
            return False
    ca, cb = _norm(a.get("category")).replace("continued", ""), _norm(b.get("category")).replace("continued", "")
    return ca == cb


def odds(drawn, applicants):
    if drawn is None or not applicants:
        return None
    return round(100.0 * drawn / applicants, 2)


def stats(quota=None, applicants=None, drawn=None):
    st = {}
    if quota is not None:
        st["quota"] = quota
    if applicants is not None:
        st["applicants"] = applicants
    if drawn is not None:
        st["drawn"] = drawn
    o = odds(drawn, applicants)
    if o is not None:
        st["oddsPct"] = o
        st["oddsComputed"] = True
    return st


# ---------------------------------------------------------------- main build

def load_pamphlets(raw):
    """Return {year: {code: interpreted row}} and the list of parse problems."""
    texts = {}
    for y in PAMPHLET:
        texts[y] = os.path.join(raw, "pdf", f"pamphlet_{y}.txt")
    out, problems = {}, []
    for y, p in texts.items():
        rows = pamphlet.parse(p, PAMPHLET_START.format(y=y))
        d = {}
        for r in rows:
            o = pamphlet.interpret(r)
            o["year"] = y
            if o["problems"]:
                problems.append((y, o["huntCode"], o["line"], o["problems"]))
                o["bad"] = True
            if o["huntCode"] in d:
                problems.append((y, o["huntCode"], o["line"], ["duplicate hunt code in pamphlet"]))
                continue
            d[o["huntCode"]] = o
        out[y] = d
    return out, problems


def apply_corrections(pam, raw):
    CORRECTIONS[2026] = parse_corrections_2026(os.path.join(raw, "pdf", "pamphlet_2026_corrections.txt"))
    applied = []
    for y, corr in CORRECTIONS.items():
        for code, c in corr.items():
            r = pam[y].get(code)
            if r is None:
                applied.append((y, code, "NOT FOUND"))
                continue
            for k, v in c.items():
                if k == "removed":
                    r["removed"] = True
                elif k == "permits":
                    r["permitsRaw"] = v
                    r["corrected"] = r.get("corrected", []) + [f"permits corrected to {v}"]
                elif k == "notes":
                    r["notes"] = v
                    r["corrected"] = r.get("corrected", []) + ["hunt note removed"]
                else:
                    r[k] = v
                    r["corrected"] = r.get("corrected", []) + [f"{k} corrected to '{v}'"]
            applied.append((y, code, c))
    return applied


def pamphlet_desc(p, fallback_name=None):
    name = fallback_name or p.get("name")
    bits = []
    if p.get("category"):
        cat = p["category"].strip()
        cat = cat[0] + cat[1:].lower() if cat.isupper() else cat
        bits.append(cat)
    detail = ", ".join(x for x in (p.get("legal"), p.get("restrictions"), p.get("unit")) if x)
    s = name
    if bits:
        s += f" — {bits[0]}"
    if detail:
        s += f" — {detail}"
    return s


def apps_note(p):
    a = p.get("appsRaw")
    if not a:
        return None
    m = re.match(r"^(\d+)\s?/\s?(\d+)(.*)$", a)
    lab = f"WDFW {p['year']} pamphlet column '{p.get('appsYear')} APPS/AVG POINTS'"
    if m:
        extra = m.group(3).strip()
        return f"{lab}: {m.group(1)} applications / {m.group(2)} average points" + (f" ({extra})" if extra else "")
    return f"{lab}: {a}"


def permit_note(p):
    raw = p.get("permitsRaw") or ""
    m = re.match(r"^(\d+)(\S*)$", raw)
    if m and m.group(2):
        return f"pamphlet permits column printed as '{raw}'"
    return None


def pamphlet_quota(p):
    m = re.match(r"^(\d+)", p.get("permitsRaw") or "")
    return int(m.group(1)) if m else None


def build(raw, repo):
    register_sources()
    pam, problems = load_pamphlets(raw)
    corrections = apply_corrections(pam, raw)

    # ligature fixer for the 2026 pamphlet text
    vocab_texts = []
    for y in (2020, 2021, 2022, 2023, 2024, 2025):
        vocab_texts.append(open(os.path.join(raw, "pdf", f"pamphlet_{y}.txt"), encoding="utf-8").read())
    harvest = {}
    for rep in REPORTS:
        for y in HARVEST_YEARS:
            p = os.path.join(raw, "harvestpages", f"{y}-{rep}.html")
            if not os.path.exists(p):
                continue
            if rep == "black-bear-spring" and y > 2021:
                continue
            harvest[(rep, y)] = parse_harvest(p, rep)
            vocab_texts += [h["name"] for h in harvest[(rep, y)]]
    fixer = LigatureFixer(vocab_texts)
    for code, p in pam[2026].items():
        for k in ("name", "unit", "legal", "dates", "restrictions", "category"):
            if p.get(k):
                p[k] = fixer.fix(p[k])

    pbi_rows = [r for r in pbi.decode(os.path.join(raw, "pbi", "special_hunt_2021.json")) if r["Hunt Choice"] != 9999]
    pbi_by_code = {str(r["Hunt Choice"]): r for r in pbi_rows}
    assert len(pbi_by_code) == len(pbi_rows), "duplicate PBI hunt choice"

    records = defaultdict(list)
    diag = Counter()
    mism = []
    used_pam = defaultdict(set)
    cross_2021 = []

    def species_for(group, name, legal=None):
        if group == "deer":
            return deer_species(name, legal)
        return {"elk": "elk", "moose": "moose", "sheep": "sheep", "goat": "goat", "bear": "bear", "turkey": "turkey"}[group]

    # ---- 2020-2025 from harvest reports (+ pamphlet of that year, + next pamphlet's apps)
    for (rep, y), rows in sorted(harvest.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        group = REPORTS[rep]
        src = harvest_source_id(rep, y)
        for h in rows:
            code = h["code"]
            notes = []
            if code.startswith("9") and code not in pbi_by_code and code not in pam.get(y, {}):
                # 2021 deer report lists 9xxx land-manager/area hunts (e.g. "Deer - WDFW Cowlitz Wildlife Area A")
                # that are not special-permit drawing hunts (absent from the drawing summary and pamphlet tables).
                diag[f"excluded_9xxx_{rep}_{y}"] += 1
                continue
            p = pam.get(y, {}).get(code)
            if p is not None and (p.get("bad") or not names_match(h["name"], p.get("name"))):
                if not p.get("bad"):
                    mism.append((y, code, h["name"], p.get("name")))
                    notes.append(f"hunt {code} in the WDFW {y} pamphlet is named '{p.get('name')}', so pamphlet details were not attached")
                else:
                    notes.append(f"WDFW {y} pamphlet row for hunt {code} could not be read reliably (PDF layout/overprint), so pamphlet details were not attached")
                diag["pamphlet_same_year_unmatched"] += 1
                p = None
            elif p is not None:
                used_pam[y].add(code)
            nxt = pam.get(y + 1, {}).get(code)
            if nxt is not None and (nxt.get("appsYear") != y or not same_hunt(p, nxt)):
                if nxt.get("appsYear") == y and p is not None and names_match(h["name"], nxt.get("name")):
                    diag["next_apps_dropped_hunt_changed"] += 1
                nxt = None
            pb = pbi_by_code.get(code) if y == 2021 else None
            if pb is not None and not names_match(h["name"], pb["Hunt Choice Name"]):
                mism.append((y, code, h["name"], "PBI:" + pb["Hunt Choice Name"]))
                pb = None

            legal = p.get("legal") if p else None
            category = p.get("category") if p else (pb["Hunt Name"] if pb else None)
            quota = h.get("quota")
            if pb is not None:
                quota = pb["Permit Quota"]
                if h.get("quota") is not None and h["quota"] != quota:
                    notes.append(f"2021 harvest report quota {h['quota']}")
            if quota is None and p is not None:
                quota = pamphlet_quota(p)
                if quota is not None:
                    notes.append(f"quota = permits in the WDFW {y} pamphlet (d-pamphlet-{y})")
            if p is not None:
                pn = permit_note(p)
                if pn:
                    notes.append(pn)
                if p.get("corrected"):
                    notes.append("; ".join(p["corrected"]) + f" per WDFW {y} pamphlet corrections")
            if pb is not None:
                notes.append(
                    f"WDFW 2021 drawing summary: category {pb['Hunt Name']}; average winner points {pb['Average Winner Points']}; "
                    f"selected as 1st/2nd/3rd/4th choice {pb['Selected as 1st Choice']}/{pb['Selected as 2nd Choice']}/"
                    f"{pb['Selected as 3rd Choice']}/{pb['Selected as 4th Choice']}; selected for another hunt {pb['selected for another hunt']}; "
                    f"not selected {pb['not selected']}")
                if h["applicants"] != pb["Total # of Applications"]:
                    notes.append(f"2021 harvest report (d-harvest-{rep}-2021) lists {h['applicants']} total applicants")
                if h["issued"] != pb["Permits Issued"]:
                    notes.append(f"2021 harvest report (d-harvest-{rep}-2021) lists {h['issued']} permits issued")
                cross_2021.append((group, code, h["applicants"], pb["Total # of Applications"], h["issued"], pb["Permits Issued"]))
            if nxt is not None:
                if apps_note(nxt):
                    notes.append(apps_note(nxt) + f" (d-pamphlet-{y + 1})")
            if y == 2024:
                notes.append("2024 draw: vendor software mis-assigned hunt choices; WDFW re-allocated permits and added permits where biologically feasible (d-director-2024)")

            if code in ("1999", "2999"):
                notes.append("Multi-season tag drawing (separate application sold Dec. 1-Mar. 31; results in April). Each WDFW pamphlet "
                             "2020-2026 states 8,500 deer and 1,000 elk multi-season tags are available for the drawing")
            elif code in ("1998", "2998"):
                notes.append("Hunter education instructor multi-season incentive permit")
            units = gmu_units(p.get("unit")) if p else []
            if not units:
                if group == "bear" and h.get("area"):
                    units = gmu_units(h["area"])
                elif group in ("sheep", "goat"):
                    units = gmu_units(h["name"])
            desc = pamphlet_desc(p, h["name"]) if p else (f"{h['name']} — {category}" if category else h["name"])
            if group == "bear" and h.get("area"):
                desc = f"{h['name']} — Spring black bear special permit — {h['area']}"
            sp = species_for(group, h["name"], legal)
            rec = {"species": sp, "year": y, "huntCode": code, "units": units, "description": desc}
            m_, ml = method_of(group, p.get("tag") if p else None, p.get("restrictions") if p else None)
            if m_:
                rec["method"] = m_
                rec["methodLabel"] = ml
            sx = sex_of(group, legal or (p.get("restrictions") if p else None), category)
            if sx:
                rec["sex"] = sx
            if p and p.get("dates"):
                rec["seasonDates"] = p["dates"]
            rec["choice"] = "all"
            if pb is not None:
                rec["total"] = stats(quota, pb["Total # of Applications"], pb["Permits Issued"])
            else:
                rec["total"] = stats(quota, h["applicants"], h["issued"])
            if group == "deer" and sp == "mule-deer":
                notes.insert(0, DEER_NOTE)
            rec["note"] = "; ".join(notes) if notes else None
            if rec["note"] is None:
                del rec["note"]
            rec["sourceId"] = "d-pbi-2021" if pb is not None else src
            records[sp].append(rec)
            diag[f"harvest_rows_{y}"] += 1

    # ---- 2021 PBI rows without a harvest-report row (multi-season tags, fall turkey, ...)
    harvest_codes_2021 = {h["code"] for (rep, y), rows in harvest.items() if y == 2021 for h in rows}
    for code, pb in pbi_by_code.items():
        if code in harvest_codes_2021:
            continue
        grp = {"Deer": "deer", "Elk": "elk", "Moose": "moose", "Sheep": "sheep", "Mountain Goat": "goat",
               "Black Bear": "bear", "Turkey": "turkey"}[pb["Species"]]
        sp = species_for(grp, pb["Hunt Choice Name"])
        notes = [f"From WDFW's 2021 drawing summary only (not in the 2021 harvest report). Counts are applications "
                 f"('Total # of Applications'), not individual applicants; average winner points {pb['Average Winner Points']}; "
                 f"selected as 1st/2nd/3rd/4th choice {pb['Selected as 1st Choice']}/{pb['Selected as 2nd Choice']}/"
                 f"{pb['Selected as 3rd Choice']}/{pb['Selected as 4th Choice']}"]
        if grp == "deer" and sp == "mule-deer":
            notes.insert(0, DEER_NOTE)
        p21 = pam.get(2021, {}).get(code)
        if p21 is not None and (p21.get("bad") or not names_match(pb["Hunt Choice Name"], p21.get("name"))):
            p21 = None
        if p21 is not None:
            used_pam[2021].add(code)
            if apps_note(pam.get(2022, {}).get(code) or {}) and pam[2022][code].get("appsYear") == 2021 \
                    and same_hunt(p21, pam[2022][code]):
                notes.append(apps_note(pam[2022][code]) + " (d-pamphlet-2022)")
        rec = {"species": sp, "year": 2021, "huntCode": code,
               "units": gmu_units(p21.get("unit")) if p21 else [],
               "description": pamphlet_desc(p21, pb["Hunt Choice Name"]) if p21 else f"{pb['Hunt Choice Name']} — {pb['Hunt Name']}",
               "choice": "all",
               "total": stats(pb["Permit Quota"], pb["Total # of Applications"], pb["Permits Issued"]),
               "note": "; ".join(notes), "sourceId": "d-pbi-2021"}
        if grp == "turkey":
            rec["sex"] = "either"
        if p21 is not None and p21.get("dates"):
            rec["seasonDates"] = p21["dates"]
        rec = {k: rec[k] for k in ("species", "year", "huntCode", "units", "description", "sex", "seasonDates",
                                    "choice", "total", "note", "sourceId") if k in rec}
        records[sp].append(rec)
        diag["pbi_only_rows_2021"] += 1

    # ---- pamphlet-only rows: 2022-2025 hunts printed in the pamphlet but absent from the harvest
    #      report (and all turkey hunts), and every 2026 hunt (2026 draw: permits only).
    for y in sorted(pam):
        for code, p in sorted(pam[y].items()):
            if code in used_pam[y]:
                continue
            group = p["group"]
            if p.get("removed"):
                diag["pamphlet_removed_by_errata"] += 1
                continue
            if y < 2026 and group != "turkey":
                # harvest report exists for this year; only add if the hunt code is not in it at all
                rep = {v: k for k, v in REPORTS.items()}[group]
                hcodes = {h["code"] for h in harvest.get((rep, y), [])}
                if code in hcodes:
                    continue  # code present but name/parse mismatch -> harvest row already written
            if p.get("bad"):
                diag["pamphlet_bad_rows_skipped"] += 1
                continue
            quota = pamphlet_quota(p)
            notes = []
            if y < 2026 and group != "turkey":
                notes.append(f"Hunt printed in the WDFW {y} pamphlet but not listed in WDFW's {y} harvest report; applicants and permits issued not published")
            if y == 2026:
                notes.append("2026 draw: WDFW has not published applicant or permits-issued counts for the 2026 drawing; quota = 2026 pamphlet permits")
            pn = permit_note(p)
            if pn:
                notes.append(pn)
            if p.get("corrected"):
                notes.append("; ".join(p["corrected"]) + f" per WDFW {y} pamphlet corrections")
            if p.get("layoutIssue"):
                notes.append(p["layoutIssue"])
            an = apps_note(p)
            if an:
                notes.append(an)
            nxt = pam.get(y + 1, {}).get(code)
            if nxt is not None and nxt.get("appsYear") == y and same_hunt(p, nxt):
                if apps_note(nxt):
                    notes.append(apps_note(nxt) + f" (d-pamphlet-{y + 1})")
            if group == "deer" and p.get("tag") is None and p.get("name") in (p.get("notes"),):
                pass
            sp = species_for(group, p.get("name"), p.get("legal"))
            if group == "deer" and sp == "mule-deer":
                notes.insert(0, DEER_NOTE)
            rec = {"species": sp, "year": y, "huntCode": code, "units": gmu_units(p.get("unit")) or (gmu_units(p.get("name")) if group == "goat" else []),
                   "description": pamphlet_desc(p)}
            m_, ml = method_of(group, p.get("tag"), p.get("restrictions"))
            if m_:
                rec["method"] = m_
                rec["methodLabel"] = ml
            sx = sex_of(group, p.get("legal") or p.get("restrictions"), p.get("category"))
            if sx:
                rec["sex"] = sx
            if p.get("dates"):
                rec["seasonDates"] = p["dates"]
            rec["choice"] = "all"
            rec["total"] = stats(quota)
            if not rec["total"]:
                diag["pamphlet_no_quota_skipped"] += 1
                continue
            rec["note"] = "; ".join(notes)
            rec["sourceId"] = f"d-pamphlet-{y}"
            if y == 2026 and p.get("corrected"):
                rec["sourceId"] = "d-pamphlet-2026-corrections"
            records[sp].append(rec)
            diag[f"pamphlet_only_rows_{y}"] += 1

    # ---- write
    outdir = os.path.join(repo, "src", "data", "agency", "washington", "draw")
    os.makedirs(outdir, exist_ok=True)
    counts = {}
    for sp, rows in records.items():
        rows.sort(key=lambda r: (r["year"], r["huntCode"]))
        seen = set()
        for r in rows:
            k = (r["year"], r["huntCode"], r["choice"])
            assert k not in seen, k
            seen.add(k)
        with open(os.path.join(outdir, f"{sp}.json"), "w") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
            f.write("\n")
        counts[sp] = Counter(r["year"] for r in rows)
    json.dump(SOURCES, open(os.path.join(raw, "draw_sources.json"), "w"), indent=1)
    json.dump({"counts": {k: dict(v) for k, v in counts.items()}}, open(os.path.join(raw, "draw_counts.json"), "w"), indent=1)

    print("rows per species/year:")
    for sp in sorted(counts):
        print(" ", sp, dict(sorted(counts[sp].items())), sum(counts[sp].values()))
    print("diag:", dict(diag))
    print("pamphlet parse problems:", len(problems))
    for p_ in problems:
        print("   ", p_)
    print("corrections applied:", corrections)
    print("name mismatches (pamphlet/PBI not merged):", len(mism))
    for m_ in mism[:80]:
        print("   ", m_)
    chk = Counter()
    for sp_, rows_ in records.items():
        for r_ in rows_:
            if r_["year"] == 2021 and r_.get("sourceId") == "d-pbi-2021":
                m_ = re.search(r"'2021 APPS/AVG POINTS': (\d+) applications", r_.get("note", ""))
                if m_:
                    chk["equal" if int(m_.group(1)) == r_["total"].get("applicants") else "differ"] += 1
    print("2021 check: next-pamphlet APPS attached vs drawing-summary applications:", dict(chk))
    print("ligature fixes:", dict(fixer.fixed))
    print("ligature unresolved:", dict(fixer.unresolved))
    d = [c for c in cross_2021 if c[2] != c[3] or c[4] != c[5]]
    print(f"2021 harvest vs PBI: {len(cross_2021)} hunts compared; applicants differ in {sum(1 for c in cross_2021 if c[2] != c[3])}, "
          f"issued differ in {sum(1 for c in cross_2021 if c[4] != c[5])}")
    for c in d[:15]:
        print("   ", c)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
