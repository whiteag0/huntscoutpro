#!/usr/bin/env python3
"""Download Utah DWR drawing-odds source documents (draw side).

Usage:
  python -I scripts/agency/utah/draw_fetch.py <raw_dir>

Downloads into <raw_dir> (keep it OUTSIDE the repo):
  pdf/*.pdf + pdf/*.txt   UDWR drawing odds PDFs 2022-2025 (pdftotext -layout)
  api/*.json              2026 draw odds from the UDWR licensing system
                          (utahdraws.com "Draw Odds" page, linked from
                          wildlife.utah.gov/biggame/odds), which is where UDWR
                          published 2026 results instead of PDFs.
"""
import json
import os
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
BASE = "https://wildlife.utah.gov"

PDFS = {}
for yy in ("22", "23", "24", "25"):
    PDFS[f"{yy}_bg-odds.pdf"] = f"{BASE}/pdf/bg/20{yy}/{yy}_bg-odds.pdf"
    PDFS[f"{yy}_deer_odds.pdf"] = f"{BASE}/pdf/bg/20{yy}/{yy}_deer_odds.pdf"
    PDFS[f"{yy}_antlerless_drawing_odds_report.pdf"] = f"{BASE}/pdf/bg/20{yy}/{yy}_antlerless_drawing_odds_report.pdf"
    PDFS[f"{yy}_bear.pdf"] = f"{BASE}/pdf/bear/{yy}_drawing_odds.pdf"
    PDFS[f"20{yy}_turkey.pdf"] = f"{BASE}/pdf/uplandgame/turkey/20{yy}_turkey_bonus_points_draw_results.pdf"
PDFS["2022_cougar.pdf"] = f"{BASE}/pdf/cougar/2022_cougar_odds_report.pdf"
PDFS["2023_cougar.pdf"] = f"{BASE}/pdf/cougar/2023_cougar_odds_report.pdf"

API_ROOT = "https://www.utahdraws.com/internetsales"
# (drawName, masterHuntTypeID, file stem)
API_2026 = [
    ("Big Game", 5, "general_deer"),
    ("Big Game", 8, "le_deer"),
    ("Big Game", 9, "le_elk"),
    ("Big Game", 10, "le_pronghorn"),
    ("Big Game", 11, "moose"),
    ("Big Game", 13, "desert_sheep"),
    ("Big Game", 14, "rm_sheep"),
    ("Big Game", 15, "goat"),
    ("Black Bear", 1, "bear"),
    ("Turkey", 3, "turkey"),
    ("Antlerless", 17, "antlerless_deer"),
    ("Antlerless", 18, "antlerless_elk"),
    ("Antlerless", 19, "antlerless_moose"),
    ("Antlerless", 20, "doe_pronghorn"),
    ("Antlerless", 21, "ewe_rm_sheep"),
]


def main():
    raw = sys.argv[1]
    os.makedirs(os.path.join(raw, "pdf"), exist_ok=True)
    os.makedirs(os.path.join(raw, "api"), exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for name, url in PDFS.items():
        out = os.path.join(raw, "pdf", name)
        if not os.path.exists(out):
            r = s.get(url, timeout=120)
            r.raise_for_status()
            open(out, "wb").write(r.content)
            time.sleep(0.5)
        subprocess.run(["pdftotext", "-layout", out, out[:-4] + ".txt"], check=True)
        print("pdf", name)
    s.get(f"{API_ROOT}/home/drawodds", timeout=60)
    hdr = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
    r = s.get(f"{API_ROOT}/Home/DrawOddsSupplementData", headers=hdr, timeout=60)
    r.raise_for_status()
    open(os.path.join(raw, "api", "supplement.json"), "w").write(r.text)
    for draw, mid, stem in API_2026:
        r = s.get(f"{API_ROOT}/Home/DrawOddsData", params={"drawName": draw, "licenseYear": 2026, "masterHuntTypeID": mid}, headers=hdr, timeout=180)
        r.raise_for_status()
        d = r.json()
        assert d.get("Status") == 0, (stem, d.get("Message"))
        open(os.path.join(raw, "api", f"2026_{stem}.json"), "w").write(r.text)
        print("api", stem, len(d["Data"]))
        time.sleep(0.5)


if __name__ == "__main__":
    main()
