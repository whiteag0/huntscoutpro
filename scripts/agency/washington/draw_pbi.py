"""Decode the WDFW Power BI (SpecialHuntMetrics_B_Tab03) querydata JSON saved by draw_fetch.py.

Power BI DSR compression: each row object has "C" (values for non-repeated, non-null
columns in order), "R" (bitmask of columns repeated from the previous row) and
"Ø" (bitmask of null columns). Columns with "DN" index into ValueDicts.
"""
import json
import sys

COLS = ["Season", "Species", "Hunt Name", "Hunt Choice", "Hunt Choice Name", "Permit Quota",
        "Permits Issued", "Total # of Applications", "Average Winner Points",
        "Selected as 1st Choice", "Selected as 2nd Choice", "Selected as 3rd Choice",
        "Selected as 4th Choice", "selected for another hunt", "not selected"]


def decode(path):
    d = json.load(open(path))
    ds = d["results"][0]["result"]["data"]["dsr"]["DS"][0]
    dicts = ds.get("ValueDicts", {})
    rows_raw = ds["PH"][0]["DM0"]
    schema = rows_raw[0]["S"]
    n = len(schema)
    prev = [None] * n
    out = []
    for r in rows_raw:
        rep = r.get("R", 0)
        nul = r.get("Ø", 0)
        vals = iter(r.get("C", []))
        cur = []
        for i in range(n):
            if rep & (1 << i):
                v = prev[i]
            elif nul & (1 << i):
                v = None
            else:
                v = next(vals)
                dn = schema[i].get("DN")
                if dn is not None and isinstance(v, int):
                    v = dicts[dn][v]
            cur.append(v)
        left = list(vals)
        if left:
            raise ValueError(f"unconsumed values {left} in row {r}")
        prev = cur
        out.append(dict(zip(COLS, cur)))
    if ds.get("IC") is False or "RT" in ds:
        print("WARNING: result may be truncated", file=sys.stderr)
    return out


if __name__ == "__main__":
    rows = decode(sys.argv[1])
    print(len(rows))
    for r in rows[:5] + rows[-3:]:
        print(r)
