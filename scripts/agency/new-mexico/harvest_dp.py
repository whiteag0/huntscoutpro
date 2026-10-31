"""Deer and pronghorn hunt-code tables (NMDGF "Deer Harvest Report" / "Pronghorn Harvest Report").

Columns (2021+ deer, 2024+ pronghorn): Licenses Sold, # Hunters Reporting, Percent
Reporting, Estimated Hunters, Success Rate, Estimated Harvest Bucks, Does,
Satisfaction Rating, Days Hunted. Older reports have no Estimated Hunters column.
"""
import os
import re

from harvest_common import is_data_tokens, is_num_tok, land_rows_by_page, read_pages, to_int, to_pct

CODE_RE = re.compile(r"\b((?:DER|ANT)-\d-?\d{3,4})\b")
LABEL_RE = re.compile(
    r"^\s{0,16}(?P<lab>\d{1,2}[A-Z]?(?:\s*(?:,|/|&|-|and)\s*\d{1,2}[A-Z]?)*(?:(?: (?!(?:Public|Private|REG|YOUTH|MIP|MIL)\b)[A-Z][A-Za-z.]*)+)?)(?=\s{2,}|\s*$)"
)
WEAPONS = {"rifle": "rifle", "archery": "archery", "muzzleloader": "muzzleloader", "shotgun": "shotgun"}


def bag_sex(bag):
    b = bag.upper()
    if b in ("FAD", "FAMD", "FAWTD", "MB"):
        return "male"
    if b in ("ES", "ESWTD", "ESMD"):
        return "either"
    if b == "A":
        return "female"
    return None


def parse_tail(tokens):
    """Split trailing numeric tokens off a token list. Returns (head, nums)."""
    i = len(tokens)
    while i > 0 and is_num_tok(tokens[i - 1]):
        i -= 1
    return tokens[:i], tokens[i:]


def map_nums(nums):
    if len(nums) == 9:
        sold, rep, pct, est, succ, bucks, does, sat, days = nums
    elif len(nums) == 8:
        sold, rep, pct, succ, bucks, does, sat, days = nums
        est = None
    elif len(nums) == 6:
        # 2025 deer: a license holder reported but did not hunt -> Estimated Hunters 0,
        # Success / Satisfaction / Days cells are blank; Bucks and Does print 0.
        sold, rep, pct, est, bucks, does = nums
        succ = sat = days = "-"
    else:
        raise ValueError(f"unexpected numeric tail {nums}")
    return {
        "licenses": to_int(sold),
        "reporting": to_int(rep),
        "hunters": to_int(est) if est is not None else None,
        "successPct": to_pct(succ),
        "bucks": to_int(bucks),
        "does": to_int(does),
        "has_est": est is not None,
    }


def parse(raw_dir, key, log):
    """Return (hunt_rows, gmu_total_rows, statewide_row) parsed from one report."""
    txt = os.path.join(raw_dir, key + ".txt")
    pdf = os.path.join(raw_dir, key + ".pdf")
    pages = read_pages(txt)
    land_pages = land_rows_by_page(pdf)
    hunts, totals, statewide = [], [], None
    block, labels = [], []
    pending_statewide = False
    pending_total = None
    for pi, page in enumerate(pages):
        page_rows = []
        for line in page.splitlines():
            if not line.strip():
                continue
            toks = line.split()
            m = CODE_RE.search(line)
            if pending_statewide and toks and all(is_num_tok(t) for t in toks) and len(toks) >= 8:
                statewide = map_nums(toks)
                pending_statewide = False
                continue
            if pending_total and toks and all(is_num_tok(t) for t in toks) and len(toks) >= 8:
                # "GMU 23 Total" label printed above its numbers (2020 deer layout)
                line = pending_total + "   " + line
                toks = line.split()
                pending_total = None
            if re.search(r"\bTotals?\b", line) and not m:
                head, nums = parse_tail(toks)
                label = " ".join(head)
                if "Statewide" in line:
                    if len(nums) >= 8:
                        statewide = map_nums(nums)
                    else:
                        pending_statewide = True
                    block, labels = [], []
                    continue
                tm = re.search(r"GMU\s*(.*?)\s*Total", label)
                if not tm:
                    # "Special Hunts Total" / "Enhancement Total": statewide special licenses, skipped
                    log.append(f"{key}: skipped block '{label}' ({len(block)} rows)")
                    block, labels = [], []
                    continue
                if len(nums) < 8:
                    if not nums and tm:
                        pending_total = line.strip()
                    continue
                tlabel = tm.group(1).strip()
                labs = sorted(set(labels))
                if not labs and not tlabel and not any(r["code"] for r in block):
                    # "Special Hunts" block (enhancement, auction, PCRP, ranch-wide): no GMU, no hunt codes
                    log.append(f"{key}: skipped unlabeled special-hunts block, total licenses {nums[0]}")
                    block, labels = [], []
                    continue
                sub = []
                if len(labs) > 1 and tlabel and (tlabel in labs or all(l.startswith(tlabel) for l in labs)):
                    sub = [l for l in labs if l != tlabel]
                    unit = tlabel
                    log.append(f"{key}: GMU {tlabel} total covers sub-areas {sub}; rows assigned to {tlabel}")
                elif len(labs) > 1 and not tlabel and len({re.match(r"\d{1,2}", l).group() for l in labs}) == 1 \
                        and all(re.fullmatch(r"\d{1,2}[A-Z]?( [A-Za-z ]+)?", l) for l in labs):
                    unit = re.match(r"\d{1,2}", labs[0]).group()
                    sub = labs
                    log.append(f"{key}: unlabeled GMU total covers sub-areas {sub}; rows assigned to {unit}")
                elif len(labs) == 1:
                    unit = labs[0]
                elif not labs and tlabel:
                    unit = tlabel
                else:
                    raise ValueError(f"{key} page {pi+1}: block labels {labs} total label '{tlabel}'")
                if tlabel and tlabel.replace(" ", "") != unit.replace(" ", ""):
                    log.append(f"{key}: block label '{unit}' vs total label 'GMU {tlabel}'")
                t = map_nums(nums)
                t.update(unit=unit, page=pi + 1)
                sl = sum((r["licenses"] or 0) for r in block)
                if sl != t["licenses"]:
                    log.append(f"{key}: unit {unit} sum of row licenses {sl} != GMU total {t['licenses']}")
                for r in block:
                    r["unit"] = unit
                    if sub:
                        r["subareas"] = sub
                hunts.extend(block)
                totals.append(t)
                block, labels = [], []
                continue
            lm = LABEL_RE.match(line)
            if lm and not line.lstrip().startswith(("REG", "YOUTH")):
                labels.append(lm.group("lab").strip())
            if not is_data_tokens(toks):
                if m:
                    raise ValueError(f"{key}: hunt code line without numbers: {line}")
                continue
            head, nums = parse_tail(toks)
            code = m.group(1) if m else None
            if m:
                before = line[: m.start()].split()
                after_head = parse_tail(line[m.end():].split())[0]
            else:
                um = re.search(r"\bUnit \d+", line)
                before = line[: um.start()].split() if um else head
                after_head = parse_tail(line[um.end():].split())[0] if um else head[-1:]
            bag = after_head[-1] if after_head else None
            dates = " ".join(after_head[:-1])
            weapon = None
            for t in reversed(before):
                if t.lower() in WEAPONS or t == "Any":
                    weapon = t
                    break
            cat = None
            for t in before:
                if t.upper() in ("REG", "YOUTH", "MIP", "MIL", "YO"):
                    cat = t.upper()
                    break
            r = map_nums(nums)
            r.update(code=code, bag=bag, dates=dates, weapon=weapon, category=cat, page=pi + 1,
                     text=" ".join(head))
            block.append(r)
            page_rows.append(r)
        # attach land type from the PDF geometry; the numeric cells must match exactly
        lp = land_pages.get(pi, [])
        if len(lp) != len(page_rows):
            raise ValueError(f"{key} page {pi+1}: {len(page_rows)} text rows vs {len(lp)} pdf rows")
        for r, (tail, land) in zip(page_rows, lp):
            if to_int(tail[0]) != r["licenses"]:
                raise ValueError(f"{key} page {pi+1}: row alignment mismatch {r['code']} {r['licenses']} vs {tail}")
            r["land"] = land
    if block:
        log.append(f"{key}: {len(block)} trailing rows without a total line were dropped")
    return hunts, totals, statewide
