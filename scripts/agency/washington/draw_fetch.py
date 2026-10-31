"""Download WDFW special-permit drawing sources for HuntScout Pro (draw side).

Usage:  python -I draw_fetch.py <raw_dir>

Everything is saved under <raw_dir> (outside the repo; treat as untrusted data):
  harvestpages/<year>-<report>.html   WDFW game harvest report pages. The per-hunt
                                      special permit reports carry "Total Applicants",
                                      "Quota" (moose/sheep/goat) and "Permits Issued".
  pbi/special_hunt_2021.json          WDFW "Special hunt permit drawing result summaries"
                                      Power BI report (published-to-web, US Gov cloud),
                                      table SpecialHuntMetrics_B_Tab03 (2021 draw).
  pdf/*.pdf                           WDFW PDFs (2020 point distribution, pamphlets).
  pages/*.html                        WDFW / myWDFW pages used for meta facts.
"""
import json
import os
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
HARVEST = "https://wdfw.wa.gov/hunting/management/game-harvest/{y}/{r}"
HARVEST_REPORTS = {
    "deer-individual": range(2020, 2026),
    "elk-individual": range(2020, 2026),
    "moose": range(2020, 2026),
    "bighorn-sheep": range(2020, 2026),
    "mountain-goat": range(2020, 2026),
    "black-bear-spring": range(2020, 2022),  # 404 for 2022+ (no spring permit hunts)
}
PDFS = {
    "2020_antlerless_deer.pdf": "https://wdfw.wa.gov/sites/default/files/2021-03/2020_antlerless_deer_drawing_results_by_hunt_number.pdf",
    # Big Game Hunting Seasons & Rules pamphlets (publication pages wdfw.wa.gov/publications/<n>).
    # Each lists that year's special permit hunts (permits) and the prior year's "APPS/AVG POINTS".
    "pamphlet_2026.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02706/wdfw02706.pdf",
    "pamphlet_2026_corrections.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02706/2026%20Big%20Game%20Pamphlet%20Corrections_4.22.26_web.pdf",
    "pamphlet_2025.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02608/wdfw02608.pdf",
    "pamphlet_2025_errata.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02608/wdfw02608-errata.pdf",
    "pamphlet_2024.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02498/wdfw02498.pdf",
    "pamphlet_2024_errata.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02498/2024%20big%20game%20errata.pdf",
    "pamphlet_2023.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02422/wdfw02422.pdf",
    "pamphlet_2023_corrections.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02422/big%20game%20hunting%20pamphlet%20corrections%202023.pdf",
    "pamphlet_2022.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02407/wdfw02407.pdf",
    "pamphlet_2021.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02254/wdfw02254.pdf",
    "pamphlet_2021_corrections.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02254/2021_big_game_hunting_rule_corrections.pdf",
    "pamphlet_2020.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02255/wdfw02255.pdf",
    "turkey_spring_2026.pdf": "https://wdfw.wa.gov/sites/default/files/publications/02683/wdfw02683.pdf",
}
PAGES = {
    "results.html": "https://wdfw.wa.gov/hunting/special-hunts/results",
    "special-hunts.html": "https://wdfw.wa.gov/hunting/special-hunts",
    "mywdfw_ms.html": "https://www.mywdfw.org/multi-season-special-hunt/",
    "spring-bear.html": "https://wdfw.wa.gov/hunting/special-hunts/bear",
    "multi-season.html": "https://wdfw.wa.gov/hunting/special-hunts/multi-season",
    "big-game-licenses.html": "https://wdfw.wa.gov/licenses/hunting/big-game",
    "regs-big-game.html": "https://wdfw.wa.gov/hunting/regulations/big-game",
    "regs-cougar.html": "https://wdfw.wa.gov/hunting/regulations/big-game/cougar",
    "pub02706.html": "https://wdfw.wa.gov/publications/02706",
    "pub02683.html": "https://wdfw.wa.gov/publications/02683",
    "director-2024-draw.html": "https://wdfw.wa.gov/newsroom/directors-statement/wdfw-directors-statement-2024-special-hunt-permit-draw-updates",
}

# Power BI published-to-web report linked from https://wdfw.wa.gov/hunting/special-hunts/results
PBI_KEY = "150bb5cb-9d63-4c0f-91c5-a51546d0634a"
PBI_MODEL = 524837
PBI_API = "https://wabi-us-gov-virginia-api.analysis.usgovcloudapi.net/public/reports/querydata?synchronous=true"
PBI_ENTITY = "SpecialHuntMetrics_B_Tab03"
PBI_COLS = ["Season", "Species", "Hunt Name", "Hunt Choice", "Hunt Choice Name", "Permit Quota",
            "Permits Issued", "Total # of Applications", "Average Winner Points",
            "Selected as 1st Choice", "Selected as 2nd Choice", "Selected as 3rd Choice",
            "Selected as 4th Choice", "selected for another hunt", "not selected"]


def pbi_query(session):
    sel = [{"Column": {"Expression": {"SourceRef": {"Source": "s"}}, "Property": c}, "Name": c} for c in PBI_COLS]
    body = {"version": "1.0.0", "queries": [{"Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
        "Query": {"Version": 2, "From": [{"Name": "s", "Entity": PBI_ENTITY, "Type": 0}], "Select": sel},
        "Binding": {"Primary": {"Groupings": [{"Projections": list(range(len(PBI_COLS)))}]},
                    "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": 30000}}}, "Version": 1}}}]}}],
        "cancelQueries": [], "modelId": PBI_MODEL}
    r = session.post(PBI_API, json=body, headers={"X-PowerBI-ResourceKey": PBI_KEY}, timeout=120)
    r.raise_for_status()
    return r.json()


def get(session, url, out):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return
    r = session.get(url, timeout=120)
    print(r.status_code, len(r.content), url)
    if r.status_code == 200:
        with open(out, "wb") as f:
            f.write(r.content)
    time.sleep(0.4)


def main(raw):
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for d in ("harvestpages", "pbi", "pdf", "pages"):
        os.makedirs(os.path.join(raw, d), exist_ok=True)
    for rep, years in HARVEST_REPORTS.items():
        for y in years:
            get(s, HARVEST.format(y=y, r=rep), os.path.join(raw, "harvestpages", f"{y}-{rep}.html"))
    for name, url in PDFS.items():
        get(s, url, os.path.join(raw, "pdf", name))
    for name, url in PAGES.items():
        get(s, url, os.path.join(raw, "pages", name))
    out = os.path.join(raw, "pbi", "special_hunt_2021.json")
    if not os.path.exists(out):
        with open(out, "w") as f:
            json.dump(pbi_query(s), f)
        print("pbi saved")


if __name__ == "__main__":
    main(sys.argv[1])
