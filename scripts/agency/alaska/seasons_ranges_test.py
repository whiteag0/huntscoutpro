#!/usr/bin/env python3
"""Tests for seasons_ranges.py. Usage: python -I seasons_ranges_test.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seasons_ranges as sr  # noqa: E402


def rng(text, year):
    return [(r["start"], r["end"]) for r in sr.parse(text, year)[0]]


class ParseTest(unittest.TestCase):
    def test_single_year(self):
        self.assertEqual(rng("2026: Aug. 15-Dec. 31", 2026), [("2026-08-15", "2026-12-31")])

    def test_same_month_short_end(self):
        self.assertEqual(rng("2026: Nov. 1-30", 2026), [("2026-11-01", "2026-11-30")])

    def test_thru_crosses_new_year(self):
        self.assertEqual(rng("2026-2027: Dec. 15 thru Jan. 15", 2026), [("2026-12-15", "2027-01-15")])

    def test_two_segments_second_crosses(self):
        self.assertEqual(rng("2026-2027: Sept. 1-Nov. 15 and Dec. 15 thru Jan. 15", 2026),
                         [("2026-09-01", "2026-11-15"), ("2026-12-15", "2027-01-15")])

    def test_second_segment_in_next_year(self):
        # Unit 13A DM325 (2023 supplement prints it in the 2023 column): October, then March of the regulatory year
        self.assertEqual(rng("2023: Oct. 1-Oct. 31 and Mar. 1-Mar. 31", 2023),
                         [("2023-10-01", "2023-10-31"), ("2024-03-01", "2024-03-31")])

    def test_spring_hunt_printed_under_next_year(self):
        self.assertEqual(rng("2027: Jan. 1-June 30", 2026), [("2027-01-01", "2027-06-30")])

    def test_long_season_into_june(self):
        self.assertEqual(rng("2026-2027: Sept. 1 thru June 30", 2026), [("2026-09-01", "2027-06-30")])

    def test_feb_end(self):
        self.assertEqual(rng("2026-2027: Sept. 21 thru Feb. 28", 2026), [("2026-09-21", "2027-02-28")])

    def test_no_prefix_uses_row_year(self):
        self.assertEqual(rng("Sept. 1-Nov. 30", 2026), [("2026-09-01", "2026-11-30")])

    def test_semicolon_groups(self):
        self.assertEqual(rng("2026: Aug. 10-Sept. 20; 2027: Jan. 1-Feb. 15", 2026),
                         [("2026-08-10", "2026-09-20"), ("2027-01-01", "2027-02-15")])

    def test_month_spellings(self):
        self.assertEqual(rng("2026: July 1-Aug. 31 and Sep. 5-Sept. 9", 2026),
                         [("2026-07-01", "2026-08-31"), ("2026-09-05", "2026-09-09")])

    def test_bad_segment_raises(self):
        with self.assertRaises(sr.SeasonParseError):
            sr.parse("2026: to be announced", 2026)
        with self.assertRaises(sr.SeasonParseError):
            sr.parse("2027: Feb. 29-Mar. 5", 2026)  # 2027 is not a leap year


class RoundTripTest(unittest.TestCase):
    def check(self, text, year, kind):
        ok, k, rend = sr.round_trip(text, year)
        self.assertTrue(ok, rend)
        self.assertEqual(k, kind)

    def test_exact(self):
        self.check("2026: Aug. 15-Dec. 31", 2026, "exact")
        self.check("2026-2027: Sept. 1-Nov. 15 and Dec. 15 thru Jan. 15", 2026, "exact")
        self.check("2026: Nov. 1-30", 2026, "exact")
        self.check("2027: Jan. 1-June 30", 2026, "exact")

    def test_no_prefix(self):
        self.check("Sept. 1-Nov. 30", 2026, "no-prefix")

    def test_rollover(self):
        self.check("2023: Oct. 1-Oct. 31 and Mar. 1-Mar. 31", 2023, "rollover-beyond-prefix")

    def test_prefix_mismatch_detected(self):
        # a two-year prefix on dates that stay in one year does not round-trip
        ok, kind, _ = sr.round_trip("2026-2027: Aug. 10-Sept. 20", 2026)
        self.assertFalse(ok)
        self.assertEqual(kind, "mismatch")


if __name__ == "__main__":
    unittest.main(verbosity=1)
