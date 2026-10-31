#!/usr/bin/env python3
"""Write src/data/agency/kansas/draw-meta.json (KDWP draw facts, fees, 2026 seasons, sources, coverage).

Usage:
  python -I scripts/agency/kansas/draw_meta.py <repo_root>

All facts below were read from the KDWP pages/PDFs listed in SOURCES (captured 2026-10-31; see
draw_download.py). Fees are KDWP's base prices; KDWP adds a $1.00 agent fee and a $1.50 transaction
fee to every item (plus 2.95% card fee online).
"""
import json
import os
import sys

REPO = sys.argv[1]
R = "2026-10-31"
WB = "Retrieved from the Internet Archive capture of the agency URL ({}), because KDWP overwrites this file each year."
KDWP = "Kansas Department of Wildlife and Parks"

SOURCES = [
    {"id": "d-ks-deer-quotas-draw-stats-page", "title": "Deer Quotas and Draw Statistics (2026 and 2025 deer draws)", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/big-game/deer/deer-quotas-and-draw-statistics",
     "dataYear": 2026, "retrieved": R,
     "notes": "Web tables for the 2026 and 2025 resident either-species/either-sex and nonresident whitetail/mule deer stamp draws. "
              "Several 2025 nonresident cells and one 2025 resident preference-point row differ from KDWP's 2025 PDF reports; the PDFs are used for 2025."},
    {"id": "d-ks-nr-deer-draw-report-2025", "title": "Limited Draw Statistics Report, Successful & Unsuccessful - 2025 Nonresident Whitetail Either Sex Deer and Nonresident Either Species/Sex Deer (mule deer stamp): First Application Period",
     "publisher": KDWP, "url": "https://ksoutdoors.gov/content/download/14487/99514/file", "dataYear": 2025, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20260122032040/https://ksoutdoors.gov/content/download/14487/99514/file")},
    {"id": "d-ks-nr-deer-draw-report-2024", "title": "Limited Draw Statistics Report, Successful & Unsuccessful - 2024 Nonresident Whitetail Either Sex Deer and Nonresident Either Species / Either Sex Deer: First Application Period",
     "publisher": KDWP, "url": "https://ksoutdoors.com/content/download/14487/99514/file", "dataYear": 2024, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20241105035557/https://ksoutdoors.com/content/download/14487/99514/file")},
    {"id": "d-ks-res-deer-draw-report-2025", "title": "2025 Resident Either Species/Either Sex Deer Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.gov/content/download/18755/127305/file", "dataYear": 2025, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20260122033921/https://ksoutdoors.gov/content/download/18755/127305/file")},
    {"id": "d-ks-res-deer-draw-report-2024", "title": "2024 Resident Either Species/Either Sex Deer Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.com/content/download/18755/127305/file", "dataYear": 2024, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20250522201609/https://ksoutdoors.com/content/download/18755/127305/file")},
    {"id": "d-ks-deer-quotas-page-2023", "title": "Quotas and Draw Stats (2023 resident either-species and nonresident deer permits authorized)", "publisher": KDWP,
     "url": "https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats", "dataYear": 2023, "retrieved": R,
     "notes": "Former KDWP page, read from the Internet Archive capture https://web.archive.org/web/20230721164947/https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats. "
              "The 2023 draw statistics PDFs it linked were replaced by later years and were not archived."},
    {"id": "d-ks-deer-quotas-page-2022", "title": "Quotas and Draw Stats (2022 resident either-species and nonresident deer permits authorized)", "publisher": KDWP,
     "url": "https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats", "dataYear": 2022, "retrieved": R,
     "notes": "Former KDWP page, read from the Internet Archive capture https://web.archive.org/web/20221206180810/https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats. "
              "The 2022 draw statistics PDFs it linked were replaced by later years and were not archived."},
    {"id": "d-ks-antelope-page", "title": "Antelope (application details, fees, 2026 and 2025 Antelope Draw Statistics)", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/big-game/antelope", "dataYear": 2026, "retrieved": R},
    {"id": "d-ks-antelope-draw-stats-2024", "title": "2024 Antelope Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.com/content/download/56351/612251/version/2/file/2024+Antelope+Draw+Stats.pdf", "dataYear": 2024, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20250419210730/https://ksoutdoors.com/content/download/56351/612251/version/2/file/2024+Antelope+Draw+Stats.pdf")},
    {"id": "d-ks-antelope-draw-stats-2023", "title": "2023 Antelope Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.com/content/download/56351/612251/file/2023%20Antelope_Draw_Stats.pdf", "dataYear": 2023, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20240225044412/https://ksoutdoors.com/content/download/56351/612251/file/2023%20Antelope_Draw_Stats.pdf")},
    {"id": "d-ks-antelope-draw-stats-2022", "title": "2022 Antelope Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.com/content/download/14575/99966/version/24/file/2022+Antelope_Draw_Stats.pdf", "dataYear": 2022, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20230601231113/https://ksoutdoors.com/content/download/14575/99966/version/24/file/2022+Antelope_Draw_Stats.pdf")},
    {"id": "d-ks-turkey-page", "title": "Turkey (application details, 2026 Draw Statistics, 2026 seasons)", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/turkey", "dataYear": 2026, "retrieved": R},
    {"id": "d-ks-turkey-unit4-draw-stats-2025", "title": "2025 Spring Turkey UNIT 4 Draw Stats", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/home/showpublisheddocument/2328/639107476248930000", "dataYear": 2025, "retrieved": R},
    {"id": "d-ks-turkey-nr-draw-stats-2025", "title": "2025 Spring Turkey Nonresident Draw Stats", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/home/showpublisheddocument/2326/639107476246330000", "dataYear": 2025, "retrieved": R},
    {"id": "d-ks-turkey-unit4-draw-stats-2024", "title": "2024 Spring Turkey UNIT 4 Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.com/content/download/56350/612247/file/2024%20Sp%20Turkey%20Unit%204%20Draw%20Stats.pdf", "dataYear": 2024, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20241008114533/https://ksoutdoors.com/content/download/56350/612247/file/2024%20Sp%20Turkey%20Unit%204%20Draw%20Stats.pdf")},
    {"id": "d-ks-turkey-unit4-draw-stats-2023", "title": "2023 Spring Turkey UNIT 4 Draw Stats", "publisher": KDWP,
     "url": "http://ksoutdoors.com/content/download/56350/612247/file/2023%20Sp%20Turkey%20Unit%204%20Draw%20Stats.pdf", "dataYear": 2023, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20231214090150/http://ksoutdoors.com/content/download/56350/612247/file/2023%20Sp%20Turkey%20Unit%204%20Draw%20Stats.pdf")},
    {"id": "d-ks-turkey-nr-draw-stats-2024", "title": "2024 Spring Turkey Nonresident Draw Stats", "publisher": KDWP,
     "url": "https://ksoutdoors.com/content/download/56806/615568/version/1/file/2024+Sp+Turkey+NR+Stats.pdf", "dataYear": 2024, "retrieved": R,
     "notes": WB.format("https://web.archive.org/web/20240414043129/https://ksoutdoors.com/content/download/56806/615568/version/1/file/2024+Sp+Turkey+NR+Stats.pdf")},
    {"id": "d-ks-deer-page", "title": "Deer (permits, applications, preference points, quotas link)", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/big-game/deer", "dataYear": 2026, "retrieved": R},
    {"id": "d-ks-elk-page", "title": "Elk (permits, application and bonus points)", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/big-game/elk", "dataYear": 2026, "retrieved": R},
    {"id": "d-ks-elk-harvest-report-2024-25", "title": "2024-25 Kansas Elk Harvest Report", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/home/showpublisheddocument/1396/638967132842170000", "dataYear": 2024, "retrieved": R,
     "notes": "Performance report, August 2025 (M. Peek). Used only for the Fort Riley application totals quoted in the elk notes."},
    {"id": "d-ks-fees-page", "title": "Hunting & Furharvester Licenses & Permit Fees", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/licenses-permits-fees/hunting-furharvester-licenses-permit-fees-280", "dataYear": 2026, "retrieved": R,
     "notes": "Base prices; a $1.00 agent fee and $1.50 transaction fee are added to each item (plus a 2.95% card fee online)."},
    {"id": "d-ks-seasons-page", "title": "When to Hunt (season dates)", "publisher": KDWP,
     "url": "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt", "dataYear": 2026, "retrieved": R},
]

NOT_2027 = "2027 dates not yet published by KDWP as of 2026-10-31"


def kd(label, start, end, src, note=NOT_2027, cycle=2026):
    return {"label": label, "start": start, "end": end, "cycle": cycle, "status": "confirmed", "note": note, "sourceId": src}


SPECIES = [
    {"species": "whitetail", "displayName": "White-tailed deer", "drawSystem": "preference", "pointsMatter": True,
     "pointName": "preference point",
     "drawSystemSummary": "Nonresident White-tailed Deer (either-sex) permits are issued only through KDWP's April lottery (nonresident "
                          "antlerless-only and hunt-own-land permits are sold over the counter): each applicant picks one deer management "
                          "unit (plus one adjacent unit to also hunt) and a season (archery, muzzleloader or firearm), and applicants with "
                          "more preference points are drawn first. Unsuccessful applicants receive a preference point, and a point can be "
                          "bought instead of applying. Resident whitetail permits are sold over the counter.",
     "residentNote": "Residents buy Any-Season White-tailed Deer, Archery Either-Species/Either-Sex and Muzzleloader Either-Species/Either-Sex "
                     "permits over the counter (Aug. 5-Dec. 31); the only resident deer draw is the Firearm Either-Species/Either-Sex permit (see mule deer).",
     "nonresidentNote": "Apply online (GoOutdoorsKS) during the April application period; a nonresident hunting license is required at the time of "
                        "application. Group applications (up to 5, same unit and weapon) are drawn at the lowest preference point in the group. "
                        "Preference points are reset to zero if no application or point purchase is made in 5 consecutive years. The $475 permit "
                        "includes a nonrefundable $25 application fee; the rest is charged only if drawn.",
     "otcSummary": "Residents: Any-Season White-tailed, Archery and Muzzleloader Either-Species/Either-Sex, Hunt-Own-Land and Whitetail "
                   "Antlerless-Only permits over the counter. Nonresidents: up to 10 Whitetail Antlerless-Only permits over the counter "
                   "(Aug. 5-Dec. 31), in addition to any permit drawn.",
     "keyDates": [kd("Nonresident deer application period", "2026-04-01", "2026-04-24", "d-ks-fees-page"),
                  kd("Nonresident preference point purchase period", "2026-04-01", "2026-04-24", "d-ks-fees-page",
                     note=NOT_2027 + "; points can only be bought during the application period")],
     "sourceIds": ["d-ks-deer-page", "d-ks-deer-quotas-draw-stats-page", "d-ks-fees-page"]},
    {"species": "mule-deer", "displayName": "Mule deer (resident Either-Species/Either-Sex firearm permit; nonresident Mule Deer Stamp)",
     "drawSystem": "preference", "pointsMatter": True, "pointName": "preference point",
     "drawSystemSummary": "Residents draw Firearm Either-Species/Either-Sex permits (valid for white-tailed or mule deer) for the West Zone "
                          "(Units 1, 2, 17, 18) or East Zone (Units 3, 4, 5, 7, 16) with preference points. Nonresidents cannot draw a "
                          "mule deer permit directly: a nonresident who draws an archery or muzzleloader whitetail permit in Units 1, 2, 17 "
                          "or 18 and applied for the Mule Deer Stamp is entered in a separate stamp draw, where preference points do not count.",
     "residentNote": "Resident firearm either-species permits are draw-only (application May 12-June 12, 2026); a $10 preference point can be "
                     "bought instead. Archery and muzzleloader either-species/either-sex permits (which include mule deer) are sold over the counter.",
     "nonresidentNote": "Apply for the Mule Deer Stamp ($150, on top of the whitetail permit) during the April nonresident application. "
                        "If the stamp is drawn, the whitetail archery or muzzleloader permit converts to an either-species/either-sex permit; "
                        "if not, the hunter keeps the whitetail permit.",
     "otcSummary": "Residents: Archery Either-Species/Either-Sex (statewide) and Muzzleloader Either-Species/Either-Sex (East or West zone) "
                   "permits over the counter, Aug. 5-Dec. 31.",
     "keyDates": [kd("Resident Firearm Either-Species/Either-Sex application period", "2026-05-12", "2026-06-12", "d-ks-fees-page"),
                  kd("Resident preference point purchase period", "2026-05-12", "2026-06-12", "d-ks-fees-page"),
                  kd("Nonresident deer application period (incl. Mule Deer Stamp)", "2026-04-01", "2026-04-24", "d-ks-fees-page")],
     "sourceIds": ["d-ks-deer-page", "d-ks-deer-quotas-draw-stats-page", "d-ks-fees-page"]},
    {"species": "pronghorn", "displayName": "Pronghorn (antelope)", "drawSystem": "preference", "pointsMatter": True,
     "pointName": "preference point",
     "drawSystemSummary": "Firearm and muzzleloader antelope permits are resident-only and drawn by unit (2, 17, 18) and weapon, with separate "
                          "general and landowner/tenant allocations. Permits go first to applicants with the most preference points; if more "
                          "applicants are tied at the top level than permits remain, a random drawing decides. Archery permits are over the counter.",
     "residentNote": "Apply May 12-June 12, 2026 (online or by phone). A point can be bought instead of applying, but not in the same year as "
                     "buying an antelope permit. All points are lost once a firearm or muzzleloader permit is drawn, or after 5 years without an application.",
     "nonresidentNote": "Nonresidents may only buy over-the-counter archery antelope permits ($300); nonresident tenants may apply for the resident firearm draw.",
     "otcSummary": "Archery antelope permits over the counter for residents ($50) and nonresidents ($300).",
     "keyDates": [kd("Resident firearm/muzzleloader antelope application period", "2026-05-12", "2026-06-12", "d-ks-antelope-page"),
                  kd("Preference point purchase period", "2026-05-12", "2026-06-12", "d-ks-antelope-page")],
     "sourceIds": ["d-ks-antelope-page", "d-ks-fees-page"]},
    {"species": "elk", "displayName": "Elk", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
     "drawSystemSummary": "Elk hunting is limited to Kansas residents and qualifying nonresident tenants. Permits for Unit 2 and Fort Riley "
                          "Subunit 2A are drawn, with one extra chance in the draw for each bonus point; active-duty military stationed at "
                          "Fort Riley have their own preferential draw. Unit 3 permits and hunt-own-land permits are sold over the counter.",
     "residentNote": "Apply May 12-June 12, 2026; an applicant cannot apply and buy a bonus point in the same year, and points are lost when a "
                     "permit is drawn or after 5 years without an application. Fort Riley any-elk permits are once in a lifetime; Fort Riley "
                     "antlerless permits once every five years. KDWP does not publish per-hunt elk draw statistics; its 2024-25 Elk Harvest "
                     "Report counts 2,564 Fort Riley applications or point purchases for 2024 (1,954 for 2023). KDWP's fee table calls the "
                     "$10 elk point a 'Preference Point'; its elk page describes bonus points.",
     "nonresidentNote": "Not available to nonresidents (nonresident tenants only).",
     "otcSummary": "Unit 3 elk permits over the counter for residents; hunt-own-land permits over the counter in Units 2 and 3 for landowners/tenants.",
     "keyDates": [kd("Resident elk application period", "2026-05-12", "2026-06-12", "d-ks-elk-page"),
                  kd("Bonus point purchase period", "2026-05-12", "2026-06-12", "d-ks-elk-page")],
     "sourceIds": ["d-ks-elk-page", "d-ks-elk-harvest-report-2024-25", "d-ks-fees-page"]},
    {"species": "turkey", "displayName": "Wild turkey (spring)", "drawSystem": "preference", "pointsMatter": True,
     "pointName": "preference point",
     "drawSystemSummary": "Nonresident spring turkey permits (Units 1, 2, 3, 5, 6; one unit per permit) are issued only through a January-February "
                          "lottery, and Unit 4 spring permits are a resident and nonresident-tenant draw (375 permits, 200 reserved for "
                          "landowners/tenants). Unsuccessful applicants receive a preference point; a point can be bought instead of applying.",
     "residentNote": "Residents buy spring permits for Units 1, 2, 3, 5 and 6 over the counter; Unit 4 is draw-only. The fall season reopened "
                     "in 2026 for residents only (permits over the counter from Oct. 1, 2026). Resident youth permits are valid statewide, including Unit 4.",
     "nonresidentNote": "Apply Jan. 13-Feb. 13, 2026 for one unit (1, 2, 3, 5 or 6); $10 application fee plus $75 permit if drawn. "
                        "9,700 nonresident permits were authorized for 2026. Nonresident youth are also subject to the draw.",
     "otcSummary": "Residents and nonresident tenants: spring permits for Units 1, 2, 3, 5 and 6 over the counter; resident fall permits over the counter.",
     "keyDates": [kd("Nonresident and Unit 4 spring turkey application period", "2026-01-13", "2026-02-13", "d-ks-fees-page")],
     "sourceIds": ["d-ks-turkey-page", "d-ks-fees-page"]},
]


def fee(sp, item, res, amt, src="d-ks-fees-page", note=None):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": src}
    if note:
        f["note"] = note
    return f


FEES = [
    fee(None, "1 Year Hunting License (resident, ages 16-64)", "resident", 25.00),
    fee(None, "Non-Resident 1 Year Hunting License (ages 16 and older)", "nonresident", 125.00, note="Required at the time of nonresident deer application"),
    fee(None, "Non-Resident 1 Year Youth License (ages 15 and younger)", "nonresident", 40.00),
    fee("whitetail", "Kansas Resident Any-Season White-tailed Deer Permit (general)", "resident", 40.00, note="Over the counter Aug. 5-Dec. 31"),
    fee("whitetail", "Kansas Resident White-tail Antlerless Deer Only (WAO) Permit (general)", "resident", 20.00),
    fee("whitetail", "Non-Resident White-tailed Deer Permit (age 16 and older)", "nonresident", 475.00,
        note="Draw only; includes $25 nonrefundable application fee; full fee charged only if drawn"),
    fee("whitetail", "Non-Resident Youth White-tailed Deer Permit (age 15 and younger)", "nonresident", 115.00, note="Draw only; includes $25 application fee"),
    fee("whitetail", "Nonresident deer preference point", "nonresident", 25.00, note="Application period only"),
    fee("whitetail", "Non-Resident White-tailed Antlerless Deer Only (WAO) Permit", "nonresident", 50.00, note="Over the counter Aug. 5-Dec. 31"),
    fee("mule-deer", "Kansas Resident Firearm Either-Species/Either-Sex Deer Permit (general)", "resident", 50.00, note="Draw only"),
    fee("mule-deer", "Resident deer preference point (Firearm Either-Species/Either-Sex draw)", "resident", 10.00),
    fee("mule-deer", "Kansas Resident Archery or Muzzleloader Either-Species/Either-Sex Deer Permit (general)", "resident", 40.00, note="Over the counter Aug. 5-Dec. 31"),
    fee("mule-deer", "Non-Resident Mule Deer Stamp", "nonresident", 150.00, note="Draw only; in addition to the Non-Resident White-tailed Deer Permit"),
    fee("pronghorn", "Kansas Resident Firearms and Muzzleloader Antelope Permit (general)", "resident", 60.00, note="Draw only"),
    fee("pronghorn", "Resident antelope preference point", "resident", 10.00),
    fee("pronghorn", "Kansas Resident Archery Antelope Permit (general)", "resident", 50.00, note="Over the counter"),
    fee("pronghorn", "Non-Resident Archery Antelope Permit (general)", "nonresident", 300.00, note="Over the counter"),
    fee("elk", "Kansas Resident Elk Permit, Any Elk (general)", "resident", 300.00, note="Draw only; fee collected from successful applicants"),
    fee("elk", "Kansas Resident Antlerless Elk Permit (general)", "resident", 150.00),
    fee("elk", "Resident elk point", "resident", 10.00, note="Listed by KDWP's fee table as 'Preference Point'; the elk page calls it a bonus point"),
    fee("elk", "Elk Permit, Any Elk (Non-Resident Tenant)", "nonresident", 300.00, note="Nonresident tenants only"),
    fee("turkey", "Kansas Resident Spring Turkey Permit, Units 1, 2, 3, 5 & 6 (general)", "resident", 25.00, note="Over the counter"),
    fee("turkey", "Kansas Resident Spring Turkey Permit, Unit 4 (general)", "resident", 30.00, note="Draw only"),
    fee("turkey", "Unit 4 spring turkey preference point", "resident", 5.00),
    fee("turkey", "Kansas Resident Fall Turkey Permit, Units 1, 2, 3, 5 & 6 (general)", "resident", 25.00, note="Over the counter; fall season reopened 2026"),
    fee("turkey", "Non-Resident Spring Turkey Permit (general)", "nonresident", 85.00, note="Draw only; $75 permit plus $10 application fee"),
    fee("turkey", "Non-Resident Youth Spring Turkey Permit (age 15 and under)", "nonresident", 20.00, note="Draw only; $10 permit plus $10 application fee"),
]


def season(sp, label, start, end, note=None):
    s = {"species": sp, "label": label, "start": start, "end": end, "year": 2026, "sourceId": "d-ks-seasons-page"}
    if note:
        s["note"] = note
    return s


SEASONS = []
for sp in ("whitetail", "mule-deer"):
    SEASONS += [
        season(sp, "Youth and Disability (deer)", "2026-09-05", "2026-09-13"),
        season(sp, "Muzzleloader Only (deer)", "2026-09-14", "2026-09-27"),
        season(sp, "Regular Archery (deer)", "2026-09-14", "2026-12-31"),
        season(sp, "Regular Firearms (deer)", "2026-12-02", "2026-12-13"),
    ]
SEASONS += [
    season("whitetail", "Pre-Rut, Whitetail Antlerless Only (WAO)", "2026-10-10", "2026-10-12"),
    season("whitetail", "Extended Pre-Rut, Whitetail Antlerless Only (WAO) - Unit 12 Only", "2026-10-13", "2026-10-18"),
    season("pronghorn", "Antelope - Archery", "2026-09-19", "2026-09-27"),
    season("pronghorn", "Antelope - Muzzleloader Only", "2026-09-28", "2026-10-05"),
    season("pronghorn", "Antelope - Firearms", "2026-10-02", "2026-10-05"),
    season("elk", "Elk - Firearms, 1st Segment", "2026-08-01", "2026-08-31", "Statewide except Fort Riley Subunit 2a and Unit 1"),
    season("elk", "Elk - Muzzleloader Only", "2026-09-01", "2026-09-30", "Statewide except Unit 1; also Fort Riley Subunit 2a archery & muzzleloader"),
    season("elk", "Elk - Archery", "2026-09-14", "2026-12-31", "Statewide except Fort Riley Subunit 2a and Unit 1"),
    season("elk", "Elk - Firearms, 2nd Segment", "2026-12-02", "2026-12-13", "Statewide except Fort Riley Subunit 2a and Unit 1"),
    season("elk", "Elk - Firearms, 3rd Segment", "2027-01-01", "2027-03-15",
           "Statewide except Fort Riley Subunit 2a and Unit 1; KDWP lists it as January 1-March 15 each year"),
    season("elk", "Elk on Fort Riley Subunit 2a - Firearms, 1st Segment", "2026-10-01", "2026-10-31"),
    season("elk", "Elk on Fort Riley Subunit 2a - Firearms, 2nd Segment", "2026-11-01", "2026-11-30"),
    season("elk", "Elk on Fort Riley Subunit 2a - Firearms, 3rd Segment", "2026-12-01", "2026-12-31"),
    season("elk", "Elk on Fort Riley Subunit 2a - Extended Season", "2027-01-01", "2027-01-31",
           "KDWP lists it as January 1-31 each year"),
    season("turkey", "Spring Turkey - Youth and Disability", "2026-04-01", "2026-04-14"),
    season("turkey", "Spring Turkey - Archery Only", "2026-04-06", "2026-04-14"),
    season("turkey", "Spring Turkey - Regular (Firearms & Archery)", "2026-04-15", "2026-05-31"),
    season("turkey", "Fall Turkey - Residents Only (1st part)", "2026-10-31", "2026-12-01"),
    season("turkey", "Fall Turkey - Residents Only (2nd part)", "2026-12-14", "2027-01-31"),
]

COVERAGE = [
    {"species": "whitetail", "years": [2022, 2023, 2024, 2025, 2026],
     "notes": "Nonresident Whitetail Either Sex permits by deer management unit (Units 1-18). 2024-2026: quota, 1st-choice applicants, permits "
              "issued (sum of KDWP's issued-by-preference-point rows, which match KDWP's statewide totals 21,830 / 21,736 / 21,708) and the lowest "
              "point level drawn; the permits issued at each point level are in each row's note. KDWP does not publish applicants by point level, "
              "so no per-point odds are given. 2022-2023: permits authorized only (KDWP replaces its draw report every year and no copy of "
              "those years' reports survives). 2025 uses KDWP's PDF report because the 2025 web table has transcription errors in Units 4, 6, 7, "
              "13, 17 and 18 (listed in those rows). Resident whitetail permits are over the counter (no draw)."},
    {"species": "mule-deer", "years": [2022, 2023, 2024, 2025, 2026],
     "notes": "Resident Firearm Either-Species/Either-Sex draw (West and East zones; permit valid for white-tailed or mule deer) and the "
              "nonresident Mule Deer Stamp draw by unit. 2022-2023: permits/stamps authorized only. 2024 stamp: stamps issued not published. "
              "2025 resident rows use KDWP's PDF (the web page omits a 4-point row). 2026 East Zone applicants left empty because KDWP's "
              "published total (168) conflicts with its own categories (176)."},
    {"species": "pronghorn", "years": [2022, 2023, 2024, 2025, 2026],
     "notes": "Resident firearm and muzzleloader draw for Units 2, 17 and 18, split into KDWP's General and Landowner Tenant allocations; youth "
              "and nonresident-tenant applicant counts are given in notes because KDWP does not say which allocation they draw from. 2025 Unit 2 "
              "Firearms Landowner Tenant permits issued left empty (KDWP's point rows add to 45 against a quota of 44 and a statewide total of 156)."},
    {"species": "turkey", "years": [2023, 2024, 2025, 2026],
     "notes": "Unit 4 spring draw (General, Landowner/Tenant and Nonresident Tenant classes) 2023-2026 and nonresident spring draw by unit "
              "2024-2026 (the nonresident lottery began in 2024). Per-class Unit 4 quotas and 2026 per-unit nonresident quotas are not published. "
              "No 2022 Unit 4 report was found."},
    {"species": "elk", "years": [],
     "notes": "KDWP does not publish elk draw statistics by hunt (quota, applicants or drawn). Its 2024-25 Elk Harvest Report gives only the total "
              "Fort Riley applications plus point purchases (2,564 for 2024; 1,954 for 2023)."},
]

META = {
    "slug": "kansas",
    "name": "Kansas",
    "abbrev": "KS",
    "agency": {"name": KDWP, "shortName": "KDWP", "url": "https://www.ksoutdoors.gov"},
    "unitTerm": "Unit",
    "lastReviewed": R,
    "overview": "KDWP runs separate online draws: the nonresident deer draw in April (whitetail permits by deer management unit, plus a "
                "Mule Deer Stamp draw), resident firearm either-species deer, antelope and elk draws in May-June, and the nonresident and "
                "Unit 4 spring turkey draws in January-February. Deer, antelope and turkey draws use preference points (applicants with more "
                "points are drawn first) and the elk draw uses bonus points; unsuccessful applicants earn a point and points can be bought "
                "instead of applying; deer, antelope and elk points are reset after five years without an application or point purchase. Most resident deer "
                "permits, resident spring turkey permits outside Unit 4 and all archery antelope permits are sold over the counter.",
    "species": SPECIES,
    "fees": FEES,
    "seasons": SEASONS,
    "coverage": COVERAGE,
    "sources": SOURCES,
}

out = os.path.join(REPO, "src/data/agency/kansas/draw-meta.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(META, f, indent=1, ensure_ascii=False)
    f.write("\n")
print("wrote", out)
