#!/usr/bin/env python3
"""Download New Mexico Department of Game and Fish (NM Dept. of Wildlife) harvest reports.

Usage:
    python -I scripts/agency/new-mexico/harvest_download.py <raw_dir>

Every document is listed on the agency index page
https://wildlife.dgf.nm.gov/hunting/harvest-reporting-information/
Files are saved as <key>.pdf and converted to <key>.txt with `pdftotext -layout`.
Downloaded files are treated as untrusted data; nothing in them is executed.
"""
import os
import subprocess
import sys
import time

import requests

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
)
BASE = "https://wildlife.dgf.nm.gov/download/"

# key -> (species, season year, title-ish, URL path)
DOCS = {
    "elk-2020": "2020_2021-elk-harvest-report/?wpdmdl=44855",
    "elk-2021": "2021-2022-elk-harvest-report/?wpdmdl=50328",
    "elk-2022": "2022-2023-elk-harvest-report/?wpdmdl=48473",
    "elk-2023": "2023-2024-elk-harvest-report/?wpdmdl=48482",
    "elk-2024": "2024-2025-elk-harvest-report/?wpdmdl=51252",
    "elk-2025": "2025-2026-elk-harvest-report/?wpdmdl=55155",
    "deer-2020": "2020_2021-deer-harvest-report/?wpdmdl=44854",
    "deer-2021": "2021-2022-deer-harvest-report/?wpdmdl=50327",
    "deer-2022": "2022-2023-deer-harvest-report/?wpdmdl=48472",
    "deer-2023": "2023-2024-deer-harvest-report/?wpdmdl=48481",
    "deer-2024": "2024-2025-deer-harvest-report/?wpdmdl=51251",
    "deer-2025": "2025-2026-deer-harvest-report/?wpdmdl=55156",
    "pronghorn-2020": "2020_2021-pronghorn-harvest-report/?wpdmdl=44860",
    "pronghorn-2022": "2022-2023-pronghorn-harvest-report/?wpdmdl=48478",
    "pronghorn-2023": "2023-2024-pronghorn-harvest-report/?wpdmdl=48486",
    "pronghorn-2024": "2024-2025-pronghorn-harvest-report/?wpdmdl=51256",
    "pronghorn-2025": "2025-2026-pronghorn-harvest-report/?wpdmdl=55149",
    "sheep-2020": "2020_2021-bighorn-sheep-harvest-report/?wpdmdl=44852",
    "sheep-2022": "2022-2023-bighorn-sheep-harvest-report/?wpdmdl=48471",
    "sheep-2023": "2023-2024-bighorn-sheep-harvest-report/?wpdmdl=50139",
    "sheep-2024": "2024-2025-bighorn-sheep-harvest-report/?wpdmdl=51249",
    "sheep-2025": "2025-2026-bighorn-sheep-harvest-report/?wpdmdl=57079",
    "turkey-2020": "2020-turkey-harvest-results/?wpdmdl=44862",
    "turkey-2021": "2021-turkey-harvest-report/?wpdmdl=50285",
    "turkey-2022": "2022-turkey-harvest-report/?wpdmdl=50288",
    "turkey-2023": "2023-turkey-harvest-report/?wpdmdl=50290",
    "turkey-2024": "2024-turkey-harvest-report/?wpdmdl=52673",
    "turkey-2025": "2025-turkey-harvest-report/?wpdmdl=56963",
    "bear-zone-2022": "2022-2023-annual-bear-mortality-by-zone/?wpdmdl=48465",
    "bear-state-2022": "2022-2023-annual-bear-mortality-statewide/?wpdmdl=48466",
    "bear-zone-2024": "annual-bear-mortality-by-zone-2024-2025/?wpdmdl=52653",
    "bear-state-2024": "annual-bear-mortality-statewide-2024-2025/?wpdmdl=52654",
    "bear-zone-2025": "annual-bear-mortality-by-zone-2025-2026/?wpdmdl=56275",
    "bear-state-2025": "annual-bear-mortality-statewide-2025-2026/?wpdmdl=56274",
    "lion-zone-2022": "2022-2023-annual-cougar-mortality-by-zone/?wpdmdl=48468",
    "lion-state-2022": "2022-2023-annual-cougar-mortality-statewide/?wpdmdl=48469",
    "lion-zone-2024": "annual-cougar-mortality-by-zone-2024-2025/?wpdmdl=52655",
    "lion-state-2024": "annual-cougar-mortality-by-statewide-2024-2025/?wpdmdl=52656",
    "lion-zone-2025": "annual-cougar-mortality-by-zone-2025-2026/?wpdmdl=56273",
    "lion-state-2025": "annual-cougar-mortality-statewide-2025-2026/?wpdmdl=56272",
}


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: harvest_download.py <raw_dir>")
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for key, path in DOCS.items():
        pdf = os.path.join(raw, key + ".pdf")
        if not os.path.exists(pdf) or os.path.getsize(pdf) < 1000:
            r = s.get(BASE + path, timeout=120)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                print(f"!! {key}: not a PDF ({r.headers.get('content-type')})")
                with open(os.path.join(raw, key + ".notpdf"), "wb") as f:
                    f.write(r.content)
                continue
            with open(pdf, "wb") as f:
                f.write(r.content)
            time.sleep(0.5)
        txt = os.path.join(raw, key + ".txt")
        subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)
        print(f"ok {key}: {os.path.getsize(pdf)} bytes")


if __name__ == "__main__":
    main()
