#!/usr/bin/env python3
"""Fetch the Kansas Department of Wildlife and Parks (KDWP) draw-statistics documents used
for src/data/agency/kansas/draw/*.json and draw-meta.json.

Usage:
  python -I scripts/agency/kansas/draw_download.py <raw_dir>

Two kinds of sources:

1. ARCHIVED agency files (PDF/HTML). KDWP overwrites each draw-stats PDF in place every year
   (same /content/download/<id>/<id>/file URL), so earlier draw years survive only as Internet
   Archive captures of the agency URL. These are downloaded byte-for-byte ("id_" raw mode) from
   web.archive.org into <raw_dir>/wayback/ and checked against the SHA-256 recorded below.
   The 2025 Unit 4 and nonresident turkey PDFs captured by the archive are byte-identical to
   the files KDWP serves today (SHA-256 checked against the live files in a browser).

2. LIVE ksoutdoors.gov pages. www.ksoutdoors.gov sits behind an Akamai bot filter that answers
   403 to curl/requests (any User-Agent), so these pages were captured in a desktop browser on
   2026-10-31. The in-page capture (CAPTURE_JS below) walks the page body from the <h1> to the
   "Contact Us" footer and writes headings as "#"-prefixed lines, paragraphs/list items as one
   line each and every table row as "cell | cell | ...". PDFs linked from the live pages were read
   with pdf.js (PDFJS_CAPTURE_JS) as "y<top>: [x] text | [x] text" lines. Each capture was saved
   to <raw_dir> and its SHA-256 was verified against the SHA-256 computed in the page. This script
   only verifies that those capture files are present and unchanged.
"""
import hashlib
import os
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# (local name, wayback timestamp, original agency URL, sha256)
WAYBACK = [
    # Nonresident deer draw stats report (whitetail by unit + mule deer stamp), draw years 2024 and 2025
    ("nr-deer-20241105.pdf", "20241105035557", "https://ksoutdoors.com/content/download/14487/99514/file",
     "919f66d24ad224a04c978206de060a634b82f91cb155afd63c5cbd3641ba68dc"),
    ("nr-deer-20260122.pdf", "20260122032040", "https://ksoutdoors.gov/content/download/14487/99514/file",
     "f3327e4879d9179144e0d63224f22c59e6083c1f775dbf9484adb958c454fcec"),
    # Resident either-species/either-sex firearm deer draw stats, draw years 2024 and 2025
    ("res-deer-20250522.pdf", "20250522201609", "https://ksoutdoors.com/content/download/18755/127305/file",
     "395042a8a2a808b4c6db434188d91dd69a6fb422b49d663ebdb066d0b5a8addc"),
    ("res-deer-20260122.pdf", "20260122033921", "https://ksoutdoors.gov/content/download/18755/127305/file",
     "d8c74c0f600f0279f0a65586f578d7247e7ffd5c491b46a135b836311d1f5025"),
    # Old "Quotas and Draw Stats" page (permits authorized by unit) for 2022, 2023 and 2024
    ("dq-20221206180810.html", "20221206180810",
     "https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats",
     "0dc2ee2e78c978f7824f3f9503d72c26fb61fbb2e408582a4a7f7bde1a652de0"),
    ("dq-20230721164947.html", "20230721164947",
     "https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats",
     "e152f274f41040c4d091a993c6fb3894b2e35644ffe8f49d655575b39e1483e6"),
    ("dq-20240713073722.html", "20240713073722",
     "https://ksoutdoors.com/Hunting/Applications-and-Fees/Deer/Quotas-and-Draw-Stats",
     "bdd6282bec40aeb3d5cee8597ed340b4d9d7ebd7465a5e37c1953250a09c2ed8"),
    # Resident antelope draw stats, draw years 2022-2024
    ("ant-2022.pdf", "20230601231113",
     "https://ksoutdoors.com/content/download/14575/99966/version/24/file/2022+Antelope_Draw_Stats.pdf",
     "403ce7a7e241bd66101f1fd91acc66edf0949c25a65d6626fcaf9c267a9aa34d"),
    ("ant-2023.pdf", "20240225044412",
     "https://ksoutdoors.com/content/download/56351/612251/file/2023%20Antelope_Draw_Stats.pdf",
     "182a35fe4fb4aa2fbed2d320eb8d694806d7962c6fac854498d225b57872cd73"),
    ("ant-2024.pdf", "20250419210730",
     "https://ksoutdoors.com/content/download/56351/612251/version/2/file/2024+Antelope+Draw+Stats.pdf",
     "b43bc2b70edda5cc229d5f651f7c03ab40a548521d1d8b4af795e3dcf7d42581"),
    # Spring turkey Unit 4 (resident) draw stats 2023-2025 and nonresident draw stats 2024-2025
    ("tky4-2023.pdf", "20231214090150",
     "http://ksoutdoors.com/content/download/56350/612247/file/2023%20Sp%20Turkey%20Unit%204%20Draw%20Stats.pdf",
     "001ecef92429bafc16dc78a6d84844a539763e927eab11214aa20607f38cb3a2"),
    ("tky4-2024.pdf", "20241008114533",
     "https://ksoutdoors.com/content/download/56350/612247/file/2024%20Sp%20Turkey%20Unit%204%20Draw%20Stats.pdf",
     "e13c11d01fa8f2ca52cfac691a3d2f25fd81ecc5fef5693441e8ff4b7b394e47"),
    ("tky4-2025.pdf", "20250419215330",
     "https://ksoutdoors.com/content/download/56350/612247/version/3/file/2025+Sp+Turkey+Unit+4+Draw+Stats.pdf",
     "65c84aee88606ec86b4bda3ee4b3bd929a2100d78e3ca3f710ed4472417a4125"),
    ("tkynr-2024.pdf", "20240414043129",
     "https://ksoutdoors.com/content/download/56806/615568/version/1/file/2024+Sp+Turkey+NR+Stats.pdf",
     "49a4a6aa7a5c6e6507bca7ac1e145ea2a586186b8894649f16d43f0335c7b620"),
    ("tkynr-2025.pdf", "20250419211728",
     "https://ksoutdoors.com/content/download/56806/615568/version/2/file/2025+Sp+Turkey+NR+Stats.pdf",
     "03c9f546af44a354ae5365d69c5ead4071541bbc1dc20714ab102f087a6c9568"),
]

# Browser captures of live www.ksoutdoors.gov pages / PDFs (see module docstring), with SHA-256.
BROWSER_CAPTURES = {
    "deer-quotas-and-draw-statistics.txt": (
        "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/big-game/deer/deer-quotas-and-draw-statistics",
        "e31ec7960f1f631003a3faa3ac7e3ca984426cdc3af803859b1f0cde13699fec"),
    "antelope-page-stats.txt": (
        "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/big-game/antelope",
        "724745be437933a7b9c812f6817bf3da9e5042b14e4a023a7644868531288bd0"),
    "turkey-page-stats.txt": (
        "https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/turkey",
        "09e05a28c8c9a551a173088a16c05f67cdbecab3549556b48ecc1cbeab2af113"),
    "turkey-2025-nr-draw-stats.pdftext": (
        "https://www.ksoutdoors.gov/home/showpublisheddocument/2326/639107476246330000",
        "1246fe539cc38b2116aa7f16cb0f77fcd21c548c75e102bcfa8c1893be5e52f2"),
    "turkey-2025-unit4-draw-stats.pdftext": (
        "https://www.ksoutdoors.gov/home/showpublisheddocument/2328/639107476248930000",
        "3e75466c1d239f2697fdde69043a8d0f71fdef3b09b912666b6e041a2f4f89e9"),
    "fees-page-excerpt.txt": (
        "https://www.ksoutdoors.gov/licenses-permits-fees/hunting-furharvester-licenses-permit-fees-280",
        "efe56bc85f197457f63f31cc00393c8feee3776ef85d186800e070bdec57de95"),
    "fees-page-nr-license.txt": (
        "https://www.ksoutdoors.gov/licenses-permits-fees/hunting-furharvester-licenses-permit-fees-280",
        "e8cee6e8bd35c235be0b0137ff2ea469c14a963665433cf2cbb2575ae6cd9735"),
    "elk-2024-25-harvest-report-p1-3.txt": (
        "https://www.ksoutdoors.gov/home/showpublisheddocument/1396/638967132842170000",
        "dffd212c3b8a9df0f611cd2c0f571eb2d7d5488ecaecd524297cd735ea479a76"),
}

CAPTURE_JS = r"""
async function CAP(startText){const h1=document.querySelector('h1');const contact=[...document.querySelectorAll('h2')].find(h=>/^Contact Us$/.test(h.textContent.trim()));
const els=[...document.querySelectorAll('table,p,li,h2,h3,h4')].filter(e=>(h1.compareDocumentPosition(e)&4)&&(!contact||(contact.compareDocumentPosition(e)&2))&&!e.closest('footer,nav'));const last=els[els.length-1];let c=h1.parentElement;while(!c.contains(last))c=c.parentElement;
const out=[];const clean=s=>s.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
function walk(n){if(n.nodeType!==1)return;if(contact&&(contact.compareDocumentPosition(n)&4)&&!n.contains(contact))return;const t=n.tagName;if(/^(SCRIPT|STYLE|NAV|BUTTON|SVG|NOSCRIPT|FOOTER)$/.test(t))return;if(n===contact)return;
 if(t==='TABLE'){out.push('[TABLE]');for(const r of n.querySelectorAll('tr')){out.push([...r.children].map(td=>{const cl=td.cloneNode(true);cl.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));cl.querySelectorAll('p,div,li').forEach(b=>b.append('\n'));return clean(cl.textContent).replace(/\s*\n+\s*/g,' / ').replace(/^ \/ | \/ $/g,'');}).join(' | '));}out.push('[/TABLE]');return;}
 if(/^H[1-6]$/.test(t)){const s=clean(n.textContent);out.push('#'.repeat(+t[1])+(s?' '+s:''));return;}
 if(/^(P|LI|DT|DD)$/.test(t)&&!n.querySelector('table,p,li')){const s=clean(n.innerText||n.textContent).replace(/\s*\n+\s*/g,' / ');if(s)out.push(s);return;}
 let txt='';for(const k of n.childNodes){if(k.nodeType===3)txt+=k.textContent;}if(clean(txt))out.push(clean(txt));for(const k of n.childNodes)walk(k);}
walk(c);let lines=out.filter(Boolean);if(startText){const i=lines.findIndex(l=>l.includes(startText));if(i>=0)lines=lines.slice(i);}return lines.join('\n')+'\n';}
// (the 2026-10-31 deer-page capture used innerText instead of the cloned-cell textContent for table cells)
"""

PDFJS_CAPTURE_JS = r"""
// pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs')
async function PDFX(u){const buf=await (await fetch(u)).arrayBuffer();const doc=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;const out=[];
for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const vp=pg.getViewport({scale:1});const tc=await pg.getTextContent();
 const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({x:i.transform[4],y:vp.height-i.transform[5],s:i.str.replace(/\s+/g,' ').trim()}));items.sort((a,b)=>a.y-b.y||a.x-b.x);
 const lines=[];for(const i of items){let L=lines.find(l=>Math.abs(l.y-i.y)<2.5);if(!L){L={y:i.y,it:[]};lines.push(L);}L.it.push(i);}lines.sort((a,b)=>a.y-b.y);
 out.push('=== page '+p);for(const L of lines){L.it.sort((a,b)=>a.x-b.x);out.push('y'+L.y.toFixed(0)+': '+L.it.map(i=>'['+i.x.toFixed(0)+'] '+i.s).join(' | '));}}
return out.join('\n')+'\n';}
"""


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    wb = os.path.join(raw, "wayback")
    os.makedirs(wb, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    ok = True
    for name, ts, url, want in WAYBACK:
        path = os.path.join(wb, name)
        if not (os.path.exists(path) and sha256(path) == want):
            for attempt in range(4):
                r = s.get(f"https://web.archive.org/web/{ts}id_/{url}", timeout=120)
                if r.status_code == 200 and (name.endswith(".html") or r.content[:4] == b"%PDF"):
                    with open(path, "wb") as f:
                        f.write(r.content)
                    break
                time.sleep(10 * (attempt + 1))
            time.sleep(3)
        got = sha256(path) if os.path.exists(path) else None
        status = "ok" if got == want else f"MISMATCH ({got})"
        ok &= got == want
        print(f"{name:28s} {status}")
        if name.endswith(".pdf") and got == want:
            subprocess.run(["pdftotext", "-layout", path, path[:-4] + ".txt"], check=True)
    for name, (url, want) in BROWSER_CAPTURES.items():
        path = os.path.join(raw, name)
        got = sha256(path) if os.path.exists(path) else None
        status = "ok" if got == want else ("MISSING - capture in a browser from " + url if got is None else f"MISMATCH ({got})")
        ok &= got == want
        print(f"{name:40s} {status}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
