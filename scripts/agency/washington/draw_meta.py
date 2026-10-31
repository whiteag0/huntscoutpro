"""Write src/data/agency/washington/draw-meta.json (WDFW draw facts, fees, seasons, coverage).

Usage:  python -I draw_meta.py <raw_dir> <repo_root>
Run draw_build.py first (coverage is computed from the draw/*.json files it writes).

Every fact below was read from the WDFW document named by its sourceId:
  d-pamphlet-2026  2026 Big Game Hunting Seasons and Rules (pp. 8, 14, 18-20, 21-25, 41-46, 61-70)
  d-fees-2026      wdfw.wa.gov/licenses/hunting/big-game ("Effective January 1, 2026")
  d-mywdfw         myWDFW special hunt page ("Applications for 2027 will be available starting on Dec. 1, 2026")
  d-wac-220-412-080, d-spring-bear, d-cougar-2026, d-turkey-spring-2026, d-director-2024
"""
import glob
import importlib.util
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("draw_build", os.path.join(HERE, "draw_build.py"))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

R = "2026-10-31"
P26 = "d-pamphlet-2026"
FEES = "d-fees-2026"
NOT_2027 = "2027 dates not yet published by WDFW as of 2026-10-31."


def extra_sources():
    a = build.add_source
    a(id=FEES, title="Big game hunting licenses (Big game license costs, effective January 1, 2026)",
      url="https://wdfw.wa.gov/licenses/hunting/big-game", dataYear=2026)
    a(id="d-mywdfw", title="Multi-season tags & special hunt permits | MyWDFW",
      url="https://www.mywdfw.org/multi-season-special-hunt/", dataYear=2027,
      notes="States 'The application period is closed for 2026. Applications for 2027 will be available starting on Dec. 1, 2026.' "
            "Other dates on this page (e.g. 'May 27') are not used because they conflict with the 2026 pamphlet.")
    a(id="d-wac-220-412-080", title="WAC 220-412-080 Special hunting season permits",
      publisher="Washington State Legislature (rule adopted by the Washington Fish and Wildlife Commission)",
      url="https://app.leg.wa.gov/WAC/default.aspx?cite=220-412-080")
    a(id="d-spring-bear", title="Spring black bear special permit hunts",
      url="https://wdfw.wa.gov/hunting/special-hunts/bear",
      notes="'Per Washington Fish and Wildlife Commission decision, no spring black bear permit season is currently offered in Washington.'")
    a(id="d-cougar-2026", title="Cougar hunting area openings and closures",
      url="https://wdfw.wa.gov/hunting/regulations/big-game/cougar", dataYear=2026)
    a(id="d-turkey-spring-2026", title="2026 Spring Season Wild Turkey Hunting Regulation Pamphlet",
      url="https://wdfw.wa.gov/sites/default/files/publications/02683/wdfw02683.pdf",
      pageUrl="https://wdfw.wa.gov/publications/02683", dataYear=2026)
    a(id="d-director-2024", title="WDFW Director's statement on 2024 special hunt permit draw updates (July 10, 2024)",
      url="https://wdfw.wa.gov/newsroom/directors-statement/wdfw-directors-statement-2024-special-hunt-permit-draw-updates",
      dataYear=2024)
    a(id="d-results-page", title="Special hunt permit drawing result summaries",
      url="https://wdfw.wa.gov/hunting/special-hunts/results", dataYear=2021,
      notes="Page states the content is out of date due to a technical error; data last updated June 21, 2021.")


SPECIAL_SUMMARY = ("WDFW issues special hunt permits through a weighted-point drawing: each application earns one point in that "
                   "species category, points accumulate while unsuccessful, and they reset to zero when drawn (WAC 220-412-080). "
                   "WDFW does not publish the weighting formula in the pamphlet or WAC. Applicants may list up to four hunt choices per "
                   "category (two in Quality deer and elk).")
APP_2027 = {"label": "2027 special hunt permit applications go on sale", "date": "2026-12-01", "cycle": 2027,
            "status": "confirmed", "sourceId": "d-mywdfw",
            "note": "myWDFW: 'Applications for 2027 will be available starting on Dec. 1, 2026.' The 2027 submission window is not yet published."}
SUBMIT_2026 = {"label": "Special permit application submission period (deer, elk, mountain goat, moose, bighorn sheep, turkey)",
               "start": "2026-04-20", "end": "2026-05-27", "cycle": 2026, "status": "confirmed", "sourceId": "d-mywdfw",
               "note": "The 2026 pamphlet printed April 20 - midnight May 20, 2026; WDFW then extended purchase and submission by "
                       "one week to May 27, 2026 because printed pamphlets shipped late (myWDFW: 'Submit applications by May 27'). "
                       "Results available by the end of June (no exact date published). " + NOT_2027}
MS_2027 = [
    {"label": "2027 multi-season tag applications on sale", "start": "2026-12-01", "end": "2027-03-31", "cycle": 2027,
     "status": "confirmed", "sourceId": P26,
     "note": "Drawing results posted in April 2027 (no exact date published); 8,500 deer and 1,000 elk multi-season tags."},
    {"label": "Deadline to buy a drawn 2027 multi-season tag", "date": "2027-07-31", "cycle": 2027, "status": "confirmed",
     "sourceId": P26, "note": "Midnight July 31, 2027."},
]
OIL_LICENSE = {"label": "Deadline to pay for a drawn moose, sheep or goat license", "date": "2026-07-31", "cycle": 2026,
               "status": "confirmed", "sourceId": P26,
               "note": "Pamphlet p. 18 gives July 31 of each year; the species pages say 'by the deadline established by the Department (15 day minimum)'. " + NOT_2027}

DEER_RES = "Residents and nonresidents enter the same drawing; WDFW publishes one combined count per hunt (no resident/nonresident split)."
NR_APP = "Nonresident special permit application: $152.30 per category (resident $9.61; Quality categories $18.72)."


def species_info():
    deer_common = dict(drawSystem="bonus", pointsMatter=True, pointName="special permit point",
                       residentNote=DEER_RES, nonresidentNote=NR_APP)
    return [
        dict(species="elk", displayName="Elk", **deer_common,
             drawSystemSummary=SPECIAL_SUMMARY + " Elk special permit categories: Quality Elk, Bull Elk, Antlerless Elk, Youth, Hunters 65 and Over, Disabled Hunters and Master Hunters.",
             otcSummary="Elk licenses and general-season transport tags are sold over the counter; multi-season elk tags (1,000 for 2027) are drawn separately.",
             keyDates=[APP_2027, SUBMIT_2026] + MS_2027, sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES]),
        dict(species="mule-deer", displayName="Mule deer & black-tailed deer (WDFW deer hunts not limited to white-tailed deer)", **deer_common,
             drawSystemSummary=SPECIAL_SUMMARY + " One deer special permit application may be bought per deer category (up to seven categories).",
             otcSummary="Deer licenses and general-season tags (modern firearm, archery, muzzleloader) are sold over the counter; multi-season deer tags (8,500 for 2027) are drawn separately.",
             keyDates=[APP_2027, SUBMIT_2026] + MS_2027, sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES]),
        dict(species="whitetail", displayName="White-tailed deer (WDFW hunts named or listed as white-tailed only)", **deer_common,
             drawSystemSummary=SPECIAL_SUMMARY + " White-tailed hunts share the deer categories and points with all other deer hunts.",
             otcSummary="Deer licenses and general-season tags are sold over the counter; 2026 white-tailed general seasons are open only in eastern Washington GMUs 101-186, 203-284, 373, 379 and 381 (Columbian white-tailed deer in SW Washington are protected).",
             keyDates=[APP_2027, SUBMIT_2026] + MS_2027, sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES]),
        dict(species="moose", displayName="Moose (Shiras)", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " An individual may harvest only one moose under the Any Antlered Bull Moose category in a lifetime; antlerless, youth, 65 and over and disabled categories may be applied for every year.",
             residentNote=DEER_RES + " A license is bought only if drawn ($457.40 resident).",
             nonresidentNote="Nonresident special hunt moose license and tag $2,279.00 if drawn; application $152.30.",
             otcSummary="None; moose hunting is by special permit (or raffle/auction) only.",
             keyDates=[APP_2027, SUBMIT_2026, OIL_LICENSE], sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES]),
        dict(species="sheep", displayName="Bighorn sheep", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " One bighorn ram may be taken under the Any Ram category in a lifetime; Ewe, Juvenile Ram, Youth and Disabled Hunters categories may be applied for every year.",
             residentNote=DEER_RES + " A license is bought only if drawn ($457.40 resident).",
             nonresidentNote="Nonresident special hunt sheep license and tag $2,279.00 if drawn; application $152.30.",
             otcSummary="None; bighorn sheep hunting is by special permit (or raffle/auction) only.",
             keyDates=[APP_2027, SUBMIT_2026, OIL_LICENSE], sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES]),
        dict(species="goat", displayName="Mountain goat", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " Anyone may apply except those who harvested a mountain goat in Washington after 1998 (raffle, auction and conflict-reduction harvests excepted); one goat per lifetime.",
             residentNote=DEER_RES + " A license is bought only if drawn ($457.40 resident); drawn hunters must pass WDFW's online mountain goat gender identification training before buying the license.",
             nonresidentNote="Nonresident special hunt goat license and tag $2,279.00 if drawn; application $152.30.",
             otcSummary="None; mountain goat hunting is by special permit (or raffle/auction) only.",
             keyDates=[APP_2027, SUBMIT_2026, OIL_LICENSE], sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES]),
        dict(species="turkey", displayName="Wild turkey", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " The only special permit turkey hunt is the fall Teanaway hunt (GMU 335, 50 permits in 2026); spring turkey is a general season.",
             residentNote="Spring general season: small game license plus turkey tag(s), sold over the counter. Fall special permit applicants must hold a small game license.",
             nonresidentNote="Nonresident small game license $252.47; turkey tag $61.22 (additional tags $91.58); special permit application $152.30.",
             otcSummary="2026 spring general season statewide April 15 - May 31 (youth April 1-7); combined spring/youth limit three turkeys statewide, with area limits.",
             keyDates=[APP_2027, SUBMIT_2026], sourceIds=[P26, "d-turkey-spring-2026", FEES, "d-mywdfw"]),
        dict(species="bear", displayName="Black bear", drawSystem="otc", pointsMatter=False,
             drawSystemSummary="Fall black bear is a general season hunted with a bear license sold over the counter (a second bear license/tag allows a second bear). WDFW currently offers no spring black bear permit season; spring bear permits were last drawn for 2021.",
             residentNote="Bear license $32.86 (resident).", nonresidentNote="Bear license $306.10 (nonresident).",
             otcSummary="Fall general season 2026: August 1 - November 15 in most Black Bear Management Units (August 15 - November 15 in BBMUs 5 and 14); GMUs 157, 410-417, 419-424, 490, 522 and 655 closed; mandatory bear identification test in listed northeast and Cascade GMUs.",
             keyDates=[], sourceIds=[P26, "d-spring-bear", FEES, "d-pbi-2021"]),
        dict(species="lion", displayName="Cougar", drawSystem="otc", pointsMatter=False,
             drawSystemSummary="Cougar is a general season hunted with a cougar license sold over the counter; every Cougar Hunt Management Unit has a harvest cap and closes when the cap is reached (closures updated weekly on Thursdays).",
             residentNote="Cougar license $32.86 (resident).", nonresidentNote="Cougar license $306.10 (nonresident).",
             otcSummary="2026-27 season September 1, 2026 - March 31, 2027 unless the CHMU closes at its harvest cap; check the WDFW cougar page or Cougar Hotline 1-866-364-4868.",
             keyDates=[], sourceIds=["d-cougar-2026", FEES, P26]),
        dict(species="pronghorn", displayName="Pronghorn", drawSystem="none", pointsMatter=False,
             drawSystemSummary="No hunting of pronghorn antelope: the 2026 pamphlet states there is no harvest of pronghorns authorized by the Washington Fish and Wildlife Commission.",
             keyDates=[], sourceIds=[P26]),
    ]


def fees():
    out = []

    def f(species, item, res, nonres, note=None, sid=FEES):
        for residency, amt in (("resident", res), ("nonresident", nonres)):
            if amt is None:
                continue
            d = {"species": species, "item": item, "residency": residency, "amountUsd": amt, "licenseYear": 2026, "sourceId": sid}
            if note:
                d["note"] = note
            out.append(d)

    deer_note = "WDFW deer license covers all deer species."
    for sp in ("mule-deer", "whitetail"):
        f(sp, "Deer License", 61.70, 599.07, deer_note)
        f(sp, "Second Deer Tag", 68.48, 356.90, "Required for Second Deer special permit hunts.")
        f(sp, "Multiseason Deer Tag", 191.77, 191.77, "Drawn tag; same price for residents and nonresidents.")
        f(sp, "Multiseason Deer or Elk Tag Application", 9.61, 152.30)
    f("elk", "Elk License", 69.29, 685.60)
    f("elk", "Second Elk Tag (Master Hunter)", 47.58, 487.80)
    f("elk", "Multiseason Elk Tag", 250.97, 250.97, "Drawn tag; same price for residents and nonresidents.")
    f("elk", "Multiseason Deer or Elk Tag Application", 9.61, 152.30)
    f(None, "Deer + Elk License", 116.85, 1020.06)
    f(None, "Deer + Elk + Bear + Cougar License", 133.03, 1188.04)
    f("bear", "Bear License", 32.86, 306.10)
    f("bear", "Second Black Bear License and Tag", 32.86, 306.10)
    f("lion", "Cougar License", 32.86, 306.10)
    for sp, nm in (("moose", "Moose"), ("goat", "Goat"), ("sheep", "Sheep")):
        f(sp, f"Special Hunt {nm} License and Tag", 457.40, 2279.00, "Bought only if drawn.")
    f(None, "Special Hunt Permit Application", 9.61, 152.30, "Price per application (one per category). WDFW adds a 2.9% processing fee to credit card purchases online or by phone (stated in the 2026 pamphlet, p. 8).")
    f(None, "Special Hunt Permit Application - Quality", 18.72, 152.30,
      "Categories 'Quality Elk', 'Quality Deer', 'Any Moose' (pamphlet: 'Any Antlered Bull Moose'), 'Any Ram' and 'Goat'.")
    f("turkey", "Turkey Tag", 21.75, 61.22)
    f("turkey", "Additional Turkey Tags", 21.75, 91.58)
    f("turkey", "Special Hunt Turkey Permit Applications", 9.61, 152.30)
    f("turkey", "Small Game (annual license)", 55.13, 252.47, "Required to hunt turkey and to apply for turkey special permits.")
    return out


def seasons():
    S = []

    def s(sp, label, start, end, note=None, sid=P26):
        d = {"species": sp, "label": label, "start": start, "end": end, "year": 2026, "sourceId": sid}
        if note:
            d["note"] = note
        S.append(d)

    s("mule-deer", "Modern firearm general — mule deer", "2026-10-17", "2026-10-27", "3 pt. min.; GMUs 101-145, 149, 154, 162-186, 203-272, 278, 284, 328, 330-368, 372, 373, 379, 381, 382, 388 (see pamphlet)")
    s("mule-deer", "Modern firearm general — black-tailed deer", "2026-10-17", "2026-11-01", "Western WA GMUs listed in the pamphlet; any buck in most, any deer in GMUs 410-424, 564, 655 and Deer Area 6020, 3 pt. min. in GMU 578")
    s("mule-deer", "Late modern firearm general — black-tailed deer", "2026-11-19", "2026-11-22")
    s("mule-deer", "Early archery general — mule deer", "2026-09-01", "2026-09-25", "3 pt. min.")
    s("mule-deer", "Early archery general — black-tailed deer", "2026-09-01", "2026-09-25", "Most western WA GMUs; some GMUs Sept. 1-20 (see pamphlet)")
    s("whitetail", "Modern firearm general — white-tailed deer (GMUs 101-124)", "2026-10-17", "2026-10-30", "Any buck")
    s("whitetail", "Modern firearm general — white-tailed deer (GMUs 203-284; 127-186)", "2026-10-17", "2026-10-27", "Any buck in 203-284; 3 pt. min. in 127-145, 149, 154, 162-186")
    s("whitetail", "Late modern firearm general — white-tailed deer", "2026-11-07", "2026-11-19", "Any buck; GMUs 105, 108, 111, 113, 117, 121, 124")
    s("whitetail", "Early archery general — white-tailed deer", "2026-09-01", "2026-09-25", "Some southeast GMUs Sept. 1-22 (see pamphlet)")
    s("elk", "Modern firearm general — eastern WA", "2026-10-31", "2026-11-08", "Most eastern GMUs; GMUs 203, 209-248, 250, 254-272, 278, 284, 290, 373, 379 and 381 run Oct. 31-Nov. 15 (see pamphlet)")
    s("elk", "Modern firearm general — western WA", "2026-11-07", "2026-11-18")
    s("elk", "Early archery general — eastern and western WA", "2026-09-12", "2026-09-24")
    s("bear", "Fall black bear general season (most BBMUs)", "2026-08-01", "2026-11-15", "BBMUs 5 (Okanogan) and 14 (Willapa Hills) open Aug. 15")
    s("lion", "Cougar general season", "2026-09-01", "2027-03-31", "Each Cougar Hunt Management Unit closes when its harvest cap is reached", sid="d-cougar-2026")
    s("turkey", "Spring general season (statewide)", "2026-04-15", "2026-05-31", sid="d-turkey-spring-2026")
    s("turkey", "Youth spring season (statewide)", "2026-04-01", "2026-04-07", sid="d-turkey-spring-2026")
    s("turkey", "Fall special permit hunt — Teanaway (GMU 335)", "2026-11-15", "2026-12-15", "50 permits; special permit only")
    return S


COVERAGE_NOTES = {
    "common": ("Per-hunt counts are WDFW's: 2020 and 2022-2025 'Total Applicants' and 'Permits Issued' from WDFW's game harvest "
               "reports; 2021 from WDFW's drawing summary (Power BI; applicants match the 2021 harvest report in all 934 matched hunts, "
               "while the harvest report's 'Permits Issued' is lower in 253 hunts, i.e. permits returned after the draw); 2026 = permits "
               "(quota) from the 2026 pamphlet only, because WDFW has not published 2026 applicant counts. Counts include every hunt "
               "choice position (1st-4th). Odds are computed as permits issued / applicants and do not reflect points. WDFW does not "
               "publish applicants by point level for these years, so byPoints and minPoints are omitted; the pamphlet's 'APPS/AVG POINTS' "
               "figures (average points of drawn applicants, rounded; verified equal to the 2021 drawing summary's 'Average Winner Points') "
               "are quoted in row notes, attached only when the next pamphlet lists the same hunt (same code, name, unit, legal animal, "
               "tag and category). For 2021 those APPS figures equal the drawing summary's applications in 614 of 616 hunts; for "
               "2022-2025 they are lower than the harvest report's 'Total Applicants' (median ratio 0.98 for 2022 and about 0.93 "
               "for 2023-2025, hunts with 50+ applicants), a difference WDFW does not explain. Quotas for deer and elk come from that year's "
               "pamphlet; moose, sheep and goat quotas from the harvest report. The 2024 drawing had a vendor allocation error that "
               "WDFW corrected by re-allocating and adding permits."),
}


def coverage(repo):
    d = os.path.join(repo, "src", "data", "agency", "washington", "draw")
    years = defaultdict(set)
    for f in glob.glob(os.path.join(d, "*.json")):
        for r in json.load(open(f)):
            years[r["species"]].add(r["year"])
    extra = {
        "mule-deer": "Includes all deer hunts not limited to white-tailed deer (mule deer, black-tailed deer and any-deer hunts). 2021: 186 '9xxx' area hunts listed only in WDFW's 2021 deer harvest report (e.g. 'Deer - WDFW Cowlitz Wildlife Area A') are excluded as they are not in the special-permit drawing tables. 2023: hunts 1312-1316, 1318 and 1319 are overprinted by an advertisement in the pamphlet PDF, so that year's pamphlet details (quota, dates, units) are omitted for them; hunts 1304-1311, printed over two lines, are read from both lines. Hunt descriptions name WDFW's pamphlet table (e.g. 'Deer Hunters 65 Years or Over', 'Deer Hunters with Disabilities'); these were checked against the 2021 drawing-summary categories (all agree).",
        "whitetail": "Hunts WDFW names or lists (legal deer column) as white-tailed only; 2020-2021 split uses the 2020/2021 pamphlets.",
        "elk": "2021 hunt 2050 pamphlet row has a misprinted APPS value and is not used for details.",
        "bear": "Spring black bear special permits only (2020-2021); no spring permit season has been offered since. Fall bear is a general season.",
        "turkey": "One fall special permit hunt (Teanaway). 2021 counts are applications from WDFW's drawing summary; 2022-2026 rows carry pamphlet permits plus the next pamphlet's APPS/AVG POINTS in notes (the 2026 pamphlet repeats the '2024 APPS' figure).",
        "goat": "Includes 2021 conflict-reduction hunts (Olympic Mountains).",
        "moose": "",
        "sheep": "",
    }
    out = []
    for sp in sorted(years):
        out.append({"species": sp, "years": sorted(years[sp]), "notes": (extra.get(sp, "") + " " + COVERAGE_NOTES["common"]).strip()})
    out.append({"species": "lion", "years": [], "notes": "No draw: cougar is a general (over-the-counter) season with harvest caps."})
    out.append({"species": "pronghorn", "years": [], "notes": "No pronghorn hunting in Washington."})
    return out


def main(raw, repo):
    build.register_sources()
    extra_sources()
    meta = {
        "slug": "washington",
        "name": "Washington",
        "abbrev": "WA",
        "agency": {"name": "Washington Department of Fish and Wildlife", "shortName": "WDFW", "url": "https://wdfw.wa.gov"},
        "unitTerm": "GMU",
        "lastReviewed": R,
        "overview": ("WDFW draws special hunt permits for deer, elk, moose, bighorn sheep, mountain goat and fall turkey with a "
                     "weighted-point system: each application earns one point in that category, points build while you are "
                     "unsuccessful, and they reset to zero when you are drawn. Applicants rank up to four hunt choices per category "
                     "(two in Quality deer and elk); the 2026 submission period ran April 20 - May 27, 2026 (extended by WDFW from "
                     "May 20), with results by the end of June, and 2027 applications go on sale December 1, 2026. Residents and nonresidents compete in the same "
                     "drawing; general deer, elk, black bear and cougar seasons use licenses and tags sold over the counter, and "
                     "multi-season deer and elk tags are drawn separately."),
        "species": species_info(),
        "fees": fees(),
        "seasons": seasons(),
        "coverage": coverage(repo),
        "sources": build.SOURCES,
    }
    p = os.path.join(repo, "src", "data", "agency", "washington", "draw-meta.json")
    with open(p, "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print("wrote", p, len(build.SOURCES), "sources")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
