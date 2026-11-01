#!/usr/bin/env node
// Writes campaign.csv (Google Ads Editor import) and negatives.txt from
// campaign-data.mjs. Usage: node marketing/google-ads/build.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPAIGN, AD_GROUPS, CAMPAIGN_NEGATIVES, SITELINKS, CALLOUTS, SNIPPETS } from "./campaign-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Header names follow Google Ads Editor's CSV column list
// (support.google.com/google-ads/editor/answer/57747). One file, one header;
// each row fills only the columns for its kind (campaign, location, ad group,
// keyword, negative, ad, sitelink, callout, snippet). Blank = not set.
export const COLUMNS = [
  "Campaign",
  "Campaign Type",
  "Campaign Status",
  "Budget",
  "Bid Strategy Type",
  "Maximum CPC bid limit",
  "Networks",
  "Languages",
  "Ad Schedule",
  "Final URL suffix",
  "Location",
  "Location ID",
  "Ad Group",
  "Ad Group Type",
  "Ad Group Status",
  "Keyword",
  "Criterion Type",
  "Status",
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1} position`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1} position`),
  "Path 1",
  "Path 2",
  "Final URL",
  "Link Text",
  "Description Line 1",
  "Description Line 2",
  "Callout text",
  "Header",
  "Snippet Values",
];

const rows = [];
const add = (o) => rows.push(o);
const C = CAMPAIGN.name;

add({
  Campaign: C,
  "Campaign Type": CAMPAIGN.type,
  "Campaign Status": CAMPAIGN.status,
  Budget: CAMPAIGN.budget,
  "Bid Strategy Type": CAMPAIGN.bidStrategy,
  "Maximum CPC bid limit": CAMPAIGN.maxCpcLimit,
  Networks: CAMPAIGN.networks,
  Languages: CAMPAIGN.languages,
  "Ad Schedule": CAMPAIGN.adSchedule,
  "Final URL suffix": CAMPAIGN.finalUrlSuffix,
});
add({ Campaign: C, Location: CAMPAIGN.location.name, "Location ID": CAMPAIGN.location.id });

for (const n of CAMPAIGN_NEGATIVES) {
  add({ Campaign: C, Keyword: n.text, "Criterion Type": `Campaign Negative ${n.match}` });
}

for (const g of AD_GROUPS) {
  add({ Campaign: C, "Ad Group": g.name, "Ad Group Type": "Standard", "Ad Group Status": "Enabled" });
  for (const k of g.keywords) add({ Campaign: C, "Ad Group": g.name, Keyword: k.text, "Criterion Type": k.match, Status: "Enabled" });
  for (const k of g.negatives) add({ Campaign: C, "Ad Group": g.name, Keyword: k.text, "Criterion Type": k.match });
  const ad = { Campaign: C, "Ad Group": g.name, Status: "Enabled", "Path 1": g.path1, "Path 2": g.path2, "Final URL": g.finalUrl };
  g.headlines.forEach((h, i) => {
    ad[`Headline ${i + 1}`] = h.text;
    if (h.pin) ad[`Headline ${i + 1} position`] = String(h.pin);
  });
  g.descriptions.forEach((d, i) => {
    ad[`Description ${i + 1}`] = d.text;
    if (d.pin) ad[`Description ${i + 1} position`] = String(d.pin);
  });
  add(ad);
}

for (const s of SITELINKS) {
  add({ Campaign: C, "Link Text": s.text, "Description Line 1": s.d1, "Description Line 2": s.d2, "Final URL": s.url, Status: "Enabled" });
}
for (const t of CALLOUTS) add({ Campaign: C, "Callout text": t, Status: "Enabled" });
for (const s of SNIPPETS) add({ Campaign: C, Header: s.header, "Snippet Values": s.values.join(";"), Status: "Enabled" });

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c] ?? ""))].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
// UTF-8 with BOM so Editor (and Excel) read the en dash in the campaign name correctly.
writeFileSync(join(here, "campaign.csv"), "﻿" + csv, "utf8");

// Paste-ready negatives for the Ads UI (Keywords > Negative keywords > +),
// in case an Editor version rejects the campaign-negative rows.
const fmt = (n) => (n.match === "Exact" ? `[${n.text}]` : n.match === "Phrase" ? `"${n.text}"` : n.text);
writeFileSync(
  join(here, "negatives.txt"),
  `# Campaign-level negative keywords for "${C}". Same list as campaign.csv.\n# Ads UI: Campaign > Keywords > Negative keywords > + > paste. "quotes" = phrase, [brackets] = exact.\n` +
    CAMPAIGN_NEGATIVES.map(fmt).join("\n") +
    "\n",
);

console.log(`campaign.csv: ${rows.length} rows, ${COLUMNS.length} columns; negatives.txt: ${CAMPAIGN_NEGATIVES.length} negatives`);
