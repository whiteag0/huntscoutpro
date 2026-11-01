# Google Ads: "HuntScout Pro – Western Draw Research"

This folder holds one Search campaign, ready to import. It arrives **Paused**, so nothing spends until you turn it on.

| File | What it is |
| --- | --- |
| `campaign.csv` | The import file for Google Ads Editor. It contains the campaign settings, US targeting, 14 ad groups, 223 keywords, 85 campaign negatives, 14 responsive search ads, 6 sitelinks, 8 callouts and 2 structured snippets. |
| `negatives.txt` | The same campaign negatives in paste-ready form, in case Editor rejects those rows. |
| `campaign-data.mjs` | The source for everything above. Make changes here, never in the CSV. |
| `build.mjs` | Regenerates `campaign.csv` and `negatives.txt` from `campaign-data.mjs`. |
| `validate.mjs` | Checks the CSV: every length limit, the required columns, banned words, per-state honesty rules, and that every landing page loads on the live site. |

```sh
node marketing/google-ads/build.mjs      # after editing campaign-data.mjs
node marketing/google-ads/validate.mjs   # must print "OK: no errors."
```

---

## What Adam does (about 15 minutes, once)

1. **Create the account.** Sign in to the manager account **478-886-4376** and go to **Accounts → + → Create new account**. Use these settings:
   - Name: `HuntScout Pro`
   - Country: United States
   - Time zone: **(GMT-07:00) Mountain Time**
   - Currency: **USD**

   Time zone and currency can never be changed later, so check them before you save.
2. **Add billing.** In the new account, open **Billing → Setup**, add the card, and accept the terms.
3. **Import the campaign.** In **Google Ads Editor**:
   - Click **Accounts → Add** (sign in), pick *HuntScout Pro* and download it.
   - Go to **Account → Import → From file…** and choose `marketing/google-ads/campaign.csv`.
   - Click **Keep all proposed changes → Finish and review changes**, then **Post** (top right).

   If you'd rather not install Editor, use the web UI instead: **Tools → Bulk actions → Uploads → + → Upload file**, choose `campaign.csv`, click **Preview**, then **Apply**. Editor is the path the file was built for.
4. **Create the Purchase conversion.** Go to **Goals → Conversions → Summary → + Create conversion action → Website**. Enter `huntscoutpro.com`, click **Scan**, then choose **+ Add a conversion action manually** and set:
   - Goal and action optimization: **Purchase**
   - Conversion name: `Purchase`
   - Value: **Use the same value for each conversion**, `14.99` USD
   - Count: **One**
   - Click-through conversion window: **30 days**

   Click **Done → Save and continue**. On the tag screen, choose **Use Google tag manually** (or **Set up the tag yourself**). You'll see a snippet like `send_to: 'AW-123456789/AbCdEfGhIjK12'`. Copy two values from it:
   - The part before the slash is the **conversion ID**: `AW-123456789`
   - The part after it is the **label**: `AbCdEfGhIjK12`
5. **Add the two IDs to Vercel.** Go to the huntscout-pro project → **Settings → Environment Variables** (Production), add the two variables below, then **Redeploy**:
   ```
   NEXT_PUBLIC_GOOGLE_ADS_ID=AW-123456789
   NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL=AbCdEfGhIjK12
   ```
   The site code that fires the tag is being built separately (not in this folder). Until that code is deployed, these variables do nothing and Google Ads will show 0 purchases.
6. **Turn it on.** Go to **Campaigns**, select the campaign, open **Status** and choose **Enable**. A good time is late November or early December, before the Dec–Apr 2027 application windows.

That is everything. You don't need to change any keyword, ad, asset or bid setting.

### If Editor complains on import

- **The `Campaign Negative Phrase/Exact` rows are flagged.** Some Editor versions use other names for campaign negatives. Skip those rows, then add the list by hand: in the Ads UI, go to **Campaign → Keywords → Negative keywords → +** and paste `negatives.txt`. The `#` lines are comments, so leave them out.
- **Editor asks for an *EU political ads* declaration on Post.** Choose **"No, this campaign doesn't have EU political ads"**. The CSV leaves this column out because Editor's documented column list doesn't include it.
- **An unknown column warning appears.** Choose **Ignore**. Every column here comes from Editor's own column list ([support.google.com/google-ads/editor/answer/57747](https://support.google.com/google-ads/editor/answer/57747)).

---

## The campaign

| Setting | Value | Why |
| --- | --- | --- |
| Type / networks | Search, **Google search only** | No Search Partners and no Display. Partner and display traffic is cheap but rarely buys a $14.99 research tool. |
| Status | **Paused** | Nothing spends until you enable it (step 6). |
| Budget | **$15.00/day** | Google can spend up to 2× on a single day, but no more than 30.4 × $15 ≈ $456 in a month. |
| Bidding | **Maximize clicks, max CPC bid limit $1.50** | See below. |
| Locations | United States (2840) | Nonresident applicants for western tags live all over the country. |
| Language | English | |
| Ad schedule | All 7 days, 00:00–24:00 | Hunters research nights and weekends. Having a schedule in place lets you see results by hour and day, and cut times later. |
| Tracking | Final URL suffix `utm_source=google&utm_medium=cpc&utm_campaign=western-draw-research&utm_content={adgroupid}&utm_term={keyword}` | Vercel Analytics can then split visits by ad group and keyword. Google's auto-tagging (gclid) stays on as usual. |

### Why Maximize clicks with a $1.50 cap at first

A new account has no conversion history, so Maximize conversions and Target CPA have nothing to learn from. Maximize clicks gets traffic and data right away. Without a cap, though, it will sometimes pay a lot for a single click on a contested term like "elk draw odds", where bigger hunting apps also bid. The $1.50 limit stops that and still lets the budget buy roughly 10 or more clicks a day.

Be honest about the economics: **at $14.99 a sale, a $1.50 click only pays for itself if more than 1 in 10 visitors buys.** Few sites manage that, so treat the first 2–3 weeks as paid research, not profit. Once about 300 clicks have come in:

- **Break-even CPC = $14.99 × your conversion rate.** For example, a 4% conversion rate gives $0.60. Lower the cap toward that number.
- Pause ad groups that get clicks but no purchases. Raise budget on the states that sell.
- Once the account has about 30 purchases in 30 days, which needs the step 5 tag to be live, switch to **Maximize conversions** with a target CPA below $14.99.

There's no CPC data for these exact terms yet. **Keyword Planner** in the new account will show estimates once it exists.

### Ad groups and landing pages

| Ad group | Final URL | Keywords |
| --- | --- | --- |
| Colorado, Wyoming, Montana, Idaho, Utah, Arizona, Nevada, New Mexico, Oregon, Washington, Kansas, South Dakota | `https://www.huntscoutpro.com/states/<slug>` | 15–18 each |
| Draw odds & points (generic) | `https://www.huntscoutpro.com/shortlist` | 17 |
| Application deadlines 2027 | `https://www.huntscoutpro.com/calendar` | 18 |

**Why the generic group lands on `/shortlist` and not `/`.** Someone searching "elk draw odds by points" or "where can I draw elk" hasn't picked a state yet. `/shortlist` ("Where can I draw?") answers that question across all 12 states. Logged-out visitors see the explainer, a blurred example of last year's results (elk, applying from Texas, 3 points) and the Pro call to action. The homepage describes the product in general, so it would add a click before the searcher sees anything relevant. The generic group also carries the 12 state names as ad-group negatives. That way "colorado elk draw odds" is always answered by the Colorado ad and the Colorado page.

**Why deadline searches land on `/calendar`.** The calendar is free and links every date to its agency source. Where an agency has published 2027 dates, it shows them; elsewhere it shows the 2026 date and says so. As of 2026-10-31 only Arizona, Idaho, Nevada, Utah and Washington have any 2027 dates, so no headline says "2027 calendar"; the description says "2027 dates appear as each agency publishes them."

**Keywords** are phrase match, plus one exact-match version of each group's main query. They're built around the words each agency and its applicants actually use:

| State | Terms used |
| --- | --- |
| Colorado (CPW) | preference points, draw recap |
| Wyoming (WGFD) | hunt area, nonresident points |
| Montana (FWP) | bonus points, drawing statistics, nonresident combo |
| Idaho (IDFG) | controlled hunts, random draw |
| Utah (DWR) | bonus points, limited-entry |
| Arizona (AZGFD) | bonus points, Coues deer |
| Nevada (NDOW) | bonus points, tag draw |
| New Mexico | random draw, GMU |
| Oregon (ODFW) | controlled hunts, preference points |
| Washington (WDFW) | special permits |
| Kansas (KDWP) | nonresident deer preference points |
| South Dakota (GFP) | West River and Black Hills deer |

### Ads (one responsive search ad per group)

Every ad has 15 headlines (30 characters or fewer) and 4 descriptions (90 or fewer). Each claim is true of the live site today:

- The numbers come from official state agency draw results and harvest reports, and every table links to its source.
- **$14.99 one-time for 2 years of Pro**, no subscription and no auto-renewal (matches `/pricing`).
- **30-day money-back guarantee** (matches the `/pricing` FAQ).
- They are past results, not forecasts.
- No ad offers a "free preview". Logged-out visitors get a few table and shortlist rows, but they are blurred behind the paywall and can't be read, so the validator bans the word. The free thing that is real is the application calendar.

Copy is tailored to what each state's data actually has:

| State | Data limit | Ad copy rule |
| --- | --- | --- |
| Idaho, New Mexico | Draws are random | Never mention points |
| Washington | No resident/nonresident split and no point-level tables | Claims neither |
| Kansas | No elk draw data | Leads with nonresident deer and minimum preference points |
| Nevada | Latest draw year is 2025 | Copy never names a year |

**Pinning.** Each state ad pins exactly two headlines to position 1, for example "Colorado Draw Results" and "Colorado Elk Draw Odds". Google rotates between the two, so every ad names its state. Nothing else is pinned, and the two cross-state groups have no pins. Ad Strength may show "Good" rather than "Excellent" because of the pins. That's an expected trade for relevance.

### Negatives (campaign level)

- **Competitor HuntScout (huntscout.app).** A different company uses the name "HuntScout" for an app. The campaign blocks `"huntscout app"`, `"huntscout.app"`, `"hunt scout app"`, `"huntscout login"`, `"huntscout download"`, `[huntscout]` and `[hunt scout]` so you don't pay for people looking for them. Searches for **"huntscout pro"** are *not* blocked; the validator checks this. There's no brand ad group, so brand traffic comes in through SEO.
- **Other hunting apps and brands:** onX, goHunt, HuntWise, BaseMap, Spartan Forge, HuntStand, TopRut, Eastmans, Huntin' Fool, WTA.
- **Wrong product:** maps, GPS, downloads/APKs, guns, ammo, "for sale" and gear.
- **Jobs and courses:** jobs, careers, game warden, hunter education.
- **Other kinds of "draw" or "points":** lottery, lotto, Powerball, NFL draft, fantasy, credit card and airline points, Elks Lodge, team names.
- **Off-topic outdoors:** fishing, camping, state parks, taxidermy, recipes.
- **Deliberately not negative:** "rifle" (as in "second rifle elk draw odds") and "outfitter"/"guided" (New Mexico runs an outfitter-guided draw pool).

### Assets

- **Sitelinks:**

  | Sitelink | Page |
  | --- | --- |
  | Where Can I Draw? | `/shortlist` |
  | Application Calendar | `/calendar` |
  | Pricing | `/pricing` |
  | All 12 States | `/states` |
  | Point Creep Trends | `/trends` |
  | Compare Hunts | `/compare` |

  Each has two description lines.
- **Callouts:**
  - Official Agency Sources
  - Source Link on Each Table
  - $14.99 One-Time
  - 2 Years of Pro Access
  - No Auto-Renewal
  - 30-Day Money-Back
  - 12 Western States
  - Free Application Calendar
- **Structured snippets.** Google only accepts fixed headers, and "States" isn't one of them. Two snippets are used instead:
  - **Destinations:** the 12 states. Oregon & Washington and Kansas & South Dakota share a value because the limit is 10 values.
  - **Types:** Elk, Mule Deer, Whitetail, Pronghorn, Moose, Bighorn Sheep, Mountain Goat, Black Bear, Turkey.

## What `validate.mjs` checks

Run it with no flags for the full check. Add `--offline` to skip the network, `--file x.csv` to check another file, or `--site http://localhost:3300` to fetch pages from a local build.

**File format**
- Required columns are present and every row has the same cell count.
- The CSV has a UTF-8 BOM (so the en dash in the name survives).

**Campaign settings**
- Exactly one campaign, set to Search, Paused, $15.00, Maximize clicks, $1.50 cap, Google search, en, US 2840.
- The ad schedule covers 7 days, 00:00–24:00.

**Ad groups and keywords**
- All 14 ad groups exist, each with 10–20 phrase/exact keywords.
- No duplicate keywords.
- Each state keyword names its state or agency and never another state.
- No keyword is blocked by a campaign or ad-group negative.
- The required negatives are present, and no negative blocks "huntscout pro".

**Ads**
- Each ad has 15 headlines of 30 characters or fewer and 4 descriptions of 90 or fewer, with no duplicates.
- Paths are 15 characters or fewer.
- Pins: state ads pin exactly 2 headlines to position 1, both starting with the state name. Cross-state ads have no pins.
- Google editorial rules: no "!" in headlines, no repeated punctuation or symbols, all-caps only for agency acronyms and state abbreviations, ASCII only.

**Honest copy**
- Banned words: predict, preview, guaranteed, "guarantee" unless it reads "money-back guarantee", best, win, #1, AI/modeled, subscription wording, easiest, urgency/sale wording, and "official" unless followed by "agency".
- Facts: no state we don't cover, any state count must equal 12, the only price is $14.99, the only access length is 2 years, the only refund window is 30 days.
- Every ad states the price, the refund and no auto-renewal.
- No headline, sitelink or callout promises 2027 dates or a 2027 calendar.
- Idaho and New Mexico never mention points. Washington never claims point-level or nonresident data. Kansas never mentions elk.

**Assets**
- Sitelinks: text of 25 characters or fewer, descriptions of 35 or fewer, links to `/shortlist`, `/calendar`, `/pricing` and `/states`.
- Callouts are 25 characters or fewer.
- Snippet headers are on Google's allowed list, with 3–10 values of 25 characters or fewer, and the Destinations snippet names all 12 states.

**Live site (read-only GETs)**
- Every landing and sitelink URL returns 200 on www.huntscoutpro.com, isn't a "Coming soon" page, and each state page's title is "<State> Draw Results…".
- `/states` links exactly the 12 states. If more states go live, it warns you to add ad groups and update the "12" copy.
- `/pricing` still says $14.99, 2 years, no auto-renewal, the 30-day money-back guarantee and "12 western draw states".
- `/calendar` shows 2027 and `/shortlist` shows its explainer.

Run the validator again before any copy change goes live, and whenever a state is added to the site.
