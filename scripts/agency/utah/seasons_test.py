#!/usr/bin/env python3
"""Unit tests for seasons_ranges.py (Utah seasonDates -> seasonRanges).

Usage: python -I scripts/agency/utah/seasons_test.py
"""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("seasons_ranges", os.path.join(HERE, "seasons_ranges.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ParseTest(unittest.TestCase):
    def test_single_with_label(self):
        self.assertEqual(m.parse("2026-09-05 to 2026-09-27 (Any Legal Weapon)", 2026),
                         [{"start": "2026-09-05", "end": "2026-09-27", "label": "Any Legal Weapon"}])

    def test_multi_segment_keeps_order(self):
        t = "2026-08-15 to 2026-09-15 (Archery); 2026-09-21 to 2026-10-02 (Muzzleloader); 2026-09-16 to 2026-09-20 (Any Legal Weapon)"
        r = m.parse(t, 2026)
        self.assertEqual([x["label"] for x in r], ["Archery", "Muzzleloader", "Any Legal Weapon"])
        self.assertEqual(r[2], {"start": "2026-09-16", "end": "2026-09-20", "label": "Any Legal Weapon"})
        self.assertEqual(m.render(r), t)

    def test_comma_label(self):
        r = m.parse("2026-11-24 to 2026-11-29 (Archery, Muzzleloader, Shotgun)", 2026)
        self.assertEqual(r[0]["label"], "Archery, Muzzleloader, Shotgun")

    def test_no_label(self):
        self.assertEqual(m.parse("2026-09-01 to 2026-11-08", 2026), [{"start": "2026-09-01", "end": "2026-11-08"}])

    def test_runs_into_january(self):
        self.assertEqual(m.parse("2026-12-05 to 2027-01-31 (Any Legal Weapon)", 2026),
                         [{"start": "2026-12-05", "end": "2027-01-31", "label": "Any Legal Weapon"}])

    def test_starts_in_next_january(self):
        self.assertEqual(m.parse("2027-01-16 to 2027-01-24 (Any Legal Weapon)", 2026)[0]["start"], "2027-01-16")

    def test_outside_draw_year_raises(self):
        with self.assertRaises(ValueError):
            m.parse("2027-04-10 to 2027-04-29 (Any Legal Weapon)", 2026)
        with self.assertRaises(ValueError):
            m.parse("2025-09-01 to 2025-09-30 (Archery)", 2026)

    def test_start_after_end_raises(self):
        with self.assertRaises(ValueError):
            m.parse("2026-10-02 to 2026-09-21 (Muzzleloader)", 2026)

    def test_impossible_date_raises(self):
        with self.assertRaises(ValueError):
            m.parse("2026-02-30 to 2026-03-05 (Archery)", 2026)

    def test_non_date_text(self):
        self.assertIsNone(m.parse("Contact Operator (CWMU)", 2026))
        self.assertIsNone(m.parse("Contact Operator (Any Legal Weapon)", 2026))
        self.assertIsNone(m.parse("", 2026))
        self.assertIsNone(m.parse(None, 2026))

    def test_mixed_text_keeps_dates_only(self):
        t = "2026-09-12 to 2026-10-15 (Archery); 2026-09-12 to 2026-11-30 (Archery); See Guidebook for Units (Archery)"
        r = m.parse(t, 2026)
        self.assertEqual(len(r), 2)
        dates, other = m.segments(t)
        self.assertEqual(other, ["See Guidebook for Units (Archery)"])
        self.assertEqual(m.render(r), "; ".join(dates))

    def test_with_ranges_position_and_idempotent(self):
        row = {"species": "elk", "year": 2026, "huntCode": "X", "seasonDates": "2026-09-01 to 2026-09-30 (Archery)", "choice": "first"}
        rg = m.parse(row["seasonDates"], 2026)
        a = m.with_ranges(row, rg)
        self.assertEqual(list(a), ["species", "year", "huntCode", "seasonDates", "seasonRanges", "choice"])
        self.assertEqual(m.with_ranges(a, rg), a)
        self.assertNotIn("seasonRanges", m.with_ranges(a, None))


if __name__ == "__main__":
    unittest.main(verbosity=1)
