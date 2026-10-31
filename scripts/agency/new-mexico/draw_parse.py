#!/usr/bin/env python3
"""Parse New Mexico (NMDOW, formerly NMDGF) drawing-odds reports into
src/data/agency/new-mexico/draw/<species>.json.

Usage: draw_parse.py <raw_dir> <repo_root>

Inputs (downloaded by draw_download.py):
  <year>-complete.xlsx     Big-Game Drawing Odds Complete Report (2022-2026)
  <year>-bear-turkey.xlsx  Bear and Turkey Drawing Odds Report (2022, 2024-2026)
  2023-bear-turkey.pdf     2023 Bear and Turkey Drawing Odds Report (PDF only)

Every number is copied from the report. Derived values:
  * oddsPct = drawn / applicants * 100 (oddsComputed = true)
  * total.drawn for choice=first in 2024-2026 big game = resident + nonresident
    + outfitter first-choice drawn (the report gives per-pool choice counts only)
  * choice=all drawn = printed total drawn minus printed 4th-choice drawn (4th-choice
    awards go to applicants who did not apply for the hunt as a 1st-3rd choice)
  * 2022 all-choice applicants = 1st + 2nd + 3rd (the 2022 report has no T column)
Nothing is estimated. Cross-checks are printed; any failure aborts.
"""
import json, os, re, subprocess, sys
import openpyxl

SPECIES_PREFIX = {"ANT": "pronghorn", "BHS": "sheep", "DER": None, "ELK": "elk",
                  "BER": "bear", "TUR": "turkey"}
SKIP_PREFIX = {"BBY", "IBX", "JAV", "ORX"}  # Barbary sheep, ibex, javelina, oryx: out of scope
WHITETAIL_BAGS = {"FAWTD", "ESWTD"}

BAG_LABEL = {
    "MB": "MB (mature bull/buck)", "A": "A (antlerless)", "ES": "ES (either sex)",
    "MB/A": "MB/A (mature bull or antlerless)",
    "APRE/6": "APRE/6 (antler-point-restricted elk, 6+ points on at least one antler)",
    "APRE/6/A": "APRE/6/A (antler-point-restricted elk or antlerless)",
    "FAD": "FAD (fork-antlered deer, white-tailed or mule deer)",
    "FAMD": "FAMD (fork-antlered mule deer)", "FAWTD": "FAWTD (fork-antlered white-tailed deer)",
    "ESWTD": "ESWTD (either-sex white-tailed deer)", "F-IM": "F-IM (female or immature pronghorn)",
    "RAM": "RAM", "EWE": "EWE", "1B": "1B (one bear)", "VB": "VB (visible beard)",
}
BAG_SEX = {"MB": "male", "FAD": "male", "FAMD": "male", "FAWTD": "male", "APRE/6": "male",
           "RAM": "male", "EWE": "female", "ES": "either", "ESWTD": "either"}
WEAPON = {"1": ("all", "Any legal sporting arm"),
          "2": ("archery", "Bow only"),
          "3": ("muzzleloader", "Muzzleloader, crossbow or bow only")}

# Column layouts (0-based). pre: lic, bag, choice cols per pool (1st,2nd,3rd[,T]).
# post: hunt col, pool drawn by choice (1st..4th,T) or pool totals (R,NR,O,T).
LAYOUTS = {
    "c2022": dict(hc2=17, lic=3, bag=2, pre={"tot": (4, 5, 6, None), "res": (7, 8, 9, None), "nr": (10, 11, 12, None), "out": (13, 14, 15, None)},
                  lic2=18, post_choice={"tot": 19, "res": 24, "nr": 29, "out": 34}, pool=None, pct=39),
    "c2023": dict(hc2=21, lic=3, bag=2, pre={"tot": (4, 5, 6, 7), "res": (8, 9, 10, 11), "nr": (12, 13, 14, 15), "out": (16, 17, 18, 19)},
                  lic2=22, post_choice={"tot": 23, "res": 28, "nr": 33, "out": 38}, pool=None, pct=43),
    "c2024": dict(hc2=21, lic=3, bag=2, pre={"tot": (4, 5, 6, 7), "res": (8, 9, 10, 11), "nr": (12, 13, 14, 15), "out": (16, 17, 18, 19)},
                  lic2=23, post_choice={"res": 28, "nr": 33, "out": 38}, pool=24, pct=43),
    "c2026": dict(hc2=20, lic=2, bag=21, pre={"tot": (3, 4, 5, 6), "res": (7, 8, 9, 10), "nr": (11, 12, 13, 14), "out": (15, 16, 17, 18)},
                  lic2=22, post_choice={"res": 27, "nr": 32, "out": 37}, pool=23, pct=42),
    "bt2022": dict(hc2=16, lic=2, bag=17, pre={"tot": (3, 4, 5, None), "res": (6, 7, 8, None), "nr": (9, 10, 11, None), "out": (12, 13, 14, None)},
                   lic2=18, post_choice={"tot": 19, "res": 24, "nr": 29, "out": 34}, pool=None, pct=39),
    "bt2024": dict(hc2=20, lic=2, bag=None, pre={"tot": (3, 4, 5, 6), "res": (7, 8, 9, 10), "nr": (11, 12, 13, 14), "out": (15, 16, 17, 18)},
                   lic2=21, post_choice={}, pool=22, pct=26),
    "bt2026": dict(hc2=20, lic=2, bag=21, pre={"tot": (3, 4, 5, 6), "res": (7, 8, 9, 10), "nr": (11, 12, 13, 14), "out": (15, 16, 17, 18)},
                   lic2=22, post_choice={}, pool=23, pct=27),
}
FILES = [
    (2022, "2022-complete.xlsx", "c2022", "d-nm-odds-2022"),
    (2023, "2023-complete.xlsx", "c2023", "d-nm-odds-2023"),
    (2024, "2024-complete.xlsx", "c2024", "d-nm-odds-2024"),
    (2025, "2025-complete.xlsx", "c2024", "d-nm-odds-2025"),
    (2026, "2026-complete.xlsx", "c2026", "d-nm-odds-2026"),
    (2022, "2022-bear-turkey.xlsx", "bt2022", "d-nm-bt-2022"),
    (2024, "2024-bear-turkey.xlsx", "bt2024", "d-nm-bt-2024"),
    (2025, "2025-bear-turkey.xlsx", "bt2024", "d-nm-bt-2025"),
    (2026, "2026-bear-turkey.xlsx", "bt2026", "d-nm-bt-2026"),
]
HC_RE = re.compile(r"^[A-Z]{3}-\d-\d{3}$")
FAIL = []
ANOMALY = {}


def fail(msg):
    FAIL.append(msg)


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else v
    s = str(v).strip().replace(",", "")
    if s == "":
        return None
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d*", s):
        return float(s)
    print(f"  WARN non-numeric cell {s!r} -> null")
    return None


def units_from(desc):
    d = re.sub(r"\([^)]*\)", "", desc)  # drop parentheticals, e.g. "57 (excluding Sugarite Canyon S.P.), 58"
    m = re.match(r"\s*(?:Units?|GMUs?)\s*:?\s*(\d{1,2}[A-Z]?\b(?:\s*(?:,|/|and|&)\s*\d{1,2}[A-Z]?\b)*)", d)
    if not m:
        return []
    return re.findall(r"\d{1,2}[A-Z]?\b", m.group(1))


def odds(drawn, apps):
    if drawn is None or apps is None or apps == 0:
        return None
    return round(100.0 * drawn / apps, 2)


def stats(apps, drawn, quota=None):
    d = {}
    if quota is not None:
        d["quota"] = quota
    d["applicants"] = apps
    d["drawn"] = drawn
    o = odds(drawn, apps)
    d["oddsPct"] = o
    if o is not None:
        d["oddsComputed"] = True
    return d


def parse_xlsx(path, layout_key, year):
    L = LAYOUTS[layout_key]
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    out = []
    section = []  # raw rows since the last "Totals:" row (2022 reports print per-species totals)
    tot_cols = sorted({c for cols in L["pre"].values() for c in cols if c is not None} | set(range(L["lic2"], L["lic2"] + 21)))
    for r in ws.iter_rows(values_only=True):
        r = list(r) + [None] * 60
        if any(isinstance(c, str) and c.strip() == "Totals:" for c in r[:20]):
            pref = section[0][0][:3] if section else "?"
            diffs = [(c, sum(num(x[c]) or 0 for x in section), num(r[c])) for c in tot_cols
                     if num(r[c]) is not None and sum(num(x[c]) or 0 for x in section) != num(r[c])]
            print(f"  totals check {year} {pref}: {len(section)} hunts, {len(tot_cols)} columns, "
                  + ("all match" if not diffs else f"MISMATCH {diffs}"))
            # Non-fatal: a 1-unit difference in the agency's own Totals row (2022 elk resident
            # drawn, 19,853 summed vs 19,854 printed) is reported in coverage notes.
            if diffs and pref not in SKIP_PREFIX and max(abs(a - b) for _, a, b in diffs) > 1:
                fail(f"{path}: {pref} section totals mismatch {diffs}")
            section = []
            continue
        hc = r[0].strip() if isinstance(r[0], str) else None
        if not hc or not HC_RE.match(hc):
            continue
        section.append(r)
        if (r[L["hc2"]] or "").strip() != hc:
            fail(f"{path}: {hc} right-side hunt code {r[L['hc2']]!r}")
        if num(r[L["lic"]]) != num(r[L["lic2"]]):
            fail(f"{path}: {hc} licenses left {r[L['lic']]} != right {r[L['lic2']]}")
        rec = dict(year=year, huntCode=hc, desc=str(r[1]).strip() if r[1] is not None else "",
                   bag=(str(r[L["bag"]]).strip() if L["bag"] is not None and r[L["bag"]] is not None else None),
                   lic=num(r[L["lic"]]), pre={}, choice={}, pool=None, pct=None)
        for k, cols in L["pre"].items():
            vals = [num(r[c]) if c is not None else None for c in cols]
            rec["pre"][k] = vals  # 1st,2nd,3rd,T
        for k, c in L["post_choice"].items():
            rec["choice"][k] = [num(r[c + i]) for i in range(5)]  # 1st,2nd,3rd,4th,T
        if L["pool"] is not None:
            rec["pool"] = [num(r[L["pool"] + i]) for i in range(4)]  # R,NR,O,T
        rec["pct"] = [num(r[L["pct"] + i]) for i in range(4)]
        out.append(rec)
    return out


def parse_bt2023_pdf(path):
    """2023 bear/turkey odds report exists only as PDF. Hunt-code lines carry all
    numbers; description text may wrap onto the lines above."""
    txt = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, check=True).stdout
    lines = txt.splitlines()
    out = []
    pending = []
    for ln in lines:
        m = re.match(r"^((?:BER|TUR)-\d-\d{3})\s+(.*?)\s+((?:\d+(?:\.\d+)?\s+){26}\d+(?:\.\d+)?)\s*$", ln)
        if m:
            hc, frag, nums = m.group(1), m.group(2), [num(x) for x in m.group(3).split()]
            desc = " ".join(pending + ([frag] if frag else [])).strip()
            pending = []
            # nums: permits, tot1,2,3,T, res1,2,3,T, nr1,2,3,T, out1,2,3,T, codeTail, permits, RES, NR, OUT, T, R%, NR%, O%, T%
            if str(nums[17]) != hc[-3:].lstrip("0") and nums[17] != int(hc[-3:]):
                fail(f"2023 pdf {hc}: code tail {nums[17]}")
            rec = dict(year=2023, huntCode=hc, desc=desc, bag=None, lic=nums[0], pre={
                "tot": nums[1:5], "res": nums[5:9], "nr": nums[9:13], "out": nums[13:17]},
                choice={}, pool=nums[19:23], pct=nums[23:27], lic2=nums[18])
            if rec["lic"] != rec["lic2"]:
                fail(f"2023 pdf {hc}: permits mismatch")
            out.append(rec)
            continue
        s = ln.strip()
        if not s or re.fullmatch(r"(BER|TUR)-\d-", s) or "Drawing Odds Report" in s or s.startswith("Hunt Code") or re.match(r"^(BEAR|TURKEY)\b", s):
            if not s:
                pending = []
            continue
        # wrapped description fragment: text in the description column, then maybe trailing "BER-1-"
        frag = re.sub(r"\s+(BER|TUR)-\d-\s*$", "", ln).strip()
        if frag:
            pending.append(frag)
    return out


def species_of(rec):
    p = rec["huntCode"][:3]
    if p in SKIP_PREFIX:
        return None
    if p == "DER":
        return "whitetail" if rec["bag"] in WHITETAIL_BAGS else "mule-deer"
    if p not in SPECIES_PREFIX:
        fail(f"unknown prefix {rec['huntCode']}")
        return None
    return SPECIES_PREFIX[p]


def check(rec, src):
    hc, y = rec["huntCode"], rec["year"]
    pre = rec["pre"]
    for i in range(4):
        parts = [pre[k][i] for k in ("res", "nr", "out")]
        if pre["tot"][i] is not None and None not in parts and sum(parts) != pre["tot"][i]:
            fail(f"{y} {hc}: pre-draw choice {i+1} total {pre['tot'][i]} != pools {parts}")
    for k in ("tot", "res", "nr", "out"):
        v = pre[k]
        if v[3] is not None and None not in v[:3] and sum(v[:3]) != v[3]:
            fail(f"{y} {hc}: pre-draw {k} T {v[3]} != 1st+2nd+3rd {v[:3]}")
    ch = rec["choice"]
    for k, v in ch.items():
        if None not in v and sum(v[:4]) != v[4]:
            fail(f"{y} {hc}: post-draw {k} T {v[4]} != sum of choices {v[:4]}")
    if "tot" in ch and all(k in ch for k in ("res", "nr", "out")):
        for i in range(5):
            if ch["tot"][i] != ch["res"][i] + ch["nr"][i] + ch["out"][i]:
                fail(f"{y} {hc}: post-draw total choice {i+1} != pools")
    if rec["pool"] is not None:
        R, NR, O, T = rec["pool"]
        per_choice_ok = all(k in ch for k in ("res", "nr", "out")) and ch["res"][4] + ch["nr"][4] + ch["out"][4] == T
        bad = R + NR + O != T or any(k in ch and ch[k][4] != v for k, v in zip(("res", "nr", "out"), (R, NR, O)))
        if bad and per_choice_ok and pool_distribution_consistent(dict(rec, pool=[ch["res"][4], ch["nr"][4], ch["out"][4], T])):
            ANOMALY[(y, hc)] = (f"Agency report prints pool totals R/NR/O = {R}/{NR}/{O} (total {T}), which do not reconcile; "
                                f"pool drawn counts here are taken from the report's per-pool by-choice blocks "
                                f"({ch['res'][4]}/{ch['nr'][4]}/{ch['out'][4]}), which match the published distribution %.")
            rec["pool"] = [ch["res"][4], ch["nr"][4], ch["out"][4], T]
        elif bad:
            fail(f"{y} {hc}: pool drawn {rec['pool']} inconsistent with per-choice blocks")


def drawn_by_pool(rec):
    """-> dict pool -> dict(first, c123, fourth, T)
    first = drawn on 1st choice; c123 = drawn on 1st-3rd choice (T minus 4th-choice awards, which go
    to applicants who did not list this hunt); T = drawn total as printed. None = not published."""
    ch = rec["choice"]
    res = {}
    for k in ("res", "nr", "out", "tot"):
        if k in ch:
            v = ch[k]
            res[k] = dict(first=v[0], fourth=v[3], T=v[4],
                          c123=(v[4] - v[3]) if v[3] is not None and v[4] is not None else None)
    if rec["pool"] is not None:
        for k, v in zip(("res", "nr", "out", "tot"), rec["pool"]):
            if k not in res:
                # bear/turkey 2023-2026: drawn by pool only; these draws have no 4th choice
                res[k] = dict(first=None, fourth=None, T=v, c123=v)
    if "tot" not in ch and all(k in ch for k in ("res", "nr", "out")):
        # 2024-2026 big game: total by choice not printed; sum the three published pool blocks
        res["tot"] = dict(first=sum(ch[k][0] for k in ("res", "nr", "out")),
                          fourth=sum(ch[k][3] for k in ("res", "nr", "out")),
                          T=rec["pool"][3])
        res["tot"]["c123"] = res["tot"]["T"] - res["tot"]["fourth"]
    return res


def pool_distribution_consistent(rec):
    """2023 PDF turkey section: RES/NR/OUT columns do not reconcile with R%/NR%/O%."""
    if rec["pool"] is None or rec["pct"] is None:
        return True
    R, NR, O, T = rec["pool"]
    rp, np_, op = rec["pct"][:3]
    # the distribution % is relative to licenses available (or to drawn total when all were drawn)
    for den in (rec["lic"], T):
        if den and all(p is None or abs(100.0 * v / den - p) <= 1.0 for v, p in ((R, rp), (NR, np_), (O, op))):
            return True
    return not T


def build(rec, src, sp):
    hc = rec["huntCode"]
    digit = hc[4]
    method, mlabel = WEAPON.get(digit, (None, None))
    if method is None:
        fail(f"{hc}: unknown weapon digit")
    pre = rec["pre"]
    dp = drawn_by_pool(rec)
    pool_ok = pool_distribution_consistent(rec)
    # 2023 turkey (PDF): most RES/NR/OUT rows contradict the published R%/NR%/O% (e.g. TUR-1-105, a
    # resident-only WMA hunt, shows 6/6/3), so the whole turkey section's pool columns are treated
    # as unreliable, including rows that happen to reconcile.
    if src == "d-nm-bt-2023" and hc.startswith("TUR"):
        pool_ok = False
    base = dict(species=sp, year=rec["year"], huntCode=hc, units=units_from(rec["desc"]),
                description=rec["desc"] or hc, method=method, methodLabel=mlabel)
    if rec["bag"] in BAG_SEX:
        base["sex"] = BAG_SEX[rec["bag"]]
    notes_common = []
    if rec["bag"]:
        notes_common.append(f"Bag: {BAG_LABEL.get(rec['bag'], rec['bag'])}.")
    if sp == "mule-deer" and rec["bag"] in ("FAD", "A", "ES"):
        notes_common.append("NM deer hunt not restricted to mule deer (white-tailed deer also legal).")
    rows = []
    for choice in ("first", "all"):
        idx = 0 if choice == "first" else 3
        def apps(k):
            v = pre[k]
            if choice == "first":
                return v[0]
            if v[3] is not None:
                return v[3]
            if None in v[:3]:
                return None
            return sum(v[:3])  # 2022: no T column printed
        def drawn(k):
            if not pool_ok and k != "tot":
                return None
            t = dp.get(k)
            if t is None:
                return None
            return t["first"] if choice == "first" else t["c123"]
        r = dict(base)
        r["choice"] = choice
        r["resident"] = stats(apps("res"), drawn("res"))
        r["nonresident"] = stats(apps("nr"), drawn("nr"))
        r["total"] = stats(apps("tot"), drawn("tot"), quota=rec["lic"])
        notes = list(notes_common)
        oa, od = apps("out"), drawn("out")
        notes.append(f"Outfitter pool ({'1st-choice' if choice == 'first' else 'all-choice'} applicants {oa if oa is not None else 'n/a'}, drawn {od if od is not None else 'not published'}).")
        if choice == "first" and dp.get("tot", {}).get("first") is None:
            notes.append("Drawn-by-choice counts are not published in this report; only all-choice drawn counts are available.")
        if choice == "all":
            t = dp.get("tot", {})
            if t.get("fourth"):
                notes.append(f"Drawn counts are 1st-3rd choice only; NMDOW also awarded {t['fourth']} license(s) in this hunt to 4th-choice "
                             f"(any-hunt quadrant) applicants, for a printed total of {t['T']} drawn.")
            if rec["year"] == 2022:
                notes.append("All-choice applicants = 1st + 2nd + 3rd choice (2022 report prints no total column).")
        if (rec["year"], hc) in ANOMALY:
            notes.append(ANOMALY[(rec["year"], hc)])
        if not pool_ok:
            pct = rec["pct"]
            if src == "d-nm-bt-2023" and hc.startswith("TUR"):
                notes.append("Pool-level drawn counts omitted: in the 2023 turkey section of this PDF the RES/NR/OUT drawn columns "
                             "contradict the published distribution % for most hunts (e.g. TUR-1-105, resident-only, prints 6/6/3 with R% 100), "
                             f"so none are used. Published distribution for this hunt: R% {pct[0]}, NR% {pct[1]}, O% {pct[2]}.")
            else:
                notes.append(f"Pool-level drawn counts omitted: the published RES/NR/OUT columns ({rec['pool'][0]}/{rec['pool'][1]}/{rec['pool'][2]}) do not reconcile with the published distribution R% {pct[0]}, NR% {pct[1]}, O% {pct[2]}.")
        r["note"] = " ".join(notes)
        r["sourceId"] = src
        rows.append(r)
    return rows


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    outdir = os.path.join(repo, "src/data/agency/new-mexico/draw")
    os.makedirs(outdir, exist_ok=True)
    by_sp = {}
    all_recs = []
    for year, fname, lay, src in FILES:
        recs = parse_xlsx(os.path.join(raw, fname), lay, year)
        print(f"{fname}: {len(recs)} hunt rows")
        all_recs.append((src, fname, recs))
    recs = parse_bt2023_pdf(os.path.join(raw, "2023-bear-turkey.pdf"))
    print(f"2023-bear-turkey.pdf: {len(recs)} hunt rows")
    all_recs.append(("d-nm-bt-2023", "2023-bear-turkey.pdf", recs))

    # statewide total cross-check (2022 reports print a Totals row)
    for src, fname, recs in all_recs:
        for rec in recs:
            sp = species_of(rec)
            if sp:
                check(rec, src)
                by_sp.setdefault(sp, []).extend(build(rec, src, sp))
        if not all(pool_distribution_consistent(r) for r in recs if species_of(r)):
            bad = [r["huntCode"] for r in recs if species_of(r) and not pool_distribution_consistent(r)]
            print(f"  NOTE {fname}: pool drawn columns inconsistent with distribution % for {bad}")
    if FAIL:
        print("\n".join("FAIL " + f for f in FAIL))
        sys.exit(1)
    for sp, rows in sorted(by_sp.items()):
        rows.sort(key=lambda r: (r["year"], r["huntCode"], r["choice"] != "first"))
        p = os.path.join(outdir, f"{sp}.json")
        with open(p, "w") as fh:
            json.dump(rows, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
        yrs = sorted({r["year"] for r in rows})
        print(f"wrote {sp}.json rows={len(rows)} years={yrs} bytes={os.path.getsize(p)}")


if __name__ == "__main__":
    main()
