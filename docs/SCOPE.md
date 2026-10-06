# Forq scope: the wedge, the parked tools, and what we never claim

The promise, everywhere it appears (README, `/demo`, first run):

> Tell Forq what you are eating; it works out what to buy; it helps you waste less.

Three steps, in this order:

1. Plan meals — pick dinners for the week.
2. Buy exactly what you need — one deduped list, pantry and leftovers subtracted, shopped in aisle order.
3. Waste less — cook, save leftovers, record waste, see the next plan change because of what you logged.

## In the wedge (default, no opt-in)

- Home, Plan, Shop, Pantry, Cook and the guided WeekLoop that joins them.
- Pantry-aware list generation with its working shown: planned quantity,
  already in pantry, leftover cover, still to buy.
- Aisle-order shopping, mark bought, pantry update on record.
- Cook mode, leftover save, waste record.
- Next suggestion after cooking cites the record that caused it
  (expiring item, leftover, cooked meal, wasted item).
- Receipt totals ("you paid this") as the trusted price.
- Local-first IndexedDB store, export and delete on device.
- Optional Upstash household sync after sign-in only.

## Parked behind Add tools (off by default, code gated not deleted)

- Live retailer scraping (`live-prices`): context only, with date, URL, source.
- AI food coach (`assistant`): meal names, pantry items, list gaps only.
- Coach-share links (`coach`): disabled in default build, time-limited, revocable.
- Gamification (`gamification`): XP, badges, quests, streaks display.
- Sustainability estimates (`carbon`): rough footprint factors, not certified.
- Exercise log (`exercise`), fasting windows (`fasting`).
- Health vault and body log (`health-vault`, `bloods`, `cycle`):
  encrypted local record, never sent to models or analytics.

Enable under Guidance > Tools > Add tools. `Back to core loop only`
disables all of them again.

## Must never be claimed

- Full supermarket range or complete UK catalogue.
- Live stock, live availability, or live basket totals.
- Medical, nutrition-diagnosis, or certified allergen-free advice.
- Certified carbon or sustainability figures.
- That a scraped price is what you will pay.

Honesty invariant: never invent a price, stock level, nutrition grade,
or household fact. If a number cannot be sourced, say so.
