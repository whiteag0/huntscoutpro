#!/usr/bin/env python3
"""Download the Wyoming Game and Fish Commission season regulations and the WGFD
pages used for 2026 season dates and 2027 key dates.

Usage:  python -I scripts/agency/wyoming/seasons_fetch.py <raw_dir> [--refresh]

<raw_dir> is a folder outside the repo (e.g. .../agency-raw/wyoming/seasons). Every
document in DOCS is saved there as <file>, PDFs are also converted with poppler's
`pdftotext -layout` (<file>.txt, used by the spot-check), and manifest.json records the
URL, HTTP status, byte size, sha256 and retrieval date. Downloads are untrusted data:
they are only parsed, never executed. Already-downloaded files are skipped unless
--refresh is given.

The season chapters are dated April 22, 2026 (big game, turkey), January 13, 2026
(black bear) and July 16, 2025 (mountain lion; reprinted in the 2026 Mountain Lion
Regulations brochure). The April 23, 2025 turkey chapter (2026 spring season) is no
longer served by WGFD (media 32329 returns 404), so the Internet Archive copy is used;
the same table is printed in WGFD's 2025 Game Bird brochure (media 32876), which is
also fetched for the cross-check.
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
W = "https://wgfd.wyo.gov"

# (file name, URL). Media ids are from https://wgfd.wyo.gov/regulations (2026-10-31).
DOCS = [
    ("m33693.pdf", f"{W}/media/33693/download"),  # Chapter 5 Antelope Hunting Seasons (Apr 22, 2026)
    ("m33694.pdf", f"{W}/media/33694/download"),  # Chapter 6 Deer Hunting Seasons (Apr 22, 2026)
    ("m33695.pdf", f"{W}/media/33695/download"),  # Chapter 7 Elk Hunting Seasons (Apr 22, 2026)
    ("m33696.pdf", f"{W}/media/33696/download"),  # Chapter 8 Moose Hunting Seasons (Apr 22, 2026)
    ("m33697.pdf", f"{W}/media/33697/download"),  # Chapter 9 Bighorn Sheep and Mountain Goat (Apr 22, 2026)
    ("m33701.pdf", f"{W}/media/33701/download"),  # Chapter 20 Wild Turkey (Apr 22, 2026): 2026 fall, 2027 spring
    ("m33353.pdf", f"{W}/media/33353/download"),  # Chapter 3 Black Bear (Jan 13, 2026)
    ("m32904.pdf", f"{W}/media/32904/download"),  # Chapter 42 Mountain Lion (Jul 16, 2025)
    ("m34092.pdf", f"{W}/media/34092/download"),  # 2026 Mountain Lion Regulations brochure
    ("m33578.pdf", f"{W}/media/33578/download"),  # 2026 Black Bear Regulations brochure
    ("m32876.pdf", f"{W}/media/32876/download"),  # 2025 Game Bird, Small Game ... and Wild Turkey brochure (2026 spring table)
    ("wb_m32329.pdf", "https://web.archive.org/web/2026id_/https://wgfd.wyo.gov/media/32329/download"),  # Ch 20, Apr 23, 2025
    ("m31721.pdf", f"{W}/media/31721/download"),  # 2026 Hunting License Application Information booklet
    ("regulations.html", f"{W}/regulations"),
    ("appdates.html", f"{W}/licenses-applications/application-dates-deadlines"),
    ("supertag.html", f"{W}/licenses-applications/wyoming-super-tag-raffle"),
    ("licapps.html", f"{W}/licenses-applications"),
]


def get(url, tries=4):
    err = None
    for i in range(tries):
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=90)
            if r.status_code == 200:
                return r
            err = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            err = str(e)
        time.sleep(3 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def main():
    raw = sys.argv[1]
    refresh = "--refresh" in sys.argv
    os.makedirs(raw, exist_ok=True)
    mpath = os.path.join(raw, "manifest.json")
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    today = datetime.date.today().isoformat()
    for name, url in DOCS:
        out = os.path.join(raw, name)
        if not (os.path.exists(out) and os.path.getsize(out) > 0) or refresh:
            r = get(url)
            with open(out, "wb") as f:
                f.write(r.content)
            manifest[name] = {"url": url, "status": r.status_code, "contentType": r.headers.get("content-type"),
                              "retrieved": today}
            print("got", name, len(r.content), flush=True)
        data = open(out, "rb").read()
        manifest.setdefault(name, {"url": url, "retrieved": today})
        manifest[name].update({"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        if name.endswith(".pdf"):
            if not data.startswith(b"%PDF"):
                raise SystemExit(f"{name} is not a PDF")
            txt = out[:-4] + ".txt"
            if not os.path.exists(txt) or refresh:
                subprocess.run(["pdftotext", "-layout", out, txt], check=True)
    json.dump(manifest, open(mpath, "w"), indent=1)
    print("manifest", mpath, len(manifest), "files")


if __name__ == "__main__":
    main()
