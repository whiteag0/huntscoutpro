// Serializable homepage data, computed on the server from the published agency files.

export interface HomeSpeciesCard {
  name: string;
  image: string;
  href: string;
  /** Live states that publish data for this species. */
  states: number;
  /** Distinct hunt codes in each state's latest published draw. */
  huntCodes: number;
  /** Distinct harvest units in the agency harvest reports. */
  units: number;
}

export interface HomeLiveState {
  slug: string;
  name: string;
  abbrev: string;
  /** Agency short name, e.g. "CPW". */
  agency: string;
  speciesCount: number;
}

export interface HomeData {
  stateCount: number;
  speciesCount: number;
  totalHuntCodes: number;
  drawYears: [number, number] | null;
  harvestYears: [number, number] | null;
  liveStates: HomeLiveState[];
  /** Names of the western draw states being built that aren't published yet. */
  upcomingStates: string[];
  speciesCards: HomeSpeciesCard[];
}
