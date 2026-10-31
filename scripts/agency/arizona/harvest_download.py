"""Download the AZGFD harvest PDFs listed in harvest_sources.py and run pdftotext -layout.

Usage: python -I harvest_download.py RAW_DIR
Writes RAW_DIR/docs/<sourceId>.pdf|.txt and RAW_DIR/regs/<season>.pdf|.txt
(skips files already present). Regulations are only used to classify deer hunts
by legal species (and to check one duplicated elk hunt number).
"""
import os
import subprocess
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harvest_regs import REGS, WAYBACK_2023  # noqa: E402
from harvest_sources import SOURCES  # noqa: E402

ELK_2023_BOOKLET = ("2023-pronghorn-elk",
                    "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/archive/2023-Pronghorn-and-Elk-Regulations_230120.pdf")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def fetch(url, pdf):
    if not os.path.exists(pdf):
        r = requests.get(url, headers={"User-Agent": UA}, timeout=180)
        r.raise_for_status()
        if not r.content.startswith(b"%PDF"):
            raise SystemExit(f"not a PDF: {url}")
        with open(pdf, "wb") as f:
            f.write(r.content)
    txt = pdf[:-4] + ".txt"
    if not os.path.exists(txt):
        subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)


def main():
    root = sys.argv[1]
    raw = os.path.join(root, "docs")
    regs = os.path.join(root, "regs")
    os.makedirs(raw, exist_ok=True)
    os.makedirs(regs, exist_ok=True)
    for y, (_title, url, stem) in REGS.items():
        fetch(WAYBACK_2023 if y == 2023 else url, os.path.join(regs, stem + ".pdf"))
        print("regs", stem)
    fetch(ELK_2023_BOOKLET[1], os.path.join(regs, ELK_2023_BOOKLET[0] + ".pdf"))
    for sid, _grp, _yr, url in SOURCES:
        pdf = os.path.join(raw, sid + ".pdf")
        if not os.path.exists(pdf):
            r = requests.get(url, headers={"User-Agent": UA}, timeout=120)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                raise SystemExit(f"{sid}: not a PDF ({url})")
            with open(pdf, "wb") as f:
                f.write(r.content)
        txt = os.path.join(raw, sid + ".txt")
        if not os.path.exists(txt):
            subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)
        print(sid, os.path.getsize(pdf))


if __name__ == "__main__":
    main()
