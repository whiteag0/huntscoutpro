#!/usr/bin/env python3
"""Spot-check New Mexico season dates and key dates against the raw NMDOW documents.

Usage:
  <venv>/bin/python3 -I scripts/agency/new-mexico/seasons_spotcheck.py <raw_seasons_dir> <repo_root> [n=40] [seed=2026]

<raw_seasons_dir> holds d-nm-rib-2026.pdf, page_0dd05bca.html (Applying for Big Game Hunts page),
post_leftover_2026.html and post_youth_elk_2026.html. Needs pdfplumber.

Independent of seasons_parse.py: the booklet is read with pdfplumber word positions (not poppler
-layout text), lines are rebuilt from word tops, the hunt code is located on its line and the
printed date must appear there (or on the next line for wrapped cells). The YYYY-MM-DD values are
recomputed by a separate minimal converter and compared with seasonRanges/seasons[].
"""
import html, json, os, random, re, sys

sys.dont_write_bytecode = True
import pdfplumber  # noqa: E402

MON = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}


def c(s):
    s = s.replace("‘", "'").replace("’", "'").replace("–", "-").replace("—", "-").lower()
    s = s.replace("sept", "sep").replace("march", "mar").replace("april", "apr")
    return re.sub(r"[\s.,]", "", s)


def convert(canon_text, base=2026):
    """'oct31-nov4' / "dec26-jan1'27" / "jan1-15'27" / 'apr12026-mar312027' -> (start, end) ISO."""
    m = re.fullmatch(r"([a-z]{3})(\d{1,2})(20\d\d)?-([a-z]{3})?(\d{1,2})(?:'(\d\d)|(20\d\d))?", canon_text)
    if not m:
        return None
    a, d1, y1, b, d2, ys, yl = m.groups()
    m1, m2 = MON[a], MON[b or a]
    ey = int(yl) if yl else (2000 + int(ys) if ys else base)
    sy = int(y1) if y1 else (ey if (m1, int(d1)) <= (m2, int(d2)) else ey - 1)
    return f"{sy}-{m1:02d}-{int(d1):02d}", f"{ey}-{m2:02d}-{int(d2):02d}"


def toks(s):
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-").lower()
    s = re.sub(r"\b(sept|march|april)\b", lambda m: m.group(1)[:3], s)
    return re.findall(r"[a-z]+|'\d\d|\d+|-", s)


def in_order(needle, hay):
    """All date tokens of the printed cell appear in order in the booklet line(s) (wrapped cells interleave with other columns)."""
    it = iter(toks(hay))
    return all(any(t == h for h in it) for t in toks(needle))


def pdf_lines(pdf):
    out = []
    with pdfplumber.open(pdf) as doc:
        for pno, page in enumerate(doc.pages, 1):
            words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
            rows = {}
            for w in words:
                key = round(w["top"] / 3)
                rows.setdefault(key, []).append(w)
            for key in sorted(rows):
                ws = sorted(rows[key], key=lambda w: w["x0"])
                out.append((pno, " ".join(w["text"] for w in ws)))
    return out


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    random.seed(int(sys.argv[4]) if len(sys.argv) > 4 else 2026)
    base = os.path.join(repo, "src/data/agency/new-mexico")
    lines = pdf_lines(os.path.join(raw, "d-nm-rib-2026.pdf"))
    norm_lines = [(p, l.replace("–", "-")) for p, l in lines]
    ok = bad = 0

    def report(good, what):
        nonlocal ok, bad
        ok += good
        bad += not good
        print(("MATCH   " if good else "MISMATCH"), what)

    # 1) draw rows (one per hunt code; first/all rows must agree)
    rows = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "turkey"]:
        rs = [r for r in json.load(open(os.path.join(base, "draw", sp + ".json"))) if r["year"] == 2026]
        by = {}
        for r in rs:
            by.setdefault(r["huntCode"], []).append(r)
        for code, pair in by.items():
            if len({json.dumps([p.get("seasonDates"), p.get("seasonRanges")]) for p in pair}) != 1:
                report(False, f"{code}: choice rows disagree")
            if pair[0].get("seasonRanges"):
                rows.append(pair[0])
    sample = random.sample(rows, min(n, len(rows)))
    # always include the special cases
    for code in ("TUR-1-109", "BHS-1-201", "BHS-1-204", "ELK-1-700", "DER-1-700"):
        sample += [r for r in rows if r["huntCode"] == code and r not in sample]
    for r in sample:
        code = r["huntCode"]
        if code.startswith("BHS"):
            # each "area: dates" segment must be on one booklet line (or area line + next line), dates convert
            segs = r["seasonDates"].split("; ")
            good = len(segs) == len(r["seasonRanges"])
            for seg, rg in zip(segs, r["seasonRanges"]):
                area, d = seg.rsplit(": ", 1)
                hit = any(in_order(d, l + " " + (norm_lines[i + 1][1] if i + 1 < len(norm_lines) else "")) and c(area.split(" - ")[0]) in c(l)
                          for i, (_, l) in enumerate(norm_lines))
                conv = convert(c(d))
                good = good and hit and conv == (rg["start"], rg["end"])
            report(good, f"{code} {len(segs)} segments")
            continue
        idx = [i for i, (_, l) in enumerate(norm_lines) if re.search(r"\b" + re.escape(code) + r"\b", l) and len(re.findall(r"[A-Z]{3}-\d-\d{3}", l)) == 1]
        printed = r["seasonDates"]
        segs = [s.split(": ", 1)[1] for s in printed.split("; ")] if "SIDE:" in printed else [printed]
        found = any(all(in_order(s, " ".join(l for _, l in norm_lines[i:i + 5])) for s in segs) for i in idx)
        conv = [convert(c(s)) for s in segs]
        good = found and conv == [(g["start"], g["end"]) for g in r["seasonRanges"]]
        report(good, f"{code} '{printed}' -> {[(g['start'], g['end']) for g in r['seasonRanges']]} (page {norm_lines[idx[0]][0] if idx else '?'})")

    # 2) seasons[] entries
    meta = json.load(open(os.path.join(base, "draw-meta.json")))
    seas = meta["seasons"]
    sample = random.sample(seas, min(n, len(seas))) + [s for s in seas if s["species"] in ("lion", "turkey") and "OTC" in s["label"] or s["species"] == "lion"]
    rows_by = {}
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "turkey"]:
        for r in json.load(open(os.path.join(base, "draw", sp + ".json"))):
            if r["year"] == 2026 and r.get("seasonRanges"):
                rows_by[r["huntCode"]] = r
    full = c(" ".join(l for _, l in norm_lines))
    for s in sample:
        if s["species"] == "sheep":
            area = s["label"].split(": ", 1)[1]
            ab = {v: k for k, v in MON.items()}
            st, en = s["start"], s["end"]
            want = f"{ab[int(st[5:7])]} {int(st[8:])} - " + (f"{ab[int(en[5:7])]} " if st[5:7] != en[5:7] else "") + f"{int(en[8:])}" + (f" '{en[2:4]}" if en[:4] != "2026" else "")
            good = any(c(area.split(" - ")[0]) in c(l) and in_order(want, l + " " + (norm_lines[i + 1][1] if i + 1 < len(norm_lines) else ""))
                       for i, (_, l) in enumerate(norm_lines))
            report(good, f"season '{s['label'][:80]}' {s['start']}..{s['end']}")
        elif s.get("huntCodes") and not s["label"].startswith("OTC"):
            code = s["huntCodes"][-1]
            ab = {v: k for k, v in MON.items()}
            st, en = s["start"], s["end"]
            wants = [f"{ab[int(st[5:7])]} {int(st[8:])} - {ab[int(en[5:7])]} {int(en[8:])}"]
            if st[5:7] == en[5:7]:
                wants.append(f"{ab[int(st[5:7])]} {int(st[8:])} - {int(en[8:])}")
            if en[:4] != "2026":
                wants = [w + f" '{en[2:4]}" for w in wants]
            idx = [i for i, (_, l) in enumerate(norm_lines) if re.search(r"\b" + re.escape(code) + r"\b", l) and len(re.findall(r"[A-Z]{3}-\d-\d{3}", l)) == 1]
            good = any(in_order(w, " ".join(l for _, l in norm_lines[i:i + 5])) for i in idx for w in wants)
            report(good, f"season '{s['label'][:70]}' {code} {s['start']}..{s['end']}")
        elif s["label"].startswith("OTC bear"):
            z = re.search(r"Zone (\d+)", s["label"]).group(1)
            i = next(i for i, (_, l) in enumerate(norm_lines) if l.startswith(f"Zone {z} "))
            arm = "Bow Only" if s.get("method") == "archery" else "Any Legal"
            good = any(convert(c(m.group(1))) == (s["start"], s["end"]) for _, l in norm_lines[i + 1:i + 6]
                       for m in [re.match(r"^(\S+\.? \d+-(?:\S+\.? )?\d+) " + arm, l)] if m)
            report(good, f"season '{s['label']}' {s['start']}..{s['end']}")
        else:
            st, en = s["start"], s["end"]
            ab = {v: k for k, v in MON.items()}
            m1, d1, m2, d2 = ab[int(st[5:7])], int(st[8:]), ab[int(en[5:7])], int(en[8:])
            cands = [f"{m1}{d1}-{d2}", f"{m1}{d1}-{m2}{d2}", f"{m1}{d1}{st[:4]}-{m2}{d2}{en[:4]}"]
            report(any(x in full for x in cands), f"season '{s['label']}' {st}..{en}")

    # 3) key dates (web pages)
    def page_text(name):
        t = open(os.path.join(raw, name), encoding="utf-8", errors="replace").read()
        t = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", t)
        return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))
    pages = {"d-nm-dates-2026": page_text("page_0dd05bca.html"), "d-nm-leftover-2026": page_text("post_leftover_2026.html"),
             "d-nm-youth-elk-2026": page_text("post_youth_elk_2026.html")}
    full_names = {1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June", 7: "July", 8: "August", 9: "September",
                  10: "October", 11: "November", 12: "December"}
    seen = set()
    for sp in meta["species"]:
        for k in sp["keyDates"]:
            key = (k["label"], k.get("date"), k["sourceId"])
            if key in seen or k["sourceId"] not in pages:
                continue
            seen.add(key)
            y, mo, d = (int(x) for x in k["date"].split("-"))
            fn = full_names[mo]
            pats = [rf"\b{fn[:3]}\.? {d}, {y}", rf"\b{fn} {d}, {y}", rf"\b{fn} {d}\b", rf"\b{fn[:3]}\. {d}\b", rf"\b{fn[:3]} {d}\b"]
            good = any(re.search(p, pages[k["sourceId"]]) for p in pats)
            report(good, f"keyDate [{sp['species']}] {k['date']} {k['label'][:70]}")
    print(f"\n{ok} match, {bad} mismatch")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
