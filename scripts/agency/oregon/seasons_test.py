#!/usr/bin/env python3
"""Unit tests for seasons_ranges.py (Oregon season text -> seasonRanges).

Usage: python -I seasons_test.py
Inputs are season texts exactly as ODFW prints them in the 2022-2026 Big Game Hunting Regulations.
"""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("seasons_ranges", os.path.join(HERE, "seasons_ranges.py"))
sr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sr)


def R(*pairs):
    return [{"start": a, "end": b} for a, b in pairs]


class Parse(unittest.TestCase):
    def check(self, text, year, expected):
        got = sr.parse(text, year)
        self.assertEqual(got, expected, text)
        if expected:
            self.assertTrue(sr.round_trips(text, got, year), f"round trip failed: {text!r} -> {sr.render(got, year)!r}")

    def test_simple(self):
        self.check("Aug. 1 - Nov. 30", 2026, R(("2026-08-01", "2026-11-30")))
        self.check("Oct. 3 - Oct. 14", 2026, R(("2026-10-03", "2026-10-14")))

    def test_sept_variants_and_spacing(self):
        self.check("Sept. 1 - Sept. 30", 2023, R(("2023-09-01", "2023-09-30")))
        self.check("Aug. 15 - Sep. 14", 2026, R(("2026-08-15", "2026-09-14")))
        self.check("Nov. 21- Nov. 29", 2026, R(("2026-11-21", "2026-11-29")))
        self.check("Aug.1 - Mar.31, 2023", 2022, R(("2022-08-01", "2023-03-31")))
        self.check("Dec. 1 - Mar 31, 2023", 2022, R(("2022-12-01", "2023-03-31")))

    def test_rollover_printed_year(self):
        self.check("Dec. 15 - Jan. 5, 2027", 2026, R(("2026-12-15", "2027-01-05")))
        self.check("Oct. 28 - Mar. 31, 2027", 2026, R(("2026-10-28", "2027-03-31")))

    def test_whole_season_next_year(self):
        # 2026 hunt 224R prints "Jan. 2 - Jan. 17, 2027": both dates are in 2027
        self.check("Jan. 2 - Jan. 17, 2027", 2026, R(("2027-01-02", "2027-01-17")))
        self.check("Feb. 15 - Mar. 31, 2027", 2026, R(("2027-02-15", "2027-03-31")))

    def test_leap_day(self):
        self.check("Jan. 1 - Feb. 29, 2024", 2023, R(("2024-01-01", "2024-02-29")))
        self.assertIsNone(sr.parse("Jan. 1 - Feb. 29, 2025", 2024))

    def test_rollover_without_year(self):
        self.assertEqual(sr.parse("Dec. 18 - Jan. 15", 2026), R(("2026-12-18", "2027-01-15")))

    def test_weekend_list(self):
        self.check("Nov. 7-8, 14-15, 21-22, 28-29", 2026,
                   R(("2026-11-07", "2026-11-08"), ("2026-11-14", "2026-11-15"),
                     ("2026-11-21", "2026-11-22"), ("2026-11-28", "2026-11-29")))
        self.check("Nov. 9-10, 16-17, 23-24, Nov. 30-Dec.1", 2024,
                   R(("2024-11-09", "2024-11-10"), ("2024-11-16", "2024-11-17"),
                     ("2024-11-23", "2024-11-24"), ("2024-11-30", "2024-12-01")))
        self.check("Dec. 7-8, 14-15, 21-22,28-29", 2024,
                   R(("2024-12-07", "2024-12-08"), ("2024-12-14", "2024-12-15"),
                     ("2024-12-21", "2024-12-22"), ("2024-12-28", "2024-12-29")))

    def test_split_season(self):
        self.check("Aug. 29 - Sept. 27 & Nov. 14 - Dec. 6", 2026,
                   R(("2026-08-29", "2026-09-27"), ("2026-11-14", "2026-12-06")))
        self.check("Oct. 10 - Nov. 30 and Dec. 1 - Jan. 31, 2027", 2026,
                   R(("2026-10-10", "2026-11-30"), ("2026-12-01", "2027-01-31")))

    def test_rejects(self):
        for bad in ("", "Consult controlled hunt tables", "Aug. 1, 2021 - Nov. 30", "Aug. 32 - Sep. 1",
                    "Jan. 1 - Jan. 31, 2030", "Day Before Hunt"):
            self.assertIsNone(sr.parse(bad, 2026), bad)

    def test_round_trip_catches_drops(self):
        good = sr.parse("Nov. 7-8, 14-15", 2026)
        self.assertFalse(sr.round_trips("Nov. 7-8, 14-15, 21-22", good, 2026))
        self.assertFalse(sr.round_trips("Aug. 1 - Nov. 31", R(("2026-08-01", "2026-11-30")), 2026))


class Booklet(unittest.TestCase):
    LINES = "\n".join([
        "      HUNT #                     HUNT NAME                          BAG LIMIT                   OPEN SEASON         2026 TAGS     APPLICANTS",  # as printed, 2026 p.41
        " 620T1     Siuslaw Unit Youth                    One antlerless deer                     Oct. 3 - Nov. 8          55             39",
        "                                                                                        Nov. 7-8, 14-15,",
        " 620T2     Territorial Youth*                    One deer                                                         10             77",
        "                                                                                          21-22, 28-29",
        "   625T    Sixes Unit Youth                      One antlerless deer                  Dec. 15 - Jan. 5, 2027      94             37",
        "                                                                                                 Nov. 15 - Mar. 31,",
        "      230R     W Rogue Late Bow*                        One antlerless elk                                                  55             37",
        "                                                                                                         2027",
        "      175       Interstate Unit                         One buck with visible antler       Oct. 1 - Oct. 12      1,308 850          3,496",
    ])

    def test_table(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
            fh.write(self.LINES)
            path = fh.name
        try:
            got = sr.regs_hunt_seasons(path, {"620T1", "620T2", "625T", "230R", "175"})
        finally:
            os.unlink(path)
        self.assertEqual(got["620T2"], [("Nov. 7-8, 14-15, 21-22, 28-29", (10,))])
        self.assertEqual(got["625T"], [("Dec. 15 - Jan. 5, 2027", (94,))])
        self.assertEqual(got["230R"], [("Nov. 15 - Mar. 31, 2027", (55,))])
        self.assertEqual(got["175"], [("Oct. 1 - Oct. 12", (1308, 850))])
        # the fragment under 620T1 belongs to 620T2, so 620T1 is not read from this table
        self.assertEqual(got["620T1"], [(None, (55,))])


class Format(unittest.TestCase):
    def test_dump_and_insert(self):
        rows = [{"a": 1, "seasonDates": "Aug. 1 - Nov. 30", "choice": "first"}]
        r = sr.insert_after(rows[0], "seasonDates", [("seasonRanges", [{"start": "2026-08-01", "end": "2026-11-30"}])])
        self.assertEqual(list(r), ["a", "seasonDates", "seasonRanges", "choice"])
        r2 = sr.insert_after(r, "seasonDates", [("seasonRanges", r["seasonRanges"])])
        self.assertEqual(r2, r)
        self.assertEqual(sr.dump_rows([{"x": "\u00e9"}]), '[\n{"x":"\\u00e9"}\n]\n')


if __name__ == "__main__":
    unittest.main(verbosity=1)
