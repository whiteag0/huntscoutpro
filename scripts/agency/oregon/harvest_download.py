#!/usr/bin/env python3
"""Download ODFW big game harvest summary PDFs (raw, untouched) for HuntScout Pro.

Source index: https://myodfw.com/articles/big-game-hunting-harvest-statistics
(document list as published there, retrieved 2026-10-31). ODFW posts one PDF per
species/weapon/season-type per year; each contains per-hunt (and for general
seasons per-unit) hunter, harvest, success and days figures.

Also downloads the spring turkey unit tables, three Game Bird Program staff
summaries (statewide turkey lines) and ODFW's Wildlife Management Unit layer.

Usage: python -I harvest_download.py <raw_dir>
Writes <raw_dir>/<year>_<key>.pdf, <raw_dir>/<year>_<key>.txt (pdftotext -layout),
<raw_dir>/manifest.json and <raw_dir>/wmu_query.json. Nothing is parsed here.

Pipeline: harvest_download.py -> harvest_text.py -> harvest_parse.py -> (harvest_spotcheck.py)
"""
import json
import os
import subprocess
import sys
import time
from urllib.parse import quote

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
INDEX = "https://myodfw.com/articles/big-game-hunting-harvest-statistics"

# (year, key, title as linked on the index page, url as linked on the index page)
DOCS = [
    (2025, 'deer_antlerless_pubpriv', '2025 Antlerless Deer Public vs Private Harvest Summary',
     'https://myodfw.com/sites/default/files/2026-04/antlerless_public_VS_Private_harvest_summary.pdf'),
    (2025, 'deer_buck_pubpriv', '2025 Buck Deer Public vs Private Harvest Summary',
     'https://myodfw.com/sites/default/files/2026-04/buck_deer_public_VS_Private_harvest_summary.pdf'),
    (2025, 'elk_pubpriv', '2025 Elk Public vs Private Harvest Summary',
     'https://myodfw.com/sites/default/files/2026-04/elk_public_VS_Private_harvest_summary.pdf'),
    (2025, 'gen_deer_elk_pubpriv', '2025 General Season Deer and Elk Public vs Private Harvest Summary',
     'https://myodfw.com/sites/default/files/2026-04/2025_General_Season_Deer_and_Elk_PublicVPrivate_Harvest_Summary.pdf'),
    (2025, 'deer_antlerless', '2025 Antlerless Deer Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Antlerless_Deer_Harvest_Summary.pdf'),
    (2025, 'elk_gen_antlerless_damage', '2025 General Season Antlerless Elk Damage Harvest',
     'https://myodfw.com/sites/default/files/2026-04/General_Season_Antlerless_Elk_Damage_Harvest_Summary.pdf'),
    (2025, 'deer_archery', '2025 Archery Buck Deer Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Buck_Deer_Archery_Harvest_Summary.pdf'),
    (2025, 'elk_archery', '2025 Archery Elk Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Elk_Archery_Harvest_Summary.pdf'),
    (2025, 'bear', '2025 Black Bear Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Black_Bear_Harvest_Summary.pdf'),
    (2025, 'sheep', '2025 Bighorn Sheep Harvest',
     'https://myodfw.com/sites/default/files/2026-02/Bighorn_Sheep_Harvest_Summary_2025.pdf'),
    (2025, 'cougar', '2025 Cougar Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Cougar_Harvest_Summary.pdf'),
    (2025, 'deer_muzzleloader', '2025 Muzzleloader Buck Deer Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Buck_Deer_Muzzleloader_Harvest_Summary.pdf'),
    (2025, 'elk_muzzleloader', '2025 Muzzleloader Elk Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Elk_Muzzleloader_Harvest_Summary.pdf'),
    (2025, 'pronghorn', '2025 Pronghorn Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Pronghorn_Harvest_Summary.pdf'),
    (2025, 'deer_alw', '2025 Any Legal Weapon Buck Deer Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Buck_Deer_Any_Legal_Weapon_Harvest_Summary.pdf'),
    (2025, 'elk_alw', '2025 Any Legal Weapon Elk Harvest',
     'https://myodfw.com/sites/default/files/2026-04/Elk_Any_Legal_Weapon_Harvest_Summary.pdf'),
    (2025, 'goat', '2025 Rocky Mountain Goat Harvest',
     'https://myodfw.com/sites/default/files/2026-02/Rocky_Mountain_Goat_Harvest_Summary_2025.pdf'),
    (2024, 'deer_antlerless_pubpriv', '2024 Antlerless Deer Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/antlerless_public_VS_Private_harvest_summary.pdf'),
    (2024, 'deer_buck_pubpriv', '2024 Buck Deer Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/buck_deer_public_VS_Private_harvest_summary.pdf'),
    (2024, 'elk_pubpriv', '2024 Elk Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/elk_public_VS_Private_harvest_summary.pdf'),
    (2024, 'gen_deer_elk_pubpriv', '2024 General Season Deer and Elk Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/2024_General_Season_Deer_and_Elk_PublicVPrivate_Harvest_Summary.pdf'),
    (2024, 'deer_antlerless', '2024 Antlerless Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Antlerless_Deer_Harvest_Summary.pdf'),
    (2024, 'elk_gen_antlerless_damage', '2024 General Season Antlerless Elk Damage Harvest',
     'https://myodfw.com/sites/default/files/2025-12/General_Season_Antlerless_Elk_Damage_Harvest_Summary.pdf'),
    (2024, 'deer_archery', '2024 Archery Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Buck_Deer_Archery_Harvest_Summary.pdf'),
    (2024, 'elk_archery', '2024 Archery Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Elk_Archery_Harvest_Summary.pdf'),
    (2024, 'bear', '2024 Black Bear Harvest',
     'https://myodfw.com/sites/default/files/2026-01/Black_Bear_Harvest_Summary.pdf'),
    (2024, 'sheep', '2024 Bighorn Sheep Harvest',
     'https://myodfw.com/sites/default/files/2026-02/Bighorn_Sheep_Harvest_Summary_2024.pdf'),
    (2024, 'cougar', '2024 Cougar Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Cougar_Harvest_Summary.pdf'),
    (2024, 'deer_muzzleloader', '2024 Muzzleloader Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Buck_Deer_Muzzleloader_Harvest_Summary.pdf'),
    (2024, 'elk_muzzleloader', '2024 Muzzleloader Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Elk_Muzzleloader_Harvest_Summary.pdf'),
    (2024, 'pronghorn', '2024 Pronghorn Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Pronghorn_Harvest_Summary.pdf'),
    (2024, 'deer_alw', '2024 Any Legal Weapon Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Buck_Deer_Any_Legal_Weapon_Harvest_Summary.pdf'),
    (2024, 'elk_alw', '2024 Any Legal Weapon Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2024/Elk_Any_Legal_Weapon_Harvest_Summary.pdf'),
    (2024, 'goat', '2024 Rocky Mountain Goat Harvest',
     'https://myodfw.com/sites/default/files/2026-02/Rocky_Mountain_Goat_Harvest_Summary_2024.pdf'),
    (2023, 'deer_antlerless_pubpriv', '2023 Antlerless Deer Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Antlerless Deer Public vs Private Harvest Summary.pdf'),
    (2023, 'deer_buck_pubpriv', '2023 Buck Deer Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Buck Deer Public vs Private Harvest Summary.pdf'),
    (2023, 'elk_pubpriv', '2023 Elk Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Elk Public vs Private Harvest Summary.pdf'),
    (2023, 'gen_deer_elk_pubpriv', '2023 General Season Deer and Elk Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 General Season Deer and Elk Public vs Private Harvest Summary.pdf'),
    (2023, 'deer_antlerless', '2023 Antlerless Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Antlerless Deer Harvest Summary.pdf'),
    (2023, 'elk_gen_antlerless_damage', '2023 General Season Antlerless Elk Damage Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 General Season Antlerless Elk Damage Harvest Summary.pdf'),
    (2023, 'deer_archery', '2023 Archery Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Buck Deer Archery Harvest Summary.pdf'),
    (2023, 'elk_archery', '2023 Archery Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Elk Archery Harvest Summary.pdf'),
    (2023, 'bear', '2023 Black Bear Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Black Bear Harvest Summary.pdf'),
    (2023, 'sheep', '2023 Bighorn Sheep Harvest',
     'https://myodfw.com/sites/default/files/2026-02/Bighorn_Sheep_Harvest_Summary_2023.pdf'),
    (2023, 'cougar', '2023 Cougar Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Cougar Harvest Summary.pdf'),
    (2023, 'deer_muzzleloader', '2023 Muzzleloader Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Buck Deer Muzzleloader Harvest Summary.pdf'),
    (2023, 'elk_muzzleloader', '2023 Muzzleloader Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Elk Muzzleloader Harvest Summary.pdf'),
    (2023, 'pronghorn', '2023 Pronghorn Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Pronghorn Harvest Summary.pdf'),
    (2023, 'deer_alw', '2023 Any Legal Weapon Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Buck Deer Any Legal Weapon Harvest Summary.pdf'),
    (2023, 'elk_alw', '2023 Any Legal Weapon Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2023/2023 Elk Any Legal Weapon Harvest Summary.pdf'),
    (2023, 'goat', '2023 Rocky Mountain Goat Harvest',
     'https://myodfw.com/sites/default/files/2026-02/Rocky_Mountain_Goat_Harvest_Summary_2023.pdf'),
    (2022, 'deer_antlerless_pubpriv', '2022 Antlerless Deer Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Antlerless Deer Public vs Private Harvest Summary.pdf'),
    (2022, 'deer_buck_pubpriv', '2022 Buck Deer Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Buck Deer Public vs Private Harvest Summary.pdf'),
    (2022, 'elk_pubpriv', '2022 Elk Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Elk Public vs Private Harvest Summary.pdf'),
    (2022, 'gen_deer_elk_pubpriv', '2022 General Season Deer and Elk Public vs Private Harvest Summary',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 General Season Deer and Elk Public vs Private Harvest Summary.pdf'),
    (2022, 'deer_antlerless', '2022 Antlerless Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Antlerless Deer Harvest Summary.pdf'),
    (2022, 'elk_gen_antlerless_damage', '2022 General Season Antlerless Elk Damage Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 General Season Antlerless Elk Damage Harvest Summary.pdf'),
    (2022, 'deer_archery', '2022 Archery Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Buck Deer Archery Harvest Summary.pdf'),
    (2022, 'elk_archery', '2022 Archery Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Elk Archery Harvest Summary.pdf'),
    (2022, 'bear', '2022 Black Bear Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Black Bear Harvest Summary.pdf'),
    (2022, 'sheep', '2022 Bighorn Sheep Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Bighorn Sheep Harvest Summary.pdf'),
    (2022, 'cougar', '2022 Cougar Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Cougar Harvest Summary.pdf'),
    (2022, 'deer_muzzleloader', '2022 Muzzleloader Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Buck Deer Muzzleloader Harvest Summary.pdf'),
    (2022, 'elk_muzzleloader', '2022 Muzzleloader Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Elk Muzzleloader Harvest Summary.pdf'),
    (2022, 'pronghorn', '2022 Pronghorn Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Pronghorn Harvest Summary.pdf'),
    (2022, 'deer_alw', '2022 Any Legal Weapon Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Buck Deer Any Legal Weapon Harvest Summary.pdf'),
    (2022, 'elk_alw', '2022 Any Legal Weapon Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Elk Any Legal Weapon Harvest Summary.pdf'),
    (2022, 'goat', '2022 Rocky Mountain Goat Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2022/2022 Rocky Mtn Goat Harvest Summary.pdf'),
    (2021, 'deer_antlerless', '2021 Antlerless Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Antlerless Deer Harvest Summary.pdf'),
    (2021, 'elk_gen_antlerless_damage', '2021 General Season Antlerless Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 General Season Antlerless Elk Damage Tag Harvest Summary.pdf'),
    (2021, 'deer_archery', '2021 Archery Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Buck Deer Archery Harvest Summary.pdf'),
    (2021, 'elk_archery', '2021 Archery Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Elk Archery Harvest Summary.pdf'),
    (2021, 'bear', '2021 Black Bear Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Black Bear Harvest Summary.pdf'),
    (2021, 'sheep', '2021 Bighorn Sheep Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Bighorn Sheep Harvest Summary.pdf'),
    (2021, 'cougar', '2021 Cougar Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Cougar Harvest Summary.pdf'),
    (2021, 'deer_muzzleloader', '2021 Muzzleloader Buck Deer Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Buck Deer Muzzleloader Harvest Summary.pdf'),
    (2021, 'elk_muzzleloader', '2021 Muzzleloader Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Elk Muzzleloader Harvest Summary.pdf'),
    (2021, 'pronghorn', '2021 Pronghorn Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Pronghorn Harvest Summary.pdf'),
    (2021, 'deer_alw', '2021 Any Legal Weapon Buck Deer Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Buck Deer Any Legal Weapon Harvest Summary.pdf'),
    (2021, 'elk_alw', '2021 Any Legal Weapon Elk Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Elk Any Legal Weapon Harvest Summary.pdf'),
    (2021, 'goat', '2021 Rocky Mountain Goat Harvest',
     'https://dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2021/2021 Rocky Mountain Goat Harvest Summary.pdf'),
    (2020, 'deer_antlerless', '2020 Antlerless Deer Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Antlerless Deer Harvest Summary.pdf'),
    (2020, 'elk_gen_antlerless_damage', '2020 General Season Antlerless Elk Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 General Season Antlerless Elk Damage Harvest Summary.pdf'),
    (2020, 'deer_archery', '2020 Archery Buck Deer Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Buck Deer Archery Harvest Summary.pdf'),
    (2020, 'elk_archery', '2020 Archery Elk Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Elk Archery Harvest Summary.pdf'),
    (2020, 'bear', '2020 Black Bear Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Black Bear Harvest Summary.pdf'),
    (2020, 'sheep', '2020 Bighorn Sheep Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Bighorn Sheep Harvest Summary.pdf'),
    (2020, 'cougar', '2020 Cougar Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Cougar Harvest Summary.pdf'),
    (2020, 'deer_muzzleloader', '2020 Muzzleloader Buck Deer Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Buck Deer ML Harvest Summary.pdf'),
    (2020, 'elk_muzzleloader', '2020 Muzzleloader Elk Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Elk ML Harvest Summary.pdf'),
    (2020, 'pronghorn', '2020 Pronghorn Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Pronghorn Harvest Summary.pdf'),
    (2020, 'deer_alw', '2020 Rifle Buck Deer Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Buck Deer ALW Harvest Summary.pdf'),
    (2020, 'elk_alw', '2020 Rifle Elk Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Elk ALW Harvest Summary.pdf'),
    (2020, 'goat', '2020 Rocky Mountain Goat Harvest',
     'https://www.dfw.state.or.us/resources/hunting/big_game/controlled_hunts/docs/hunts_summary_reports/2020/2020 Rocky Mtn Goat Harvest Summary.pdf'),
]


# Spring turkey unit tables and Game Bird Program staff summaries (statewide turkey lines)
EXTRA = [
    ("2020_turkey.pdf", "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2021/2020%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf"),
    ("2021_turkey.pdf", "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2021/2021%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf"),
    ("2022_turkey.pdf", "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2022%20Spring%20Turkey%20Harvest%20Summary.pdf"),
    ("2023_turkey.pdf", "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2023%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf"),
    ("2024_turkey.pdf", "https://dfw.state.or.us/resources/hunting/upland_bird/harvest/docs/2024%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf"),
    ("2025_turkey.pdf", "https://myodfw.com/sites/default/files/2026-03/2025%20Spring%20Turkey%20Harvest%20by%20Management%20Unit.pdf"),
    ("gamebird_staff_2024.pdf", "https://www.dfw.state.or.us/agency/commission/minutes/24/04_Apr/EX%20B_PDF%20FILES/Exhibit%20B_Attachment%203%202024%20Game%20Bird%20Program%20Staff%20Summary.pdf"),
    ("gamebird_staff_2025.pdf", "https://www.dfw.state.or.us/agency/commission/minutes/25/04_April/Exhibit%20C%20Game%20Birds/Exhibit%20C_Attachment%204_2025%20Game%20Bird%20Program%20Staff%20Summary.pdf"),
    ("gamebird_staff_2026.pdf", "https://myodfw.com/sites/default/files/2026-04/Exhibit%20B_Attachment%203%202026%20Game%20Bird%20Program%20Staff%20Summary.pdf"),
]
# ODFW Wildlife Management Unit layer: unit numbers and names used to key unit ids
WMU_QUERY = ("https://nrimp.dfw.state.or.us/arcgis/rest/services/Compass/ODFW_WildlifeManagementUnits/MapServer/0/"
             "query?where=1%3D1&outFields=*&returnGeometry=false&f=json")


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    idx = s.get(INDEX, timeout=60)
    idx.raise_for_status()
    open(os.path.join(raw, "index.html"), "wb").write(idx.content)
    manifest = []
    for year, key, title, url in DOCS:
        out = os.path.join(raw, f"{year}_{key}.pdf")
        if not (os.path.exists(out) and os.path.getsize(out) > 1000):
            r = s.get(quote(url, safe=":/"), timeout=120)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                raise SystemExit(f"not a PDF: {url}")
            open(out, "wb").write(r.content)
            time.sleep(0.5)
        txt = out[:-4] + ".txt"
        subprocess.run(["pdftotext", "-layout", out, txt], check=True)
        manifest.append({"year": year, "key": key, "title": title, "url": url,
                         "file": os.path.basename(out), "bytes": os.path.getsize(out)})
        print(year, key, os.path.getsize(out))
    json.dump(manifest, open(os.path.join(raw, "manifest.json"), "w"), indent=1)
    for name, url in EXTRA:
        out = os.path.join(raw, name)
        if not (os.path.exists(out) and os.path.getsize(out) > 1000):
            r = s.get(url, timeout=120)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                raise SystemExit(f"not a PDF: {url}")
            open(out, "wb").write(r.content)
        subprocess.run(["pdftotext", "-layout", out, out[:-4] + ".txt"], check=True)
        print(name, os.path.getsize(out))
    r = s.get(WMU_QUERY, timeout=120)
    r.raise_for_status()
    open(os.path.join(raw, "wmu_query.json"), "wb").write(r.content)
    print("wmu_query.json", len(r.content))


if __name__ == "__main__":
    main()
