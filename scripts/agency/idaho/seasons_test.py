#!/usr/bin/env python3
"""Tests for seasons_ranges.py / seasons_general.py, plus a round-trip check of the draw files.

Usage: python -I seasons_test.py [<repo_root>]   (the round-trip part runs when repo_root is given)
"""
import glob
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seasons_general as G  # noqa: E402
import seasons_ranges as S  # noqa: E402

REPO = sys.argv[1] if len(sys.argv) > 1 else None


class Parse(unittest.TestCase):
    def test_single(self):
        self.assertEqual(S.parse("2026-08-30 to 2026-09-30", 2026), [{"start": "2026-08-30", "end": "2026-09-30"}])

    def test_multi_keeps_agency_order(self):
        t = "2026-10-10 to 2026-10-31; 2026-08-30 to 2026-09-30"
        self.assertEqual([g["start"] for g in S.parse(t, 2026)], ["2026-10-10", "2026-08-30"])

    def test_extra_hunt_next_january(self):
        self.assertEqual(S.parse("2027-01-01 to 2027-02-15", 2026), [{"start": "2027-01-01", "end": "2027-02-15"}])
        self.assertEqual(S.parse("2026-12-16 to 2027-01-15", 2026), [{"start": "2026-12-16", "end": "2027-01-15"}])

    def test_rejects_outside_draw_year(self):
        self.assertIsNone(S.parse("2027-04-01 to 2027-05-22", 2026))
        self.assertIsNone(S.parse("2025-09-01 to 2025-10-31", 2026))

    def test_rejects_bad_text(self):
        for t in ["", None, "Aug 30 - Oct 13", "2026-08-30 to 2026-02-30", "2026-10-31 to 2026-10-01",
                  "2026-08-30 to 2026-09-30;2026-10-01 to 2026-10-05", "2026-08-30 to 2026-09-30 (archery)"]:
            self.assertIsNone(S.parse(t, 2026), t)

    def test_render_round_trip(self):
        t = "2024-08-30 to 2024-09-30; 2024-10-10 to 2024-10-20; 2024-11-01 to 2024-12-19"
        self.assertEqual(S.render(S.parse(t, 2024)), t)


class Brochure(unittest.TestCase):
    def test_md_range(self):
        self.assertEqual(S.md_range("Aug 30 - Oct 13", 2026), "2026-08-30 to 2026-10-13")
        self.assertEqual(S.md_range("April 15 – May 25", 2025), "2025-04-15 to 2025-05-25")
        self.assertEqual(S.md_range("Sep 15 - Oct 9", 2023), "2023-09-15 to 2023-10-09")
        with self.assertRaises(ValueError):
            S.md_range("Dec 1 - Jan 31", 2026)

    def test_msg_area(self):
        self.assertEqual(S.msg_area_ok("37A", "37A", False), (True, "exact"))
        self.assertEqual(S.msg_area_ok("20A*a", "20A", False), (True, "exact"))
        self.assertEqual(S.msg_area_ok("51*", "51-1", True), (True, "relabeled"))
        self.assertEqual(S.msg_area_ok("51*", "51-1", False), (False, "relabeled"))
        self.assertEqual(S.msg_area_ok("20AL*a", "20A", True), (True, "relabeled"))
        self.assertEqual(S.msg_area_ok("29*", "29, 30, 30A, 37, 37A, 58", True), (True, "relabeled"))
        self.assertEqual(S.msg_area_ok("37L*", "Bannock", True)[0], False)
        self.assertEqual(S.msg_area_ok("37AL", "37", True)[0], False)

    def test_bear_area(self):
        self.assertTrue(S.bear_area_ok("22-1a (See pg 73)", "22-1"))
        self.assertTrue(S.bear_area_ok("1-1b (See pg 76)", "1-1"))
        self.assertTrue(S.bear_area_ok("32A", "32A"))
        self.assertFalse(S.bear_area_ok("1-1b (See pg 73)", "22-1"))

    def test_odds_area(self):
        self.assertEqual(S.odds_area({"description": "Controlled Hunt — Hunt Area 22-1: All of Units 22 and 31."}), "22-1")
        self.assertEqual(S.odds_area({"description": "Rocky Mountain bighorn sheep — Controlled Hunt — Hunt Area 19A, 20A: That"}), "19A, 20A")
        self.assertEqual(S.odds_area({"description": "Controlled Hunt — Hunt Area 1-1"}), "1-1")

    def test_with_keys_order(self):
        r = {"species": "bear", "year": 2025, "huntCode": "8001", "units": [], "description": "x", "choice": "first", "sourceId": "a"}
        out = S.with_keys(r, {"seasonDates": "2025-04-01 to 2025-05-22", "seasonRanges": [{"start": "2025-04-01", "end": "2025-05-22"}],
                              "seasonSourceId": "b"})
        self.assertEqual(list(out), ["species", "year", "huntCode", "units", "description", "seasonDates", "seasonRanges",
                                     "seasonSourceId", "choice", "sourceId"])
        r2 = {"species": "elk", "seasonDates": "t", "sex": "male", "choice": "first", "sourceId": "a"}
        out2 = S.with_keys(r2, {"seasonRanges": [1]})
        self.assertEqual(list(out2), ["species", "seasonDates", "seasonRanges", "sex", "choice", "sourceId"])


class Labels(unittest.TestCase):
    def test_label_segments(self):
        rng = [{"start": "2026-08-30", "end": "2026-09-30"}, {"start": "2026-10-10", "end": "2026-12-01"}]
        segs = {("2026-08-30", "2026-09-30"): {"Archery"}, ("2026-10-10", "2026-12-01"): {"Any Weapon"}}
        self.assertEqual([g["label"] for g in S.label_segments(rng, segs)], ["Archery", "Any Weapon"])
        same = {k: {"Muzzleloader"} for k in segs}
        self.assertEqual(S.label_segments(rng, same), rng)  # one weapon throughout: no labels
        self.assertIsNone(S.label_segments(rng, {("2026-08-30", "2026-09-30"): {"Archery"}}))  # unmatched segment
        self.assertEqual(S.label_segments(rng[:1], segs), rng[:1])


class General(unittest.TestCase):
    def test_unit_ids(self):
        self.assertEqual(G.unit_ids("Unit 1"), ["1"])
        self.assertEqual(G.unit_ids("Units 75, 77 and 78"), ["75", "77", "78"])
        self.assertEqual(G.unit_ids("Units 22,32,32A"), ["22", "32", "32A"])
        self.assertEqual(G.unit_ids("Portion of Unit 50"), ["Portion of Unit 50"])
        self.assertEqual(G.unit_ids("Unit 2, except Farragut SP"), ["Unit 2, except Farragut SP"])
        self.assertEqual(G.unit_ids("Units 1, 2, 3, portion of 4A, 5, 6"), ["Units 1, 2, 3, portion of 4A, 5, 6"])

    def test_ranges_in(self):
        self.assertEqual(G.ranges_in("Aug 30 - Oct 31\nApr 15 -May 31"), [("Aug", "30", "Oct", "31"), ("Apr", "15", "May", "31")])
        self.assertEqual(G.ranges_in("July 1- July 31"), [("July", "1", "July", "31")])

    def test_mdy(self):
        self.assertEqual(G.mdy("8/30/26").isoformat(), "2026-08-30")


@unittest.skipUnless(REPO, "repo_root not given")
class DrawFiles(unittest.TestCase):
    def test_round_trip(self):
        n = 0
        for f in glob.glob(os.path.join(REPO, "src/data/agency/idaho/draw/*.json")):
            with open(f, encoding="utf-8") as fh:
                rows = json.load(fh)
            for r in rows:
                if r.get("seasonDates"):
                    self.assertIn("seasonRanges", r, (f, r["year"], r["huntCode"]))
                    self.assertEqual(S.render(r["seasonRanges"]), r["seasonDates"])
                    plain = [{"start": g["start"], "end": g["end"]} for g in r["seasonRanges"]]
                    self.assertEqual(S.parse(r["seasonDates"], r["year"]), plain)
                    labels = [g.get("label") for g in r["seasonRanges"]]
                    if any(labels):  # weapon labels only on multi-segment hunts whose segments differ in weapon
                        self.assertTrue(all(labels) and len(labels) > 1 and len(set(labels)) > 1, (f, r["year"], r["huntCode"]))
                    n += 1
                else:
                    self.assertNotIn("seasonRanges", r)
                if "seasonSourceId" in r:
                    self.assertNotEqual(r["seasonSourceId"], r["sourceId"])
        self.assertGreater(n, 2500)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]], verbosity=1)
