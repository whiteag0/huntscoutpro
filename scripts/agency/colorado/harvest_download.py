#!/usr/bin/env python3
"""Download Colorado Parks and Wildlife (CPW) harvest-statistics reports.

Re-runnable. Scrapes each CPW species "Statistics" page for its "Harvest Report"
links (CPW hosts them on its Widen DAM, either cpw.widen.net/s/... or
cpw.widencollective.com/assets/share/asset/...), resolves each share link to the
original PDF, downloads it, and writes manifest.json describing every file.

Usage:
  python -I scripts/agency/colorado/harvest_download.py <raw_dir> [--years 2020-2025]

Downloaded files are untrusted data: they are only ever read by the parser.
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, quote

import requests
from bs4 import BeautifulSoup

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
)
CPW = "https://cpw.state.co.us"
# species key -> CPW statistics page
PAGES = {
    "elk": "/activities/hunting/big-game/hunting-elk/elk-statistics",
    "mule-deer": "/activities/hunting/big-game/hunting-deer/deer-statistics",
    "pronghorn": "/activities/hunting/big-game/hunting-pronghorn/pronghorn-statistics",
    "bear": "/activities/hunting/big-game/hunting-bear/bear-statistics",
    "moose": "/activities/hunting/big-game/hunting-moose/moose-statistics",
    "sheep": "/activities/hunting/big-game/hunting-bighorn-sheep/bighorn-sheep-statistics",
    "goat": "/activities/hunting/big-game/hunting-mountain-goat/mountain-goat-statistics",
    "lion": "/activities/hunting/big-game/hunting-mountain-lion/mountain-lion-statistics",
    "turkey": "/activities/hunting/turkey-hunting/turkey-statistics",
}

S = requests.Session()
S.headers["User-Agent"] = UA


def get(url, **kw):
    for attempt in range(4):
        try:
            r = S.get(url, timeout=90, **kw)
            if r.status_code < 500:
                return r
        except requests.RequestException:
            pass
        time.sleep(2 + attempt * 3)
    raise RuntimeError(f"failed GET {url}")


def resolve_widen_net(share_url):
    """cpw.widen.net/s/<id>/<slug> -> /content/<cid>/original/<file>?u=..&download=true"""
    html = get(share_url).text
    m = re.search(r'href="(/content/[^"]+/original/[^"]+)"', html)
    if not m:
        raise RuntimeError(f"no original link on {share_url}")
    return urljoin(share_url, m.group(1).replace("&amp;", "&"))


def resolve_widen_collective(share_url):
    """cpw.widencollective.com/assets/share/asset/<id> -> signed original-download URI.

    Mirrors what the share page's Download button does: get an anonymous auth
    value, then ask the 'albert' download service for the original file URI.
    """
    ext_id = share_url.rstrip("/").rsplit("/", 1)[-1]
    wrn = f"widen:assets:asset:CPWZZ:{ext_id}"
    base = "https://cpw.widencollective.com"
    auth = get(f"{base}/assets/share/api/download/{wrn}/auth").json()
    hdr = {
        "x-widen-albert-authentication": auth["albert_auth_value"],
        "x-widen-albert-client": "einstein",
        "x-widen-context-actor": "widen:users:visitor:CPWZZ:anonymous",
        "x-widen-context-app-name": "baton",
        "x-widen-context-tracking": auth.get("visitor_tracking", ""),
    }
    j = get(f"{base}/albert/download/anonymous/{wrn}/original", headers=hdr).json()
    if "uri" not in j:
        raise RuntimeError(f"no uri for {share_url}: {j}")
    return j["uri"]


def harvest_links(species, html):
    soup = BeautifulSoup(html, "lxml")
    out = []
    for a in soup.find_all("a", href=True):
        text = " ".join(a.get_text(" ", strip=True).split())
        if not re.search(r"Harvest\s+Report", text, re.I):
            continue
        href = a["href"]
        if "widen" not in href:
            continue
        head = a.find_previous(["h2", "h3", "h4", "h5", "button", "summary", "strong"])
        section = " ".join(head.get_text(" ", strip=True).split()) if head else ""
        m = re.match(r"(\d{4})(?:-(\d{4}))?", text)
        if not m:
            continue
        out.append({"species": species, "label": text, "section": section,
                    "yearLabel": m.group(0), "year": int(m.group(1)), "share": href})
    return out


def main():
    raw = Path(sys.argv[1]).resolve()
    y0, y1 = 2020, 2025
    if "--years" in sys.argv:
        a, b = sys.argv[sys.argv.index("--years") + 1].split("-")
        y0, y1 = int(a), int(b)
    (raw / "pdf").mkdir(parents=True, exist_ok=True)
    manifest = []
    for sp, path in PAGES.items():
        page = CPW + path
        html = get(page).text
        (raw / "pages").mkdir(exist_ok=True)
        (raw / "pages" / f"{sp}.html").write_text(html)
        for L in harvest_links(sp, html):
            if not (y0 <= L["year"] <= y1):
                continue
            share = L["share"]
            direct = (resolve_widen_collective(share) if "widencollective" in share
                      else resolve_widen_net(share))
            sec = re.sub(r"[^a-z0-9]+", "-", L["section"].lower()).strip("-")
            fname = f"{sp}_{L['yearLabel']}_{sec}.pdf"
            dest = raw / "pdf" / fname
            if not dest.exists() or dest.stat().st_size < 1000:
                r = get(direct)
                if r.status_code != 200 or not r.content.startswith(b"%PDF"):
                    raise RuntimeError(f"bad download {share} -> {r.status_code}")
                dest.write_bytes(r.content)
            L.update({"pageUrl": page, "file": f"pdf/{fname}", "bytes": dest.stat().st_size,
                      # the stable public link is the share URL; the resolved one is signed/expiring
                      "url": share, "retrieved": time.strftime("%Y-%m-%d")})
            manifest.append(L)
            print(f"{sp:10s} {L['yearLabel']:9s} {L['section'][:30]:30s} {dest.stat().st_size:>9d} {fname}")
    (raw / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(len(manifest), "files")


if __name__ == "__main__":
    main()
