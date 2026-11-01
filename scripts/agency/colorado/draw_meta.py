#!/usr/bin/env python3
"""Write src/data/agency/colorado/draw-meta.json.

Usage: python -I scripts/agency/colorado/draw_meta.py <raw_dir> <repo_root>

Run after draw_build.py (it reads <raw_dir>/build_report.json for the recap sources
and the draw/<species>.json files for coverage). Every fact below was read from the
CPW document named by its sourceId; page numbers refer to the printed brochure page.
"""
import json
import os
import sys

RET = "2026-10-31"
PUB = "Colorado Parks and Wildlife"
NOT_2027 = "2027 dates not yet published by Colorado Parks and Wildlife as of 2026-10-31; these are the 2026 dates."

BG = "d-brochure-biggame-2026"
SG = "d-brochure-sheepgoat-2026"
TK = "d-brochure-turkey-2026"
LN = "d-brochure-lion-2026"
W2 = "d-regs-w2-2026"
W3 = "d-regs-w3-2026"
BGSS = "d-bgss-2025-2029"

BROCHURES = [
    {"id": BG, "title": "2026 Colorado Big Game Hunting (brochure)", "publisher": PUB,
     "url": "https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure",
     "pageUrl": "https://cpw.state.co.us/activities/hunting/big-game", "dataYear": 2026, "retrieved": RET,
     "notes": "Online version with corrections (PDF created 2026-05-27). Fees p.5, dates p.2/4/8, preference & weighted points p.9, hunt codes p.10, hybrid draw p.19, season dates p.20/35/53/58/62, white-tailed-only table p.34."},
    {"id": SG, "title": "2026 Colorado Bighorn Sheep & Mountain Goat Hunting (brochure)", "publisher": PUB,
     "url": "https://cpw.widen.net/s/n87kwmkzbt/colorado-sheep-and-goat-brochure",
     "pageUrl": "https://cpw.state.co.us/activities/hunting/big-game/hunting-bighorn-sheep", "dataYear": 2026, "retrieved": RET,
     "notes": "Fees, application/draw/payment dates, weighted points; states desert bighorn draw is random."},
    {"id": TK, "title": "2026 Colorado Turkey Hunting (brochure)", "publisher": PUB,
     "url": "https://cpw.widen.net/s/dm7sggcmdk/colorado-turkey-hunting-brochure",
     "pageUrl": "https://cpw.state.co.us/activities/hunting/turkey-hunting", "dataYear": 2026, "retrieved": RET,
     "notes": "Fees p.1, preference points and deadlines p.8, important dates back cover."},
    {"id": LN, "title": "2026–2027 Colorado Mountain Lion Hunting (brochure)", "publisher": PUB,
     "url": "https://cpw.widen.net/s/wdhnb9pcvs/colorado-mountain-lion-hunting-brochure",
     "pageUrl": "https://cpw.state.co.us/activities/hunting/big-game/hunting-mountain-lion", "dataYear": 2026, "retrieved": RET,
     "notes": "License fees, season dates and harvest-limit groups for the April 2026–March 2027 license year."},
    {"id": W2, "title": "Chapter W-2 – Big Game (Colorado Parks and Wildlife regulations)", "publisher": PUB,
     "url": "https://cpw.widen.net/s/s97gq9wqrf/chapter-w-2---big-game-regulations",
     "pageUrl": "https://cpw.state.co.us/rules-and-regulations", "dataYear": 2026, "retrieved": RET,
     "notes": "Copy linked on CPW's Rules and Regulations page (PDF created 2026-05-08; effective July 1, 2026). Season tables by hunt code "
              "(#218 sheep, #219 desert sheep, #227 goat, #237–#239 bear, #248–#250 deer, #255–#257 elk, #261–#262 pronghorn, #270 moose) "
              "with 2026 license numbers, and 'License year 2025–2029' tables of the standard season dates; #206 draw rules."},
    {"id": W3, "title": "Chapter W-3 – Furbearers and Small Game, Except Migratory Birds (Colorado Parks and Wildlife regulations)", "publisher": PUB,
     "url": "https://cpw.widen.net/s/kmpdszcx6j/ch03",
     "pageUrl": "https://cpw.state.co.us/rules-and-regulations", "dataYear": 2026, "retrieved": RET,
     "notes": "Adopted July 16, 2026, effective Sept. 1, 2026. #322 Wild Turkey: 2026 spring, fall and late season hunt-code tables (open/close dates) and application rules."},
    {"id": BGSS, "title": "2025 - 2029 Big Game Season Structure", "publisher": PUB,
     "url": "https://cpw.state.co.us/sites/default/files/dam/ifgylu070o/final_bgss2025-2029.pdf",
     "pageUrl": "https://cpw.state.co.us/SeasonStructure", "dataYear": 2027, "retrieved": RET,
     "notes": "Final season structure adopted by the Parks and Wildlife Commission in June 2024 (minor moose cleanup Nov. 2024); "
              "lists each standard deer, elk, pronghorn, moose, bear and lion season's dates for 2025–2029. Annual regulations set hunt codes and licenses."},
]
for y, ts, orig in [(2022, "20220328164312", "https://cpw.state.co.us/Documents/RulesRegs/Brochure/BigGame/biggame.pdf"),
                    (2023, "20230329171230", "https://cpw.state.co.us/Documents/RulesRegs/Brochure/BigGame/biggame.pdf"),
                    (2024, "20240317142907", "https://cpw.state.co.us/Documents/RulesRegs/Brochure/BigGame/biggame.pdf"),
                    (2025, "20250214170715", "https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure")]:
    BROCHURES.append({
        "id": f"d-brochure-biggame-{y}", "title": f"{y} Colorado Big Game (brochure)", "publisher": PUB,
        "url": f"http://web.archive.org/web/{ts}/{orig}", "pageUrl": orig, "dataYear": y, "retrieved": RET,
        "notes": f"Internet Archive capture of CPW's {y} brochure (CPW replaces the file at the same link every year). Used only for the {y} 'Limited Licenses — White-tailed (deer) only' hunt code table that sorts deer hunt codes into the whitetail file."})


def window(label, start, end, cycle, src, note=NOT_2027, kind=None, residency=None):
    d = {"label": label, "kind": kind, "cycle": cycle, "status": "confirmed", "sourceId": src, "note": note}
    if residency:
        d["residency"] = residency
    if not kind:
        raise ValueError("key date without kind: " + label)
    if start == end:
        d["date"] = start
    else:
        d["start"], d["end"] = start, end
    return d


def bg_dates(point_code, secondary=True):
    """2026 big game brochure p.2 'At a Glance — Important Dates: 2026' and p.4 'Important Dates'."""
    k = [
        window("Qualifying licenses on sale (required before applying)", "2026-03-01", "2026-03-01", 2026, BG, kind="license-sale"),
        window("Primary draw application period (apply by 8 p.m. MT on the last day)", "2026-03-01", "2026-04-07", 2026, BG, kind="application"),
        window(f"Preference-point-only application (enter {point_code} as first choice in the primary draw)", "2026-03-01", "2026-04-07", 2026, BG, kind="points"),
        window("Primary draw application correction deadline (8 p.m. MT)", "2026-04-07", "2026-04-07", 2026, BG, kind="application-change"),
        window("Primary draw results posted to CPW accounts", "2026-05-26", "2026-05-29", 2026, BG, kind="results"),
        window("Primary draw surrender deadline (11:59 p.m. MT)", "2026-06-01", "2026-06-01", 2026, BG, kind="surrender"),
        window("Primary draw license payment deadline (11:59 p.m. MT)", "2026-06-12", "2026-06-12", 2026, BG, kind="payment"),
    ]
    if secondary:
        k += [window("Secondary draw application period (no preference points; 8 p.m. MT deadline, corrections by the same time)", "2026-06-18", "2026-06-30", 2026, BG, kind="leftover"),
              window("Secondary draw results posted", "2026-07-07", "2026-07-07", 2026, BG, kind="results"),
              window("Secondary draw surrender deadline (11:59 p.m. MT)", "2026-07-09", "2026-07-09", 2026, BG, kind="surrender"),
              window("Secondary draw license payment deadline (11:59 p.m. MT)", "2026-07-21", "2026-07-21", 2026, BG, kind="payment")]
    k.append(window("Leftover limited and over-the-counter licenses on sale (9 a.m. MT)", "2026-08-04", "2026-08-04", 2026, BG, kind="leftover"))
    return k


def sg_dates(point_code):
    """2026 sheep & goat brochure p.6 and back cover 'Dates to know'."""
    return [
        window("Qualifying licenses on sale (required before applying)", "2026-03-01", "2026-03-01", 2026, SG, kind="license-sale"),
        window("Primary draw application period (apply by 8 p.m. MT on the last day)", "2026-03-01", "2026-04-07", 2026, SG, kind="application"),
        window(f"Preference-point-only application (enter {point_code} as first choice)", "2026-03-01", "2026-04-07", 2026, SG, kind="points"),
        window("Application correction deadline (8 p.m. MT)", "2026-04-07", "2026-04-07", 2026, SG, kind="application-change"),
        window("Draw results posted to CPW accounts", "2026-04-23", "2026-04-23", 2026, SG, kind="results"),
        window("Surrender deadline (11:59 p.m. MT)", "2026-04-27", "2026-04-27", 2026, SG, kind="surrender"),
        window("License / preference point payment deadline (11:59 p.m. MT)", "2026-05-07", "2026-05-07", 2026, SG, kind="payment"),
    ]


HYBRID = ("In hunt codes that need 10+ resident preference points to draw (three-year rolling average, one-year lag), up to 20% of "
          "licenses may be issued by a random 'hybrid' draw among first-choice applicants with at least 5 points (p.19).")
NR_CAP = ("Nonresidents may receive up to 20% of the licenses in hunt codes that needed 6+ points for an adult resident to draw "
          "(marked '+' in the brochure) and up to 25% in others; the cap can rise if licenses remain after all resident first choices "
          "are drawn, and it does not apply to private-land-only or Ranching for Wildlife licenses (p.4).")
QUAL = ("Applicants must first buy a current qualifying license (e.g., annual small game: resident $38.49, nonresident $104.86) "
        "and, ages 18–64, a $12.76 Habitat Stamp; the application fee is $8.93 resident / $11.49 nonresident per species.")
PP = ("Preference points are used only in the primary draw and only for first choices; an applicant who does not draw a first-choice "
      "license gains one point, and all points for the species reset to zero when a first-choice license is drawn (p.9).")
W2028 = "CPW's Commission approved draw-process changes that take effect in 2028 (cpw.state.co.us/2028-draw)."

SPECIES = [
    {"species": "elk", "displayName": "Elk", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": "Limited elk licenses are awarded in CPW's primary draw by preference points: applicants with the most points for their first-choice hunt code draw first. " + HYBRID,
     "residentNote": QUAL + " " + PP,
     "nonresidentNote": NR_CAP + " Nonresidents can no longer buy over-the-counter archery elk licenses west of I-25 or in GMU 140; limited nonresident archery hunt codes are offered in the draw instead (2026 brochure p.1).",
     "otcSummary": "2026: unlimited OTC archery licenses for either-sex (E-E-000-U1-A) and antlerless (E-F-000-U1-A) elk are resident-only in the listed GMUs; nonresidents may hunt OTC archery only east of I-25 (E-E-087-U1-A, E-F-133-U1-A). Unlimited OTC bull licenses for the 2nd and 3rd rifle seasons (E-M-000-U2-R, E-M-000-U3-R) in listed GMUs, plus OTC plains either-sex rifle and GMU 128 bull rifle licenses. OTC sales opened Aug. 4, 2026. " + W2028,
     "keyDates": bg_dates("E-P-999-99-P"), "sourceIds": [BG]},
    {"species": "mule-deer", "displayName": "Deer (all limited deer hunt codes except white-tailed-only)", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": "Most Colorado deer licenses are limited and issued through the primary draw by preference points (most points first, first choice only). " + HYBRID,
     "residentNote": QUAL + " " + PP,
     "nonresidentNote": NR_CAP,
     "otcSummary": "No over-the-counter mule deer licenses; CPW states most deer licenses are limited and available only through the draw(s). Leftover limited licenses go on sale Aug. 4. " + W2028,
     "keyDates": bg_dates("D-P-999-99-P"), "sourceIds": [BG]},
    {"species": "whitetail", "displayName": "White-tailed deer (white-tailed-only hunt codes)", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point (shared deer point)",
     "drawSystemSummary": "White-tailed-deer-only hunt codes are part of CPW's deer primary draw and use the same deer preference points (most points first, first choice only). This file holds the hunt codes CPW lists in each year's 'Limited Licenses — White-tailed (deer) only' table.",
     "residentNote": QUAL + " " + PP,
     "nonresidentNote": NR_CAP,
     "otcSummary": "CPW also sells over-the-counter white-tailed-deer-only late rifle licenses in certain units where mule deer are the main management species (2026 brochure p.33).",
     "keyDates": bg_dates("D-P-999-99-P"), "sourceIds": [BG, "d-brochure-biggame-2022", "d-brochure-biggame-2023", "d-brochure-biggame-2024", "d-brochure-biggame-2025"]},
    {"species": "pronghorn", "displayName": "Pronghorn", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": "Limited pronghorn licenses are issued in CPW's primary draw by preference points (most points first, first choice only). " + HYBRID,
     "residentNote": QUAL + " " + PP,
     "nonresidentNote": NR_CAP,
     "otcSummary": "2026: unlimited OTC either-sex archery licenses (A-E-000-U1-A), Aug. 15–Sept. 20 (bucks only Aug. 15–31), valid in the GMUs listed in the brochure (p.54).",
     "keyDates": bg_dates("A-P-999-99-P"), "sourceIds": [BG]},
    {"species": "moose", "displayName": "Moose", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point / weighted preference point",
     "drawSystemSummary": "Moose licenses are draw-only. Applicants accumulate up to three preference points; once an applicant has three points and fails to draw a first choice, they gain weighted points, and the draw among 3-point applicants is weighted-random (application number divided by weighted points + 1), not strict preference (p.9).",
     "residentNote": "Resident preference/weighted point fee $50 (age 18+), charged when applying for a point code or not drawing a first choice; fee can be opted out of (no point is then gained). " + QUAL,
     "nonresidentNote": "Nonresident preference/weighted point fee $100 (age 18+). Hunt-level resident and nonresident quotas are published in the draw recap (quota fields).",
     "otcSummary": "None; moose licenses are available only by draw (plus auction/raffle licenses). In 2026 some moose quota was reserved for 2025 license holders affected by the 2025 fires ('G' season hunt codes).",
     "keyDates": bg_dates("M-P-999-99-P", secondary=False), "sourceIds": [BG]},
    {"species": "bear", "displayName": "Black bear", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": "Limited bear licenses (e.g., September rifle) are issued in CPW's primary draw by preference points (most points first, first choice only). " + HYBRID,
     "residentNote": QUAL + " " + PP,
     "nonresidentNote": NR_CAP,
     "otcSummary": "2026: OTC bear licenses include add-on archery and muzzleloader licenses for holders of a deer or elk license for the same method with an overlapping GMU, an add-on rifle license for E-E-061-E1-R holders, OTC September plains rifle (Sept. 2–Nov. 22) and private-land-only rifle hunts, and OTC rifle licenses during the regular rifle seasons in listed units (p.62–66).",
     "keyDates": bg_dates("B-P-999-99-P"), "sourceIds": [BG]},
    {"species": "sheep", "displayName": "Bighorn sheep (Rocky Mountain & desert)", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point / weighted preference point (Rocky Mountain bighorn)",
     "drawSystemSummary": "Rocky Mountain bighorn sheep use the same three-point preference plus weighted-random system as moose and mountain goat. Desert bighorn sheep are drawn at random; CPW states preference points do not apply, and a desert bighorn harvest is once in a lifetime. You cannot apply for Rocky Mountain and desert bighorn in the same year.",
     "residentNote": "Resident license $385.66 (Rocky Mountain or desert); preference/weighted point fee $50 (age 18+); application fee $8.93; qualifying license and Habitat Stamp required. After harvesting a Rocky Mountain bighorn ram you must wait five years before applying for another ram license.",
     "nonresidentNote": "CPW allocates 10% of limited sheep and goat licenses to nonresidents. Nonresident license/fishing combo $2,823.53; point fee $100; application fee $11.49.",
     "otcSummary": "None; draw only (plus auction/raffle licenses).",
     "keyDates": sg_dates("S-P-999-99-P"), "sourceIds": [SG]},
    {"species": "goat", "displayName": "Mountain goat", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point / weighted preference point",
     "drawSystemSummary": "Mountain goat licenses are draw-only and use CPW's three-point preference plus weighted-random system (as for moose and Rocky Mountain bighorn).",
     "residentNote": "Resident license $385.66; preference/weighted point fee $50 (age 18+); application fee $8.93; qualifying license and Habitat Stamp required. After harvesting a mountain goat you must wait five years before applying again.",
     "nonresidentNote": "CPW allocates 10% of limited sheep and goat licenses to nonresidents. Nonresident license/fishing combo $2,823.53; point fee $100; application fee $11.49.",
     "otcSummary": "None; draw only (plus auction/raffle licenses).",
     "keyDates": sg_dates("G-P-999-99-P"), "sourceIds": [SG]},
    {"species": "lion", "displayName": "Mountain lion", "drawSystem": "otc", "pointsMatter": False,
     "drawSystemSummary": "Mountain lion licenses are not drawn: annual licenses are sold over the counter and hunting is managed with harvest limits per group of GMUs; a group closes when its limit is reached, so hunters must check the Available Lion Harvest Limit Report.",
     "residentNote": "Resident license $64.02; hunter education plus CPW's mountain lion education course and test are required.",
     "nonresidentNote": "Nonresident license $845.16.",
     "otcSummary": "Annual licenses went on sale March 25, 2026; season Nov. 23, 2026–March 31, 2027 (no April season in 2027); one lion per license year.",
     "keyDates": [window("Annual mountain lion licenses on sale", "2026-03-25", "2026-03-25", 2026, LN,
                         "2026–27 license year; the 2027–28 brochure was not yet published by Colorado Parks and Wildlife as of 2026-10-31.",
                         kind="license-sale")],
     "sourceIds": [LN]},
    {"species": "turkey", "displayName": "Wild turkey (spring & fall)", "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": "Limited spring and fall turkey licenses are drawn separately by preference points (most points first, first choice only; groups use the member with the fewest points). Up to two points can be gained per year by applying in both seasons; point-only codes are T-M-999-99-P (spring) and T-E-999-99-P (fall).",
     "residentNote": "Resident spring license $38.49, fall $32.11, youth $20.62; application fee $8.93; Habitat Stamp required ages 18–64.",
     "nonresidentNote": "Nonresident spring or fall license $194.21, youth $130.39; application fee $11.49.",
     "otcSummary": "OTC spring licenses (on sale March 1, 2026; Apr. 11–May 31) and OTC fall/late licenses (on sale June 18, 2026; fall code T-E-000-U2-R) are sold for the units shown on CPW's maps.",
     "keyDates": [
         # 2026 turkey brochure p.8 and back cover
         window("Spring limited draw application period (8 p.m. MT deadline)", "2026-01-02", "2026-02-03", 2026, TK, kind="application"),
         window("Spring preference-point-only application (T-M-999-99-P as first choice)", "2026-01-02", "2026-02-03", 2026, TK, kind="points"),
         window("Spring application correction deadline (8 p.m. MT)", "2026-02-03", "2026-02-03", 2026, TK, kind="application-change"),
         window("Spring draw results posted (by)", "2026-02-11", "2026-02-11", 2026, TK, kind="results"),
         window("Spring surrender deadline (11:59 p.m. MT)", "2026-02-13", "2026-02-13", 2026, TK, kind="surrender"),
         window("Spring license payment deadline", "2026-02-25", "2026-02-25", 2026, TK, kind="payment"),
         window("Spring over-the-counter license sales begin", "2026-03-01", "2026-03-01", 2026, TK, kind="license-sale"),
         window("Fall limited draw application period (8 p.m. MT deadline)", "2026-05-01", "2026-05-29", 2026, TK, kind="application"),
         window("Fall preference-point-only application (T-E-999-99-P as first choice)", "2026-05-01", "2026-05-29", 2026, TK, kind="points"),
         window("Fall application correction deadline (8 p.m. MT)", "2026-05-29", "2026-05-29", 2026, TK, kind="application-change"),
         window("Fall draw results posted (by)", "2026-06-04", "2026-06-04", 2026, TK, kind="results"),
         window("Fall surrender deadline (11:59 p.m. MT)", "2026-06-06", "2026-06-06", 2026, TK, kind="surrender"),
         window("Fall license payment deadline", "2026-06-18", "2026-06-18", 2026, TK, kind="payment"),
         window("Fall/late over-the-counter license sales begin", "2026-06-18", "2026-06-18", 2026, TK, kind="license-sale")],
     "sourceIds": [TK]},
]

FEES = []


def fee(sp, item, res, amt, src, note=None):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": src}
    if note:
        f["note"] = note
    FEES.append(f)


for res, a, q, h in (("resident", 8.93, 38.49, 12.76), ("nonresident", 11.49, 104.86, 12.76)):
    fee(None, "Application processing fee (per species, per draw, nonrefundable)", res, a, BG)
    fee(None, "Annual small game license (qualifying license for the big game draws)", res, q, BG,
        "Resident youth $2.53; other qualifying licenses listed on p.5." if res == "resident" else "Youth $2.53.")
    fee(None, "2026 Habitat Stamp (ages 18–64, required to apply or buy)", res, h, BG)
for sp in ("mule-deer", "whitetail"):
    fee(sp, "Deer license — resident adult", "resident", 51.25, BG)
    fee(sp, "Deer license — resident youth", "resident", 20.30, BG)
    fee(sp, "Deer license — nonresident adult/fishing combo", "nonresident", 506.92, BG)
    fee(sp, "Deer license — nonresident youth/fishing combo", "nonresident", 130.07, BG)
fee("elk", "Elk license — resident adult", "resident", 70.40, BG)
fee("elk", "Elk license — resident youth", "resident", 20.30, BG)
fee("elk", "Elk license — nonresident bull/fishing combo", "nonresident", 845.16, BG)
fee("elk", "Elk license — nonresident either-sex/fishing combo", "nonresident", 845.16, BG)
fee("elk", "Elk license — nonresident cow/fishing combo", "nonresident", 845.16, BG)
fee("elk", "Elk license — nonresident youth/fishing combo", "nonresident", 130.07, BG)
fee("pronghorn", "Pronghorn license — resident adult", "resident", 51.25, BG)
fee("pronghorn", "Pronghorn license — resident youth", "resident", 20.30, BG)
fee("pronghorn", "Pronghorn license — nonresident adult/fishing combo", "nonresident", 506.92, BG)
fee("pronghorn", "Pronghorn license — nonresident youth/fishing combo", "nonresident", 130.07, BG)
fee("moose", "Moose license — resident", "resident", 385.66, BG)
fee("moose", "Moose license — nonresident/fishing combo", "nonresident", 2823.53, BG)
fee("moose", "Preference & weighted point fee (age 18+)", "resident", 50, BG)
fee("moose", "Preference & weighted point fee (age 18+)", "nonresident", 100, BG)
fee("bear", "Bear license — resident", "resident", 64.01, BG)
fee("bear", "Bear license — resident youth", "resident", 19.93, BG)
fee("bear", "Bear license — nonresident adult/fishing combo", "nonresident", 302.56, BG)
fee("bear", "Bear license — nonresident youth/fishing combo", "nonresident", 64.10, BG)
fee("sheep", "Rocky Mountain bighorn sheep license — resident", "resident", 385.66, SG)
fee("sheep", "Desert bighorn sheep license — resident", "resident", 385.66, SG)
fee("sheep", "Rocky Mountain bighorn sheep/fishing combo — nonresident", "nonresident", 2823.53, SG)
fee("sheep", "Desert bighorn sheep/fishing combo — nonresident", "nonresident", 2823.53, SG)
fee("sheep", "Preference & weighted point fee (age 18+, Rocky Mountain bighorn)", "resident", 50, SG)
fee("sheep", "Preference & weighted point fee (age 18+, Rocky Mountain bighorn)", "nonresident", 100, SG)
fee("goat", "Mountain goat license — resident", "resident", 385.66, SG)
fee("goat", "Mountain goat/fishing combo — nonresident", "nonresident", 2823.53, SG)
fee("goat", "Preference & weighted point fee (age 18+)", "resident", 50, SG)
fee("goat", "Preference & weighted point fee (age 18+)", "nonresident", 100, SG)
fee("turkey", "Spring turkey license — resident", "resident", 38.49, TK)
fee("turkey", "Fall turkey license — resident", "resident", 32.11, TK)
fee("turkey", "Youth spring or fall turkey license — resident", "resident", 20.62, TK)
fee("turkey", "Spring or fall turkey license — nonresident", "nonresident", 194.21, TK)
fee("turkey", "Youth spring or fall turkey license — nonresident", "nonresident", 130.39, TK)
fee("lion", "Mountain lion license — resident", "resident", 64.02, LN)
fee("lion", "Mountain lion license — nonresident", "nonresident", 845.16, LN)

SEASONS = []


def season(sp, label, s, e, src, note=None, year=None, method=None, units=None, huntCodes=None):
    d = {"species": sp, "label": label}
    if method:
        d["method"] = method
    if units:
        d["units"] = units
    if huntCodes:
        d["huntCodes"] = huntCodes
    d.update({"start": s, "end": e, "year": year or int(s[:4]), "sourceId": src})
    if note:
        d["note"] = note
    SEASONS.append(d)


# ---- 2026: big game brochure p.2 "Season Dates: 2026" and the species pages (BG), checked against the
# Chapter W-2 "License year" tables (W2). Hunt codes with other dates carry them on their draw rows.
UNL = "Unless otherwise noted in the hunt code tables."
WEST = "West of I-25 and GMU 140."
for sp in ("elk", "mule-deer", "whitetail", "bear"):
    season(sp, "Archery", "2026-09-02", "2026-09-30", BG, UNL + (" Deer: " + WEST + " (plains archery below)" if sp in ("mule-deer", "whitetail") else ""), method="archery")
    season(sp, "Muzzleloader", "2026-09-12", "2026-09-20", BG, UNL if sp != "bear" else None, method="muzzleloader")
for sp in ("elk", "mule-deer", "whitetail", "bear"):
    deer = sp in ("mule-deer", "whitetail")
    season(sp, "First rifle season", "2026-10-14", "2026-10-18", BG, "Deer: in select GMUs (see rifle hunt code tables)." if deer else None, method="rifle")
    season(sp, "Second rifle season", "2026-10-24", "2026-11-01", BG, method="rifle")
    season(sp, "Third rifle season", "2026-11-07", "2026-11-15", BG, method="rifle")
    season(sp, "Fourth rifle season", "2026-11-18", "2026-11-22", BG, method="rifle")
for sp in ("mule-deer", "whitetail"):
    season(sp, "Plains archery", "2026-10-01", "2026-12-31", W2, "East of I-25 except GMU 140. Archery is closed while plains rifle seasons are open: "
           "Oct. 1–23, Nov. 4–30 and Dec. 15–31 in most plains units (Oct. 1–23 and Nov. 4–Dec. 31, or Oct. 1–Nov. 30 and Dec. 15–31, in others; see hunt codes).", method="archery")
    season(sp, "Plains muzzleloader", "2026-10-10", "2026-10-18", W2, "East of I-25 except GMU 140. " + UNL, method="muzzleloader")
    season(sp, "Plains rifle", "2026-10-24", "2026-11-03", BG, "East of I-25 except GMU 140. " + UNL, method="rifle")
    season(sp, "Late plains rifle", "2026-12-01", "2026-12-14", W2, "East of I-25 except GMU 140, in the units with late plains hunt codes. " + UNL, method="rifle")
ELK_PLAINS_2026 = ("87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 105, 106, 107, 109, 110, 111, 112, 113, 114, 115, "
                   "116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 129, 130, 132, 135, 136, 137, 138, 139, 143, 144, 145, 146, 147, 951").split(", ")
BEAR_PLAINS_2026 = ("87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 109, 110, 111, 112, 113, 114, 115, "
                    "116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 132, 133, 134, 135, 136, 137, 138, 139, 141, 142, "
                    "143, 144, 145, 146, 147, 951").split(", ")
season("elk", "Plains rifle (east of I-25)", "2026-09-01", "2027-01-31", W2, "Either-sex, over the counter (E-E-087-U5-R), W-2 #257.", year=2026,
       method="rifle", units=ELK_PLAINS_2026, huntCodes=["EE087U5R"])
season("bear", "September rifle (limited)", "2026-09-02", "2026-09-30", BG, UNL, method="rifle")
season("bear", "September plains rifle (over-the-counter)", "2026-09-02", "2026-11-22", W2, "Over the counter (B-E-087-U6-R), W-2 #239 C.",
       method="rifle", units=BEAR_PLAINS_2026, huntCodes=["BE087U6R"])
season("pronghorn", "Archery", "2026-08-15", "2026-09-20", BG, UNL + " Aug. 15–31 bucks only; doe licenses Sept. 1–20.", method="archery")
season("pronghorn", "Muzzleloader", "2026-09-21", "2026-09-29", BG, method="muzzleloader")
season("pronghorn", "Rifle", "2026-10-03", "2026-10-11", BG, UNL + " Some hunts have early or late rifle dates.", method="rifle")
season("pronghorn", "Second rifle season", "2026-10-17", "2026-10-25", W2, "Second regular rifle hunt codes in Chapter W-2 #262 A.2.", method="rifle",
       units=["6", "16", "17", "161", "171", "87", "88"], huntCodes=["AF006O2R", "AM087O2R", "AM088O2R"])
season("moose", "Archery", "2026-09-12", "2026-09-30", BG, method="archery")
season("moose", "Muzzleloader", "2026-09-12", "2026-09-20", BG, method="muzzleloader")
season("moose", "Rifle", "2026-10-01", "2026-10-14", BG, UNL, method="rifle")
for i, (a, b) in enumerate([("2026-10-14", "2026-10-18"), ("2026-10-24", "2026-11-01"), ("2026-11-07", "2026-11-15"), ("2026-11-18", "2026-11-22")], 1):
    season("moose", f"Late antlerless rifle, part {i} of 4 (concurrent with deer/elk rifle season {i})", a, b, W2, "Antlerless late-season hunt codes in Chapter W-2 #270.",
           method="rifle", huntCodes=["MF006L1R", "MF012L1R", "MF015L1R", "MF018L1R", "MF028L1R", "MF037L1R", "MF038L1R", "MF041L1R", "MF051L1R", "MF052L1R"])
season("turkey", "Spring season", "2026-04-11", "2026-05-31", TK, "Some limited hunt codes have shorter dates (see hunt code table).")
season("turkey", "Fall season", "2026-09-01", "2026-10-23", TK, "West of I-25 and GMU 140: Sept. 1–Oct. 4; east of I-25 except GMU 140: Sept. 1–Oct. 23.")
season("turkey", "Late season", "2026-12-15", "2027-01-15", TK, year=2026)
season("lion", "Mountain lion season (2026–27 license year)", "2026-11-23", "2027-03-31", LN, "Units close when their harvest-limit group reaches its limit.", year=2026, method="all")

# ---- 2027: the standard season dates CPW has already set. Chapter W-2's "License year 2025–2029" tables (W2)
# and the 2025–2029 Big Game Season Structure (BGSS). The 2027 hunt codes, licenses and any hunt-specific
# dates come with the 2027 regulations and brochure, not yet published on 2026-10-31.
N27 = "Standard 2027 season set in advance; 2027 hunt codes and any hunt-specific dates are not yet published (2026-10-31)."
for sp in ("elk", "mule-deer", "whitetail", "bear"):
    season(sp, "Archery", "2027-09-02", "2027-09-30", W2, N27 + (" Deer: " + WEST if sp in ("mule-deer", "whitetail") else ""), method="archery")
    season(sp, "Muzzleloader", "2027-09-11", "2027-09-19", W2, N27, method="muzzleloader")
for sp in ("elk", "mule-deer", "whitetail", "bear"):
    deer = sp in ("mule-deer", "whitetail")
    season(sp, "First rifle season", "2027-10-13", "2027-10-17", W2, N27 + (" Deer: in select GMUs." if deer else ""), method="rifle")
    season(sp, "Second rifle season", "2027-10-23", "2027-10-31", W2, N27, method="rifle")
    season(sp, "Third rifle season", "2027-11-06", "2027-11-14", W2, N27, method="rifle")
    season(sp, "Fourth rifle season", "2027-11-17", "2027-11-21", W2, N27, method="rifle")
for sp in ("mule-deer", "whitetail"):
    season(sp, "Plains archery", "2027-10-01", "2027-12-31", BGSS, N27 + " East of I-25 except GMU 140; closed during plains rifle seasons: Oct. 1–29, Nov. 10–30 and Dec. 15–31 "
           "(or Oct. 1–29 and Nov. 10–Dec. 31, or Oct. 1–Nov. 30 and Dec. 15–31, depending on the unit's rifle seasons).", method="archery")
    season(sp, "Plains muzzleloader", "2027-10-09", "2027-10-17", W2, N27 + " East of I-25 except GMU 140.", method="muzzleloader")
    season(sp, "Plains rifle", "2027-10-30", "2027-11-09", W2, N27 + " East of I-25 except GMU 140.", method="rifle")
    season(sp, "Late plains rifle", "2027-12-01", "2027-12-14", W2, N27 + " East of I-25 except GMU 140 (Dec. 1–14 annually).", method="rifle")
season("elk", "Plains rifle (east of I-25)", "2027-09-01", "2028-01-31", BGSS, N27 + " East of I-25 except select GMUs (Sept. 1–Jan. 31 annually).", year=2027, method="rifle")
season("bear", "September rifle (limited)", "2027-09-02", "2027-09-30", W2, N27 + " (Sept. 2–30 annually)", method="rifle")
season("bear", "September plains rifle (over-the-counter)", "2027-09-02", "2027-11-21", W2, N27, method="rifle")
season("pronghorn", "Archery", "2027-08-15", "2027-09-20", W2, N27 + " Aug. 15–31 bucks only; doe licenses Sept. 1–20 (annual dates).", method="archery")
season("pronghorn", "Muzzleloader", "2027-09-21", "2027-09-29", W2, N27 + " (Sept. 21–29 annually)", method="muzzleloader")
season("pronghorn", "Rifle", "2027-10-02", "2027-10-10", W2, N27, method="rifle")
season("pronghorn", "Second rifle season", "2027-10-16", "2027-10-24", W2, N27 + " Only in units with second-rifle hunt codes.", method="rifle")
season("moose", "Archery", "2027-09-11", "2027-09-30", BGSS, N27, method="archery")
season("moose", "Muzzleloader", "2027-09-11", "2027-09-19", BGSS, N27, method="muzzleloader")
season("moose", "Rifle", "2027-10-01", "2027-10-14", W2, N27 + " (Oct. 1–14 annually)", method="rifle")
for i, (a, b) in enumerate([("2027-10-13", "2027-10-17"), ("2027-10-23", "2027-10-31"), ("2027-11-06", "2027-11-14"), ("2027-11-17", "2027-11-21")], 1):
    season("moose", f"Late antlerless rifle, part {i} of 4 (concurrent with deer/elk rifle season {i})", a, b, BGSS, N27 + " Optional season, only where CPW offers late antlerless moose hunt codes.", method="rifle")

COMMON = ("Counts are CPW primary-draw, first-choice results from the Draw Recap reports. resident/nonresident = CPW's adult columns; "
          "total = adult + youth general applications (landowner LPP vouchers excluded; youth and LPP numbers are in each row's note). "
          "Odds are computed as drawn / applicants (oddsComputed). minPoints = CPW's published 'Drawn Out At' level for adults; hybrid-draw "
          "winners can draw below it, which shows in byPoints. Hunt codes are printed without dashes as in the recap (EE001E1R = E-E-001-E1-R); "
          "units = the GMU in the hunt code, which CPW defines as the lowest valid GMU, so multi-GMU hunts cover more units than listed. "
          "Hunt codes CPW reports together as a float group are one row with space-separated codes. The preference-point-only code "
          "(e.g. EP99999P) is excluded; with it, the hunt-code sums reproduce CPW's statewide first-choice applicant totals exactly, and drawn "
          "totals match exactly, for every year. Secondary-draw results are not included. For the latest year, seasonDates/seasonRanges "
          "are the hunt code's dates in CPW's Chapter W-2 (big game) or W-3 (turkey) season tables, read by "
          "scripts/agency/colorado/seasons_parse.py; Ranching for Wildlife hunts, which the regulations do not date, use the brochure's "
          "RFW tables (seasonSourceId says which).")
SP_NOTES = {
    "elk": "",
    "mule-deer": " Contains every limited deer hunt code except those listed in that year's 'White-tailed deer only' brochure table; CPW deer licenses are not species-specific unless so listed.",
    "whitetail": " Hunt codes listed in each year's brochure 'Limited Licenses — White-tailed (deer) only' table (2022–2025 brochures read from Internet Archive captures of CPW's URL). Season-choice deer codes with a white-tailed-only December window stay in mule-deer.",
    "pronghorn": "",
    "moose": " byPoints.points = preference points + weighted points as CPW lists them; above 3 points the draw is weighted-random. Many moose hunt codes are float groups (archery/muzzleloader/rifle codes sharing one quota). Hunt-level resident/nonresident quotas are CPW-published. A few hunts have point-level rows summing 1 below CPW's Total Choice 1 (noted per row).",
    "bear": "",
    "sheep": " Rocky Mountain bighorn (S...) and desert bighorn (C...) in one file. RM: byPoints.points = preference + weighted points; desert: random draw, no byPoints/minPoints. Several RM hunts have point-level rows summing 1–2 below CPW's Total Choice 1 (noted per row).",
    "goat": " byPoints.points = preference + weighted points; above 3 points the draw is weighted-random. GEG08O1A 2025/2026 point rows sum 1 below CPW's total (noted).",
    "turkey": " Spring (TM...) and fall (TE...) limited draws in one file; each year has both.",
}


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    rep = json.load(open(os.path.join(raw, "build_report.json")))
    sources = BROCHURES + rep["sources"]
    dst = os.path.join(repo, "src/data/agency/colorado")
    cov = []
    rec_src = {}
    for s in rep["sources"]:
        rec_src.setdefault(s["id"].split("-")[2], []).append(s["id"])
    keymap = {"elk": ["elk"], "mule-deer": ["deer"], "whitetail": ["deer"], "pronghorn": ["pronghorn"], "moose": ["moose"],
              "bear": ["bear"], "sheep": ["rmsheep", "dsheep"], "goat": ["goat"], "turkey": ["sturkey", "fturkey"]}
    for sp in SPECIES:
        k = sp["species"]
        f = os.path.join(dst, "draw", k + ".json")
        if os.path.exists(f):
            rows = json.load(open(f))
            years = sorted({r["year"] for r in rows})
            per_year = {y: sum(1 for r in rows if r["year"] == y) for y in years}
            cov.append({"species": k, "years": years,
                        "notes": f"{len(rows)} hunt-code rows ({', '.join(f'{y}: {n}' for y, n in per_year.items())}). " + COMMON + SP_NOTES.get(k, "")})
            for rk in keymap[k]:
                sp["sourceIds"] += rec_src.get(rk, [])
        else:
            cov.append({"species": k, "years": [],
                        "notes": "No draw: mountain lion licenses are sold over the counter with harvest limits; no draw statistics exist."})
    meta = {
        "slug": "colorado", "name": "Colorado", "abbrev": "CO",
        "agency": {"name": "Colorado Parks and Wildlife", "shortName": "CPW", "url": "https://cpw.state.co.us"},
        "unitTerm": "GMU", "lastReviewed": RET,
        "overview": ("Colorado Parks and Wildlife issues most limited deer, elk, pronghorn, moose, bear, bighorn sheep, mountain goat and turkey "
                     "licenses through a primary draw in which each applicant lists up to four hunt codes per species, and preference points count "
                     "only for the first choice. Deer, elk, pronghorn, bear and turkey are drawn by preference points (with a random hybrid draw for up "
                     "to 20% of licenses in select high-demand deer, elk, pronghorn and bear hunts), while moose, Rocky Mountain bighorn sheep and "
                     "mountain goat switch to weighted-random preference once an applicant holds three points, and desert bighorn is a pure random draw. "
                     "Applicants must first buy a qualifying license and Habitat Stamp; licenses left after the primary draw go to a secondary draw "
                     "without points and then to over-the-counter leftover sales, and CPW has approved draw changes taking effect in 2028."),
        "species": SPECIES, "fees": FEES, "seasons": SEASONS, "coverage": cov, "sources": sources,
    }
    with open(os.path.join(dst, "draw-meta.json"), "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
    print("draw-meta.json:", len(sources), "sources,", len(FEES), "fees,", len(SEASONS), "seasons")


if __name__ == "__main__":
    main()
