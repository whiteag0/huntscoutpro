#!/usr/bin/env python3
"""Download Montana FWP harvest estimates (raw, untouched) for HuntScout Pro.

Sources
  1. FWP "Harvest Estimates Search" (https://myfwp.mt.gov/fwpPub/harvestReports):
     CSV + PDF per species and license year, all hunting districts, for
     Deer (DE), Elk (EL), Antelope (PA), Moose (MO), Sheep (BS), Mountain Goat (MG).
  2. FWP harvest-report repository PDFs (same page, document list) for
     Black Bear, Mountain Lion and Turkey, which the search tool does not cover.

Usage: python -I harvest_download.py <raw_dir> [first_year] [last_year]
Files are written to <raw_dir>; nothing is parsed here.
"""
import os
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
BASE = "https://myfwp.mt.gov"
SEARCH_SPECIES = ["DE", "EL", "PA", "MO", "BS", "MG"]

# objectIDs as listed on https://myfwp.mt.gov/fwpPub/harvestReports (retrieved 2026-10-31)
REPO_PDFS = {
    "bear": {2025: 117272, 2024: 113505, 2023: 112156, 2022: 110285, 2021: 106594, 2020: 103066},
    "lion": {2025: 117273, 2024: 113504, 2023: 112158, 2022: 110286, 2021: 106593, 2020: 103068},
    "turkey": {},  # filled from the page (see TURKEY below)
}


def main():
    raw = sys.argv[1]
    y0 = int(sys.argv[2]) if len(sys.argv) > 2 else 2020
    y1 = int(sys.argv[3]) if len(sys.argv) > 3 else 2025
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    page = s.get(BASE + "/fwpPub/harvestReports", timeout=60)
    page.raise_for_status()
    open(os.path.join(raw, "harvestReports.html"), "wb").write(page.content)

    for sp in SEARCH_SPECIES:
        for y in range(y0, y1 + 1):
            for ft, ext in (("CSV", "csv"), ("PDF", "pdf")):
                out = os.path.join(raw, f"search_{sp}_{y}.{ext}")
                if os.path.exists(out) and os.path.getsize(out) > 500:
                    continue
                r = s.post(BASE + "/fwpPub/downloadHarvReports.action", data={
                    "fileType": ft, "fileName": "fwpHarvestEstimatesReport", "survey": sp,
                    "startYr": str(y), "endYr": str(y), "district": "ALL"}, timeout=180)
                r.raise_for_status()
                open(out, "wb").write(r.content)
                print(out, len(r.content), r.headers.get("content-type"))
                time.sleep(1)

    from bs4 import BeautifulSoup  # only for the document list
    soup = BeautifulSoup(page.content, "lxml")
    turkey = {}
    for a in soup.find_all("a", href=True):
        if "getRepositoryFile" not in a["href"]:
            continue
        t = a.get_text(" ", strip=True).lower()
        if "turkey" in t and t[:4].isdigit():
            turkey.setdefault(int(t[:4]), int(a["href"].split("=")[-1]))
    REPO_PDFS["turkey"] = turkey
    for sp, years in REPO_PDFS.items():
        for y, oid in sorted(years.items()):
            if y < y0 or y > y1:
                continue
            if any(os.path.exists(os.path.join(raw, f"repo_{sp}_{y}.{e}")) for e in ("pdf", "xlsx")):
                continue
            r = s.get(f"{BASE}/getRepositoryFile?objectID={oid}", timeout=180)
            r.raise_for_status()
            ext = "xlsx" if r.content[:2] == b"PK" else "pdf"
            out = os.path.join(raw, f"repo_{sp}_{y}.{ext}")
            open(out, "wb").write(r.content)
            print(out, oid, len(r.content), r.headers.get("content-type"))
            time.sleep(1)


if __name__ == "__main__":
    main()
