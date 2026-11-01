#!/usr/bin/env python3
"""Parse a saved ADF&G "<hunt> Permit Hunt Information for Regulatory Year <year>" page
(index.cfm?adfg=huntingmaps.hunt_details&huntfile_id=...). Plain regex over the HTML, no BeautifulSoup.

Usage (debug): python -I draw_huntpage.py <hd2026_XXnnn.html>...
"""
import html as htmlmod
import json
import re
import sys


def _text(s):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>|</p>|</h\d>|</tr>|</li>", "\n", s, flags=re.I)
    s = re.sub(r"<t[dh][^>]*>", " | ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = re.sub(r"[ \t\r\xa0]+", " ", s)
    return re.sub(r"\n\s*", "\n", s)


def parse(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    i = raw.find('id="maincontentarticle"')
    body = raw[i:] if i > 0 else raw
    j = body.find("Section Navigation")
    t = _text(body[:j] if j > 0 else body)
    out = {}
    m = re.search(r"Hunt Number:\s*([A-Z]{2}\d{3})", t)
    out["hunt"] = m.group(1) if m else None
    m = re.search(r"Regulatory Year:\s*(\d{4})", t)
    out["regYear"] = int(m.group(1)) if m else None
    m = re.search(r"Hunt Type:\s*\|?\s*([A-Za-z ]+?)\s*\n", t)
    out["huntType"] = m.group(1).strip() if m else None
    m = re.search(r"Legal Animal:\s*(.+?)\n", t)
    out["legal"] = m.group(1).strip() if m else None
    m = re.search(r"GMU, Area\s*\n\s*(.+?)\n", t)
    out["gmuArea"] = m.group(1).strip() if m else None
    m = re.search(r"Season Dates\*?\s*\n\s*(.+?)\n", t)
    out["season"] = m.group(1).strip() if m else None
    m = re.search(r"Residency Restrictions\s*\n\s*(.+?)\n", t)
    out["residency"] = m.group(1).strip() if m else None
    m = re.search(r"Total Number of Permits Available\s*\|\s*(.+?)\n", t)
    out["totalPermits"] = m.group(1).strip(" |") if m else None
    m = re.search(r"Hunt Area:\s*(.+?)\n", t)
    out["huntArea"] = m.group(1).strip() if m else None
    return out


if __name__ == "__main__":
    print(json.dumps([parse(p) for p in sys.argv[1:]], indent=1))
