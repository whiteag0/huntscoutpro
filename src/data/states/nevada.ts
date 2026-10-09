// ============================================================
// Nevada — Verified Harvest Data (Nevada Department of Wildlife, ndow.org)
// ============================================================
// Report series: NDOW "Big Game Hunt Statistics" — <Species> Harvest by Unit Group
// (index page: https://www.ndow.org/blog/hunt-statistics/). NDOW marks every year
// "Preliminary – Subject to Revision". Files actually opened and parsed:
//   2025 season:
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Antelope-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Bear-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-California-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Desert-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Elk-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Moose-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Mountain-Goat-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Mule-Deer-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Nevada-Big-Game-Hunt-Data.xlsx  ("2025 Hunt Summary" sheet — used for ALL 2025 rows)
//     https://www.ndow.org/wp-content/uploads/2026/03/2025-Rocky-Bighorn-Harvest-by-Unit-Group.pdf
//   2024 season:
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Antelope-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Black-Bear-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-California-Bighorn-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Desert-Bighorn-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Elk-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Moose-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Mountain-Goat-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-NR-Guided-Mule-Deer-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/2024-Rocky-Bighorn-Harvest-by-Unit-Group.pdf
//     https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/07/2024-Mule-Deer-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2025/09/2024-Junior-Mule-Deer-Harvest-by-Units.pdf
//   2023 season:
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-Antelope-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-Black-Bear-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-California-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-Desert-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-Elk-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-Mule-Deer-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/02/2023-Rocky-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2024/03/2023-Mountain-Goat-Harvest-by-Unit-Group.pdf
//   2022 season:
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-Antelope-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-Black-Bear-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-California-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-Desert-Bighorn-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-Elk-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-Mountain-Goat-Harvest-by-Unit-Group.pdf
//     https://www.ndow.org/wp-content/uploads/2023/02/2022-Mule-Deer-Harvest-by-Unit-Group.pdf
//
// Years per species: elk, mule-deer, pronghorn, sheep, bear 2022–2025; goat 2022–2025
// (2024: only units with hunters afield); moose 2024–2025 (Nevada's first moose season was 2024).
// No unit-level data exists/was found for mountain lion (statewide quota system) or
// whitetail (Nevada has no whitetail season); turkey handled elsewhere.
//
// Method: NDOW reports one row per hunt (hunt type x residency x weapon x season) per unit
// GROUP. Rows are summed per unit group: totalHunters = "Hunters Afield", totalHarvest =
// "Successful Hunters", successRate = harvest / hunters x 100 (1 decimal). Only public-draw
// hunts are counted (antlered/antlerless/spike/junior/NR-guided deer, horns longer/shorter
// than ears, ram/ewe/either-sex, moose antlered). Excluded: Landowner Damage Compensation,
// Elk Incentive, Private Lands, Depredation, Dream, Silver State, PIW and Heritage tags, and
// any "Any Open Unit" hunt. Unit groups with 0 hunters afield in a year are omitted.
// Bighorn sheep combines Desert (Nelson), California and Rocky Mountain bighorn hunts.
//
// Unit ids: NDOW unit-group numbers. '101-109' = range 101–109; '061-062-064-066-068' =
// NDOW group '061, 062, 064, 066–068' (exact text in NV_UNIT_REGIONS). A two-unit list that
// would read as a range is written with '-and-' (e.g. '194-and-196' = units 194 and 196 only,
// NOT 195). Sub-unit letters (108B, 144A, 066A, 113N...) were folded into the parent unit,
// except bighorn sheep areas 035E/035W, 173N/173S, 181E/181W which NDOW hunts separately.
//
// Region names: mountain ranges/places named for each unit in NDOW Hunt Information Sheets
// (https://www.ndow.org/blog/hunt-information-sheets/) and the 2025-2026 Big Game Status Book
// (https://www.ndow.org/wp-content/uploads/2026/10/Big-Game-Status-Book_2026_10.2.26.pdf);
// management area + counties from NDOW's unit polygons (ArcGIS NDOWGameMgmtUnits feature
// service) intersected with US Census TIGERweb county boundaries.
// ============================================================

import type { RealGMUData } from './wyoming';

// Elk — 109 rows, 2022–2025. 2025 public-draw total: 1,631 harvested / 3,720 hunters afield
export const NV_ELK_DATA: RealGMUData[] = [
  { gmu: '051', species: 'elk', year: 2025, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },
  { gmu: '061-and-071', species: 'elk', year: 2025, totalHarvest: 110, totalHunters: 369, successRate: 29.8 },
  { gmu: '062', species: 'elk', year: 2025, totalHarvest: 65, totalHunters: 175, successRate: 37.1 },
  { gmu: '062-064-066-068', species: 'elk', year: 2025, totalHarvest: 23, totalHunters: 57, successRate: 40.4 },
  { gmu: '062-and-066', species: 'elk', year: 2025, totalHarvest: 10, totalHunters: 24, successRate: 41.7 },
  { gmu: '072-074', species: 'elk', year: 2025, totalHarvest: 85, totalHunters: 203, successRate: 41.9 },
  { gmu: '072-075', species: 'elk', year: 2025, totalHarvest: 19, totalHunters: 76, successRate: 25.0 },
  { gmu: '075', species: 'elk', year: 2025, totalHarvest: 28, totalHunters: 48, successRate: 58.3 },
  { gmu: '076-077-079-081', species: 'elk', year: 2025, totalHarvest: 335, totalHunters: 696, successRate: 48.1 },
  { gmu: '078-105-107-109', species: 'elk', year: 2025, totalHarvest: 51, totalHunters: 144, successRate: 35.4 },
  { gmu: '078-and-107', species: 'elk', year: 2025, totalHarvest: 18, totalHunters: 92, successRate: 19.6 },
  { gmu: '091', species: 'elk', year: 2025, totalHarvest: 15, totalHunters: 23, successRate: 65.2 },
  { gmu: '104-108-121', species: 'elk', year: 2025, totalHarvest: 161, totalHunters: 302, successRate: 53.3 },
  { gmu: '105-106-109', species: 'elk', year: 2025, totalHarvest: 0, totalHunters: 7, successRate: 0.0 },
  { gmu: '108-131-132', species: 'elk', year: 2025, totalHarvest: 61, totalHunters: 123, successRate: 49.6 },
  { gmu: '111-112', species: 'elk', year: 2025, totalHarvest: 54, totalHunters: 120, successRate: 45.0 },
  { gmu: '111-115', species: 'elk', year: 2025, totalHarvest: 113, totalHunters: 176, successRate: 64.2 },
  { gmu: '113', species: 'elk', year: 2025, totalHarvest: 15, totalHunters: 43, successRate: 34.9 },
  { gmu: '114', species: 'elk', year: 2025, totalHarvest: 2, totalHunters: 10, successRate: 20.0 },
  { gmu: '114-115', species: 'elk', year: 2025, totalHarvest: 47, totalHunters: 121, successRate: 38.8 },
  { gmu: '161-164', species: 'elk', year: 2025, totalHarvest: 28, totalHunters: 161, successRate: 17.4 },
  { gmu: '161-164-171-173', species: 'elk', year: 2025, totalHarvest: 36, totalHunters: 78, successRate: 46.2 },
  { gmu: '221', species: 'elk', year: 2025, totalHarvest: 4, totalHunters: 35, successRate: 11.4 },
  { gmu: '221-223', species: 'elk', year: 2025, totalHarvest: 116, totalHunters: 234, successRate: 49.6 },
  { gmu: '222-223', species: 'elk', year: 2025, totalHarvest: 58, totalHunters: 118, successRate: 49.2 },
  { gmu: '231', species: 'elk', year: 2025, totalHarvest: 159, totalHunters: 258, successRate: 61.6 },
  { gmu: '241-242', species: 'elk', year: 2025, totalHarvest: 12, totalHunters: 19, successRate: 63.2 },
  { gmu: '262', species: 'elk', year: 2025, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },
  { gmu: '051', species: 'elk', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },
  { gmu: '061-and-071', species: 'elk', year: 2024, totalHarvest: 128, totalHunters: 334, successRate: 38.3 },
  { gmu: '062', species: 'elk', year: 2024, totalHarvest: 39, totalHunters: 117, successRate: 33.3 },
  { gmu: '062-064-066-068', species: 'elk', year: 2024, totalHarvest: 24, totalHunters: 54, successRate: 44.4 },
  { gmu: '062-and-066', species: 'elk', year: 2024, totalHarvest: 11, totalHunters: 56, successRate: 19.6 },
  { gmu: '072-074', species: 'elk', year: 2024, totalHarvest: 109, totalHunters: 270, successRate: 40.4 },
  { gmu: '072-075', species: 'elk', year: 2024, totalHarvest: 31, totalHunters: 81, successRate: 38.3 },
  { gmu: '075', species: 'elk', year: 2024, totalHarvest: 18, totalHunters: 33, successRate: 54.5 },
  { gmu: '076-077-079-081', species: 'elk', year: 2024, totalHarvest: 279, totalHunters: 471, successRate: 59.2 },
  { gmu: '078-105-107-109', species: 'elk', year: 2024, totalHarvest: 52, totalHunters: 130, successRate: 40.0 },
  { gmu: '078-and-107', species: 'elk', year: 2024, totalHarvest: 24, totalHunters: 78, successRate: 30.8 },
  { gmu: '091', species: 'elk', year: 2024, totalHarvest: 12, totalHunters: 22, successRate: 54.5 },
  { gmu: '104-108-121', species: 'elk', year: 2024, totalHarvest: 147, totalHunters: 261, successRate: 56.3 },
  { gmu: '105-106-109', species: 'elk', year: 2024, totalHarvest: 5, totalHunters: 10, successRate: 50.0 },
  { gmu: '108-131-132', species: 'elk', year: 2024, totalHarvest: 36, totalHunters: 117, successRate: 30.8 },
  { gmu: '111-112', species: 'elk', year: 2024, totalHarvest: 45, totalHunters: 97, successRate: 46.4 },
  { gmu: '111-115', species: 'elk', year: 2024, totalHarvest: 121, totalHunters: 162, successRate: 74.7 },
  { gmu: '113', species: 'elk', year: 2024, totalHarvest: 12, totalHunters: 31, successRate: 38.7 },
  { gmu: '114-115', species: 'elk', year: 2024, totalHarvest: 57, totalHunters: 136, successRate: 41.9 },
  { gmu: '161-164', species: 'elk', year: 2024, totalHarvest: 26, totalHunters: 128, successRate: 20.3 },
  { gmu: '161-164-171-173', species: 'elk', year: 2024, totalHarvest: 34, totalHunters: 83, successRate: 41.0 },
  { gmu: '221', species: 'elk', year: 2024, totalHarvest: 9, totalHunters: 39, successRate: 23.1 },
  { gmu: '221-223', species: 'elk', year: 2024, totalHarvest: 125, totalHunters: 279, successRate: 44.8 },
  { gmu: '222-223', species: 'elk', year: 2024, totalHarvest: 48, totalHunters: 115, successRate: 41.7 },
  { gmu: '231', species: 'elk', year: 2024, totalHarvest: 137, totalHunters: 271, successRate: 50.6 },
  { gmu: '241-242', species: 'elk', year: 2024, totalHarvest: 15, totalHunters: 21, successRate: 71.4 },
  { gmu: '262', species: 'elk', year: 2024, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },
  { gmu: '051', species: 'elk', year: 2023, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },
  { gmu: '061-and-071', species: 'elk', year: 2023, totalHarvest: 105, totalHunters: 341, successRate: 30.8 },
  { gmu: '062', species: 'elk', year: 2023, totalHarvest: 25, totalHunters: 83, successRate: 30.1 },
  { gmu: '062-064-066-068', species: 'elk', year: 2023, totalHarvest: 19, totalHunters: 55, successRate: 34.5 },
  { gmu: '062-and-066', species: 'elk', year: 2023, totalHarvest: 16, totalHunters: 58, successRate: 27.6 },
  { gmu: '072-074', species: 'elk', year: 2023, totalHarvest: 88, totalHunters: 238, successRate: 37.0 },
  { gmu: '072-075', species: 'elk', year: 2023, totalHarvest: 22, totalHunters: 69, successRate: 31.9 },
  { gmu: '075', species: 'elk', year: 2023, totalHarvest: 19, totalHunters: 35, successRate: 54.3 },
  { gmu: '076-077-079-081', species: 'elk', year: 2023, totalHarvest: 188, totalHunters: 330, successRate: 57.0 },
  { gmu: '078-105-107-109', species: 'elk', year: 2023, totalHarvest: 73, totalHunters: 164, successRate: 44.5 },
  { gmu: '078-and-107', species: 'elk', year: 2023, totalHarvest: 39, totalHunters: 71, successRate: 54.9 },
  { gmu: '091', species: 'elk', year: 2023, totalHarvest: 20, totalHunters: 26, successRate: 76.9 },
  { gmu: '104-108-121', species: 'elk', year: 2023, totalHarvest: 117, totalHunters: 205, successRate: 57.1 },
  { gmu: '105-106-109', species: 'elk', year: 2023, totalHarvest: 2, totalHunters: 6, successRate: 33.3 },
  { gmu: '108-131-132', species: 'elk', year: 2023, totalHarvest: 41, totalHunters: 99, successRate: 41.4 },
  { gmu: '111-112', species: 'elk', year: 2023, totalHarvest: 43, totalHunters: 111, successRate: 38.7 },
  { gmu: '111-115', species: 'elk', year: 2023, totalHarvest: 119, totalHunters: 182, successRate: 65.4 },
  { gmu: '113', species: 'elk', year: 2023, totalHarvest: 19, totalHunters: 48, successRate: 39.6 },
  { gmu: '114-115', species: 'elk', year: 2023, totalHarvest: 63, totalHunters: 162, successRate: 38.9 },
  { gmu: '161-164', species: 'elk', year: 2023, totalHarvest: 8, totalHunters: 61, successRate: 13.1 },
  { gmu: '161-164-171-173', species: 'elk', year: 2023, totalHarvest: 31, totalHunters: 78, successRate: 39.7 },
  { gmu: '221', species: 'elk', year: 2023, totalHarvest: 25, totalHunters: 90, successRate: 27.8 },
  { gmu: '221-223', species: 'elk', year: 2023, totalHarvest: 106, totalHunters: 238, successRate: 44.5 },
  { gmu: '222-223', species: 'elk', year: 2023, totalHarvest: 58, totalHunters: 141, successRate: 41.1 },
  { gmu: '231', species: 'elk', year: 2023, totalHarvest: 120, totalHunters: 208, successRate: 57.7 },
  { gmu: '241-242', species: 'elk', year: 2023, totalHarvest: 10, totalHunters: 22, successRate: 45.5 },
  { gmu: '262', species: 'elk', year: 2023, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },
  { gmu: '051', species: 'elk', year: 2022, totalHarvest: 4, totalHunters: 11, successRate: 36.4 },
  { gmu: '061-and-071', species: 'elk', year: 2022, totalHarvest: 126, totalHunters: 342, successRate: 36.8 },
  { gmu: '062', species: 'elk', year: 2022, totalHarvest: 35, totalHunters: 86, successRate: 40.7 },
  { gmu: '062-064-066-068', species: 'elk', year: 2022, totalHarvest: 14, totalHunters: 33, successRate: 42.4 },
  { gmu: '072', species: 'elk', year: 2022, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },
  { gmu: '072-074', species: 'elk', year: 2022, totalHarvest: 84, totalHunters: 241, successRate: 34.9 },
  { gmu: '072-075', species: 'elk', year: 2022, totalHarvest: 3, totalHunters: 30, successRate: 10.0 },
  { gmu: '075', species: 'elk', year: 2022, totalHarvest: 11, totalHunters: 23, successRate: 47.8 },
  { gmu: '076-077-079-081', species: 'elk', year: 2022, totalHarvest: 181, totalHunters: 279, successRate: 64.9 },
  { gmu: '078-105-107-109', species: 'elk', year: 2022, totalHarvest: 87, totalHunters: 226, successRate: 38.5 },
  { gmu: '091', species: 'elk', year: 2022, totalHarvest: 20, totalHunters: 25, successRate: 80.0 },
  { gmu: '104-108-121', species: 'elk', year: 2022, totalHarvest: 118, totalHunters: 202, successRate: 58.4 },
  { gmu: '108-131-132', species: 'elk', year: 2022, totalHarvest: 46, totalHunters: 92, successRate: 50.0 },
  { gmu: '111-112', species: 'elk', year: 2022, totalHarvest: 51, totalHunters: 122, successRate: 41.8 },
  { gmu: '111-115', species: 'elk', year: 2022, totalHarvest: 139, totalHunters: 217, successRate: 64.1 },
  { gmu: '113', species: 'elk', year: 2022, totalHarvest: 13, totalHunters: 42, successRate: 31.0 },
  { gmu: '114-115', species: 'elk', year: 2022, totalHarvest: 65, totalHunters: 151, successRate: 43.0 },
  { gmu: '161-164', species: 'elk', year: 2022, totalHarvest: 14, totalHunters: 101, successRate: 13.9 },
  { gmu: '161-164-171-173', species: 'elk', year: 2022, totalHarvest: 36, totalHunters: 96, successRate: 37.5 },
  { gmu: '162', species: 'elk', year: 2022, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },
  { gmu: '221', species: 'elk', year: 2022, totalHarvest: 26, totalHunters: 69, successRate: 37.7 },
  { gmu: '221-223', species: 'elk', year: 2022, totalHarvest: 135, totalHunters: 220, successRate: 61.4 },
  { gmu: '222', species: 'elk', year: 2022, totalHarvest: 1, totalHunters: 13, successRate: 7.7 },
  { gmu: '222-223', species: 'elk', year: 2022, totalHarvest: 31, totalHunters: 85, successRate: 36.5 },
  { gmu: '231', species: 'elk', year: 2022, totalHarvest: 117, totalHunters: 227, successRate: 51.5 },
  { gmu: '241-242', species: 'elk', year: 2022, totalHarvest: 13, totalHunters: 20, successRate: 65.0 },
  { gmu: '262', species: 'elk', year: 2022, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },
];

// Mule deer — 179 rows, 2022–2025. 2025 public-draw total: 5,455 harvested / 11,900 hunters afield
export const NV_MULE_DEER_DATA: RealGMUData[] = [
  { gmu: '011-013', species: 'mule-deer', year: 2025, totalHarvest: 37, totalHunters: 85, successRate: 43.5 },
  { gmu: '014', species: 'mule-deer', year: 2025, totalHarvest: 17, totalHunters: 25, successRate: 68.0 },
  { gmu: '015', species: 'mule-deer', year: 2025, totalHarvest: 12, totalHunters: 22, successRate: 54.5 },
  { gmu: '021', species: 'mule-deer', year: 2025, totalHarvest: 30, totalHunters: 57, successRate: 52.6 },
  { gmu: '022', species: 'mule-deer', year: 2025, totalHarvest: 46, totalHunters: 81, successRate: 56.8 },
  { gmu: '031', species: 'mule-deer', year: 2025, totalHarvest: 99, totalHunters: 161, successRate: 61.5 },
  { gmu: '032', species: 'mule-deer', year: 2025, totalHarvest: 37, totalHunters: 92, successRate: 40.2 },
  { gmu: '033', species: 'mule-deer', year: 2025, totalHarvest: 24, totalHunters: 41, successRate: 58.5 },
  { gmu: '034', species: 'mule-deer', year: 2025, totalHarvest: 13, totalHunters: 27, successRate: 48.1 },
  { gmu: '035', species: 'mule-deer', year: 2025, totalHarvest: 25, totalHunters: 60, successRate: 41.7 },
  { gmu: '041-042', species: 'mule-deer', year: 2025, totalHarvest: 16, totalHunters: 37, successRate: 43.2 },
  { gmu: '043-044-046', species: 'mule-deer', year: 2025, totalHarvest: 93, totalHunters: 166, successRate: 56.0 },
  { gmu: '045', species: 'mule-deer', year: 2025, totalHarvest: 30, totalHunters: 58, successRate: 51.7 },
  { gmu: '051', species: 'mule-deer', year: 2025, totalHarvest: 137, totalHunters: 262, successRate: 52.3 },
  { gmu: '061-062-064-066-068', species: 'mule-deer', year: 2025, totalHarvest: 742, totalHunters: 1670, successRate: 44.4 },
  { gmu: '065', species: 'mule-deer', year: 2025, totalHarvest: 32, totalHunters: 40, successRate: 80.0 },
  { gmu: '071-079-091', species: 'mule-deer', year: 2025, totalHarvest: 831, totalHunters: 1583, successRate: 52.5 },
  { gmu: '081', species: 'mule-deer', year: 2025, totalHarvest: 34, totalHunters: 55, successRate: 61.8 },
  { gmu: '101-109', species: 'mule-deer', year: 2025, totalHarvest: 775, totalHunters: 2220, successRate: 34.9 },
  { gmu: '111-113', species: 'mule-deer', year: 2025, totalHarvest: 187, totalHunters: 349, successRate: 53.6 },
  { gmu: '114-115', species: 'mule-deer', year: 2025, totalHarvest: 109, totalHunters: 211, successRate: 51.7 },
  { gmu: '115', species: 'mule-deer', year: 2025, totalHarvest: 5, totalHunters: 7, successRate: 71.4 },
  { gmu: '121', species: 'mule-deer', year: 2025, totalHarvest: 101, totalHunters: 149, successRate: 67.8 },
  { gmu: '131-134', species: 'mule-deer', year: 2025, totalHarvest: 78, totalHunters: 112, successRate: 69.6 },
  { gmu: '141-145', species: 'mule-deer', year: 2025, totalHarvest: 426, totalHunters: 838, successRate: 50.8 },
  { gmu: '151-156', species: 'mule-deer', year: 2025, totalHarvest: 349, totalHunters: 783, successRate: 44.6 },
  { gmu: '161-164', species: 'mule-deer', year: 2025, totalHarvest: 149, totalHunters: 387, successRate: 38.5 },
  { gmu: '171-173', species: 'mule-deer', year: 2025, totalHarvest: 336, totalHunters: 990, successRate: 33.9 },
  { gmu: '181-184', species: 'mule-deer', year: 2025, totalHarvest: 124, totalHunters: 267, successRate: 46.4 },
  { gmu: '192', species: 'mule-deer', year: 2025, totalHarvest: 28, totalHunters: 62, successRate: 45.2 },
  { gmu: '194-and-196', species: 'mule-deer', year: 2025, totalHarvest: 47, totalHunters: 63, successRate: 74.6 },
  { gmu: '195', species: 'mule-deer', year: 2025, totalHarvest: 13, totalHunters: 29, successRate: 44.8 },
  { gmu: '201-202-204-208', species: 'mule-deer', year: 2025, totalHarvest: 0, totalHunters: 7, successRate: 0.0 },
  { gmu: '201-and-204', species: 'mule-deer', year: 2025, totalHarvest: 23, totalHunters: 48, successRate: 47.9 },
  { gmu: '202-205-208', species: 'mule-deer', year: 2025, totalHarvest: 53, totalHunters: 83, successRate: 63.9 },
  { gmu: '203', species: 'mule-deer', year: 2025, totalHarvest: 26, totalHunters: 55, successRate: 47.3 },
  { gmu: '211-213', species: 'mule-deer', year: 2025, totalHarvest: 16, totalHunters: 41, successRate: 39.0 },
  { gmu: '221-223', species: 'mule-deer', year: 2025, totalHarvest: 65, totalHunters: 138, successRate: 47.1 },
  { gmu: '231', species: 'mule-deer', year: 2025, totalHarvest: 116, totalHunters: 189, successRate: 61.4 },
  { gmu: '241-245', species: 'mule-deer', year: 2025, totalHarvest: 54, totalHunters: 94, successRate: 57.4 },
  { gmu: '251-254', species: 'mule-deer', year: 2025, totalHarvest: 1, totalHunters: 27, successRate: 3.7 },
  { gmu: '261-268', species: 'mule-deer', year: 2025, totalHarvest: 38, totalHunters: 82, successRate: 46.3 },
  { gmu: '271-272', species: 'mule-deer', year: 2025, totalHarvest: 17, totalHunters: 43, successRate: 39.5 },
  { gmu: '291', species: 'mule-deer', year: 2025, totalHarvest: 64, totalHunters: 104, successRate: 61.5 },
  { gmu: '011-013', species: 'mule-deer', year: 2024, totalHarvest: 28, totalHunters: 66, successRate: 42.4 },
  { gmu: '014', species: 'mule-deer', year: 2024, totalHarvest: 12, totalHunters: 18, successRate: 66.7 },
  { gmu: '015', species: 'mule-deer', year: 2024, totalHarvest: 6, totalHunters: 18, successRate: 33.3 },
  { gmu: '021', species: 'mule-deer', year: 2024, totalHarvest: 20, totalHunters: 47, successRate: 42.6 },
  { gmu: '022', species: 'mule-deer', year: 2024, totalHarvest: 40, totalHunters: 65, successRate: 61.5 },
  { gmu: '031', species: 'mule-deer', year: 2024, totalHarvest: 103, totalHunters: 166, successRate: 62.0 },
  { gmu: '032', species: 'mule-deer', year: 2024, totalHarvest: 35, totalHunters: 93, successRate: 37.6 },
  { gmu: '033', species: 'mule-deer', year: 2024, totalHarvest: 17, totalHunters: 31, successRate: 54.8 },
  { gmu: '034', species: 'mule-deer', year: 2024, totalHarvest: 12, totalHunters: 26, successRate: 46.2 },
  { gmu: '035', species: 'mule-deer', year: 2024, totalHarvest: 29, totalHunters: 63, successRate: 46.0 },
  { gmu: '041-042', species: 'mule-deer', year: 2024, totalHarvest: 19, totalHunters: 36, successRate: 52.8 },
  { gmu: '043-044-046', species: 'mule-deer', year: 2024, totalHarvest: 69, totalHunters: 143, successRate: 48.3 },
  { gmu: '045', species: 'mule-deer', year: 2024, totalHarvest: 20, totalHunters: 50, successRate: 40.0 },
  { gmu: '051', species: 'mule-deer', year: 2024, totalHarvest: 116, totalHunters: 211, successRate: 55.0 },
  { gmu: '061-062-064-066-068', species: 'mule-deer', year: 2024, totalHarvest: 429, totalHunters: 1058, successRate: 40.5 },
  { gmu: '065', species: 'mule-deer', year: 2024, totalHarvest: 24, totalHunters: 41, successRate: 58.5 },
  { gmu: '071-079-091', species: 'mule-deer', year: 2024, totalHarvest: 656, totalHunters: 1087, successRate: 60.3 },
  { gmu: '081', species: 'mule-deer', year: 2024, totalHarvest: 46, totalHunters: 58, successRate: 79.3 },
  { gmu: '101-109', species: 'mule-deer', year: 2024, totalHarvest: 395, totalHunters: 1160, successRate: 34.1 },
  { gmu: '111-113', species: 'mule-deer', year: 2024, totalHarvest: 171, totalHunters: 344, successRate: 49.7 },
  { gmu: '114-115', species: 'mule-deer', year: 2024, totalHarvest: 80, totalHunters: 210, successRate: 38.1 },
  { gmu: '115', species: 'mule-deer', year: 2024, totalHarvest: 5, totalHunters: 6, successRate: 83.3 },
  { gmu: '121', species: 'mule-deer', year: 2024, totalHarvest: 115, totalHunters: 158, successRate: 72.8 },
  { gmu: '131-134', species: 'mule-deer', year: 2024, totalHarvest: 60, totalHunters: 90, successRate: 66.7 },
  { gmu: '141-145', species: 'mule-deer', year: 2024, totalHarvest: 330, totalHunters: 612, successRate: 53.9 },
  { gmu: '151-156', species: 'mule-deer', year: 2024, totalHarvest: 312, totalHunters: 693, successRate: 45.0 },
  { gmu: '161-164', species: 'mule-deer', year: 2024, totalHarvest: 90, totalHunters: 220, successRate: 40.9 },
  { gmu: '171-173', species: 'mule-deer', year: 2024, totalHarvest: 279, totalHunters: 1022, successRate: 27.3 },
  { gmu: '181-184', species: 'mule-deer', year: 2024, totalHarvest: 126, totalHunters: 273, successRate: 46.2 },
  { gmu: '192', species: 'mule-deer', year: 2024, totalHarvest: 31, totalHunters: 87, successRate: 35.6 },
  { gmu: '194-and-196', species: 'mule-deer', year: 2024, totalHarvest: 49, totalHunters: 76, successRate: 64.5 },
  { gmu: '195', species: 'mule-deer', year: 2024, totalHarvest: 5, totalHunters: 30, successRate: 16.7 },
  { gmu: '201-202-204-208', species: 'mule-deer', year: 2024, totalHarvest: 1, totalHunters: 8, successRate: 12.5 },
  { gmu: '201-and-204', species: 'mule-deer', year: 2024, totalHarvest: 26, totalHunters: 39, successRate: 66.7 },
  { gmu: '202-205-208', species: 'mule-deer', year: 2024, totalHarvest: 37, totalHunters: 80, successRate: 46.3 },
  { gmu: '203', species: 'mule-deer', year: 2024, totalHarvest: 43, totalHunters: 78, successRate: 55.1 },
  { gmu: '211-213', species: 'mule-deer', year: 2024, totalHarvest: 12, totalHunters: 35, successRate: 34.3 },
  { gmu: '221-223', species: 'mule-deer', year: 2024, totalHarvest: 68, totalHunters: 183, successRate: 37.2 },
  { gmu: '231', species: 'mule-deer', year: 2024, totalHarvest: 73, totalHunters: 134, successRate: 54.5 },
  { gmu: '241-245', species: 'mule-deer', year: 2024, totalHarvest: 48, totalHunters: 90, successRate: 53.3 },
  { gmu: '251-254', species: 'mule-deer', year: 2024, totalHarvest: 8, totalHunters: 26, successRate: 30.8 },
  { gmu: '261-268', species: 'mule-deer', year: 2024, totalHarvest: 28, totalHunters: 76, successRate: 36.8 },
  { gmu: '271-272', species: 'mule-deer', year: 2024, totalHarvest: 21, totalHunters: 38, successRate: 55.3 },
  { gmu: '291', species: 'mule-deer', year: 2024, totalHarvest: 59, totalHunters: 92, successRate: 64.1 },
  { gmu: '011-013', species: 'mule-deer', year: 2023, totalHarvest: 28, totalHunters: 62, successRate: 45.2 },
  { gmu: '014', species: 'mule-deer', year: 2023, totalHarvest: 7, totalHunters: 16, successRate: 43.8 },
  { gmu: '015', species: 'mule-deer', year: 2023, totalHarvest: 6, totalHunters: 18, successRate: 33.3 },
  { gmu: '021', species: 'mule-deer', year: 2023, totalHarvest: 20, totalHunters: 47, successRate: 42.6 },
  { gmu: '022', species: 'mule-deer', year: 2023, totalHarvest: 31, totalHunters: 59, successRate: 52.5 },
  { gmu: '031', species: 'mule-deer', year: 2023, totalHarvest: 75, totalHunters: 127, successRate: 59.1 },
  { gmu: '032', species: 'mule-deer', year: 2023, totalHarvest: 24, totalHunters: 69, successRate: 34.8 },
  { gmu: '033', species: 'mule-deer', year: 2023, totalHarvest: 14, totalHunters: 32, successRate: 43.8 },
  { gmu: '034', species: 'mule-deer', year: 2023, totalHarvest: 7, totalHunters: 32, successRate: 21.9 },
  { gmu: '035', species: 'mule-deer', year: 2023, totalHarvest: 23, totalHunters: 63, successRate: 36.5 },
  { gmu: '041-042', species: 'mule-deer', year: 2023, totalHarvest: 15, totalHunters: 36, successRate: 41.7 },
  { gmu: '043-044-046', species: 'mule-deer', year: 2023, totalHarvest: 52, totalHunters: 143, successRate: 36.4 },
  { gmu: '045', species: 'mule-deer', year: 2023, totalHarvest: 18, totalHunters: 46, successRate: 39.1 },
  { gmu: '051', species: 'mule-deer', year: 2023, totalHarvest: 111, totalHunters: 218, successRate: 50.9 },
  { gmu: '061-062-064-066-068', species: 'mule-deer', year: 2023, totalHarvest: 461, totalHunters: 1406, successRate: 32.8 },
  { gmu: '062-067-068', species: 'mule-deer', year: 2023, totalHarvest: 31, totalHunters: 52, successRate: 59.6 },
  { gmu: '065', species: 'mule-deer', year: 2023, totalHarvest: 24, totalHunters: 46, successRate: 52.2 },
  { gmu: '071-079-091', species: 'mule-deer', year: 2023, totalHarvest: 569, totalHunters: 1151, successRate: 49.4 },
  { gmu: '081', species: 'mule-deer', year: 2023, totalHarvest: 34, totalHunters: 62, successRate: 54.8 },
  { gmu: '101-102-109', species: 'mule-deer', year: 2023, totalHarvest: 5, totalHunters: 9, successRate: 55.6 },
  { gmu: '101-109', species: 'mule-deer', year: 2023, totalHarvest: 391, totalHunters: 1670, successRate: 23.4 },
  { gmu: '111-113', species: 'mule-deer', year: 2023, totalHarvest: 119, totalHunters: 256, successRate: 46.5 },
  { gmu: '114-115', species: 'mule-deer', year: 2023, totalHarvest: 69, totalHunters: 190, successRate: 36.3 },
  { gmu: '115', species: 'mule-deer', year: 2023, totalHarvest: 4, totalHunters: 7, successRate: 57.1 },
  { gmu: '121', species: 'mule-deer', year: 2023, totalHarvest: 52, totalHunters: 76, successRate: 68.4 },
  { gmu: '131-134', species: 'mule-deer', year: 2023, totalHarvest: 26, totalHunters: 55, successRate: 47.3 },
  { gmu: '141-145', species: 'mule-deer', year: 2023, totalHarvest: 165, totalHunters: 408, successRate: 40.4 },
  { gmu: '151-156', species: 'mule-deer', year: 2023, totalHarvest: 158, totalHunters: 453, successRate: 34.9 },
  { gmu: '161-164', species: 'mule-deer', year: 2023, totalHarvest: 47, totalHunters: 150, successRate: 31.3 },
  { gmu: '171-173', species: 'mule-deer', year: 2023, totalHarvest: 208, totalHunters: 845, successRate: 24.6 },
  { gmu: '181-184', species: 'mule-deer', year: 2023, totalHarvest: 70, totalHunters: 195, successRate: 35.9 },
  { gmu: '192', species: 'mule-deer', year: 2023, totalHarvest: 41, totalHunters: 120, successRate: 34.2 },
  { gmu: '194-and-196', species: 'mule-deer', year: 2023, totalHarvest: 57, totalHunters: 81, successRate: 70.4 },
  { gmu: '195', species: 'mule-deer', year: 2023, totalHarvest: 11, totalHunters: 37, successRate: 29.7 },
  { gmu: '201-202-204-208', species: 'mule-deer', year: 2023, totalHarvest: 1, totalHunters: 7, successRate: 14.3 },
  { gmu: '201-and-204', species: 'mule-deer', year: 2023, totalHarvest: 20, totalHunters: 38, successRate: 52.6 },
  { gmu: '202-205-208', species: 'mule-deer', year: 2023, totalHarvest: 46, totalHunters: 77, successRate: 59.7 },
  { gmu: '203', species: 'mule-deer', year: 2023, totalHarvest: 22, totalHunters: 62, successRate: 35.5 },
  { gmu: '211-213', species: 'mule-deer', year: 2023, totalHarvest: 11, totalHunters: 32, successRate: 34.4 },
  { gmu: '221-223', species: 'mule-deer', year: 2023, totalHarvest: 65, totalHunters: 167, successRate: 38.9 },
  { gmu: '231', species: 'mule-deer', year: 2023, totalHarvest: 56, totalHunters: 102, successRate: 54.9 },
  { gmu: '241-245', species: 'mule-deer', year: 2023, totalHarvest: 40, totalHunters: 71, successRate: 56.3 },
  { gmu: '251-254', species: 'mule-deer', year: 2023, totalHarvest: 3, totalHunters: 18, successRate: 16.7 },
  { gmu: '261-268', species: 'mule-deer', year: 2023, totalHarvest: 19, totalHunters: 71, successRate: 26.8 },
  { gmu: '271-272', species: 'mule-deer', year: 2023, totalHarvest: 11, totalHunters: 37, successRate: 29.7 },
  { gmu: '291', species: 'mule-deer', year: 2023, totalHarvest: 57, totalHunters: 97, successRate: 58.8 },
  { gmu: '011-013', species: 'mule-deer', year: 2022, totalHarvest: 41, totalHunters: 91, successRate: 45.1 },
  { gmu: '014', species: 'mule-deer', year: 2022, totalHarvest: 7, totalHunters: 17, successRate: 41.2 },
  { gmu: '015', species: 'mule-deer', year: 2022, totalHarvest: 6, totalHunters: 26, successRate: 23.1 },
  { gmu: '021', species: 'mule-deer', year: 2022, totalHarvest: 28, totalHunters: 65, successRate: 43.1 },
  { gmu: '022', species: 'mule-deer', year: 2022, totalHarvest: 27, totalHunters: 56, successRate: 48.2 },
  { gmu: '031', species: 'mule-deer', year: 2022, totalHarvest: 81, totalHunters: 124, successRate: 65.3 },
  { gmu: '032', species: 'mule-deer', year: 2022, totalHarvest: 45, totalHunters: 129, successRate: 34.9 },
  { gmu: '033', species: 'mule-deer', year: 2022, totalHarvest: 19, totalHunters: 29, successRate: 65.5 },
  { gmu: '034', species: 'mule-deer', year: 2022, totalHarvest: 14, totalHunters: 36, successRate: 38.9 },
  { gmu: '035', species: 'mule-deer', year: 2022, totalHarvest: 29, totalHunters: 78, successRate: 37.2 },
  { gmu: '041-042', species: 'mule-deer', year: 2022, totalHarvest: 16, totalHunters: 45, successRate: 35.6 },
  { gmu: '043-046', species: 'mule-deer', year: 2022, totalHarvest: 104, totalHunters: 255, successRate: 40.8 },
  { gmu: '051', species: 'mule-deer', year: 2022, totalHarvest: 147, totalHunters: 275, successRate: 53.5 },
  { gmu: '061-062-064-066-068', species: 'mule-deer', year: 2022, totalHarvest: 1014, totalHunters: 2240, successRate: 45.3 },
  { gmu: '062-067-068', species: 'mule-deer', year: 2022, totalHarvest: 104, totalHunters: 180, successRate: 57.8 },
  { gmu: '065', species: 'mule-deer', year: 2022, totalHarvest: 47, totalHunters: 72, successRate: 65.3 },
  { gmu: '071-079-091', species: 'mule-deer', year: 2022, totalHarvest: 915, totalHunters: 1644, successRate: 55.7 },
  { gmu: '081', species: 'mule-deer', year: 2022, totalHarvest: 42, totalHunters: 71, successRate: 59.2 },
  { gmu: '101-102-109', species: 'mule-deer', year: 2022, totalHarvest: 16, totalHunters: 40, successRate: 40.0 },
  { gmu: '101-109', species: 'mule-deer', year: 2022, totalHarvest: 958, totalHunters: 3315, successRate: 28.9 },
  { gmu: '111-113', species: 'mule-deer', year: 2022, totalHarvest: 164, totalHunters: 320, successRate: 51.3 },
  { gmu: '114-115', species: 'mule-deer', year: 2022, totalHarvest: 68, totalHunters: 163, successRate: 41.7 },
  { gmu: '115', species: 'mule-deer', year: 2022, totalHarvest: 3, totalHunters: 7, successRate: 42.9 },
  { gmu: '121', species: 'mule-deer', year: 2022, totalHarvest: 45, totalHunters: 77, successRate: 58.4 },
  { gmu: '131-134', species: 'mule-deer', year: 2022, totalHarvest: 46, totalHunters: 91, successRate: 50.5 },
  { gmu: '141-145', species: 'mule-deer', year: 2022, totalHarvest: 293, totalHunters: 675, successRate: 43.4 },
  { gmu: '151-156', species: 'mule-deer', year: 2022, totalHarvest: 171, totalHunters: 357, successRate: 47.9 },
  { gmu: '161-164', species: 'mule-deer', year: 2022, totalHarvest: 65, totalHunters: 209, successRate: 31.1 },
  { gmu: '171-173', species: 'mule-deer', year: 2022, totalHarvest: 237, totalHunters: 852, successRate: 27.8 },
  { gmu: '181-184', species: 'mule-deer', year: 2022, totalHarvest: 113, totalHunters: 278, successRate: 40.6 },
  { gmu: '192', species: 'mule-deer', year: 2022, totalHarvest: 56, totalHunters: 118, successRate: 47.5 },
  { gmu: '194-and-196', species: 'mule-deer', year: 2022, totalHarvest: 61, totalHunters: 81, successRate: 75.3 },
  { gmu: '195', species: 'mule-deer', year: 2022, totalHarvest: 18, totalHunters: 47, successRate: 38.3 },
  { gmu: '201-202-204-208', species: 'mule-deer', year: 2022, totalHarvest: 0, totalHunters: 6, successRate: 0.0 },
  { gmu: '201-and-204', species: 'mule-deer', year: 2022, totalHarvest: 26, totalHunters: 35, successRate: 74.3 },
  { gmu: '202-205-208', species: 'mule-deer', year: 2022, totalHarvest: 38, totalHunters: 69, successRate: 55.1 },
  { gmu: '203', species: 'mule-deer', year: 2022, totalHarvest: 32, totalHunters: 71, successRate: 45.1 },
  { gmu: '211-213', species: 'mule-deer', year: 2022, totalHarvest: 8, totalHunters: 55, successRate: 14.5 },
  { gmu: '221-223', species: 'mule-deer', year: 2022, totalHarvest: 77, totalHunters: 224, successRate: 34.4 },
  { gmu: '231', species: 'mule-deer', year: 2022, totalHarvest: 49, totalHunters: 81, successRate: 60.5 },
  { gmu: '241-245', species: 'mule-deer', year: 2022, totalHarvest: 38, totalHunters: 77, successRate: 49.4 },
  { gmu: '251-254', species: 'mule-deer', year: 2022, totalHarvest: 4, totalHunters: 19, successRate: 21.1 },
  { gmu: '261-268', species: 'mule-deer', year: 2022, totalHarvest: 38, totalHunters: 111, successRate: 34.2 },
  { gmu: '271-272', species: 'mule-deer', year: 2022, totalHarvest: 14, totalHunters: 54, successRate: 25.9 },
  { gmu: '291', species: 'mule-deer', year: 2022, totalHarvest: 69, totalHunters: 95, successRate: 72.6 },
];

// Pronghorn antelope — 145 rows, 2022–2025. 2025 public-draw total: 3,043 harvested / 4,098 hunters afield
export const NV_PRONGHORN_DATA: RealGMUData[] = [
  { gmu: '011', species: 'pronghorn', year: 2025, totalHarvest: 31, totalHunters: 44, successRate: 70.5 },
  { gmu: '012-014', species: 'pronghorn', year: 2025, totalHarvest: 62, totalHunters: 118, successRate: 52.5 },
  { gmu: '015', species: 'pronghorn', year: 2025, totalHarvest: 57, totalHunters: 100, successRate: 57.0 },
  { gmu: '021-022', species: 'pronghorn', year: 2025, totalHarvest: 59, totalHunters: 73, successRate: 80.8 },
  { gmu: '031', species: 'pronghorn', year: 2025, totalHarvest: 87, totalHunters: 139, successRate: 62.6 },
  { gmu: '032-and-034', species: 'pronghorn', year: 2025, totalHarvest: 31, totalHunters: 68, successRate: 45.6 },
  { gmu: '033', species: 'pronghorn', year: 2025, totalHarvest: 32, totalHunters: 54, successRate: 59.3 },
  { gmu: '035', species: 'pronghorn', year: 2025, totalHarvest: 33, totalHunters: 36, successRate: 91.7 },
  { gmu: '041-042', species: 'pronghorn', year: 2025, totalHarvest: 69, totalHunters: 84, successRate: 82.1 },
  { gmu: '043-046', species: 'pronghorn', year: 2025, totalHarvest: 228, totalHunters: 304, successRate: 75.0 },
  { gmu: '051', species: 'pronghorn', year: 2025, totalHarvest: 69, totalHunters: 96, successRate: 71.9 },
  { gmu: '061-062-064-071-073', species: 'pronghorn', year: 2025, totalHarvest: 426, totalHunters: 523, successRate: 81.5 },
  { gmu: '065-142-144', species: 'pronghorn', year: 2025, totalHarvest: 89, totalHunters: 115, successRate: 77.4 },
  { gmu: '066', species: 'pronghorn', year: 2025, totalHarvest: 34, totalHunters: 45, successRate: 75.6 },
  { gmu: '067-068', species: 'pronghorn', year: 2025, totalHarvest: 223, totalHunters: 318, successRate: 70.1 },
  { gmu: '072-074-075', species: 'pronghorn', year: 2025, totalHarvest: 77, totalHunters: 108, successRate: 71.3 },
  { gmu: '076-077-079-081-091', species: 'pronghorn', year: 2025, totalHarvest: 124, totalHunters: 164, successRate: 75.6 },
  { gmu: '078-105-107-121', species: 'pronghorn', year: 2025, totalHarvest: 35, totalHunters: 40, successRate: 87.5 },
  { gmu: '101-104-108-109-144', species: 'pronghorn', year: 2025, totalHarvest: 92, totalHunters: 122, successRate: 75.4 },
  { gmu: '111-114', species: 'pronghorn', year: 2025, totalHarvest: 103, totalHunters: 131, successRate: 78.6 },
  { gmu: '115', species: 'pronghorn', year: 2025, totalHarvest: 14, totalHunters: 18, successRate: 77.8 },
  { gmu: '115-231-242', species: 'pronghorn', year: 2025, totalHarvest: 51, totalHunters: 56, successRate: 91.1 },
  { gmu: '131-145-163-164', species: 'pronghorn', year: 2025, totalHarvest: 19, totalHunters: 24, successRate: 79.2 },
  { gmu: '132-134-245', species: 'pronghorn', year: 2025, totalHarvest: 24, totalHunters: 25, successRate: 96.0 },
  { gmu: '141-143-151-156', species: 'pronghorn', year: 2025, totalHarvest: 316, totalHunters: 435, successRate: 72.6 },
  { gmu: '141-143-152-154-155', species: 'pronghorn', year: 2025, totalHarvest: 230, totalHunters: 321, successRate: 71.7 },
  { gmu: '151-153-156', species: 'pronghorn', year: 2025, totalHarvest: 163, totalHunters: 223, successRate: 73.1 },
  { gmu: '161-162', species: 'pronghorn', year: 2025, totalHarvest: 19, totalHunters: 28, successRate: 67.9 },
  { gmu: '171-173', species: 'pronghorn', year: 2025, totalHarvest: 32, totalHunters: 36, successRate: 88.9 },
  { gmu: '181-184', species: 'pronghorn', year: 2025, totalHarvest: 106, totalHunters: 118, successRate: 89.8 },
  { gmu: '202-and-204', species: 'pronghorn', year: 2025, totalHarvest: 7, totalHunters: 9, successRate: 77.8 },
  { gmu: '203-and-291', species: 'pronghorn', year: 2025, totalHarvest: 15, totalHunters: 18, successRate: 83.3 },
  { gmu: '205-208', species: 'pronghorn', year: 2025, totalHarvest: 19, totalHunters: 25, successRate: 76.0 },
  { gmu: '211-213', species: 'pronghorn', year: 2025, totalHarvest: 9, totalHunters: 9, successRate: 100.0 },
  { gmu: '221-223-241', species: 'pronghorn', year: 2025, totalHarvest: 33, totalHunters: 43, successRate: 76.7 },
  { gmu: '251', species: 'pronghorn', year: 2025, totalHarvest: 25, totalHunters: 28, successRate: 89.3 },
  { gmu: '011', species: 'pronghorn', year: 2024, totalHarvest: 32, totalHunters: 54, successRate: 59.3 },
  { gmu: '012-014', species: 'pronghorn', year: 2024, totalHarvest: 82, totalHunters: 151, successRate: 54.3 },
  { gmu: '015', species: 'pronghorn', year: 2024, totalHarvest: 53, totalHunters: 102, successRate: 52.0 },
  { gmu: '021-022', species: 'pronghorn', year: 2024, totalHarvest: 51, totalHunters: 61, successRate: 83.6 },
  { gmu: '031', species: 'pronghorn', year: 2024, totalHarvest: 84, totalHunters: 121, successRate: 69.4 },
  { gmu: '032-and-034', species: 'pronghorn', year: 2024, totalHarvest: 34, totalHunters: 59, successRate: 57.6 },
  { gmu: '033', species: 'pronghorn', year: 2024, totalHarvest: 30, totalHunters: 52, successRate: 57.7 },
  { gmu: '035', species: 'pronghorn', year: 2024, totalHarvest: 26, totalHunters: 34, successRate: 76.5 },
  { gmu: '041-042', species: 'pronghorn', year: 2024, totalHarvest: 56, totalHunters: 63, successRate: 88.9 },
  { gmu: '043-046', species: 'pronghorn', year: 2024, totalHarvest: 195, totalHunters: 253, successRate: 77.1 },
  { gmu: '051', species: 'pronghorn', year: 2024, totalHarvest: 58, totalHunters: 78, successRate: 74.4 },
  { gmu: '061-062-064-071-073', species: 'pronghorn', year: 2024, totalHarvest: 408, totalHunters: 499, successRate: 81.8 },
  { gmu: '065-142-144', species: 'pronghorn', year: 2024, totalHarvest: 59, totalHunters: 83, successRate: 71.1 },
  { gmu: '066', species: 'pronghorn', year: 2024, totalHarvest: 37, totalHunters: 41, successRate: 90.2 },
  { gmu: '067-068', species: 'pronghorn', year: 2024, totalHarvest: 169, totalHunters: 254, successRate: 66.5 },
  { gmu: '072-074-075', species: 'pronghorn', year: 2024, totalHarvest: 73, totalHunters: 99, successRate: 73.7 },
  { gmu: '076-077-079-081-091', species: 'pronghorn', year: 2024, totalHarvest: 104, totalHunters: 133, successRate: 78.2 },
  { gmu: '078-105-107-121', species: 'pronghorn', year: 2024, totalHarvest: 20, totalHunters: 27, successRate: 74.1 },
  { gmu: '101-104-108-109-144', species: 'pronghorn', year: 2024, totalHarvest: 75, totalHunters: 94, successRate: 79.8 },
  { gmu: '111-114', species: 'pronghorn', year: 2024, totalHarvest: 60, totalHunters: 80, successRate: 75.0 },
  { gmu: '115', species: 'pronghorn', year: 2024, totalHarvest: 14, totalHunters: 17, successRate: 82.4 },
  { gmu: '115-231-242', species: 'pronghorn', year: 2024, totalHarvest: 37, totalHunters: 45, successRate: 82.2 },
  { gmu: '131-145-163-164', species: 'pronghorn', year: 2024, totalHarvest: 8, totalHunters: 10, successRate: 80.0 },
  { gmu: '132-134-245', species: 'pronghorn', year: 2024, totalHarvest: 6, totalHunters: 9, successRate: 66.7 },
  { gmu: '141-143-151-156', species: 'pronghorn', year: 2024, totalHarvest: 262, totalHunters: 386, successRate: 67.9 },
  { gmu: '141-143-152-154-155', species: 'pronghorn', year: 2024, totalHarvest: 159, totalHunters: 230, successRate: 69.1 },
  { gmu: '151-153-156', species: 'pronghorn', year: 2024, totalHarvest: 140, totalHunters: 165, successRate: 84.8 },
  { gmu: '161-162', species: 'pronghorn', year: 2024, totalHarvest: 18, totalHunters: 25, successRate: 72.0 },
  { gmu: '171-173', species: 'pronghorn', year: 2024, totalHarvest: 21, totalHunters: 23, successRate: 91.3 },
  { gmu: '181-184', species: 'pronghorn', year: 2024, totalHarvest: 100, totalHunters: 118, successRate: 84.7 },
  { gmu: '202-and-204', species: 'pronghorn', year: 2024, totalHarvest: 7, totalHunters: 10, successRate: 70.0 },
  { gmu: '203-and-291', species: 'pronghorn', year: 2024, totalHarvest: 7, totalHunters: 9, successRate: 77.8 },
  { gmu: '205-208', species: 'pronghorn', year: 2024, totalHarvest: 20, totalHunters: 28, successRate: 71.4 },
  { gmu: '211-213', species: 'pronghorn', year: 2024, totalHarvest: 6, totalHunters: 7, successRate: 85.7 },
  { gmu: '221-223-241', species: 'pronghorn', year: 2024, totalHarvest: 33, totalHunters: 41, successRate: 80.5 },
  { gmu: '251', species: 'pronghorn', year: 2024, totalHarvest: 28, totalHunters: 31, successRate: 90.3 },
  { gmu: '011', species: 'pronghorn', year: 2023, totalHarvest: 12, totalHunters: 28, successRate: 42.9 },
  { gmu: '012-014', species: 'pronghorn', year: 2023, totalHarvest: 70, totalHunters: 143, successRate: 49.0 },
  { gmu: '015', species: 'pronghorn', year: 2023, totalHarvest: 43, totalHunters: 80, successRate: 53.8 },
  { gmu: '021-022', species: 'pronghorn', year: 2023, totalHarvest: 37, totalHunters: 49, successRate: 75.5 },
  { gmu: '031', species: 'pronghorn', year: 2023, totalHarvest: 61, totalHunters: 95, successRate: 64.2 },
  { gmu: '032-and-034', species: 'pronghorn', year: 2023, totalHarvest: 25, totalHunters: 53, successRate: 47.2 },
  { gmu: '033', species: 'pronghorn', year: 2023, totalHarvest: 22, totalHunters: 56, successRate: 39.3 },
  { gmu: '035', species: 'pronghorn', year: 2023, totalHarvest: 15, totalHunters: 20, successRate: 75.0 },
  { gmu: '041-042', species: 'pronghorn', year: 2023, totalHarvest: 35, totalHunters: 50, successRate: 70.0 },
  { gmu: '043-046', species: 'pronghorn', year: 2023, totalHarvest: 162, totalHunters: 202, successRate: 80.2 },
  { gmu: '051', species: 'pronghorn', year: 2023, totalHarvest: 37, totalHunters: 64, successRate: 57.8 },
  { gmu: '061-062-064-071-073', species: 'pronghorn', year: 2023, totalHarvest: 312, totalHunters: 364, successRate: 85.7 },
  { gmu: '065-142-144', species: 'pronghorn', year: 2023, totalHarvest: 32, totalHunters: 35, successRate: 91.4 },
  { gmu: '066', species: 'pronghorn', year: 2023, totalHarvest: 26, totalHunters: 40, successRate: 65.0 },
  { gmu: '067-068', species: 'pronghorn', year: 2023, totalHarvest: 157, totalHunters: 208, successRate: 75.5 },
  { gmu: '072-074-075', species: 'pronghorn', year: 2023, totalHarvest: 99, totalHunters: 136, successRate: 72.8 },
  { gmu: '076-077-079-081-091', species: 'pronghorn', year: 2023, totalHarvest: 55, totalHunters: 66, successRate: 83.3 },
  { gmu: '078-105-107-121', species: 'pronghorn', year: 2023, totalHarvest: 28, totalHunters: 30, successRate: 93.3 },
  { gmu: '101-104-108-109-144', species: 'pronghorn', year: 2023, totalHarvest: 47, totalHunters: 55, successRate: 85.5 },
  { gmu: '111-114', species: 'pronghorn', year: 2023, totalHarvest: 27, totalHunters: 36, successRate: 75.0 },
  { gmu: '115', species: 'pronghorn', year: 2023, totalHarvest: 17, totalHunters: 18, successRate: 94.4 },
  { gmu: '115-231-242', species: 'pronghorn', year: 2023, totalHarvest: 23, totalHunters: 27, successRate: 85.2 },
  { gmu: '131-145-163-164', species: 'pronghorn', year: 2023, totalHarvest: 2, totalHunters: 6, successRate: 33.3 },
  { gmu: '131-and-145', species: 'pronghorn', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },
  { gmu: '132-134-245', species: 'pronghorn', year: 2023, totalHarvest: 20, totalHunters: 22, successRate: 90.9 },
  { gmu: '141-143-151-156', species: 'pronghorn', year: 2023, totalHarvest: 205, totalHunters: 289, successRate: 70.9 },
  { gmu: '141-143-152-154-155', species: 'pronghorn', year: 2023, totalHarvest: 192, totalHunters: 287, successRate: 66.9 },
  { gmu: '151-153-156', species: 'pronghorn', year: 2023, totalHarvest: 146, totalHunters: 186, successRate: 78.5 },
  { gmu: '161-162', species: 'pronghorn', year: 2023, totalHarvest: 14, totalHunters: 19, successRate: 73.7 },
  { gmu: '171-173', species: 'pronghorn', year: 2023, totalHarvest: 17, totalHunters: 24, successRate: 70.8 },
  { gmu: '181-184', species: 'pronghorn', year: 2023, totalHarvest: 77, totalHunters: 95, successRate: 81.1 },
  { gmu: '202-and-204', species: 'pronghorn', year: 2023, totalHarvest: 6, totalHunters: 10, successRate: 60.0 },
  { gmu: '203-and-291', species: 'pronghorn', year: 2023, totalHarvest: 7, totalHunters: 12, successRate: 58.3 },
  { gmu: '205-208', species: 'pronghorn', year: 2023, totalHarvest: 19, totalHunters: 26, successRate: 73.1 },
  { gmu: '211-213', species: 'pronghorn', year: 2023, totalHarvest: 7, totalHunters: 9, successRate: 77.8 },
  { gmu: '221-223-241', species: 'pronghorn', year: 2023, totalHarvest: 19, totalHunters: 23, successRate: 82.6 },
  { gmu: '251', species: 'pronghorn', year: 2023, totalHarvest: 16, totalHunters: 18, successRate: 88.9 },
  { gmu: '011', species: 'pronghorn', year: 2022, totalHarvest: 32, totalHunters: 45, successRate: 71.1 },
  { gmu: '012-014', species: 'pronghorn', year: 2022, totalHarvest: 56, totalHunters: 124, successRate: 45.2 },
  { gmu: '015', species: 'pronghorn', year: 2022, totalHarvest: 47, totalHunters: 77, successRate: 61.0 },
  { gmu: '021-022', species: 'pronghorn', year: 2022, totalHarvest: 37, totalHunters: 44, successRate: 84.1 },
  { gmu: '031', species: 'pronghorn', year: 2022, totalHarvest: 57, totalHunters: 90, successRate: 63.3 },
  { gmu: '032-and-034', species: 'pronghorn', year: 2022, totalHarvest: 21, totalHunters: 54, successRate: 38.9 },
  { gmu: '033', species: 'pronghorn', year: 2022, totalHarvest: 32, totalHunters: 55, successRate: 58.2 },
  { gmu: '035', species: 'pronghorn', year: 2022, totalHarvest: 12, totalHunters: 17, successRate: 70.6 },
  { gmu: '041-042', species: 'pronghorn', year: 2022, totalHarvest: 52, totalHunters: 68, successRate: 76.5 },
  { gmu: '043-046', species: 'pronghorn', year: 2022, totalHarvest: 172, totalHunters: 201, successRate: 85.6 },
  { gmu: '051', species: 'pronghorn', year: 2022, totalHarvest: 34, totalHunters: 53, successRate: 64.2 },
  { gmu: '061-062-064-071-073', species: 'pronghorn', year: 2022, totalHarvest: 301, totalHunters: 345, successRate: 87.2 },
  { gmu: '065-142-144', species: 'pronghorn', year: 2022, totalHarvest: 30, totalHunters: 36, successRate: 83.3 },
  { gmu: '066', species: 'pronghorn', year: 2022, totalHarvest: 33, totalHunters: 42, successRate: 78.6 },
  { gmu: '067-068', species: 'pronghorn', year: 2022, totalHarvest: 123, totalHunters: 165, successRate: 74.5 },
  { gmu: '072-074-075', species: 'pronghorn', year: 2022, totalHarvest: 114, totalHunters: 171, successRate: 66.7 },
  { gmu: '076-077-079-081-091', species: 'pronghorn', year: 2022, totalHarvest: 38, totalHunters: 45, successRate: 84.4 },
  { gmu: '078-105-107-121', species: 'pronghorn', year: 2022, totalHarvest: 25, totalHunters: 29, successRate: 86.2 },
  { gmu: '101-104-108-109-144', species: 'pronghorn', year: 2022, totalHarvest: 59, totalHunters: 75, successRate: 78.7 },
  { gmu: '111-114', species: 'pronghorn', year: 2022, totalHarvest: 21, totalHunters: 34, successRate: 61.8 },
  { gmu: '115-231-242', species: 'pronghorn', year: 2022, totalHarvest: 32, totalHunters: 32, successRate: 100.0 },
  { gmu: '131-145-163-164', species: 'pronghorn', year: 2022, totalHarvest: 8, totalHunters: 10, successRate: 80.0 },
  { gmu: '131-and-145', species: 'pronghorn', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },
  { gmu: '132-134-245', species: 'pronghorn', year: 2022, totalHarvest: 13, totalHunters: 20, successRate: 65.0 },
  { gmu: '141-143-151-156', species: 'pronghorn', year: 2022, totalHarvest: 211, totalHunters: 281, successRate: 75.1 },
  { gmu: '141-143-152-154-155', species: 'pronghorn', year: 2022, totalHarvest: 175, totalHunters: 252, successRate: 69.4 },
  { gmu: '151-153-156', species: 'pronghorn', year: 2022, totalHarvest: 141, totalHunters: 179, successRate: 78.8 },
  { gmu: '161-162', species: 'pronghorn', year: 2022, totalHarvest: 26, totalHunters: 39, successRate: 66.7 },
  { gmu: '171-173', species: 'pronghorn', year: 2022, totalHarvest: 27, totalHunters: 34, successRate: 79.4 },
  { gmu: '181-184', species: 'pronghorn', year: 2022, totalHarvest: 90, totalHunters: 99, successRate: 90.9 },
  { gmu: '202-and-204', species: 'pronghorn', year: 2022, totalHarvest: 4, totalHunters: 9, successRate: 44.4 },
  { gmu: '203-and-291', species: 'pronghorn', year: 2022, totalHarvest: 6, totalHunters: 10, successRate: 60.0 },
  { gmu: '205-208', species: 'pronghorn', year: 2022, totalHarvest: 19, totalHunters: 25, successRate: 76.0 },
  { gmu: '211-213', species: 'pronghorn', year: 2022, totalHarvest: 5, totalHunters: 7, successRate: 71.4 },
  { gmu: '221-223-241', species: 'pronghorn', year: 2022, totalHarvest: 17, totalHunters: 24, successRate: 70.8 },
  { gmu: '251', species: 'pronghorn', year: 2022, totalHarvest: 17, totalHunters: 21, successRate: 81.0 },
];

// Bighorn sheep (Desert/Nelson, California, Rocky Mountain) — 208 rows, 2022–2025. 2025 public-draw total: 279 harvested / 345 hunters afield
export const NV_SHEEP_DATA: RealGMUData[] = [
  { gmu: '012', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // California
  { gmu: '022', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '031', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '032', species: 'sheep', year: 2025, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // California
  { gmu: '032-033', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // California
  { gmu: '034', species: 'sheep', year: 2025, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // California
  { gmu: '035E', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // California
  { gmu: '035W', species: 'sheep', year: 2025, totalHarvest: 8, totalHunters: 9, successRate: 88.9 },  // California
  { gmu: '044-and-182', species: 'sheep', year: 2025, totalHarvest: 5, totalHunters: 7, successRate: 71.4 },  // desert
  { gmu: '045', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // desert
  { gmu: '051', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '068', species: 'sheep', year: 2025, totalHarvest: 8, totalHunters: 8, successRate: 100.0 },  // California
  { gmu: '102', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // Rocky Mtn
  { gmu: '115', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // Rocky Mtn
  { gmu: '131-132-164', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '133-and-245', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '134-and-251', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '153-and-183', species: 'sheep', year: 2025, totalHarvest: 10, totalHunters: 10, successRate: 100.0 },  // desert
  { gmu: '161', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '162-163', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // desert
  { gmu: '173N', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '181E', species: 'sheep', year: 2025, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '181W', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '184', species: 'sheep', year: 2025, totalHarvest: 8, totalHunters: 8, successRate: 100.0 },  // desert
  { gmu: '202', species: 'sheep', year: 2025, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '204', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '205', species: 'sheep', year: 2025, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '206-and-208', species: 'sheep', year: 2025, totalHarvest: 5, totalHunters: 6, successRate: 83.3 },  // desert
  { gmu: '207', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '211', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '212', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '213', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '221-and-223', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '241', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 4, successRate: 50.0 },  // desert
  { gmu: '242-and-271', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '243', species: 'sheep', year: 2025, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // desert
  { gmu: '244', species: 'sheep', year: 2025, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '253', species: 'sheep', year: 2025, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '254', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '261', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '262', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '262-263-264-265-266', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '263', species: 'sheep', year: 2025, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '264-265-266', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '267', species: 'sheep', year: 2025, totalHarvest: 10, totalHunters: 10, successRate: 100.0 },  // desert
  { gmu: '267-268', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // desert
  { gmu: '268', species: 'sheep', year: 2025, totalHarvest: 109, totalHunters: 157, successRate: 69.4 },  // desert
  { gmu: '272', species: 'sheep', year: 2025, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },  // desert
  { gmu: '280', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 5, successRate: 60.0 },  // desert
  { gmu: '281', species: 'sheep', year: 2025, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '282', species: 'sheep', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '283-284', species: 'sheep', year: 2025, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '286', species: 'sheep', year: 2025, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '012', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '022', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // California
  { gmu: '031', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 4, successRate: 50.0 },  // California
  { gmu: '032', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },  // California
  { gmu: '032-033', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '034', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // California
  { gmu: '035E', species: 'sheep', year: 2024, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // California
  { gmu: '035W', species: 'sheep', year: 2024, totalHarvest: 8, totalHunters: 8, successRate: 100.0 },  // California
  { gmu: '044-and-182', species: 'sheep', year: 2024, totalHarvest: 5, totalHunters: 8, successRate: 62.5 },  // desert
  { gmu: '045', species: 'sheep', year: 2024, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },  // desert
  { gmu: '051', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '068', species: 'sheep', year: 2024, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // California
  { gmu: '102', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // Rocky Mtn
  { gmu: '131-132-164', species: 'sheep', year: 2024, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '133-and-245', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '134-and-251', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '153-and-183', species: 'sheep', year: 2024, totalHarvest: 9, totalHunters: 9, successRate: 100.0 },  // desert
  { gmu: '161', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '162-163', species: 'sheep', year: 2024, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },  // desert
  { gmu: '173N', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 6, successRate: 50.0 },  // desert
  { gmu: '173S', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '181E', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '181W', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '184', species: 'sheep', year: 2024, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '202', species: 'sheep', year: 2024, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '204', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '205', species: 'sheep', year: 2024, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '206-and-208', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '207', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '211', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '213', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },  // desert
  { gmu: '221-and-223', species: 'sheep', year: 2024, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '241', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '242-and-271', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '243', species: 'sheep', year: 2024, totalHarvest: 5, totalHunters: 6, successRate: 83.3 },  // desert
  { gmu: '244', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '253', species: 'sheep', year: 2024, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '254', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '261', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '262', species: 'sheep', year: 2024, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // desert
  { gmu: '262-263-264-265-266', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '263', species: 'sheep', year: 2024, totalHarvest: 6, totalHunters: 7, successRate: 85.7 },  // desert
  { gmu: '264-265-266', species: 'sheep', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '267', species: 'sheep', year: 2024, totalHarvest: 7, totalHunters: 8, successRate: 87.5 },  // desert
  { gmu: '268', species: 'sheep', year: 2024, totalHarvest: 78, totalHunters: 94, successRate: 83.0 },  // desert
  { gmu: '272', species: 'sheep', year: 2024, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '280', species: 'sheep', year: 2024, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },  // desert
  { gmu: '281', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '282', species: 'sheep', year: 2024, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '283-284', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '286', species: 'sheep', year: 2024, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '012-and-014', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // California
  { gmu: '022', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '031', species: 'sheep', year: 2023, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // California
  { gmu: '032', species: 'sheep', year: 2023, totalHarvest: 4, totalHunters: 6, successRate: 66.7 },  // California
  { gmu: '032-033', species: 'sheep', year: 2023, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },  // California
  { gmu: '034', species: 'sheep', year: 2023, totalHarvest: 4, totalHunters: 6, successRate: 66.7 },  // California
  { gmu: '035', species: 'sheep', year: 2023, totalHarvest: 5, totalHunters: 7, successRate: 71.4 },  // California
  { gmu: '044-and-182', species: 'sheep', year: 2023, totalHarvest: 7, totalHunters: 10, successRate: 70.0 },  // desert
  { gmu: '045', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '051', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '068', species: 'sheep', year: 2023, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // California
  { gmu: '102', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // Rocky Mtn
  { gmu: '131-132-164', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '133-and-245', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '134-and-251', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '153-and-183', species: 'sheep', year: 2023, totalHarvest: 9, totalHunters: 9, successRate: 100.0 },  // desert
  { gmu: '161', species: 'sheep', year: 2023, totalHarvest: 27, totalHunters: 56, successRate: 48.2 },  // desert
  { gmu: '162-163', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '173N', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 5, successRate: 60.0 },  // desert
  { gmu: '173S', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '181E', species: 'sheep', year: 2023, totalHarvest: 13, totalHunters: 13, successRate: 100.0 },  // desert
  { gmu: '181W', species: 'sheep', year: 2023, totalHarvest: 7, totalHunters: 9, successRate: 77.8 },  // desert
  { gmu: '184', species: 'sheep', year: 2023, totalHarvest: 5, totalHunters: 6, successRate: 83.3 },  // desert
  { gmu: '202', species: 'sheep', year: 2023, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '205', species: 'sheep', year: 2023, totalHarvest: 7, totalHunters: 7, successRate: 100.0 },  // desert
  { gmu: '206-and-208', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '207', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '211', species: 'sheep', year: 2023, totalHarvest: 10, totalHunters: 10, successRate: 100.0 },  // desert
  { gmu: '212', species: 'sheep', year: 2023, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },  // desert
  { gmu: '213', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 4, successRate: 25.0 },  // desert
  { gmu: '221-and-223', species: 'sheep', year: 2023, totalHarvest: 0, totalHunters: 2, successRate: 0.0 },  // desert
  { gmu: '241', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '242-and-271', species: 'sheep', year: 2023, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },  // desert
  { gmu: '243', species: 'sheep', year: 2023, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // desert
  { gmu: '244', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '252', species: 'sheep', year: 2023, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },  // desert
  { gmu: '253', species: 'sheep', year: 2023, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '253-254-261', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '254', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '261', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '262', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '263', species: 'sheep', year: 2023, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // desert
  { gmu: '264-265-266', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '267', species: 'sheep', year: 2023, totalHarvest: 10, totalHunters: 10, successRate: 100.0 },  // desert
  { gmu: '267-268', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '268', species: 'sheep', year: 2023, totalHarvest: 60, totalHunters: 69, successRate: 87.0 },  // desert
  { gmu: '272', species: 'sheep', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '280', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '281', species: 'sheep', year: 2023, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '283-284', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 4, successRate: 50.0 },  // desert
  { gmu: '286', species: 'sheep', year: 2023, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '011-and-013', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // California
  { gmu: '012', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // California
  { gmu: '014', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // California
  { gmu: '021-022', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // California
  { gmu: '031', species: 'sheep', year: 2022, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // California
  { gmu: '032', species: 'sheep', year: 2022, totalHarvest: 10, totalHunters: 10, successRate: 100.0 },  // California
  { gmu: '032-033', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // California
  { gmu: '034', species: 'sheep', year: 2022, totalHarvest: 9, totalHunters: 9, successRate: 100.0 },  // California
  { gmu: '035', species: 'sheep', year: 2022, totalHarvest: 9, totalHunters: 9, successRate: 100.0 },  // California
  { gmu: '044-and-182', species: 'sheep', year: 2022, totalHarvest: 16, totalHunters: 22, successRate: 72.7 },  // desert
  { gmu: '045-and-153', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '051', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // California
  { gmu: '068', species: 'sheep', year: 2022, totalHarvest: 6, totalHunters: 6, successRate: 100.0 },  // California
  { gmu: '131-132-164', species: 'sheep', year: 2022, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '133-and-245', species: 'sheep', year: 2022, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '134-and-251', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '161', species: 'sheep', year: 2022, totalHarvest: 33, totalHunters: 62, successRate: 53.2 },  // desert
  { gmu: '162-163', species: 'sheep', year: 2022, totalHarvest: 6, totalHunters: 9, successRate: 66.7 },  // desert
  { gmu: '173N', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 3, successRate: 33.3 },  // desert
  { gmu: '173S', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '181', species: 'sheep', year: 2022, totalHarvest: 23, totalHunters: 25, successRate: 92.0 },  // desert
  { gmu: '183', species: 'sheep', year: 2022, totalHarvest: 8, totalHunters: 8, successRate: 100.0 },  // desert
  { gmu: '184', species: 'sheep', year: 2022, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // desert
  { gmu: '202', species: 'sheep', year: 2022, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '204', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '205', species: 'sheep', year: 2022, totalHarvest: 7, totalHunters: 7, successRate: 100.0 },  // desert
  { gmu: '206-and-208', species: 'sheep', year: 2022, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '207', species: 'sheep', year: 2022, totalHarvest: 3, totalHunters: 4, successRate: 75.0 },  // desert
  { gmu: '211', species: 'sheep', year: 2022, totalHarvest: 9, totalHunters: 12, successRate: 75.0 },  // desert
  { gmu: '212', species: 'sheep', year: 2022, totalHarvest: 16, totalHunters: 19, successRate: 84.2 },  // desert
  { gmu: '213', species: 'sheep', year: 2022, totalHarvest: 10, totalHunters: 16, successRate: 62.5 },  // desert
  { gmu: '221-and-223', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '241', species: 'sheep', year: 2022, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '241-243-271', species: 'sheep', year: 2022, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },  // desert
  { gmu: '242-and-271', species: 'sheep', year: 2022, totalHarvest: 5, totalHunters: 7, successRate: 71.4 },  // desert
  { gmu: '243', species: 'sheep', year: 2022, totalHarvest: 5, totalHunters: 5, successRate: 100.0 },  // desert
  { gmu: '244', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 3, successRate: 66.7 },  // desert
  { gmu: '252', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '253', species: 'sheep', year: 2022, totalHarvest: 5, totalHunters: 6, successRate: 83.3 },  // desert
  { gmu: '254', species: 'sheep', year: 2022, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '261', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 3, successRate: 33.3 },  // desert
  { gmu: '262', species: 'sheep', year: 2022, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '262-263-264-265-266', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // desert
  { gmu: '263', species: 'sheep', year: 2022, totalHarvest: 4, totalHunters: 5, successRate: 80.0 },  // desert
  { gmu: '264-265-266', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '267', species: 'sheep', year: 2022, totalHarvest: 8, totalHunters: 9, successRate: 88.9 },  // desert
  { gmu: '267-268', species: 'sheep', year: 2022, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },  // desert
  { gmu: '268', species: 'sheep', year: 2022, totalHarvest: 53, totalHunters: 72, successRate: 73.6 },  // desert
  { gmu: '272', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },  // desert
  { gmu: '280', species: 'sheep', year: 2022, totalHarvest: 3, totalHunters: 3, successRate: 100.0 },  // desert
  { gmu: '281', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 3, successRate: 33.3 },  // desert
  { gmu: '283-284', species: 'sheep', year: 2022, totalHarvest: 4, totalHunters: 4, successRate: 100.0 },  // desert
  { gmu: '286', species: 'sheep', year: 2022, totalHarvest: 1, totalHunters: 2, successRate: 50.0 },  // desert
];

// Mountain goat — 11 rows, 2022–2025. 2025 public-draw total: 13 harvested / 17 hunters afield
export const NV_GOAT_DATA: RealGMUData[] = [
  { gmu: '101', species: 'goat', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },
  { gmu: '102', species: 'goat', year: 2025, totalHarvest: 10, totalHunters: 14, successRate: 71.4 },
  { gmu: '103', species: 'goat', year: 2025, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },
  { gmu: '101', species: 'goat', year: 2024, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },
  { gmu: '102', species: 'goat', year: 2024, totalHarvest: 10, totalHunters: 13, successRate: 76.9 },
  { gmu: '101', species: 'goat', year: 2023, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },
  { gmu: '102', species: 'goat', year: 2023, totalHarvest: 11, totalHunters: 11, successRate: 100.0 },
  { gmu: '103', species: 'goat', year: 2023, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },
  { gmu: '101', species: 'goat', year: 2022, totalHarvest: 1, totalHunters: 1, successRate: 100.0 },
  { gmu: '102-and-121', species: 'goat', year: 2022, totalHarvest: 10, totalHunters: 12, successRate: 83.3 },
  { gmu: '103', species: 'goat', year: 2022, totalHarvest: 0, totalHunters: 1, successRate: 0.0 },
];

// Moose — 2 rows, 2024–2025. 2025 public-draw total: 2 harvested / 2 hunters afield
export const NV_MOOSE_DATA: RealGMUData[] = [
  { gmu: '061-062-064-066-068-071-077-081-101-103', species: 'moose', year: 2025, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },
  { gmu: '061-062-064-066-068-071-077-081-101-103', species: 'moose', year: 2024, totalHarvest: 2, totalHunters: 2, successRate: 100.0 },
];

// Black bear — 4 rows, 2022–2025. 2025 public-draw total: 12 harvested / 35 hunters afield
export const NV_BEAR_DATA: RealGMUData[] = [
  { gmu: '192-194-196-201-204-206-291', species: 'bear', year: 2025, totalHarvest: 12, totalHunters: 35, successRate: 34.3 },
  { gmu: '192-194-196-201-204-206-291', species: 'bear', year: 2024, totalHarvest: 13, totalHunters: 38, successRate: 34.2 },
  { gmu: '192-194-196-201-204-206-291', species: 'bear', year: 2023, totalHarvest: 19, totalHunters: 34, successRate: 55.9 },
  { gmu: '192-194-196-201-204-206-291', species: 'bear', year: 2022, totalHarvest: 16, totalHunters: 30, successRate: 53.3 },
];
// Unit id -> geographic area (NDOW names) – counties (exact NDOW unit group)
export const NV_UNIT_REGIONS: Record<string, string> = {
  '011': "Vya Rim – Washoe Co. (Unit 011)",
  '011-013': "Vya Rim, Calico Mountains – Washoe / Humboldt Co. (Units 011–013)",
  '011-and-013': "Vya Rim – Washoe Co. (Units 011, 013)",
  '012': "Calico Mountains – Washoe / Humboldt Co. (Unit 012)",
  '012-014': "Calico Mountains, Granite Range – Washoe / Humboldt Co. (Units 012–014)",
  '012-and-014': "Calico Mountains, Granite Range – Washoe / Humboldt Co. (Units 012, 014)",
  '014': "Granite Range – Washoe Co. (Unit 014)",
  '015': "Mgmt Area 1 – Washoe Co. (Unit 015)",
  '021': "Peterson Range, Dogskin Mountains – Washoe Co. (Unit 021)",
  '021-022': "Peterson Range, Pah Rah Range – Washoe Co. (Units 021, 022)",
  '022': "Pah Rah Range, Virginia Mountains – Washoe Co. (Unit 022)",
  '031': "Montana Mountains, Bilk Creek Range – Humboldt Co. (Unit 031)",
  '032': "Pine Forest Range, Pueblo Mountains – Humboldt Co. (Unit 032)",
  '032-033': "Pine Forest Range, Blowout Mountain – Humboldt / Washoe Co. (Units 032, 033)",
  '032-and-034': "Pine Forest Range, Black Rock Range – Humboldt Co. (Units 032, 034)",
  '033': "Blowout Mountain, Catnip Mountain – Humboldt / Washoe Co. (Unit 033)",
  '034': "Black Rock Range – Humboldt Co. (Unit 034)",
  '035': "Jackson Mountains, Bloody Run Hills – Humboldt Co. (Unit 035)",
  '035E': "Bloody Run Hills – Humboldt Co. (Unit 035E)",
  '035W': "Jackson Mountains – Humboldt Co. (Unit 035W)",
  '041-042': "Selenite Range, Sahwave Mountains, Trinity Range – Pershing Co. (Units 041, 042)",
  '043-044-046': "Humboldt Range, Tobin Range, Sonoma Range – Pershing / Humboldt Co. (Units 043, 044, 046)",
  '043-046': "Humboldt Range, Tobin Range, Sonoma Range – Pershing / Humboldt Co. (Units 043–046)",
  '044-and-182': "Stillwater Range – Pershing / Churchill Co. (Units 044, 182)",
  '045': "Tobin Range, Fish Creek Mountains – Pershing Co. (Unit 045)",
  '045-and-153': "Tobin Range, Fish Creek Mountains – Pershing / Lander Co. (Units 045, 153)",
  '051': "Santa Rosa Range, Osgood Mountains – Humboldt Co. (Unit 051)",
  '061-062-064-066-068': "Independence Mountains, Bull Run Mountains, Snowstorm Mountains – Elko / Eureka / Lander Co. (Units 061, 062, 064, 066–068)",
  '061-062-064-066-068-071-077-081-101-103': "Independence Mountains, Jarbidge Mountains, Ruby Mountains – Elko / Eureka / White Pine Co. (Units 061, 062, 064, 066–068, 071–077, 081, 101–103)",
  '061-062-064-071-073': "Independence Mountains, Bearpaw Mountain – Elko Co. (Units 061, 062, 064, 071, 073)",
  '061-and-071': "Bearpaw Mountain, Wildhorse Reservoir – Elko Co. (Units 061, 071)",
  '062': "Independence Mountains, Bull Run Mountains – Elko Co. (Unit 062)",
  '062-064-066-068': "Independence Mountains, Snowstorm Mountains, Sheep Creek Range – Elko / Eureka / Lander Co. (Units 062, 064, 066–068)",
  '062-067-068': "Independence Mountains, Sheep Creek Range – Elko / Eureka / Lander Co. (Units 062, 067–068)",
  '062-and-066': "Independence Mountains, Snowstorm Mountains – Elko Co. (Units 062, 066)",
  '065': "Mgmt Area 6 – Elko Co. (Unit 065)",
  '065-142-144': "Table Mountain, Diamond Range – Eureka / Elko / White Pine Co. (Units 065, 142, 144)",
  '066': "Snowstorm Mountains – Elko Co. (Unit 066)",
  '067-068': "Tuscarora Range, Izzenhood Range – Elko / Eureka / Lander Co. (Units 067, 068)",
  '068': "Sheep Creek Range – Elko / Eureka / Lander Co. (Unit 068)",
  '071-079-091': "Jarbidge Mountains, Snake Mountains – Elko Co. (Units 071–079, 091)",
  '072': "Jarbidge Wilderness – Elko Co. (Unit 072)",
  '072-074': "Jarbidge Mountains, Jarbidge Wilderness – Elko Co. (Units 072–074)",
  '072-074-075': "Jarbidge Wilderness, Loomis Mountain – Elko Co. (Units 072, 074–075)",
  '072-075': "Jarbidge Mountains, Snake Mountains – Elko Co. (Units 072–075)",
  '075': "Loomis Mountain, Snake Mountains – Elko Co. (Unit 075)",
  '076-077-079-081': "Pequop Mountains, Toano Mountains, Windermere Hills – Elko Co. (Units 076, 077, 079, 081)",
  '076-077-079-081-091': "Toano Mountains, Delano Mountain, Pilot Mountain – Elko Co. (Units 076, 077, 079, 081, 091)",
  '078-105-107-109': "Goshute Mountains, Dolly Varden Mountains – Elko Co. (Units 078, 105–107, 109)",
  '078-105-107-121': "Cherry Creek Range, Pequop Mountains – Elko / White Pine Co. (Units 078, 105–107, 121)",
  '078-and-107': "Goshute Mountains, Dolly Varden Mountains – Elko Co. (Units 078, 107)",
  '081': "Delano Mountain, Crittenden Reservoir – Elko Co. (Unit 081)",
  '091': "Pilot Mountain – Elko Co. (Unit 091)",
  '101': "East Humboldt Range – Elko Co. (Unit 101)",
  '101-102-109': "East Humboldt Range, Ruby Mountains – Elko Co. (Units 101, 102, 109)",
  '101-104-108-109-144': "East Humboldt Range, Ruby Mountains, South Ruby Mountains – Elko / White Pine / Eureka Co. (Units 101–104, 108–109, 144)",
  '101-109': "East Humboldt Range, Ruby Mountains – Elko / White Pine Co. (Units 101–109)",
  '102': "Ruby Mountains – Elko Co. (Unit 102)",
  '102-and-121': "Ruby Mountains, Goshute Basin – Elko / White Pine Co. (Units 102, 121)",
  '103': "South Ruby Mountains, Pearl Peak – Elko / White Pine Co. (Unit 103)",
  '104-108-121': "Medicine Range – White Pine / Elko Co. (Units 104, 108, 121)",
  '105-106-109': "Dolly Varden Mountains – Elko Co. (Units 105, 106, 109)",
  '108-131-132': "Grant Range, Horse Spring Hills – White Pine / Nye Co. (Units 108, 131–132)",
  '111-112': "Schell Creek Range – White Pine Co. (Units 111, 112)",
  '111-113': "Schell Creek Range, Kern Mountains – White Pine Co. (Units 111–113)",
  '111-114': "Schell Creek Range, Little Hills – White Pine Co. (Units 111–114)",
  '111-115': "Schell Creek Range, Snake Range – White Pine Co. (Units 111–115)",
  '113': "Kern Mountains – White Pine Co. (Unit 113)",
  '114': "Snake Range, Little Hills – White Pine Co. (Unit 114)",
  '114-115': "Snake Range, Little Hills – White Pine Co. (Units 114, 115)",
  '115': "Snake Range – White Pine Co. (Unit 115)",
  '115-231-242': "Spring Valley, Lake Valley, Hamlin Valley – Lincoln / White Pine Co. (Units 115, 231, 242)",
  '121': "Goshute Basin, Telegraph Peak – White Pine / Elko Co. (Unit 121)",
  '131-132-164': "White Pine Range, Quinn Canyon Wilderness, Big Sand Springs Valley – Nye / White Pine Co. (Units 131, 132, 164)",
  '131-134': "White Pine Range, Grant Range, Horse Range – Nye / White Pine / Lincoln Co. (Units 131–134)",
  '131-145-163-164': "White Pine Range, Antelope Valley, Hot Creek Range – Nye / Eureka / White Pine Co. (Units 131, 145, 163–164)",
  '131-and-145': "Railroad Valley, Little Smokey Valley – Eureka / White Pine Co. (Units 131, 145)",
  '132-134-245': "White River Valley, Sand Springs Valley – Nye / Lincoln Co. (Units 132–134, 245)",
  '133-and-245': "Mount Irish Range, Pahranagat Range – Lincoln / Nye Co. (Units 133, 245)",
  '134-and-251': "Pancake Range, Kawich Range – Nye Co. (Units 134, 251)",
  '141-143-151-156': "Crescent Valley, Kobeh Valley, Battle Mountains – Lander / Eureka / Humboldt Co. (Units 141, 143, 151–156)",
  '141-143-152-154-155': "Crescent Valley, Kobeh Valley – Eureka / Lander Co. (Units 141, 143, 152, 154–155)",
  '141-145': "Diamond Range, Fish Creek Range – Eureka / White Pine Co. (Units 141–145)",
  '151-153-156': "Battle Mountains, Fish Creek Mountains – Lander / Humboldt Co. (Units 151, 153, 156)",
  '151-156': "Battle Mountains, Fish Creek Mountains, Simpson Park Range – Lander / Eureka / Humboldt Co. (Units 151–156)",
  '153-and-183': "Fish Creek Mountains, Clan Alpine Mountains – Lander / Churchill Co. (Units 153, 183)",
  '161': "Round Mountain – Nye / Lander Co. (Unit 161)",
  '161-162': "Stone Cabin Valley, Little Fish Lake Valley – Nye / Lander Co. (Units 161–162)",
  '161-164': "Monitor Range, Hot Creek Range – Nye / Lander Co. (Units 161–164)",
  '161-164-171-173': "Monitor Range, Toiyabe Range – Nye / Lander Co. (Units 161–164, 171–173)",
  '162': "Monitor Range – Nye Co. (Unit 162)",
  '162-163': "Monitor Range, Hot Creek Range – Nye Co. (Units 162–163)",
  '171-173': "Toiyabe Range, Shoshone Range – Nye / Lander Co. (Units 171–173)",
  '173N': "North Toiyabe Range – Nye / Lander Co. (Unit 173N)",
  '173S': "San Antonio Mountains – Nye / Lander Co. (Unit 173S)",
  '181': "Fairview Range, Sand Springs Range – Churchill Co. (Unit 181)",
  '181-184': "Desatoya Range, Clan Alpine Range, New Pass Range – Churchill / Lander / Pershing Co. (Units 181–184)",
  '181E': "Fairview Range, Sand Springs Range – Churchill Co. (Unit 181E)",
  '181W': "Fairview Range, Sand Springs Range – Churchill Co. (Unit 181W)",
  '183': "Clan Alpine Mountains – Churchill Co. (Unit 183)",
  '184': "Desatoya Mountains – Lander / Churchill Co. (Unit 184)",
  '192': "South Carson Range – Douglas Co. (Unit 192)",
  '192-194-196-201-204-206-291': "Carson Range, Virginia Range, Pine Nut Mountains, Wassuk Range – Washoe / Carson City / Storey / Douglas / Lyon / Mineral Co. (Units 192, 194–196, 201–204, 206, 291)",
  '194-and-196': "North Carson Range – Washoe Co. (Units 194, 196)",
  '195': "Virginia Range, Flowery Range – Storey / Lyon / Washoe Co. (Unit 195)",
  '201-202-204-208': "Pine Nut Range, Wassuk Range, Pine Grove Range – Mineral / Lyon / Douglas Co. (Units 201–202, 204–208)",
  '201-and-204': "Smith Valley – Lyon / Douglas Co. (Units 201, 204)",
  '202': "Wassuk Range – Mineral Co. (Unit 202)",
  '202-205-208': "Wassuk Range, Gabbs Valley Range, Excelsior Mountains – Mineral / Esmeralda Co. (Units 202, 205–208)",
  '202-and-204': "Bodie Hills, Wassuk Range – Lyon / Mineral Co. (Units 202, 204)",
  '203': "Mason Valley – Lyon Co. (Unit 203)",
  '203-and-291': "Pine Nut Mountains, Buckskin Mountains, Singatse Mountains – Lyon / Douglas Co. (Units 203, 291)",
  '204': "Smith Valley, Mason Valley – Lyon Co. (Unit 204)",
  '205': "Gabbs Valley Range, Gillis Range – Mineral Co. (Unit 205)",
  '205-208': "Gabbs Valley Range, Excelsior Mountains, Candelaria Hills – Mineral / Esmeralda Co. (Units 205–208)",
  '206-and-208': "Excelsior Mountains, Candelaria Hills – Mineral / Esmeralda Co. (Units 206, 208)",
  '207': "Gabbs Valley Range – Mineral Co. (Unit 207)",
  '211': "Silver Peak Range, Volcanic Hills – Esmeralda Co. (Unit 211)",
  '211-213': "White Mountains, Palmetto Mountains, Silver Peak Range – Esmeralda Co. (Units 211–213)",
  '212': "Weepah Hills – Esmeralda Co. (Unit 212)",
  '213': "Monte Cristo Range – Esmeralda Co. (Unit 213)",
  '221': "Egan Range – White Pine / Lincoln Co. (Unit 221)",
  '221-223': "Egan Range, Schell Creek Range, Pahroc Range – Lincoln / White Pine Co. (Units 221–223)",
  '221-223-241': "Egan Range, Hiko Range, Delamar Mountains – Lincoln / White Pine Co. (Units 221–223, 241)",
  '221-and-223': "Egan Range, Hiko Range – Lincoln / White Pine Co. (Units 221, 223)",
  '222': "Pahroc Range – Lincoln / White Pine Co. (Unit 222)",
  '222-223': "Pahroc Range – Lincoln / White Pine Co. (Units 222–223)",
  '231': "Fortification Range, Wilson Creek Range – Lincoln Co. (Unit 231)",
  '241': "Delamar Mountains – Lincoln Co. (Unit 241)",
  '241-242': "Clover Mountains – Lincoln Co. (Units 241, 242)",
  '241-243-271': "Delamar Mountains, Meadow Valley Range, Mormon Mountains – Lincoln / Clark Co. (Units 241, 243, 271)",
  '241-245': "Delamar Mountains, Clover Mountains, Meadow Valley Mountains – Lincoln / Clark Co. (Units 241–245)",
  '242-and-271': "Clover Mountains, Mormon Mountains – Lincoln / Clark Co. (Units 242, 271)",
  '243': "Meadow Valley Range – Lincoln / Clark Co. (Unit 243)",
  '244': "Arrow Canyon Range – Clark Co. (Unit 244)",
  '251': "Kawich Range – Nye Co. (Unit 251)",
  '251-254': "Kawich Range, Stonewall Mountain, Bare Mountain – Nye Co. (Units 251–254)",
  '252': "Stonewall Mountain – Nye Co. (Unit 252)",
  '253': "Bare Mountain – Nye Co. (Unit 253)",
  '253-254-261': "Bare Mountain, Specter Range, Last Chance Range – Nye Co. (Units 253, 254, 261)",
  '254': "Specter Range – Nye Co. (Unit 254)",
  '261': "Last Chance Range – Nye Co. (Unit 261)",
  '261-268': "Spring Mountains, McCullough Range, Highland Range – Clark / Nye Co. (Units 261–268)",
  '262': "Spring Mountains, Bird Spring Range – Clark Co. (Unit 262)",
  '262-263-264-265-266': "Spring Mountains, McCullough Range, Eldorado Mountains – Clark Co. (Units 262, 263, 264, 265, 266)",
  '263': "McCullough Range, Highland Range – Clark Co. (Unit 263)",
  '264-265-266': "Eldorado Mountains, Newberry Mountains – Clark Co. (Units 264, 265, 266)",
  '267': "Black Mountains – Clark Co. (Unit 267)",
  '267-268': "Black Mountains, Muddy Mountains – Clark Co. (Units 267, 268)",
  '268': "Muddy Mountains – Clark Co. (Unit 268)",
  '271-272': "Mormon Mountains, Virgin Mountains – Clark / Lincoln Co. (Units 271, 272)",
  '272': "Virgin Mountains – Clark Co. (Unit 272)",
  '280': "Spotted Range, Pintwater Range – Clark / Lincoln Co. (Unit 280)",
  '281': "Pintwater Range – Clark / Lincoln Co. (Unit 281)",
  '282': "Desert Range – Clark / Lincoln Co. (Unit 282)",
  '283-284': "Sheep Range, Desert Range, Elbow Range – Clark / Lincoln Co. (Units 283–284)",
  '286': "Las Vegas Range – Clark Co. (Unit 286)",
  '291': "Pine Nut Mountains – Douglas / Lyon Co. (Unit 291)",
};

export const NV_META = {
  applicationDeadline:
    'Main draw: May 13 (11 PM PT) · 2nd draw: June 15 · NR guided deer: Mar 9 (2026 dates; 2027 TBA)',
  deadlines: [
    { label: 'Nonresident guided mule deer draw — application deadline (opened Feb 9; results Mar 20)', date: '2026-03-09', season: '2026', source: 'https://www.ndow.org/apply-buy/apply-buy-hunting/' },
    { label: 'Big game main draw — application deadline, 11 PM Pacific (opened Mar 23; results by May 29)', date: '2026-05-13', season: '2026', source: 'https://www.eregulations.com/assets/docs/guides/26NVBG_LR_2026-03-10-154402_wjvd.pdf' },
    { label: 'Big game second draw — application deadline (opened Jun 8; results Jun 26)', date: '2026-06-15', season: '2026', source: 'https://www.ndow.org/apply-buy/apply-buy-hunting/' },
  ] as Array<{ label: string; date: string; season: '2026' | '2027'; source: string }>,
  drawSystem: 'bonus' as 'preference' | 'bonus' | 'random' | 'hybrid',
  drawSystemNote:
    'Squared bonus points: each applicant gets (bonus points)² + 1 random draw numbers and the lowest number is used. One point per unsuccessful application (or point-only purchase) per hunt category; points reset to zero when a tag is drawn/purchased. Up to 5 hunt choices per species/class; quotas ~90% resident / 10% nonresident (Commission Policy 24). Waiting periods: bighorn ram 10 seasons, antlered elk 7 seasons. Leftover tags go to a second draw, then First-Come, First-Served.',
  species: ['elk', 'mule-deer', 'pronghorn', 'sheep', 'goat', 'moose', 'bear', 'lion', 'turkey'],
  unitSystemName: 'Hunt Unit',
  regionNames: [
    'Ruby Mountains', 'East Humboldt Range', 'Jarbidge Mountains', 'Independence Mountains', 'Santa Rosa Range',
    'Schell Creek Range', 'Snake Range', 'Toiyabe Range', 'Monitor Range', 'Desatoya Mountains',
    'Carson Range', 'Black Rock Range', 'Spring Mountains', 'Delamar Mountains',
  ],
  sources: [
    'https://www.ndow.org/blog/hunt-statistics/',
    'https://www.ndow.org/wp-content/uploads/2026/03/2025-Nevada-Big-Game-Hunt-Data.xlsx',
    'https://www.ndow.org/apply-buy/apply-buy-hunting/',
    'https://www.eregulations.com/assets/docs/guides/26NVBG_LR_2026-03-10-154402_wjvd.pdf',
    'https://www.ndow.org/blog/hunt-information-sheets/',
    'https://www.ndow.org/wp-content/uploads/2026/10/Big-Game-Status-Book_2026_10.2.26.pdf',
    'https://services.arcgis.com/RyxlXSfFi87rAosq/arcgis/rest/services/NDOWGameMgmtUnits/FeatureServer',
  ],
};
