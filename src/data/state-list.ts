// Lightweight list of the 50 states for client-side forms.
// Mirrors the slug/name/abbrev fields of the state configs in hunt-data.ts,
// without pulling the whole generated dataset into the bundle.

export interface StateListItem {
  slug: string;
  name: string;
  abbrev: string;
}

export const STATE_LIST: readonly StateListItem[] = [
  { slug: "alabama", name: "Alabama", abbrev: "AL" },
  { slug: "alaska", name: "Alaska", abbrev: "AK" },
  { slug: "arizona", name: "Arizona", abbrev: "AZ" },
  { slug: "arkansas", name: "Arkansas", abbrev: "AR" },
  { slug: "california", name: "California", abbrev: "CA" },
  { slug: "colorado", name: "Colorado", abbrev: "CO" },
  { slug: "connecticut", name: "Connecticut", abbrev: "CT" },
  { slug: "delaware", name: "Delaware", abbrev: "DE" },
  { slug: "florida", name: "Florida", abbrev: "FL" },
  { slug: "georgia", name: "Georgia", abbrev: "GA" },
  { slug: "hawaii", name: "Hawaii", abbrev: "HI" },
  { slug: "idaho", name: "Idaho", abbrev: "ID" },
  { slug: "illinois", name: "Illinois", abbrev: "IL" },
  { slug: "indiana", name: "Indiana", abbrev: "IN" },
  { slug: "iowa", name: "Iowa", abbrev: "IA" },
  { slug: "kansas", name: "Kansas", abbrev: "KS" },
  { slug: "kentucky", name: "Kentucky", abbrev: "KY" },
  { slug: "louisiana", name: "Louisiana", abbrev: "LA" },
  { slug: "maine", name: "Maine", abbrev: "ME" },
  { slug: "maryland", name: "Maryland", abbrev: "MD" },
  { slug: "massachusetts", name: "Massachusetts", abbrev: "MA" },
  { slug: "michigan", name: "Michigan", abbrev: "MI" },
  { slug: "minnesota", name: "Minnesota", abbrev: "MN" },
  { slug: "mississippi", name: "Mississippi", abbrev: "MS" },
  { slug: "missouri", name: "Missouri", abbrev: "MO" },
  { slug: "montana", name: "Montana", abbrev: "MT" },
  { slug: "nebraska", name: "Nebraska", abbrev: "NE" },
  { slug: "nevada", name: "Nevada", abbrev: "NV" },
  { slug: "new-hampshire", name: "New Hampshire", abbrev: "NH" },
  { slug: "new-jersey", name: "New Jersey", abbrev: "NJ" },
  { slug: "new-mexico", name: "New Mexico", abbrev: "NM" },
  { slug: "new-york", name: "New York", abbrev: "NY" },
  { slug: "north-carolina", name: "North Carolina", abbrev: "NC" },
  { slug: "north-dakota", name: "North Dakota", abbrev: "ND" },
  { slug: "ohio", name: "Ohio", abbrev: "OH" },
  { slug: "oklahoma", name: "Oklahoma", abbrev: "OK" },
  { slug: "oregon", name: "Oregon", abbrev: "OR" },
  { slug: "pennsylvania", name: "Pennsylvania", abbrev: "PA" },
  { slug: "rhode-island", name: "Rhode Island", abbrev: "RI" },
  { slug: "south-carolina", name: "South Carolina", abbrev: "SC" },
  { slug: "south-dakota", name: "South Dakota", abbrev: "SD" },
  { slug: "tennessee", name: "Tennessee", abbrev: "TN" },
  { slug: "texas", name: "Texas", abbrev: "TX" },
  { slug: "utah", name: "Utah", abbrev: "UT" },
  { slug: "vermont", name: "Vermont", abbrev: "VT" },
  { slug: "virginia", name: "Virginia", abbrev: "VA" },
  { slug: "washington", name: "Washington", abbrev: "WA" },
  { slug: "west-virginia", name: "West Virginia", abbrev: "WV" },
  { slug: "wisconsin", name: "Wisconsin", abbrev: "WI" },
  { slug: "wyoming", name: "Wyoming", abbrev: "WY" },
];

/** The western big-game draw states, in the order members usually think about them. */
export const WESTERN_DRAW_ABBREVS = ["CO", "WY", "MT", "ID", "UT", "NV", "AZ", "NM", "OR", "WA"] as const;

const BY_ABBREV = new Map(STATE_LIST.map((s) => [s.abbrev, s]));
const BY_SLUG = new Map(STATE_LIST.map((s) => [s.slug, s]));

export const WESTERN_DRAW_STATES: readonly StateListItem[] = WESTERN_DRAW_ABBREVS.map((a) => BY_ABBREV.get(a)!);

export const OTHER_STATES: readonly StateListItem[] = STATE_LIST.filter(
  (s) => !(WESTERN_DRAW_ABBREVS as readonly string[]).includes(s.abbrev)
);

export function stateBySlug(slug: string): StateListItem | undefined {
  return BY_SLUG.get(slug);
}

export function stateByAbbrev(abbrev: string): StateListItem | undefined {
  return BY_ABBREV.get(abbrev.toUpperCase());
}
