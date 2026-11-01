#!/usr/bin/env python3
"""Write src/data/agency/utah/draw-meta.json (Utah draw facts, fees, seasons, sources).

Usage:
  python -I scripts/agency/utah/draw_meta.py <repo_root>

Run after draw_parse.py: coverage is computed from the draw/<species>.json files.
Every fact below was read from the cited UDWR document (retrieved 2026-10-31):
  d-bg-guide-2026        2026 Utah Big Game Application Guidebook
  d-antlerless-guide-2026 2026 Utah Antlerless Application Guidebook
  d-bear-guide-2026      2026 Utah Black Bear, Cougar and Furbearer Guidebook
  d-turkey-guide-2026-27 2026-27 Utah Waterfowl, Upland Game and Turkey Guidebook
  d-fees                 wildlife.utah.gov/fees (page last updated Oct. 8, 2026)
  d-rule-r657-62         Utah Admin. Rule R657-62 (drawing application procedures)
  d-points               wildlife.utah.gov/licenses/points
  d-news-sportsman-2027  UDWR news release, Oct. 13, 2026 (2027 sportsman permit drawing)
  d-sportsman-page-2027  wildlife.utah.gov/sportsmanpermits (2027 dates; last updated Oct. 13, 2026)
  d-field-regs-2026      2026 Utah Big Game Field Regulations Guidebook (season dates, online edition)
Re-checked 2026-10-31 (guidebook PDFs byte-identical to the earlier download; UDWR calendar ICS feeds, news,
species pages): no 2027 main big game, antlerless or black bear draw dates are published yet.
Then run seasons_ranges.py (seasonRanges on draw rows) and seasons_spotcheck.py.
"""
import glob
import json
import os
import sys

R = "2026-10-31"
W = "https://wildlife.utah.gov"
UDWR = "Utah Division of Wildlife Resources"
API = "https://www.utahdraws.com/internetsales/Home/DrawOddsData"
NOT_2027 = "2027 main big game draw dates not yet published by UDWR as of 2026-10-31 (the separate 2027 sportsman permit drawing is listed below)"
NOT_2027_BEAR = "2027 black bear draw dates not yet published by UDWR as of 2026-10-31 (the separate 2027 sportsman permit drawing is listed below)"
SPORT = "d-news-sportsman-2027"
SPORT_PAGE = "d-sportsman-page-2027"
FIELD = "d-field-regs-2026"


def src(id, title, url, year=None, page=None, notes=None):
    s = {"id": id, "title": title, "publisher": UDWR, "url": url}
    if page:
        s["pageUrl"] = page
    if year is not None:
        s["dataYear"] = year
    s["retrieved"] = R
    if notes:
        s["notes"] = notes
    return s


def sources():
    out = []
    bg_page = f"{W}/bg-odds.html"
    other_page = f"{W}/drawing-odds-and-point-results.html"
    for y in (2022, 2023, 2024, 2025):
        yy = str(y)[2:]
        out.append(src(f"d-le-odds-{y}", f"{y} Big game limited-entry & once-in-a-lifetime draw results ({y} Draw 5, Big Game Bonus Point Draw Results)",
                       f"{W}/pdf/bg/{y}/{yy}_bg-odds.pdf", y, bg_page, "First-choice applicants and permits by bonus point level, resident and nonresident, per hunt."))
        out.append(src(f"d-gen-deer-odds-{y}", f"{y} General-season buck deer draw results ({y} Draw 5)",
                       f"{W}/pdf/bg/{y}/{yy}_deer_odds.pdf", y, bg_page, "First-choice applicants and permits by preference point level; youth reported separately."))
        out.append(src(f"d-antlerless-odds-{y}", f"{y} Antlerless big game draw results ({y} Draw 7)",
                       f"{W}/pdf/bg/{y}/{yy}_antlerless_drawing_odds_report.pdf", y, bg_page, "First-choice applicants and permits by point level; youth reported separately."))
        out.append(src(f"d-bear-odds-{y}", f"{y} Black bear drawing odds ({y} Draw 1)",
                       f"{W}/pdf/bear/{yy}_drawing_odds.pdf", y, other_page))
        out.append(src(f"d-turkey-odds-{y}", f"{y} Turkey drawing results and bonus point purchase results ({y} Draw T)",
                       f"{W}/pdf/uplandgame/turkey/{y}_turkey_bonus_points_draw_results.pdf", y, other_page, "Adult draw; youth turkey results are a separate report."))
    out.append(src("d-cougar-odds-2021-22", "Cougar drawing odds 2021-22 (2022 Draw R, Cougar Bonus Point Draw Results)",
                   f"{W}/pdf/cougar/2022_cougar_odds_report.pdf", 2021, other_page, "Drawn October 2021 for the 2021-22 cougar season."))
    out.append(src("d-cougar-odds-2022-23", "Cougar drawing odds 2022-23 (2022 Draw 1, Black Bear & Cougar Bonus Point Draw Results)",
                   f"{W}/pdf/cougar/2023_cougar_odds_report.pdf", 2022, other_page, "Drawn June 2022 for the 2022-23 cougar season; last cougar draw before Utah removed cougar permits in 2023."))
    api = [
        ("general-deer", "Big Game", 5, "General-Season Buck Deer"),
        ("le-deer", "Big Game", 8, "Limited-Entry Buck Deer"),
        ("le-elk", "Big Game", 9, "Limited-Entry Bull Elk"),
        ("le-pronghorn", "Big Game", 10, "Limited-Entry Buck Pronghorn"),
        ("moose", "Big Game", 11, "Bull Moose"),
        ("desert-sheep", "Big Game", 13, "Desert Bighorn Sheep"),
        ("rm-sheep", "Big Game", 14, "Rocky Mtn Bighorn Sheep"),
        ("goat", "Big Game", 15, "Mountain Goat"),
        ("bear", "Black Bear", 1, "Black Bear"),
        ("turkey", "Turkey", 3, "Turkey"),
        ("antlerless-deer", "Antlerless", 17, "Antlerless Deer"),
        ("antlerless-elk", "Antlerless", 18, "Antlerless Elk"),
        ("antlerless-moose", "Antlerless", 19, "Antlerless Moose"),
        ("doe-pronghorn", "Antlerless", 20, "Doe Pronghorn"),
        ("ewe-sheep", "Antlerless", 21, "Ewe Rocky Mtn Bighorn Sheep"),
    ]
    for key, draw, mid, name in api:
        out.append(src(f"d-api-2026-{key}", f"UDWR Draw Odds, 2026 {draw} draw: {name}",
                       f"{API}?drawName={draw.replace(' ', '%20')}&licenseYear=2026&masterHuntTypeID={mid}", 2026,
                       "https://utahdraws.com/drawodds",
                       "UDWR's online draw-odds system (linked from wildlife.utah.gov/biggameapp odds pages as 'the new draw odds page'); 2026 results were published here instead of a PDF. JSON fields used: HuntCode, HuntName, quotas, OddsList ParticipantCount (1st choice apps) and SuccessfulCount (1st choice permits)."))
    out += [
        src("d-bg-guide-2026", "Utah Big Game Application Guidebook 2026", f"{W}/guidebooks/biggameapp.pdf", 2026, f"{W}/guidebooks"),
        src("d-antlerless-guide-2026", "Utah Antlerless Application Guidebook 2026", f"{W}/guidebooks/antlerless_guidebook.pdf", 2026, f"{W}/guidebooks"),
        src("d-bear-guide-2026", "Utah Black Bear, Cougar and Furbearer Guidebook 2026", f"{W}/guidebooks/black-bear-cougar-furbearer-guidebook.pdf", 2026, f"{W}/guidebooks"),
        src("d-turkey-guide-2026-27", "Utah Waterfowl, Upland Game and Turkey Guidebook 2026-27", f"{W}/guidebooks/waterfowl-upland-game-turkey-guidebook.pdf", 2026, f"{W}/guidebooks",
            "Includes the 2027 spring limited-entry turkey application dates."),
        src("d-fees", "Fees: licenses, permits & miscellaneous", f"{W}/fees", 2026, None, "Page last updated Oct. 8, 2026. Nonresident permit fee increases took effect Sept. 1, 2025."),
        src("d-rule-r657-62", "Utah Admin. Rule R657-62: Drawing application procedures", f"{W}/rules/r657-62"),
        src("d-points", "How bonus and preference points work", f"{W}/licenses/points", None, None, "Page last updated April 13, 2026."),
        src(SPORT, "Apply for Utah's most prized hunting permits, starting Oct. 20",
            f"{W}/news/2026/10/13/apply-for-sportsman-hunting-permits-starting-october-20", 2027, f"{W}/news",
            "UDWR news release published Oct. 13, 2026: 2027 sportsman permit applications Oct. 20 (8 a.m. MDT) - Nov. 10, 2026 "
            "(11 p.m. MST), results Nov. 19; Utah residents only; one statewide permit each for bison, black bear, buck deer, "
            "buck pronghorn, bull elk, bull moose, desert bighorn sheep, mountain goat, Rocky Mountain bighorn sheep and wild "
            "turkey; $10 non-refundable application fee per species; no bonus points earned or used."),
        src(SPORT_PAGE, "Sportsman permits", f"{W}/sportsmanpermits", 2027, None,
            "Page last updated Oct. 13, 2026: 'The following dates and deadlines have been updated for the 2027 sportsman permits.' "
            "Application period opens Oct. 20, 2026 8 a.m. MDT; application and withdrawal deadline Nov. 10, 2026 11 p.m. MST; "
            "results by email Nov. 19, 2026. Utah residents only."),
        src(FIELD, "Utah Big Game Field Regulations Guidebook 2026", f"{W}/guidebooks/field_regs.pdf", 2026, f"{W}/guidebooks",
            "Version 2026.2, published May 29, 2026 (online edition with the June 3 and July 22, 2026 corrections). "
            "Season dates pp. 8-9 (general-season, extended archery, sportsman and statewide conservation) and pp. 49-51 (elk hunts)."),
    ]
    return out


def kd(label, cycle, sid, date=None, start=None, end=None, status="confirmed", note=None, kind=None, residency=None):
    d = {"label": label}
    if kind:
        d["kind"] = kind
    if residency:
        d["residency"] = residency
    if date:
        d["date"] = date
    if start:
        d["start"], d["end"] = start, end
    d["cycle"], d["status"] = cycle, status
    if note:
        d["note"] = note
    d["sourceId"] = sid
    return d


BG_DATES = [
    kd("Big game draw application period (permits and bonus/preference points)", 2026, "d-bg-guide-2026", start="2026-03-19", end="2026-04-23",
       note="Opened 8 a.m. MDT March 19, closed 11 p.m. MDT April 23. " + NOT_2027 + ".", kind="application"),
    kd("Big game draw results available", 2026, "d-bg-guide-2026", date="2026-05-31", note="Results by email on or by May 31, 2026.", kind="results"),
    kd("Second chance to apply for big game bonus/preference points only", 2026, "d-bg-guide-2026", start="2026-06-09", end="2026-06-23",
       note="Held during the antlerless application period.", kind="points"),
    kd("Antlerless draw application period", 2026, "d-antlerless-guide-2026", start="2026-06-09", end="2026-06-23", kind="application"),
    kd("Antlerless draw results available", 2026, "d-antlerless-guide-2026", date="2026-07-08", note="Results by email on or by July 8, 2026.", kind="results"),
]


# d-news-sportsman-2027 (UDWR release, Oct. 13, 2026)
SPORT_NOTE = ("Utah residents only; one sportsman permit is offered for the species; $10 non-refundable application fee per "
              "species; no bonus points are earned or used in the sportsman drawing.")


def sportsman_dates(what):
    return [
        kd(f"2027 sportsman permit drawing application period ({what})", 2027, SPORT, start="2026-10-20", end="2026-11-10",
           note="Opens 8 a.m. MDT Oct. 20, closes 11 p.m. MST Nov. 10, 2026 (also the withdrawal deadline). " + SPORT_NOTE,
           kind="application", residency="resident"),
        kd(f"2027 sportsman permit application withdrawal deadline ({what})", 2027, SPORT_PAGE, date="2026-11-10",
           note="Withdraw an online application at no cost until 11 p.m. MST Nov. 10, 2026 (fees are not refunded).",
           kind="application-change", residency="resident"),
        kd(f"2027 sportsman permit drawing results available ({what})", 2027, SPORT, date="2026-11-19",
           note="Results by email on Thursday, Nov. 19, 2026.", kind="results", residency="resident"),
    ]


def species():
    bg_src = ["d-bg-guide-2026", "d-antlerless-guide-2026", "d-rule-r657-62", "d-points", "d-fees", FIELD]
    bonus_txt = ("Limited-entry and once-in-a-lifetime permits use bonus points: 50% of each hunt's permits go to the applicants with the most bonus points "
                 "(first choice), and the rest are drawn randomly, with an extra random number for each bonus point held.")
    return [
        {
            "species": "elk", "displayName": "Elk (limited-entry bull, general-season bull, antlerless)",
            "drawSystem": "hybrid",
            "drawSystemSummary": bonus_txt + " Antlerless elk permits are drawn by preference point. General-season any-bull, spike-bull and archery elk permits are sold over the counter, not drawn.",
            "pointsMatter": True, "pointName": "bonus point (limited-entry bull elk); preference point (antlerless elk)",
            "residentNote": "Residents may apply for one limited-entry permit (or bonus point) and one once-in-a-lifetime permit (or bonus point) each year; bull elk waiting period after drawing is five years.",
            "nonresidentNote": "Nonresidents may apply for limited-entry bull elk but not for CWMU permits through the big game drawing; resident and nonresident quotas are set per hunt.",
            "otcSummary": "General-season archery elk (July 7, 2026), any bull elk (July 9, 2026) and spike bull elk (July 16, 2026) permits went on sale over the counter; remaining antlerless permits from July 28, 2026.",
            "keyDates": BG_DATES + [
                kd("General-season archery elk permits on sale (OTC)", 2026, "d-bg-guide-2026", date="2026-07-07", kind="license-sale"),
                kd("General-season any bull elk permits on sale (OTC)", 2026, "d-bg-guide-2026", date="2026-07-09", kind="license-sale"),
                kd("General-season spike bull elk permits on sale (OTC)", 2026, "d-bg-guide-2026", date="2026-07-16", kind="license-sale"),
            ] + sportsman_dates("bull elk"),
            "sourceIds": bg_src + [SPORT, SPORT_PAGE],
        },
        {
            "species": "mule-deer", "displayName": "Mule deer (general-season buck, limited-entry/premium buck, antlerless)",
            "drawSystem": "preference",
            "drawSystemSummary": "General-season buck deer permits are drawn by preference point (applicants with the most points draw first; points are lost when a permit is drawn), with 20% of general-season permits allocated to youth. "
                                 + bonus_txt.replace("Limited-entry and once-in-a-lifetime permits", "Limited-entry and premium limited-entry buck deer permits") + " Antlerless deer are drawn by preference point.",
            "pointsMatter": True, "pointName": "preference point (general-season buck deer, antlerless deer); bonus point (limited-entry buck deer)",
            "residentNote": "Applicants may apply for a general-season buck permit/point or a Dedicated Hunter COR/point, not both; limited-entry buck deer waiting period is five years.",
            "nonresidentNote": "Nonresidents may apply for general-season and limited-entry buck deer but not for CWMU permits through the big game drawing.",
            "otcSummary": "Remaining general-season deer permits (if any) went on sale July 7, 2026; buying one forfeits general-season deer preference points.",
            "keyDates": BG_DATES + [kd("Remaining general-season deer permits on sale", 2026, "d-bg-guide-2026", date="2026-07-07", note="If available.", kind="leftover")]
                        + sportsman_dates("buck deer"),
            "sourceIds": bg_src + [SPORT, SPORT_PAGE],
        },
        {
            "species": "pronghorn", "displayName": "Pronghorn (limited-entry buck, doe)",
            "drawSystem": "hybrid",
            "drawSystemSummary": bonus_txt.replace("Limited-entry and once-in-a-lifetime permits", "Limited-entry buck pronghorn permits") + " Doe pronghorn permits are drawn by preference point.",
            "pointsMatter": True, "pointName": "bonus point (buck pronghorn); preference point (doe pronghorn)",
            "residentNote": "Buck pronghorn waiting period after drawing is two years.",
            "nonresidentNote": "Nonresidents may apply for limited-entry buck pronghorn but not for CWMU permits through the big game drawing.",
            "otcSummary": "No general-season buck pronghorn; remaining limited-entry permits (if any) from July 7, 2026 and antlerless from July 28, 2026.",
            "keyDates": BG_DATES + sportsman_dates("buck pronghorn"),
            "sourceIds": bg_src + [SPORT, SPORT_PAGE],
        },
        {
            "species": "moose", "displayName": "Moose (once-in-a-lifetime bull, antlerless)",
            "drawSystem": "hybrid",
            "drawSystemSummary": bonus_txt.replace("Limited-entry and once-in-a-lifetime permits", "Once-in-a-lifetime bull moose permits") + " Antlerless moose permits are also drawn with bonus points.",
            "pointsMatter": True, "pointName": "bonus point",
            "residentNote": "Bull moose is once-in-a-lifetime: drawing a permit forfeits bull moose bonus points.",
            "nonresidentNote": "Nonresidents may apply for once-in-a-lifetime species; resident and nonresident quotas are set per hunt.",
            "keyDates": BG_DATES + sportsman_dates("bull moose"),
            "sourceIds": bg_src + [SPORT, SPORT_PAGE],
        },
        {
            "species": "sheep", "displayName": "Bighorn sheep (desert and Rocky Mountain; Rocky Mountain ewe)",
            "drawSystem": "hybrid",
            "drawSystemSummary": bonus_txt.replace("Limited-entry and once-in-a-lifetime permits", "Once-in-a-lifetime desert and Rocky Mountain bighorn permits") + " Desert and Rocky Mountain bighorn bonus points are separate. Rocky Mountain ewe permits are drawn in the antlerless draw with bonus points.",
            "pointsMatter": True, "pointName": "bonus point",
            "nonresidentNote": "Nonresidents may apply for once-in-a-lifetime species; resident and nonresident quotas are set per hunt.",
            "keyDates": BG_DATES + sportsman_dates("desert bighorn sheep and Rocky Mountain bighorn sheep, one permit each"),
            "sourceIds": bg_src + [SPORT, SPORT_PAGE],
        },
        {
            "species": "goat", "displayName": "Rocky Mountain goat (once-in-a-lifetime)",
            "drawSystem": "hybrid",
            "drawSystemSummary": bonus_txt.replace("Limited-entry and once-in-a-lifetime permits", "Once-in-a-lifetime mountain goat permits"),
            "pointsMatter": True, "pointName": "bonus point",
            "nonresidentNote": "Nonresidents may apply for once-in-a-lifetime species; resident and nonresident quotas are set per hunt.",
            "keyDates": BG_DATES[:3] + sportsman_dates("mountain goat"),
            "sourceIds": ["d-bg-guide-2026", "d-rule-r657-62", "d-points", "d-fees", SPORT, SPORT_PAGE],
        },
        {
            "species": "bear", "displayName": "Black bear",
            "drawSystem": "hybrid",
            "drawSystemSummary": "Limited-entry bear permits (spring, summer, fall, multiseason) are drawn with bonus points under the same rule as big game: 50% of each hunt's permits go to applicants with the most bonus points, the rest randomly. Harvest-objective permits are sold over the counter.",
            "pointsMatter": True, "pointName": "bonus point",
            "otcSummary": "Bear harvest-objective permits (any legal weapon, one bear on any harvest-objective unit until the unit closes) went on sale March 10, 2026.",
            "keyDates": [
                kd("Black bear draw application period", 2026, "d-bear-guide-2026", start="2026-02-10", end="2026-02-24", note="Closed 11 p.m. MST Feb. 24. " + NOT_2027_BEAR + ".", kind="application"),
                kd("Black bear draw results available", 2026, "d-bear-guide-2026", date="2026-03-05", kind="results"),
                kd("Harvest-objective bear permits on sale (OTC)", 2026, "d-bear-guide-2026", date="2026-03-10", note="8 a.m. MDT.", kind="license-sale"),
                kd("Remaining limited-entry bear permits on sale, if available", 2026, "d-bear-guide-2026", date="2026-03-10", note="8 a.m. MDT.", kind="leftover"),
            ] + sportsman_dates("black bear"),
            "sourceIds": ["d-bear-guide-2026", "d-rule-r657-62", "d-fees", SPORT, SPORT_PAGE],
        },
        {
            "species": "lion", "displayName": "Cougar (mountain lion)",
            "drawSystem": "otc",
            "drawSystemSummary": "No draw or permit: residents and nonresidents with a valid Utah hunting or combination license may hunt or pursue cougar year-round with any legal weapon, with no annual limit; each cougar must be checked in within 48 hours. Utah ended limited-entry cougar drawings in 2023; earlier bonus points stay on record but have no use.",
            "pointsMatter": False,
            "otcSummary": "Hunting or combination license only (no separate cougar permit); a trap registration license is also needed to trap cougars.",
            "keyDates": [],
            "sourceIds": ["d-bear-guide-2026", "d-cougar-odds-2021-22", "d-cougar-odds-2022-23"],
        },
        {
            "species": "turkey", "displayName": "Wild turkey",
            "drawSystem": "hybrid",
            "drawSystemSummary": "Spring limited-entry turkey permits are drawn with bonus points: 50% of each unit's permits (rounded up) are reserved for applicants with the most bonus points, the rest drawn randomly with an extra random number per point. Spring general-season and fall management permits are sold over the counter.",
            "pointsMatter": True, "pointName": "bonus point",
            "otcSummary": "Spring general-season turkey permits go on sale March 11, 2027 (spring general season May 3-31, 2027); fall management harvest permits went on sale Sept. 10, 2026. Buying a general-season permit does not cost bonus points.",
            "keyDates": [
                kd("Fall management harvest turkey permits on sale (OTC)", 2026, "d-turkey-guide-2026-27", date="2026-09-10", note="8 a.m. MDT; fall hunts Oct. 1, 2026 - Feb. 28, 2027.", kind="license-sale"),
                kd("Limited-entry turkey draw application period (permits and bonus points)", 2027, "d-turkey-guide-2026-27", start="2026-12-15", end="2026-12-29",
                   note="Opens 8 a.m. MDT Dec. 15, closes 11 p.m. MDT Dec. 29, 2026 (times as printed by UDWR). Residents and nonresidents.", kind="application"),
                kd("Limited-entry turkey application edit/withdrawal deadline", 2027, "d-turkey-guide-2026-27", date="2026-12-29",
                   note="Deadline to withdraw or edit your application: Dec. 29, 11 p.m.", kind="application-change"),
                kd("Limited-entry turkey draw results available", 2027, "d-turkey-guide-2026-27", date="2027-01-07", kind="results"),
                kd("Remaining limited-entry turkey permits on sale", 2027, "d-turkey-guide-2026-27", date="2027-03-11", note="Sale time not printed for remaining limited-entry permits.", kind="leftover"),
                kd("Spring general-season turkey permits on sale (OTC)", 2027, "d-turkey-guide-2026-27", date="2027-03-11", note="8 a.m. MDT.", kind="license-sale"),
            ] + sportsman_dates("wild turkey, a two-bird permit"),
            "sourceIds": ["d-turkey-guide-2026-27", "d-fees", SPORT, SPORT_PAGE],
        },
    ]


def fee(sp, item, res, amt, note=None, sid="d-fees", year=2026):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": year}
    if note:
        f["note"] = note
    f["sourceId"] = sid
    return f


def fees():
    F = []
    F += [
        fee(None, "Resident 1-year basic hunting license (age 18-64)", "resident", 40.00, "Required to apply. Multiyear at $39 per year."),
        fee(None, "Nonresident 1-year basic hunting license (age 18 and older)", "nonresident", 144.00, "Required to apply."),
        fee(None, "Resident draw application fee", "resident", 10.00, "Per species; also the cost of a bonus or preference point only application."),
        fee(None, "Nonresident draw application fee", "nonresident", 21.00, "Per species; also the cost of a bonus or preference point only application."),
    ]
    T = [
        ("mule-deer", "general-season buck deer", 46.00, "general-season buck deer (includes 365-day fishing license)", 599.00),
        ("mule-deer", "limited-entry buck deer", 94.00, "limited-entry buck deer (includes 365-day fishing license)", 1070.00),
        ("mule-deer", "premium limited-entry buck deer", 185.00, "premium limited-entry buck deer (includes 365-day fishing license)", 1398.00),
        ("mule-deer", "antlerless deer", 35.00, "antlerless deer", 236.00),
        ("elk", "general-season bull elk (all weapon types)", 56.00, "general-season bull elk (includes 365-day fishing license)", 849.00),
        ("elk", "archery elk (hunter's choice)", 56.00, "archery elk (hunter's choice, includes 365-day fishing license)", 849.00),
        ("elk", "limited-entry bull elk", 314.00, "limited-entry bull elk (includes 365-day fishing license)", 1950.00),
        ("elk", "limited-entry multiseason bull elk", 564.00, "limited-entry multiseason bull elk (includes 365-day fishing license)", 2655.00),
        ("elk", "antlerless elk", 56.00, "antlerless elk", 649.00),
        ("pronghorn", "limited-entry buck pronghorn", 63.00, "limited-entry buck pronghorn (includes 365-day fishing license)", 571.00),
        ("pronghorn", "doe pronghorn", 35.00, "doe pronghorn", 236.00),
        ("moose", "bull moose", 454.00, "bull moose (includes 365-day fishing license)", 3488.00),
        ("moose", "antlerless moose", 249.00, "antlerless moose", 2200.00),
        ("sheep", "desert bighorn sheep", 564.00, "desert bighorn sheep (includes 365-day fishing license)", 3988.00),
        ("sheep", "Rocky Mountain bighorn sheep", 564.00, "Rocky Mountain bighorn sheep (includes 365-day fishing license)", 3988.00),
        ("sheep", "Rocky Mountain ewe bighorn sheep", 110.00, "Rocky Mountain ewe bighorn sheep (includes 365-day fishing license)", 2100.00),
        ("goat", "mountain goat", 454.00, "mountain goat (includes 365-day fishing license)", 3488.00),
        ("bear", "bear (limited-entry or harvest-objective permit)", 93.00, "bear (limited-entry or harvest-objective)", 600.00),
        ("bear", "bear multiseason limited-entry", 183.00, "bear multiseason limited-entry", 889.00),
        ("turkey", "wild turkey (limited-entry or general-season)", 40.00, "wild turkey (limited-entry or general-season)", 175.00),
    ]
    for sp, ri, ra, ni, na in T:
        F.append(fee(sp, "Resident " + ri, "resident", ra))
        F.append(fee(sp, "Nonresident " + ni, "nonresident", na))
    return F


def season(sp, label, start, end, year, sid="d-bg-guide-2026", note=None, method=None, units=None, huntCodes=None):
    s = {"species": sp, "label": label}
    if method:
        s["method"] = method
    if units:
        s["units"] = list(units)
    if huntCodes:
        s["huntCodes"] = list(huntCodes)
    s.update({"start": start, "end": end, "year": year})
    if note:
        s["note"] = note
    s["sourceId"] = sid
    return s


# Extended archery areas (d-bg-guide-2026 p.9; d-field-regs-2026 p.9 and pp.49-51, online edition with the June 3, 2026 correction)
EXT_DEER_A = ["Nine Mile, Green River Valley", "Sanpete Valley", "South Wasatch"]
EXT_DEER_B = ["Box Elder, West Bear River", "Herriman South Valley", "Ogden", "Uinta Basin", "Utah Lake", "Wasatch Front", "West Cache"]
# Bear harvest-objective hunts, any legal weapon (d-bear-guide-2026 pp.79-80; unit names as printed)
HO_SPRING = ["Chalk Creek/East Canyon/Morgan-South Rich", "Nine Mile", "North Slope, Three Corners/West Daggett",
             "Wasatch Mtns, Avintaquin/Currant Creek", "Yellowstone"]
HO_SUMMER = ["Boulder/Kaiparowits", "Cache/Ogden", "Chalk Creek/East Canyon/Morgan-South Rich", "Kamas/North Slope, Summit",
             "Manti, North", "Nebo", "Wasatch Mtns, West-Central"]
HO_FALL = ["Beaver", "Boulder/Kaiparowits", "Cache/Ogden", "Chalk Creek/East Canyon/Morgan-South Rich", "Diamond Mtn/Vernal/Bonanza",
           "Fillmore, Pahvant", "Fishlake/Thousand Lakes", "Kamas/North Slope, Summit", "La Sal Mtns", "Manti, North",
           "Manti, South/San Rafael, North", "Mt Dutton", "Nebo", "Nine Mile", "North Slope, Three Corners/West Daggett",
           "Panguitch Lake/Zion", "San Juan", "Wasatch Mtns, Avintaquin/Currant Creek", "Wasatch Mtns, West-Central", "Yellowstone"]
SPORTSMAN_NOTE = ("Sportsman and statewide conservation permits; hunt on open units for the species (Antelope Island and other listed "
                  "exclusions apply).")


def seasons():
    BG, BR, TK = "d-bg-guide-2026", "d-bear-guide-2026", "d-turkey-guide-2026-27"
    return [
        season("mule-deer", "General-season buck deer: archery", "2026-08-15", "2026-09-11", 2026, method="archery"),
        season("mule-deer", "General-season buck deer: muzzleloader (and restricted muzzleloader)", "2026-09-23", "2026-10-01", 2026, method="muzzleloader"),
        season("mule-deer", "General-season buck deer: early any legal weapon (rifle)", "2026-10-07", "2026-10-11", 2026, method="all"),
        season("mule-deer", "General-season buck deer: any legal weapon (rifle) (and restricted rifle)", "2026-10-17", "2026-10-25", 2026, method="all",
               note="Restricted rifle units share these dates."),
        season("mule-deer", "Extended archery deer (either sex)", "2026-09-12", "2026-10-15", 2026, method="archery", units=EXT_DEER_A,
               note="Archery buck deer permit holders (and extended-archery-only permit DB0008) who complete the archery ethics course."),
        season("mule-deer", "Extended archery deer (either sex)", "2026-09-12", "2026-11-30", 2026, method="archery", units=EXT_DEER_B,
               note="Archery buck deer permit holders (and extended-archery-only permit DB0008) who complete the archery ethics course."),
        season("mule-deer", "Sportsman/statewide conservation buck deer: archery", "2026-08-15", "2026-08-31", 2026, method="archery", huntCodes=["DB0007"], note=SPORTSMAN_NOTE),
        season("mule-deer", "Sportsman/statewide conservation buck deer: any legal weapon", "2026-09-01", "2027-01-15", 2026, method="all", huntCodes=["DB0007"], note=SPORTSMAN_NOTE),
        season("elk", "General-season any bull elk units: archery", "2026-08-15", "2026-09-16", 2026, method="archery", note="No general-season archery elk hunt on the Paunsaugunt unit."),
        season("elk", "General-season any bull elk units: early any legal weapon (rifle)", "2026-10-03", "2026-10-09", 2026, method="all"),
        season("elk", "General-season any bull elk units: late any legal weapon (rifle)", "2026-10-10", "2026-10-16", 2026, method="all"),
        season("elk", "General-season any bull elk units: muzzleloader", "2026-10-28", "2026-11-05", 2026, method="muzzleloader"),
        season("elk", "General-season spike elk units: archery", "2026-08-15", "2026-09-04", 2026, method="archery"),
        season("elk", "General-season spike elk units: any legal weapon (rifle)", "2026-10-03", "2026-10-15", 2026, method="all"),
        season("elk", "General-season spike elk units: muzzleloader", "2026-10-28", "2026-11-05", 2026, method="muzzleloader"),
        season("elk", "Draw-only youth any bull/hunter's choice elk", "2026-09-12", "2026-09-22", 2026, method="all"),
        season("elk", "Extended archery elk (any bull or antlerless)", "2026-08-15", "2026-12-15", 2026, FIELD, method="archery", units=["Uinta Basin", "Wasatch Front"],
               note="Online edition date (the print edition had Aug. 16, corrected June 3, 2026)."),
        season("elk", "Extended archery elk (any bull or antlerless)", "2026-08-15", "2027-01-31", 2026, FIELD, method="archery", units=["West Cache"]),
        season("elk", "General-season private-lands-only any bull elk (Uinta Basin)", "2026-08-01", "2026-11-15", 2026, FIELD, method="all", units=["Uinta Basin"],
               note="Private lands only, with documented landowner permission (elk damage)."),
        season("elk", "Sportsman/statewide conservation bull elk: archery", "2026-08-15", "2026-08-31", 2026, method="archery", huntCodes=["EB1000"], note=SPORTSMAN_NOTE + " No elk on Box Elder, Pilot Mtn."),
        season("elk", "Sportsman/statewide conservation bull elk: any legal weapon", "2026-09-01", "2027-01-15", 2026, method="all", huntCodes=["EB1000"], note=SPORTSMAN_NOTE + " No elk on Box Elder, Pilot Mtn."),
        season("pronghorn", "Sportsman/statewide conservation buck pronghorn: archery", "2026-08-15", "2026-08-31", 2026, method="archery", huntCodes=["PB1000"], note=SPORTSMAN_NOTE),
        season("pronghorn", "Sportsman/statewide conservation buck pronghorn: any legal weapon", "2026-09-01", "2026-11-15", 2026, method="all", huntCodes=["PB1000"], note=SPORTSMAN_NOTE),
        season("moose", "Sportsman/statewide conservation bull moose", "2026-09-01", "2026-11-15", 2026, method="all", huntCodes=["MB1000"], note=SPORTSMAN_NOTE),
        season("sheep", "Sportsman/statewide conservation Rocky Mountain bighorn sheep", "2026-09-01", "2026-12-31", 2026, method="all", huntCodes=["RS0001"], note=SPORTSMAN_NOTE + " Not on Box Elder, Pilot Mtn."),
        season("sheep", "Sportsman/statewide conservation desert bighorn sheep", "2026-09-01", "2026-12-31", 2026, method="all", huntCodes=["DS1000"], note=SPORTSMAN_NOTE),
        season("goat", "Sportsman/statewide conservation mountain goat", "2026-09-01", "2026-12-31", 2026, method="all", huntCodes=["GO1000"], note=SPORTSMAN_NOTE),
        season("bear", "Harvest-objective bear, spring (no bait)", "2026-03-28", "2026-05-25", 2026, BR, method="all", units=HO_SPRING,
               note="Over-the-counter harvest-objective permit; each unit closes early when its harvest quota is met."),
        season("bear", "Harvest-objective bear, summer (no bait/no dogs)", "2026-07-06", "2026-07-31", 2026, BR, method="all", units=HO_SUMMER,
               note="Over-the-counter harvest-objective permit; each unit closes early when its harvest quota is met."),
        season("bear", "Harvest-objective bear (no bait)", "2026-08-01", "2026-08-31", 2026, BR, method="all", units=["Chalk Creek/East Canyon/Morgan-South Rich"],
               note="Same hunt also open Nov. 2-8, 2026."),
        season("bear", "Harvest-objective bear (no bait/no dogs)", "2026-08-15", "2026-10-01", 2026, BR, method="all", units=["Book Cliffs, Bitter Creek/South"]),
        season("bear", "Harvest-objective bear, fall (no bait/no dogs)", "2026-09-01", "2026-10-25", 2026, BR, method="all", units=HO_FALL,
               note="Over-the-counter harvest-objective permit; each unit closes early when its harvest quota is met."),
        season("bear", "Harvest-objective bear (no bait)", "2026-11-02", "2026-11-08", 2026, BR, method="all", units=["Chalk Creek/East Canyon/Morgan-South Rich"],
               note="Same hunt also open Aug. 1-31, 2026."),
        season("lion", "Cougar hunting, pursuit and trapping (units not designated as restricted pursuit units)", "2026-01-01", "2026-12-31", 2026, BR, method="all",
               note="UDWR: 'Year-round' (no permit; hunting or combination license required). Shown as calendar 2026. In the restricted pursuit units "
                    "(Book Cliffs, La Sal, San Juan) cougar pursuit and hunting Mar. 28 - Nov. 1, 2026 carries a no-dogs restriction except for hunters with valid bear permits."),
        season("turkey", "Sportsman/statewide conservation bearded turkey (2-bird permit)", "2026-04-01", "2026-05-31", 2026, method="all", huntCodes=["TK0001"], note=SPORTSMAN_NOTE),
        season("turkey", "Fall management harvest turkey hunts", "2026-10-01", "2027-02-28", 2026, TK,
               note="Central, Northern, Southeastern and Southern regions (specified areas, mostly private land)."),
        season("turkey", "Spring limited-entry turkey hunts", "2027-04-10", "2027-04-29", 2027, TK),
        season("turkey", "Spring general-season youth turkey hunt", "2027-04-30", "2027-05-02", 2027, TK,
               note="Youth 17 or younger on July 31, 2027 with a general-season (or unfilled limited-entry) permit."),
        season("turkey", "Spring general-season turkey hunts", "2027-05-03", "2027-05-31", 2027, TK),
    ]


COV_NOTES = {
    "elk": "Limited-entry/CWMU bull elk and antlerless elk draws, 2022-2026 (2022-2025 from UDWR PDF reports, 2026 from UDWR's online draw-odds system). First-choice counts only. Youth draw-only elk, sportsman/conservation permits and OTC general-season elk are not included. Quotas are only available for 2026 (the PDF reports do not print them).",
    "mule-deer": "General-season buck deer (adult draw), limited-entry/premium/management/CWMU buck deer and antlerless deer draws, 2022-2026. Youth general-season deer, Dedicated Hunter and lifetime-license draws are separate UDWR reports and are not included. Quotas only for 2026.",
    "pronghorn": "Limited-entry/CWMU buck pronghorn and doe pronghorn draws, 2022-2026. Quotas only for 2026.",
    "moose": "Once-in-a-lifetime/CWMU bull moose and antlerless moose draws, 2022-2026. Two 2022 antlerless moose hunts (MA1000, MA1006) carry an agency arithmetic inconsistency, kept as printed and explained in the row note.",
    "sheep": "Once-in-a-lifetime desert bighorn and Rocky Mountain bighorn, and Rocky Mountain bighorn ewe draws, 2022-2026. Bison is out of scope.",
    "goat": "Once-in-a-lifetime mountain goat draws, 2022-2026.",
    "bear": "Limited-entry black bear draws (spring/summer/fall/multiseason/spot-and-stalk), 2022-2026. Restricted pursuit (no-harvest) draws are excluded. Harvest-objective permits are OTC and not drawn.",
    "lion": "Historical only: the last two cougar draws (October 2021 for 2021-22; June 2022 for 2022-23). Utah removed cougar permits and draws in 2023. Point-level rows omitted because points no longer matter.",
    "turkey": "Spring limited-entry and CWMU turkey draws (adult), 2022-2026. Youth turkey draw reported separately by UDWR and not included.",
}


def main():
    repo = sys.argv[1]
    base = os.path.join(repo, "src/data/agency/utah")
    cov = []
    for f in sorted(glob.glob(os.path.join(base, "draw", "*.json"))):
        sp = os.path.basename(f)[:-5]
        rows = json.load(open(f))
        cov.append({"species": sp, "years": sorted({r["year"] for r in rows}), "notes": COV_NOTES.get(sp, "")})
    meta = {
        "slug": "utah",
        "name": "Utah",
        "abbrev": "UT",
        "agency": {"name": UDWR, "shortName": "UDWR", "url": W},
        "unitTerm": "Hunt Unit",
        "lastReviewed": R,
        "overview": ("Utah draws limited-entry, once-in-a-lifetime and CWMU big game, black bear and spring turkey permits with bonus points: half of each hunt's permits go to the applicants with the most points and the rest are drawn randomly, with an extra random number per point. "
                     "General-season buck deer, antlerless deer, antlerless elk and doe pronghorn are drawn by preference point, so the applicants with the most points draw first. "
                     "Each hunt is identified by a hunt number (e.g. EB3006), and published odds count first-choice applications only. "
                     "General-season bull elk, bear harvest-objective and spring general-season turkey permits are sold over the counter, and cougar needs only a hunting license."),
        "species": species(),
        "fees": fees(),
        "seasons": seasons(),
        "coverage": cov,
        "sources": sources(),
    }
    with open(os.path.join(base, "draw-meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("wrote draw-meta.json", len(meta["sources"]), "sources")


if __name__ == "__main__":
    main()
