#!/usr/bin/env python3
"""Parse one CDFW "Tag Drawing Statistics - Number of Applicants by Point Value" PDF.

Each PDF lists, per hunt: hunt code, hunt tag description, tag quota, preference point tag quota,
random tag quota, total (1st choice) applicants, then one column per preference-point value.
Point columns are labelled "7", "7.5", ".5" or "8>7" / "8 > 7" (= more than 7 and fewer than 8
points: party applications use the party's unrounded point average). Columns with no applicants
are not printed, so labels are read from each page header by x-position.

Library use: rows = parse_pdf(path) -> list of dicts
  {code, desc, quota, prefQuota, randQuota, total, points: {label: n} | None, page}
CLI (debug): python -I draw_pdfparse.py <pdf>
"""
import re
import sys

import pdfplumber

NUM = re.compile(r"^\d{1,3}(?:,\d{3})*\.?$|^\d+\.?$")
LABEL = re.compile(r"^(?:\d+(?:\.\d+)?|\.\d+|>|-|\d+>\d+|\d+-\d+)$")
CODE = re.compile(r"^(?:PD|[A-Z]{1,2}\d{1,2}[A-Z]?|[A-Z]|\d{3})$")


def num(t):
    return int(t.rstrip(".").replace(",", ""))


def lines_of(words, tol=3.0):
    out = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if out and abs(w["top"] - out[-1]["top"]) <= tol:
            out[-1]["words"].append(w)
        else:
            out.append({"top": w["top"], "words": [w]})
    for ln in out:
        ln["words"].sort(key=lambda w: w["x0"])
    return out


def norm_label(tokens):
    txt = "".join(t["text"] for t in tokens)
    if ">" in txt:  # "8>7" (2023-2026)
        hi, lo = txt.split(">")
        return f"{float(lo):g}-{float(hi):g}"  # between lo and hi
    if "-" in txt:  # "2-3" (2022 apprentice)
        lo, hi = txt.split("-")
        return f"{float(lo):g}-{float(hi):g}"
    return f"{float(txt):g}"


def parse_header(words):
    """Return (quota_x, appl_x1, code_x0, labels) for a page, or None if no header."""
    ql = [w for w in words if w["text"] == "Quota"]
    ap = [w for w in words if w["text"] == "Applicants"]
    hunt = [w for w in words if w["text"] == "Hunt"]
    if not ql or not ap or not hunt:
        return None
    bot = max(w["bottom"] for w in ql) + 1
    # the column-header "Applicants" (not the one in the title line)
    cand = [w for w in ap if w["top"] <= bot and w["top"] >= min(q["top"] for q in ql) - 25]
    if not cand:
        return None
    appl = max(cand, key=lambda w: w["top"])
    top0 = min(q["top"] for q in ql) - 30
    code_x0 = min(w["x0"] for w in hunt)
    quota_x = min(w["x0"] for w in ql) - 15
    toks = [w for w in words if top0 <= w["top"] <= bot and w["x0"] > appl["x1"] - 2 and LABEL.match(w["text"])]
    # group label tokens into columns: a number, or "<hi> > <lo>" (three tokens or one)
    toks.sort(key=lambda w: (round(w["top"] / 4), w["x0"]))
    toks.sort(key=lambda w: w["x0"])
    cols, i = [], 0
    while i < len(toks):
        t = toks[i]
        if (i + 2 < len(toks) and toks[i + 1]["text"] in (">", "-") and toks[i + 2]["text"] not in (">", "-")
                and abs(toks[i + 1]["top"] - t["top"]) < 3 and abs(toks[i + 2]["top"] - t["top"]) < 3
                and toks[i + 2]["x0"] - t["x1"] < 30):
            cols.append([t, toks[i + 1], toks[i + 2]])
            i += 3
        elif t["text"] in (">", "-"):
            raise ValueError(f"stray '{t['text']}' in header at x={t['x0']}")
        else:
            cols.append([t])
            i += 1
    labels = [norm_label(c) for c in cols]
    return {"quota_x": quota_x, "appl_x1": appl["x1"], "code_x0": code_x0, "bot": bot, "labels": labels}


def parse_pdf(path):
    rows = []
    hdr = None
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            words = page.extract_words(x_tolerance=1.5, keep_blank_chars=False)
            h = parse_header(words)
            if h:
                hdr = h
            if not hdr:
                continue
            body_top = hdr["bot"] if h else 0
            lns = [l for l in lines_of(words) if l["top"] > body_top]
            data, frags, seq = [], [], []
            numonly, codeonly = [], []
            for ln in lns:
                ws = ln["words"]
                bottom = max(w["bottom"] for w in ws)
                nums = [w for w in ws if w["x0"] >= hdr["quota_x"] and NUM.match(w["text"])]
                first = ws[0]
                is_code = bool(CODE.match(first["text"])) and first["x0"] < hdr["code_x0"] + 40
                if len(nums) >= 4 and is_code:
                    desc = [w for w in ws[1:] if w["x1"] < hdr["quota_x"] + 5]
                    d = {"top": ln["top"], "bottom": bottom, "code": first["text"],
                         "own": " ".join(w["text"] for w in desc), "nums": [w["text"] for w in nums],
                         "pre": [], "post": [], "page": pno}
                    data.append(d)
                    seq.append(("d", d))
                elif len(nums) >= 4:
                    numonly.append({"top": ln["top"], "bottom": bottom, "nums": [w["text"] for w in nums],
                                    "own": " ".join(w["text"] for w in ws if w["x1"] < hdr["quota_x"] + 5)})
                elif not nums and is_code and first["x0"] < hdr["code_x0"] + 15:
                    codeonly.append({"top": ln["top"], "bottom": bottom, "code": first["text"],
                                     "own": " ".join(w["text"] for w in ws[1:] if w["x1"] < hdr["quota_x"] + 5)})
                else:
                    desc = [w for w in ws if w["x1"] < hdr["quota_x"] + 5]
                    if not nums and desc and len(desc) == len(ws) and all(w["x0"] >= hdr["code_x0"] - 5 for w in desc):
                        f = {"top": ln["top"], "bottom": bottom, "text": " ".join(w["text"] for w in desc)}
                        frags.append(f)
                        seq.append(("f", f))
            # numbers printed on a separate baseline from the hunt code (e.g. 2025 elk antlerless 9-15)
            for n in numonly:
                c = min(codeonly, key=lambda c: abs(c["top"] - n["top"]), default=None)
                if c is None or abs(c["top"] - n["top"]) > 14 or c.get("used"):
                    raise ValueError(f"{path} p{pno}: number row at {n['top']:.0f} has no hunt code")
                c["used"] = True
                own = " ".join(t for t in ((n["own"], c["own"]) if n["top"] < c["top"] else (c["own"], n["own"])) if t)
                d = {"top": min(c["top"], n["top"]), "bottom": max(c["bottom"], n["bottom"]), "code": c["code"],
                     "own": own, "nums": n["nums"], "pre": [], "post": [], "page": pno}
                data.append(d)
                seq.append(("d", d))
            for c in codeonly:
                if not c.get("used"):  # a description line that starts like a code (e.g. "C4 - General Methods")
                    f = {"top": c["top"], "bottom": c["bottom"], "text": (c["code"] + " " + c["own"]).strip()}
                    frags.append(f)
                    seq.append(("f", f))
            seq.sort(key=lambda kv: kv[1]["top"])
            # blocks of vertically touching lines (gap < 4 pt) form one table cell
            blocks, prev_bottom = [], None
            for kind, item in seq:
                if prev_bottom is None or item["top"] - prev_bottom >= 4:
                    blocks.append([])
                blocks[-1].append((kind, item))
                prev_bottom = item["bottom"]
            orphans = []
            for blk in blocks:
                ds = [i for k, i in blk if k == "d"]
                fs = [i for k, i in blk if k == "f"]
                for f in fs:
                    pool = ds if ds else []
                    if not pool:
                        orphans.append(f)
                        continue
                    d = min(pool, key=lambda d: abs(d["top"] - f["top"]))
                    (d["pre"] if f["top"] < d["top"] else d["post"]).append(f)
            for f in orphans:
                if data:
                    d = min(data, key=lambda d: abs(d["top"] - f["top"]))
                    if abs(d["top"] - f["top"]) <= 26:
                        (d["pre"] if f["top"] < d["top"] else d["post"]).append(f)
            for d in data:
                parts = [f["text"] for f in sorted(d["pre"], key=lambda f: f["top"])]
                if d["own"]:
                    parts.append(d["own"])
                parts += [f["text"] for f in sorted(d["post"], key=lambda f: f["top"])]
                desc = re.sub(r"\s+", " ", " ".join(parts)).strip()
                desc = re.sub(r"\s+-\s*$", "", desc)
                vals = [num(t) for t in d["nums"]]
                quota, pq, rq, total = vals[:4]
                pts = vals[4:]
                points = None
                if len(pts) == len(hdr["labels"]):
                    points = dict(zip(hdr["labels"], pts))
                rows.append({"code": d["code"], "desc": desc, "quota": quota, "prefQuota": pq, "randQuota": rq,
                             "total": total, "points": points, "nPointCols": len(pts),
                             "labels": hdr["labels"], "page": d["page"]})
    return rows


if __name__ == "__main__":
    for r in parse_pdf(sys.argv[1]):
        s = sum(r["points"].values()) if r["points"] else None
        print(r["code"], "|", r["desc"], "|", r["quota"], r["prefQuota"], r["randQuota"], r["total"],
              "sum=", s, "OK" if s == r["total"] else "MISMATCH", r["nPointCols"], len(r["labels"]))
