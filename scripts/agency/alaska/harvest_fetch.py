#!/usr/bin/env python3
"""Download ADF&G harvest statistics (Alaska), regulatory years 2020-2025.

Sources (Alaska Department of Fish and Game, Division of Wildlife Conservation):
  1. Harvest General Reports  https://secure.wildlife.alaska.gov/DWC/HarvestInformation/GeneralReports/
     Species Moose (M), Sheep (S), Goat (G), Elk (E). For each species and regulatory year:
       330 "Hunter AK Residency and Success by Unit"      (all hunts combined, and once per hunt number)
       130 "Sex Composition of Harvest by Subunit"        (all hunts combined)
     The form is an ASP.NET MVC POST with an anti-forgery token; the hunt list for a
     species/year comes from the form re-rendered after RegYear+Species are posted.
  2. Sitka black-tailed deer harvest statistics by GMU
     https://www.adfg.alaska.gov/index.cfm?adfg=deerhunting.deerharvest  (POST selected_regyear)
  3. Black bear hunt statistics (reported harvest) per hunt number, by hunt type
     https://www.adfg.alaska.gov/index.cfm?adfg=blackbearhunting.harvest (POST year, hunttype r|d|t|g)

Usage:
  python -I scripts/agency/alaska/harvest_fetch.py <raw_dir> [--force] [--no-hunts] [--species M,S,G,E] [--years 2024,2025] [--skip-pages]
Raw files:
  <raw_dir>/gr_<SP>_<year>_<report>.html            all hunts combined
  <raw_dir>/hunts/gr_<SP>_<year>_330_<hunt>.html     report 330 filtered to one hunt
  <raw_dir>/hunts_<SP>_<year>.json                   hunt list offered by the form
  <raw_dir>/deer_<year>.html, <raw_dir>/bb_<year>_<type>.html
Re-runnable: existing files are kept unless --force.
Run one process per species/year set at a time (two processes on the same files race on .part renames).
"""
import json
import os
import sys
import time

import bs4
import requests

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
GR = "https://secure.wildlife.alaska.gov/DWC/HarvestInformation/GeneralReports/"
DEER = "https://www.adfg.alaska.gov/index.cfm?adfg=deerhunting.deerharvest"
BEAR = "https://www.adfg.alaska.gov/index.cfm?adfg=blackbearhunting.harvest"
YEARS = list(range(2020, 2026))
SPECIES = ["M", "S", "G", "E"]
REPORTS = ["330", "130"]
BEAR_TYPES = ["g", "d", "r", "t"]


def token(html: str) -> str:
    b = bs4.BeautifulSoup(html, "lxml")
    f = b.find("form", action="/DWC/HarvestInformation/GeneralReports/")
    if f is None:
        raise RuntimeError("report form not found (blocked?)")
    return f.find("input", {"name": "__RequestVerificationToken"})["value"]


def has_results(html: str) -> bool:
    b = bs4.BeautifulSoup(html, "lxml")
    rc = b.find(id="resultsContainer")
    return bool(rc and (rc.find("table") or "no records" in rc.get_text(" ", strip=True).lower()))


class GRSession:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        self.tok = token(self.s.get(GR, timeout=60).text)

    def post(self, data: dict) -> str:
        for attempt in range(4):
            try:
                r = self.s.post(GR, data={**data, "__RequestVerificationToken": self.tok}, timeout=90)
                if r.status_code == 200:
                    self.tok = token(r.text)
                    return r.text
                print("  HTTP", r.status_code, data, file=sys.stderr)
            except (requests.RequestException, RuntimeError) as e:
                print("  retry", attempt, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
            self.__init__()
            if "Id" in data:  # fresh session: post the species/year form again before the report
                r = self.s.post(GR, data={"RegYear": data["RegYear"], "Species": data["Species"], "__RequestVerificationToken": self.tok}, timeout=90)
                self.tok = token(r.text)
        raise RuntimeError(f"failed {data}")

    def hunts(self, sp: str, year: int) -> list:
        html = self.post({"RegYear": str(year), "Species": sp})
        b = bs4.BeautifulSoup(html, "lxml")
        return [o.get("value") for o in b.find("select", id="Hunts").find_all("option") if o.get("value")]

    def report(self, sp: str, year: int, rid: str, hunt: str | None = None, prime: bool = True) -> str:
        # The form only needs RegYear+Species posted first in a fresh session; the per-hunt loop
        # runs right after hunts() for the same species/year, so it skips this step.
        if prime:
            self.post({"RegYear": str(year), "Species": sp})
        data = {"RegYear": str(year), "Species": sp, "Id": rid, "Action": "DisplayRecords"}
        if hunt:
            data["Hunts"] = hunt
        return self.post(data)


def save(path: str, text: str) -> None:
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    force = "--force" in sys.argv
    do_hunts = "--no-hunts" not in sys.argv
    years = [int(v) for v in sys.argv[sys.argv.index("--years") + 1].split(",")] if "--years" in sys.argv else YEARS
    species = sys.argv[sys.argv.index("--species") + 1].split(",") if "--species" in sys.argv else SPECIES
    os.makedirs(os.path.join(raw, "hunts"), exist_ok=True)
    g = GRSession()
    for sp in species:
        for y in years:
            for rid in REPORTS:
                p = os.path.join(raw, f"gr_{sp}_{y}_{rid}.html")
                if os.path.exists(p) and not force:
                    continue
                html = g.report(sp, y, rid)
                if not has_results(html):
                    raise RuntimeError(f"no results block for {sp} {y} {rid}")
                save(p, html)
                print("saved", p)
                time.sleep(0.3)
            if not do_hunts:
                continue
            hp = os.path.join(raw, f"hunts_{sp}_{y}.json")
            hunts = g.hunts(sp, y)  # also primes the form for this species/year
            json.dump(hunts, open(hp, "w"))
            for h in hunts:
                p = os.path.join(raw, "hunts", f"gr_{sp}_{y}_330_{h}.html")
                if os.path.exists(p) and not force:
                    continue
                html = g.report(sp, y, "330", h, prime=False)
                if not has_results(html):
                    raise RuntimeError(f"no results block for {sp} {y} 330 {h}")
                save(p, html)
                time.sleep(0.2)
            print("hunts done", sp, y, len(hunts), flush=True)
    if "--skip-pages" in sys.argv:
        return
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for y in YEARS:
        p = os.path.join(raw, f"deer_{y}.html")
        if force or not os.path.exists(p):
            r = s.post(DEER, files={"selected_regyear": (None, str(y)), "fuseaction": (None, "deerhunting.deerharvest"), "submit": (None, "submit")}, timeout=60)
            r.raise_for_status()
            save(p, r.text)
            print("saved", p)
        for t in BEAR_TYPES:
            p = os.path.join(raw, f"bb_{y}_{t}.html")
            if force or not os.path.exists(p):
                r = s.post(BEAR, files={"year": (None, str(y)), "hunttype": (None, t), "submit": (None, "submit")}, timeout=60)
                r.raise_for_status()
                save(p, r.text)
                print("saved", p)
            time.sleep(0.3)


if __name__ == "__main__":
    main()
