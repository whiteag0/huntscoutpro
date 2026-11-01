#!/usr/bin/env python3
"""Tests for seasons_digest.py (digest table lines as pdftotext -layout prints them). Usage: python -I seasons_digest_test.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seasons_digest as sd  # noqa: E402


class RangeTest(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(sd.parse_ranges("Sep 19 - Oct 18"), [("Sep 19 - Oct 18", "2026-09-19", "2026-10-18")])
        self.assertEqual(sd.parse_ranges("Aug 01-Aug 09"), [("Aug 01-Aug 09", "2026-08-01", "2026-08-09")])
        self.assertEqual(sd.parse_ranges("Oct 31- Nov 08"), [("Oct 31- Nov 08", "2026-10-31", "2026-11-08")])
        self.assertEqual(sd.parse_ranges("Sept 12 - Sept 27"), [("Sept 12 - Sept 27", "2026-09-12", "2026-09-27")])
        self.assertEqual(sd.parse_ranges("Oct 3-4 &"), [("Oct 3-4", "2026-10-03", "2026-10-04")])

    def test_license_year(self):
        self.assertEqual(sd.parse_ranges("Dec 22 - Jan 03")[0][1:], ("2026-12-22", "2027-01-03"))
        self.assertEqual(sd.parse_ranges("Dec 5 - Feb 7")[0][1:], ("2026-12-05", "2027-02-07"))
        self.assertEqual(sd.parse_ranges("Jan 2 - Feb 7")[0][1:], ("2027-01-02", "2027-02-07"))

    def test_quota_filled_dates_ignored(self):
        # "Date Tag Quota Filled" is numeric (8/13/2025) and must not be read as a season
        line = " D6     D6 Zone - Archery and General Seasons - Buck            12%          10,000    8/13/2025     Aug 15 - Sep 6           Sep 19 - Nov 1"
        self.assertEqual([r[1:] for r in sd.parse_ranges(line)], [("2026-08-15", "2026-09-06"), ("2026-09-19", "2026-11-01")])


class HuntTest(unittest.TestCase):
    LINES = [
        "        C1 Zone General Seasons - Buck                                                                                  Sep 19 - Oct 18",
        "        C2 Zone General Seasons - Buck                                                             Seasons in the C     Sep 19 - Oct 25",
        " C                                                             31%           8,150          ♦",
        "        C3 Zone General Seasons - Buck                                                             Zones See Hunt       Sep 19 - Oct 25",
        "        C4 Zone General Seasons - Buck                                                                                  Sep 19 - Oct 4",
        " D12    Zone D12 Archery and General Seasons - Buck            14%            950           ♦        Oct 3 - Oct 25     Nov 7 - Nov 29",
        " D12 Extremely dry and hot desert deer zone. Wilderness areas severely restrict vehicle access; 4x4 recommended for entire zone.",
        "                                                                                                                              Oct 3-4 &",
        "J10     Fort Hunter Liggett Apprentice Either-sex - General Methods                    87%             30           ♦",
        "                                                                                                                              Oct 10-12",
        " 447   Fort Hunter Liggett Period 3 General Methods Bull            8           6       2      1,533      73      100       8      Dec 22 - Jan 03",
    ]

    def test_zone_split(self):
        txt, rr = sd.hunt_dates(self.LINES, "C")
        self.assertEqual(txt, "C1: Sep 19 - Oct 18; C2: Sep 19 - Oct 25; C3: Sep 19 - Oct 25; C4: Sep 19 - Oct 4")
        self.assertEqual([g["label"] for g in rr], ["Zone C1", "Zone C2", "Zone C3", "Zone C4"])

    def test_two_columns(self):
        txt, rr = sd.hunt_dates(self.LINES, "D12")
        self.assertEqual(txt, "Archery: Oct 3 - Oct 25; General: Nov 7 - Nov 29")
        self.assertEqual(rr, [{"start": "2026-10-03", "end": "2026-10-25", "label": "Archery season"},
                              {"start": "2026-11-07", "end": "2026-11-29", "label": "General season"}])

    def test_wrapped_cell(self):
        txt, rr = sd.hunt_dates(self.LINES, "J10")
        self.assertEqual(txt, "Oct 3-4 & Oct 10-12")
        self.assertEqual(rr, [{"start": "2026-10-03", "end": "2026-10-04"}, {"start": "2026-10-10", "end": "2026-10-12"}])

    def test_cross_year(self):
        self.assertEqual(sd.hunt_dates(self.LINES, "447"), ("Dec 22 - Jan 03", [{"start": "2026-12-22", "end": "2027-01-03"}]))

    def test_missing(self):
        self.assertIsNone(sd.hunt_dates(self.LINES, "999"))


if __name__ == "__main__":
    unittest.main(verbosity=1)
