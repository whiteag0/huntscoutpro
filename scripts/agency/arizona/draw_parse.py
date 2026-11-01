"""Build src/data/agency/arizona/draw/<species>.json from AZGFD draw reports.

Usage (from repo root):
  python -I scripts/agency/arizona/draw_download.py <raw_dir>/pdf
  for f in <raw_dir>/pdf/*.pdf; do pdftotext -layout "$f" "<raw_dir>/txt/$(basename "$f" .pdf).txt"; done
  python -I scripts/agency/arizona/draw_parse.py <raw_dir> [<cache_dir>]

Per AZGFD hunt number and draw (Midwinter = elk/pronghorn, Fall = deer/bighorn/fall turkey,
Spring = spring turkey) the record carries:
  total.quota          Authorized permits (Bonus Pass report, "All" row)
  */applicants         1st-choice applicants (Bonus Pass report: full 1st-choice pool)
  */drawn              1st-choice drawn = Bonus Pass "First Choice Drawn" + 1-2 Pass "First Choice Drawn"
  total.oddsPct        AZGFD published "ODDS" from the draw-odds summary when one exists (2023-2025),
                       else drawn/applicants (oddsComputed: true); resident/nonresident always computed
  byPoints             Bonus Point Report: 1st+2nd-choice applicants and permits issued in the
                       bonus + 1-2 passes, per group bonus-point level (as published)
  */minPoints          lowest point level with a permit issued in that table
Nothing is estimated: blank cells stay null.
"""
import json, os, re, sys

sys.dont_write_bytecode = True  # keep the repo free of __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import draw_reports  # noqa: E402
from draw_reports import parse_pass, parse_bpr, parse_odds, parse_regs, SECTION  # noqa: E402
from draw_sources import DRAWS, ODDS, REGS, PARSED_REGS, draw_source_id, odds_source_id, regs_source_id  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(REPO, "src", "data", "agency", "arizona", "draw")

# Hunt numbers that AZGFD's 2023-2025 draw-odds summaries print twice with different units.
# The row kept is the one whose unit matches that year's regulation booklet (checked by hand):
ODDS_DUP_PICK = {
    (2023, "3005"): ("05B", "pe2023", "hunt 3005: Unit 5B, Sep 29 - Oct 5, 2023, Bull elk, 24 permits"),
    (2023, "1152"): ("06B", "hunt2023", "hunt 1152: 6B (excluding Camp Navajo), Oct 13 - Oct 19, 2023, Any antlered deer, 50 permits"),
    (2024, "6054"): ("46BE", "hunt2024", "hunt 6054: 46B East (Cabeza Prieta National Wildlife Refuge), Dec 1 - Dec 31, 2024, Any ram, 3 permits"),
    (2025, "6028"): ("39E", "hunt2025", "hunt 6028: 39 East (east of old AZ Hwy 80), Dec 1 - Dec 31, 2025, Any ram, 2 permits"),
    (2025, "6029"): ("39W", "hunt2025", "hunt 6029: 39 West (west of old AZ Hwy 80), Dec 1 - Dec 31, 2025, Any ram, 3 permits"),
}
# Fall hunts with a split season: the 2023-2025 draw-odds summaries print only the first segment,
# the regulation booklet prints both (date cell wrapped over the hunt-number line; checked by hand).
ODDS_SPLIT_SEASON = {
    (2023, "1201"): ("hunt2023", "Aug 25 - Sep 14, 2023 and Dec 15 - Dec 31, 2023"),  # 17A archery deer
    (2024, "1204"): ("hunt2024", "Aug 23 - Sep 12, 2024 and Dec 13 - Dec 31, 2024"),  # 17A archery deer
    (2025, "1206"): ("hunt2025", "Aug 22 - Sep 11, 2025 and Dec 12 - Dec 31, 2025"),  # 17A archery deer
}
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def regs_dates_mdy(s):
    """'Apr 25 - May 1, 2025 and May 9 - May 22, 2025' -> '4/25/2025 - 5/1/2025 and 5/9/2025 - 5/22/2025'"""
    out = []
    for part in re.split(r",? and ", s):
        a, b = [x.strip() for x in part.split(" - ")]
        bm = re.match(r"^(\w{3}) (\d{1,2}), (\d{4})$", b)
        am = re.match(r"^(\w{3}) (\d{1,2})(?:, (\d{4}))?$", a)
        if not (am and bm):
            return None
        y = int(bm.group(3))
        ay = int(am.group(3)) if am.group(3) else (y if MONTHS[am.group(1)] <= MONTHS[bm.group(1)] else y - 1)
        out.append(f"{MONTHS[am.group(1)]}/{int(am.group(2))}/{ay} - {MONTHS[bm.group(1)]}/{int(bm.group(2))}/{y}")
    return " and ".join(out)


C = dict(auth=0, avail=1, c1=2, c2=3, c12=4, d1=5, d2=6, sif=7, issued=8, grand=9, unissued=10)


def species_of(hunt, text):
    n = int(hunt)
    t = (text or "").lower()
    if 1000 <= n < 2000:
        if "whitetail" in t or "white-tailed" in t:
            return "whitetail"
        return "mule-deer"
    if 2000 <= n < 3000:
        return "pronghorn"
    if 3000 <= n < 4000:
        return "elk"
    if 4000 <= n < 5000:
        return "turkey"
    if 6000 <= n < 7000:
        return "sheep"
    return None  # 5xxx javelina, 7xxx bison, 9xxx sandhill crane, 2xxxx raptor capture


def method_of(label):
    u = (label or "").upper()
    if "ARCHERY" in u:
        return "archery"
    if "MUZZLELOADER" in u:
        return "muzzleloader"
    if "SHOTGUN" in u:
        return "shotgun"
    if "HAM" in re.split(r"[^A-Z]+", u):
        return "other"
    if "GENERAL" in u:
        return "all"
    return None


def sex_of(t):
    t = (t or "").lower()
    if "antlerless" in t or "cow" in t or "yearling" in t or "bearded" in t:
        return None
    if re.search(r"\b(bull|buck|antlered|ram)\b", t):
        return "male"
    if t.startswith("any "):
        return "either"
    return None


UNIT_TOK = re.compile(r"^(\d{1,2}[A-Z]{0,3}(?: (?:North|South|East|West))?)$")


def units_from_odds(u):
    out = []
    for tok in u.split("/"):
        tok = re.sub(r"\s*\(.*?\)\s*", "", tok).strip()
        m = re.match(r"^(\d{1,2}[A-Z]{0,4})(?:\s|$)", tok)  # e.g. "27 Upper Blue River" -> "27"
        if m and m.group(1) not in out:
            out.append(m.group(1))
    return out


def units_from_regs(oa):
    if not oa:
        return []
    s = re.sub(r"\([^()]*\)", "", oa)  # drop parentheticals
    s = re.sub(r"\([^()]*\)", "", s)
    m = re.search(r"\bin Units? (.+)$", s)
    if m:
        s = m.group(1)
    out = []
    for tok in re.split(r",\s*|\s+and\s+", s):
        tok = tok.strip()
        tok = re.sub(r"^and\s+", "", tok)
        mm = UNIT_TOK.match(tok)
        if mm and mm.group(1) not in out:
            out.append(mm.group(1))
    return out


def pct(d, a):
    if d is None or a in (None, 0):
        return None
    return round(100.0 * d / a, 1)


def add(a, b):
    return None if a is None or b is None else a + b


def main():
    raw = sys.argv[1]
    draw_reports.CACHE_DIR = sys.argv[2] if len(sys.argv) > 2 else None
    P = os.path.join(raw, "pdf")
    T = os.path.join(raw, "txt")
    txt = lambda path: os.path.join(T, os.path.basename(path)[:-4] + ".txt")
    pdf = lambda path: os.path.join(P, os.path.basename(path))

    odds = {k: parse_odds(txt(v)) for k, v in ODDS.items()}
    regs = {k: parse_regs(pdf(REGS[k][1]), txt(REGS[k][1])) for k in PARSED_REGS}
    regs_for = {"M": "pe2026", "F": "hunt2026", "S": "spring2026"}
    odds_for = {"M": ["elk", "pronghorn"], "F": ["deer", "sheep", "fall-turkey"], "S": ["spring-turkey"]}

    records = {}
    log = {"noDescription": [], "skippedDeerNoDescription": [], "oddsMismatch": [], "inconsistent": [], "counts": {}}
    for (season, year), (label, kinds) in sorted(DRAWS.items(), key=lambda x: (x[0][1], x[0][0])):
        B = parse_pass(pdf(kinds["bonus"]), 11)
        Q = parse_pass(pdf(kinds["p12"]), 11)
        Z = parse_pass(pdf(kinds["p345"]))
        BP, bad = parse_bpr(pdf(kinds["bpr"]))
        if bad:
            log["inconsistent"].append(f"{label}: {len(bad)} unparsed BPR rows {bad[:2]}")
        meta_odds = {}
        if year <= 2025:
            for k in odds_for[season]:
                for h, r in odds.get((year, k), {}).items():
                    meta_odds[h] = (k, r)
        meta_regs = regs[regs_for[season]] if year == 2026 else {}
        # 2023-2025 spring booklets: season dates (split seasons) and duplicated summary rows
        spring_regs_key = f"spring{year}" if season == "S" and year <= 2025 else None
        if spring_regs_key:
            meta_regs = regs[spring_regs_key]
        for hunt, b in B.items():
            sp_hint = None
            if hunt.endswith("000") or len(hunt) != 4:
                continue  # bonus-point-only codes / raptor capture
            mo = meta_odds.get(hunt)
            mr = meta_regs.get(hunt)
            pre_notes = []
            if mo and mo[1].get("dups"):
                k_, r_ = mo
                rows_ = [r_] + r_["dups"]
                listed = "; ".join(f"Unit {x['unit']} {x['open']} - {x['close']} {x['type']}" for x in rows_)
                pick = ODDS_DUP_PICK.get((year, hunt))
                if pick:
                    keep = [x for x in rows_ if x["unit"] == pick[0]]
                    if len(keep) != 1:
                        raise ValueError(f"duplicate odds rows {year} {hunt}: no single row with unit {pick[0]}")
                    mo = (k_, dict(keep[0], dups=[]))
                    pre_notes.append(f"AZGFD's draw-odds summary prints this hunt number twice ({listed}); the row kept "
                                     f"matches the {year} regulation booklet ({regs_source_id(pick[1])}: {pick[2]})")
                elif spring_regs_key and mr and not mr.get("bonusOnly"):
                    mo = None  # describe the hunt from the regulation booklet instead
                    pre_notes.append(f"AZGFD's draw-odds summary prints this hunt number twice ({listed}); unit, legal "
                                     f"wildlife and season dates are taken from {regs_source_id(spring_regs_key)} instead")
                else:
                    raise ValueError(f"unresolved duplicate odds rows {year} {hunt}: {listed}")
            text = (mo[1]["type"] if mo else "") + " " + ((mr or {}).get("legal") or "") + " " + ((mr or {}).get("section") or "")
            sp = species_of(hunt, text)
            if sp is None:
                continue
            q = Q.get(hunt, {})
            z = Z.get(hunt, {})
            notes = list(pre_notes)
            # ------- description / units / method
            if mo:
                k, r = mo
                if r["year"] != year:
                    raise ValueError(f"odds year mismatch {hunt} {r['year']} {year}")
                desc = f"{r['type']} — {r['method']} — Unit {r['unit']}"
                units = units_from_odds(r["unit"])
                method_label = r["method"]
                season_dates = f"{r['open']} - {r['close']}"
                if r["serialDate"]:
                    notes.append("Season dates converted from spreadsheet serial numbers printed in the AZGFD draw-odds PDF")
                sex = sex_of(r["type"])
                desc_src = odds_source_id(year, k)
                if spring_regs_key and mr and mr.get("dates") and not mr.get("bonusOnly"):
                    rd = regs_dates_mdy(mr["dates"])
                    if rd is None:
                        raise ValueError(f"unparsed regs dates {year} {hunt}: {mr['dates']}")
                    if rd != season_dates:
                        notes.append(f"Season dates from {regs_source_id(spring_regs_key)} ('{mr['dates']}'); AZGFD's "
                                     f"draw-odds summary prints {season_dates}")
                        season_dates = rd
                split = ODDS_SPLIT_SEASON.get((year, hunt))
                if split:
                    rd = regs_dates_mdy(split[1])
                    if rd is None or not rd.startswith(season_dates + " and "):
                        raise ValueError(f"ODDS_SPLIT_SEASON {year} {hunt}: {split[1]!r} does not extend {season_dates!r}")
                    notes.append(f"Season dates from {regs_source_id(split[0])} ('{split[1]}'); AZGFD's "
                                 f"draw-odds summary prints {season_dates}")
                    season_dates = rd
            elif mr and not mr.get("bonusOnly"):
                sm = SECTION.match(mr["section"] or "")
                sec = sm.group(1).strip() if sm else (mr["section"] or "")
                desc = f"{mr['legal']} — {sec} — {mr['openAreas']}"
                units = units_from_regs(mr["openAreas"])
                method_label = sec
                season_dates = mr["dates"]
                if spring_regs_key:
                    season_dates = regs_dates_mdy(mr["dates"]) or mr["dates"]
                sex = sex_of(mr["legal"])
                desc_src = regs_source_id(spring_regs_key or regs_for[season])
                if mr.get("wrapped"):
                    notes.append("Open-area text re-joined from wrapped lines of the regulation table")
            else:
                if sp in ("mule-deer", "whitetail"):
                    # deer species (mule deer vs whitetail) is unknown without a published description
                    log["skippedDeerNoDescription"].append(f"{year}{season} {hunt}")
                    continue
                desc = (f"Hunt {hunt} — {label}. AZGFD's draw report lists this hunt number only; the {year} "
                        f"regulation booklet prints some special-area hunts (e.g. Hopi, Camp Navajo) without hunt numbers, "
                        f"so no open area or season is attached here")
                units, method_label, season_dates, sex, desc_src = [], None, None, None, None
                log["noDescription"].append(f"{year}{season} {hunt}")
            method = method_of(method_label)
            if sp == "mule-deer" and not re.search(r"mule deer", text, re.I):
                notes.append("Deer hunt not restricted to one species (AZGFD legal wildlife: '" + (mo[1]["type"] if mo else (mr or {}).get("legal", "")) + "'); filed under mule deer")
            # ------- numbers
            def row(d, lab):
                return d.get(lab) if d else None
            bA, bR, bN = row(b, "All"), row(b, "Res"), row(b, "NonRes")
            qA, qR, qN = row(q, "All"), row(q, "Res"), row(q, "NonRes")
            g = lambda r, c: None if r is None else r[C[c]]
            tot = {"quota": g(bA, "auth"), "applicants": g(bA, "c1"), "drawn": add(g(bA, "d1"), g(qA, "d1"))}
            res = {"applicants": g(bR, "c1"), "drawn": add(g(bR, "d1"), g(qR, "d1"))}
            nr = {"applicants": g(bN, "c1"), "drawn": add(g(bN, "d1"), g(qN, "d1"))}
            for lab_, r_ in (("Res", bR), ("NonRes", bN)):
                if r_ is None:
                    notes.append(f"AZGFD Bonus Pass report prints no {lab_} row for this hunt")
            # internal consistency of the published rows
            for nm, rr in (("Bonus Pass", (bA, bR, bN)), ("1-2 Pass", (qA, qR, qN))):
                if None in rr:
                    continue
                for c in ("c1", "d1"):
                    a_, r__, n__ = (g(x, c) for x in rr)
                    if None not in (a_, r__, n__) and a_ != r__ + n__:
                        notes.append(f"AZGFD {nm} report: All {c} {a_} != resident {r__} + nonresident {n__} (as published)")
                        log["inconsistent"].append(f"{year}{season} {hunt} {nm} {c} {a_}!={r__}+{n__}")
            if g(bN, "auth") is not None and g(bA, "auth") is not None and g(bN, "auth") < g(bA, "auth"):
                notes.append(f"Nonresident limit shown by AZGFD: {g(bN, 'auth')} of {g(bA, 'auth')} permits")
            if z.get("All"):
                zc = z["ncols"]
                gi = z["All"][zc - 2]
                un = z["All"][zc - 1]
                if gi is not None:
                    notes.append(f"Permits issued after all passes: {gi}" + (f"; unissued: {un}" if un else ""))
            if b.get("star"):
                notes.append("Marked * in the AZGFD report (nonresident counts include lifetime-license holders, who are exempt from the 10% nonresident limit)")
            # odds: computed from the same draw-report numbers shown in the record. AZGFD's separate
            # draw-odds summary (2023-2025) was produced from a different extract (its 1st-choice
            # applicant counts often differ by a few), so it is quoted in the note, not mixed in.
            tot["oddsPct"] = pct(tot["drawn"], tot["applicants"])
            if tot["oddsPct"] is not None:
                tot["oddsComputed"] = True
            if mo:
                nums = mo[1]["nums"]
                if len(nums) == 4:
                    notes.append(f"AZGFD {year} draw-odds summary ({odds_source_id(year, mo[0])}): 1st-choice applicants {nums[0]}, permits issued {nums[2]}, published odds {nums[3]}%")
                    comp = tot["oddsPct"]
                    if comp is not None and re.match(r"^\d+(\.\d+)?$", nums[3]) and abs(comp - float(nums[3])) > 0.15:
                        log["oddsMismatch"].append(f"{year}{season} {hunt} published {nums[3]} computed {comp}")
            for st in (res, nr):
                st["oddsPct"] = pct(st["drawn"], st["applicants"])
                if st["oddsPct"] is not None:
                    st["oddsComputed"] = True
            for nm, st in (("total", tot), ("resident", res), ("nonresident", nr)):
                if st["oddsPct"] is not None and st["oddsPct"] > 100:
                    notes.append(f"AZGFD reports more 1st-choice permits drawn ({st['drawn']}) than 1st-choice applicants "
                                 f"({st['applicants']}) for {nm}; figures kept as published, odds not computed")
                    st["oddsPct"] = None
                    st.pop("oddsComputed", None)
            # by points
            bp = BP.get(hunt)
            by = None
            if bp:
                by = []
                for pts, v in sorted(bp):
                    if pts > 40:
                        notes.append(f"Bonus Point Report also lists {v[6]} applicant(s) at {pts} group bonus points "
                                     f"(permits issued: {v[12]}); row omitted from byPoints (schema limit 40)")
                        continue
                    by.append({"points": pts,
                               "resident": {"applicants": v[7], "drawn": v[13]},
                               "nonresident": {"applicants": v[8], "drawn": v[14]}})
                    if v[13] > v[7] or v[14] > v[8]:
                        notes.append(f"Bonus Point Report row {pts} pts shows more permits than 1st+2nd-choice applicants (as published)")
                    if v[12] != v[13] + v[14] or v[6] != v[7] + v[8]:
                        notes.append(f"Bonus Point Report row {pts} pts: totals != resident + nonresident as published (total applicants {v[6]}, permits {v[12]})")
                rmin = [p["points"] for p in by if p["resident"]["drawn"] > 0]
                nmin = [p["points"] for p in by if p["nonresident"]["drawn"] > 0]
                res["minPoints"] = min(rmin) if rmin else None
                nr["minPoints"] = min(nmin) if nmin else None
                tot["minPoints"] = min(rmin + nmin) if (rmin or nmin) else None
            rec = {"species": sp, "year": year, "huntCode": hunt, "units": units, "description": desc}
            if method:
                rec["method"] = method
            if method_label:
                rec["methodLabel"] = method_label
            if sex:
                rec["sex"] = sex
            if season_dates:
                rec["seasonDates"] = season_dates
            rec["choice"] = "first"
            rec["resident"] = res
            rec["nonresident"] = nr
            rec["total"] = tot
            if by:
                rec["byPoints"] = by
            if by:
                notes.append("byPoints = 1st+2nd-choice applicants and permits issued in the bonus + 1st/2nd-choice passes, "
                             "by group bonus points, as published in the Bonus Point Report")
            if desc_src:
                notes.append(f"Hunt description: {desc_src}")
            notes.append("Also uses " + ", ".join(draw_source_id(season, year, k) for k in ("p12", "p345", "bpr")))
            rec["note"] = f"AZGFD {label}. " + "; ".join(notes)
            rec["sourceId"] = draw_source_id(season, year, "bonus")
            records.setdefault(sp, []).append(rec)
            log["counts"][f"{sp} {year}"] = log["counts"].get(f"{sp} {year}", 0) + 1

    os.makedirs(OUT, exist_ok=True)
    for sp, rows in records.items():
        rows.sort(key=lambda r: (r["year"], r["huntCode"]))
        seen = set()
        for r in rows:
            k = (r["year"], r["huntCode"])
            if k in seen:
                raise ValueError(f"duplicate {sp} {k}")
            seen.add(k)
        with open(os.path.join(OUT, f"{sp}.json"), "w") as f:
            json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
    log["oddsMismatch"] = f"{len(log['oddsMismatch'])} hunts where AZGFD draw-odds summary differs from draw-report odds by >0.15 pts"
    print(json.dumps(log, indent=1)[:20000])


if __name__ == "__main__":
    main()
