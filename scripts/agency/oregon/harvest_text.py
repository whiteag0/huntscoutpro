#!/usr/bin/env python3
"""Turn ODFW harvest PDFs into text cells for harvest_parse.py.

For every page, glyphs are grouped into lines (same baseline) and, inside a line,
kept in PDF content-stream order. A new cell starts when the stream jumps
backwards or leaves a gap wider than a column gap. This keeps table cells apart
even where ODFW's PDF prints a long hunt name over the next column (2022 deer
reports), which plain layout text cannot separate.

The large rotated "DRAFT" watermark glyphs (font size > 20) on the 2024 reports
are dropped. Also writes <name>.pl.txt (pdfplumber layout text, watermark
removed) for human spot checks.

Usage: python -I harvest_text.py <raw_dir>
Output: <raw_dir>/<name>.cells.json  [[page, [[top, x0, x1, text], ...]], ...]
"""
import glob
import json
import os
import sys

import pdfplumber

CELL_GAP = 4.0   # points; wider gaps start a new cell
WORD_GAP = 1.0   # points; wider gaps inside a cell become a space


def page_cells(page):
    chars = [c for c in page.chars if c.get("size", 0) < 20 and c["text"].strip()]
    lines = []  # [top, [chars in stream order]]
    for c in chars:
        for ln in lines:
            if abs(ln[0] - c["top"]) < 2.0:
                ln[1].append(c)
                break
        else:
            lines.append([c["top"], [c]])
    out = []
    for top, cs in sorted(lines, key=lambda x: x[0]):
        runs, cur = [], [cs[0]]
        for a, b in zip(cs, cs[1:]):
            if b["x0"] < a["x1"] - 1.0 or b["x0"] - a["x1"] > CELL_GAP:
                runs.append(cur)
                cur = [b]
            else:
                cur.append(b)
        runs.append(cur)
        for r in runs:
            text = r[0]["text"]
            for a, b in zip(r, r[1:]):
                text += (" " if b["x0"] - a["x1"] > WORD_GAP else "") + b["text"]
            out.append([round(top, 1), round(r[0]["x0"], 1), round(r[-1]["x1"], 1), text])
    out.sort(key=lambda c: (c[0], c[1]))
    return out


def main():
    raw = sys.argv[1]
    for pdf_path in sorted(glob.glob(os.path.join(raw, "*.pdf"))):
        out = pdf_path[:-4] + ".cells.json"
        txt = pdf_path[:-4] + ".pl.txt"
        if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(pdf_path) and os.path.exists(txt):
            continue
        pages, texts = [], []
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages, 1):
                pages.append([i, page_cells(page)])
                p = page.filter(lambda o: o.get("object_type") != "char" or o.get("size", 0) < 20)
                texts.append(p.extract_text(layout=True, x_tolerance=1, x_density=4, y_density=11) or "")
        json.dump(pages, open(out, "w"))
        open(txt, "w").write("\f".join(texts))
        print(out)


if __name__ == "__main__":
    main()
