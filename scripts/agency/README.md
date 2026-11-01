# Agency data (`scripts/agency/`)

HuntScout Pro shows **official** draw results, key dates, fees and harvest statistics
for 12 states. Everything under `src/data/agency/<state>/` was downloaded from the
state wildlife agency and parsed by the scripts in this folder. Nothing is
estimated, modeled or interpolated. A number either comes straight from an agency
document or is simple arithmetic on one, and then it is labeled as computed.

| Path | What it is |
|---|---|
| `<state>/` | Per-state downloaders, parsers, meta writers and spot-checkers (Python 3) |
| `validate.mjs` | Checks one state's files against the data contract below. Exits 1 on errors |
| `build-index.mjs` | Regenerates `src/data/agency/index.generated.ts`, `live.generated.ts`, `stats.generated.json` and the gzipped tables in `.agency-gz/`. Runs as `prebuild` |
| `watch.json` | The agency pages the freshness monitor watches (per state, with roles) |
| `freshness.mjs` | The freshness monitor: tells us when an agency has published something new |

States: colorado, wyoming, montana, idaho, utah, arizona, nevada, new-mexico,
oregon, washington, kansas, south-dakota.

---

## Data contract

The TypeScript types live in `src/data/agency/schema.ts`. `validate.mjs` enforces them.

```
src/data/agency/<state>/
  draw-meta.json        DrawMeta: overview, species[] (draw system, keyDates[]), fees[], seasons[], coverage[], sources[]
  harvest-meta.json     HarvestMeta: unitNames, coverage[], sources[]
  draw/<species>.json   DrawRecord[]    (one row per year + hunt code + choice)
  harvest/<species>.json HarvestRecord[] (one row per year + unit/hunt + method/sex/residency)
```

Species keys: `elk, mule-deer, whitetail, pronghorn, moose, bear, sheep, goat, lion, turkey`.

Rules every state follows:

- **Every row has a `sourceId`** that resolves to a `SourceRef` in that state's meta file.
  Draw/meta sources start with `d-`, harvest sources with `h-`. A source has `title`,
  `publisher`, `url` (the document itself), optional `pageUrl` (the index page that lists it),
  `dataYear` and `retrieved` (YYYY-MM-DD).
- **Missing means `null` or left out.** Never 0, never a guess. If all of hunters, harvest and
  success are null, the row should not exist.
- **Computed values are flagged.** `successPct` is the agency's number. Where the agency does not
  publish it, it is harvest/hunters and `successComputed: true` is set. Draw `oddsPct` works
  the same way with `oddsComputed: true`. `byPoints` only appears when the agency publishes
  applicants and drawn counts by point level.
- **Units and hunt codes are exactly as the agency writes them** (`"061"`, `"16A"`, `"Statewide"`).
- **Key dates** carry `cycle` (the license/draw year they belong to, e.g. 2027 for the 2027 draw)
  and `status`: `confirmed` (published for that cycle) or `tentative` (published but marked
  tentative by the agency). Use `date` for a single day, or `start` + `end` for a window.
- **Fees** carry `licenseYear`, `residency` and `amountUsd` as printed.
- **`coverage[]`** lists the years present per species. Use `notes` to explain gaps
  (for example "season closed 2023–2025"). The freshness report reads coverage to
  work out how old the data is.
- **`lastReviewed`** (draw-meta) is the date the facts were last checked against the agency.
- **Files stay under 6 MB.** Split or trim larger ones.
- Row years may not be later than the current year in Colorado (`validate.mjs`, `MAX_YEAR`).

---

## Refreshing a state

Use this when the freshness issue reports a new document. Examples: a 2027 draw recap,
a new harvest report, or 2027 application dates.

1. **Find the new document.** The issue links the document and the agency page it
   appeared on. Open it and confirm it is the official publication, not a news story
   that only summarizes it, and note whether the agency marks it preliminary.

2. **Set up the tools** (once). Use Python 3 in a virtualenv with `requests`,
   `pdfplumber`, `pdfminer.six`, `openpyxl`, `beautifulsoup4` and, for a few states,
   `pandas`, `xlrd` and `tabula-py`. You also need poppler's `pdftotext`
   (`brew install poppler`). Downloaded files are untrusted data: keep the raw folder
   **outside** the repo and run the scripts with `python -I`.

3. **Re-run the state's scripts in order.** The docstring at the top of each script gives
   its exact usage line and the inputs it expects.

   | Step | Draw side | Harvest side |
   |---|---|---|
   | download | `draw_download.py` / `draw_fetch.py` | `harvest_download.py` / `harvest_fetch.py` |
   | parse | `draw_parse.py` / `draw_build.py` (+ state helpers such as `draw_pamphlet.py`, `draw_pbi.py`) | `harvest_parse.py` / `harvest_build.py` (+ per-species helpers) |
   | meta | `draw_meta.py` (writes draw-meta.json: overview, keyDates, fees, coverage, sources) | `harvest_meta.py` (Wyoming, South Dakota); elsewhere the parse/build step writes harvest-meta.json |
   | check | `draw_spotcheck.py`, `draw_verify.py` or `draw_crosscheck.py` | `harvest_spotcheck.py`, `harvest_verify.py` or `harvest_check.py` |

   The scripts hard-code their document lists: years, media IDs, document IDs, S3 keys.
   For a new year, add the new document to that list, with its URL, page URL and
   retrieved date, before running. Key dates and fees are written in `draw_meta.py`
   from the agency text, one `sourceId` per fact. When an agency publishes the next
   cycle, add the new cycle's dates there. Keep the old cycle's dates until they pass,
   and set `lastReviewed` to today.

4. **Validate:** `node scripts/agency/validate.mjs <state>`. Fix every error. Read the
   warnings; most need a row `note` that explains the agency's quirk.

5. **Rebuild the index:** `node scripts/agency/build-index.mjs`. Commit the regenerated
   `index.generated.ts`, `live.generated.ts` and `stats.generated.json`. `.agency-gz/`
   is gitignored and rebuilt on every `npm run build`.

6. **Spot-check against the PDF.** Run the state's spot-check script. It compares random
   rows with the source text. Then open the PDF yourself and compare at least five rows by
   hand: the largest and smallest units, one with nulls, one computed value, and every
   new key date and fee. If a number does not match, fix the parser. Never hand-edit
   the JSON.

7. **Check the site:** `npx tsc --noEmit -p .`, `npx eslint src`, `npm run build`. Then
   `npx next start` and look at the state's explorer, the new year in Trends and the
   Calendar.

8. **Open a PR** from a branch such as `data/<state>-<yyyy-mm>`. List the new documents,
   what changed (years and species added, dates and fees updated) and the spot-check
   results. After it merges, comment on the freshness issue. Close the issue when it has
   no open items.

---

## Freshness monitor

`freshness.mjs` tells us when to refresh. It uses plain Node 20+ and needs no npm packages.

```sh
node scripts/agency/freshness.mjs                        # all states
node scripts/agency/freshness.mjs --states utah,nevada   # some states
  --state-file .agency-freshness/snapshot.json   # snapshot to compare against (default)
  --report-file .agency-freshness/report.md      # markdown report (default; also printed)
  --today 2027-02-01 --cycle 2027                # override the date or cycle (testing)
  --timeout 30000 --retries 2 --no-save
```

`.agency-freshness/` is gitignored. The script always exits 0.

**What it does.** For every page in `watch.json` it fetches the page with a browser
User-Agent, a 30 s timeout and retries on 429/5xx with backoff. When Node gets HTTP 403
(an Akamai TLS filter), it tries curl once with browser headers. From each page it extracts:

1. **Document links:** pdf/xlsx/csv/zip/docx links plus the agencies' document servers:
   WGFD `/media/<id>/download`, KDWP `showpublisheddocument/<id>/<version>`, FWP
   `getRepositoryFile?objectID=`, CPW `cpw.widen.net/s/…`, NMDOW `?wpdmdl=`, WDFW
   `/publications/<n>` and published Google Docs. A page can add patterns with `linkPatterns`.
2. **Next-cycle mentions:** text lines (outside `<nav>` and `<footer>`) that contain the
   cycle year together with a date or a word like application, deadline, draw, results, odds,
   points, quota, harvest, report, fee, regulations, opens or closes. It also records a year
   option on search forms ("Year selector lists 2027").

It compares both with the snapshot and reports what is **new**. Items that disappear are
not reported. They stay in the snapshot for 400 days, so a rotating banner does not come
back as "new". The cycle is next year from August on, otherwise this year. When the cycle
rolls over, mentions are re-baselined.

**Pages that fail** are listed with the reason: HTTP status, Cloudflare/Akamai challenge,
maintenance page, soft 404 (HTTP 200 "Page not found"), redirect to the site home page
(South Dakota) or timeout. The report also shows how many runs in a row the page has
failed. A failed page keeps its previous snapshot, so nothing is lost while it is down.

**Data age** comes from the meta files and does not need the network:

- *Key dates:* for each species whose newest key dates are from an older cycle, it takes
  last cycle's first application/draw date and moves it forward one cycle. If today is
  within 45 days of that date, the agency has most likely posted the new dates and the
  species is flagged. It also notes states where every key date in the data has passed.
- *Draw data:* a year's draw is expected once our key dates say that year's results were
  posted, or from August on.
- *Harvest data:* a season's reports usually publish January–June of the next year, so
  from July on, last season is expected.
- *Fees:* flagged when fees are still last year's but next-cycle key dates are already in
  the data.
- `knownGaps` in `watch.json` lists coverage that is old on purpose (discontinued hunts,
  for example). Those are listed without a flag.

These rules of thumb help schedule refreshes. The site never shows them to members.

**Baseline.** If there is no snapshot, everything on the pages is recorded and nothing
is reported as new. The report says "Baseline run" and shows the next-cycle mentions
already there. A page that succeeds for the first time, or whose URL changed in
`watch.json`, is baselined the same way.

### The workflow

`.github/workflows/agency-freshness.yml` runs every Monday at 15:00 UTC and on demand
(**Actions → Agency data freshness → Run workflow**). It:

1. Restores the snapshot with `actions/cache`: key `agency-freshness-<run_id>`, restore-keys
   `agency-freshness-`, so it gets the newest one. GitHub evicts caches that go 7 days
   without a read, which a weekly schedule can hit. In that case the workflow downloads the
   `agency-freshness-snapshot` artifact from the last successful run instead. That needs
   `actions: read`.
2. Runs `freshness.mjs` and writes the report to the job summary.
3. If there are new document links or new mentions, it creates the `agency-data` label if
   missing. It then comments on the open issue titled **"Agency data updates available"**,
   or opens that issue if none is open. It uses `GITHUB_TOKEN` (`contents: read`,
   `issues: write`). Baseline runs and runs with only failures or data-age flags do not
   touch the issue; they appear in the job summary.
4. Saves the new snapshot to the cache, but only when the issue step succeeded or had
   nothing to do. If `gh` fails, the old snapshot stays current and next week's run
   reports the same items again. The snapshot and report are also uploaded as an artifact
   (kept 90 days); the fallback in step 1 only reads artifacts from successful runs.

The first run is the baseline. To start over, delete the `agency-freshness-*` caches
(**Actions → Caches**) and the artifacts, then run the workflow.

### Editing `watch.json`

```jsonc
{
  "id": "wy-draw-odds",                 // unique; snapshot key
  "roles": ["draw-results"],            // key-dates | draw-results | harvest | fees | regulations
  "url": "https://wgfd.wyo.gov/licenses-applications/draw-results-odds",
  "seed": "draw-meta pageUrl",          // where the URL came from
  "linkPatterns": ["/game-harvest/\\d{4}/"], // optional extra document-link regexes
  "excludePatterns": ["fishing"],        // optional
  "enabled": false, "blocked": "why"     // optional: list but do not fetch
}
```

There are two special kinds. `"kind": "s3-list"` lists a public S3 bucket (`prefixes` with
`{year}`, `{nextYear}`, `{prevYear}` placeholders, plus an `include` regex on file names).
`"kind": "wp-media"` reads a WordPress media API (`pages` of 100 uploads, plus
`include`/`exclude` regexes on titles).

Sites that block or trip up scripts (as of 2026-10-31):

| State | Problem | What the monitor does |
|---|---|---|
| Arizona | Every azgfd.com page sends a Cloudflare challenge (HTTP 403) | Pages are listed but disabled. The public upload bucket `azgfd-portal-wordpress-pantheon` is listed for this year and next |
| Kansas | Akamai has answered scripts with 403 before (it worked on 2026-10-31) | Retries once with curl and browser headers |
| Idaho | idfg.idaho.gov answered 503 "website is undergoing maintenance" (Retry-After 5 h). Only the hunt planner worked | Reported as failed until it is back |
| Nevada | Missing pages return HTTP 200 "Page Not Found"; the publications list is JavaScript | Soft-404 check. The WordPress media API is watched instead |
| South Dakota | Unknown paths redirect to the home page | Redirect-to-home check |
| Washington | Draw result summaries are embedded Power BI reports | Only the page text is tracked |

### Limitations

- The monitor finds *links and dates*. It does not download or diff PDFs. An agency that
  replaces a file at the same URL is only caught when the link text or URL changes, or a
  new next-cycle date appears on the page. KDWP's links carry a version number that changes
  when a file is replaced, so those are caught. KDWP's older draw-stats PDFs were
  overwritten in place (see `kansas/draw_download.py`).
- JavaScript-rendered tools (Idaho hunt planner, Utah draw odds app, Montana and South
  Dakota draw statistics search forms, WDFW Power BI) only show changes to their static
  text or year options.
- Site redesigns show up as a burst of "new" links, or as failures when URLs move. Update
  `watch.json` and let the moved page re-baseline.
- Data-age expectations are rules of thumb. Check the agency page before acting on a flag.
