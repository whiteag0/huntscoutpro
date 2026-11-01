#!/usr/bin/env python3
"""Write src/data/agency/wyoming/draw-meta.json (DrawMeta, src/data/agency/schema.ts).

Usage: python -I scripts/agency/wyoming/draw_meta.py <raw_dir> <repo_root>
Run after draw_parse.py (it merges <raw_dir>/sources.json and reads the draw/*.json
files for coverage), then run seasons_parse.py, which replaces seasons[] with the chapter
seasons, adds the season sources and fills per-hunt season dates on the draw rows. Every fact below was transcribed from the WGFD document cited by
its sourceId; quotes/line references are in the comments.
"""
import json
import os
import sys

R = "2026-10-31"
P = "Wyoming Game and Fish Department"
BASE = "https://wgfd.wyo.gov"

META_SOURCES = [
    {"id": "d-wy-draw-odds-index", "title": "Draw Results & Odds", "publisher": P,
     "url": f"{BASE}/licenses-applications/draw-results-odds", "retrieved": R,
     "notes": "Index of WGFD initial-draw and leftover-draw demand reports, 2021-2026"},
    {"id": "d-wy-2026-application-booklet", "title": "2026 Hunting License Application Information", "publisher": P,
     "url": f"{BASE}/media/31721/download", "pageUrl": f"{BASE}/licenses-applications", "dataYear": 2026,
     "retrieved": R, "notes": "Application dates, amounts to remit, preference-point and license rules for the 2026 drawings"},
    {"id": "d-wy-application-dates-page", "title": "Application Dates & Deadlines", "publisher": P,
     "url": f"{BASE}/licenses-applications/application-dates-deadlines", "dataYear": 2026, "retrieved": R,
     "notes": "Page lists dates without a year; they match the 2026 application booklet. No 2027 dates posted as of 2026-10-31"},
    {"id": "d-wy-license-fee-list", "title": "License Fee List", "publisher": P,
     "url": f"{BASE}/licenses-applications/license-fee-list", "dataYear": 2026, "retrieved": R,
     "notes": "Undated web table; each license price plus the application fee equals the 2026 booklet's amount to remit"},
    {"id": "d-wy-ch3-black-bear", "title": "Chapter 3 - Black Bear Hunting Seasons", "publisher": "Wyoming Game and Fish Commission",
     "url": f"{BASE}/media/33353/download", "pageUrl": f"{BASE}/regulations", "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated January 13, 2026"},
    {"id": "d-wy-2026-black-bear-brochure", "title": "2026 Black Bear Regulations", "publisher": "Wyoming Game and Fish Commission",
     "url": f"{BASE}/media/33578/download", "pageUrl": f"{BASE}/regulations", "dataYear": 2026, "retrieved": R},
    {"id": "d-wy-ch42-mountain-lion", "title": "Chapter 42 - Mountain Lion Hunting Seasons", "publisher": "Wyoming Game and Fish Commission",
     "url": f"{BASE}/media/32904/download", "pageUrl": f"{BASE}/regulations", "retrieved": R,
     "notes": "Commission regulation dated July 16, 2025"},
    {"id": "d-wy-ch20-wild-turkey", "title": "Chapter 20 - Wild Turkey Hunting Seasons (2026/2027)", "publisher": "Wyoming Game and Fish Commission",
     "url": f"{BASE}/media/33701/download", "pageUrl": f"{BASE}/regulations", "dataYear": 2026, "retrieved": R,
     "notes": "Commission regulation dated April 22, 2026; 2026 fall and 2027 spring seasons"},
    {"id": "d-wy-super-tag-raffle-page", "title": "Wyoming Super Tag Raffle", "publisher": P,
     "url": f"{BASE}/licenses-applications/wyoming-super-tag-raffle", "pageUrl": f"{BASE}/licenses-applications", "dataYear": 2027,
     "retrieved": R, "notes": "Raffle page: 'The next raffle opens February 17, 2026 / Entry deadline - February 1, 2027'"},
    {"id": "d-wy-ch44-license-issuance", "title": "Chapter 44 - Regulation for Issuance of Licenses, Permits, Stamps, Tags, "
     "Preference Points and Competitive Raffle Chances", "publisher": "Wyoming Game and Fish Commission",
     "url": f"{BASE}/media/34010/download", "pageUrl": f"{BASE}/regulations", "retrieved": R,
     "notes": ("Commission regulation dated July 15, 2026 (regulations page: 'CH 44 July 2026'); Section 18 sets the recurring "
               "application, modify/withdraw and preference-point-only dates used for the tentative 2027-cycle key dates")},
    {"id": "d-wy-2027-nr-preference-point-prices", "title": "Commissioners vote to increase non-resident preference point prices",
     "publisher": P, "url": f"{BASE}/news-events/commissioners-vote-increase-non-resident-preference-point-prices",
     "dataYear": 2027, "retrieved": R,
     "notes": ("WGFD news release posted April 21, 2026: nonresident antelope $31 to $75, deer $41 to $75, elk $52 to $75, "
               "effective January 1, 2027; moose and sheep points were already raised to the statutory maximum on January 1, 2018")},
]

B, DP, FEE = "d-wy-2026-application-booklet", "d-wy-application-dates-page", "d-wy-license-fee-list"
PP27 = "d-wy-2027-nr-preference-point-prices"
NO27 = "2027 dates not yet published by WGFD as of 2026-10-31"


def _kind(d, kind, res):
    # KeyDate.kind / residency (schema.ts): what the date is for, and the residency the agency limits it to
    out = {"label": d.pop("label"), "kind": kind}
    if res:
        out["residency"] = res
    out.update(d)
    return out


def win(label, start, end, note=None, status="confirmed", cycle=2026, kind="application", res=None):
    d = {"label": label, "start": start, "end": end, "cycle": cycle, "status": status, "sourceId": B}
    d["note"] = NO27 + ("; " + note if note else "")
    return _kind(d, kind, res)


def day(label, date, note=None, status="confirmed", cycle=2026, kind="other", res=None):
    d = {"label": label, "date": date, "cycle": cycle, "status": status, "sourceId": B}
    d["note"] = NO27 + ("; " + note if note else "")
    return _kind(d, kind, res)


def tent(label, date, note=None, res=None):
    # booklet column heading is "Tentative Results Available"
    return day(label, date, note, status="tentative", kind="results", res=res)


# 2027 cycle. The only 2027 dates WGFD had published as of 2026-10-31 are the Super Tag raffle's:
# booklet p.2/3 charts "2027 Super Tag License Feb. 17, 2026 - Feb. 1, 2027 | NA | Feb. 16, 2027 | $10" and
# "2027 Super Tag Trifecta License ... $30" (columns: online application dates, modify/withdraw deadline,
# tentative results available, amount); raffle page: "The next raffle opens February 17, 2026 / Entry
# deadline - February 1, 2027". No 2027 drawing application dates were posted (application-dates page,
# booklet, news releases and site search checked 2026-10-31).
ST = "d-wy-super-tag-raffle-page"
SUPER_TAG_SPECIES = {"elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "bear", "lion"}


def super_tag():
    return [
        {"label": "2027 Super Tag and Super Tag Trifecta raffle ticket sales", "kind": "other", "start": "2026-02-17",
         "end": "2027-02-01", "cycle": 2027, "status": "confirmed",
         "note": ("Competitive raffle for one license per species (bighorn sheep, moose, mountain goat, wild bison, elk, deer, antelope, "
                  "black bear, mountain lion, gray wolf) for the 2027 hunt season, separate from the drawings; $10 Super Tag and $30 "
                  "Trifecta tickets, residents and nonresidents, unlimited entries. The raffle page FAQ gives a generic January 31 "
                  "ticket deadline; the 2026 application booklet and the raffle page list February 1, 2027."),
         "sourceId": ST},
        {"label": "2027 Super Tag and Super Tag Trifecta raffle results", "kind": "results", "date": "2027-02-16", "cycle": 2027,
         "status": "tentative",
         "note": ("2026 application booklet column 'Tentative Results Available'; the raffle page FAQ says winners are announced on or "
                  "before March 1."),
         "sourceId": B},
    ]


PP_WINDOW = ("Preference point only purchase period", "2026-07-01", "2026-11-02")
LEFTOVER = [win("Leftover elk/deer/antelope drawing application period", "2026-06-22", "2026-06-26", kind="leftover"),
            tent("Leftover drawing results", "2026-07-08"),
            day("Remaining licenses on sale first come, first served", "2026-07-16", kind="leftover")]
DEER_DATES = [win("Initial drawing application period (resident and nonresident)", "2026-01-02", "2026-06-01"),
              day("Modify/withdraw deadline", "2026-06-01", kind="application-change"),
              tent("Initial drawing results", "2026-06-18"),
              win(*PP_WINDOW, note="Nonresident full-price deer points only", kind="points", res="nonresident")] + LEFTOVER

GUIDE = ("Nonresidents may not hunt big or trophy game in designated wilderness areas unless accompanied by a "
         "licensed professional guide or a resident guide (one guide per two nonresident hunters).")

SPECIES = [
    {"species": "elk", "displayName": "Elk", "drawSystem": "hybrid", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": ("Limited-quota and nonresident region-general elk licenses are drawn. For nonresidents, 75% of each hunt's "
                           "licenses go to a preference-point drawing (highest points first) and the remaining 25% to a random drawing "
                           "of all unsuccessful applicants; 40% of nonresident elk licenses are set aside as higher-priced Special licenses "
                           "drawn separately."),
     "residentNote": ("Residents do not use preference points for elk; resident limited-quota elk licenses are drawn randomly. Resident "
                      "general elk licenses go on sale over the counter July 16."),
     "nonresidentNote": ("Nonresidents apply Jan. 2 - Feb. 2 for a region general or a limited-quota hunt. Points count only for the first "
                         "choice and are lost when the first choice is drawn. Party applications use the group's average points (to the "
                         "4th decimal). " + GUIDE),
     "otcSummary": "Resident general elk licenses (over the counter from July 16); leftover licenses first come, first served from July 16.",
     "keyDates": [win("Nonresident application period", "2026-01-02", "2026-02-02", res="nonresident"),
                  day("Nonresident modify/withdraw deadline", "2026-05-08", kind="application-change", res="nonresident"),
                  tent("Nonresident drawing results", "2026-05-21", res="nonresident"),
                  win("Resident application period", "2026-01-02", "2026-06-01", res="resident"),
                  # booklet resident chart: "Elk Jan. 2 - June 1 | June 1 | June 18"
                  day("Resident modify/withdraw deadline", "2026-06-01", kind="application-change", res="resident"),
                  tent("Resident drawing results", "2026-06-18", res="resident"),
                  win(*PP_WINDOW, note="Nonresident full-price elk points only", kind="points", res="nonresident")] + LEFTOVER,
     "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure", PP27]},
    {"species": "mule-deer", "displayName": "Mule deer (Wyoming deer licenses)", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point",
     "drawSystemSummary": ("Wyoming issues deer licenses (not species-specific unless the hunt limitation says so). Nonresident full-price "
                           "deer licenses are drawn 75% by preference points and 25% at random; 40% are set aside as Special licenses "
                           "drawn separately. Resident limited-quota deer licenses are drawn randomly."),
     "residentNote": "Residents do not use preference points for deer. Resident general deer licenses go on sale over the counter July 16.",
     "nonresidentNote": ("Nonresidents apply for a region general deer license (by region letter) or a limited-quota hunt; region general "
                         "licenses are valid in any hunt area in the region not totally limited in quota. " + GUIDE),
     "otcSummary": "Resident general deer licenses (over the counter from July 16); leftover licenses first come, first served from July 16.",
     "keyDates": DEER_DATES, "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure", PP27]},
    {"species": "whitetail", "displayName": "White-tailed deer (Wyoming deer licenses)", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point",
     "drawSystemSummary": ("White-tailed-only hunts (e.g. Type 3 any white-tailed deer, Type 8 doe/fawn white-tailed deer) are drawn in the "
                           "same deer drawing: nonresident full-price licenses 75% by preference points and 25% at random, with a separate "
                           "Special-license drawing. Reduced-price doe/fawn licenses use no points."),
     "residentNote": "Residents do not use preference points for deer.",
     "nonresidentNote": ("A second full-price deer license is available only after the initial drawing and only if at least one is a "
                         "limited-quota Type 3 any white-tailed deer license (leftover drawing or first come, first served). " + GUIDE),
     "otcSummary": ("In some hunt areas, after the initial and leftover drawings, unlimited reduced-price doe/fawn white-tailed deer "
                    "licenses may be purchased."),
     "keyDates": DEER_DATES, "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure", PP27]},
    {"species": "pronghorn", "displayName": "Pronghorn (antelope)", "drawSystem": "hybrid", "pointsMatter": True,
     "pointName": "preference point",
     "drawSystemSummary": ("All antelope licenses are limited quota; there are no general antelope licenses. Nonresident full-price licenses "
                           "are drawn 75% by preference points and 25% at random, with 40% set aside as Special licenses drawn separately; "
                           "resident licenses are drawn randomly."),
     "residentNote": "Residents do not use preference points for antelope.",
     "nonresidentNote": "In the initial drawing an applicant may apply for one full-price and up to two reduced-price doe/fawn antelope licenses. " + GUIDE,
     "otcSummary": "No general antelope licenses are offered; leftover limited-quota licenses go on sale first come, first served from July 16.",
     "keyDates": [win("Initial drawing application period (resident and nonresident)", "2026-01-02", "2026-06-01"),
                  day("Modify/withdraw deadline", "2026-06-01", kind="application-change"),
                  tent("Initial drawing results", "2026-06-18"),
                  win(*PP_WINDOW, note="Nonresident full-price antelope points only", kind="points", res="nonresident")] + LEFTOVER,
     "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure", PP27]},
    {"species": "moose", "displayName": "Moose", "drawSystem": "hybrid", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": ("Resident and nonresident moose licenses are drawn 75% by preference points and 25% at random. An applicant may "
                           "list only one hunt area choice. Licenses are allocated 90% resident / 10% nonresident by statute."),
     "residentNote": "Type 1 moose is once in a lifetime; a successful Type 4 applicant must wait five years to apply again or buy a point.",
     "nonresidentNote": ("Nonresidents must elect a preference point when applying; unsuccessful applicants who elected it have the $150 point "
                         "fee deducted from the refund. " + GUIDE),
     "keyDates": [win("Application period (resident and nonresident)", "2026-01-02", "2026-04-30"),
                  day("Modify/withdraw deadline", "2026-04-30", kind="application-change"),
                  tent("Drawing results", "2026-05-21"),
                  win(*PP_WINDOW, note="Resident and nonresident moose points", kind="points")],
     "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure"]},
    {"species": "sheep", "displayName": "Bighorn sheep", "drawSystem": "hybrid", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": ("Full-price (Type 1/2) bighorn sheep licenses are drawn 75% by preference points and 25% at random for residents "
                           "and nonresidents, with one hunt area choice. Reduced-price Type 6/7 ewe/lamb licenses are drawn without points. "
                           "Licenses are allocated 90% resident / 10% nonresident by statute."),
     "residentNote": "A Type 1 or Type 2 bighorn sheep license is once in a lifetime (applicants who drew after 2017 may not apply again).",
     "nonresidentNote": ("Nonresidents must elect a preference point when applying; the $150 point fee is deducted from the refund if "
                         "unsuccessful. " + GUIDE),
     "keyDates": [win("Application period (resident and nonresident)", "2026-01-02", "2026-04-30"),
                  day("Modify/withdraw deadline", "2026-04-30", kind="application-change"),
                  tent("Drawing results", "2026-05-21"),
                  win(*PP_WINDOW, note="Full-price bighorn sheep points, residents and nonresidents", kind="points")],
     "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure"]},
    {"species": "goat", "displayName": "Mountain goat", "drawSystem": "random", "pointsMatter": False,
     "drawSystemSummary": ("Mountain goat licenses are drawn by random draw for a specific hunt area; there are no mountain goat preference "
                           "points. Licenses are allocated 90% resident / 10% nonresident by statute."),
     "residentNote": ("Type 1 or Type 2 is once in a lifetime (no reapplying if drawn after 1995); since 2019 prior Type 1/2 holders may "
                      "apply for Type A licenses."),
     "nonresidentNote": GUIDE,
     "keyDates": [win("Application period (resident and nonresident)", "2026-01-02", "2026-04-30"),
                  day("Modify/withdraw deadline", "2026-04-30", kind="application-change"),
                  tent("Drawing results", "2026-05-21")],
     "sourceIds": [B, DP, "d-wy-draw-odds-index", "d-wy-2026-black-bear-brochure"]},
    {"species": "turkey", "displayName": "Wild turkey (spring and fall)", "drawSystem": "random", "pointsMatter": False,
     "drawSystemSummary": ("Spring and fall wild turkey licenses (for 2026 fall / 2027 spring: Area 1 general and Area 1 Type 3 limited "
                           "quota) are applied for in separate spring and fall drawings without preference points. One spring and one fall license per person in the "
                           "initial drawing."),
     "residentNote": ("After the initial drawing a person may receive up to three turkey licenses per season, provided at least two are "
                      "limited-quota Type 3 licenses."),
     "otcSummary": "Additional licenses after the initial drawing as allowed by Chapter 20; see the WGFD turkey regulation.",
     "keyDates": [win("Spring turkey application period", "2026-01-02", "2026-02-02"),
                  tent("Spring turkey drawing results", "2026-02-12"),
                  win("Fall turkey application period", "2026-04-01", "2026-06-01"),
                  tent("Fall turkey drawing results", "2026-06-18")],
     "sourceIds": [B, DP, "d-wy-ch20-wild-turkey", "d-wy-draw-odds-index"]},
    {"species": "bear", "displayName": "Black bear", "drawSystem": "otc", "pointsMatter": False,
     "drawSystemSummary": ("Black bear licenses are not part of the WGFD drawings (no draw application or odds are published). Each hunt "
                           "area or group of areas closes when its female mortality limit is reached, otherwise on the regulation's "
                           "closing date; spring overages are subtracted from the fall limit."),
     "residentNote": "Hunters must confirm an area is open (closure hotline 1-800-264-1280). Bait sites are registered separately.",
     "nonresidentNote": GUIDE,
     "otcSummary": "Resident black bear license $47; nonresident $373 (2026 fee list). No drawing.",
     "keyDates": [],
     "sourceIds": ["d-wy-ch3-black-bear", "d-wy-2026-black-bear-brochure", FEE]},
    {"species": "lion", "displayName": "Mountain lion", "drawSystem": "otc", "pointsMatter": False,
     "drawSystemSummary": ("Mountain lion licenses are not part of the WGFD drawings. Each hunt area closes when its mortality limit is "
                           "reached (separate resident and nonresident limits in designated areas), otherwise on the regulation's closing "
                           "date. A person may hold one full-price and one reduced-price lion license per calendar year."),
     "residentNote": "Reduced-price licenses are valid only in designated hunt areas and require a current full-price license.",
     "nonresidentNote": GUIDE,
     "otcSummary": "Resident mountain lion license $32 (reduced price $20); nonresident $373 (reduced price $92). No drawing.",
     "keyDates": [],
     "sourceIds": ["d-wy-ch42-mountain-lion", "d-wy-2026-black-bear-brochure", FEE]},
]


def fee(sp, item, res, amt, note=None, src=FEE, year=2026):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": year, "sourceId": src}
    if note:
        f["note"] = note
    return f


APP_NR = "Draw applicants also pay the $15 nonresident application fee"
APP_R = "Draw applicants also pay the $5 resident application fee"
# d-wy-2027-nr-preference-point-prices: "Antelope preference points: $31 to $75 ... Deer preference points: $41 to $75 ...
# Elk preference points: $52 to $75", "effective January 1, 2027".
PP_NOTE = "No application fee for a point-only purchase"
PP_RISE = PP_NOTE + "; rises to $75 on January 1, 2027 (Commission vote, April 21, 2026)"
PP_NEW = "Commission voted April 21, 2026 to raise the price to $75 effective January 1, 2027 (was ${old})"
FEES = [
    fee(None, "Resident application fee (big game and wild bison drawings)", "resident", 5.00, "Nonrefundable"),
    fee(None, "Nonresident application fee (big game and wild bison drawings)", "nonresident", 15.00, "Nonrefundable"),
    fee("elk", "Resident elk", "resident", 57.00, APP_R),
    fee("elk", "Resident cow/calf elk", "resident", 43.00, APP_R),
    fee("elk", "Nonresident elk & fishing privilege", "nonresident", 692.00, APP_NR),
    fee("elk", "Nonresident elk special & fishing privilege", "nonresident", 1950.00, APP_NR),
    fee("elk", "Nonresident cow/calf elk", "nonresident", 288.00, APP_NR),
    fee("elk", "Nonresident elk preference point", "nonresident", 52.00, PP_RISE),
    fee("elk", "Nonresident elk preference point", "nonresident", 75.00, PP_NEW.format(old=52), src=PP27, year=2027),
]
for sp in ("mule-deer", "whitetail"):
    FEES += [
        fee(sp, "Resident deer", "resident", 42.00, APP_R + "; Wyoming deer license"),
        fee(sp, "Resident doe/fawn deer", "resident", 22.00, APP_R),
        fee(sp, "Nonresident deer", "nonresident", 374.00, APP_NR + "; Wyoming deer license"),
        fee(sp, "Nonresident deer special", "nonresident", 1200.00, APP_NR),
        fee(sp, "Nonresident doe/fawn deer", "nonresident", 34.00, APP_NR),
        fee(sp, "Nonresident deer preference point", "nonresident", 41.00, PP_RISE),
        fee(sp, "Nonresident deer preference point", "nonresident", 75.00, PP_NEW.format(old=41), src=PP27, year=2027),
    ]
FEES += [
    fee("pronghorn", "Resident antelope", "resident", 37.00, APP_R),
    fee("pronghorn", "Resident doe/fawn antelope", "resident", 22.00, APP_R),
    fee("pronghorn", "Nonresident antelope", "nonresident", 326.00, APP_NR),
    fee("pronghorn", "Nonresident antelope special", "nonresident", 1200.00, APP_NR),
    fee("pronghorn", "Nonresident doe/fawn antelope", "nonresident", 34.00, APP_NR),
    fee("pronghorn", "Nonresident antelope preference point", "nonresident", 31.00, PP_RISE),
    fee("pronghorn", "Nonresident antelope preference point", "nonresident", 75.00, PP_NEW.format(old=31), src=PP27, year=2027),
    fee("moose", "Resident moose", "resident", 152.00, APP_R),
    fee("moose", "Nonresident moose", "nonresident", 2752.00, APP_NR),
    fee("moose", "Resident moose preference point", "resident", 7.00),
    fee("moose", "Nonresident moose preference point", "nonresident", 150.00),
    fee("sheep", "Resident bighorn sheep", "resident", 152.00, APP_R),
    fee("sheep", "Resident ewe/lamb bighorn sheep", "resident", 36.00, APP_R),
    fee("sheep", "Nonresident bighorn sheep", "nonresident", 3002.00, APP_NR),
    fee("sheep", "Nonresident ewe/lamb bighorn sheep", "nonresident", 240.00, APP_NR),
    fee("sheep", "Resident bighorn sheep preference point", "resident", 7.00),
    fee("sheep", "Nonresident bighorn sheep preference point", "nonresident", 150.00),
    fee("goat", "Resident mountain goat", "resident", 152.00, APP_R),
    fee("goat", "Nonresident mountain goat", "nonresident", 2752.00, APP_NR),
    fee("turkey", "Resident turkey spring", "resident", 16.00),
    fee("turkey", "Resident turkey fall", "resident", 16.00),
    fee("turkey", "Nonresident turkey spring", "nonresident", 74.00),
    fee("turkey", "Nonresident turkey fall", "nonresident", 74.00),
    fee("bear", "Resident black bear", "resident", 47.00),
    fee("bear", "Nonresident black bear", "nonresident", 373.00),
    fee("lion", "Resident mountain lion", "resident", 32.00),
    fee("lion", "Resident reduced price mountain lion", "resident", 20.00),
    fee("lion", "Nonresident mountain lion", "nonresident", 373.00),
    fee("lion", "Nonresident reduced price mountain lion", "nonresident", 92.00),
]

T = "d-wy-ch20-wild-turkey"
SEASONS = [
    {"species": "turkey", "label": "Fall general, Area 1 (archery only)", "start": "2026-09-01", "end": "2026-09-30", "year": 2026,
     "note": "Any wild turkey, archery only", "sourceId": T},
    {"species": "turkey", "label": "Fall general, Area 1", "start": "2026-10-01", "end": "2027-01-31", "year": 2026,
     "note": "Any wild turkey", "sourceId": T},
    {"species": "turkey", "label": "Fall limited quota Area 1 Type 3 (archery only)", "start": "2026-09-01", "end": "2026-09-30",
     "year": 2026, "note": "Quota 1200; valid within Converse, Natrona, Campbell, Johnson and Sheridan counties and on private land in "
                           "Big Horn, Crook, Hot Springs, Park, Washakie and Weston counties", "sourceId": T},
    {"species": "turkey", "label": "Fall limited quota Area 1 Type 3", "start": "2026-10-01", "end": "2027-01-31", "year": 2026,
     "note": "Any wild turkey valid within Converse, Natrona, Campbell, Johnson and Sheridan counties; also valid on private land "
             "in Big Horn, Crook, Hot Springs, Park, Washakie and Weston counties", "sourceId": T},
    {"species": "turkey", "label": "Spring general, Area 1", "start": "2027-04-20", "end": "2027-05-31", "year": 2027,
     "note": "Any male wild turkey or any wild turkey with a visible beard", "sourceId": T},
    {"species": "turkey", "label": "Spring limited quota Area 1 Type 3", "start": "2027-04-01", "end": "2027-05-31", "year": 2027,
     "note": "Quota 800; valid within Converse, Natrona, Campbell, Johnson and Sheridan counties", "sourceId": T},
]

COMMON = ("Source: WGFD initial-drawing 'Demand Reports' (first-choice applicants). Landowner and leftover drawings are not included. "
          "WGFD random-draw tables publish quota and 1st/2nd/3rd-choice applicants but not the number drawn, so drawn and odds are "
          "null except where every first-choice applicant drew (oddsComputed). Quota for point-drawn hunts = preference-draw quota + "
          "random-draw quota as published (both shown in each row's note). byPoints lists whole-point levels with applicants; WGFD's "
          "'< N' rows (party applications averaging between N-1 and N) and the bottom catch-all row are summarised in the note. "
          "Quotas printed as 7999 or more (general licenses, Type 8 counters) are set to null with the printed value in the note.")
NOTES = {
    "elk": "Includes full-price, cow/calf (Types 6-8), nonresident region general (GEN before 2026; E/S/W etc. as published) and resident GEN rows. Nonresident Special licenses are separate rows with huntCode suffix ' (NR Special)'.",
    "mule-deer": "WGFD reports deer as one species. Rows here are every deer hunt whose description is not white-tailed only (ANY DEER, ANTLERED DEER, ANTLERED MULE DEER, DOE OR FAWN, region general); those licenses may also be valid for white-tailed deer per the hunt limitations. NR Special rows use the ' (NR Special)' suffix.",
    "whitetail": "Deer hunts whose WGFD description is white-tailed only (ANY WHITE-TAILED DEER, DOE OR FAWN WHITE-TAILED, LIMITED QUOTA, ANY WH...). General/any-deer hunts are in mule-deer.json. NR Special rows use the ' (NR Special)' suffix.",
    "pronghorn": "WGFD 'Antelope'. Includes doe/fawn reduced-price hunts. NR Special rows use the ' (NR Special)' suffix.",
    "moose": "Resident and nonresident preference-point and random tables. Two rows (2022 034-4, 2026 025-4 resident) have WGFD tables that differ by one applicant; both values are in the note.",
    "sheep": "Includes reduced-price ewe/lamb (Types 6/7, random, no points).",
    "goat": "Random draw only. The index page's 2022 goat links open the 2020 report; the 2022 reports (dated 4/25/2022, media 22160/22171) were used instead.",
    "turkey": "Spring and fall drawings share hunt codes, so huntCode carries ' (Spring)' or ' (Fall)'. The index lists no 2022 fall report; 2022 is spring only.",
}


# 2027 cycle from the standing rule: Chapter 44 (dated July 15, 2026), Section 18. (a) "The Department shall begin
# accepting completed applications at 8:00 a.m. on the first business day of the month or the specified date listed in
# subsections (d) and (e)"; (b) "Completed applications shall not be accepted after 12:00 midnight ... on the respective
# application deadline dates listed in subsection (e). If the deadline date occurs on a day when Headquarters has been
# closed for license sales, the ELS shall be available until 12:00 midnight ... on the next business day."; (e) table
# (beginning month / last date to accept applications / last date to modify-withdraw): antelope, deer, resident elk
# January / May 31 / May 31; nonresident elk January / January 31 / May 8; moose, bighorn sheep, mountain goat
# January / April 30 / April 30; preference point only July / October 31; wild turkey spring January / January 31 /
# January 31, fall April / May 31 / May 31. The rule reproduces every 2026 booklet date (Jan 2, Feb 2, Apr 30, Jun 1,
# Jul 1, Nov 2, Apr 1). 2027 calendar: Jan 1 (Fri) is New Year's Day -> first business day Mon Jan 4; Jan 31 is a
# Sunday -> Mon Feb 1; Apr 30 is a Friday; May 31 is Memorial Day (Mon) -> Tue Jun 1; Jul 1 is a Thursday; Oct 31 is a
# Sunday -> Mon Nov 1; Apr 1 is a Thursday. Left out: results (no date in the rule), leftover drawing (Section 20(b):
# "determined on an annual basis by the Fiscal Division Chief"), and modify/withdraw deadlines whose rule date falls on
# a weekend or holiday (nonresident elk May 8 is a Saturday; May 31 and January 31) because Section 18(b)'s
# next-business-day shift is written for application deadlines and the rule does not say whether it moves those.
CH44 = "d-wy-ch44-license-issuance"
R18 = ("Set by WGFD Commission Chapter 44, Section 18 (applications accepted from 8:00 a.m. on the first business day of {open_month} "
       "through {close}; a deadline on a day Headquarters is closed for license sales moves to the next business day); "
       "WGFD hasn't announced the 2027 dates yet.")


def rule27(label, start, end, open_month, close, kind="application", res=None, extra=None):
    note = R18.format(open_month=open_month, close=close) + (" " + extra if extra else "")
    return _kind({"label": label, "start": start, "end": end, "cycle": 2027, "status": "tentative", "note": note,
                  "sourceId": CH44}, kind, res)


def mod27(label, date, rule_date):
    note = (f"Set by WGFD Commission Chapter 44, Section 18(d)-(e) (last date to modify/withdraw: {rule_date}); "
            "WGFD hasn't announced the 2027 dates yet.")
    return _kind({"label": label, "date": date, "cycle": 2027, "status": "tentative", "note": note, "sourceId": CH44},
                 "application-change", None)


JAN = "January 1, 2027 is New Year's Day, so applications open Monday, January 4, 2027."
MAY31 = "May 31, 2027 is Memorial Day, so the deadline moves to Tuesday, June 1, 2027."
PP27_NOTE = "October 31, 2027 is a Sunday, so the deadline moves to Monday, November 1, 2027."
INITIAL27 = rule27("Initial drawing application period (resident and nonresident)", "2027-01-04", "2027-06-01", "January", "May 31",
                   extra=JAN + " " + MAY31)


def pp27(note, res=None):
    return rule27("Preference point only purchase period", "2027-07-01", "2027-11-01", "July", "October 31", kind="points", res=res,
                  extra=PP27_NOTE + " " + note)


RULE27 = {
    "elk": [rule27("Nonresident application period", "2027-01-04", "2027-02-01", "January", "January 31", res="nonresident",
                   extra=JAN + " January 31, 2027 is a Sunday, so the deadline moves to Monday, February 1, 2027."),
            rule27("Resident application period", "2027-01-04", "2027-06-01", "January", "May 31", res="resident",
                   extra=JAN + " " + MAY31),
            pp27("Nonresident full-price elk points only.", res="nonresident")],
    "mule-deer": [INITIAL27, pp27("Nonresident full-price deer points only.", res="nonresident")],
    "whitetail": [INITIAL27, pp27("Nonresident full-price deer points only.", res="nonresident")],
    "pronghorn": [INITIAL27, pp27("Nonresident full-price antelope points only (Section 18(e) 'Preference Point Only - Nonresident').",
                                  res="nonresident")],
    "moose": [rule27("Application period (resident and nonresident)", "2027-01-04", "2027-04-30", "January", "April 30", extra=JAN),
              mod27("Modify/withdraw deadline", "2027-04-30", "April 30"),
              pp27("Resident and nonresident moose points.")],
    "sheep": [rule27("Application period (resident and nonresident)", "2027-01-04", "2027-04-30", "January", "April 30", extra=JAN),
              mod27("Modify/withdraw deadline", "2027-04-30", "April 30"),
              pp27("Full-price bighorn sheep points, residents and nonresidents.")],
    "goat": [rule27("Application period (resident and nonresident)", "2027-01-04", "2027-04-30", "January", "April 30", extra=JAN),
             mod27("Modify/withdraw deadline", "2027-04-30", "April 30")],
    "turkey": [rule27("Spring turkey application period", "2027-01-04", "2027-02-01", "January", "January 31",
                      extra=JAN + " January 31, 2027 is a Sunday, so the deadline moves to Monday, February 1, 2027."),
               rule27("Fall turkey application period", "2027-04-01", "2027-06-01", "April", "May 31", extra=MAY31)],
}


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    for sp in SPECIES:
        if sp["species"] in RULE27:
            sp["keyDates"] = sp["keyDates"] + [dict(k) for k in RULE27[sp["species"]]]
            sp["sourceIds"] = sp["sourceIds"] + [CH44]
        if sp["species"] in SUPER_TAG_SPECIES:
            sp["keyDates"] = sp["keyDates"] + super_tag()
            sp["sourceIds"] = sp["sourceIds"] + [ST]
    pdf_sources = json.load(open(os.path.join(raw, "sources.json")))
    ddir = os.path.join(repo, "src/data/agency/wyoming/draw")
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "sheep", "goat", "turkey"]:
        rows = json.load(open(os.path.join(ddir, f"{sp}.json")))
        coverage.append({"species": sp, "years": sorted({r["year"] for r in rows}),
                         "notes": NOTES[sp] + " " + COMMON})
    coverage.append({"species": "bear", "years": [], "notes": "No WGFD drawing for black bear; no draw data exists."})
    coverage.append({"species": "lion", "years": [], "notes": "No WGFD drawing for mountain lion; no draw data exists."})
    meta = {
        "slug": "wyoming", "name": "Wyoming", "abbrev": "WY",
        "agency": {"name": P, "shortName": "WGFD", "url": BASE},
        "unitTerm": "Hunt Area",
        "lastReviewed": R,
        "overview": ("Wyoming issues big game licenses by hunt area and license type through online initial drawings, followed by a "
                     "leftover drawing and first-come, first-served sales. Preference points are used for resident and nonresident moose "
                     "and full-price bighorn sheep and for nonresident elk, deer and antelope: 75% of each hunt's licenses go to the "
                     "applicants with the most points and the remaining 25% to a random drawing of all unsuccessful applicants. Resident "
                     "elk, deer and antelope, mountain goat, reduced-price and turkey licenses are drawn randomly, and 40% of nonresident "
                     "elk, deer and antelope licenses are reserved as higher-priced Special licenses with their own drawing."),
        "species": SPECIES,
        "fees": FEES,
        "seasons": SEASONS,
        "coverage": coverage,
        "sources": META_SOURCES + pdf_sources,
    }
    out = os.path.join(repo, "src/data/agency/wyoming/draw-meta.json")
    with open(out, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote", out, len(meta["sources"]), "sources")


if __name__ == "__main__":
    main()
