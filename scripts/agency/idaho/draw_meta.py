#!/usr/bin/env python3
"""Write src/data/agency/idaho/draw-meta.json.

Facts below were read from the IDFG documents listed in SOURCES (downloaded by draw_fetch.py
into <raw>/docs and checked against `pdftotext -layout` output). Coverage is computed from the
draw/<species>.json files written by draw_build.py.

Usage: python -I draw_meta.py <repo_root>
"""
import json
import os
import sys

RETRIEVED = "2026-10-31"
PUB = "Idaho Department of Fish and Game"
ODDS_PAGE = "https://idfg.idaho.gov/ifwis/huntplanner/odds/"
ODDS_API = "https://idfg.idaho.gov/ifwis/huntplanner/api/1.1/odds/"


def odds_src(sid, bg, label):
    return {
        "id": sid,
        "title": f"Idaho Hunt Planner — Drawing Odds ({label}), controlled hunt drawings 2022–2026",
        "publisher": PUB,
        "url": f"{ODDS_API}?biggame={bg}&yr=2026&draw=1",
        "pageUrl": ODDS_PAGE,
        "retrieved": RETRIEVED,
        "notes": (f"JSON behind the IDFG Drawing Odds page; one request per year and drawing "
                  f"(yr=2022..2026, draw=1 first drawing, draw=2 second drawing), biggame={bg}. "
                  "Percentages are published as whole numbers. Hunt type, weapon, antler class and season "
                  "dates in each row come from d-huntlist; area boundary text and GMUs from d-areas."),
    }


SOURCES = [
    odds_src("d-odds-deer", 1, "Deer"),
    odds_src("d-odds-elk", 2, "Elk"),
    odds_src("d-odds-pronghorn", 3, "Pronghorn"),
    odds_src("d-odds-bear", 4, "Bear"),
    odds_src("d-odds-moose", 6, "Moose"),
    odds_src("d-odds-ca-sheep", 28, "California Sheep"),
    odds_src("d-odds-rm-sheep", 7, "Rocky Mountain Sheep"),
    odds_src("d-odds-goat", 8, "Mountain Goat"),
    odds_src("d-odds-turkey", 27, "Turkey"),
    {
        "id": "d-huntlist",
        "title": "Idaho Hunt Planner — Filterable Grid (controlled hunts: season, sex/antler, weapon, area, tags)",
        "publisher": PUB,
        "url": "https://idfg.idaho.gov/ifwis/huntplanner/api/1.1/list/?game=2&type=2&start=2022-1-1&end=2027-6-30&limit=5000&offset=0",
        "pageUrl": "https://idfg.idaho.gov/ifwis/huntplanner/filter",
        "retrieved": RETRIEVED,
        "notes": "Queried for game ids 1 (deer), 2 (elk), 3 (pronghorn), 6 (moose), 119 (bighorn sheep), 8 (mountain goat). "
                 "Black bear and turkey controlled hunts and 2026 moose/sheep/goat hunts are not returned by this list.",
    },
    {
        "id": "d-areas",
        "title": "Idaho Hunt Planner — Hunt Area pages (boundary description and Game Management Units)",
        "publisher": PUB,
        "url": "https://idfg.idaho.gov/ifwis/huntplanner/area.aspx?id=283",
        "pageUrl": "https://idfg.idaho.gov/ifwis/huntplanner/",
        "retrieved": RETRIEVED,
        "notes": "One page per AreaID referenced in the drawing-odds table (id=<AreaID>). Text is the current IDFG description "
                 "for that AreaID. Five AreaIDs (677, 2807, 2874, 2877, 2879) returned HTTP 500 on 2026-10-31.",
    },
    {
        "id": "d-rules-big-game-2026",
        "title": "Idaho Big Game 2026 Seasons & Rules",
        "publisher": PUB,
        "url": "https://idfg.idaho.gov/sites/default/files/seasons-rules-big-game-2026.pdf",
        "pageUrl": "https://idfg.idaho.gov/rules/big-game",
        "dataYear": 2026,
        "retrieved": RETRIEVED,
        "notes": "Controlled hunt dates and rules pp.108-111; resident fees pp.120-121; nonresident fees pp.122-123 "
                 "(nonresident page states prices as of December 1, 2024).",
    },
    {
        "id": "d-rules-msg-2025-26",
        "title": "Idaho Moose, Bighorn Sheep & Mountain Goat 2025 & 2026 Seasons & Rules (updated March 2026)",
        "publisher": PUB,
        "url": "https://idfg.idaho.gov/sites/default/files/seasons-rules-moose-sheep-goat-2025-26.pdf",
        "pageUrl": "https://idfg.idaho.gov/rules/big-game",
        "dataYear": 2026,
        "retrieved": RETRIEVED,
        "notes": "Controlled hunt information pp.38-40; 2026 moose/sheep/goat season dates in draw rows come from the hunt tables.",
    },
    {
        "id": "d-nr-supplement-2027",
        "title": "2027 Nonresident Supplement for General Season Deer and Elk",
        "publisher": PUB,
        "url": "https://idfg.idaho.gov/sites/default/files/seasons-rules-big-game-supplemental-proclamation-2027.pdf",
        "pageUrl": "https://idfg.idaho.gov/licenses/tag/quotas/nonresident",
        "dataYear": 2027,
        "retrieved": RETRIEVED,
        "notes": "Key dates p.4; draw Q&A pp.5-7. The pageUrl returned HTTP 503 on 2026-10-31; facts are from the PDF only.",
    },
    {
        "id": "d-rules-upland-2026-27",
        "title": "Upland Game, Turkey & Furbearer 2026 & 2027 Seasons & Rules",
        "publisher": PUB,
        "url": "https://idfg.idaho.gov/sites/default/files/seasons-rules-upland-game-2026-2027.pdf",
        "pageUrl": "https://idfg.idaho.gov/rules/upland",
        "dataYear": 2026,
        "retrieved": RETRIEVED,
        "notes": "Turkey controlled hunt rules and dates pp.18-19; turkey seasons pp.22-25. Covers 2026 and 2027 seasons.",
    },
]

BG = "d-rules-big-game-2026"
MSG = "d-rules-msg-2025-26"
NRS = "d-nr-supplement-2027"
UPL = "d-rules-upland-2026-27"
NOT_YET = "2027 dates not yet published by IDFG as of 2026-10-31."


def kd(label, cycle, sid, date=None, start=None, end=None, note=None):
    d = {"label": label}
    if date:
        d["date"] = date
    if start:
        d["start"], d["end"] = start, end
    d.update({"cycle": cycle, "status": "confirmed", "sourceId": sid})
    if note:
        d["note"] = note
    return d


DEER_ELK_CONTROLLED = [
    kd("Controlled hunt first application period (deer, elk, pronghorn, fall bear)", 2026, BG, start="2026-05-01", end="2026-06-05", note=NOT_YET),
    kd("Deadline to buy drawn controlled hunt tags", 2026, BG, date="2026-08-01", note="Excludes unlimited and January/February Extra hunts. " + NOT_YET),
    kd("Controlled hunt second application period", 2026, BG, start="2026-08-05", end="2026-08-15", note=NOT_YET),
    kd("Second drawing results posted; leftover tags on sale 10 a.m. MT", 2026, BG, date="2026-08-25", note="IDFG: August 25 or next business day. " + NOT_YET),
]
NR_DRAW = [
    kd("Nonresident general season deer/elk tag drawing — first application period (also DAV draw)", 2027, NRS, start="2026-12-05", end="2026-12-15",
       note="Results announced early January 2027 (no exact date published)."),
    kd("Nonresident draw — deadline to buy tags drawn in first period", 2027, NRS, date="2027-01-20", note="Unpurchased tags are forfeited (DAV tags excepted)."),
    kd("Nonresident draw — second application period", 2027, NRS, start="2027-02-05", end="2027-02-15", note="Results early March 2027 (no exact date published)."),
    kd("Nonresident draw — deadline to buy second-period tags and all DAV tags", 2027, NRS, date="2027-03-20"),
]

GEN_RES_DEER = ("Residents buy general season deer tags over the counter; resident general deer and uncapped elk tags go on sale in early July "
                "after controlled hunt results are released.")
NR_DEER_ELK = ("Since the 2026 season, nonresident general season deer and elk tags are issued through the Nonresident Tag Drawing "
               "(up to five hunt choices per application, groups of up to 4, $18.00 application fee). Statewide nonresident general-season "
               "quotas for 2027: 15,500 deer and 12,815 elk (including capped elk zones). In controlled hunts nonresidents get no more "
               "than 10% of tags (no more than one tag in hunts with 19 or fewer tags).")
CONTROLLED_RANDOM = ("Controlled hunt tags are issued by a random drawing; Idaho's drawing does not use preference or bonus points. Applicants may list a first "
                     "and second hunt choice; second choices are drawn only from tags left after first choices.")

SPECIES = [
    {
        "species": "elk",
        "displayName": "Elk",
        "drawSystem": "random",
        "drawSystemSummary": CONTROLLED_RANDOM + " Anyone drawn in the first application period for a limited antlered-only elk hunt may not apply for another limited antlered-only elk hunt in the first application period of the following year.",
        "pointsMatter": False,
        "residentNote": "Residents buy general (zone) elk tags over the counter; capped elk zone tags have a first-come, first-served quota "
                        "(2026 capped tags went on sale July 8; Sawtooth July 10). Residents who apply for a controlled elk hunt must wait "
                        "five days after capped tags go on sale before buying one.",
        "nonresidentNote": NR_DEER_ELK,
        "otcSummary": "Resident general elk zone tags (capped zones limited, first-come first-served); leftover controlled tags after the second drawing.",
        "keyDates": DEER_ELK_CONTROLLED + NR_DRAW,
        "sourceIds": [BG, NRS, "d-odds-elk"],
    },
    {
        "species": "mule-deer",
        "displayName": "Mule deer (IDFG 'regular deer'; controlled hunts open to mule and white-tailed deer are listed here)",
        "drawSystem": "random",
        "drawSystemSummary": CONTROLLED_RANDOM + " Anyone drawn in the first application period for a limited antlered-only deer hunt may not apply for another limited antlered-only deer hunt in the first application period of the following year.",
        "pointsMatter": False,
        "residentNote": GEN_RES_DEER,
        "nonresidentNote": NR_DEER_ELK,
        "otcSummary": "Resident general season deer tags; leftover controlled tags after the second drawing.",
        "keyDates": DEER_ELK_CONTROLLED + NR_DRAW,
        "sourceIds": [BG, NRS, "d-odds-deer"],
    },
    {
        "species": "whitetail",
        "displayName": "White-tailed deer",
        "drawSystem": "random",
        "drawSystemSummary": CONTROLLED_RANDOM + " Only hunts IDFG lists as white-tailed deer only are filed here.",
        "pointsMatter": False,
        "residentNote": GEN_RES_DEER,
        "nonresidentNote": NR_DEER_ELK + " The Nonresident Tag Drawing has separate white-tailed deer hunt codes by unit.",
        "otcSummary": "Resident general season deer tags (white-tailed deer tag options listed in the deer seasons).",
        "keyDates": DEER_ELK_CONTROLLED + NR_DRAW,
        "sourceIds": [BG, NRS, "d-odds-deer"],
    },
    {
        "species": "pronghorn",
        "displayName": "Pronghorn",
        "drawSystem": "random",
        "drawSystemSummary": "All Idaho pronghorn hunting, including archery seasons, is by controlled hunt, drawn at random with no points. "
                             "Anyone drawn for a limited pronghorn hunt is not eligible to apply for another limited pronghorn hunt the next year (unlimited hunts excepted).",
        "pointsMatter": False,
        "nonresidentNote": "Nonresidents get no more than 10% of tags in a controlled hunt (one tag in hunts with 19 or fewer tags).",
        "otcSummary": "None for general seasons; leftover controlled tags go on sale after the second drawing.",
        "keyDates": DEER_ELK_CONTROLLED,
        "sourceIds": [BG, "d-odds-pronghorn"],
    },
    {
        "species": "moose",
        "displayName": "Moose",
        "drawSystem": "random",
        "drawSystemSummary": "Moose tags are controlled hunts allocated by random drawing. A person may apply for only one of moose, bighorn sheep or "
                             "mountain goat per year and is then barred from other big game controlled hunts that year (with listed exceptions). "
                             "Anyone drawn must wait two years to apply again, and no one may take more than one antlered and one antlerless moose in Idaho in a lifetime "
                             "(Super Hunt winners and leftover tag holders excepted).",
        "pointsMatter": False,
        "residentNote": "2026 resident tag plus application: $183.50 (Price Lock) or $216.50 (no Price Lock), including the $16.75 application fee.",
        "nonresidentNote": "Nonresidents are limited to 10% of controlled hunt tags per species and no more than one tag in hunts with 10 or fewer tags; "
                           "2026 nonresident tag plus application $2,672.50.",
        "otcSummary": "None; leftover tags from the second drawing go on sale July 10.",
        "keyDates": [
            kd("Moose, bighorn sheep and mountain goat application period", 2026, MSG, start="2026-04-01", end="2026-04-30", note=NOT_YET),
            kd("Successful applicants notified by", 2026, MSG, date="2026-06-10", note=NOT_YET),
            kd("Second drawing application period", 2026, MSG, start="2026-06-15", end="2026-06-25", note=NOT_YET),
            kd("Leftover tags from second drawing go on sale", 2026, MSG, date="2026-07-10", note=NOT_YET),
        ],
        "sourceIds": [MSG, "d-odds-moose"],
    },
    {
        "species": "sheep",
        "displayName": "Bighorn sheep (Rocky Mountain & California)",
        "drawSystem": "random",
        "drawSystemSummary": "Bighorn sheep tags are controlled hunts allocated by random drawing (Rocky Mountain and California bighorn hunts are drawn separately; "
                             "a person may not apply for both in the same year). Anyone drawn must wait two years to apply again, and no one may take more than one "
                             "Rocky Mountain and one California bighorn in Idaho in a lifetime (lottery and auction tags excepted).",
        "pointsMatter": False,
        "residentNote": "2026 resident tag plus application: $183.50 (Price Lock) or $216.50 (no Price Lock).",
        "nonresidentNote": "Nonresidents are limited to 10% of controlled hunt tags per species and no more than one tag in hunts with 10 or fewer tags; "
                           "2026 nonresident tag plus application $2,672.50.",
        "otcSummary": "None; special auction and lottery tags are sold separately.",
        "keyDates": [
            kd("Moose, bighorn sheep and mountain goat application period", 2026, MSG, start="2026-04-01", end="2026-04-30", note=NOT_YET),
            kd("Successful applicants notified by", 2026, MSG, date="2026-06-10", note=NOT_YET),
            kd("Second drawing application period", 2026, MSG, start="2026-06-15", end="2026-06-25", note=NOT_YET),
        ],
        "sourceIds": [MSG, "d-odds-rm-sheep", "d-odds-ca-sheep"],
    },
    {
        "species": "goat",
        "displayName": "Mountain goat",
        "drawSystem": "random",
        "drawSystemSummary": "Mountain goat tags are controlled hunts allocated by random drawing. Anyone who has killed a mountain goat in Idaho since 1977 "
                             "may not apply, and a drawn hunter who fails to harvest may not apply for two years.",
        "pointsMatter": False,
        "residentNote": "2026 resident tag plus application: $183.50 (Price Lock) or $216.50 (no Price Lock).",
        "nonresidentNote": "Nonresidents are limited to 10% of controlled hunt tags per species and no more than one tag in hunts with 10 or fewer tags; "
                           "2026 nonresident tag plus application $2,672.50.",
        "otcSummary": "None.",
        "keyDates": [
            kd("Moose, bighorn sheep and mountain goat application period", 2026, MSG, start="2026-04-01", end="2026-04-30", note=NOT_YET),
            kd("Successful applicants notified by", 2026, MSG, date="2026-06-10", note=NOT_YET),
            kd("Second drawing application period", 2026, MSG, start="2026-06-15", end="2026-06-25", note=NOT_YET),
        ],
        "sourceIds": [MSG, "d-odds-goat"],
    },
    {
        "species": "bear",
        "displayName": "Black bear",
        "drawSystem": "otc",
        "drawSystemSummary": "Most black bear hunting is in general seasons with over-the-counter tags. A small number of spring and fall controlled "
                             "hunts are drawn at random (no points).",
        "pointsMatter": False,
        "nonresidentNote": "Nonresidents applying for a controlled bear hunt where hounds are allowed must have drawn a hound hunter permit in December of the previous year.",
        "otcSummary": "General season black bear tags (residents may buy a second tag where allowed).",
        "keyDates": [
            kd("Spring black bear controlled hunt application period", 2027, BG, start="2027-01-15", end="2027-02-15",
               note="Published for the 2027 spring controlled hunts in the 2026 Big Game Seasons & Rules."),
            kd("Fall black bear controlled hunt application period", 2026, BG, start="2026-05-01", end="2026-06-05", note=NOT_YET),
            kd("Deadline to buy drawn fall bear controlled hunt tags", 2026, BG, date="2026-08-01", note=NOT_YET),
        ],
        "sourceIds": [BG, "d-odds-bear"],
    },
    {
        "species": "lion",
        "displayName": "Mountain lion",
        "drawSystem": "otc",
        "drawSystemSummary": "Mountain lion is hunted in general seasons with over-the-counter tags; IDFG publishes no mountain lion drawing.",
        "pointsMatter": False,
        "residentNote": "Residents may buy a second mountain lion tag where a second tag may be used.",
        "nonresidentNote": "Nonresident mountain lion tag $204.50; reduced-price nonresident tags are offered in some units.",
        "otcSummary": "General season mountain lion tags.",
        "keyDates": [],
        "sourceIds": [BG],
    },
    {
        "species": "turkey",
        "displayName": "Wild turkey",
        "drawSystem": "otc",
        "drawSystemSummary": "Spring and fall general turkey seasons use over-the-counter general tags; spring and fall controlled hunts are drawn at random "
                             "(no points), with no more than 10% of controlled tags to nonresidents.",
        "pointsMatter": False,
        "otcSummary": "General hunt turkey tags (plus special unit tags valid only in Units 1, 2, 3, 4, 4A, 5, 6, 7 and 9); leftover spring controlled tags on sale March 25, fall July 15.",
        "keyDates": [
            kd("Spring turkey controlled hunt application period", 2027, UPL, start="2027-02-01", end="2027-03-01",
               note="Listed as Feb 1 - Mar 1 in the 2026 & 2027 Upland Game, Turkey & Furbearer Seasons & Rules."),
            kd("Spring turkey controlled hunt results available by", 2027, UPL, date="2027-03-20"),
            kd("Leftover spring controlled turkey tags on sale 10 a.m. MDT", 2027, UPL, date="2027-03-25"),
            kd("Fall turkey controlled hunt application period", 2027, UPL, start="2027-05-01", end="2027-06-05"),
            kd("Fall turkey controlled hunt results available by", 2027, UPL, date="2027-07-10"),
        ],
        "sourceIds": [UPL, "d-odds-turkey"],
    },
]


def fee(species, item, res, amt, note=None, sid=BG, year=2026):
    f = {"species": species, "item": item, "residency": res, "amountUsd": amt, "licenseYear": year}
    if note:
        f["note"] = note
    f["sourceId"] = sid
    return f


PL = "With Price Lock."
NPL = "Without Price Lock."
NRN = "Nonresident fee table states prices as of December 1, 2024."
FEES = [
    fee(None, "Resident adult hunting license", "resident", 12.75, PL),
    fee(None, "Resident adult hunting license", "resident", 15.75, NPL),
    fee(None, "Resident Sportsman's Package (adult or youth)", "resident", 124.25, PL + " Includes deer, elk, turkey, bear, gray wolf and mountain lion tags and archery, muzzleloader, salmon and steelhead permits."),
    fee(None, "Resident Sportsman's Package (adult or youth)", "resident", 144.60, NPL),
    fee("mule-deer", "Resident adult deer tag", "resident", 19.75, PL),
    fee("mule-deer", "Resident adult deer tag", "resident", 24.75, NPL),
    fee("whitetail", "Resident adult deer tag", "resident", 19.75, PL),
    fee("whitetail", "Resident adult deer tag", "resident", 24.75, NPL),
    fee("elk", "Resident adult elk tag", "resident", 30.75, PL),
    fee("elk", "Resident adult elk tag", "resident", 36.75, NPL),
    fee("pronghorn", "Resident adult pronghorn tag", "resident", 31.25, PL),
    fee("pronghorn", "Resident adult pronghorn tag", "resident", 36.50, NPL),
    fee("bear", "Resident bear tag (each, incl. second bear)", "resident", 11.50, PL),
    fee("bear", "Resident bear tag (each, incl. second bear)", "resident", 13.75, NPL),
    fee("lion", "Resident mountain lion tag (each, incl. second lion)", "resident", 11.50, PL),
    fee("lion", "Resident mountain lion tag (each, incl. second lion)", "resident", 13.75, NPL),
    fee("turkey", "Resident turkey tag", "resident", 19.75, PL),
    fee("turkey", "Resident turkey tag", "resident", 22.75, NPL),
    fee("moose", "Resident moose, bighorn sheep, mountain goat tag (tag only)", "resident", 166.75, PL),
    fee("moose", "Resident moose, bighorn sheep, mountain goat tag (tag only)", "resident", 199.75, NPL),
    fee("sheep", "Resident moose, bighorn sheep, mountain goat tag (tag only)", "resident", 166.75, PL),
    fee("sheep", "Resident moose, bighorn sheep, mountain goat tag (tag only)", "resident", 199.75, NPL),
    fee("goat", "Resident moose, bighorn sheep, mountain goat tag (tag only)", "resident", 166.75, PL),
    fee("goat", "Resident moose, bighorn sheep, mountain goat tag (tag only)", "resident", 199.75, NPL),
    fee(None, "Resident controlled hunt application for deer, elk, pronghorn, bear or turkey (each)", "resident", 6.25, "Nonrefundable."),
    fee(None, "Resident controlled hunt application for moose, sheep or mountain goat", "resident", 16.75, "Nonrefundable; same price with or without Price Lock."),
    fee(None, "Resident archery or muzzleloader permit", "resident", 18.25, PL),
    fee(None, "Resident archery or muzzleloader permit", "resident", 19.50, NPL),
    fee(None, "Nonresident adult hunting license (includes three-day fishing license)", "nonresident", 185.00, NRN),
    fee("mule-deer", "Nonresident adult deer tag", "nonresident", 351.75, NRN),
    fee("whitetail", "Nonresident adult deer tag", "nonresident", 351.75, NRN),
    fee("elk", "Nonresident adult elk tag", "nonresident", 651.75, NRN),
    fee("pronghorn", "Nonresident adult pronghorn tag", "nonresident", 342.75, NRN),
    fee("bear", "Nonresident bear tag", "nonresident", 231.75, NRN),
    fee("bear", "Nonresident reduced bear and second bear tag (each)", "nonresident", 41.75, NRN),
    fee("lion", "Nonresident mountain lion tag", "nonresident", 204.50, NRN),
    fee("lion", "Nonresident reduced mountain lion and second mountain lion tag (each)", "nonresident", 41.75, NRN),
    fee("turkey", "Nonresident turkey tag (each)", "nonresident", 88.00, NRN),
    fee("moose", "Nonresident moose, bighorn sheep, mountain goat tag (tag only)", "nonresident", 2626.75, NRN),
    fee("sheep", "Nonresident moose, bighorn sheep, mountain goat tag (tag only)", "nonresident", 2626.75, NRN),
    fee("goat", "Nonresident moose, bighorn sheep, mountain goat tag (tag only)", "nonresident", 2626.75, NRN),
    fee(None, "Nonresident controlled hunt application for deer, elk, pronghorn, bear or turkey (each)", "nonresident", 18.00, "Nonrefundable. " + NRN),
    fee(None, "Nonresident controlled hunt application for moose, sheep or mountain goat", "nonresident", 45.75, "Nonrefundable. " + NRN),
    fee(None, "Nonresident archery or muzzleloader permit", "nonresident", 81.75, NRN),
    fee(None, "Nonresident or DAV Tag Drawing application (general season deer/elk), per application", "nonresident", 18.00,
        "Nonrefundable; a 2027 Idaho hunting license valid for big game is required to apply.", NRS, 2027),
]

SEASONS = [
    {"species": "turkey", "label": "General spring turkey season, male or bearded turkey", "start": "2026-04-15", "end": "2026-05-25",
     "year": 2026, "note": "Units 1, 2 (except Farragut State Park and WMA), 3, 4, 4A, 5, 6, 7, 8, 8A, 9, 10, 10A, 11, 11A, 12, 13, 14, 15, 16, 16A, 17, 18, 19, 19A, 20, "
                          "22, 23, 24, 31, 32 (except that portion in Payette County), 32A, 33, 39, 40, 68A, 70, 71, 72, 73, 74, 75, 76, 77 & 78. "
                          "Published for 2026 & 2027.",
     "sourceId": UPL},
    {"species": "turkey", "label": "General spring turkey season, male or bearded turkey", "start": "2027-04-15", "end": "2027-05-25",
     "year": 2027, "note": "Units 1, 2 (except Farragut State Park and WMA), 3, 4, 4A, 5, 6, 7, 8, 8A, 9, 10, 10A, 11, 11A, 12, 13, 14, 15, 16, 16A, 17, 18, 19, 19A, 20, "
                          "22, 23, 24, 31, 32 (except that portion in Payette County), 32A, 33, 39, 40, 68A, 70, 71, 72, 73, 74, 75, 76, 77 & 78. "
                          "The 2026 & 2027 Upland Game, Turkey & Furbearer Seasons & Rules gives one set of spring general dates for both years.",
     "sourceId": UPL},
]


def main():
    repo = sys.argv[1]
    base = os.path.join(repo, "src", "data", "agency", "idaho")
    cov = []
    notes = {
        "elk": "First drawing, first-choice counts per IDFG drawing-odds table; second-choice and second-drawing results in row notes. "
               "2026 brochure total 18,670 controlled elk tags plus unlimited vs 18,515 in drawn hunts here; the difference is outfitter-allocated "
               "controlled hunts (e.g. 2175-2213) that are not publicly drawn and are absent from the odds table. 2023 hunt 2250 and 2024 hunt 2285 "
               "are listed twice by IDFG with different figures, so their counts are given only in the note. 2022-2024 outfitter-allocated hunts that IDFG lists "
               "with tags but zero applicants are omitted (not a public draw). Seven 2023 January Extra hunts (2250-2256) and 2025 hunt 2133 have no season "
               "dates because the Hunt Planner list did not identify a single matching tag.",
        "mule-deer": "Includes IDFG deer hunts listed for 'Mule Deer' or 'Mule and White-tailed Deer'; hunts with no matching hunt-list entry are kept here with a note. "
                     "2026 brochure total 13,226 controlled deer tags plus unlimited vs 12,923 in drawn deer hunts here (mule-deer + whitetail); the difference "
                     "is outfitter-allocated hunts (e.g. 1148-1187) not in the odds table. 2022-2024 outfitter-allocated hunts listed with zero applicants are omitted.",
        "whitetail": "Only IDFG controlled hunts listed for 'White-tailed Deer'.",
        "pronghorn": "2026 sum of limited-hunt tags (2,040) matches the brochure total '2,040 Tags Plus Unlimited Tags'. Unlimited hunts have quota null.",
        "moose": "2025 antlered moose tags sum to 510, matching the brochure '510 Tags'. 2026 hunt metadata (season dates, antler class) come from the "
                 "2025 & 2026 brochure because the Hunt Planner list has no 2026 moose/sheep/goat hunts; hunt 3050 (area label differs) is left without dates. "
                 "IDFG published no second-drawing odds for moose, sheep or goat.",
        "sheep": "Rocky Mountain (5xxx) and California (7xxx) bighorn hunts combined. Twelve 2026 rows lack season dates (late hunts and hunts whose brochure area label differs from the odds table).",
        "goat": "2026 season dates from the 2025 & 2026 brochure where hunt area and tags match; 2026 hunts 6018 and 6019 have no dates (area label differs).",
        "bear": "Controlled hunts only (general seasons are OTC). Bear hunts are not in the Hunt Planner list, so 2022-2025 rows carry no season dates, weapon or "
                "unlimited flag; 2026 fall hunts from the 2026 brochure (sum 240 tags, matches '240 Tags'). Area 1-1 (AreaID 677) page failed, so 2022 hunt 8501 has no area text.",
        "turkey": "Controlled hunts only. 2022-2025 rows carry no season dates (not in the Hunt Planner list); 2026 dates from the 2026 & 2027 upland brochure. "
                  "Three 2026 area pages failed to load (AreaIDs 2874, 2877, 2879), so those rows have no area text or GMUs.",
        "lion": "No drawing; mountain lion is general season OTC. No draw file.",
    }
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "bear", "turkey", "lion"]:
        p = os.path.join(base, "draw", f"{sp}.json")
        years = []
        if os.path.exists(p):
            with open(p) as fh:
                years = sorted({r["year"] for r in json.load(fh)})
        cov.append({"species": sp, "years": years, "notes": notes[sp]})
    meta = {
        "slug": "idaho",
        "name": "Idaho",
        "abbrev": "ID",
        "agency": {"name": PUB, "shortName": "IDFG", "url": "https://idfg.idaho.gov"},
        "unitTerm": "Unit",
        "lastReviewed": RETRIEVED,
        "overview": "Idaho controlled hunt tags for deer, elk, pronghorn, moose, bighorn sheep, mountain goat, black bear and turkey are issued by "
                    "random drawing; IDFG uses no preference or bonus points. In 2026, deer, elk, pronghorn and fall bear applications were taken May 1 - June 5 "
                    "with a second drawing for unclaimed tags in August, and moose, sheep and goat applications April 1-30 (2027 dates not yet published). Nonresidents get no more "
                    "than 10% of controlled hunt tags. Since 2026, nonresident general season deer and elk tags are also issued through a drawing "
                    "held each December (2027 tags: December 5-15, 2026).",
        "species": SPECIES,
        "fees": FEES,
        "seasons": SEASONS,
        "coverage": cov,
        "sources": SOURCES,
    }
    with open(os.path.join(base, "draw-meta.json"), "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print("wrote draw-meta.json")


if __name__ == "__main__":
    main()
