#!/usr/bin/env python3
"""Download NDOW (Nevada Department of Wildlife) big game draw documents.

Usage: python -I scripts/agency/nevada/draw_download.py <raw_dir>

Files are saved under <raw_dir>/<category>/<basename>; already-downloaded files are skipped.
Source list compiled 2026-10-31 from the ndow.org WordPress media library
(https://www.ndow.org/wp-json/wp/v2/media?search=...). Treat downloads as untrusted data.
"""
import os
import subprocess
import sys
import time

import requests

BASE = "https://www.ndow.org/wp-content/uploads/"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# "Nevada Bonus Point and Application Choice Trends" — one PDF per hunt class/weapon (and
# sometimes residency) per draw year. Draw years 2022-2025 (2026 not yet published as of 2026-10-31).
TREND = [
    "2023/01/Mule-Deer-NonResident-Guided-Antlered-ALW-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Antelope-Horns-Longer-ALW-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Antelope-Horns-Longer-Archery-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Antelope-Horns-Longer-Muzzle-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Antelope-Horns-Shorter-Bonus-Point-and-Application-Trend-2022.pdf",
    "2023/02/Black-Bear-Bonus-Point-and-Application-Trend-2022.pdf",
    "2023/02/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-2022.pdf",
    "2023/02/Desert-Bighorn-Any-Ewe-Bonus-Point-and-Application-Trend-2022.pdf",
    "2023/02/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-Resident-2022-ADA-update.pdf",
    "2023/02/Desert-Bighorn-Any-Ram-Archery-Bonus-Point-and-Application-Trend-Resident-2022.pdf",
    "2023/02/Desert-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-NonResident-2022.pdf",
    "2023/02/Elk-Antlered-ALW-Bonus-Point-and-Application-Trend-2022-ADA-update.pdf",
    "2023/02/Elk-Antlered-Archery-Bonus-Point-and-Application-Trend-2022.pdf",
    "2023/02/Elk-Antlered-Depredation-Bonus-Point-and-Application-Trend-2022.pdf",
    "2023/02/Elk-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Elk-Antlerless-ALW-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Elk-Antlerless-Archery-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Elk-Antlerless-Depredation-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Elk-Antlerless-Muzzleloader-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Elk-Spike-ALW-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Mule-Deer-Antlered-ALW-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Mule-Deer-Antlered-Archery-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Mule-Deer-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Mule-Deer-Antlerless-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Mule-Deer-Junior-Hunt-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2023/02/Rocky-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-2022-ADA.pdf",
    "2024/01/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-NonResident-2023.pdf",
    "2024/01/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-Resident-2023.pdf",
    "2024/01/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-NonResident-2023.pdf",
    "2024/01/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-Resident-2023.pdf",
    "2024/01/Desert-Bighorn-Any-Ram-Archery-Bonus-Point-and-Application-Trend-NonResident-2023.pdf",
    "2024/01/Desert-Bighorn-Any-Ram-Archery-Bonus-Point-and-Application-Trend-Resident-2023.pdf",
    "2024/01/Rocky-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Antelope-Horns-Longer-ALW-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Antelope-Horns-Longer-Archery-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Antelope-Horns-Longer-Muzzle-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Antelope-Horns-Shorter-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Black-Bear-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Desert-Bighorn-Any-Ewe-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlered-ALW-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlered-Archery-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlered-Depredation-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlerless-ALW-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlerless-Archery-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlerless-Depredation-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Antlerless-Muzzleloader-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Elk-Spike-ALW-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mountain-Goat-Any-Goat-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mule-Deer-Antlered-ALW-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mule-Deer-Antlered-Archery-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mule-Deer-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mule-Deer-Antlerless-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mule-Deer-Junior-Hunt-Bonus-Point-and-Application-Trend-2023.pdf",
    "2024/02/Mule-Deer-NonResident-Guided-Antlered-ALW-Bonus-Point-and-Application-Trend-2023.pdf",
    "2025/01/Antelope-Horns-Longer-ALW-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Antelope-Horns-Longer-Archery-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Antelope-Horns-Longer-Muzzleloader-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Black-Bear-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-NonResident-2024.pdf",
    "2025/01/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-Resident-2024.pdf",
    "2025/01/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-NonResident-2024.pdf",
    "2025/01/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-Resident-2024.pdf",
    "2025/01/Desert-Bighorn-Any-Ram-Archery-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Desert-Bighorn-Management-Ram-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Elk-Antlered-ALW-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Elk-Antlered-Archery-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Elk-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Moose-Antlered-ALW-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Mountain-Goat-Any-Goat-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Mule-Deer-Antlered-ALW-Bonus-Point-and-Application-Trend-NonResident-2024.pdf",
    "2025/01/Mule-Deer-Antlered-ALW-Bonus-Point-and-Application-Trend-Resident-2024.pdf",
    "2025/01/Mule-Deer-Antlered-Archery-Bonus-Point-and-Application-Trend-NonResident-2024.pdf",
    "2025/01/Mule-Deer-Antlered-Archery-Bonus-Point-and-Application-Trend-Resident-2024.pdf",
    "2025/01/Mule-Deer-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-NonResident-2024.pdf",
    "2025/01/Mule-Deer-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-Resident-2024.pdf",
    "2025/01/Mule-Deer-Junior-Hunt-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Mule-Deer-NonResident-Guided-Antlered-ALW-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/01/Rocky-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/02/Antelope-Horns-Shorter-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/02/Elk-Antlerless-ALW-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/02/Elk-Antlerless-Archery-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/02/Elk-Antlerless-Muzzleloader-Bonus-Point-and-Application-Trend-2024.pdf",
    "2025/02/Elk-Spike-ALW-Bonus-Point-and-Application-Trend-2024.pdf",
    "2026/01/Antelope-Horns-Longer-ALW-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Antelope-Horns-Longer-ALW-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Antelope-Horns-Longer-Archery-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Antelope-Horns-Longer-Archery-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Antelope-Horns-Longer-Muzzleloader-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Antelope-Horns-Shorter-ALW-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Black-Bear-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/California-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Desert-Bighorn-Any-Ewe-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Desert-Bighorn-Any-Ram-ALW-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Desert-Bighorn-Any-Ram-Archery-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Elk-Antlered-ALW-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Elk-Antlered-ALW-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Elk-Antlered-Archery-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Elk-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Elk-Antlerless-ALW-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Elk-Antlerless-ALW-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Elk-Antlerless-Archery-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Elk-Antlerless-Muzzleloader-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Moose-Antlered-ALW-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Mountain-Goat-Any-Goat-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Mule-Deer-Antlered-ALW-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Mule-Deer-Antlered-ALW-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Mule-Deer-Antlered-Archery-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Mule-Deer-Antlered-Archery-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Mule-Deer-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-NonResident-2025.pdf",
    "2026/01/Mule-Deer-Antlered-Muzzleloader-Bonus-Point-and-Application-Trend-Resident-2025.pdf",
    "2026/01/Mule-Deer-Junior-Antlered-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Mule-Deer-NonResident-Guided-Antlered-ALW-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/01/Rocky-Mountain-Bighorn-Any-Ram-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/03/Antelope-Junior-Horns-Shorter-Bonus-Point-and-Application-Trend-2025.pdf",
    "2026/04/Elk-Spike-ALW-Bonus-Point-and-Application-Trend-2025-1.pdf",
]

# NDOW "Nevada Big Game Hunt Data" workbooks (Demand, Unique Apps, Quota, Tags Issued, Draw Rate per hunt).
HUNTDATA = [
    "2023/02/2022-Nevada-Big-Game-Hunt-Data.xlsx",
    "2024/02/2023-Nevada-Big-Game-Hunt-Data.xlsx",
    "2025/06/2024-Nevada-Big-Game-Hunt-Data.xlsx",
    "2026/03/2025-Nevada-Big-Game-Hunt-Data.xlsx",
]

# Commission regulations: quotas (hunt numbers), seasons, deadlines, bear, lion; FAQ.
CR = [
    "2022/05/CR-22-11-2022-2023-Big-Game-Quotas-Updated.pdf",
    "2023/05/2023-Big-Game-Quotas-CR-23-14-Approved-ADA-2.pdf",
    "2024/05/2024-CR-24-12-BIG-GAME-QUOTAS-COMMISSION-APPROVED-FINAL.pdf",
    "2025/08/CR25-13-2025-Big-Game-Quotas-NBWC-Approved-May-2025-FINAL.pdf",
    "2026/08/CR-26-11-2026-2027-Big-Game-Quota-NBWC-Approved-May-2026.pdf",
    "2026/08/CR-26-12-2026-Black-Bear-Seasons-and-Quotas-NBWC-Approved-May-2026.pdf",
    "2026/01/CR-26-07-2026-Black-Bear-Seasons-NBWC-Approved-January-2026.pdf",
    "2026/01/CR-26-08-2026-2027-Mountain-Lion-Seasons-2026-NBWC-Approved-January-2026.pdf",
    "2026/01/CR-26-01-2026-2027-Application-Deadlines-Draw-Result-Dates-NBWC-Approved-January-2026.pdf",
    "2026/08/CR-26-01-A-1-2026-2027-Application-Deadlines-Draw-Result-Dates.pdf",
    "2026/01/CR-26-02-2026-Tag-Application-Eligibility-and-Tag-Limits-NBWC-Approved-January-2026.pdf",
    "2025/08/CR-25-07-Amendment1-2025-2026-and-2026-2027-Big-Game-Seasons-NBWC-Approved-March-2025-FINAL.pdf",
    "2025/07/CR25-07-2025-2026-and-2026-2027-Big-Game-Seasons.pdf",
    "2026/01/17-A-CR-25-07-Amendment-2-Big-Game-Hunting-Seasons.pdf",
    "2025/08/CR25-01-Amendment-1-2025-Application-Deadlines-Draw-Result-and-2026-Spring-Turkey-NBWC-Approved-JUNE-2025-FINAL.pdf",
    "2026/03/2026-Big-Game-Application-FAQ.pdf",
    # Restricted nonresident guided mule deer (hunt 1235) regulations
    "2021/12/CR-21-06-2021-22-and-2022-23-NR-Guided-Seasons-and-Quotas-ADA-FINAL1.pdf",
    "2023/02/CR-23-07-FINAL-2023-24-NR-Guided-Seasons-and-Quotas.pdf",
    "2025/08/CR-24-09-2024-25-NR-Guided-Seasons-and-Quotas-FINAL.pdf",
    "2025/07/CR-25-10-2025-2026-Restricted-Nonresident-Guided-Mule-Deer-Seasons-Quotas-FINAL.pdf",
]

GROUPS = {"trend": TREND, "huntdata": HUNTDATA, "cr": CR}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for group, paths in GROUPS.items():
        d = os.path.join(raw, group)
        os.makedirs(d, exist_ok=True)
        for p in paths:
            out = os.path.join(d, os.path.basename(p))
            if os.path.exists(out) and os.path.getsize(out) > 0:
                continue
            r = s.get(BASE + p, timeout=120)
            if r.status_code != 200:
                print(f"FAIL {r.status_code} {p}")
                continue
            with open(out, "wb") as f:
                f.write(r.content)
            print(f"ok {len(r.content):>9} {p}")
            time.sleep(0.3)
            if out.endswith(".pdf"):
                subprocess.run(["pdftotext", "-layout", out, out[:-4] + ".txt"], check=False)


if __name__ == "__main__":
    main()
