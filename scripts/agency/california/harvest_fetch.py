"""Download CDFW (California Department of Fish and Wildlife) harvest documents.

Usage:
  python -I scripts/agency/california/harvest_fetch.py <raw_dir>

Writes every document into <raw_dir> (keep it OUTSIDE the repo; the files are untrusted data)
and converts each PDF to <name>.txt with `pdftotext -layout`.

Documents (all listed on wildlife.ca.gov, retrieved 2026-10-31):
  deer_<yyyy>.pdf        Deer Harvest Report (wildlife.ca.gov/Hunting/Deer#stats), 2020-2025
  deer_seasons_*.pdf     Approved 2026 deer seasons (zone / additional hunts / archery) -> hunt names
  elk_<yyyy>.pdf         Elk Hunt Statistics (wildlife.ca.gov/Hunting/Elk#hunt-stats), 2020-2022
                         (CDFW has not posted 2023-2025 elk hunt statistics as of 2026-10-31)
  pronghorn_<yyyy>.pdf   Pronghorn Hunt Statistics (wildlife.ca.gov/Hunting/Pronghorn-Antelope), 2020-2023
  bear_2020.pdf          2020 Bear Take Report
  bear_interim_2021_2023.pdf  Interim Black Bear Take Report 2021-2023
  bear_annual_2025.pdf   2025 Black Bear Program Annual Report (July 2026; covers the 2024 season)
  upland_<yyyy>.pdf      Upland Game Bird (and Small Game Mammal) Harvest Survey (turkey), 2020, 2022, 2023
  Hunting_Bighorn-Sheep.html             current Bighorn Sheep Hunting page (2025 hunter success)
  wayback/sheep_<timestamp>.html         Internet Archive captures of the same CDFW page that carried the
                                         2020-2024 "Hunter Success (%)" tables (CDFW replaces the table each year)
"""
import os
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
FH = "https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID={}&inline"

DOCS = {
    "deer_2025.pdf": 245246, "deer_2024.pdf": 232831, "deer_2023.pdf": 222330,
    "deer_2022.pdf": 212676, "deer_2021.pdf": 200551, "deer_2020.pdf": 197194,
    "deer_seasons_zone.pdf": 168214, "deer_seasons_additional.pdf": 168215, "deer_seasons_archery.pdf": 168216,
    "elk_2022.pdf": 211299, "elk_2021.pdf": 200680, "elk_2020.pdf": 192238,
    "pronghorn_2023.pdf": 220233, "pronghorn_2022.pdf": 211300, "pronghorn_2021.pdf": 200681, "pronghorn_2020.pdf": 192261,
    "bear_2020.pdf": 195525, "bear_interim_2021_2023.pdf": 231210, "bear_annual_2025.pdf": 246936,
    "upland_2020.pdf": 195214, "upland_2022.pdf": 225246, "upland_2023.pdf": 243717,
}
PAGES = {
    "Hunting_Bighorn-Sheep.html": "https://wildlife.ca.gov/Hunting/Bighorn-Sheep",
    "Hunting_Deer.html": "https://wildlife.ca.gov/Hunting/Deer",
    "Hunting_Elk.html": "https://wildlife.ca.gov/Hunting/Elk",
    "Hunting_Pronghorn-Antelope.html": "https://wildlife.ca.gov/Hunting/Pronghorn-Antelope",
    "Hunting_Bear.html": "https://wildlife.ca.gov/Hunting/Bear",
    "Hunting_Upland-Game-Birds.html": "https://wildlife.ca.gov/Hunting/Upland-Game-Birds",
}
# Internet Archive captures of wildlife.ca.gov/Hunting/Bighorn-Sheep, one per published success table.
SHEEP_WAYBACK = {
    2020: "20211128030800",
    2021: "20221225140234",
    2022: "20231201054539",
    2023: "20240717133526",
    2024: "20251218020221",
}


def get(url, path, skip_existing=False, backoff=3):
    if skip_existing and os.path.exists(path) and os.path.getsize(path) > 1000:
        print("have", os.path.basename(path))
        return
    for attempt in range(4):
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=90)
            if r.status_code == 200 and r.content:
                with open(path, "wb") as f:
                    f.write(r.content)
                print("ok ", os.path.basename(path), len(r.content))
                return
            print("HTTP", r.status_code, url)
        except requests.RequestException as e:
            print("err", e)
        time.sleep(backoff * (attempt + 1))
    raise SystemExit(f"failed: {url}")


def main():
    raw = sys.argv[1]
    os.makedirs(os.path.join(raw, "wayback"), exist_ok=True)
    for name, docid in DOCS.items():
        p = os.path.join(raw, name)
        get(FH.format(docid), p)
        subprocess.run(["pdftotext", "-layout", p, p[:-4] + ".txt"], check=True)
    for name, url in PAGES.items():
        get(url, os.path.join(raw, name))
    for year, ts in SHEEP_WAYBACK.items():
        get(f"https://web.archive.org/web/{ts}id_/https://wildlife.ca.gov/Hunting/Bighorn-Sheep",
            os.path.join(raw, "wayback", f"sheep_{ts}.html"), skip_existing=True, backoff=30)
        time.sleep(5)  # web.archive.org answers 429 to fast clients


if __name__ == "__main__":
    main()
