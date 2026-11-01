#!/usr/bin/env python3
"""Write src/data/agency/oregon/draw-meta.json (Oregon draw facts, fees, dates, seasons, sources).

Every fact below was read from the ODFW document named in its sourceId (raw copies in the
agency-raw/oregon/draw directory, fetched by draw_download.py on 2026-10-31). Coverage is
computed from the parsed draw/<species>.json files.

Usage: python -I draw_meta.py <draw_json_dir> <out_path>
"""
import json
import os
import sys

RET = "2026-10-31"
ODFW = "Oregon Department of Fish and Wildlife"
IDX = "https://myodfw.com/articles/point-summary-reports"
B = "https://myodfw.com/sites/default/files/"
O = "https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/reports/docs/"
REGS_PAGE = "https://myodfw.com/articles/oregon-fishing-hunting-regulations-and-updates"
REGS27 = "d-or-news-2027-regs-adopted"
# REGS27 (ODFW news release, Sept. 18, 2026): "The Commission adopted the 2027 Big Game Regulations at their meeting in La Grande
# today ... Printed regulations will be available in late November."
NOTE27 = ("2027 dates not yet published by ODFW as of 2026-10-31. The Commission adopted the 2027 Big Game Regulations on "
          "Sept. 18, 2026; the printed booklet is due in late November 2026.")

# draw report sources (title as linked/printed by ODFW; url = XLSX parsed; PDF used for spot checks)
NAMES = {"buck": "Buck Deer", "elk": "Elk", "pronghorn": "Pronghorn Antelope", "antlerless": "Antlerless Deer",
         "springbear": "Spring Bear", "premium_buck": "Premium Buck Deer", "premium_elk": "Premium Elk",
         "premium_pronghorn": "Premium Pronghorn Antelope", "sheep": "Bighorn Sheep", "goat": "Rocky Mountain Goat"}
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from draw_download import DOCS  # noqa: E402

sources = []
for year, series, kind, xurl, purl in DOCS:
    if kind == "choice" and series in ("buck", "elk", "pronghorn", "antlerless", "springbear"):
        continue  # used only for cross-checks, not cited by any row
    title = f"{year} {NAMES[series]} " + ("Preference Point Draw Report" if kind == "points" else "Applicants by Hunt Choice")
    sources.append({
        "id": f"d-or-{year}-{series}-{kind}", "title": title, "publisher": ODFW, "url": xurl, "pageUrl": IDX,
        "dataYear": year, "retrieved": RET,
        "notes": f"XLSX parsed; PDF version {purl}" + (" (2025 file names as posted: generic names under /2025-11/)" if year == 2025 and kind == "points" else ""),
    })

sources += [
    {"id": "d-or-regs-2026", "title": "2026 Oregon Big Game Hunting Regulations", "publisher": ODFW,
     "url": "https://www.eregulations.com/assets/docs/resources/OR/26ORHD_LR3.pdf", "pageUrl": REGS_PAGE, "dataYear": 2026,
     "retrieved": RET, "notes": "Official booklet PDF hosted on eregulations.com, linked from ODFW's regulations page. Fees p.8-9, draw rules p.12-14, seasons and hunt tables p.30-69."},
    {"id": "d-or-regs-2024", "title": "2024 Oregon Big Game Hunting Regulations", "publisher": ODFW,
     "url": "https://www.eregulations.com/assets/docs/resources/OR/24ORHD_LR.pdf", "pageUrl": REGS_PAGE, "dataYear": 2024,
     "retrieved": RET, "notes": "Archived booklet; used for 2024 hunt names, sheep/goat tag numbers, seasons and '2023 applications' columns."},
    {"id": "d-or-regs-2023", "title": "2023 Oregon Big Game Hunting Regulations", "publisher": ODFW,
     "url": "https://www.eregulations.com/assets/docs/resources/OR/23ORHD_LR4.pdf", "pageUrl": REGS_PAGE, "dataYear": 2023,
     "retrieved": RET, "notes": "Archived booklet; used for 2023 hunt names, sheep/goat tag numbers and seasons."},
    {"id": "d-or-regs-2022", "title": "2022 Oregon Big Game Hunting Regulations", "publisher": ODFW,
     "url": "https://www.eregulations.com/assets/docs/resources/OR/22ORHD_LR6.pdf", "pageUrl": REGS_PAGE, "dataYear": 2022,
     "retrieved": RET, "notes": "Archived booklet; used for 2022 hunt names, sheep/goat tag numbers and seasons."},
    {"id": "d-or-gamebird-2026", "title": "2026-27 Oregon Game Bird Hunting Regulations", "publisher": ODFW,
     "url": "https://www.eregulations.com/oregon/hunting/game-bird/pdf", "pageUrl": REGS_PAGE, "dataYear": 2026,
     "retrieved": RET, "notes": "Turkey tags, fees and seasons (fall 2026-27, spring 2027)."},
    {"id": "d-or-fees", "title": "Oregon Department of Fish and Wildlife Recreational Fee Schedule", "publisher": ODFW,
     "url": "https://myodfw.com/sites/default/files/2025-11/Rec_License_Fee_Schedule.pdf", "dataYear": 2026, "retrieved": RET,
     "notes": "Columns: Current / Effective 2026 / Effective 2028 / Effective 2030; costs include agent fee."},
    {"id": "d-or-how-apply", "title": "How to apply for a controlled hunt", "publisher": ODFW,
     "url": "https://myodfw.com/articles/how-apply-controlled-hunt", "retrieved": RET},
    {"id": "d-or-points", "title": "How to check (and earn) preference points", "publisher": ODFW,
     "url": "https://myodfw.com/articles/how-check-and-earn-preference-points", "retrieved": RET},
    {"id": "d-or-premium", "title": "Premium big game hunts", "publisher": ODFW,
     "url": "https://myodfw.com/articles/premium-big-game-hunts", "retrieved": RET},
    {"id": "d-or-point-summary", "title": "Point summary reports", "publisher": ODFW, "url": IDX, "retrieved": RET,
     "notes": "Index of all draw reports; states Point Savers are available until November 30, 2026."},
    {"id": "d-or-how-read", "title": "How to read a point summary report", "publisher": ODFW,
     "url": "https://myodfw.com/articles/how-read-point-summary-reports", "retrieved": RET,
     "notes": "Defines the report columns: Section A first-choice stats (75% point draw + 25% equal-chance draw); Section B point-class stats for the 75% phase."},
    {"id": REGS27, "title": "Commission adopts 2027 Big Game Regulations, approves cougar target area", "publisher": ODFW,
     "url": "https://myodfw.com/news/commission-adopts-2027-big-game-regulations-approves-cougar-target-area", "dataYear": 2027,
     "retrieved": RET,
     "notes": ("ODFW news release dated Sept. 18, 2026: 2027 Big Game Regulations adopted; printed regulations available in late "
               "November; 2027 western Oregon elk changes (any-legal-weapon coast elk spike-only bag limit moves from the second "
               "to the first period; antlerless elk removed from the General Archery Season Tag bag limit in the West Cascades hunt).")},
    {"id": "d-or-bg-seasons", "title": "2026 big game seasons", "publisher": ODFW,
     "url": "https://myodfw.com/big-game-hunting/seasons", "dataYear": 2026, "retrieved": RET,
     "notes": "General season dates and tag sale deadlines for 2026; used to cross-check the general seasons taken from the 2026 regulations. "
              "States 'apply by February 10 for spring bear, and May 15 for all other big game species' without naming a year."},
    {"id": "d-or-draft-2026-goat", "title": "Proposed 2026 900 Series Rocky Mountain Goat Controlled Tags (DRAFT)", "publisher": ODFW,
     "url": "https://dfw.state.or.us/news/docs/2025/2026%20Rocky%20Mtn%20Goat%20DRAFT.pdf", "dataYear": 2026, "retrieved": RET,
     "notes": "Draft proposal; used only for the name of 2025 hunt 916A (Central Cascades)."},
]

R26 = "d-or-regs-2026"


def kd(label, kind, cycle, src, date=None, start=None, end=None, note=NOTE27, residency=None):
    """kind = KeyDateKind (schema.ts); residency only when ODFW limits the date to one residency (none do)."""
    d = {"label": label, "kind": kind}
    if residency:
        d["residency"] = residency
    d.update({"cycle": cycle, "status": "confirmed", "sourceId": src})
    if date:
        d["date"] = date
    else:
        d["start"], d["end"] = start, end
    if note:
        d["note"] = note
    return d


main_dates = [
    kd("Controlled hunt application deadline (11:59 p.m. PT)", "application", 2026, "d-or-how-apply", date="2026-05-15"),
    kd("Draw results available", "results", 2026, R26, date="2026-06-12"),
    kd("Online application changes allowed through", "application-change", 2026, R26, date="2026-05-25"),
]
point_saver = kd("Point Saver purchase period (after the draw)", "points", 2026, R26, start="2026-07-01", end="2026-11-30",
                 note="ODFW also sells Point Savers Dec. 1 - May 15 (with the draw application). " + NOTE27)
leftover = kd("Leftover controlled tags on sale online (10 a.m. PT)", "leftover", 2026, R26, date="2026-07-01")

NR_DEER_ELK = ("A maximum of 5% of tags in controlled deer, elk and bear hunts can go to nonresidents; nonresidents get no preference "
               "other than their points. Guides and Outfitters Program tags (equal to half the nonresident tags drawn the previous year) reduce "
               "nonresident tags available in the draw. Nonresidents may apply for Premium hunts with equal odds.")
HYBRID = ("Preference-point draw: for each hunt, 75% of tags go to first-choice applicants with the most preference points; the other 25% are "
          "drawn at random among all remaining first-choice applicants. Leftover tags then go to 2nd-5th choices at random (points do not count). "
          "Applicants who do not draw their first choice, or buy a Point Saver, gain one point for the series.")

species = [
    {"species": "elk", "displayName": "Elk", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point", "drawSystemSummary": HYBRID + " Controlled elk is the 200 series.",
     "residentNote": "Residents hold at least 95% of tags in each controlled elk hunt. Drawing a first choice resets points to zero (Pioneer and 65+ resident disabled veteran licensees reset to one).",
     "nonresidentNote": NR_DEER_ELK,
     "otcSummary": "General-season elk tags are sold over the counter: general archery (Aug. 29 - Sept. 27, 2026), West Cascade (Nov. 7-13), Coast 1st (Nov. 14-17) and 2nd (Nov. 21-27) seasons, and the Eastern Oregon Rocky Mountain 2nd season (spike only, listed units, Nov. 7-15). A General Season Antlerless Elk Damage tag is also sold. Premium elk (M series) is a separate random draw for one extra tag per unit. "
                   "For 2027 (adopted Sept. 18, 2026): the any-legal-weapon coast elk spike-only bag limit moves from the second to "
                   "the first period, and antlerless elk are removed from the General Archery Season Tag bag limit in the West Cascades hunt.",
     "keyDates": main_dates + [point_saver, leftover],
     "sourceIds": [R26, "d-or-how-apply", "d-or-points", "d-or-premium", "d-or-how-read", "d-or-bg-seasons"]},
    {"species": "mule-deer", "displayName": "Deer (mule deer; black-tailed deer in western Oregon)", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point", "drawSystemSummary": HYBRID + " Controlled buck deer is the 100 series and antlerless deer the 600 series (separate points for each).",
     "residentNote": "Residents hold at least 95% of tags in each controlled deer hunt. A 600 series antlerless tag can be held in addition to one 100 series (general or controlled) buck tag.",
     "nonresidentNote": NR_DEER_ELK,
     "otcSummary": "Starting in 2026 all Eastern Oregon deer hunting, rifle and archery, is by controlled hunt in Deer Hunt Areas. Over-the-counter general tags remain for Western Oregon (units 10-30): any legal weapon buck season Oct. 3 - Nov. 6, 2026 and general archery from Aug. 29. Premium deer (L series) is a separate random draw.",
     "keyDates": main_dates + [point_saver, leftover],
     "sourceIds": [R26, "d-or-how-apply", "d-or-points", "d-or-premium", "d-or-how-read", "d-or-bg-seasons"]},
    {"species": "whitetail", "displayName": "White-tailed deer", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point", "drawSystemSummary": HYBRID + " White-tailed deer hunts are part of the 100 (buck) and 600 (antlerless) deer series and use the same deer points.",
     "residentNote": "Same deer series rules as other controlled deer hunts.",
     "nonresidentNote": NR_DEER_ELK,
     "otcSummary": "No over-the-counter whitetail-specific tag. White-tailed deer are illegal to harvest in all Western Oregon units except Melrose Unit (23) controlled hunts that list white-tailed deer in the bag limit; Eastern Oregon whitetail hunts are controlled.",
     "keyDates": main_dates + [point_saver, leftover],
     "sourceIds": [R26, "d-or-how-apply", "d-or-points"]},
    {"species": "pronghorn", "displayName": "Pronghorn antelope", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point", "drawSystemSummary": HYBRID + " Controlled pronghorn is the 400 series; one controlled pronghorn tag per person per year through the draw.",
     "residentNote": "Residents hold at least 97% of tags in each controlled pronghorn hunt.",
     "nonresidentNote": "A maximum of 3% of pronghorn tags can go to nonresidents. Nonresidents may apply for Premium pronghorn (N series) with equal odds.",
     "otcSummary": "None. All pronghorn hunting is by controlled hunt; Premium pronghorn (N series) is a separate random draw.",
     "keyDates": main_dates + [point_saver, leftover],
     "sourceIds": [R26, "d-or-how-apply", "d-or-points", "d-or-premium"]},
    {"species": "bear", "displayName": "Black bear", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point", "drawSystemSummary": "Spring black bear (700 series) is a preference-point draw: 75% of tags to first-choice applicants with the most points, 25% at random among the rest of the first-choice applicants. Fall bear is a general season with over-the-counter tags.",
     "residentNote": "A hunter may hold one Controlled Spring Bear tag, one General Season Fall tag and one Additional Fall tag per year.",
     "nonresidentNote": "A maximum of 5% of controlled bear tags can go to nonresidents. Bear tags cost the same for nonresidents ($16.50).",
     "otcSummary": "General Season Fall Black Bear tag and an Additional Fall tag are sold over the counter; statewide season Aug. 1 - Dec. 31, 2026 (tag sale deadline Oct. 2).",
     "keyDates": [
         kd("Spring bear controlled hunt application deadline", "application", 2026, R26, date="2026-02-10"),
         kd("Spring bear draw results available", "results", 2026, R26, date="2026-02-20"),
         kd("Leftover spring bear tags on sale online (10 a.m. PT)", "leftover", 2026, R26, date="2026-03-15"),
         kd("Spring bear controlled tag sale deadline", "payment", 2026, R26, date="2026-03-31"),
         point_saver,
         kd("General season fall bear tag sale deadline", "other", 2026, R26, date="2026-10-02", note=None),
     ],
     "sourceIds": [R26, "d-or-how-apply", "d-or-points", "d-or-how-read", "d-or-bg-seasons"]},
    {"species": "sheep", "displayName": "Bighorn sheep (California & Rocky Mountain)", "drawSystem": "random", "pointsMatter": False,
     "drawSystemSummary": "500 series: random draw with no preference points. A person may draw only one controlled bighorn ram tag in a lifetime (ewe hunts excluded). No party applications.",
     "residentNote": "Residents receive 90-95% of bighorn tags.",
     "nonresidentNote": "No less than 5% and no more than 10% of all bighorn sheep tags go to nonresidents; most individual hunts have no nonresident tag (see each hunt's tag numbers).",
     "otcSummary": "None. Auction and raffle tags are sold separately (not part of the draw).",
     "keyDates": main_dates,
     "sourceIds": [R26, "d-or-how-apply"]},
    {"species": "goat", "displayName": "Rocky Mountain goat", "drawSystem": "random", "pointsMatter": False,
     "drawSystemSummary": "900 series: random draw with no preference points. Once-in-a-lifetime tag; online orientation required; no party applications.",
     "residentNote": "Residents receive 90-95% of mountain goat tags.",
     "nonresidentNote": "No less than 5% and no more than 10% of all Rocky Mountain goat tags go to nonresidents; most individual hunts have no nonresident tag.",
     "otcSummary": "None. Auction and raffle tags are sold separately.",
     "keyDates": main_dates,
     "sourceIds": [R26, "d-or-how-apply"]},
    {"species": "lion", "displayName": "Cougar", "drawSystem": "otc", "pointsMatter": False,
     "drawSystemSummary": "No draw. General Season Cougar tags (and one Additional tag) are sold over the counter; the statewide season runs all year and zones close if their mortality quota is reached.",
     "residentNote": "Resident cougar tag $16.50.",
     "nonresidentNote": "Nonresident cougar tag $16.50 (same price as residents).",
     "otcSummary": "General season tag + Additional tag, statewide Jan. 1 - Dec. 31, 2026; general tag sale deadline Oct. 2. Using dogs is prohibited. 2026 zone quotas total 970 (A 180, B 200, C 80, D 100, E 270, F 140).",
     "keyDates": [kd("General season cougar tag sale deadline", "other", 2026, R26, date="2026-10-02", note=None)],
     "sourceIds": [R26, "d-or-bg-seasons"]},
    {"species": "turkey", "displayName": "Wild turkey", "drawSystem": "otc", "pointsMatter": False,
     "drawSystemSummary": "No draw. Spring and fall turkey tags and beardless turkey permits are sold over the counter.",
     "residentNote": "Resident turkey tag $26.50; youth turkey tag $10.50.",
     "nonresidentNote": "Nonresident turkey tag $90.00.",
     "otcSummary": "Spring 2027 season Apr. 15 - May 31 statewide (up to three spring tags, one bearded turkey each). Fall 2026-27 seasons in listed WMUs (up to two fall tags, only one usable in eastern Oregon units).",
     "keyDates": [],
     "sourceIds": ["d-or-gamebird-2026"]},
]

# the 2027-status note in keyDates cites the adoption release
for _s in species:
    if any(NOTE27 in (d.get("note") or "") for d in _s["keyDates"]) or _s["species"] == "elk":
        _s["sourceIds"].append(REGS27)


def fee(sp, item, res, amt, note=None, src=R26, year=2026):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": year, "sourceId": src}
    if note:
        f["note"] = note
    return f


FN = "Matches the 'Effective 2026' column of ODFW's fee schedule (d-or-fees), whose next change is effective 2028."
fees = [
    fee(None, "Hunting license", "resident", 39.00, FN),
    fee(None, "Hunting license", "nonresident", 193.00, FN),
    fee(None, "Sports Pac (hunting/angling/shellfish licenses + deer, elk, cougar, bear and turkey tags)", "resident", 253.00, FN),
    fee(None, "Controlled Hunt Application - Big Game (per series; also Premium hunts)", "resident", 10.00, FN),
    fee(None, "Controlled Hunt Application - Big Game (per series; also Premium hunts)", "nonresident", 10.00, FN),
    fee("mule-deer", "Deer tag", "resident", 33.00, FN),
    fee("mule-deer", "Deer tag", "nonresident", 500.00, FN),
    fee("whitetail", "Deer tag", "resident", 33.00, FN),
    fee("whitetail", "Deer tag", "nonresident", 500.00, FN),
    fee("elk", "Elk tag", "resident", 56.00, FN),
    fee("elk", "Elk tag", "nonresident", 660.00, FN),
    fee("pronghorn", "Pronghorn Antelope tag", "resident", 58.00, FN),
    fee("pronghorn", "Pronghorn Antelope tag", "nonresident", 443.00, FN),
    fee("sheep", "Bighorn Sheep tag", "resident", 159.00, FN),
    fee("sheep", "Bighorn Sheep tag", "nonresident", 1695.00, FN),
    fee("goat", "Rocky Mountain Goat tag", "resident", 159.00, FN),
    fee("goat", "Rocky Mountain Goat tag", "nonresident", 1695.00, FN),
    fee("bear", "Black Bear tag (also Additional Bear tag)", "resident", 16.50, FN),
    fee("bear", "Black Bear tag (also Additional Bear tag)", "nonresident", 16.50, FN),
    fee("lion", "Cougar tag (also Additional Cougar tag)", "resident", 16.50, FN),
    fee("lion", "Cougar tag (also Additional Cougar tag)", "nonresident", 16.50, FN),
    fee("turkey", "Turkey tag (spring or fall)", "resident", 26.50, "2026-27 game bird season.", "d-or-gamebird-2026"),
    fee("turkey", "Turkey tag (spring or fall)", "nonresident", 90.00, "2026-27 game bird season.", "d-or-gamebird-2026"),
]


def season(sp, label, start, end, year=2026, note=None, src=R26, method=None, units=None, hunt_codes=None):
    """SeasonDate (schema.ts). units/hunt_codes only when the season is limited to them, as ODFW writes them."""
    s = {"species": sp, "label": label}
    if method:
        s["method"] = method
    if units:
        s["units"] = list(units)
    if hunt_codes:
        s["huntCodes"] = list(hunt_codes)
    s.update({"start": start, "end": end, "year": year, "sourceId": src})
    if note:
        s["note"] = note
    return s


def U(*xs):
    """Unit list from ints/strings; (a, b) tuples expand ODFW ranges such as 'Units 40-45'. Western Oregon has no unit 13."""
    out = []
    for x in xs:
        if isinstance(x, tuple):
            out += [str(n) for n in range(x[0], x[1] + 1) if n != 13]
        else:
            out.append(str(x))
    return out


WEST = U((10, 30))  # "Units 10 - 30" (2026 regs p.30): the 20 western Oregon WMUs
GB = "d-or-gamebird-2026"
# 2026 Oregon Big Game Hunting Regulations (R26): deer general seasons p.30-33, elk general seasons p.45-48,
# cougar p.64, black bear p.65-66. Eastern Oregon deer (rifle and archery) has no general season in 2026: it is
# entirely controlled hunts by Deer Hunt Area (p.30, p.33). Pronghorn, bighorn sheep and Rocky Mountain goat are
# controlled hunts only: their dates are per hunt (draw rows' seasonRanges). Cross-checked with ODFW's
# "2026 big game seasons" page (myodfw.com/big-game-hunting/seasons).
seasons = [
    # ---- elk
    season("elk", "General archery elk, Western Oregon", "2026-08-29", "2026-09-27", method="archery", units=WEST,
           note="General Archery Season Tag. Bag limit varies by unit: one elk (15, 20, 23, 25, 28); one bull (11, 12, 14, 17, 18, 27); "
                "one bull except one elk outside USFS lands (16, 19, 21, 22, 29, 30); one 3 pt.+ bull (10, 24); one spike (26)."),
    season("elk", "General archery elk, Eastern Oregon (listed units)", "2026-08-29", "2026-09-27", method="archery",
           units=U((31, 35), 38, 39, (40, 45), "51 (southern portion, S Sumpter)", 64, "65 (eastern portion, east Beulah)",
                   "66 (southern portion, S Malheur Rvr)", (67, 71), (73, 76), "77"),
           note="General Archery Season Tag. One elk in 35, 38, 40-45, S Sumpter, 64, east Beulah, S Malheur Rvr, 67-71, 73 and Unit 77 east of "
                "Hwy 97; one bull in 31-34, 39, 74, 75, 76 and Unit 77 west of Hwy 97. Other eastern units are controlled-only for archery elk."),
    season("elk", "General West Cascade elk (any legal weapon, one bull)", "2026-11-07", "2026-11-13", method="all",
           units=U(16, 19, 21, 22, 29, 30)),
    season("elk", "General Western Oregon Coast elk 1st season", "2026-11-14", "2026-11-17", method="all",
           units=U(11, 12, 14, 15, 17, 18, 20, 23, 28), note="One bull elk."),
    season("elk", "General Western Oregon Coast elk 2nd season", "2026-11-21", "2026-11-27", method="all",
           units=U(11, 12, 14, 15, 17, 18, 20, 23, 28), note="One bull elk in units 11, 15, 17, 18, 23 and 28; one spike elk in units 12, 14 and 20."),
    season("elk", "General Eastern Oregon Rocky Mountain elk 2nd season (spike only)", "2026-11-07", "2026-11-15", method="all",
           units=U(49, 50, 52, 53, 61, 62, 63, "48 (north and west of N Fork John Day Rvr)",
                   "51 (north of Hwy 245 and Burnt Rvr Canyon Rd between Unity and Durkee)"),
           note="One spike elk."),
    season("elk", "General season antlerless elk damage hunts", "2026-08-01", "2027-03-31", method="all",
           note="General Season Antlerless Elk Damage Tag (over the counter), one antlerless elk: all of units 15, 23, 40, 43 and 44 and mapped "
                "portions of other units (regs p.48, boundaries p.96-97). Some mapped portions close Nov. 30."),
    season("elk", "Premium elk hunts (M series)", "2026-08-01", "2026-11-30", method="all",
           note="One tag per hunt, any legal weapon; units per hunt (draw rows)."),
    # ---- deer (mule deer / black-tailed deer)
    season("mule-deer", "Western Oregon general buck deer, any legal weapon", "2026-10-03", "2026-11-06", method="all", units=WEST,
           note="General Any Legal Weapon Western Oregon Tag, one buck with visible antler (black-tailed deer)."),
    season("mule-deer", "Western Oregon general buck deer, youth extension (ages 12-17)", "2026-11-07", "2026-11-08", method="all", units=WEST,
           note="Youth 12-17 with an unfilled General Any Legal Weapon Western Oregon tag or W. High Cascade (119A) tag; tag sale deadline Oct. 2, 2026."),
    season("mule-deer", "Western Oregon general archery deer", "2026-08-29", "2026-09-27", method="archery", units=WEST,
           note="General Archery Season Western Oregon Deer Tag; bag limit one buck or one deer depending on unit. Eastern Oregon deer archery is controlled only."),
    season("mule-deer", "Western Oregon general archery deer, late period (Nov. 14 - Dec. 6)", "2026-11-14", "2026-12-06", method="archery",
           units=U(23, 25, 26, 29, 30), note="Unit 26 late period is traditional archery equipment only. One deer in Unit 23; one buck with visible antler in 25, 26, 29, 30."),
    season("mule-deer", "Western Oregon general archery deer, late period (Nov. 21 - Dec. 13)", "2026-11-21", "2026-12-13", method="archery",
           units=U(10, 15, 16, 17, 18, 19, 20, "21 (northern portion, outside South Indigo)"),
           note="One buck with visible antler in units 10, 17, 18, 20; one deer in 15, 16, 19 and northern Unit 21."),
    season("mule-deer", "Premium deer hunts (L series)", "2026-08-01", "2026-11-30", method="all",
           note="One tag per hunt, any legal weapon; units per hunt (draw rows)."),
    # ---- pronghorn (controlled only)
    season("pronghorn", "Premium pronghorn hunts (N series)", "2026-08-01", "2026-11-30", method="all",
           note="One tag per hunt, any legal weapon. All other pronghorn hunting is 400 series controlled hunts with per-hunt dates."),
    # ---- black bear
    season("bear", "Controlled spring black bear (700 series)", "2026-04-01", "2026-05-31", method="all",
           note="All 2026 700 series hunts (adult and youth) print Apr. 1 - May 31; tag sale deadline March 31."),
    season("bear", "General fall black bear (statewide)", "2026-08-01", "2026-12-31",
           note="General Season Fall Tag and Additional General Season Fall Tag; tag sale deadline Oct. 2."),
    # ---- cougar
    season("lion", "General cougar season (statewide)", "2026-01-01", "2026-12-31", note="Zones close when their mortality quota is reached."),
    # ---- turkey (2026-27 Game Bird Regulations)
    season("turkey", "Fall wild turkey, WMUs 14-30", "2026-09-01", "2027-01-31", src=GB, units=U((14, 30)), note="Two turkeys of either sex."),
    season("turkey", "Fall wild turkey, eastern Oregon (Oct. 10 opener)", "2026-10-10", "2027-01-31", src=GB,
           units=U(36, "37 (west of FR 12 and south of the northern Ochoco NF boundary)", 38, 40, 43, 44, "45 (north of Wheeler Co line)",
                   "48 (north of Grant Co line)", 49, (51, 64), "65 (east of the western Malheur NF boundary)", 66, 67, 69, 71, 72),
           note="Printed 'Oct. 10 - Nov. 30 and Dec. 1 - Jan. 31, 2027'; Dec. 1 - Jan. 31 on private lands by permission only. One turkey of either sex."),
    season("turkey", "Fall wild turkey, eastern Oregon (Sept. 1 opener)", "2026-09-01", "2027-01-31", src=GB,
           units=U("37 (east of FR 12 and north of the northern Ochoco NF boundary)", "45 (south of Wheeler Co line)", 46, 47,
                   "48 (south of Grant Co line)", 50, "65 (west of the western Malheur NF boundary)"),
           note="Printed 'Sept. 1 - Nov. 30 and Dec. 1 - Jan. 31, 2027'; Dec. 1 - Jan. 31 on private lands by permission only. One turkey of either sex."),
    season("turkey", "Beardless wild turkey permit season (private lands, listed units)", "2026-10-01", "2027-02-28", src=GB,
           note="Beardless Turkey Permit: 3 hen turkeys per permit, up to 3 permits; private lands in WMUs 37 (part), 45 (part), 46, 47, 48 (part), 50, "
                "65 (part), and private lands excluding private industrial forestland in Marion, Polk, Yamhill, Benton, Linn and eastern Lane Cos "
                "(WMUs 14-21) and WMUs 23, 28, 29 (part) and 30."),
    season("turkey", "Spring wild turkey (statewide)", "2027-04-15", "2027-05-31", year=2027, src=GB,
           note="Up to three 2027 spring tags; one male turkey or turkey with a visible beard per tag."),
    season("turkey", "Youth spring wild turkey (statewide)", "2027-04-10", "2027-04-11", year=2027, src=GB,
           note="Printed 'Apr. 10 - 11 and Apr. 15 - May 31, 2027' for Youth Spring; an adult 21+ who may not hunt must accompany the youth."),
]


def coverage(draw_dir):
    notes = {
        "elk": "200 series controlled elk (Preference Point Draw Report, first choice, resident/nonresident, by point class) plus Premium elk M series (first-choice applicants only).",
        "mule-deer": "100 series buck deer and 600 series antlerless deer hunts that are not white-tailed-deer-only (by hunt name or regulations bag limit), plus Premium deer L series (first-choice applicants only). Includes western Oregon black-tailed deer hunts. Buck hunt 158 (2022-2024): ODFW's point-class table double-counts applicants, so point rows are omitted.",
        "whitetail": "White-tailed-deer-only controlled hunts: hunts ODFW names 'Whitetail' plus hunts whose regulations bag limit is white-tailed deer only (e.g. 151M Baker Muzzleloader, 152M Grande Ronde Muzzleloader, 157A Lower Wallowa Valley, 649B, 657A Flora, 660A Upper Wallowa Valley; 10 hunts in 2022-2023, 11 in 2024-2025, 29 in 2026 after the switch to Eastern Oregon Deer Hunt Areas). 2025 hunts are classified from the 2024 regulations when the 2025 report lists the same code and name, because the 2025 booklet was not retrieved.",
        "pronghorn": "400 series controlled pronghorn plus Premium pronghorn N series (first-choice applicants only). 2026 hunt 470C prints 0 nonresident applicants with 1 nonresident drawn; that count is left blank.",
        "bear": "700 series controlled spring bear only (fall bear is general season).",
        "sheep": "500 series. ODFW publishes only first-choice applicant totals (no drawn counts). Resident/nonresident tag numbers come from the 2022, 2023, 2024 and 2026 regulations; the 2025 booklet was not retrieved, so 2025 tag numbers are missing. Resident/nonresident first-choice applicants exist for 2023 and 2025 only (from the next year's booklet).",
        "goat": "900 series; same limitations as sheep.",
    }
    cov = []
    for sp in ("elk", "mule-deer", "whitetail", "pronghorn", "bear", "sheep", "goat"):
        rows = json.load(open(os.path.join(draw_dir, f"{sp}.json")))
        cov.append({"species": sp, "years": sorted({r["year"] for r in rows}), "notes": notes[sp]})
    cov.append({"species": "lion", "years": [], "notes": "No draw: cougar tags are over the counter."})
    cov.append({"species": "turkey", "years": [], "notes": "No draw: turkey tags are over the counter."})
    return cov


def main():
    draw_dir, out = sys.argv[1], sys.argv[2]
    meta = {
        "slug": "oregon", "name": "Oregon", "abbrev": "OR",
        "agency": {"name": ODFW, "shortName": "ODFW", "url": "https://myodfw.com"},
        "unitTerm": "WMU",
        "lastReviewed": RET,
        "overview": ("Oregon's controlled hunts for deer, elk, pronghorn and spring bear use preference points: 75% of each hunt's tags go to "
                     "first-choice applicants with the most points and 25% are drawn at random among all other first-choice applicants, so "
                     "everyone has some chance. Bighorn sheep, Rocky Mountain goat and Premium hunts are pure random draws with no points. "
                     "Applications (up to five choices per series, $10 per series) are due May 15 (Feb. 10 for spring bear), with results by June 12 "
                     "(Feb. 20 for spring bear). Nonresidents can receive at most 5% of tags in deer, elk and bear hunts, 3% in pronghorn hunts and "
                     "5-10% of sheep and goat tags; starting in 2026, Eastern Oregon deer hunts are organized by Deer Hunt Areas instead of WMUs."),
        "species": species, "fees": fees, "seasons": seasons, "coverage": coverage(draw_dir), "sources": sources,
    }
    with open(out, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    print("wrote", out, len(sources), "sources")


if __name__ == "__main__":
    main()
