#!/usr/bin/env python3
"""Download Montana FWP drawing-statistics reports (draw years 2022-2026).

FWP publishes every drawing report in its public document repository, listed at
https://myfwp.mt.gov/fwpPub/drawingStatistics (POST repositoryList_input.action
with repositoryObjectId=<animal folder>). Each report is a PDF served from
https://myfwp.mt.gov/getRepositoryFile?objectID=<id>.

Usage:  python -I draw_download.py <raw_dir>
Writes <raw_dir>/listing-<folder>.html, <raw_dir>/pdf/<objectID>.pdf (raw bytes, may be .xls for 2022),
<raw_dir>/txt/<objectID>.txt (pdftotext -layout) and <raw_dir>/manifest.json.
Downloaded files are treated as untrusted data (parsed only, never executed).
"""
import json
import os
import re
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
LIST_URL = "https://myfwp.mt.gov/fwpPub/repositoryList_input.action"
PAGE_URL = "https://myfwp.mt.gov/fwpPub/drawingStatistics"
FILE_URL = "https://myfwp.mt.gov/getRepositoryFile?objectID={}"

# FWP repository folders (the "Animal" dropdown on the drawing statistics page).
FOLDERS = {
    "28561": "Antelope",
    "28562": "Elk",
    "28563": "Goat",
    "28564": "Moose",
    "94776": "Nonresident Combination",
    "94777": "Other",
    "28565": "Sheep",
    "28566": "White-tailed/Mule Deer",
}

# Report titles we parse (others in the folders, e.g. paddlefish, swan, bison,
# crane, Smith River, hound handler, are not HuntScout species).
WANT = re.compile(
    r"^(2022|2023|2024|2025|2026) .*(Antelope|Elk|Goat|Moose|Sheep|Deer|"
    r"Mountain Lion|Black Bear|Turkey|Combo|Combination)",
    re.I,
)
SKIP = re.compile(r"Hound|Bison|Swan|Crane|Paddlefish|Smith River", re.I)


REGS_BASE = "https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/"
# FWP hunting regulations (descriptions, deer species, hunting districts, fees, seasons)
REGS = [
    "2022/2022-dea-regulations-final-for-web.pdf",
    "2023/2023-dea-regulations-final-for-web.pdf",
    "2024/2024-dea-regulations-final-for-web-with-web-quality-maps.pdf",
    "2025/2025-dea-regulations-final-for-web.pdf",
    "2026/2026-dea-regulations-final-with-low-resolution-maps-for-web.pdf",
    "2023/2023-msgb-final-for-web.pdf",
    "2024/2024-msgb-final-for-web.pdf",
    "2025/2025-msgb-final-for-web-2.pdf",
    "2026/2026-msgb-final-for-web.pdf",
    "2026/2026-black-bear-final-for-web.pdf",
    "2026/2026-lion-final-for-web.pdf",
    "2026/2026-upgbrd-final-for-web.pdf",
    "2026/corrections-to-the-2026-printed-dea-regulations-and-legal-descriptions.pdf",
    "2026/corrections-to-the-2026-printed-msgb-regulations.pdf",
    "2026/corrections-to-the-2026-printed-black-bear-regulations.pdf",
]
# FWP web pages used for draw rules, dates and fees (saved as HTML)
PAGES = [
    "https://fwp.mt.gov/buyandapply/hunting-licenses/application-drawing-dates",
    "https://fwp.mt.gov/buyandapply/hunting-licenses/bonus-points",
    "https://fwp.mt.gov/buyandapply/hunting-licenses/drawing-statistics",
    "https://fwp.mt.gov/buyandapply/hunting-licenses/resident-licenses/fees",
    "https://fwp.mt.gov/buyandapply/hunting-licenses/nonresident-licenses/fees",
    "https://fwp.mt.gov/binaries/content/assets/fwp/buyandapply/hunting/bonus-points-faq--final-updated.pdf",
]


def fetch_static(s, raw):
    os.makedirs(os.path.join(raw, "regs"), exist_ok=True)
    os.makedirs(os.path.join(raw, "pages"), exist_ok=True)
    for rel in REGS:
        pdf = os.path.join(raw, "regs", os.path.basename(rel))
        if not os.path.exists(pdf):
            r = s.get(REGS_BASE + rel, timeout=300)
            r.raise_for_status()
            open(pdf, "wb").write(r.content)
        txt = pdf[:-4] + ".txt"
        if not os.path.exists(txt):
            subprocess.run(["pdftotext", "-layout", pdf, txt], check=True, stderr=subprocess.DEVNULL)
    for url in PAGES:
        name = url.split("fwp.mt.gov/")[1].replace("/", "_")
        if not name.endswith(".pdf"):
            name += ".html"
        out = os.path.join(raw, "pages", name)
        if not os.path.exists(out):
            r = s.get(url, timeout=120)
            r.raise_for_status()
            open(out, "wb").write(r.content)


def main(raw):
    os.makedirs(os.path.join(raw, "pdf"), exist_ok=True)
    os.makedirs(os.path.join(raw, "txt"), exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    s.get(PAGE_URL, timeout=60)
    manifest = {}
    for fid, fname in FOLDERS.items():
        r = s.post(LIST_URL, data={"repositoryObjectId": fid}, timeout=60)
        r.raise_for_status()
        with open(os.path.join(raw, f"listing-{fid}.html"), "w") as fh:
            fh.write(r.text)
        for oid, title in re.findall(r'objectID=(\d+)"[^>]*>([^<]+)<', r.text):
            title = re.sub(r"\s+", " ", title).strip()
            title = re.sub(r"\s[\d.]+ (KB|MB)$", "", title)
            if not WANT.match(title) or SKIP.search(title):
                continue
            manifest.setdefault(oid, {"objectID": oid, "title": title, "folders": []})
            manifest[oid]["folders"].append(fname)
    for oid, m in sorted(manifest.items()):
        pdf = os.path.join(raw, "pdf", f"{oid}.pdf")
        txt = os.path.join(raw, "txt", f"{oid}.txt")
        if not os.path.exists(pdf) or os.path.getsize(pdf) < 1000:
            r = s.get(FILE_URL.format(oid), timeout=120)
            r.raise_for_status()
            with open(pdf, "wb") as fh:
                fh.write(r.content)
            time.sleep(0.5)
        head = open(pdf, "rb").read(8)
        # 2022 reports are served as legacy Excel (OLE2) workbooks, not PDFs.
        m["contentType"] = ("pdf" if head[:5] == b"%PDF-" else
                            "xls" if head == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" else
                            "xlsx" if head[:2] == b"PK" else "other")
        m["url"] = FILE_URL.format(oid)
        if m["contentType"] == "pdf" and not os.path.exists(txt):
            subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)
        print(oid, m["contentType"], m["title"])
    with open(os.path.join(raw, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    fetch_static(s, raw)


if __name__ == "__main__":
    main(sys.argv[1])
