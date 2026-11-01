"""Write src/data/agency/washington/draw-meta.json (WDFW draw facts, fees, seasons, coverage).

Usage:  python -I draw_meta.py <raw_dir> <repo_root>
Run draw_build.py and seasons_ranges.py first (coverage is computed from the draw/*.json files they write).
Needs bs4 (draw_build.py imports it); seasons_ranges.py must sit next to this file.

Every fact below was read from the WDFW document named by its sourceId:
  d-pamphlet-2026  2026 Big Game Hunting Seasons and Rules (pp. 8, 14, 18-20, 21-25, 41-46, 61-70)
  d-fees-2026      wdfw.wa.gov/licenses/hunting/big-game ("Effective January 1, 2026")
  d-mywdfw         myWDFW special hunt page ("Applications for 2027 will be available starting on Dec. 1, 2026")
  d-wac-220-412-080, d-spring-bear, d-cougar-2026, d-turkey-spring-2026, d-director-2024
  d-gamebird-2026  2026-2027 Game Bird and Small Game Hunting Regulations (p. 36: fall 2026 and spring 2027 turkey seasons)
  d-news-*         WDFW news releases (2026 special hunt submission period and its extension; 2026 surplus multi-season tags)
Season dates in seasons() are typed as the pamphlet prints them and converted with seasons_ranges.parse
(license-year rule); units are the GMUs/areas as printed, with footnote markers (a, d, h, *) dropped.
"""
import glob
import importlib.util
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("draw_build", os.path.join(HERE, "draw_build.py"))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
_spec = importlib.util.spec_from_file_location("seasons_ranges", os.path.join(HERE, "seasons_ranges.py"))
seasons_ranges = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seasons_ranges)

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
      notes="Special hunt permits: 'The application period is closed for 2026. Applications for 2027 will be available starting on Dec. 1, 2026.' "
            "Multi-season tags: 'Applications for 2027 will be available Dec. 1, 2026, through March 31, 2027.' Re-checked 2026-10-31; "
            "no 2027 submission window, drawing date or results date is posted.")
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
    a(id="d-news-submit-2026", title="2026 Washington big game hunting regulations now available; special hunt submissions begin April 20 "
                                    "(news release, April 13, 2026; updated May 14, 2026)",
      url="https://wdfw.wa.gov/newsroom/news-release/2026-washington-big-game-hunting-regulations-now-available-special-hunt-submissions-begin-april-20",
      dataYear=2026,
      notes="'Beginning April 20, hunters may submit special hunt permit applications for 2026 deer, elk, mountain goat, moose, bighorn sheep, "
            "and fall turkey seasons. The submission period is open through May 27'; update of May 14, 2026: deadline extended to May 27 because "
            "printed pamphlets were delayed.")
    a(id="d-news-surplus-ms-2026", title="Surplus multi-season elk tags available Aug. 25; multi-season deer tags available Aug. 27 (news release, Aug. 10, 2026)",
      url="https://wdfw.wa.gov/newsroom/news-release/surplus-multi-season-elk-tags-available-aug-25-multi-season-deer-tags-available-aug-27",
      dataYear=2026)
    a(id="d-gamebird-2026", title="2026-2027 Washington Game Bird and Small Game Hunting Regulations (effective July 1, 2026 - June 30, 2027)",
      url="https://www.eregulations.com/assets/docs/resources/WA/26WAGB-LR.pdf",
      pageUrl="https://wdfw.wa.gov/hunting/regulations/migratory-waterfowl-upland-game", dataYear=2026,
      notes="WDFW's official pamphlet, hosted on eregulations.com and linked from WDFW's game bird regulations page. "
            "Wild turkey seasons p. 36: fall general Sept. 1 - Dec. 31 (2026), youth April 1-7, 2027 and spring general April 15 - May 31 (2027).")
    for wsr, title, yr, note in (
            ("21-02-015", "WSR 21-02-015: WAC 220-415-080 2021 Spring black bear special permits (permanent rule, filed Dec. 28, 2020)", 2021,
             "Hunt areas, permit levels and season dates for the 2021 spring black bear special permits."),
            ("20-10-065", "WSR 20-10-065: WAC 220-415-08000C 2020 Spring black bear special permits (emergency rule, effective May 5, 2020)", 2020,
             "Reopened the 2020 spring bear seasons May 5 - June 30 after WSR 20-09-043 delayed their opening (COVID-19)."),
            ("19-22-061", "WSR 19-22-061: WAC 220-415-080 2020 Spring black bear special permits (permanent rule, filed Nov. 5, 2019)", 2020,
             "2020 season dates as originally adopted; quoted in the 2020 spring bear row notes.")):
        a(id=f"d-wsr-{wsr}", title=title, publisher="Washington Department of Fish and Wildlife (Washington State Register)",
          url=f"https://lawfilesext.leg.wa.gov/law/wsr/20{wsr[:2]}/{wsr[3:5]}/{wsr}.htm", dataYear=yr, notes=note)
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
APP_2027 = {"label": "2027 special hunt permit applications go on sale", "kind": "application", "date": "2026-12-01", "cycle": 2027,
            "status": "confirmed", "sourceId": "d-mywdfw",
            "note": "myWDFW: 'Applications for 2027 will be available starting on Dec. 1, 2026.' The 2027 submission window is not yet published."}
SUBMIT_2026 = {"label": "Special permit application submission period (deer, elk, mountain goat, moose, bighorn sheep, turkey)",
               "kind": "application", "start": "2026-04-20", "end": "2026-05-27", "cycle": 2026, "status": "confirmed",
               "sourceId": "d-news-submit-2026",
               "note": "The 2026 pamphlet printed April 20 - midnight May 20, 2026; on May 14 WDFW extended submission by one week "
                       "to May 27, 2026 because printed pamphlets shipped late (also on myWDFW: 'Submit applications by May 27'). "
                       "Results posted in June (no exact date published). " + NOT_2027}
MS_2027 = [
    {"label": "2027 multi-season tag applications on sale", "kind": "application", "start": "2026-12-01", "end": "2027-03-31", "cycle": 2027,
     "status": "confirmed", "sourceId": P26,
     "note": "Drawing results posted in April 2027 (no exact date published); 8,500 deer and 1,000 elk multi-season tags. "
             "myWDFW (re-checked 2026-10-31) gives the same window."},
    {"label": "Deadline to buy a drawn 2027 multi-season tag", "kind": "payment", "date": "2027-07-31", "cycle": 2027, "status": "confirmed",
     "sourceId": P26, "note": "Midnight July 31, 2027."},
]
OIL_LICENSE = {"label": "Deadline to pay for a drawn moose, sheep or goat license", "kind": "payment", "date": "2026-07-31", "cycle": 2026,
               "status": "confirmed", "sourceId": P26,
               "note": "Pamphlet p. 18 gives July 31 of each year; the species pages say 'by the deadline established by the Department (15 day minimum)'. " + NOT_2027}

SURPLUS_MS = {
    "elk": {"label": "Surplus 2026 multi-season elk tags on sale (10 a.m., first come, first served)", "kind": "leftover", "date": "2026-08-25",
            "cycle": 2026, "status": "confirmed", "sourceId": "d-news-surplus-ms-2026",
            "note": "Only for hunters who bought a 2026 multi-season application; 187 tags; in person at WDFW offices and license dealers."},
    "deer": {"label": "Surplus 2026 multi-season deer tags on sale (10 a.m., first come, first served)", "kind": "leftover", "date": "2026-08-27",
             "cycle": 2026, "status": "confirmed", "sourceId": "d-news-surplus-ms-2026",
             "note": "Only for hunters who bought a 2026 multi-season application; 3,137 tags; online, by phone or in person."},
}

DEER_RES = "Residents and nonresidents enter the same drawing; WDFW publishes one combined count per hunt (no resident/nonresident split)."
NR_APP = "Nonresident special permit application: $152.30 per category (resident $9.61; Quality categories $18.72)."


def species_info():
    deer_common = dict(drawSystem="bonus", pointsMatter=True, pointName="special permit point",
                       residentNote=DEER_RES, nonresidentNote=NR_APP)
    return [
        dict(species="elk", displayName="Elk", **deer_common,
             drawSystemSummary=SPECIAL_SUMMARY + " Elk special permit categories: Quality Elk, Bull Elk, Antlerless Elk, Youth, Hunters 65 and Over, Disabled Hunters and Master Hunters.",
             otcSummary="Elk licenses and general-season transport tags are sold over the counter; multi-season elk tags (1,000 for 2027) are drawn separately.",
             keyDates=[APP_2027, SUBMIT_2026] + MS_2027 + [SURPLUS_MS["elk"]],
             sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES, "d-news-submit-2026", "d-news-surplus-ms-2026"]),
        dict(species="mule-deer", displayName="Mule deer & black-tailed deer (WDFW deer hunts not limited to white-tailed deer)", **deer_common,
             drawSystemSummary=SPECIAL_SUMMARY + " One deer special permit application may be bought per deer category (up to seven categories).",
             otcSummary="Deer licenses and general-season tags (modern firearm, archery, muzzleloader) are sold over the counter; multi-season deer tags (8,500 for 2027) are drawn separately.",
             keyDates=[APP_2027, SUBMIT_2026] + MS_2027 + [SURPLUS_MS["deer"]],
             sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES, "d-news-submit-2026", "d-news-surplus-ms-2026"]),
        dict(species="whitetail", displayName="White-tailed deer (WDFW hunts named or listed as white-tailed only)", **deer_common,
             drawSystemSummary=SPECIAL_SUMMARY + " White-tailed hunts share the deer categories and points with all other deer hunts.",
             otcSummary="Deer licenses and general-season tags are sold over the counter; 2026 white-tailed general seasons are open only in eastern Washington GMUs 101-186, 203-284, 373, 379 and 381 (Columbian white-tailed deer in SW Washington are protected).",
             keyDates=[APP_2027, SUBMIT_2026] + MS_2027 + [SURPLUS_MS["deer"]],
             sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES, "d-news-submit-2026", "d-news-surplus-ms-2026"]),
        dict(species="moose", displayName="Moose (Shiras)", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " An individual may harvest only one moose under the Any Antlered Bull Moose category in a lifetime; antlerless, youth, 65 and over and disabled categories may be applied for every year.",
             residentNote=DEER_RES + " A license is bought only if drawn ($457.40 resident).",
             nonresidentNote="Nonresident special hunt moose license and tag $2,279.00 if drawn; application $152.30.",
             otcSummary="None; moose hunting is by special permit (or raffle/auction) only.",
             keyDates=[APP_2027, SUBMIT_2026, OIL_LICENSE], sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES, "d-news-submit-2026"]),
        dict(species="sheep", displayName="Bighorn sheep", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " One bighorn ram may be taken under the Any Ram category in a lifetime; Ewe, Juvenile Ram, Youth and Disabled Hunters categories may be applied for every year.",
             residentNote=DEER_RES + " A license is bought only if drawn ($457.40 resident).",
             nonresidentNote="Nonresident special hunt sheep license and tag $2,279.00 if drawn; application $152.30.",
             otcSummary="None; bighorn sheep hunting is by special permit (or raffle/auction) only.",
             keyDates=[APP_2027, SUBMIT_2026, OIL_LICENSE], sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES, "d-news-submit-2026"]),
        dict(species="goat", displayName="Mountain goat", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " Anyone may apply except those who harvested a mountain goat in Washington after 1998 (raffle, auction and conflict-reduction harvests excepted); one goat per lifetime.",
             residentNote=DEER_RES + " A license is bought only if drawn ($457.40 resident); drawn hunters must pass WDFW's online mountain goat gender identification training before buying the license.",
             nonresidentNote="Nonresident special hunt goat license and tag $2,279.00 if drawn; application $152.30.",
             otcSummary="None; mountain goat hunting is by special permit (or raffle/auction) only.",
             keyDates=[APP_2027, SUBMIT_2026, OIL_LICENSE], sourceIds=[P26, "d-wac-220-412-080", "d-mywdfw", FEES, "d-news-submit-2026"]),
        dict(species="turkey", displayName="Wild turkey", drawSystem="bonus", pointsMatter=True, pointName="special permit point",
             drawSystemSummary=SPECIAL_SUMMARY + " The only special permit turkey hunt is the fall Teanaway hunt (GMU 335, 50 permits in 2026); spring turkey is a general season.",
             residentNote="Spring general season: small game license plus turkey tag(s), sold over the counter. Fall special permit applicants must hold a small game license.",
             nonresidentNote="Nonresident small game license $252.47; turkey tag $61.22 (additional tags $91.58); special permit application $152.30.",
             otcSummary="General seasons with a small game license and turkey tags sold over the counter: fall general Sept. 1 - Dec. 31, 2026 in listed eastern and Klickitat-area GMUs (seasonal limit four, with area limits); spring 2027 general season statewide April 15 - May 31 (youth April 1-7, 2027); combined spring/youth limit three turkeys statewide, with area limits.",
             keyDates=[APP_2027, SUBMIT_2026], sourceIds=[P26, "d-turkey-spring-2026", FEES, "d-mywdfw", "d-news-submit-2026", "d-gamebird-2026"]),
        dict(species="bear", displayName="Black bear", drawSystem="otc", pointsMatter=False,
             drawSystemSummary="Fall black bear is a general season hunted with a bear license sold over the counter (a second bear license/tag allows a second bear). WDFW currently offers no spring black bear permit season; spring bear permits were last drawn for 2021.",
             residentNote="Bear license $32.86 (resident).", nonresidentNote="Bear license $306.10 (nonresident).",
             otcSummary="Fall general season 2026: August 1 - November 15 in most Black Bear Management Units (August 15 - November 15 in BBMUs 5 and 14); GMUs 157, 410-417, 419-424, 490, 522 and 655 closed; mandatory bear identification test in listed northeast and Cascade GMUs.",
             keyDates=[], sourceIds=[P26, "d-spring-bear", FEES, "d-pbi-2021", "d-wsr-21-02-015", "d-wsr-20-10-065"]),
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


# General seasons, transcribed row by row from the WDFW tables (dates and GMU lists as printed).
# (species, method, label, dates as printed, GMUs/areas as printed, legal animal / note)
BT, WT, MD = "black-tailed deer", "white-tailed deer", "mule deer"
WILDERNESS = ("Alpine Lakes Wilderness, Mount Baker Wilderness, Glacier Peak Wilderness, Pasayten Wilderness, "
              "Olympic Peninsula wilderness areas, Henry Jackson Wilderness, Lake Chelan Recreation Area")
DEER_2026 = [  # 2026 pamphlet pp. 22-24 (PDF pages 22-24)
    # modern firearm
    ("mule-deer", "rifle", "Modern firearm high buck hunt (wilderness)", "Sept. 15-25", WILDERNESS, "3 pt. min. (mule deer and black-tailed deer)"),
    ("mule-deer", "rifle", f"Modern firearm general — {BT}", "Oct. 17-Nov. 1", "407, 418, 426, 437, 448, 450, 454, 460, 466, 501 through 505, 506ad, 510 through 520, 524, 530ad, 550 through 560, 568, 572, 574, 601 through 621, 624, 627 through 654, 658 through 699d", "Any buck; GMU 624 except Deer Area 6020"),
    ("mule-deer", "rifle", f"Modern firearm general — {BT}", "Oct. 17-Nov. 1", "410, 411, 412, 413, 414, 415, 416, 417, 419, 420, 421, 422, 423, 424, 564a*, 655, Deer Area 6020", "Any deer"),
    ("mule-deer", "rifle", f"Modern firearm general — {BT}", "Oct. 17-Nov. 1", "578d", "3 pt. min."),
    ("whitetail", "rifle", f"Modern firearm general — {WT}", "Oct. 17-30", "101, 105, 108, 111, 113, 117d, 121, 124", "Any buck"),
    ("whitetail", "rifle", f"Modern firearm general — {WT}", "Oct. 17-27", "203 through 284", "Any buck"),
    ("whitetail", "rifle", f"Modern firearm general — {WT}", "Oct. 17-27", "127 through 145, 149d, 154, 162 through 186", "3 pt. min."),
    ("whitetail", "rifle", f"Modern firearm general — {WT}", "Oct. 17-27", "373d, 379d, 381", "Any deer"),
    ("mule-deer", "rifle", f"Modern firearm general — {MD}", "Oct. 17-27", "101 through 145, 149d, 154, 162 through 186, 203 through 272, 278d, 284, 328, 330 through 368, 372*, 373d, 379d, 381, 382*, 388", "3 pt. min."),
    ("mule-deer", "rifle", f"Late modern firearm general — {BT}", "Nov. 19-22", "407, 454, 466, 501 through 505, 506ad, 510 through 520, 524, 530ad, 550 through 560, 568, 572, 601 through 621, 624, 627 through 654, 658 through 684, 699d", "Any buck; GMU 624 except Deer Area 6020"),
    ("mule-deer", "rifle", f"Late modern firearm general — {BT}", "Nov. 19-22", "410 through 417, 419 through 424, 564a*, 655, Deer Area 6020", "Any deer"),
    ("whitetail", "rifle", f"Late modern firearm general — {WT}", "Nov. 7-19", "105, 108, 111, 113, 117d, 121, 124", "Any buck"),
    ("whitetail", "rifle", f"Youth modern firearm general — {WT}", "Oct. 24-30", "124", "Any deer; youth general season"),
    ("whitetail", "rifle", f"Youth modern firearm general — {WT}", "Oct. 24-27", "127 through 142", "3 pt. min. or antlerless; youth general season"),
    # archery
    ("mule-deer", "archery", f"Early archery general — {BT}", "Sept. 1-25", "407, 410, 411h, 412h, 413h, 414h, 415h, 416, 417, 418, 419, 420h, 421, 422h, 423, 424, 426, 437, 448, 450, 454, 466, 501, 504, 505, 554, 564a*, 568, 621 through 636, 648 through 652, 654 through 673, 684d", "Any deer"),
    ("mule-deer", "archery", f"Early archery general — {BT}", "Sept. 1-25", "460, 503, 574, 601 through 618, 638, 642, 653, 681, 699d", "Any buck"),
    ("mule-deer", "archery", f"Early archery general — {BT}", "Sept. 1-25", "578d", "3 pt. min."),
    ("mule-deer", "archery", f"Early archery general — {BT}", "Sept. 1-20", "510, 513, 516, 520, 524, 530ad, 556", "Any deer"),
    ("mule-deer", "archery", f"Early archery general — {BT}", "Sept. 1-20", "506ad, 550, 560, 572", "Any buck"),
    ("whitetail", "archery", f"Early archery general — {WT}", "Sept. 1-25", "101 through 124", "Any buck"),
    ("whitetail", "archery", f"Early archery general — {WT}", "Sept. 1-25", "204 through 250, 254 through 284d, 373d, 379d, 381", "Any deer"),
    ("whitetail", "archery", f"Early archery general — {WT}", "Sept. 1-25", "127 through 142, 145, 149d, 166, 169, 172, 175, 186", "3 pt. min."),
    ("whitetail", "archery", f"Early archery general — {WT}", "Sept. 1-22", "154, 162, 163, 178, 181", "3 pt. min."),
    ("mule-deer", "archery", f"Early archery general — {MD}", "Sept. 1-25", "101 through 136, 145, 149, 166 through 175, 186, 204 through 250, 254 through 278, 334, 382*, 388", "3 pt. min."),
    ("mule-deer", "archery", f"Early archery general — {MD}", "Sept. 1-25", "139, 142, 284, 372*, 373d, 379d, 381, Deer Area 3334", "3 pt. min. or antlerless"),
    ("mule-deer", "archery", f"Early archery general — {MD}", "Sept. 1-20", "154, 162, 163, 178, 181, 251, 328, 335, 336, 340, 346, 352, 356, 360, 364, 368", "3 pt. min."),
    ("mule-deer", "archery", f"Late archery general — {BT}", "Nov. 25-Dec. 15", "437, 466, 510 through 520, 524", "Any deer"),
    ("mule-deer", "archery", f"Late archery general — {BT}", "Nov. 25-Dec. 15", "448, 460, 506ad, 530ad, 560, 572, 601, 603 through 618, 638, 642, 681, 699d", "Any buck"),
    ("mule-deer", "archery", f"Late archery general — {BT}", "Nov. 25-Dec. 31", "407, 410, 411h, 412h, 413h, 414h, 415h, 416, 417, 419, 420h, 421, 422h, 423, 424, 454, 505, 564a*, 624, 627, 636, 648, 652, 654, 655, 660 through 672", "Any deer"),
    ("whitetail", "archery", f"Late archery general — {WT}", "Nov. 10-Dec. 15", "101", "Any buck"),
    ("whitetail", "archery", f"Late archery general — {WT}", "Nov. 25-Dec. 15", "105, 108, 117d, 121, 124", "Any buck"),
    ("whitetail", "archery", f"Late archery general — {WT}", "Nov. 25-Dec. 15", "127", "3 pt. min."),
    ("whitetail", "archery", f"Late archery general — {WT}", "Nov. 20-Dec. 8", "145, 163, 178, 272, 278d", "3 pt. min."),
    ("whitetail", "archery", f"Late archery general — {WT}", "Nov. 20-Dec. 8", "373d", "Any deer"),
    ("whitetail", "archery", f"Late archery general — {WT}", "Nov. 25-Dec. 15", "204, 209, 215, 233, 243", "Any deer"),
    ("mule-deer", "archery", f"Late archery general — {MD}", "Nov. 21-30", "209, 215, 233, 243, 250", "3 pt. min."),
    ("mule-deer", "archery", f"Late archery general — {MD}", "Nov. 25-Dec. 8", "336, 342, 346, 352, 364, 388, Deer Area 3682", "3 pt. min."),
    ("mule-deer", "archery", f"Late archery general — {MD}", "Nov. 20-Dec. 8", "145, 163, 178, 272, 278", "3 pt. min."),
    ("mule-deer", "archery", f"Late archery general — {MD}", "Nov. 20-Dec. 8", "373d, Deer Area 3372", "3 pt. min. or antlerless"),
    ("mule-deer", "archery", f"Late archery general — {MD}", "Dec. 1-8", "382*", "3 pt. min."),
    # muzzleloader
    ("mule-deer", "muzzleloader", "Muzzleloader high buck hunt (wilderness)", "Sept. 15-25", WILDERNESS, "3 pt. min. (mule deer and black-tailed deer)"),
    ("mule-deer", "muzzleloader", f"Early muzzleloader general — {BT}", "Sept. 26-Oct. 4", "407, 418, 426, 437, 448, 450, 501, 503, 504, 505, 506ad, 510, 513, 516, 520, 530ad, 550, 554, 560, 568, 572, 574, 603, 607, 612, 615, 621, 624, 633 through 651, 660, 663, 672, 673", "Any buck; GMU 624 except Deer Area 6020"),
    ("mule-deer", "muzzleloader", f"Early muzzleloader general — {BT}", "Sept. 26-Oct. 4", "410, 411h, 412h, 413h, 414h, 415h, 416, 417, 419, 420h, 421, 422h, 423, 424, 454, 564a*, 627, 652, 655, 666, 684d, Deer Area 6020", "Any deer"),
    ("mule-deer", "muzzleloader", f"Early muzzleloader general — {BT}", "Sept. 26-Oct. 4", "578d", "3 pt. min."),
    ("whitetail", "muzzleloader", f"Early muzzleloader general — {WT}", "Sept. 26-Oct. 4", "101 through 124, 203, 204, 209, 215, 231, 233, 239, 242 through 246, 247, 248, 250, 251, 254, 260, 262, 266, 269, 272, 278d, 284", "Any buck"),
    ("whitetail", "muzzleloader", f"Early muzzleloader general — {WT}", "Sept. 26-Oct. 4", "127, 130, 133, 136, 139, 142, 145, 149d, 175, 181, 186", "3 pt. min."),
    ("whitetail", "muzzleloader", f"Early muzzleloader general — {WT}", "Sept. 26-Oct. 4", "373d, 379d", "Any deer"),
    ("mule-deer", "muzzleloader", f"Early muzzleloader general — {MD}", "Sept. 26-Oct. 4", "101 through 145, 149d, 175, 181, 186, 203, 204, 209, 215, 231, 233, 239, 242 through 246, 248, 250, 251, 254, 260, 262, 266, 269, 272, 278d, 284, 328, 330 through 342, 352 through 368, 373d, 379d", "3 pt. min."),
    ("mule-deer", "muzzleloader", f"Early muzzleloader general — {MD}", "Sept. 26-Oct. 4", "Deer Area 3334, Deer Area 3372", "3 pt. min. or antlerless"),
    ("mule-deer", "muzzleloader", f"Late muzzleloader general — {BT}", "Nov. 25-Dec. 15", "407, 410, 411h, 412h, 413h, 414h, 415h, 416, 417, 419, 420h, 421, 422h, 423, 424, 454, 504, 564a*, 633, 654, 666, 667, 684d", "Any deer"),
    ("mule-deer", "muzzleloader", f"Late muzzleloader general — {BT}", "Nov. 25-Dec. 15", "448, 460, 501, 602, 621, 651, 658, 673", "Any buck"),
    ("whitetail", "muzzleloader", f"Late muzzleloader general — {WT}", "Nov. 25-Dec. 8", "113", "Any buck"),
    ("whitetail", "muzzleloader", f"Late muzzleloader general — {WT}", "Nov. 25-Dec. 8", "130, 133, 136, 139, 142", "3 pt. min."),
    ("whitetail", "muzzleloader", f"Late muzzleloader general — {WT}", "Nov. 20-Dec. 8", "172, 181", "3 pt. min."),
    ("whitetail", "muzzleloader", f"Late muzzleloader general — {WT}", "Nov. 25-Dec. 8", "379d, 381", "Any deer"),
    ("mule-deer", "muzzleloader", f"Late muzzleloader general — {MD}", "Nov. 25-Dec. 8", "379d, 381", "3 pt. min."),
    ("mule-deer", "muzzleloader", f"Late muzzleloader general — {MD}", "Nov. 20-30", "382*", "3 pt. min."),
]
MH = "Master Hunters only; must wear hunter orange and/or fluorescent hunter pink"
W_EXC = "Excludes Elk Area 5066 and Elk Area 6071; Elk Area 6064 portion of GMU 638 is Master Hunters only"
ELK_2026 = [  # 2026 pamphlet pp. 44-46 (PDF pages 42-44)
    # modern firearm, eastern
    ("elk", "rifle", "Modern firearm general — eastern WA (Master Hunters)", "Aug. 1, 2026-Jan. 20, 2027", "Elk Area 3911, Elk Area 3912", "Antlerless only; " + MH),
    ("elk", "rifle", "Modern firearm general — eastern WA", "Sept. 12-27", "Elk Area 3722*", "Antlerless only"),
    ("elk", "rifle", "Modern firearm general — eastern WA", "Oct. 31-Nov. 8", "101, 105, 108, 111, 113, 117d, 121, 204", "Any bull"),
    ("elk", "rifle", "Modern firearm general — eastern WA", "Oct. 31-Nov. 8", "145, 149d, 154, 162 through 186, 249, 336 through 368", "Spike bull"),
    ("elk", "rifle", "Modern firearm general — eastern WA", "Oct. 31-Nov. 8", "251, 328, 329, 334, 335", "True spike bull"),
    ("elk", "rifle", "Modern firearm general — eastern WA", "Oct. 31-Nov. 8", "124 through 142, 372*, 382*, 388", "Any elk"),
    ("elk", "rifle", "Modern firearm general — eastern WA", "Oct. 31-Nov. 15", "203, 209 through 248, 250, 254 through 272, 278d, 284, 290, 373d, 379d, 381", "Any elk"),
    ("elk", "rifle", "Modern firearm general — eastern WA (Master Hunters)", "Aug. 1-31", "334, 371", "Antlerless only; " + MH + " in August"),
    ("elk", "rifle", "Modern firearm general — eastern WA (Master Hunters)", "Jan. 1-31, 2027", "334, 371", "Antlerless only; Master Hunters only"),
    ("elk", "rifle", "Modern firearm general — eastern WA (Master Hunters)", "Dec. 9-31", "127 through 142", "Antlerless only; Master Hunters only"),
    # modern firearm, western
    ("elk", "rifle", "Modern firearm general — western WA", "Nov. 7-18", "564*d, 666", "Any elk"),
    ("elk", "rifle", "Modern firearm general — western WA", "Nov. 7-18", "454", "Any bull"),
    ("elk", "rifle", "Modern firearm general — western WA", "Nov. 7-18", "407, 460, 466, 448, 503, 505, 506a, 510 through 520, 524, 530ad, 550, 560, 568, 572, 574, 578d, 601 through 618, 624, 627, 633, 638, 642 through 651, 652, 654, 658, 660, 667 through 681, 684d", "3 pt. min.; " + W_EXC + "; GMU 652 excludes Elk Area 6014"),
    ("elk", "rifle", "Modern firearm general — western WA", "Nov. 7-18", "501, 504, 663, Elk Area 4601*, Elk Area 6014", "3 pt. min. or antlerless"),
    # archery, early
    ("elk", "archery", "Early archery general — eastern WA (Master Hunters)", "Aug. 1-31", "371", "Antlerless only; " + MH),
    ("elk", "archery", "Early archery general — eastern WA", "Sept. 12-24", "101 through 142, 117d, 204, 243, 247, 249, 250, 272, 278, 284, 290, 373d, 379d, 381, 382*, 388", "Any elk"),
    ("elk", "archery", "Early archery general — eastern WA", "Sept. 12-24", "145, 149d, 163, 178, 181, 334, 335, 371, Elk Area 1054", "Spike bull or antlerless"),
    ("elk", "archery", "Early archery general — eastern WA", "Sept. 12-24", "154, 162, 166, 169, 172, 175, 186, 251, 328, 329, 336, 340, 352, 356, 364", "Spike bull"),
    ("elk", "archery", "Early archery general — western WA", "Sept. 12-24", "454, 564*d, 666, 684, Elk Area 6014", "Any elk"),
    ("elk", "archery", "Early archery general — western WA", "Sept. 12-24", "407, 448, 460, 466, 506a through 520, 524, 530ad, 550, 560, 572, 601 through 618, 624, 627, 633, 638, 642 through 651, 658", "3 pt. min.; " + W_EXC),
    ("elk", "archery", "Early archery general — western WA", "Sept. 12-24", "Elk Area 4601***, 501 through 505, 554, 568, 574, 578d, Elk Area 6061, 652, 654, 660, 663, 667 through 673, 681, 699d", "3 pt. min. or antlerless; Elk Area 6013 closed to antlerless"),
    # archery, late
    ("elk", "archery", "Late archery general — eastern WA (Master Hunters)", "Aug. 1, 2026-Jan. 20, 2027", "Elk Area 3911, Elk Area 3912", "Antlerless only; " + MH),
    ("elk", "archery", "Late archery general — eastern WA", "Oct. 31-Nov. 15", "203, 209 through 248, 250, 254 through 272, 278d, 284, 290, 379d, 381", "Any elk; must wear hunter orange and/or fluorescent hunter pink"),
    ("elk", "archery", "Late archery general — eastern WA", "Nov. 20-Dec. 8", "178", "Antlerless only"),
    ("elk", "archery", "Late archery general — eastern WA", "Nov. 25-Dec. 8", "101, 105, 108, 117, 204", "Any bull"),
    ("elk", "archery", "Late archery general — eastern WA", "Nov. 25-Dec. 8", "121, 124, 127, 373d, 382*, 388", "Any elk"),
    ("elk", "archery", "Late archery general — eastern WA", "Nov. 25-Dec. 8", "334, 335", "Spike bull or antlerless"),
    ("elk", "archery", "Late archery general — eastern WA", "Nov. 25-Dec. 8", "249, 251, 336, 342, 346, 352, 364, Elk Area 3681", "Spike bull"),
    ("elk", "archery", "Late archery general — eastern WA (Master Hunters)", "Dec. 9-31", "127 through 142", "Antlerless only; Master Hunters only"),
    ("elk", "archery", "Late archery general — eastern WA", "Dec. 9, 2026-Jan. 20, 2027", "163", "Antlerless only"),
    ("elk", "archery", "Late archery general — western WA", "Nov. 25-Dec. 15", "Elk Area 4601*, 503, 505, 652, 663, 667, 672, 681, 699d", "3 pt. min. or antlerless; Elk Area 6013 closed to antlerless; Elk Area 6064 portion of GMU 638 Master Hunters only"),
    ("elk", "archery", "Late archery general — western WA", "Nov. 25-Dec. 15", "454, 564*d, 666, Elk Area 6014", "Any elk"),
    ("elk", "archery", "Late archery general — western WA", "Nov. 25-Dec. 15", "407, 448, 506, 530, 603, 612, 615, 638, 648", "3 pt. min.; GMU 638 excludes Elk Area 6064"),
    # muzzleloader, early
    ("elk", "muzzleloader", "Early muzzleloader general — eastern WA (Master Hunters)", "Aug. 1-31", "371", "Antlerless only; " + MH),
    ("elk", "muzzleloader", "Early muzzleloader general — eastern WA", "Oct. 3-9", "101 through 121, 117d, 204, 247", "Any bull"),
    ("elk", "muzzleloader", "Early muzzleloader general — eastern WA", "Oct. 3-9", "124 through 142, 245, 250, 272, 278, 284, 290, 379d", "Any elk"),
    ("elk", "muzzleloader", "Early muzzleloader general — eastern WA", "Oct. 3-9", "145, 149, 154, 162, 163, 166, 172, 175, 178, 181, 249, 336 through 342, 352 through 368", "Spike bull"),
    ("elk", "muzzleloader", "Early muzzleloader general — eastern WA", "Oct. 3-9", "251, 328, 329, 334, 335, Elk Area 2051", "True spike bull"),
    ("elk", "muzzleloader", "Early muzzleloader general — western WA", "Oct. 3-9", "454, 564*d, 666, 684d", "Any elk"),
    ("elk", "muzzleloader", "Early muzzleloader general — western WA", "Oct. 3-9", "407, 448, 460, 466, 506a, 510, 513, 516, 520, 524, 530ad, 550, 554, 560, 568, 572, 574, 578d, 602, 603, 607, 612, 615, 624, 627, 633, 638, 642, 648, 660, 672, 673, 681", "3 pt. min.; excludes Elk Area 5066, Elk Area 6071 and Elk Area 6064"),
    ("elk", "muzzleloader", "Early muzzleloader general — western WA", "Oct. 3-9", "501, 503, 504, 505, 652, Elk Area 6014, 654, 663, 667, Elk Area 4601", "3 pt. min. or antlerless; Elk Area 6013 closed to antlerless"),
    # muzzleloader, late
    ("elk", "muzzleloader", "Late muzzleloader general — eastern WA (Master Hunters)", "Aug. 1, 2026-Jan. 20, 2027", "Elk Area 3911, Elk Area 3912", "Antlerless only; " + MH),
    ("elk", "muzzleloader", "Late muzzleloader general — eastern WA", "Oct. 31-Nov. 15", "203, 209 through 248, 250, 254 through 272, 278d, 284, 290, 373d, 379d, 381", "Any elk; must wear hunter orange and/or fluorescent hunter pink"),
    ("elk", "muzzleloader", "Late muzzleloader general — eastern WA", "Nov. 25-Dec. 8", "130 through 142*", "Any elk"),
    ("elk", "muzzleloader", "Late muzzleloader general — eastern WA (Master Hunters)", "Dec. 9-31", "127 through 142", "Antlerless only; " + MH),
    ("elk", "muzzleloader", "Late muzzleloader general — western WA", "Dec. 16-31", "407", "3 pt. min."),
    ("elk", "muzzleloader", "Late muzzleloader general — western WA", "Nov. 25-Dec. 8", "Elk Area 4601*, 501, 503, 504, 505, 652, 667", "3 pt. min. or antlerless; Elk Area 6013 closed to antlerless"),
    ("elk", "muzzleloader", "Late muzzleloader general — western WA", "Nov. 25-Dec. 15", "454, 564*d, 666, 684d, Elk Area 6014", "Any elk"),
    ("elk", "muzzleloader", "Late muzzleloader general — western WA", "Nov. 25-30", "568, 574, 578d", "3 pt. min."),
    ("elk", "muzzleloader", "Late muzzleloader general — western WA", "Nov. 25-Dec. 15", "448, 601, 618, 651, 658", "3 pt. min."),
]
BEAR_2026 = [  # 2026 pamphlet p. 68 (PDF page 66): Black Bear Management Units
    ("1 – Northeast", "105, 108, 111, 113, 117, 121, 124", "August 1-November 15", 2),
    ("2 – Columbia Basin", "127, 130, 133, 136, 139, 142, 248, 254, 260, 262, 266, 269, 272, 278, 284, 290, 371, 372, 373, 379, 381", "August 1-November 15", 2),
    ("3 – Southeast", "145, 149, 154, 162, 163, 166, 169, 172, 175, 178, 181, 186", "August 1-November 15", 2),
    ("4 – Okanogan Highlands", "101, 204", "August 1-November 15", 2),
    ("5 – Okanogan", "203, 209, 215, 218, 224, 231, 233, 239, 242, 243", "August 15-November 15", 1),
    ("6 – Central Cascades East", "244, 245, 246, 247, 249, 250, 251, 328, 329, 330, 334, 335", "August 1-November 15", 2),
    ("7 – South Cascades East", "336, 340, 342, 346, 352, 356, 360, 364, 368, 382, 388, 578", "August 1-November 15", 2),
    ("8 – North Cascades West", "418, 426, 437, 448, 450, 460", "August 1-November 15", 2),
    ("9 – South Cascades West", "466, 485, 503, 510, 513, 516, 560, 568, 572, 574, 653, 654", "August 1-November 15", 2),
    ("10 – Urban", "407, 454, 504, 564, 624, 627, 633, 652, 666, 684", "August 1-November 15", 2),
    ("11 – Mount St. Helens", "505, 520, 524, 550, 554, 556, 667", "August 1-November 15", 2),
    ("12 – Olympic Peninsula East", "603, 607, 618, 621, 636, 638", "August 1-November 15", 2),
    ("13 – Olympic Peninsula West", "601, 602, 612, 615, 642, 648, 651", "August 1-November 15", 2),
    ("14 – Willapa Hills", "501, 506, 530, 658, 660, 663, 672, 673, 681, 699", "August 15-November 15", 1),
]


def units_list(text):
    """'101 through 145, 149d, Elk Area 4601***' -> ['101 through 145', '149', 'Elk Area 4601'] (footnote markers dropped)."""
    out = []
    for u in text.split(", "):
        u = re.sub(r"(\d)(?:[adh]|\*)+$", r"\1", u.strip())
        u = re.sub(r"(\d)(?:[adh]|\*)+( through )", r"\1\2", u)
        out.append(u)
    return out


def seasons():
    S = []

    def s(sp, label, dates, year=2026, method=None, units=None, note=None, sid=P26):
        rng = seasons_ranges.parse(dates, year)
        assert rng and len(rng) == 1, (label, dates)
        d = {"species": sp, "label": label}
        if method:
            d["method"] = method
        if units:
            d["units"] = units_list(units)
        d.update({"start": rng[0]["start"], "end": rng[0]["end"], "year": year})
        if note:
            d["note"] = note
        d["sourceId"] = sid
        S.append(d)

    for sp, method, label, dates, units, note in DEER_2026 + ELK_2026:
        if units == WILDERNESS:
            s(sp, label, dates, method=method, note=note + "; " + units)
        else:
            s(sp, label, dates, method=method, units=units, note=note)
    for bbmu, units, dates, limit in BEAR_2026:
        s("bear", f"Fall black bear general season — BBMU {bbmu}", dates, units=units,
          note=f"Bag limit {limit}. Any legal hunt method; dogs and bait prohibited. GMUs 157, 410-417, 419-424, 490, 522 and 655 are closed to fall bear hunting.")
    s("lion", "Cougar general season (statewide)", "Sept. 1-March 31",
      note="Each Cougar Hunt Management Unit closes when its harvest cap is reached (closures updated weekly on Thursdays)", sid="d-cougar-2026")
    s("turkey", "Youth spring season (statewide)", "April 1-7", note="Youth only", sid="d-turkey-spring-2026")
    s("turkey", "Spring general season (statewide)", "April 15 - May 31", note="Male turkeys and turkeys with visible beards only", sid="d-turkey-spring-2026")
    s("turkey", "Fall general season", "Sept. 1 - Dec. 31", units="101 through 154, 162 through 186",
      note="Two beardless and two either-sex turkeys (statewide fall seasonal limit four)", sid="d-gamebird-2026")
    s("turkey", "Fall general season", "Sept. 1 - Dec. 31", units="382, 388, 568 through 578", note="Two either-sex turkeys", sid="d-gamebird-2026")
    s("turkey", "Fall general season", "Sept. 1 - Dec. 31", units="203 through 290", note="One either-sex turkey", sid="d-gamebird-2026")
    s("turkey", "Fall special permit hunt — Teanaway (GMU 335)", "Nov. 15-Dec. 15", units="335",
      note="50 permits; special permit only (hunt 3001)")
    s("turkey", "Youth spring season (statewide)", "April 1-7, 2027", year=2027, note="Youth only", sid="d-gamebird-2026")
    s("turkey", "Spring general season (statewide)", "April 15 - May 31", year=2027,
      note="Male turkeys and turkeys with visible beards only; county and area limits apply", sid="d-gamebird-2026")
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
