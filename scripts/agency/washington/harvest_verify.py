"""Cross-checks and spot checks for the WDFW harvest JSON.

Usage: python -I harvest_verify.py <raw_dir> <repo_root> [n_spot] [seed]

1. hunter success vs harvest/hunters (ignores row notes, unlike validate.mjs)
2. unit sums vs WDFW statewide totals
3. random spot checks: each sampled row is re-read from the raw HTML with a
   regex-only text extraction (independent of the BeautifulSoup parser) and
   printed next to the stored record; numeric fields are compared automatically.
"""
import html
import json
import os
import random
import re
import sys
from collections import defaultdict

raw, repo = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 18
SEED = int(sys.argv[4]) if len(sys.argv) > 4 else 20261031
D = os.path.join(repo, "src/data/agency/washington/harvest")
data = {f[:-5]: json.load(open(os.path.join(D, f))) for f in sorted(os.listdir(D)) if f.endswith(".json")}

print("== 1. success consistency (hunters >= 20, |published - harvest/hunters| > 2)")
for sp, rows in data.items():
    bad = [r for r in rows if r.get("hunters") and r["hunters"] >= 20 and r.get("harvest") is not None
           and r.get("successPct") is not None and abs(100 * r["harvest"] / r["hunters"] - r["successPct"]) > 2]
    over = [r for r in rows if r.get("hunters") is not None and r.get("harvest") is not None and r["harvest"] > r["hunters"]]
    print(f"  {sp}: {len(bad)} mismatches; {len(over)} rows harvest > hunters")
    for r in bad[:5]:
        print("    ", r["year"], r["unit"], r.get("hunt"), r.get("methodLabel"), r["hunters"], r["harvest"], r["successPct"])

print("== 2. unit sums vs statewide")


def S(rows, **f):
    out = [r for r in rows if all((r.get(k) == v) if not callable(v) else v(r.get(k)) for k, v in f.items())]
    return sum(r["harvest"] or 0 for r in out), len(out)


gmu = lambda u: bool(re.fullmatch(r"\d{3}", u or ""))
dist = lambda u: (u or "").startswith("District")
for sp in ("mule-deer", "elk"):
    rows = data[sp]
    for y in range(2020, 2026):
        R = [r for r in rows if r["year"] == y]
        st = {r["methodLabel"]: r["harvest"] for r in R if r["unit"] == "Statewide"}
        combo, _ = S(R, unit=gmu, methodLabel="General + permit (all weapons)")
        gen, _ = S(R, unit=gmu, methodLabel="General season total")
        spec, _ = S(R, unit=gmu, methodLabel="Special permits (all)")
        dcombo, _ = S(R, unit=dist, methodLabel="General + permit (all weapons)")
        hunts, nh = S(R, hunt=lambda h: h is not None)
        arch, _ = S(R, unit=gmu, methodLabel="Archery (general)")
        mf, _ = S(R, unit=gmu, methodLabel="Modern Firearm (general)")
        mz, _ = S(R, unit=gmu, methodLabel="Muzzleloader (general)")
        mw, _ = S(R, unit=gmu, methodLabel="Multiple Weapons (general)")
        print(f"  {sp} {y}: GMU combo {combo} / district combo {dcombo} / statewide {st.get('General + permit (all weapons)')}; "
              f"GMU general {gen} / statewide {st.get('General season total')}; GMU special {spec} / hunts {hunts} ({nh}) / statewide {st.get('Special permits (all)')}; "
              f"GMU arch {arch} mf {mf} mz {mz} mw {mw} vs statewide arch {st.get('Archery (general, statewide by tag)')} mf {st.get('Modern Firearm (general, statewide by tag)')} mz {st.get('Muzzleloader (general, statewide by tag)')} mw-gen {st.get('Multiple Weapons (general)')}")
for y in range(2020, 2026):
    R = [r for r in data["bear"] if r["year"] == y]
    g, n = S(R, unit=gmu, methodLabel="General season (fall)")
    b, _ = S(R, unit=lambda u: (u or "").startswith(("BMU", "BBMU")))
    st = {r["methodLabel"]: r["harvest"] for r in R if r["unit"] == "Statewide"}
    sp_, nsp = S(R, hunt=lambda h: h is not None)
    print(f"  bear {y}: GMU sum {g} ({n} GMUs) / BMU sum {b} / statewide general {st.get('General season (fall)')}; spring hunts {sp_} ({nsp}) / statewide spring {st.get('Spring permit hunt')}; total {st.get('Recreational harvest total (general + spring permit)')}")
    R = [r for r in data["lion"] if r["year"] == y]
    g, n = S(R, unit=gmu)
    c, _ = S(R, unit=lambda u: (u or "").startswith(("CMU", "CHMU")))
    st = [r["harvest"] for r in R if r["unit"] == "Statewide"]
    print(f"  lion {y}: GMU sum {g} ({n}) / CMU sum {c} / statewide general {st}")
    R = [r for r in data["turkey"] if r["year"] == y]
    p, n = S(R, unit=lambda u: (u or "").startswith("P"))
    st = {r["methodLabel"]: r["harvest"] for r in R if r["unit"] == "Statewide"}
    print(f"  turkey {y}: PMU sum {p} ({n}) + permit {st.get('Permit hunts')} = {p + (st.get('Permit hunts') or 0)} / statewide total {st.get('All seasons (spring + fall + permit)')}")
    for sp in ("moose", "sheep", "goat"):
        R = [r for r in data[sp] if r["year"] == y]
        print(f"  {sp} {y}: {len(R)} hunts, harvest {sum(r['harvest'] or 0 for r in R)}, hunters {sum(r['hunters'] or 0 for r in R)}")


# ---------------------------------------------------------------- spot checks
def page_text(year, rep):
    s = open(os.path.join(raw, str(year), rep + ".html"), encoding="utf-8", errors="replace").read()
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(?i)</t[dh]>", " | ", s)
    s = re.sub(r"(?i)</tr>|</caption>|<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</table>", "\n<<END TABLE>>\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace(" ", " ")
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in s.split("\n")]
    return [ln for ln in lines if ln]


def rep_of(sid):
    m = re.fullmatch(r"h-(\d{4})-(.+)", sid)
    return int(m.group(1)), m.group(2)


def snippet(r):
    year, rep = rep_of(r["sourceId"])
    L = page_text(year, rep)
    unit, hunt = r["unit"], r.get("hunt")
    out = []
    if hunt:
        for i, ln in enumerate(L):
            if re.match(rf"^(Hunt )?(number )?{hunt}\b", ln) or re.match(rf"^{hunt} - ", ln):
                out = L[i:i + 4]
                break
    elif re.fullmatch(r"\d{3}", unit) and rep.endswith("-general") and not rep.startswith("black-bear"):
        for i, ln in enumerate(L):
            if re.match(rf"^{unit} - ", ln):
                j = i
                block = []
                while j < len(L) and L[j] != "<<END TABLE>>":
                    block.append(L[j])
                    j += 1
                out = block
                break
    else:
        key = {"Statewide": None}.get(unit, unit)
        if key and re.fullmatch(r"\d{3}", key):
            out = [ln for ln in L if re.match(rf"^{key} - ", ln)]
        elif key and key.startswith("District"):
            out = [ln for ln in L if ln.startswith(key)]
            idx = [i for i, ln in enumerate(L) if ln == key or ln.startswith(key + " ")]
            for i in idx[:1]:
                j = i
                while j < len(L) and not L[j].startswith("Totals"):
                    j += 1
                out = [L[i], L[j] if j < len(L) else "?"]
        elif key and re.match(r"^(BMU|BBMU|CMU|CHMU) ", key):
            n = key.split()[1]
            out = [ln for ln in L if ln.startswith(f"{n} |") or ln.startswith(key + " Totals")]
        elif key and key.startswith("P"):
            out = [ln for ln in L if f"| {key} |" in ln]
        else:
            out = [ln for ln in L if "|" in ln and (ln.startswith(("Statewide Total", "General", "Special", "Archery", "Modern", "Muzzle", "Spring", "Recreational", "Permit Hunts", "Total")))]
    return year, rep, out


random.seed(SEED)
print(f"== 3. spot checks (seed {SEED})")
pool = []
for sp, rows in data.items():
    if sp == "whitetail":
        continue  # identical to mule-deer except species-specific hunts
    for r in rows:
        pool.append(r)
by_sp = defaultdict(list)
for r in pool:
    by_sp[r["species"]].append(r)
picks = []
for sp in by_sp:
    picks += random.sample(by_sp[sp], min(2, len(by_sp[sp])))
picks += random.sample(data["whitetail"], 1)
while len(picks) < N:
    picks.append(random.choice(pool))
for k, r in enumerate(picks, 1):
    year, rep, sn = snippet(r)
    vals = {x: r.get(x) for x in ("hunters", "harvest", "harvestMale", "harvestFemale", "successPct", "daysHunted", "licenses") if r.get(x) is not None}
    print(f"-- [{k}] {r['species']} {r['year']} unit={r['unit']} hunt={r.get('hunt')} label={r.get('methodLabel')} {vals}")
    print(f"     note: {r.get('note')}")
    for ln in sn[:8]:
        print("     RAW:", ln)
    nums_raw = set()
    for ln in sn:
        for t in re.findall(r"\d[\d,]*(?:\.\d+)?", ln):
            nums_raw.add(t.replace(",", ""))
    missing = [f"{x}={v}" for x, v in vals.items() if str(v) not in nums_raw]
    print("     AUTO:", "all stored numbers present in raw snippet" if not missing else f"NOT FOUND in snippet: {missing}")

# ---------------------------------------------------------------- targeted checks
# One row from each row family the random sample may miss.
print("== 4. targeted checks (one per row family)")
fam = [
    ("mule-deer", lambda r: r["unit"] == "Statewide" and r["methodLabel"] == "General season total"),
    ("elk", lambda r: r["unit"] == "Statewide" and r["methodLabel"] == "Multiple Weapons (permit)"),
    ("elk", lambda r: r["unit"] == "Statewide" and r["methodLabel"] == "General + permit (all weapons)"),
    ("mule-deer", lambda r: r["unit"].startswith("District") and r["methodLabel"] == "General + permit (all weapons)"),
    ("elk", lambda r: re.fullmatch(r"\d{3}", r["unit"]) and r["methodLabel"] == "Special permits (all)" and (r["harvest"] or 0) > 3),
    ("mule-deer", lambda r: re.fullmatch(r"\d{3}", r["unit"]) and r["methodLabel"] == "General + permit (all weapons)" and (r["harvest"] or 0) > 50),
    ("mule-deer", lambda r: r.get("hunt") and "Mule" in r["unit"]),
    ("whitetail", lambda r: r.get("hunt") and "White-tailed" in r["unit"]),
    ("bear", lambda r: r["unit"].startswith("BBMU")),
    ("bear", lambda r: r["unit"].startswith("BMU")),
    ("bear", lambda r: r["unit"] == "Statewide" and r["methodLabel"].startswith("Recreational")),
    ("lion", lambda r: r["unit"].startswith(("CMU", "CHMU"))),
    ("lion", lambda r: r["unit"] == "Statewide"),
    ("turkey", lambda r: r["unit"] == "Statewide" and r.get("method") == "all"),
    ("elk", lambda r: re.fullmatch(r"\d{3}", r["unit"]) and r["methodLabel"] == "Modern Firearm (general)" and r["year"] == 2025 and (r["hunters"] or 0) > 500),
]
for k, (sp, f) in enumerate(fam, 1):
    cands = [r for r in data[sp] if f(r)]
    if not cands:
        print(f"-- [T{k}] {sp}: no candidate rows")
        continue
    r = random.choice(cands)
    year, rep, sn = snippet(r)
    vals = {x: r.get(x) for x in ("hunters", "harvest", "harvestMale", "harvestFemale", "successPct", "daysHunted", "licenses") if r.get(x) is not None}
    print(f"-- [T{k}] {r['species']} {r['year']} unit={r['unit']} hunt={r.get('hunt')} label={r.get('methodLabel')} {vals}")
    print(f"     note: {r.get('note')}")
    for ln in sn[:8]:
        print("     RAW:", ln[:260])
    nums_raw = {t.replace(",", "") for ln in sn for t in re.findall(r"\d[\d,]*(?:\.\d+)?", ln)}
    missing = [f"{x}={v}" for x, v in vals.items() if str(v) not in nums_raw]
    print("     AUTO:", "all stored numbers present in raw snippet" if not missing else f"NOT FOUND in snippet: {missing}")
