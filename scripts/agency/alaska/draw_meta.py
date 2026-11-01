#!/usr/bin/env python3
"""Write src/data/agency/alaska/draw-meta.json (overview, species draw systems, 2027-cycle key dates, fees,
coverage, sources). Every fact below was copied from the ADF&G document named by its sourceId:

  d-supp-2027  2027-2028 Alaska Drawing Permit Hunt Supplement (page 1: application period Nov 1 - Dec 15, 2026,
               results "on the third Friday of February", $5 / $10 application fees, six applications per species,
               no permit for the same hunt two years in a row, Nov 20 deadline to ask for an alternative to applying
               online, undersubscribed permits "on the first Friday in March"; page 19: guide requirements)
  d-supp-2026  2026-2027 supplement (2026 fees; page 4: black bear DL018 / DL027-DL030 nonresident rule)
  d-subs-2027  2027-2028 Alaska Subsistence Permit Hunt Supplement (Tier II: residents only, scored, same period;
               paper applications postmarked Nov 1-30 and received by Dec 15)
  d-regs-2026  2026-2027 Alaska Hunting Regulations No. 67, pages 9-10 (license and locking-tag fees), page 14
               (harvest tickets), unit pages (elk RE325/RE706/RE752/RE755/RE756, goat RG471-RG474 and RG476 registration hunts)
  d-web-*      ADF&G web pages retrieved 2026-10-31 (drawing overview, draw results, lottery, Tier I/II, registration)

Usage: python -I draw_meta.py <repo_root>
"""
import json
import os
import sys

RETRIEVED = "2026-10-31"
PUB = "Alaska Department of Fish and Game"
B = "https://www.adfg.alaska.gov"
SUPP_PAGE = B + "/index.cfm?adfg=huntlicense.drawsupplements"
SUPP_URLS = {
    2022: B + "/static/license/huntlicense/pdfs/2022-2023_draw_supplement.pdf",
    2023: B + "/static/license/huntlicense/pdfs/2023-2024_draw_supplement.pdf",
    2024: B + "/static/license/huntlicense/pdfs/2024-2025_draw_supplement.pdf",
    2025: B + "/static/license/huntlicense/pdfs/2025-2026_draw_supplement.pdf",
    2026: B + "/static/license/huntlicense/pdfs/2026-2027-draw-supplement.pdf",
    2027: B + "/static/applications/web/nocache/license/huntlicense/pdfs/2027-2028-draw-supplement.pdf3BFB1645DB9A3CB33708AE9235433E9910F96D86BB6DD0A02297417F7BB8B4BD/2027-2028-draw-supplement.pdf",
}


def sources():
    out = []
    for y, url in SUPP_URLS.items():
        note = (f"Hunt tables (GMU/area, residency, legal animal, season dates, advertised permits, hunt area) describe the {y} drawing hunts. "
                f"Back page: 'Results of the {y - 1} Permit Hunt Drawing' (Apps Received, Permits Available, % Drawn per hunt number), "
                f"the source of every draw row for {y - 1}. ADF&G notes the Permits Available column may differ from what was advertised for administrative reasons.")
        if y == 2022:
            note = "Hunt tables describe the 2022 drawing hunts (used for the 2022 rows' hunt details); its back page holds 2021 results, which are not used."
        if y == 2027:
            note += " Page 1 gives the 2027 drawing application period (November 1 - December 15, 2026), application fees and rules."
        out.append({"id": f"d-supp-{y}", "title": f"{y}-{y + 1} Alaska Drawing Permit Hunt Supplement", "publisher": PUB,
                    "url": url, "pageUrl": SUPP_PAGE, "dataYear": y, "retrieved": RETRIEVED, "notes": note})
    out += [
        {"id": "d-subs-2027", "title": "2027-2028 Alaska Subsistence Permit Hunt Supplement", "publisher": PUB,
         "url": B + "/static/applications/web/nocache/license/huntlicense/pdfs/2027-2028-subsistence-supplement.pdf359F3A3B0DB7D8CD13881BC0478CF175D845293AE782FCF239536C1113502F9D/2027-2028-subsistence-supplement.pdf",
         "pageUrl": B + "/index.cfm?adfg=huntlicense.tiersupplements", "dataYear": 2027, "retrieved": RETRIEVED,
         "notes": "Tier II subsistence hunts (caribou, moose, muskox): Alaska residents only, applications scored on five questions; same November 1 - December 15, 2026 application period."},
        {"id": "d-regs-2026", "title": "2026-2027 Alaska Hunting Regulations (No. 67), effective July 1, 2026 - June 30, 2027", "publisher": PUB,
         "url": B + "/static/applications/web/nocache/regulations/wildliferegulations/pdfs/regulations_complete.pdfF4FABFEA04F84DC3012883459CAC68B5536D84B54ADFAC1BE626F863AC94BC83/regulations_complete.pdf",
         "pageUrl": B + "/index.cfm?adfg=wildliferegulations.hunting", "dataYear": 2026, "retrieved": RETRIEVED,
         "notes": "Pages 9-10: resident and nonresident license and locking-tag fees (licenses and locking-tags are valid for the calendar year printed on them). Page 14: general-season harvest tickets."},
        {"id": "d-web-draw", "title": "Drawing Hunt Permits Information - Draw Hunting Overview", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntlicense.draw", "retrieved": RETRIEVED,
         "notes": "Application period November 1, 8am - December 15, 5pm (AKST); single application period each year; up to 6 hunts per species."},
        {"id": "d-web-results", "title": "Drawing Hunt Permits Information - Draw Results", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntlicense.drawresults", "retrieved": RETRIEVED,
         "notes": "As retrieved: results of the November 1 - December 15, 2026 Draw, Tier I/II and Community Subsistence Harvest application period 'are expected to be available online on Friday, February 20' (February 20, 2027 is a Saturday; the supplement says the third Friday of February)."},
        {"id": "d-web-lottery", "title": "Drawing Hunt Permits Information - How Does the Random Drawing Work?", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntlicense.lottery", "retrieved": RETRIEVED},
        {"id": "d-web-tier", "title": "Alaska Tier I & II Permit Information", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntlicense.tier", "retrieved": RETRIEVED},
        {"id": "d-web-registration", "title": "Registration Hunts Overview", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntlicense.registration", "retrieved": RETRIEVED},
        {"id": "d-web-prices", "title": "Hunting / Trapping Licenses & Permits - License & Tag Prices", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntlicense.prices", "retrieved": RETRIEVED,
         "notes": "No license year printed on the page; amounts as retrieved match the 2026-2027 Hunting Regulations."},
        {"id": "d-web-hunts-2026", "title": "Permit Hunt Information for Regulatory Year 2026 (per-hunt pages)", "publisher": PUB,
         "url": B + "/index.cfm?adfg=huntingmaps.hunt_details&huntfile_id=27077", "pageUrl": B + "/index.cfm?adfg=huntingmaps.byhuntnumber",
         "dataYear": 2026, "retrieved": RETRIEVED,
         "notes": "One page per hunt (example: DM769). Used only to cross-check the parsed 2026-2027 supplement (residency, units, season, legal animal); not a source of row values."},
    ]
    return out


DRAW_DATES = [
    {"label": "Drawing permit application period (online only)", "start": "2026-11-01", "end": "2026-12-15", "cycle": 2027,
     "status": "confirmed", "sourceId": "d-supp-2027",
     "note": "Opens 8 a.m., closes 5 p.m. AKST. Hunts take place in 2027 unless designated as 2028. Paper applications are not accepted."},
    {"label": "Deadline to ask ADF&G for an alternative to applying online", "date": "2026-11-20", "cycle": 2027,
     "status": "confirmed", "sourceId": "d-supp-2027", "note": "5 p.m. AKST, through the local ADF&G office."},
    {"label": "Drawing results announced", "date": "2027-02-19", "cycle": 2027, "status": "tentative", "sourceId": "d-supp-2027",
     "note": "The 2027-2028 supplement says results are announced on the third Friday of February, which is February 19, 2027. ADF&G's Draw Results page (retrieved 2026-10-31) says 'Friday, February 20'."},
    {"label": "Undersubscribed drawing permits posted", "date": "2027-03-05", "cycle": 2027, "status": "tentative", "sourceId": "d-supp-2027",
     "note": "Supplement: information on any undersubscribed permits is posted at hunt.alaska.gov on the first Friday in March (March 5, 2027)."},
]
TIER_DATES = [
    {"label": "Tier II subsistence permit application period (residents only)", "start": "2026-11-01", "end": "2026-12-15", "cycle": 2027,
     "status": "confirmed", "sourceId": "d-subs-2027",
     "note": "Online by 5 p.m. AKST December 15; paper applications must be postmarked November 1-30 and received by December 15."},
]

COMMON = ("ADF&G awards drawing permits by a computer lottery: each valid application gets a random draw number for each hunt and "
          "permits go to the lowest numbers; there are no preference or bonus points. An applicant may submit up to six applications "
          "per species ($5 each), may apply for the same hunt more than once, may apply alone or as a two-person party, and may not "
          "be awarded the same drawing hunt two years in a row.")


def species():
    return [
        {"species": "moose", "displayName": "Moose", "drawSystem": "random",
         "drawSystemSummary": COMMON + " Moose are also hunted on general-season harvest tickets, registration permits and, for residents, scored Tier I/II subsistence permits.",
         "pointsMatter": False,
         "residentNote": "Residents need a hunting license but no moose locking-tag. Tier II moose permits (for example TM059, TM565) are for Alaska residents only and are awarded by application score, not by lottery; only one Tier II moose permit per household.",
         "nonresidentNote": "Nonresidents must buy a moose locking-tag ($800; $1,000 for nonresident aliens, who must hunt with an Alaska-licensed guide). Many drawing hunts are limited to residents or to nonresidents, and some to guided or nonguided nonresidents.",
         "otcSummary": "General-season moose hunts need only a free harvest ticket, and many registration permits are issued without a drawing; nonresidents buy the moose locking-tag over the counter.",
         "keyDates": DRAW_DATES + TIER_DATES, "sourceIds": ["d-supp-2027", "d-web-lottery", "d-subs-2027", "d-regs-2026", "d-web-registration"]},
        {"species": "sheep", "displayName": "Dall sheep", "drawSystem": "random",
         "drawSystemSummary": COMMON + " Dall sheep are also hunted in general seasons on a free harvest ticket.",
         "pointsMatter": False,
         "residentNote": "Residents need a hunting license and a sheep harvest ticket or drawing permit; no locking-tag.",
         "nonresidentNote": "Nonresident U.S. citizens must be accompanied in the field by an Alaska-licensed guide or a resident relative 19 or older within the second degree of kindred; guided nonresident drawing hunts need a signed guide-client contract at application. Dall sheep locking-tag $850 ($1,100 nonresident alien).",
         "otcSummary": "General-season Dall sheep hunts on a free harvest ticket in many units; nonresidents buy the sheep locking-tag over the counter but must hunt with a guide or qualifying resident relative.",
         "keyDates": DRAW_DATES, "sourceIds": ["d-supp-2027", "d-web-lottery", "d-regs-2026"]},
        {"species": "goat", "displayName": "Mountain goat", "drawSystem": "random",
         "drawSystemSummary": COMMON + " Mountain goats are also hunted on registration permits (for example RG471, RG472, RG473, RG474 and RG476 in Unit 8).",
         "pointsMatter": False,
         "nonresidentNote": "Nonresident U.S. citizens must be accompanied by an Alaska-licensed guide or a resident relative within the second degree of kindred; a guided nonresident may submit only one application for a Unit 8 goat hunt. Mountain goat locking-tag $600 ($800 nonresident alien).",
         "otcSummary": "Registration goat permits in several units; nonresidents buy the goat locking-tag over the counter.",
         "keyDates": DRAW_DATES, "sourceIds": ["d-supp-2027", "d-web-lottery", "d-regs-2026"]},
        {"species": "bear", "displayName": "Black bear", "drawSystem": "random",
         "drawSystemSummary": COMMON + " Only a few black bear hunts are drawn (Units 1C, 2, 3 and 14C); most black bear hunting is general season.",
         "pointsMatter": False,
         "nonresidentNote": "Nonresidents need a black bear locking-tag ($450; $600 nonresident alien). In Unit 1C South, Unit 2 and on Kuiu and Kupreanof islands (Unit 3), nonresidents not accompanied by an Alaska-licensed guide or qualified resident relative must hold a DL018 or DL027-DL030 drawing permit; accompanied nonresidents hunt on a black bear harvest ticket instead.",
         "otcSummary": "General-season black bear hunting; harvest tickets (free) are required in Units 1-7, 11-16 and 20. Nonresident locking-tags are sold over the counter.",
         "keyDates": DRAW_DATES, "sourceIds": ["d-supp-2027", "d-supp-2026", "d-web-lottery", "d-regs-2026"]},
        {"species": "elk", "displayName": "Elk", "drawSystem": "random",
         "drawSystemSummary": COMMON + " Elk drawing hunts are on Afognak and Raspberry islands (Unit 8) and Etolin and Zarembo islands (Unit 3).",
         "pointsMatter": False,
         "nonresidentNote": "Nonresident elk locking-tag $600 ($800 nonresident alien). Some elk drawing hunts are limited to nonresidents.",
         "otcSummary": "Registration elk permits (RE325 in Unit 3; RE706, RE752, RE755 and RE756 in Unit 8) are issued without a drawing.",
         "keyDates": DRAW_DATES, "sourceIds": ["d-supp-2027", "d-web-lottery", "d-regs-2026"]},
        {"species": "mule-deer", "displayName": "Sitka black-tailed deer", "drawSystem": "otc",
         "drawSystemSummary": "Sitka black-tailed deer (Odocoileus hemionus sitkensis) are hunted in general seasons on free harvest tickets; the 2022-2023 through 2027-2028 drawing supplements list no deer drawing hunts.",
         "pointsMatter": False,
         "residentNote": "Residents need a hunting license and free deer harvest tickets, used in sequential order.",
         "nonresidentNote": "Nonresidents need a deer locking-tag ($300; $400 nonresident alien) and harvest tickets.",
         "otcSummary": "Deer harvest tickets are free from license vendors, ADF&G offices and online; nonresident deer locking-tags are sold over the counter.",
         "keyDates": [], "sourceIds": ["d-regs-2026"]},
    ]


def fees():
    F = []

    def add(sp, item, res, amt, year, src, note=None):
        f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": year}
        if note:
            f["note"] = note
        f["sourceId"] = src
        F.append(f)

    for y, src in ((2026, "d-supp-2026"), (2027, "d-supp-2027")):
        for res in ("resident", "nonresident"):
            add(None, "Drawing permit application fee (black bear, brown bear, caribou, elk, moose, mountain goat, Dall sheep)", res, 5.0, y, src,
                f"Per application, for the drawing held in {y}; not refundable.")
            add(None, "Drawing permit application fee (bison, muskox)", res, 10.0, y, src, f"Per application, for the drawing held in {y}.")
    r = "d-regs-2026"
    add(None, "Resident hunting license", "resident", 45.0, 2026, r)
    add(None, "Resident hunting/trapping license", "resident", 65.0, 2026, r)
    add(None, "Resident hunting/sport fishing license", "resident", 60.0, 2026, r)
    add(None, "Resident hunting/trapping/sport fishing license", "resident", 85.0, 2026, r)
    add(None, "Resident low-income license", "resident", 5.0, 2026, r, "Household income at or below the state poverty guidelines.")
    add(None, "Resident brown/grizzly bear locking-tag", "resident", 25.0, 2026, r, "Required only in some locations. Brown/grizzly bear is not a HuntScout species key.")
    add(None, "Nonresident hunting license (all game)", "nonresident", 160.0, 2026, r)
    add(None, "Nonresident hunting and trapping license", "nonresident", 405.0, 2026, r)
    add(None, "Nonresident small game hunting license", "nonresident", 60.0, 2026, r)
    add(None, "Nonresident alien hunting license", "nonresident", 630.0, 2026, r)
    tags = [("bear", "Black bear", 450, 600), ("moose", "Moose", 800, 1000), ("sheep", "Dall sheep", 850, 1100),
            ("goat", "Mountain goat", 600, 800), ("elk", "Elk", 600, 800), ("mule-deer", "Deer (Sitka black-tailed)", 300, 400),
            (None, "Brown/grizzly bear", 1000, 1300), (None, "Caribou", 650, 850), (None, "Bison", 900, 1300), (None, "Muskox", 2200, 3000)]
    for sp, name, nr, alien in tags:
        note = "Guide (or resident relative within second degree of kindred) required." if name in ("Dall sheep", "Mountain goat", "Brown/grizzly bear") else None
        if sp is None:
            note = ((note + " ") if note else "") + f"{name} is not a HuntScout species key."
        add(sp, f"Nonresident {name.lower() if sp else name.lower()} locking-tag", "nonresident", float(nr), 2026, r, note)
        add(sp, f"Nonresident alien {name.lower()} locking-tag", "nonresident", float(alien), 2026, r,
            "Nonresident aliens must hunt all big game with an Alaska-licensed guide." + (f" {name} is not a HuntScout species key." if sp is None else ""))
    return F


def coverage(repo):
    d = os.path.join(repo, "src/data/agency/alaska/draw")
    years = {}
    for f in os.listdir(d):
        if f.endswith(".json"):
            years[f[:-5]] = sorted({r["year"] for r in json.load(open(os.path.join(d, f)))})
    base = ("Counts are ADF&G's per-hunt drawing results: Apps Received (applications, not unique applicants: one hunter may apply for the same hunt "
            "more than once and a party application covers two hunters) as total.applicants, Permits Available as total.quota, and % Drawn as "
            "published (whole percent; '<1' stored as null with a row note). No resident/nonresident split and no point data are published. "
            "Drawing year Y = applications Nov-Dec of Y-1, results in February of Y, hunts in the Y-(Y+1) regulatory year; counts from the "
            "back page of the (Y+1)-(Y+2) supplement, hunt details from the Y-(Y+1) supplement. Tier I/II subsistence, registration and "
            "general-season (harvest ticket) hunts are not drawings and are not in these rows. Caribou (DC/YC), bison (DI), muskox (DX) and "
            "emperor goose (DO) drawing hunts, brown/grizzly bear (DB) and wolf are not covered (no HuntScout species key).")
    notes = {
        "moose": base + (" Includes youth drawing hunts (YM). Hunts DM802-DM811 (Unit 21B Nowitna River, 2023-2026) and DM766 (Unit 20A Wood River CUA East, "
                         "2022-2025) are printed in tables whose cells could not be separated, so those rows carry only the GMU/area label and the counts. "
                         "Season dates are omitted for 49 moose rows and the legal animal for 61 where the supplement cell could not be read "
                         "unambiguously (mostly 2022 Unit 14A and the hunts above); JBER (14C) weapon certifications are printed in rotated text and "
                         "are not captured."),
        "sheep": base + " Dall sheep.",
        "goat": base + " The supplement lists DG352 (Brown Mtn.) under the Unit 7 heading and DG354/DG356 as 15C; ADF&G's 2026 hunt pages give 15C and 15B for these, units are kept as the supplement prints them.",
        "bear": base + " Black bear only (DL hunts); the legal animal comes from the black bear page header in the 2024-2026 supplements (not printed there in 2022-2023). Brown/grizzly bear drawing hunts (DB, including Kodiak) are excluded because brown/grizzly bear is not a HuntScout species key.",
        "elk": base + " Unit 8 (Afognak, Raspberry islands) and Unit 3 (Etolin, Zarembo islands) elk drawing hunts.",
        "mule-deer": "Sitka black-tailed deer: ADF&G held no deer drawing hunts in the 2022-2026 drawings (none in any results table), so there are no draw rows. Deer are hunted on general-season harvest tickets.",
    }
    cov = []
    for sp in ("moose", "sheep", "goat", "bear", "elk", "mule-deer"):
        cov.append({"species": sp, "years": years.get(sp, []), "notes": notes[sp]})
    return cov


def main():
    repo = sys.argv[1]
    meta = {
        "slug": "alaska",
        "name": "Alaska",
        "abbrev": "AK",
        "agency": {"name": "Alaska Department of Fish and Game", "shortName": "ADF&G", "url": "https://www.adfg.alaska.gov"},
        "unitTerm": "GMU",
        "lastReviewed": RETRIEVED,
        "overview": ("ADF&G awards drawing permits by a random computer lottery with no preference or bonus points, from one application period each year "
                     "(November 1 - December 15, 2026 for 2027 hunts; results on the third Friday of February). Applicants may submit up to six "
                     "applications per species at $5 each ($10 for bison and muskox), and most drawing hunts are open to residents and nonresidents, "
                     "although many are limited to one residency and nonresidents hunting Dall sheep, mountain goat or brown/grizzly bear need an "
                     "Alaska-licensed guide or a resident relative within the second degree of kindred. Much Alaska big game hunting needs no "
                     "drawing: general seasons use free harvest tickets, registration permits are issued over the counter, and residents can apply "
                     "for Tier I/II subsistence permits, which are scored rather than drawn at random. Caribou, bison, muskox, wolf and brown/grizzly "
                     "bear are hunted in Alaska but are not covered here."),
        "species": species(),
        "fees": fees(),
        "seasons": [],
        "coverage": coverage(repo),
        "sources": sources(),
    }
    dest = os.path.join(repo, "src/data/agency/alaska/draw-meta.json")
    with open(dest, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote", dest, len(meta["fees"]), "fees")


if __name__ == "__main__":
    main()
