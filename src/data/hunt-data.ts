// ============================================================
// HuntScout Pro â Data Layer
// All 50 states, 10 species, dynamic generation via seeded RNG
// ============================================================

import {
  Species,
  Season,
  Sex,
  Residency,
  YearData,
  HuntUnit,
  StateConfig,
  StateRegion,
  DrawSystem,
  TurkeySubspecies,
  TurkeyUnitData,
  TurkeySeason,
  SeasonCalendarEntry,
  SPECIES_SEASONS,
  SEX_OPTIONS,
} from './types';

import { HARVEST_ANCHORS, StateHarvestAnchor } from './harvest-anchors';

// Real per-GMU data imports
import { COLORADO_ELK_DATA } from './states/colorado';
import { WYOMING_ELK_DATA, WYOMING_MOOSE_DATA } from './states/wyoming';
import { IDAHO_ELK_DATA } from './states/idaho';
import { MONTANA_ELK_DATA } from './states/montana';
import { WISCONSIN_DEER_DATA, WISCONSIN_TURKEY_SPRING_DATA, WISCONSIN_BEAR_DATA } from './states/wisconsin';
import type { RealGMUData } from './states/wyoming';

// ============================================================
// 1. Seeded PRNG
// ============================================================

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

/** Hash a string into a numeric seed */
function hashSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ============================================================
// 1a. Real Per-GMU Data Lookup
// ============================================================

// Build a lookup: "state-species-gmu-year" -> RealGMUData
const REAL_GMU_LOOKUP = new Map<string, RealGMUData>();

function buildRealGMULookup() {
  for (const d of COLORADO_ELK_DATA) REAL_GMU_LOOKUP.set(`colorado-elk-${d.gmu}-${d.year}`, d);
  for (const d of WYOMING_ELK_DATA) REAL_GMU_LOOKUP.set(`wyoming-elk-${d.gmu}-${d.year}`, d);
  for (const d of IDAHO_ELK_DATA) REAL_GMU_LOOKUP.set(`idaho-elk-${d.gmu}-${d.year}`, d);
  for (const d of MONTANA_ELK_DATA) REAL_GMU_LOOKUP.set(`montana-elk-${d.gmu}-${d.year}`, d);
  for (const d of WISCONSIN_DEER_DATA) REAL_GMU_LOOKUP.set(`wisconsin-whitetail-${d.gmu}-${d.year}`, d);
  for (const d of WISCONSIN_TURKEY_SPRING_DATA) REAL_GMU_LOOKUP.set(`wisconsin-turkey-${d.gmu}-${d.year}`, d);
  for (const d of WISCONSIN_BEAR_DATA) REAL_GMU_LOOKUP.set(`wisconsin-bear-${d.gmu}-${d.year}`, d);
  for (const d of WYOMING_MOOSE_DATA) REAL_GMU_LOOKUP.set(`wyoming-moose-${d.gmu}-${d.year}`, d);
}
buildRealGMULookup();

/** Season harvest share weights */
const SEASON_HARVEST_SHARE: Record<string, number> = {
  rifle: 0.60,
  archery: 0.25,
  muzzleloader: 0.15,
  shotgun: 0.60,   // for turkey/bear
  crossbow: 0.15,  // for turkey
};

/** Get harvest share for a season+sex combo within a GMU.
 *  The shares across ALL combos for a GMU should sum to ~1.0 so the
 *  total harvest across all hunt codes approximates the real GMU total. */
function getRealDataShare(
  real: RealGMUData,
  season: string,
  sex: string,
  totalCombos: number,
  seasonCounts: Record<string, number>,
  sexCounts: Record<string, number>,
  rand: () => number,
): { harvest: number; hunters: number; successRate: number } {
  const totalHarvest = real.totalHarvest;
  const totalHunters = real.totalHunters;
  const baseSuccessRate = real.successRate;

  // Season share â normalized so all seasons sum to 1.0
  const seasonWeight = SEASON_HARVEST_SHARE[season] ?? 0.33;
  let totalSeasonWeight = 0;
  const uniqueSeasons = Object.keys(seasonCounts);
  for (const s of uniqueSeasons) {
    totalSeasonWeight += (SEASON_HARVEST_SHARE[s] ?? 0.33);
  }
  if (totalSeasonWeight === 0) totalSeasonWeight = 1;
  const normalizedSeasonShare = seasonWeight / totalSeasonWeight;

  // Sex share â normalized so all sex options sum to 1.0 for each season
  const numSexOptions = Object.keys(sexCounts).length || 1;
  let normalizedSexShare = 1.0 / numSexOptions;

  // Use real bull/cow breakdown when available for more accurate distribution
  const bulls = real.bulls ?? 0;
  const cows = real.cows ?? 0;
  const calves = real.calves ?? 0;
  const totalBySex = bulls + cows + calves;

  if (totalBySex > 0 && numSexOptions > 1) {
    if (sex === 'bull' || sex === 'buck' || sex === 'tom') {
      normalizedSexShare = bulls / totalBySex;
    } else if (sex === 'cow' || sex === 'doe' || sex === 'hen') {
      normalizedSexShare = (cows + calves) / totalBySex;
    } else if (sex === 'either' || sex === 'either-sex') {
      // Either-sex tags are a subset â they produce harvest counted in the bull/cow totals
      // Give either-sex a small share since it's an alternative access to same animals
      normalizedSexShare = 0.15;
    }
    // Normalize so all sex shares sum to ~1.0
    // With bull/cow/either: typically bull(0.7) + cow(0.25) + either(0.15) â 1.1
    // Close enough for realistic distribution
  }

  // Combined share: this combo's fraction of total GMU harvest
  // Season share * sex share = fraction of total
  const comboShare = normalizedSeasonShare * normalizedSexShare;

  // Add slight random variation (+/- 5%) â small so totals stay close
  const variation = 0.95 + rand() * 0.1;
  const harvest = Math.max(0, Math.round(totalHarvest * comboShare * variation));
  const hunters = totalHunters > 0
    ? Math.max(1, Math.round(totalHunters * comboShare * variation))
    : Math.max(1, Math.round(harvest / Math.max(0.05, baseSuccessRate / 100)));

  // Success rate varies by season
  let successMod = 0;
  if (season === 'archery') successMod = -3;
  if (season === 'muzzleloader') successMod = -2;
  if (sex === 'cow' || sex === 'doe') successMod += 5;
  const successRate = Math.max(1, Math.min(99, baseSuccessRate + successMod + (rand() - 0.5) * 4));

  return { harvest, hunters, successRate };
}

/** Generate YearData from real per-GMU data for a specific season/sex combo */
function generateFromRealData(
  real: RealGMUData,
  season: string,
  sex: string,
  totalCombos: number,
  seasonCounts: Record<string, number>,
  sexCounts: Record<string, number>,
  baseDifficulty: number,
  seed: number
): YearData {
  const rand = seededRandom(seed + real.year * 7);

  const share = getRealDataShare(real, season, sex, totalCombos, seasonCounts, sexCounts, rand);

  const totalHarvest = share.harvest;
  const huntersAfield = share.hunters > 0 ? share.hunters : Math.max(1, Math.round(totalHarvest / Math.max(0.01, share.successRate / 100)));
  const successRate = share.successRate;

  // Generate realistic tags and applicants based on real data
  const tagMultiplier = 1.0 + rand() * 0.2;
  const totalTags = Math.max(1, Math.round(huntersAfield * tagMultiplier));

  const demandMultiplier = 1.2 + baseDifficulty * 5 + rand();
  const totalApplicants = Math.max(totalTags, Math.round(totalTags * demandMultiplier));
  const residentApplicants = Math.round(totalApplicants * (0.75 + rand() * 0.1));
  const nonresidentApplicants = totalApplicants - residentApplicants;

  const minPointsResident = Math.max(0, Math.round(baseDifficulty * 8 + (rand() - 0.5) * 2));
  const minPointsNonresident = Math.min(25, minPointsResident + Math.round(1 + rand() * 2));

  const drawOddsByPoint = generateDrawOdds(minPointsResident, minPointsNonresident, rand);

  return {
    year: real.year,
    totalTags,
    totalApplicants,
    residentApplicants,
    nonresidentApplicants,
    minPointsResident,
    minPointsNonresident,
    drawOddsByPoint,
    licensesIssued: Math.max(totalTags, huntersAfield),
    huntersAfield,
    totalHarvest,
    successRate: Math.round(successRate * 10) / 10,
  };
}

// ============================================================
// 1b. Harvest Anchor Helpers
// ============================================================

/** Look up anchor data for a state+species combination */
function findAnchor(stateSlug: string, species: string): StateHarvestAnchor | undefined {
  const anchors = HARVEST_ANCHORS[stateSlug];
  if (!anchors) return undefined;
  return anchors.find(a => a.species === species);
}

/** Interpolate/extrapolate a value from a sparse year->number record */
function interpolateYear(data: Record<number, number>, year: number): number | undefined {
  if (Object.keys(data).length === 0) return undefined;

  // Direct hit
  if (data[year] !== undefined) return data[year];

  const years = Object.keys(data).map(Number).sort((a, b) => a - b);

  // Extrapolate below
  if (year < years[0]) return data[years[0]];

  // Extrapolate above
  if (year > years[years.length - 1]) return data[years[years.length - 1]];

  // Interpolate between two known years
  let lower = years[0];
  let upper = years[years.length - 1];
  for (const y of years) {
    if (y <= year) lower = y;
    if (y >= year && upper === years[years.length - 1]) upper = y;
  }
  // Find the closest bracketing years
  for (let i = 0; i < years.length - 1; i++) {
    if (years[i] <= year && years[i + 1] >= year) {
      lower = years[i];
      upper = years[i + 1];
      break;
    }
  }

  if (lower === upper) return data[lower];

  const ratio = (year - lower) / (upper - lower);
  return data[lower] + (data[upper] - data[lower]) * ratio;
}

/** Distribute a statewide total across units with seeded variance */
function distributeAcrossUnits(
  stateTotal: number,
  unitCount: number,
  rng: () => number
): number[] {
  // Generate random weights with variance
  const weights = Array.from({ length: unitCount }, () => 0.5 + rng() * 1.5);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // Scale weights to sum to stateTotal
  return weights.map(w => Math.round((w / totalWeight) * stateTotal));
}

// Pre-computed anchor distribution caches per state+species
const _anchorDistCache = new Map<string, {
  harvestByUnit: Map<number, number[]>;
  huntersByUnit: Map<number, number[]>;
  successByUnit: Map<number, number[]>;
  unitCount: number;
}>();

/** Get or compute the per-unit distribution for a state+species */
function getAnchorDistribution(
  stateSlug: string,
  species: string,
  unitCount: number,
  anchor: StateHarvestAnchor
) {
  const cacheKey = `${stateSlug}-${species}`;
  if (_anchorDistCache.has(cacheKey)) return _anchorDistCache.get(cacheKey)!;

  const rng = seededRandom(hashSeed(`${stateSlug}-${species}-anchor-dist`));

  const harvestByUnit = new Map<number, number[]>();
  const huntersByUnit = new Map<number, number[]>();
  const successByUnit = new Map<number, number[]>();

  for (const year of YEARS) {
    const totalHarvest = interpolateYear(anchor.statewideTotalHarvest, year);
    const totalHunters = interpolateYear(anchor.statewideHunters, year);
    const avgSuccess = interpolateYear(anchor.statewideSuccessRate, year);

    if (totalHarvest !== undefined && totalHarvest > 0) {
      harvestByUnit.set(year, distributeAcrossUnits(totalHarvest, unitCount, rng));
    }
    if (totalHunters !== undefined && totalHunters > 0) {
      huntersByUnit.set(year, distributeAcrossUnits(totalHunters, unitCount, rng));
    }
    if (avgSuccess !== undefined && avgSuccess > 0) {
      // Distribute success rates with smaller variance around the mean
      const rates = Array.from({ length: unitCount }, () => {
        const variance = (rng() - 0.5) * 0.3 * avgSuccess; // +/- 15% of mean
        return Math.max(0.01, Math.min(0.99, avgSuccess + variance));
      });
      successByUnit.set(year, rates);
    }
  }

  const result = { harvestByUnit, huntersByUnit, successByUnit, unitCount };
  _anchorDistCache.set(cacheKey, result);
  return result;
}

/**
 * Generate YearData calibrated to real harvest anchors.
 * unitIndex identifies which unit share to use from the distribution.
 */
function generateCalibratedYearData(
  year: number,
  unitIndex: number,
  anchor: StateHarvestAnchor,
  dist: ReturnType<typeof getAnchorDistribution>,
  baseDifficulty: number,
  seed: number,
  seasonSuccessMod: number
): YearData {
  const rand = seededRandom(seed + year * 7);

  // Get this unit's share of harvest, hunters, and success
  const harvestDist = dist.harvestByUnit.get(year);
  const huntersDist = dist.huntersByUnit.get(year);
  const successDist = dist.successByUnit.get(year);

  const idx = unitIndex % dist.unitCount;

  const unitHarvest = harvestDist ? harvestDist[idx] : undefined;
  const unitHunters = huntersDist ? huntersDist[idx] : undefined;
  const unitSuccessRate = successDist
    ? Math.max(0.01, Math.min(0.99, successDist[idx] + seasonSuccessMod))
    : undefined;

  // If we have harvest data, calibrate everything from that
  if (unitHarvest !== undefined && unitHarvest > 0) {
    const successRate = unitSuccessRate ?? (0.2 + rand() * 0.3);
    const actualHunters = unitHunters !== undefined
      ? Math.max(1, unitHunters)
      : Math.max(1, Math.round(unitHarvest / successRate));

    // Tags are typically somewhat more than hunters
    const tagMultiplier = 1.0 + rand() * 0.3;
    const totalTags = anchor.avgTagsIssued
      ? Math.max(1, Math.round((anchor.avgTagsIssued / dist.unitCount) * (0.7 + rand() * 0.6)))
      : Math.max(1, Math.round(actualHunters * tagMultiplier));

    const demandMultiplier = 1.5 + baseDifficulty * 8 + rand() * 2;
    const totalApplicants = Math.round(totalTags * demandMultiplier);
    const residentApplicants = Math.round(totalApplicants * (0.75 + rand() * 0.1));
    const nonresidentApplicants = totalApplicants - residentApplicants;

    const minPointsBase = anchor.avgMinPoints ?? Math.round(baseDifficulty * 12);
    const minPointsResident = Math.max(
      0,
      Math.round(minPointsBase + (rand() - 0.5) * 3 + (year - 2020) * 0.3)
    );
    const minPointsNonresident = Math.min(25, minPointsResident + Math.round(1 + rand() * 3));

    const drawOddsByPoint = generateDrawOdds(
      minPointsResident, minPointsNonresident, rand, anchor.drawOddsRange
    );

    const displaySuccess = Math.max(5, Math.min(85, Math.round(successRate * 1000) / 10));

    return {
      year,
      totalTags,
      totalApplicants,
      residentApplicants,
      nonresidentApplicants,
      minPointsResident,
      minPointsNonresident,
      drawOddsByPoint,
      licensesIssued: Math.max(totalTags, actualHunters),
      huntersAfield: actualHunters,
      totalHarvest: Math.max(0, unitHarvest),
      successRate: displaySuccess,
    };
  }

  // Fallback: if only success rate is anchored, use it but generate everything else
  if (unitSuccessRate !== undefined) {
    return generateYearDataWithSuccess(year, unitSuccessRate, baseDifficulty, seed, anchor);
  }

  // No usable anchor data for this year â fall through to caller for pure random
  return null as unknown as YearData;
}

/** Generate draw odds table */
function generateDrawOdds(
  minPointsResident: number,
  minPointsNonresident: number,
  rand: () => number,
  oddsRange?: [number, number]
): Record<number, { resident: number; nonresident: number }> {
  const drawOddsByPoint: Record<number, { resident: number; nonresident: number }> = {};
  for (let p = 0; p <= 25; p++) {
    let resOdds = 0;
    let nrOdds = 0;
    if (p >= minPointsResident + 3) {
      resOdds = 95 + rand() * 5;
    } else if (p >= minPointsResident) {
      resOdds = 30 + (p - minPointsResident) * 25 + rand() * 10;
    } else if (p >= minPointsResident - 2) {
      resOdds = Math.max(0, 5 + (p - minPointsResident + 2) * 12 + rand() * 5);
    }

    if (p >= minPointsNonresident + 3) {
      nrOdds = 90 + rand() * 10;
    } else if (p >= minPointsNonresident) {
      nrOdds = 20 + (p - minPointsNonresident) * 25 + rand() * 8;
    } else if (p >= minPointsNonresident - 2) {
      nrOdds = Math.max(0, 3 + (p - minPointsNonresident + 2) * 10 + rand() * 4);
    }

    drawOddsByPoint[p] = {
      resident: Math.min(100, Math.round(resOdds * 10) / 10),
      nonresident: Math.min(100, Math.round(nrOdds * 10) / 10),
    };
  }
  return drawOddsByPoint;
}

/** Generate year data when only success rate is anchored */
function generateYearDataWithSuccess(
  year: number,
  anchoredSuccess: number,
  baseDifficulty: number,
  seed: number,
  anchor: StateHarvestAnchor
): YearData {
  const rand = seededRandom(seed + year * 7);

  const baseTags = anchor.avgTagsIssued
    ? Math.max(1, Math.round(anchor.avgTagsIssued * (0.02 + rand() * 0.04)))
    : Math.round(20 + rand() * 200);
  const totalTags = Math.max(1, baseTags);

  const demandMultiplier = 1.5 + baseDifficulty * 8 + rand() * 2;
  const totalApplicants = Math.round(totalTags * demandMultiplier);
  const residentApplicants = Math.round(totalApplicants * (0.75 + rand() * 0.1));
  const nonresidentApplicants = totalApplicants - residentApplicants;

  const minPointsBase = anchor.avgMinPoints ?? Math.round(baseDifficulty * 12);
  const minPointsResident = Math.max(
    0, Math.round(minPointsBase + (rand() - 0.5) * 3 + (year - 2020) * 0.3)
  );
  const minPointsNonresident = Math.min(25, minPointsResident + Math.round(1 + rand() * 3));

  const drawOddsByPoint = generateDrawOdds(
    minPointsResident, minPointsNonresident, rand, anchor.drawOddsRange
  );

  const licensesIssued = totalTags + Math.round(rand() * totalTags * 0.1);
  const huntersAfield = Math.round(licensesIssued * (0.7 + rand() * 0.25));
  const successRate = Math.max(5, Math.min(85, Math.round(anchoredSuccess * 1000) / 10));
  const totalHarvest = Math.round(huntersAfield * (successRate / 100));

  return {
    year,
    totalTags,
    totalApplicants,
    residentApplicants,
    nonresidentApplicants,
    minPointsResident,
    minPointsNonresident,
    drawOddsByPoint,
    licensesIssued,
    huntersAfield,
    totalHarvest,
    successRate,
  };
}

// ============================================================
// 2. All 50 State Configs
// ============================================================

interface StateConfigInternal {
  name: string;
  abbrev: string;
  slug: string;
  region: string;
  species: string[];
  drawSystem: string;
  unitSystemName: string;
  unitCount: number;
  applicationDeadline: string;
  baseDifficultyMod: number;
  turkeySubspecies: string[];
  regionNames: string[];
}

const STATE_CONFIGS: StateConfigInternal[] = [
  // ---- WEST ----
  {
    name: 'Colorado', abbrev: 'CO', slug: 'colorado', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'moose', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'GMU', unitCount: 200,
    applicationDeadline: 'April 1', baseDifficultyMod: 0.15,
    turkeySubspecies: ["Merriam's", 'Rio Grande'],
    regionNames: ['North Park', 'Upper Colorado River', 'Eagle Valley', 'Gore Range', 'Flat Tops', 'White River', 'Piceance Basin', 'Bookcliffs', 'Grand Mesa', 'Gunnison Basin', 'San Juan', 'Weminuche', 'Sangre de Cristo', 'South Park', 'South Platte', 'Upper Arkansas', 'Wet Mountains', 'Greenhorn', 'Laramie River', 'Purgatoire'],
  },
  {
    name: 'Montana', abbrev: 'MT', slug: 'montana', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'moose', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'bonus', unitSystemName: 'HD', unitCount: 170,
    applicationDeadline: 'March 15', baseDifficultyMod: 0.12,
    turkeySubspecies: ["Merriam's"],
    regionNames: ['Bitterroot', 'Flathead', 'Missouri Breaks', 'Absaroka', 'Gallatin', 'Madison', 'Beartooth', 'Yellowstone', 'Big Belt', 'Crazy Mountains', 'Elkhorn', 'Highwood', 'Little Belt', 'Snowy Mountains', 'Pryor Mountains'],
  },
  {
    name: 'Wyoming', abbrev: 'WY', slug: 'wyoming', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'moose', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'HA', unitCount: 155,
    applicationDeadline: 'January 31', baseDifficultyMod: 0.18,
    turkeySubspecies: ["Merriam's"],
    regionNames: ['Wind River', 'Absaroka', 'Bighorn', 'Teton', 'Wyoming Range', 'Gros Ventre', 'Owl Creek', 'Laramie Peak', 'Shirley Mountains', 'Sierra Madre', 'Red Desert', 'Powder River'],
  },
  {
    name: 'Idaho', abbrev: 'ID', slug: 'idaho', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'moose', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'hybrid', unitSystemName: 'Unit', unitCount: 100,
    applicationDeadline: 'April 30', baseDifficultyMod: 0.10,
    turkeySubspecies: ["Merriam's"],
    regionNames: ['Selway', 'Clearwater', 'Salmon River', 'Frank Church', 'Sawtooth', 'Boise River', 'Owyhee', 'Lemhi', 'Bitterroot', 'Panhandle', 'Palouse'],
  },
  {
    name: 'Utah', abbrev: 'UT', slug: 'utah', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'moose', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'bonus', unitSystemName: 'Unit', unitCount: 120,
    applicationDeadline: 'February 28', baseDifficultyMod: 0.20,
    turkeySubspecies: ["Merriam's", 'Rio Grande'],
    regionNames: ['Wasatch', 'Uinta', 'Book Cliffs', 'La Sal', 'Manti', 'Fishlake', 'Boulder', 'Paunsaugunt', 'Monroe', 'Oquirrh', 'Cache'],
  },
  {
    name: 'Nevada', abbrev: 'NV', slug: 'nevada', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'bear', 'sheep', 'lion', 'turkey'],
    drawSystem: 'bonus', unitSystemName: 'Unit', unitCount: 110,
    applicationDeadline: 'April 15', baseDifficultyMod: 0.25,
    turkeySubspecies: ["Merriam's"],
    regionNames: ['Ruby Mountains', 'Elko', 'Humboldt', 'Jarbidge', 'Schell Creek', 'Monitor', 'Toiyabe', 'Spring Mountains', 'Snake Range', 'Santa Rosa'],
  },
  {
    name: 'New Mexico', abbrev: 'NM', slug: 'new-mexico', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'bear', 'sheep', 'lion', 'turkey'],
    drawSystem: 'random', unitSystemName: 'GMU', unitCount: 130,
    applicationDeadline: 'March 20', baseDifficultyMod: 0.14,
    turkeySubspecies: ["Merriam's", "Gould's", 'Rio Grande'],
    regionNames: ['Gila', 'Sangre de Cristo', 'Jemez', 'Sandia', 'Sacramento', 'San Mateo', 'Pecos', 'Carson', 'Cimarron', 'Raton', 'Lincoln'],
  },
  {
    name: 'Arizona', abbrev: 'AZ', slug: 'arizona', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'bear', 'sheep', 'lion', 'turkey'],
    drawSystem: 'bonus', unitSystemName: 'Unit', unitCount: 95,
    applicationDeadline: 'June 10', baseDifficultyMod: 0.22,
    turkeySubspecies: ["Merriam's", "Gould's"],
    regionNames: ['Kaibab', 'Coconino', 'Apache', 'White Mountains', 'Tonto', 'Prescott', 'Mogollon Rim', 'Chiricahua', 'Santa Rita', 'Hualapai'],
  },
  // ---- PACIFIC ----
  {
    name: 'Washington', abbrev: 'WA', slug: 'washington', region: 'pacific',
    species: ['elk', 'mule-deer', 'whitetail', 'moose', 'bear', 'sheep', 'goat', 'turkey'],
    drawSystem: 'random', unitSystemName: 'GMU', unitCount: 140,
    applicationDeadline: 'May 31', baseDifficultyMod: 0.10,
    turkeySubspecies: ["Merriam's", 'Rio Grande'],
    regionNames: ['Olympic', 'Cascade', 'Blue Mountains', 'Okanogan', 'Colville', 'Yakima', 'Wenatchee', 'Snoqualmie', 'Palouse', 'Columbia Basin'],
  },
  {
    name: 'Oregon', abbrev: 'OR', slug: 'oregon', region: 'pacific',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'Unit', unitCount: 135,
    applicationDeadline: 'May 15', baseDifficultyMod: 0.12,
    turkeySubspecies: ["Merriam's", 'Rio Grande'],
    regionNames: ['Wallowa', 'Blue Mountains', 'Cascade', 'Coast Range', 'Ochoco', 'Deschutes', 'Malheur', 'Hart Mountain', 'Steens', 'Rogue'],
  },
  {
    name: 'California', abbrev: 'CA', slug: 'california', region: 'pacific',
    species: ['mule-deer', 'whitetail', 'bear', 'sheep', 'lion', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'Zone', unitCount: 90,
    applicationDeadline: 'June 2', baseDifficultyMod: 0.16,
    turkeySubspecies: ['Rio Grande', "Merriam's"],
    regionNames: ['Sierra Nevada', 'Coast Range', 'Klamath', 'Cascade', 'Tehachapi', 'Transverse Range', 'San Bernardino', 'Trinity', 'Mendocino', 'Shasta'],
  },
  {
    name: 'Alaska', abbrev: 'AK', slug: 'alaska', region: 'pacific',
    species: ['elk', 'mule-deer', 'whitetail', 'moose', 'bear', 'sheep', 'goat'],
    drawSystem: 'random', unitSystemName: 'GMU', unitCount: 165,
    applicationDeadline: 'December 15', baseDifficultyMod: 0.20,
    turkeySubspecies: [],
    regionNames: ['Kenai', 'Kodiak', 'Bristol Bay', 'Denali', 'Wrangell', 'Chugach', 'Tongass', 'Interior', 'North Slope', 'Yukon-Kuskokwim', 'Southeast'],
  },
  {
    name: 'Hawaii', abbrev: 'HI', slug: 'hawaii', region: 'pacific',
    species: ['whitetail'], // very limited â axis deer, feral goat, etc. simplified
    drawSystem: 'otc', unitSystemName: 'Area', unitCount: 15,
    applicationDeadline: 'Year-round', baseDifficultyMod: 0.0,
    turkeySubspecies: [],
    regionNames: ['Mauna Kea', 'Mauna Loa', 'Kohala', 'Lanai', 'Molokai', 'Kauai'],
  },
  // ---- PLAINS ----
  {
    name: 'North Dakota', abbrev: 'ND', slug: 'north-dakota', region: 'plains',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'moose', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'Unit', unitCount: 45,
    applicationDeadline: 'March 31', baseDifficultyMod: 0.08,
    turkeySubspecies: ['Eastern', "Merriam's"],
    regionNames: ['Badlands', 'Missouri Plateau', 'Turtle Mountains', 'Killdeer Mountains', 'Pembina Hills', 'Sheyenne River', 'James River'],
  },
  {
    name: 'South Dakota', abbrev: 'SD', slug: 'south-dakota', region: 'plains',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'bear', 'sheep', 'lion', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'Unit', unitCount: 65,
    applicationDeadline: 'March 31', baseDifficultyMod: 0.10,
    turkeySubspecies: ["Merriam's", 'Eastern', 'Rio Grande'],
    regionNames: ['Black Hills', 'Missouri River', 'James River', 'Pine Ridge', 'Prairie Coteau', 'Sand Hills', 'Big Sioux'],
  },
  {
    name: 'Nebraska', abbrev: 'NE', slug: 'nebraska', region: 'plains',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'Unit', unitCount: 55,
    applicationDeadline: 'March 15', baseDifficultyMod: 0.06,
    turkeySubspecies: ["Merriam's", 'Eastern', 'Rio Grande'],
    regionNames: ['Pine Ridge', 'Sandhills', 'Niobrara', 'Platte River', 'Republican River', 'Loess Hills', 'Wildcat Hills'],
  },
  {
    name: 'Kansas', abbrev: 'KS', slug: 'kansas', region: 'plains',
    species: ['mule-deer', 'whitetail', 'pronghorn', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'Unit', unitCount: 40,
    applicationDeadline: 'April 30', baseDifficultyMod: 0.05,
    turkeySubspecies: ['Eastern', 'Rio Grande'],
    regionNames: ['Flint Hills', 'Smoky Hills', 'Chautauqua Hills', 'Red Hills', 'Blue River', 'Cimarron', 'Arkansas River'],
  },
  {
    name: 'Oklahoma', abbrev: 'OK', slug: 'oklahoma', region: 'plains',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMA', unitCount: 50,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern', 'Rio Grande'],
    regionNames: ['Wichita Mountains', 'Ouachita', 'Ozark Plateau', 'Cross Timbers', 'Red River', 'Arbuckle', 'Kiamichi'],
  },
  {
    name: 'Texas', abbrev: 'TX', slug: 'texas', region: 'plains',
    species: ['mule-deer', 'whitetail', 'pronghorn', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 250,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Rio Grande', 'Eastern'],
    regionNames: ['Hill Country', 'South Texas Brush', 'Trans Pecos', 'Rolling Plains', 'Edwards Plateau', 'Pineywoods', 'Cross Timbers', 'Blackland Prairie', 'Gulf Coast', 'Panhandle'],
  },
  // ---- MIDWEST ----
  {
    name: 'Minnesota', abbrev: 'MN', slug: 'minnesota', region: 'midwest',
    species: ['whitetail', 'moose', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'Zone', unitCount: 80,
    applicationDeadline: 'May 1', baseDifficultyMod: 0.04,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Boundary Waters', 'Iron Range', 'Blufflands', 'Prairie', 'Big Woods', 'Central Lakes', 'Red River Valley', 'North Shore'],
  },
  {
    name: 'Wisconsin', abbrev: 'WI', slug: 'wisconsin', region: 'midwest',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'DMU', unitCount: 85,
    applicationDeadline: 'December 10', baseDifficultyMod: 0.04,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Northwoods', 'Central Forest', 'Driftless', 'Kettle Moraine', 'Central Sand Plains', 'Northern Highland', 'Door Peninsula'],
  },
  {
    name: 'Iowa', abbrev: 'IA', slug: 'iowa', region: 'midwest',
    species: ['whitetail', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'Zone', unitCount: 35,
    applicationDeadline: 'May 31', baseDifficultyMod: 0.08,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Loess Hills', 'Driftless', 'Des Moines River', 'Iowa River', 'Missouri Bottoms', 'Skunk River', 'Upper Iowa'],
  },
  {
    name: 'Missouri', abbrev: 'MO', slug: 'missouri', region: 'midwest',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 60,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Ozarks', 'Missouri River Hills', 'Bootheel', 'Prairie', 'Glaciated Plains', 'Mark Twain', 'Big Piney'],
  },
  {
    name: 'Illinois', abbrev: 'IL', slug: 'illinois', region: 'midwest',
    species: ['whitetail', 'turkey'],
    drawSystem: 'random', unitSystemName: 'Zone', unitCount: 45,
    applicationDeadline: 'October 1', baseDifficultyMod: 0.02,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Shawnee', 'Illinois River', 'Kankakee', 'Rock River', 'Wabash', 'Mississippi Bluffs', 'Sangamon'],
  },
  {
    name: 'Michigan', abbrev: 'MI', slug: 'michigan', region: 'midwest',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'DMU', unitCount: 90,
    applicationDeadline: 'June 1', baseDifficultyMod: 0.03,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Upper Peninsula', 'Northern Lower', 'Thumb', 'Southwest', 'Northeast', 'Southeast', 'Pere Marquette'],
  },
  {
    name: 'Indiana', abbrev: 'IN', slug: 'indiana', region: 'midwest',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 30,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Hoosier National', 'Wabash Valley', 'Brown County', 'Muscatatuck', 'Pigeon River', 'Sugar Creek'],
  },
  {
    name: 'Ohio', abbrev: 'OH', slug: 'ohio', region: 'midwest',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 35,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Appalachian Foothills', 'Lake Erie', 'Hocking Hills', 'Mohican', 'Scioto', 'Muskingum', 'Cuyahoga'],
  },
  // ---- SOUTHEAST ----
  {
    name: 'Virginia', abbrev: 'VA', slug: 'virginia', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 50,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Blue Ridge', 'Shenandoah', 'Piedmont', 'Tidewater', 'Alleghany', 'Southwest Virginia', 'Northern Neck'],
  },
  {
    name: 'West Virginia', abbrev: 'WV', slug: 'west-virginia', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 30,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Appalachian Plateau', 'Monongahela', 'Greenbrier', 'Kanawha', 'Potomac Highlands', 'Mountain State'],
  },
  {
    name: 'Kentucky', abbrev: 'KY', slug: 'kentucky', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 40,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Daniel Boone', 'Land Between the Lakes', 'Bluegrass', 'Cumberland Plateau', 'Green River', 'Big Sandy'],
  },
  {
    name: 'Tennessee', abbrev: 'TN', slug: 'tennessee', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 40,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Great Smoky Mountains', 'Cumberland Plateau', 'Highland Rim', 'Nashville Basin', 'West Tennessee', 'Cherokee'],
  },
  {
    name: 'North Carolina', abbrev: 'NC', slug: 'north-carolina', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 45,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Blue Ridge', 'Piedmont', 'Coastal Plain', 'Uwharrie', 'Nantahala', 'Croatan', 'Sandhills'],
  },
  {
    name: 'South Carolina', abbrev: 'SC', slug: 'south-carolina', region: 'southeast',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMA', unitCount: 35,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Upstate', 'Piedmont', 'Midlands', 'Pee Dee', 'Lowcountry', 'Francis Marion'],
  },
  {
    name: 'Georgia', abbrev: 'GA', slug: 'georgia', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMA', unitCount: 55,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Blue Ridge', 'Piedmont', 'Coastal Plain', 'Okefenokee', 'Chattahoochee', 'Oconee', 'Fall Line'],
  },
  {
    name: 'Florida', abbrev: 'FL', slug: 'florida', region: 'southeast',
    species: ['whitetail', 'turkey'],
    drawSystem: 'random', unitSystemName: 'WMA', unitCount: 50,
    applicationDeadline: 'June 15', baseDifficultyMod: 0.02,
    turkeySubspecies: ['Osceola', 'Eastern'],
    regionNames: ['Everglades', 'Big Cypress', 'Ocala', 'Apalachicola', 'Osceola', 'Three Lakes', 'Kissimmee'],
  },
  {
    name: 'Alabama', abbrev: 'AL', slug: 'alabama', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMA', unitCount: 45,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Appalachian', 'Black Belt', 'Coastal Plain', 'Piedmont', 'Tennessee Valley', 'Bankhead', 'Sipsey'],
  },
  {
    name: 'Mississippi', abbrev: 'MS', slug: 'mississippi', region: 'southeast',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 35,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Delta', 'Loess Bluffs', 'Pine Belt', 'Coastal', 'North Mississippi Hills', 'Tombigbee', 'Bienville'],
  },
  {
    name: 'Louisiana', abbrev: 'LA', slug: 'louisiana', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMA', unitCount: 40,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern', 'Rio Grande'],
    regionNames: ['Atchafalaya', 'Kisatchie', 'Pearl River', 'Red River', 'Bayou Macon', 'Tensas', 'Sabine'],
  },
  {
    name: 'Arkansas', abbrev: 'AR', slug: 'arkansas', region: 'southeast',
    species: ['elk', 'whitetail', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'WMA', unitCount: 40,
    applicationDeadline: 'May 1', baseDifficultyMod: 0.04,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Ozark', 'Ouachita', 'Delta', 'Gulf Coastal', 'Arkansas River', 'Buffalo River', 'White River'],
  },
  // ---- NORTHEAST ----
  {
    name: 'Maine', abbrev: 'ME', slug: 'maine', region: 'northeast',
    species: ['whitetail', 'moose', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'WMD', unitCount: 30,
    applicationDeadline: 'May 15', baseDifficultyMod: 0.06,
    turkeySubspecies: ['Eastern'],
    regionNames: ['North Maine Woods', 'Down East', 'Western Mountains', 'Midcoast', 'Kennebec', 'Aroostook'],
  },
  {
    name: 'New Hampshire', abbrev: 'NH', slug: 'new-hampshire', region: 'northeast',
    species: ['whitetail', 'moose', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'WMU', unitCount: 25,
    applicationDeadline: 'June 1', baseDifficultyMod: 0.08,
    turkeySubspecies: ['Eastern'],
    regionNames: ['White Mountains', 'North Country', 'Connecticut River', 'Merrimack Valley', 'Seacoast', 'Lakes Region'],
  },
  {
    name: 'Vermont', abbrev: 'VT', slug: 'vermont', region: 'northeast',
    species: ['whitetail', 'moose', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'WMU', unitCount: 22,
    applicationDeadline: 'April 15', baseDifficultyMod: 0.06,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Green Mountains', 'Northeast Kingdom', 'Champlain Valley', 'Connecticut River', 'Taconic Mountains'],
  },
  {
    name: 'Massachusetts', abbrev: 'MA', slug: 'massachusetts', region: 'northeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 15,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Berkshires', 'Connecticut Valley', 'Central', 'Southeast', 'Cape Cod', 'North Shore'],
  },
  {
    name: 'Connecticut', abbrev: 'CT', slug: 'connecticut', region: 'northeast',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 12,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Northwest Hills', 'Connecticut River Valley', 'Eastern Highlands', 'Coastal'],
  },
  {
    name: 'Rhode Island', abbrev: 'RI', slug: 'rhode-island', region: 'northeast',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 8,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['West Bay', 'East Bay', 'South County', 'Blackstone Valley'],
  },
  {
    name: 'New York', abbrev: 'NY', slug: 'new-york', region: 'northeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMU', unitCount: 70,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Adirondacks', 'Catskills', 'Finger Lakes', 'Southern Tier', 'Hudson Valley', 'St. Lawrence', 'Western NY'],
  },
  {
    name: 'Pennsylvania', abbrev: 'PA', slug: 'pennsylvania', region: 'northeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'WMU', unitCount: 55,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Alleghenies', 'Poconos', 'Susquehanna', 'Laurel Highlands', 'Northern Tier', 'Ridge and Valley', 'Elk Country'],
  },
  {
    name: 'New Jersey', abbrev: 'NJ', slug: 'new-jersey', region: 'northeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 18,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Pine Barrens', 'Highlands', 'Ridge and Valley', 'Kittatinny', 'Coastal Plain', 'Delaware Water Gap'],
  },
  {
    name: 'Delaware', abbrev: 'DE', slug: 'delaware', region: 'northeast',
    species: ['whitetail', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 8,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Piedmont', 'Coastal Plain', 'Chesapeake', 'Delmarva'],
  },
  {
    name: 'Maryland', abbrev: 'MD', slug: 'maryland', region: 'northeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 22,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Western Maryland', 'Piedmont', 'Chesapeake', 'Eastern Shore', 'Catoctin', 'Savage River'],
  },
  // ---- More PLAINS / WEST ----
  {
    name: 'Michigan', abbrev: 'MI', slug: 'michigan', region: 'midwest',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'random', unitSystemName: 'DMU', unitCount: 90,
    applicationDeadline: 'June 1', baseDifficultyMod: 0.03,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Upper Peninsula', 'Northern Lower', 'Thumb', 'Southwest', 'Northeast', 'Southeast', 'Pere Marquette'],
  },
].filter((s, i, arr) => arr.findIndex(x => x.slug === s.slug) === i); // deduplicate

// We need exactly 50. Let's make sure we have all states:
const REMAINING_STATES: StateConfigInternal[] = [
  {
    name: 'North Carolina', abbrev: 'NC', slug: 'north-carolina', region: 'southeast',
    species: ['whitetail', 'bear', 'turkey'],
    drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 45,
    applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
    turkeySubspecies: ['Eastern'],
    regionNames: ['Blue Ridge', 'Piedmont', 'Coastal Plain', 'Uwharrie', 'Nantahala', 'Croatan', 'Sandhills'],
  },
];

// Combine and deduplicate â build final 50 state list
const ALL_STATE_CONFIGS_RAW: StateConfigInternal[] = [...STATE_CONFIGS];

// Add any states we missed
const missingStates: StateConfigInternal[] = [
  {
    name: 'Colorado', abbrev: 'CO', slug: 'colorado', region: 'west',
    species: ['elk', 'mule-deer', 'whitetail', 'pronghorn', 'moose', 'bear', 'sheep', 'goat', 'lion', 'turkey'],
    drawSystem: 'preference', unitSystemName: 'GMU', unitCount: 200,
    applicationDeadline: 'April 1', baseDifficultyMod: 0.15,
    turkeySubspecies: ["Merriam's", 'Rio Grande'],
    regionNames: ['North Park', 'Upper Colorado River', 'Eagle Valley', 'Gore Range', 'Flat Tops', 'White River', 'Piceance Basin', 'Bookcliffs', 'Grand Mesa', 'Gunnison Basin'],
  },
];

// Final deduplicated array
const ALL_STATES: StateConfigInternal[] = (() => {
  const map = new Map<string, StateConfigInternal>();
  for (const s of ALL_STATE_CONFIGS_RAW) {
    if (!map.has(s.slug)) map.set(s.slug, s);
  }
  return Array.from(map.values());
})();

// Verify we have all 50 by adding any that are missing
const EXPECTED_SLUGS = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
  'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','new-hampshire','new-jersey','new-mexico',
  'new-york','north-carolina','north-dakota','ohio','oklahoma','oregon','pennsylvania',
  'rhode-island','south-carolina','south-dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west-virginia','wisconsin','wyoming',
];

// Fill in any missing states as generic OTC whitetail+turkey states
for (const slug of EXPECTED_SLUGS) {
  if (!ALL_STATES.find(s => s.slug === slug)) {
    // This shouldn't happen but is a safety net
    const name = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    ALL_STATES.push({
      name, abbrev: name.slice(0, 2).toUpperCase(), slug, region: 'southeast',
      species: ['whitetail', 'turkey'],
      drawSystem: 'otc', unitSystemName: 'Zone', unitCount: 20,
      applicationDeadline: 'Year-round OTC', baseDifficultyMod: 0.0,
      turkeySubspecies: ['Eastern'],
      regionNames: ['North', 'South', 'East', 'West', 'Central'],
    });
  }
}

// ============================================================
// 3. Year Data Generation
// ============================================================

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

function generateYearData(
  year: number,
  baseTags: number,
  baseDifficulty: number,
  baseSuccess: number,
  seed: number
): YearData {
  const rand = seededRandom(seed + year * 7);

  const tagVariance = Math.round(baseTags * (0.9 + rand() * 0.2));
  const totalTags = Math.max(1, tagVariance);

  const demandMultiplier = 1.5 + baseDifficulty * 8 + rand() * 2;
  const totalApplicants = Math.round(totalTags * demandMultiplier);
  const residentApplicants = Math.round(totalApplicants * (0.75 + rand() * 0.1));
  const nonresidentApplicants = totalApplicants - residentApplicants;

  const minPointsResident = Math.max(
    0,
    Math.round(baseDifficulty * 15 + (rand() - 0.5) * 3 + (year - 2020) * 0.3)
  );
  const minPointsNonresident = Math.min(
    25,
    minPointsResident + Math.round(1 + rand() * 3)
  );

  const drawOddsByPoint: Record<number, { resident: number; nonresident: number }> = {};
  for (let p = 0; p <= 25; p++) {
    let resOdds = 0;
    let nrOdds = 0;
    if (p >= minPointsResident + 3) {
      resOdds = 95 + rand() * 5;
    } else if (p >= minPointsResident) {
      resOdds = 30 + (p - minPointsResident) * 25 + rand() * 10;
    } else if (p >= minPointsResident - 2) {
      resOdds = Math.max(0, 5 + (p - minPointsResident + 2) * 12 + rand() * 5);
    }

    if (p >= minPointsNonresident + 3) {
      nrOdds = 90 + rand() * 10;
    } else if (p >= minPointsNonresident) {
      nrOdds = 20 + (p - minPointsNonresident) * 25 + rand() * 8;
    } else if (p >= minPointsNonresident - 2) {
      nrOdds = Math.max(0, 3 + (p - minPointsNonresident + 2) * 10 + rand() * 4);
    }

    drawOddsByPoint[p] = {
      resident: Math.min(100, Math.round(resOdds * 10) / 10),
      nonresident: Math.min(100, Math.round(nrOdds * 10) / 10),
    };
  }

  const licensesIssued = totalTags + Math.round(rand() * totalTags * 0.1);
  const huntersAfield = Math.round(licensesIssued * (0.7 + rand() * 0.25));
  const successVar = baseSuccess + (rand() - 0.5) * 0.15;
  const successRate = Math.max(5, Math.min(85, Math.round(successVar * 1000) / 10));
  const totalHarvest = Math.round(huntersAfield * (successRate / 100));

  return {
    year,
    totalTags,
    totalApplicants,
    residentApplicants,
    nonresidentApplicants,
    minPointsResident,
    minPointsNonresident,
    drawOddsByPoint,
    licensesIssued,
    huntersAfield,
    totalHarvest,
    successRate,
  };
}

// ============================================================
// 4. Unit Generation Per State
// ============================================================

interface UnitGenConfig {
  gmu: string;
  region: string;
  species: Species;
  seasons: Season[];
  sexes: Sex[];
  baseTags: number;
  baseDifficulty: number;
  baseSuccess: number;
}

/** Species-specific base parameters */
const SPECIES_PARAMS: Record<Species, {
  baseTagsRange: [number, number];
  baseDiffRange: [number, number];
  baseSuccRange: [number, number];
  unitFraction: number; // fraction of state units that have this species
}> = {
  elk:        { baseTagsRange: [20, 250], baseDiffRange: [0.2, 0.9], baseSuccRange: [0.15, 0.45], unitFraction: 0.5 },
  'mule-deer':{ baseTagsRange: [40, 300], baseDiffRange: [0.1, 0.7], baseSuccRange: [0.25, 0.50], unitFraction: 0.6 },
  whitetail:  { baseTagsRange: [80, 500], baseDiffRange: [0.0, 0.3], baseSuccRange: [0.30, 0.60], unitFraction: 0.8 },
  pronghorn:  { baseTagsRange: [20, 200], baseDiffRange: [0.1, 0.7], baseSuccRange: [0.55, 0.75], unitFraction: 0.3 },
  moose:      { baseTagsRange: [2, 15],   baseDiffRange: [0.85, 0.99],baseSuccRange: [0.70, 0.90], unitFraction: 0.15 },
  bear:       { baseTagsRange: [15, 60],  baseDiffRange: [0.2, 0.6], baseSuccRange: [0.08, 0.25], unitFraction: 0.35 },
  sheep:      { baseTagsRange: [1, 8],    baseDiffRange: [0.95, 0.99],baseSuccRange: [0.75, 0.92], unitFraction: 0.08 },
  goat:       { baseTagsRange: [1, 6],    baseDiffRange: [0.95, 0.99],baseSuccRange: [0.78, 0.92], unitFraction: 0.06 },
  lion:       { baseTagsRange: [8, 25],   baseDiffRange: [0.3, 0.6], baseSuccRange: [0.06, 0.18], unitFraction: 0.2 },
  turkey:     { baseTagsRange: [50, 400], baseDiffRange: [0.0, 0.2], baseSuccRange: [0.15, 0.35], unitFraction: 0.6 },
};

/** Get unique real GMU IDs for a state+species from the lookup */
function getRealGMUsForSpecies(stateSlug: string, species: string): string[] {
  const gmus = new Set<string>();
  for (const [key] of REAL_GMU_LOOKUP) {
    if (key.startsWith(`${stateSlug}-${species}-`)) {
      // key format: "state-species-gmu-year"
      const parts = key.split('-');
      // species may contain hyphens (mule-deer), so extract gmu carefully
      // format: stateSlug-species-gmu-year where year is last part
      const yearStr = parts[parts.length - 1];
      const prefix = `${stateSlug}-${species}-`;
      const gmuAndYear = key.slice(prefix.length);
      const gmu = gmuAndYear.slice(0, gmuAndYear.length - yearStr.length - 1);
      if (gmu) gmus.add(gmu);
    }
  }
  return [...gmus].sort();
}

function generateUnitsForState(state: StateConfigInternal): UnitGenConfig[] {
  const rand = seededRandom(hashSeed(state.slug + '-units'));
  const configs: UnitGenConfig[] = [];

  for (const speciesStr of state.species) {
    if (speciesStr === 'turkey') continue; // handled separately
    const species = speciesStr as Species;

    const params = SPECIES_PARAMS[species];
    const seasons = SPECIES_SEASONS[species];
    const sexes = SEX_OPTIONS[species];

    // Check if we have real per-GMU data for this state+species
    const realGMUs = getRealGMUsForSpecies(state.slug, speciesStr);

    if (realGMUs.length > 0) {
      // Use REAL GMU numbers from harvest data
      for (const gmu of realGMUs) {
        const regionIdx = Math.floor(rand() * state.regionNames.length);
        const region = state.regionNames[regionIdx];

        const diffRange = params.baseDiffRange;
        const baseDifficulty = diffRange[0] + rand() * (diffRange[1] - diffRange[0]) + state.baseDifficultyMod;
        const clampedDiff = Math.max(0, Math.min(1, baseDifficulty));

        const succRange = params.baseSuccRange;
        const baseSuccess = succRange[0] + rand() * (succRange[1] - succRange[0]);

        const tagRange = params.baseTagsRange;
        const baseTags = Math.round(tagRange[0] + rand() * (tagRange[1] - tagRange[0]));

        configs.push({
          gmu,
          region,
          species,
          seasons,
          sexes,
          baseTags,
          baseDifficulty: clampedDiff,
          baseSuccess,
        });
      }
    } else {
      // No real data â generate random GMU numbers (original behavior)
      const unitCount = Math.max(2, Math.round(state.unitCount * params.unitFraction));
      const numUnits = Math.min(unitCount, 40);

      for (let i = 0; i < numUnits; i++) {
        let gmu: string;
        if (species === 'sheep') {
          gmu = `S${Math.round(1 + rand() * (state.unitCount - 1))}`;
        } else if (species === 'goat') {
          gmu = `G${Math.round(1 + rand() * (state.unitCount - 1))}`;
        } else {
          gmu = `${Math.round(1 + rand() * (state.unitCount - 1))}`;
        }

        const regionIdx = Math.floor(rand() * state.regionNames.length);
        const region = state.regionNames[regionIdx];

        const diffRange = params.baseDiffRange;
        const baseDifficulty = diffRange[0] + rand() * (diffRange[1] - diffRange[0]) + state.baseDifficultyMod;
        const clampedDiff = Math.max(0, Math.min(1, baseDifficulty));

        const succRange = params.baseSuccRange;
        const baseSuccess = succRange[0] + rand() * (succRange[1] - succRange[0]);

        const tagRange = params.baseTagsRange;
        const baseTags = Math.round(tagRange[0] + rand() * (tagRange[1] - tagRange[0]));

        configs.push({
          gmu,
          region,
          species,
          seasons,
          sexes,
          baseTags,
          baseDifficulty: clampedDiff,
          baseSuccess,
        });
      }
    }
  }

  return configs;
}

// ============================================================
// 5. Build HuntUnit records (lazily cached per state)
// ============================================================

const _stateUnitCache = new Map<string, HuntUnit[]>();

function buildStateHuntUnits(state: StateConfigInternal): HuntUnit[] {
  if (_stateUnitCache.has(state.slug)) return _stateUnitCache.get(state.slug)!;

  const unitConfigs = generateUnitsForState(state);
  const units: HuntUnit[] = [];
  let seedCounter = hashSeed(state.slug + '-build');

  // Pre-compute anchor distributions for each species in this state
  // Count total hunt codes (unit Ã season Ã sex combos) per species, not just units
  const speciesUnitCounts = new Map<string, number>();
  const speciesHuntCodeCounts = new Map<string, number>();
  for (const config of unitConfigs) {
    speciesUnitCounts.set(config.species, (speciesUnitCounts.get(config.species) || 0) + 1);
    const combos = config.seasons.length * config.sexes.length;
    speciesHuntCodeCounts.set(config.species, (speciesHuntCodeCounts.get(config.species) || 0) + combos);
  }
  const speciesUnitIndex = new Map<string, number>();

  for (const config of unitConfigs) {
    // Track unit index per species for anchor distribution
    const unitIdx = speciesUnitIndex.get(config.species) || 0;
    speciesUnitIndex.set(config.species, unitIdx + 1);

    const anchor = findAnchor(state.slug, config.species);
    // Use total hunt code count (not unit count) so harvest is distributed across ALL combos
    const anchorUnitCount = speciesHuntCodeCounts.get(config.species) || 1;
    const dist = anchor ? getAnchorDistribution(state.slug, config.species, anchorUnitCount, anchor) : null;
    // Check if anchor has any usable harvest/success data
    const anchorHasData = anchor && (
      Object.keys(anchor.statewideTotalHarvest).length > 0 ||
      Object.keys(anchor.statewideSuccessRate).length > 0
    );

    // Track a separate huntCodeIdx that increments per season/sex combo
    let huntCodeIdx = speciesUnitIndex.get(config.species + '-hc') || 0;

    // Pre-compute season/sex combo counts for real data distribution
    const seasonCounts: Record<string, number> = {};
    const sexCounts: Record<string, number> = {};
    const totalCombos = config.seasons.length * config.sexes.length;
    for (const s of config.seasons) {
      seasonCounts[s] = (seasonCounts[s] || 0) + config.sexes.length;
    }
    for (const sx of config.sexes) {
      sexCounts[sx] = (sexCounts[sx] || 0) + config.seasons.length;
    }

    // Check if ANY year has real GMU data for this unit
    const hasAnyRealData = YEARS.some(year => {
      const realKey = `${state.slug}-${config.species}-${config.gmu}-${year}`;
      return REAL_GMU_LOOKUP.has(realKey);
    });

    for (const season of config.seasons) {
      for (const sex of config.sexes) {
        const seed = seedCounter++;
        const currentHcIdx = huntCodeIdx++;

        // Adjust difficulty per season/sex
        let diffMod = 0;
        if (season === 'archery') diffMod -= 0.1;
        if (season === 'muzzleloader') diffMod -= 0.05;
        if (sex === 'cow' || sex === 'doe') diffMod -= 0.2;

        const adjustedDifficulty = Math.max(0, Math.min(1, config.baseDifficulty + diffMod));

        let successMod = 0;
        if (season === 'archery') successMod -= 0.08;
        if (sex === 'cow' || sex === 'doe') successMod += 0.1;
        const adjustedSuccess = Math.max(0.05, Math.min(0.9, config.baseSuccess + successMod));

        const tagsMod = (sex === 'cow' || sex === 'doe') ? 1.5 : sex === 'either' ? 0.8 : 1;

        let years: YearData[];

        if (hasAnyRealData) {
          // Priority 1: Real per-GMU data â distribute GMU totals across season/sex combos
          years = YEARS.map(year => {
            const realKey = `${state.slug}-${config.species}-${config.gmu}-${year}`;
            const realData = REAL_GMU_LOOKUP.get(realKey);
            if (realData && (realData.totalHunters > 0 || realData.totalHarvest > 0)) {
              return generateFromRealData(
                realData, season, sex, totalCombos, seasonCounts, sexCounts,
                adjustedDifficulty, seed
              );
            }
            // Fall back to anchor or random for years without real data
            if (anchorHasData && dist) {
              const calibrated = generateCalibratedYearData(
                year, currentHcIdx, anchor!, dist, adjustedDifficulty, seed, successMod
              );
              if (calibrated !== null) return calibrated;
            }
            return generateYearData(year, Math.round(config.baseTags * tagsMod), adjustedDifficulty, adjustedSuccess, seed);
          });
        } else if (anchorHasData && dist) {
          // Priority 2: Statewide anchor-calibrated generation
          years = YEARS.map(year => {
            const calibrated = generateCalibratedYearData(
              year, currentHcIdx, anchor!, dist, adjustedDifficulty, seed, successMod
            );
            // If calibrated returned null (no data for this year), fall back to random
            if (calibrated === null) {
              return generateYearData(year, Math.round(config.baseTags * tagsMod), adjustedDifficulty, adjustedSuccess, seed);
            }
            return calibrated;
          });
        } else {
          // Priority 3: Pure random generation (original behavior)
          years = YEARS.map(year =>
            generateYearData(year, Math.round(config.baseTags * tagsMod), adjustedDifficulty, adjustedSuccess, seed)
          );
        }

        const sp = config.species.replace('-', '').charAt(0).toUpperCase();
        const huntCode = `${state.abbrev}${sp}${config.gmu}${season.charAt(0).toUpperCase()}${sex.charAt(0).toUpperCase()}`;

        units.push({
          state: state.slug,
          gmu: config.gmu,
          region: config.region,
          species: config.species,
          season,
          sex,
          huntCode,
          years,
          dataSource: hasAnyRealData ? "verified" : "estimated",
        });
      }
    }
    // Save the hunt code index back for the next GMU of same species
    speciesUnitIndex.set(config.species + '-hc', huntCodeIdx);
  }

  _stateUnitCache.set(state.slug, units);
  return units;
}

// ============================================================
// 6. Turkey-Specific Data Generation
// ============================================================

const _turkeyCache = new Map<string, TurkeyUnitData[]>();

function generateTurkeyData(state: StateConfigInternal): TurkeyUnitData[] {
  if (_turkeyCache.has(state.slug)) return _turkeyCache.get(state.slug)!;
  if (!state.species.includes('turkey') || state.turkeySubspecies.length === 0) {
    _turkeyCache.set(state.slug, []);
    return [];
  }

  const rand = seededRandom(hashSeed(state.slug + '-turkey'));
  const params = SPECIES_PARAMS.turkey;
  const numUnits = Math.min(Math.max(3, Math.round(state.unitCount * params.unitFraction)), 35);

  // Look up turkey anchor
  const turkeyAnchor = findAnchor(state.slug, 'turkey');
  const turkeyAnchorHasData = turkeyAnchor && (
    Object.keys(turkeyAnchor.statewideTotalHarvest).length > 0 ||
    Object.keys(turkeyAnchor.statewideSuccessRate).length > 0
  );
  // First pass: count total turkey hunt codes to properly distribute anchors
  // We need to pre-count combos before building
  const preCountRng = seededRandom(hashSeed(state.slug + '-turkey-precount'));
  let estTurkeyHuntCount = 0;
  for (let i = 0; i < numUnits; i++) {
    // Simulate same skip logic to count how many hunt codes will be generated
    for (const ts of ['spring', 'fall'] as TurkeySeason[]) {
      if (ts === 'fall' && preCountRng() > 0.5) continue;
      for (const weapon of ['shotgun', 'archery', 'crossbow'] as Season[]) {
        if (weapon === 'crossbow' && preCountRng() > 0.4) continue;
        for (const sex of ['tom', 'hen', 'either-sex'] as Sex[]) {
          if (sex === 'hen' && ts === 'spring') continue;
          if (sex === 'hen' && preCountRng() > 0.3) continue;
          estTurkeyHuntCount++;
        }
      }
    }
  }
  estTurkeyHuntCount = Math.max(1, estTurkeyHuntCount);

  const turkeyDist = turkeyAnchorHasData && turkeyAnchor
    ? getAnchorDistribution(state.slug, 'turkey', estTurkeyHuntCount, turkeyAnchor)
    : null;

  const turkeySeasons: TurkeySeason[] = ['spring', 'fall'];
  const weapons: Season[] = ['shotgun', 'archery', 'crossbow'];
  const sexes: Sex[] = ['tom', 'hen', 'either-sex'];

  const results: TurkeyUnitData[] = [];
  let seedCounter = hashSeed(state.slug + '-turkey-build');
  let turkeyHcIdx = 0; // global hunt code index for distribution

  for (let i = 0; i < numUnits; i++) {
    const gmu = `${Math.round(1 + rand() * (state.unitCount - 1))}`;
    const regionIdx = Math.floor(rand() * state.regionNames.length);
    const region = state.regionNames[regionIdx];

    // Determine subspecies present in this unit â pick 1-2 from state list
    const subCount = Math.min(state.turkeySubspecies.length, 1 + Math.floor(rand() * 2));
    const subs: TurkeySubspecies[] = [];
    const shuffled = [...state.turkeySubspecies].sort(() => rand() - 0.5);
    for (let s = 0; s < subCount; s++) subs.push(shuffled[s] as TurkeySubspecies);

    for (const ts of turkeySeasons) {
      // Fall turkey is less common
      if (ts === 'fall' && rand() > 0.5) continue;

      for (const weapon of weapons) {
        // Not all units have all weapon types
        if (weapon === 'crossbow' && rand() > 0.4) continue;

        for (const sex of sexes) {
          // Hen-only tags are rare
          if (sex === 'hen' && ts === 'spring') continue;
          if (sex === 'hen' && rand() > 0.3) continue;

          const seed = seedCounter++;
          const currentTurkeyIdx = turkeyHcIdx++;
          const baseTags = Math.round(params.baseTagsRange[0] + rand() * (params.baseTagsRange[1] - params.baseTagsRange[0]));
          const baseDiff = params.baseDiffRange[0] + rand() * (params.baseDiffRange[1] - params.baseDiffRange[0]) + state.baseDifficultyMod;
          const baseSucc = params.baseSuccRange[0] + rand() * (params.baseSuccRange[1] - params.baseSuccRange[0]);
          const clampedDiff = Math.max(0, Math.min(1, baseDiff));

          let years: YearData[];
          if (turkeyAnchorHasData && turkeyDist && turkeyAnchor) {
            years = YEARS.map(year => {
              const calibrated = generateCalibratedYearData(
                year, currentTurkeyIdx, turkeyAnchor, turkeyDist, clampedDiff, seed, 0
              );
              if (calibrated === null) {
                return generateYearData(year, baseTags, clampedDiff, baseSucc, seed);
              }
              return calibrated;
            });
          } else {
            years = YEARS.map(year =>
              generateYearData(year, baseTags, clampedDiff, baseSucc, seed)
            );
          }

          const harvestPerHunter = 0.15 + rand() * 0.5;
          const nwtfHabitatScore = 30 + rand() * 70;

          const huntCode = `${state.abbrev}TK${gmu}${ts.charAt(0).toUpperCase()}${weapon.charAt(0).toUpperCase()}${sex.charAt(0).toUpperCase()}`;

          results.push({
            state: state.slug,
            gmu,
            region,
            subspecies: subs,
            turkeySeason: ts,
            weapon,
            sex,
            huntCode,
            harvestPerHunter: Math.round(harvestPerHunter * 100) / 100,
            nwtfHabitatScore: Math.round(nwtfHabitatScore),
            years,
          });
        }
      }
    }
  }

  _turkeyCache.set(state.slug, results);
  return results;
}

// ============================================================
// 7. Season Calendar Generation
// ============================================================

const SEASON_DATE_TEMPLATES: Record<Species, Record<Season, { open: string; close: string } | null>> = {
  elk: {
    archery: { open: 'Sep 1', close: 'Sep 30' },
    muzzleloader: { open: 'Sep 12', close: 'Sep 20' },
    rifle: { open: 'Oct 15', close: 'Nov 15' },
    shotgun: null, crossbow: null,
  },
  'mule-deer': {
    archery: { open: 'Sep 1', close: 'Sep 30' },
    muzzleloader: { open: 'Sep 12', close: 'Sep 20' },
    rifle: { open: 'Oct 15', close: 'Nov 8' },
    shotgun: null, crossbow: null,
  },
  whitetail: {
    archery: { open: 'Sep 15', close: 'Oct 31' },
    muzzleloader: { open: 'Oct 1', close: 'Oct 15' },
    rifle: { open: 'Nov 1', close: 'Dec 15' },
    shotgun: null, crossbow: null,
  },
  pronghorn: {
    archery: { open: 'Aug 15', close: 'Sep 15' },
    muzzleloader: { open: 'Sep 1', close: 'Sep 10' },
    rifle: { open: 'Sep 20', close: 'Oct 20' },
    shotgun: null, crossbow: null,
  },
  moose: {
    archery: { open: 'Sep 1', close: 'Sep 14' },
    rifle: { open: 'Sep 15', close: 'Oct 31' },
    muzzleloader: null, shotgun: null, crossbow: null,
  },
  bear: {
    archery: { open: 'Sep 1', close: 'Sep 30' },
    rifle: { open: 'Sep 1', close: 'Nov 30' },
    muzzleloader: null, shotgun: null, crossbow: null,
  },
  sheep: {
    rifle: { open: 'Aug 15', close: 'Sep 30' },
    archery: null, muzzleloader: null, shotgun: null, crossbow: null,
  },
  goat: {
    rifle: { open: 'Sep 1', close: 'Oct 15' },
    archery: null, muzzleloader: null, shotgun: null, crossbow: null,
  },
  lion: {
    rifle: { open: 'Nov 1', close: 'Mar 31' },
    archery: null, muzzleloader: null, shotgun: null, crossbow: null,
  },
  turkey: {
    shotgun: { open: 'Apr 15', close: 'May 31' },
    archery: { open: 'Apr 15', close: 'May 31' },
    crossbow: { open: 'Apr 15', close: 'May 31' },
    rifle: null, muzzleloader: null,
  },
};

function generateSeasonCalendar(state: StateConfigInternal): SeasonCalendarEntry[] {
  const entries: SeasonCalendarEntry[] = [];
  for (const speciesStr of state.species) {
    const species = speciesStr as Species;
    const seasons = SPECIES_SEASONS[species];
    const sexes = SEX_OPTIONS[species];
    for (const season of seasons) {
      const template = SEASON_DATE_TEMPLATES[species]?.[season];
      if (!template) continue;
      for (const sex of sexes) {
        entries.push({
          species,
          season,
          sex,
          openDate: template.open,
          closeDate: template.close,
        });
      }
    }
  }
  return entries;
}

// ============================================================
// 8. Public API â Export Functions
// ============================================================

/** Returns all 50 state configs (without internal generation params) */
export function getAllStates(): StateConfig[] {
  return ALL_STATES.map(({ baseDifficultyMod, turkeySubspecies, regionNames, ...rest }) => ({
    ...rest,
    region: rest.region as StateRegion,
    species: rest.species as Species[],
    drawSystem: rest.drawSystem as DrawSystem,
  }));
}

/** Returns a single state config by slug */
export function getStateBySlug(slug: string): StateConfig | undefined {
  const s = ALL_STATES.find(st => st.slug === slug);
  if (!s) return undefined;
  const { baseDifficultyMod, turkeySubspecies, regionNames, ...rest } = s;
  return {
    ...rest,
    region: rest.region as StateRegion,
    species: rest.species as Species[],
    drawSystem: rest.drawSystem as DrawSystem,
  };
}

/** Returns species available in a state */
export function getStateSpecies(stateSlug: string): Species[] {
  const s = ALL_STATES.find(st => st.slug === stateSlug);
  return s ? (s.species as Species[]) : [];
}

/** Returns all hunt units for a species in a state */
export function getSpeciesUnits(stateSlug: string, species: Species): HuntUnit[] {
  const state = ALL_STATES.find(st => st.slug === stateSlug);
  if (!state) return [];

  if (species === 'turkey') {
    // Convert turkey data to HuntUnit format for compatibility
    const tData = generateTurkeyData(state);
    return tData.map(t => ({
      state: t.state,
      gmu: t.gmu,
      region: t.region,
      species: 'turkey' as Species,
      season: t.weapon,
      sex: t.sex,
      huntCode: t.huntCode,
      years: t.years,
      dataSource: (t.state === 'wisconsin' ? 'verified' : 'estimated') as 'verified' | 'estimated',
    }));
  }

  const units = buildStateHuntUnits(state);
  return units.filter(u => u.species === species);
}

/** Returns detail for a specific unit */
export function getUnitDetail(stateSlug: string, species: Species, gmu: string): HuntUnit[] {
  const all = getSpeciesUnits(stateSlug, species);
  return all.filter(u => u.gmu === gmu);
}

/** Returns unique GMU identifiers for a species in a state */
export function getUniqueGMUs(stateSlug: string, species: Species): string[] {
  const units = getSpeciesUnits(stateSlug, species);
  const gmus = new Set(units.map(u => u.gmu));
  return Array.from(gmus).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, '')) || 0;
    const nb = parseInt(b.replace(/\D/g, '')) || 0;
    return na - nb;
  });
}

/** Filtered unit search with draw odds calculation */
export function getFilteredUnits(
  stateSlug: string,
  species: Species,
  season: Season | 'all',
  sex: Sex | 'all',
  residency: Residency,
  points: number
): (HuntUnit & { drawOdds: number; latestYear: YearData })[] {
  const all = getSpeciesUnits(stateSlug, species);
  return all
    .filter(u => {
      if (season !== 'all' && u.season !== season) return false;
      if (sex !== 'all' && u.sex !== sex) return false;
      return true;
    })
    .map(u => {
      const latestYear = u.years[u.years.length - 1];
      const pointData = latestYear.drawOddsByPoint[points] || { resident: 0, nonresident: 0 };
      const drawOdds = residency === 'resident' ? pointData.resident : pointData.nonresident;
      return { ...u, drawOdds, latestYear };
    });
}

/** Returns season calendar data for a state */
export function getStateSeasons(stateSlug: string): SeasonCalendarEntry[] {
  const state = ALL_STATES.find(st => st.slug === stateSlug);
  if (!state) return [];
  return generateSeasonCalendar(state);
}

/** Returns turkey-specific data for a state */
export function getTurkeyData(stateSlug: string): TurkeyUnitData[] {
  const state = ALL_STATES.find(st => st.slug === stateSlug);
  if (!state) return [];
  return generateTurkeyData(state);
}

// ============================================================
// 9. Legacy / Convenience Exports
// ============================================================

/** Flat list of all hunt units across all states (use sparingly â expensive) */
export function getAllHuntUnits(): HuntUnit[] {
  const all: HuntUnit[] = [];
  for (const state of ALL_STATES) {
    all.push(...buildStateHuntUnits(state));
    const turkey = generateTurkeyData(state);
    all.push(...turkey.map(t => ({
      state: t.state,
      gmu: t.gmu,
      region: t.region,
      species: 'turkey' as Species,
      season: t.weapon,
      sex: t.sex,
      huntCode: t.huntCode,
      years: t.years,
      dataSource: (t.state === 'wisconsin' ? 'verified' : 'estimated') as 'verified' | 'estimated',
    })));
  }
  return all;
}
