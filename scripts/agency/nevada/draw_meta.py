#!/usr/bin/env python3
"""Write src/data/agency/nevada/draw-meta.json (state facts, fees, dates, coverage, sources).

Usage: python -I scripts/agency/nevada/draw_meta.py <raw_dir> <repo_root>

Run after draw_parse.py (which writes <raw_dir>/draw_sources.json and the draw/<species>.json files),
then run seasons_parse.py (which writes draw-meta.seasons[] and the draw rows' seasonRanges).
Every fact below was read from the NDOW / Nevada documents listed in DOC_SOURCES on 2026-10-31.
Each key date carries `kind` (schema KeyDateKind) and `residency` when NDOW limits it to one residency.
draw-meta.seasons[] is owned by seasons_parse.py: this script keeps the seasons already in draw-meta.json
(falling back to SEASONS only when the file has none), so re-running it does not undo seasons_parse.py.
"""
import json
import os
import sys

R = "2026-10-31"
U = "https://www.ndow.org/wp-content/uploads/"
NDOW = "Nevada Department of Wildlife"

DOC_SOURCES = [
    {"id": "d-ndow-apply-hunting", "title": "Apply & Buy - Nevada Hunting (license fees, tag costs, application fees, 2026 Big Game Application Calendar, draw process)",
     "publisher": NDOW, "url": "https://www.ndow.org/apply-buy/apply-buy-hunting/", "dataYear": 2026, "retrieved": R},
    {"id": "d-faq-2026", "title": "Nevada Big Game Draws Frequently Asked Questions (Updated for the 2026 App Season - 2/3/2026)",
     "publisher": NDOW, "url": U + "2026/03/2026-Big-Game-Application-FAQ.pdf", "pageUrl": "https://www.ndow.org/apply-buy/apply-buy-hunting/", "dataYear": 2026, "retrieved": R},
    {"id": "d-cr-26-01-a1", "title": "CR 26-01 Amendment #1 2026 Application Deadlines & Draw Result Dates; 2027 Spring Turkey Application Deadline & Draw Result Dates",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2026/08/CR-26-01-A-1-2026-2027-Application-Deadlines-Draw-Result-Dates.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-cr-25-01-a1", "title": "CR 25-01 Amendment #1 2025 Application Deadlines & Draw Result Dates and 2026 Spring Turkey Application Deadline & Draw Result Dates (NBWC approved June 2025)",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2025/08/CR25-01-Amendment-1-2025-Application-Deadlines-Draw-Result-and-2026-Spring-Turkey-NBWC-Approved-JUNE-2025-FINAL.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-nac-502", "title": "NAC Chapter 502 - Wildlife: Licenses, Tags and Permits (NAC 502.331 application fees; 502.4187-502.4189 bonus points)",
     "publisher": "Nevada Legislature (Legislative Counsel Bureau)", "url": "https://www.leg.state.nv.us/nac/nac-502.html", "retrieved": R},
    {"id": "d-cr-26-11", "title": "CR 26-11 2026-2027 Big Game Quotas (NBWC approved May 2026)",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2026/08/CR-26-11-2026-2027-Big-Game-Quota-NBWC-Approved-May-2026.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-cr-26-12", "title": "CR 26-12 2026 Black Bear Quotas and Harvest Limits (NBWC approved May 2026)",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2026/08/CR-26-12-2026-Black-Bear-Seasons-and-Quotas-NBWC-Approved-May-2026.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-cr-26-08", "title": "CR 26-08 2026-2027 Mountain Lion Season - Open Management Units and Harvest Limits (NBWC approved January 2026)",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2026/01/CR-26-08-2026-2027-Mountain-Lion-Seasons-2026-NBWC-Approved-January-2026.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-cr-26-09", "title": "CR 26-09 2026-2027 Restricted Nonresident Guided Antlered Mule Deer Seasons and Quota - hunt 1235 (NBWC approved January 2026)",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2026/01/CR-26-09-2026-2027-NR-Guided-Seasons-and-Quotas-NBWC-Approved-January-2026.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-cr-26-13", "title": "CR 26-13 2026-2027 and 2027-2028 Upland Game, Rabbits, Wild Turkey and Furbearer Seasons and Limits (NBWC approved June 2026)",
     "publisher": "Nevada Board of Wildlife Commissioners / " + NDOW, "url": U + "2026/07/CR26-13-Upland-Furbearer-Seasons.pdf", "dataYear": 2026, "retrieved": R,
     "notes": "Wild turkey seasons: fall 2026 and 2027, spring 2027 and 2028. Approved by the Commission on June 2026 (approved June 2026 minutes: " + U + "2026/08/June-2026-NBWC-Minutes-Approved.pdf)."},
    {"id": "d-cr-22-11", "title": "CR 22-11 2022-2023 Big Game Quotas (updated) - hunt numbers and approved quotas", "publisher": NDOW,
     "url": U + "2022/05/CR-22-11-2022-2023-Big-Game-Quotas-Updated.pdf", "dataYear": 2022, "retrieved": R},
    {"id": "d-cr-23-14", "title": "CR 23-14 2023 Big Game Quotas (approved) - hunt numbers and approved quotas", "publisher": NDOW,
     "url": U + "2023/05/2023-Big-Game-Quotas-CR-23-14-Approved-ADA-2.pdf", "dataYear": 2023, "retrieved": R,
     "notes": "Prints hunt 1331/1332 over the mule deer archery and muzzleloader tables; other years use 1341/1342 and 1371/1372."},
    {"id": "d-cr-24-12", "title": "CR 24-12 2024 Big Game Quotas (Commission approved) - hunt numbers and approved quotas", "publisher": NDOW,
     "url": U + "2024/05/2024-CR-24-12-BIG-GAME-QUOTAS-COMMISSION-APPROVED-FINAL.pdf", "dataYear": 2024, "retrieved": R},
    {"id": "d-cr-25-13", "title": "CR 25-13 2025 Big Game Quotas (NBWC approved May 2025) - hunt numbers and approved quotas", "publisher": NDOW,
     "url": U + "2025/08/CR25-13-2025-Big-Game-Quotas-NBWC-Approved-May-2025-FINAL.pdf", "dataYear": 2025, "retrieved": R},
    {"id": "d-cr-nr-guided", "title": "Restricted Nonresident Guided Mule Deer Seasons and Quotas (CR 21-06, CR 23-07, CR 24-09, CR 25-10) - hunt 1235",
     "publisher": NDOW, "url": U + "2025/07/CR-25-10-2025-2026-Restricted-Nonresident-Guided-Mule-Deer-Seasons-Quotas-FINAL.pdf", "dataYear": 2025, "retrieved": R,
     "notes": "Earlier years: " + U + "2025/08/CR-24-09-2024-25-NR-Guided-Seasons-and-Quotas-FINAL.pdf ; " + U + "2023/02/CR-23-07-FINAL-2023-24-NR-Guided-Seasons-and-Quotas.pdf ; "
              + U + "2021/12/CR-21-06-2021-22-and-2022-23-NR-Guided-Seasons-and-Quotas-ADA-FINAL1.pdf"},
]

NOT_2027 = ("2027 big game dates not yet published by NDOW as of 2026-10-31 (no 2027 application-deadline Commission regulation; "
            "the Apply & Buy page still shows the 2026 Big Game Application Calendar); these are the 2026 dates.")
POINT_FACT_IDS = ["d-faq-2026", "d-nac-502", "d-ndow-apply-hunting"]


def big_game_dates(include_guided=False):
    d = [
        {"label": "Big Game Main Draw application period (deadline 11:00 pm PT)", "kind": "application", "start": "2026-03-23", "end": "2026-05-13", "cycle": 2026,
         "status": "confirmed", "note": NOT_2027, "sourceId": "d-ndow-apply-hunting"},
        {"label": "Big Game Main Draw results posted on or before", "kind": "results", "date": "2026-05-29", "cycle": 2026, "status": "confirmed", "note": NOT_2027, "sourceId": "d-cr-26-01-a1"},
        {"label": "Bonus point only applications (sold during the standard big game application periods)", "kind": "points", "start": "2026-03-23", "end": "2026-05-13", "cycle": 2026,
         "status": "confirmed", "note": "CR 26-01 A-1: bonus points for big game can be purchased during any standard big game application period. NDOW's 2026 Big Game FAQ adds that bonus points are offered again in the second draw, only to applicants who did not apply and earn a point or draw a tag in the main draw. " + NOT_2027,
         "sourceId": "d-cr-26-01-a1"},
        {"label": "Big Game Second Draw application period", "kind": "leftover", "start": "2026-06-08", "end": "2026-06-15", "cycle": 2026, "status": "confirmed",
         "note": "Dates from NDOW's 2026 Big Game Application Calendar; CR 26-01 A-1 text reads 'Monday, June 16, 2026' (June 15, 2026 is the Monday). " + NOT_2027,
         "sourceId": "d-ndow-apply-hunting"},
        {"label": "Big Game Second Draw results released on or before", "kind": "results", "date": "2026-06-26", "cycle": 2026, "status": "confirmed", "note": NOT_2027, "sourceId": "d-cr-26-01-a1"},
    ]
    d.append({"label": "Big game harvest questionnaire due (5:00 pm PT) for 2026 tags", "kind": "other", "date": "2027-01-31", "cycle": 2026, "status": "confirmed",
              "note": ("CR 26-01 A-1 / NAC 502.405: every 2026 big game tag holder must submit the online harvest questionnaire, hunted or not, by "
                       "January 31 following the close of the season; hunts that end on or after January 31 are due February 28 instead."),
              "sourceId": "d-cr-26-01-a1"})
    if include_guided:
        d = [
            {"label": "Restricted Nonresident Guided Mule Deer Hunt application period", "kind": "application", "residency": "nonresident", "start": "2026-02-09", "end": "2026-03-09", "cycle": 2026,
             "status": "confirmed", "note": NOT_2027, "sourceId": "d-ndow-apply-hunting"},
            {"label": "Restricted Nonresident Guided Mule Deer Hunt results released on or before", "kind": "results", "residency": "nonresident", "date": "2026-03-20", "cycle": 2026, "status": "confirmed",
             "note": NOT_2027, "sourceId": "d-cr-26-01-a1"},
        ] + d
    return d


SQUARED = ("Nevada's draw gives each applicant one draw number for the application plus bonus points squared (BP² + 1 chances); "
           "the lowest random number assigned is the one used, and tags are awarded from the lowest number up. ")
POINT_RULES = ("One bonus point per species category per license year is earned by an unsuccessful application or a bonus-point-only application "
               "with an active hunting or combination license; points are lost on drawing a tag or after 2 consecutive years without applying.")


def species():
    common_ids = ["d-faq-2026", "d-nac-502", "d-ndow-apply-hunting", "d-cr-26-01-a1"]
    return [
        {"species": "mule-deer", "displayName": "Mule deer", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Antlered mule deer tags are drawn by hunt number and unit group (up to 5 choices); junior hunts are drawn before general antlered tags.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "Resident hunts: 1331 (any legal weapon), 1341 (archery), 1371 (muzzleloader), junior hunts 1105/1106/1107. No waiting period for mule deer.",
         "nonresidentNote": "Nonresident hunts 1332, 1342, 1372 in the main draw, plus the separate Restricted Nonresident Guided Mule Deer Hunt (1235, must hunt with a licensed guide) drawn in March. Resident/nonresident quotas are set at about 90%/10% (Commission Policy 24, per NDOW FAQ).",
         "otcSummary": "No over-the-counter tags; leftover tags from the second draw may be sold First-Come, First-Served from about early-mid July.",
         "keyDates": big_game_dates(include_guided=True), "sourceIds": common_ids + ["d-cr-25-13", "d-cr-nr-guided", "d-cr-26-09", "d-cr-26-11"]},
        {"species": "elk", "displayName": "Rocky Mountain elk", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Elk has separate bonus point categories for antlered, antlerless and spike elk; elk depredation hunts do not award bonus points.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "Resident hunts: antlered 4151/4161/4156, antlerless 4181/4111/4176, spike 4651, depredation 4102/4107. 7-year waiting period after drawing elk.",
         "nonresidentNote": "Nonresident hunts: antlered 4251/4261/4256, antlerless 4281/4211/4276. Spike and depredation hunts are resident-only.",
         "otcSummary": "No over-the-counter elk tags; leftover tags may be offered in the second draw and then First-Come, First-Served.",
         "keyDates": big_game_dates(), "sourceIds": common_ids + ["d-cr-25-13"]},
        {"species": "pronghorn", "displayName": "Pronghorn antelope", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Separate bonus point categories for horns longer than ears and horns shorter than ears.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "Resident hunts: horns longer than ears 2151/2161/2171, horns shorter than ears 2181, junior horns shorter than ears 2191. 3-year waiting period after drawing antelope.",
         "nonresidentNote": "Nonresident hunts: horns longer than ears 2251/2261/2271.",
         "otcSummary": "No over-the-counter antelope tags.", "keyDates": big_game_dates(), "sourceIds": common_ids + ["d-cr-25-13"]},
        {"species": "sheep", "displayName": "Bighorn sheep (Nelson desert, California, Rocky Mountain)", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Ram points are kept separately for Nelson (desert), California and Rocky Mountain bighorn; management ram hunts (3171 one-horn, 3172) do not use or award bonus points.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "Resident hunts: desert any ram 3151 (ALW) and 3161 (archery), desert ewe 3181, California ram 8151, Rocky Mountain ram 9151, management rams 3171/3172. 10-year waiting period for rams, 2 years for ewes; management ram tags carry a lifetime wait.",
         "nonresidentNote": "Nonresident hunts: desert any ram 3251, desert ewe 3281, California ram 8251. No nonresident Rocky Mountain bighorn hunt in the 2022-2026 quota regulations.",
         "otcSummary": "No over-the-counter sheep tags.", "keyDates": big_game_dates(), "sourceIds": common_ids + ["d-cr-25-13"]},
        {"species": "goat", "displayName": "Mountain goat", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Mountain goat tags (any goat) are drawn by unit group.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "Resident hunt 7151. 10-year waiting period after drawing.", "nonresidentNote": "Nonresident hunt 7251 (1 tag in 2023-2025).",
         "otcSummary": "No over-the-counter goat tags.", "keyDates": big_game_dates(), "sourceIds": common_ids + ["d-cr-25-13"]},
        {"species": "moose", "displayName": "Moose", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Antlered moose hunt 10151 first appears in the 2024 quota regulation (CR 24-12) and draw.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "Resident only (hunt 10151); lifetime waiting period after drawing.", "nonresidentNote": "No nonresident moose hunt.",
         "otcSummary": "No over-the-counter moose tags.", "keyDates": big_game_dates(), "sourceIds": common_ids + ["d-cr-24-12", "d-cr-26-11"]},
        {"species": "bear", "displayName": "Black bear", "drawSystem": "bonus-squared",
         "drawSystemSummary": SQUARED + "Black bear tags (either sex, hunts 6151 resident / 6251 nonresident) were drawn as a single unit group (192, 194-196, 201-204, 206, 291) in 2022-2025; the season closes early if harvest limits are met.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "2026 quota 38 resident tags (CR 26-12). 5-year waiting period after a successful harvest. Indoctrination course is mandatory for tag holders.",
         "nonresidentNote": "2026 quota 4 nonresident tags (CR 26-12).",
         "otcSummary": "No over-the-counter bear tags.",
         "keyDates": big_game_dates() + [
             {"label": "Mandatory black bear indoctrination course (6-9 pm, Reno and Zoom)", "kind": "other", "date": "2026-07-16", "cycle": 2026, "status": "confirmed",
              "note": "CR 26-12: tags are issued only after the tag holder (and any guide or sub-guide) completes one indoctrination course; second course July 25, 2026.", "sourceId": "d-cr-26-12"},
             {"label": "Mandatory black bear indoctrination course (1-4 pm, Reno and Zoom)", "kind": "other", "date": "2026-07-25", "cycle": 2026, "status": "confirmed", "sourceId": "d-cr-26-12"},
         ], "sourceIds": common_ids + ["d-cr-26-12"]},
        {"species": "turkey", "displayName": "Wild turkey", "drawSystem": "bonus-squared",
         "drawSystemSummary": "Wild turkey tags are issued through a separate spring (and fall) turkey draw; turkey bonus points are kept by hunt number and the squared bonus point rule of NAC 502.4189 applies to every tag drawing.",
         "pointsMatter": True, "pointName": "bonus point",
         "residentNote": "NDOW has not published per-hunt turkey draw statistics comparable to its big game bonus point reports; none are included.",
         "otcSummary": "No over-the-counter turkey tags.",
         "keyDates": [
             {"label": "2026 Spring Wild Turkey draw application period (deadline 11:00 pm PT)", "kind": "application", "start": "2026-01-12", "end": "2026-01-26", "cycle": 2026,
              "status": "confirmed", "note": "Opening date from NDOW's 2026 Small Game Application Calendar; deadline also in CR 25-01 A-1.", "sourceId": "d-ndow-apply-hunting"},
             {"label": "2026 Spring Wild Turkey bonus point only deadline (11:00 pm PT)", "kind": "points", "date": "2026-02-02", "cycle": 2026, "status": "confirmed", "sourceId": "d-cr-25-01-a1"},
             {"label": "2026 Spring Wild Turkey draw results on or before", "kind": "results", "date": "2026-02-13", "cycle": 2026, "status": "confirmed", "sourceId": "d-cr-25-01-a1"},
             {"label": "2026 Fall Wild Turkey draw application deadline (11:00 pm PT)", "kind": "application", "date": "2026-08-10", "cycle": 2026, "status": "confirmed",
              "note": "Fall limited-entry hunts 0131/0132 (Pershing and Lincoln counties); opening date not stated in CR 26-01 A-1.", "sourceId": "d-cr-26-01-a1"},
             {"label": "2026 Fall Wild Turkey draw results on or before", "kind": "results", "date": "2026-08-21", "cycle": 2026, "status": "confirmed", "sourceId": "d-cr-26-01-a1"},
             {"label": "2027 Spring Wild Turkey draw application deadline (11:00 pm PT)", "kind": "application", "date": "2027-01-25", "cycle": 2027, "status": "confirmed",
              "note": "Opening date for 2027 not stated in CR 26-01 A-1; the 2026 spring application period opened Jan 12, 2026.", "sourceId": "d-cr-26-01-a1"},
             {"label": "2027 Spring Wild Turkey bonus point only deadline (11:00 pm PT)", "kind": "points", "date": "2027-02-01", "cycle": 2027, "status": "confirmed", "sourceId": "d-cr-26-01-a1"},
             {"label": "2027 Spring Wild Turkey draw results on or before", "kind": "results", "date": "2027-02-12", "cycle": 2027, "status": "confirmed", "sourceId": "d-cr-26-01-a1"},
             {"label": "Spring wild turkey harvest questionnaire due (5:00 pm PT) for 2027 spring tags", "kind": "other", "date": "2027-05-31", "cycle": 2027, "status": "confirmed",
              "note": "CR 26-01 A-1 / NAC 502.407: spring wild turkey harvest questionnaires are due May 31 following the close of the season.", "sourceId": "d-cr-26-01-a1"},
         ],
         "sourceIds": ["d-cr-26-01-a1", "d-cr-25-01-a1", "d-cr-26-13", "d-nac-502", "d-ndow-apply-hunting"]},
        {"species": "lion", "displayName": "Mountain lion", "drawSystem": "otc", "pointsMatter": False,
         "drawSystemSummary": "Mountain lion tags are not drawn; they are sold online at ndowlicensing.com or over the counter at license agents. Hunters must call the mountain lion hotline (1-800-800-1667) to confirm a unit group is open before hunting.",
         "residentNote": "Limit one lion per tag, 2 tags maximum per person (CR 26-08).",
         "otcSummary": "Resident tag $29, nonresident tag $104; unit groups close when their harvest limits are reached.",
         "keyDates": [], "sourceIds": ["d-ndow-apply-hunting", "d-cr-26-08"]},
    ]


def fees():
    out = []

    def add(sp, item, res, amt, note=None, src="d-ndow-apply-hunting"):
        f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": src}
        if note:
            f["note"] = note
        out.append(f)

    cur = "Current fee as listed on NDOW's Apply & Buy page on 2026-10-31 (set by NRS 502.240 / 502.250)."
    for item, amt in [("Resident annual adult hunting license (18+)", 38), ("Resident annual adult combination license (18+)", 75),
                      ("Resident annual youth combination license (12-17)", 15)]:
        add(None, item, "resident", amt, cur)
    for item, amt in [("Nonresident annual adult combination license (18+)", 155), ("Nonresident annual youth combination license (12-17)", 15)]:
        add(None, item, "nonresident", amt, cur)
    for sp, item, r, n in [("mule-deer", "Mule deer tag", 30, 240), ("pronghorn", "Antelope tag", 60, 300), ("sheep", "Bighorn sheep tag", 120, 1200),
                           ("elk", "Elk tag", 120, 1200), ("goat", "Rocky mountain goat tag", 120, 1200), ("lion", "Mountain lion tag", 29, 104),
                           ("moose", "Moose tag", 120, 1200), ("bear", "Black bear tag", 100, 300), ("turkey", "Wild turkey tag", 20, 50)]:
        add(sp, "Resident " + item.lower(), "resident", r, cur)
        if sp == "moose":
            add(sp, "Nonresident moose tag", "nonresident", n, cur + " NDOW lists a nonresident price, but no nonresident moose hunt was offered 2024-2026.")
        else:
            add(sp, "Nonresident " + item.lower(), "nonresident", n, cur)
    add("mule-deer", "Restricted nonresident guided deer tag", "nonresident", 300, cur)
    for res in ("resident", "nonresident"):
        add("elk", "Elk application fee, non-refundable (includes $5 elk damage fee)", res, 15, cur + " NAC 502.331.")
        add(None, "Application fee for all other big game species or bonus point only, non-refundable", res, 10, cur + " NAC 502.331.")
        add(None, "Game application fee (per application)", res, 3, cur + " NRS 502.253.")
        add(None, "Processing fee", res, 1, cur + " NRS 502.118.")
        add("turkey", "Turkey tag application", res, 10, cur)
        add("turkey", "Game tag fee (per turkey hunt application)", res, 3, cur)
    return out


SEASONS = [
    {"species": "bear", "label": "Black bear, all open unit groups (hunts 6151/6251)", "start": "2026-09-15", "end": "2026-12-01", "year": 2026,
     "note": "Or until harvest limits are met; call 1-800-800-1667 before hunting.", "sourceId": "d-cr-26-12"},
    {"species": "moose", "label": "Resident antlered moose, hunt 10151 (units 061, 062, 064, 066-068, 071-077, 081, 101-103)", "start": "2026-09-01", "end": "2026-11-30",
     "year": 2026, "note": "2026 approved quota 3.", "sourceId": "d-cr-26-11"},
    {"species": "goat", "label": "Mountain goat, hunts 7151/7251 (units 101, 102, 103)", "start": "2026-09-01", "end": "2026-10-31", "year": 2026, "sourceId": "d-cr-26-11"},
]

COVERAGE_NOTES = {
    "mule-deer": "Main draw hunts 1331/1332, 1341/1342, 1371/1372, junior 1105/1106/1107, antlerless 1181 (2022-2023 only), and the Restricted Nonresident Guided hunt 1235 (separate March draw).",
    "elk": "Includes antlered, antlerless, spike and depredation hunts. Elk depredation hunts 4102/4107 for 2024-2025 come from NDOW Hunt Data (choice 'all') because no bonus point report was published for them.",
    "pronghorn": "Horns longer than ears (ALW/archery/muzzleloader), horns shorter than ears, and junior horns shorter than ears (2025).",
    "sheep": "Nelson (desert) rams and ewes, California rams, Rocky Mountain rams, and desert management rams. Desert ewe 2024, management rams 2022, 2023 and 2025, and a few ram hunts missing from the bonus point reports come from NDOW Hunt Data (choice 'all').",
    "goat": "Mountain goat 2022 comes from NDOW Hunt Data (choice 'all'); 2023-2025 from the bonus point reports.",
    "moose": "Hunt 10151 first appears in the 2024 quota regulation (none in CR 22-11 or CR 23-14); 2 resident tags in 2024 and 2025, 3 approved for 2026.",
    "bear": "One resident and one nonresident hunt per year.",
}
COMMON_NOTE = (" Draw years 2022-2025: NDOW posts each year's bonus point reports and Hunt Data the following winter, so 2026 draw statistics "
               "were not published as of 2026-10-31. Records with choice 'first' are 1st-choice applicants and 1st-choice successful applicants "
               "from NDOW's bonus point reports (odds computed); quota is the main-draw quota printed there and can be slightly below the "
               "commission-approved quota (shown in the note when NDOW Hunt Data differs).")


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    out_dir = os.path.join(repo, "src/data/agency/nevada")
    gen = json.load(open(os.path.join(raw, "draw_sources.json")))
    used = set()
    coverage = []
    for sp in ["elk", "mule-deer", "pronghorn", "moose", "bear", "sheep", "goat"]:
        p = os.path.join(out_dir, "draw", f"{sp}.json")
        rows = json.load(open(p))
        used |= {r["sourceId"] for r in rows}
        coverage.append({"species": sp, "years": sorted({r["year"] for r in rows}), "notes": COVERAGE_NOTES[sp] + COMMON_NOTE})
    coverage.append({"species": "turkey", "years": [], "notes": "NDOW does not publish per-hunt turkey draw statistics comparable to its big game bonus point reports; only dates and fees are included."})
    coverage.append({"species": "lion", "years": [], "notes": "Mountain lion tags are sold over the counter; there is no draw."})
    used |= {r["seasonSourceId"] for sp in ["elk", "mule-deer", "pronghorn", "moose", "bear", "sheep", "goat"]
             for r in json.load(open(os.path.join(out_dir, "draw", f"{sp}.json"))) if r.get("seasonSourceId")}
    sources = [s for s in gen if s["id"] in used] + DOC_SOURCES
    seasons = SEASONS
    meta_path = os.path.join(out_dir, "draw-meta.json")
    if os.path.exists(meta_path):
        seasons = json.load(open(meta_path)).get("seasons") or SEASONS  # owned by seasons_parse.py
    meta = {
        "slug": "nevada", "name": "Nevada", "abbrev": "NV",
        "agency": {"name": NDOW, "shortName": "NDOW", "url": "https://www.ndow.org"},
        "unitTerm": "Unit Group", "lastReviewed": R,
        "overview": ("Nevada issues big game tags for every species except mountain lion through an online computerized draw at ndowlicensing.com "
                     "(a few special tags, such as Heritage auction, Dream Tag raffle and landowner tags, are issued outside it); the main draw "
                     "application period ran March 23 to May 13 in 2026, followed by a second draw in June and First-Come, First-Served leftover tags in July. "
                     "Applicants pick up to 5 hunt choices (hunt number and unit group) per species category, and each application gets bonus points squared "
                     "plus one draw numbers, so points improve but never guarantee odds. Unsuccessful applicants earn one bonus point per species category per "
                     "year with an active license, and resident/nonresident quotas are split roughly 90/10."),
        "species": species(), "fees": fees(), "seasons": seasons, "coverage": coverage, "sources": sources,
    }
    with open(os.path.join(out_dir, "draw-meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"draw-meta.json: {len(sources)} sources ({len(used)} used by draw rows), {len(meta['fees'])} fees, {len(meta['species'])} species")


if __name__ == "__main__":
    main()
