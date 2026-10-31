"""Elk hunt-code tables ("<year> New Mexico Elk Hunter Harvest Report").

Columns: Licenses Sold, # Hunters Reporting, Percent Reporting, Success Rate,
Estimated Harvest Bulls, Cows, Satisfaction Rating, Days Hunted.
Rows with an ELK-x-yyy code are public draw hunts; rows without a code are
private-land authorizations (bag MB / A / ES ...), sometimes prefixed with the
sub-unit they belong to ("30 REG", "55A REG").
"""
import os
import re

from harvest_common import _FRAGS, is_num_tok, read_pages, to_int, to_pct

CODE_RE = re.compile(r"\b(ELK-\d-\d{3})\b")
BAG_RE = re.compile(r"^(ES|MB|A|MB/A|APRE/6|APRE/6/A)$")
UNIT_TOK = re.compile(r"^\d{1,2}[A-Z]?(?:/\d{1,2}[A-Z]?)*$")
LABEL_RE = re.compile(r"\bGMU\s+(\d{1,2}[A-Z]?(?:\s*/\s*\d{1,2}[A-Z]?)*)\b")
SKIP_TOTALS = ("Region", "Zones", "Special Authorizations", "Population Management", "STATEWIDE")


def eight(tokens, i):
    """Return the 8 numeric cells starting at tokens[i], or None."""
    cells = tokens[i:i + 8]
    if len(cells) == 8 and all(is_num_tok(t) for t in cells):
        return cells
    return None


def map8(c):
    sold, rep, pct, succ, bulls, cows, sat, days = c
    return {
        "licenses": to_int(sold),
        "reporting": to_int(rep),
        "successPct": to_pct(succ),
        "bulls": to_int(bulls),
        "cows": to_int(cows),
    }


def parse(raw_dir, key, log):
    pages = read_pages(os.path.join(raw_dir, key + ".txt"))
    hunts, totals, statewide = [], [], None
    block, labels = [], []
    gmu_dangling = False
    pending_statewide = False
    seen_private = {}  # (unit, bag, cells) -> row, to detect rows repeated in combined blocks
    for pi, page in enumerate(pages):
        for line in page.splitlines():
            if not line.strip():
                continue
            toks = line.split()
            if pending_statewide and len(toks) == 8 and all(is_num_tok(t) for t in toks):
                statewide = map8(toks)
                pending_statewide = False
                continue
            if "STATEWIDE TOTALS" in line:
                pending_statewide = True
                continue
            m = CODE_RE.search(line)
            if re.search(r"\bTotals\b", line) and not m:
                ti = toks.index("Totals")
                cells = eight(toks, ti + 1)
                label = " ".join(toks[:ti])
                if cells is None:
                    continue
                if any(s in label for s in SKIP_TOTALS):
                    if block:
                        log.append(f"{key}: skipped block '{label}' ({len(block)} rows)")
                    block, labels = [], []
                    continue
                if not block and not labels:
                    # multi-GMU herd-unit aggregate (e.g. Greater Gila = 15, 16A-E) printed after its GMU totals
                    log.append(f"{key}: skipped aggregate totals '{label}' ({cells[0]} licenses)")
                    continue
                tm = re.search(r"GMU\s+(\S+)$", label)
                tlabel = tm.group(1) if tm else None
                labs = sorted(set(labels))
                if len(labs) == 1:
                    unit = labs[0]
                elif not labs and tlabel:
                    unit = tlabel
                else:
                    raise ValueError(f"{key} p{pi+1}: labels {labs} for totals '{label}'")
                if tlabel and tlabel != unit:
                    log.append(f"{key}: block label GMU {unit} but totals line reads 'GMU {tlabel} Totals'")
                t = map8(cells)
                t.update(unit=unit, label=label, page=pi + 1)
                dropped = [r for r in block if r.get("duplicate_of")]
                kept = [r for r in block if not r.get("duplicate_of")]
                sl = sum(r["licenses"] or 0 for r in block)
                if sl != t["licenses"]:
                    log.append(f"{key}: unit {unit} sum of row licenses {sl} != totals {t['licenses']}")
                for r in kept:
                    r.setdefault("unit", unit)
                    r["block"] = unit
                    if not r["code"]:
                        seen_private[(r["unit"], r["bag"], tuple(r["cells"]))] = r
                hunts.extend(kept)
                if dropped:
                    t["combined"] = True
                    log.append(
                        f"{key}: block GMU {unit}: {len(dropped)} private rows repeat rows already listed under "
                        f"{sorted({r['duplicate_of'] for r in dropped})}; rows and block total not emitted"
                    )
                else:
                    totals.append(t)
                block, labels = [], []
                continue
            # unit labels (left part of the line only)
            left = line[:30]
            for lm in LABEL_RE.finditer(left):
                labels.append(lm.group(1).replace(" ", ""))
            if gmu_dangling and toks and UNIT_TOK.match(toks[0]):
                labels.append(toks[0])
            gmu_dangling = bool(re.match(r"^\s*GMU\s*$", line))
            # data rows
            if m:
                after = line[m.end():].split()
                bi = next((i for i, t in enumerate(after) if BAG_RE.match(t) and eight(after, i + 1)), None)
                if bi is None:
                    raise ValueError(f"{key} p{pi+1}: cannot parse {line.strip()}")
                weapon = after[0] if after and after[0].lower() in ("archery", "muzzleloader", "rifle") else None
                dates = " ".join(after[1 if weapon else 0:bi])
                before = line[: m.start()].split()
                typ = []
                skip_next = False
                for t in before:
                    if skip_next:
                        skip_next = False
                        continue
                    if t == "GMU":
                        skip_next = True
                        continue
                    if t.lower() in _FRAGS and not t.isupper():
                        continue
                    typ.append(t)
                cells = eight(after, bi + 1)
                r = map8(cells)
                r.update(code=m.group(1), bag=after[bi], weapon=weapon, dates=dates,
                         type=" ".join(typ), cells=cells, page=pi + 1)
                block.append(r)
                continue
            bi = next((i for i, t in enumerate(toks) if BAG_RE.match(t) and eight(toks, i + 1)), None)
            if bi is None:
                continue
            cells = eight(toks, bi + 1)
            sub = None
            # "30 REG A ..." / "55A REG ES ..." -> private rows of sub-unit 30 / 55A
            if bi >= 2 and UNIT_TOK.match(toks[bi - 2]) and not re.search(r"GMU\s{1,3}" + re.escape(toks[bi - 2]) + r"\b", line):
                sub = toks[bi - 2]
            r = map8(cells)
            r.update(code=None, bag=toks[bi], weapon=None, dates="", type=toks[bi - 1] if bi >= 1 else "",
                     cells=cells, page=pi + 1)
            if sub:
                r["unit"] = sub
                prev = seen_private.get((sub, toks[bi], tuple(cells)))
                if prev is not None:
                    r["duplicate_of"] = sub
            block.append(r)
    if block:
        log.append(f"{key}: {len(block)} rows after the last totals line were dropped")
    return hunts, totals, statewide
