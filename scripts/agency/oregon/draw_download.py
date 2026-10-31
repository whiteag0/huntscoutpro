#!/usr/bin/env python3
"""Download ODFW controlled hunt draw reports (raw, untouched) for HuntScout Pro.

Source index: https://myodfw.com/articles/point-summary-reports
(document list exactly as linked there, retrieved 2026-10-31). For each draw
year ODFW posts, per series, a "Preference Point Draw Report" (applicants and
tags drawn by preference-point level, resident / nonresident, per hunt) and an
"Applicants by Hunt Choice" report (applicants by 1st-5th choice and tags
authorized/drawn per hunt). Bighorn sheep, mountain goat and premium hunts only
have the "Applicants by Hunt Choice" report (they are not preference-point
draws). Each document is posted as both XLSX and PDF; we keep both (XLSX is
parsed, PDF -> pdftotext text is used for spot checks).

Usage: python -I draw_download.py <raw_dir>
Writes <raw_dir>/<year>_<series>_<kind>.{xlsx,pdf,txt} and <raw_dir>/manifest.json.
"""
import json
import os
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
INDEX = "https://myodfw.com/articles/point-summary-reports"
B = "https://myodfw.com/sites/default/files/"
O = "https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/reports/docs/"

# (year, series, kind, xlsx_url, pdf_url) -- kind: points | choice
DOCS = [
    # 100 series (buck deer)
    (2026, "buck", "points", B + "2026-07/2026%20Buck%20Deer%20Preference%20Point%20Draw%20Report.xlsx", B + "2026-07/2026%20Buck%20Deer%20Preference%20Point%20Draw%20Report.pdf"),
    (2026, "buck", "choice", B + "2026-07/2026%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "buck", "points", B + "2025-11/2025_buck_points.xlsx", B + "2025-11/Preference-Point-Draw-Report-Buck-Deer2.pdf"),
    (2025, "buck", "choice", B + "2025-11/2025%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "buck", "points", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Buck%20Deer.xlsx", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Buck%20Deer.pdf"),
    (2024, "buck", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Buck%20Deer.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Buck%20Deer.pdf"),
    (2023, "buck", "points", B + "2025-09/2023%20Buck%20Deer%20Preference%20Point%20Draw%20Report.xlsx", B + "2025-09/2023%20Buck%20Deer%20Preference%20Point%20Draw%20Report.pdf"),
    (2023, "buck", "choice", B + "2025-09/2023%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "buck", "points", B + "2025-09/2022%20Buck%20Deer%20Preference%20Point%20Draw%20Report.xlsx", B + "2023-05/2022%20Buck%20Deer%20Preference%20Point%20Draw%20Report.pdf"),
    (2022, "buck", "choice", B + "2022-12/2022%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2022%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    # 200 series (elk)
    (2026, "elk", "points", B + "2026-07/2026%20Elk%20Preference%20Point%20Draw%20Report.xlsx", B + "2026-07/2026%20Elk%20Preference%20Point%20Draw%20Report.pdf"),
    (2026, "elk", "choice", B + "2026-07/2026%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "elk", "points", B + "2025-11/2025_elk_points.xlsx", B + "2025-11/Preference-Point-Draw-Report-Elk.pdf"),
    (2025, "elk", "choice", B + "2025-11/2025%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "elk", "points", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Elk.xlsx", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Elk.pdf"),
    (2024, "elk", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Elk.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Elk.pdf"),
    (2023, "elk", "points", B + "2025-09/2023%20Elk%20Preference%20Point%20Draw%20Report.xlsx", B + "2025-09/2023%20Elk%20Preference%20Point%20Draw%20Report.pdf"),
    (2023, "elk", "choice", B + "2025-09/2023%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "elk", "points", B + "2022-12/2022%20Elk%20Preference%20Point%20Draw%20Report.xlsx", B + "2023-05/2022%20Elk%20Preference%20Point%20Draw%20Report.pdf"),
    (2022, "elk", "choice", B + "2022-12/2022%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2023-05/2022%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    # 400 series (pronghorn)
    (2026, "pronghorn", "points", B + "2026-07/2026%20Pronghorn%20Antelope%20Preference%20Point%20Draw%20Report.xlsx", B + "2026-07/2026%20Pronghorn%20Antelope%20Preference%20Point%20Draw%20Report.pdf"),
    (2026, "pronghorn", "choice", B + "2026-07/2026%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "pronghorn", "points", B + "2025-11/2025_pronghorn_points.xlsx", B + "2025-11/Preference-Point-Draw-Report-Pronghorn-Antelope.pdf"),
    (2025, "pronghorn", "choice", B + "2025-11/2025%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "pronghorn", "points", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Pronghorn.xlsx", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Pronghorn.pdf"),
    (2024, "pronghorn", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Pronghorn.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Pronghorn.pdf"),
    (2023, "pronghorn", "points", B + "2025-09/2023%20Pronghorn%20Antelope%20Preference%20Point%20Draw%20Report.xlsx", B + "2025-09/2023%20Pronghorn%20Antelope%20Preference%20Point%20Draw%20Report.pdf"),
    (2023, "pronghorn", "choice", B + "2025-09/2023%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "pronghorn", "points", "https://myodfw.com/media/5547/download", B + "2023-05/2022_Pronghorn_Antelope_Preference_Point_Draw_Report.pdf"),
    (2022, "pronghorn", "choice", "https://myodfw.com/media/5151/download", B + "2023-05/2022_Pronghorn_Antelope_Applicants_by_Hunt_Choice.pdf"),
    # 600 series (antlerless deer)
    (2026, "antlerless", "points", B + "2026-08/2026%20Antlerless%20Deer%20Preference%20Point%20Draw%20Report_0.xlsx", B + "2026-07/2026%20Antlerless%20Deer%20Preference%20Point%20Draw%20Report.pdf"),
    (2026, "antlerless", "choice", B + "2026-08/2026%20Antlerless%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Antlerless%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "antlerless", "points", B + "2025-11/2025_anterless_points.xlsx", B + "2025-11/Preference-Point-Draw-Report-Anterless-Deer.pdf"),
    (2025, "antlerless", "choice", B + "2025-11/2025%20Antlerless%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Antlerless%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "antlerless", "points", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Antlerless%20Deer.xlsx", B + "2025-09/2024%20Preference%20Point%20Draw%20Report%20Antlerless%20Deer.pdf"),
    (2024, "antlerless", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Antlerless%20Deer.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Antlerless%20Deer.pdf"),
    (2023, "antlerless", "points", B + "2025-09/2023%20Antlerless%20Deer%20Preference%20Point%20Draw%20Report.xlsx", B + "2025-09/2023%20Antlerless%20Deer%20Preference%20Point%20Draw%20Report.pdf"),
    (2023, "antlerless", "choice", B + "2025-09/2023%20Antlerless%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Antlerless%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "antlerless", "points", "https://myodfw.com/media/5142/download", B + "2023-05/2022_Antlerless_Deer_Preference_Point_Draw_Report.pdf"),
    (2022, "antlerless", "choice", "https://myodfw.com/media/5141/download", B + "2023-05/2022_Antlerless_Deer_Applicants_by_Hunt_Choice.pdf"),
    # Premium hunts (applicants by hunt choice only)
    (2026, "premium_buck", "choice", B + "2026-07/2026%20Premium%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Premium%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2026, "premium_elk", "choice", B + "2026-07/2026%20Premium%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Premium%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2026, "premium_pronghorn", "choice", B + "2026-07/2026%20Premium%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Premium%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "premium_buck", "choice", B + "2025-11/2025%20Premium%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Premium%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "premium_elk", "choice", B + "2025-11/2025%20Premium%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Premium%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "premium_pronghorn", "choice", B + "2025-11/2025%20Premium%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Premium%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "premium_buck", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Premium%20Buck%20Deer.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Premium%20Buck%20Deer.pdf"),
    (2024, "premium_elk", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Premium%20Elk%20%281%29.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Premium%20Elk.pdf"),
    (2024, "premium_pronghorn", "choice", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Premium%20Pronghorn.xlsx", B + "2025-09/2024%20Applicants%20by%20Hunt%20Choice%20Premium%20Pronghorn.pdf"),
    (2023, "premium_buck", "choice", B + "2025-09/2023%20Premium%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Premium%20Buck%20Deer%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2023, "premium_elk", "choice", B + "2025-09/2023%20Premium%20Elk%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Premium%20Elk%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2023, "premium_pronghorn", "choice", B + "2025-09/2023%20Premium%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-09/2023%20Premium%20Pronghorn%20Antelope%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "premium_buck", "choice", "https://myodfw.com/media/5148/download", B + "2023-05/2022_Premium_Buck_Deer_Applicants_by_Hunt_Choice.pdf"),
    (2022, "premium_elk", "choice", "https://myodfw.com/media/5149/download", B + "2023-05/2022_Premium_Elk_Applicants_by_Hunt_Choice.pdf"),
    (2022, "premium_pronghorn", "choice", "https://myodfw.com/media/5150/download", B + "2023-05/2022_Premium_Pronghorn_Applicants_by_Hunt_Choice.pdf"),
    # Bighorn sheep
    (2026, "sheep", "choice", B + "2026-07/2026%20Bighorn%20Sheep%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Bighorn%20Sheep%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "sheep", "choice", B + "2025-11/2025%20Bighorn%20Sheep%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Bighorn%20Sheep%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "sheep", "choice", O + "2024/2024%20Applicants%20by%20Hunt%20Choice%20Bighorn%20Sheep.xlsx", O + "2024/2024%20Applicants%20by%20Hunt%20Choice%20Bighorn%20Sheep.pdf"),
    (2023, "sheep", "choice", O + "2023/2023%20Bighorn%20Sheep%20Applicants%20by%20Hunt%20Choice.xlsx", O + "2023/2023%20Bighorn%20Sheep%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "sheep", "choice", "https://myodfw.com/media/5143/download", B + "2023-05/2022_Bighorn_Sheep_Applicants_by_Hunt_Choice.pdf"),
    # Rocky Mountain goat
    (2026, "goat", "choice", B + "2026-07/2026%20Rocky%20Mountain%20Goat%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Rocky%20Mountain%20Goat%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "goat", "choice", B + "2025-11/2025%20Rocky%20Mountain%20Goat%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Rocky%20Mountain%20Goat%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "goat", "choice", O + "2024/2024%20Applicants%20by%20Hunt%20Choice%20Rocky%20Mountain%20Goat.xlsx", O + "2024/2024%20Applicants%20by%20Hunt%20Choice%20Rocky%20Mountain%20Goat.pdf"),
    (2023, "goat", "choice", O + "2023/2023%20Rocky%20Mountain%20Goat%20Applicants%20by%20Hunt%20Choice.xlsx", O + "2023/2023%20Rocky%20Mountain%20Goat%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "goat", "choice", "https://myodfw.com/media/5153/download", B + "2023-05/2022_Rocky_Mt_Goat_Applicants_by_Hunt_Choice.pdf"),
    # Spring bear (700 series)
    (2026, "springbear", "points", B + "2026-07/2026%20Spring%20Bear%20Preference%20Point%20Draw%20Report.xlsx", B + "2026-07/2026%20Spring%20Bear%20Preference%20Point%20Draw%20Report.pdf"),
    (2026, "springbear", "choice", B + "2026-07/2026%20Spring%20Bear%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2026-07/2026%20Spring%20Bear%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2025, "springbear", "points", B + "2025-11/2025_springbear_points.xlsx", B + "2025-11/Preference-Point-Draw-Report-Spring-Bear.pdf"),
    (2025, "springbear", "choice", B + "2025-11/2025%20Spring%20Bear%20Applicants%20by%20Hunt%20Choice.xlsx", B + "2025-11/2025%20Spring%20Bear%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2024, "springbear", "points", O + "2024/2024%20Preference%20Point%20Draw%20Report%20Spring%20Bear.xlsx", O + "2024/2024%20Preference%20Point%20Draw%20Report%20Spring%20Bear.pdf"),
    (2024, "springbear", "choice", O + "2024/2024%20Applicants%20by%20Hunt%20Choice%20Spring%20Bear.xlsx", O + "2024/2024%20Applicants%20by%20Hunt%20Choice%20Spring%20Bear.pdf"),
    (2023, "springbear", "points", O + "2023/2023%20Spring%20Bear%20Preference%20Point%20Draw%20Report.xlsx", O + "2023/2023%20Spring%20Bear%20Preference%20Point%20Draw%20Report.pdf"),
    (2023, "springbear", "choice", O + "2023/2023%20Spring%20Bear%20Applicants%20by%20Hunt%20Choice.xlsx", O + "2023/2023%20Spring%20Bear%20Applicants%20by%20Hunt%20Choice.pdf"),
    (2022, "springbear", "points", O + "2022/2022%20Spring%20Bear%20Preference%20Point%20Draw%20Report.xlsx", B + "2023-05/2022%20Spring%20Bear%20Preference%20Point%20Draw%20Report.pdf"),
    (2022, "springbear", "choice", O + "2022/2022%20Spring%20Bear%20Detail%20Report.xlsx", B + "2023-05/2022%20Spring%20Bear%20Detail%20Report.pdf"),
]


# Supporting agency documents: regulations booklets (hunt names, tag numbers, seasons,
# fees, dates), fee schedule, draft tag table, and the ODFW pages quoted in draw-meta.json.
ER = "https://www.eregulations.com/assets/docs/resources/OR/"
SUPPORT = [
    ("regs_2026.pdf", ER + "26ORHD_LR3.pdf"),
    ("regs_2024.pdf", ER + "24ORHD_LR.pdf"),
    ("regs_2023.pdf", ER + "23ORHD_LR4.pdf"),
    ("regs_2022.pdf", ER + "22ORHD_LR6.pdf"),
    ("gamebird_2026.pdf", "https://www.eregulations.com/oregon/hunting/game-bird/pdf"),
    ("fee_schedule.pdf", "https://myodfw.com/sites/default/files/2025-11/Rec_License_Fee_Schedule.pdf"),
    ("draft_2026_Rocky_Mtn_Goat_DRAFT.pdf", "https://dfw.state.or.us/news/docs/2025/2026%20Rocky%20Mtn%20Goat%20DRAFT.pdf"),
    ("page_point-summary-reports.html", INDEX),
    ("page_how-apply-controlled-hunt.html", "https://myodfw.com/articles/how-apply-controlled-hunt"),
    ("page_how-check-and-earn-preference-points.html", "https://myodfw.com/articles/how-check-and-earn-preference-points"),
    ("page_premium-big-game-hunts.html", "https://myodfw.com/articles/premium-big-game-hunts"),
    ("page_how-read-point-summary-reports.html", "https://myodfw.com/articles/how-read-point-summary-reports"),
]


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "cached"
    r = requests.get(url, headers={"User-Agent": UA}, timeout=120)
    r.raise_for_status()
    with open(dest, "wb") as f:
        f.write(r.content)
    time.sleep(0.5)
    return f"{r.status_code} {len(r.content)}"


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    manifest = []
    for year, series, kind, xurl, purl in DOCS:
        base = os.path.join(raw, f"{year}_{series}_{kind}")
        ent = {"year": year, "series": series, "kind": kind, "xlsx": xurl, "pdf": purl}
        for ext, url in (("xlsx", xurl), ("pdf", purl)):
            try:
                ent[ext + "_status"] = fetch(url, base + "." + ext)
            except Exception as e:  # keep going; report failures
                ent[ext + "_status"] = f"ERROR {e}"
        if os.path.exists(base + ".pdf") and not os.path.exists(base + ".txt"):
            subprocess.run(["pdftotext", "-layout", base + ".pdf", base + ".txt"], check=False)
        print(year, series, kind, ent.get("xlsx_status"), ent.get("pdf_status"))
        manifest.append(ent)
    for name, url in SUPPORT:
        dest = os.path.join(raw, name)
        try:
            st = fetch(url, dest)
        except Exception as e:
            st = f"ERROR {e}"
        if name.endswith(".pdf") and os.path.exists(dest):
            txt = dest[:-4] + ".txt"
            if not os.path.exists(txt):
                subprocess.run(["pdftotext", "-layout", dest, txt], check=False, stderr=subprocess.DEVNULL)
        print(name, st)
        manifest.append({"file": name, "url": url, "status": st})
    with open(os.path.join(raw, "manifest.json"), "w") as f:
        json.dump({"index": INDEX, "retrieved": time.strftime("%Y-%m-%d"), "docs": manifest}, f, indent=1)


if __name__ == "__main__":
    main()
