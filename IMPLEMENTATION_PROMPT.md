# HuntScout Pro — Full Production Website Implementation

## Vision
Transform the Colorado-only hunt tag research tool into **HuntScout Pro**, a nationwide subscription-based hunting intelligence platform covering all 50 states, all major big game species + turkey. Professional, modern UI with a marketing-first landing page and powerful research tools behind a subscription wall.

---

## 1. BRAND & IDENTITY

- **Name**: HuntScout Pro
- **Tagline**: "Know Before You Draw"
- **Color Palette**:
  - Primary: Deep forest green (#1a3a1a → #2d5016 gradient range)
  - Accent: Burnt amber/orange (#c4651a)
  - Gold: Premium accent (#d4a537)
  - Dark: Rich charcoal (#1c1917)
  - Light: Warm cream (#faf7f4)
  - Card surfaces: White with subtle warm shadow
- **Typography**: Inter for headings (sharp, modern), system sans for body
- **Design Language**: Clean, data-dense but breathable. Think Bloomberg Terminal meets REI. Dark header/hero areas, light content areas. Generous whitespace, strong data visualization.

---

## 2. SITE ARCHITECTURE

### Public Pages (No Auth Required)
1. **Landing Page** (`/`) — Marketing hero, feature showcase, state map, pricing, testimonials, FAQ, CTA
2. **Pricing Page** (`/pricing`) — Plan details, comparison table, FAQ, checkout CTA
3. **State Browser** (`/states`) — Interactive grid/map of all 50 states with species counts

### App Pages (Subscription Required — show preview with blur/gate)
4. **State Explorer** (`/states/[stateSlug]`) — Per-state unit explorer (current home page concept, per state)
5. **Unit Detail** (`/states/[stateSlug]/units/[unitId]`) — Deep dive on a specific GMU/zone
6. **Compare** (`/compare`) — Cross-state or within-state unit comparison
7. **Trends** (`/trends`) — Point creep and draw odds trends
8. **Hunt Planner** (`/planner`) — Personal hunt planning dashboard
9. **Season Calendar** (`/calendar`) — State-by-state season dates visual timeline
10. **Turkey Hub** (`/turkey`) — Turkey-specific hunting intelligence

---

## 3. PRICING & SUBSCRIPTION

### Plans
- **Annual Subscription**: ~~$29.99/yr~~ **$14.99/yr** (50% off through end of April 2026)
- **Promotion**: "Subscribe before April 30th and get your second year FREE"
- **What's Included**:
  - All 50 states draw odds & harvest data
  - Point creep analysis & trend forecasting
  - Unit comparison tools
  - Hunt planner with season calendars
  - Turkey hunting intelligence
  - Weather & conditions data
  - Public land overlays
  - Email alerts for draw results & deadline reminders

### Pricing Page Features
- Single plan (keep it simple) with clear value proposition
- Countdown timer to April 30th deadline
- Comparison: "What hunters spend" — $50+ on individual state apps, $100+ on guidebooks
- Money-back guarantee badge
- Trust signals: "Join 12,000+ hunters" (aspirational)

---

## 4. ALL 50 STATES DATA

### State Configuration
Each state needs:
- Name, abbreviation, slug
- Region (West, Midwest, Southeast, Northeast)
- Available species (from the full species list)
- Draw system type (preference points, bonus points, random, OTC)
- Unit system name (GMU, WMU, Zone, Unit, Area, WMA, etc.)
- Number of units (realistic per state)
- Application deadline month
- Season date ranges

### Species List (9 total)
1. **Elk** — Western states primarily (CO, MT, WY, NM, AZ, UT, OR, WA, ID, NV, etc.)
2. **Mule Deer** — Western states
3. **Whitetail Deer** — All states (most common)
4. **Pronghorn** — Western plains states
5. **Moose** — Northern states (AK, MT, WY, CO, UT, ID, ME, NH, VT, WA, MN)
6. **Black Bear** — Many states
7. **Bighorn Sheep** — Western states (limited)
8. **Mountain Goat** — Western states (very limited)
9. **Turkey** — Nearly all states (spring & fall seasons)
10. **Mountain Lion** — Western states
11. **Elk (Roosevelt)** — Pacific NW

### Regional State Groupings

**Western Big Game** (draw-heavy, preference/bonus point systems):
CO, MT, WY, NM, AZ, UT, NV, ID, OR, WA

**Western Secondary**:
CA, SD, ND, NE, KS, OK, TX

**Midwestern**:
MN, WI, MI, IA, MO, IL, IN, OH, KY, WV

**Southeastern**:
GA, AL, MS, LA, AR, TN, NC, SC, VA, FL

**Northeastern**:
PA, NY, VT, NH, ME, MA, CT, NJ, MD, DE, RI

**Other**:
AK, HI (limited hunting)

---

## 5. FEATURE DETAILS

### 5a. Landing Page
- **Hero Section**: Full-width dark background with mountain/forest imagery (CSS gradient + pattern). Bold headline "Know Before You Draw", subhead about all 50 states. CTA buttons: "Start Free Preview" + "See Pricing"
- **Stats Bar**: "50 States | 9 Species | 15,000+ Hunt Units | 6 Years of Data"
- **Feature Cards** (3-column grid):
  1. Draw Odds Intelligence — Real draw odds by preference point level
  2. Point Creep Analysis — See how competition changes over time
  3. Harvest & Success Data — Know which units produce
  4. Hunt Planner — Plan your season with calendar + checklists
  5. Turkey Intelligence — Spring & fall turkey data nationwide
  6. Compare & Decide — Side-by-side unit comparison
- **State Map Section**: Interactive US map or grid showing all 50 states, clickable
- **Pricing Section**: Embedded pricing card with promo banner
- **Testimonial Section**: 3 hunter testimonials (fictional but realistic)
- **FAQ Section**: Common questions about the service
- **Footer**: Links, legal, social media icons

### 5b. State Explorer (Enhanced)
- State header with flag emoji, species available, draw system info
- Quick facts sidebar: application deadline, license costs, point system explanation
- All current explorer features (filter, sort, results table)
- Enhanced with state-specific species/seasons

### 5c. Turkey Hub
- Spring vs Fall season selector
- Subspecies: Eastern, Merriam's, Rio Grande, Osceola, Gould's
- Turkey-specific metrics: harvest per hunter, birds per acre, NWTF habitat rating
- Season dates by state
- Weapon types: Shotgun, Archery, Crossbow

### 5d. Hunt Planner
- Select target hunts across multiple states
- Timeline view of application deadlines
- Checklist: license, tags, gear, travel
- Budget calculator
- Notes per hunt

### 5e. Season Calendar
- Visual timeline showing all seasons across states
- Filter by species, state, weapon type
- Color-coded bars for different seasons
- Current date indicator

---

## 6. TECHNICAL IMPLEMENTATION

### Data Generation Strategy
- Expand `hunt-data.ts` with state configs for all 50 states
- Each state gets realistic GMU/zone counts and species
- Seeded random generation per state (deterministic)
- Turkey data generation with appropriate metrics
- State-specific season types and sex designations

### Component Architecture
- Reuse and enhance existing components
- New components: PricingCard, StateMap, CountdownTimer, FeatureCard, TestimonialCard, FAQAccordion, SeasonTimeline, HuntPlannerBoard, SubscriptionGate
- Shared layout components: MarketingLayout vs AppLayout

### Routing
```
/                           → Landing (marketing)
/pricing                    → Pricing page
/states                     → State browser
/states/[slug]              → State explorer
/states/[slug]/units/[id]   → Unit detail
/compare                    → Compare tool
/trends                     → Trends analyzer
/planner                    → Hunt planner
/calendar                   → Season calendar
/turkey                     → Turkey hub
```

### State Management
- URL search params for filters (current approach, keep it)
- localStorage for planner data and preferences
- Mock auth state for subscription gating (no real auth needed)

---

## 7. UI/UX REQUIREMENTS

- **Mobile-first responsive design**
- **Smooth page transitions**
- **Loading skeletons** for data-heavy pages
- **Micro-interactions**: hover states, button feedback, smooth accordions
- **Data visualization**: Recharts with consistent theming
- **Accessibility**: Proper ARIA labels, keyboard navigation, color contrast
- **Performance**: Lazy load heavy components, efficient data filtering
- **Professional polish**: Consistent spacing (8px grid), aligned elements, no orphaned text, proper truncation

---

## 8. IMPLEMENTATION ORDER

### Phase 1: Data & Infrastructure
- [ ] Expand state configs for all 50 states
- [ ] Add turkey species data
- [ ] Update types for multi-state support
- [ ] Create state-aware data generation

### Phase 2: Marketing & Landing
- [ ] New landing page with hero, features, stats
- [ ] Pricing page with countdown timer
- [ ] State browser page
- [ ] Footer component
- [ ] Marketing layout

### Phase 3: App Enhancement
- [ ] State-based routing
- [ ] Enhanced explorer per state
- [ ] Turkey hub
- [ ] Updated compare and trends for multi-state

### Phase 4: New Features
- [ ] Hunt planner
- [ ] Season calendar
- [ ] Subscription gate component

### Phase 5: Polish
- [ ] Animations and transitions
- [ ] Loading states
- [ ] Mobile optimization
- [ ] Final visual polish pass
