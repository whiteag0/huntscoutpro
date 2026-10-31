"""Hand-written coverage notes and unit names for harvest-meta.json (Arizona).

unitNames.lion is copied from the MOUNTAIN LION ANNUAL HARVEST LIMITS table of the
2025-26 Arizona Hunting Regulations (same zone-unit lists in 2022-23, 2023-24, 2024-25).
"""

NOTES = {'unitNames': {'lion': {'A': 'Zone A (Units 13A/13B)',
                        'B': 'Zone B (Units 12A/12B)',
                        'C': 'Zone C (Units 15A/15B/15C/15D)',
                        'D': 'Zone D (Units 7/9/10/11M)',
                        'E': 'Zone E (Units 16A/16B/18A/18B)',
                        'F': 'Zone F (Units 17A/17B/19B/20A/20B/20C)',
                        'G1': 'Zone G1 (Units 4A/4B/5A/5B)',
                        'G2': 'Zone G2 (Units 6A/6B/8/19A)',
                        'H': 'Zone H (Units 2A/2B/2C/3A/3B/3C)',
                        'I': 'Zone I (Units 42/44A)',
                        'J': 'Zone J (Units 21/22/23/24A/24B/25M/26M)',
                        'K': 'Zone K (Units 1/27)',
                        'L': 'Zone L (Units 39/41/43A/43B/44B/45A/45B/45C)',
                        'M': 'Zone M (28/31/32/33/37A/37B/38M)',
                        'N': 'Zone N (Units 40A/40B/46A/46B)',
                        'P': 'Zone P (Units 29/30A/30B/34A/34B/35A/35B/36A/36B/36C)'}},
 'coverage': {'elk': 'Draw hunts 2020-2025, one row per AZGFD hunt number (hunt) with the unit text AZGFD '
                     'prints for that hunt (unit), which may list several units or a named hunt area; '
                     "AZGFD's formatting of multi-unit labels changes between years (e.g. '1/2B/2C' in "
                     "2020-21, '1, 2B, and 2C' later). The 2025 report is marked PRELIMINARY. hunters, "
                     'harvest (Total), successPct (% Success), daysHunted (Hunter Days) and licenses '
                     "(Permits Issued) are as printed; these are AZGFD's questionnaire-based figures (the "
                     'reports print questionnaire returns and 90% confidence intervals). harvestMale = Bull '
                     '+ Spike columns; harvestFemale = Cow column (calves are not in either); the 2024 '
                     'report prints a single Antlerless column, so harvestFemale is null for 2024. Where '
                     "AZGFD's printed % success differs from harvest / hunters, the row has a note and both "
                     'values are kept as printed; one 2020 hunt printed 120% success and its successPct is '
                     "null. method: AZGFD 'General' (any legal weapon) and CHAMP hunts are tagged rifle, HAM "
                     '(handgun/archery/muzzleloader) hunts are other; methodLabel is the AZGFD section '
                     'heading. 2023: AZGFD printed hunt 3005 twice (as Unit 5B and Unit 9, identical '
                     'numbers); the 5B row is kept (the 2023 Pronghorn and Elk Hunt Draw Information lists '
                     "3005 as Unit 5B bull elk), so the report's grand total is 24 hunters / 16 elk higher "
                     "than the sum of rows. AZGFD's multi-unit breakdown pages are not used (rows would "
                     'double count).',
              'mule-deer': 'Draw deer hunts 2020-2025 (one row per hunt number) plus over-the-counter (OTC) '
                           "archery deer by unit 2020-2025 and a Statewide OTC row per year. AZGFD's deer "
                           'report gives one hunter count per hunt and splits harvest into mule deer and '
                           'white-tailed deer. A draw hunt is in this file when mule deer were legal on it '
                           "per the same season's Arizona Hunting Regulations (Legal Animal column; for "
                           "every year, each hunt's permit count in the regulations matched the harvest "
                           'report). harvest = Mule Deer Buck + Antlerless columns; harvestMale = Buck, '
                           "harvestFemale = Antlerless. successPct is AZGFD's % success only on "
                           'mule-deer-only hunts; on hunts where either species was legal, and on OTC rows, '
                           'successPct is null because AZGFD does not publish a species-specific success '
                           "rate (the row note gives AZGFD's combined-deer success) and hunters/days are all "
                           'deer hunters on that hunt or unit. Hopi-land (18xx), Camp Navajo and Fort '
                           'Huachuca (19xx) deer hunts have no legal animal in the regulations, so they '
                           'appear in both deer files with null success. OTC archery: hunters who hunted '
                           'more than one unit are counted in each unit (AZGFD footnote), so unit hunters do '
                           'not add up to the statewide figure; for 2024-2025 AZGFD states harvest comes '
                           'from mandatory harvest reporting while hunters and % success come from voluntary '
                           "questionnaires. Statewide OTC row: hunters = AZGFD 'Actual Hunters' total, "
                           "licenses = OTC archery deer tag sales. On some hunts AZGFD's Total Harvest "
                           'column differs by a few animals from the sum of its species columns; those rows '
                           'carry a note.',
              'whitetail': "White-tailed deer here are Arizona's Coues white-tailed deer. Same structure as "
                           'mule-deer: draw hunts 2020-2025 placed here when white-tailed deer were legal '
                           "per the same season's Arizona Hunting Regulations (every hunt's permit count "
                           'matched the harvest report), plus OTC archery by unit and a Statewide OTC row. '
                           'harvest = White-tailed Buck + Antlerless columns; harvestMale = Buck, '
                           "harvestFemale = Antlerless. successPct is AZGFD's % success only on "
                           'whitetail-only hunts; null on either-species hunts and OTC rows (combined-deer '
                           'success is in the row note; hunters are all deer hunters on the hunt/unit). '
                           'Hopi-land, Camp Navajo and Fort Huachuca hunts appear in both deer files with '
                           'null success. OTC unit hunters double count multi-unit hunters (AZGFD footnote); '
                           '2024-2025 OTC harvest is from mandatory reporting, hunters/success from '
                           "voluntary questionnaires. On some hunts AZGFD's Total Harvest column differs by "
                           'a few animals from the sum of its species columns; those rows carry a note.',
              'pronghorn': "Draw hunts 2020-2025, one row per hunt number with AZGFD's unit text; sections "
                           'General (tagged rifle), Muzzleloader and Archery-only. hunters, harvest (Total '
                           'Harvest), successPct, daysHunted and licenses (Permits Issued) as printed. Rows '
                           "where AZGFD's % success differs from harvest / hunters carry a note. Multi-unit "
                           'breakdown pages are not used.',
              'bear': 'Mandatory black bear check-in counts 2020-2025: 2020-2021 by unit, 2022-2025 by the '
                      'hunt areas AZGFD prints (often several units together). harvest = hunter harvest only '
                      "(AZGFD's 'Other' - roadkill, illegal take, nuisance - and depredation are excluded); "
                      'harvestMale/harvestFemale = sex of hunter harvest. AZGFD does not publish hunters by '
                      'area (bear tags are statewide), so hunters and successPct are null. One Statewide row '
                      "per year is AZGFD's published total, with licenses = tag sales (2025: AZGFD says tag "
                      "sales not yet available). In the 2024-2025 tables '-' means none and is carried as 0 "
                      '(sums reconcile with the published totals). 2025: hunt-area rows sum to 422 '
                      "hunter-harvested bears (210 male, 209 female) while AZGFD's printed total is 431 "
                      '(214/214); rows and total are kept exactly as printed.',
              'sheep': 'Desert and Rocky Mountain bighorn draw hunts 2020-2025, one row per hunt number; the '
                       'subspecies (and 2025 One-Horned hunts) is in the row note. hunters, harvest, '
                       'successPct and daysHunted as printed; AZGFD prints Permits Authorized (not issued), '
                       "so licenses is omitted. Where AZGFD printed '-' for harvest (no ram reported) "
                       "harvest is carried as 0 and successPct is null; sums reconcile with AZGFD's totals. "
                       'Auction and raffle special tags (statewide tags) are excluded; the 2021 published '
                       'total includes one special-tag hunter/ram, which is why it is 1 higher than the sum '
                       'of hunt rows. The successful-hunter lists in the reports are not used.',
              'lion': 'Mountain lion harvest 2020-2025: 2020-2021 reported by unit, 2022-2025 by mountain '
                      "lion management zone (unit = zone letter; unitNames.lion lists each zone's units as "
                      'printed in the 2025-26 Arizona Hunting Regulations; the zone-unit lists are identical '
                      'in the 2022-23, 2023-24 and 2024-25 regulations). Each report covers the calendar '
                      'year. harvest = hunter harvest only (Other and depredation excluded); '
                      'harvestMale/harvestFemale = sex of hunter harvest. hunters and successPct are not '
                      "published (tags are statewide) and are null. One Statewide row per year = AZGFD's "
                      'published total, licenses = tag sales where printed (2025: not yet available; the '
                      "2022 and 2023 reports both print 10,054). In 2024-2025 tables '-' is carried as 0 "
                      '(sums reconcile with totals).',
              'turkey': 'Spring and fall permit-tag (draw) turkey hunts 2020-2025 in one file; methodLabel '
                        "starts with 'Spring turkey' or 'Fall turkey' followed by AZGFD's section heading "
                        '(Limited Weapon-Shotgun Shooting Shot = shotgun, Archery-Only = archery). The '
                        '2020-2021 spring and fall reports print no weapon sections, so method is null '
                        'except for their Archery section. hunters, harvest, successPct, daysHunted and '
                        "licenses (Permits Issued) as printed; AZGFD's printed % success sometimes differs "
                        'from harvest / hunters (row note). 2025 spring: AZGFD printed hunts 4032 and 4033 '
                        "twice (once as '20A (West)'/'20A (East)' and once as '20A' with 0 permits "
                        "authorized, identical results); the East/West rows are kept, so the report's grand "
                        'total is 13 hunters / 11 birds higher than the sum of rows. Over-the-counter '
                        '(nonpermit) archery turkey and multi-unit breakdown pages are not included.',
              'moose': 'Arizona has no moose hunting season.',
              'goat': 'Arizona has no mountain goat hunting season.'}}
