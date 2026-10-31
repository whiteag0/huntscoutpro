#!/usr/bin/env python3
"""Text-line extraction for CPW harvest PDFs (used by harvest_build.py).

Two readers, both returning pages -> lines -> tokens (whitespace-separated
cells in left-to-right order):

* plumber_lines(): pdfplumber words, grouped into lines by baseline.  Several
  CPW PDFs (e.g. 2021/2023 elk & deer) contain invisible white text ("sum",
  "sum0" ... left over from spreadsheet formulas) printed under the real
  numbers; characters whose fill colour is white are dropped so only what a
  reader sees on the page is parsed.

* type3_lines(): four CPW PDFs (bear 2022, moose 2021, moose 2022, mountain
  goat 2022) were exported with Type 3 fonts whose character codes do not map
  to Unicode (pdftotext prints "550 5 5" for "001 0 0").  Each glyph is
  identified by the MD5 of its drawing procedure (CharProc), which is identical
  wherever the same glyph is drawn, and translated with GLYPHS below.
  GLYPHS was built on 2026-10-31 by (a) reading the rendered page images of
  bear 2022 pp.1/4/5 by eye and (b) majority-voting every remaining glyph
  against macOS Vision OCR of the rendered pages (all labels with >=2 votes
  were >=90% unanimous; the only conflicting label was discarded).  The decoded
  tables were then compared row-by-row with the rendered pages and checked with
  male+female=total arithmetic in harvest_build.py.  Glyphs not in GLYPHS
  decode to "¿" and any row containing one is rejected by the parser.
"""
import collections
import hashlib
import json
from pathlib import Path

import pdfplumber
from pdfminer.converter import PDFLayoutAnalyzer
from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
from pdfminer.pdfpage import PDFPage
from pdfminer.pdftypes import resolve1

TYPE3_FILES = {"bear_2022", "moose_2021", "moose_2022", "goat_2022"}

GLYPHS = {
    '00d85e31': '7', '01642e75': 'G', '0190fb7c': 'H', '029e2726': '/', '02e6b0d0': 'g', '02eb8b93': '2',
    '031629c8': 'e', '0347b2c2': '3', '03c49526': 'D', '0471a9d7': 'g', '04ae130e': 'G', '04b47104': '5',
    '06c27e60': '6', '06d6f1a6': 'A', '0719faa8': '-', '07cdb342': 'r', '08a35a34': 'r', '08ac2ba0': 'H',
    '08bc9170': '7', '08d2a311': 'R', '0952b684': 'W', '0992e1f7': 'R', '0abbc76c': 'l', '0b209e80': 'R',
    '0b549c88': 's', '0b5cd05c': 'G', '0bc243fa': 'u', '0bfce8c2': 'P', '0c056f63': 'c', '0c9c5454': 'M',
    '0cf02d9d': 's', '0d70c6a9': 'z', '0d90956d': 'r', '0e332e0b': 'g', '0edacb89': 'u', '0f7282c9': ',',
    '0f83b5e9': 'e', '103e73e5': '4', '10670821': 't', '1129d54e': 'a', '115177ab': 'o', '1175f957': '2',
    '11c074d5': '8', '122cae9b': 'N', '12b15b1d': 'R', '13b8a168': '7', '14201b1a': 'v', '14892c7b': '/',
    '156ec83a': 'M', '1570dc28': 'y', '15814aa3': 'p', '169210ca': '1', '16da2ddf': '#', '174ae5a5': '*',
    '17bd904a': 'C', '17f56203': '8', '1820e0dd': 'S', '1838d4a9': '-', '18dae9e9': '2', '18df7e12': 'e',
    '1921239a': '1', '1a6358e8': 'o', '1a887b11': '9', '1ad1e482': 'e', '1aee8dd0': '1', '1b715e4f': 'H',
    '1bd48b91': 'o', '1bed4c34': 'y', '1cce77ec': '7', '1d32b7be': 'x', '1da3dab4': 'r', '1ddfab7c': 'l',
    '1e0cde1d': 'f', '1e0d2732': 'a', '1e170e6e': 'p', '1eb1eb75': '7', '1ee9fbad': 'd', '1f1fecf8': 'y',
    '1f7e69d5': 'n', '2065788b': 'T', '2076accd': '5', '208b7f7a': '5', '20a39544': 'r', '20d54beb': 's',
    '2186f20c': ',', '21c7e396': 's', '21ca3195': 't', '21fe7563': '3', '22268d82': 'a', '222817b8': 'D',
    '22e1273b': 'u', '22fa4260': 'f', '23901ec2': 'F', '23a3b89e': 'I', '2427c703': 't', '248aeced': 'n',
    '24e338f8': 'o', '257cea42': '&', '25b9a4c6': 'd', '25bb100a': 'A', '262fd6a3': '(', '2636f890': '5',
    '26483c69': ':', '2669e988': 'e', '26fa0670': 'p', '2727cd8a': '9', '282a12e2': 'f', '284fb4a3': 'v',
    '2866514a': 'f', '28bb71b2': 'y', '290523b3': '5', '291c74b4': ',', '292277d7': 'a', '2924276a': 'n',
    '296a405c': '7', '2a105125': 'e', '2a27a85b': 'e', '2a320124': 't', '2a4c26cd': '7', '2b3bf3ac': 'c',
    '2b7b1784': 'S', '2be56833': '0', '2c06ad36': '9', '2c39e66c': '(', '2cf83a98': 'w', '2d300a1f': 'S',
    '2e7b318b': '5', '2ea77f2e': 'M', '2ec408f3': 'e', '2efe048d': 'R', '2fd78edd': ':', '3068bd09': 'W',
    '30bd5d0b': '9', '317904b6': 'P', '3186570f': '8', '318f7d6f': 'h', '322ae9fa': 'R', '3295f1f4': 'E',
    '329e6b24': 't', '332ce542': 't', '334d7a2d': ' ', '34112e37': 's', '35448072': 'A', '355760fe': 'B',
    '35c49d98': 'a', '3636daf9': 'U', '3640f3ee': 'p', '36b4b791': '8', '378d914b': 'x', '37bc0a28': 's',
    '37d6b51c': 'd', '3829a62a': 'L', '385e3fbd': '.', '38a502e4': 's', '38dd6256': 'h', '38e384c1': 't',
    '39b9deb6': 'o', '3a1b4e7b': 'i', '3ac1a310': '3', '3b7235b3': 'c', '3bd5029b': '9', '3c67d868': '/',
    '3ce89075': 'A', '3ec7aebd': 'R', '3ed7aee9': 'g', '3ed9ff43': 'e', '3ee9b787': 'R', '3f54023c': 'C',
    '4046ff7f': 'b', '40a0cb91': '1', '4109b64e': 'o', '412179d7': 'y', '41265595': '&', '4143847b': 'R',
    '421b2d80': '5', '42920859': '7', '42c40b1f': 'd', '42ebe34f': '(', '430103e5': 's', '433ee1a6': '/',
    '43f38352': 'i', '445dea20': '7', '447a8140': 'L', '4480326f': 'O', '44fe3bbd': 'l', '45876101': 'a',
    '45f64e61': 'U', '46a62388': '7', '471ea940': 'f', '4723695a': 'R', '4866de7f': 'y', '488d8f3f': 'n',
    '48c2f952': 'S', '4b01340a': '2', '4be7f2d9': 't', '4c347a01': 'v', '4e133fbf': '9', '4e16f257': 'm',
    '4e7781c2': 'P', '4edc7177': 'S', '4f0db7a3': 'h', '4f45e337': 'a', '4f54c488': 'a', '4fa41692': 'g',
    '504045a6': 'n', '50443851': '*', '506f9cf0': '6', '50d2316d': 'b', '516e672a': 'W', '51eb9e6f': 'H',
    '5355b863': 'o', '535b1d0b': 'T', '5416d76d': 'b', '547c14e2': 'd', '54b6c9c1': 's', '54be925a': 'h',
    '551a6c9b': 'U', '552a049b': '9', '5582d811': 'S', '5592fd83': 'n', '559d6482': 'R', '55d0d4ae': 't',
    '56405d58': 'c', '566204e0': 'm', '5668e64f': 'c', '570430ae': '5', '573600f8': 'I', '57b2ccf9': 'U',
    '57d94cad': 'c', '58a1103e': 'S', '5a978dfd': 'S', '5a9794a8': 'n', '5aa6bcbb': 'g', '5aea273c': ':',
    '5b9d6d3d': 'S', '5c23366d': ',', '5c863f6a': 'O', '5d66f19b': 'r', '5da8d09a': 'c', '5e2e35b3': '.',
    '5e559df2': 'P', '5e79db46': 'f', '5e877458': 'o', '5eb63b30': 'U', '5fb64126': 'n', '5fc29f71': '6',
    '5fcd3e9d': 's', '60d179e9': 'T', '610d4277': 'h', '611d42aa': 'w', '628e0fea': 'h', '6313d4c1': 'm',
    '6367386c': '8', '640382a9': 'u', '6430d4a6': 'c', '64604cfd': 's', '64a52a0a': '3', '64c1f83d': 'L',
    '656004cf': '8', '657c39ad': '7', '662ab164': 'a', '6638efed': 'P', '67345934': 'v', '6819f45f': '1',
    '68e3a00c': '(', '68ed7ea6': 'U', '68fecc11': '9', '69481c58': 'c', '6961a229': 'r', '6a1710f3': 'n',
    '6cabca8f': '/', '6d66d234': 'y', '6d719c4c': 'd', '6dc9e262': '2', '6e38c4d1': ',', '6e6e9107': '4',
    '6fbf985a': 'o', '6fd23548': '2', '70062319': '6', '7020affa': 'D', '714174cf': 'm', '718765d1': 'u',
    '724e2370': '0', '72ce2823': 'u', '7370dc9f': ',', '73b3b3c2': 'd', '7408f0ef': 'n', '74e517e0': 'G',
    '753dd61f': 'a', '7589e2b7': '9', '76e9042f': 'f', '76efcbcb': 'g', '771d708b': 'o', '7842719c': 'a',
    '79961df4': '1', '7a6e181b': 't', '7ac8ca9c': 'v', '7b3c7c5a': 'n', '7b8ce484': 'U', '7b90ee17': 'h',
    '7c61549b': '#', '7cb4be9e': '8', '7ccebac7': 'n', '7d871818': 'g', '7da4598e': 'm', '7e3f50d8': '8',
    '7e8a48ec': 'a', '7ed259b4': 'e', '7fd8b40f': 'R', '80524e68': '2', '807a51c3': 'D', '80b3ae38': '7',
    '80f94219': 'A', '821547ea': 'S', '823108e4': 'z', '82923894': 'm', '82da4967': 's', '84bf17f4': '6',
    '85f40559': 'c', '86566433': 'L', '8658bf9d': 'e', '86d14f35': '8', '87436b7a': 'A', '87e301f0': 'S',
    '884f0bba': '6', '88832a69': 'C', '88b9780c': 'n', '89612612': '5', '8a1d7736': ',', '8bb94182': 'e',
    '8bc2bc86': 'y', '8be9cbb1': 'r', '8c426391': 's', '8c6ac930': 'B', '8d4552bb': 'i', '8d670be6': 'R',
    '8e075bd0': 'c', '8e1cfbc0': 'g', '8e265272': '5', '8e75ec88': 'o', '8f2bafab': 'f', '8fd8c582': 'y',
    '91f27f33': '8', '933f4e7e': 'u', '934b746c': '6', '9475bc3b': '5', '963f3273': ')', '97884467': 'k',
    '97c20321': 'S', '97cae95b': '9', '9811e506': '0', '985261ff': 'n', '987db42f': 'n', '99bb079b': '6',
    '9a3cf618': '&', '9a4797ea': '0', '9b48e8a6': 'a', '9c1d27da': 'a', '9c4a4889': 'c', '9cdd547d': 'h',
    '9e0010e6': '7', '9e025732': 'g', '9f4fc87f': 'S', 'a0b1f167': 'd', 'a0e99665': 'g', 'a1287b14': 'm',
    'a13cf620': 't', 'a15804c5': 't', 'a1c720ab': 'd', 'a27d711f': '-', 'a39f00a6': 'a', 'a3ab39b7': 'h',
    'a4538eeb': 'R', 'a4f1c547': 'o', 'a52abac0': 'w', 'a53bb035': 'l', 'a5c3ca3e': '7', 'a616d700': 'h',
    'a61bf454': 'k', 'a69b9769': 'D', 'a6ebaf9e': 'g', 'a88b0161': '3', 'aa468f30': 'e', 'aa73f423': 'S',
    'ab301595': '*', 'ac84265f': 'a', 'ad530172': 'o', 'ae4b3733': 'c', 'ae4dc003': 'y', 'aeb3ed72': 'r',
    'aeb6018b': 'e', 'af36fdd5': 'o', 'af8d147c': 'f', 'b04087b4': 'd', 'b2e6eb6e': 'u', 'b34cfb0b': 'A',
    'b399fde4': 'f', 'b3e50f5c': '2', 'b46f697d': '8', 'b4b5ff5b': 'O', 'b4e038e6': '8', 'b4e15781': 'd',
    'b5390101': 'c', 'b5da4596': '9', 'b659e059': 'r', 'b680f8d5': '-', 'b7023043': '*', 'b7785694': 'n',
    'b88c69ea': 'f', 'b8db1851': 'c', 'b979302f': 'p', 'b97e4214': 'p', 'ba16982e': 'r', 'baf62737': 'g',
    'bb031439': 'n', 'bb1d2b3a': 'e', 'bb98de46': 'p', 'bbfeb5a5': 'g', 'bd779e35': 'h', 'bdfb01c8': 'y',
    'be9e6679': '9', 'bebb601a': 'f', 'bedeb0a2': '9', 'bf75fda3': '#', 'bf882cb7': 'e', 'c001d49b': '8',
    'c0df0acd': 't', 'c16c3282': ',', 'c1ec1932': 'h', 'c1fa9fab': 'S', 'c260b28c': '5', 'c2d94d27': 'W',
    'c4b3f07f': ',', 'c528deea': 'g', 'c56be476': '2', 'c5dd308e': 'G', 'c6d5e25f': 'i', 'c6d6ec70': 'U',
    'c6d724fb': 's', 'c760c225': 'y', 'c7b5241a': 'P', 'c889ab22': '6', 'c8c989c4': 'D', 'c8ed2283': 'D',
    'ca0cf713': 't', 'ca678f45': '8', 'ca7bace1': 'A', 'ce162a8e': 'r', 'ce8968af': 'u', 'cea300cc': 'n',
    'ceca1729': 'd', 'cf46fddc': '#', 'cf4a0209': 'F', 'cf90b1ec': 'i', 'cfdabd01': 'C', 'd00a9eec': 'u',
    'd188dc10': '#', 'd2391a01': '#', 'd39c3071': '9', 'd3a8b665': 'r', 'd4256b94': '5', 'd47dea93': '2',
    'd4b88f99': '7', 'd4cd2d1f': '7', 'd5121285': 'f', 'd56df845': '8', 'd5955d1a': 'e', 'd5bb8aa2': 'D',
    'd72bcceb': '&', 'd734c479': 'g', 'd88db58c': 'S', 'd8c17e88': ',', 'd94632b5': 'u', 'd9a2819a': '0',
    'da10081c': '7', 'da35dc89': 'r', 'db5348a5': '3', 'db568e89': 'v', 'dbc55557': '*', 'dd31b85d': 'e',
    'de864c9a': 'D', 'debe91e6': 'P', 'def33d5c': '8', 'df85f210': 'e', 'dfb58f39': 'R', 'e0e12472': '5',
    'e0f64e55': 'c', 'e1083e76': 's', 'e174e15e': '5', 'e2193d97': 's', 'e254b569': 'y', 'e26f734e': '0',
    'e291c55b': 'E', 'e3b78df8': '#', 'e3f1f8ef': 'm', 'e41ed2ab': 'd', 'e4ee9ff7': 'o', 'e55d641d': 's',
    'e56780ee': 'P', 'e5da726c': 'H', 'e69630db': '-', 'e6cd1ebb': 'a', 'e6d9d4b8': 'd', 'e74f5e4a': 'm',
    'e7585531': 'S', 'e7c0eec2': 'e', 'e85ff958': 'z', 'e87b0a9c': 'u', 'e887fc8c': 'c', 'e88da09f': 'r',
    'e8d19c3d': 'U', 'e9683513': 'D', 'ea75cee2': '3', 'ea815141': 'O', 'eaa62eea': 'l', 'eac34eb5': 'a',
    'eaf21e20': 'c', 'ec354e7b': 't', 'ecdd3c48': 'u', 'eceba864': 'P', 'ed4c58fd': '#', 'eda67b02': 'a',
    'ee116733': 'u', 'ee71ab7a': '3', 'ef7ad98e': 'L', 'efa558a6': 'S', 'efc75eff': 'G', 'f01e1347': 'D',
    'f03c96fb': '9', 'f040c9a9': 'a', 'f0f4222b': '6', 'f106d8ce': 'R', 'f16f4218': '9', 'f172818b': 'g',
    'f1fc954d': '6', 'f251e2f5': 's', 'f32739ac': 'u', 'f360cc21': 't', 'f36760c2': '9', 'f3a598d7': '&',
    'f4798931': 'O', 'f4a0fa1e': '1', 'f5701625': '1', 'f5cce744': 'o', 'f5e0cb0a': 'e', 'f6aa3629': 'o',
    'f6b8086a': 'm', 'f6e3d002': 'A', 'f6fc6b2a': ',', 'f762aa92': 'I', 'f85aa025': '3', 'f88c846a': 'm',
    'f8b78ac2': 'c', 'f95a0aa7': 'u', 'f973c51a': 'o', 'f9c8b453': 'd', 'f9e2f7ea': '0', 'f9e41af5': 'u',
    'fa3aebcc': 'b', 'fbb28785': '#', 'fc5b25e7': ',', 'fc7f9e78': 'A', 'fc9b2ba6': 'D', 'fd0ae9ca': 'P',
    'fd15f6c2': 'f', 'fd8194bb': 'P', 'feede39b': ',',}

WHITE = {(1,), (1.0,), (1, 1, 1), (1.0, 1.0, 1.0), (0, 0, 0, 0), (0.0, 0.0, 0.0, 0.0)}


def _is_white(obj):
    c = obj.get("non_stroking_color")
    if c is None:
        return False
    try:
        return tuple(float(v) for v in c) in WHITE
    except TypeError:
        return float(c) == 1.0


def plumber_lines(pdf_path):
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            vis = page.filter(lambda o: not (o.get("object_type") == "char" and _is_white(o)))
            words = vis.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
            rows = []
            for w in sorted(words, key=lambda w: (round(w["bottom"]), w["x0"])):
                if rows and abs(rows[-1]["bottom"] - w["bottom"]) <= 2.5:
                    rows[-1]["words"].append(w)
                else:
                    rows.append({"bottom": w["bottom"], "words": [w]})
            lines = []
            for r in rows:
                ws = sorted(r["words"], key=lambda w: w["x0"])
                lines.append({"y": round(r["bottom"], 1), "tokens": [w["text"] for w in ws],
                              "x": [round(w["x0"], 1) for w in ws]})
            pages.append(lines)
    return pages


class _RM(PDFResourceManager):
    def get_font(self, objid, spec):
        f = super().get_font(objid, spec)
        if not hasattr(f, "_glyph"):
            g = {}
            if resolve1(spec.get("Subtype")).name == "Type3":
                enc = resolve1(spec.get("Encoding"))
                diffs = resolve1(enc.get("Differences")) if enc else []
                cp = resolve1(spec["CharProcs"])
                code = None
                for d in diffs:
                    if isinstance(d, int):
                        code = d
                    else:
                        g[code] = hashlib.md5(resolve1(cp[d.name]).get_data()).hexdigest()[:8]
                        code += 1
            f._glyph = g
        return f


class _Dev(PDFLayoutAnalyzer):
    def __init__(self, rm):
        super().__init__(rm)
        self.chars = []

    def render_char(self, matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate):
        adv = super().render_char(matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate)
        self.chars.append((matrix[5], matrix[4], getattr(font, "_glyph", {}).get(cid)))
        return adv

    def receive_layout(self, ltpage):
        pass


def type3_lines(pdf_path, gap=10.5):
    """Decode Type 3 glyphs; a horizontal gap > `gap` pt starts a new token."""
    rm = _RM()
    dev = _Dev(rm)
    it = PDFPageInterpreter(rm, dev)
    pages = []
    with open(pdf_path, "rb") as fh:
        for p in PDFPage.get_pages(fh):
            dev.chars = []
            it.process_page(p)
            x0, y0, x1, y1 = p.mediabox
            # cluster glyphs into lines: baselines within 1.5 pt belong together
            clusters = []
            for y, x, h in sorted(dev.chars, key=lambda c: -c[0]):
                if clusters and clusters[-1][0] - y <= 1.5:
                    clusters[-1][1].append((x, h))
                else:
                    clusters.append([y, [(x, h)]])
            lines = []
            for y, glyphs in clusters:
                toks, xs, cur, px = [], [], "", None
                for x, h in sorted(glyphs):
                    ch = GLYPHS.get(h, "¿") if h else "¿"
                    if ch == " ":
                        if cur:
                            toks.append(cur); cur = ""
                        px = x
                        continue
                    if px is not None and x - px > gap and cur:
                        toks.append(cur); cur = ""
                    if not cur:
                        xs.append(round(x, 1))
                    cur += ch
                    px = x
                if cur:
                    toks.append(cur)
                lines.append({"y": round(float(y1 - y), 1), "tokens": toks, "x": xs})
            pages.append(lines)
    return pages


def layout_lines(pdf_path):
    """pdftotext -layout, split on whitespace.  Used where pdfminer reports
    collapsed character positions (adjacent single-digit columns run together)."""
    import subprocess
    out = subprocess.run(["pdftotext", "-layout", str(pdf_path), "-"], capture_output=True, text=True,
                         check=True).stdout
    pages = []
    for ptxt in out.split("\f"):
        lines = []
        for i, ln in enumerate(ptxt.splitlines()):
            toks = ln.split()
            if toks:
                lines.append({"y": float(i), "tokens": toks, "x": []})
        pages.append(lines)
    if pages and not pages[-1]:
        pages.pop()
    return pages


# pdfminer merges the single-digit columns of these tables ("101000000000000");
# pdftotext keeps them apart and matched the rendered page cell-for-cell.
LAYOUT_FILES = {"sheep_2020_rocky-mountain-bighorn-sheep", "sheep_2020_desert-bighorn-sheep"}


def page_lines(pdf_path, cache_dir=None):
    pdf_path = Path(pdf_path)
    stem = pdf_path.stem.replace("_harvest-reports", "")
    if cache_dir:
        c = Path(cache_dir) / (pdf_path.stem + ".lines.json")
        if c.exists() and c.stat().st_mtime > pdf_path.stat().st_mtime:
            return json.loads(c.read_text())
    if stem in TYPE3_FILES:
        pages = type3_lines(pdf_path)
    elif pdf_path.stem in LAYOUT_FILES:
        pages = layout_lines(pdf_path)
    else:
        pages = plumber_lines(pdf_path)
    if cache_dir:
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        c.write_text(json.dumps(pages))
    return pages
