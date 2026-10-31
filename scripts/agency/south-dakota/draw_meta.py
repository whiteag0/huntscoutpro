#!/usr/bin/env python3
"""Write src/data/agency/south-dakota/draw-meta.json.

Facts below were transcribed from the South Dakota GFP pages and 2026 season
application PDFs listed in SOURCES (downloaded 2026-10-31 by hand/curl into the
raw directory; see draw_download.py for the draw statistics). Coverage is
computed from the parsed draw/<species>.json files.

Usage:  python -I draw_meta.py <repo_root>
"""
import json
import os
import sys

R = "2026-10-31"
PUB = "South Dakota Game, Fish and Parks"
DS = "https://license.gooutdoorssouthdakota.com/License/DrawStatistics"
NOT27 = "2027 dates not yet published by SD GFP as of 2026-10-31."

SOURCES = [
    *[{"id": f"d-sd-drawstats-{y}", "title": f"Draw Statistics ({y}): Draw Results and Draw Preference Breakdown by season, application period and license",
       "publisher": PUB, "url": DS, "pageUrl": "https://gfp.sd.gov/draw-stats/", "dataYear": y, "retrieved": R,
       "notes": "GFP Go Outdoors South Dakota licensing system; one query per Year / Season / Application Period / License (AJAX endpoints GetDrawResults and GetDrawPreferences)."}
      for y in (2022, 2023, 2024, 2025, 2026)],
    {"id": "d-sd-prefpoints", "title": "Preference Points", "publisher": PUB, "url": "https://gfp.sd.gov/preference-points", "retrieved": R,
     "notes": "Includes cubed preference points and the drawing procedures (preference pools) for deer, antelope, turkey and elk."},
    {"id": "d-sd-prefpoints-fees", "title": "Preference Points and Fees Reference (General Application Information)", "publisher": PUB,
     "url": "https://gfp.sd.gov/images/Licensing/Preference%20Points%20and%20Fees%20Reference.pdf", "pageUrl": "https://gfp.sd.gov/hunt-fish-license/", "retrieved": R},
    {"id": "d-sd-applicant-info", "title": "Applicant Information Reference (Application Information)", "publisher": PUB,
     "url": "https://gfp.sd.gov/images/Licensing/Applicant%20Information%20Reference.pdf", "pageUrl": "https://gfp.sd.gov/hunt-fish-license/", "retrieved": R},
    {"id": "d-sd-license-types", "title": "License Types & Costs", "publisher": PUB, "url": "https://gfp.sd.gov/license-types/", "retrieved": R,
     "notes": "Current fee table as posted on 2026-10-31 (2026 license year)."},
    {"id": "d-sd-keydates", "title": "Key Dates", "publisher": PUB, "url": "https://gfp.sd.gov/events/keydates", "dataYear": 2026, "retrieved": R,
     "notes": "Season and online application dates; all entries are 2026 seasons."},
    {"id": "d-sd-hunt", "title": "Hunt (big game species list)", "publisher": PUB, "url": "https://gfp.sd.gov/hunt/", "retrieved": R},
    {"id": "d-sd-elk-page", "title": "Elk", "publisher": PUB, "url": "https://gfp.sd.gov/elk/", "retrieved": R},
    {"id": "d-sd-goat-page", "title": "Mountain Goat", "publisher": PUB, "url": "https://gfp.sd.gov/mountain-goat/", "retrieved": R},
    {"id": "d-sd-nonres-info", "title": "Nonresident License Information", "publisher": PUB, "url": "https://gfp.sd.gov/nonresident-license-information", "retrieved": R},
    {"id": "d-sd-elk-2026", "title": "2026 Elk (application)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/2026elk.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-wrdeer-2026", "title": "2026 West River Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/2026westriverdeer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-erdeer-2026", "title": "2026 East River Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/nav/2026eastriverdeer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-bhdeer-2026", "title": "2026 Black Hills & CSP Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/nav/2026blackhills-CSPdeer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-muzzdeer-2026", "title": "2026 Muzzleloader Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/nav/2026muzzleloaderdeer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-refugedeer-2026", "title": "2026 National Wildlife Refuge Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/2026refugedeer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-specialbuck-2026", "title": "2026 Special Buck (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/nav/2026specialbuck-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-nrarchdeer-2026", "title": "2026 Nonresident Archery Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/nonresident-archery-deer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-resarchdeer-2026", "title": "2026 Resident Archery Deer (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/docs/resident-archery-deer-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-antelope-2026", "title": "2026 Firearms Antelope (application)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/firearmsantelope.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-sheep-2026", "title": "2026 Bighorn Sheep (application)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/2026bhsheep.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-springturkey-prairie-2026", "title": "2026 Spring Turkey - Prairie (application)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/2026springturkey-prairie-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-springturkey-bh-2026", "title": "2026 Spring Turkey - Archery, Black Hills, Custer State Park, and Mentored (application)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/2026springturkey-AST_BST_CST_MST-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-fallturkey-2026", "title": "2026 Fall Turkey (application)", "publisher": PUB, "url": "https://gfp.sd.gov/UserDocs/docs/fallturkey-app.pdf", "dataYear": 2026, "retrieved": R},
    {"id": "d-sd-lion-2026", "title": "2026 Mountain Lion (application / season)", "publisher": PUB, "url": "https://gfp.sd.gov/userdocs/docs/2026mountainlion.pdf", "dataYear": 2026, "retrieved": R},
]

DRAWSTATS = [f"d-sd-drawstats-{y}" for y in (2022, 2023, 2024, 2025, 2026)]


def kd(label, cycle, sid, start=None, end=None, date=None, note=None, status="confirmed"):
    d = {"label": label}
    if date:
        d["date"] = date
    if start:
        d["start"], d["end"] = start, end
    d["cycle"] = cycle
    d["status"] = status
    d["note"] = (note + " " if note else "") + NOT27
    d["sourceId"] = sid
    return d


PREF_BUY = lambda: kd("Preference point purchase period (in lieu of an application)", 2026, "d-sd-prefpoints", "2026-09-15", "2026-12-15",
                      note="GFP lists September 15 - December 15 without a year; shown for the 2026 window. Some limited-license seasons only (not elk, sheep or goat, which award points automatically).")

DEER_SUMMARY = ("Deer licenses are drawn season by season (West River, East River, Black Hills, Custer State Park, Muzzleloader, National Wildlife Refuge, "
                "Special Buck and others) in a combined deer draw that limits how many applications a person may submit. In the first draw, 50% of a unit's "
                "licenses are offered to qualifying landowners with preference, then a 2+ preference pool receives 50% plus any landowner leftovers, then 1+ and "
                "0+ pools (no 0+ applicant draws until every 1+ applicant has a license), then second choices; within each pool GFP cubes the number of times an "
                "applicant's name is entered, which improves but does not guarantee odds.")
DEER_KEYDATES = lambda: [
    kd("West River, East River, Black Hills & CSP, Muzzleloader and Refuge deer - first draw application period", 2026, "d-sd-wrdeer-2026", "2026-05-27", "2026-06-23",
       note="Closes 8:00 AM CDT. GFP's Key Dates page lists Jun 3 - Jun 23, 2026."),
    kd("Deer first draw results available", 2026, "d-sd-wrdeer-2026", date="2026-07-02"),
    kd("Deer second draw application period", 2026, "d-sd-wrdeer-2026", "2026-07-08", "2026-07-22", note="Results 2026-07-27."),
    kd("Deer third draw application period", 2026, "d-sd-wrdeer-2026", "2026-07-29", "2026-08-12", note="Results 2026-08-14."),
    kd("Deer fourth draw application period", 2026, "d-sd-wrdeer-2026", "2026-08-18", "2026-09-01", note="Results 2026-09-04."),
    kd("West River deer leftover licenses (first-come, first-served)", 2026, "d-sd-wrdeer-2026", "2026-09-09", "2026-11-29"),
    kd("Special Buck first draw application period (East River ESD, West River WSD)", 2026, "d-sd-specialbuck-2026", "2026-03-11", "2026-04-14",
       note="Results 2026-04-15. GFP's Key Dates page lists Mar 18/19 - Apr 14, 2026."),
    kd("Nonresident archery deer (public/private land, ADNP-ST1) application period", 2026, "d-sd-nrarchdeer-2026", "2026-05-13", "2026-06-09",
       note="Results 2026-06-12. GFP's Key Dates page lists May 20 - Jun 9, 2026."),
    kd("Archery deer access permit application period", 2026, "d-sd-resarchdeer-2026", "2026-06-10", "2026-07-01", note="Results 2026-07-03."),
    PREF_BUY(),
]
DEER_COMMON = {
    "drawSystem": "hybrid",
    "drawSystemSummary": DEER_SUMMARY,
    "pointsMatter": True,
    "pointName": "preference point",
    "residentNote": ("Residents are eligible for all units with some exceptions. Unsuccessful first-choice applicants may buy one preference point per season per year "
                     "($5 resident); points must be used for the first choice in the first draw and are lost when a license is drawn with them. Residents who held a "
                     "Custer State Park buck license in the preceding nine years may not apply for CSP deer."),
    "nonresidentNote": ("Nonresidents may apply for West River, Black Hills, Muzzleloader (antlerless whitetail only), Refuge and West River Special Buck deer; East River "
                        "deer licenses are resident-only until the leftover period, and the East River Special Buck is resident-only. Nonresident archery deer for "
                        "public and private land (ADNP-ST1) is a draw (2,200 licenses in 2026); preference points are $20 for nonresidents. Nonresident quotas are "
                        "printed per unit in each season's application (e.g. 2026 West River unit 02A type 01: 400 resident, 32 nonresident)."),
    "otcSummary": ("Resident archery deer licenses (ST1, ER1, WR1, LM1) are unlimited and sold over the counter from 2026-06-10; nonresident private-land-only "
                   "archery buck (ADN-ST1) and antlerless whitetail archery (ADNP-LM1) licenses are unlimited over the counter; muzzleloader antlerless whitetail "
                   "(LM1-13) is unlimited over the counter from 2026-09-03; leftover rifle licenses are first-come, first-served after the fourth draw."),
    "sourceIds": DRAWSTATS + ["d-sd-prefpoints", "d-sd-prefpoints-fees", "d-sd-wrdeer-2026", "d-sd-erdeer-2026", "d-sd-bhdeer-2026", "d-sd-muzzdeer-2026",
                              "d-sd-refugedeer-2026", "d-sd-specialbuck-2026", "d-sd-nrarchdeer-2026", "d-sd-resarchdeer-2026", "d-sd-keydates"],
}

SPECIES = [
    {
        "species": "elk", "displayName": "Elk (residents only)", "drawSystem": "hybrid",
        "drawSystemSummary": ("Only South Dakota residents may apply for elk, and a person may hold one elk license per year; seasons are drawn in order (CSP Firearms, "
                              "CSP Early Archery, Black Hills Firearms, Prairie Firearms, Black Hills Archery, CSP Special Antlerless). For Black Hills firearms, archery "
                              "and prairie drawings 50% of a unit's licenses go to approved landowners, then 30% to a 10+ preference pool, 15% to a 2+ pool and 5% to a "
                              "0+ pool (Custer State Park: 34% 15+, 33% 10+, 33% 0+); GFP cubes the number of entries per applicant, so points improve but do not "
                              "guarantee odds."),
        "pointsMatter": True, "pointName": "preference point",
        "residentNote": ("Unsuccessful first-choice elk applicants receive one preference point per season automatically. Successful applicants who used points lose "
                         "them and cannot apply in the first draw for that season (or buy points for it) for nine years; CSP Early Archery and CSP Firearms elk are "
                         "once in a lifetime. There are no second choices in the first elk draw; maximum group size is 2; a $10 non-refundable application fee is "
                         "charged per season."),
        "nonresidentNote": "Nonresidents are not eligible to apply for or receive a South Dakota elk license.",
        "otcSummary": ("No over-the-counter elk license. GFP's 2026 elk application lists Unlimited any-elk (type 21) licenses for Prairie unit PRE-ERA, and a "
                       "Prairie Elk landowner-own-land license is applied for separately (2026: Jul 14 - Dec 31)."),
        "keyDates": [
            kd("Elk first draw application period", 2026, "d-sd-elk-2026", "2026-04-15", "2026-05-19",
               note="Closes 8:00 AM CDT. GFP's Key Dates page lists Apr 22 - May 19, 2026."),
            kd("Elk first draw results available", 2026, "d-sd-elk-2026", date="2026-05-27"),
            kd("Elk second draw application period", 2026, "d-sd-elk-2026", "2026-05-28", "2026-06-11", note="Results 2026-06-15."),
            kd("Elk landowner preference application period", 2026, "d-sd-keydates", "2026-03-12", "2026-04-02"),
            kd("Elk license return deadline", 2026, "d-sd-elk-2026", date="2026-08-01", note="$10 return fee."),
        ],
        "sourceIds": DRAWSTATS + ["d-sd-prefpoints", "d-sd-prefpoints-fees", "d-sd-elk-2026", "d-sd-elk-page", "d-sd-keydates"],
    },
    {"species": "mule-deer", "displayName": "Mule deer (any-deer licenses)", **DEER_COMMON, "keyDates": DEER_KEYDATES()},
    {"species": "whitetail", "displayName": "White-tailed deer", **DEER_COMMON, "keyDates": DEER_KEYDATES()},
    {
        "species": "pronghorn", "displayName": "Pronghorn (antelope)", "drawSystem": "hybrid",
        "drawSystemSummary": ("Firearms antelope (prairie units), Custer State Park antelope, Special Antelope (private land) and nonresident archery antelope are "
                              "drawn with the same preference pools as deer: landowners with preference (50%), then 2+, 1+ and 0+ preference pools and second "
                              "choices, with GFP cubing each applicant's entries."),
        "pointsMatter": True, "pointName": "preference point",
        "residentNote": ("Unsuccessful first-choice applicants may buy a preference point ($5). Successful Custer State Park antelope applicants cannot reapply for "
                         "nine years. Two firearms draws in 2026."),
        "nonresidentNote": ("Nonresidents may apply for prairie firearms units (small nonresident quotas, e.g. 2026 unit 27A: 350 resident / 7 nonresident), "
                            "Special Antelope (2026: 50 resident / 50 nonresident) and the nonresident archery public & private land draw; CSP antelope is "
                            "resident-only. Preference points $20."),
        "otcSummary": ("GFP's draw statistics include no resident archery antelope drawing; GFP Key Dates lists the archery antelope application/purchase "
                       "window as Jul 22 - Oct 31, 2026. Eligible nonresident landowners may buy a landowner-own-land firearm antelope license."),
        "keyDates": [
            kd("Firearms antelope first draw application period", 2026, "d-sd-antelope-2026", "2026-06-16", "2026-07-07",
               note="Closes 8:00 AM CDT; results 2026-07-08. GFP's Key Dates page lists Jun 23 - Jul 7, 2026."),
            kd("Firearms antelope second draw application period", 2026, "d-sd-antelope-2026", "2026-07-09", "2026-07-23", note="Results 2026-07-27."),
            kd("Nonresident archery antelope (public/private land) application period", 2026, "d-sd-keydates", "2026-06-23", "2026-07-07"),
            PREF_BUY(),
        ],
        "sourceIds": DRAWSTATS + ["d-sd-prefpoints", "d-sd-prefpoints-fees", "d-sd-antelope-2026", "d-sd-keydates", "d-sd-nonres-info"],
    },
    {
        "species": "sheep", "displayName": "Bighorn sheep (Rocky Mountain; residents only)", "drawSystem": "hybrid",
        "drawSystemSummary": ("Ram-only bighorn licenses for the Black Hills (BHS, units BH2 and BH4) and Custer State Park (CBS, CU1) are drawn for residents; GFP's "
                              "draw results show 10+, 2+ and 0+ preference pools, and every bighorn season and unit is once in a lifetime."),
        "pointsMatter": True, "pointName": "preference point",
        "residentNote": ("Only South Dakota residents who have never received a South Dakota bighorn sheep license may apply; unsuccessful applicants receive a "
                         "preference point automatically; no group applications; $10 non-refundable application fee; successful hunters must attend an "
                         "orientation. 2026 quotas: BH2 3, BH4 2, CU1 2."),
        "nonresidentNote": "No nonresident bighorn sheep licenses.",
        "otcSummary": "None.",
        "keyDates": [
            kd("Bighorn sheep application period", 2026, "d-sd-sheep-2026", "2026-04-15", "2026-05-19",
               note="Closes 8:00 AM CDT. GFP's Key Dates page lists Apr 22 - May 19, 2026."),
            kd("Bighorn sheep draw results available", 2026, "d-sd-sheep-2026", date="2026-05-27"),
        ],
        "sourceIds": DRAWSTATS + ["d-sd-sheep-2026", "d-sd-prefpoints-fees", "d-sd-applicant-info"],
    },
    {
        "species": "goat", "displayName": "Mountain goat", "drawSystem": "none",
        "drawSystemSummary": ("GFP lists the mountain goat hunting season as closed. The last mountain goat drawing in GFP's draw statistics is 2022 (license BG155, "
                              "one any mountain goat, Black Hills), shown here as history only."),
        "pointsMatter": False,
        "residentNote": "Season closed; historically residents only.",
        "nonresidentNote": "Season closed.",
        "otcSummary": "None (season closed).",
        "keyDates": [],
        "sourceIds": ["d-sd-goat-page", "d-sd-drawstats-2022"],
    },
    {
        "species": "lion", "displayName": "Mountain lion (residents only)", "drawSystem": "otc",
        "drawSystemSummary": ("Resident mountain lion licenses ($30) are unlimited and sold over the counter; the Black Hills Fire Protection District season closes "
                              "early when 60 lions or 40 females are taken. Access permits to hunt with dogs in a designated part of the Black Hills Fire "
                              "Protection District are issued by random drawing for set hunting intervals (3 permits per interval in 2026); GFP's draw statistics title "
                              "this drawing 'Custer State Park Mountain Lion Access Permit' for 2023-2025 and 'Mountain Lion Access Permit' for 2026."),
        "pointsMatter": False,
        "residentNote": "One mountain lion per person per season; access permit required only to hunt with dogs inside the designated Black Hills area.",
        "nonresidentNote": "No nonresident mountain lion license (GFP fee table lists N/A).",
        "otcSummary": "Resident license over the counter, unlimited: 2026 season purchases opened 2025-11-26.",
        "keyDates": [
            kd("Mountain lion dog-hunting access permit application period (2026 season)", 2026, "d-sd-lion-2026", "2025-11-06", "2025-12-03",
               note="Closes 8:00 AM CDT; results 2025-12-05. The 2027-season (Dec 2026) access permit dates were not found on GFP's site as of 2026-10-31."),
        ],
        "sourceIds": DRAWSTATS[1:] + ["d-sd-lion-2026", "d-sd-license-types"],
    },
    {
        "species": "turkey", "displayName": "Wild turkey", "drawSystem": "hybrid",
        "drawSystemSummary": ("Prairie spring and prairie fall turkey licenses, nonresident Black Hills spring, Custer State Park spring and archery access permits are "
                              "drawn with GFP's landowner and 2+/1+/0+ preference pools (cubed entries); in the third prairie spring draw remaining licenses are "
                              "pooled for residents and nonresidents."),
        "pointsMatter": True, "pointName": "preference point",
        "residentNote": ("Residents may apply for all prairie units; Black Hills spring (BST) and archery (AST) licenses are unlimited over the counter for "
                         "residents; Custer State Park spring (100 licenses in 2026) and archery access permits are resident-only draws."),
        "nonresidentNote": ("Nonresidents may apply for prairie units west of the Missouri River and East River licenses remaining after the second drawing; the "
                            "nonresident Black Hills spring license is a limited draw (2,225 licenses in 2026); archery turkey is unlimited for nonresidents."),
        "otcSummary": "Spring archery (statewide except CSP), resident Black Hills spring and mentored licenses over the counter; leftover prairie licenses first-come, first-served.",
        "keyDates": [
            kd("Prairie spring turkey first draw application period", 2026, "d-sd-springturkey-prairie-2026", "2026-01-14", "2026-02-11",
               note="Closes 8:00 AM CDT; results 2026-02-13. GFP's Key Dates page also lists Jan 14 - Feb 11, 2026 for Spring Prairie."),
            kd("Prairie spring turkey second draw application period", 2026, "d-sd-springturkey-prairie-2026", "2026-02-18", "2026-03-04", note="Results 2026-03-06."),
            kd("Prairie spring turkey third draw application period", 2026, "d-sd-springturkey-prairie-2026", "2026-03-10", "2026-03-24", note="Results 2026-03-26."),
            kd("Nonresident Black Hills and Custer State Park spring turkey application period", 2026, "d-sd-springturkey-bh-2026", "2026-01-14", "2026-02-11",
               note="Closes 8:00 AM CDT; results 2026-02-13. GFP's Key Dates page lists Jan 21 - Feb 11, 2026 for these seasons; the 2026 application PDF date is used."),
            kd("Fall turkey first draw application period", 2026, "d-sd-fallturkey-2026", "2026-08-11", "2026-09-02", note="Closes 8:00 AM CDT; results 2026-09-09. GFP's Key Dates page lists Aug 18 - Sep 2, 2026; the 2026 application PDF date is used."),
            kd("Fall turkey second draw application period", 2026, "d-sd-fallturkey-2026", "2026-09-11", "2026-09-22", note="Results 2026-09-25."),
            kd("Fall turkey third draw application period", 2026, "d-sd-fallturkey-2026", "2026-09-29", "2026-10-13", note="Results 2026-10-14."),
            PREF_BUY(),
        ],
        "sourceIds": DRAWSTATS + ["d-sd-prefpoints", "d-sd-springturkey-prairie-2026", "d-sd-springturkey-bh-2026", "d-sd-fallturkey-2026", "d-sd-keydates"],
    },
    {"species": "moose", "displayName": "Moose", "drawSystem": "none", "pointsMatter": False,
     "drawSystemSummary": "South Dakota has no moose hunting season; moose is not among GFP's big game species.", "keyDates": [], "sourceIds": ["d-sd-hunt"]},
    {"species": "bear", "displayName": "Black bear", "drawSystem": "none", "pointsMatter": False,
     "drawSystemSummary": "South Dakota has no black bear hunting season; black bear is not among GFP's big game species.", "keyDates": [], "sourceIds": ["d-sd-hunt"]},
]

LT = "d-sd-license-types"


def fee(sp, item, res, amt, sid=LT, note=None):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": sid}
    if note:
        f["note"] = note
    return f


FEES = [
    fee(None, "Habitat Stamp (age 18+, once per license year)", "resident", 10, "d-sd-prefpoints-fees"),
    fee(None, "Habitat Stamp (age 18+, once per license year)", "nonresident", 25, "d-sd-prefpoints-fees"),
    fee(None, "Preference point", "resident", 5, "d-sd-prefpoints-fees", "Purchasable seasons only; elk, sheep and goat points are automatic."),
    fee(None, "Preference point", "nonresident", 20, "d-sd-prefpoints-fees", "Purchasable seasons only."),
    fee(None, "License return fee (returned by the deadline)", "resident", 10, "d-sd-prefpoints"),
    fee(None, "License return fee (returned by the deadline)", "nonresident", 30, "d-sd-prefpoints"),
    fee("elk", "Elk application fee (per season applied for, non-refundable)", "resident", 10, "d-sd-elk-2026"),
    fee("elk", "Elk (Archery, Black Hills, Prairie) - Any Elk", "resident", 195),
    fee("elk", "Elk (Archery, Black Hills, Prairie) - Antlerless Elk", "resident", 127),
    fee("elk", "Elk | Custer State Park - Any Elk", "resident", 306),
    fee("elk", "Custer State Park antlerless elk (23 - one antlerless elk)", "resident", 206, "d-sd-elk-2026"),
    fee("sheep", "Bighorn Sheep", "resident", 300),
    fee("sheep", "Custer Bighorn Sheep", "resident", 506),
    fee("sheep", "Bighorn sheep application fee (non-refundable)", "resident", 10, "d-sd-sheep-2026"),
    fee("lion", "Mountain Lion", "resident", 30),
    fee("pronghorn", "Antelope | Firearms - Buck Antelope", "resident", 45),
    fee("pronghorn", "Antelope | Firearms - Buck Antelope", "nonresident", 375),
    fee("pronghorn", "Antelope | Archery - Buck Antelope", "resident", 45),
    fee("pronghorn", "Antelope | Archery - Buck Antelope", "nonresident", 375),
    fee("pronghorn", "Antelope | Special", "resident", 200),
    fee("pronghorn", "Antelope | Special", "nonresident", 650),
    fee("pronghorn", "Custer State Park antelope (42 - one buck antelope)", "resident", 156, "d-sd-antelope-2026"),
    fee("turkey", "Turkey | Prairie Spring - 1 Male Turkey", "resident", 28),
    fee("turkey", "Turkey | Prairie Spring - 1 Male Turkey", "nonresident", 121),
    fee("turkey", "Turkey | Prairie Spring - 2 Male Turkeys", "resident", 40),
    fee("turkey", "Turkey | Prairie Spring - 2 Male Turkeys", "nonresident", 151),
    fee("turkey", "Turkey | Black Hills Spring", "resident", 28),
    fee("turkey", "Turkey | Black Hills Spring", "nonresident", 121),
    fee("turkey", "Turkey | Custer State Park Spring", "resident", 28),
    fee("turkey", "Turkey | Archery", "resident", 28),
    fee("turkey", "Turkey | Archery", "nonresident", 121),
    fee("turkey", "Turkey | Prairie Fall - 1 Any Turkey", "resident", 20),
    fee("turkey", "Turkey | Prairie Fall - 1 Any Turkey", "nonresident", 106),
    fee("turkey", "Turkey | Prairie Fall - 2 Any Turkey", "resident", 25),
    fee("turkey", "Turkey | Prairie Fall - 2 Any Turkey", "nonresident", 131),
]
for sp in ("mule-deer", "whitetail"):
    FEES += [
        fee(sp, "Deer | West River / East River - 1 Any Deer/Any Whitetail Deer", "resident", 45),
        fee(sp, "Deer | West River / East River - 1 Any Deer/Any Whitetail Deer", "nonresident", 375, note="East River: nonresidents only in the leftover period."),
        fee(sp, "Deer | West River / East River - 1 Any Deer + 1 Antlerless Deer", "resident", 60),
        fee(sp, "Deer | West River / East River - 1 Any Deer + 1 Antlerless Deer", "nonresident", 425),
        fee(sp, "Deer | West River / East River - 1 Antlerless Deer", "resident", 24),
        fee(sp, "Deer | West River / East River - 1 Antlerless Deer", "nonresident", 100),
        fee(sp, "Deer | West River / East River - 2 Antlerless Deer", "resident", 36),
        fee(sp, "Deer | West River / East River - 2 Antlerless Deer", "nonresident", 150),
        fee(sp, "Deer | Black Hills - 1 Any Deer/Any Whitetail", "resident", 45),
        fee(sp, "Deer | Black Hills - 1 Any Deer/Any Whitetail", "nonresident", 375),
        fee(sp, "Deer | Custer State Park - Any Deer/Any Whitetail Deer", "resident", 156),
        fee(sp, "Deer | Muzzleloader - 1 Any Deer", "resident", 45),
        fee(sp, "Deer | National Wildlife Refuge - 1 Any Deer", "resident", 45),
        fee(sp, "Deer | National Wildlife Refuge - 1 Any Deer", "nonresident", 375),
        fee(sp, "Deer | Archery - 1 Any Deer", "resident", 45),
        fee(sp, "Deer | Archery - 1 Any Deer", "nonresident", 375),
        fee(sp, "Deer | Special Buck East River", "resident", 200),
        fee(sp, "Deer | Special Buck West River", "resident", 200),
        fee(sp, "Deer | Special Buck West River", "nonresident", 650),
    ]
FEES += [
    fee("whitetail", "Deer | Archery / Black Hills / Muzzleloader - 1 Antlerless Whitetail Deer", "resident", 24),
    fee("whitetail", "Deer | Archery / Black Hills / Muzzleloader - 1 Antlerless Whitetail Deer", "nonresident", 100),
    fee("whitetail", "Deer | Custer State Park - Antlerless Whitetail Deer", "resident", 30),
]


def season(sp, label, start, end, sid, note=None):
    s = {"species": sp, "label": label, "start": start, "end": end, "year": 2026, "sourceId": sid}
    if note:
        s["note"] = note
    return s


SEASONS = [
    season("elk", "Black Hills Archery Elk (AEE)", "2026-09-01", "2026-09-30", "d-sd-elk-2026"),
    season("elk", "Prairie Firearms Elk (PRE)", "2026-09-01", "2026-12-31", "d-sd-elk-2026"),
    season("elk", "Black Hills Firearms Elk - H1A, H2A, H3A, H4A, H5A, H7A, H9A", "2026-10-01", "2026-10-31", "d-sd-elk-2026"),
    season("elk", "Black Hills Firearms Elk - H4B (first interval)", "2026-10-01", "2026-10-31", "d-sd-elk-2026", "Also December 1-16, 2026."),
    season("elk", "Black Hills Firearms Elk - H4B (second interval)", "2026-12-01", "2026-12-16", "d-sd-elk-2026"),
    season("elk", "Black Hills Firearms Elk - H1B, H7B, H9B (first interval)", "2026-10-15", "2026-10-31", "d-sd-elk-2026", "Also December 1-16, 2026."),
    season("elk", "Black Hills Firearms Elk - H1B, H7B, H9B (second interval)", "2026-12-01", "2026-12-16", "d-sd-elk-2026"),
    season("elk", "Black Hills Firearms Elk - H2B, H2E, H2H, H3B, H3E", "2026-10-15", "2026-10-31", "d-sd-elk-2026"),
    season("elk", "Black Hills Firearms Elk - H2C, H2F, H2I, H3C, H3F", "2026-12-01", "2026-12-16", "d-sd-elk-2026"),
    season("elk", "Black Hills Firearms Elk - H2G, H2J, H3D, H3G", "2026-12-17", "2026-12-31", "d-sd-elk-2026"),
    season("elk", "Custer State Park Early Archery Elk (CEE)", "2026-09-01", "2026-09-30", "d-sd-elk-2026"),
    season("elk", "Custer State Park Firearms Elk (CUE)", "2026-10-01", "2026-10-31", "d-sd-elk-2026"),
    season("elk", "CSP Special Antlerless Elk - CU1", "2026-10-15", "2026-10-31", "d-sd-elk-2026"),
    season("elk", "CSP Special Antlerless Elk - CU2", "2026-12-01", "2026-12-16", "d-sd-elk-2026"),
    season("pronghorn", "Firearms antelope (prairie units, Special Antelope)", "2026-10-03", "2026-10-18", "d-sd-antelope-2026"),
    season("pronghorn", "Custer State Park antelope", "2026-10-03", "2026-10-18", "d-sd-keydates"),
    season("pronghorn", "Archery antelope", "2026-08-15", "2026-10-31", "d-sd-keydates", "Closed during the firearms season."),
    season("sheep", "Bighorn sheep (Black Hills and Custer State Park)", "2026-09-01", "2026-12-31", "d-sd-sheep-2026"),
    season("lion", "Mountain lion - Black Hills Fire Protection District", "2025-12-26", "2026-04-30", "d-sd-lion-2026",
           "Closes early if 60 lions or 40 females are harvested."),
    season("lion", "Mountain lion - statewide outside the Black Hills Fire Protection District", "2025-12-26", "2026-12-25", "d-sd-lion-2026"),
    season("turkey", "Prairie spring turkey", "2026-04-11", "2026-05-31", "d-sd-springturkey-prairie-2026",
           "Exceptions for units 08A, 08B, 44A, 44B and 58B; state parks and recreation areas close after April 30 unless specified."),
    season("turkey", "Black Hills spring turkey (BH1)", "2026-04-25", "2026-05-31", "d-sd-springturkey-bh-2026"),
    season("turkey", "Custer State Park spring turkey (CU1)", "2026-04-25", "2026-05-17", "d-sd-springturkey-bh-2026", "Dates from the 2026 application PDF; GFP's Key Dates page lists Apr 25 - May 23, 2026."),
    season("turkey", "Spring archery turkey (ST1)", "2026-04-11", "2026-05-31", "d-sd-springturkey-bh-2026", "Archery hunters cannot hunt the Black Hills unit until April 25."),
    season("turkey", "Prairie fall turkey", "2026-11-01", "2027-01-31", "d-sd-fallturkey-2026"),
]
for sp in ("mule-deer", "whitetail"):
    SEASONS += [
        season(sp, "West River deer", "2026-11-14", "2026-11-29", "d-sd-wrdeer-2026", "Unit 30A: Nov 7-10 and Nov 23-29; 58D: Nov 21-22."),
        season(sp, "East River deer", "2026-11-21", "2026-12-06", "d-sd-erdeer-2026"),
        season(sp, "Antlerless-only deer season (East and West River antlerless tags)", "2026-12-12", "2026-12-20", "d-sd-wrdeer-2026",
               "Only tags designated antlerless; any deer/any buck/any whitetail tags are not valid."),
        season(sp, "Black Hills deer", "2026-11-01", "2026-11-30", "d-sd-bhdeer-2026"),
        season(sp, "Custer State Park deer", "2026-11-01", "2026-11-30", "d-sd-keydates"),
        season(sp, "Muzzleloader deer", "2026-12-01", "2027-01-01", "d-sd-muzzdeer-2026"),
        season(sp, "Archery deer", "2026-09-01", "2027-01-01", "d-sd-resarchdeer-2026", "Nonresident archery on public land (ADNP licenses) opens October 1, 2026; private land opens September 1."),
        season(sp, "West River Special Buck", "2026-11-14", "2026-11-29", "d-sd-specialbuck-2026", "Gregory County: Nov 7-10 and 14-29."),
        season(sp, "East River Special Buck", "2026-11-21", "2026-12-06", "d-sd-specialbuck-2026"),
    ]

COVERAGE_NOTES = {
    "elk": ("GFP's draw statistics tool has no 2022 first-draw elk statistics (only the 2022 Second Application Period), so 2022 elk rows are second-draw only. "
            "All elk drawings in GFP's draw statistics (Black Hills Firearms, Black Hills Archery, Prairie, CSP Firearms and Early Archery from 2023, CSP Special "
            "Antlerless 2026), first through later application periods, 2022-2026. Counts are first-choice applicants from GFP's Draw Preference Breakdown; "
            "resident = general resident pool; landowner-pool results are in each row note; quota = licenses issued + remaining in GFP's Draw Results table."),
    "mule-deer": ("Deer licenses valid for mule deer (any deer, any buck, antlerless deer, access permits for any deer) from every GFP deer drawing (West River, East River, Black Hills, "
                  "Custer State Park, Muzzleloader, Refuge, East/West River Special Buck, East River Nonresident Landowner-Own-Land, Nonresident Archery, "
                  "archery access permits, Municipal Archery) except the Returned Deer License re-issue drawing, 2022-2026; GFP licenses are not mule-deer-only, so every row here also appears in whitetail.json. "
                  "Units = GFP unit id taken from the license code (e.g. 02A01 -> 02A); statewide/permit-area licenses have no unit."),
    "whitetail": ("All white-tailed-only deer licenses (any whitetail, antlerless whitetail, buck whitetail) plus every either-species deer license (also in "
                  "mule-deer.json), all GFP deer drawings except the Returned Deer License re-issue drawing, 2022-2026."),
    "pronghorn": "Prairie firearms antelope, Custer State Park antelope (2025-2026), Special Antelope (2022-2025), nonresident archery antelope (2023-2026) and archery antelope access permits, 2022-2026.",
    "sheep": "Black Hills (BH2, BH4) and Custer State Park (CU1) ram licenses, 2022-2026.",
    "goat": "Single 2022 drawing (BG155); season closed since. By-point counts are in the row note because GFP lists the season as closed (pointsMatter false).",
    "lion": ("Mountain lion dog-hunting access permit drawings (Custer State Park 2023-2025; designated Black Hills area 2026). The license itself is over the "
             "counter; by-point counts are in row notes."),
    "turkey": ("Prairie spring and fall turkey, Custer State Park spring, nonresident Black Hills spring (2025-2026) and archery access permits, 2022-2026. "
               "GFP's 2022 Prairie Spring Turkey Draw Results tables list 0 licenses for every pool, so 2022 prairie spring quotas are null (applicants and "
               "successful applicants are from the preference breakdown)."),
}


def main():
    repo = sys.argv[1]
    base = os.path.join(repo, "src/data/agency/south-dakota")
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "goat", "lion", "turkey", "moose", "bear"]:
        p = os.path.join(base, "draw", f"{sp}.json")
        years = sorted({r["year"] for r in json.load(open(p))}) if os.path.exists(p) else []
        note = COVERAGE_NOTES.get(sp) or "No season in South Dakota; no draw data exists."
        coverage.append({"species": sp, "years": years, "notes": note})
    meta = {
        "slug": "south-dakota",
        "name": "South Dakota",
        "abbrev": "SD",
        "agency": {"name": "South Dakota Game, Fish and Parks", "shortName": "GFP", "url": "https://gfp.sd.gov"},
        "unitTerm": "Unit",
        "lastReviewed": R,
        "overview": ("South Dakota GFP issues limited big game and turkey licenses through season-by-season online lottery drawings, with first, second and later "
                     "draws followed by first-come leftover sales. Unsuccessful first-choice applicants earn (elk, sheep, goat) or may buy ($5 resident, $20 "
                     "nonresident) one preference point per season per year, and GFP cubes the number of entries an applicant receives before each draw. "
                     "Licenses are allocated through ordered pools - landowner, then preference-point tiers (e.g. 2+, 1+, 0+ for deer, antelope and turkey; "
                     "10+, 2+, 0+ for elk), then second choices. Elk, bighorn sheep and mountain lion are resident-only."),
        "species": SPECIES,
        "fees": FEES,
        "seasons": SEASONS,
        "coverage": coverage,
        "sources": SOURCES,
    }
    with open(os.path.join(base, "draw-meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print("wrote draw-meta.json", len(SOURCES), "sources", len(FEES), "fees", len(SEASONS), "seasons")


if __name__ == "__main__":
    main()
