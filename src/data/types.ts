// ============================================================
// HuntScout Pro — shared type definitions
// ============================================================
// Agency data types live in src/data/agency/schema.ts.

// --- Species ---

export type Species =
  | 'elk'
  | 'mule-deer'
  | 'whitetail'
  | 'pronghorn'
  | 'moose'
  | 'bear'
  | 'sheep'
  | 'goat'
  | 'lion'
  | 'turkey';

export const SPECIES_LABELS: Record<Species, string> = {
  elk: 'Elk',
  'mule-deer': 'Mule Deer',
  whitetail: 'Whitetail Deer',
  pronghorn: 'Pronghorn',
  moose: 'Moose',
  bear: 'Black Bear',
  sheep: 'Bighorn Sheep',
  goat: 'Mountain Goat',
  lion: 'Mountain Lion',
  turkey: 'Wild Turkey',
};

// --- Seasons (used by the hunt planner) ---

export type Season = 'rifle' | 'archery' | 'muzzleloader' | 'shotgun' | 'crossbow';

export const SEASON_LABELS: Record<Season, string> = {
  rifle: 'Rifle',
  archery: 'Archery',
  muzzleloader: 'Muzzleloader',
  shotgun: 'Shotgun',
  crossbow: 'Crossbow',
};

/** Weapon seasons a planner entry can pick per species */
export const SPECIES_SEASONS: Record<Species, Season[]> = {
  elk: ['rifle', 'archery', 'muzzleloader'],
  'mule-deer': ['rifle', 'archery', 'muzzleloader'],
  whitetail: ['rifle', 'archery', 'muzzleloader'],
  pronghorn: ['rifle', 'archery', 'muzzleloader'],
  moose: ['rifle', 'archery', 'muzzleloader'],
  bear: ['rifle', 'archery', 'muzzleloader'],
  sheep: ['rifle', 'archery', 'muzzleloader'],
  goat: ['rifle', 'archery', 'muzzleloader'],
  lion: ['rifle', 'archery', 'muzzleloader'],
  turkey: ['shotgun', 'archery', 'crossbow'],
};
