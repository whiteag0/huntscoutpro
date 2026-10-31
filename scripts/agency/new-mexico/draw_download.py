#!/usr/bin/env python3
"""Download NMDGF drawing-odds reports and fee/rules documents used for the
New Mexico draw dataset. Usage: draw_download.py <raw_dir>
Files are saved as-is (untrusted data); nothing is executed from them."""
import os, sys, requests

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
BASE = "https://wildlife.dgf.nm.gov/download/"
DOCS = {
    # big-game complete drawing odds reports (elk, deer, pronghorn, sheep, oryx, ibex...)
    "2022-complete": "2022-big-game-draw-odds-complete-report/?wpdmdl=48730",
    "2023-complete": "2023-big-game-draw-odds-complete-report/?wpdmdl=48734",
    "2024-complete": "2024-drawing-odds-complete-report/?wpdmdl=48997",
    "2025-complete": "2025-drawing-odds-complete-report/?wpdmdl=52046",
    "2026-complete": "2026-big-game-drawing-odds-complete-report/?wpdmdl=56113",
    "2023-summary": "2023-big-game-draw-odds-summary/?wpdmdl=48735",
    "2024-summary": "2024-drawing-odds-summary-report/?wpdmdl=48996",
    "2025-summary": "2025-drawing-odds-summary-report/?wpdmdl=52047",
    "2026-summary": "2026-big-game-drawing-odds-summary-report/?wpdmdl=56112",
    # bear & turkey draw odds
    "2022-bear-turkey": "2022-bear-and-turkey-draw-odds-report/?wpdmdl=48731",
    "2023-bear-turkey": "2023-bear-and-turkey-draw-odds-report/?wpdmdl=48733",
    "2024-bear-turkey": "2024-bear-and-turkey-draw-odds-report/?wpdmdl=48995",
    "2025-bear-turkey": "2025-bear-and-turkey-draw-odds-report/?wpdmdl=50810",
    "2026-bear-turkey": "2026-bear-and-turkey-draw-odds-report/?wpdmdl=55353",
    # fees & rules
    "2027-2028-draw-fees": "2027-2028-draw-licenses-and-fees/?wpdmdl=57207",
    "2027-2028-otc-fees": "2027-2028-over-the-counter-otc-license-fees/?wpdmdl=57206",
    "draw-fees": "draw-licenses-and-fees/?wpdmdl=53903",
    "otc-fees": "04-over-the-counter-otc-license-fees/?wpdmdl=52835",
    "2026-2027-rib": "2026-2027-new-mexico-hunting-rules-and-info/?wpdmdl=52826",
}

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    s = requests.Session(); s.headers["User-Agent"] = UA
    for name, path in DOCS.items():
        have = [f for f in os.listdir(out) if f.rsplit(".", 1)[0] == name]
        if have:
            print("have", have[0]); continue
        r = s.get(BASE + path, timeout=180)
        ct = r.headers.get("content-type", "")
        print(r.status_code, ct, len(r.content), name, r.url)
        if r.ok and r.content[:4] == b"%PDF":
            ext = ".pdf"
        elif r.ok and r.content[:2] == b"PK":
            ext = ".xlsx"
        else:
            print("  NOT a PDF/XLSX - skipped"); continue
        open(os.path.join(out, name + ext), "wb").write(r.content)

if __name__ == "__main__":
    main()
