// ============================================================
// HuntScout Pro — Type Definitions
// ============================================================

// --- Geography ---

export type StateRegion = 'west' | 'midwest' | 'southeast' | 'northeast' | 'plains' | 'pacific';

export interface StateConfig {
  name: string;
  abbrev: string;
  slug: string;
  region: StateRegion;
  species: Species[];
  drawSystem: DrawSystem;
  unitSystemName: string; // GMU, WMU, Zone, Unit, Area, WMA, DMU, etc.
  unitCount: number;
  applicationDeadline: string; // e.g. "April" or "March 1"
}

// --- Draw System ---

export type DrawSystem = 'preference' | 'bonus' | 'random' | 'otc' | 'hybrid';

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

// --- Seasons ---

export type Season = 'rifle' | 'archery' | 'muzzleloader' | 'shotgun' | 'crossbow';

export const SEASON_LABELS: Record<Season, string> = {
  rifle: 'Rifle',
  archery: 'Archery',
  muzzleloader: 'Muzzleloader',
  shotgun: 'Shotgun',
  crossbow: 'Crossbow',
};

/** Which seasons are valid per species */
export const SPECIES_SEASONS: Record<Species, Season[]> = {
  elk: ['rifle', 'archery', 'muzzleloader'],
  'mule-deer': ['rifle', 'archery', 'muzzleloader'],
  whitetail: ['rifle', 'archery', 'muzzleloader'],
  pronghorn: ['rifle', 'archery', 'muzzleloader'],
  moose: ['rifle', 'archery'],
  bear: ['rifle', 'archery'],
  sheep: ['rifle'],
  goat: ['rifle'],
  lion: ['rifle'],
  turkey: ['shotgun', 'archery', 'crossbow'],
};

// --- Sex / Harvest Category ---

export type Sex =
  | 'bull'
  | 'buck'
  | 'doe'
  | 'cow'
  | 'either'
  | 'either-sex'
  | 'tom'
  | 'hen'
  | 'jake';

export const SEX_LABELS: Record<Sex, string> = {
  bull: 'Bull',
  buck: 'Buck',
  doe: 'Doe',
  cow: 'Cow',
  either: 'Either Sex',
  'either-sex': 'Either Sex',
  tom: 'Tom',
  hen: 'Hen',
  jake: 'Jake',
};

export const SEX_OPTIONS: Record<Species, Sex[]> = {
  elk: ['bull', 'cow', 'either'],
  'mule-deer': ['buck', 'doe', 'either'],
  whitetail: ['buck', 'doe', 'either'],
  pronghorn: ['buck', 'doe', 'either'],
  moose: ['bull', 'cow', 'either'],
  bear: ['either'],
  sheep: ['either'],
  goat: ['either'],
  lion: ['either'],
  turkey: ['tom', 'hen', 'either-sex', 'jake'],
};

// --- Turkey Subspecies ---

export type TurkeySubspecies = 'Eastern' | "Merriam's" | 'Rio Grande' | 'Osceola' | "Gould's";

export const TURKEY_SUBSPECIES_ALL: TurkeySubspecies[] = [
  'Eastern',
  "Merriam's",
  'Rio Grande',
  'Osceola',
  "Gould's",
];

// --- Residency ---

export type Residency = 'resident' | 'nonresident';

// --- Year / Draw Data ---

export interface YearData {
  year: number;
  totalTags: number;
  totalApplicants: number;
  residentApplicants: number;
  nonresidentApplicants: number;
  minPointsResident: number;
  minPointsNonresident: number;
  drawOddsByPoint: Record<number, { resident: number; nonresident: number }>;
  licensesIssued: number;
  huntersAfield: number;
  totalHarvest: number;
  successRate: number;
}

// --- Hunt Unit ---

export interface HuntUnit {
  state: string;       // state slug
  gmu: string;
  region: string;
  species: Species;
  season: Season;
  sex: Sex;
  huntCode: string;
  years: YearData[];
}

// --- Turkey-Specific Data ---

export type TurkeySeason = 'spring' | 'fall';

export interface TurkeyUnitData {
  state: string;
  gmu: string;
  region: string;
  subspecies: TurkeySubspecies[];
  turkeySeason: TurkeySeason;
  weapon: Season; // shotgun | archery | crossbow
  sex: Sex;
  huntCode: string;
  harvestPerHunter: number;
  nwtfHabitatScore: number; // 0-100
  years: YearData[];
}

// --- Season Calendar ---

export interface SeasonCalendarEntry {
  species: Species;
  season: Season;
  sex: Sex;
  openDate: string;  // "Sep 1"
  closeDate: string; // "Sep 30"
  notes?: string;
}

// --- Subscription Plan ---

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;           // monthly in cents
  annualPrice: number;     // annual in cents
  maxStates: number;       // -1 = unlimited
  features: string[];
  recommended?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Scout',
    price: 0,
    annualPrice: 0,
    maxStates: 1,
    features: [
      'Single state access',
      'Basic draw odds',
      'Current year data only',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1499,
    annualPrice: 14999,
    maxStates: 5,
    features: [
      'Up to 5 states',
      'Full draw odds history',
      '6-year trend data',
      'Turkey subspecies data',
      'Season calendar alerts',
    ],
    recommended: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: 2999,
    annualPrice: 29999,
    maxStates: -1,
    features: [
      'All 50 states',
      'Full draw odds history',
      '6-year trend data',
      'Turkey subspecies data',
      'Season calendar alerts',
      'Unit comparison tool',
      'CSV / PDF export',
      'Priority support',
    ],
  },
];
