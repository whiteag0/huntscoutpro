"""Unit / hunt level tables from GFP harvest projection reports (imported by harvest_parse.py).

Each parser receives (P, lines, sid) where P is the harvest_parse module, lines a document's
pdftotext -layout lines and sid its source id. Tables are located by their printed title,
which carries the season year. Rows are mapped column-by-column; harvest components are read
from the right-hand side of each row (anchored on GFP's "+/-" confidence-interval cell or on
the trailing satisfaction / days cells) so that blank cells in the middle of a row (e.g. an
empty "2nd tag" success column) cannot shift the harvest numbers. Every row is then checked:
the component columns must add up to GFP's printed total (within GFP rounding), and the rows
of a table must add up to GFP's printed Totals row.
"""
import glob
import os
import re

P = None  # harvest_parse module, set in run()

CODE = r"[A-Z0-9]{2,4}-\d{2}[A-Z]?"


def N(t):
    return P.num(t)


def find_tables(lines, title_re, maxlen=260):
    """Yield (year, block_lines) for each table whose title matches title_re (must capture year)."""
    for i, l in enumerate(lines):
        m = re.match(title_re, l)
        if not m:
            continue
        y = int(m.group(1))
        blk = []
        for x in lines[i + 1:i + maxlen]:
            if re.match(r"^\s*(Use these figures|\* Number of 1st|The response rate for all|Response rate for)", x):
                break
            blk.append(x)
            if re.match(r"^\s*(Grand Totals|TOTALS|Totals)\b", x) and not re.match(r"^\s*Totals\s*$", x):
                # stop at the totals line, but keep a residency-split table's following "Nonresident" line
                if "Grand" in x or not re.search(r"Resident|Nonresident", x):
                    j = lines.index(x, i + 1) if False else None
                    break
        # a Totals row can wrap onto the next line: keep the following line too (marked)
        if blk and re.match(r"^\s*(TOTALS|Totals)\b", blk[-1]):
            k = i + 1 + len(blk)
            nxt = [z for z in lines[k:k + 3] if z.strip()]
            if nxt and "+/-" in nxt[0] and "+/-" not in blk[-1]:
                blk[-1] = blk[-1] + "   " + nxt[0]
        yield y, blk


def ci_index(t):
    for i, v in enumerate(t):
        if v.startswith("+/-") or v == "+/-":
            return i
    return None


def pct_tokens(t):
    return [N(v) for v in t if v.endswith("%")]


AREA = {"ST1": "Statewide", "APD": "Statewide", "YOD": "Statewide", "MHD": "Statewide", "LM1": "Statewide",
        "ER1": "East River", "WR1": "West River", "ER": "East River", "WR": "West River"}


def unit_of(code):
    """Unit for a GFP unit-type code: '01A-01' -> '01A'. Statewide / East River / West River license
    areas (ST1, LM1, APD, YOD, MHD, ER1, WR1, ER, WR) are reported under those area names."""
    parts = code.split("-")
    pre = parts[1] if parts[0] in ("ADN", "ADNP") else parts[0]
    return AREA.get(pre, pre)


def comps8(t):
    """GFP deer columns: WT buck adult, WT buck fawn, WT doe adult, WT doe fawn, MD buck adult, MD buck fawn, MD doe adult, MD doe fawn."""
    v = [N(x) for x in t]
    return dict(wt_buck=v[0] + v[1], wt_doe=v[2] + v[3], md_buck=v[4] + v[5], md_doe=v[6] + v[7]), sum(v)


def comps6(t):
    """GFP antlerless deer columns: WT bucks (fawns), WT does, WT doe fawns, MD bucks (fawns), MD does, MD doe fawns."""
    v = [N(x) for x in t]
    return dict(wt_buck=v[0], wt_doe=v[1] + v[2], md_buck=v[3], md_doe=v[4] + v[5]), sum(v)


_PDF_CACHE = {}


def _pdf_lines(pdf_path, xt):
    import pdfplumber
    key = (pdf_path, xt)
    if key not in _PDF_CACHE:
        pages = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                words = page.extract_words(x_tolerance=xt)
                lines = {}
                for w in words:
                    lines.setdefault(round(w["top"]), []).append(w)
                merged = []
                for top in sorted(lines):
                    ws = sorted(lines[top], key=lambda z: z["x0"])
                    out = []
                    for w in ws:
                        if out and w["x0"] - out[-1]["x1"] < 1.2:
                            out[-1] = dict(text=out[-1]["text"] + w["text"], x0=out[-1]["x0"], x1=w["x1"])
                        else:
                            out.append(dict(text=w["text"], x0=w["x0"], x1=w["x1"]))
                    merged.append((top, out))
                pages.append(merged)
        _PDF_CACHE[key] = pages
    return _PDF_CACHE[key]


def positional(code, expected, need=("Adult", "Fawn"), nneed=(8,)):
    """Fallback for rows with blank cells: locate the row in the PDF (pdfplumber word positions) and
    assign each cell to the nearest word of the header line that starts with 'Unit'. Several word
    tolerances are tried; a result is accepted only when the row is found once, its header has the
    expected column words, and no two cells fall in one column.
    Returns ([(header_index, header_word, cell_text)], header_words) or None."""
    pdf_path = P.CUR_PATH[:-4] + ".pdf"
    for xt in (1.5, 3, 5):
        hits = []
        for merged in _pdf_lines(pdf_path, xt):
            for i, (top, ws) in enumerate(merged):
                norm = lambda a: [z.replace("--", "-").replace("–", "-") for z in a]
                if norm([w["text"] for w in ws]) == norm([code] + list(expected)):
                    for j in range(i - 1, -1, -1):  # nearest header line above, same page
                        if merged[j][1] and merged[j][1][0]["text"].startswith("Unit"):
                            hits.append((ws, merged[j][1]))
                            break
        if len(hits) != 1:
            continue
        ws, hdr = hits[0]
        hw = [h["text"] for h in hdr]
        if sum(1 for h in hw if h in need) not in nneed or "Harvest" not in hw:
            continue
        centers = [((h["x0"] + h["x1"]) / 2, k, h["text"]) for k, h in enumerate(hdr)]
        out = []
        for w in ws[1:]:
            c = (w["x0"] + w["x1"]) / 2
            k = min(centers, key=lambda z: abs(z[0] - c))
            out.append((k[1], k[2], w["text"]))
        if len({k for k, _, _ in out}) != len(out):
            continue
        return out, hw
    return None


def sumtol(total):
    """Unit rows vs GFP's printed Totals row: GFP rounds each unit projection, allow 1%."""
    return max(3, round(0.01 * (total or 0)))


def disttol(total):
    """Harvest-distribution rows are rounded expansions of reported harvest; allow 4% (min 5)."""
    return max(5, round(0.04 * (total or 0)))


def tol(total):
    return max(3, round(0.03 * (total or 0)))


# ====================================================================== TURKEY
def spring_prairie_turkey(lines, sid):
    for y, blk in find_tables(lines, r"^\s*(\d{4}) Spring Prairie Turkey Harvest Projections\s*$"):
        tot_h = 0
        printed = None
        for x in blk:
            m = re.match(r"^\s*(\d{2}[A-Z])\s+(\d{2})\s+(.*)$", x)
            if m:
                unit, typ, t = m.group(1), m.group(2), P.toks(m.group(3))
                if not (19 <= len(t) <= 23):
                    P.WARN.append(f"spring prairie turkey {y} {unit}: {len(t)} tokens")
                    continue
                hunters, rap, rav, rs, nap, nav, ns, resp, tags, tags_s, hunt_s = [N(v) for v in t[:11]]
                adults, jakes, hens, total, days, sat = [N(v) for v in t[-6:]]
                P.check(f"turkey spring prairie {y} {unit}-{typ} comps", adults + jakes + hens, total, tol(total))
                tot_h += total
                P.add(dict(species="turkey", year=y, unit=unit, hunt=f"{unit}-{typ}", method=None,
                           methodLabel="Spring Prairie Turkey (firearm)", hunters=hunters, harvest=total,
                           harvestMale=adults + jakes, harvestFemale=hens, successPct=hunt_s,
                           licenses=P.ssum(rs, ns), daysHunted=days,
                           note=f"successPct = GFP hunter success; tag success {tags_s}%. hunters = GFP 'Hunters' column. "
                                f"Licenses sold {rs} resident + {ns} nonresident ({tags} tags); {rap} resident 1st-choice applicants.",
                           sourceId=sid))
            elif re.match(r"^\s*Totals\s+\d", x):
                t = P.toks(x)[1:]
                printed = N(t[-3])
        P.check(f"turkey spring prairie {y} unit sum vs Totals", tot_h, printed, sumtol(printed))


def fall_prairie_turkey(lines, sid):
    for y, blk in find_tables(lines, r"^\s*(\d{4}) Fall Prairie Turkey Harvest Projections\s*$"):
        tot_h, printed = 0, None
        for x in blk:
            if re.match(r"^\s*Totals\s+\d", x) or re.match(r"^\s*Totals\s", x):
                t = P.toks(x)[1:]
                printed = N(t[-3])
                continue
            m = re.match(r"^\s*(\d{2}[A-Z])\s+(\d{2})\s+(.*)$", x)
            name = None
            if m:
                unit, typ, t = m.group(1), m.group(2), P.toks(m.group(3))
            else:
                m = re.match(r"^\s*([A-Z][A-Za-z/\. ]+?)\s{2,}(\d[\d,]*\s+.*)$", x)
                if not m or "Revised" in x:
                    continue
                unit, typ, t = m.group(1).strip(), None, P.toks(m.group(2))
                name = unit
            if len(t) != 18:
                P.WARN.append(f"fall prairie turkey {y} {unit}: {len(t)} tokens")
                continue
            hunters, rap, rav, rs, nap, nav, ns, tags, resp, tag_s, ad, jk, hen, jen, unk, total, days, sat = [N(v) for v in t]
            P.check(f"turkey fall prairie {y} {unit} comps", ad + jk + hen + jen + unk, total, tol(total))
            tot_h += total
            note = f"successPct = GFP tag success. hunters = GFP 'Hunters' column. Licenses sold {rs} resident + {ns} nonresident ({tags} tags)."
            if unk:
                note += f" {unk} turkeys of unknown sex are in the total but not in male/female."
            if name:
                note += " GFP listed this unit by name only (no unit number) in this year's table."
            P.add(dict(species="turkey", year=y, unit=unit, hunt=f"{unit}-{typ}" if typ else None, method=None,
                       methodLabel="Fall Prairie Turkey", hunters=hunters, harvest=total, harvestMale=ad + jk,
                       harvestFemale=hen + jen, successPct=tag_s, licenses=P.ssum(rs, ns), daysHunted=days, note=note, sourceId=sid))
        P.check(f"turkey fall prairie {y} unit sum vs Totals", tot_h, printed, sumtol(printed))


DIST_ROW = re.compile(r"^\s*(?:(\d{2}[A-Z]{1,2}|BH1|CU1)\s+\(([^)]*)\)|([A-Z][A-Za-z]+(?: [A-Z][a-z]+)? County))\s+(\d.*)$")


def turkey_distribution(lines, sid):
    specs = [
        (r"^\s*(\d{4}) Spring Archery Turkey Harvest Distribution\s*$", "Spring Archery Turkey (statewide license) — harvest by unit", "archery", (7, 9), "spring"),
        (r"^\s*(\d{4}) Spring Ment Youth Turkey Harvest Distribution\s*$", "Spring Mentored Youth Turkey (statewide license) — harvest by unit", None, (7, 9), "spring"),
        (r"^\s*(\d{4}) Fall Mentored Youth Turkey Harvest Distribution\s*$", "Fall Mentored Youth Turkey (statewide license) — harvest by unit", None, (13,), "fall"),
    ]
    for title, label, meth, n, kind in specs:
        for y, blk in find_tables(lines, title):
            tot, printed = 0, None
            for x in blk:
                if re.match(r"^\s*TOTALS\s", x):
                    printed = N(P.toks(x)[-1])
                    continue
                m = DIST_ROW.match(x)
                if not m:
                    continue
                code, name, county, t = m.group(1), m.group(2), m.group(3), P.toks(m.group(4))
                if len(t) not in n:
                    P.WARN.append(f"{P.CUR_DOC} turkey dist {label} {y} {code or county}: {len(t)} tokens | {x.strip()}")
                    continue
                v = [N(a) for a in t]
                if kind == "spring" and len(t) == 7 and not any("Hens" in b for b in blk[:6]):  # reported toms, jakes, total; projected toms, jakes, total, %
                    toms, jakes, total = v[3:6]
                    hens = None
                    male, female = toms + jakes, None
                    P.check(f"turkey dist {y} {label} {code} comps", toms + jakes, total, 2)
                elif kind == "spring" and len(t) == 9:
                    toms, jakes, hens, total = v[4:8]
                    male, female = toms + jakes, hens
                    P.check(f"turkey dist {y} {label} {code} comps", toms + jakes + hens, total, 2)
                elif kind == "fall":
                    toms, jakes, hens, jen, unk, total = v[6:12]
                    male, female = toms + jakes, hens + jen
                    P.check(f"turkey dist {y} {label} {code} comps", toms + jakes + hens + jen + unk, total, 2)
                else:
                    P.WARN.append(f"{P.CUR_DOC} turkey dist {label} {y} {code or county}: column layout not recognised | {x.strip()}")
                    continue
                tot += total
                unit = code or county
                if code and name:
                    P.UNIT_NAMES["turkey"].setdefault(code, (y, name))
                    if y > P.UNIT_NAMES["turkey"][code][0]:
                        P.UNIT_NAMES["turkey"][code] = (y, name)
                P.add(dict(species="turkey", year=y, unit=unit, unitName=name or county, method=meth, methodLabel=label,
                           hunters=None, harvest=total, harvestMale=male, harvestFemale=female, successPct=None,
                           note="GFP projected harvest by the unit/county where the turkey was taken; GFP does not report hunters or success by unit for this statewide license.",
                           sourceId=sid))
            P.check(f"turkey dist {y} {label} sum vs TOTALS", tot, printed, disttol(printed))


# ====================================================================== PRONGHORN
def firearm_antelope(lines, sid):
    names = {}
    for y, blk in find_tables(lines, r"^\s*(\d{4}) Firearm Antelope Harvest Projections\s*$"):
        last_name = None
        tot, printed = 0, None
        for x in blk:
            if re.match(r"^\s*Totals\s", x):
                t = P.toks(x)
                c = ci_index(t)
                printed = N(t[c - 1]) if c else None
                continue
            m = re.match(rf"^(.*?)\s*({CODE})\s+(.*)$", x)
            if not m:
                continue
            name, code, t = m.group(1).strip(), m.group(2), P.toks(m.group(3))
            if name:
                last_name = name
            else:
                name = last_name
            c = ci_index(t)
            if c is None:
                P.WARN.append(f"firearm antelope {y} {code}: no CI cell")
                continue
            lastp = max(i for i in range(c) if t[i].endswith("%"))
            hv = [N(v) for v in t[lastp + 1:c]]
            if len(hv) == 5:
                bucks, does, kb, kd, total = hv
            elif len(hv) == 3:  # buck-only licenses (2025): adult bucks, kid bucks, total
                bucks, kb, total = hv
                does = kd = None
            else:
                P.WARN.append(f"firearm antelope {y} {code}: {len(hv)} harvest cells")
                continue
            rap, rav, rs, nap, nav, ns = [N(v) for v in t[:6]]
            resp = N(t[6])
            mid = t[7:lastp + 1]
            tags = None
            if mid and not mid[0].endswith("%"):
                tags = N(mid[0])
                mid = mid[1:]
            pcts = [N(v) for v in mid]
            tag_s = pcts[0] if pcts else None
            hunt_s = pcts[1] if len(pcts) >= 2 else None
            P.check(f"pronghorn firearm {y} {code} comps", P.ssum(bucks, does or 0, kb, kd or 0), total, tol(total))
            tot += total
            unit = unit_of(code)
            if code.startswith("ST1"):
                unit_disp, uname = "Statewide", name
            else:
                unit_disp, uname = unit, name
                names[unit] = name
                cur = P.UNIT_NAMES["pronghorn"].get(unit)
                if not cur or y >= cur[0]:
                    P.UNIT_NAMES["pronghorn"][unit] = (y, name)
            succ = hunt_s if hunt_s is not None else tag_s
            slabel = "hunter success" if hunt_s is not None else "tag success"
            note = f"successPct = GFP {slabel}" + (f"; tag success {tag_s}%" if hunt_s is not None else "") + \
                   f". Licenses sold {rs} resident + {ns} nonresident" + (f" ({tags} tags)" if tags is not None else "") + "."
            if rap is not None:
                note += f" {rap} resident 1st-choice applicants."
            P.add(dict(species="pronghorn", year=y, unit=unit_disp, unitName=uname, hunt=code, method="rifle",
                       methodLabel="Firearm Antelope" + (" — Landowner Own Land" if code.startswith("ST1") else ""),
                       hunters=None, harvest=total, harvestMale=bucks + kb, harvestFemale=P.ssum(does, kd), successPct=succ,
                       licenses=P.ssum(rs, ns), note=note, sourceId=sid))
        P.check(f"pronghorn firearm {y} sum vs Totals", tot, printed, sumtol(printed))
    return names


def antelope_distribution(lines, sid, names_by_year):
    specs = [
        (r"^\s*(\d{4}) Archery Antelope Harvest by Management Unit\s*$", "Archery Antelope (statewide license) — harvest by unit", "archery", "bdkk"),
        (r"^\s*(\d{4}) Special Antelope Harvest by Management Unit\s*$", "Special Antelope (statewide license) — harvest by unit", "rifle", "bdkk"),
        (r"^\s*(\d{4}) Antelope LOL Harvest Distribution\s*$", "Firearm Antelope Landowner Own Land — harvest by unit", "rifle", "lol"),
        (r"^\s*(\d{4}) Mentored Antelope Harvest Distribution\s*$", "Mentored Youth Antelope (statewide license) — harvest by unit", None, "ment"),
    ]
    for title, label, meth, kind in specs:
        for y, blk in find_tables(lines, title):
            name2code = {v: k for k, v in names_by_year.get(y, {}).items()}
            tot, printed = 0, None
            for x in blk:
                if re.match(r"^\s*TOTALS\s", x):
                    printed = N(P.toks(x)[-1])
                    continue
                code = name = None
                m = re.match(r"^\s*(\d{2}[A-Z])\s+\(([^)]*)\)\s+(\d.*)$", x)
                if m:
                    code, name, t = m.group(1), m.group(2), P.toks(m.group(3))
                else:
                    m = re.match(r"^\s*([A-Z][A-Za-z/\. ]+?)\s+(\d{2}[A-Z])?\s+(\d[\d,]*\s.*)$", x)
                    if not m or kind != "lol" or re.match(r"^\s*(Unknown|Last|TOTALS)", x):
                        continue
                    name, code, t = m.group(1).strip(), m.group(2), P.toks(m.group(3))
                    if not code:
                        code = name2code.get(name)
                        if not code:
                            P.WARN.append(f"antelope LOL {y}: no unit code for {name!r}")
                            continue
                expect = 9 if kind == "ment" else 11
                if len(t) != expect:
                    P.WARN.append(f"antelope dist {label} {y} {code}: {len(t)} tokens")
                    continue
                v = [N(a) for a in t]
                if kind == "ment":
                    does, dkids, bkids, total = v[4:8]
                    male, female = bkids, does + dkids
                    P.check(f"pronghorn dist {y} {label} {code}", does + dkids + bkids, total, 2)
                else:
                    b, d, bk, dk, total = v[5:10]
                    male, female = b + bk, d + dk
                    P.check(f"pronghorn dist {y} {label} {code}", b + d + bk + dk, total, 2)
                tot += total
                P.add(dict(species="pronghorn", year=y, unit=code, unitName=name, method=meth, methodLabel=label,
                           hunters=None, harvest=total, harvestMale=male, harvestFemale=female, successPct=None,
                           note="GFP projected harvest by the unit where the antelope was taken; hunters and success are not reported by unit for this license.",
                           sourceId=sid))
            P.check(f"pronghorn dist {y} {label} sum vs TOTALS", tot, printed, disttol(printed))


# ====================================================================== ELK
def elk_projections(lines, sid):
    specs = [
        (r"^\s*(\d{4}) Archery Elk Harvest Projections\s*$", "Archery Elk", "archery"),
        (r"^\s*(\d{4}) Black Hills Firearm Elk Harvest Projections\s*$", "Black Hills Firearm Elk", "rifle"),
        (r"^\s*(\d{4}) Prairie Firearm Elk Harvest Projections\s*$", "Prairie Firearm Elk", "rifle"),
        (r"^\s*(\d{4}) Landowner Prairie Elk Harvest Projections\s*$", "Landowner Own Land Prairie Elk", "rifle"),
    ]
    for title, label, meth in specs:
        for y, blk in find_tables(lines, title):
            tot, printed = 0, None
            for x in blk:
                if re.match(r"^\s*Totals\s", x):
                    t = P.toks(x)
                    c = ci_index(t)
                    printed = N(t[c - 1]) if c else None
                    continue
                m = re.match(rf"^\s*({CODE})\s+(.*)$", x)
                if not m:
                    continue
                code, t = m.group(1), P.toks(m.group(2))
                c = ci_index(t)
                if c is None or c != 10:
                    P.WARN.append(f"{P.CUR_DOC} elk {label} {y} {code}: no harvest cells printed (CI at {c}) | {x.strip()}")
                    continue
                appl, avail, sold, resp, succ, bulls, cows, bc, cc, total = [N(v) for v in t[:10]]
                notrec, sat, days = N(t[11]), N(t[12]), N(t[13])
                P.check(f"elk {label} {y} {code} comps", bulls + cows + bc + cc, total, tol(total))
                tot += total
                note = f"successPct = GFP success. licenses = resident licenses sold"
                if appl is not None:
                    note += f"; {appl} 1st-choice applicants"
                if notrec:
                    note += f". Elk shot but not recovered: {notrec}"
                P.add(dict(species="elk", year=y, unit=unit_of(code), hunt=code, method=meth, methodLabel=label,
                           hunters=None, harvest=total, harvestMale=bulls + bc, harvestFemale=cows + cc, successPct=succ,
                           licenses=sold, daysHunted=days, note=note + ".", sourceId=sid))
            if printed is not None:  # single-row tables (landowner prairie elk) print no Totals row
                P.check(f"elk {label} {y} sum vs Totals", tot, printed, sumtol(printed))


# ====================================================================== DEER
def deer_hunt_tables(lines, sid):
    specs = [
        (r"^\s*(\d{4}) West River Deer Harvest Projections\s*$", "West River Firearm Deer", "wr"),
        (r"^\s*(\d{4}) East River Deer Harvest Projections\s*$", "East River Firearm Deer", "er"),
        (r"^\s*(\d{4}) Black Hills Deer Harvest Projections\s*$", "Black Hills Firearm Deer", "bh"),
    ]
    for title, label, kind in specs:
        for y, blk in find_tables(lines, title, maxlen=500):
            tot, printed = 0, None
            colsum, totvec = None, None
            for x in blk:
                if re.match(r"^\s*Totals\s", x):
                    t = P.toks(x)
                    c = ci_index(t)
                    printed = N(t[c - 1]) if c else None
                    if c and colsum:
                        totvec = [N(a) for a in t[c - 1 - len(colsum):c - 1]]
                    continue
                m = re.match(rf"^\s*({CODE})\s+(.*)$", x)
                if not m:
                    if re.match(r"^\s*[0-9A-Z]{2,4}-", x) and not re.match(r"^\s*\d{1,2}-[A-Z][a-z]{2}-\d{2}\s", x):
                        P.WARN.append(f"{P.CUR_DOC} deer {label} {y}: unmatched | {x.strip()}")
                    continue
                code, t = m.group(1), P.toks(m.group(2))
                c = ci_index(t)
                if c is None:
                    P.WARN.append(f"{P.CUR_DOC} deer {label} {y} {code}: no CI | {x.strip()}")
                    continue
                lastp = max(i for i in range(c) if t[i].endswith("%"))
                ctoks = t[lastp + 1:c - 1]
                if len(ctoks) == 8:
                    comps, csum = comps8(ctoks)
                elif len(ctoks) == 2:  # buck-only licenses: WT bucks adult, MD bucks adult
                    v = [N(a) for a in ctoks]
                    comps, csum = dict(wt_buck=v[0], md_buck=v[1]), sum(v)
                else:
                    P.WARN.append(f"deer {label} {y} {code}: {len(ctoks)} harvest columns")
                    continue
                total = N(t[c - 1])
                P.check(f"deer {label} {y} {code} comps", csum, total, tol(total))
                tot += total
                cv = [N(a) for a in ctoks]
                colsum = cv if colsum is None else ([a + b for a, b in zip(colsum, cv)] if len(cv) == len(colsum) else colsum)
                left = t[:min(i for i in range(c) if t[i].endswith("%")) + 1]
                pcts_all = [v for v in t[:lastp + 1] if v.endswith("%")]
                hunters = None
                # left = everything up to and including the response-rate cell (first % cell)
                if len(left) < (7 if kind == "er" else 8):
                    # a blank license cell: map the row by word position against its header
                    res = positional(code, t)
                    rs = ns = tags = partial = None
                    if res:
                        pos, _h = res
                        solds = [v for k, h, v in pos if h == "Sold"]
                        tg = [v for k, h, v in pos if h == "sold"]
                        if len(solds) == 2 and len(tg) == 1:
                            rs, ns, tags = N(solds[0]), N(solds[1]), N(tg[0])
                        elif len(solds) == 1 and len(tg) == 1:
                            partial = f"Resident licenses sold {solds[0]}, {tg[0]} tags; GFP left the nonresident-sold cell blank, so licenses is omitted."
                    if rs is None:
                        P.WARN.append(f"{P.CUR_DOC} deer {label} {y} {code}: license cells not fully printed, licenses left null | {x.strip()}")
                    pv = [N(v) for v in pcts_all[1:]]
                    extra = (f"Licenses sold {rs} resident + {ns} nonresident ({tags} tags)." if rs is not None else
                             (partial if partial else "GFP's license cells for this hunt could not be read unambiguously; licenses omitted."))
                    base = dict(year=y, unit=unit_of(code), hunt=code, method="rifle", methodLabel=label,
                                licenses=P.ssum(rs, ns) if rs is not None else None, sourceId=sid)
                    P.deer_split(base, comps, total, pv[-1] if pv else None, "GFP hunter success", extra)
                    continue
                if kind == "er":
                    rap, rav, rs, nav, ns, tags, resp = left[:7]
                elif kind == "wr":
                    rap, rav, rs, nap, nav, ns, tags, resp = left[:8]
                else:
                    rap, rav, rs, nap, nav, ns, hunters, resp = left[:8]
                    tags = None
                pcts = pcts_all[1:]
                rs, ns = N(rs), N(ns)
                pv = [N(v) for v in pcts]
                succ = pv[-1] if pv else None
                slabel = "hunter success" if kind != "bh" else "tag success"
                extra = f"Licenses sold {rs} resident + {ns} nonresident" + (f" ({N(tags)} tags)" if tags else "") + "."
                if hunters is not None:
                    extra += f" GFP hunters (all deer): {N(hunters)}."
                base = dict(year=y, unit=unit_of(code), hunt=code, method="rifle", methodLabel=label,
                            licenses=P.ssum(rs, ns), sourceId=sid)
                P.deer_split(base, comps, total, succ, "GFP " + slabel, extra)
            P.check(f"deer {label} {y} sum vs Totals", tot, printed, sumtol(printed))
            if totvec:
                for ci, (a, b) in enumerate(zip(colsum, totvec)):
                    P.check(f"deer {label} {y} harvest column {ci} rows vs Totals", a, b, max(5, round(0.02 * b)))
            else:
                P.WARN.append(f"{P.CUR_DOC} deer {label} {y}: Totals harvest columns not read")


def lol_left(header, t_left):
    """Return (res_sold, nr_sold, tags) for Landowner-Own-Land tables, using the column order of the header line."""
    h = [w.lower() for w in header.split()[1:]]
    vals = t_left[1:]  # drop resident 'Avail.' (Unltd)
    # header orders seen: avail sold avail sold sold | avail sold sold avail sold | avail sold avail sold hunters
    if h[:5] == ["avail.", "sold", "sold", "avail.", "sold"]:
        rs, tags = vals[0], vals[1]
        ns = vals[-1]
        return N(rs), N(ns), N(tags), None
    if h[:5] == ["avail.", "sold", "avail.", "sold", "hunters"]:
        rs = vals[0]
        hunters = vals[-1]
        ns = vals[-2]
        return N(rs), N(ns), None, N(hunters)
    rs = vals[0]
    tags = vals[-1]
    ns = vals[-2]
    return N(rs), N(ns), N(tags), None


def lol_tokens(label, y, code, t, header, wt_only, sid):
    """Token-order reading of a landowner-own-land row; returns False (caller falls back to word
    positions) when the row's harvest cells do not add up to its printed total."""
    k = 4 if wt_only else 8
    if len(t) < k + 8:
        return False
    total = N(t[-3])
    ctoks = t[-3 - k:-3]
    v = [N(a) for a in ctoks]
    csum = sum(v)
    if abs(csum - total) > tol(total):
        return False
    ROWVEC.append(v)
    comps = comps8(ctoks)[0] if k == 8 else dict(wt_buck=v[0] + v[1], wt_doe=v[2] + v[3])
    hunt_s, tag_s = N(t[-3 - k - 2]), N(t[-3 - k - 1])
    try:
        rs, ns, tags, hunters = lol_left(header, t[:-3 - k - 3])
    except IndexError:
        return False
    P.check(f"deer {label} {y} {code} comps", csum, total, tol(total))
    extra = f"Licenses sold {rs} resident + {ns} nonresident" + (f" ({tags} tags)" if tags is not None else "") + \
            f"; tag success {tag_s}%." + (f" GFP hunters: {hunters}." if hunters is not None else "")
    base = dict(year=y, unit=unit_of(code), hunt=code, method="rifle", methodLabel=label,
                licenses=P.ssum(rs, ns if ns is not None else 0), sourceId=sid)
    P.deer_split(base, comps, total, hunt_s, "GFP hunter success", extra)
    return True


def deer_lol_tables(lines, sid):
    """Landowner-own-land tables. Column order differs between years and some cells are blank, so each
    row is mapped by word position against its header line (pdfplumber); blank harvest cells are read
    as 0 only when the row's printed total then matches."""
    specs = [
        (r"^\s*(\d{4}) West River Landowner Own Land Harvest Projections\s*$", "West River Landowner Own Land Deer"),
        (r"^\s*(\d{4}) East River Landowner Own Land Harvest Projections\s*$", "East River Landowner Own Land Deer"),
        (r"^\s*(\d{4}) Black Hills Landowner Own Land Harvest Projections\s*$", "Black Hills Landowner Own Land Deer"),
    ]
    for title, label in specs:
        for y, blk in find_tables(lines, title):
            header = next((x for x in blk if re.match(r"^\s*Unit", x)), "")
            wt_only = "Mule" not in " ".join(blk[:6])
            ROWVEC.clear()
            totline = next((x for x in blk if re.match(r"^\s*Totals\s", x)), None)
            for x in blk:
                m = re.match(rf"^\s*({CODE})\s+(Unltd.*)$", x)
                if not m:
                    continue
                code, t = m.group(1), P.toks(m.group(2))
                if lol_tokens(label, y, code, t, header, wt_only, sid):
                    continue
                res = positional(code, t)
                if res is None:
                    P.WARN.append(f"{P.CUR_DOC} {label} {y} {code}: row not located in PDF | {x.strip()}")
                    continue
                pos, hdr_words = res
                cols = {}
                dup = False
                for k, h, v in pos:
                    if k in cols:
                        dup = True
                    cols[k] = (h, v)
                if dup:
                    P.WARN.append(f"{P.CUR_DOC} {label} {y} {code}: two cells map to one column {pos}")
                    continue
                pick = lambda name: [cols[k][1] for k in sorted(cols) if cols[k][0] == name]
                sold, tags, hunters, succ, tot_cells = pick("Sold"), pick("sold"), pick("Hunters"), pick("Success"), pick("Harvest")
                if len(tot_cells) != 1 or len(succ) != 2 or not sold:
                    P.WARN.append(f"{P.CUR_DOC} {label} {y} {code}: positional mapping incomplete {pos}")
                    continue
                total = N(tot_cells[0])
                af_idx = [k for k, h in enumerate(hdr_words) if h in ("Adult", "Fawn")]
                vals = [N(cols[k][1]) if k in cols else 0 for k in af_idx]
                blanks = sum(1 for k in af_idx if k not in cols)
                ROWVEC.append(vals)
                if len(af_idx) == 8:
                    comps, csum = comps8([str(v) for v in vals])
                else:
                    comps, csum = dict(wt_buck=vals[0] + vals[1], wt_doe=vals[2] + vals[3]), sum(vals)
                if not P.check(f"deer {label} {y} {code} comps", csum, total, tol(total)):
                    continue
                rs = N(sold[0])
                ns = N(sold[1]) if len(sold) > 1 else None
                tg = N(tags[0]) if tags else None
                hunt_s, tag_s = N(succ[0]), N(succ[1])
                extra = f"Licenses sold {rs} resident + {ns} nonresident" + (f" ({tg} tags)" if tg is not None else "") + \
                        f"; tag success {tag_s}%." + (f" GFP hunters: {N(hunters[0])}." if hunters else "")
                if blanks:
                    extra += f" {blanks} blank harvest cell(s) in GFP's table read as 0 (row total matches)."
                base = dict(year=y, unit=unit_of(code), hunt=code, method="rifle", methodLabel=label,
                            licenses=P.ssum(rs, ns if ns is not None else 0), sourceId=sid)
                P.deer_split(base, comps, total, hunt_s, "GFP hunter success", extra)
            if totline and ROWVEC:
                k = len(ROWVEC[0])
                tt = P.toks(totline)
                tv = [N(a) for a in tt[-3 - k:-3]]
                for ci in range(k):
                    P.check(f"deer {label} {y} column {ci} rows vs Totals", sum(r[ci] for r in ROWVEC), tv[ci], 2)


ROWVEC = []


def deer_special_buck(lines, sid):
    for title, label, nr in ((r"^\s*(\d{4}) West River Special Buck Harvest Projections\s*$", "West River Special Buck Deer", True),
                             (r"^\s*(\d{4}) East River Special Buck Harvest Projections\s*$", "East River Special Buck Deer", False)):
        for y, blk in find_tables(lines, title):
            for x in blk:
                m = re.match(r"^\s*([EW]R-\d{2})\s+(.*)$", x)
                if not m:
                    continue
                code, t = m.group(1), P.toks(m.group(2))
                total = N(t[-3])
                comps, csum = comps8(t[-11:-3])
                P.check(f"deer {label} {y} {code} comps", csum, total, tol(total))
                left = t[:-11]
                tag_s = N(left[-1])
                rs = N(left[2])
                ns = N(left[5]) if nr and len(left) >= 8 else None
                extra = f"Licenses sold {rs} resident" + (f" + {ns} nonresident" if ns is not None else "") + "."
                base = dict(year=y, unit=unit_of(code), hunt=code, method="rifle", methodLabel=label,
                            licenses=P.ssum(rs, ns) if ns is not None else rs, sourceId=sid)
                P.deer_split(base, comps, total, tag_s, "GFP tag success", extra)


def deer_statewide_license_tables(lines, sid):
    """Archery (by residency), muzzleloader, apprentice, youth, mentored youth projections."""
    # --- archery deer (residency rows)
    for y, blk in find_tables(lines, r"^\s*(\d{4}) Archery Deer Harvest Projections\s*$", maxlen=40):
        pending_code = None
        rows = []
        for x in blk:
            mcode = re.match(rf"^\s*({CODE}|Totals|Grand Totals)\s*$", x)
            if mcode:
                c = mcode.group(1)
                if rows and rows[-1][0] is None:
                    rows[-1][0] = c
                pending_code = c
                continue
            m = re.match(rf"^\s*(?:({CODE}|Totals|Grand Totals)\s+)?(?:(Resident|Nonresident)\s+)?(Unlimited|\d[\d,]*)\s+(.*)$", x)
            if not m or "Revised" in x:
                continue
            code, res, t = m.group(1), m.group(2), [m.group(3)] + P.toks(m.group(4))
            if code is None and res == "Nonresident" and pending_code:
                code = pending_code
            if code == "Grand Totals":
                res = None
            rows.append([code, res, t])
        for code, res, t in rows:
            if code in ("Totals", "Grand Totals") or code is None:
                continue
            c = ci_index(t)
            if c is None:
                P.WARN.append(f"archery deer {y} {code} {res}: no CI")
                continue
            comps, csum = comps8(t[c - 9:c - 1])
            total = N(t[c - 1])
            P.check(f"deer archery {y} {code} {res} comps", csum, total, tol(total))
            avail, sold, holders, resp, hunt_s, tag_s = t[:6]
            base = dict(year=y, unit=unit_of(code), hunt=code, method="archery", methodLabel="Archery Deer",
                        residency=(res or "all").lower(), licenses=N(sold), sourceId=sid)
            P.deer_split(base, comps, total, N(hunt_s), "GFP hunter success", f"Tag success {N(tag_s)}%; {N(holders)} license holders.")
    # --- nonresident archery deer projections (2023+)
    for y, blk in find_tables(lines, r"^\s*(\d{4}) Nonresident Archery Deer Harvest Projections\s*$", maxlen=30):
        for x in blk:
            m = re.match(r"^\s*(ADNP?-[A-Z0-9]{3}-\d{2})\s+(.*)$", x)
            if not m:
                continue
            code, t = m.group(1), P.toks(m.group(2))
            c = ci_index(t)
            comps, csum = comps8(t[c - 9:c - 1])
            total = N(t[c - 1])
            P.check(f"deer nr archery {y} {code} comps", csum, total, tol(total))
            avail, sold, resp, tag_s = t[:4]
            base = dict(year=y, unit=unit_of(code), hunt=code, method="archery", methodLabel="Archery Deer — nonresident license types",
                        residency="nonresident", licenses=N(sold), sourceId=sid)
            P.deer_split(base, comps, total, N(tag_s), "GFP tag success", "")
    # --- muzzleloader
    for y, blk in find_tables(lines, r"^\s*(\d{4}) Muzzleloader Deer Harvest Projections\s*$", maxlen=30):
        for x in blk:
            m = re.match(rf"^\s*({CODE})\s+(.*)$", x)
            if not m:
                continue
            code, t = m.group(1), P.toks(m.group(2))
            total = N(t[-3])
            comps, csum = comps8(t[-11:-3])
            P.check(f"deer muzz {y} {code} comps", csum, total, tol(total))
            holders, avail, rs, ns, tags, resp = t[:6]
            pv = [N(v) for v in t[6:-11]]
            hunt_s = pv[0] if len(pv) == 2 else None
            tag_s = pv[-1]
            succ, sl = (hunt_s, "hunter success") if hunt_s is not None else (tag_s, "tag success")
            base = dict(year=y, unit=unit_of(code), hunt=code, method="muzzleloader", methodLabel="Muzzleloader Deer",
                        licenses=P.ssum(N(rs) or 0, N(ns) or 0), sourceId=sid)
            P.deer_split(base, comps, total, succ, "GFP " + sl, f"Licenses sold {N(rs)} resident + {N(ns) if N(ns) is not None else 'NA'} nonresident; {N(tags)} tags.")
    # --- apprentice / youth / mentored youth
    for title, label in ((r"^\s*(\d{4}) Apprentice Deer Harvest Projections\s*$", "Apprentice Deer"),
                         (r"^\s*(\d{4}) Youth Deer Harvest Projections\s*$", "Youth Deer"),
                         (r"^\s*(\d{4}) Mentored Youth Deer Harvest Projections\s*$", "Mentored Youth Deer")):
        for y, blk in find_tables(lines, title, maxlen=30):
            for x in blk:
                m = re.match(rf"^\s*({CODE}|Statewide)\s+(\d.*)$", x)
                if not m or m.group(1) == "Statewide":
                    continue  # statewide season totals come from GFP's multi-year comparison table
                code, t = m.group(1), P.toks(m.group(2))
                total = N(t[-3])
                comps, csum = comps6(t[-9:-3])
                P.check(f"deer {label} {y} {code} comps", csum, total, tol(total))
                holders, avail, rs, ns = t[:4]
                pv = [N(v) for v in t[4:-9] if v.endswith("%")]
                resp = pv[0]
                succ = pv[-1]
                sl = "hunter success" if len(pv) == 3 else "tag success"
                base = dict(year=y, unit="Statewide" if code == "Statewide" else unit_of(code), hunt=None if code == "Statewide" else code,
                            method=None, methodLabel=label + " (statewide license)",
                            licenses=P.ssum(N(rs), N(ns) or 0), sourceId=sid)
                P.deer_split(base, comps, total, succ, "GFP " + sl, f"Licenses sold {N(rs)} resident + {N(ns)} nonresident. Antlerless license: male harvest = buck fawns.")


def deer_refuges(lines, sid):
    for y, blk in find_tables(lines, r"^\s*(\d{4}) (?:Sand Lake|Lacreek|Waubay) Refuge Deer Harvest Projections\s*$", maxlen=20):
        pass
    for i, l in enumerate(lines):
        m = re.match(r"^\s*(\d{4}) (Sand Lake|Lacreek|Waubay) Refuge Deer Harvest Projections\s*$", l)
        if not m:
            continue
        y, refuge = int(m.group(1)), m.group(2)
        for x in lines[i + 1:i + 20]:
            mm = re.match(rf"^\s*({CODE})\s+(.*)$", x)
            if not mm:
                if re.match(r"^\s*(Licenses|Totals)\s", x):
                    break
                continue
            code, t = mm.group(1), P.toks(mm.group(2))
            total = N(t[-3])
            v = [N(a) for a in t[-7:-3]]
            P.check(f"deer refuge {y} {code} comps", sum(v), total, 2)
            rap, rav, rs, nap, nav, ns = [N(a) for a in t[:6]]
            pv = [N(a) for a in t[6:-7]]
            succ = pv[-1]
            sl = "tag success"
            add = f"Licenses sold {rs} resident + {ns} nonresident; {rap} resident 1st-choice applicants."
            if len(pv) == 3:
                add += f" Hunter success {pv[1]}%."
            P.add(dict(species="whitetail", year=y, unit=unit_of(code), unitName=f"{refuge} National Wildlife Refuge", hunt=code,
                       method=None, methodLabel="National Wildlife Refuge Deer", hunters=None, harvest=total,
                       harvestMale=v[0] + v[1], harvestFemale=v[2] + v[3], successPct=succ, licenses=P.ssum(rs, ns),
                       daysHunted=N(t[-1]),
                       note=f"successPct = GFP {sl}. GFP's refuge tables list whitetail only. " + add, sourceId=sid))


DEER_DIST = [
    (r"^\s*(\d{4}) Archery Deer Harvest Distribution by Management Unit\s*$", "Archery Deer — harvest by unit", "archery", "all", 8),
    (r"^\s*(\d{4}) Resident Archery Deer Harvest Dist(?:ribution)?(?: by Management Unit)?\s*$", "Archery Deer — harvest by unit", "archery", "resident", 8),
    (r"^\s*(\d{4}) Nonresident Archery Deer Harvest Dist(?:ribution)?(?: by Management Unit)?\s*$", "Archery Deer — harvest by unit", "archery", "nonresident", 8),
    (r"^\s*(\d{4}) Muzzleloader Deer Harvest Distribution by Management Unit\s*$", "Muzzleloader Deer — harvest by unit", "muzzleloader", "all", 8),
    (r"^\s*(\d{4}) Apprentice Deer Harvest Distribution(?: by Management Unit)?\s*$", "Apprentice Deer — harvest by unit", None, "all", 6),
    (r"^\s*(\d{4}) Youth Deer Harvest Distribution by Management Unit\s*$", "Youth Deer — harvest by unit", None, "all", 6),
    (r"^\s*(\d{4}) Mentored Youth Deer Harvest Distribution by Management Unit\s*$", "Mentored Youth Deer — harvest by unit", None, "all", 6),
    (r"^\s*(\d{4}) Statewide (?:Free )?Antlerless LOL Harvest Distribution\s*$", "Free Landowner Own Land Antlerless Deer — harvest by unit", None, "all", 3),
    (r"^\s*(\d{4}) West River LOL Harvest Distribution(?: by Management Unit)?\s*$", "West River Landowner Own Land Deer — harvest by unit", "rifle", "all", 8),
    (r"^\s*(\d{4}) East River LOL Harvest Distribution(?: by Management Unit)?\s*$", "East River Landowner Own Land Deer — harvest by unit", "rifle", "all", 8),
    (r"^\s*(\d{4}) West River Special Buck Harvest Distribution\s*$", "West River Special Buck Deer — harvest by unit", "rifle", "all", 8),
    (r"^\s*(\d{4}) East River Special Buck Harvest Distribution\s*$", "East River Special Buck Deer — harvest by unit", "rifle", "all", 8),
]


DEER_DIST_ROW = re.compile(r"^\s*([0-9A-Z]{2,5}(?:,[A-Z]{1,2})*)\s+\(([^)]*)\)\s+(\d.*)$")


def deer_distributions(lines, sid):
    for title, label, meth, res, k in DEER_DIST:
        for y, blk in find_tables(lines, title):
            tot, printed = 0, None
            dcol, dtot = None, None
            has_mule = any("Mule" in b for b in blk[:6])
            for x in blk:
                if re.match(r"^\s*TOTALS\s", x):
                    tt = P.toks(x)[1:]
                    printed = N(tt[-1])
                    dtot = [N(a) for a in tt[:-1]]
                    continue
                m = DEER_DIST_ROW.match(x)
                if not m:
                    if re.match(r"^\s*[0-9A-Z]{2,5}\b.*\d", x) and not re.match(r"^\s*(TOTALS|Unknown|\d{1,2}-[A-Z][a-z]{2}-\d{2}\s)", x):
                        P.WARN.append(f"{P.CUR_DOC} deer dist {label} {y}: unmatched row | {x.strip()}")
                    continue
                code, name, t = m.group(1), m.group(2), P.toks(m.group(3))
                k = len(t) - 2
                if k not in (3, 6, 8) or (k == 6 and not has_mule):
                    P.WARN.append(f"{P.CUR_DOC} deer dist {label} {res} {y} {code}: {len(t)} tokens | {x.strip()}")
                    continue
                total = N(t[k])
                v = [N(a) for a in t[:k]]
                if k == 8:
                    comps = dict(wt_buck=v[0] + v[1], wt_doe=v[2] + v[3], md_buck=v[4] + v[5], md_doe=v[6] + v[7])
                elif k == 6:
                    comps = dict(wt_buck=v[0], wt_doe=v[1] + v[2], md_buck=v[3], md_doe=v[4] + v[5])
                else:
                    comps = dict(wt_buck=v[0], wt_doe=v[1] + v[2])
                P.check(f"deer dist {y} {label} {res} {code}", sum(v), total, 2)
                tot += total
                dcol = v if dcol is None else ([a + b for a, b in zip(dcol, v)] if len(v) == len(dcol) else dcol)
                for sp in ("whitetail", "mule-deer"):
                    cur = P.UNIT_NAMES[sp].get(code)
                    if not cur or y >= cur[0]:
                        P.UNIT_NAMES[sp][code] = (y, name)
                for sp, pre, nm in (("whitetail", "wt", "whitetail"), ("mule-deer", "md", "mule deer")):
                    if pre + "_buck" not in comps:
                        continue
                    mm, ff = comps[pre + "_buck"], comps[pre + "_doe"]
                    P.add(dict(species=sp, year=y, unit=code, unitName=name, method=meth, methodLabel=label, residency=res,
                               hunters=None, harvest=mm + ff, harvestMale=mm, harvestFemale=ff, successPct=None,
                               note=f"GFP projected {nm} harvest (bucks + does) by the unit where the deer was taken, all deer {total}. "
                                    "GFP does not report hunters or success by unit for this license.",
                               sourceId=sid))
            P.check(f"deer dist {y} {label} {res} sum vs TOTALS", tot, printed, disttol(printed))
            if dcol and dtot and len(dcol) == len(dtot):
                for ci, (a, b) in enumerate(zip(dcol, dtot)):
                    P.check(f"deer dist {y} {label} {res} column {ci} rows vs TOTALS", a, b, max(10, round(0.12 * b)))
            else:
                P.WARN.append(f"{P.CUR_DOC} deer dist {label} {res} {y}: TOTALS columns not comparable {dtot}")


# ====================================================================== driver
def documents():
    raw = P.RAW
    docs = []
    for y in range(2020, 2025):
        docs.append((P.annual_source(y), os.path.join(raw, "annual", f"bg_annual_{y}.txt")))
    by_url = {s["url"]: sid for sid, s in P.SOURCES.items()}
    for path in sorted(glob.glob(os.path.join(raw, "*.txt"))):
        fname = os.path.basename(path)[:-4]
        url = P.HR + fname.replace("_", "%20") + ".pdf"
        if url in by_url:
            docs.append((by_url[url], path))
    for path in sorted(glob.glob(os.path.join(raw, "wayback", "*.txt"))):
        fname = os.path.basename(path)[:-4].split("_", 1)[1]
        title = "2025 " + fname.replace("_", " ").title().replace("Of", "of") + " harvest report"
        docs.append((P.wayback_source(fname, 2025, title), path))
    return docs


def run(mod):
    global P
    P = mod
    for sid, path in documents():
        lines = P.read(path)
        P.CUR_DOC = os.path.basename(path)
        P.CUR_PATH = path
        spring_prairie_turkey(lines, sid)
        fall_prairie_turkey(lines, sid)
        turkey_distribution(lines, sid)
        names = {}
        for y, blk in find_tables(lines, r"^\s*(\d{4}) Firearm Antelope Harvest Projections\s*$"):
            pass
        n = firearm_antelope(lines, sid)
        # names for LOL distribution: use the firearm table of the same document (same year)
        yrs = {y for y, _ in find_tables(lines, r"^\s*(\d{4}) Firearm Antelope Harvest Projections\s*$")}
        for y in yrs:
            names[y] = n
        antelope_distribution(lines, sid, names)
        elk_projections(lines, sid)
        deer_hunt_tables(lines, sid)
        deer_lol_tables(lines, sid)
        deer_special_buck(lines, sid)
        deer_statewide_license_tables(lines, sid)
        deer_refuges(lines, sid)
        deer_distributions(lines, sid)
