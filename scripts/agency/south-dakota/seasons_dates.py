"""Turn South Dakota GFP printed season dates into YYYY-MM-DD ranges.

Handles the forms printed on GFP's 2026 application sheets, e.g.
  "November 14-29, 2026"                  "September 1 - December 31, 2026"
  "December 1, 2026 - January 1, 2027"    "April 25, 2026 to May 31, 2026"
  "October 1-31, 2026 AND December 1-16, 2026"
  "November 7-10, 14-29, 2026"            "April 11 - 30, 2026"
  "Apr 11-30" / "December 12-20" (year supplied by the caller from the sheet's title year)
Used by seasons_parse.py and seasons_spotcheck.py.
"""
import re

MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
MON = r"(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?"
_PART = re.compile(
    rf"(?P<m1>{MON})\s+(?P<d1>\d{{1,2}})(?:,\s*(?P<y1>\d{{4}}))?\s*(?:-|–|to)\s*(?:(?P<m2>{MON})\s+)?(?P<d2>\d{{1,2}})"
    rf"(?P<more>(?:,\s*\d{{1,2}}\s*-\s*\d{{1,2}})*)(?:,\s*(?P<y2>\d{{4}}))?")


def _m(tok):
    return MONTHS[tok.rstrip(".").lower()[:3]]


def parse(text, default_year=None):
    """-> list of (start, end) ISO strings, in printed order."""
    out = []
    for p in _PART.finditer(text):
        m1, d1 = _m(p["m1"]), int(p["d1"])
        m2 = _m(p["m2"]) if p["m2"] else m1
        d2 = int(p["d2"])
        y2 = int(p["y2"]) if p["y2"] else (int(p["y1"]) if p["y1"] else default_year)
        y1 = int(p["y1"]) if p["y1"] else (y2 if m1 <= m2 else y2 - 1)
        if y1 is None or y2 is None:
            raise ValueError(f"no year for {p.group(0)!r}")
        segs = [((y1, m1, d1), (y2, m2, d2))]
        for a, b in re.findall(r"(\d{1,2})\s*-\s*(\d{1,2})", p["more"] or ""):
            segs.append(((y2, m2, int(a)), (y2, m2, int(b))))
        for (ya, ma, da), (yb, mb, db) in segs:
            s, e = f"{ya:04d}-{ma:02d}-{da:02d}", f"{yb:04d}-{mb:02d}-{db:02d}"
            if s > e:
                raise ValueError(f"range {s} > {e} in {text!r}")
            out.append((s, e))
    if not out:
        raise ValueError(f"no dates in {text!r}")
    return out


if __name__ == "__main__":
    tests = {
        "November 14-29, 2026": [("2026-11-14", "2026-11-29")],
        "September 1 - December 31, 2026": [("2026-09-01", "2026-12-31")],
        "December 1, 2026 - January 1, 2027": [("2026-12-01", "2027-01-01")],
        "April 25, 2026 to May 31, 2026": [("2026-04-25", "2026-05-31")],
        "October 1-31, 2026 AND December 1-16, 2026": [("2026-10-01", "2026-10-31"), ("2026-12-01", "2026-12-16")],
        "November 7-10, 14-29, 2026": [("2026-11-07", "2026-11-10"), ("2026-11-14", "2026-11-29")],
        "April 11 - 30, 2026": [("2026-04-11", "2026-04-30")],
        "November 21, 2026 to December 6, 2026": [("2026-11-21", "2026-12-06")],
        "November 1, 2026 - January 31, 2027": [("2026-11-01", "2027-01-31")],
        "December 26, 2025 to April 30, 2026": [("2025-12-26", "2026-04-30")],
        "November 25 - December 1, 2026": [("2026-11-25", "2026-12-01")],
    }
    for t, want in tests.items():
        got = parse(t)
        assert got == want, (t, got)
    assert parse("Apr 11-30", 2026) == [("2026-04-11", "2026-04-30")]
    assert parse("December 12-20", 2026) == [("2026-12-12", "2026-12-20")]
    print("ok", len(tests) + 2)
