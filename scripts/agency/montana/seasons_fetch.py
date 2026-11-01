#!/usr/bin/env python3
"""Download the Montana FWP pages and regulation booklets used for key dates and season dates.

Usage:  python -I scripts/agency/montana/seasons_fetch.py <raw_dir>
        (e.g. <raw_dir> = .../agency-raw/montana/seasons, kept OUTSIDE the repo)

Writes <raw_dir>/<name>.html|.pdf (raw bytes), <raw_dir>/<name>.txt (pdftotext -layout, one
form feed per page, for PDFs) and <raw_dir>/manifest.json (url, sha256, bytes, retrieved).
Downloaded files are untrusted data: they are only parsed by seasons_parse.py, never executed.

What each file is for:
  dates            Applications, Drawings, and Bonus Points page: 2026 application windows (checked
                   for 2027 dates: none posted as of 2026-10-31)
  bonus-points     Bonus and Preference Points page (preference point purchase window)
  bonus-points-faq Bonus Points FAQ PDF (standing rule: point-only purchase July 1 - Sept. 30)
  hunt-seasons     Hunting Seasons page (general reference card, checked for 2027 dates)
  regs, regs-archive  regulation index pages (2026 booklets; 2025 lion booklet in the archive)
  nr-fees, res-fees, supertag  license pages checked for 2027 dates
  dea-2026         2026 Deer, Elk & Antelope regulations: per-license season tables
  msgb-2026        2026 Moose, Sheep, Goat & Bison regulations: per-license season tables
  bear-2026        2026 Black Bear regulations: permit 510-20/520-20 seasons
  lion-2026        2026 Mountain Lion regulations: 2026 season dates
  lion-2025        2025 Mountain Lion regulations: 2025 Limited Mountain Lion license seasons
  upgbrd-2026      2026 Upland Game Bird regulations: turkey seasons
  corr-*           FWP corrections to the printed 2026 booklets
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
FWP = "https://fwp.mt.gov/"
RB = FWP + "binaries/content/assets/fwp/hunt/regulations/"

DOCS = [
    ("dates.html", FWP + "buyandapply/hunting-licenses/application-drawing-dates"),
    ("bonus-points.html", FWP + "buyandapply/hunting-licenses/bonus-points"),
    ("bonus-points-faq.pdf", FWP + "binaries/content/assets/fwp/buyandapply/hunting/bonus-points-faq--final-updated.pdf"),
    ("hunt-seasons.html", FWP + "hunt/seasons"),
    ("regs.html", FWP + "hunt/regulations"),
    ("regs-archive.html", FWP + "hunt/regulations/archive"),
    ("nr-fees.html", FWP + "buyandapply/hunting-licenses/nonresident-licenses/fees"),
    ("res-fees.html", FWP + "buyandapply/hunting-licenses/resident-licenses/fees"),
    ("supertag.html", FWP + "buyandapply/hunting-licenses/supertag"),
    ("dea-2026.pdf", RB + "2026/2026-dea-regulations-final-with-low-resolution-maps-for-web.pdf"),
    ("msgb-2026.pdf", RB + "2026/2026-msgb-final-for-web.pdf"),
    ("bear-2026.pdf", RB + "2026/2026-black-bear-final-for-web.pdf"),
    ("lion-2026.pdf", RB + "2026/2026-lion-final-for-web.pdf"),
    ("lion-2025.pdf", RB + "2025/2025-lion-final-for-web.pdf"),
    ("upgbrd-2026.pdf", RB + "2026/2026-upgbrd-final-for-web.pdf"),
    ("corr-dea-2026.pdf", RB + "2026/corrections-to-the-2026-printed-dea-regulations-and-legal-descriptions.pdf"),
    ("corr-msgb-2026.pdf", RB + "2026/corrections-to-the-2026-printed-msgb-regulations.pdf"),
    ("corr-bear-2026.pdf", RB + "2026/corrections-to-the-2026-printed-black-bear-regulations.pdf"),
]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    manifest = {}
    today = datetime.date.today().isoformat()
    for name, url in DOCS:
        path = os.path.join(raw, name)
        for attempt in range(3):
            try:
                r = s.get(url, timeout=120)
                if r.status_code == 200:
                    break
            except requests.RequestException as e:
                print("retry", name, e)
            time.sleep(3 * (attempt + 1))
        else:
            sys.exit(f"failed: {url}")
        if r.status_code != 200:
            sys.exit(f"HTTP {r.status_code}: {url}")
        body = r.content
        if name.endswith(".pdf") and not body.startswith(b"%PDF"):
            sys.exit(f"not a PDF: {url}")
        with open(path, "wb") as f:
            f.write(body)
        manifest[name] = {"url": url, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "retrieved": today}
        if name.endswith(".pdf"):
            subprocess.run(["pdftotext", "-layout", path, path[:-4] + ".txt"], check=True,
                           stderr=subprocess.DEVNULL)
        print(f"{name}: {len(body)} bytes")
        time.sleep(0.5)
    with open(os.path.join(raw, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main()
