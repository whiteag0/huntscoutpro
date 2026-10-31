#!/usr/bin/env python3
"""Download Wyoming Game and Fish Department (WGFD) annual harvest reports.

Index page: https://wgfd.wyo.gov/hunting-trapping/harvest-reports-surveys
Usage: python -I harvest_download.py <raw_dir>
Files land as <raw_dir>/<species>_<year>.pdf and are then converted with
`pdftotext -layout` to <raw_dir>/<species>_<year>.txt.
"""
import os
import subprocess
import sys
import time

import requests

BASE = "https://wgfd.wyo.gov"
INDEX = BASE + "/hunting-trapping/harvest-reports-surveys"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# (file key, report year, media path) exactly as linked from INDEX on 2026-10-31.
REPORTS = [
    ("pronghorn", 2025, "/media/33375/download?inline"),
    ("pronghorn", 2024, "/media/31880/download?inline"),
    ("pronghorn", 2023, "/media/29212/download?inline"),
    ("pronghorn", 2022, "/media/27412/download?inline"),
    ("pronghorn", 2021, "/media/22078/download?inline"),
    ("deer", 2025, "/media/33467/download?inline"),
    ("deer", 2024, "/media/31996/download?inline"),
    ("deer", 2023, "/media/29194/download?inline"),
    ("deer", 2022, "/media/27413/download?inline"),
    ("deer", 2021, "/media/22079/download?inline"),
    ("elk", 2025, "/media/33482/download?inline"),
    ("elk", 2024, "/media/32051/download?inline"),
    ("elk", 2023, "/media/29195/download?inline"),
    ("elk", 2022, "/media/27414/download?inline"),
    ("elk", 2021, "/media/22080/download?inline"),
    ("moose", 2025, "/media/33468/download?inline"),
    ("moose", 2024, "/media/32043/download?inline"),
    ("moose", 2023, "/media/29193/download?inline"),
    ("moose", 2022, "/media/23771/download?inline"),
    ("moose", 2021, "/media/22081/download?inline"),
    ("sheep", 2025, "/media/33470/download?inline"),
    ("sheep", 2024, "/media/31968/download?inline"),
    ("sheep", 2023, "/media/29196/download?inline"),
    ("sheep", 2022, "/media/27418/download?inline"),
    ("sheep", 2021, "/media/22082/download?inline"),
    ("goat", 2025, "/media/33469/download?inline"),
    ("goat", 2024, "/media/31961/download?inline"),
    ("goat", 2023, "/media/29197/download?inline"),
    ("goat", 2022, "/media/27422/download?inline"),
    ("goat", 2021, "/media/22083/download?inline"),
    ("bear", 2025, "/media/33615/download?inline"),
    ("bear", 2024, "/media/33130/download?inline"),
    ("bear", 2023, "/media/32120/download?inline"),
    ("bear", 2022, "/media/32104/download?inline"),
    ("bear", 2021, "/media/23087/download?inline"),
    ("lion", 2025, "/media/33975/download?inline"),
    ("lion", 2024, "/media/32949/download?inline"),
    ("lion", 2023, "/media/32526/download?inline"),
    ("lion", 2022, "/media/32121/download?inline"),
    ("lion", 2021, "/media/23089/download?inline"),
    ("turkey", 2025, "/media/33991/download?inline"),
    ("turkey", 2024, "/media/33009/download?inline"),
    ("turkey", 2023, "/media/31668/download?inline"),
    ("turkey", 2022, "/media/31081/download?inline"),
    ("turkey", 2021, "/media/31080/download?inline"),
    # 2020 reports: no longer linked from INDEX; located on wgfd.wyo.gov via site search
    # (2026-10-31). Same WGFD report series, same table layout as 2021.
    ("elk", 2020, "/media/19491/download?inline"),
    ("deer", 2020, "/media/19490/download?inline"),
    ("pronghorn", 2020, "/media/31294/download?inline"),
    ("moose", 2020, "/media/18964/download?inline"),
    ("sheep", 2020, "/media/18965/download?inline"),
    ("goat", 2020, "/media/18966/download?inline"),
    ("bear", 2020, "/media/18969/download?inline"),
    ("lion", 2020, "/media/22073/download?inline"),
    ("turkey", 2020, "/media/22075/download?inline"),
]


def url_for(path):
    return BASE + path


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for key, year, path in REPORTS:
        out = os.path.join(raw, f"{key}_{year}.pdf")
        if not os.path.exists(out) or os.path.getsize(out) < 1000:
            r = s.get(url_for(path), timeout=120)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                print("NOT A PDF", key, year, r.headers.get("content-type"))
                continue
            with open(out, "wb") as f:
                f.write(r.content)
            with open(out[:-4] + ".hdr.txt", "w") as f:
                f.write(f"url: {url_for(path)}\ncontent-disposition: {r.headers.get('content-disposition')}\n"
                        f"last-modified: {r.headers.get('last-modified')}\n")
            time.sleep(0.5)
        txt = out[:-4] + ".txt"
        subprocess.run(["pdftotext", "-layout", out, txt], check=True)
        print(key, year, os.path.getsize(out))


if __name__ == "__main__":
    main()
