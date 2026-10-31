#!/usr/bin/env python3
"""Download the Utah DWR harvest publications used by harvest_parse.py.

Usage:
  python -I scripts/agency/utah/harvest_download.py <raw_dir>

Every file is fetched from wildlife.utah.gov into <raw_dir> (kept outside the
repo) and converted with `pdftotext -layout` to a sibling .txt file. Existing
files are not re-downloaded. Downloaded files are untrusted data: they are only
read as text by the parser, never executed.
"""
import os
import subprocess
import sys
import urllib.request

BASE = "https://wildlife.utah.gov"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)

# local file name -> path on wildlife.utah.gov
FILES = {}
for yy in ("20", "21", "22", "23", "24"):
    FILES[f"{yy}_bg_report.pdf"] = f"/pdf/annual-reports/big-game/{yy}_bg_report.pdf"
for yy in ("24", "25"):
    FILES[f"{yy}_black_bear_report.pdf"] = f"/pdf/annual-reports/bear/{yy}_black_bear_report.pdf"
    FILES[f"{yy}_cougar_annual_report.pdf"] = f"/pdf/annual-reports/cougar/{yy}_cougar_annual_report.pdf"
for y in ("2020", "2021", "2022", "2023", "2024"):
    for kind in ("le_oial_all", "antlerless_hr", "gs_buck_deer_hr"):
        p = f"/pdf/bg/{y}/{y}_{kind}.pdf"
        FILES[p.lstrip("/").replace("/", "__")] = p
# 2025 preliminary all-species big game harvest (linked on /biggame/reports
# under 2025; the file name says gs_buck_deer but it covers every species).
p = "/pdf/bg/2025/2025_gs_buck_deer_hr-preliminary.pdf"
FILES[p.lstrip("/").replace("/", "__")] = p
for s in ("2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"):
    FILES[f"upland_{s}.pdf"] = f"/pdf/annual-reports/upland/{s}.pdf"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    for name, path in FILES.items():
        dest = os.path.join(raw, name)
        if not os.path.exists(dest):
            req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                ctype = r.headers.get("Content-Type", "")
                data = r.read()
            if "pdf" not in ctype or not data.startswith(b"%PDF"):
                print(f"SKIP {path}: not a PDF ({ctype})")
                continue
            with open(dest, "wb") as fh:
                fh.write(data)
            print(f"got  {path} ({len(data)} bytes)")
        txt = dest[:-4] + ".txt"
        if not os.path.exists(txt):
            subprocess.run(["pdftotext", "-layout", dest, txt], check=True)


if __name__ == "__main__":
    main()
