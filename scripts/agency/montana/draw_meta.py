#!/usr/bin/env python3
"""Write src/data/agency/montana/draw-meta.json (DrawMeta, see schema.ts).

Facts below were transcribed from the FWP documents listed in STATIC_SOURCES
(downloaded by draw_download.py; page/regulation text was read with pdftotext).
Every fee, date and rule cites its source id. Drawing-report sources and
coverage are taken from the parsed draw files written by draw_parse.py.

Usage: python -I draw_meta.py <raw_dir> <repo_root>

After this script, re-run seasons_parse.py: it adds season dates (draw rows) and key-date
tags/seasons (draw-meta) to the files written here.
"""
import collections
import json
import re
import os
import sys

R = "2026-10-31"
PUB = "Montana Fish, Wildlife & Parks"
RB = "https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/"
REGS_PAGE = "https://fwp.mt.gov/hunt/regulations"
ARCHIVE_PAGE = "https://fwp.mt.gov/hunt/regulations/archive"

STATIC_SOURCES = [
    {"id": "d-fwp-dates-2026", "title": "Applications, Drawings, and Bonus Points (application and drawing dates)",
     "url": "https://fwp.mt.gov/buyandapply/hunting-licenses/application-drawing-dates", "dataYear": 2026,
     "notes": "Shows 2026 application windows; no 2027 dates posted as of 2026-10-31."},
    {"id": "d-fwp-bonus-points", "title": "Bonus and Preference Points",
     "url": "https://fwp.mt.gov/buyandapply/hunting-licenses/bonus-points", "dataYear": 2026},
    {"id": "d-fwp-bp-faq", "title": "Bonus Points FAQ",
     "url": "https://fwp.mt.gov/binaries/content/assets/fwp/buyandapply/hunting/bonus-points-faq--final-updated.pdf",
     "pageUrl": "https://fwp.mt.gov/buyandapply/hunting-licenses/bonus-points"},
    {"id": "d-fwp-drawstats-page", "title": "Drawing Statistics",
     "url": "https://fwp.mt.gov/buyandapply/hunting-licenses/drawing-statistics"},
    {"id": "d-fwp-fees-res", "title": "Resident License Fees",
     "url": "https://fwp.mt.gov/buyandapply/hunting-licenses/resident-licenses/fees", "dataYear": 2026,
     "notes": "Page is undated; read 2026-10-31 (2026 license year, Mar 1 2026 - Feb 28 2027)."},
    {"id": "d-fwp-fees-nr", "title": "Nonresident License Fees",
     "url": "https://fwp.mt.gov/buyandapply/hunting-licenses/nonresident-licenses/fees", "dataYear": 2026,
     "notes": "Page states 2026 combination application dates; read 2026-10-31."},
    {"id": "d-fwp-regs-dea-2026", "title": "2026 Deer, Elk & Antelope Hunting Regulations",
     "url": RB + "2026/2026-dea-regulations-final-with-low-resolution-maps-for-web.pdf", "pageUrl": REGS_PAGE, "dataYear": 2026},
    {"id": "d-fwp-regs-dea-2025", "title": "2025 Deer, Elk & Antelope Hunting Regulations",
     "url": RB + "2025/2025-dea-regulations-final-for-web.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2025},
    {"id": "d-fwp-regs-dea-2024", "title": "2024 Deer, Elk & Antelope Hunting Regulations",
     "url": RB + "2024/2024-dea-regulations-final-for-web-with-web-quality-maps.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2024},
    {"id": "d-fwp-regs-dea-2023", "title": "2023 Deer, Elk & Antelope Hunting Regulations",
     "url": RB + "2023/2023-dea-regulations-final-for-web.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2023},
    {"id": "d-fwp-regs-dea-2022", "title": "2022 Deer, Elk & Antelope Hunting Regulations",
     "url": RB + "2022/2022-dea-regulations-final-for-web.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2022},
    {"id": "d-fwp-regs-msgb-2026", "title": "2026 Moose, Sheep, Goat & Bison Hunting Regulations",
     "url": RB + "2026/2026-msgb-final-for-web.pdf", "pageUrl": REGS_PAGE, "dataYear": 2026},
    {"id": "d-fwp-regs-msgb-2025", "title": "2025 Moose, Sheep, Goat & Bison Hunting Regulations",
     "url": RB + "2025/2025-msgb-final-for-web-2.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2025},
    {"id": "d-fwp-regs-msgb-2024", "title": "2024 Moose, Sheep, Goat & Bison Hunting Regulations",
     "url": RB + "2024/2024-msgb-final-for-web.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2024},
    {"id": "d-fwp-regs-msgb-2023", "title": "2023 Moose, Sheep, Goat & Bison Hunting Regulations",
     "url": RB + "2023/2023-msgb-final-for-web.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2023},
    {"id": "d-fwp-regs-bear-2026", "title": "2026 Black Bear Hunting Regulations",
     "url": RB + "2026/2026-black-bear-final-for-web.pdf", "pageUrl": REGS_PAGE, "dataYear": 2026},
    {"id": "d-fwp-regs-lion-2026", "title": "2026 Mountain Lion Hunting Regulations",
     "url": RB + "2026/2026-lion-final-for-web.pdf", "pageUrl": REGS_PAGE, "dataYear": 2026},
    {"id": "d-fwp-regs-upgbrd-2026", "title": "2026 Upland Game Birds Hunting Regulations (includes turkey)",
     "url": RB + "2026/2026-upgbrd-final-for-web.pdf", "pageUrl": REGS_PAGE, "dataYear": 2026},
]

NO27 = "2027 dates not yet published by Montana FWP as of 2026-10-31."


def kd(label, start, end, sid, note=None, cycle=2026):
    d = {"label": label, "start": start, "end": end, "cycle": cycle, "status": "confirmed", "sourceId": sid}
    d["note"] = (note + " " if note else "") + NO27
    return d


BP_BUY = kd("Bonus point purchase without applying (one per species/license type)", "2026-07-01", "2026-09-30",
            "d-fwp-regs-dea-2026", "Only for license types you did not apply for in 2026.")
PP_BUY = kd("Nonresident preference point purchase without applying for a combination license", "2026-07-01", "2026-12-31",
            "d-fwp-regs-dea-2026", "$100; applicants who applied for a combination license could only buy it at application.")

SQUARED = ("FWP squares bonus points before the drawing: an applicant gets (points x points) + 1 chances, "
           "and bonus points apply to first-choice applications only.")
LANDOWNER = ("Up to 15% of final quotas are set aside for landowner preference in the Deer Permit, Elk Permit, Deer B, Elk B, "
             "Antelope and Antelope B drawings; nonresidents are limited to, but not guaranteed, 10% of a drawing's quota.")
NR_COMBO = ("Most nonresidents must first draw a General Big Game (deer and elk, 17,000 issued), Elk, or Deer (4,600 issued) "
            "Combination license (apply by April 1); 75% go to applicants with the most preference points (max 3) and 25% are "
            "drawn at random among applicants with no preference points. Elk and deer permits require applying for a combination license.")

SPECIES = [
    {"species": "elk", "displayName": "Elk",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "Residents buy a General Elk License over the counter; limited elk permits (bulls/either-sex in "
                          "restricted districts) and Elk B (antlerless) licenses are drawn using squared bonus points. "
                          + SQUARED,
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": "Residents must hold a current General Elk License to apply for an elk permit. " + LANDOWNER,
     "nonresidentNote": NR_COMBO + " Combination licenses use preference points, not bonus points.",
     "otcSummary": "Resident General Elk License over the counter ($20); some Elk B licenses are sold over the counter "
                   "beginning June 15 in specific districts.",
     "keyDates": [
         kd("Elk permit and nonresident combination application period", "2026-03-01", "2026-04-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-April."),
         kd("Elk B license application period", "2026-03-01", "2026-06-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-June."),
         BP_BUY, PP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-bonus-points", "d-fwp-bp-faq", "d-fwp-regs-dea-2026"]},
    {"species": "mule-deer", "displayName": "Mule deer",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "Residents buy a General Deer License over the counter; limited deer permits (mostly antlered buck "
                          "mule deer) and Deer B (antlerless) licenses are drawn using squared bonus points. " + SQUARED,
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": "Residents must hold a current General Deer License to apply for a deer permit. " + LANDOWNER,
     "nonresidentNote": NR_COMBO,
     "otcSummary": "Resident General Deer License over the counter ($16); some Deer B licenses are sold over the counter beginning June 15.",
     "keyDates": [
         kd("Deer permit and nonresident combination application period", "2026-03-01", "2026-04-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-April."),
         kd("Deer B license application period", "2026-03-01", "2026-06-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-June."),
         BP_BUY, PP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-bonus-points", "d-fwp-regs-dea-2026"]},
    {"species": "whitetail", "displayName": "White-tailed deer",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "Residents buy a General Deer License over the counter; a few antlered white-tailed buck permits "
                          "and many white-tailed Deer B (antlerless) licenses are drawn using squared bonus points. "
                          + SQUARED,
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": LANDOWNER,
     "nonresidentNote": NR_COMBO,
     "otcSummary": "Resident General Deer License over the counter ($16); some white-tailed Deer B licenses are sold over the counter beginning June 15.",
     "keyDates": [
         kd("Deer permit and nonresident combination application period", "2026-03-01", "2026-04-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST."),
         kd("Deer B license application period", "2026-03-01", "2026-06-01", "d-fwp-dates-2026", "Deadline 11:45 pm MST."),
         BP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-bonus-points", "d-fwp-regs-dea-2026"]},
    {"species": "pronghorn", "displayName": "Pronghorn (antelope)",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "All antelope licenses (either-sex Antelope, doe/fawn Antelope B, and archery-only 900-20/399-20) "
                          "are issued by drawing using squared bonus points. " + SQUARED,
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": LANDOWNER,
     "nonresidentNote": "Nonresidents apply in the antelope drawing ($205 including the drawing fee); limited to, but not guaranteed, 10% of each quota.",
     "otcSummary": "None; surplus licenses may be offered after the drawing.",
     "keyDates": [
         kd("Antelope, Antelope B and archery antelope application period", "2026-03-01", "2026-06-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as early August (archery 900-20 results mid-June per the 2026 regulations)."),
         BP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-regs-dea-2026", "d-fwp-bonus-points"]},
    {"species": "moose", "displayName": "Moose",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "Moose licenses are issued only by drawing with squared bonus points. A hunter who receives a moose "
                          "license must wait seven years before applying again (SuperTags excepted).",
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": "Resident license $125 plus $10 nonrefundable application fee.",
     "nonresidentNote": "Nonresident license $1,250 plus $50 nonrefundable application fee; limited to, but not guaranteed, 10% of the quota.",
     "otcSummary": "None.",
     "keyDates": [
         kd("Moose, sheep, goat and bison application period", "2026-03-01", "2026-05-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-May. Successful applicants must buy the license by Aug. 1."),
         BP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-regs-msgb-2026"]},
    {"species": "sheep", "displayName": "Bighorn sheep",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "Limited bighorn sheep licenses are drawn with squared bonus points; the limited district must be the "
                          "applicant's first and only choice (adult ewe may be a second choice). Ram license holders wait seven years. "
                          "Some districts offer unlimited ram licenses (one per hunter) with harvest quotas.",
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": "Resident license $125 plus $10 nonrefundable application fee.",
     "nonresidentNote": "Nonresident license $1,250 plus $50 nonrefundable application fee; limited to, but not guaranteed, 10% of the quota.",
     "otcSummary": "None for 2026. Unlimited (one per hunter) bighorn sheep licenses for unlimited-entry districts are no longer sold over "
                   "the counter: the 2026 regulations require all unlimited applications by May 1 (FWP's application-dates page still mentions "
                   "license providers). Unlimited licenses are not subject to the Aug. 1 purchase deadline.",
     "keyDates": [
         kd("Moose, sheep, goat and bison application period", "2026-03-01", "2026-05-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-May."),
         BP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-regs-msgb-2026"]},
    {"species": "goat", "displayName": "Mountain goat",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "Mountain goat licenses are issued only by drawing with squared bonus points; license holders wait "
                          "seven years before applying again (SuperTags excepted).",
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": "Resident license $125 plus $10 nonrefundable application fee.",
     "nonresidentNote": "Nonresident license $1,250 plus $50 nonrefundable application fee; limited to, but not guaranteed, 10% of the quota.",
     "otcSummary": "None.",
     "keyDates": [
         kd("Moose, sheep, goat and bison application period", "2026-03-01", "2026-05-01", "d-fwp-dates-2026",
            "Deadline 11:45 pm MST; FWP lists the drawing as mid-May."),
         BP_BUY],
     "sourceIds": ["d-fwp-dates-2026", "d-fwp-regs-msgb-2026"]},
    {"species": "bear", "displayName": "Black bear",
     "drawSystem": "bonus-squared",
     "drawSystemSummary": "The Black Bear License is sold over the counter and valid statewide; in 2026 FWP added black bear "
                          "permits (510-20, 520-20) drawn with bonus points, which let holders keep hunting those BMUs after the "
                          "harvest quota is met.",
     "pointsMatter": True, "pointName": "bonus point",
     "residentNote": "Black Bear License $19; permit application $5. First-time buyers must pass the Black Bear Identification Test.",
     "nonresidentNote": "Black Bear License $350; permit application $5.",
     "otcSummary": "Black Bear License over the counter (either-sex, all BMUs, subject to BMU harvest quotas).",
     "keyDates": [kd("Black bear permit application period", "2026-03-01", "2026-04-01", "d-fwp-dates-2026", "Deadline 11:45 pm MST.")],
     "sourceIds": ["d-fwp-regs-bear-2026", "d-fwp-dates-2026"]},
    {"species": "lion", "displayName": "Mountain lion",
     "drawSystem": "otc", "pastDrawSystem": "bonus-squared",
     "drawSystemSummary": "For 2026 the lion regulations list a single over-the-counter Mountain Lion License per hunter (buy by "
                          "Feb. 28, 2027), valid subject to LMU harvest quotas; there is no limited-lion drawing, and FWP had posted no "
                          "2026 limited-lion drawing statistics as of 2026-10-31. Through 2025 FWP issued Limited Mountain Lion licenses in "
                          "some LMUs by a drawing with squared bonus points; the 2022-2025 Limited Mountain Lion drawing results kept here "
                          "are history only (pastDrawSystem) and do not apply to the 2026 over-the-counter license.",
     "pointsMatter": False, "pointName": "bonus point",
     "residentNote": "Mountain Lion License $19.",
     "nonresidentNote": "Mountain Lion License $320; a $250 Nonresident Hound License (by drawing) is needed to hunt with dogs.",
     "otcSummary": "2026: Mountain Lion License over the counter (one per hunter), valid subject to LMU quotas.",
     "keyDates": [],
     "sourceIds": ["d-fwp-regs-lion-2026", "d-fwp-dates-2026", "d-fwp-fees-res", "d-fwp-fees-nr"]},
    {"species": "turkey", "displayName": "Wild turkey",
     "drawSystem": "otc",
     "drawSystemSummary": "Turkey licenses (General and regional) are sold over the counter; FWP published no turkey drawing statistics after 2021.",
     "pointsMatter": False,
     "residentNote": "Turkey license $6.50.",
     "nonresidentNote": "Turkey license $115 ($57.50 with an Upland Game Bird or Combination license). Nonresidents on public land "
                        "and hunting-access-program land start later (spring Apr. 25, fall Sep. 11 in 2026).",
     "otcSummary": "General Turkey License over the counter, plus regional licenses (Regions 1, 2, 4, 5, 6, 7).",
     "keyDates": [],
     "sourceIds": ["d-fwp-regs-upgbrd-2026", "d-fwp-fees-res", "d-fwp-fees-nr"]},
]


def fee(sp, item, res, amt, sid, note=None):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": sid}
    if note:
        f["note"] = note
    return f


DEA, MSGB = "d-fwp-regs-dea-2026", "d-fwp-regs-msgb-2026"
FEES = [
    fee(None, "Base Hunting License", "resident", 10.00, DEA, "Prerequisite for hunting or applying."),
    fee(None, "Base Hunting License", "nonresident", 50.00, DEA, "Prerequisite for hunting or applying."),
    fee(None, "Conservation License (18-61)", "resident", 8.00, DEA, "Prerequisite; $4 for youth/seniors."),
    fee(None, "Conservation License", "nonresident", 10.00, DEA, "Prerequisite."),
    fee(None, "Bonus point fee at application (per license/permit type)", "resident", 2.00, DEA),
    fee(None, "Bonus point fee at application (per license/permit type)", "nonresident", 20.00, DEA),
    fee(None, "Bonus point purchase without applying (per species)", "resident", 15.00, DEA, "July 1 - Sept. 30."),
    fee(None, "Bonus point purchase without applying (per species, except moose/sheep/goat)", "nonresident", 25.00, DEA, "July 1 - Sept. 30."),
    fee(None, "Preference point (nonresident combination licenses)", "nonresident", 100.00, "d-fwp-fees-nr"),
    fee(None, "Sportsman's with bear", "resident", 79.50, DEA,
        "Sportsman license includes general elk, general deer, season fishing and upland game bird licenses."),
    fee(None, "Sportsman's without bear (18-61)", "resident", 64.50, DEA,
        "Sportsman license includes general elk, general deer, season fishing and upland game bird licenses."),
    fee("elk", "General Elk License (18-61)", "resident", 20.00, DEA),
    fee("elk", "Elk Permit - drawing only", "resident", 9.00, DEA, "Used with a General Elk License; nonrefundable."),
    fee("elk", "Elk B License - drawing only", "resident", 25.00, DEA, "Antlerless only."),
    fee("elk", "Elk B License - OTC", "resident", 20.00, DEA),
    fee("elk", "General Big Game (Deer & Elk) Combination - drawing", "nonresident", 1312.00, "d-fwp-fees-nr",
        "Includes general deer, general elk, upland bird and season fishing licenses."),
    fee("elk", "General Elk Combination - drawing", "nonresident", 1112.00, "d-fwp-fees-nr"),
    fee("elk", "Elk Permit - drawing", "nonresident", 9.00, DEA, "Must also apply for a Big Game or Elk Combination."),
    fee("elk", "Elk B - drawing", "nonresident", 275.00, DEA, "Antlerless; includes drawing fee."),
    fee("elk", "Elk B - OTC", "nonresident", 270.00, DEA),
    fee("mule-deer", "General Deer License (18-61)", "resident", 16.00, DEA),
    fee("mule-deer", "Deer Permit - drawing only", "resident", 5.00, DEA, "Application fee only; used with a General Deer License."),
    fee("mule-deer", "Deer B License - drawing only", "resident", 15.00, DEA, "Antlerless only."),
    fee("mule-deer", "General Deer Combination - drawing", "nonresident", 760.00, "d-fwp-fees-nr"),
    fee("mule-deer", "Deer Permit - drawing", "nonresident", 5.00, DEA),
    fee("mule-deer", "Deer B - drawing", "nonresident", 80.00, DEA),
    fee("whitetail", "General Deer License (18-61)", "resident", 16.00, DEA),
    fee("whitetail", "Deer B License - drawing only", "resident", 15.00, DEA),
    fee("whitetail", "Deer B License - OTC", "resident", 10.00, DEA),
    fee("whitetail", "General Deer Combination - drawing", "nonresident", 760.00, "d-fwp-fees-nr"),
    fee("whitetail", "Deer B - drawing", "nonresident", 80.00, DEA),
    fee("whitetail", "Deer B - OTC", "nonresident", 75.00, DEA),
    fee("pronghorn", "Antelope or Antelope B License - drawing only", "resident", 19.00, DEA),
    fee("pronghorn", "900 and 399 Archery Antelope - drawing only", "resident", 19.00, DEA, "Must be first and only choice."),
    fee("pronghorn", "Antelope - drawing", "nonresident", 205.00, DEA),
    fee("pronghorn", "Archery 900 - drawing", "nonresident", 205.00, DEA, "Must be first and only choice."),
    fee("moose", "Moose - drawing", "resident", 125.00, MSGB, "Plus $10 nonrefundable application fee."),
    fee("moose", "Moose - drawing", "nonresident", 1250.00, MSGB, "Plus $50 nonrefundable application fee."),
    fee("moose", "Moose/sheep/goat/bison application fee", "resident", 10.00, MSGB),
    fee("moose", "Moose/sheep/goat/bison application fee", "nonresident", 50.00, MSGB),
    fee("moose", "Bonus point purchase without applying (moose)", "nonresident", 75.00, DEA, "July 1 - Sept. 30."),
    fee("sheep", "Bighorn Sheep - drawing", "resident", 125.00, MSGB, "Plus $10 nonrefundable application fee."),
    fee("sheep", "Bighorn Sheep - drawing", "nonresident", 1250.00, MSGB, "Plus $50 nonrefundable application fee."),
    fee("sheep", "Bonus point purchase without applying (sheep)", "nonresident", 75.00, DEA, "July 1 - Sept. 30."),
    fee("goat", "Mountain Goat - drawing", "resident", 125.00, MSGB, "Plus $10 nonrefundable application fee."),
    fee("goat", "Mountain Goat - drawing", "nonresident", 1250.00, MSGB, "Plus $50 nonrefundable application fee."),
    fee("goat", "Bonus point purchase without applying (goat)", "nonresident", 75.00, DEA, "July 1 - Sept. 30."),
    fee("bear", "Black Bear License", "resident", 19.00, "d-fwp-regs-bear-2026"),
    fee("bear", "Black Bear License", "nonresident", 350.00, "d-fwp-regs-bear-2026"),
    fee("bear", "Black Bear Permit (application)", "resident", 5.00, "d-fwp-regs-bear-2026", "Apply by April 1."),
    fee("bear", "Black Bear Permit (application)", "nonresident", 5.00, "d-fwp-regs-bear-2026", "Apply by April 1."),
    fee("lion", "Mountain Lion License", "resident", 19.00, "d-fwp-regs-lion-2026", "Purchase by Feb. 28, 2027."),
    fee("lion", "Mountain Lion License", "nonresident", 320.00, "d-fwp-regs-lion-2026", "Purchase by Feb. 28, 2027."),
    fee("lion", "Nonresident Hound License", "nonresident", 250.00, "d-fwp-regs-lion-2026", "Required to hunt with dogs; by drawing."),
    fee("turkey", "Turkey", "resident", 6.50, "d-fwp-fees-res"),
    fee("turkey", "Turkey", "nonresident", 115.00, "d-fwp-fees-nr"),
    fee("turkey", "Turkey (w/Upland Game Bird or Combination)", "nonresident", 57.50, "d-fwp-fees-nr"),
]


def season(sp, label, start, end, sid, note=None, year=2026):
    s = {"species": sp, "label": label, "start": start, "end": end, "year": year, "sourceId": sid}
    if note:
        s["note"] = note
    return s


GEN = "FWP 'general' dates; check hunting-district regulations for exceptions."
SEASONS = [
    season("elk", "Archery Only Season", "2026-09-05", "2026-10-18", DEA, GEN),
    season("elk", "General season", "2026-10-24", "2026-11-29", DEA, GEN),
    season("elk", "Backcountry HDs 150, 280, 316 - archery", "2026-09-05", "2026-09-14", DEA, "HD 316 has no Archery Only Season."),
    season("elk", "Backcountry HDs 150, 280, 316 - general", "2026-09-15", "2026-11-29", DEA),
    season("mule-deer", "Archery Only Season", "2026-09-05", "2026-10-18", DEA, GEN),
    season("mule-deer", "Youth two-day deer hunt", "2026-10-15", "2026-10-16", DEA, "Youth and apprentice hunters 10-15."),
    season("mule-deer", "General season", "2026-10-24", "2026-11-29", DEA, GEN),
    season("whitetail", "Archery Only Season", "2026-09-05", "2026-10-18", DEA, GEN),
    season("whitetail", "Youth two-day deer hunt", "2026-10-15", "2026-10-16", DEA, "Youth and apprentice hunters 10-15."),
    season("whitetail", "General season", "2026-10-24", "2026-11-29", DEA, GEN),
    season("pronghorn", "900 series archery", "2026-08-15", "2026-11-08", DEA),
    season("pronghorn", "Archery Only Season", "2026-09-05", "2026-10-09", DEA, GEN),
    season("pronghorn", "General season", "2026-10-10", "2026-11-08", DEA, GEN),
    season("moose", "Archery Only Season", "2026-09-05", "2026-09-14", MSGB, GEN),
    season("moose", "General season", "2026-09-15", "2026-11-29", MSGB, GEN),
    season("sheep", "Archery Only Season (limited-entry districts)", "2026-09-05", "2026-09-14", MSGB, GEN),
    season("sheep", "General season", "2026-09-15", "2026-11-29", MSGB, GEN),
    season("goat", "Archery Only Season", "2026-09-05", "2026-09-14", MSGB, GEN),
    season("goat", "General season", "2026-09-15", "2026-11-29", MSGB, GEN),
    season("lion", "Archery Only Season without dogs", "2026-09-05", "2026-10-18", "d-fwp-regs-lion-2026",
           "All LMUs except 150 and the Scapegoat Wilderness portion of 280."),
    season("lion", "Fall season without dogs", "2026-10-24", "2026-11-29", "d-fwp-regs-lion-2026",
           "All LMUs except 150 and the Scapegoat Wilderness portion of 280."),
    season("lion", "Winter season", "2026-12-01", "2027-05-25", "d-fwp-regs-lion-2026",
           "All LMUs except 150 and the Scapegoat Wilderness portion of 280; closes by LMU when quotas are reached."),
    season("turkey", "Spring season (General Turkey License)", "2026-04-15", "2026-05-31", "d-fwp-regs-upgbrd-2026",
           "Residents, and nonresidents on private land not in a hunting access program; nonresidents on public/access-program land start Apr. 25. Male turkey, shotgun/archery only."),
    season("turkey", "Fall season (General Turkey License)", "2026-09-01", "2027-01-01", "d-fwp-regs-upgbrd-2026",
           "Residents, and nonresidents on private land not in a hunting access program; nonresidents on public/access-program land start Sep. 11. Either-sex; not valid in Region 4."),
]

OVERVIEW = ("Montana FWP draws limited deer and elk permits, Deer B and Elk B licenses, all antelope licenses, and moose, "
            "bighorn sheep and mountain goat licenses using bonus points that are squared before the drawing "
            "((points x points) + 1 chances, first choice only). Most nonresidents must first draw a General Big Game, Elk or "
            "Deer Combination license, 75% of which go to applicants with the most preference points and 25% at random to "
            "applicants with none. Nonresidents are limited to, but not guaranteed, 10% of each drawing's quota, and up to 15% "
            "of deer, elk and antelope quotas are reserved for landowner preference.")


def main(raw, repo):
    drawdir = os.path.join(repo, "src/data/agency/montana/draw")
    parsed = {s["id"]: s for s in json.load(open(os.path.join(raw, "parsed-sources.json")))}
    used = set()
    years = collections.defaultdict(set)
    for f in sorted(os.listdir(drawdir)):
        for r in json.load(open(os.path.join(drawdir, f))):
            used.add(r["sourceId"])
            years[r["species"]].add(r["year"])
            note = r.get("note", "")
            for tok in re.findall(r"d-fwp-[a-z0-9-]+[a-z0-9]", note):
                used.add(tok)
    sources = []
    for s in STATIC_SOURCES:
        s = dict(s)
        s.setdefault("publisher", PUB)
        s.setdefault("retrieved", R)
        sources.append(s)
    static_ids = {s["id"] for s in sources}
    for sid in sorted(used):
        if sid in static_ids:
            continue
        if sid not in parsed:
            raise SystemExit(f"source {sid} referenced but not parsed")
        sources.append(parsed[sid])
    cov_notes = {
        "elk": "Elk permits and Elk B licenses (FWP drawing statistics + detailed bonus point reports), first choice, 2022-2026; plus "
               "the nonresident General Big Game/Elk Combination preference-point summary (huntCode NR-BIGGAME-ELK-COMBO). 2022 elk "
               "permit reports are FWP's 'Original Drawing'. Resident/nonresident = regular pool; landowner-preference pool in each row note.",
        "mule-deer": "Deer permits and Deer B licenses classified as mule deer by FWP's regulations text or report quota type, 2022-2026; "
                     "permit 455-60 (mule deer or white-tailed deer) appears in both deer files; NR General Deer Combination summary "
                     "(NR-DEER-COMBO) appears in both deer files.",
        "whitetail": "Deer permits and Deer B licenses classified as white-tailed deer by FWP's regulations text or report quota type, "
                     "2022-2026; see mule-deer note for shared records.",
        "pronghorn": "Antelope, Antelope B and archery-only (900-20; 399-20 from 2026) licenses, 2022-2026. FWP's statewide ANY-DISABLED "
                     "antelope row is omitted (incomplete columns in the report); it accounts for the gap between the sum of districts and FWP's statewide totals.",
        "moose": "Moose licenses 2022-2026. 2022 descriptions come from the report only (2022 MSGB regulations not in FWP's online archive).",
        "sheep": "Limited bighorn sheep licenses 2022-2026 (unlimited licenses are not drawn and have no drawing statistics).",
        "goat": "Mountain goat licenses 2022-2026.",
        "bear": "Black bear permits 510-20 and 520-20, first offered in 2026.",
        "lion": "Limited mountain lion licenses 2022-2025. No 2026 limited-lion drawing statistics were posted by FWP as of 2026-10-31.",
        "turkey": "No drawing: turkey licenses are over the counter; FWP's last spring turkey drawing statistics are for 2021 (outside 2022-2026).",
    }
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "bear", "lion", "turkey"]:
        coverage.append({"species": sp, "years": sorted(years.get(sp, [])),
                         "notes": cov_notes[sp] + " Units = hunting districts under which FWP's regulations list the license "
                                                  "(many licenses are valid only in portions of those districts)."})
    meta = {
        "slug": "montana", "name": "Montana", "abbrev": "MT",
        "agency": {"name": PUB, "shortName": "FWP", "url": "https://fwp.mt.gov"},
        "unitTerm": "Hunting District", "lastReviewed": R, "overview": OVERVIEW,
        "species": SPECIES, "fees": FEES, "seasons": SEASONS, "coverage": coverage, "sources": sources,
    }
    with open(os.path.join(repo, "src/data/agency/montana/draw-meta.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    print("sources:", len(sources), "species:", len(SPECIES), "fees:", len(FEES), "seasons:", len(SEASONS))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
