#!/usr/bin/env python3
"""Build src/data/agency/colorado/draw/<species>.json from CPW primary-draw recap PDFs.

Usage:
  python -I scripts/agency/colorado/draw_build.py <raw_dir> <repo_root> [--years 2022-2026]

<raw_dir> is the folder written by draw_download.py (PDFs + manifest.json).
Writes draw/<species>.json and <raw_dir>/build_report.json (cross-checks, sources used).

Field mapping (all counts are first-choice applications in CPW's primary draw):
  resident / nonresident = CPW "Adult Res" / "Adult NonRes" columns.
      applicants = Pre-Draw "Total Choice 1"; drawn = Post-Draw Successful "Total Choice 1";
      oddsPct = drawn / applicants (computed, oddsComputed = true);
      minPoints = CPW "Drawn Out At" for that adult column when it is a point level;
      quota = hunt-level Res / NonRes pre-draw quota when CPW publishes a number
              (moose, sheep, goat); otherwise CPW prints "Determined by Draw" -> null.
  total = adult + youth, resident + nonresident (CPW "General Apps"): quota = "Total
      Quota Amount"; applicants = published "Total Choice 1 General Apps"; drawn = sum of
      the four published first-choice successful columns.
  byPoints = CPW first-choice point table, adult columns. For moose, Rocky Mountain
      bighorn and mountain goat CPW lists (preference points, weighted points); points =
      preference + weighted (see note). Desert bighorn is a random draw: no byPoints.
  Youth and landowner (LPP) first-choice numbers, all-choice drawn counts and the
  published "Drawn Out At" text are kept in `note`.
"""
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from draw_parse_recap import parse_recap  # noqa: E402

REPORTS = {  # source key prefix -> output species
    "elk": "elk", "deer": None, "pronghorn": "pronghorn", "moose": "moose", "bear": "bear",
    "rmsheep": "sheep", "dsheep": "sheep", "goat": "goat", "sturkey": "turkey", "fturkey": "turkey",
}
SPECIES_LETTER = {"E": "elk", "D": "deer", "A": "pronghorn", "M": "moose", "B": "black bear",
                  "S": "Rocky Mountain bighorn sheep", "C": "desert bighorn sheep",
                  "G": "mountain goat", "T": "turkey"}
SEX = {"M": ("male", "male"), "F": ("female", "female"), "E": ("either", "either sex")}
METHOD = {"A": ("archery", "Archery"), "M": ("muzzleloader", "Muzzleloader"),
          "R": ("rifle", "Rifle and associated methods"), "X": ("all", "Season choice")}
SEASON = {"O": "season {n}", "P": "private-land-only hunt {n}", "E": "early season {n}",
          "L": "late season {n}", "K": "youth-only hunt {n}", "S": "special/split season {n}",
          "U": "unlimited season {n}", "V": "nonresident-only hunt {n}", "W": "Ranching for Wildlife hunt {n}",
          "J": "Ranching for Wildlife hunt {n}",
          "G": "guaranteed-license hunt {n} (licenses guaranteed from 2025 to hunters who returned fire-affected 2025 licenses)"}
REPORT_LABEL = {"elk": "Elk", "deer": "Deer", "pronghorn": "Pronghorn", "moose": "Moose", "bear": "Bear",
                "rmsheep": "Rocky Mountain Bighorn Sheep", "dsheep": "Desert Bighorn Sheep",
                "goat": "Mountain Goat", "sturkey": "Spring Turkey", "fturkey": "Fall Turkey"}
WEIGHTED = {"moose", "rmsheep", "goat"}
WT_BROCHURE = {2022: "wb-bg2022", 2023: "wb-bg2023", 2024: "wb-bg2024", 2025: "wb-bg2025", 2026: "brochure-biggame"}
RETRIEVED = "2026-10-31"
PUBLISHER = "Colorado Parks and Wildlife"
STATS_PAGE = {
    "elk": "https://cpw.state.co.us/activities/hunting/big-game/hunting-elk/elk-statistics",
    "deer": "https://cpw.state.co.us/activities/hunting/big-game/hunting-deer/deer-statistics",
    "pronghorn": "https://cpw.state.co.us/activities/hunting/big-game/hunting-pronghorn/pronghorn-statistics",
    "moose": "https://cpw.state.co.us/activities/hunting/big-game/hunting-moose/moose-statistics",
    "bear": "https://cpw.state.co.us/activities/hunting/big-game/hunting-bear/bear-statistics",
    "rmsheep": "https://cpw.state.co.us/activities/hunting/big-game/hunting-bighorn-sheep/bighorn-sheep-statistics",
    "dsheep": "https://cpw.state.co.us/activities/hunting/big-game/hunting-bighorn-sheep/bighorn-sheep-statistics",
    "goat": "https://cpw.state.co.us/activities/hunting/big-game/hunting-mountain-goat/mountain-goat-statistics",
    "sturkey": "https://cpw.state.co.us/activities/hunting/turkey-hunting/turkey-statistics",
    "fturkey": "https://cpw.state.co.us/activities/hunting/turkey-hunting/turkey-statistics",
}


def gmu(code):
    u = code[2:5]
    if re.match(r"^\d{3}$", u):
        return str(int(u))
    return u  # S49, G12 ...


def describe_code(code, lst=None):
    sp = SPECIES_LETTER.get(code[0], code[0])
    sex = SEX.get(code[1], (None, code[1]))[1]
    unit = gmu(code)
    s_letter, s_num = code[5], code[6]
    season = SEASON.get(s_letter, "season code {c}").format(n=s_num, c=code[5:7])
    meth = METHOD.get(code[7], (None, code[7]))[1]
    unit_word = "unit" if code[0] in "SCG" else "GMU"
    d = f"{code}: {sp}, {sex}, {unit_word} {unit}, {season} ({code[5:7]}), {meth.lower()}"
    if lst:
        d += f", List {lst}"
    return d


def whitetail_codes(raw, year):
    """Hunt codes on the brochure page titled 'Limited Licenses - White-tailed (Deer) Only'."""
    key = WT_BROCHURE.get(year)
    pdf = os.path.join(raw, key + ".pdf")
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    codes, pages = set(), []
    for p in range(1, n + 1):
        t = subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p), pdf, "-"], capture_output=True, text=True).stdout
        if re.search(r"LIMITED LICENSES\s+—\s+WHITE(TAIL|-TAILED)( DEER)? ONLY", t, re.I):
            pages.append(p)
            codes |= {c.replace("-", "") for c in re.findall(r"\bD-[MFE]-\d{3}-[A-Z]\d-[A-Z]\b", t)}
    return codes, pages, key


def dout_points(s):
    if not s:
        return None, None
    m = re.search(r"(\d+)(\+?) Pref", s)
    if m:
        return int(m.group(1)), f"{m.group(1)}{m.group(2)} Pref Points"
    for k in ("Choice 2", "Choice 3", "Choice 4", "Leftover", "No Apps", "None Drawn", "N/A"):
        if k in s:
            return None, k
    return None, s.strip()


def run_stamp(r):
    m = re.search(r"\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M", (r.get("title") or "") + " " + (r.get("stamp") or ""))
    return m.group(0) if m else "n/a"


def pct(d, a):
    if not a:
        return None
    return round(100.0 * d / a, 2)


def build_record(h, species, year, src, rkey, wt_flag):
    t1 = h["totals"].get(1, {"pre": {}, "post": {}})
    pre, post = t1["pre"], t1["post"]
    q = h.get("preQuota", {})
    dres, dres_txt = dout_points(h.get("drawnOutAt", {}).get("aRes"))
    dnon, dnon_txt = dout_points(h.get("drawnOutAt", {}).get("aNon"))
    weighted = rkey in WEIGHTED
    if rkey == "dsheep":
        dres = dnon = None  # random draw: CPW says preference points do not apply

    def res_stats(cat, qkey, mp):
        a, d = pre.get(cat), post.get(cat)
        st = {"quota": q.get(qkey) if isinstance(q.get(qkey), int) else None,
              "applicants": a, "drawn": d, "oddsPct": pct(d, a), "oddsComputed": True, "minPoints": mp}
        if st["oddsPct"] is None:
            st["oddsComputed"] = False
        return st

    general = h.get("apps", {}).get(1, {}).get("general") if isinstance(h.get("apps"), dict) else None
    if general is None:
        general = h.get("apps", {}).get("1", {}).get("general")
    tot_drawn = sum(post.get(c, 0) for c in ("aRes", "aNon", "yRes", "yNon"))
    total = {"quota": h.get("totalQuota"), "applicants": general, "drawn": tot_drawn,
             "oddsPct": pct(tot_drawn, general), "oddsComputed": True}
    if total["oddsPct"] is None:
        total["oddsComputed"] = False

    codes = h["codes"]
    per = h.get("perCode", {})
    sexes = {SEX.get(c[1], (None,))[0] for c in codes}
    methods = {METHOD.get(c[7], (None,))[0] for c in codes}
    mlabels = {METHOD.get(c[7], (None, None))[1] for c in codes}
    rec = {
        "species": species, "year": year, "huntCode": h["huntCode"],
        "units": sorted({gmu(c) for c in codes}, key=lambda u: (len(u), u)),
        "description": {"sturkey": "Spring turkey limited license — ", "fturkey": "Fall turkey limited license — "}.get(rkey, "")
                       + "; ".join(describe_code(c, per.get(c, {}).get("list")) for c in codes),
        "choice": "first",
        "resident": res_stats("aRes", "res", dres),
        "nonresident": res_stats("aNon", "non", dnon),
        "total": total,
    }
    if len(methods) == 1 and None not in methods:
        rec["method"] = methods.pop()
        rec["methodLabel"] = mlabels.pop()
    if len(sexes) == 1 and None not in sexes:
        rec["sex"] = sexes.pop()

    if rkey != "dsheep":
        bp = []
        for r in h["rows"]:
            pts = r["pref"] + (r["wt"] or 0) if weighted else r["pref"]
            row = {"points": pts}
            ra, rd = r["pre"]["aRes"], r["post"]["aRes"]
            na, nd = r["pre"]["aNon"], r["post"]["aNon"]
            if ra or rd:
                row["resident"] = {"applicants": ra, "drawn": rd}
            if na or nd:
                row["nonresident"] = {"applicants": na, "drawn": nd}
            if len(row) > 1:
                bp.append(row)
        if bp:
            rec["byPoints"] = bp

    notes = []
    if len(codes) > 1:
        notes.append("CPW reports these hunt codes as one float group (one quota shared by the codes); applicant and point figures are for the group. Drawn per hunt code: "
                     + ", ".join(f"{c} {per.get(c, {}).get('drawn')}" for c in codes) + ".")
    if wt_flag:
        notes.append(wt_flag)
    if rkey == "dsheep":
        notes.append("Desert bighorn sheep: random draw; CPW states preference points do not apply.")
    else:
        notes.append(f"Drawn Out At (CPW, adult): resident {dres_txt or 'n/a'}; nonresident {dnon_txt or 'n/a'}.")
    yr_a, yr_d, yn_a, yn_d = pre.get("yRes", 0), post.get("yRes", 0), pre.get("yNon", 0), post.get("yNon", 0)
    if yr_a or yn_a or yr_d or yn_d:
        notes.append(f"Youth 1st choice (in total, not in resident/nonresident): resident {yr_a} applied/{yr_d} drawn, nonresident {yn_a}/{yn_d}.")
    lpp_apps = (h.get("apps", {}).get(1) or {}).get("lpp")
    lu, lr = post.get("lUn", 0), post.get("lRe", 0)
    if lpp_apps or lu or lr:
        notes.append(f"Landowner (LPP) 1st-choice applications {lpp_apps}, vouchers drawn {lu} unrestricted/{lr} restricted (excluded from total).")
    pd = h.get("post", {})
    if "drawn" in pd:
        notes.append(f"All choices: {pd['drawn']} drawn of total quota {h.get('totalQuota')}.")
    for p in h["problems"]:
        m = re.match(r"sum pre\.(aRes|aNon) of point rows (\d+) != Total Choice 1 (\d+)", p)
        if m:
            who = "resident" if m.group(1) == "aRes" else "nonresident"
            notes.append(f"CPW's point-level rows sum to {m.group(2)} adult {who} first-choice applicants while its Total Choice 1 row shows {m.group(3)}; applicants uses the published total.")
    for k in ("resident", "nonresident", "total"):
        # omit unpublished / not-applicable fields (null) to keep files small
        rec[k] = {kk: vv for kk, vv in rec[k].items() if vv is not None and not (kk == "oddsComputed" and vv is False)}
    rec["note"] = " ".join(notes)
    rec["sourceId"] = src
    return rec


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    years = list(range(2022, 2027))
    if "--years" in sys.argv:
        a, b = sys.argv[sys.argv.index("--years") + 1].split("-")
        years = list(range(int(a), int(b) + 1))
    manifest = json.load(open(os.path.join(raw, "manifest.json")))
    out = {}
    report = {"sources": [], "checks": [], "unexpected_problems": [], "whitetail": {}}
    wt_sets = {}
    for y in years:
        codes, pages, key = whitetail_codes(raw, y)
        wt_sets[y] = codes
        report["whitetail"][y] = {"brochure": key, "pages": pages, "codes": len(codes)}
    for rkey, sp in REPORTS.items():
        for y in years:
            k = f"{rkey}-{y}"
            pdf = os.path.join(raw, k + ".pdf")
            if not os.path.exists(pdf):
                continue
            r = parse_recap(pdf)
            m = manifest[k]
            src = f"d-recap-{rkey}-{y}"
            report["sources"].append({
                "id": src, "title": f"{y} Primary {REPORT_LABEL[rkey]} Post Draw Report (Draw Recap)",
                "publisher": PUBLISHER, "url": m.get("share") or m["direct"], "pageUrl": STATS_PAGE[rkey], "dataYear": y,
                "retrieved": m.get("retrieved", RETRIEVED),
                "notes": f"\"{y} Draw Recap Report\" link on the CPW statistics page; file {m.get('file')}, report run {run_stamp(r)}. Primary draw; HuntScout uses first-choice figures."})
            # cross-check vs statewide summary
            sw = r["statewide"]
            sums = {c: 0 for c in ("aRes", "aNon", "yRes", "yNon")}
            dsum = {c: 0 for c in sums}
            point_only = [h for h in r["hunts"] if any(c[2:] == "99999P" for c in h["codes"])]
            r["hunts"] = [h for h in r["hunts"] if h not in point_only]
            pts = {c: sum(h["totals"].get(1, {}).get("pre", {}).get(c, 0) for h in point_only) for c in sums}
            for h in r["hunts"]:
                for c in sums:
                    sums[c] += h["totals"].get(1, {}).get("pre", {}).get(c, 0)
                    dsum[c] += h["totals"].get(1, {}).get("post", {}).get(c, 0)
            swt = (sw or {}).get("totals", {}).get(1) if sw else None
            report["checks"].append({"report": k, "huntBlocks": len(r["hunts"]), "huntCodes": sum(len(h["codes"]) for h in r["hunts"]),
                                     "publishedTotalHuntCodes": r["totalHuntCodes"],
                                     "sumChoice1Applicants": sums, "pointOnlyCodeApplicants": pts, "pointOnlyCodes": [h["huntCode"] for h in point_only], "statewideChoice1Applicants": swt["pre"] if swt else None,
                                     "sumChoice1Drawn": dsum, "statewideChoice1Drawn": swt["post"] if swt else None})
            for h in r["hunts"]:
                bad = [p for p in h["problems"] if not p.startswith("sum pre.")]
                if bad:
                    report["unexpected_problems"].append({"report": k, "hunt": h["huntCode"], "problems": bad})
                if not h.get("totals", {}).get(1):
                    continue
                species = sp
                flag = None
                if rkey == "deer":
                    inwt = [c in wt_sets[y] for c in h["codes"]]
                    if all(inwt):
                        species = "whitetail"
                        flag = f"White-tailed deer only hunt code (listed in the white-tailed-only limited license table of CPW's {y} big game brochure)."
                    elif any(inwt):
                        species = "mule-deer"
                        flag = "Group mixes white-tailed-only and regular deer hunt codes."
                    else:
                        species = "mule-deer"
                out.setdefault(species, []).append(build_record(h, species, y, src, rkey, flag))
    dst = os.path.join(repo, "src/data/agency/colorado/draw")
    os.makedirs(dst, exist_ok=True)
    for sp, rows in out.items():
        rows.sort(key=lambda r: (r["year"], r["huntCode"]))
        p = os.path.join(dst, sp + ".json")
        with open(p, "w") as f:
            json.dump(rows, f, separators=(",", ":"), ensure_ascii=False)
        print(sp, len(rows), "rows", os.path.getsize(p), "bytes", sorted({r["year"] for r in rows}))
    json.dump(report, open(os.path.join(raw, "build_report.json"), "w"), indent=1)
    print("unexpected problems:", len(report["unexpected_problems"]))


if __name__ == "__main__":
    main()
