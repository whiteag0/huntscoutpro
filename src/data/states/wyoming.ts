// ============================================================
// Wyoming — Verified Harvest Data
// ============================================================
// Source: Wyoming Game & Fish Department 2024 Harvest Reports
// ============================================================

export interface RealGMUData {
  gmu: string;
  species: string;
  year: number;
  totalHarvest: number;
  totalHunters: number;
  successRate: number; // percentage 0-100
  bulls?: number;
  cows?: number;
  calves?: number;
  recDays?: number;
}

// ============================================================
// ELK 2024 — Statewide: 30,744 total, 58,524 hunters, 52.5%
// ============================================================

export const WYOMING_ELK_DATA: RealGMUData[] = [
  { gmu: '1', species: 'elk', year: 2024, totalHarvest: 93, totalHunters: 163, successRate: 57.1 },
  { gmu: '2', species: 'elk', year: 2024, totalHarvest: 185, totalHunters: 412, successRate: 44.9 },
  { gmu: '3', species: 'elk', year: 2024, totalHarvest: 254, totalHunters: 641, successRate: 39.6 },
  { gmu: '6', species: 'elk', year: 2024, totalHarvest: 623, totalHunters: 1283, successRate: 48.6 },
  { gmu: '7', species: 'elk', year: 2024, totalHarvest: 2578, totalHunters: 4851, successRate: 53.1 },
  { gmu: '8', species: 'elk', year: 2024, totalHarvest: 182, totalHunters: 528, successRate: 34.5 },
  { gmu: '9', species: 'elk', year: 2024, totalHarvest: 324, totalHunters: 1553, successRate: 20.9 },
  { gmu: '10', species: 'elk', year: 2024, totalHarvest: 324, totalHunters: 1272, successRate: 25.5 },
  { gmu: '11', species: 'elk', year: 2024, totalHarvest: 377, totalHunters: 716, successRate: 52.7 },
  { gmu: '12', species: 'elk', year: 2024, totalHarvest: 713, totalHunters: 1562, successRate: 45.6 },
  { gmu: '13', species: 'elk', year: 2024, totalHarvest: 305, totalHunters: 1109, successRate: 27.5 },
  { gmu: '15', species: 'elk', year: 2024, totalHarvest: 412, totalHunters: 1181, successRate: 34.9 },
  { gmu: '16', species: 'elk', year: 2024, totalHarvest: 562, totalHunters: 1023, successRate: 54.9 },
  { gmu: '19', species: 'elk', year: 2024, totalHarvest: 348, totalHunters: 694, successRate: 50.1 },
  { gmu: '21', species: 'elk', year: 2024, totalHarvest: 1223, totalHunters: 3458, successRate: 35.4 },
  { gmu: '22', species: 'elk', year: 2024, totalHarvest: 113, totalHunters: 184, successRate: 61.4 },
  { gmu: '23', species: 'elk', year: 2024, totalHarvest: 291, totalHunters: 526, successRate: 55.3 },
  { gmu: '24', species: 'elk', year: 2024, totalHarvest: 251, totalHunters: 422, successRate: 59.5 },
  { gmu: '25', species: 'elk', year: 2024, totalHarvest: 245, totalHunters: 428, successRate: 57.2 },
  { gmu: '27', species: 'elk', year: 2024, totalHarvest: 51, totalHunters: 168, successRate: 30.4 },
  { gmu: '28', species: 'elk', year: 2024, totalHarvest: 451, totalHunters: 1346, successRate: 33.5 },
  { gmu: '30', species: 'elk', year: 2024, totalHarvest: 106, totalHunters: 140, successRate: 75.7 },
  { gmu: '31', species: 'elk', year: 2024, totalHarvest: 125, totalHunters: 229, successRate: 54.6 },
  { gmu: '32', species: 'elk', year: 2024, totalHarvest: 119, totalHunters: 202, successRate: 58.9 },
  { gmu: '33', species: 'elk', year: 2024, totalHarvest: 119, totalHunters: 478, successRate: 24.9 },
  { gmu: '34', species: 'elk', year: 2024, totalHarvest: 448, totalHunters: 1316, successRate: 34.0 },
  { gmu: '35', species: 'elk', year: 2024, totalHarvest: 200, totalHunters: 627, successRate: 31.9 },
  { gmu: '36', species: 'elk', year: 2024, totalHarvest: 153, totalHunters: 951, successRate: 16.1 },
  { gmu: '37', species: 'elk', year: 2024, totalHarvest: 217, totalHunters: 1184, successRate: 18.3 },
  { gmu: '38', species: 'elk', year: 2024, totalHarvest: 324, totalHunters: 606, successRate: 53.5 },
  { gmu: '39', species: 'elk', year: 2024, totalHarvest: 237, totalHunters: 440, successRate: 53.9 },
  { gmu: '40', species: 'elk', year: 2024, totalHarvest: 151, totalHunters: 493, successRate: 30.6 },
  { gmu: '41', species: 'elk', year: 2024, totalHarvest: 442, totalHunters: 1174, successRate: 37.6 },
  { gmu: '45', species: 'elk', year: 2024, totalHarvest: 362, totalHunters: 1126, successRate: 32.1 },
  { gmu: '47', species: 'elk', year: 2024, totalHarvest: 54, totalHunters: 181, successRate: 29.8 },
  { gmu: '48', species: 'elk', year: 2024, totalHarvest: 605, totalHunters: 1118, successRate: 54.1 },
  { gmu: '49', species: 'elk', year: 2024, totalHarvest: 373, totalHunters: 1020, successRate: 36.6 },
  { gmu: '51', species: 'elk', year: 2024, totalHarvest: 83, totalHunters: 264, successRate: 31.4 },
  { gmu: '54', species: 'elk', year: 2024, totalHarvest: 148, totalHunters: 283, successRate: 52.3 },
  { gmu: '55', species: 'elk', year: 2024, totalHarvest: 31, totalHunters: 90, successRate: 34.4 },
  { gmu: '56', species: 'elk', year: 2024, totalHarvest: 174, totalHunters: 641, successRate: 27.1 },
  { gmu: '58', species: 'elk', year: 2024, totalHarvest: 103, totalHunters: 203, successRate: 50.7 },
  { gmu: '59', species: 'elk', year: 2024, totalHarvest: 214, totalHunters: 649, successRate: 33.0 },
  { gmu: '60', species: 'elk', year: 2024, totalHarvest: 142, totalHunters: 231, successRate: 61.5 },
  { gmu: '61', species: 'elk', year: 2024, totalHarvest: 341, totalHunters: 990, successRate: 34.4 },
  { gmu: '62', species: 'elk', year: 2024, totalHarvest: 147, totalHunters: 355, successRate: 41.4 },
  { gmu: '63', species: 'elk', year: 2024, totalHarvest: 264, totalHunters: 556, successRate: 47.5 },
  { gmu: '64', species: 'elk', year: 2024, totalHarvest: 255, totalHunters: 535, successRate: 47.7 },
  { gmu: '65', species: 'elk', year: 2024, totalHarvest: 151, totalHunters: 503, successRate: 30.0 },
  { gmu: '66', species: 'elk', year: 2024, totalHarvest: 92, totalHunters: 309, successRate: 29.8 },
  { gmu: '67', species: 'elk', year: 2024, totalHarvest: 627, totalHunters: 2496, successRate: 25.1 },
  { gmu: '68', species: 'elk', year: 2024, totalHarvest: 125, totalHunters: 504, successRate: 24.8 },
  { gmu: '69', species: 'elk', year: 2024, totalHarvest: 88, totalHunters: 227, successRate: 38.8 },
  { gmu: '70', species: 'elk', year: 2024, totalHarvest: 214, totalHunters: 519, successRate: 41.2 },
  { gmu: '71', species: 'elk', year: 2024, totalHarvest: 102, totalHunters: 239, successRate: 42.7 },
  { gmu: '73', species: 'elk', year: 2024, totalHarvest: 72, totalHunters: 182, successRate: 39.6 },
  { gmu: '77', species: 'elk', year: 2024, totalHarvest: 64, totalHunters: 341, successRate: 18.8 },
  { gmu: '78', species: 'elk', year: 2024, totalHarvest: 138, totalHunters: 292, successRate: 47.3 },
  { gmu: '80', species: 'elk', year: 2024, totalHarvest: 44, totalHunters: 329, successRate: 13.4 },
  { gmu: '81', species: 'elk', year: 2024, totalHarvest: 84, totalHunters: 343, successRate: 24.5 },
  { gmu: '82', species: 'elk', year: 2024, totalHarvest: 88, totalHunters: 252, successRate: 34.9 },
  { gmu: '83', species: 'elk', year: 2024, totalHarvest: 42, totalHunters: 207, successRate: 20.3 },
  { gmu: '84', species: 'elk', year: 2024, totalHarvest: 604, totalHunters: 1500, successRate: 40.3 },
  { gmu: '85', species: 'elk', year: 2024, totalHarvest: 221, totalHunters: 860, successRate: 25.7 },
  { gmu: '86', species: 'elk', year: 2024, totalHarvest: 242, totalHunters: 718, successRate: 33.7 },
  { gmu: '87', species: 'elk', year: 2024, totalHarvest: 163, totalHunters: 603, successRate: 27.0 },
  { gmu: '88', species: 'elk', year: 2024, totalHarvest: 18, totalHunters: 34, successRate: 52.9 },
  { gmu: '89', species: 'elk', year: 2024, totalHarvest: 231, totalHunters: 879, successRate: 26.3 },
  { gmu: '90', species: 'elk', year: 2024, totalHarvest: 130, totalHunters: 593, successRate: 21.9 },
  { gmu: '91', species: 'elk', year: 2024, totalHarvest: 462, totalHunters: 1233, successRate: 37.5 },
  { gmu: '92', species: 'elk', year: 2024, totalHarvest: 513, totalHunters: 1545, successRate: 33.2 },
  { gmu: '93', species: 'elk', year: 2024, totalHarvest: 155, totalHunters: 420, successRate: 36.9 },
  { gmu: '94', species: 'elk', year: 2024, totalHarvest: 676, totalHunters: 1953, successRate: 34.6 },
  { gmu: '95', species: 'elk', year: 2024, totalHarvest: 143, totalHunters: 314, successRate: 45.5 },
  { gmu: '96', species: 'elk', year: 2024, totalHarvest: 215, totalHunters: 744, successRate: 28.9 },
  { gmu: '97', species: 'elk', year: 2024, totalHarvest: 214, totalHunters: 485, successRate: 44.1 },
  { gmu: '98', species: 'elk', year: 2024, totalHarvest: 446, totalHunters: 1117, successRate: 39.9 },
  { gmu: '99', species: 'elk', year: 2024, totalHarvest: 133, totalHunters: 304, successRate: 43.8 },
  { gmu: '100', species: 'elk', year: 2024, totalHarvest: 566, totalHunters: 801, successRate: 70.7 },
  { gmu: '102', species: 'elk', year: 2024, totalHarvest: 509, totalHunters: 1593, successRate: 32.0 },
  { gmu: '103', species: 'elk', year: 2024, totalHarvest: 296, totalHunters: 819, successRate: 36.1 },
  { gmu: '104', species: 'elk', year: 2024, totalHarvest: 558, totalHunters: 1760, successRate: 31.7 },
  { gmu: '105', species: 'elk', year: 2024, totalHarvest: 186, totalHunters: 862, successRate: 21.6 },
];

// ============================================================
// MOOSE 2024 — Statewide: 317 harvest, 347 hunters, 91.4%
// ============================================================

export const WYOMING_MOOSE_DATA: RealGMUData[] = [
  // Wyoming moose is limited-draw only; statewide totals provided
  { gmu: 'Statewide', species: 'moose', year: 2024, totalHarvest: 317, totalHunters: 347, successRate: 91.4 },
];

// ============================================================
// DEER 2024 — Statewide: 26,637 total, 43,926 hunters, 60.6%
// ============================================================

export const WYOMING_DEER_DATA: RealGMUData[] = [
  // Statewide summary — major hunt areas
  { gmu: 'Statewide', species: 'mule-deer', year: 2024, totalHarvest: 26637, totalHunters: 43926, successRate: 60.6 },
];

// ============================================================
// ANTELOPE 2024 — Statewide: 22,218 total, 23,833 hunters, 93.2%
// ============================================================

export const WYOMING_ANTELOPE_DATA: RealGMUData[] = [
  { gmu: 'Statewide', species: 'pronghorn', year: 2024, totalHarvest: 22218, totalHunters: 23833, successRate: 93.2 },
];
