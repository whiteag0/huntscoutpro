#!/usr/bin/env python3
"""Download Colorado Parks and Wildlife primary-draw recap reports (PDF).

Usage:
  python -I scripts/agency/colorado/draw_download.py <raw_dir>

Sources: the "Draw Recap Report" links on each CPW species statistics page
(cpw.state.co.us/activities/hunting/.../<species>-statistics). Each link is a
Widen share page (cpw.widen.net/s/<id>/<name>); the page contains a direct
"/content/<id>/original/<file>.pdf?...&download=true" href, which we fetch.

Writes <raw_dir>/<key>.pdf, <raw_dir>/<key>.txt (pdftotext -layout) and
<raw_dir>/manifest.json (key -> share url, direct url, file name).
Downloaded files are untrusted data; nothing in them is executed.
"""
import json
import os
import re
import subprocess
import sys
import time

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# key: (species page label, year, share url). Primary draw recap reports only.
REPORTS = {
    # elk
    "elk-2026": "https://cpw.widen.net/s/jzvr7hzzl8/postdrawrecapreport_elk-26_05142026_1426",
    "elk-2025": "https://cpw.widen.net/s/qh6nqttnnz/postdrawrecapreport_elk-25_05172025_0612",
    "elk-2024": "https://cpw.widen.net/s/gvtppdkdcr/2024-primary-elk-post-draw-report",
    "elk-2023": "https://cpw.widen.net/s/slgqfqbwtl/2023elkdrawrecap",
    "elk-2022": "https://cpw.widen.net/s/pnpsrnqpvr/2022elkdrawrecap",
    # deer (mule deer + white-tailed deer hunt codes share one report)
    "deer-2026": "https://cpw.widen.net/s/5j2x8x6fdd/postdrawrecapreport_deer-26_05112026_1505",
    "deer-2025": "https://cpw.widen.net/s/r9bjfnqlbc/postdrawrecapreport_deer-25_05102025_1540",
    "deer-2024": "https://cpw.widen.net/s/drbww92qtk/2024-primary-deer-post-draw-report",
    "deer-2023": "https://cpw.widen.net/s/7bcmqkddrn/2023deerdrawrecap",
    "deer-2022": "https://cpw.widen.net/s/srqhwvssqn/2022deerdrawrecap",
    # pronghorn
    "pronghorn-2026": "https://cpw.widen.net/s/vtght5qc8p/postdrawrecapreport_prong-26_05212026_1006",
    "pronghorn-2025": "https://cpw.widen.net/s/t6tnqjg55q/postdrawrecapreport_prong-25_05222025_0816",
    "pronghorn-2024": "https://cpw.widen.net/s/vrpbwpdjb2/2024-primary-pronghorn-post-draw-report",
    "pronghorn-2023": "https://cpw.widen.net/s/fhjrczc2bk/2023pronghorndrawrecap",
    "pronghorn-2022": "https://cpw.widen.net/s/zbt6xfg6kt/2022pronghorndrawrecap",
    # moose
    "moose-2026": "https://cpw.widen.net/s/dkxmt8qrsd/postdrawrecapreport_moose-26_05062026_1222",
    "moose-2025": "https://cpw.widen.net/s/7qvlbxgdl7/postdrawrecapreport_moose-25_05072025_1354",
    "moose-2024": "https://cpw.widen.net/s/lpffzbvzgc/2024-primary-moose-post-draw-report",
    "moose-2023": "https://cpw.widen.net/s/mhzqtxkszs/2023moosedrawrecap",
    "moose-2022": "https://cpw.widen.net/s/tnwsqssglk/2022moosedrawrecap",
    # black bear
    "bear-2026": "https://cpw.widen.net/s/txgf2r8x9r/postdrawrecapreport_bear-26_05062026_1346",
    "bear-2025": "https://cpw.widen.net/s/szwnfghlfp/postdrawrecapreport_bear-25_05072025_1542",
    "bear-2024": "https://cpw.widen.net/s/zjbcxkchlh/2024-primary-bear-post-draw-report",
    "bear-2023": "https://cpw.widen.net/s/dvwvpclrd5/2023beardrawrecap",
    "bear-2022": "https://cpw.widen.net/s/m6vqw2jctl/2022beardrawrecap",
    # Rocky Mountain bighorn sheep
    "rmsheep-2026": "https://cpw.widen.net/s/qwws66r5ps/postdrawrecapreport_sheep-26_04222026_1349_wcoversheet",
    "rmsheep-2025": "https://cpw.widen.net/s/v7c5wv87dp/postdrawrecapreport_sheep-25_04142025_1550",
    "rmsheep-2024": "https://cpw.widen.net/s/vxbkdwwgzj/2024-primary-rm-bighorn-sheep-post-draw-report",
    "rmsheep-2023": "https://cpw.widen.net/s/s98zwwxqqr/2023rmsheepdrawrecap",
    "rmsheep-2022": "https://cpw.widen.net/s/79qgtllbf7/2022rmsheepdrawrecap",
    # desert bighorn sheep
    "dsheep-2026": "https://cpw.widen.net/s/fm5vnxshp6/postdrawrecapreport_deser-26_04212026_1115",
    "dsheep-2025": "https://cpw.widen.net/s/zmdgsqxd5d/postdrawrecapreport_deser-25_04142025_1409",
    "dsheep-2024": "https://cpw.widen.net/s/hclt8776gj/2024-primary-desert-sheep-post-draw-recap-report",
    "dsheep-2023": "https://cpw.widen.net/s/wsgxt2rvs8/2023-primary-desert-sheep-post-draw-recap-report",
    "dsheep-2022": "https://cpw.widen.net/s/ldmdfq2shp/2022-primary-desert-sheep-post-draw-recap-report",
    # mountain goat
    "goat-2026": "https://cpw.widen.net/s/wmsnf8w6tx/postdrawrecapreport_goat-26_04222026_1507",
    "goat-2025": "https://cpw.widen.net/s/hsljtqnxzv/postdrawrecapreport_goat-25_04142025_1712",
    "goat-2024": "https://cpw.widen.net/s/bqwxb5qdnw/2024-primary-goat-post-draw-report",
    "goat-2023": "https://cpw.widen.net/s/8p9f9wpphz/2023goatdrawrecap",
    "goat-2022": "https://cpw.widen.net/s/pjsczqjclg/2022goatdrawrecap",
    # spring turkey (2026 spring recap is only on a widencollective share page; see SPECIAL)
    "sturkey-2025": "https://cpw.widen.net/s/mpjzm2qjb9/postdrawrecapreport_sturk-25_02072025_0834",
    "sturkey-2024": "https://cpw.widen.net/s/qf6ds5rvqg/2024-primary-spring-turkey-post-draw-report",
    "sturkey-2023": "https://cpw.widen.net/s/ghbf7vjcqf/2023-primary-spring-turkey-post-draw-report",
    "sturkey-2022": "https://cpw.widen.net/s/d9rnvcxzkp/2022-primary-spring-turkey-post-draw-report",
    # fall turkey
    "fturkey-2026": "https://cpw.widen.net/s/lrqz7kqfxc/postdrawrecapreport_fturk-26_06032026_0929",
    "fturkey-2025": "https://cpw.widen.net/s/pkdt5qwn6d/postdrawrecapreport_fturk-25_06042025_0914",
    "fturkey-2024": "https://cpw.widen.net/s/rj7ggxhjfm/postdrawrecapreport_fturk-24_06042024_1048",
    "fturkey-2023": "https://cpw.widen.net/s/mfsvzsfnxw/2023-fall-turkey-hunting-post-draw-report",
    "fturkey-2022": "https://cpw.widen.net/s/bcpwvzjtwg/2022-fall-turkey-hunting-post-draw-report",
    # Drawn Out At (minimum preference points) reports, used for cross-checks
    "elk-dout-2026": "https://cpw.widen.net/s/sdbdvc9lqb/postdrawnoutreport_elk-26_05142026_1446",
    "deer-dout-2026": "https://cpw.widen.net/s/xvgbttbsz7/postdrawnoutreport_deer-26_05112026_1524",
    "pronghorn-dout-2026": "https://cpw.widen.net/s/tjxqdksqj8/postdrawnoutreport_prong-26_05212026_1011",
    "sturkey-dout-2026": "https://cpw.widen.net/s/pflfvmvfbg/postdrawnoutreport_sturk-26_02092026_0855",
    # brochures (fees, dates, rules)
    "brochure-biggame": "https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure",
    "brochure-sheepgoat": "https://cpw.widen.net/s/n87kwmkzbt/colorado-sheep-and-goat-brochure",
    "brochure-turkey": "https://cpw.widen.net/s/dm7sggcmdk/colorado-turkey-hunting-brochure",
    "brochure-lion": "https://cpw.widen.net/s/wdhnb9pcvs/colorado-mountain-lion-hunting-brochure",
}

# Direct URLs that are not behind a widen.net share page.
DIRECT = {
    # Earlier big game brochures (used only to read each year's "Limited Licenses -
    # White-tailed deer only" hunt code table). CPW replaces the brochure at the same
    # link each year, so these come from Internet Archive captures of the CPW URLs.
    "wb-bg2022": "http://web.archive.org/web/20220328164312id_/https://cpw.state.co.us/Documents/RulesRegs/Brochure/BigGame/biggame.pdf",
    "wb-bg2023": "http://web.archive.org/web/20230329171230id_/https://cpw.state.co.us/Documents/RulesRegs/Brochure/BigGame/biggame.pdf",
    "wb-bg2024": "http://web.archive.org/web/20240317142907id_/https://cpw.state.co.us/Documents/RulesRegs/Brochure/BigGame/biggame.pdf",
    "wb-bg2025": "http://web.archive.org/web/20250214170715id_/https://cpw.widen.net/s/5wvx7rggrd/colorado-big-game-hunting-brochure",
}

# The 2026 spring turkey recap is only linked as a widencollective.com share page
# (https://cpw.widencollective.com/assets/share/asset/gbejmpkp3f) whose viewer is
# JavaScript-rendered. The PDF was fetched from the signed preview URL that page
# requests (signature expires); open the share page in a browser to get a fresh one
# and pass it as: draw_download.py <raw_dir> sturkey-2026=<signed url>
SHARE_ONLY = {"sturkey-2026": "https://cpw.widencollective.com/assets/share/asset/gbejmpkp3f"}


def resolve(sess, share):
    # Some share links (e.g. the big game brochure) serve the PDF itself.
    with sess.get(share, timeout=60, stream=True) as r:
        r.raise_for_status()
        if r.headers.get("content-type", "").startswith("application/pdf") or r.raw.read(5) == b"%PDF-":
            return share
    r = sess.get(share, timeout=60)
    r.raise_for_status()
    m = re.search(r'href="(/content/[^"]+?download=true)"', r.text)
    if not m:
        raise RuntimeError("no download href on " + share)
    return "https://cpw.widen.net" + m.group(1).replace("&amp;", "&")


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    man_path = os.path.join(raw, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    only = set()
    for a in sys.argv[2:]:
        if "=" in a:
            k, u = a.split("=", 1)
            DIRECT[k] = u
            only.add(k)
        else:
            only.add(a)
    for key, share in list(REPORTS.items()) + [(k, SHARE_ONLY.get(k)) for k in DIRECT]:
        if only and key not in only:
            continue
        pdf = os.path.join(raw, key + ".pdf")
        if os.path.exists(pdf) and os.path.getsize(pdf) > 1000:
            continue
        direct = DIRECT.get(key) or resolve(sess, share)
        r = sess.get(direct, timeout=180)
        r.raise_for_status()
        if not r.content.startswith(b"%PDF"):
            raise RuntimeError(key + ": not a PDF")
        open(pdf, "wb").write(r.content)
        fname = re.search(r"/original/([^?]+)", direct)
        manifest[key] = {"share": share, "direct": direct.split("?")[0],
                         "file": fname.group(1) if fname else None,
                         "retrieved": time.strftime("%Y-%m-%d")}
        subprocess.run(["pdftotext", "-layout", pdf, os.path.join(raw, key + ".txt")], check=True)
        print("ok", key, len(r.content))
        json.dump(manifest, open(man_path, "w"), indent=1)
    json.dump(manifest, open(man_path, "w"), indent=1)


if __name__ == "__main__":
    main()
