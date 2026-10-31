#!/usr/bin/env python3
"""Spot-check Idaho harvest JSON rows against the raw IDFG Hunt Planner HTML."""
import json,random,sys,os,re
from bs4 import BeautifulSoup
# Independent re-read (BeautifulSoup, not the parser's regexes) of random rows.
# Usage (repo root): python -I scripts/agency/idaho/harvest_spotcheck.py <raw_dir> [seed]
raw=sys.argv[1]; D='src/data/agency/idaho/harvest/'
random.seed(int(sys.argv[2]) if len(sys.argv)>2 else 7)
cache={}
def table(sid):
    m=re.match(r'h-idfg-(general|controlled)-(.+)-(\d{4})$',sid)
    f=f'{raw}/hp_{m.group(1)}_{m.group(2)}_{m.group(3)}.html'
    if f not in cache:
        soup=BeautifulSoup(open(f).read(),'lxml'); t=soup.find('table',id='stattable')
        hd=[th.get_text(strip=True) for th in t.find('thead').find_all('th')]
        cache[f]=(hd,[[td.get_text(strip=True) for td in tr.find_all('td')] for tr in t.find('tbody').find_all('tr')])
    return f,cache[f]
picked=[]
for sp in ['elk','mule-deer','whitetail','pronghorn','moose','bear','sheep','goat','lion','turkey']:
    rows=[r for r in json.load(open(D+sp+'.json')) if r['sourceId'].startswith('h-idfg-g') or r['sourceId'].startswith('h-idfg-c')]
    picked+= [(sp,r) for r in random.sample(rows, 2 if sp not in ('elk','mule-deer','bear') else 3)]
ok=0
for sp,r in picked:
    f,(hd,trs)=table(r['sourceId'])
    if 'hunt' in r:
        cand=[dict(zip(hd,c)) for c in trs if c[hd.index('Hunt#')]==r['hunt']]
    else:
        cand=[dict(zip(hd,c)) for c in trs if c[hd.index('Unit')]==r['unit']]
    print(f"\n== {sp} {r['year']} unit={r['unit']} hunt={r.get('hunt')} label={r.get('methodLabel')} file={os.path.basename(f)}")
    print("   JSON:", {k:r.get(k) for k in ['hunters','harvest','successPct','harvestMale','harvestFemale','daysHunted']})
    for c in cand: print("   RAW :", c)
