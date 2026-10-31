"""Source registry for Arizona (AZGFD) draw data. Imported by draw_parse.py and draw_meta.py.

Every document below was downloaded from AZGFD's public document store (the S3 bucket that
azgfd.com links its PDFs to; the azgfd.com HTML pages themselves sit behind a bot challenge).
"""

S3 = "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/"
BP_PAGE = "https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/bonus-point-process/"
PUB = "Arizona Game and Fish Department"
RETRIEVED = "2026-10-31"

# draw key -> (label used by AZGFD, {kind: path})
#   kind: bonus = Bonus Pass report, p12 = 1st/2nd choice pass, p345 = 3rd-5th choice pass,
#         bpr = Bonus Point Report (applicants and permits by bonus-point level per hunt)
DRAWS = {
    ("M", 2023): ("2023 Elk/Pronghorn (Midwinter) Draw", {
        "bonus": "2023/05/05093917/2023_Mid_Draw-Report_Bonus-Pass.pdf",
        "p12": "2023/05/05093908/2023_Mid_Draw-Report_1-2-Pass.pdf",
        "p345": "2023/05/05093913/2023_Mid_Draw-Report_3-4-5-Pass.pdf",
        "bpr": "2023/05/05093904/2023_Mid_Bonus-Point-Report.pdf"}),
    ("M", 2024): ("2024 Elk/Pronghorn (Midwinter) Draw", {
        "bonus": "2024/03/28135136/2024-Elk-Pronghorn-Draw-Report-Bonus-Pass.pdf",
        "p12": "2024/03/28135129/2024-Elk-Pronghorn-Draw-Report-1-2-Pass.pdf",
        "p345": "2024/03/28135132/2024-Elk-Pronghorn-Draw-Report-3-4-5-Pass.pdf",
        "bpr": "2024/03/28135125/2024-Elk-Pronghorn-Bonus-Point-Report.pdf"}),
    ("M", 2025): ("2025 Elk/Pronghorn (Midwinter) Draw", {
        "bonus": "2025/05/15151934/2025-Elk-Pronghorn-Draw-Report-Bonus-Pass.pdf",
        "p12": "2025/05/15151926/2025-Elk-Pronghorn-Draw-Report-1-2-Pass.pdf",
        "p345": "2025/05/15151930/2025-Elk-Pronghorn-Draw-Report-3-4-5-Pass.pdf",
        "bpr": "2025/05/15151918/2025-Bonus-Point-Report.pdf"}),
    ("M", 2026): ("2026 Elk/Pronghorn (Midwinter) Draw", {
        "bonus": "2026/03/27091637/2026-M-Draw-Report-Bonus-Pass.pdf",
        "p12": "2026/03/27091608/2026-M-Draw-Report-1-2-Pass.pdf",
        "p345": "2026/03/27091644/2026-M-Draw-Report-3-4-5-Pass.pdf",
        "bpr": "2026/03/27091508/2026-M-Bonus-Point-Report.pdf"}),
    ("F", 2023): ("2023 Fall Draw", {
        "bonus": "2023/08/17094622/2023-Fall-Draw-Report-Bonus-Pass.pdf",
        "p12": "2023/08/17094615/2023-Fall-Draw-Report-1-2-Pass.pdf",
        "p345": "2023/08/17094618/2023-Fall-Draw-Report-3-4-5-Pass.pdf",
        "bpr": "2023/08/17094611/2023-Fall-Draw-Bonus-Point-Report.pdf"}),
    ("F", 2024): ("2024 Fall Draw", {
        "bonus": "2024/07/17132558/2024-Fall-Draw-Report-Bonus-Pass.pdf",
        "p12": "2024/07/17132550/2024-Fall-Draw-Report-1-2-Pass.pdf",
        "p345": "2024/07/17132553/2024-Fall-Draw-Report-3-4-5-Pass.pdf",
        "bpr": "2024/09/03155509/2024-Fall-Bonus-Point-Report.pdf"}),
    ("F", 2025): ("2025 Fall Draw", {
        "bonus": "2025/07/17111321/2025-Fall-Draw-Bonus-Pass.pdf",
        "p12": "2025/07/17111306/2025-Fall-Draw-1-2-Pass.pdf",
        "p345": "2025/07/17112118/2025-Fall-Draw-3-4-5-Pass.pdf",
        "bpr": "2025/07/17111316/2025-Fall-Bonus-Point-Report.pdf"}),
    ("F", 2026): ("2026 Fall Draw", {
        "bonus": "2026/08/05153620/2026-F-Draw-Report-Bonus-Point-Pass.pdf",
        "p12": "2026/08/05153607/2026-F-Draw-Report-1-2-Pass.pdf",
        "p345": "2026/08/05153613/2026-F-Draw-Report-3-4-5-Pass.pdf",
        "bpr": "2026/08/16185459/2026-F-Bonus-Point-Report.pdf"}),
    ("S", 2023): ("2023 Spring Draw", {
        "bonus": "2023/04/12150754/2023_Spring_Draw-Report_Bonus-Pass.pdf",
        "p12": "2023/04/12150746/2023_Spring_Draw-Report_1-2-Pass.pdf",
        "p345": "2023/04/12150750/2023_Spring_Draw-Report_3-4-5-Pass.pdf",
        "bpr": "2023/04/12151943/2023_Spring_Bonus-Point-Report.pdf"}),
    ("S", 2024): ("2024 Spring Draw", {
        "bonus": "2024/03/28135741/2024-Spring-Bonus-Pass-Report.pdf",
        "p12": "2024/03/28135735/2024-Spring-1-2-Pass-Report.pdf",
        "p345": "2024/03/28135738/2024-Spring-3-4-5-Pass-Report.pdf",
        "bpr": "2024/03/28135745/2024-Spring-Bonus-Point-Report.pdf"}),
    ("S", 2025): ("2025 Spring Draw", {
        "bonus": "2025/02/27112811/2025-Spring-Bonus-Pass-Report.pdf",
        "p12": "2025/02/27112802/2025-Spring-1-2-Pass-Report.pdf",
        "p345": "2025/02/27112806/2025-Spring-3-4-5-Pass-Report.pdf",
        "bpr": "2025/02/27112814/2025-Spring-Bonus-Point-Report.pdf"}),
    ("S", 2026): ("2026 Spring Draw", {
        "bonus": "2025/11/21105428/2026-S-Bonus-Pass-Report.pdf",
        "p12": "2025/11/21105523/2026-S-Pass-1-2-Report.pdf",
        "p345": "2025/11/21105529/2026-S-Pass-3-4-5-Report.pdf",
        "bpr": "2025/11/21105537/2026-Spring-Bonus-Point-Report.pdf"}),
}

KIND_TITLE = {
    "bonus": "Draw Report - Bonus Pass",
    "p12": "Draw Report - 1st/2nd Choice Pass (1-2 Pass)",
    "p345": "Draw Report - 3rd/4th/5th Choice Pass (3-4-5 Pass)",
    "bpr": "Bonus Point Report",
}

# Draw-odds summaries (per hunt: unit, method, season dates, hunt type, 1st/2nd-choice applicants,
# permits, odds). Used for hunt descriptions/units/dates (2023-2025) and as a cross-check.
ODDS = {
    (2023, "elk"): "2024/01/03130751/2023-AZ-Elk-Draw-Odds.pdf",
    (2023, "pronghorn"): "2024/01/03130802/2023-AZ-Pronghorn-Draw-Odds.pdf",
    (2023, "deer"): "2024/01/03130748/2023-AZ-Deer-Draw-Odds.pdf",
    (2023, "sheep"): "2024/01/03130741/2023-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    (2023, "fall-turkey"): "2024/01/03130758/2023-AZ-Fall-Turkey-Draw-Odds.pdf",
    (2023, "spring-turkey"): "2024/01/03130812/2023-AZ-Spring-Turkey-Draw-Odds.pdf",
    (2024, "elk"): "2024/12/02085505/2024-AZ-Elk-Draw-Odds.pdf",
    (2024, "pronghorn"): "2024/12/02085516/2024-AZ-Pronghorn-Draw-Odds.pdf",
    (2024, "deer"): "2024/12/02085502/2024-AZ-Deer-Draw-Odds.pdf",
    (2024, "sheep"): "2024/12/02085454/2024-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    (2024, "fall-turkey"): "2024/12/02085512/2024-AZ-Fall-Turkey-Draw-Odds.pdf",
    (2024, "spring-turkey"): "2024/12/02085525/2024-AZ-Spring-Turkey-Draw-Odds.pdf",
    (2025, "elk"): "2025/08/22144539/2025-AZ-Elk-Draw-Odds.pdf",
    (2025, "pronghorn"): "2025/08/22144552/2025-AZ-Pronghorn-Draw-Odds.pdf",
    (2025, "deer"): "2025/08/22144535/2025-AZ-Deer-Draw-Odds.pdf",
    (2025, "sheep"): "2025/08/22144528/2025-AZ-Bighorn-Sheep-Draw-Odds.pdf",
    (2025, "fall-turkey"): "2025/08/22144548/2025-AZ-Fall-Turkey-Draw-Odds.pdf",
    (2025, "spring-turkey"): "2025/08/22144602/2025-AZ-Spring-Turkey-Draw-Odds.pdf",
}
ODDS_TITLE = {"elk": "Elk", "pronghorn": "Pronghorn", "deer": "Deer", "sheep": "Bighorn Sheep",
              "fall-turkey": "Fall Turkey", "spring-turkey": "Spring Turkey"}

# 2026 regulation booklets (hunt tables for 2026 hunts; fees; draw deadlines)
REGS = {
    "pe2026": ("2026 Pronghorn and Elk Hunt Draw Regulations", "2025/12/23143704/2026-Pronghorn-and-Elk-Regulations_251223.pdf", 2026),
    "hunt2026": ("2026-2027 Arizona Hunting Regulations", "2026/05/04081122/2026-27-Arizona-Hunting-Regulations.pdf", 2026),
    "spring2026": ("2026 Spring Hunt Draw Regulations (Turkey, Javelina, Bison, Bear and Raptor Capture)", "2025/09/05122248/2026-Spring-Regulations_250908.pdf", 2026),
    # Earlier spring booklets: used only for spring-turkey season dates (AZGFD's draw-odds summaries
    # print just the first window of split seasons) and to settle hunt numbers the summary prints twice.
    "spring2023": ("2023 Spring Turkey, Javelina, Bison, Bear and Raptor Capture Hunt Draw Information", "archive/2023-Spring-Regulations_220901.pdf", 2023),
    "spring2024": ("2024 Spring Turkey, Javelina, Bison, Bear and Raptor Capture Hunt Draw Information", "2024/03/26133333/2024-Spring-Regulations_240326.pdf", 2024),
    "spring2025": ("2025 Spring Turkey, Javelina, Bison, Bear and Raptor Capture Hunt Draw Information", "2024/10/04094101/2025-Spring-Regulations_240930.pdf", 2025),
    # Hunting regulations / P&E booklets for 2023-2025: cited only to settle hunt numbers that the
    # draw-odds summary prints twice with different units (see ODDS_DUP_PICK in draw_parse.py).
    "pe2023": ("2023 Pronghorn and Elk Hunt Draw Information", "archive/2023-Pronghorn-and-Elk-Regulations_230120.pdf", 2023),
    "hunt2023": ("2023-2024 Arizona Hunting Regulations", "2023/10/24104400/2023-24-Arizona-Hunting-Regulations_231023.pdf", 2023),
    "hunt2024": ("2024-2025 Arizona Hunting Regulations", "2024/12/09112338/2024-25-Arizona-Hunting-Regulations_241209.pdf", 2024),
    "hunt2025": ("2025-2026 Arizona Hunting Regulations", "2025/12/23103956/2025-26-Arizona-Hunting-Regulations_251223.pdf", 2025),
}
# REGS keys whose hunt tables draw_parse.py parses (the others are cited only)
PARSED_REGS = ("pe2026", "hunt2026", "spring2026", "spring2023", "spring2024", "spring2025")
REGS_NOTES = {
    "hunt2023": "No longer in AZGFD's document store; read from the Internet Archive capture "
                "https://web.archive.org/web/20240104162335id_/" ,
}


def draw_source_id(season, year, kind):
    return f"d-az-{year}{season.lower()}-{kind}"


def odds_source_id(year, sp):
    return f"d-az-{year}-odds-{sp}"


def regs_source_id(key):
    return f"d-az-regs-{key}"


def all_sources():
    out = []
    for (season, year), (label, kinds) in sorted(DRAWS.items(), key=lambda x: (x[0][1], x[0][0])):
        for kind, path in kinds.items():
            out.append({
                "id": draw_source_id(season, year, kind),
                "title": f"{label} — {KIND_TITLE[kind]}",
                "publisher": PUB,
                "url": S3 + path,
                "pageUrl": BP_PAGE,
                "dataYear": year,
                "retrieved": RETRIEVED,
            })
    for (year, sp), path in sorted(ODDS.items()):
        out.append({
            "id": odds_source_id(year, sp),
            "title": f"{year} AZ {ODDS_TITLE[sp]} Draw Odds",
            "publisher": PUB,
            "url": S3 + path,
            "dataYear": year,
            "retrieved": RETRIEVED,
            "notes": "AZGFD draw-odds summary (odds = chance of drawing first-choice hunt). Used for hunt unit, method, season dates and hunt type.",
        })
    for key, (title, path, year) in REGS.items():
        src = {
            "id": regs_source_id(key),
            "title": title,
            "publisher": PUB,
            "url": S3 + path,
            "dataYear": year,
            "retrieved": RETRIEVED,
        }
        if key in REGS_NOTES:
            src["url"] = REGS_NOTES[key].split("capture ", 1)[1] + S3 + path
            src["notes"] = REGS_NOTES[key].split(" https://", 1)[0] + "."
        out.append(src)
    return out
