"""Unit tests for seasons_ranges.parse / round_trips.  Usage: python -I seasons_test.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seasons_ranges import norm_text, parse, render, round_trips  # noqa: E402


def r(*pairs):
    return [{"start": a, "end": b} for a, b in pairs]


class ParseTest(unittest.TestCase):
    def check(self, text, year, want):
        got = parse(text, year)
        self.assertEqual(got, want, text)
        if want:
            self.assertTrue(round_trips(text, got, year), text)

    def test_same_month(self):
        self.check("Oct. 15-25", 2026, r(("2026-10-15", "2026-10-25")))
        self.check("Nov. 1-30", 2024, r(("2024-11-01", "2024-11-30")))
        self.check("Sept. 1–15", 2026, r(("2026-09-01", "2026-09-15")))  # en dash
        self.check("Oct.1-7", 2023, r(("2023-10-01", "2023-10-07")))
        self.check("Nov. 20 - 24", 2025, r(("2025-11-20", "2025-11-24")))

    def test_two_months_and_spacing(self):
        self.check("Oct. 29-Nov. 9", 2026, r(("2026-10-29", "2026-11-09")))
        self.check("Oct 1-Nov 30", 2022, r(("2022-10-01", "2022-11-30")))
        self.check("Sept. 15 - Oct. 10", 2026, r(("2026-09-15", "2026-10-10")))
        self.check("Oct 17 – Nov 3", 2021, r(("2021-10-17", "2021-11-03")))
        self.check("Nov. 15-Dec.15", 2026, r(("2026-11-15", "2026-12-15")))
        self.check("Sept.1- Oct 7", 2021, r(("2021-09-01", "2021-10-07")))

    def test_multi_segment(self):
        self.check("Oct. 1-7 and Dec. 16-31", 2026, r(("2026-10-01", "2026-10-07"), ("2026-12-16", "2026-12-31")))
        self.check("Sept. 1-15 and Nov. 20-Dec. 8, and Nov. 25-Dec. 15", 2022,
                   r(("2022-09-01", "2022-09-15"), ("2022-11-20", "2022-12-08"), ("2022-11-25", "2022-12-15")))
        self.check("Sept. 1-15, 2021; Nov. 20-Dec. 8, 2021; and Jan. 1-15, 2022", 2021,
                   r(("2021-09-01", "2021-09-15"), ("2021-11-20", "2021-12-08"), ("2022-01-01", "2022-01-15")))

    def test_license_year_rollover(self):
        # WDFW license year runs April 1 - March 31: Jan-Mar dates belong to the next calendar year
        self.check("Aug. 1, 2021-Mar. 31, 2022", 2021, r(("2021-08-01", "2022-03-31")))
        self.check("Aug. 1-March 31, 2027", 2026, r(("2026-08-01", "2027-03-31")))
        self.check("Aug. 1-Mar. 31", 2020, r(("2020-08-01", "2021-03-31")))
        self.check("Dec. 15, 2026-Feb, 8, 2027", 2026, r(("2026-12-15", "2027-02-08")))  # pamphlet typo "Feb,"
        self.check("Nov. 30-Jan. 19", 2025, r(("2025-11-30", "2026-01-19")))
        self.check("Jan. 1-20", 2025, r(("2026-01-01", "2026-01-20")))
        self.check("Jan. 1-20, 2027", 2026, r(("2027-01-01", "2027-01-20")))
        self.check("Feb. 11-28", 2025, r(("2026-02-11", "2026-02-28")))

    def test_stray_period_after_day(self):
        self.check("Aug 1.-Dec. 31", 2021, r(("2021-08-01", "2021-12-31")))
        self.check("Sept. 1.-Dec. 31", 2024, r(("2024-09-01", "2024-12-31")))

    def test_full_month_names_and_to(self):
        self.check("April 15 - June 15", 2021, r(("2021-04-15", "2021-06-15")))
        self.check("May 5 to June 30", 2020, r(("2020-05-05", "2020-06-30")))

    def test_rejects(self):
        for text, year in [("", 2026), (None, 2026), ("TBD", 2026), ("Oct. 32-35", 2026), ("Feb. 30-31", 2026),
                           ("Nov. 20-Oct. 3", 2026),          # end before start
                           ("Jan. 1-20, 2026", 2026),          # printed year disagrees with the license year
                           ("Aug. 1, 2025-Mar. 31, 2026", 2026),
                           ("Oct. 1-7 or Dec. 16-31", 2026),   # unknown connective
                           ("See pamphlet", 2026)]:
            self.assertIsNone(parse(text, year), text)

    def test_round_trip_detects_mismatch(self):
        self.assertFalse(round_trips("Oct. 15-25", r(("2026-10-15", "2026-10-24")), 2026))
        self.assertFalse(round_trips("Oct. 15-25", r(("2027-10-15", "2027-10-25")), 2026))  # outside license year
        self.assertEqual(norm_text("Sept. 1-15 and Nov. 20-Dec. 8, 2021"), "sep1-sep15|nov20-dec8")
        self.assertEqual(render(r(("2021-09-01", "2021-09-15"))), "sep1-sep15")


if __name__ == "__main__":
    unittest.main(verbosity=1)
