# Analytics

What the site measures, where to see it, and how to turn pieces on or off.
Code: `src/lib/analytics.ts` (helpers), `src/components/analytics/` (loader, consent banner, privacy-page settings), `src/app/api/geo/route.ts`.

## Where to see the data

| Tool | What it shows | Where |
| --- | --- | --- |
| Vercel Web Analytics | Page views, visitors, referrers, countries | Vercel project → **Analytics** tab. **Must be enabled once in the dashboard (one click: Analytics → Enable).** Until then the script loads but nothing is recorded. |
| Vercel Speed Insights | Real-user page speed (Core Web Vitals) | Vercel project → **Speed Insights** tab (enable it there too if it shows a button). |
| Microsoft Clarity | Session replays, heatmaps, funnel events, custom tags | https://clarity.microsoft.com/projects/view/z6liofa1yc/dashboard |
| Google Ads | Purchase conversions | Google Ads → Goals → Conversions (only once the env vars below are set) |
| Meta | PageView, InitiateCheckout, Purchase | Meta Events Manager (only once the env var below is set) |

In Clarity, filter recordings by **Custom events** (event names below) or **Custom tags** (`page_type`, `state`, `species`, `is_pro`, `signed_in`, plus each event's properties such as `tab`, `method`, `filter`).

## Events (snake_case)

| Event | Fired when | Properties |
| --- | --- | --- |
| `state_view` | A state page opens | `state` |
| `species_select` | A species tab is picked on a state page | `state`, `species` |
| `data_tab` | Draw results / Harvest tab clicked | `tab` (`draw` or `harvest`), `state`, `species` |
| `compare_open` | /compare opens | `state`, `species`, `hunts` |
| `trends_view` | /trends opens or changes state/species | `state`, `species` |
| `unit_view` | A unit page opens | `state`, `unit`, `species` |
| `shortlist_run` | "Where can I draw" results load | `species`, `home_state`, `stretch` |
| `checkout_start` | Upgrade/checkout button clicked | `signed_in` (Meta: `InitiateCheckout`) |
| `purchase` | /success after the server confirms the Stripe session was paid; once per session id | Google Ads conversion: value 14.99 USD, `transaction_id` = Stripe session id. Meta: `Purchase`, `eventID` = session id |
| `sign_in_click` | Google sign-in or admin sign-in pressed | `method`, `from` |
| `request_state_submit` | Request-a-state form sent successfully | `state`, `species_count`, `notify`, `signed_in` |
| `welcome_submit` | Hunting-profile form saved or skipped | `action` (`submit`, `update`, `skip`), `states`, `species_count` |
| `reminders_toggle` | Deadline reminders switched on/off | `enabled` |
| `calendar_filter` | Calendar filters changed | `filter`, `value` |

No event carries a name, email, phone number or free text: `sanitizeProps` drops keys like `email`/`name`/`phone`/`notes` and any value containing `@`. Signed-in visitors are linked in Clarity by `clarity('identify', sha256(lowercased email))`, computed in the browser.

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | `z6liofa1yc` | Clarity project. Set to `off` to disable Clarity. |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | unset | e.g. `AW-123456789`. When set, gtag.js loads (subject to consent/GPC). |
| `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` | unset | Conversion label from the Google Ads "Purchase" conversion action; send_to = `ID/LABEL`. Without it no purchase conversion is sent. |
| `NEXT_PUBLIC_META_PIXEL_ID` | unset | Digits only. When set, the Meta Pixel loads (subject to consent/GPC). |

`NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.

## Privacy rules built in

- **Global Privacy Control** (`navigator.globalPrivacyControl`): Google Ads tag and Meta Pixel never load; Clarity is told `ad_Storage: denied`.
- **EEA, UK, Switzerland**: `/api/geo` returns only `{ country }` from Vercel's `x-vercel-ip-country` header (no cache). Those visitors see an Accept / Decline banner; until Accept, Clarity gets `consentv2` denied (no cookies), no ad tags load and no `identify` is sent. The choice is stored in `localStorage` (`hs_consent`).
- Everyone else: no banner; anyone can opt out on /privacy#analytics.
- Session recordings mask: account name/email/profile answers, the request-a-state form, /welcome free text, the admin sign-in form and the header account name (`data-clarity-mask="true"`). Keep Clarity's masking setting at **Balanced** (default) or **Strict** so all other form inputs stay masked too.
- Pages stay static: the country lookup happens in the browser, never via `headers()` in the layout.
