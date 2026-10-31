#!/usr/bin/env python3
"""Parse CPW "Primary ... Post Draw Report" (Draw Recap) PDFs into hunt-code blocks.

Usage (library): parse_recap(pdf_path) -> {"statewide": block, "hunts": [block, ...]}
Usage (CLI):     python -I draw_parse_recap.py <pdf> [--json out.json]

The recap is a Microsoft Reporting Services PDF. We read word boxes with
`pdftotext -bbox` and assign every number to the table column whose header sits
above it (x-position), so empty cells ("-") and wrapped text can't shift values
between columns. Every block is checked for internal consistency (point rows sum
to the "Total Choice 1" row, totals match the post-draw summary); failures are
reported in block["problems"] and never silently fixed.
"""
import html
import json
import re
import subprocess
import sys

HUNT_RE = re.compile(r"^[A-Z][A-Z][A-Z0-9]{3}[A-Z][0-9A-Z][A-Z]$")
# preference-point-only application code, e.g. EP99999P (E-P-999-99-P in the brochure)
POINT_CODE_RE = re.compile(r"^[A-Z][A-Z]99999P$")
NUM_RE = re.compile(r"^-?\d[\d,]*$")
PAGE_HEADER = ("Colorado Parks and Wildlife", "Draw Recap", "Post Draw Report", "Page ")
ACCESS_TEXT = ("The State of Colorado is committed", "Digital Accommodation", "more information and services")


def words_by_page(pdf):
    out = subprocess.run(["pdftotext", "-bbox", pdf, "-"], capture_output=True, text=True, check=True).stdout
    pages = []
    for page in out.split("<page ")[1:]:
        ws = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
              re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', page)]
        pages.append(ws)
    return pages


def group_lines(ws, tol=2.5):
    ws = sorted(ws, key=lambda w: (w[1], w[0]))
    lines = []
    for w in ws:
        if lines and abs(lines[-1]["y"] - w[1]) < tol:
            lines[-1]["w"].append(w)
        else:
            lines.append({"y": w[1], "w": [w]})
    for ln in lines:
        ln["w"].sort(key=lambda w: w[0])
        ln["text"] = " ".join(w[4] for w in ln["w"])
    return lines


def all_lines(pdf):
    res = []
    for pi, ws in enumerate(words_by_page(pdf)):
        for ln in group_lines(ws):
            t = ln["text"]
            if any(t.startswith(a) for a in ACCESS_TEXT):
                continue
            ln["page"] = pi + 1
            res.append(ln)
    return res


def is_page_header(ln):
    t = ln["text"]
    if ln["y"] < 75 and (any(h.lower() in t.lower() for h in PAGE_HEADER) or re.match(r"^\d+/\d+/\d{4}", t)):
        return True
    return False


def num(tok):
    if tok == "-":
        return 0
    if NUM_RE.match(tok):
        return int(tok.replace(",", ""))
    return None


def center(w):
    return (w[0] + w[2]) / 2


def nearest(cols, x):
    best, bd = None, 1e9
    for name, cx in cols:
        d = abs(cx - x)
        if d < bd:
            best, bd = name, d
    return best, bd


CATS = ["aRes", "aNon", "yRes", "yNon", "lUn", "lRe"]


class Block:
    def __init__(self, codes, page):
        self.codes = codes
        self.code = " ".join(codes)
        self.page = page
        self.lines = []


def split_blocks(lines):
    """Statewide summary first, then one block per hunt code. The block title is a line
    holding only hunt codes; several codes on one title = a shared-quota group that CPW
    draws and reports together."""
    blocks = []
    cur = Block(["STATEWIDE"], lines[0]["page"] if lines else 0)
    for i, ln in enumerate(lines):
        if is_page_header(ln):
            continue
        ws = ln["w"]
        if ws and all(HUNT_RE.match(w[4]) or POINT_CODE_RE.match(w[4]) for w in ws) and 250 < center(ws[0]) < 560:
            # confirm: a "Total Quota" line follows within the next few lines
            nxt = " ".join(l["text"] for l in lines[i + 1:i + 4])
            if "Total" in nxt and ("Quota" in nxt or "Description" in nxt or "Regulation" in nxt):
                blocks.append(cur)
                cur = Block([w[4] for w in ws], ln["page"])
                continue
        cur.lines.append(ln)
    blocks.append(cur)
    return blocks


def parse_block(b):
    L = b.lines
    out = {"huntCode": b.code, "codes": b.codes, "page": b.page, "problems": []}
    prob = out["problems"].append

    # ---- header region: everything before the point-table header line
    # The point-table header is spread over up to three text lines a few points apart
    # ("Preference Weighted" / "Choice ... Res NonRes" / "Points Points ...").
    pt_hdr = None
    hdr_words = []
    for i, ln in enumerate(L):
        t = ln["text"]
        if "Unrestricted" not in t or "Title" in t or "Original" in t or "Balance" in t:
            continue
        near = [j for j in range(max(0, i - 3), min(len(L), i + 4)) if abs(L[j]["y"] - ln["y"]) <= 10 and L[j]["page"] == ln["page"]]
        ws = [w for j in near for w in L[j]["w"]]
        if sum(1 for w in ws if w[4] == "Choice") >= 2 and any(w[4] == "Preference" for w in ws):
            pt_hdr = max(near)
            hdr_words = ws
            first_hdr = min(near)
            break
    if pt_hdr is None:
        prob("no point-table header")
        return out
    head = L[:first_hdr]

    # total quota amount (left column under "Amount")
    for i, ln in enumerate(head):
        if any(w[4] == "Amount" for w in ln["w"]) and center(ln["w"][0]) < 120:
            for ln2 in head[i + 1:i + 6]:
                vals = [w for w in ln2["w"] if center(w) < 115 and num(w[4]) is not None]
                if vals:
                    out["totalQuota"] = num(vals[0][4])
                    break
            break

    # hunt code rows: "<#drawn> <code> <list>" (one per code in a shared-quota group)
    per_code = {}
    for ln in head:
        ws = [w for w in ln["w"] if center(w) < 170]
        toks = [w[4] for w in ws]
        for code in b.codes:
            if code in toks:
                k = toks.index(code)
                e = per_code.setdefault(code, {})
                if k >= 1 and num(toks[k - 1]) is not None:
                    e["drawn"] = num(toks[k - 1])
                if k + 1 < len(toks) and re.match(r"^[ABC]$", toks[k + 1]):
                    e["list"] = toks[k + 1]
    out["perCode"] = per_code
    if b.codes != ["STATEWIDE"]:
        for code in b.codes:
            if "drawn" not in per_code.get(code, {}):
                prob(f"no '# Drawn' row for {code}")

    # application counts per choice (mini table: "Total Choice n  <general>  <lpp>")
    apps = {}
    for ln in head:
        ws = ln["w"]
        for j in range(len(ws) - 2):
            if ws[j][4] == "Total" and ws[j + 1][4] == "Choice" and re.match(r"^[1-4]$", ws[j + 2][4]) and 150 < ws[j][0] < 260:
                vals = [w for w in ws[j + 3:] if w[0] < 420 and num(w[4]) is not None]
                if len(vals) >= 2:
                    apps[int(ws[j + 2][4])] = {"general": num(vals[0][4]), "lpp": num(vals[1][4])}
                elif len(vals) == 1:
                    apps[int(ws[j + 2][4])] = {"general": num(vals[0][4]), "lpp": None}
    out["apps"] = apps

    # pre-draw quota row and post-draw drawn row (right half, x > 420)
    def right_cols(ln):
        names = []
        for w in ln["w"]:
            if w[0] < 420:
                continue
            names.append((w[4], center(w)))
        return names

    pre_hdr = post_hdr = None
    for i, ln in enumerate(head):
        t = ln["text"]
        if "Original" in t and "Unrestricted" in t:
            pre_hdr = i
        if "Balance" in t and "Unrestricted" in t:
            post_hdr = i
    if pre_hdr is not None:
        h = [(n, x) for n, x in right_cols(head[pre_hdr]) if n in ("Original", "General", "Res", "NonRes", "Preference", "Unrestricted", "Restricted")]
        # General Draw header word "General" sits left of "Draw"; values centred under "General Draw"
        cols = []
        for n, x in h:
            if n == "General":
                gx = [center(w) for w in head[pre_hdr]["w"] if w[4] == "Draw" and w[0] > 420]
                x = (x + gx[0]) / 2 if gx else x
            cols.append((n, x))
        names = {"Original": "original", "General": "generalDraw", "Res": "res", "NonRes": "non",
                 "Preference": "youthPref", "Unrestricted": "lppUn", "Restricted": "lppRe"}
        cols = [(names[n], x) for n, x in cols]
        q = {}
        for ln in head[pre_hdr + 1:pre_hdr + 6]:
            if "Post-" in ln["text"] or "Post-Draw" in ln["text"] or "Balance" in ln["text"]:
                break
            for w in ln["w"]:
                if w[0] < 420:
                    continue
                c, d = nearest(cols, center(w))
                if d > 25:
                    continue
                v = num(w[4]) if w[4] != "-" else None
                if v is not None:
                    q[c] = v
                elif w[4] in ("N/A",):
                    q.setdefault(c, None)
        out["preQuota"] = q
    if post_hdr is not None:
        hdr = head[post_hdr]
        cols = []
        resn = 0
        for w in hdr["w"]:
            if w[0] < 420:
                continue
            n = w[4]
            if n == "Drawn":
                cols.append(("drawn", center(w)))
            elif n == "Balance":
                cols.append(("balance", center(w)))
            elif n == "Res":
                cols.append(("aRes" if resn == 0 else "yRes", center(w)))
                resn += 1
            elif n == "NonRes":
                cols.append(("aNon" if resn == 1 else "yNon", center(w)))
            elif n == "Unrestricted":
                cols.append(("lUn", center(w)))
            elif n == "Restricted":
                cols.append(("lRe", center(w)))
        post = {}
        for ln in head[post_hdr + 1:post_hdr + 5]:
            if "%" in ln["text"]:
                break
            for w in ln["w"]:
                if w[0] < 420 or num(w[4]) is None:
                    continue
                c, d = nearest(cols, center(w))
                if d <= 25 and c not in post:
                    post[c] = num(w[4])
        out["post"] = post

    # Drawn Out At / # Drawn at Final Level.
    # 2025+ reports print a "Title Res NonRes Res NonRes Unrestricted Restricted" header
    # over these cells; 2022-2024 reports don't, and the cells sit under the post-draw
    # header columns instead. Values are taken from text lines within 9 pt of the label.
    t_idx = None
    for i, ln in enumerate(head):
        if ln["w"] and any(w[4] == "Title" for w in ln["w"]) and "Unrestricted" in ln["text"]:
            t_idx = i
    cols = []
    if t_idx is not None:
        hdr = head[t_idx]
        tx = [w for w in hdr["w"] if w[4] == "Title"][0]
        for w in hdr["w"]:
            if w[0] > tx[2] and len(cols) < 6:
                cols.append((CATS[len(cols)], center(w)))
    elif post_hdr is not None:
        for w in head[post_hdr]["w"]:
            if w[0] > 545 and w[4] in ("Res", "NonRes", "Unrestricted", "Restricted") and len(cols) < 6:
                cols.append((CATS[len(cols)], center(w)))
    d_ln = next((ln for ln in head if "Drawn Out At" in ln["text"]), None)
    f_ln = next((ln for ln in head if "# Drawn at Final Level" in ln["text"]), None)
    if len(cols) == 6 and d_ln is not None:
        def label_end(anchor):
            # Right edge of the row label ("Drawn Out At" / "# Drawn at Final Level").
            # 2022 bear prints the resident cell starting left of x=546 (e.g. "1" at x=540
            # in "1 Pref Points"), so a fixed cut-off dropped the number; cut at the label.
            ws = anchor["w"]
            for i in range(len(ws) - 1, -1, -1):
                if ws[i][4] in ("At", "Level"):
                    return ws[i][2] + 0.5
            return 546

        def cells(anchor, stop_y=None):
            got = {c: [] for c in CATS}
            x_min = min(546, label_end(anchor))
            for ln in head:
                if ln["page"] != anchor["page"] or abs(ln["y"] - anchor["y"]) > 9:
                    continue
                if stop_y is not None and ln["y"] >= stop_y:
                    continue
                for w in ln["w"]:
                    if w[0] < x_min:
                        continue
                    c, d = nearest(cols, center(w))
                    if d <= 30:
                        got[c].append((ln["y"], w[0], w[4]))
            return {c: " ".join(t for _, _, t in sorted(v)) for c, v in got.items()}
        out["drawnOutAt"] = cells(d_ln, stop_y=(f_ln["y"] - 4) if f_ln and f_ln["page"] == d_ln["page"] else None)
        if f_ln is not None:
            out["finalLevel"] = cells(f_ln)
    else:
        prob("Drawn Out At cells not located")

    # ---- point table
    choices = sorted([w for w in hdr_words if w[4] == "Choice"], key=lambda w: w[0])
    if len(choices) < 2:
        prob("point header: Choice columns not found")
        return out
    split_x = choices[1][0] - 5
    weighted = any(w[4] == "Weighted" for w in hdr_words)

    def side_cols(lo, hi, suffix):
        ws = sorted([w for w in hdr_words if lo <= w[0] < hi], key=lambda w: w[0])
        cols = []
        resn = 0
        for w in ws:
            n = w[4]
            if n == "Choice":
                cols.append(("label", center(w)))
            elif n == "Preference":
                cols.append(("pref", center(w)))
            elif n == "Weighted":
                cols.append(("wt", center(w)))
            elif n == "Res":
                cols.append(("aRes" if resn == 0 else "yRes", center(w)))
                resn += 1
            elif n == "NonRes":
                cols.append(("aNon" if resn == 1 else "yNon", center(w)))
            elif n == "Unrestricted":
                cols.append(("lUn", center(w)))
            elif n == "Restricted":
                cols.append(("lRe", center(w)))
        return cols

    LC = side_cols(0, split_x, "L")
    RC = side_cols(split_x, 10000, "R")
    for side, cols in (("L", LC), ("R", RC)):
        names = [c for c, _ in cols]
        need = ["pref"] + CATS + (["wt"] if weighted else [])
        miss = [n for n in need if n not in names]
        if miss:
            prob(f"point header {side} missing {miss}")
            return out

    def assign(ln, cols, lo, hi):
        row = {}
        for w in ln["w"]:
            if not (lo <= w[0] < hi):
                continue
            c, d = nearest(cols, center(w))
            if c == "label" or d > 30:
                continue
            v = num(w[4])
            if v is None:
                return None
            if c in row:
                return None
            row[c] = v
        return row

    rows = []
    totals = {}
    leftover = {"lUn": 0, "lRe": 0}
    phase = "rows"
    for ln in L[pt_hdr + 1:]:
        t = ln["text"]
        if t.startswith("Landowner Leftover"):
            phase = "leftover"
            m = re.match(r"^Landowner Leftover Choice ([1-3])\b", t)
            if m:
                # right half = successful landowner-leftover vouchers (Unrestricted, Restricted)
                vals = [w for w in ln["w"] if w[0] >= split_x and num(w[4]) is not None
                        and not (w[4] in "123" and any(x[4] == "Choice" and 0 < w[0] - x[2] < 6 for x in ln["w"]))]
                for w in vals:
                    c, d = nearest([cc for cc in RC if cc[0] in ("lUn", "lRe")], center(w))
                    if d <= 30:
                        leftover[c] += num(w[4])
            continue
        if phase == "leftover":
            continue
        m = re.match(r"^(Total Choice ([1-4])|Grand Total)\b", t)
        if m:
            phase = "totals"
            key = "grand" if t.startswith("Grand") else int(m.group(2))
            # left values: words after the label, x < split ; right: after second label
            lv, rv = {}, {}
            for side, cols, lo, hi, dst in (("L", LC, 0, split_x, lv), ("R", RC, split_x, 10000, rv)):
                for w in ln["w"]:
                    if not (lo <= w[0] < hi) or num(w[4]) is None:
                        continue
                    if w[4] in "1234" and len(w[4]) == 1 and any(x[4] == "Choice" and 0 < w[0] - x[2] < 6 for x in ln["w"]):
                        continue  # the n in "Total Choice n"
                    c, d = nearest([cc for cc in cols if cc[0] in CATS], center(w))
                    if d <= 30:
                        dst[c] = num(w[4])
            totals[key] = {"pre": lv, "post": rv}
            continue
        if phase != "rows":
            continue
        toks = [w[4] for w in ln["w"]]
        if all(tk == "1" for tk in toks):
            continue  # choice labels only
        lrow = assign(ln, LC, 0, split_x)
        rrow = assign(ln, RC, split_x, 10000)
        if lrow is None or rrow is None or "pref" not in lrow:
            if any(num(tk) is not None for tk in toks):
                prob(f"unparsed point line p{ln['page']}: {t[:120]}")
            continue
        if lrow.get("pref") != rrow.get("pref") or (weighted and lrow.get("wt") != rrow.get("wt")):
            prob(f"pre/post point mismatch p{ln['page']}: {t[:120]}")
            continue
        rows.append({"pref": lrow["pref"], "wt": lrow.get("wt") if weighted else None,
                     "pre": {c: lrow.get(c, 0) for c in CATS}, "post": {c: rrow.get(c, 0) for c in CATS}})
    out["weighted"] = weighted
    out["rows"] = rows
    out["totals"] = totals

    # ---- consistency checks
    t1 = totals.get(1)
    if not t1:
        prob("no Total Choice 1 row")
    else:
        for side in ("pre", "post"):
            for c in CATS:
                s = sum(r[side][c] for r in rows)
                if t1[side].get(c) is not None and s != t1[side][c]:
                    prob(f"sum {side}.{c} of point rows {s} != Total Choice 1 {t1[side][c]}")
        if 1 in apps and apps[1]["general"] is not None:
            g = sum(t1["pre"].get(c, 0) for c in ("aRes", "aNon", "yRes", "yNon"))
            if g != apps[1]["general"]:
                prob(f"choice-1 general apps {apps[1]['general']} != adult+youth totals {g}")
    gt = totals.get("grand")
    post = out.get("post", {})
    out["leftoverDrawn"] = leftover
    if gt and post:
        for c in CATS:
            exp = gt["post"].get(c)
            if exp is None or c not in post:
                continue
            if c in leftover:
                exp += leftover[c]  # post-draw LPP counts include landowner-leftover vouchers
            if post[c] != exp:
                prob(f"post-draw {c} {post[c]} != grand total drawn (+leftover) {exp}")
        if "drawn" in post:
            s = sum(post.get(c, 0) for c in CATS)
            if s != post["drawn"]:
                prob(f"post-draw categories sum {s} != # Drawn {post['drawn']}")
    return out


def parse_recap(pdf):
    lines = all_lines(pdf)
    title = next((ln["text"] for ln in lines[:40] if "Post Draw Report" in ln["text"]), "")
    stamp = next((ln["text"] for ln in lines[:40] if re.match(r"^\d+/\d+/\d{4} ", ln["text"])), "")
    blocks = split_blocks(lines)
    parsed = [parse_block(b) for b in blocks[1:]]
    sw = parse_block(blocks[0]) if blocks else None
    n_codes = None
    for i, ln in enumerate(lines[:60]):
        if "Total Hunt Codes" in ln["text"]:
            for ln2 in lines[i:i + 8]:
                v = [w for w in ln2["w"] if center(w) < 140 and num(w[4]) is not None]
                if v:
                    n_codes = num(v[0][4])
                    break
            break
    return {"title": title, "stamp": stamp, "totalHuntCodes": n_codes, "statewide": sw, "hunts": parsed}


if __name__ == "__main__":
    r = parse_recap(sys.argv[1])
    n = len(r["hunts"])
    bad = [h for h in r["hunts"] if h["problems"]]
    print(r["title"], "|", r["stamp"], "| blocks:", n, "| codes:", sum(len(h["codes"]) for h in r["hunts"]), "| published total hunt codes:", r["totalHuntCodes"], "| with problems:", len(bad))
    for h in bad[:15]:
        print(" ", h["huntCode"], "p", h["page"], h["problems"][:3])
    if "--json" in sys.argv:
        json.dump(r, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
