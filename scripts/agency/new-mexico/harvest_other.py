"""Bighorn sheep, turkey, black bear and cougar tables (New Mexico)."""
import os
import re

from harvest_common import bbox_words, is_num_tok, read_pages, to_float, to_int, to_pct


def _txt(raw_dir, key):
    with open(os.path.join(raw_dir, key + ".txt"), encoding="utf-8", errors="replace") as f:
        return f.read()


# ------------------------------------------------------------------ bighorn sheep
SHEEP_CODE = re.compile(r"\bBHS[ -](\d)-(\d{3})\b")
SHEEP_AREAS = ("Pecos", "Rio Grande Gorge")


def _sheep_cells(tokens):
    """sold, reporting, %reporting, success, rams, ewes, satisfaction, days ('.' = blank)."""
    cells = tokens[-8:]
    ok = len(cells) == 8 and all(is_num_tok(t) or t == "." for t in cells)
    return cells if ok else None


def parse_sheep(raw_dir, key, log):
    text = _txt(raw_dir, key)
    rows, total = [], None
    seen = {}
    last = None
    for line in text.splitlines():
        toks = line.split()
        if not toks:
            continue
        m = SHEEP_CODE.search(line)
        if m:
            code = f"BHS-{m.group(1)}-{m.group(2)}"
            cells = _sheep_cells(toks)
            if cells is None:
                raise ValueError(f"{key}: cannot parse sheep row {line}")
            low = line.lower()
            land = None
            for word, lab in (("auction", "Auction"), ("raffle", "Raffle"), ("private", "Private"), ("public", "Public")):
                if re.search(r"\b" + word + r"\b", low):
                    land = lab
            seen[code] = seen.get(code, 0) + 1
            if land is None:
                # Public rows are listed first; a code repeated below them is the private-land row.
                land = "Public" if seen[code] == 1 else "Private"
            after = line[m.end():].split()
            weapon = "Bow" if "Bow" in after else ("Any legal" if ("Any" in after or "legal" in after) else None)
            bag = "Ram" if "Ram" in after else ("Ewe" if "Ewe" in after else None)
            last = dict(code=code, land=land, weapon=weapon, bag=bag, cells=cells, area=None)
            rows.append(last)
            continue
        area = next((a for a in SHEEP_AREAS if a in line), None)
        if area and last is not None:
            cells = _sheep_cells(toks)
            if cells:
                rows.append(dict(code=last["code"], land=last["land"], weapon=last["weapon"], bag=last["bag"],
                                 cells=cells, area=area))
            continue
        cells = _sheep_cells(toks)
        if cells and (all(is_num_tok(t) or t == "." for t in toks) or "Totals" in line):
            total = cells
    if total is None:
        raise ValueError(f"{key}: no total line")
    s = sum(to_int(r["cells"][0]) for r in rows if r["area"] is None)
    if s != to_int(total[0]):
        log.append(f"{key}: sheep sum of hunt licenses {s} != total {total[0]}")
    return rows, total


# ------------------------------------------------------------------ turkey
def _norm(s):
    return re.sub(r"\s+", " ", s)


def turkey_statewide(raw_dir, key, season):
    """Licenses sold, estimated hunters and estimated harvest from the report narrative."""
    t = _norm(_txt(raw_dir, key))
    lic = re.search(r"There were ([\d,]+) " + season + r" turkey licenses sold", t)
    hunters = re.search(r"estimated (?:total )?number of " + season + r" hunters was ([\d,]+)", t)
    harvest = re.search(r"estimated (?:total of |number of |total number of )?" + season + r" turkeys harvested was ([\d,]+)", t)
    reporting = re.search(r"([\d,]+) (?:license holders )?(?:\(\d+%\) )?said (?:that )?they went hunting", t)
    out = {
        "licenses": to_int(lic.group(1)) if lic else None,
        "hunters": to_int(hunters.group(1)) if hunters else None,
        "harvest": to_int(harvest.group(1)) if harvest else None,
    }
    if season == "fall":
        sx = re.search(r"fall turkeys harvested was [\d,]+, with an estimated ([\d,]+) hens and ([\d,]+) (?:toms|gobblers)", t)
        if sx:
            out["hens"], out["toms"] = to_int(sx.group(1)), to_int(sx.group(2))
    return out


GMU_TOK = re.compile(r"^(\d{1,2}|UNK)(\*{0,2})$")


def parse_turkey(raw_dir, key, log):
    """Return (spring_rows, fall_rows, spring_total, fall_total)."""
    pages = read_pages(os.path.join(raw_dir, key + ".txt"))
    bbox = bbox_words(os.path.join(raw_dir, key + ".pdf"))
    spring, fall = [], []
    s_total = f_total = None
    table = None
    for pi, page in enumerate(pages):
        for line in page.splitlines():
            if re.match(r"\s*Table 2\.", line):
                table = "spring"
                continue
            if re.match(r"\s*Table 3\.", line):
                table = "fall"
                continue
            if table is None:
                continue
            toks = line.split()
            if not toks:
                continue
            if toks[0] == "TOTAL":
                pct = next(i for i, t in enumerate(toks) if t.endswith("%"))
                vals = dict(hunters=to_int(toks[1]), days=to_int(toks[2]), harvest=to_int(toks[3]),
                            successPct=to_pct(toks[pct]))
                if table == "spring":
                    s_total = vals
                else:
                    f_total = vals
                    table = None
                continue
            gm = GMU_TOK.match(toks[0])
            if not gm or len(toks) < 4:
                continue
            pct_i = next((i for i, t in enumerate(toks) if t.endswith("%")), None)
            if pct_i is None:
                # GMU row with hunters and days only (harvest and success cells blank), e.g. "3*  4  13  3.0"
                if len(toks) == 4 and re.fullmatch(r"[\d,]+", toks[1]) and re.fullmatch(r"[\d,]+", toks[2]) \
                        and re.fullmatch(r"\d(\.\d)?", toks[3]):
                    row = dict(gmu=gm.group(1), flag=gm.group(2), page=pi + 1, raw=line.strip(),
                               hunters=to_int(toks[1]), days=to_int(toks[2]), harvest=None, successPct=None)
                    if table == "spring":
                        row["first"] = None
                        spring.append(row)
                    else:
                        row["hens"] = row["gobblers"] = None
                        fall.append(row)
                continue
            ints = toks[1:pct_i]
            if not all(re.fullmatch(r"[\d,]+", t) for t in ints):
                continue
            row = dict(gmu=gm.group(1), flag=gm.group(2), page=pi + 1, raw=line.strip())
            if table == "spring":
                if len(ints) == 4:
                    row.update(hunters=to_int(ints[0]), days=to_int(ints[1]), harvest=to_int(ints[2]), first=to_int(ints[3]))
                elif len(ints) == 2:
                    row.update(hunters=to_int(ints[0]), days=to_int(ints[1]), harvest=None, first=None)
                else:
                    raise ValueError(f"{key}: spring row with {len(ints)} counts: {line}")
                row["successPct"] = to_pct(toks[pct_i])
                spring.append(row)
            else:
                if len(ints) == 3:
                    row.update(hunters=to_int(ints[0]), days=to_int(ints[1]), harvest=to_int(ints[2]))
                elif len(ints) == 2:
                    row.update(hunters=to_int(ints[0]), days=to_int(ints[1]), harvest=None)
                else:
                    raise ValueError(f"{key}: fall row with {len(ints)} counts: {line}")
                row["successPct"] = to_pct(toks[pct_i])
                rest = toks[pct_i + 2:]  # after the hunter rating
                row["hens"], row["gobblers"] = _fall_sex(bbox[pi], toks, pct_i, rest, key)
                fall.append(row)
    return spring, fall, s_total, f_total


_LAST_HDR = {}


def _fall_sex(words, toks, pct_i, rest, key):
    """Hens / Gobblers cells of a fall row; uses x positions when some cells are blank."""
    if len(rest) == 4:
        return to_int(rest[0]), to_int(rest[1])
    if not rest:
        return None, None
    # header word centres on this page
    hdr = {}
    for w in words:
        if w["text"] in ("Hens", "Gobblers", "Sept", "Nov"):
            hdr[w["text"]] = (w["x0"] + w["x1"]) / 2
    if len(hdr) < 4:
        hdr = _LAST_HDR.get(key, {})  # table continued on a page without its header
    if len(hdr) < 4:
        raise ValueError(f"{key}: fall header columns not found")
    _LAST_HDR[key] = hdr
    # locate the row's words: same GMU token and hunters on one line
    groups = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if groups and abs(groups[-1][0] - w["top"]) <= 2.5:
            groups[-1][1].append(w)
        else:
            groups.append([w["top"], [w]])
    target = None
    for _, ws in groups:
        ws = sorted(ws, key=lambda w: w["x0"])
        texts = [w["text"] for w in ws]
        if texts[: pct_i + 2] == toks[: pct_i + 2] and len(texts) == len(toks):
            target = ws
            break
    if target is None:
        raise ValueError(f"{key}: cannot locate fall row {' '.join(toks)} in bbox words")
    hens = gob = None
    for w in target[pct_i + 2:]:
        xc = (w["x0"] + w["x1"]) / 2
        col = min(hdr, key=lambda k: abs(hdr[k] - xc))
        if col == "Hens":
            hens = to_int(w["text"])
        elif col == "Gobblers":
            gob = to_int(w["text"])
    return hens, gob


# ------------------------------------------------------------------ bear / cougar mortality by zone
def parse_mortality_zones(raw_dir, key, kind, min_year=2020):
    """Return {year: {"rows": [...], "total": [...]}} from the by-zone tables.

    kind "bear": columns Sport F/M/U, Depredation F/M/U, Road kill/Other F/M/U, Totals (10 numbers).
    kind "lion": Sport F/M/U, Depredation F/M/U, Roadkill/Other F/M/U, Bighorn Sheep Removal F/M/U, Totals (13).
    """
    ncols = 10 if kind == "bear" else 13
    pages = read_pages(os.path.join(raw_dir, key + ".txt"))
    lines = [l for p in pages for l in p.splitlines()]
    out = {}
    year = None
    tab = None
    for line in lines:
        tm = re.match(r"\s*Table \d+\. (?:Black Bear|Cougar) Mortality in New Mexico, (\d{4})", line)
        if tm:
            year = int(tm.group(1))
            tab = out.setdefault(year, {"rows": [], "total": None, "lines": []}) if year >= min_year else None
            continue
        if tab is None:
            continue
        if kind == "bear":
            rm = re.match(r"^\s*(\d{1,2}|N/A)\s+(\d[\d ,\-]*?)\s{2,}(\d.*)$", line)
        else:
            rm = re.match(r"^\s*([A-Z])\s+(\d[\d ,\-]*?)\s{2,}(\d.*)$", line)
        st = re.match(r"^\s*(?:Statewide Totals)?\s+(\d+(?:\s+\d+){%d})\s*$" % (ncols - 1), line)
        if rm:
            tab["rows"].append((rm.group(1), rm.group(2).strip(), line, rm.end(2)))
        elif st and tab["rows"] and tab["total"] is None:
            tab["total"] = [int(x) for x in st.group(1).split()]
            tab["total_line"] = line
    # resolve cells by character columns (blank cells are possible)
    for year, tab in out.items():
        full = [l for _, _, l, _ in tab["rows"] if len(_num_spans(l)) >= ncols]
        if not full:
            raise ValueError(f"{key} {year}: no complete rows")
        ends = []
        for l in full:
            ends.append([e for (_, e, _) in _num_spans(l)[-ncols:]])
        col_end = [sorted(e[i] for e in ends)[len(ends) // 2] for i in range(ncols)]
        rows = []
        for zone, gmus, l, gend in tab["rows"]:
            spans = _num_spans(l)
            # drop the zone id and the numbers that belong to the GMU list
            spans = [s for s in spans if s[0] >= gend]
            cells = [None] * ncols
            if len(spans) == ncols:
                cells = [int(v) for (_, _, v) in spans]
            else:
                for (_, e, v) in spans:
                    j = min(range(ncols), key=lambda i: abs(col_end[i] - e))
                    if cells[j] is not None:
                        raise ValueError(f"{key} {year}: column clash in {l}")
                    cells[j] = int(v)
            rows.append({"zone": zone, "gmus": gmus, "cells": cells, "line": l.strip()})
        tab["rows"] = rows
    return out


def _num_spans(line):
    return [(m.start(), m.end(), m.group()) for m in re.finditer(r"(?<![\w,-])\d+(?![\w,-])", line)]


def parse_mortality_statewide(raw_dir, key, kind):
    """Return {year: [sport F, M, U]} from the statewide Table 1 (year = license year start)."""
    out = {}
    for line in _txt(raw_dir, key).splitlines():
        m = re.match(r"^\s*(\d{4})-(\d{2})\s+(\d+)\s+(\d+)\s+(\d+)\s", line)
        if m:
            out[int(m.group(1))] = [int(m.group(3)), int(m.group(4)), int(m.group(5))]
    return out
