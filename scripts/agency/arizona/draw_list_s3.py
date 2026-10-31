"""List AZGFD's public WordPress upload bucket for draw/bonus-point report PDFs.

The azgfd.com HTML pages sit behind a Cloudflare challenge, but the documents they
link to are served from a public S3 bucket. This lists keys per upload month and
prints those whose file name looks like a draw / bonus-point / hunt-draw report.
Usage: draw_list_s3.py <out.txt> [YYYY ...]
"""
import re, sys, urllib.parse, xml.etree.ElementTree as ET
import requests

BUCKET = "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/"
NS = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
PAT = re.compile(r"(draw|bonus|pass|odds|hunt-?number|fee|regulation|application)", re.I)

def list_prefix(prefix):
    token = None
    while True:
        q = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token:
            q["continuation-token"] = token
        r = requests.get(BUCKET + "?" + urllib.parse.urlencode(q), timeout=60)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        for c in root.findall("s:Contents", NS):
            yield c.find("s:Key", NS).text, c.find("s:LastModified", NS).text, int(c.find("s:Size", NS).text)
        if root.find("s:IsTruncated", NS).text != "true":
            break
        token = root.find("s:NextContinuationToken", NS).text

def main():
    out = sys.argv[1]
    years = sys.argv[2:] or ["2022", "2023", "2024", "2025", "2026"]
    with open(out, "w") as f:
        for y in years:
            for m in range(1, 13):
                for key, lm, size in list_prefix(f"wp-content/uploads/{y}/{m:02d}/"):
                    name = key.rsplit("/", 1)[-1]
                    if not name.lower().endswith((".pdf", ".xlsx", ".xls", ".csv")):
                        continue
                    if PAT.search(name):
                        f.write(f"{lm}\t{size}\t{BUCKET}{key}\n")

if __name__ == "__main__":
    main()
