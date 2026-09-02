# Forq — Food Shopping OS

One app for planning, shopping, cooking, nutrition, budgeting and reducing
waste. Mobile-first PWA-style web app built with Next.js 15 + React 18 + Tailwind
CSS 4, styled in the calm monochrome Le Studio design language (see
`apps/le-studio-site`): ink-on-neutral surfaces, border-first cards,
black-on-white CTAs, and monochrome stroke iconography (lucide-react)
throughout — no emoji in the UI.

**The app starts empty.** There is no demo user, no pretend pantry, no invented
spending history and no pre-earned achievements. A first run asks for your
name, budget and targets, and from then on every number you see is computed
from what you actually log, buy, cook and plan. Backups can be exported and
restored, including from first-run setup. Invalid saved data opens a recovery
screen instead of being silently replaced. Forq is local-first by default:
data starts in localStorage and no account is required. Signing in is an opt-in
to Upstash Redis household sync. When a user chooses a server-backed AI action, Forq
relays that prompt and its relevant context to OpenAI.

The only data that ships with the app is reference material, not user data: a
recipe book, a food/barcode/restaurant nutrition catalogue, per-100 g nutrient
tables and UK reference intakes.

## Backend setup

Forq runs on Next.js and keeps its local-first store. The backend is optional:
without environment variables it stays local-only; with them it offers opt-in
Auth.js accounts, Upstash Redis household sync, Ably or Redis live updates, private receipt
uploads, calendar reads and writes, open product observations and an AI relay to OpenAI.

1. Copy `.env.example` to `.env.local`.
2. Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Generate `AUTH_SECRET` with at least 32 random bytes.
4. Add Google, Apple and/or Microsoft OAuth credentials.
5. Run `npm run db:migrate` to record the current data-store migration.
6. Run `npm run dev`.

`npm run db:check` verifies the connection and applied migrations. Production
deployments should run `npm run db:migrate` as a controlled release step before
the new application version receives traffic.

The first sign-in copies existing on-device data to the user's personal
household. Later writes use optimistic versions: a concurrent change returns a
conflict and does not overwrite either copy. Open browser tabs update
immediately, and private Ably channels (or a Redis-backed stream when Ably is not
configured) push new household versions to subscribed clients. Upstash Redis
remains the source of truth. Receipt images require
Vercel Blob. AI calls require an OpenAI key and run only on the server.
Optional product insights are off until enabled under Privacy & data. They
record only coarse daily counts for the plan, shop and cook journey, and are
uploaded only for a signed-in household; they never include food names, health
values, recipe text or prices.
`AI_MONTHLY_TOKEN_LIMIT` sets the hard monthly allowance per household; it
defaults to 250,000 reserved-and-used tokens. Signed-in users can see the
current month’s used, reserved and remaining allowance under Account & sync;
prompts and responses are not included in that usage record.

Live shop prices come from `/api/integrations/scrape-prices`, which reads each
retailer's public search page when you ask it to. It is not a retailer feed and
not a quote: robots.txt is checked before every fetch, a shop that declines or
blocks the request is reported as declining rather than dropped, and each price
keeps the URL it was read from so you can check it. Prices published as
schema.org data are taken verbatim; where a shop publishes none, the page text
is read and the result is labelled as a lower-confidence reading. Many UK
retailers only price after a store or postcode is chosen, so an empty result is
a normal and honest outcome. The retailer hub still keeps your recorded receipt
prices and saved offers, and still links to the official retailer site so you
can confirm today's basket, stock and delivery or collection options yourself.

**Every item on the list is checked**, not a sample of it: a comparison that
silently covers six of your twenty items is worse than useless, because it looks
complete. The list goes up in batches, and the route stops starting new items
when it nears its time budget and names the rest in `remaining`, which the
client sends on — so a long list finishes across several requests rather than
being cut off by a serverless timeout. Progress is shown while it runs and the
run can be stopped.

A few shops are checked at once, but never the same shop twice at once: workers
pull from a shared queue, so each retailer still receives strictly one request
at a time with a gap after it. One request each at three different shops is
three ordinary visitors; three at one shop is a burst.

The route is signed-in only, rate-limited to 60 requests an hour (up to 12 items
each), and cached three hours on device.

### The food catalogue

Around **510 foods**, roughly 395 generic and 115 branded, split across files by
what they are: core staples, the expanded generic list, the store cupboard,
the deli/dessert/freezer counter, and two branded waves.

Every food can be graded. That is a deliberate invariant with a test behind it:
the health grade refuses to score without sugar, saturated fat and salt, so a
row missing them would silently lose its grade rather than fail loudly. Rows
added after the original files state those three outright via
`src/data/food-row.js` instead of hoping a micronutrient profile exists.

Two integrity checks guard the figures, because hand-entered nutrition data
fails by typo rather than by design:

- **Energy against macros** — every row's stated kcal is checked against
  `4×protein + 4×carb + 9×fat + 2×fibre`, the UK/EU calculation. Fibre at
  2 kcal/g is not a detail: leave it out and every spice looks fabricated,
  because a third of ground cinnamon is fibre. Alcohol (7 kcal/g) is not
  modelled, so rows tagged `alcohol` are exempt.
- **Sub-components against parents** — sugar never exceeds carbohydrate,
  saturated fat never exceeds fat.

Naming follows the catalogue's own convention: qualifiers go **after a comma**
("Lentils, cooked", "Pesto, green"), because the matcher ignores anything after
a comma or inside brackets. That is what lets a shopping list saying "pesto"
find the entry while "milk" still refuses to match "Milk chocolate".

### Branded products

The catalogue carries popular UK branded groceries — Heinz Baked Beans,
Cathedral City, Warburtons, Quorn, Cadbury and so on — as entries in their own
right alongside the generics. Two reasons, both practical:

- **Nutrition differs by brand.** Two tins of beans on the same shelf are not
  the same food, and a health grade built from a generic average is a grade for
  something nobody bought.
- **A retailer search for a named product finds it.** "Baked beans" comes back
  as a wall of results the scraper cannot confidently price; "Heinz Baked Beans"
  comes back as a product. Where a generic list item has named products behind
  it, the price panel offers them and can price one on the spot — without
  rewriting your list, because deciding that "beans" means Heinz is your call.

Every branded row states sugar, saturated fat and salt explicitly rather than
inheriting a generic profile. Those three drive the health grade, and an
unknown there used to be read as zero — which would quietly grade a chocolate
bar better than a bag of lentils. The grade now declines to score at all when
they are unknown.

Figures are typical published per-100g label values. Manufacturers reformulate:
**the pack in your hand is the authority.**

### Tags, filtering and sorting

Each priced item carries tags, drawn from four sources that are worth different
amounts and kept apart rather than flattened into one confident list:

| Source | Tags | Evidence |
| --- | --- | --- |
| Nutrition | high protein, source of protein, high/source of fibre, high sugar/salt/saturated fat, a health grade A–E | A confident match against the food catalogue, then the UK/EU labelling thresholds — "high protein" means the regulated 20% of energy, not "quite a lot". |
| Diet | contains meat, contains fish, vegetarian, vegan (labelled), no animal ingredient named | The matched catalogue entry's own tags where there is one, the product name otherwise. A filter, never a certification. |
| Processing | minimally processed, culinary ingredient, processed, ultra-processed | The product name, and labelled "(est.)" because a name is weak evidence. |
| Value | good value somewhere, cheaper/dearer than usual, from £x/kg | This item's own prices across shops and over time. Never a judgement about a product from its price alone. |
| Availability | newly listed at a shop | A shop pricing it now that was not in the previous check. |
| You | bought before, you buy this often | Your own recorded shops. |

The catalogue match is deliberately strict: `searchFoods` answers "milk" with
"Milk chocolate", and a nutrition tag hung on the wrong food is worse than no
tag, so a match only counts when every meaningful word of the catalogue name
appears in what you typed. "Semi-skimmed milk" matches; bare "milk" gets no
nutrition tags rather than the wrong ones.

**Allergens only ever warn.** They are matched on a product name, which is good
enough to raise "may contain" and nowhere near good enough to promise that
something is free of anything — so the tag exists in that direction only, and
appears only for allergens the household has actually declared. In the filter
row they are phrased as "hide items that may contain".

Filters combine with AND, so each tag you add narrows the list — selecting
several and getting a *longer* list would be the opposite of filtering. Only
tags something actually carries are offered, with counts, so no filter is a
dead end. Sorting covers cheapest, best value per kg, healthiest, most bought,
biggest gap between shops, and A–Z; anything unrankable (no readable pack size,
no catalogue match) sorts last rather than being treated as zero.

### Ranking and price history

Each item shows its shops **ranked cheapest to dearest**, with the gap to the
cheapest in pounds and percent — "Asda is 3p (3.4%) dearer" is a decision where
two bare prices are only two facts. Tied shops share a rank.

Every check is also kept on the device, one observation per item per shop per
day, so asking repeatedly builds a **price history**: a timeline of the item's
cheapest price, a small chart per shop, and which shop has been cheapest most
often — which is a better guide than whoever happens to be cheapest today.
History never leaves the device and is cleared with the cache.

### A price for every item

The live scraper cannot have a 100% hit rate, and that is not a parser bug to
fix. Several shops forbid their search pages in robots.txt; several more return
403 to anything that is not a browser; many UK grocers publish no price at all
until a store is chosen. The ways round those are ignoring robots.txt and
evading bot detection, and Forq does neither.

So the scraper is not the only source. Four already exist, each right about
something slightly different, and every item is resolved through all of them:

| Source | What it is | Worth |
| --- | --- | --- |
| **Live from the shop** | read from a shop's page just now | most current, least certain it is the product you meant |
| **You paid this** | your own receipt | certainly the right product, possibly months old |
| **From an earlier check** | a previous live check, kept on this device | dated, and it was a search result |
| **Community observed** | a dated Open Prices report | often another town |

Each candidate is scored as **source weight × freshness**, where freshness
halves roughly every three months rather than falling off a cliff. That is why
a three-day-old receipt beats a 200-day-old community report, and why a
two-day-old check beats a year-old receipt — a fixed ranking could not express
either.

Every row shows which source answered and how old it is, and the basket total
says **what share of it is live**, so it never quietly borrows the authority of
its freshest row. Where two sources disagree by more than half, that is flagged:
it usually means a search matched a different product rather than the price
moving.

**Nothing is ever invented to fill a gap.** An item no source knows about says
so. A made-up number would look exactly like a real one at a glance, which is
the failure this design exists to prevent.

### Why a plain fetch is not enough

Most UK grocery search pages render their products in the browser. The HTML
that arrives from a plain fetch is an empty shell, and no amount of better
parsing finds a price that was never in the document. So fetching escalates
through a ladder, and a page is only "done" when it actually yields prices —
HTTP 200 on a shell is a miss, not a hit:

| Strategy | Needs | Returns | Notes |
| --- | --- | --- | --- |
| `monid` | `MONID_API_KEY` | whatever the configured endpoint returns | Leads the ladder when configured. Runs one scraping endpoint through [Monid](https://monid.ai)'s API (`MONID_SCRAPE_PROVIDER` / `MONID_SCRAPE_ENDPOINT`); free on this workspace's plan. Renders JavaScript, and HTML keeps the structured passes — plain text drops to the text pass. A run takes seconds to minutes. |
| `direct` | nothing | raw HTML | Free and instant. Works on server-rendered shops. Leads when no Monid key is set. |
| `firecrawl` | `FIRECRAWL_API_KEY` | rendered HTML + markdown | Headless render. Costs credits, so it is only reached when the rungs before it found nothing. Asks for `rawHtml`, so structured parsing still applies. |
| `jina` | nothing | markdown | [r.jina.ai](https://r.jina.ai), keyless, renders JavaScript. Markdown only, so just the text pass can read it — hence last. |

Escalation is what raises the hit rate: a shop that returns a shell to `direct`
gets retried through a renderer before it is written off as having no prices.
Each row records which strategy produced it, and the UI says "page rendered to
load prices" where a renderer was needed.

**robots.txt still governs everything.** A renderer is not a way around a shop
that declined — the permission check runs before any strategy, and a refusal
means no fetch by any route.

### Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `NVIDIA_API_KEY` | *bundled key* | Free NVIDIA NIM catalogue. Powers the AI assistant and the scraper's fallback extraction. A key is **shipped in the source**, so this works with no setup; set this to use your own, or to an empty string to turn NVIDIA off. |
| `FIRECRAWL_API_KEY` | unset | Enables the Firecrawl render strategy. Without it the ladder skips Firecrawl. |
| `FIRECRAWL_BASE_URL` | `https://api.firecrawl.dev/v2` | Pin an API version or point at a self-hosted Firecrawl. |
| `FIRECRAWL_WAIT_MS` | `2500` | How long Firecrawl waits after load before capturing — raise it for slow shops. |
| `MONID_API_KEY` | unset | Enables the Monid strategy and puts it at the front of the ladder. Generate a key at [app.monid.ai/access/api-keys](https://app.monid.ai/access/api-keys). |
| `MONID_SCRAPE_PROVIDER` | `apify` | Which Monid provider the strategy runs. Pick one with `monid discover -q "uk grocery prices"`. |
| `MONID_SCRAPE_ENDPOINT` | `/apify/website-content-crawler` | Which Monid endpoint to run. Confirm its input schema with `monid inspect` before changing it. |
| `MONID_SCRAPE_INPUT_JSON` | `{"startUrls":[{"url":"{{url}}"}],"maxCrawlResults":1}` | Body sent to the endpoint; `{{url}}` is replaced with the shop's search page. Match the schema `monid inspect` prints. |
| `MONID_RUN_TIMEOUT_MS` | `60000` | How long a Monid run may take before the shop is written off as empty and the next rung is tried. |
| `JINA_API_KEY` | unset | Optional. Raises Jina Reader's rate limit; it works keylessly without one. |
| `JINA_READER_ENABLED` | `true` | Set to `false` to drop the keyless renderer from the ladder. |
| `PRICE_SCRAPER_STRATEGIES` | `monid,direct,firecrawl,jina` | Explicit ladder order, comma-separated. Unconfigured strategies are dropped. |
| `PRICE_SCRAPER_ENABLED` | `true` | Set to `false` to switch live price checking off entirely. |
| `PRICE_SCRAPER_RETAILERS` | all | Comma-separated allowlist of retailer ids, e.g. `tesco,aldi`. |
| `SCRAPER_TIMEOUT_MS` | `9000` | Per-page timeout for the direct fetch. |
| `SCRAPER_RENDER_TIMEOUT_MS` | `25000` | Per-page timeout for a rendering strategy. |
| `SCRAPER_USER_AGENT` | `ForqBot/1.0 …` | The identity sent to shops and matched against their robots.txt. Keep it honest and contactable. |

**On the bundled NVIDIA key.** A working key is committed in
`src/server/openrouter.js` so the app runs with no configuration. It is a free
key with no billing attached. It is still a shared credential in a public
repository: anyone can spend its rate limit, and rotating it needs a release.
Set `NVIDIA_API_KEY` to your own if you are self-hosting or care about
availability. Every other secret belongs in `.env.local` (gitignored) locally
and in your hosting provider's environment settings for a deployment.

Barcode lookups can optionally use the public Open Food Facts API through the
authenticated `/api/integrations/products` route. It returns product identity,
ingredients, allergens, nutrition, labels and scores when the barcode is in
that catalogue. `/api/integrations/prices` can query Open Prices for GBP
observations by barcode or exact product name — the same route powers the
Shop list's "Check community prices" action and the Prices dashboard. Open Prices is a community
dataset: its observations can be old, incomplete or from a different shop, so
Forq labels them as observed with the date and a staleness tag (fresh <7d · ageing 7–30d · old >30d) and never treats them as a live supermarket quote.
Observed rows are fetched only after an explicit tap, cached 24h on device for a list of up to 12 items, and rate-limited at 120/h.
Both lookups run only after an explicit user action and require a signed-in
backend household.

The UK supermarkets do not expose one common public third-party price API, so
the live check reads the same public search pages a shopper would open, subject
to robots.txt. Forq does not query undocumented private retailer endpoints and
does not attempt to bypass a shop that blocks automated requests. Scheduled reminders use the authenticated
`/api/jobs/reminders` endpoint and Vercel Cron. Trigger.dev can invoke the same
endpoint once its current vulnerable SDK dependency chain is patched.

## Pulse connection

Forq can be read by Pulse, the personal evidence engine in this ecosystem, when
both apps are served from one origin. Sharing is **opt-in** and controlled
here, where the data originates: Settings → Privacy has a "Share with Pulse"
switch. Pulse reads Forq's own state (`forq-state-v2`) directly — it never
receives or stores a copy — and its connector refuses to read anything unless
this flag (`forq-pulse-opt-in`) is on. Turning the switch off clears only the
flag; Forq's own data is never deleted or moved.

## Features

- **First-run setup** — name, household size, weekly budget, how you eat, and
  what you're aiming at. It also asks for weight, height, age and sex, because
  together they let Forq *estimate* your maintenance calories instead of asking
  you to already know the number — sex is in there because Mifflin-St Jeor's
  constants differ by 166 kcal, which after the activity multiplier is a couple
  of hundred a day, and "rather not say" takes the midpoint rather than picking
  one for you. The
  weight you give starts your body series rather than sitting apart from it.
  Cycle tracking is a yes/no at setup, off by default, offered to everyone
  rather than inferred from an answer. Every one of them is editable afterwards.
  Age is asked on the context step rather than inside the optional nutrition
  block, because it decides which app the rest of setup builds
- **Under-18 mode** — automatic from that age, not a switch anyone has to find,
  and on for a household child profile too. It sets targets at maintenance and
  will not apply a weight-loss or body-recomposition multiplier; drops the
  weekly calorie budget, so a bigger day is never a debt to pay back; hides
  fasting and alcohol targets; reads caffeine against age and weight (EFSA's
  3 mg/kg for children and adolescents) rather than the adult 400 mg; never
  converts exercise into calories to eat back; stops scoring exact calorie
  adherence in streaks, XP and challenges; shows no BMI band, because the NHS
  reads child weight against age- and sex-specific centiles; and makes no body
  prediction or comparison between people. What it says instead is balanced
  meals, regular eating and variety, with a plain pointer to a parent or carer,
  a GP, a school nurse or a registered dietitian for anything about weight,
  growth or eating. Setup asks its own consent question before it will start,
  product insights stay off, health never joins a coach link, and a child
  profile's permissions start closed. This follows NICE NG246 on
  age-appropriate dietary approaches for children and young people
- **Goals & targets** — a body goal (weight loss · weight gain · maintenance ·
  muscle gain · body recomposition) sets the energy delta and protein
  priority; dietary patterns (keto · low-carb · high-protein · Mediterranean ·
  vegan · vegetarian · pescatarian · gluten-free · dairy-free) cap or floor
  macros and rule ingredients in or out. Maintenance comes from Mifflin-St
  Jeor when you give body stats, or a figure you type. **Custom macro goals**
  hand the numbers over entirely, **daily calorie targets** drive the diary,
  and a **weekly target** reads the week as one budget — what you've eaten,
  what's left, and what that leaves per day
- **Home dashboard** — today's planned meals, budget and calorie rings, water,
  cooking streak and XP, pantry snapshot with what's about to go off, and
  suggestions derived from your own kitchen (never generic marketing copy).
  Empty states explain what each surface will do once you feed it
- **Global interaction layer** — Ctrl/Cmd+K searches commands, foods, recipes,
  pantry and the shopping list together, with type filters and relevance or
  A–Z sorting. Q opens Quick add, Ctrl/Cmd+Z undoes the latest saved action,
  and 1–6 switch tabs. Search and Quick add also have permanent touch buttons.
  Shopping and pantry rows share swipe actions, long-press menus and native
  context menus. Shopping items, meal slots and dashboard widgets drag where
  ordering has a real meaning; the same actions remain available as buttons
  for touch and keyboard users
- **Food diary (Log tab)** — every route into a log: fuzzy **search** across
  generic foods, branded products and restaurant menus; **barcode scanner**
  (native image recognition where the browser exposes it, plus manual code
  entry; unknown codes route to custom foods); an editable **food photo
  recognition demo** that shows the workflow without claiming this build ships
  a vision model; **voice logging** that parses “two slices of wholemeal bread and
  200g greek yogurt for lunch” into portions; **recipe importer** (paste copied
  recipe text, optionally with its original URL or video link — quantities,
  units and ingredient matches drive a per-serving estimate); **restaurant
  meals** from six UK chains; **recent**
  and **favourite** foods; **custom foods**; **meal templates**; **copy a
  previous meal** from any day in the diary; **quick-add calories** with
  optional macros; portion control by serving, multiplier or **weighed
  grams/ml**; per-entry **meal timing** with an eating-window insight; and
  **snack tracking** as a share of the day
- **Nutrition tracking** — 24 nutrients from the same per-100 g profiles the
  diary logs: calories, protein, carbs, fat, fibre and sugar; saturated fat,
  trans fat and cholesterol; sodium, its UK-label **salt equivalent**, potassium,
  calcium, iron, magnesium and zinc; vitamins A, B complex, C, D, E and K;
  water, caffeine and alcohol.
  Goals read as progress, limits read as headroom, every daily target is
  editable, and the panel says plainly what share of the day's calories
  carries a full micronutrient profile
- **Meal planner** — a **weekly** grid of breakfast/lunch/dinner slots and a
  **monthly** calendar, both walking forwards and back; tap any slot and pick
  from the 200 dishes for *that* meal, filtered to everyone's dietary patterns,
  with what's in season flagged. Meals **move by dragging** them, or by pressing
  their grip and tapping where they go — an occupied slot swaps rather than
  losing anything. The **generator** builds a meal, a day, a week or a whole
  month from your goal, budget-per-serving, people, occasion and time, and will
  favour **what's already in your pantry** and **what's in season this month**.
  Connected Google or Outlook calendars can mark busy dinner times so generated
  plans leave those evenings empty. **Leftover-first** uses portions already in
  the fridge before choosing new cooking; seasonal and lower-cost matches rank
  first. **Batch mode** deliberately plans fewer dishes in blocks, and any dish planned
  twice gets a cook-once schedule: which day, how many batches, how much time it
  saves. **Leftovers** you save after cooking sit in the fridge with a use-by
  date, cover planned meals, and drop out of the shopping list. The list itself
  generates from whichever range you're looking at, minus your pantry. Planning
  also surfaces use-soon and perishable ingredients, lets you replan around the
  time and ingredients you actually have, records adherence and skip reasons,
  and learns household preferences, repeat fatigue and real cooking times.
- **Household** — name a household and add adult or child profiles, each with
  their own portions, dietary patterns, shopping/pantry/recipe permissions and
  notification preference. Shopping lines and chores can be assigned to a
  person, with household activity kept in one feed
- **Shared household data** — shopping, pantry, saved recipes, profiles and
  chores export together in one validated snapshot for another device. Open
  tabs in the same browser update live through local storage events; true
  cross-device live sync still requires an account and backend and is labelled
  that way in the app
- **Coach or trainer view** — household admins can issue a read-only 30-day
  link scoped to diary, nutrition, plan and separately opted-in health data.
  Links are revocable, access-counted and never grant household membership or
  edit access. The shared page adds an aggregate 14-day pulse — averages,
  target-hit rates, a daily calorie pattern and a suggested focus — without
  displaying food names or raw diary entries
- **Household audit trail** — synced mutations record the actor, version and
  changed top-level fields without copying sensitive values into the log
- **Recipe scheduling** — any recipe page can put itself in the plan on a chosen
  day and meal, up to a fortnight out
- **Shop** — a list that learns. Items **group by aisle**, guessed from the
  name until you move one, after which that's where it lives. Pick the shop
  you're walking round and the aisles come in **the order you actually walked
  it last time**, learned from the order you ticked things off. Add by hand or
  by **barcode**; an unknown code is reported as unknown rather than filled in
- **Price comparison** — what this same list would cost at every shop you've
  recorded, from the prices you typed in, always saying how many items each
  shop can actually price. Plus what you're about to overpay for, and a price
  history per item with where it was cheapest. Pack sizes in g, kg, ml or l
  also show a normalised price per 100 g or 100 ml on the shopping row. **Real prices** now also show as dated *Community observed* badges: your receipts stay primary, and a "Check community prices" action can fetch GBP Open Prices observations for the current list (explicit tap only, 120/h, 24h cache) or for a scanned barcode — each row is labelled with store, date and staleness and explicitly "not live"
- **Budget tracking** — the basket against your week: what it comes to, what
  your offers take off, and what that leaves of the budget after what you've
  already spent — with unpriced items counted as unknown, never as free
- **Offers** — no deals feed, so nothing is invented or silently goes stale.
  Enter the offers you have (money off, per cent off, or a multibuy), apply
  them to your list, and open each retailer's official offers page for the
  current range
- **Meal-to-shopping** — a week or month of meals becomes one list, with a
  duplicate ingredient merged into a single line that remembers every meal that
  wanted it, minus your pantry and minus what leftovers already cover
- **UK retailer hub** — Tesco, Sainsbury's, Asda, Aldi, Lidl, Morrisons,
  Waitrose, Ocado and Amazon Fresh. See recorded prices and saved offers, then
  open the official retailer page yourself for today's price, stock and
  delivery or collection links. Aldi and Lidl are labelled as
  browse/in-store rather than being given a delivery button they do not support
- **Store hand-off** — the list also exports as plain text in your aisle order,
  to paste into whichever app you use
- **Pantry** — your inventory: add by hand, **from a photo of a shelf**, or by
  barcode, with amount, cost, location, shop and use-by date; flag things as
  running low and push them to the list in one tap. **Expiry tracking** buckets
  everything dated by urgency (past its date · today or tomorrow · three days ·
  this week), says how many items have no date at all, and binning something
  records **what the waste cost you** at what you paid. Things you buy again
  and again but have run out of come back as restock suggestions — read off
  your own receipts, never a generic "people also buy"
- **Recipes** — a library of 1,200+ dishes, 400 for each meal of the day,
  composed from real ingredients so every dish's calories, macros, cost and
  health/protein/planet scores are computed from what is in it. Ratings are
  your own 1–5 score, never a fabricated community average. Browse the library,
  **your own recipes**, **favourites** or named **collections**; filter by
  **diet**, by **cooking time**, by **ingredients in and out** ("with rice,
  without mushrooms") and by how much shopping you'd have to do — including
  *can make now*, read against your actual pantry
- **Recipe import and saving** — copied recipe text is parsed into ingredients,
  per-serving nutrition and method steps, then saved to My recipes. Add the
  original URL or video link and it stays attached; the importer does not claim
  it fetched a page that browser cross-origin rules blocked
- **Recipe generator** — invents a dish from what you have, composed from the
  same ingredient tables as the book, so its nutrition and cost are computed
  rather than written. It says which parts of the dish your kitchen covered and
  what it assumed you'd buy; the same request always produces the same dish
- **Portion scaling** — cook for any number: amounts scale (and keep the
  recipe's own formatting), per-serving nutrition doesn't, and the total cost
  follows. Unreadable amounts like "to serve" are left exactly as written
- **Ingredient substitutions** — swaps that name a real replacement, so
  applying one **recomputes** calories, macros, cost and diet tags from the new
  ingredient, renames the dish so the filters can't be fooled, and says plainly
  when a swap is outside the ingredient tables. One tap makes a dish vegan,
  dairy-free, gluten-free or nut-free where the swaps exist
- **Nutritional breakdown** — every nutrient in a serving: the dish's own
  macros, where its calories come from, and micronutrients estimated from the
  food catalogue, with how much of the ingredient list that estimate recognised
- **Cooking mode** — full screen, one step at a time, with timers that survive
  navigating back and forth, plus a **hands-free walkthrough** that plays the
  method itself. A supported device's screen wake lock stays active until
  cooking finishes or the view closes. There is no stock video in this app and none is invented; a
  recipe you imported from a video keeps its link and offers it as what it is
- **Community recipes** — a recipe share code is generated locally without an
  upload; you choose who receives it, and their app reads it back. Saved recipes
  still join opted-in household sync, while this share action does not send the
  recipe to OpenAI
- **Profile** — nutrition dashboard, weekly calories from your diary, spending
  from your recorded shops, the cuisines you actually cook, theme and accent,
  plus export and reset for your data
- **Progress** — the game layer, counted rather than banked. **XP** is a
  reading of what you've done (a cook is worth 60 for as long as it's in your
  history, and no longer — undo it and the XP goes too), which drives
  **levels** and their titles. Three **streaks** — diary, cooking and days on
  target — each with the best you've managed. Five **daily goals**, three
  **weekly challenges** picked by the week itself so they don't reshuffle, a
  **seasonal event** for every month of the real calendar, and longer
  **missions**. Twelve **badges** and dated **achievements** — the things that
  actually happened, with the day they happened on. **Rewards** are three extra
  accent colours at levels 4, 8 and 12; the five the app always had stay
  available from level one, so nothing you use is ever taken away
- **Guidance** — one adaptive route replaces Coach, Smart Features, Analytics,
  Reports, Advanced and Getting Started. **Next** ranks one action from the
  diary, plan, pantry, reminders and recorded shops, then shows the evidence
  and at most three later actions. **Review** holds dashboards and honest
  day/week/month reports; **Tools** holds capture, predictions, health and
  impact; **Ask** keeps the assistant in the same surface. Setup gates,
  expiring food and budget risk compete in one explicit urgency order, so two
  panels cannot recommend the same action. The specialist views load only when
  opened, keeping them out of the first bundle. The local assistant can still
  generate pantry recipes and plans, explain recipes, suggest substitutions,
  surface expiring food and optimise a basket from recorded prices
- **Healthy swaps** — on any food, alternatives from the catalogue that beat it
  on protein, fibre, saturated fat or sugar per calorie, with the reason
  attached; a swap is only offered when a real number supports it
- **Nutrition labels** — this build ships no OCR, so it doesn't pretend to read
  the picture: you copy the panel in and the *parsing* is real — "of which"
  lines, kJ/kcal pairs, salt converted to sodium, a per-serving column scaled
  back to 100 g — with anything it couldn't find listed as missing rather than
  guessed, and the result saved as one of your foods
- **Health tracking** — one Health area brings the nutrition breakdown,
  hydration, editable macro and weight targets, evidence-backed healthy swaps
  and body readings together. **Weight**, **body fat
  %**, **waist** and **resting heart rate** each keep a dated series with a
  sparkline and the movement between the first and last reading — reported with
  the days it spanned, because two readings a day apart are not a trend.
  **BMI** is computed from your latest weight and your height rather than
  stored, and asks for a height instead of guessing one. **Waist** is banded
  against the published thresholds, which are sex-specific, so without a stated
  sex it shows the number and says why it can't band it. **Blood pressure**,
  **blood glucose** and **cholesterol** are labelled with the ordinary NHS /
  Diabetes UK reference ranges, always alongside the reminder that a label is
  not a diagnosis. **Sleep** and **stress** average only the nights and days you
  logged, and say how many that is. **Cycle tracking** is opt-in — the page
  isn't there unless you asked for it, at setup or later under Goals — and it
  predicts the next period
  from the average of *your* logged cycles and nothing else — one logged period
  gives no prediction, and it says so. **Progress photos** start on the device;
  after an opt-in sign-in their thumbnails join household sync. They are capped
  because browser storage is small and are not sent through the OpenAI relay
- **Exercise** — **workout logging** across ten kinds of training with an
  intensity and the extras that belong to each (distance for a run, sets and
  reps for a gym session). **Calories burned** are the standard MET equation —
  `kcal ≈ MET × 3.5 × kg ÷ 200 × minutes` — labelled an estimate everywhere it
  appears, and it returns *nothing* without a weight rather than assuming a
  body. **Activity adjustment** is off by default: eating an estimate back is a
  choice, so you make it. **Strength, running, cycling and walking** are types,
  not integrations. **Apple Health, Google Health Connect and smartwatches**
  have no browser API a web app can call, and this build ships no fake Connect
  button; what all of them can do is export a file, so the importer reads that
  CSV — mapping the column names and activity names those apps actually write,
  preferring an exported energy figure over its own estimate, deduplicating
  against what you already have, and counting the rows it couldn't read

- **Reminders and notifications** — one-tap presets for **expiry, shopping,
  meals, budget alerts, weekly reports, daily summaries, pantry alerts, saved
  price targets and restocks**, plus **water, supplements, weigh-ins, exercise,
  sleep** and **anything else you name**, each with your own wording, as many
  times a day as you like, on the days you choose. A reminder arrives carrying
  **your own figure** — "you're at 750 of 2,000 ml", "last weighed 7 days ago,
  at 82 kg", "2 items on the list · 1 running low" — rather than a bare nudge;
  where there's no data behind it, it says so instead of padding it out. Late
  still counts as due for ninety minutes, ticking one off clears that firing
  and not tomorrow's, and snoozing is 10 / 30 / 60 minutes.
  **Suggestions** come from your records with the evidence attached — meal
  times from the median time you actually start each meal (three logged days
  minimum, rounded to five minutes), water spaced across the day for the
  target you set, the weekday most of your weigh-ins already land on, the days
  your workouts cluster on — and nothing is offered that your data can't
  support.
  Sale alerts are checked against prices in shops you recorded. Open Prices
  observations remain explicitly community data, not live supermarket quotes.
  Restocks come from your repeat-buy history,
  expiry alerts from dates you saved, and every preset can be edited or switched
  off.
  On **notifications**, the app is blunt about the platform: while Forq is open
  a due reminder becomes a real notification; while it's closed **it cannot**,
  because that needs a push server and there isn't one. So there's no
  background-notifications toggle that could never work — instead it catches
  you up on what came due while it was shut, and offers a **calendar export**
  (`.ics`, one repeating `VALARM` per time) so the alarm clock you already
  trust does the part a web page can't

- **Analytics dashboards** — recorded spend, offer savings and favourite stores;
  30-day nutrition averages with diary coverage; pantry value, locations,
  categories and expiry coverage; waste cost, rate and repeat waste; shopping
  frequency, frequently bought products and favourite brands; and estimated
  food and shopping carbon. Calendar **monthly** and **yearly** reports bring
  spend, savings, waste, nutrition and footprint together without treating
  missing diary days or unrecorded receipts as zero
- **Reports** — the diary added up over a **day** (split by meal,
  with each one's share and the hours you ate between), a **week**, a **month**,
  and **month-by-month** further back. Every report leads with **how many days
  it actually saw**, and averages only those — a blank day is a day you didn't
  record, not a day you didn't eat, and a month with nothing logged is left out
  of the trend rather than averaged towards zero. **Weight** charts from your
  readings and says plainly that one reading is a number, not a line.
  **Adherence** counts how often each target landed within 10%, and how often
  it went under or over. **Meal timing** reads the usual hour of each meal off
  your own entries and reports the spread as a finding rather than a failure.
  **Shortfall alerts** name nutrients averaging under 70% of their reference —
  refusing to say anything under seven logged days, never treating "under a
  limit" like sodium as a shortfall, and carrying the caveat that a low figure
  is a prompt to look, not a diagnosis. **CSV** comes out three ways (per day,
  per food, measurements), properly quoted. **PDF** is your browser's own:
  Forq builds a clean printable page and hands it to the print dialogue, where
  "Save as PDF" does a better job than any library worth making you download
- **Personalisation** — split down the middle on purpose. **Allergies** (the
  fourteen UK/EU declarable ones) and **religious or cultural rules** (halal,
  kosher, Hindu vegetarian, Jain, Buddhist vegetarian) are *hard lines*: a
  recipe naming one is **removed**, not ranked down or shown behind a warning
  you could tap through, and the page tells you how much of the book that
  leaves and where each allergen usually hides. **Intolerances** *flag* instead,
  because the amount is the point and only you know your threshold. Everything
  here matches ingredient text and says so — a filter, never a guarantee.
  **Favourite cuisines**, **cooking skill** and **time available** reorder what
  you're offered without removing anything. **Units** — kg / lb / stone,
  cm / feet, kcal / kJ, ml / fl oz, 24- or 12-hour — change the *display* only;
  everything is stored and calculated in metric, because a unit preference
  reaching the maths compounds into a real error over months. **Widgets** let
  you reorder or hide any card on Home, including direct drag ordering from
  dashboard edit mode, which hides a panel and never a number

- **Carbon & water footprint** — kg CO₂e and litres per day, computed from the
  grams in your diary against published per-kilogram category means (Poore &
  Nemecek 2018, the largest food-LCA meta-analysis there is). Always states
  **what share of your food it could place** — anything the table can't
  categorise is reported as unmatched, never counted as zero — plus the
  categories driving the number, the swaps that would actually move it, and the
  standing caveat that a category average is an order of magnitude, not a
  measurement of what you bought
- **Micronutrient optimisation** — a greedy set-cover over the food catalogue:
  which foods, in portions a person would actually eat, close the most of what
  your logged days are short on. Weighted towards the worst gaps, capped so one
  freakishly high food can't dominate, silent under five logged days, blind to
  anything your allergies rule out, and explicit about what is *still* short
  after everything it could suggest
- **Fasting** — the overnight gap between last night's last entry and this
  morning's first is read straight off the diary, so nothing needs pressing.
  A running fast is the one exception, because "hasn't logged since 8pm" and
  "is deliberately fasting" are different claims. 16:8 and the rest are labels
  for a window you chose, not protocols the app recommends
- **Receipt reader** — native on-device OCR when the browser exposes a text
  detector, with pasted text from the retailer app or email as the reliable
  fallback. Both routes parse items, prices, quantities (including
  `0.482 kg @ £4.99/kg`), store and date, with loyalty and payment lines
  skipped — then it **checks its own total against the printed one** and says
  whether to trust the parse, and lists any line it couldn't read
- **Predictions & capture** — under Guidance → Tools, predicts the next shopping trip from median trip gaps,
  products likely due from repeat purchase cadence, and weekly budget overrun
  from the current recorded pace. Every prediction carries its evidence and
  declines to guess when history is too thin. One tap builds a deduplicated
  shopping list from those due products and pantry rows you marked low.
  Smart reminders learn routine times from your records. A saved 200m location
  can remind you on re-entry **while Forq is open**; background geofencing
  requires a native app and is not claimed by this PWA
- **Blood results & CGM** — no lab has an API a browser can call and no CGM has
  one either (Dexcom and Libre are OAuth against a vendor server, which needs a
  server of our own). So: type your own panel in and it's banded against
  ordinary adult reference ranges, and paste your CGM's CSV export and the
  trace gets lined up against what you logged eating — reported, never graded,
  because a rise after eating is what eating does
- **The capability register** — the page most apps leave out. Every feature
  people ask for, and where Forq actually stands: **built**, **partly and
  honestly** (label scanning, receipts, pantry photos, bloods, CGM),
  **a browser can't** (smart kitchen, API integrations, coach dashboards,
  healthcare provider access, corporate wellness — each with the nearest real
  thing, usually an export you control), and **deliberately not**:
  DNA-based nutrition advice, which could be built and isn't, because consumer
  genotyping does not support confident personal diet instructions and dressing
  it up as if it did would be the least honest thing in the app

- **The shape of it** — five tabs, not six: your profile moved out of the bar
  and behind an avatar that is now on *every* screen rather than only Home,
  which gave the five screens you actually work in a fifth more width each.
  Every screen names its single most likely next move and puts it in the bottom
  third of the phone, where a thumb already is — and the label follows the
  state, because an empty week wants filling and a full one wants shopping for
- **Adaptive setup** — Guidance includes six gates on real features rather
  than a chore with a tick next to it: set a target and the diary has something
  to measure against, record a shop and the price comparison has prices. Each
  reads the same records as everything else, so it ticks itself the moment you
  do the thing and unticks if you undo it. Once setup is complete, the same
  space moves on to the most useful diary, kitchen or shopping action
- **Reachable and readable** — every control clears the 44×44 WCAG target,
  most of them through a hit area larger than the thing you can see rather than
  by making a dense layout bigger; every control has a name in the
  accessibility tree; text clears 4.5:1 against what is actually behind it,
  tinted badges included; there's a skip link, one `<h1>` per screen, real
  buttons behind tappable cards, and a `prefers-reduced-motion` mode that keeps
  the press acknowledgement and drops the travel

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to .next/ (installable PWA with service worker)
npm test         # vitest suite
```

## Structure

```
src/
  App.jsx              # shell: 5-tab bottom nav, overlays, onboarding gate
  components/AppHeader.jsx     # the one header: title, Guidance, profile avatar
  components/GuidancePanel.jsx # Next, Review, Tools and Ask in one lazy surface
  components/PrimaryAction.jsx # each screen's main action, in the thumb zone
  lib/setup.js         # what's still switched off, read from the same state
  lib/guidance.js      # ranks one next action and attaches its evidence
  index.css            # theme tokens (light/dark + 5 accents), animations
  lib/state.js         # what an install is: empty state + pure state helpers
  lib/store.jsx        # the provider: actions, the clock, persistence
  lib/derive.js        # every number the screens read, computed from state
  lib/youth.js         # under-18 mode: one rule, and everything it decides
  lib/health-actions.js # the store's body/training actions, bounded on the way in
  lib/reminder-actions.js # the store's reminder actions, validated on the way in
  lib/reminders.js     # when one is due, what came due while you were away,
                       # and the line it arrives carrying from your own data
  lib/reminder-suggest.js # reminders your records support, and the .ics export
  lib/notify.js        # the browser's notification API, and its real limits
  lib/reports.js       # day/week/month reports, trends, timing, adherence,
                       # shortfalls — each carrying its own sample size
  lib/report-export.js # quoted CSV, and the printable page the browser PDFs
  lib/preferences.js   # hard lines (allergens, observance) vs soft ones
  lib/preference-actions.js # the store's preference actions, validated in
  lib/units.js         # display-only conversions; the maths stays metric
  lib/footprint.js     # CO₂e and water from published per-kg category means
  lib/micro-optimise.js # greedy set-cover closing your nutrient gaps
  lib/fasting.js       # eating windows and overnight fasts, off the diary
  lib/receipt.js       # a real parser for pasted supermarket receipts
  lib/cgm.js           # CGM export parsing, and meals lined up with the trace
  lib/shopping.js      # aisles that learn, store routes, price comparison,
                       # offers, budget projection, expiry buckets, restock
  lib/kitchen.js       # pantry/shop/plan/achievement maths derived from your data
  lib/utils.js         # currency/date/expiry helpers
  lib/planner.js       # pure plan generation (hard constraints + soft preferences)
  lib/waste-planner.js # ingredient fragmentation, pack fit, expiry and waste scoring
  lib/mealplan.js      # calendar maths, moves/swaps, batch groups, leftovers,
                       # and the shopping list for any range
  lib/recipe-tools.js  # scaling, substitutions, full nutrition, search, sharing
  lib/recipe-ai.js     # invents a dish from your pantry, on-device
  lib/coach.js         # adherence, trends, habits, progress, the day summarised
  lib/advice.js        # meal feedback, swaps, groceries, targets, tips, eating out
  lib/label.js         # a real parser for UK/EU nutrition panels
  lib/health.js        # measurement series and trends, BMI, waist banding,
                       # vitals, sleep, stress, cycles from your own starts
  lib/exercise.js      # METs, the burn estimate, the training week, and the
                       # importer for a health app's CSV export
  lib/photos.js        # thumbnail sizing and the storage a photo set costs
  lib/progress.js      # XP, levels, streaks, goals, challenges, missions,
                       # seasonal events and achievements — all counted
  lib/goals.js         # maintenance energy, macro splits, weekly budget, diet fit
  lib/nutrition.js     # portion scaling, day/meal totals, timing & snack insights
  lib/foodlog.js       # search, barcode, voice parsing, photo demo, recipe import
  data/                # reference only: recipes (signature dishes + the parts
                       # and per-meal templates the rest are composed from), foods
                       # (catalogue + barcodes + menus), nutrients
                       # (units/targets), micronutrients (per-100 g table),
                       # goals (body goals + dietary patterns), seasons (the UK
                       # growing calendar), quests (what earns XP and what the
                       # goals are), health (published reference ranges),
                       # workouts (METs per activity and how each health app
                       # exports), reminders (the kinds one can be, and the
                       # plain truth about notifications), preferences
                       # (allergens, observance, cuisines, units, widgets),
                       # sustainability (published CO₂e/water factors),
                       # capabilities (what's built, what a browser can't do,
                       # and what's deliberately refused), and taxonomy for
                       # aisles/locations
  components/          # one file per surface + shared ui.jsx primitives
  components/icons.jsx # data-glyph → lucide icon map (data keeps emoji keys)
tests/                 # vitest suite
```

State notes: nothing is stored twice. The diary (`log`, keyed by date) is the
single source of truth for nutrition; the pantry, shopping list, recorded
`shops`, `plan` and `cooked` history are the source for everything else. Budget
headroom is your weekly budget minus the shops you recorded this week; streaks
count consecutive days you actually cooked; badge progress reads real counters;
price trends come from prices you typed as you shopped; XP, levels and every
quest bar are counted from those same records rather than stored, so nothing
can be earned twice or kept after the thing that earned it is deleted. Body
readings, vitals, sleep, stress, cycles and workouts are stored as dated
records and every figure drawn from them — BMI, a trend, a cycle average, the
training week, the day's burn — is computed on read. A new
calendar day resets only water — everything else is date-keyed and carries
over.

Charts use a monochrome ink ramp (every series is directly labeled, so identity
never depends on colour); status colours (good/warn/danger) are muted and always
paired with a label. All tokens live as CSS custom properties in `index.css`,
with the accent defaulting to mono (ink) plus four restrained alternatives.

## External product data

Forq keeps the source visible for every external result:

- **Open Food Facts** — barcode identity, ingredients, allergens, nutrition,
  labels and product imagery. It is open catalogue data, not a supermarket
  stock or price feed.
- **Open Prices** — GBP price observations contributed by shoppers. A row can
  be old, incomplete or from another location, so it is useful for context and
  history rather than checkout decisions.
- **Firecrawl / Jina Reader** — optional headless renderers used only when a
  shop's search page needs JavaScript to show its prices. They fetch the same
  public page the scraper would, and are never used to reach a page robots.txt
  declined.
- **Retailer search pages** — read live, on request, by the price scraper. Each
  row names the shop, the URL it came from, and how the number was obtained:
  the shop's own structured product data, its page markup, its page text, or an
  AI reading of that text where the shop publishes nothing machine-readable.
  The last of those is marked "read by AI" wherever it appears.

Forq does not query undocumented retailer website endpoints and does not work
around shops that decline automated requests. The official retailer links remain
the authority for the current basket, stock, offers, delivery fees and slots.

### The AI extraction ladder

Where a page has no structured price data, extraction falls to a language model
through the free NVIDIA NIM catalogue (`NVIDIA_API_KEY`), with OpenRouter as a
second provider. Models are tried strongest first — Nemotron 3 Ultra 550B,
DeepSeek V4 Pro, GLM-5.2, Kimi K2.6, DeepSeek V4 Flash, MiniMax M3, Nemotron
3.5 Lightning, Mistral Medium 3.5, GPT-OSS-120B, Poolside Laguna — and a
rate-limited or withdrawn model costs one retry down the ladder rather than the
lookup. Whatever the model returns is checked against the page text before it is
shown: a price that does not appear on the page is discarded, not displayed.
