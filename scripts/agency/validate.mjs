#!/usr/bin/env node
// Validates src/data/agency/<state>/ against src/data/agency/schema.ts.
// Usage: node scripts/agency/validate.mjs <state-slug> [--part harvest|draw]
// Exits 1 on any error. Warnings do not fail.
import fs from "node:fs";
import path from "node:path";

const SPECIES = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"];
const METHODS = ["all", "rifle", "archery", "muzzleloader", "shotgun", "other"];
const SEXES = ["all", "male", "female", "either"];
const RES = ["all", "resident", "nonresident"];
const KEY_DATE_KINDS = ["application", "application-change", "results", "payment", "surrender", "points", "leftover", "license-sale", "other"];
const DRAW_KINDS = ["preference", "bonus", "bonus-squared", "hybrid", "random", "otc", "none"];
const POINT_KINDS = ["preference", "bonus", "bonus-squared", "hybrid"];
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Latest season/draw year a data row may carry: the current year in Colorado (was a fixed 2026,
// which would have rejected the first 2027 draw results).
const MAX_YEAR = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric" }).format(new Date()));

const slug = process.argv[2];
const partIdx = process.argv.indexOf("--part");
const part = partIdx > 0 ? process.argv[partIdx + 1] : "all";
if (!slug) {
  console.error("usage: validate.mjs <state-slug> [--part harvest|draw]");
  process.exit(2);
}
const root = path.join(process.cwd(), "src/data/agency", slug);
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readJson(p) {
  const size = fs.statSync(p).size;
  if (size > MAX_FILE_BYTES) err(`${rel(p)} is ${(size / 1e6).toFixed(1)} MB (limit 6 MB) — split or trim`);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    err(`${rel(p)}: invalid JSON (${e.message})`);
    return null;
  }
}
const rel = (p) => path.relative(process.cwd(), p);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const nn = (v) => v === null || v === undefined || isNum(v);
const isoOk = (d) => {
  if (!ISO.test(d)) return false;
  const t = new Date(d + "T00:00:00Z");
  return !isNaN(t) && t.toISOString().slice(0, 10) === d;
};

function checkSources(sources, prefix, where) {
  const ids = new Set();
  if (!Array.isArray(sources) || sources.length === 0) err(`${where}: sources[] is empty`);
  for (const s of sources || []) {
    if (!s.id || !s.title || !s.publisher || !s.url || !s.retrieved) err(`${where}: source missing id/title/publisher/url/retrieved: ${JSON.stringify(s).slice(0, 160)}`);
    if (s.id && !s.id.startsWith(prefix)) err(`${where}: source id "${s.id}" must start with "${prefix}"`);
    if (s.id && ids.has(s.id)) err(`${where}: duplicate source id ${s.id}`);
    if (s.url && !/^https?:\/\//.test(s.url)) err(`${where}: source ${s.id} url is not http(s)`);
    if (s.retrieved && !isoOk(s.retrieved)) err(`${where}: source ${s.id} retrieved not YYYY-MM-DD`);
    ids.add(s.id);
  }
  return ids;
}

function checkCoverage(cov, where) {
  if (!Array.isArray(cov)) return err(`${where}: coverage must be an array`);
  for (const c of cov) {
    if (!SPECIES.includes(c.species)) err(`${where}: coverage species "${c.species}" invalid`);
    if (!Array.isArray(c.years)) err(`${where}: coverage ${c.species} years must be an array`);
  }
}

const allSourceIds = new Set();

// ---------- harvest ----------
function validateHarvest() {
  const metaPath = path.join(root, "harvest-meta.json");
  if (!fs.existsSync(metaPath)) return err(`missing ${rel(metaPath)}`);
  const meta = readJson(metaPath);
  if (!meta) return;
  const ids = checkSources(meta.sources, "h-", "harvest-meta");
  ids.forEach((i) => allSourceIds.add(i));
  checkCoverage(meta.coverage, "harvest-meta");
  if (typeof meta.unitNames !== "object") err("harvest-meta: unitNames must be an object");
  const dir = path.join(root, "harvest");
  if (!fs.existsSync(dir)) return err(`missing ${rel(dir)}/`);
  const used = new Set();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const sp = f.replace(/\.json$/, "");
    if (!SPECIES.includes(sp)) err(`harvest/${f}: file name must be a species key`);
    const rows = readJson(path.join(dir, f));
    if (!Array.isArray(rows)) { err(`harvest/${f}: must be an array`); continue; }
    if (rows.length === 0) warn(`harvest/${f}: empty`);
    const seen = new Set();
    rows.forEach((r, i) => {
      const at = `harvest/${f}[${i}]`;
      if (r.species !== sp) err(`${at}: species "${r.species}" != file ${sp}`);
      if (!Number.isInteger(r.year) || r.year < 2005 || r.year > MAX_YEAR) err(`${at}: year ${r.year} out of range`);
      if (typeof r.unit !== "string" || !r.unit) err(`${at}: unit must be a non-empty string`);
      if (r.method && !METHODS.includes(r.method)) err(`${at}: method "${r.method}" invalid`);
      if (r.sex && !SEXES.includes(r.sex)) err(`${at}: sex "${r.sex}" invalid`);
      if (r.residency && !RES.includes(r.residency)) err(`${at}: residency "${r.residency}" invalid`);
      for (const k of ["hunters", "harvest", "successPct", "harvestMale", "harvestFemale", "daysHunted", "licenses"])
        if (!nn(r[k])) err(`${at}: ${k} must be number or null`);
      if (r.hunters === null && r.harvest === null && r.successPct === null) err(`${at}: hunters, harvest and successPct are all null`);
      if (isNum(r.hunters) && r.hunters < 0) err(`${at}: negative hunters`);
      if (isNum(r.harvest) && r.harvest < 0) err(`${at}: negative harvest`);
      if (isNum(r.successPct) && (r.successPct < 0 || r.successPct > 100)) err(`${at}: successPct ${r.successPct} outside 0-100`);
      if (isNum(r.hunters) && isNum(r.harvest) && r.harvest > r.hunters && !r.note) warn(`${at}: harvest ${r.harvest} > hunters ${r.hunters} with no note (multi-tag?)`);
      if (isNum(r.hunters) && isNum(r.harvest) && isNum(r.successPct) && r.hunters >= 20) {
        const calc = (100 * r.harvest) / r.hunters;
        if (Math.abs(calc - r.successPct) > 2 && !r.note) warn(`${at}: successPct ${r.successPct} vs harvest/hunters ${calc.toFixed(1)} (unit ${r.unit} ${r.year}) — add a note if the agency defines success differently`);
      }
      if (r.successComputed && !(isNum(r.hunters) && isNum(r.harvest))) err(`${at}: successComputed requires hunters and harvest`);
      if (!r.sourceId) err(`${at}: missing sourceId`);
      else used.add(r.sourceId);
      const key = [r.year, r.unit, r.hunt || "", r.method || "", r.methodLabel || "", r.sex || "", r.residency || ""].join("|");
      if (seen.has(key)) err(`${at}: duplicate row ${key}`);
      seen.add(key);
    });
  }
  for (const u of used) if (!ids.has(u)) err(`harvest: sourceId "${u}" not in harvest-meta.sources`);
}

// ---------- draw ----------
function validateDraw() {
  const metaPath = path.join(root, "draw-meta.json");
  if (!fs.existsSync(metaPath)) return err(`missing ${rel(metaPath)}`);
  const m = readJson(metaPath);
  if (!m) return;
  const ids = checkSources(m.sources, "d-", "draw-meta");
  ids.forEach((i) => allSourceIds.add(i));
  for (const k of ["slug", "name", "abbrev", "unitTerm", "lastReviewed", "overview"]) if (!m[k]) err(`draw-meta: missing ${k}`);
  if (m.slug !== slug) err(`draw-meta: slug "${m.slug}" != ${slug}`);
  if (!m.agency?.name || !m.agency?.url) err("draw-meta: agency.name/url required");
  if (m.lastReviewed && !isoOk(m.lastReviewed)) err("draw-meta: lastReviewed not YYYY-MM-DD");
  checkCoverage(m.coverage, "draw-meta");
  const refOk = (id, at) => { if (!ids.has(id)) err(`${at}: sourceId "${id}" not in draw-meta.sources`); };
  if (!Array.isArray(m.species) || !m.species.length) err("draw-meta: species[] empty");
  for (const s of m.species || []) {
    const at = `draw-meta.species[${s.species}]`;
    if (!SPECIES.includes(s.species)) err(`${at}: invalid species`);
    if (!DRAW_KINDS.includes(s.drawSystem)) err(`${at}: drawSystem "${s.drawSystem}" invalid`);
    if (s.pastDrawSystem !== undefined && !DRAW_KINDS.includes(s.pastDrawSystem)) err(`${at}: pastDrawSystem "${s.pastDrawSystem}" invalid`);
    if (s.pastDrawSystem !== undefined && s.pastDrawSystem === s.drawSystem) warn(`${at}: pastDrawSystem equals drawSystem (omit it)`);
    if (!s.drawSystemSummary) err(`${at}: drawSystemSummary required`);
    if (typeof s.pointsMatter !== "boolean") err(`${at}: pointsMatter must be boolean`);
    if (s.pointsMatter && ["random", "otc", "none"].includes(s.drawSystem)) err(`${at}: pointsMatter true with drawSystem ${s.drawSystem}`);
    if (!Array.isArray(s.sourceIds) || !s.sourceIds.length) err(`${at}: sourceIds required`);
    (s.sourceIds || []).forEach((id) => refOk(id, at));
    for (const d of s.keyDates || []) {
      const dat = `${at}.keyDates "${d.label}"`;
      if (!d.label || !Number.isInteger(d.cycle)) err(`${dat}: label and integer cycle required`);
      if (!d.date && !(d.start && d.end)) err(`${dat}: date or start+end required`);
      for (const k of ["date", "start", "end"]) if (d[k] && !isoOk(d[k])) err(`${dat}: ${k} "${d[k]}" not a real YYYY-MM-DD date`);
      if (d.start && d.end && d.start > d.end) err(`${dat}: start after end`);
      if (!["confirmed", "tentative"].includes(d.status)) err(`${dat}: status must be confirmed|tentative`);
      if (d.kind !== undefined && !KEY_DATE_KINDS.includes(d.kind)) err(`${dat}: kind "${d.kind}" invalid`);
      if (d.residency !== undefined && !RES.slice(1).includes(d.residency)) err(`${dat}: residency "${d.residency}" invalid`);
      refOk(d.sourceId, dat);
    }
  }
  for (const f of m.fees || []) {
    if (!f.item || !RES.slice(1).includes(f.residency) || !isNum(f.amountUsd) || !Number.isInteger(f.licenseYear)) err(`draw-meta.fees: bad item ${JSON.stringify(f).slice(0, 140)}`);
    refOk(f.sourceId, `fee "${f.item}"`);
  }
  for (const s of m.seasons || []) {
    if (!SPECIES.includes(s.species) || !s.label || !isoOk(s.start || "") || !isoOk(s.end || "") || s.start > s.end) err(`draw-meta.seasons: bad season ${JSON.stringify(s).slice(0, 140)}`);
    if (!Number.isInteger(s.year) || (s.start && Math.abs(Number(s.start.slice(0, 4)) - s.year) > 1)) err(`draw-meta.seasons "${s.label}": year ${s.year} doesn't match start ${s.start}`);
    if (s.method !== undefined && !METHODS.includes(s.method)) err(`draw-meta.seasons "${s.label}": method invalid`);
    if (s.residency !== undefined && !RES.slice(1).includes(s.residency)) err(`draw-meta.seasons "${s.label}": residency invalid`);
    for (const k of ["units", "huntCodes"]) if (s[k] !== undefined && (!Array.isArray(s[k]) || !s[k].length || s[k].some((x) => typeof x !== "string" || !x))) err(`draw-meta.seasons "${s.label}": ${k} must be a non-empty string array`);
    refOk(s.sourceId, `season "${s.label}"`);
  }
  const dir = path.join(root, "draw");
  if (!fs.existsSync(dir)) return err(`missing ${rel(dir)}/`);
  const used = new Set();
  const resStats = (st, at) => {
    if (st === null || st === undefined) return;
    for (const k of ["quota", "applicants", "drawn", "oddsPct", "minPoints"]) if (!nn(st[k])) err(`${at}: ${k} must be number or null`);
    if (isNum(st.oddsPct) && (st.oddsPct < 0 || st.oddsPct > 100)) err(`${at}: oddsPct ${st.oddsPct} outside 0-100`);
    if (isNum(st.applicants) && isNum(st.drawn) && st.drawn > st.applicants) warn(`${at}: drawn ${st.drawn} > applicants ${st.applicants}`);
    if (isNum(st.applicants) && isNum(st.drawn) && isNum(st.oddsPct) && st.applicants >= 10) {
      const calc = (100 * st.drawn) / st.applicants;
      if (Math.abs(calc - st.oddsPct) > 2) warn(`${at}: oddsPct ${st.oddsPct} vs drawn/applicants ${calc.toFixed(1)}`);
    }
  };
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const sp = f.replace(/\.json$/, "");
    if (!SPECIES.includes(sp)) err(`draw/${f}: file name must be a species key`);
    const info = (m.species || []).find((s) => s.species === sp);
    if (!info) err(`draw/${f}: species ${sp} not described in draw-meta.species`);
    const rows = readJson(path.join(dir, f));
    if (!Array.isArray(rows)) { err(`draw/${f}: must be an array`); continue; }
    const seen = new Set();
    rows.forEach((r, i) => {
      const at = `draw/${f}[${i}] ${r.huntCode} ${r.year}`;
      if (r.species !== sp) err(`${at}: species mismatch`);
      if (!Number.isInteger(r.year) || r.year < 2010 || r.year > MAX_YEAR) err(`${at}: year out of range`);
      if (!r.huntCode) err(`${at}: huntCode required`);
      if (!Array.isArray(r.units)) err(`${at}: units must be an array`);
      if (!r.description) err(`${at}: description required`);
      if (!["first", "all"].includes(r.choice)) err(`${at}: choice must be first|all`);
      if (r.method && !METHODS.includes(r.method)) err(`${at}: method invalid`);
      if (r.sex && !SEXES.includes(r.sex)) err(`${at}: sex invalid`);
      resStats(r.resident, `${at}.resident`);
      resStats(r.nonresident, `${at}.nonresident`);
      resStats(r.total, `${at}.total`);
      if (!r.resident && !r.nonresident && !r.total) err(`${at}: no resident/nonresident/total stats`);
      if (r.seasonRanges !== undefined) {
        if (!Array.isArray(r.seasonRanges) || !r.seasonRanges.length) err(`${at}: seasonRanges must be a non-empty array`);
        for (const g of r.seasonRanges || []) {
          if (!isoOk(g.start || "") || !isoOk(g.end || "") || g.start > g.end) err(`${at}: bad seasonRange ${JSON.stringify(g)}`);
          // A hunt's season is in its draw year, or runs into the next January-March.
          else if (Number(g.start.slice(0, 4)) !== r.year && !(Number(g.start.slice(0, 4)) === r.year + 1 && g.start.slice(5) <= "03-31"))
            err(`${at}: seasonRange ${g.start} is outside draw year ${r.year}`);
        }
        if (!r.seasonDates) warn(`${at}: seasonRanges without the agency's seasonDates text`);
      }
      if (r.seasonSourceId !== undefined) { refOk(r.seasonSourceId, `${at}.seasonSourceId`); used.add(r.seasonSourceId); }
      if (r.byPoints) {
        // byPoints are allowed for the current points draw, or for history under a past points system (pastDrawSystem).
        if (info && !info.pointsMatter && !POINT_KINDS.includes(info.pastDrawSystem))
          err(`${at}: byPoints present but ${sp} pointsMatter=false and pastDrawSystem is not a points system`);
        const pts = new Set();
        for (const p of r.byPoints) {
          if (!Number.isInteger(p.points) || p.points < 0 || p.points > 40) err(`${at}: bad points ${p.points}`);
          if (pts.has(p.points)) err(`${at}: duplicate point level ${p.points}`);
          pts.add(p.points);
          for (const k of ["resident", "nonresident"]) {
            const v = p[k];
            if (v === null || v === undefined) continue;
            if (!isNum(v.applicants) || !isNum(v.drawn)) err(`${at}: byPoints ${p.points}.${k} needs applicants and drawn numbers`);
            else if (v.drawn > v.applicants) warn(`${at}: byPoints ${p.points}.${k} drawn > applicants`);
          }
        }
      }
      if (!r.sourceId) err(`${at}: missing sourceId`);
      else used.add(r.sourceId);
      const key = [r.year, r.huntCode, r.choice].join("|");
      if (seen.has(key)) err(`${at}: duplicate (year, huntCode, choice)`);
      seen.add(key);
    });
  }
  for (const u of used) if (!ids.has(u)) err(`draw: sourceId "${u}" not in draw-meta.sources`);
}

if (part === "all" || part === "harvest") validateHarvest();
if (part === "all" || part === "draw") validateDraw();

for (const w of warnings.slice(0, 60)) console.log("WARN ", w);
if (warnings.length > 60) console.log(`WARN  ... ${warnings.length - 60} more warnings`);
for (const e of errors.slice(0, 120)) console.log("ERROR", e);
if (errors.length > 120) console.log(`ERROR ... ${errors.length - 120} more errors`);
console.log(`${slug} [${part}]: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
