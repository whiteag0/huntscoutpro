"""Download AZGFD draw reports (2022-2026 draws) into the raw directory.

AZGFD publishes, per draw (Midwinter = elk & pronghorn; Fall = deer, sheep, fall
turkey, ...; Spring = spring turkey, javelina, bison, bear ...), three pass reports
(Bonus Pass, 1st/2nd choice pass, 3rd-5th choice pass) and a Bonus Point Report
(applicants and permits by bonus-point level for each hunt number).
URLs are the public S3 objects the azgfd.com bonus-point page links to.
Usage: draw_download.py <raw_dir>
"""
import os, sys, requests

B = "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/"
URLS = [
    # ---- Midwinter (elk & pronghorn)
    "2026/09/04141153/2022-Elk-and-Pronghorn-Bonus-Point-Report.pdf",
    "2026/09/04141201/2022-Elk-and-Pronghorn-Draw-Report-1-2-Pass.pdf",
    "2026/09/04141207/2022-Elk-and-Pronghorn-Draw-Report-Bonus-Pass.pdf",
    "2026/09/04141213/2022-Elk-and-Pronghorn-Draw-Report-3-4-5-Pass.pdf",
    "2023/05/05093904/2023_Mid_Bonus-Point-Report.pdf",
    "2023/05/05093908/2023_Mid_Draw-Report_1-2-Pass.pdf",
    "2023/05/05093913/2023_Mid_Draw-Report_3-4-5-Pass.pdf",
    "2023/05/05093917/2023_Mid_Draw-Report_Bonus-Pass.pdf",
    "2024/03/28135125/2024-Elk-Pronghorn-Bonus-Point-Report.pdf",
    "2024/03/28135129/2024-Elk-Pronghorn-Draw-Report-1-2-Pass.pdf",
    "2024/03/28135132/2024-Elk-Pronghorn-Draw-Report-3-4-5-Pass.pdf",
    "2024/03/28135136/2024-Elk-Pronghorn-Draw-Report-Bonus-Pass.pdf",
    "2025/05/15151918/2025-Bonus-Point-Report.pdf",
    "2025/05/15151926/2025-Elk-Pronghorn-Draw-Report-1-2-Pass.pdf",
    "2025/05/15151930/2025-Elk-Pronghorn-Draw-Report-3-4-5-Pass.pdf",
    "2025/05/15151934/2025-Elk-Pronghorn-Draw-Report-Bonus-Pass.pdf",
    "2026/03/27091508/2026-M-Bonus-Point-Report.pdf",
    "2026/03/27091608/2026-M-Draw-Report-1-2-Pass.pdf",
    "2026/03/27091637/2026-M-Draw-Report-Bonus-Pass.pdf",
    "2026/03/27091644/2026-M-Draw-Report-3-4-5-Pass.pdf",
    # ---- Fall (deer, bighorn, fall turkey, fall javelina, bison, ...)
    "2026/09/04141751/2022-Fall-Draw-Report-3-4-5-Pass.pdf",
    "2026/09/04141756/2022-Fall-Draw-Report-Bonus-Point-Pass.pdf",
    "2026/09/04141806/2022-Fall-Draw-Report-Bonus-Point-Report.pdf",
    "2026/09/04141812/2022-Fall-Draw-Report-1-2-Pass.pdf",
    "2023/08/17094611/2023-Fall-Draw-Bonus-Point-Report.pdf",
    "2023/08/17094615/2023-Fall-Draw-Report-1-2-Pass.pdf",
    "2023/08/17094618/2023-Fall-Draw-Report-3-4-5-Pass.pdf",
    "2023/08/17094622/2023-Fall-Draw-Report-Bonus-Pass.pdf",
    "2024/09/03155509/2024-Fall-Bonus-Point-Report.pdf",
    "2024/07/17132550/2024-Fall-Draw-Report-1-2-Pass.pdf",
    "2024/07/17132553/2024-Fall-Draw-Report-3-4-5-Pass.pdf",
    "2024/07/17132558/2024-Fall-Draw-Report-Bonus-Pass.pdf",
    "2025/07/17111316/2025-Fall-Bonus-Point-Report.pdf",
    "2025/07/17111306/2025-Fall-Draw-1-2-Pass.pdf",
    "2025/07/17112118/2025-Fall-Draw-3-4-5-Pass.pdf",
    "2025/07/17111321/2025-Fall-Draw-Bonus-Pass.pdf",
    "2026/08/16185459/2026-F-Bonus-Point-Report.pdf",
    "2026/08/05153607/2026-F-Draw-Report-1-2-Pass.pdf",
    "2026/08/05153613/2026-F-Draw-Report-3-4-5-Pass.pdf",
    "2026/08/05153620/2026-F-Draw-Report-Bonus-Point-Pass.pdf",
    # ---- Spring (spring turkey, javelina, bison, bear ...)
    "2026/09/04144737/2022-Spring-Draw-Report-1-2-Pass.pdf",
    "2026/09/04144742/2022-Spring-Draw-Report-3-4-5-Pass.pdf",
    "2026/09/04144746/2022-Spring-Draw-Report-Bonus-Pass.pdf",
    "2026/09/04144753/2022-Spring-Draw-Report-Bonus-Point-Report.pdf",
    "2023/04/12150746/2023_Spring_Draw-Report_1-2-Pass.pdf",
    "2023/04/12150750/2023_Spring_Draw-Report_3-4-5-Pass.pdf",
    "2023/04/12150754/2023_Spring_Draw-Report_Bonus-Pass.pdf",
    "2023/04/12151943/2023_Spring_Bonus-Point-Report.pdf",
    "2024/03/28135735/2024-Spring-1-2-Pass-Report.pdf",
    "2024/03/28135738/2024-Spring-3-4-5-Pass-Report.pdf",
    "2024/03/28135741/2024-Spring-Bonus-Pass-Report.pdf",
    "2024/03/28135745/2024-Spring-Bonus-Point-Report.pdf",
    "2025/02/27112802/2025-Spring-1-2-Pass-Report.pdf",
    "2025/02/27112806/2025-Spring-3-4-5-Pass-Report.pdf",
    "2025/02/27112811/2025-Spring-Bonus-Pass-Report.pdf",
    "2025/02/27112814/2025-Spring-Bonus-Point-Report.pdf",
    "2025/11/21105428/2026-S-Bonus-Pass-Report.pdf",
    "2025/11/21105523/2026-S-Pass-1-2-Report.pdf",
    "2025/11/21105529/2026-S-Pass-3-4-5-Report.pdf",
    "2025/11/21105537/2026-Spring-Bonus-Point-Report.pdf",
    # ---- Draw-odds summaries (AZGFD-published per-species summaries)
    "2025/08/22144535/2025-AZ-Deer-Draw-Odds.pdf",
    "2025/08/22144539/2025-AZ-Elk-Draw-Odds.pdf",
    "2025/08/22144552/2025-AZ-Pronghorn-Draw-Odds.pdf",
    "2025/08/22144528/2025-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    "2025/08/22144548/2025-AZ-Fall-Turkey-Draw-Odds.pdf",
    "2025/08/22144602/2025-AZ-Spring-Turkey-Draw-Odds.pdf",
    "2025/08/22144545/2025-AZ-Fall-Javelina-Draw-Odds.pdf",
    "2025/08/22144559/2025-AZ-Spring-Javelina-Draw-Odds.pdf",
    "2025/08/22144532/2025-AZ-Bison-Draw-Odds.pdf",
    "2025/08/22144555/2025-AZ-Sandhill-Crane-Draw-Odds.pdf",
    "2024/12/02085454/2024-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    "2024/12/02085502/2024-AZ-Deer-Draw-Odds.pdf",
    "2024/12/02085505/2024-AZ-Elk-Draw-Odds.pdf",
    "2024/12/02085512/2024-AZ-Fall-Turkey-Draw-Odds.pdf",
    "2024/12/02085516/2024-AZ-Pronghorn-Draw-Odds.pdf",
    "2024/12/02085525/2024-AZ-Spring-Turkey-Draw-Odds.pdf",
    "2024/01/03130741/2023-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    "2024/01/03130748/2023-AZ-Deer-Draw-Odds.pdf",
    "2024/01/03130751/2023-AZ-Elk-Draw-Odds.pdf",
    "2024/01/03130758/2023-AZ-Fall-Turkey-Draw-Odds.pdf",
    "2024/01/03130802/2023-AZ-Pronghorn-Draw-Odds.pdf",
    "2024/01/03130812/2023-AZ-Spring-Turkey-Draw-Odds.pdf",
    "2023/05/05093157/2022-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    # ---- Regulation booklets (hunt tables: units, dates, descriptions; fees; deadlines)
    "2025/12/23143704/2026-Pronghorn-and-Elk-Regulations_251223.pdf",
    "2026/05/04081122/2026-27-Arizona-Hunting-Regulations.pdf",
    "2025/09/05122248/2026-Spring-Regulations_250908.pdf",
]

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    for u in URLS:
        name = u.rsplit("/", 1)[-1]
        dest = os.path.join(out, name)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            continue
        r = s.get(B + u, timeout=120)
        r.raise_for_status()
        with open(dest, "wb") as f:
            f.write(r.content)
        print(r.status_code, len(r.content), name)

if __name__ == "__main__":
    main()
