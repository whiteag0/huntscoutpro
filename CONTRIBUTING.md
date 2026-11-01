# Contributing

## What CI checks

`.github/workflows/ci.yml` runs on every pull request and every push to `main`, on Node 22
and Node 24. A newer push to the same branch cancels the run already in progress. A pull
request should not be merged until both jobs are green.

| Step | Command | Fails when |
|---|---|---|
| Install | `npm ci` | `package-lock.json` does not match `package.json` |
| Agency data | `node scripts/agency/validate.mjs <state>` for every folder in `src/data/agency/` | Any state breaks the data contract in `scripts/agency/README.md`. Warnings do not fail |
| Types | `npx tsc --noEmit -p .` | Any type error |
| Lint | `npx eslint src` | Any ESLint error. Warnings do not fail |
| Tests | `npm test` | Any test in `src/lib/*.test.ts` or `tests/shortlist-core.test.ts` fails |
| Build | `npm run build` | The production build fails. It runs `scripts/agency/build-index.mjs` first |
| Generated index | `git diff` on `src/data/agency/*.generated.*` | Never fails. It warns when the committed copy is older than what the build produced. Fix it with `node scripts/agency/build-index.mjs` and commit the result |

CI uses no secrets. The build gets placeholder values for `AUTH_SECRET`, `AUTH_URL` and the
Google client ID and secret. Stripe, Resend and `CRON_SECRET` stay unset.

Node 20 is not in the matrix. It reached end of life in April 2026, and `npm test` uses
`--experimental-strip-types`, which needs Node 22.6 or later.

### Run the same checks locally

```sh
npm run validate:data   # every state; exits 1 if any state has an error
npx tsc --noEmit -p .
npx eslint src
npm test
npm run build
```

## Production site health

`.github/workflows/site-health.yml` checks https://www.huntscoutpro.com every day at 13:30
UTC. To run it now, go to **Actions → Site health → Run workflow**. It expects:

- `/`, `/states`, `/states/colorado`, `/states/idaho`, `/shortlist`, `/calendar` and `/pricing`
  to return 200 with "HuntScout" in the page
- `/api/agency/colorado/elk?kind=draw` to return 200 with the signed-out preview JSON
  (`preview: true` and at least one row)
- `/api/cron/deadline-reminders` without credentials to return 401. A 500 means
  `CRON_SECRET` is missing in Vercel
- `POST /api/webhook` with a bad Stripe signature to return 400. A 503 means the Stripe
  keys are missing in Vercel

When any check fails, the run goes red. It also opens an issue titled **"Site health check
failing"** (label `site-health`), or comments on it if one is already open. The next run
where every check passes closes the issue. The full results table is in each run's job summary.
