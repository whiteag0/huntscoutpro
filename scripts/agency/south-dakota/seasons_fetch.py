#!/usr/bin/env python3
"""Download the South Dakota GFP 2026 season application sheets and the Key Dates page used
for season dates (seasons_parse.py), and re-check GFP's site for 2027 application documents.

Usage:  python -I scripts/agency/south-dakota/seasons_fetch.py <raw_dir> [--refresh]

<raw_dir> is a folder outside the repo (e.g. .../agency-raw/south-dakota/seasons). Each document
is saved under its GFP file name, PDFs are converted with poppler's `pdftotext -layout`
(<name>.txt), and manifest.json records URL, status, size, sha256 and retrieval date.
Downloads are untrusted data: parsed only, never executed. Existing files are kept unless
--refresh is given.

The 2027 probe requests the 2026 file names with 2027 in place of 2026 (GFP posts each season's
application sheet under that pattern). On 2026-10-31 every probe returned GFP's HTML error page,
i.e. no 2027 application sheet was published.
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
G = "https://gfp.sd.gov"

DOCS = [
    ("2026elk.pdf", f"{G}/userdocs/docs/2026elk.pdf"),
    ("2026westriverdeer-app.pdf", f"{G}/UserDocs/2026westriverdeer-app.pdf"),
    ("2026eastriverdeer-app.pdf", f"{G}/UserDocs/nav/2026eastriverdeer-app.pdf"),
    ("2026blackhills-CSPdeer-app.pdf", f"{G}/UserDocs/nav/2026blackhills-CSPdeer-app.pdf"),
    ("2026muzzleloaderdeer-app.pdf", f"{G}/UserDocs/nav/2026muzzleloaderdeer-app.pdf"),
    ("2026refugedeer-app.pdf", f"{G}/UserDocs/2026refugedeer-app.pdf"),
    ("2026specialbuck-app.pdf", f"{G}/UserDocs/nav/2026specialbuck-app.pdf"),
    ("nonresident-archery-deer-app.pdf", f"{G}/userdocs/docs/nonresident-archery-deer-app.pdf"),
    ("resident-archery-deer-app.pdf", f"{G}/UserDocs/docs/resident-archery-deer-app.pdf"),
    ("firearmsantelope.pdf", f"{G}/userdocs/docs/firearmsantelope.pdf"),
    ("2026bhsheep.pdf", f"{G}/userdocs/docs/2026bhsheep.pdf"),
    ("2026springturkey-prairie-app.pdf", f"{G}/userdocs/docs/2026springturkey-prairie-app.pdf"),
    ("2026springturkey-AST_BST_CST_MST-app.pdf", f"{G}/userdocs/docs/2026springturkey-AST_BST_CST_MST-app.pdf"),
    ("fallturkey-app.pdf", f"{G}/UserDocs/docs/fallturkey-app.pdf"),
    ("2026mountainlion.pdf", f"{G}/userdocs/docs/2026mountainlion.pdf"),
    ("keydates.html", f"{G}/events/keydates"),
]
PROBE_2027 = ["2027elk", "2027westriverdeer-app", "2027eastriverdeer-app", "2027blackhills-CSPdeer-app",
              "2027muzzleloaderdeer-app", "2027refugedeer-app", "2027specialbuck-app", "2027bhsheep",
              "2027springturkey-prairie-app", "2027springturkey-AST_BST_CST_MST-app", "2027mountainlion",
              "2027firearmsantelope", "2027fallturkey-app"]
PROBE_DIRS = ["userdocs/docs", "UserDocs/nav", "UserDocs"]


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
            open(out, "wb").write(r.content)
            manifest[name] = {"url": url, "status": r.status_code, "contentType": r.headers.get("content-type"), "retrieved": today}
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
    probes = {}
    for stem in PROBE_2027:
        for d in PROBE_DIRS:
            url = f"{G}/{d}/{stem}.pdf"
            try:
                r = requests.get(url, headers={"User-Agent": UA}, timeout=60)
                probes[url] = {"status": r.status_code, "pdf": r.content[:4] == b"%PDF"}
            except requests.RequestException as e:
                probes[url] = {"error": str(e)}
    found = [u for u, v in probes.items() if v.get("pdf")]
    manifest["_probe2027"] = {"checked": today, "found": found, "count": len(probes)}
    json.dump(manifest, open(mpath, "w"), indent=1)
    print("2027 application sheets found:", found or "none", f"({len(probes)} URLs checked)")


if __name__ == "__main__":
    main()
