"""Write src/data/agency/arizona/draw-meta.json (run after draw_parse.py).

Facts are transcribed from AZGFD's 2026 regulation booklets (fee table "valid for 2026 hunts",
hunt permit-tag application schedules, Commission Rules R12-4-107 / R12-4-114 printed in the
2026-2027 Arizona Hunting Regulations), the 2027 Spring Hunt Draw booklet, AZGFD's Oct. 23, 2026 news
release on 2027 spring draw results and the 2027 spring left-over permit list. Every key date carries
`kind` (KeyDateKind) and, where AZGFD limits it, `residency`. Coverage is computed from the
draw/<species>.json files. Run seasons_parse.py afterwards: it fills seasons[] and draw-row seasonRanges.
As of 2026-10-31 AZGFD has not published 2027 Pronghorn & Elk or 2027 Fall draw dates
(its draw page says those regulations come out in early January and early May).
"""
import json, os, sys

sys.dont_write_bytecode = True  # keep the repo free of __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from draw_sources import all_sources, regs_source_id, draw_source_id, RETRIEVED, PUB, BP_PAGE  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ROOT = os.path.join(REPO, "src", "data", "agency", "arizona")

PE = regs_source_id("pe2026")      # 2026 Pronghorn and Elk Hunt Draw Regulations
HR = regs_source_id("hunt2026")    # 2026-2027 Arizona Hunting Regulations
SP = regs_source_id("spring2026")  # 2026 Spring Hunt Draw Regulations
HR25 = regs_source_id("hunt2025")  # 2025-2026 Arizona Hunting Regulations (12/23/2025 revision)
SP27 = regs_source_id("spring2027")  # 2027 Spring Hunt Draw Information (applications due Oct. 6, 2026)
BPP = "d-az-bonus-point-page"
NEWS27S = "d-az-news-2027spring-results"
LO27S = "d-az-2027s-leftover-list"
LO27S_SOURCE = {
    "id": LO27S, "title": "2027 Spring Draw Left-over Permits – October 26, 2026",
    "publisher": PUB,
    "url": "https://azgfd-live-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/10/26080729/2027-S-FCFS-Master-PDF.pdf",
    "pageUrl": "https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/",
    "dataYear": 2027, "retrieved": RETRIEVED,
    "notes": "Leftover (first-come) permit list for 2027 spring hunts; applications accepted by U.S. mail only on or after Nov. 2, 2026.",
}
NEWS27S_SOURCE = {
    "id": NEWS27S, "title": "Spring Draw results are now available (AZGFD news release, Oct. 23, 2026)",
    "publisher": PUB, "url": "https://www.azgfd.com/2026/10/23/spring-draw-results-available/",
    "pageUrl": "https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/",
    "dataYear": 2027, "retrieved": RETRIEVED,
    "notes": "azgfd.com pages answer scripts with a bot challenge; read in a browser on 2026-10-31.",
}
SP27_SOURCE = {
    "id": SP27, "title": "2027 Spring Turkey, Javelina, Bison, Bear and Raptor Capture Hunt Draw Information",
    "publisher": PUB,
    "url": "https://azgfd-live-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2026/09/08084903/2027-Spring-Regulations.pdf",
    "dataYear": 2027, "retrieved": RETRIEVED,
    "notes": "Dates from the 'Hunt Permit-tag Application Schedule – Spring 2027' table (booklet p. 1).",
}

NOT_2027 = "2027 dates not yet published by AZGFD as of 2026-10-31"

BONUS_SUMMARY = (
    "Bonus-point draw: up to 20% of each hunt number's permits are reserved for 1st/2nd-choice applicants with the most "
    "bonus points (bonus pass); the rest are drawn at random, first for 1st/2nd choices and then for 3rd-5th choices, "
    "with one extra random-number entry per bonus point (including hunter-education and loyalty points).")

# R12-4-114(E)(2) and (G) as printed in the 2026-27 Arizona Hunting Regulations (HR). The 2025-26 edition (HR25) and
# earlier printed (E)(2) as "For antlered deer, bull elk, pronghorn, Sandhill crane, or turkey, no more than 10% ...".
NR_10 = ("Under R12-4-114(E)(2) as printed in the 2026-27 Arizona Hunting Regulations, nonresidents may receive no more "
         "than 10% (rounded down) of the permits in any hunt number for antlerless deer, antlerless elk, antlered deer, any "
         "deer, any elk, bull elk, javelina, pronghorn, Sandhill crane or turkey. For antlered deer, bull elk, pronghorn, "
         "Sandhill crane and turkey hunts with 10 or fewer permits, at most one permit is available to nonresidents, and a "
         "one-permit hunt is resident-only. No more than half of the nonresident allotment may be issued in the bonus pass "
         "(R12-4-114(G)). The 2025-26 regulations printed the earlier rule, whose 10% cap listed only antlered deer, bull "
         "elk, pronghorn, Sandhill crane and turkey hunts.")


def kd(label, date, cycle, sid, note=None, kind=None, residency=None):
    d = {"label": label}
    if kind:
        d["kind"] = kind
    if residency:
        d["residency"] = residency
    d.update({"date": date, "cycle": cycle, "status": "confirmed", "sourceId": sid})
    if note:
        d["note"] = note
    return d


MIDWINTER_DATES = [
    kd("Pronghorn & elk draw application deadline (11:59 p.m. Arizona time)", "2026-02-03", 2026, PE, NOT_2027 + " (AZGFD's draw page: pronghorn and elk regulations are available in early January); applications are accepted from early to mid-January.", "application"),
    kd("Pronghorn & elk hunt permit-tags mailed out by", "2026-04-01", 2026, PE, NOT_2027, "other"),
    kd("Leftover (first-come) pronghorn & elk applications accepted by mail", "2026-03-16", 2026, PE, NOT_2027, "leftover"),
    kd("Leftover (first-come) pronghorn & elk permits at Department offices", "2026-03-23", 2026, PE, NOT_2027, "leftover"),
]
FALL_DATES = [
    kd("Fall draw application deadline (deer, fall turkey, fall javelina, bighorn sheep, fall bison, sandhill crane; 11:59 p.m. Arizona time)", "2026-06-02", 2026, HR, NOT_2027 + " (AZGFD's draw page: fall regulations are available in early May); applications are accepted from early to mid-May.", "application"),
    kd("Fall draw hunt permit-tags mailed out by", "2026-07-24", 2026, HR, NOT_2027, "other"),
    kd("Leftover (first-come) fall applications accepted by mail", "2026-07-06", 2026, HR, NOT_2027, "leftover"),
    kd("Leftover (first-come) fall permits at Department offices", "2026-07-13", 2026, HR, NOT_2027, "leftover"),
]
SPRING_DATES = [
    kd("Spring draw application deadline (spring turkey, spring javelina, spring bison; 11:59 p.m. Arizona time)", "2025-10-07", 2026, SP, "For 2026 spring hunts.", "application"),
    kd("Spring draw hunt permit-tags mailed out by", "2025-11-26", 2026, SP, "For 2026 spring hunts.", "other"),
    kd("Leftover (first-come) spring applications accepted by mail", "2025-11-03", 2026, SP, "For 2026 spring hunts.", "leftover"),
    kd("Leftover (first-come) spring permits at Department offices", "2025-11-10", 2026, SP, "For 2026 spring hunts.", "leftover"),
    # 2027 spring booklet, "Hunt Permit-tag Application Schedule – Spring 2027" (SP27)
    kd("Spring draw application deadline (spring turkey, spring javelina, spring bison, raptor capture; 11:59 p.m. Arizona time)", "2026-10-06", 2027, SP27,
       "For 2027 spring hunts; online applications only, accepted from early to mid-September 2026. Draw results are posted to "
       "the applicant's AZGFD portal account; the booklet gives no separate results date.", "application"),
    kd("Spring draw results released (AZGFD portal account)", "2026-10-23", 2027, NEWS27S,
       "For 2027 spring hunts; AZGFD news release of Oct. 23, 2026. Results are shown only in the applicant's AZGFD portal account.", "results"),
    kd("Arizona E-Tag app opt-in deadline to receive spring hunt permit-tags electronically", "2026-10-19", 2027, NEWS27S,
       "For 2027 spring hunts; customers who opted in after this date receive their hunt permit-tag by mail (AZGFD news release, Oct. 23, 2026).", "other"),
    kd("Spring draw hunt permit-tags mailed out by", "2026-11-25", 2027, SP27, "For 2027 spring hunts.", "other"),
    kd("Leftover (first-come) spring applications accepted by mail (after 8:00 a.m. Arizona time)", "2026-11-02", 2027, SP27,
       "For 2027 spring hunts; first-come results are not posted. AZGFD's 2027 Spring Draw left-over permit list (d-az-2027s-leftover-list) is dated Oct. 26, 2026.", "leftover"),
    kd("Leftover (first-come) spring permits at Department offices (after 8:00 a.m. Arizona time)", "2026-11-09", 2027, SP27, "For 2027 spring hunts.", "leftover"),
]

# 'Nonpermit-Tag First-Come Schedule' table, 2026-2027 Arizona Hunting Regulations (Deer: Commission Order 2)
ARCHERY_DEER_SALE = [
    kd("Resident archery-only deer nonpermit-tags on sale at AZGFD offices", "2026-11-02", 2026, HR,
       "Nonpermit-Tag First-Come Schedule; available immediately upon purchase.", "license-sale", "resident"),
    kd("Resident archery-only deer nonpermit-tags on sale at authorized license dealers", "2026-11-23", 2026, HR,
       "Nonpermit-Tag First-Come Schedule.", "license-sale", "resident"),
    kd("Nonresident archery-only deer nonpermit-tags on sale online only at otcarchery.azgfd.com (8:00 a.m. Arizona time)", "2026-11-02", 2026, HR,
       "For nonresidents with an annual Arizona nonresident combination hunt/fish license; tags not taken electronically are mailed by Dec. 1.",
       "license-sale", "nonresident"),
    kd("Nonresident archery-only deer nonpermit-tags on sale at AZGFD offices or by mail (Pioneer, Lifetime or Benefactor license holders)", "2026-11-02", 2026, HR,
       "Nonpermit-Tag First-Come Schedule.", "license-sale", "nonresident"),
]

SPECIES = [
    {
        "species": "elk", "displayName": "Elk", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
        "drawSystemSummary": "Elk permits are drawn in the Pronghorn & Elk (Midwinter) draw. " + BONUS_SUMMARY,
        "residentNote": "A bonus point is earned for an unsuccessful application or by applying with the elk bonus-point-only hunt number (3000); accumulated points are expended when an elk permit-tag is issued in a computer draw.",
        "nonresidentNote": NR_10,
        "otcSummary": "Elk nonpermit-tags (resident $135, nonresident $650) are sold over the counter only for the General or Archery-Only Nonpermit-Tag seasons listed in the elk Commission Order; all other elk hunts require a draw permit.",
        "keyDates": MIDWINTER_DATES, "sourceIds": [PE, HR, HR25, BPP],
    },
    {
        "species": "pronghorn", "displayName": "Pronghorn", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
        "drawSystemSummary": "Pronghorn permits are drawn in the Pronghorn & Elk (Midwinter) draw. " + BONUS_SUMMARY,
        "residentNote": "Bonus-point-only hunt number for pronghorn is 2000; accumulated points are expended when a pronghorn permit-tag is issued in a computer draw.",
        "nonresidentNote": NR_10,
        "otcSummary": "None: every pronghorn season requires a draw hunt permit-tag.",
        "keyDates": MIDWINTER_DATES, "sourceIds": [PE, HR, HR25, BPP],
    },
    {
        "species": "mule-deer", "displayName": "Mule deer", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
        "drawSystemSummary": "Deer permits are drawn in the Fall draw (one deer genus for mule deer and white-tailed deer). " + BONUS_SUMMARY,
        "residentNote": "Many Arizona deer hunts are 'Any antlered deer' (either species); this file holds those plus mule-deer-only hunts. Bonus-point-only hunt number for deer is 1000.",
        "nonresidentNote": NR_10,
        "otcSummary": "Archery-only deer nonpermit-tags (resident $45, nonresident $300) are sold over the counter for unit-specific archery seasons with harvest limits; nonresident tags are capped and sold online only.",
        "keyDates": FALL_DATES + ARCHERY_DEER_SALE,
        "sourceIds": [HR, HR25, BPP],
    },
    {
        "species": "whitetail", "displayName": "White-tailed deer (Coues)", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
        "drawSystemSummary": "White-tailed deer permits are drawn in the Fall draw under the same deer genus as mule deer. " + BONUS_SUMMARY,
        "residentNote": "This file holds hunts whose legal wildlife is white-tailed deer only; 'Any antlered deer' hunts (either species) are filed under mule deer.",
        "nonresidentNote": NR_10,
        "otcSummary": "Archery-only deer nonpermit-tags (resident $45, nonresident $300) are sold over the counter for unit-specific archery seasons with harvest limits.",
        "keyDates": FALL_DATES + ARCHERY_DEER_SALE, "sourceIds": [HR, HR25, BPP],
    },
    {
        "species": "sheep", "displayName": "Bighorn sheep (desert & Rocky Mountain)", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
        "drawSystemSummary": "Bighorn sheep permits are drawn in the Fall draw. Up to 20% of all bighorn permits statewide (not per hunt) go to applicants with the most bonus points; the rest are drawn at random with one extra entry per bonus point. Bag limit is one desert and one Rocky Mountain bighorn in a lifetime.",
        "residentNote": "Applicants who have taken their lifetime bighorn of a subspecies may not apply for that subspecies.",
        "nonresidentNote": "Nonresidents may receive no more than one permit or 10% of all bighorn permits in the draw, whichever is greater, and no more than 50% or more than two of the permits in any hunt number (R12-4-114).",
        "otcSummary": "None: bighorn sheep require a draw hunt permit-tag.",
        "keyDates": FALL_DATES, "sourceIds": [HR, BPP],
    },
    {
        "species": "turkey", "displayName": "Wild turkey (Merriam's & Gould's)", "drawSystem": "bonus", "pointsMatter": True, "pointName": "bonus point",
        "drawSystemSummary": "Spring turkey permits are drawn in the Spring draw (applications in October of the prior year) and fall turkey permits in the Fall draw. " + BONUS_SUMMARY,
        "residentNote": "Bag limit is one turkey per calendar year.",
        "nonresidentNote": NR_10,
        "otcSummary": "Archery turkey nonpermit-tags (resident $25, nonresident $90) and youth-only turkey nonpermit-tags ($10) are sold over the counter for the archery-only nonpermit-tag seasons.",
        "keyDates": SPRING_DATES + FALL_DATES, "sourceIds": [SP, SP27, NEWS27S, LO27S, HR, HR25, BPP],
    },
    {
        "species": "bear", "displayName": "Black bear", "drawSystem": "otc", "pointsMatter": False,
        "drawSystemSummary": "No 2026 bear hunt numbers appear in AZGFD's 2026 draw reports: bear hunting in every 2026 season uses a nonpermit-tag bought from a license dealer or AZGFD office. Seasons carry unit female-harvest limits, and hunters must confirm a unit is still open before hunting.",
        "otcSummary": "Bear nonpermit-tag: resident $25, nonresident $150. Hunters must check that a unit is still open (azgfd.gov/harvestreports), report harvest within 48 hours and present the skull and hide within 10 days.",
        "keyDates": [], "sourceIds": [HR],
    },
    {
        "species": "lion", "displayName": "Mountain lion", "drawSystem": "otc", "pointsMatter": False,
        "drawSystemSummary": "Mountain lion is hunted with an over-the-counter nonpermit-tag (no draw). Bag limit is one lion per calendar year; harvest is managed by zone harvest thresholds.",
        "otcSummary": "Mountain lion nonpermit-tag: resident $15, nonresident $75; pursuit-only permit: resident $20, nonresident $100.",
        "keyDates": [], "sourceIds": [HR],
    },
]

FEE_ROWS = [
    # (species, item, resident, nonresident, note)
    (None, "General Hunting license", 37, None, "Nonresidents: not available — see Combination Hunt and Fish license"),
    (None, "Combination Hunt and Fish license", 57, 160, None),
    (None, "Youth Combination Hunt and Fish license (ages 10-17)", 5, 5, None),
    (None, "Bonus Point (application fee per applicant)", 13, 15, "Hunt permit-tag prices below include this $13 resident / $15 nonresident application fee"),
    (None, "PointGuard (per species, per applicant)", 10, 10, "Optional; purchased with an online application"),
    ("pronghorn", "Pronghorn Hunt Permit-tag", 103, 565, "Includes application fee"),
    ("elk", "Elk Hunt Permit-tag", 148, 665, "Includes application fee"),
    ("mule-deer", "Deer Hunt Permit-tag", 58, 315, "Includes application fee; one deer permit-tag covers mule deer and white-tailed deer hunts"),
    ("whitetail", "Deer Hunt Permit-tag", 58, 315, "Includes application fee; one deer permit-tag covers mule deer and white-tailed deer hunts"),
    ("sheep", "Bighorn Sheep & Pioneer One-Horned Bighorn Sheep Hunt Permit-tag", 313, 1815, "Includes application fee"),
    ("turkey", "Turkey Hunt Permit-tag", 38, 105, "Includes application fee"),
    ("bear", "Bear Hunt Permit-tag", 38, 165, "Includes application fee"),
    ("turkey", "Archery Turkey Nonpermit-tag", 25, 90, "Over the counter"),
    ("bear", "Bear Nonpermit-tag", 25, 150, "Over the counter"),
    ("lion", "Mountain Lion Nonpermit-tag", 15, 75, "Over the counter"),
    ("lion", "Mountain Lion Pursuit-only Permit", 20, 100, None),
    ("elk", "Elk Nonpermit-tag", 135, 650, "Over the counter, nonpermit-tag seasons only"),
    ("mule-deer", "Archery Deer Nonpermit-tag", 45, 300, "Over the counter; nonresident tag not available at license dealers"),
    ("whitetail", "Archery Deer Nonpermit-tag", 45, 300, "Over the counter; nonresident tag not available at license dealers"),
]


def fees():
    out = []
    for sp, item, r, n, note in FEE_ROWS:
        for res, amt in (("resident", r), ("nonresident", n)):
            if amt is None:
                continue
            f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": HR}
            f["note"] = ("Fee table 'valid for 2026 hunts' (2026-2027 Arizona Hunting Regulations, p. 4)" + (f"; {note}" if note else ""))
            out.append(f)
    return out


SEASONS = [
    {"species": "lion", "label": "General (daylight shooting hours) mountain lion — statewide with listed exclusions", "start": "2026-08-21", "end": "2027-05-31", "year": 2026,
     "note": "Excludes most National Wildlife Refuges, Mohave County Park Lands and Units 11M, 25M, 26M, 38M; zones close at harvest thresholds", "sourceId": HR},
    {"species": "lion", "label": "Archery-only mountain lion — Units 11M, 25M, 26M and 38M", "start": "2026-08-21", "end": "2027-05-31", "year": 2026, "sourceId": HR},
]


def main():
    sources = all_sources()
    sources.append(SP27_SOURCE)
    sources.append(NEWS27S_SOURCE)
    sources.append(LO27S_SOURCE)
    sources.append({
        "id": BPP, "title": "How Arizona Bonus Points Work for the Hunt Draw Process (Bonus Point and Draw Reports page)",
        "publisher": PUB, "url": BP_PAGE, "retrieved": RETRIEVED,
        "notes": "azgfd.com returned a bot challenge on 2026-10-31; page content and report links read from the Internet Archive snapshot of 2026-02-16 and the AZGFD public document store.",
    })
    ids = {s["id"] for s in sources}
    for s in SPECIES:
        for x in s["sourceIds"] + [d["sourceId"] for d in s["keyDates"]]:
            assert x in ids, x
    cov = []
    notes_by = {
        "elk": "Midwinter (Pronghorn & Elk) draws 2023-2026.",
        "pronghorn": "Midwinter (Pronghorn & Elk) draws 2023-2026.",
        "mule-deer": "Fall draws 2023-2026. Includes 'Any antlered deer'/'Antlerless deer' hunts (either species legal) as well as mule-deer-only hunts. 2026 hunts 1801-1803 and 1901-1906 (special-area hunts printed without hunt numbers in the 2026 regulations) are omitted because their deer species cannot be confirmed.",
        "whitetail": "Fall draws 2023-2026; only hunts whose legal wildlife is white-tailed deer.",
        "sheep": "Fall draws 2023-2026 (desert and Rocky Mountain bighorn, incl. Pioneer one-horned ram hunts). AZGFD's draw-odds "
                 "summaries print 2024 hunt 6054 and 2025 hunts 6028/6029 twice with different units; the unit kept matches that "
                 "year's Arizona Hunting Regulations (46BE, 39E, 39W).",
        "turkey": "Spring draws 2023-2026 (year = hunt year; the spring draw is held in the preceding Oct-Nov) and Fall draws 2023-2026. "
                  "Spring season dates for 2023-2025 come from that year's spring regulation booklet, because AZGFD's draw-odds summaries "
                  "print only the first window of split seasons. 2025 hunts 4032, 4033 and 4062 are printed twice in the 2025 summary, "
                  "so they are described from the 2025 spring booklet (20A West, 20A East, 35B).",
    }
    common = (" Counts are from AZGFD draw reports: quota = authorized permits; applicants = 1st-choice applicants (Bonus Pass report); "
              "drawn = 1st-choice permits from the bonus pass plus the 1st/2nd-choice pass; odds are drawn/applicants (oddsComputed). "
              "byPoints are AZGFD's Bonus Point Report rows (1st+2nd-choice applicants and permits issued in bonus + 1-2 passes, by group "
              "bonus points), so they include 2nd-choice draws and do not sum to the 1st-choice totals; the per-point rows also sum to "
              "slightly different applicant totals (typically 0-5) than the Bonus Pass report. AZGFD's separate draw-odds summaries "
              "(2023-2025) are quoted in each row's note and can differ slightly from the draw-report figures. 2022 draws are not included: "
              "AZGFD's 2022 reports list hunt numbers only (hunt numbers are re-assigned each year) and the 2022 Bonus Point Report "
              "has rows where totals do not equal resident + nonresident. Draw year = hunt year as labelled by AZGFD.")
    for sp in ["elk", "pronghorn", "mule-deer", "whitetail", "sheep", "turkey"]:
        p = os.path.join(ROOT, "draw", f"{sp}.json")
        rows = json.load(open(p))
        years = sorted({r["year"] for r in rows})
        cov.append({"species": sp, "years": years, "notes": notes_by[sp] + common})
    cov.append({"species": "bear", "years": [], "notes": "No bear hunt numbers in AZGFD's 2023-2026 draw reports; bear is over-the-counter (nonpermit-tag)."})
    cov.append({"species": "lion", "years": [], "notes": "Over-the-counter nonpermit-tag; no draw."})
    meta = {
        "slug": "arizona",
        "name": "Arizona",
        "abbrev": "AZ",
        "agency": {"name": "Arizona Game and Fish Department", "shortName": "AZGFD", "url": "https://www.azgfd.com/"},
        "unitTerm": "Unit",
        "lastReviewed": "2026-10-31",
        "overview": ("Arizona issues limited big-game permits through three computer draws a year: Pronghorn & Elk (applications due in February), "
                     "Fall (deer, fall turkey, fall javelina, bighorn sheep, fall bison, sandhill crane; due in June) and Spring (spring turkey, "
                     "javelina and bison; due in October for the next year's hunts). Applicants list up to five hunt choices per species; up to 20% "
                     "of each hunt's permits go first to 1st/2nd-choice applicants with the most bonus points, and the rest are drawn at random with "
                     "one extra random-number entry per bonus point. Nonresidents are limited to 10% of the permits in most hunts, and unissued "
                     "permits are sold first-come after the draw."),
        "species": SPECIES,
        "fees": fees(),
        "seasons": SEASONS,
        "coverage": cov,
        "sources": sources,
    }
    with open(os.path.join(ROOT, "draw-meta.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
