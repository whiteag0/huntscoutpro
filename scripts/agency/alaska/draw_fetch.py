#!/usr/bin/env python3
"""Download the ADF&G drawing-permit documents used for Alaska draw data (raw, untouched).

Sources (all Alaska Department of Fish and Game, Division of Wildlife Conservation):
  * Alaska Drawing Permit Hunt Supplements 2022-2023 .. 2027-2028 (PDF). Each supplement lists the hunts
    for its regulatory year (hunt number, GMU/area, permits, season dates, legal animal, hunt area) and its
    back page holds "Results of the <year> Permit Hunt Drawing" (applications received, permits available,
    % drawn) for the previous drawing.
  * 2027-2028 Alaska Subsistence Permit Hunt Supplement (Tier II application period and rules).
  * 2026-2027 Alaska Hunting Regulations (license and locking-tag fees, regulatory year).
  * ADF&G web pages: drawing overview, supplements, draw results, Tier I/II, registration, lottery,
    undersubscribed hunts, license & tag prices.
  * Per-hunt pages for the 2026 regulatory year (huntingmaps.find_hunt -> huntingmaps.hunt_details) for
    every moose, sheep, goat, black bear and elk drawing hunt in the 2026 results, used to cross-check
    the supplement parser (draw_spotcheck.py) and for residency restrictions.

Usage: python -I draw_fetch.py <raw_dir> [--no-hunts]
Downloaded files are treated as untrusted data; this script only saves them.
"""
import os
import re
import sys
import time

import requests

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
B = "https://www.adfg.alaska.gov"
SUPPLEMENTS = {
    # file name -> url (older supplements are kept under /static/license/huntlicense/pdfs/)
    "supp_2022-2023.pdf": B + "/static/license/huntlicense/pdfs/2022-2023_draw_supplement.pdf",
    "supp_2023-2024.pdf": B + "/static/license/huntlicense/pdfs/2023-2024_draw_supplement.pdf",
    "supp_2024-2025.pdf": B + "/static/license/huntlicense/pdfs/2024-2025_draw_supplement.pdf",
    "supp_2025-2026.pdf": B + "/static/license/huntlicense/pdfs/2025-2026_draw_supplement.pdf",
    "supp_2026-2027.pdf": B + "/static/license/huntlicense/pdfs/2026-2027-draw-supplement.pdf",
    "supp_2027-2028.pdf": B + "/static/applications/web/nocache/license/huntlicense/pdfs/2027-2028-draw-supplement.pdf3BFB1645DB9A3CB33708AE9235433E9910F96D86BB6DD0A02297417F7BB8B4BD/2027-2028-draw-supplement.pdf",
    "subs_2027-2028.pdf": B + "/static/applications/web/nocache/license/huntlicense/pdfs/2027-2028-subsistence-supplement.pdf359F3A3B0DB7D8CD13881BC0478CF175D845293AE782FCF239536C1113502F9D/2027-2028-subsistence-supplement.pdf",
    "regs_complete.pdf": B + "/static/applications/web/nocache/regulations/wildliferegulations/pdfs/regulations_complete.pdfF4FABFEA04F84DC3012883459CAC68B5536D84B54ADFAC1BE626F863AC94BC83/regulations_complete.pdf",
}
PAGES = ["draw", "drawsupplements", "drawresults", "drawmoreinfo", "lottery", "undersubscribed", "tier",
         "tiersupplements", "tierresults", "registration", "prices", "general"]
SPECIES_PREFIX = ("DM", "YM", "DS", "DG", "DL", "DE")


def get(session, url, dest, retries=3, data=None):
    for a in range(retries):
        try:
            r = session.post(url, headers=UA, files=data, timeout=120) if data else session.get(url, headers=UA, timeout=120)
            if r.status_code == 200:
                with open(dest, "wb") as f:
                    f.write(r.content)
                return True
            print("HTTP", r.status_code, url, file=sys.stderr)
        except requests.RequestException as e:
            print("ERR", e, url, file=sys.stderr)
        time.sleep(2 * (a + 1))
    return False


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    for name, url in SUPPLEMENTS.items():
        dest = os.path.join(raw, name)
        if not os.path.exists(dest):
            print("GET", url)
            get(s, url, dest)
    for p in PAGES:
        get(s, f"{B}/index.cfm?adfg=huntlicense.{p}", os.path.join(raw, f"{p}.html"))
    if "--no-hunts" in sys.argv:
        return
    # hunt numbers from the 2026 drawing results (back page of the 2027-2028 supplement, pdftotext -layout)
    txt_path = os.path.join(raw, "supp_2027-2028.txt")
    if not os.path.exists(txt_path):
        os.system(f"pdftotext -layout '{os.path.join(raw, 'supp_2027-2028.pdf')}' '{txt_path}'")
    t = open(txt_path, encoding="utf-8", errors="replace").read()
    sec = t[t.find("Results of the 2026 Permit Hunt Drawing"):]
    codes = sorted({c for c in re.findall(r"\b([DY][A-Z]\d{3})\*{0,2}\s+\d+\s+\d+\s+(?:<1|\d+)", sec) if c[:2] in SPECIES_PREFIX})
    hd = os.path.join(raw, "hunts")
    os.makedirs(hd, exist_ok=True)
    for c in codes:
        cur = os.path.join(hd, f"find_{c}.html")
        if not os.path.exists(cur):
            get(s, f"{B}/index.cfm?adfg=huntingmaps.find_hunt&huntnum={c}", cur)
            time.sleep(0.4)
        if not os.path.exists(cur):
            continue
        h = open(cur, encoding="utf-8", errors="replace").read()
        m = re.search(r"Regulatory Year (\d{4})", h)
        dest26 = os.path.join(hd, f"hd2026_{c}.html")
        if m and m.group(1) == "2026":
            if not os.path.exists(dest26):
                with open(dest26, "w", encoding="utf-8") as f:
                    f.write(h)
            continue
        m2 = re.search(r'huntfile_id=(\d+)"?[^>]*>\s*' + c + r"\s+for the 2026 Regulatory Year", h)
        if m2 and not os.path.exists(dest26):
            get(s, f"{B}/index.cfm?adfg=huntingmaps.hunt_details&huntfile_id={m2.group(1)}", dest26)
            time.sleep(0.4)
    print("hunts:", len(codes))


if __name__ == "__main__":
    main()
