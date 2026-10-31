#!/usr/bin/env python3
"""Download NDOW (Nevada Department of Wildlife) harvest documents used by
harvest_parse.py.

Usage:
  python -I scripts/agency/nevada/harvest_download.py <raw_dir>

Files are saved under <raw_dir> using the basename of each URL. Existing files
are skipped. Downloaded files are untrusted data; this script only writes them.
Index page: https://www.ndow.org/blog/hunt-statistics/  (pre-2022 files are in
the NDOW publications library, category "Other Hunt Statistics").
"""
import os
import sys
import time
import urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")

# Filterable "Nevada Big Game Hunt Data" workbooks — one per season. These hold
# the same per-hunt rows as the "<Species> Harvest by Unit Group" PDFs.
XLSX = {
    2020: "https://www.ndow.org/wp-content/uploads/2022/01/2020-Nevada-Big-Game-Hunt-Data-ADA-3.xlsx",
    2021: "https://www.ndow.org/wp-content/uploads/2022/03/2021-Nevada-Big-Game-Hunt-Data.xlsx",
    2022: "https://www.ndow.org/wp-content/uploads/2023/02/2022-Nevada-Big-Game-Hunt-Data.xlsx",
    2023: "https://www.ndow.org/wp-content/uploads/2024/02/2023-Nevada-Big-Game-Hunt-Data.xlsx",
    2024: "https://www.ndow.org/wp-content/uploads/2025/06/2024-Nevada-Big-Game-Hunt-Data.xlsx",
    2025: "https://www.ndow.org/wp-content/uploads/2026/03/2025-Nevada-Big-Game-Hunt-Data.xlsx",
}

# "<Species> Harvest by Unit Group" PDFs (used to spot-check the workbooks).
PDFS = [
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Mule-Deer-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Elk-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Antelope-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Black-Bear-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Desert-Bighorn-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-California-Bighorn-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Rocky-Bighorn-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/01/2020-Mountain-Goat-Harvest-by-Unit-Group-ADA.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Mule-Deer-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Elk-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Antelope-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Black-Bear-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Desert-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-California-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Rocky-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/03/2021-Mountain-Goat-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Mule-Deer-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Elk-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Antelope-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Black-Bear-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Desert-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-California-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Mountain-Goat-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/02/2022-Statewide-Harvest-Summary.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-Mule-Deer-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-Elk-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-Antelope-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-Black-Bear-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-Desert-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-California-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/02/2023-Rocky-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/03/2023-Mountain-Goat-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/07/2024-Mule-Deer-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Elk-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Antelope-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Black-Bear-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Desert-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-California-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Rocky-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Mountain-Goat-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Moose-Harvest-by-Unit-Group.pdf",
    "https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-NR-Guided-Mule-Deer-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2025/09/2024-Junior-Mule-Deer-Harvest-by-Units.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Mule-Deer-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Elk-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Antelope-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Bear-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Desert-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-California-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Rocky-Bighorn-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Mountain-Goat-Harvest-by-Unit-Group.pdf",
    "https://www.ndow.org/wp-content/uploads/2026/03/2025-Moose-Harvest-by-Unit-Group.pdf",
    # Big Game Status Book (mountain lion harvest tables) and lion support material
    "https://www.ndow.org/wp-content/uploads/2026/10/Big-Game-Status-Book_2026_10.2.26.pdf",
    "https://www.ndow.org/wp-content/uploads/2025/09/Big-Game-Status-Book-2025.pdf",
    "https://www.ndow.org/wp-content/uploads/2024/08/Big-Game-Status-Book_2024_web.pdf",
    "https://www.ndow.org/wp-content/uploads/2023/08/2022-23-Big-Game-Status-Book-1.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/07/2021-2022-Big-Game-Status-Book.pdf",
    "https://www.ndow.org/wp-content/uploads/2025/08/6-Mountain-Lion-Harvest-Data-Draft-Language-Support-Material.pdf",
    "https://www.ndow.org/wp-content/uploads/2022/04/2020-21-BIG-GAME-STATUS-BOOK-COMPLETE1.pdf",
]


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    time.sleep(0.5)
    return f"{len(data)} bytes"


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    for url in list(XLSX.values()) + PDFS:
        dest = os.path.join(raw, url.rsplit("/", 1)[1])
        try:
            print(fetch(url, dest), url)
        except Exception as e:  # noqa: BLE001
            print("FAIL", url, e)


if __name__ == "__main__":
    main()
