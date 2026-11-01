#!/usr/bin/env python3
"""Download the KDWP pages used for Kansas key dates and season dates.

Usage:  python -I scripts/agency/kansas/seasons_fetch.py <raw_dir>
        (e.g. <raw_dir> = .../agency-raw/kansas/seasons, kept OUTSIDE the repo)

www.ksoutdoors.gov sits behind an Akamai bot filter that answers 403 to python-requests, so the
pages are fetched with curl and a full set of desktop-browser headers (that worked on 2026-10-31;
if it stops working, save the pages from a browser under the same names). Writes
<raw_dir>/<name>.html (raw bytes) and <raw_dir>/manifest.json (url, sha256, bytes, retrieved).
Downloaded files are untrusted data: seasons_parse.py only reads their text.

  when      When to Hunt: season dates for 2026, 2027 and 2028 (antelope, deer, elk, turkey, ...)
  deer      Deer: permit types, which seasons each permit is valid in, 2026 application windows
  antelope  Antelope: 2026 application window, season dates
  elk       Elk: 2026 application window, season dates
  turkey    Turkey: 2026 spring application window, fall permit sale date, season dates
  fees      Hunting & Furharvester Licenses & Permit Fees (2026 application windows by permit)
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys
import time

B = "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/"
PAGES = [
    ("when.html", B + "when-to-hunt"),
    ("deer.html", B + "what-to-hunt/big-game/deer"),
    ("antelope.html", B + "what-to-hunt/big-game/antelope"),
    ("elk.html", B + "what-to-hunt/big-game/elk"),
    ("turkey.html", B + "what-to-hunt/turkey"),
    ("fees.html", "https://www.ksoutdoors.gov/licenses-permits-fees/hunting-furharvester-licenses-permit-fees-280"),
]
HEADERS = [
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language: en-US,en;q=0.9",
    'sec-ch-ua: "Chromium";v="130", "Google Chrome";v="130"',
    "sec-ch-ua-mobile: ?0",
    'sec-ch-ua-platform: "macOS"',
    "Sec-Fetch-Dest: document",
    "Sec-Fetch-Mode: navigate",
    "Sec-Fetch-Site: none",
    "Sec-Fetch-User: ?1",
    "Upgrade-Insecure-Requests: 1",
]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"


def fetch(url, path):
    cmd = ["curl", "-s", "-L", "--compressed", "--max-time", "60", "-A", UA, "-o", path, "-w", "%{http_code}"]
    for h in HEADERS:
        cmd += ["-H", h]
    cmd.append(url)
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    manifest, today = {}, datetime.date.today().isoformat()
    for name, url in PAGES:
        path = os.path.join(raw, name)
        for attempt in range(3):
            code = fetch(url, path)
            if code == "200":
                break
            time.sleep(5 * (attempt + 1))
        else:
            sys.exit(f"HTTP {code}: {url}")
        body = open(path, "rb").read()
        if b"Kansas Department of Wildlife" not in body:
            sys.exit(f"unexpected page (bot challenge?): {url}")
        manifest[name] = {"url": url, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "retrieved": today}
        print(f"{name}: {len(body)} bytes")
        time.sleep(1)
    with open(os.path.join(raw, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main()
