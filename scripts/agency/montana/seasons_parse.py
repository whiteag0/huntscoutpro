#!/usr/bin/env python3
"""Add Montana FWP season dates and key-date tags to src/data/agency/montana/.

Usage:  python -I scripts/agency/montana/seasons_parse.py <raw_dir> <repo_root>
        <raw_dir> = the folder written by seasons_fetch.py (outside the repo).

Run it AFTER draw_parse.py and draw_meta.py (they rewrite the files this script edits). It is
idempotent: running it twice gives the same output.

What it does
1. Per-license season dates on the latest draw year rows (2026; lion 2025):
   * Deer/elk permits, Deer B / Elk B licenses and antelope licenses: the hunting-district tables of
     the 2026 Deer, Elk & Antelope regulations (pages 48-123, 136-142). Each license row lists its
     dates in the season columns (Early / Archery Only / General / Heritage Muzzleloader / Late;
     antelope: Archery / Season). The tables are ruled, so they are read cell by cell with
     pdfplumber's table finder; columns come from each table's header row. A license cell that spans
     several sub-rows (e.g. an early private-land segment plus the regular seasons, or one permit for
     two opportunities) keeps every sub-row, labelled with that sub-row's opportunity or "opportunity
     specific details" text when they differ. A multi-district license whose dates differ between
     districts gets one labelled set per district. seasons_spotcheck.py re-reads the PDFs another way.
   * Moose, bighorn sheep and mountain goat licenses: the HD tables of the 2026 Moose, Sheep, Goat &
     Bison regulations (Archery Only Season / Season columns).
   * Black bear permits 510-20 and 520-20: the "Permit Managed Opportunities" table of the 2026 Black
     Bear regulations (Spring / Archery-only / General season).
   * Limited mountain lion licenses (2025 draw): the 2025 Mountain Lion regulations. FWP prints one
     set of season dates for all LMUs (with an exception for LMU 150 and the Scapegoat portion of
     LMU 280) and states the Limited license is valid in any LMU during the archery and fall seasons
     and only in its LMU during the winter season.
   * Archery antelope 900-20 and the nonresident combination licenses (NR-BIGGAME-ELK-COMBO,
     NR-DEER-COMBO): these are not in the HD tables. FWP's "Important Dates" box (2026 DEA
     regulations p. 11) gives the 900 series dates and the "general" deer/elk season dates; the
     seasonDates text says so.
   Rows are matched by license type + license number exactly as printed. Rows with no match are
   left without seasonDates/seasonRanges and listed in <raw_dir>/seasons-parse-log.json.
   Dates: the 2026 license year runs March 1, 2026 - Feb. 28, 2027, so a printed Jan/Feb date is
   2027 and every other month is 2026.
2. draw-meta.json: keyDates get `kind` (and `residency` where FWP limits them). FWP has published no
   2027 dates, so the 2027 key dates (KEYDATES_2027) are "tentative" dates computed from standing rules
   that fix them every year: ARM 12.3.601 (application deadlines), ARM 12.3.621 (Aug. 1 purchase of
   drawn moose/sheep/goat licenses), MCA 87-2-117 (bonus points) and MCA 87-2-115 (nonresident
   preference points); each note quotes the rule. seasons[] is rebuilt from the 2026 booklets
   with method/units/huntCodes/residency; season sources are added; lastReviewed is set.
"""
import collections
import datetime
import json
import os
import re
import sys

import pdfplumber

REVIEWED = "2026-10-31"
PUB = "Montana Fish, Wildlife & Parks"
RB = "https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/"
REGS_PAGE = "https://fwp.mt.gov/hunt/regulations"
ARCHIVE_PAGE = "https://fwp.mt.gov/hunt/regulations/archive"

MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
MONTH_RE = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"
RANGE_RE = re.compile(rf"^({MONTH_RE}) ?(\d{{1,2}}) ?[-–] ?({MONTH_RE}) ?(\d{{1,2}})\*?$")

NEW_SOURCES = [
    {"id": "d-fwp-regs-lion-2025", "title": "2025 Mountain Lion Hunting Regulations",
     "url": RB + "2025/2025-lion-final-for-web.pdf", "pageUrl": ARCHIVE_PAGE, "dataYear": 2025,
     "notes": "Season dates and Limited Mountain Lion License rules for the 2025 lion drawing."},
    {"id": "d-fwp-hunt-seasons", "title": "Hunting Seasons (general reference season dates)",
     "url": "https://fwp.mt.gov/hunt/seasons", "dataYear": 2026,
     "notes": "Shows 2026 seasons only (no 2027 dates) as of 2026-10-31; FWP says to use the regulations for exact dates."},
    {"id": "d-fwp-corrections-dea-2026", "title": "Corrections to the 2026 Printed Deer, Elk, and Pronghorn Regulations",
     "url": RB + "2026/corrections-to-the-2026-printed-dea-regulations-and-legal-descriptions.pdf", "pageUrl": REGS_PAGE,
     "dataYear": 2026, "notes": "Two corrections (HD 202 general white-tailed deer archery dates; HD 535 youth opportunity); neither changes a drawn license."},
    {"id": "d-fwp-corrections-msgb-2026", "title": "Corrections to the 2026 Printed Moose, Sheep, Goat, and Bison Regulations",
     "url": RB + "2026/corrections-to-the-2026-printed-msgb-regulations.pdf", "pageUrl": REGS_PAGE,
     "dataYear": 2026, "notes": "One correction (sheep horn pickup reporting); no season-date changes."},
]

# keyDate label -> (kind, residency or None). Every label in draw-meta must be listed.
KEYDATE_TAGS = {
    "Elk permit and nonresident combination application period": ("application", None),
    "Elk B license application period": ("application", None),
    "Bonus point purchase without applying (one per species/license type)": ("points", None),
    "Nonresident preference point purchase without applying for a combination license": ("points", "nonresident"),
    "Deer permit and nonresident combination application period": ("application", None),
    "Deer B license application period": ("application", None),
    "Antelope, Antelope B and archery antelope application period": ("application", None),
    "Moose, sheep, goat and bison application period": ("application", None),
    "Black bear permit application period": ("application", None),
    "Mountain Lion License purchase deadline (2026 license)": ("other", None),
    # 2027 rule-based deadlines (KEYDATES_2027)
    "Elk permit and nonresident combination application deadline": ("application", None),
    "Elk B license application deadline": ("application", None),
    "Deer permit and nonresident combination application deadline": ("application", None),
    "Deer B license application deadline": ("application", None),
    "Antelope, Antelope B and archery antelope application deadline": ("application", None),
    "Moose, sheep, goat and bison application deadline": ("application", None),
    "Drawn moose, sheep and goat license purchase deadline": ("payment", None),
}

# 2027 key dates. FWP has not announced any 2027 dates (dates page, fee pages and booklets checked
# 2026-10-31), so every 2027 entry is "tentative": computed from a standing rule in Montana statute
# (MCA, 2025) or FWP's administrative rules (ARM, current versions) that fixes the date every year.
# Calendar: Apr. 1, 2027 = Thu; May 1 = Sat; Jun. 1 = Tue; Jul. 1 = Thu; Aug. 1 = Sun; Sep. 30 = Thu;
# Dec. 31 = Fri. None of these rules moves a date that falls on a weekend or holiday.
# Rules checked and NOT used: black bear permit (Apr. 1) and limited lion license deadlines are not in
# ARM 12.3.6 / 12.9 or MCA Title 87 ch. 2; drawing-result dates are not fixed by any rule.
NOT_ANNOUNCED = "; FWP hasn't announced the 2027 dates yet."
ARM601 = "d-arm-12-3-601"
R601_12 = ("Set by ARM 12.3.601(1) and (2) (\"The application deadline for B-10 and B-11 license drawings is April 1.\" "
           "\"The application deadline for elk and deer permit drawings is April 1.\")" + NOT_ANNOUNCED)
R601_3 = "Set by ARM 12.3.601(3) (\"The application deadline for moose, sheep, goat, and bison drawings is May 1.\")" + NOT_ANNOUNCED
R601_4 = ("Set by ARM 12.3.601(4) (\"The application deadline for elk B, deer B, antelope, and antelope B license drawings is "
          "June 1.\")" + NOT_ANNOUNCED)
R621 = ("Set by ARM 12.3.621(1) (\"Applicants who are successful in drawing a moose, sheep, or goat license must finalize their "
        "purchase on or before August 1 of the current license year, except licenses that have an unlimited quota.\")" + NOT_ANNOUNCED)
BP_LABEL = "Bonus point purchase without applying (one per species/license type)"
PP_LABEL = "Nonresident preference point purchase without applying for a combination license"
BP_2027 = {"label": BP_LABEL, "start": "2027-07-01", "end": "2027-09-30", "cycle": 2027, "status": "tentative",
           "note": "Set by MCA 87-2-117(2)(b) (\"An applicant not applying for a license, tag, or permit may purchase a bonus point "
                   "only between July 1 and September 30 in the current license year.\")" + NOT_ANNOUNCED,
           "sourceId": "d-mca-87-2-117"}
PP_2027 = {"label": PP_LABEL, "start": "2027-07-01", "end": "2027-12-31", "cycle": 2027, "status": "tentative",
           "note": "Set by MCA 87-2-115(3)(b) (\"An applicant not applying for a Class B-10 or Class B-11 license may purchase a "
                   "preference point only between July 1 and December 31 of that license year.\")" + NOT_ANNOUNCED,
           "sourceId": "d-mca-87-2-115"}


def _d(label, date, note, src=ARM601):
    return {"label": label, "date": date, "cycle": 2027, "status": "tentative", "note": note, "sourceId": src}


_DEER = [_d("Deer permit and nonresident combination application deadline", "2027-04-01", R601_12),
         _d("Deer B license application deadline", "2027-06-01", R601_4), BP_2027, PP_2027]
_MSG = [_d("Moose, sheep, goat and bison application deadline", "2027-05-01", R601_3),
        _d("Drawn moose, sheep and goat license purchase deadline", "2027-08-01", R621, "d-arm-12-3-621"), BP_2027]
KEYDATES_2027 = {
    "elk": [_d("Elk permit and nonresident combination application deadline", "2027-04-01", R601_12),
            _d("Elk B license application deadline", "2027-06-01", R601_4), BP_2027, PP_2027],
    "mule-deer": _DEER,
    "whitetail": _DEER,
    "pronghorn": [_d("Antelope, Antelope B and archery antelope application deadline", "2027-06-01", R601_4), BP_2027],
    "moose": _MSG, "sheep": _MSG, "goat": _MSG,
}
RULE_SOURCES = [
    {"id": "d-arm-12-3-601", "title": "ARM 12.3.601 Application for Drawings",
     "publisher": "Montana Fish, Wildlife & Parks (Administrative Rules of Montana, Montana Secretary of State)",
     "url": "https://rules.mt.gov/browse/collections/aec52c46-128e-4279-9068-8af5d5432d74/policies/f4a4adc3-a08c-4e9f-b00d-feae552356b7",
     "notes": "Current version AMD 2025-297, effective 2025-12-06. Fixes the drawing application deadlines every year: "
              "B-10/B-11 combination licenses and deer/elk permits April 1; moose, sheep, goat and bison May 1; "
              "elk B, deer B, antelope and antelope B June 1."},
    {"id": "d-arm-12-3-621", "title": "ARM 12.3.621 Moose, Sheep, and Goat - Seven-Year Wait Requirement",
     "publisher": "Montana Fish, Wildlife & Parks (Administrative Rules of Montana, Montana Secretary of State)",
     "url": "https://rules.mt.gov/browse/collections/aec52c46-128e-4279-9068-8af5d5432d74/policies/b1a0a90a-44c0-412d-bf28-3a1cc9ef0610",
     "notes": "Current version AMD 2025-297, effective 2025-12-06. Drawn moose, sheep and goat licenses must be purchased "
              "on or before August 1 of the license year (unlimited-quota licenses excepted)."},
    {"id": "d-mca-87-2-117", "title": "MCA 87-2-117. License bonus point system",
     "publisher": "Montana Legislature (Montana Code Annotated 2025)",
     "url": "https://mca.legmt.gov/bills/mca/title_0870/chapter_0020/part_0010/section_0170/0870-0020-0010-0170.html",
     "notes": "(2)(b): a bonus point bought without applying may be purchased only between July 1 and September 30 of the license year."},
    {"id": "d-mca-87-2-115", "title": "MCA 87-2-115. Nonresident elk and deer license preference point system",
     "publisher": "Montana Legislature (Montana Code Annotated 2025)",
     "url": "https://mca.legmt.gov/bills/mca/title_0870/chapter_0020/part_0010/section_0150/0870-0020-0010-0150.html",
     "notes": "(3)(b): a preference point bought without applying for a B-10/B-11 license may be purchased only between "
              "July 1 and December 31 of the license year."},
]
# 2026-cycle date FWP prints that a hunter still has to act on (lion is over the counter in 2026).
EXTRA_2026 = {"lion": [{"label": "Mountain Lion License purchase deadline (2026 license)", "kind": "other", "date": "2027-02-28",
                        "cycle": 2026, "status": "confirmed",
                        "note": "FWP: \"Even though the 2026 mountain lion season extends into the 2027 license year, the deadline to purchase 2026 licenses is February 28, 2027.\"",
                        "sourceId": "d-fwp-regs-lion-2026"}],
              # The B-11 deer combination covers white-tailed deer too; draw_meta.py only lists this on elk/mule deer.
              "whitetail": [{"label": PP_LABEL, "start": "2026-07-01", "end": "2026-12-31", "cycle": 2026, "status": "confirmed",
                             "sourceId": "d-fwp-regs-dea-2026",
                             "note": "$100; applicants who applied for a combination license could only buy it at application."}]}
# 2026 notes: point to the statute that sets the same window every year (the 2027 entry).
NOTE_2026 = {BP_LABEL: "MCA 87-2-117(2)(b) sets the same July 1 - Sept. 30 window every license year (see the 2027 entry).",
             PP_LABEL: "MCA 87-2-115(3)(b) sets the same July 1 - Dec. 31 window every license year (see the 2027 entry)."}

D = "d-fwp-regs-dea-2026"
M = "d-fwp-regs-msgb-2026"
GEN = "FWP 'general' dates (2026 regulations, Important Dates); check hunting-district regulations for exceptions."
# draw-meta seasons[]: 2026 only. FWP set the 2026 and 2027 regulations together, but its booklets and
# Hunting Seasons page give dates for the 2026 license year only (valid Mar. 1, 2026 - Feb. 28, 2027).
SEASONS = [
    # Deer & elk (DEA p. 11 Important Dates)
    *[dict(species=sp, label="Archery Only Season", method="archery", start="2026-09-05", end="2026-10-18", note=GEN, sourceId=D)
      for sp in ("elk", "mule-deer", "whitetail")],
    *[dict(species=sp, label="Youth two-day deer hunt", start="2026-10-15", end="2026-10-16",
           note="Youth and apprentice hunters 10-15 (deer only).", sourceId=D) for sp in ("mule-deer", "whitetail")],
    *[dict(species=sp, label="General season", start="2026-10-24", end="2026-11-29", note=GEN, sourceId=D)
      for sp in ("elk", "mule-deer", "whitetail")],
    *[dict(species=sp, label="Heritage Muzzleloader Season", method="muzzleloader", start="2026-12-12", end="2026-12-20",
           note="Only in hunting districts and for licenses whose table lists Heritage Muzzleloader Season dates.", sourceId=D)
      for sp in ("elk", "mule-deer", "whitetail")],
    *[dict(species=sp, label="Backcountry - archery", method="archery", units=["150", "280"], start="2026-09-05", end="2026-09-14",
           note="HD 316 has no Archery Only Season.", sourceId=D) for sp in ("elk", "mule-deer", "whitetail")],
    *[dict(species=sp, label="Backcountry - general", units=["150", "280", "316"], start="2026-09-15", end="2026-11-29", sourceId=D)
      for sp in ("elk", "mule-deer", "whitetail")],
    # Antelope (DEA p. 11)
    dict(species="pronghorn", label="900 series archery", method="archery", huntCodes=["900-20"], start="2026-08-15", end="2026-11-08",
         note="900-20 is valid in any hunting district beginning with 4, 5, 6 or 7.", sourceId=D),
    dict(species="pronghorn", label="Archery Only Season", method="archery", start="2026-09-05", end="2026-10-09", note=GEN, sourceId=D),
    dict(species="pronghorn", label="General season", start="2026-10-10", end="2026-11-08", note=GEN, sourceId=D),
    # Moose, sheep, goat (MSGB p. 9)
    *[dict(species=sp, label="Archery Only Season", method="archery", start="2026-09-05", end="2026-09-14",
           note="FWP 'general' dates (2026 MSGB regulations); check hunting-district regulations for exceptions.", sourceId=M)
      for sp in ("moose", "sheep", "goat")],
    *[dict(species=sp, label="General season", start="2026-09-15", end="2026-11-29",
           note="FWP 'general' dates (2026 MSGB regulations); check hunting-district regulations for exceptions.", sourceId=M)
      for sp in ("moose", "sheep", "goat")],
    # Black bear (2026 Black Bear regulations, BMU tables)
    dict(species="bear", label="Spring season", start="2026-04-15", end="2026-06-15",
         note="Apr. 15-Jun. 15 in the BMU tables; BMUs 300, 301, 319 and 580 may close after May 31, and quota BMUs close when the quota is reached.",
         sourceId="d-fwp-regs-bear-2026"),
    dict(species="bear", label="Archery-only season", method="archery", start="2026-09-05", end="2026-09-14", sourceId="d-fwp-regs-bear-2026"),
    dict(species="bear", label="General (fall) season", start="2026-09-15", end="2026-11-29", sourceId="d-fwp-regs-bear-2026"),
    # Mountain lion (2026 Mountain Lion regulations)
    dict(species="lion", label="Archery Only Season without dogs", method="archery", start="2026-09-05", end="2026-10-18",
         note="All LMUs except 150 and the Scapegoat Wilderness portion of 280.", sourceId="d-fwp-regs-lion-2026"),
    dict(species="lion", label="Fall season without dogs", start="2026-10-24", end="2026-11-29",
         note="All LMUs except 150 and the Scapegoat Wilderness portion of 280.", sourceId="d-fwp-regs-lion-2026"),
    dict(species="lion", label="Winter season", start="2026-12-01", end="2027-05-25",
         note="All LMUs except 150 and the Scapegoat Wilderness portion of 280; closes by LMU when quotas are reached, no later than May 25. Hounds prohibited in occupied grizzly bear habitat after April 14.",
         sourceId="d-fwp-regs-lion-2026"),
    dict(species="lion", label="LMU 150 / Scapegoat portion of 280 - archery", method="archery", units=["150", "280"],
         start="2026-09-05", end="2026-09-14", sourceId="d-fwp-regs-lion-2026"),
    dict(species="lion", label="LMU 150 / Scapegoat portion of 280 - winter", units=["150", "280"],
         start="2026-09-15", end="2027-05-25", sourceId="d-fwp-regs-lion-2026"),
    # Turkey (2026 Upland Game Bird regulations, General Turkey License)
    dict(species="turkey", label="Spring season (General Turkey License)", start="2026-04-15", end="2026-05-31",
         note="Residents, and nonresidents on private land not in a hunting access program. Male turkey; shotgun/archery only.",
         sourceId="d-fwp-regs-upgbrd-2026"),
    dict(species="turkey", label="Spring season, nonresidents on public/access-program land", residency="nonresident",
         start="2026-04-25", end="2026-05-31", note="Male turkey; shotgun/archery only.", sourceId="d-fwp-regs-upgbrd-2026"),
    dict(species="turkey", label="Fall season (General Turkey License)", start="2026-09-01", end="2027-01-01",
         note="Residents, and nonresidents on private land not in a hunting access program. Either-sex; not valid in Region 4.",
         sourceId="d-fwp-regs-upgbrd-2026"),
    dict(species="turkey", label="Fall season, nonresidents on public/access-program land", residency="nonresident",
         start="2026-09-11", end="2027-01-01", note="Either-sex; not valid in Region 4.", sourceId="d-fwp-regs-upgbrd-2026"),
]


# ---------------------------------------------------------------- helpers
def iso_2026_license_year(mon_txt, day):
    m = MON[mon_txt[:3].lower()]
    y = 2027 if m <= 2 else 2026
    return datetime.date(y, m, int(day)).isoformat()


def parse_range(txt, year_fn=iso_2026_license_year):
    m = RANGE_RE.match(txt.strip())
    if not m:
        return None
    return year_fn(m.group(1), m.group(2)), year_fn(m.group(3), m.group(4))


def text_pages(txt_path):
    with open(txt_path, encoding="utf-8", errors="replace") as f:
        return f.read().split("\f")


def candidate_pages(pages):
    return [i for i, p in enumerate(pages)
            if re.search(r"\b\d{3}-\d{2}\b", p) and re.search(rf"{MONTH_RE} ?\d{{1,2}} ?-", p)]


def colkind(text):
    u = text.upper()
    if "SPECIFIC" in u:
        return "details"
    if "LICENSE" in u and "QUOTA" not in u:
        return "license"
    if "EARLY" in u:
        return "s:Early Season"
    if "HERITAGE" in u or "MUZZLELOADER" in u:
        return "s:Heritage Muzzleloader Season"
    if "LATE" in u:
        return "s:Late Season"
    if "ARCHERY" in u:
        return "s:" + ("Archery Only Season" if "ONLY" in u else "Archery Season")
    if "GENERAL" in u:
        return "s:General Season"
    if "SEASON" in u and "DATES" in u:
        return "s:Season"
    if "APPLY" in u:
        return "apply"
    if "RANGE" in u:
        return "range"
    if "QUOTA" in u:
        return "quota"
    if "OPPORTUNITY" in u:
        return "opportunity"
    return "other"


def clean(cell):
    return None if cell is None else re.sub(r"\s+", " ", cell).strip()


def extract_tables(pdf_path, txt_path, sections=None):
    """Every license row in the HD tables.

    The tables are ruled, so pdfplumber's find_tables() returns them cell by cell. A merged cell (a
    license printed once beside several sub-rows) comes back as text in its first row and None below,
    so a None license/opportunity/details cell continues the cell above. Returns dicts with page, hd,
    section, prefix, code, star and subrows [{opp, details, cells{season column: printed text}}]."""
    pages = text_pages(txt_path)
    sec_by_page, cur = {}, None
    for i, p in enumerate(pages):
        for title, name in (sections or []):
            if title in p:
                cur = name
        sec_by_page[i] = cur
    found = collections.OrderedDict()
    hd = None
    with pdfplumber.open(pdf_path) as pdf:
        for pi in candidate_pages(pages):
            page = pdf.pages[pi].dedupe_chars()
            for table in page.find_tables():
                rows = table.extract()
                if not rows:
                    continue
                kinds = [colkind(clean(c) or "") for c in rows[0]]
                if "license" not in kinds or not any(k.startswith("s:") for k in kinds):
                    continue
                ki = {k: i for i, k in enumerate(kinds)}
                lic = opp = det = None
                for row in rows[1:]:
                    cells = [clean(c) for c in row]
                    first = cells[ki["license"]]
                    filled = [c for c in cells if c is not None]
                    if len(filled) == 1:
                        # heading row (HD name, Region, DEER, ELK, NOTE ...)
                        hm = re.match(r"^(?:HD )?(\d{3})\s*[-–]", filled[0])
                        if hm:
                            hd = hm.group(1)
                        lic = opp = det = None
                        continue
                    if first is not None:
                        lic = first
                    if "opportunity" in ki and cells[ki["opportunity"]] is not None:
                        opp = cells[ki["opportunity"]]
                    elif first is not None:
                        opp = None
                    if "details" in ki and cells[ki["details"]] is not None:
                        det = cells[ki["details"]]
                    elif first is not None:
                        det = None
                    # MSGB tables have a Hunting District column; its number is the HD
                    if kinds[0] != "license" and cells[0]:
                        m0 = re.match(r"^(\d{3})\b", cells[0])
                        if m0:
                            hd = m0.group(1)
                    m = re.search(r"(\d{3}-\d{2})(\*{0,2})$", lic or "")
                    if not m:
                        continue
                    seas = collections.OrderedDict()
                    for i, k in enumerate(kinds):
                        if k.startswith("s:"):
                            seas[k[2:]] = cells[i]
                    if all(v in (None, "", "-") for v in seas.values()):
                        continue
                    key = (pi, table.bbox, lic, hd)
                    prefix = lic[:m.start()].strip()
                    e = found.setdefault(key, {"page": pi + 1, "hd": hd, "section": sec_by_page.get(pi), "prefix": prefix,
                                                "code": m.group(1), "star": m.group(2), "subrows": []})
                    sub = {"opp": opp or "", "details": det or "", "cells": seas}
                    if sub not in e["subrows"]:  # the same license repeated with identical text adds nothing
                        e["subrows"].append(sub)
    return list(found.values())


def subrow_ranges(sub, show_opp, show_det):
    """(printed text, ranges) for one sub-row of a license."""
    parts, ranges = [], []
    opp = sub["opp"] if show_opp else ""
    det = sub["details"] if show_det and sub["details"] not in ("", "-") else ""
    for col, val in sub["cells"].items():
        if not val or val == "-":
            continue
        r = parse_range(val)
        if not r:
            raise ValueError(f"unparsed date cell {val!r}")
        parts.append(f"{col}: {val}")
        lab = f"{opp} - {col}" if opp else col
        if det:
            lab = f"{lab} ({det})"
        ranges.append({"start": r[0], "end": r[1], "label": lab})
    txt = "; ".join(parts)
    if opp and parts:
        txt = f"{opp}: {txt}"
    if det and parts:
        txt += f" ({det})"
    return txt, ranges


def entry_season(entries):
    """Combine every listing of one license (several HDs) into seasonDates text + ranges."""
    per = []
    for e in entries:
        subs = e["subrows"]
        show_opp = len({s["opp"] for s in subs}) > 1
        show_det = len({s["details"] for s in subs}) > 1
        texts, ranges = [], []
        for s in subs:
            t, r = subrow_ranges(s, show_opp, show_det)
            if t:
                texts.append(t)
                ranges.extend(r)
        per.append((e, " | ".join(texts), ranges))
    per = [p for p in per if p[2]]
    if not per:
        return None
    distinct = collections.OrderedDict()
    for e, t, r in per:
        distinct.setdefault(t, (r, []))[1].append(e)
    if len(distinct) == 1:
        (t, (r, es)), = distinct.items()
        return t, r, sorted({e["page"] for e in es})
    texts, ranges = [], []
    for t, (r, es) in distinct.items():
        hds = sorted({e["hd"] for e in es if e["hd"]})
        tag = "HD " + ", ".join(hds) if hds else "p. " + ", ".join(str(e["page"]) for e in es)
        texts.append(f"{tag}: {t}")
        for g in r:
            ranges.append({**g, "label": f"{tag}: {g['label']}"})
    pages = sorted({e["page"] for _, (_, es) in distinct.items() for e in es})
    return " || ".join(texts), ranges, pages


def bear_permits(txt_path):
    """Permit Managed Opportunities rows in the 2026 Black Bear regulations.

    That page's text is rotated, so it is read from the pdftotext -layout text: each date cell is
    assigned to the header word (Spring / Archery-only / General) printed nearest above its column."""
    pages = text_pages(txt_path)
    out = {}
    for pi, p in enumerate(pages):
        if "Permit Managed Opportunities" not in p:
            continue
        lines = p.splitlines()
        hdr_pos = None
        for li, line in enumerate(lines):
            if "Spring" in line and "Archery-only" in line and "General" in line and "Permit" in line:
                hdr_pos = {name: line.index(name) + len(name) / 2 for name in ("Spring", "Archery-only", "General")}
            m = re.match(r"^\s*(5[12]0)\s+(5[12]0-20)\s", line)
            if not (m and hdr_pos):
                continue
            cells = [(mm.start() + (mm.end() - mm.start()) / 2, mm.group(0))
                     for mm in re.finditer(rf"{MONTH_RE} \d{{1,2}}-{MONTH_RE} \d{{1,2}}|(?<=\s)-(?=\s)", line)]
            got = collections.OrderedDict()
            for name, label in (("Spring", "Spring Season"), ("Archery-only", "Archery-only Season"), ("General", "General Season")):
                best = min(cells, key=lambda c: abs(c[0] - hdr_pos[name]))
                if abs(best[0] - hdr_pos[name]) > 8:
                    raise ValueError(f"bear {m.group(2)}: no cell under {name}")
                got[label] = best[1]
            out[m.group(2)] = {"page": pi + 1, "cells": got}
    return out


def lion_2025(txt_path):
    """Limited Mountain Lion License numbers by LMU and the season-date lines (2025 regulations)."""
    pages = text_pages(txt_path)
    codes, dates_main, dates_150 = {}, None, None
    for pi, p in enumerate(pages):
        if "Limited Mountain" not in p or "Season Dates for All LMUs" not in p:
            continue
        for line in p.splitlines():
            m = re.match(r"^\s*(\d{3})\*?\s+(\d{3}-\d{2})\**\s+\d+\s", line)
            if m:
                codes[m.group(2)] = {"lmu": m.group(1), "page": pi + 1}
        flat = re.sub(r"\s+", " ", p)
        m = re.search(r"Season Dates for All LMUs except 150 and Scapegoat Wilderness Portion of 280\*: (Archery Season: .*? 2026\.)", flat)
        if m:
            dates_main = m.group(1)
        m = re.search(r"\* Season dates for LMU 150 and portion of LMU 280: (Archery Season: .*? 2026\.)", flat)
        if m:
            dates_150 = m.group(1)
    return codes, dates_main, dates_150


def lion_ranges(text):
    """'Archery Season: Sept. 06 - Oct. 19, Fall Season Without Dogs: Oct. 25 - Nov. 30, Winter Season: Dec. 1 - April 14 2026.'"""
    out = []
    for lab, a, b in re.findall(rf"([A-Z][A-Za-z ]+?): ({MONTH_RE} \d{{1,2}}) - ({MONTH_RE} \d{{1,2}})", text):
        ma, da = a.split()
        mb, db = b.split()
        y1 = 2025
        y2 = 2026 if MON[mb[:3].lower()] < MON[ma[:3].lower()] else 2025
        out.append({"start": datetime.date(y1, MON[ma[:3].lower()], int(da)).isoformat(),
                    "end": datetime.date(y2, MON[mb[:3].lower()], int(db)).isoformat(), "label": lab.strip()})
    return out


# ---------------------------------------------------------------- main
def dump_rows(path, rows):
    with open(path, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n")


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    raw, repo = sys.argv[1], sys.argv[2]
    base = os.path.join(repo, "src/data/agency/montana")
    j = lambda n: os.path.join(raw, n)

    dea = extract_tables(j("dea-2026.pdf"), j("dea-2026.txt"))
    msgb = extract_tables(j("msgb-2026.pdf"), j("msgb-2026.txt"),
                          sections=[("Moose HD Regulations", "moose"), ("Bighorn Sheep HD Regulations", "sheep"),
                                    ("Mountain Goat HD Regulations", "goat"), ("Bison Specific Regulations", "bison")])
    bear = bear_permits(j("bear-2026.txt"))
    lion_codes, lion_main, lion_150 = lion_2025(j("lion-2025.txt"))
    if not (lion_main and lion_150):
        sys.exit("lion 2025 season lines not found")

    index = collections.defaultdict(list)
    for e in dea:
        index[("dea", e["prefix"], e["code"])].append(e)
    for e in msgb:
        index[(e["section"], e["code"])].append(e)

    PREFIX = {"Elk B license": "Elk B License:", "Elk permit": "Elk Permit:", "Deer B license": "Deer B License:",
              "Deer permit": "Deer Permit:", "Antelope license": "Antelope License:", "Antelope B license": "Antelope B License:",
              "Archery-only antelope license": "Antelope License:"}
    log = {"matched": collections.Counter(), "total": collections.Counter(), "unmatched": collections.defaultdict(list)}
    for f in sorted(os.listdir(os.path.join(base, "draw"))):
        sp = f[:-5]
        path = os.path.join(base, "draw", f)
        with open(path) as fh:
            rows = json.load(fh)
        latest = max(r["year"] for r in rows)
        for r in rows:
            for k in ("seasonDates", "seasonRanges", "seasonSourceId"):
                r.pop(k, None)
            if r["year"] != latest:
                continue
            log["total"][sp] += 1
            m = re.match(r"^(.*?) (\d{3}-\d{2})\b", r["description"])
            res = None
            if r["huntCode"] in ("NR-BIGGAME-ELK-COMBO", "NR-DEER-COMBO"):
                what = "General Elk and General Deer Licenses" if "ELK" in r["huntCode"] else "General Deer License"
                res = (f"Valid with the {what} during FWP's 'general' deer/elk seasons (2026 regulations, Important Dates): "
                       "archery Sep. 5-Oct. 18; general Oct. 24-Nov. 29 (backcountry HDs 150, 280, 316 differ); "
                       "check each hunting district for its dates.",
                       [{"start": "2026-09-05", "end": "2026-10-18", "label": "Archery Only Season (general dates)"},
                        {"start": "2026-10-24", "end": "2026-11-29", "label": "General Season (general dates)"}], D)
            elif r["huntCode"] == "900-20" and sp == "pronghorn":
                res = ("900 series: Aug. 15-Nov. 8 (2026 regulations, Important Dates; archery equipment only; "
                       "valid in any hunting district beginning with 4, 5, 6 or 7).",
                       [{"start": "2026-08-15", "end": "2026-11-08", "label": "900 series (archery)"}], D)
            elif sp == "bear" and r["huntCode"] in bear:
                b = bear[r["huntCode"]]
                parts, rngs = [], []
                for lab, val in b["cells"].items():
                    if val == "-":
                        continue
                    a, z = parse_range(val)
                    parts.append(f"{lab}: {val}")
                    rngs.append({"start": a, "end": z, "label": lab})
                res = ("; ".join(parts), rngs, "d-fwp-regs-bear-2026")
            elif sp == "lion" and r["huntCode"] in lion_codes:
                lmu = lion_codes[r["huntCode"]]["lmu"]
                main_r = lion_ranges(lion_main)
                rngs = []
                for g in main_r:
                    where = f"LMU {lmu} only" if g["label"].startswith("Winter") else "any valid LMU"
                    rngs.append({**g, "label": f"{g['label']} ({where})"})
                txt = (f"{lion_main} Limited license valid in any valid LMU during the archery and fall seasons and only in LMU {lmu} "
                       "during the winter season.")
                if lmu in ("150", "280"):
                    for g in lion_ranges(lion_150):
                        rngs.append({**g, "label": f"LMU {lmu} Scapegoat portion: {g['label']}"})
                    txt += f" LMU 150 and portion of LMU 280: {lion_150}"
                res = (txt, rngs, "d-fwp-regs-lion-2025")
            elif sp in ("moose", "sheep", "goat"):
                es = index.get((sp, r["huntCode"]))
                if es:
                    s = entry_season(es)
                    if s:
                        res = (s[0], s[1], M)
            elif m and m.group(1) in PREFIX and m.group(2) == r["huntCode"]:
                es = index.get(("dea", PREFIX[m.group(1)], r["huntCode"]))
                if es:
                    s = entry_season(es)
                    if s:
                        res = (s[0], s[1], D)
            if res:
                r["seasonDates"], r["seasonRanges"], r["seasonSourceId"] = res
                log["matched"][sp] += 1
            else:
                log["unmatched"][sp].append(f"{r['huntCode']} {r['description']}")
        dump_rows(path, rows)

    # ---------------- draw-meta
    mpath = os.path.join(base, "draw-meta.json")
    with open(mpath) as fh:
        meta = json.load(fh)
    have = {s["id"] for s in meta["sources"]}
    for s in NEW_SOURCES + RULE_SOURCES:
        if s["id"] not in have:
            meta["sources"].append({"publisher": PUB, **s, "retrieved": REVIEWED})
    for s in meta["sources"]:
        if s["id"] == "d-fwp-dates-2026":
            s["notes"] = "Shows 2026 application windows; no 2027 dates posted as of 2026-10-31 (re-checked 2026-10-31)."
        if s["id"] == "d-fwp-bp-faq":
            s["notes"] = "Undated FAQ; states the point-only purchase window (July 1 - Sept. 30) as applying in any year you don't apply."
    for sp in meta["species"]:
        kd = [d for d in sp["keyDates"] if d["cycle"] != 2027 and d["label"] not in {x["label"] for x in EXTRA_2026.get(sp["species"], [])}]
        kd += EXTRA_2026.get(sp["species"], [])
        kd += KEYDATES_2027.get(sp["species"], [])
        for d in kd:
            if d["label"] not in KEYDATE_TAGS:
                sys.exit(f"untagged key date: {d['label']}")
            kind, resd = KEYDATE_TAGS[d["label"]]
            d["kind"] = kind
            if resd:
                d["residency"] = resd
            else:
                d.pop("residency", None)
            if d["cycle"] == 2026 and d["label"] in NOTE_2026:
                base_note = re.sub(r" (2027 dates not yet published by Montana FWP as of 2026-10-31\.|FWP's Bonus Points FAQ .*|MCA 87-2-11[57].*)$",
                                   "", d.get("note", ""))
                d["note"] = (base_note + " " + NOTE_2026[d["label"]]).strip()
        # label, kind, residency first; the other keys keep draw_meta.py's order
        sp["keyDates"] = [{"label": d["label"], "kind": d["kind"], **({"residency": d["residency"]} if "residency" in d else {}),
                           **{k: v for k, v in d.items() if k not in ("label", "kind", "residency")}} for d in kd]
        if any(d["label"] == BP_LABEL for d in sp["keyDates"]) and "d-fwp-bp-faq" not in sp["sourceIds"]:
            sp["sourceIds"].append("d-fwp-bp-faq")
        for d in sp["keyDates"]:
            if d["sourceId"] not in sp["sourceIds"]:
                sp["sourceIds"].append(d["sourceId"])
    seasons = []
    for s in SEASONS:
        out = {"species": s["species"], "label": s["label"]}
        for k in ("method", "units", "huntCodes", "residency"):
            if k in s:
                out[k] = s[k]
        out.update({"start": s["start"], "end": s["end"], "year": 2026})
        if s.get("note"):
            out["note"] = s["note"]
        out["sourceId"] = s["sourceId"]
        seasons.append(out)
    meta["seasons"] = seasons
    meta["lastReviewed"] = REVIEWED
    with open(mpath, "w") as fh:
        json.dump(meta, fh, indent=1)  # same layout as draw_meta.py

    with open(j("seasons-entries.json"), "w") as fh:
        json.dump({"dea": dea, "msgb": msgb}, fh, indent=0)
    with open(j("seasons-parse-log.json"), "w") as fh:
        json.dump({"matched": log["matched"], "total": log["total"], "unmatched": log["unmatched"],
                   "dea_entries": len(dea), "msgb_entries": len(msgb), "bear": bear,
                   "lion_codes": lion_codes, "lion_main": lion_main, "lion_150": lion_150}, fh, indent=1)
    for sp in sorted(log["total"]):
        print(f"{sp}: {log['matched'][sp]}/{log['total'][sp]} latest-year rows with season dates")
        for u in log["unmatched"][sp]:
            print("   unmatched:", u)


if __name__ == "__main__":
    main()
