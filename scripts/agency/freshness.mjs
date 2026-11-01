#!/usr/bin/env node
// Agency data freshness monitor.
//
// Fetches the agency pages listed in scripts/agency/watch.json, extracts
//   (1) document links (pdf/xlsx/csv and the agencies' document-server links) and
//   (2) text lines that mention the next draw/license cycle year next to a date or a
//       word like application, deadline, draw or results,
// compares them with the previous run's snapshot and prints a markdown report:
// per state the NEW document links, NEW next-cycle mentions and pages that failed,
// plus a "data age" section computed from src/data/agency/<state>/*-meta.json.
//
// Plain Node 20+, no dependencies (it shells out to curl only as a fallback for
// sites that reject Node's TLS client with HTTP 403). Always exits 0.
//
// Usage (from the repo root):
//   node scripts/agency/freshness.mjs [--state-file .agency-freshness/snapshot.json]
//        [--report-file .agency-freshness/report.md] [--watch scripts/agency/watch.json]
//        [--states colorado,utah] [--today YYYY-MM-DD] [--cycle 2027]
//        [--timeout 30000] [--retries 2] [--no-save]
//
// When GITHUB_OUTPUT is set it also writes: changes, baseline, new_docs,
// new_mentions, failed_pages, checked_pages (used by .github/workflows/agency-freshness.yml).

import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};
const MAX_BODY = 20 * 1024 * 1024;
const HOST_GAP_MS = 600; // politeness delay between requests to the same host
const HOST_CONCURRENCY = 6; // hosts fetched in parallel
const PRUNE_DAYS = 400; // forget items not seen for this long
const KEYDATE_LEAD_DAYS = 45; // agencies usually post next-cycle dates ~1-2 months before the window opens
const MAX_LIST = 30; // max items per list in the report
const MAX_REPORT_CHARS = 60000; // GitHub issue/comment bodies are capped at 65536

const STATE_NAMES = {
  colorado: "Colorado",
  wyoming: "Wyoming",
  montana: "Montana",
  idaho: "Idaho",
  utah: "Utah",
  arizona: "Arizona",
  nevada: "Nevada",
  "new-mexico": "New Mexico",
  oregon: "Oregon",
  washington: "Washington",
  kansas: "Kansas",
  "south-dakota": "South Dakota",
};

// Links that count as "documents" on any page.
const DOC_PATTERNS = [
  /\.(pdf|xlsx?|xlsm|csv|zip|docx?)(?:$|[?#])/i, // file extension on the path
  /[?&][^=]*=[^&]*\.(pdf|xlsx?|csv)(?:&|$)/i, // ...or in a query parameter
  /\/media\/\d+\/download\b/i, // WGFD (Drupal media)
  /\/home\/showpublisheddocument\/\d+/i, // KDWP (CivicPlus)
  /getRepositoryFile\?objectID=\d+/i, // Montana FWP
  /^https?:\/\/cpw\.widen\.net\/s\//i, // CPW Widen share links
  /widencollective\.com\/assets\/share\//i, // CPW Widen
  /[?&]wpdmdl=\d+/i, // NMDOW WordPress Download Manager
  /wdfw\.wa\.gov\/publications\/\d{4,}/i, // WDFW publication pages
  /^https?:\/\/docs\.google\.com\/(document|spreadsheets)\/d\//i, // agency-published Google Docs/Sheets
];

const STRONG_KW =
  /\b(applica\w*|apply|deadlines?|draw\w*|results?|odds|bonus|preference|points?|quotas?|harvest|reports?|fees?|pric\w+|regulations?|brochures?|guidebooks?|proclamations?|booklets?|opens?|closes?|period|due)\b/i;
const DATE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/i;
const APP_LABEL = /applica|apply|deadline|period|draw|preference point|bonus point|point purchase/i;
const RESULT_LABEL = /result/i;

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const a = {
    watch: path.join(SCRIPT_DIR, "watch.json"),
    stateFile: ".agency-freshness/snapshot.json",
    reportFile: ".agency-freshness/report.md",
    states: null,
    today: null,
    cycle: null,
    timeout: 30000,
    retries: 2,
    save: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--watch") a.watch = v();
    else if (k === "--state-file") a.stateFile = v();
    else if (k === "--report-file") a.reportFile = v();
    else if (k === "--states") a.states = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--today") a.today = v();
    else if (k === "--cycle") a.cycle = Number(v());
    else if (k === "--timeout") a.timeout = Number(v());
    else if (k === "--retries") a.retries = Number(v());
    else if (k === "--no-save") a.save = false;
    else if (k === "-h" || k === "--help") {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 24).join("\n"));
      process.exit(0);
    } else console.error(`freshness: ignoring unknown argument ${k}`);
  }
  return a;
}

// ---------------------------------------------------------------- dates

function denverToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
const parseIso = (s) => new Date(s + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(parseIso(s).getTime() + n * 86400000));
function addYears(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const out = new Date(Date.UTC(y + n, m - 1, d));
  if (out.getUTCMonth() !== m - 1) out.setUTCDate(0); // Feb 29 -> Feb 28
  return iso(out);
}
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
const isIsoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------------------------------------------------------------- html helpers

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", frac12: "½" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
const squash = (s) => s.replace(/[\s\u00a0\u200b]+/g, " ").trim();
const stripTags = (s) => squash(decodeEntities(s.replace(/<[^>]*>/g, " ")));

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : null;
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]) : "";
}

function normalizeUrl(href, base) {
  if (!href) return null;
  let h = href.trim();
  // Links pasted from Chrome's PDF viewer: chrome-extension://<id>/https://agency/doc.pdf
  const ce = h.match(/^chrome-extension:\/\/[^/]+\/(https?:\/\/.+)$/i);
  if (ce) h = ce[1];
  if (/^(mailto|tel|javascript|data):/i.test(h) || h.startsWith("#")) return null;
  let u;
  try {
    u = new URL(h, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  // Same document, different presentation/tracking parameters (WGFD adds ?inline / ?inline=).
  for (const k of [...u.searchParams.keys()]) if (/^(inline|utm_\w+|fbclid|gclid|_ga|_gl)$/i.test(k)) u.searchParams.delete(k);
  return u.toString().replace(/\?$/, "");
}

function isDocUrl(url, extra) {
  return DOC_PATTERNS.some((re) => re.test(url)) || extra.some((re) => re.test(url));
}

function fileNameOf(url) {
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || u.hostname);
    return seg + (u.search && !/\.\w{2,4}$/.test(seg) ? u.search : "");
  } catch {
    return url;
  }
}

function extractDocs(html, baseUrl, page) {
  const base = (() => {
    const m = html.match(/<base\b[^>]*href\s*=\s*["']([^"']+)["']/i);
    return m ? normalizeUrl(decodeEntities(m[1]), baseUrl) || baseUrl : baseUrl;
  })();
  const extra = (page.linkPatterns || []).map((p) => new RegExp(p, "i"));
  const exclude = (page.excludePatterns || []).map((p) => new RegExp(p, "i"));
  const docs = new Map();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = normalizeUrl(attr(m[1], "href"), base);
    if (!url || !isDocUrl(url, extra) || exclude.some((x) => x.test(url))) continue;
    let text = stripTags(m[2]) || attr(m[1], "title") || attr(m[1], "aria-label") || "";
    text = squash(text);
    if (!text || /^(download|here|click here|pdf|view|link|open)$/i.test(text)) text = fileNameOf(url);
    if (!docs.has(url) || (docs.get(url).length < 3 && text.length > docs.get(url).length)) docs.set(url, text.slice(0, 200));
  }
  return docs;
}

function htmlToLines(html) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1\s*>/gi, "\n"); // site-wide menus/footers are noise
  h = h
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(/<\/?(p|div|li|ul|ol|tr|table|thead|tbody|h[1-6]|br|hr|dt|dd|dl|section|article|header|aside|main|option|select|blockquote|figcaption|label|button|summary|details|caption|form)\b[^>]*>/gi, "\n");
  const text = decodeEntities(h.replace(/<[^>]*>/g, " "));
  const out = [];
  for (const raw of text.split(/\n+/)) {
    const line = squash(raw).replace(/^\|\s*|\s*\|$/g, "").replace(/(\s*\|\s*){2,}/g, " | ").trim();
    if (!line) continue;
    if (line.length > 400) out.push(...line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((s) => s.trim()).filter(Boolean));
    else out.push(line);
  }
  return out;
}

function snippetAround(line, idx) {
  if (line.length <= 300) return line;
  let start = Math.max(0, idx - 150);
  let end = Math.min(line.length, start + 300);
  start = Math.max(0, end - 300);
  const sp = line.lastIndexOf(" ", start + 15);
  if (start > 0 && sp > start - 20) start = sp + 1;
  const ep = line.indexOf(" ", end - 15);
  if (end < line.length && ep > 0 && ep < end + 20) end = ep;
  return (start > 0 ? "…" : "") + line.slice(start, end).trim() + (end < line.length ? "…" : "");
}

const mentionKey = (s) => s.toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/^[\s|•·:–—-]+|[\s|•·:–—-]+$/g, "");

function extractMentions(html, cycle) {
  const yr = new RegExp(`(?<!\\d)${cycle}(?!\\d)`);
  const found = new Map();
  const lines = htmlToLines(html);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = yr.exec(line);
    if (!m) continue;
    if (!(STRONG_KW.test(line) || DATE_RE.test(line))) continue;
    let snip = snippetAround(line, m.index);
    // Short lines ("End: Jan 31, 2027") get the lines above as context, back to the row/heading
    // they belong to (at most 4 lines, never another line that mentions the cycle year).
    if (snip.length < 60) {
      const ctx = [];
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        if (yr.test(lines[j])) break;
        ctx.unshift(lines[j].slice(0, 100));
        if (lines[j].includes(" | ") || ctx.join(" › ").length + snip.length >= 80) break;
      }
      if (ctx.length) snip = `${ctx.join(" › ")} › ${snip}`;
    }
    const key = mentionKey(snip);
    if (key && !found.has(key)) found.set(key, snip);
  }
  // Year pickers on search forms (draw statistics tools): a new year option is the signal.
  const opt = new RegExp(`<option\\b[^>]*>\\s*${cycle}\\s*</option>`, "i");
  if (opt.test(html)) found.set(`option:${cycle}`, `Year selector lists ${cycle}`);
  return found;
}

// Failure checks for responses that look fine at the HTTP level.
function softFailure(html, status, requestedUrl, finalUrl) {
  const title = titleOf(html);
  const head = html.slice(0, 200000);
  if (/just a moment|attention required|checking your browser/i.test(title) || /cf-chl-|challenge-platform/i.test(head))
    return `bot challenge (Cloudflare) — HTTP ${status}`;
  if (/_Incapsula_Resource|Request unsuccessful\. Incapsula/i.test(head)) return `bot challenge (Imperva) — HTTP ${status}`;
  if (/^access denied$/i.test(title) || /Reference&#32;&#35;\d|errors\.edgesuite\.net/i.test(head)) return `access denied (Akamai) — HTTP ${status}`;
  if (/maintenance|temporarily unavailable|web services impacted/i.test(title) || /website is (currently )?(undergoing maintenance|unavailable)/i.test(head))
    return `maintenance page${title ? ` ("${title.slice(0, 90)}")` : ""} — HTTP ${status}`;
  if (status >= 400) return `HTTP ${status}${title ? ` ("${title.slice(0, 90)}")` : ""}`;
  if (/page not found|\b404\b|not be found/i.test(title)) return `page not found (HTTP ${status} soft 404: "${title.slice(0, 90)}")`;
  try {
    const rq = new URL(requestedUrl);
    const fu = new URL(finalUrl);
    if (rq.pathname.replace(/\/+$/, "") !== "" && (fu.pathname === "/" || fu.pathname === "") && !fu.search)
      return `redirected to the site home page (page removed?)`;
  } catch {
    /* ignore */
  }
  if (html.length < 400) return `empty response (${html.length} bytes, HTTP ${status})`;
  return null;
}

// ---------------------------------------------------------------- fetching

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let curlAvailable = null;
function hasCurl() {
  if (curlAvailable === null) {
    try {
      execFileSync("curl", ["--version"], { stdio: "ignore" });
      curlAvailable = true;
    } catch {
      curlAvailable = false;
    }
  }
  return curlAvailable;
}

function curlFetch(url, timeoutMs) {
  return new Promise((resolve) => {
    const args = ["-sS", "-L", "--compressed", "--max-time", String(Math.ceil(timeoutMs / 1000)), "-w", "\n__HS_CURL__ %{http_code} %{url_effective}"];
    for (const [k, v] of Object.entries(BROWSER_HEADERS)) args.push("-H", `${k}: ${v}`);
    args.push(url);
    execFile("curl", args, { maxBuffer: MAX_BODY + 4096, encoding: "utf8" }, (err, stdout) => {
      const i = stdout ? stdout.lastIndexOf("\n__HS_CURL__ ") : -1;
      if (i < 0) return resolve({ ok: false, error: `curl: ${err ? err.message.split("\n")[0] : "no output"}`, via: "curl" });
      const [, code, finalUrl] = stdout.slice(i + 1).trim().split(" ");
      resolve({ status: Number(code), finalUrl: finalUrl || url, body: stdout.slice(0, i), headers: {}, via: "curl" });
    });
  });
}

async function fetchOnce(url, timeoutMs, accept) {
  const r = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...(accept ? { Accept: accept } : {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_BODY) {
    r.body?.cancel();
    throw new Error(`response too large (${len} bytes)`);
  }
  const body = await r.text();
  return { status: r.status, finalUrl: r.url || url, body, headers: Object.fromEntries(r.headers), via: "fetch" };
}

async function fetchWithRetry(url, { timeoutMs, retries, accept }) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      last = await fetchOnce(url, timeoutMs, accept);
      last.attempts = attempt + 1;
      if (last.status === 403) break; // bot filter: retrying the same client will not help
      if (![408, 425, 429, 500, 502, 503, 504].includes(last.status)) return last;
      const ra = Number(last.headers["retry-after"]);
      if (Number.isFinite(ra) && ra > 20) return last; // long outage window: do not wait
      if (attempt < retries) await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt);
    } catch (e) {
      const code = e?.cause?.code || e?.name || "";
      last = { ok: false, error: `${code ? code + ": " : ""}${e?.message || e}`.slice(0, 200), attempts: attempt + 1, via: "fetch" };
      if (attempt < retries) await sleep(2000 * 2 ** attempt);
    }
  }
  // Some bot filters (Akamai) reject Node's TLS fingerprint but accept curl's.
  if ((last?.status === 403 || last?.ok === false) && hasCurl()) {
    const c = await curlFetch(url, timeoutMs);
    if (c.status && c.status < 400) return { ...c, attempts: (last.attempts || 0) + 1, note: `Node fetch got ${last.status ? "HTTP " + last.status : last.error}; curl fallback used` };
    if (c.status && last?.ok === false) return { ...c, attempts: (last.attempts || 0) + 1 };
  }
  return last;
}

// ---------------------------------------------------------------- page kinds

function expandPrefix(p, today) {
  const y = Number(today.slice(0, 4));
  return p.replaceAll("{year}", String(y)).replaceAll("{nextYear}", String(y + 1)).replaceAll("{prevYear}", String(y - 1));
}

async function checkS3(page, opts, today) {
  const include = page.include ? new RegExp(page.include, "i") : null;
  const docs = new Map();
  const bucket = page.url.endsWith("/") ? page.url : page.url + "/";
  let requests = 0;
  for (const rawPrefix of page.prefixes || [""]) {
    const prefix = expandPrefix(rawPrefix, today);
    let token = null;
    do {
      const q = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
      if (token) q.set("continuation-token", token);
      const r = await fetchWithRetry(`${bucket}?${q}`, { ...opts, accept: "application/xml,*/*" });
      requests++;
      if (!r || r.ok === false || r.status !== 200) return { error: r?.error || `HTTP ${r?.status} listing ${prefix}`, requests };
      for (const c of r.body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = decodeEntities((c[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || "");
        const lm = ((c[1].match(/<LastModified>([^<]+)<\/LastModified>/) || [])[1] || "").slice(0, 10);
        const name = key.split("/").pop();
        if (!/\.(pdf|xlsx?|csv)$/i.test(name)) continue;
        if (include && !include.test(name)) continue;
        docs.set(bucket + key.split("/").map(encodeURIComponent).join("/"), `${name}${lm ? ` (uploaded ${lm})` : ""}`);
      }
      const trunc = /<IsTruncated>true<\/IsTruncated>/.test(r.body);
      token = trunc ? decodeEntities((r.body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || "") : null;
      if (token) await sleep(HOST_GAP_MS);
    } while (token && requests < 60);
  }
  return { docs, mentions: new Map(), status: 200, finalUrl: page.url, requests };
}

async function checkWpMedia(page, opts) {
  const include = page.include ? new RegExp(page.include, "i") : null;
  const exclude = page.exclude ? new RegExp(page.exclude, "i") : null;
  const docs = new Map();
  const pages = page.pages || 1;
  for (let p = 1; p <= pages; p++) {
    const q = new URLSearchParams({ per_page: "100", page: String(p), orderby: "date", order: "desc", media_type: "application", _fields: "id,date,source_url,title" });
    const r = await fetchWithRetry(`${page.url}?${q}`, { ...opts, accept: "application/json" });
    if (!r || r.ok === false || r.status !== 200) return { error: r?.error || `HTTP ${r?.status} from WordPress media API`, requests: p };
    let items;
    try {
      items = JSON.parse(r.body);
    } catch {
      return { error: "WordPress media API did not return JSON", requests: p };
    }
    if (!Array.isArray(items)) return { error: "WordPress media API returned an unexpected shape", requests: p };
    for (const it of items) {
      const url = normalizeUrl(it.source_url || "", page.url);
      if (!url) continue;
      const title = stripTags(it.title?.rendered || "") || fileNameOf(url);
      const hay = `${title} ${fileNameOf(url)}`;
      if (include && !include.test(hay)) continue;
      if (exclude && exclude.test(hay)) continue;
      docs.set(url, `${title}${it.date ? ` (posted ${String(it.date).slice(0, 10)})` : ""}`);
    }
    if (items.length < 100) break;
    await sleep(HOST_GAP_MS);
  }
  return { docs, mentions: new Map(), status: 200, finalUrl: page.url };
}

async function checkHtml(page, opts, cycle) {
  const r = await fetchWithRetry(page.url, opts);
  if (!r || r.ok === false) return { error: r?.error || "no response", attempts: r?.attempts };
  const fail = softFailure(r.body, r.status, page.url, r.finalUrl);
  if (fail) return { error: fail, status: r.status, finalUrl: r.finalUrl, attempts: r.attempts, via: r.via };
  return {
    docs: extractDocs(r.body, r.finalUrl, page),
    mentions: extractMentions(r.body, cycle),
    status: r.status,
    finalUrl: r.finalUrl,
    title: titleOf(r.body),
    via: r.via,
    note: r.note,
  };
}

async function checkPage(page, opts, cycle, today) {
  try {
    if (page.kind === "s3-list") return await checkS3(page, opts, today);
    if (page.kind === "wp-media") return await checkWpMedia(page, opts);
    return await checkHtml(page, opts, cycle);
  } catch (e) {
    return { error: `script error: ${e?.message || e}` };
  }
}

// Run pages host by host: sequential (with a gap) within a host, several hosts at once.
async function runAll(pages, opts, cycle, today) {
  const byHost = new Map();
  for (const p of pages) {
    const host = new URL(p.url).hostname;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(p);
  }
  const queues = [...byHost.values()];
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < queues.length) {
      const q = queues[next++];
      for (let i = 0; i < q.length; i++) {
        const p = q[i];
        const t0 = Date.now();
        const res = await checkPage(p, opts, cycle, today);
        results.set(p.id, res);
        const ms = Date.now() - t0;
        process.stderr.write(
          `  ${res.error ? "FAIL" : "ok  "} ${p.state}/${p.id} ${res.error ? "— " + res.error : `${res.docs.size} docs, ${res.mentions.size} mentions`} (${ms} ms)\n`,
        );
        if (i < q.length - 1) await sleep(HOST_GAP_MS);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(HOST_CONCURRENCY, queues.length) }, worker));
  return results;
}

// ---------------------------------------------------------------- snapshot

function loadSnapshot(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (s && typeof s === "object" && s.pages) return s;
    console.error(`freshness: ${file} has no pages; treating as baseline`);
  } catch (e) {
    console.error(`freshness: could not read ${file} (${e.message}); treating as baseline`);
  }
  return null;
}

function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// Merge one page's result into the snapshot and return what is new.
function mergePage(snap, page, res, today, cycle) {
  const prev = snap.pages[page.id];
  const urlChanged = prev && prev.url !== page.url;
  const entry =
    prev && !urlChanged
      ? prev
      : { state: page.state, url: page.url, kind: page.kind || "html", docs: {}, mentions: {}, failures: 0, mentionsCycle: cycle };
  entry.state = page.state;
  entry.lastAttempt = today;
  const out = { baseline: false, newDocs: [], newMentions: [], cycleRolled: false };
  if (res.error) {
    entry.failures = (entry.failures || 0) + 1;
    entry.lastError = res.error;
    if (!entry.failingSince || entry.failures === 1) entry.failingSince = today;
    snap.pages[page.id] = entry;
    out.error = res.error;
    out.failures = entry.failures;
    out.failingSince = entry.failingSince;
    out.lastOk = entry.lastOk || null;
    return out;
  }
  out.baseline = !entry.lastOk; // first successful fetch of this page
  if (entry.mentionsCycle !== cycle) {
    out.cycleRolled = !out.baseline;
    entry.mentions = {};
    entry.mentionsCycle = cycle;
  }
  for (const [url, text] of res.docs) {
    const had = entry.docs[url];
    if (had) {
      had.l = today;
      if (text && text !== had.t && had.t === fileNameOf(url)) had.t = text;
    } else {
      entry.docs[url] = { t: text, f: today, l: today };
      if (!out.baseline) out.newDocs.push({ url, text });
    }
  }
  for (const [key, text] of res.mentions) {
    const had = entry.mentions[key];
    if (had) had.l = today;
    else {
      entry.mentions[key] = { t: text, f: today, l: today };
      if (!out.baseline && !out.cycleRolled) out.newMentions.push({ key, text });
    }
  }
  for (const bag of [entry.docs, entry.mentions])
    for (const [k, v] of Object.entries(bag)) if (v.l && daysBetween(v.l, today) > PRUNE_DAYS) delete bag[k];
  entry.lastOk = today;
  entry.lastStatus = res.status;
  entry.finalUrl = res.finalUrl && res.finalUrl !== page.url ? res.finalUrl : undefined;
  entry.failures = 0;
  delete entry.lastError;
  delete entry.failingSince;
  snap.pages[page.id] = entry;
  out.docCount = res.docs.size;
  out.mentionCount = res.mentions.size;
  out.allMentions = [...res.mentions.values()];
  out.note = res.note;
  out.finalUrl = res.finalUrl;
  return out;
}

// ---------------------------------------------------------------- data age

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n) > n - 30 ? s.lastIndexOf(" ", n) : n).replace(/[\s,;:.]+$/, "") + "…");
const maxOf = (arr) => (arr.length ? Math.max(...arr) : null);
const spName = (sp) => sp.displayName || sp.species;
const kdDate = (k) => k.start || k.date || k.end || null;
const kdLast = (k) => k.end || k.date || k.start || null;

function dataAge(slug, today, cycle, knownGaps = []) {
  const known = [];
  const isKnown = (part, species) => {
    const g = knownGaps.find((k) => k.part === part && k.species === species);
    if (g) known.push(`${part} ${species}: ${g.reason}`);
    return Boolean(g);
  };
  const dir = path.join(REPO_ROOT, "src/data/agency", slug);
  const draw = readJson(path.join(dir, "draw-meta.json"));
  const harvest = readJson(path.join(dir, "harvest-meta.json"));
  const flags = [];
  const row = { keyDates: "—", draw: "—", harvest: "—", fees: "—", reviewed: "—" };
  if (!draw) {
    flags.push(`draw-meta.json missing or unreadable`);
    return { row, flags, known };
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  // Key dates
  const cyc = {};
  for (const sp of draw.species || []) for (const k of sp.keyDates || []) cyc[k.cycle] = (cyc[k.cycle] || 0) + 1;
  row.keyDates = Object.keys(cyc).length ? Object.entries(cyc).sort().map(([c, n]) => `${c}: ${n}`).join(", ") : "none";
  const lagging = [];
  let earliestLikely = null;
  let earliestOpen = null;
  for (const sp of draw.species || []) {
    const kds = (sp.keyDates || []).filter((k) => isIsoDate(kdDate(k)));
    if (!kds.length) continue;
    const latest = Math.max(...kds.map((k) => k.cycle));
    if (latest >= cycle) continue;
    const lastCycle = kds.filter((k) => k.cycle === latest);
    const appLike = lastCycle.filter((k) => APP_LABEL.test(k.label) && !RESULT_LABEL.test(k.label));
    const pool = appLike.length ? appLike : lastCycle;
    const open = pool.map(kdDate).sort()[0];
    const projected = addYears(open, cycle - latest);
    const likelyBy = addDays(projected, -KEYDATE_LEAD_DAYS);
    if (today >= likelyBy) {
      lagging.push(`${spName(sp)} (cycle ${latest})`);
      if (!earliestLikely || likelyBy < earliestLikely) {
        earliestLikely = likelyBy;
        earliestOpen = { open, projected };
      }
    }
  }
  if (lagging.length)
    flags.push(
      `**Key dates** still on an older cycle after the agency likely published ${cycle}: ${lagging.join(", ")}. ` +
        `Last cycle's application dates began ${earliestOpen.open}; the matching ${cycle}-cycle date would be ~${earliestOpen.projected}, ` +
        `and agencies usually post dates about ${KEYDATE_LEAD_DAYS} days ahead (so by ~${earliestLikely}).`,
    );
  const allKd = (draw.species || []).flatMap((s) => s.keyDates || []);
  const latestCycleAll = maxOf(allKd.map((k) => k.cycle));
  if (latestCycleAll !== null && latestCycleAll < cycle) {
    const remaining = allKd.filter((k) => k.cycle === latestCycleAll && isIsoDate(kdLast(k)) && kdLast(k) >= today);
    if (!remaining.length)
      flags.push(`Every cycle-${latestCycleAll} key date in the data has passed and no ${cycle} dates are in the data yet (members only see past dates for this state).`);
  }

  // Draw coverage
  const drawLag = [];
  const drawMaxes = [];
  for (const c of draw.coverage || []) {
    if (!c.years?.length) continue;
    const mx = Math.max(...c.years);
    drawMaxes.push(mx);
    const sp = (draw.species || []).find((s) => s.species === c.species);
    const resultKd = (sp?.keyDates || []).filter((k) => k.cycle === year && RESULT_LABEL.test(k.label) && isIsoDate(kdLast(k)));
    const posted = resultKd.map(kdLast).filter((d) => d < today).sort()[0];
    let expected = year - 1;
    let why = "";
    if (posted) {
      expected = year;
      why = `${year} results were posted ${posted} per our key dates`;
    } else if (month >= 8) {
      expected = year;
      why = `${year} draws are complete by August in every watched state`;
    }
    if (mx < expected && !isKnown("draw", c.species))
      drawLag.push(`${sp ? spName(sp) : c.species}: latest ${mx}${why ? ` (${why})` : ` (expected ${expected})`}${c.notes ? ` — note: ${clip(c.notes, 140)}` : ""}`);
  }
  row.draw = drawMaxes.length ? (Math.min(...drawMaxes) === Math.max(...drawMaxes) ? `${Math.max(...drawMaxes)}` : `${Math.min(...drawMaxes)}–${Math.max(...drawMaxes)}`) : "none";
  if (drawLag.length) flags.push(`**Draw data** behind: ${drawLag.join("; ")}.`);

  // Harvest coverage: season S reports typically publish Jan–Jun of S+1.
  const harvestExpected = month >= 7 ? year - 1 : year - 2;
  const hLag = [];
  const hMaxes = [];
  for (const c of harvest?.coverage || []) {
    if (!c.years?.length) continue;
    const mx = Math.max(...c.years);
    hMaxes.push(mx);
    if (mx < harvestExpected && !isKnown("harvest", c.species)) hLag.push(`${c.species}: latest season ${mx}${c.notes ? ` — note: ${clip(c.notes, 140)}` : ""}`);
  }
  row.harvest = hMaxes.length ? (Math.min(...hMaxes) === Math.max(...hMaxes) ? `${Math.max(...hMaxes)}` : `${Math.min(...hMaxes)}–${Math.max(...hMaxes)}`) : "none";
  if (!harvest) flags.push(`harvest-meta.json missing or unreadable`);
  if (hLag.length)
    flags.push(`**Harvest data** behind the expected season ${harvestExpected} (season ${harvestExpected} reports typically publish Jan–Jun ${harvestExpected + 1}): ${hLag.join("; ")}.`);
  if (month <= 6 && hMaxes.length && Math.max(...hMaxes) < year - 1)
    flags.push(`Season ${year - 1} harvest reports are in their usual Jan–Jun ${year} publishing window — watch the harvest pages.`);

  // Fees
  const fy = {};
  for (const f of draw.fees || []) fy[f.licenseYear] = (fy[f.licenseYear] || 0) + 1;
  row.fees = Object.keys(fy).length ? Object.entries(fy).sort().map(([y, n]) => `${y}: ${n}`).join(", ") : "none";
  const maxFee = maxOf(Object.keys(fy).map(Number));
  if (maxFee !== null && maxFee < cycle && (cyc[cycle] || 0) > 0)
    flags.push(`**Fees** are license year ${maxFee} although ${cycle} key dates are already in the data — check the ${cycle} fee list.`);
  else if (maxFee !== null && maxFee < cycle && month >= 1 && month <= 4 && year === cycle)
    flags.push(`**Fees** are license year ${maxFee} during the ${cycle} application season — check the ${cycle} fee list.`);

  row.reviewed = draw.lastReviewed || "—";
  if (isIsoDate(draw.lastReviewed) && daysBetween(draw.lastReviewed, today) > 120)
    flags.push(`Facts last reviewed ${draw.lastReviewed} (${daysBetween(draw.lastReviewed, today)} days ago).`);
  return { row, flags, known };
}

// ---------------------------------------------------------------- report

const md = (s) => String(s).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const mdLinkText = (s) => md(s).replace(/[[\]]/g, "");

function list(items, render, max = MAX_LIST) {
  const out = items.slice(0, max).map(render);
  if (items.length > max) out.push(`- …and ${items.length - max} more`);
  return out;
}

function buildReport({ today, cycle, isBaseline, stateFile, watch, statesRun, pagesByState, outcomes, ages, disabled, startedAt }) {
  const L = [];
  let nDocs = 0;
  let nMent = 0;
  let nFail = 0;
  let nOk = 0;
  let nBase = 0;
  for (const o of outcomes.values()) {
    if (o.error) nFail++;
    else {
      nOk++;
      if (o.baseline) nBase++;
      nDocs += o.newDocs.length;
      nMent += o.newMentions.length;
    }
  }
  const secs = Math.round((Date.now() - startedAt) / 1000);
  L.push(`# Agency data freshness — ${today}`);
  L.push("");
  L.push(
    `Watching cycle **${cycle}** (the license/draw year whose dates and results come next). ` +
      `Checked ${outcomes.size} pages across ${statesRun.length} states in ${secs}s: ${nOk} ok, ${nFail} failed` +
      `${disabled.length ? `, ${disabled.length} disabled` : ""}.`,
  );
  L.push("");
  if (isBaseline) {
    L.push(
      `> **Baseline run.** No snapshot was found at \`${stateFile}\`, so everything currently on the pages was recorded and nothing is reported as new. ` +
        `The next run reports only links and ${cycle} mentions that appear after today.`,
    );
    L.push("");
  } else if (nBase) {
    L.push(`> ${nBase} page(s) were fetched successfully for the first time and recorded as a baseline (their current links are not listed as new).`);
    L.push("");
  }
  L.push(`**${nDocs} new document link${nDocs === 1 ? "" : "s"}**, **${nMent} new ${cycle} mention${nMent === 1 ? "" : "s"}**, **${nFail} failed page${nFail === 1 ? "" : "s"}**.`);
  L.push("");
  L.push(`| State | New documents | New ${cycle} mentions | Failed pages | Data-age flags |`);
  L.push(`|---|---:|---:|---:|---:|`);
  for (const s of statesRun) {
    const os = pagesByState.get(s).map((p) => outcomes.get(p.id)).filter(Boolean);
    const d = os.reduce((a, o) => a + (o.newDocs?.length || 0), 0);
    const m = os.reduce((a, o) => a + (o.newMentions?.length || 0), 0);
    const f = os.filter((o) => o.error).length;
    L.push(`| ${STATE_NAMES[s] || s} | ${d || "–"} | ${m || "–"} | ${f || "–"} | ${ages.get(s)?.flags.length || "–"} |`);
  }
  L.push("");

  L.push(`## ${isBaseline ? "Baseline by state" : "Changes by state"}`);
  L.push("");
  for (const s of statesRun) {
    const pages = pagesByState.get(s);
    const os = pages.map((p) => [p, outcomes.get(p.id)]).filter(([, o]) => o);
    const newDocs = os.flatMap(([p, o]) => (o.newDocs || []).map((d) => ({ ...d, page: p })));
    const newMent = os.flatMap(([p, o]) => (o.newMentions || []).map((d) => ({ ...d, page: p })));
    const failed = os.filter(([, o]) => o.error);
    const base = os.filter(([, o]) => !o.error && o.baseline);
    const rolled = os.filter(([, o]) => !o.error && o.cycleRolled);
    const notes = os.filter(([, o]) => !o.error && o.note);
    const hasAnything = newDocs.length || newMent.length || failed.length || base.length || rolled.length;
    L.push(`### ${STATE_NAMES[s] || s}`);
    L.push("");
    if (!hasAnything) {
      L.push(`No changes on ${os.length} page${os.length === 1 ? "" : "s"}.`);
      L.push("");
      continue;
    }
    if (newDocs.length) {
      const yr = new RegExp(`(?<!\\d)${cycle}(?!\\d)`);
      newDocs.sort((a, b) => Number(yr.test(b.text + b.url)) - Number(yr.test(a.text + a.url)));
      L.push(`**New document links (${newDocs.length})**`);
      L.push("");
      L.push(...list(newDocs, (d) => `- ${yr.test(d.text + d.url) ? `**[${cycle}]** ` : ""}[${mdLinkText(d.text)}](${d.url}) — on [${d.page.id}](${d.page.url})`));
      L.push("");
    }
    if (newMent.length) {
      L.push(`**New ${cycle} date mentions (${newMent.length})**`);
      L.push("");
      L.push(...list(newMent, (d) => `- “${md(d.text)}” — [${d.page.id}](${d.page.url})`));
      L.push("");
    }
    if (rolled.length) {
      L.push(`_Cycle changed to ${cycle}: mentions on ${rolled.map(([p]) => p.id).join(", ")} were re-baselined._`);
      L.push("");
    }
    if (base.length) {
      const seen = new Set();
      const ments = [];
      for (const [p, o] of base)
        for (const t of o.allMentions || []) {
          const k = mentionKey(t);
          if (!seen.has(k)) {
            seen.add(k);
            ments.push({ t, p });
          }
        }
      L.push(
        `**Baseline recorded** for ${base.length} page${base.length === 1 ? "" : "s"}: ` +
          base.map(([p, o]) => `[${p.id}](${p.url}) (${o.docCount} docs, ${o.mentionCount} ${cycle} mentions)`).join(", ") +
          ".",
      );
      L.push("");
      if (ments.length) {
        L.push(`${cycle} mentions currently on these pages${ments.length > 8 ? ` (first 8 of ${ments.length})` : ""}:`);
        L.push("");
        L.push(...list(ments, (m) => `- “${md(m.t)}” — ${m.p.id}`, 8).filter((x) => !x.startsWith("- …and")));
        L.push("");
      }
    }
    if (failed.length) {
      L.push(`**Pages that failed (${failed.length})**`);
      L.push("");
      L.push(
        ...failed.map(
          ([p, o]) =>
            `- [${p.id}](${p.url}) — ${md(o.error)}` +
            (o.failures > 1 ? ` (failing since ${o.failingSince}, ${o.failures} runs in a row${o.lastOk ? `; last ok ${o.lastOk}` : ""})` : ""),
        ),
      );
      L.push("");
    }
    if (notes.length) {
      L.push(...notes.map(([p, o]) => `- _${p.id}: ${md(o.note)}_`));
      L.push("");
    }
  }

  L.push(`## Data age`);
  L.push("");
  L.push(
    `From \`src/data/agency/<state>/draw-meta.json\` and \`harvest-meta.json\` compared with ${today}. ` +
      `Expectations are rules of thumb for scheduling refreshes (next-cycle dates appear ~${KEYDATE_LEAD_DAYS} days before last cycle's application dates recur; ` +
      `a season's harvest reports publish Jan–Jun of the following year; a year's draw results are out by August) — they are not shown to members.`,
  );
  L.push("");
  L.push(`| State | Key dates (cycle: count) | Draw data (latest year) | Harvest data (latest season) | Fees (license year: items) | Last reviewed |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const s of statesRun) {
    const r = ages.get(s).row;
    L.push(`| ${STATE_NAMES[s] || s} | ${r.keyDates} | ${r.draw} | ${r.harvest} | ${r.fees} | ${r.reviewed} |`);
  }
  L.push("");
  for (const s of statesRun) {
    const { flags: f, known } = ages.get(s);
    if (!f.length && !known.length) continue;
    L.push(`**${STATE_NAMES[s] || s}**`);
    L.push("");
    L.push(...f.map((x) => `- ${x}`));
    if (known.length) L.push(`- _Known gaps (watch.json knownGaps, not flagged): ${known.map(md).join("; ")}_`);
    L.push("");
  }
  if (statesRun.every((s) => !ages.get(s).flags.length)) {
    L.push("No data-age flags.");
    L.push("");
  }

  if (disabled.length) {
    L.push(`## Pages not checked`);
    L.push("");
    L.push(...disabled.map((p) => `- ${STATE_NAMES[p.state] || p.state} — [${p.id}](${p.url}): ${md(p.blocked || "disabled in watch.json")}`));
    L.push("");
  }
  L.push(`---`);
  L.push(`Generated by \`scripts/agency/freshness.mjs\` from \`scripts/agency/watch.json\` (${watch.checked ? `pages verified ${watch.checked}` : "watch list"}). How to refresh a state: \`scripts/agency/README.md\`.`);
  let text = L.join("\n") + "\n";
  if (text.length > MAX_REPORT_CHARS)
    text = text.slice(0, MAX_REPORT_CHARS - 200).replace(/\n[^\n]*$/, "") + `\n\n…report truncated at ${MAX_REPORT_CHARS} characters; the full report is in the workflow run's artifact.\n`;
  return { text, nDocs, nMent, nFail, nOk };
}

// ---------------------------------------------------------------- main

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv);
  const today = args.today || denverToday();
  const month = Number(today.slice(5, 7));
  const year = Number(today.slice(0, 4));
  const cycle = args.cycle || (month >= 8 ? year + 1 : year);
  const watch = JSON.parse(fs.readFileSync(args.watch, "utf8"));
  const allStates = Object.keys(watch.states);
  const statesRun = args.states ? allStates.filter((s) => args.states.includes(s)) : allStates;
  if (args.states) for (const s of args.states) if (!allStates.includes(s)) console.error(`freshness: unknown state ${s}`);

  const pagesByState = new Map();
  const toFetch = [];
  const disabled = [];
  const ids = new Set();
  for (const s of statesRun) {
    const pages = (watch.states[s].pages || []).map((p) => ({ ...p, state: s }));
    for (const p of pages) {
      if (ids.has(p.id)) console.error(`freshness: duplicate page id ${p.id}`);
      ids.add(p.id);
    }
    pagesByState.set(s, pages.filter((p) => p.enabled !== false));
    toFetch.push(...pages.filter((p) => p.enabled !== false));
    disabled.push(...pages.filter((p) => p.enabled === false));
  }

  const prevSnap = loadSnapshot(args.stateFile);
  const isBaseline = !prevSnap;
  const snap = prevSnap || { version: 1, created: today, pages: {} };
  process.stderr.write(`freshness: ${today}, cycle ${cycle}, ${toFetch.length} pages, ${isBaseline ? "baseline (no snapshot)" : `snapshot ${args.stateFile}`}\n`);

  const results = await runAll(toFetch, { timeoutMs: args.timeout, retries: args.retries }, cycle, today);
  const outcomes = new Map();
  for (const p of toFetch) outcomes.set(p.id, mergePage(snap, p, results.get(p.id) || { error: "not run" }, today, cycle));
  if (!args.states) {
    const live = new Set(allStates.flatMap((s) => (watch.states[s].pages || []).map((p) => p.id)));
    for (const id of Object.keys(snap.pages)) if (!live.has(id)) delete snap.pages[id];
  }
  snap.updated = today;
  snap.cycle = cycle;

  const ages = new Map(statesRun.map((s) => [s, dataAge(s, today, cycle, watch.states[s].knownGaps || [])]));
  const rep = buildReport({ today, cycle, isBaseline, stateFile: args.stateFile, watch, statesRun, pagesByState, outcomes, ages, disabled, startedAt });

  process.stdout.write(rep.text);
  if (args.reportFile) writeFileAtomic(args.reportFile, rep.text);
  if (args.save) writeFileAtomic(args.stateFile, JSON.stringify(snap, null, 1) + "\n");

  const changes = !isBaseline && rep.nDocs + rep.nMent > 0;
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `changes=${changes}`,
        `baseline=${isBaseline}`,
        `new_docs=${rep.nDocs}`,
        `new_mentions=${rep.nMent}`,
        `failed_pages=${rep.nFail}`,
        `checked_pages=${outcomes.size}`,
        `cycle=${cycle}`,
        "",
      ].join("\n"),
    );
  }
  process.stderr.write(
    `freshness: ${changes ? "CHANGES" : isBaseline ? "baseline recorded" : "no changes"} — ${rep.nDocs} new docs, ${rep.nMent} new mentions, ${rep.nFail} failed; report ${args.reportFile}\n`,
  );
}

main()
  .catch((e) => {
    // Never fail the job: write what we can so the workflow still reports.
    const msg = `# Agency data freshness — script error\n\n\`\`\`\n${e?.stack || e}\n\`\`\`\n`;
    process.stdout.write(msg);
    try {
      const i = process.argv.indexOf("--report-file");
      writeFileAtomic(i > 0 ? process.argv[i + 1] : ".agency-freshness/report.md", msg);
    } catch {
      /* ignore */
    }
    if (process.env.GITHUB_OUTPUT) {
      try {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, "changes=false\nbaseline=false\nscript_error=true\n");
      } catch {
        /* ignore */
      }
    }
  })
  .finally(() => {
    process.exitCode = 0;
  });
