#!/usr/bin/env node
// Checks campaign.csv before it goes into Google Ads Editor.
//
//   node marketing/google-ads/validate.mjs            # all checks, incl. live site GETs
//   node marketing/google-ads/validate.mjs --offline  # skip network checks
//   node marketing/google-ads/validate.mjs --file other.csv
//   node marketing/google-ads/validate.mjs --site http://localhost:3300  # fetch landing pages from a local build
//
// It reads the CSV itself (not campaign-data.mjs), so it checks exactly what
// will be imported. Exit code 1 on any error. Network checks are read-only
// GETs against https://www.huntscoutpro.com.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OFFLINE = process.argv.includes("--offline");
const SITE = "https://www.huntscoutpro.com";

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- CSV parsing (RFC 4180, BOM-aware) ----------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c !== ""));
}

const fileArg = process.argv.indexOf("--file");
const raw = readFileSync(fileArg > 0 ? process.argv[fileArg + 1] : join(here, "campaign.csv"), "utf8");
if (raw.charCodeAt(0) !== 0xfeff) warn("campaign.csv has no UTF-8 BOM; Editor may misread the en dash in the campaign name");
const table = parseCsv(raw);
const header = table[0];
const rows = table.slice(1).map((r, i) => {
  if (r.length !== header.length) err(`CSV line ${i + 2}: ${r.length} cells, header has ${header.length}`);
  return Object.fromEntries(header.map((h, j) => [h, (r[j] ?? "").trim()]));
});
const line = (r) => rows.indexOf(r) + 2;

// ---------- Required columns ----------
const REQUIRED = [
  "Campaign", "Campaign Type", "Campaign Status", "Budget", "Bid Strategy Type", "Maximum CPC bid limit", "Networks", "Languages",
  "Ad Schedule", "Location", "Location ID", "Ad Group", "Ad Group Status", "Keyword", "Criterion Type", "Status",
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1} position`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  "Path 1", "Path 2", "Final URL", "Link Text", "Description Line 1", "Description Line 2", "Callout text", "Header", "Snippet Values",
];
for (const c of REQUIRED) if (!header.includes(c)) err(`missing column "${c}"`);
const dupCols = header.filter((h, i) => header.findIndex((x) => x.toLowerCase() === h.toLowerCase()) !== i);
if (dupCols.length) err(`duplicate columns: ${dupCols.join(", ")}`);

// ---------- Classify rows ----------
const kind = (r) => {
  if (r["Campaign Type"]) return "campaign";
  if (r.Location) return "location";
  if (r.Keyword) return r["Criterion Type"].toLowerCase().includes("negative") ? (r["Ad Group"] ? "adgroup-negative" : "campaign-negative") : "keyword";
  if (r["Headline 1"]) return "ad";
  if (r["Link Text"]) return "sitelink";
  if (r["Callout text"]) return "callout";
  if (r.Header) return "snippet";
  if (r["Ad Group"]) return "adgroup";
  return "unknown";
};
const by = {};
for (const r of rows) (by[kind(r)] ||= []).push(r);
for (const r of by.unknown || []) err(`line ${line(r)}: row type not recognised`);

const CAMPAIGN_NAME = "HuntScout Pro – Western Draw Research";
for (const r of rows) if (r.Campaign !== CAMPAIGN_NAME) err(`line ${line(r)}: Campaign is "${r.Campaign}", expected "${CAMPAIGN_NAME}"`);

// ---------- Campaign settings ----------
const camps = by.campaign || [];
if (camps.length !== 1) err(`expected 1 campaign row, found ${camps.length}`);
const camp = camps[0] || {};
const expect = (col, val) => {
  if ((camp[col] || "") !== val) err(`campaign ${col} is "${camp[col] || ""}", expected "${val}"`);
};
expect("Campaign Type", "Search");
expect("Campaign Status", "Paused");
expect("Budget", "15.00");
expect("Bid Strategy Type", "Maximize clicks");
expect("Maximum CPC bid limit", "1.50");
expect("Networks", "Google search");
expect("Languages", "en");
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const sched = (camp["Ad Schedule"] || "").split(";");
const schedOk = sched.length === 7 && DAYS.every((d, i) => sched[i] === `(${d}[00:00-24:00])`);
if (!schedOk) err(`Ad Schedule must cover all 7 days 00:00-24:00, got "${camp["Ad Schedule"]}"`);
const suffix = camp["Final URL suffix"] || "";
if (suffix && (/^[?&]/.test(suffix) || /\s/.test(suffix))) err(`Final URL suffix must not start with ? or & or contain spaces`);
const locs = by.location || [];
if (locs.length !== 1 || locs[0].Location !== "United States" || locs[0]["Location ID"] !== "2840") err("location targeting must be exactly United States (2840)");

// ---------- Text rules ----------
const LIVE = ["Colorado", "Wyoming", "Montana", "Idaho", "Utah", "Arizona", "Nevada", "New Mexico", "Oregon", "Washington", "Kansas", "South Dakota"];
const ALL_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
const NOT_COVERED = ALL_STATES.filter((s) => !LIVE.includes(s));
// Acronyms allowed in caps: agencies, state abbreviations, GMU/WMU.
const CAPS_OK = new Set(["CPW", "WGFD", "FWP", "IDFG", "DWR", "AZGFD", "NDOW", "ODFW", "WDFW", "KDWP", "GFP", "GMU", "WMU", "CO", "WY", "MT", "ID", "UT", "AZ", "NV", "NM", "OR", "WA", "KS", "SD", "US", "OTC"]);

const BANNED = [
  [/\bpredict\w*/i, "predict/prediction"],
  [/\bforecast(ed|ing)?\b(?!s)/i, "forecast (as a claim)"],
  [/\bguaranteed\b/i, "guaranteed"],
  [/(?<!money-back )\bguarantee\b/i, 'guarantee (only "money-back guarantee" is allowed)'],
  [/\bbest\b/i, "best"],
  [/\b(top|highest|better|improve|boost|increase)\s+(your\s+)?(draw\s+)?odds\b/i, "odds-improvement claim"],
  [/\bsure\s+thing\b|\bwin\b|\bwinning\b/i, "win/sure thing"],
  [/#1|\bnumber one\b|\bno\.\s?1\b/i, "#1 claim"],
  [/\bunlimited\b/i, "unlimited"],
  [/\b(ai|a\.i\.|algorithm|model(ed|led)?)\b/i, "AI/modeled (we only show published numbers)"],
  [/\b(subscribe|subscription plan|per month|\/mo|monthly)\b/i, "subscription wording"],
  [/\b(easiest|easy tags?)\b/i, "easiest (ad copy can't promise easy tags)"],
  [/\b(limited time|act now|hurry|last chance|sale)\b/i, "urgency/sale wording"],
  [/\bofficial\s+(?!agency\b)/i, '"official" must read "official agency …" (we are not the agency)'],
];

function checkText(text, where, { max, kindName }) {
  if (!text) return;
  if ([...text].length > max) err(`${where}: ${kindName} "${text}" is ${[...text].length} chars (max ${max})`);
  if (/[^\x20-\x7E–]/.test(text)) err(`${where}: "${text}" has non-ASCII characters (Google counts some as 2)`);
  if (/^\s|\s$|\s{2,}/.test(text)) err(`${where}: "${text}" has leading/trailing/double spaces`);
  if (kindName.startsWith("headline") && text.includes("!")) err(`${where}: headlines may not contain "!"`);
  if ((text.match(/!/g) || []).length > 1) err(`${where}: more than one "!"`);
  if (/([!?.,])\1/.test(text)) err(`${where}: repeated punctuation in "${text}"`);
  if (/[*@^~|<>{}\[\]\\]/.test(text)) err(`${where}: symbol not allowed in ad text: "${text}"`);
  for (const w of text.match(/\b[A-Z]{2,}\b/g) || []) if (!CAPS_OK.has(w)) err(`${where}: all-caps word "${w}" (Google editorial)`);
  for (const [re, label] of BANNED) if (re.test(text)) err(`${where}: banned wording (${label}) in "${text}"`);
  for (const s of NOT_COVERED) if (new RegExp(`\\b${s}\\b`, "i").test(text.replace(/new mexico/gi, ""))) err(`${where}: mentions ${s}, which we don't cover`);
  const n = text.match(/\b(\d+)\s+(western\s+)?(draw\s+)?(state|states)\b/i);
  if (n && Number(n[1]) !== LIVE.length) err(`${where}: claims ${n[1]} states, live count is ${LIVE.length}`);
  for (const p of text.match(/\$\d+(\.\d+)?/g) || []) if (p !== "$14.99") err(`${where}: price ${p} (only $14.99 exists)`);
  const yrs = text.match(/\b(\d+)[- ]years?\b/i);
  if (yrs && yrs[1] !== "2") err(`${where}: access length "${yrs[0]}" (it is 2 years)`);
  const days = text.match(/\b(\d+)-day\b/i);
  if (days && days[1] !== "30") err(`${where}: "${days[0]}" (refund window is 30 days)`);
}

// ---------- Ad groups, keywords, ads ----------
const EXPECTED_GROUPS = [...LIVE, "Draw odds & points (generic)", "Application deadlines 2027"];
const groups = (by.adgroup || []).map((r) => r["Ad Group"]);
for (const g of EXPECTED_GROUPS) if (!groups.includes(g)) err(`missing ad group "${g}"`);
for (const g of groups) if (!EXPECTED_GROUPS.includes(g)) err(`unexpected ad group "${g}"`);
if (new Set(groups).size !== groups.length) err("duplicate ad group rows");
for (const r of by.adgroup || []) if (r["Ad Group Status"] !== "Enabled") err(`ad group ${r["Ad Group"]}: status should be Enabled (campaign is Paused)`);

const words = (s) => s.toLowerCase().split(/\s+/).filter(Boolean);
function negBlocks(neg, matchType, kw) {
  const k = words(kw);
  const n = words(neg);
  if (/exact/i.test(matchType)) return k.join(" ") === n.join(" ");
  if (/phrase/i.test(matchType)) {
    for (let i = 0; i + n.length <= k.length; i++) if (n.every((w, j) => k[i + j] === w)) return true;
    return false;
  }
  return n.every((w) => k.includes(w)); // broad
}

const campNegs = by["campaign-negative"] || [];
for (const r of campNegs) {
  if (!/^Campaign Negative (Phrase|Exact|Broad)$/.test(r["Criterion Type"])) err(`line ${line(r)}: campaign negative type "${r["Criterion Type"]}"`);
  for (const q of ["huntscout pro", "huntscout pro draw odds", "hunt scout pro", "huntscoutpro"])
    if (negBlocks(r.Keyword, r["Criterion Type"], q)) err(`line ${line(r)}: negative "${r.Keyword}" would block our own brand search "${q}"`);
}
for (const n of ["huntscout app", "onx", "gohunt", "maps", "gps", "jobs", "free download", "rifle sale"])
  if (!campNegs.some((r) => r.Keyword.toLowerCase() === n)) err(`campaign negatives missing "${n}"`);
if (!campNegs.some((r) => r.Keyword.toLowerCase() === "huntscout" && /Exact/.test(r["Criterion Type"]))) err('campaign negatives missing [huntscout] exact (competitor brand)');
const negKeys = campNegs.map((r) => `${r.Keyword.toLowerCase()}|${r["Criterion Type"]}`);
if (new Set(negKeys).size !== negKeys.length) err("duplicate campaign negatives");

const ads = by.ad || [];
const stateUrl = (g) => `${SITE}/states/${g.toLowerCase().replace(/ /g, "-")}`;
const urls = new Map(); // url -> where
for (const g of EXPECTED_GROUPS) {
  const kws = (by.keyword || []).filter((r) => r["Ad Group"] === g);
  if (kws.length < 10 || kws.length > 20) err(`${g}: ${kws.length} keywords (need 10–20)`);
  const seen = new Set();
  for (const k of kws) {
    const where = `${g} keyword "${k.Keyword}"`;
    if (!["Phrase", "Exact"].includes(k["Criterion Type"])) err(`${where}: match type "${k["Criterion Type"]}" (phrase/exact only)`);
    if (k.Keyword !== k.Keyword.toLowerCase()) warn(`${where}: not lower case`);
    if (k.Keyword.length > 80 || words(k.Keyword).length > 10) err(`${where}: too long`);
    if (/[^a-z0-9 &'.\-]/i.test(k.Keyword)) err(`${where}: invalid character`);
    const key = `${k.Keyword}|${k["Criterion Type"]}`;
    if (seen.has(key)) err(`${where}: duplicate`);
    seen.add(key);
    for (const n of campNegs) if (negBlocks(n.Keyword, n["Criterion Type"], k.Keyword)) err(`${where}: blocked by campaign negative "${n.Keyword}" (${n["Criterion Type"]})`);
    for (const n of (by["adgroup-negative"] || []).filter((r) => r["Ad Group"] === g))
      if (negBlocks(n.Keyword, n["Criterion Type"], k.Keyword)) err(`${where}: blocked by ad group negative "${n.Keyword}"`);
    if (LIVE.includes(g) && !k.Keyword.includes(g.toLowerCase())) {
      const abbrev = { Colorado: ["cpw"], Wyoming: ["wgfd"], Montana: ["fwp"], Idaho: ["idfg"], Utah: ["dwr"], Arizona: ["azgfd"], Nevada: ["ndow"], "New Mexico": ["nm"], Oregon: ["odfw"], Washington: ["wdfw"], Kansas: ["kdwp"], "South Dakota": ["sd", "gfp"] }[g];
      if (!abbrev.some((a) => words(k.Keyword).includes(a))) err(`${where}: doesn't name the state or its agency`);
    }
    if (LIVE.includes(g)) for (const other of LIVE.filter((s) => s !== g)) if (k.Keyword.includes(other.toLowerCase())) err(`${where}: names another state (${other})`);
  }

  const gAds = ads.filter((r) => r["Ad Group"] === g);
  if (gAds.length !== 1) {
    err(`${g}: ${gAds.length} responsive search ads (need 1)`);
    continue;
  }
  const ad = gAds[0];
  const where = `${g} RSA`;
  const hs = Array.from({ length: 15 }, (_, i) => ad[`Headline ${i + 1}`]);
  const ds = Array.from({ length: 4 }, (_, i) => ad[`Description ${i + 1}`]);
  if (hs.filter(Boolean).length !== 15) err(`${where}: ${hs.filter(Boolean).length} headlines (need 15)`);
  if (ds.filter(Boolean).length !== 4) err(`${where}: ${ds.filter(Boolean).length} descriptions (need 4)`);
  hs.forEach((h, i) => checkText(h, `${where} H${i + 1}`, { max: 30, kindName: "headline" }));
  ds.forEach((d, i) => checkText(d, `${where} D${i + 1}`, { max: 90, kindName: "description" }));
  const lower = hs.filter(Boolean).map((h) => h.toLowerCase());
  if (new Set(lower).size !== lower.length) err(`${where}: duplicate headlines`);
  if (new Set(ds.map((d) => d.toLowerCase())).size !== 4) err(`${where}: duplicate descriptions`);
  // Pins: only position 1 is used, and only so state ads always name the state.
  const pins = hs.map((_, i) => ad[`Headline ${i + 1} position`]).filter(Boolean);
  for (const p of pins) if (!["1", "2", "3"].includes(p)) err(`${where}: headline position "${p}"`);
  for (let i = 1; i <= 4; i++) if (ad[`Description ${i} position`] && !["1", "2"].includes(ad[`Description ${i} position`])) err(`${where}: description position`);
  if (LIVE.includes(g)) {
    if (pins.length !== 2 || pins.some((p) => p !== "1")) err(`${where}: expected exactly 2 headlines pinned to position 1`);
    hs.forEach((h, i) => {
      if (ad[`Headline ${i + 1} position`] === "1" && !h.startsWith(g)) err(`${where}: pinned headline "${h}" doesn't start with ${g}`);
    });
    if (ad["Final URL"] !== stateUrl(g)) err(`${where}: Final URL ${ad["Final URL"]}, expected ${stateUrl(g)}`);
    for (const other of LIVE.filter((s) => s !== g)) for (const t of [...hs, ...ds]) if (new RegExp(`\\b${other}\\b`).test(t)) err(`${where}: mentions ${other} in "${t}"`);
  } else if (pins.length) err(`${where}: cross-state ads shouldn't pin`);
  // Per-state honesty: states without points or without a residency split.
  const all = [...hs, ...ds].join(" | ");
  if (["Idaho", "New Mexico"].includes(g) && /\bpoints?\b/i.test(all)) err(`${where}: ${g} draws are random; ads must not mention points`);
  if (g === "Washington" && /point level|nonresident/i.test(all)) err(`${where}: Washington data has no point-level or nonresident split`);
  if (g === "Kansas" && /\belk\b/i.test(all)) err(`${where}: Kansas has no elk draw data`);
  // Ad must carry the price/terms facts somewhere.
  if (!/\$14\.99/.test(all) || !/money-back/i.test(all) || !/renew/i.test(all)) err(`${where}: missing price, refund or no-renewal copy`);
  for (const p of ["Path 1", "Path 2"]) {
    if (ad[p].length > 15) err(`${where}: ${p} "${ad[p]}" over 15 chars`);
    if (/[^a-z0-9-]/i.test(ad[p])) err(`${where}: ${p} has invalid chars`);
  }
  if (!ad["Path 1"] && ad["Path 2"]) err(`${where}: Path 2 without Path 1`);
  if (!ad["Final URL"].startsWith(`${SITE}/`) && ad["Final URL"] !== SITE) err(`${where}: Final URL must be on ${SITE}`);
  urls.set(ad["Final URL"], where);
}
for (const r of by["adgroup-negative"] || []) if (!/^Negative (Phrase|Exact|Broad)$/.test(r["Criterion Type"])) err(`line ${line(r)}: ad group negative type "${r["Criterion Type"]}"`);

// ---------- Assets ----------
const sl = by.sitelink || [];
if (sl.length < 4) err(`${sl.length} sitelinks (need at least 4)`);
for (const r of sl) {
  const where = `sitelink "${r["Link Text"]}"`;
  checkText(r["Link Text"], where, { max: 25, kindName: "sitelink text" });
  checkText(r["Description Line 1"], where, { max: 35, kindName: "sitelink description" });
  checkText(r["Description Line 2"], where, { max: 35, kindName: "sitelink description" });
  if (!!r["Description Line 1"] !== !!r["Description Line 2"]) err(`${where}: needs both description lines or neither`);
  if (!r["Final URL"].startsWith(`${SITE}/`)) err(`${where}: Final URL must be on ${SITE}`);
  urls.set(r["Final URL"], where);
}
for (const need of ["/shortlist", "/calendar", "/pricing", "/states"]) if (!sl.some((r) => r["Final URL"] === SITE + need)) err(`no sitelink to ${need}`);
if (new Set(sl.map((r) => r["Final URL"])).size !== sl.length) err("two sitelinks share a URL");
const co = by.callout || [];
if (co.length < 4) err(`${co.length} callouts (need at least 4)`);
for (const r of co) checkText(r["Callout text"], `callout "${r["Callout text"]}"`, { max: 25, kindName: "callout" });
const SNIPPET_HEADERS = ["Amenities", "Brands", "Courses", "Degree programs", "Destinations", "Featured hotels", "Insurance coverage", "Models", "Neighborhoods", "Service catalog", "Shows", "Styles", "Types"];
const sn = by.snippet || [];
if (!sn.length) err("no structured snippet");
for (const r of sn) {
  if (!SNIPPET_HEADERS.includes(r.Header)) err(`snippet header "${r.Header}" isn't one Google allows`);
  const vals = r["Snippet Values"].split(";");
  if (vals.length < 3 || vals.length > 10) err(`snippet ${r.Header}: ${vals.length} values (3–10)`);
  vals.forEach((v) => checkText(v, `snippet ${r.Header}`, { max: 25, kindName: "snippet value" }));
}
const dest = sn.find((r) => r.Header === "Destinations");
if (dest) {
  const named = LIVE.filter((s) => new RegExp(`\\b${s}\\b`).test(dest["Snippet Values"]));
  if (named.length !== LIVE.length) err(`Destinations snippet names ${named.length}/${LIVE.length} live states`);
}

// ---------- Live site checks ----------
const pageTitle = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.replace(/&amp;/g, "&").trim() || "";
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const siteArg = process.argv.indexOf("--site");
const FETCH_BASE = siteArg > 0 ? process.argv[siteArg + 1].replace(/\/$/, "") : SITE;
async function get(url) {
  const res = await fetch(url.replace(SITE, FETCH_BASE), { redirect: "follow", headers: { "user-agent": "huntscout-ads-validate/1.0" } });
  return { status: res.status, url: res.url, html: await res.text() };
}

if (!OFFLINE) {
  const results = await Promise.all(
    [...urls.keys(), SITE + "/states", SITE + "/pricing"].filter((u, i, a) => a.indexOf(u) === i).map(async (u) => {
      try {
        return [u, await get(u)];
      } catch (e) {
        return [u, { status: 0, url: u, html: "", error: e.message }];
      }
    }),
  );
  const page = Object.fromEntries(results);
  for (const [u, r] of results) {
    const where = urls.get(u) || "check";
    if (r.status !== 200) err(`${where}: ${u} returned ${r.status || r.error}`);
    else if (new URL(r.url).host !== new URL(FETCH_BASE).host) err(`${where}: ${u} redirected off-site to ${r.url}`);
    else if (/coming soon|not found|404/i.test(pageTitle(r.html))) err(`${where}: ${u} title is "${pageTitle(r.html)}"`);
  }
  for (const g of LIVE) {
    const r = page[stateUrl(g)];
    if (r?.status === 200 && !pageTitle(r.html).startsWith(`${g} Draw Results`)) err(`${g}: live page title "${pageTitle(r.html)}" isn't a live state page`);
  }
  // Coverage on the live site must match the ad groups exactly.
  const st = page[SITE + "/states"];
  if (st?.status === 200) {
    const liveSlugs = new Set([...st.html.matchAll(/href="\/states\/([a-z-]+)"/g)].map((m) => m[1]));
    const ours = new Set(LIVE.map((s) => s.toLowerCase().replace(/ /g, "-")));
    for (const s of ours) if (!liveSlugs.has(s)) err(`/states doesn't link ${s}`);
    const extra = [...liveSlugs].filter((s) => !ours.has(s));
    if (extra.length) warn(`/states also links ${extra.join(", ")}: if those are live, add ad groups and update "12 states" copy`);
  }
  // Price and terms claims in the ads must match the live pricing page.
  const pr = page[SITE + "/pricing"];
  if (pr?.status === 200) {
    const t = text(pr.html);
    if (!/\$\s*14\.99/.test(t)) err("/pricing doesn't show $14.99");
    if (!/2 years/i.test(t)) err("/pricing doesn't say 2 years");
    if (!/no auto-renew/i.test(t)) err("/pricing doesn't say no auto-renewal");
    if (!/30-day money-back guarantee/i.test(t)) err("/pricing doesn't offer the 30-day money-back guarantee");
    if (!/12 western draw states/i.test(t)) err('/pricing doesn\'t say "12 western draw states"');
  }
  const cal = page[SITE + "/calendar"];
  if (cal?.status === 200 && !/2027/.test(text(cal.html))) err("/calendar shows no 2027 dates");
  const sh = page[SITE + "/shortlist"];
  if (sh?.status === 200 && !/Where can I draw/i.test(text(sh.html))) err("/shortlist doesn't show its explainer to logged-out visitors");
}

// ---------- Report ----------
const count = (k) => (by[k] || []).length;
console.log(
  `campaign.csv: ${rows.length} rows — ${count("adgroup")} ad groups, ${count("keyword")} keywords, ${count("campaign-negative")} campaign negatives, ` +
    `${count("adgroup-negative")} ad group negatives, ${count("ad")} RSAs, ${count("sitelink")} sitelinks, ${count("callout")} callouts, ${count("snippet")} snippets` +
    (OFFLINE ? " (offline: live site not checked)" : `; ${urls.size} landing URLs checked at ${FETCH_BASE}`),
);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log("OK: no errors.");
