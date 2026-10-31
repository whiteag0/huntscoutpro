#!/usr/bin/env python3
"""Download Kansas Department of Wildlife and Parks (KDWP) harvest reports, 2020-2026.

KDWP moved ksoutdoors.com to a new CMS (ksoutdoors.gov) in 2025-26. The old
/content/download/... links now return 404. The reports are served from the new
document library as https://www.ksoutdoors.gov/home/showpublisheddocument/<id>.
Only the spring turkey reports are linked from the current Research page
(https://www.ksoutdoors.gov/programs-services/research); the big-game section
there says "Coming soon", so the deer, elk and pronghorn document ids below were
found by listing the library (the server returns the original file name in the
Content-Disposition header). Each id's file name is checked on download.

The site sits behind Akamai, which rejects python-requests' TLS fingerprint, so
this script shells out to curl with browser headers.

Usage:
  python -I scripts/agency/kansas/harvest_fetch.py <raw_dir> [--force]
Each document is written as <raw_dir>/<local name>.pdf plus a pdftotext -layout
copy <raw_dir>/<local name>.txt.
"""
import os
import re
import subprocess
import sys
import time

BASE = "https://www.ksoutdoors.gov/home/showpublisheddocument/"

# (document id, expected Content-Disposition file name, local name)
DOCS = [
    # Deer: full reports with Appendix 1 (harvest by Deer Management Unit)
    (1374, "202021 Kansas Deer Harvest Report.pdf", "deer_2020-21_report"),
    (1376, "202122 Kansas Deer Harvest Report.pdf", "deer_2021-22_report"),
    # Deer: statewide harvest table only (no unit appendix published)
    (1378, "202223 Kansas Deer Harvest Table.pdf", "deer_2022-23_table"),
    (1380, "202324 Kansas Deer Harvest Table.pdf", "deer_2023-24_table"),
    # Elk
    (1388, "202021 Elk Harvest Report.pdf", "elk_2020-21"),
    (1390, "202122 Elk Harvest Report.pdf", "elk_2021-22"),
    (1392, "202223 Elk Harvest Report.pdf", "elk_2022-23"),
    (1394, "202324 Elk Harvest Report.pdf", "elk_2023-24"),
    (1396, "202425 Elk Harvest Report.pdf", "elk_2024-25"),
    # Pronghorn
    (952, "2020 Pronghorn Harvest Report.pdf", "pronghorn_2020"),
    (956, "2021 Pronghorn Harvest Report.pdf", "pronghorn_2021"),
    (962, "2022 Pronghorn Harvest Report.pdf", "pronghorn_2022"),
    (964, "2023 Pronghorn Harvest Report.pdf", "pronghorn_2023"),
    (968, "2024 Pronghorn Harvest Report.pdf", "pronghorn_2024"),
    # Spring turkey (linked from the Research page)
    (2208, "2024 Spring Turkey Harvest Report.pdf", "turkey_spring_2024"),
    (2210, "2025 Spring Turkey Harvest Report.pdf", "turkey_spring_2025"),
    (2508, "springturkeyharvestreport2026.pdf", "turkey_spring_2026"),
]

HEADERS = [
    "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language: en-US,en;q=0.9",
    "Sec-Fetch-Dest: document",
    "Sec-Fetch-Mode: navigate",
    "Sec-Fetch-Site: none",
    "Upgrade-Insecure-Requests: 1",
]


def fetch(doc_id: int, expect: str, out: str) -> None:
    cmd = ["curl", "-sS", "-L", "--compressed", "--max-time", "120", "-D", "-", "-o", out]
    for h in HEADERS:
        cmd += ["-H", h]
    cmd.append(f"{BASE}{doc_id}")
    hdr = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    status = re.findall(r"^HTTP/\S+\s+(\d+)", hdr, re.M)
    if not status or status[-1] != "200":
        raise SystemExit(f"doc {doc_id}: HTTP {status}")
    m = re.search(r'filename="([^"]+)"', hdr)
    if not m or m.group(1) != expect:
        raise SystemExit(f"doc {doc_id}: expected file name {expect!r}, got {m.group(1) if m else None!r}")
    with open(out, "rb") as f:
        if f.read(5) != b"%PDF-":
            raise SystemExit(f"doc {doc_id}: not a PDF")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    force = "--force" in sys.argv
    os.makedirs(raw, exist_ok=True)
    for doc_id, expect, name in DOCS:
        pdf = os.path.join(raw, name + ".pdf")
        txt = os.path.join(raw, name + ".txt")
        if force or not os.path.exists(pdf):
            fetch(doc_id, expect, pdf)
            print(f"downloaded {doc_id} -> {pdf}")
            time.sleep(1.5)
        subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)
    print(f"{len(DOCS)} documents ready in {raw}")


if __name__ == "__main__":
    main()
