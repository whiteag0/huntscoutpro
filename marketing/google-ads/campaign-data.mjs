// Source of truth for the HuntScout Pro Google Ads Search campaign.
// Edit this file, then run `node marketing/google-ads/build.mjs` to regenerate
// campaign.csv and negatives.txt, then `node marketing/google-ads/validate.mjs`.
//
// Copy rules (enforced by validate.mjs):
// - Every claim must be true of the live site: official state agency draw
//   results and harvest data, cited sources, $14.99 one-time for 2 years,
//   no auto-renewal, 30-day money-back guarantee.
// - Never "predict", "guaranteed" odds, "best odds", or a state we don't cover.
// - Per-state copy only claims what that state's data has. Idaho and New Mexico
//   draws are random (no points), so their ads never mention points. Washington
//   does not split resident/nonresident or publish counts by point level, so its
//   ads claim neither. Kansas has no elk draw data, so its ads lead with deer.

export const SITE = "https://www.huntscoutpro.com";

export const CAMPAIGN = {
  name: "HuntScout Pro – Western Draw Research",
  type: "Search",
  status: "Paused",
  budget: "15.00",
  bidStrategy: "Maximize clicks",
  maxCpcLimit: "1.50",
  networks: "Google search",
  languages: "en",
  location: { name: "United States", id: "2840" },
  adSchedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    .map((d) => `(${d}[00:00-24:00])`)
    .join(";"),
  finalUrlSuffix: "utm_source=google&utm_medium=cpc&utm_campaign=western-draw-research&utm_content={adgroupid}&utm_term={keyword}",
};

// Headlines every ad group can use (each is true for every live state).
const SHARED = [
  "From Official Agency Reports",
  "Every Number Cited to Source",
  "$14.99 One-Time for 2 Years",
  "No Subscription. No Renewal.",
  "30-Day Money-Back Guarantee",
  "Hunt-by-Hunt Agency Tables",
  "Plan Your 2027 Applications",
];

const PRICE_DESC = "$14.99 one-time for 2 years of Pro. No auto-renewal. 30-day money-back guarantee.";
const PAST_DESC = "Past results as each agency published them, not forecasts. Confirm with the agency.";

/** p: keyword helpers */
const P = (text) => ({ text, match: "Phrase" });
const E = (text) => ({ text, match: "Exact" });

/**
 * A state ad group. `pin` = two headlines pinned to position 1 so every ad
 * names the state (Google rotates between them). Everything else floats.
 */
function stateGroup({ name, slug, pin, headlines, d1, d2, keywords }) {
  return {
    name,
    finalUrl: `${SITE}/states/${slug}`,
    path1: slug,
    path2: "draw-results",
    headlines: [
      ...pin.map((text) => ({ text, pin: 1 })),
      ...headlines.map((text) => ({ text })),
      { text: "One Price Covers All 14 States" },
      ...SHARED.map((text) => ({ text })),
    ],
    descriptions: [d1, d2, PRICE_DESC, PAST_DESC].map((text) => ({ text })),
    keywords,
    negatives: [],
    state: { name, slug },
  };
}

export const STATE_GROUPS = [
  stateGroup({
    name: "Colorado",
    slug: "colorado",
    pin: ["Colorado Draw Results", "Colorado Elk Draw Odds"],
    headlines: ["Minimum Preference Points", "Applicants by Point Level", "Harvest & Success by GMU", "Elk, Deer, Pronghorn & More", "Colorado Harvest Statistics"],
    d1: "Colorado draw results and harvest by GMU, taken from CPW reports and cited to each source.",
    d2: "See applicants and drawn by preference point level and the minimum points drawn each year.",
    keywords: [
      E("colorado elk draw odds"),
      P("colorado elk draw odds"),
      P("colorado draw odds"),
      P("colorado draw results"),
      P("colorado elk draw results"),
      P("colorado draw recap"),
      P("colorado preference points elk"),
      P("colorado elk preference points"),
      P("colorado nonresident elk draw odds"),
      P("cpw draw odds"),
      P("cpw draw results"),
      P("colorado mule deer draw odds"),
      P("colorado deer draw odds"),
      P("colorado antelope draw odds"),
      P("colorado pronghorn draw odds"),
      P("colorado moose draw odds"),
      P("colorado elk harvest statistics"),
      P("colorado elk success rates by unit"),
    ],
  }),
  stateGroup({
    name: "Wyoming",
    slug: "wyoming",
    pin: ["Wyoming Draw Results", "Wyoming Elk Draw Odds"],
    headlines: ["Nonresident Preference Points", "Applicants by Point Level", "Harvest & Success by Hunt Area", "Elk, Deer, Antelope & Moose", "Wyoming Harvest Statistics"],
    d1: "Wyoming draw results and harvest by hunt area, from WGFD reports, every table cited.",
    d2: "Resident and nonresident draw counts, with applicants by preference point where published.",
    keywords: [
      E("wyoming elk draw odds"),
      P("wyoming elk draw odds"),
      P("wyoming draw odds"),
      P("wyoming draw results"),
      P("wyoming nonresident elk points"),
      P("wyoming preference points elk"),
      P("wyoming elk preference points"),
      P("wyoming nonresident elk draw odds"),
      P("wyoming antelope draw odds"),
      P("wyoming pronghorn draw odds"),
      P("wyoming deer draw odds"),
      P("wyoming mule deer draw odds"),
      P("wyoming moose draw odds"),
      P("wgfd draw odds"),
      P("wgfd draw results"),
      P("wyoming elk harvest statistics"),
      P("wyoming hunt area success rates"),
    ],
  }),
  stateGroup({
    name: "Montana",
    slug: "montana",
    pin: ["Montana Draw Results", "Montana Elk Draw Odds"],
    headlines: ["Montana Drawing Statistics", "Applicants by Bonus Points", "Nonresident Combo Results", "Harvest by Hunting District", "Elk, Deer, Antelope, Moose"],
    d1: "Montana drawing statistics and harvest by hunting district from FWP, every table cited.",
    d2: "Permit and license draws with applicants by bonus point, plus nonresident combo results.",
    keywords: [
      E("montana elk draw odds"),
      P("montana elk draw odds"),
      P("montana draw odds"),
      P("montana drawing statistics"),
      P("montana draw results"),
      P("montana bonus points elk"),
      P("montana elk permit draw odds"),
      P("montana nonresident combo draw odds"),
      P("montana deer permit draw odds"),
      P("montana antelope draw odds"),
      P("montana moose draw odds"),
      P("montana sheep draw odds"),
      P("fwp drawing statistics"),
      P("montana elk harvest statistics"),
      P("montana hunting district harvest"),
    ],
  }),
  stateGroup({
    name: "Idaho",
    slug: "idaho",
    pin: ["Idaho Draw Results", "Idaho Controlled Hunt Odds"],
    headlines: ["Controlled Hunt Results", "Quota, Applicants & Drawn", "Resident & Nonresident Odds", "Idaho Elk Harvest by Unit", "Elk, Deer, Moose, Sheep, Goat"],
    d1: "Idaho controlled hunt results and harvest by unit from IDFG, with every table cited.",
    d2: "Quota, applicants and drawn for each controlled hunt, resident and nonresident.",
    keywords: [
      E("idaho controlled hunt odds"),
      P("idaho controlled hunt odds"),
      P("idaho controlled hunt draw odds"),
      P("idaho controlled hunt results"),
      P("idaho controlled hunt statistics"),
      P("idaho draw odds"),
      P("idaho draw results"),
      P("idaho elk draw odds"),
      P("idaho elk controlled hunt odds"),
      P("idaho deer controlled hunt odds"),
      P("idaho moose draw odds"),
      P("idaho sheep draw odds"),
      P("idaho pronghorn controlled hunt odds"),
      P("idaho elk harvest statistics"),
      P("idfg harvest statistics"),
      P("idaho deer harvest statistics"),
    ],
  }),
  stateGroup({
    name: "Utah",
    slug: "utah",
    pin: ["Utah Draw Results", "Utah Elk Draw Odds"],
    headlines: ["Utah Bonus Points for Elk", "Limited-Entry Draw Results", "Applicants by Point Level", "Harvest & Success by Unit", "Deer, Elk, Moose, Sheep, Goat"],
    d1: "Utah draw results and harvest by hunt unit from Utah DWR, with every table cited.",
    d2: "Limited-entry and general-season draws with applicants by bonus or preference point.",
    keywords: [
      E("utah bonus points elk"),
      P("utah bonus points elk"),
      P("utah draw odds"),
      P("utah elk draw odds"),
      P("utah draw results"),
      P("utah limited entry elk odds"),
      P("utah limited entry draw odds"),
      P("utah big game draw odds"),
      P("utah deer draw odds"),
      P("utah general season deer draw odds"),
      P("utah preference points deer"),
      P("utah once in a lifetime draw odds"),
      P("utah moose draw odds"),
      P("utah pronghorn draw odds"),
      P("utah dwr draw odds"),
      P("utah elk harvest data"),
    ],
  }),
  stateGroup({
    name: "Arizona",
    slug: "arizona",
    pin: ["Arizona Draw Results", "Arizona Elk Draw Odds"],
    headlines: ["Applicants by Bonus Points", "Resident & Nonresident Odds", "Harvest & Success by Unit", "Elk, Mule Deer, Coues, Sheep", "Arizona Harvest Data"],
    d1: "Arizona draw results and harvest by unit from AZGFD reports, with every table cited.",
    d2: "Applicants and drawn by bonus point for elk, deer, pronghorn, sheep and turkey hunts.",
    keywords: [
      E("arizona elk draw odds"),
      P("arizona elk draw odds"),
      P("arizona draw odds"),
      P("arizona draw results"),
      P("arizona bonus points elk"),
      P("arizona elk bonus points"),
      P("arizona deer draw odds"),
      P("arizona coues deer draw odds"),
      P("arizona antelope draw odds"),
      P("arizona pronghorn draw odds"),
      P("arizona sheep draw odds"),
      P("arizona turkey draw odds"),
      P("arizona hunt draw statistics"),
      P("azgfd draw odds"),
      P("arizona elk harvest data"),
    ],
  }),
  stateGroup({
    name: "Nevada",
    slug: "nevada",
    pin: ["Nevada Draw Results", "Nevada Elk Draw Odds"],
    headlines: ["Applicants by Bonus Points", "Nevada Mule Deer Draw Odds", "Harvest by Unit Group", "Deer, Elk, Antelope, Sheep", "Nevada Harvest Data"],
    d1: "Nevada draw results and harvest by unit group from NDOW, with every table cited.",
    d2: "Applicants and drawn by bonus point for deer, elk, antelope, sheep and more.",
    keywords: [
      E("nevada elk draw odds"),
      P("nevada elk draw odds"),
      P("nevada draw odds"),
      P("nevada draw results"),
      P("nevada tag draw results"),
      P("nevada bonus points"),
      P("nevada bonus points elk"),
      P("nevada deer draw odds"),
      P("nevada mule deer draw odds"),
      P("nevada antelope draw odds"),
      P("nevada bighorn sheep draw odds"),
      P("nevada mountain goat draw odds"),
      P("ndow draw odds"),
      P("ndow draw results"),
      P("nevada deer harvest data"),
      P("nevada elk harvest data"),
    ],
  }),
  stateGroup({
    name: "New Mexico",
    slug: "new-mexico",
    pin: ["New Mexico Draw Results", "New Mexico Elk Draw Odds"],
    headlines: ["Quota, Applicants & Drawn", "Resident & Nonresident Odds", "Harvest & Success by GMU", "Elk, Deer, Antelope, Sheep", "New Mexico Harvest Data"],
    d1: "New Mexico draw results and harvest by GMU from agency reports, every table cited.",
    d2: "Quota, applicants and drawn for each hunt code, resident and nonresident.",
    keywords: [
      E("new mexico elk draw odds"),
      P("new mexico elk draw odds"),
      P("new mexico draw odds"),
      P("new mexico draw results"),
      P("new mexico elk draw results"),
      P("new mexico big game draw odds"),
      P("new mexico deer draw odds"),
      P("new mexico antelope draw odds"),
      P("new mexico pronghorn draw odds"),
      P("new mexico bighorn sheep draw odds"),
      P("nm elk draw odds"),
      P("nm draw odds"),
      P("nm draw results"),
      P("new mexico elk harvest data"),
      P("new mexico elk harvest report"),
    ],
  }),
  stateGroup({
    name: "Oregon",
    slug: "oregon",
    pin: ["Oregon Draw Results", "Oregon Controlled Hunt Odds"],
    headlines: ["Oregon Preference Points", "Applicants by Point Level", "Harvest & Success by WMU", "Elk, Deer, Antelope & Bear", "Oregon Harvest Statistics"],
    d1: "Oregon controlled hunt results and harvest by WMU from ODFW, with every table cited.",
    d2: "Applicants and drawn by preference point level for elk, deer, antelope and bear.",
    keywords: [
      E("oregon controlled hunt odds"),
      P("oregon controlled hunt odds"),
      P("oregon controlled hunt draw odds"),
      P("oregon controlled hunt results"),
      P("oregon draw odds"),
      P("oregon draw results"),
      P("oregon elk draw odds"),
      P("oregon deer draw odds"),
      P("oregon antelope draw odds"),
      P("oregon preference points"),
      P("oregon elk preference points"),
      P("odfw draw results"),
      P("odfw draw odds"),
      P("oregon elk harvest statistics"),
      P("oregon deer harvest statistics"),
    ],
  }),
  stateGroup({
    name: "Washington",
    slug: "washington",
    pin: ["Washington Draw Results", "Washington Special Permits"],
    headlines: ["Special Permit Draw Results", "Quota, Applicants & Drawn", "Harvest & Success by GMU", "Elk, Deer, Moose, Sheep, Goat", "Washington Harvest Data"],
    d1: "Washington special permit results and harvest by GMU from WDFW, every table cited.",
    d2: "Quota, applicants and drawn for each special permit hunt, with several years of history.",
    keywords: [
      E("washington special permit odds"),
      P("washington special permit odds"),
      P("washington special permit draw odds"),
      P("washington special permit results"),
      P("washington special hunt draw results"),
      P("washington draw odds"),
      P("washington elk draw odds"),
      P("washington deer draw odds"),
      P("washington moose draw odds"),
      P("washington sheep draw odds"),
      P("washington goat draw odds"),
      P("wdfw special permit odds"),
      P("wdfw draw results"),
      P("washington elk harvest statistics"),
      P("washington deer harvest statistics"),
    ],
  }),
  stateGroup({
    name: "Kansas",
    slug: "kansas",
    pin: ["Kansas Deer Draw Results", "Kansas Nonresident Deer Draw"],
    headlines: ["Minimum Preference Points", "Applicants & Drawn by Unit", "Deer, Antelope & Turkey Draws", "Kansas Deer Harvest Data", "Kansas Draw Results"],
    d1: "Kansas deer, antelope and turkey draw results from KDWP, with every table cited.",
    d2: "Nonresident deer draws by unit with the minimum preference points that drew.",
    keywords: [
      E("kansas nonresident deer draw odds"),
      P("kansas nonresident deer draw odds"),
      P("kansas nonresident deer draw"),
      P("kansas nonresident deer preference points"),
      P("kansas deer preference points"),
      P("kansas deer draw odds"),
      P("kansas deer draw results"),
      P("kansas whitetail draw odds"),
      P("kansas mule deer draw odds"),
      P("kansas draw odds"),
      P("kansas antelope draw"),
      P("kansas turkey draw odds"),
      P("kdwp draw results"),
      P("kansas deer harvest statistics"),
      P("kansas deer harvest data"),
    ],
  }),
  stateGroup({
    name: "South Dakota",
    slug: "south-dakota",
    pin: ["South Dakota Draw Results", "South Dakota Deer Draw Odds"],
    headlines: ["Applicants by Point Level", "Preference Point Draw Data", "Harvest & Success by Unit", "Deer, Elk, Antelope, Turkey", "South Dakota Harvest Data"],
    d1: "South Dakota draw results and harvest by unit from GFP reports, every table cited.",
    d2: "Applicants and drawn by preference point for deer, elk, antelope and turkey.",
    keywords: [
      E("south dakota deer draw odds"),
      P("south dakota deer draw odds"),
      P("south dakota draw odds"),
      P("south dakota draw results"),
      P("south dakota draw statistics"),
      P("south dakota elk draw odds"),
      P("south dakota antelope draw odds"),
      P("south dakota pronghorn draw odds"),
      P("south dakota preference points"),
      P("south dakota west river deer draw odds"),
      P("south dakota black hills deer draw odds"),
      P("south dakota turkey draw odds"),
      P("sd deer draw odds"),
      P("sd draw odds"),
      P("south dakota deer harvest statistics"),
    ],
  }),
];

// State names used as ad-group negatives in the two cross-state groups, so a
// "<state> ..." search is answered by that state's own ad and landing page.
const STATE_NAME_NEGATIVES = STATE_GROUPS.map((g) => ({ text: g.name.toLowerCase(), match: "Negative Phrase" }));

export const OTHER_GROUPS = [
  {
    // Generic "draw odds / points" searches have no state, so the best answer
    // is the cross-state shortlist ("Where can I draw?"). Logged-out visitors
    // see the explainer, a blurred example (elk, from Texas, 3 points) and the
    // Pro call to action; that matches the query better than the homepage.
    // Ad copy never promises a free preview: the logged-out table and
    // shortlist "previews" are blurred behind the paywall and can't be read.
    name: "Draw odds & points (generic)",
    finalUrl: `${SITE}/shortlist`,
    path1: "draw-odds",
    path2: "shortlist",
    headlines: [
      "Where Can I Draw Elk?",
      "Hunts That Drew at Your Points",
      "Western Draw Results",
      "Draw Odds From Agency Data",
      "14 Western States, One Site",
      "Preference & Bonus Points",
      "Elk, Deer, Antelope & More",
      "Minimum Points Drawn by Year",
      ...SHARED,
    ].map((text) => ({ text })),
    descriptions: [
      "Pick species, home state and points. See which hunts drew at that level last year.",
      "Draw results and harvest from 14 western state agencies, each table cited to its source.",
      PRICE_DESC,
      PAST_DESC,
    ].map((text) => ({ text })),
    keywords: [
      E("elk draw odds"),
      P("elk draw odds"),
      P("elk draw odds by state"),
      P("elk draw odds by points"),
      P("western elk draw odds"),
      P("western big game draw odds"),
      P("nonresident elk draw odds"),
      P("where can i draw elk"),
      P("easiest elk tags to draw"),
      P("elk preference points"),
      P("elk bonus points"),
      P("preference points vs bonus points"),
      P("mule deer draw odds"),
      P("antelope draw odds"),
      P("elk point creep"),
      P("big game draw results"),
      P("elk draw statistics"),
    ],
    negatives: STATE_NAME_NEGATIVES,
  },
  {
    // Deadline searches land on the free calendar: every agency date we hold,
    // 2027 where published, otherwise the 2026 date marked as such. Most states
    // (CO, WY, MT, NM, OR, KS, SD) have no 2027 dates yet, so no headline may
    // promise a "2027 calendar"; the description says dates arrive as published.
    name: "Application deadlines 2027",
    finalUrl: `${SITE}/calendar`,
    path1: "calendar",
    path2: "2027",
    headlines: [
      "Application Calendar by State",
      "Western Draw Deadlines",
      "Agency Application Dates",
      "Draw & Results Dates by State",
      "Dates Added as States Publish",
      "Free Application Calendar",
      "Elk, Deer & Antelope Dates",
      "14 Western States, One Site",
      ...SHARED,
    ].map((text) => ({ text })),
    descriptions: [
      "Application windows, draw results dates and seasons for 14 western states in one place.",
      "2027 dates appear as each agency publishes them. Free to view, linked to each source.",
      PRICE_DESC,
      PAST_DESC,
    ].map((text) => ({ text })),
    keywords: [
      E("hunting application deadlines"),
      P("hunting application deadlines"),
      P("2027 hunting application deadlines"),
      P("western hunting application deadlines"),
      P("elk application deadlines"),
      P("2027 elk application deadlines"),
      P("big game application deadlines"),
      P("hunting draw deadlines"),
      P("draw application dates"),
      P("hunting application calendar"),
      P("2027 big game draw dates"),
      P("colorado elk application deadline"),
      P("wyoming elk application deadline"),
      P("montana elk application deadline"),
      P("utah big game draw deadline"),
      P("arizona elk draw deadline"),
      P("idaho controlled hunt deadline"),
      P("new mexico draw deadline"),
    ],
    negatives: [],
  },
];

export const AD_GROUPS = [...STATE_GROUPS, ...OTHER_GROUPS];

// Campaign-level negatives. Phrase unless noted. Grouped by why.
export const CAMPAIGN_NEGATIVES = [
  // Competitor brands and their apps: their own customers searching for them.
  // "HuntScout" (huntscout.app) is a different product; block its brand
  // searches so we don't pay for people looking for it. Our own brand is
  // "HuntScout Pro" and isn't a keyword here, so no conflict.
  ...["huntscout app", "huntscout.app", "hunt scout app", "huntscout login", "huntscout download"].map((t) => ({ text: t, match: "Phrase" })),
  { text: "huntscout", match: "Exact" },
  { text: "hunt scout", match: "Exact" },
  ...["onx", "onxmaps", "onx hunt", "gohunt", "go hunt insider", "go hunt maps", "huntwise", "basemap", "spartan forge", "huntstand", "toprut", "eastmans", "huntin fool", "hunt reminder", "worldwide trophy adventures"].map((t) => ({ text: t, match: "Phrase" })),
  // Wrong product: maps, GPS, apps to download, gear, guns. ("rifle" alone is
  // NOT negative: "second rifle elk draw odds" is a real draw search. Same for
  // "outfitter"/"guided": New Mexico runs an outfitter-guided draw pool.)
  ...["map", "maps", "gps", "satellite", "trail camera", "free download", "download", "apk", "app store", "rifle sale", "rifles for sale", "ammo", "ammunition", "gun", "guns", "scope", "for sale", "boots", "clothing", "decoy"].map((t) => ({ text: t, match: "Phrase" })),
  // Jobs and courses.
  ...["jobs", "job", "careers", "hiring", "salary", "game warden", "hunter education", "hunter safety", "hunter ed"].map((t) => ({ text: t, match: "Phrase" })),
  // Other things called a "draw", "points" or "lottery".
  ...["lottery", "lotto", "powerball", "mega millions", "pick 3", "scratch", "raffle", "nfl draft", "fantasy", "credit card", "rewards points", "airline", "hotel", "pokemon", "gacha", "elks lodge", "chiefs", "buffaloes", "broncos", "cowboys", "university"].map((t) => ({ text: t, match: "Phrase" })),
  // Off-topic outdoor searches and services we don't sell.
  ...["fishing", "fishing license", "trout", "camping", "state park", "park pass", "taxidermy", "meat processing", "recipe", "recipes", "jerky", "ranch for sale", "land for sale"].map((t) => ({ text: t, match: "Phrase" })),
];

export const SITELINKS = [
  { text: "Where Can I Draw?", d1: "Hunts that drew at your points", d2: "From last year's agency results", url: `${SITE}/shortlist` },
  { text: "Application Calendar", d1: "Agency application & draw dates", d2: "Free to view, sources linked", url: `${SITE}/calendar` },
  { text: "Pricing", d1: "$14.99 one-time for 2 years", d2: "No auto-renew. 30-day refund.", url: `${SITE}/pricing` },
  { text: "All 14 States", d1: "CO, WY, MT, ID, UT, AZ, NV, NM", d2: "Plus OR, WA, CA, AK, KS and SD", url: `${SITE}/states` },
  { text: "Point Creep Trends", d1: "Minimum points drawn over time", d2: "From each state's draw results", url: `${SITE}/trends` },
  { text: "Compare Hunts", d1: "Up to four hunts side by side", d2: "Draw results and harvest together", url: `${SITE}/compare` },
];

export const CALLOUTS = [
  "Official Agency Sources",
  "Source Link on Each Table",
  "$14.99 One-Time",
  "2 Years of Pro Access",
  "No Auto-Renewal",
  "30-Day Money-Back",
  "14 Western States",
  "Free Application Calendar",
];

// Google only allows its fixed snippet headers ("States" is not one).
// "Destinations" fits places; max 10 values, so the last two share a value.
export const SNIPPETS = [
  {
    header: "Destinations",
    values: ["Colorado", "Wyoming", "Montana", "Idaho", "Utah", "Arizona", "Nevada", "New Mexico", "Oregon & Washington", "California & Alaska"],
  },
  {
    header: "Types",
    values: ["Elk", "Mule Deer", "Whitetail", "Pronghorn", "Moose", "Bighorn Sheep", "Mountain Goat", "Black Bear", "Turkey"],
  },
];
