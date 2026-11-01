#!/usr/bin/env python3
"""Build src/data/agency/new-mexico/draw-meta.json.

Usage: draw_meta.py <repo_root>   (run after draw_parse.py; then run seasons_parse.py, which
replaces seasons[] below with the full hunt-table season list and adds season dates to the draw rows)

Facts below were transcribed from the cited NMDOW documents (downloaded by
draw_download.py; see sources[]). Coverage years/row counts are read from the
draw/<species>.json files written by draw_parse.py.
"""
import json, os, sys

RET = "2026-10-31"
PUB_NEW = "New Mexico Department of Wildlife"
PUB_OLD = "New Mexico Department of Game and Fish"
ODDS_PAGE = "https://wildlife.dgf.nm.gov/hunting/applications-and-draw-information/how-new-mexico-draw-works/"
DL = "https://wildlife.dgf.nm.gov/download/"

SOURCES = [
    dict(id="d-nm-odds-2022", title="2022 Big-Game Complete Drawing Odds Report", publisher=PUB_OLD,
         url=DL + "2022-big-game-draw-odds-complete-report/?wpdmdl=48730", pageUrl=ODDS_PAGE, dataYear=2022, retrieved=RET,
         notes="Excel workbook. Pre-draw applicants by choice and pool; post-draw successful applicants by choice and pool."),
    dict(id="d-nm-odds-2023", title="2023 Big-Game Complete Drawing Odds Report", publisher=PUB_OLD,
         url=DL + "2023-big-game-draw-odds-complete-report/?wpdmdl=48734", pageUrl=ODDS_PAGE, dataYear=2023, retrieved=RET,
         notes="Excel workbook."),
    dict(id="d-nm-odds-2024", title="2024-25 Big-Game Drawing Odds Complete Report", publisher=PUB_OLD,
         url=DL + "2024-drawing-odds-complete-report/?wpdmdl=48997", pageUrl=ODDS_PAGE, dataYear=2024, retrieved=RET,
         notes="Excel workbook (sheet dated 4-9-24)."),
    dict(id="d-nm-odds-2025", title="2025-26 Big-Game Drawing Odds Complete Report", publisher=PUB_OLD,
         url=DL + "2025-drawing-odds-complete-report/?wpdmdl=52046", pageUrl=ODDS_PAGE, dataYear=2025, retrieved=RET,
         notes="Excel workbook."),
    dict(id="d-nm-odds-2026", title="2026 Big Game Drawing Odds Complete Report", publisher=PUB_NEW,
         url=DL + "2026-big-game-drawing-odds-complete-report/?wpdmdl=56113", pageUrl=ODDS_PAGE, dataYear=2026, retrieved=RET,
         notes="Excel workbook."),
    dict(id="d-nm-bt-2022", title="2022 Bear and Turkey Drawing Odds Report", publisher=PUB_OLD,
         url=DL + "2022-bear-and-turkey-draw-odds-report/?wpdmdl=48731", pageUrl=ODDS_PAGE, dataYear=2022, retrieved=RET,
         notes="Excel workbook."),
    dict(id="d-nm-bt-2023", title="2023 Bear and Turkey Drawing Odds Report", publisher=PUB_OLD,
         url=DL + "2023-bear-and-turkey-draw-odds-report/?wpdmdl=48733", pageUrl=ODDS_PAGE, dataYear=2023, retrieved=RET,
         notes="PDF. Turkey RES/NR/OUT drawn columns do not reconcile with the published distribution %; not used."),
    dict(id="d-nm-bt-2024", title="2024 Bear and Turkey Drawing Odds Report", publisher=PUB_OLD,
         url=DL + "2024-bear-and-turkey-draw-odds-report/?wpdmdl=48995", pageUrl=ODDS_PAGE, dataYear=2024, retrieved=RET,
         notes="Excel workbook. Post-draw counts by pool only (not by choice)."),
    dict(id="d-nm-bt-2025", title="2025 Bear and Turkey Drawing Odds Report", publisher=PUB_OLD,
         url=DL + "2025-bear-and-turkey-draw-odds-report/?wpdmdl=50810", pageUrl=ODDS_PAGE, dataYear=2025, retrieved=RET,
         notes="Excel workbook. Post-draw counts by pool only (not by choice)."),
    dict(id="d-nm-bt-2026", title="2026 Bear and Turkey Draw Odds Report", publisher=PUB_NEW,
         url=DL + "2026-bear-and-turkey-draw-odds-report/?wpdmdl=55353", pageUrl=ODDS_PAGE, dataYear=2026, retrieved=RET,
         notes="Excel workbook. Post-draw counts by pool only (not by choice)."),
    *[dict(id=f"d-nm-summary-{y}", title=t, publisher=PUB_NEW if y == 2026 else PUB_OLD, url=DL + u, pageUrl=ODDS_PAGE,
           dataYear=y, retrieved=RET, notes="Used only to cross-check the Complete Report; no values taken from it.")
      for y, t, u in [(2023, "2023 Big-Game Drawing Odds Summary", "2023-big-game-draw-odds-summary/?wpdmdl=48735"),
                      (2024, "2024-25 Big-Game Drawing Odds Summary", "2024-drawing-odds-summary-report/?wpdmdl=48996"),
                      (2025, "2025-26 Big-Game Drawing Odds Summary", "2025-drawing-odds-summary-report/?wpdmdl=52047"),
                      (2026, "2026 Big Game Drawing Odds Summary Report", "2026-big-game-drawing-odds-summary-report/?wpdmdl=56112")]],
    dict(id="d-nm-rib-2026", title="2026-2027 New Mexico Hunting Rules and Information", publisher=PUB_NEW,
         url=DL + "2026-2027-new-mexico-hunting-rules-and-info/?wpdmdl=52826", dataYear=2026, retrieved=RET,
         pageUrl="https://wildlife.dgf.nm.gov/home/publications/",
         notes="License year April 1, 2026 - March 31, 2027. Draw process, quotas, hunt-code legend, bag codes, 2026 dates, hunt tables (season dates per hunt code), OTC seasons. "
               "The 2027-2028 booklet was not yet released as of 2026-10-31 (publications page and NMDOW download list checked)."),
    dict(id="d-nm-draw-page", title="Draw Info, Odds & Tips (How New Mexico's Draw Works)", publisher=PUB_NEW,
         url=ODDS_PAGE, retrieved=RET, notes="Web page (last modified 2026-07-29)."),
    dict(id="d-nm-dates-2026", title="Applying for Big Game Hunts in New Mexico - Important Dates 2026-27", publisher=PUB_NEW,
         url="https://wildlife.dgf.nm.gov/hunting/applications-and-draw-information/", dataYear=2026, retrieved=RET,
         notes="Web page (last modified 2026-02-16; still the 2026-27 dates on 2026-10-31)."),
    dict(id="d-nm-fees-draw-2027", title="2027-2028 Draw Licenses and Fees (Draw Hunt License Fees)", publisher=PUB_NEW,
         url=DL + "2027-2028-draw-licenses-and-fees/?wpdmdl=57207", pageUrl=ODDS_PAGE, dataYear=2027, retrieved=RET,
         notes="License year 2027-2028. Amounts identical to the 2026-27 booklet (page 17)."),
    dict(id="d-nm-fees-otc-2027", title="2027-28 Over-the-Counter (OTC) License Fees", publisher=PUB_NEW,
         url=DL + "2027-2028-over-the-counter-otc-license-fees/?wpdmdl=57206", pageUrl=ODDS_PAGE, dataYear=2027, retrieved=RET,
         notes="License year 2027-2028. Amounts identical to the 2026-27 booklet (page 16)."),
    dict(id="d-nm-leftover-2026", title="Leftover draw licenses go on sale July 8 (NMDOW news release, 2026-07-07)", publisher=PUB_NEW,
         url="https://wildlife.dgf.nm.gov/leftover-draw-licenses-go-on-sale-july-8-2026/", dataYear=2026, retrieved=RET,
         notes="537 leftover deer licenses from the 2026-2027 big-game draw."),
    dict(id="d-nm-youth-elk-2026", title="Youth encouragement Elk license sale begins July 22 (NMDOW news release, 2026-07-21)", publisher=PUB_NEW,
         url="https://wildlife.dgf.nm.gov/youth-encouragement-elk-license-sale-begins-july-22-2026/", dataYear=2026, retrieved=RET),
]

NOT_2027 = ("2027 dates not yet published by NMDOW as of 2026-10-31: the Important Dates page still lists 2026-27 dates and "
            "the 2027-2028 Hunting Rules and Information booklet has not been released (only the 2027-28 fee sheets, posted 2026-10-22).")
BIG_DATES = [
    dict(label="Draw application deadline (5 p.m. MDT)", kind="application", date="2026-03-18", cycle=2026, status="confirmed",
         note=NOT_2027, sourceId="d-nm-dates-2026"),
    dict(label="Big-game draw results available", kind="results", date="2026-04-22", cycle=2026, status="confirmed",
         note=NOT_2027, sourceId="d-nm-dates-2026"),
]
HARVEST_REPORT = [
    dict(label="2025-26 harvest report deadline (free; late fee after this date)", kind="other", date="2026-02-15", cycle=2026, status="confirmed",
         note="Deer, elk, pronghorn and turkey license holders. " + NOT_2027, sourceId="d-nm-dates-2026"),
    dict(label="Last day for late 2025-26 harvest reports ($8 late fee); unreported hunters' 2026-27 draw applications are rejected", kind="other",
         date="2026-03-18", cycle=2026, status="confirmed", note="Deer, elk, pronghorn and turkey license holders. " + NOT_2027, sourceId="d-nm-dates-2026"),
]
OTC_SALE = dict(label="2026-27 over-the-counter licenses on sale (online, phone, NMDOW offices, vendors)", kind="license-sale", date="2026-03-25",
                cycle=2026, status="confirmed", note="License year begins April 1, 2026. " + NOT_2027, sourceId="d-nm-dates-2026")
DEER_LEFTOVER = [
    dict(label="Leftover deer draw licenses on sale online (10 a.m., residents only for the first 24 hours)", kind="leftover", residency="resident",
         date="2026-07-08", cycle=2026, status="confirmed", note="537 leftover deer licenses from the 2026-27 draw.", sourceId="d-nm-leftover-2026"),
    dict(label="Leftover deer draw licenses open to nonresidents (10 a.m., if licenses remain)", kind="leftover", residency="nonresident",
         date="2026-07-09", cycle=2026, status="confirmed", sourceId="d-nm-leftover-2026"),
]
YOUTH_ELK = [
    dict(label="Youth Encouragement Elk licenses on sale online (10 a.m. MDT; first 14 days only resident youth who applied and drew nothing)",
         kind="license-sale", residency="resident", date="2026-07-22", cycle=2026, status="confirmed",
         note="1,960 antlerless licenses, first-come, first-served.", sourceId="d-nm-youth-elk-2026"),
    dict(label="Youth Encouragement Elk licenses open to any eligible youth hunter (10 a.m. MDT)", kind="license-sale", date="2026-08-05",
         cycle=2026, status="confirmed", sourceId="d-nm-youth-elk-2026"),
]
BT_DATES = [
    dict(label="Bear and turkey draw permit application deadline (5 p.m. MT)", kind="application", date="2026-02-11", cycle=2026, status="confirmed",
         note=NOT_2027, sourceId="d-nm-dates-2026"),
    dict(label="Bear and turkey draw permit results available", kind="results", date="2026-02-18", cycle=2026, status="confirmed",
         note=NOT_2027, sourceId="d-nm-dates-2026"),
]
RANDOM_SUMMARY = ("Random draw with no preference or bonus points: each application gets a random sequence number and the "
                  "system tries the 1st, 2nd, then 3rd hunt choice. Statutory quotas per hunt: at least 84% resident, 10% to "
                  "residents or nonresidents applying with a NM registered outfitter, 6% nonresidents without an outfitter.")
NR_NOTE = ("Nonresidents draw from the 6% pool (or the 10% outfitter pool if applying with a NM registered outfitter). NMDOW notes "
           "it is extremely unlikely for a nonresident to draw a hunt code with 12 or fewer licenses, or an outfitted applicant one with six or fewer.")

SPECIES = [
    dict(species="elk", displayName="Elk", drawSystem="random", pointsMatter=False,
         drawSystemSummary=RANDOM_SUMMARY + " Antlerless elk and WMA-only hunts are 100% resident; deer and elk applicants may add a 4th-choice quadrant filled in a second drawing.",
         residentNote="Residents receive a minimum of 84% of licenses in each hunt, and 100% of antlerless (A) and WMA-only elk licenses.",
         nonresidentNote=NR_NOTE + " Nonresidents are ineligible for antlerless elk and WMA hunts.",
         otcSummary="No public-land OTC elk licenses. Private-land elk hunting uses landowner-issued ranch-only or unit-wide authorizations with a Private-Land Elk License (2026-27 booklet page 73); these are outside the public draw and its odds reports.",
         keyDates=BIG_DATES + HARVEST_REPORT + YOUTH_ELK, sourceIds=["d-nm-rib-2026", "d-nm-draw-page", "d-nm-dates-2026", "d-nm-fees-draw-2027", "d-nm-youth-elk-2026"]),
    dict(species="mule-deer", displayName="Deer (mule deer; most NM deer hunts are bag FAD, legal for either deer species)", drawSystem="random", pointsMatter=False,
         drawSystemSummary=RANDOM_SUMMARY + " NM deer hunts are drawn by hunt code; bag FAD (fork-antlered deer) allows mule deer or white-tailed deer, FAMD is mule deer only.",
         residentNote="Residents receive a minimum of 84% of licenses in each hunt and 100% of WMA-only hunts.",
         nonresidentNote=NR_NOTE,
         otcSummary="Private-Land Only Deer Licenses are sold over the counter (from July 1) for private land in many units; no public-land OTC deer licenses.",
         keyDates=BIG_DATES + HARVEST_REPORT + DEER_LEFTOVER, sourceIds=["d-nm-rib-2026", "d-nm-draw-page", "d-nm-dates-2026", "d-nm-fees-draw-2027", "d-nm-fees-otc-2027", "d-nm-leftover-2026"]),
    dict(species="whitetail", displayName="White-tailed deer (Coues; FAWTD/ESWTD hunt codes)", drawSystem="random", pointsMatter=False,
         drawSystemSummary=RANDOM_SUMMARY + " White-tailed-only deer hunts carry bag FAWTD (fork-antlered white-tailed deer) or ESWTD (either-sex white-tailed deer); FAD hunts (listed under mule deer) are also legal for white-tailed deer.",
         residentNote="Residents receive a minimum of 84% of licenses in each hunt.",
         nonresidentNote=NR_NOTE,
         otcSummary="Private-Land Only Deer Licenses are sold over the counter in some units; no public-land OTC deer licenses.",
         keyDates=BIG_DATES + HARVEST_REPORT + DEER_LEFTOVER, sourceIds=["d-nm-rib-2026", "d-nm-draw-page", "d-nm-dates-2026", "d-nm-fees-draw-2027", "d-nm-leftover-2026"]),
    dict(species="pronghorn", displayName="Pronghorn", drawSystem="random", pointsMatter=False,
         drawSystemSummary=RANDOM_SUMMARY,
         residentNote="Residents receive a minimum of 84% of public draw licenses in each hunt.",
         nonresidentNote=NR_NOTE,
         otcSummary="Private-Land Only Pronghorn Licenses are sold over the counter (from July 1) for private land; public-land pronghorn is draw only.",
         keyDates=BIG_DATES + HARVEST_REPORT, sourceIds=["d-nm-rib-2026", "d-nm-draw-page", "d-nm-dates-2026", "d-nm-fees-draw-2027", "d-nm-fees-otc-2027"]),
    dict(species="sheep", displayName="Bighorn sheep (Rocky Mountain & desert)", drawSystem="random", pointsMatter=False,
         drawSystemSummary=RANDOM_SUMMARY + " Only one hunter per application; a hunter may draw one Rocky Mountain and one desert bighorn ram license in a lifetime.",
         residentNote="Residents receive a minimum of 84% of licenses in each hunt.",
         nonresidentNote=NR_NOTE,
         otcSummary="None. Bighorn sheep are draw only, apart from one auction and one raffle authorization each for Rocky Mountain and desert bighorn (outside the draw).",
         keyDates=BIG_DATES, sourceIds=["d-nm-rib-2026", "d-nm-draw-page", "d-nm-dates-2026", "d-nm-fees-draw-2027"]),
    dict(species="bear", displayName="Black bear", drawSystem="otc", pointsMatter=False,
         drawSystemSummary="Bear hunting is mainly over the counter: an OTC Bear License is valid in open bear management zones until each zone's harvest limit is reached. A separate random draw issues bear draw permits for a few special areas (WMAs, Valle Vidal, Sugarite Canyon State Park); one hunter per application.",
         residentNote="Only New Mexico residents may apply for WMA bear draw permits.",
         nonresidentNote="Nonresidents may buy the OTC Bear License and apply for non-WMA bear draw permits (Valle Vidal, Unit 2 youth, Sugarite Canyon).",
         otcSummary="OTC Bear License valid statewide in open zones during zone seasons (bow-only Sept. 1-24 in most zones; any legal sporting arm periods vary by zone). Zones close when harvest limits are reached. Draw permits must also be validated with the OTC Bear License.",
         keyDates=BT_DATES + [OTC_SALE], sourceIds=["d-nm-rib-2026", "d-nm-dates-2026", "d-nm-fees-draw-2027", "d-nm-fees-otc-2027"]),
    dict(species="turkey", displayName="Wild turkey", drawSystem="otc", pointsMatter=False,
         drawSystemSummary="Turkey hunting is mainly over the counter (spring and fall). A random draw issues turkey draw permits for special areas (e.g. Carson NF Units 2B/2C, Valles Caldera, Valle Vidal); up to two hunters per application, and permits must be validated with an OTC Turkey License.",
         residentNote="Residents receive a minimum of 84% of draw permits in each hunt.",
         nonresidentNote="Nonresidents may buy OTC Turkey Licenses and apply for turkey draw permits in the 6% (or 10% outfitter) pool.",
         otcSummary="OTC Turkey License (spring and/or fall): spring Apr. 15-May 15 statewide except closed areas (bag two bearded turkeys); fall Sept. 1-30 bow only and Nov. 1-30 shotgun, bow or crossbow (bag any one turkey).",
         keyDates=BT_DATES + HARVEST_REPORT + [OTC_SALE], sourceIds=["d-nm-rib-2026", "d-nm-dates-2026", "d-nm-fees-draw-2027", "d-nm-fees-otc-2027"]),
    dict(species="lion", displayName="Cougar (mountain lion)", drawSystem="otc", pointsMatter=False,
         drawSystemSummary="No draw. Cougar hunting is by OTC Cougar License; each Cougar Management Zone closes when harvest reaches 90% of its total or female limit.",
         residentNote="OTC Cougar License; a cougar identification course is mandatory.",
         nonresidentNote="OTC Cougar License; a cougar identification course is mandatory.",
         otcSummary="OTC Cougar License (must be bought at least two calendar days before hunting). Statewide season April 1, 2026-March 31, 2027; bag limit two cougars.",
         keyDates=[OTC_SALE], sourceIds=["d-nm-rib-2026", "d-nm-dates-2026", "d-nm-fees-otc-2027"]),
    dict(species="moose", displayName="Moose", drawSystem="none", pointsMatter=False,
         drawSystemSummary="New Mexico has no moose hunting season; the 2026-2027 rules booklet lists moose only as an occasional visitor that is protected.",
         keyDates=[], sourceIds=["d-nm-rib-2026"]),
    dict(species="goat", displayName="Mountain goat", drawSystem="none", pointsMatter=False,
         drawSystemSummary="New Mexico offers no mountain goat license or season in the 2026-2027 rules booklet.",
         keyDates=[], sourceIds=["d-nm-rib-2026"]),
]

F = "d-nm-fees-draw-2027"
O = "d-nm-fees-otc-2027"
APPF = "Includes the nonrefundable application fee ($7 resident, $13 nonresident)."
FEES = [
    ("elk", "Standard elk license - A (antlerless)", "resident", 70, F, APPF + " Nonresidents: not issued."),
    ("elk", "Standard elk license - MB (mature bull)", "resident", 100, F, APPF),
    ("elk", "Standard elk license - MB (mature bull)", "nonresident", 773, F, APPF),
    ("elk", "Standard elk license - ES (either sex)", "resident", 100, F, APPF),
    ("elk", "Standard elk license - ES (either sex)", "nonresident", 773, F, APPF),
    ("elk", "Quality or high-demand elk license - MB", "resident", 100, F, APPF),
    ("elk", "Quality or high-demand elk license - MB", "nonresident", 998, F, APPF),
    ("elk", "Quality or high-demand elk license - ES", "resident", 100, F, APPF),
    ("elk", "Quality or high-demand elk license - ES", "nonresident", 998, F, APPF),
    ("elk", "Junior/senior elk license (A, MB or ES)", "resident", 70, F, APPF + " Nonresidents: not issued."),
    ("mule-deer", "Deer license - Standard (S)", "resident", 60, F, APPF),
    ("mule-deer", "Deer license - Standard (S)", "nonresident", 398, F, APPF),
    ("mule-deer", "Deer license - Quality (Q) or High-Demand (HD)", "resident", 60, F, APPF),
    ("mule-deer", "Deer license - Quality (Q) or High-Demand (HD)", "nonresident", 623, F, APPF),
    ("mule-deer", "Deer license - Junior/Senior", "resident", 35, F, APPF + " Nonresidents: not issued."),
    ("mule-deer", "Private-Land Only Deer License - Standard (OTC)", "resident", 53, O, None),
    ("mule-deer", "Private-Land Only Deer License - Standard (OTC)", "nonresident", 385, O, None),
    ("whitetail", "Deer license - Standard (S)", "resident", 60, F, APPF + " Same deer license as mule deer."),
    ("whitetail", "Deer license - Standard (S)", "nonresident", 398, F, APPF + " Same deer license as mule deer."),
    ("whitetail", "Deer license - Quality (Q) or High-Demand (HD)", "resident", 60, F, APPF),
    ("whitetail", "Deer license - Quality (Q) or High-Demand (HD)", "nonresident", 623, F, APPF),
    ("pronghorn", "Pronghorn license", "resident", 70, F, APPF),
    ("pronghorn", "Pronghorn license", "nonresident", 423, F, APPF),
    ("pronghorn", "Private-Land Only Pronghorn License (OTC)", "resident", 63, O, None),
    ("pronghorn", "Private-Land Only Pronghorn License (OTC)", "nonresident", 410, O, None),
    ("sheep", "Bighorn sheep license - Ram", "resident", 160, F, APPF),
    ("sheep", "Bighorn sheep license - Ram", "nonresident", 3523, F, APPF),
    ("sheep", "Bighorn sheep license - Ewe", "resident", 85, F, APPF),
    ("sheep", "Bighorn sheep license - Ewe", "nonresident", 3523, F, APPF),
    ("bear", "Bear permit (draw application fee only)", "resident", 7, F, "Successful applicants must also buy the OTC Bear License."),
    ("bear", "Bear permit (draw application fee only)", "nonresident", 13, F, "Successful applicants must also buy the OTC Bear License."),
    ("bear", "Bear License (OTC)", "resident", 58, O, None),
    ("bear", "Bear License (OTC)", "nonresident", 360, O, None),
    ("turkey", "Turkey permit (draw application fee only)", "resident", 7, F, "Successful applicants must also buy the OTC Turkey License."),
    ("turkey", "Turkey permit (draw application fee only)", "nonresident", 13, F, "Successful applicants must also buy the OTC Turkey License."),
    ("turkey", "Turkey License (Spring and/or Fall Season, OTC)", "resident", 35, O, None),
    ("turkey", "Turkey License (Spring and/or Fall Season, OTC)", "nonresident", 125, O, None),
    ("lion", "Cougar License (OTC)", "resident", 58, O, None),
    ("lion", "Cougar License (OTC)", "nonresident", 360, O, None),
    (None, "Draw application fee (included in each draw license fee)", "resident", 7, F, "Nonrefundable."),
    (None, "Draw application fee (included in each draw license fee)", "nonresident", 13, F, "Nonrefundable."),
    (None, "Game-Hunting License (required to apply for big-game draws)", "resident", 25, O, "Nonrefundable when bought with a draw application."),
    (None, "Game-Hunting License (required to apply for big-game draws)", "nonresident", 90, O, "Nonrefundable when bought with a draw application."),
    (None, "Game-Hunting & Fishing License", "resident", 42, O, "Nonresidents: not issued."),
    (None, "Habitat Management and Access Validation (HMAV)", "resident", 4, O, "Mandatory for hunting, fishing and trapping."),
    (None, "Habitat Management and Access Validation (HMAV)", "nonresident", 4, O, "Mandatory for hunting, fishing and trapping."),
    (None, "Habitat Stamp", "resident", 10, O, "Mandatory for hunting and fishing on USFS or BLM lands."),
    (None, "Habitat Stamp", "nonresident", 10, O, "Mandatory for hunting and fishing on USFS or BLM lands."),
]

SEASONS = [
    dict(species="turkey", label="Youth-only spring OTC turkey hunt (all units open for spring OTC)", start="2026-04-10", end="2026-04-12", year=2026, sourceId="d-nm-rib-2026"),
    dict(species="turkey", label="Spring OTC turkey (statewide except closed areas)", start="2026-04-15", end="2026-05-15", year=2026, note="Bag two bearded turkeys.", sourceId="d-nm-rib-2026"),
    dict(species="turkey", label="Fall OTC turkey - bow only", start="2026-09-01", end="2026-09-30", year=2026, note="Bag any one turkey (fall season total).", sourceId="d-nm-rib-2026"),
    dict(species="turkey", label="Fall OTC turkey - shotgun, bow or crossbow", start="2026-11-01", end="2026-11-30", year=2026, note="Bag any one turkey (fall season total).", sourceId="d-nm-rib-2026"),
    dict(species="lion", label="Statewide cougar season (zones close at 90% of harvest limits)", start="2026-04-01", end="2027-03-31", year=2026, sourceId="d-nm-rib-2026"),
]

OVERVIEW = ("New Mexico's big-game draw is a pure random draw with no preference or bonus points: each application gets a random "
            "sequence number and the system tries the applicant's 1st, 2nd, then 3rd hunt choice (deer and elk applicants may add a "
            "4th-choice quadrant filled in a second drawing). State law sets quotas for each hunt: a minimum of 84% of licenses to "
            "residents, 10% to residents or nonresidents applying with a New Mexico registered outfitter, and 6% to nonresidents "
            "without an outfitter; antlerless elk and WMA-only hunts are 100% resident. For 2026 the big-game application deadline "
            "was March 18 (results April 22) and the bear/turkey draw-permit deadline was February 11 (results February 18). "
            "The agency, formerly the Department of Game and Fish, is now the New Mexico Department of Wildlife (NMDOW).")

COMMON_NOTE = ("Source: NMDOW/NMDGF drawing odds reports (draw years = report years). Each hunt has a choice=first row "
               "(1st-choice applicants and licenses drawn on 1st choice) and a choice=all row (1st+2nd+3rd-choice applicants and "
               "all licenses drawn). resident = resident pool; nonresident = nonresident pool without an outfitter; the outfitter "
               "pool (residents or nonresidents with a NM registered outfitter) is given in each row's note; total = all pools. "
               "total.quota = licenses offered in the hunt. oddsPct is computed (drawn / applicants), not published. No points exist, "
               "so no byPoints/minPoints. Cross-check: for 2023-2026 the agency's separate Summary Report matches the Complete Report's pre-draw counts for every hunt and its pool drawn counts for every hunt except 2023 ANT-3-155 (see pronghorn notes). All-choice odds overstate the real chance because each application can draw only one hunt; "
               "choice=all drawn counts exclude licenses awarded to 4th-choice (any-hunt quadrant) applicants, which are listed in the row note. Season dates (seasonDates/seasonRanges) for the 2026 rows come from the hunt tables of the 2026-2027 Hunting Rules and Information booklet (seasonSourceId d-nm-rib-2026), written by seasons_parse.py.")
SP_NOTES = {
    "elk": "Big-game complete reports 2022-2026. 2024-2026 first-choice total drawn = resident + nonresident + outfitter first-choice drawn (sum of published pool figures). "
           "2022 all-choice applicants = 1st+2nd+3rd (the 2022 report prints no total column). Cross-check: 2022 elk section Totals row matches the sum of hunts in every column "
           "except resident all-choice drawn (hunts sum to 19,853; agency Totals row prints 19,854).",
    "mule-deer": "Deer hunt codes with bag FAD (fork-antlered deer, white-tailed or mule deer), FAMD (fork-antlered mule deer), A (antlerless) or ES are filed here; "
                 "FAD/A/ES hunts are legal for either deer species. White-tailed-only codes (FAWTD, ESWTD) are in whitetail.json. "
                 "2024-2026 first-choice total drawn = sum of published pool figures; 2022 all-choice applicants = 1st+2nd+3rd. "
                 "2022 deer section Totals row matches the hunt sum in every column. 2024 DER-2-152: agency pool-total cells (9/6/10) do not reconcile; pool counts taken from the report's per-pool blocks (see row note). "
                 "Private-land-only hunts often have more licenses than drawn applicants.",
    "whitetail": "Deer hunt codes with bag FAWTD or ESWTD only (mostly Coues white-tailed deer in southwest units). FAD deer hunts, also legal for white-tailed deer, are in mule-deer.json. "
                 "2024-2026 first-choice total drawn = sum of published pool figures.",
    "pronghorn": "Big-game complete reports 2022-2026 (section titled ANTELOPE in 2022). Public draw only; private-land OTC licenses are not in the odds reports. "
                 "2022 pronghorn section Totals row matches the hunt sum in every column. 2023 ANT-3-155: the Summary Report prints 5/1/1 in its RES/NR/OUT columns (these equal the 1st/2nd/3rd-choice drawn counts); "
                 "the Complete Report used here gives pools 6/0/1, which matches the published distribution (85.71/0/14.29%).",
    "sheep": "Four draw hunt codes per year. BHS-1-201 is the Rocky Mountain bighorn ram hunt and BHS-1-204 the desert bighorn ram hunt (as labeled in the 2025 report); "
             "since 2024 their areas are listed as 'TBD by hunt area selected', so units are empty for those rows. "
             "2024 BHS-1-204 has a non-numeric cell ('a') in the nonresident 2nd-choice drawn column; it does not affect any field here. "
             "Auction/raffle sheep licenses are outside the draw and not included.",
    "bear": "Bear draw permits only (special areas); most bear hunting is OTC and not in these reports. 2022 and 2023 report drawn by pool; 2022 also by choice. "
            "2024-2026 reports give drawn by pool only, so choice=first rows have applicants but drawn = null. 2023 data parsed from the PDF report.",
    "turkey": "Turkey draw permits only (special areas); most turkey hunting is OTC and not in these reports. 2024-2026 reports give drawn by pool only "
              "(choice=first drawn = null). 2023 (PDF): pool-level drawn counts omitted because the turkey RES/NR/OUT columns contradict the published distribution %; total drawn kept.",
}


def main():
    repo = sys.argv[1]
    base = os.path.join(repo, "src/data/agency/new-mexico")
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "bear", "turkey"]:
        rows = json.load(open(os.path.join(base, "draw", sp + ".json")))
        yrs = sorted({r["year"] for r in rows})
        per = {y: sum(1 for r in rows if r["year"] == y and r["choice"] == "first") for y in yrs}
        coverage.append(dict(species=sp, years=yrs, notes="Hunt codes per draw year: " + ", ".join(f"{y}: {c}" for y, c in per.items()) + ". " + SP_NOTES[sp] + " " + COMMON_NOTE))
    coverage.append(dict(species="lion", years=[], notes="No draw: cougar is OTC only. Fees and the 2026-27 season are in fees[]/seasons[]."))
    meta = dict(
        slug="new-mexico", name="New Mexico", abbrev="NM",
        agency=dict(name=PUB_NEW, shortName="NMDOW", url="https://wildlife.dgf.nm.gov"),
        unitTerm="GMU", lastReviewed=RET, overview=OVERVIEW, species=SPECIES,
        fees=[dict(species=s, item=i, residency=r, amountUsd=a, licenseYear=2027, sourceId=src, **({"note": n} if n else {}))
              for s, i, r, a, src, n in FEES],
        seasons=SEASONS, coverage=coverage, sources=SOURCES)
    p = os.path.join(base, "draw-meta.json")
    with open(p, "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print("wrote", p)


if __name__ == "__main__":
    main()
