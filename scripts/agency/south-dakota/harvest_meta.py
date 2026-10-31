"""Write harvest-meta.json (imported by harvest_parse.py)."""
import json
import os


def run(P):
    unit_names = {}
    for sp, d in P.UNIT_NAMES.items():
        unit_names[sp] = {k: v[1] for k, v in sorted(d.items())}
    used = {r["sourceId"] for rows in P.RECORDS.values() for r in rows}
    coverage = []
    for sp in ["elk", "mule-deer", "whitetail", "pronghorn", "sheep", "goat", "lion", "turkey"]:
        years = sorted({r["year"] for r in P.RECORDS.get(sp, [])})
        coverage.append({"species": sp, "years": years, "notes": P.COVERAGE_NOTES.get(sp, "")})
    for sp in ("moose", "bear"):
        coverage.append({"species": sp, "years": [], "notes": P.COVERAGE_NOTES[sp]})
    meta = {
        "unitNames": unit_names,
        "coverage": coverage,
        "sources": [s for sid, s in sorted(P.SOURCES.items()) if sid in used],
    }
    path = os.path.join(P.REPO, "src/data/agency/south-dakota/harvest-meta.json")
    with open(path, "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
