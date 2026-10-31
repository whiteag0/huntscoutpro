"""Column-position table extractor for AZGFD harvest-summary PDFs.

AZGFD's harvest summaries are text PDFs with one row per hunt (or unit / zone).
Cells are sometimes blank (e.g. a hunt with permits issued but no questionnaire
returns), so rows cannot be split on whitespace. Instead, for every page we
locate the column-header band, take the x-centre of a named header word per
column ("anchor"), and assign each numeric token in a data line to the nearest
anchor. Anything left of the first data column is the row label (unit text).

Parsing stops at the first multi-unit-breakdown / buck-percentage / successful-
hunter-list page: those tables repeat hunt rows split by unit or list hunter
names and are not used.
"""
import re

import pdfplumber

NUM_RE = re.compile(r"^(?:<1%|-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?|-?\.\d+%?|-|\.)$")
HUNT_RE = re.compile(r"^(?:[A-Z]{1,3}\d{2,4}|\d{3,4}[A-Z]?)$")
PAREN_RE = re.compile(r"^\((\d+%?)\)$")
STOP_MARKERS = ("BREAKDOWN", "SUCCESSFUL HUNTERS", "QUESTIONNAIRE, BUCK HARVEST", "MULTIPLE UNIT", "MINIMUMS, MAXIMUMS")


def parse_num(tok):
    """Return (value, raw). '-' and '.' and '' -> None (caller decides meaning)."""
    if tok is None:
        return None
    t = tok.replace(",", "")
    if t in ("-", ".", ""):
        return None
    if t == "<1%":
        return None
    t = t.rstrip("%")
    try:
        return int(t)
    except ValueError:
        return float(t)


def group_lines(words, tol=3.5):
    """Group words into visual lines by vertical centre."""
    ws = sorted(words, key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"]))
    lines = []
    for w in ws:
        yc = (w["top"] + w["bottom"]) / 2
        if lines and abs(yc - lines[-1]["yc"]) <= tol:
            lines[-1]["words"].append(w)
        else:
            lines.append({"yc": yc, "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w["x0"])
        ln["text"] = " ".join(w["text"] for w in ln["words"])
    return lines


def resolve_anchors(band_words, spec):
    """spec: list of (field, [alternative header words], occurrence index)."""
    anchors = []
    for field, alts, occ in spec:
        found = None
        for alt in alts:
            cands = sorted([w for w in band_words if w["text"] == alt], key=lambda w: w["x0"])
            if len(cands) > occ:
                w = cands[occ]
                found = (w["x0"] + w["x1"]) / 2
                break
        if found is None:
            raise ValueError(f"anchor {field} {alts}[{occ}] not found in header band")
        anchors.append((field, found))
    xs = [a[1] for a in anchors]
    if xs != sorted(xs):
        raise ValueError(f"anchors out of order: {anchors}")
    return anchors


def refine_anchors(lines, anchors, boundary, band_bottom):
    """Move each anchor to the median x-centre of the numeric tokens first assigned to it
    on this page (header words are not always centred over their numbers)."""
    hits = {f: [] for f, _ in anchors}
    for ln in lines:
        if ln["yc"] <= band_bottom:
            continue
        for w in ln["words"]:
            xc = (w["x0"] + w["x1"]) / 2
            if xc < boundary or PAREN_RE.match(w["text"]) or not NUM_RE.match(w["text"]):
                continue
            f = min(anchors, key=lambda a: abs(a[1] - xc))[0]
            hits[f].append(xc)
    new = []
    for f, x in anchors:
        h = sorted(hits[f])
        new.append((f, h[len(h) // 2] if len(h) >= 3 else x))
    xs = [a[1] for a in new]
    return new if xs == sorted(xs) else anchors


def extract(pdf_path, spec, header_first=("Unit", "Zone", "Hunt", "HuntArea"), band=(-15, 11),
            label_margin=None, overrides=None):
    """Yield dict rows: {page, kind: 'section'|'data', label, cells{field: raw token}, extra[]}.

    overrides: optional {field: x} to replace an anchor x (when a header word is far
    from where the agency printed the numbers).
    """
    out = []
    notes = []
    prev = None
    stopped = False
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            if stopped:
                break
            lines = group_lines(page.extract_words())
            hdr_idx = None
            for i, ln in enumerate(lines):
                if ln["words"][0]["text"] in header_first and len(ln["words"]) >= 4:
                    hdr_idx = i
                    break
            # stop markers above the header (page title) end the document
            title_txt = " ".join(ln["text"] for ln in lines[: (hdr_idx if hdr_idx is not None else len(lines))]).upper()
            if any(m in title_txt for m in STOP_MARKERS):
                stopped = True
                break
            if hdr_idx is None:
                if prev is None:
                    continue
                # continuation page without a header: reuse the previous page's columns
                anchors, boundary = prev
                anchors = refine_anchors(lines, anchors, boundary, -1)
                band_bottom = -1
                hdr_idx = -1
            if hdr_idx != -1:
              y0 = lines[hdr_idx]["yc"]
              left_x = lines[hdr_idx]["words"][0]["x0"]
              # header band: lines near the header line, excluding section-label lines that
              # start at the left margin (other than the header line itself)
              band_words = []
              for i, ln in enumerate(lines):
                  if not (band[0] <= ln["yc"] - y0 <= band[1]):
                      continue
                  if i != hdr_idx and abs(ln["words"][0]["x0"] - left_x) < 8 and ln["yc"] > y0:
                      continue
                  band_words.extend(ln["words"])
              try:
                  anchors = resolve_anchors(band_words, spec)
              except ValueError as e:
                  notes.append(f"page {pno}: stopped, header not recognised ({e})")
                  stopped = True
                  break
              if overrides:
                  anchors = [(f, overrides.get(f, x)) for f, x in anchors]
              first_x = anchors[0][1]
              gap = anchors[1][1] - anchors[0][1]
              boundary = first_x - (label_margin if label_margin is not None else max(14, 0.55 * gap))
              band_bottom = max(ln["yc"] for ln in lines if band[0] <= ln["yc"] - y0 <= band[1]
                                and not (abs(ln["words"][0]["x0"] - left_x) < 8 and ln["yc"] > y0))
              anchors = refine_anchors(lines, anchors, boundary, band_bottom)
            prev = (anchors, boundary)
            for ln in lines:
                if ln["yc"] <= band_bottom:
                    continue
                up = ln["text"].upper()
                if any(m in up for m in STOP_MARKERS):
                    stopped = True
                    break
                if re.match(r"^Page \d+ of \d+$", ln["text"]):
                    continue
                label_words, cells, extra, markers = [], {}, [], []
                for w in ln["words"]:
                    xc = (w["x0"] + w["x1"]) / 2
                    if xc < boundary:
                        label_words.append(w["text"])
                        continue
                    m = PAREN_RE.match(w["text"])
                    if m:
                        if "_paren" in cells:
                            extra.append(w["text"])
                        cells["_paren"] = m.group(1)
                        continue
                    field = min(anchors, key=lambda a: abs(a[1] - xc))[0]
                    # the hunt column takes hunt codes only; other columns take numbers / '-' / '.'
                    ok = bool(HUNT_RE.match(w["text"])) if field == "hunt" else bool(NUM_RE.match(w["text"]))
                    if ok and w["text"] in ("-", "."):
                        markers.append((xc, w["text"]))
                        continue
                    if ok:
                        if field in cells:
                            extra.append(f"{field}:{cells[field]}+{w['text']}")
                            cells[field] = cells[field] + " " + w["text"]
                        else:
                            cells[field] = w["text"]
                    else:
                        if not cells:
                            label_words.append(w["text"])
                        else:
                            extra.append(w["text"])
                # missing-value markers go to the nearest still-empty column
                for xc, t in markers:
                    empty = [a for a in anchors if a[0] not in cells]
                    if not empty:
                        extra.append(t)
                        continue
                    f = min(empty, key=lambda a: abs(a[1] - xc))[0]
                    cells[f] = t
                label = " ".join(label_words).strip()
                kind = "data" if cells else "section"
                out.append({"page": pno, "kind": kind, "label": label, "cells": cells, "extra": extra, "line": ln["text"]})
    extract.notes = notes
    return out
