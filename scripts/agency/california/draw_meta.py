#!/usr/bin/env python3
"""Write src/data/agency/california/draw-meta.json.

Facts below were read from the CDFW documents listed in SOURCES (downloaded by draw_fetch.py
into <raw>; digests checked against `pdftotext -layout` output, web pages against their HTML
text as retrieved 2026-10-31). Coverage is computed from draw/<species>.json (draw_build.py) and
<raw>/build-side.json (preference-point-only applicant counts, statistics PDF parts).

Usage: python -I draw_meta.py <raw_dir> <repo_root>
"""
import json
import os
import sys

RETRIEVED = "2026-10-31"
PUB = "California Department of Fish and Wildlife"
STATS_PAGE = "https://wildlife.ca.gov/Licensing/Statistics/Big-Game-Drawing"
DIGEST_PAGE = "https://wildlife.ca.gov/Publications/Hunting-Digest"
FH = "https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID="
NOT_2027 = "2027 dates not yet published by CDFW as of 2026-10-31."

DIGESTS = {
    2026: ("200602", "Updated 4/17/2026 (some pages 4/1/2026). Prints the 2025 deer drawing summary (pp. 29-31)."),
    2025: ("243703", "Updated 4/28/2025. Prints the 2024 deer drawing summary."),
    2024: ("231077", "2024-2025 California Big Game Digest, updated 5/31/2024. Prints the 2023 deer drawing summary."),
    2023: ("221986", "Prints the 2022 deer drawing summary."),
}

BASE_SOURCES = [
    {"id": "d-bgd-page", "title": "Big Game Hunting Tags (Big Game Drawing, preference points, tag quota splits FAQ)",
     "publisher": PUB, "url": "https://wildlife.ca.gov/Licensing/Hunting/Big-Game-Drawing", "retrieved": RETRIEVED},
    {"id": "d-fees-2026", "title": "Hunting License Items and Fees (valid July 1, 2026, through June 30, 2027)",
     "publisher": PUB, "url": "https://wildlife.ca.gov/Licensing/Hunting/Items", "dataYear": 2026, "retrieved": RETRIEVED},
    {"id": "d-bear-page", "title": "Bear Hunting (2026 season, bear tag fees)", "publisher": PUB,
     "url": "https://wildlife.ca.gov/Hunting/Bear", "dataYear": 2026, "retrieved": RETRIEVED,
     "notes": "Harvest counter read 803 bears as of October 27, 2026."},
    {"id": "d-upland-page", "title": "Upland Game Bird Hunting (2026 - 2027 Seasons and Limits - Wild Turkey)", "publisher": PUB,
     "url": "https://wildlife.ca.gov/Hunting/Upland-Game-Birds", "dataYear": 2026, "retrieved": RETRIEVED},
]

APP = {"label": "Big Game Drawing application period (premium deer, elk, pronghorn, bighorn sheep)",
       "start": "2026-04-15", "end": "2026-06-02", "cycle": 2026, "status": "confirmed",
       "note": "Applications must be completed before midnight June 2. " + NOT_2027, "sourceId": "d-digest-2026"}
RESULTS = {"label": "Drawing results available online", "date": "2026-06-15", "cycle": 2026, "status": "confirmed",
           "note": "CDFW: 'on or around June 15, 2026'; the drawing is run within 10 business days of the deadline. " + NOT_2027,
           "sourceId": "d-digest-2026"}


def kd(label, date, note, src="d-digest-2026"):
    return {"label": label, "date": date, "cycle": 2026, "status": "confirmed", "note": f"{note} {NOT_2027}".strip(), "sourceId": src}


SPECIES = [
    {
        "species": "mule-deer",
        "displayName": "Deer (mule & black-tailed)",
        "drawSystem": "hybrid",
        "drawSystemSummary": (
            "Premium deer tags (the C zones, the X zones, D12, D14, D17 and the special archery, muzzleloader, late-season and "
            "apprentice hunts) are issued in the Big Game Drawing under a modified preference point system: 90% of each quota goes "
            "to first-choice applicants in preference-point order and 10% (one tag when the quota is under 10) in a random "
            "draw-by-choice round; unsuccessful applicants' second and then third choices are then drawn at random for any tags left. "
            "Apprentice deer hunts split 50% preference / 50% random. Party applications (up to six hunters) use the unrounded "
            "average of members' points."),
        "pointsMatter": True,
        "pointName": "preference point",
        "residentNote": ("Applicants earn one deer point when not drawn for their first-choice premium hunt (or by applying with "
                         "code PD) and lose all deer points when drawn for their first choice. Points are reduced to zero after "
                         "five consecutive years without applying."),
        "nonresidentNote": ("Nonresidents apply in the same drawing; CDFW's drawing statistics do not separate residents and "
                            "nonresidents. 2026-27 nonresident first or second deer tag/application: $377.35. Unsuccessful "
                            "nonresidents may request a refund of the difference from the resident application fee."),
        "otcSummary": ("Deer tags for the A zone, B zones (B1-B6) and D zones D3-5, D6, D7, D8, D9, D10, D11, D13, D15, D16 and D19, "
                       "plus several archery hunts, are unrestricted (issued on request until the zone quota fills). Leftover "
                       "premium deer tags are sold first-come, first-served from July 2 at 8:00 a.m."),
        "keyDates": [
            APP, RESULTS,
            kd("Deer: drawn tags and unsuccessful-applicant notices expected by mail", "2026-07-02",
               "Unsuccessful notices list deer tags still available; contact CDFW if a drawn tag has not arrived by this date."),
            kd("Leftover premium deer tags go on sale (8:00 a.m., first-come first-served)", "2026-07-02",
               "CDFW FAQ: 'If available, leftover premium deer tags will be issued on July 2 at 8:00 a.m.'", "d-bgd-page"),
            {"label": "Deadline to report deer tags (2026 tags)", "date": "2027-01-31", "cycle": 2026, "status": "confirmed",
             "note": "All deer tag holders must report by January 31 of the license year, hunted or not; late or missing reports "
                     "carry a $21.60 non-reporting fee.", "sourceId": "d-bgd-page"},
        ],
        "sourceIds": ["d-digest-2026", "d-bgd-page", "d-fees-2026"],
    },
    {
        "species": "elk",
        "displayName": "Elk (Roosevelt, Rocky Mountain & tule)",
        "drawSystem": "hybrid",
        "drawSystemSummary": (
            "Elk tags are issued only in the Big Game Drawing, one hunt choice per application, under the modified preference point "
            "system: a quota of one tag is drawn at random, two tags split one preference / one random, three tags two / one, and "
            "four or more award 75% by preference points and the rest at random. CDFW runs the random draw-by-choice round first, "
            "then the preference-point round. Applicants earn one point when unsuccessful and lose all elk points when they receive "
            "an elk tag."),
        "pointsMatter": True,
        "pointName": "preference point",
        "residentNote": "Up to two residents may apply as a party. One elk tag per person per year (Private Lands Management tags excepted).",
        "nonresidentNote": "Only one nonresident may be drawn for an elk or pronghorn tag annually, and nonresidents cannot apply as a party. 2026-27 nonresident elk tag: $1,871.80.",
        "otcSummary": "None: there are no over-the-counter elk tags (SHARE and Private Lands Management tags are issued outside the Big Game Drawing).",
        "keyDates": [
            APP, RESULTS,
            kd("Successful elk applicants' payment notices mailed by", "2026-07-02", "Unsuccessful applicants are not notified by mail."),
            kd("Elk tag fee payment deadline (5:00 p.m.)", "2026-07-15", "Unclaimed tags then go to alternates in the order drawn."),
        ],
        "sourceIds": ["d-digest-2026", "d-bgd-page", "d-fees-2026"],
    },
    {
        "species": "pronghorn",
        "displayName": "Pronghorn",
        "drawSystem": "hybrid",
        "drawSystemSummary": (
            "Pronghorn tags are issued only in the Big Game Drawing, one hunt choice per application, under the modified preference "
            "point system: a quota of one tag is drawn at random, two tags split one preference / one random, three tags two / one, "
            "and four or more award 75% by preference points and the rest at random (random round first, then the preference round). "
            "Applicants earn one point when unsuccessful and lose all pronghorn points when they receive a tag."),
        "pointsMatter": True,
        "pointName": "preference point",
        "residentNote": "Up to two residents may apply as a party. One pronghorn tag per person per year (Private Lands Management tags excepted).",
        "nonresidentNote": "Only one nonresident may be drawn for an elk or pronghorn tag annually, and nonresidents cannot apply as a party. 2026-27 nonresident pronghorn tag: $628.85.",
        "otcSummary": "None: pronghorn tags are issued only through the Big Game Drawing (Private Lands Management tags excepted).",
        "keyDates": [
            APP, RESULTS,
            kd("Successful pronghorn applicants' payment notices mailed by", "2026-07-02", "Unsuccessful applicants are not notified by mail."),
            kd("Pronghorn tag fee payment deadline (5:00 p.m.)", "2026-07-15", "Unclaimed tags then go to alternates in the order drawn."),
        ],
        "sourceIds": ["d-digest-2026", "d-bgd-page", "d-fees-2026"],
    },
    {
        "species": "sheep",
        "displayName": "Desert bighorn sheep (Nelson)",
        "drawSystem": "hybrid",
        "drawSystemSummary": (
            "Nelson (desert) bighorn sheep ram tags are issued only in the Big Game Drawing, one hunt choice per application and no "
            "party applications, under the modified preference point system: a quota of one tag is drawn at random, two tags split "
            "one preference / one random, three tags two / one, and four or more award 75% by preference points (random round first). "
            "A hunter may hold one California bighorn sheep tag in a lifetime; not more than 10% of tags go to nonresidents each year."),
        "pointsMatter": True,
        "pointName": "preference point",
        "residentNote": "Applicants must be 16 or older on July 1 and must never have drawn a California bighorn sheep tag. Drawn hunters must attend a mandatory in-person orientation.",
        "nonresidentNote": "Not more than 10 percent of bighorn sheep tags are awarded to nonresidents each year. 2026-27 nonresident bighorn sheep tag: $2,072.75.",
        "otcSummary": "None: bighorn sheep tags come only from the Big Game Drawing (plus fundraising tags).",
        "keyDates": [
            APP, RESULTS,
            kd("Bighorn sheep tag fee payment deadline (5:00 p.m., received by the License and Revenue Branch, Sacramento)", "2026-07-15",
               "Unclaimed tags then go to alternates in the order drawn."),
            kd("Mandatory bighorn sheep hunter orientation (in person)", "2026-07-18", "Location to be announced by CDFW."),
        ],
        "sourceIds": ["d-digest-2026", "d-bgd-page", "d-fees-2026"],
    },
    {
        "species": "bear",
        "displayName": "Black bear",
        "drawSystem": "otc",
        "drawSystemSummary": (
            "No drawing: bear tags are sold over the counter (online, license agents, CDFW offices). The season closes on December 27 "
            "or earlier once 1,700 bears (archery season included) have been reported taken; CDFW counted 803 as of October 27, 2026."),
        "pointsMatter": False,
        "otcSummary": ("Resident bear tag $62.90, nonresident $397.60 (2026-27). CDFW's bear page says licensed hunters 12 or older may buy "
                       "two bear tags per license year (the second tag was adopted by the Fish and Game Commission in April 2026); "
                       "daily bag one bear."),
        "keyDates": [
            {"label": "Unsuccessful 2026 bear tag report card due", "date": "2027-02-01", "cycle": 2026, "status": "confirmed",
             "note": "Report cards for unsuccessful tags are due February 1 of the license year; successful hunters report immediately.",
             "sourceId": "d-digest-2026"},
        ],
        "sourceIds": ["d-bear-page", "d-digest-2026", "d-fees-2026"],
    },
    {
        "species": "turkey",
        "displayName": "Wild turkey",
        "drawSystem": "otc",
        "drawSystemSummary": (
            "No drawing for the general seasons: wild turkey needs a California hunting license plus an Upland Game Bird Validation "
            "(not required under a Junior Hunting License); there is no turkey tag. Spring limit one bearded turkey per day, three "
            "per season combined; fall one either-sex per day, two per season."),
        "pointsMatter": False,
        "otcSummary": "Upland Game Bird Validation $25.41 (2026-27). CDFW also lists Special Hunts and SHARE Program hunts on its upland game page; those are not covered here.",
        "keyDates": [],
        "sourceIds": ["d-upland-page", "d-fees-2026"],
    },
]


def fee(sp, item, res, amt, note=None, src="d-fees-2026"):
    f = {"species": sp, "item": item, "residency": res, "amountUsd": amt, "licenseYear": 2026, "sourceId": src}
    if note:
        f["note"] = note
    return f


LY = "License year July 1, 2026 - June 30, 2027."
FEES = [
    fee(None, "Resident Hunting License", "resident", 64.54, LY),
    fee(None, "Nonresident Hunting License", "nonresident", 225.46, LY),
    fee(None, "Junior Hunting License (under 16 on July 1)", "resident", 17.02, "Resident or nonresident. " + LY),
    fee(None, "Junior Hunting License (under 16 on July 1)", "nonresident", 17.02, "Resident or nonresident. " + LY),
    fee("mule-deer", "Resident First-Deer Tag or First-Deer Tag Drawing Application", "resident", 42.38, LY),
    fee("mule-deer", "Resident Second-Deer Tag or Second-Deer Tag Drawing Application", "resident", 52.92, LY),
    fee("mule-deer", "Nonresident First-Deer Tag or First-Deer Tag Drawing Application", "nonresident", 377.35, LY),
    fee("mule-deer", "Nonresident Second-Deer Tag or Second-Deer Tag Drawing Application", "nonresident", 377.35, LY),
]
for sp, name, r, n in (("elk", "Elk", 610.20, 1871.80), ("pronghorn", "Pronghorn Antelope", 205.77, 628.85),
                       ("sheep", "Bighorn Sheep", 558.50, 2072.75)):
    FEES += [
        fee(sp, f"{name} Tag Drawing Application", "resident", 8.38, "Per application. " + LY),
        fee(sp, f"{name} Tag Drawing Application", "nonresident", 8.38, "Per application. " + LY),
        fee(sp, f"{name} Tag", "resident", r, "Paid only if drawn. Reduced junior tag fees ended July 1, 2025. " + LY),
        fee(sp, f"{name} Tag", "nonresident", n, "Paid only if drawn. " + LY),
    ]
FEES += [
    fee("bear", "Bear Tag", "resident", 62.90, LY),
    fee("bear", "Bear Tag", "nonresident", 397.60, LY),
    fee("turkey", "Upland Game Bird Validation (required for wild turkey)", "resident", 25.41, "Not required under a Junior Hunting License. " + LY),
    fee("turkey", "Upland Game Bird Validation (required for wild turkey)", "nonresident", 25.41, "Not required under a Junior Hunting License. " + LY),
]


def season(sp, label, start, end, note=None, src="d-digest-2026", year=None):
    s = {"species": sp, "label": label, "start": start, "end": end, "year": year or int(start[:4]), "sourceId": src}
    if note:
        s["note"] = note
    return s


SEASONS = [
    season("mule-deer", "A zone archery season (buck)", "2026-07-11", "2026-08-02", "Unrestricted A zone tag (quota 65,000)."),
    season("mule-deer", "A zone general season (buck)", "2026-08-08", "2026-09-20", "Unrestricted A zone tag (quota 65,000)."),
    season("mule-deer", "B1, B2, B3, B5 and B6 zones archery season (buck)", "2026-08-15", "2026-09-06", "B zone tag valid in B1-B6 (quota 35,000)."),
    season("mule-deer", "B1, B2, B3 and B5 zones general season (buck)", "2026-09-19", "2026-10-25", "B zone tag valid in B1-B6 (quota 35,000)."),
    season("mule-deer", "B4 zone archery season (buck)", "2026-07-25", "2026-08-16"),
    season("mule-deer", "B4 zone general season (buck)", "2026-08-22", "2026-09-27"),
    season("mule-deer", "B6 zone general season (buck)", "2026-09-19", "2026-10-18"),
    season("mule-deer", "C1 zone general season (buck, premium C tag)", "2026-09-19", "2026-10-18", "C tag (drawing) valid in C1-C4 general seasons; archery in the C zones is hunt A1."),
    season("mule-deer", "C2 and C3 zones general season (buck, premium C tag)", "2026-09-19", "2026-10-25"),
    season("mule-deer", "C4 zone general season (buck, premium C tag)", "2026-09-19", "2026-10-04"),
    season("mule-deer", "D3-5 zone archery season (buck)", "2026-08-15", "2026-09-06", "Unrestricted D3-5 tag (quota 33,000)."),
    season("mule-deer", "D3-5 zone general season (buck)", "2026-09-26", "2026-11-01", "Unrestricted D3-5 tag (quota 33,000)."),
    season("bear", "Archery bear season (all bear zones)", "2026-08-15", "2026-09-06", "Bears taken count toward the 1,700 limit.", "d-bear-page"),
    season("bear", "General bear season (deer X zones other than X8, X9A, X9B, X10 and X12)", "2026-10-10", "2026-12-27",
           "In deer zones A, B, C, D, X8, X9A, X9B, X10 and X12 the general bear season opens with the general deer season and also runs "
           "through December 27. Closes earlier if 1,700 bears are reported taken.", "d-bear-page"),
    season("turkey", "Fall wild turkey season", "2026-11-14", "2026-12-13", "1 either-sex turkey per day, 2 per season.", "d-upland-page"),
    season("turkey", "Spring wild turkey general season", "2027-03-27", "2027-05-02", "1 bearded turkey per day, 3 per season combined. Listed in CDFW's 2026-2027 seasons.", "d-upland-page"),
    season("turkey", "Spring wild turkey archery-only season", "2027-05-03", "2027-05-16", "Listed in CDFW's 2026-2027 seasons.", "d-upland-page"),
    season("turkey", "Additional junior spring turkey hunt (junior license holders)", "2027-03-20", "2027-03-21", "Also May 3-16, 2027. Listed in CDFW's 2026-2027 seasons.", "d-upland-page"),
]

OVERVIEW = (
    "CDFW issues elk, pronghorn, Nelson bighorn sheep and premium deer tags through one Big Game Drawing under a modified "
    "preference point system: each hunt's quota is split between a preference-point drawing and a random draw-by-choice drawing "
    "(deer 90/10, apprentice deer 50/50, elk, pronghorn and bighorn sheep 75/25 for quotas of four or more). The 2026 application "
    "period ran April 15 - June 2, 2026, with results on or around June 15; 2027 dates are not yet published. Applicants earn one "
    "point per species when unsuccessful and lose all points for a species when drawn (deer: when drawn for their first choice), "
    "while other deer tags (A, B and most D zones), bear tags and wild turkey hunting are over the counter.")


def main():
    raw, repo = sys.argv[1], sys.argv[2]
    side = json.load(open(os.path.join(raw, "build-side.json")))
    base = os.path.join(repo, "src/data/agency/california")
    sources = list(BASE_SOURCES)
    for yr, (did, note) in DIGESTS.items():
        title = "2024-2025 California Big Game Digest" if yr == 2024 else f"{yr} California Big Game Hunting Digest"
        sources.append({"id": f"d-digest-{yr}", "title": title, "publisher": PUB,
                        "url": f"{FH}{did}&inline", "pageUrl": DIGEST_PAGE, "dataYear": yr, "retrieved": RETRIEVED, "notes": note})
    for sid, docs in sorted(side["groups"].items()):
        d0 = docs[0]
        yr = d0["year"]
        title = d0["title"].replace(" (PDF)", "")
        title = title.split(" by Point Value")[0].split(" - Hunts by")[0].split(" - Applicants by")[0]
        if len(docs) > 1:
            parts = "; ".join(f"DocumentID {d['docId']}: {d['title'].replace(' (PDF)', '')}" for d in docs)
            notes = f"Published in {len(docs)} PDFs split by point range ({parts}). url is the first part."
        else:
            notes = f"DocumentID {d0['docId']}: {d0['title'].replace(' (PDF)', '')}."
        notes += " Number of applicants by point value per hunt (first-choice applicants for deer); tag quota and preference/random quota split."
        if yr == 2026:
            notes += " 2026 PDFs are marked REV. 10/06/26-10/09/26."
        sources.append({"id": sid, "title": f"{yr} {title} - Number of Applicants by Point Value", "publisher": PUB,
                        "url": d0["url"] + "&inline", "pageUrl": STATS_PAGE, "dataYear": yr, "retrieved": RETRIEVED, "notes": notes})

    coverage = []
    pref_only = side["prefOnly"]
    for sp in ("mule-deer", "elk", "pronghorn", "sheep"):
        rows = json.load(open(os.path.join(base, "draw", f"{sp}.json")))
        years = sorted({r["year"] for r in rows})
        per = ", ".join(f"{y}: {sum(1 for r in rows if r['year'] == y)}" for y in years)
        po = pref_only.get(sp, {})
        pon = ", ".join(f"{y}: {int(v):,}" for y, v in sorted(po.items()))
        n = (f"Hunts per draw year: {per}. Counts are CDFW's for all applicants combined (no resident/nonresident split). "
             f"Preference-point-only applicants (not in rows): {pon}. Applicants by point value are in each row's note; CDFW does "
             "not publish tags drawn by point level, so there is no byPoints.")
        if sp == "mule-deer":
            n += (" Rows are premium deer hunts only (zone, archery, general late-season, muzzleloader and apprentice hunts); "
                  "applicants are first-choice applicants. Drawn (first-choice applicants awarded a tag), odds and minPoints "
                  "(lowest point value drawn in the preference drawing) come from the deer drawing summary in the next year's Big "
                  "Game Hunting Digest, so 2026 rows have no drawn counts yet. 2024 hunts A19, A20, A21 and A24 have no drawn "
                  "counts because CDFW's 2024 summary rows for those codes do not match the drawing-statistics PDF. The 2025 "
                  "general late-season 16-23 point part (DocumentID 242664) prints a preference-point-only row that disagrees "
                  "with the other parts, so 2025 general late-season hunts carry no point breakdown.")
        else:
            n += " One hunt choice per application, so choice = all. CDFW does not publish tags drawn for this species: rows give quota and applicants only."
        if sp == "elk":
            n += " Subspecies in descriptions (Roosevelt, Tule, Rocky Mountain) come from the elk hunt tables of the 2023-2026 Big Game Hunting Digests; hunts not listed with a subspecies take their hunt zone's subspecies when every listed hunt in that zone has the same one (shown as '(Tule elk zone)'); Mendocino is listed as Roosevelt/Tule."
        if sp == "pronghorn":
            n += " 2026 apprentice hunts 766, 780 and 790: CDFW's PDF prints 0 in every point column, so no point breakdown."
        if sp == "sheep":
            n += " Nelson (desert) bighorn sheep ram hunts; zones 11-13 are new in 2026."
        coverage.append({"species": sp, "years": years, "notes": n})
    coverage.append({"species": "bear", "years": [], "notes": "No drawing: bear tags are sold over the counter with a statewide 1,700-bear harvest limit."})
    coverage.append({"species": "turkey", "years": [], "notes": "No drawing for general seasons: hunting license plus upland game bird validation. CDFW special hunts are not covered."})

    meta = {
        "slug": "california",
        "name": "California",
        "abbrev": "CA",
        "agency": {"name": PUB, "shortName": "CDFW", "url": "https://wildlife.ca.gov"},
        "unitTerm": "Zone",
        "lastReviewed": RETRIEVED,
        "overview": OVERVIEW,
        "species": SPECIES,
        "fees": FEES,
        "seasons": SEASONS,
        "coverage": coverage,
        "sources": sources,
    }
    with open(os.path.join(base, "draw-meta.json"), "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote draw-meta.json:", len(sources), "sources,", len(FEES), "fees,", len(SEASONS), "seasons")


if __name__ == "__main__":
    main()
