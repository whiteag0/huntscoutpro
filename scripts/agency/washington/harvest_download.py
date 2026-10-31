"""Download WDFW game harvest report pages (HTML tables) for 2020-2025.

Usage: python -I harvest_download.py <raw_dir>
Pages are listed on https://wdfw.wa.gov/hunting/management/game-harvest
Raw files are saved as <raw_dir>/<year>/<report>.html (untrusted data).
"""
import os
import sys
import time

import requests

BASE = "https://wdfw.wa.gov/hunting/management/game-harvest"
YEARS = range(2020, 2026)
REPORTS = [
    "deer-general", "deer-special", "deer-statewide", "deer-combo", "deer-individual",
    "elk-general", "elk-special", "elk-statewide", "elk-combo", "elk-individual",
    "black-bear-general", "black-bear-spring", "black-bear-statewide",
    "cougar", "moose", "bighorn-sheep", "mountain-goat", "turkey-statewide",
]
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def url_for(year, report):
    return f"{BASE}/{year}/{report}"


def main(raw_dir):
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for y in YEARS:
        os.makedirs(os.path.join(raw_dir, str(y)), exist_ok=True)
        for rep in REPORTS:
            out = os.path.join(raw_dir, str(y), rep + ".html")
            if os.path.exists(out) and os.path.getsize(out) > 0:
                continue
            r = s.get(url_for(y, rep), timeout=60)
            print(y, rep, r.status_code, len(r.content))
            if r.status_code == 200:
                with open(out, "wb") as f:
                    f.write(r.content)
            time.sleep(0.5)


if __name__ == "__main__":
    main(sys.argv[1])
