"""List AZGFD's public document bucket for harvest-summary PDFs.

azgfd.com blocks automated fetches, but the PDFs it links are served from the
public S3 bucket azgfd-portal-wordpress-pantheon. This lists keys under the given
prefixes and prints those whose name contains "harvest" (case-insensitive).

Usage: python -I harvest_list_s3.py OUT.txt [prefix ...]
"""
import sys
import xml.etree.ElementTree as ET
import requests

import os
BUCKET = os.environ.get("AZ_BUCKET", "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/")
NS = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}


def list_prefix(prefix):
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token:
            params["continuation-token"] = token
        r = requests.get(BUCKET, params=params, timeout=60)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        for c in root.findall("s:Contents", NS):
            yield c.find("s:Key", NS).text, c.find("s:LastModified", NS).text
        nt = root.find("s:NextContinuationToken", NS)
        if nt is None:
            break
        token = nt.text


def main():
    out = sys.argv[1]
    prefixes = sys.argv[2:] or ["wp-content/uploads/archive/20"] + [f"wp-content/uploads/{y}/" for y in range(2020, 2027)]
    hits = []
    for p in prefixes:
        for k, lm in list_prefix(p):
            if "harvest" in k.lower() and k.lower().endswith((".pdf", ".xlsx", ".xls", ".csv")):
                hits.append(f"{lm}\t{BUCKET}{k}")
    with open(out, "w") as f:
        f.write("\n".join(hits) + "\n")
    print(len(hits), "harvest keys")


if __name__ == "__main__":
    main()
