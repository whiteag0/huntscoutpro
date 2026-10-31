#!/usr/bin/env python3
"""Parse WGFD initial-draw "Demand Report" PDFs (text from pdftotext -layout)
into HuntScout Pro DrawRecord JSON (src/data/agency/schema.ts).

Usage:
  python -I scripts/agency/wyoming/draw_parse.py <raw_dir> <repo_root>
<raw_dir> is the folder written by draw_download.py (manifest.json + pdf/*.txt).
Writes <repo_root>/src/data/agency/wyoming/draw/<species>.json and
<raw_dir>/sources.json (SourceRef list merged into draw-meta.json by draw_meta.py).

Nothing is estimated. Numbers are copied from the reports. The only arithmetic is:
  * quota  = preference-draw quota + random-draw quota (both published), noted per row;
  * applicants (pref species) = sum of the published first-choice applicant counts over
    every point level of the preference-draw table (cross-checked against the random-draw
    report: random first-choice applicants = pref applicants - pref issued);
  * oddsPct only when every first-choice applicant demonstrably drew (oddsComputed true).
The parser re-checks every preference-table row: remaining quota chains
(quota_next = quota - issued) and published success odds = issued/applicants.
"""
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

RETRIEVED = "2026-10-31"
PUBLISHER = "Wyoming Game and Fish Department"
INDEX = "https://wgfd.wyo.gov/licenses-applications/draw-results-odds"
YEARS = range(2022, 2027)

SPECIES_TITLE = {"pronghorn": "Antelope", "deer": "Deer", "elk": "Elk", "sheep": "Bighorn Sheep",
                 "moose": "Moose", "goat": "Mountain Goat", "turkey": "Wild Turkey"}

PCT = re.compile(r"^(\d+(?:\.\d+)?)%$")
RANDOM_ROW = re.compile(r"^(?P<area>[0-9A-Z]{1,3})\s+(?:(?P<type>[0-9A-Z]{1,2})\s+)?(?P<desc>\S.*\S)\s+(?P<rest>\d+\s+\d+\s+\d+\s+\d+)\s*$")
PREF_FIRST_ROW = re.compile(r"^(?P<area>[0-9A-Z]{1,3})\s+(?:(?P<type>[0-9A-Z]{1,2})\s+)?(?P<desc>\S.*?\S)\s+"
                            r"(?P<rest>\d+\s+(?:\d+\s+)?(?:<=?\s*)?\d+\s+\d+(?:\s+\d+)?\s+[\d.]+%)\s*$")
compressed = []  # rows parsed by the whole-line fallback (reported at the end)


class ParseError(Exception):
    pass


def split_pages(text):
    """Split into report pages on every 'Demand Report' title line. Form feeds are ignored
    because pdftotext sometimes emits one mid-table (a lone row before the next title)."""
    pages = [[]]
    for l in text.replace("\f", "\n").split("\n"):
        if re.match(r"^\s*Demand Report", l) and any(x.strip() for x in pages[-1]):
            pages.append([])
        pages[-1].append(l)
    return [p for p in pages if any(l.strip() for l in p)]


def page_meta(lines):
    """Return (subtitle, date_year, dash_line_index, header_text)."""
    sub = None
    year = None
    for l in lines[:8]:
        m = re.search(r"Date:\s*\d+/\d+/(\d{4})", l)
        if m:
            year = int(m.group(1))
        if "Wyoming Game and Fish" in l and sub is None:
            sub = l.split("Wyoming Game and Fish")[0].strip()
    dash = None
    for i, l in enumerate(lines[:20]):
        if re.match(r"^-{4}\s+-{4}\s+-{10,}", l):
            dash = i
            break
    header = " ".join(lines[max(0, dash - 2):dash]) if dash is not None else ""
    return sub, year, dash, header


def col_spans(dash_line):
    return [(m.start(), m.end()) for m in re.finditer(r"-+", dash_line)]


def tokens_with_ops(s):
    toks = s.split()
    out = []
    i = 0
    while i < len(toks):
        t = toks[i]
        if t in ("<", "<=", ">", ">=") and i + 1 < len(toks):
            out.append(t + " " + toks[i + 1])
            i += 2
            continue
        m = re.match(r"^(<=|<|>=|>)(\d+)$", t)
        if m:
            out.append(m.group(1) + " " + m.group(2))
        else:
            out.append(t)
        i += 1
    return out


def parse_doc(path):
    """Parse one report. Returns list of hunts:
    {area, type, desc, kind: 'pref'|'random', subtitle, quota, a1, a2, a3 | rows:[...]}"""
    text = open(path, encoding="utf-8", errors="replace").read()
    hunts = []
    cur = None  # a hunt's point table can continue onto the next page
    for lines in split_pages(text):
        sub, year, dash, header = page_meta(lines)
        if dash is None:
            if any(re.search(r"\d+\s+\d+\s*$|%\s*$", l) for l in lines):
                raise ParseError(f"{path}: table-like rows but no dash header")
            continue
        for l in lines[:dash]:
            if re.search(r"\d+\s+\d+\s*$|%\s*$", l):
                raise ParseError(f"{path}: data-like line above table header: {l!r}")
        spans = col_spans(lines[dash])
        if "Pref" in header and "Issued" in header:
            kind = "pref"
            second = "Second Choice" in header
        elif "Third Choice" in header and "Quota" in header:
            kind = "random"
            second = False
        else:
            raise ParseError(f"{path}: unknown table header: {header!r}")
        a_end = spans[0][1]
        t_start, t_end = spans[1]
        d_start, d_end = spans[2]
        if kind != "pref" or (cur is not None and cur["subtitle"] != sub):
            cur = None
        for ln in lines[dash + 1:]:
            if not ln.strip() or re.match(r"^\s*([^\w\s]|[A-Z]{1,2}|\d{1,3})\s*$", ln):
                continue  # blank line, or stray PDF artifact ('.', 'Y', wrapped 'AM'/'PM', lone page no.)
            if ln.lstrip().startswith(("Demand Report", "Hunt ", "Area ")):
                raise ParseError(f"{path}: header inside table body: {ln!r}")
            area = ln[:t_start].strip()
            htype = ln[t_start:d_start].strip()
            desc = ln[d_start:d_end].strip()
            rest = ln[d_end:]
            if area and not re.match(r"^[0-9A-Z]{1,3}$", area):
                # row printed with compressed spacing: fall back to a whole-line pattern
                m = (RANDOM_ROW if kind == "random" else PREF_FIRST_ROW).match(ln)
                if not m:
                    raise ParseError(f"{path}: unparseable compressed row {ln!r}")
                area, htype, desc, rest = m.group("area"), m.group("type") or "", m.group("desc").strip(), m.group("rest")
                compressed.append(ln)
            if area:
                if not re.match(r"^[0-9A-Z]{1,3}$", area):
                    raise ParseError(f"{path}: bad area {area!r} in {ln!r}")
                if htype and not re.match(r"^[0-9A-Z]{1,2}$", htype):
                    raise ParseError(f"{path}: bad type {htype!r} in {ln!r}")
            toks = tokens_with_ops(rest)
            if kind == "random":
                if not area:
                    raise ParseError(f"{path}: continuation row in random table: {ln!r}")
                if len(toks) != 4 or not all(t.isdigit() for t in toks):
                    raise ParseError(f"{path}: random row needs 4 ints: {ln!r}")
                hunts.append({"area": area, "type": htype, "desc": desc, "kind": kind, "subtitle": sub,
                              "year": year, "quota": int(toks[0]), "a1": int(toks[1]),
                              "a2": int(toks[2]), "a3": int(toks[3])})
                continue
            # preference table row
            if not toks or not PCT.match(toks[-1]):
                raise ParseError(f"{path}: pref row without odds: {ln!r}")
            odds = float(PCT.match(toks[-1]).group(1))
            body = toks[:-1]
            n_full = 5 if second else 4  # quota, issued, points, applicants, [2nd]
            if len(body) == n_full:
                q, iss, pts, apps = body[0], body[1], body[2], body[3]
            elif len(body) == n_full - 1:
                q, iss, pts, apps = body[0], None, body[1], body[2]
            else:
                raise ParseError(f"{path}: pref row token count {len(body)}: {ln!r}")
            m = re.match(r"^(?:(<=|<|>=|>) )?(\d+)$", pts)
            if not (q.isdigit() and apps.isdigit() and m and (iss is None or iss.isdigit())):
                raise ParseError(f"{path}: pref row parse: {ln!r}")
            row = {"quota": int(q), "issued": None if iss is None else int(iss),
                   "op": m.group(1) or "", "points": int(m.group(2)), "applicants": int(apps),
                   "odds": odds, "label": pts}
            if area:
                cur = {"area": area, "type": htype, "desc": desc, "kind": kind, "subtitle": sub,
                       "year": year, "rows": [row]}
                hunts.append(cur)
            else:
                if cur is None:
                    raise ParseError(f"{path}: continuation before first hunt: {ln!r}")
                cur["rows"].append(row)
    return hunts


def check_pref(h, path):
    """Verify quota chain and odds; fill blank issued (only where odds 0.00%)."""
    rows = h["rows"]
    for i, r in enumerate(rows):
        if r["issued"] is None:
            if r["odds"] != 0.0 and r["applicants"] > 0:
                raise ParseError(f"{path}: blank issued with odds {r['odds']} in {h['area']}-{h['type']}")
            r["issued"] = 0
        if r["applicants"] > 0:
            # WGFD odds = issued/applicants, except when party applications push issued past the
            # remaining quota: then the published odds are remaining-quota/applicants.
            calc = round(100.0 * r["issued"] / r["applicants"], 2)
            calc2 = round(100.0 * min(r["issued"], r["quota"]) / r["applicants"], 2)
            if abs(calc - r["odds"]) > 0.011 and abs(calc2 - r["odds"]) > 0.011:
                raise ParseError(f"{path}: odds mismatch {h['area']}-{h['type']} {r['label']}: {calc} vs {r['odds']}")
        if i + 1 < len(rows):
            nxt = rows[i + 1]["quota"]
            if nxt != max(0, r["quota"] - r["issued"]):
                raise ParseError(f"{path}: quota chain {h['area']}-{h['type']} {r['label']}: {r['quota']}-{r['issued']} != {nxt}")


def deer_species(desc):
    d = desc.upper()
    if "WHITE" in d or re.search(r",\s*ANY WH$", d):
        return "whitetail"
    return "mule-deer"


def sex_of(desc):
    d = desc.upper()
    if d.startswith(("ANY RAM", "ANY MALE", "ANTLERED", "ANTELERED")):  # ANTELERED = WGFD typo
        return "male"
    if d.startswith("ANY "):
        return "either"
    return None


def source_id(doc):
    cat = re.sub(r"[^a-z0-9]+", "-", (doc["category"] or "all").lower()).strip("-")
    lab = re.sub(r"[^a-z0-9]+", "-", doc["label"].lower()).strip("-")
    sp = {"pronghorn": "antelope"}.get(doc["species"], doc["species"])
    return f"d-wy-{doc['year']}-{sp}-{cat}-{lab}"


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    manifest = json.load(open(os.path.join(raw, "manifest.json")))
    out_dir = os.path.join(repo, "src/data/agency/wyoming/draw")
    os.makedirs(out_dir, exist_ok=True)

    sources = []
    skipped = []
    # slots[(year, species, code)] -> dict
    slots = OrderedDict()
    for doc in manifest:
        if doc["year"] not in YEARS or doc["category"] == "Landowner" or "Landowner" in doc["label"]:
            continue
        path = os.path.join(raw, doc["file"][:-4] + ".txt")
        hunts = parse_doc(path)
        years = {h["year"] for h in hunts if h["year"]}
        if years and years != {doc["year"]}:
            skipped.append({"doc": doc, "reason": f"report dated {sorted(years)} but listed under {doc['year']}"})
            continue
        residency = "resident" if doc["label"].startswith("Resident") else "nonresident"
        special = "Special" in doc["label"]
        # the PDF's own title/subtitles must agree with the index link it came from
        titles = set(re.findall(r"Demand Report - (Non-Resident|Resident) ([^\n]*?)\s{2,}State of Wyoming",
                                open(path, encoding="utf-8", errors="replace").read()))
        word = {"pronghorn": "Antelope", "deer": "Deer", "elk": "Elk", "sheep": "Sheep", "moose": "Moose",
                "goat": "Mountain Goat", "turkey": "Turkey"}[doc["species"]]
        for who, what in titles:
            if (who == "Resident") != (residency == "resident") or word not in what:
                raise ParseError(f"{path}: title '{who} {what}' does not match index link {doc['label']} {doc['species']}")
            if doc["species"] == "turkey" and doc["category"] not in what:
                raise ParseError(f"{path}: turkey season mismatch {what} vs {doc['category']}")
        subs = {h["subtitle"] for h in hunts if h["subtitle"] and "landowner" not in h["subtitle"].lower()}
        if any(("special" in x.lower()) != special for x in subs):
            raise ParseError(f"{path}: subtitle {subs} vs label {doc['label']}")
        if not titles:
            print("note: no title line found in", path)
        sid = source_id(doc)
        cat = doc["category"]
        title = (f"{doc['year']} Demand Report - {doc['label']} {SPECIES_TITLE[doc['species']]}"
                 f"{' (' + cat + ')' if cat else ''}")
        dates = set()
        for l in open(path, encoding="utf-8", errors="replace").read().split("\n")[:6]:
            m = re.search(r"Date:\s*(\d+/\d+/\d{4})", l)
            if m:
                dates.add(m.group(1))
        sources.append({"id": sid, "title": title, "publisher": PUBLISHER, "url": doc["url"],
                        "pageUrl": INDEX, "dataYear": doc["year"], "retrieved": RETRIEVED,
                        "notes": "WGFD initial-draw demand report (PDF)"
                                 + ("; not linked from the index page (its 2022 goat links open the 2020 report)"
                                    if doc.get("unlinked") else "")
                                 + (f", report dated {sorted(dates)[0]}" if dates else "")})
        used = 0
        seen = set()
        for h in hunts:
            if h["subtitle"] and "landowner" in h["subtitle"].lower():
                continue
            if h["kind"] == "pref":
                check_pref(h, path)
            expect = "pref" if cat == "Preference Points" else "random"
            if h["kind"] != expect:
                raise ParseError(f"{path}: {h['kind']} table in {cat} report")
            code = f"{h['area']}-{h['type']}" if h["type"] else h["area"]
            k0 = (code, h["kind"])
            if k0 in seen:
                raise ParseError(f"{path}: duplicate hunt {code}")
            seen.add(k0)
            sp = doc["species"]
            if sp == "deer":
                sp = deer_species(h["desc"])
            key_code = code
            if doc["species"] == "turkey":
                key_code = f"{code} ({cat})"
            if special:
                key_code = f"{code} (NR Special)"
            key = (doc["year"], sp, key_code)
            s = slots.setdefault(key, {"year": doc["year"], "species": sp, "code": code,
                                       "huntCode": key_code, "desc": h["desc"], "special": special,
                                       "category": cat, "parts": {}, "sources": []})
            if sid not in s["sources"]:
                s["sources"].append(sid)
            part = (residency, h["kind"])
            if part in s["parts"]:
                raise ParseError(f"{path}: {key} {part} already filled")
            s["parts"][part] = h
            if h["desc"] != s["desc"]:
                s.setdefault("altDesc", set()).add(h["desc"])
            used += 1
        if used == 0:
            raise ParseError(f"{path}: no hunts parsed")

    checks = {"applicantIdentityOk": 0, "applicantIdentityFail": []}
    records = defaultdict(list)
    for key, s in slots.items():
        rec = OrderedDict()
        rec["species"] = s["species"]
        rec["year"] = s["year"]
        rec["huntCode"] = s["huntCode"]
        units = [s["code"].split("-")[0]] if re.match(r"^\d{3}-", s["code"]) else []
        rec["units"] = units
        desc = s["desc"]
        rec["description"] = desc + (" (Nonresident Special license)" if s["special"] else "")
        if "ARCHER" in desc.upper():  # descriptions are truncated, e.g. "ANY ANTELOPE, ARCHER"
            rec["method"] = "archery"
        elif "MUZZLE" in desc.upper():
            rec["method"] = "muzzleloader"
        sx = sex_of(desc)
        if sx:
            rec["sex"] = sx
        rec["choice"] = "first"
        notes = []
        bypoints = {}
        for residency in ("resident", "nonresident"):
            pref = s["parts"].get((residency, "pref"))
            rnd = s["parts"].get((residency, "random"))
            if not pref and not rnd:
                continue
            st = OrderedDict()
            ab = "R" if residency == "resident" else "NR"
            if pref:
                rows = pref["rows"]
                pq = rows[0]["quota"]
                papps = sum(r["applicants"] for r in rows)
                piss = sum(r["issued"] for r in rows)
                rq = rnd["quota"] if rnd else None
                st["quota"] = pq + rq if rnd else pq
                st["applicants"] = papps
                st["drawn"] = None
                if rnd:
                    if rnd["a1"] == papps - piss:
                        checks["applicantIdentityOk"] += 1
                    else:
                        notes.append(f"WGFD tables differ: {ab} preference-table applicants minus issued = {papps - piss},"
                                     f" {ab} random-table first-choice applicants = {rnd['a1']} (both as published)")
                        checks["applicantIdentityFail"].append(
                            f"{s['year']} {s['species']} {s['huntCode']} {ab}: pref apps {papps} - issued {piss} != random 1st {rnd['a1']}")
                    if papps > 0 and rnd["a1"] == 0 and piss == papps:
                        st["drawn"] = papps
                        st["oddsPct"] = 100.0
                        st["oddsComputed"] = True
                drew = [r for r in rows if r["issued"] > 0]
                low = drew[-1] if drew else None
                if low is None:
                    st["minPoints"] = None
                elif low["op"] == "":
                    st["minPoints"] = low["points"]
                else:
                    st["minPoints"] = None
                    ints = [r for r in drew if r["op"] == ""]
                    notes.append(f"{ab} lowest drawing level published as '{low['label']}' points"
                                 f" (party/group average)" + (f"; lowest whole-point level that drew: {ints[-1]['points']}" if ints else ""))
                parts = f"{ab} preference draw: quota {pq}, issued {piss}"
                if rnd:
                    parts += f"; {ab} random draw: quota {rq}, first-choice applicants {rnd['a1']} (number drawn not published)"
                else:
                    parts += f"; no {ab} random-draw table published for this hunt"
                notes.append(parts)
                last = rows[-1]
                if last["op"]:
                    notes.append(f"{ab} last preference-table level '{last['label']}' points: {last['applicants']}"
                                 f" first-choice applicants, {last['issued']} issued")
                for r in rows:
                    if r["op"] == "" and r["applicants"] > 0:
                        bp = bypoints.setdefault(r["points"], {"points": r["points"]})
                        if residency in bp:
                            raise ParseError(f"duplicate point level {key} {r['points']}")
                        bp[residency] = {"applicants": r["applicants"], "drawn": r["issued"]}
            else:
                q = rnd["quota"]
                if q >= 7999:  # GEN rows (7999/9999/18703/22265) and type-8 99xx counters
                    st["quota"] = None
                    notes.append(f"{ab} quota published as {q} (WGFD placeholder for a non-quota/unlimited license)")
                else:
                    st["quota"] = q
                st["applicants"] = rnd["a1"]
                st["drawn"] = None
                st["oddsPct"] = None
            if rnd:
                notes.append(f"{ab} 2nd/3rd-choice applicants: {rnd['a2']}/{rnd['a3']}")
            rec[residency] = st
        if bypoints:
            rec["byPoints"] = [bypoints[p] for p in sorted(bypoints, reverse=True)]
        if s.get("altDesc"):
            notes.append("Description also published as: " + "; ".join(sorted(s["altDesc"])))
        if s["special"]:
            notes.append("Nonresident Special licenses are a separate, higher-priced quota of the same hunt")
        if len(s["sources"]) > 1:
            notes.append("Also from: " + ", ".join(s["sources"][1:]))
        rec["note"] = ". ".join(notes) if notes else None
        if rec["note"] is None:
            del rec["note"]
        rec["sourceId"] = s["sources"][0]
        records[s["species"]].append(rec)

    for sp, rows in records.items():
        rows.sort(key=lambda r: (r["year"], r["huntCode"]))
        p = os.path.join(out_dir, f"{sp}.json")
        with open(p, "w") as f:
            json.dump(rows, f, indent=0, separators=(",", ":"))
            f.write("\n")
        print(f"{sp}: {len(rows)} rows, {os.path.getsize(p)/1e6:.2f} MB, years {sorted({r['year'] for r in rows})}")
    json.dump(sources, open(os.path.join(raw, "sources.json"), "w"), indent=1)
    json.dump({"skipped": [{"file": x["doc"]["file"], "url": x["doc"]["url"], "reason": x["reason"]} for x in skipped],
               "checks": checks}, open(os.path.join(raw, "parse_report.json"), "w"), indent=1)
    print("sources", len(sources), "skipped", [x["doc"]["file"] + ": " + x["reason"] for x in skipped])
    print("compressed-spacing rows parsed by fallback:", len(compressed))
    for c in compressed[:10]:
        print("   ", c)
    print("applicant identity ok", checks["applicantIdentityOk"], "fail", len(checks["applicantIdentityFail"]))
    for f in checks["applicantIdentityFail"][:40]:
        print("  ", f)


if __name__ == "__main__":
    main()
