/**
 * What Forq does, what it can't, and what it refuses to.
 *
 * Product promise (see product.js): plan meals, buy exactly what you need,
 * waste less food. This register is for capability honesty — not a second
 * product definition. Nutrition, health and integrations sit under that loop.
 *
 * Most apps answer "does it integrate with X?" with a Coming Soon badge. This
 * is the register instead: every capability people ask for, its actual status,
 * and — where the honest answer is no — the nearest real thing, which is
 * usually already built.
 *
 * Three kinds of "no" are kept apart, because they are not the same:
 *
 *   `impossible` — the current web platform cannot do it without native or
 *                  vendor support that Forq does not have.
 *   `refused`    — it could be built and shouldn't be, because the output
 *                  would be advice the evidence doesn't support.
 *   `partial`    — the useful half is built and the label oversells it.
 */

import { DATA_BOUNDARY } from './privacy.js';
import { PRODUCT, PRIMARY_LOOP } from './product.js';

export { PRODUCT, PRIMARY_LOOP };

const cap = (id, name, status, detail, instead = null) => ({ id, name, status, detail, instead });

export const CAPABILITIES = [
  /* ---------- Built ---------- */
  cap('micro', 'Micronutrient optimisation', 'built',
    'Finds the foods that close the most of what your logged days are short on, in normal portions, ranked by how much of each gap they actually cover.'),
  cap('footprint', 'Carbon & water footprint', 'built',
    'Computed from published per-kilogram category averages (Poore & Nemecek 2018) against the grams you logged, always with the share of your food it could place.'),
  cap('sustainability', 'Sustainability score', 'built',
    'Your daily average against the categories driving it, and the swaps that would actually move the number.'),
  cap('waste', 'Food waste tracking', 'built',
    'Binning a pantry item records what it cost you at the price you paid.'),
  cap('predictions', 'Shopping predictions', 'built',
    'Predicts the next trip, products likely due and weekly budget pace from your own dated shops. Every result includes the evidence and stops when there is too little history.'),
  cap('autoList', 'Auto-generated shopping lists', 'built',
    'Combines pantry rows you marked low with products due from repeat purchase cadence, deduplicated against the current list.'),
  cap('recipeLibrary', 'Personal recipe library', 'built',
    'Recipes can be saved, favourited, rated from one to five and organised into named collections. All of it stays in local app state and ratings are explicitly personal rather than a pretend community score.'),
  cap('recipeCooking', 'Guided recipe cooking', 'built',
    'Recipes scale ingredient quantities, calculate per-serving nutrition, send missing ingredients to shopping, and run step-by-step cooking mode with independent timers and original video links.'),
  cap('notifications', 'Notification centre', 'built',
    'Opt-in presets cover expiry, shopping, meals, budgets, weekly reports, daily summaries, pantry alerts, saved price targets and repeat-buy restocks. Context comes from local records; foreground browser alerts, catch-up and calendar export share the existing reminder scheduler.'),
  cap('uxLayer', 'Global UX controls', 'built',
    'Cross-app search and commands, quick add, keyboard shortcuts, a 30-action local undo history, type filters and sorting, touch/context menus, and drag ordering for meals, shopping and dashboard widgets. Gestures supplement visible controls rather than hiding the only route to an action.'),
  cap('recipeImport', 'Recipe URL import', 'partial',
    'Parses copied recipe text or schema.org Recipe JSON-LD/page source locally and keeps its source or video URL. Browser cross-origin rules block reliable direct fetching, so it does not upload that text or send it to OpenAI.'),
  cap('retailers', 'UK retailer integration', 'partial',
    'Tesco, Sainsbury’s, Asda, Aldi, Lidl, Morrisons, Waitrose, Ocado and Amazon Fresh each have official shop, offers and fulfilment links. Recorded receipt prices and saved vouchers stay local. Barcode enrichment can use Open Food Facts and community observations can use Open Prices; Forq does not provide live supermarket prices or claim stock availability.'),
  cap('menu', 'Restaurant menu analysis', 'built',
    'The chains the app ships figures for, read against your targets rather than against a star rating.'),
  cap('fasting', 'Fasting tracker', 'built',
    'Overnight fasts read straight off your diary — the gap between last night’s entry and this morning’s — plus a timer for a fast you set.'),
  cap('prep', 'Meal prep planner', 'built',
    'Batch mode in the planner: fewer dishes in deliberate blocks, with which day to cook, how many batches, and the time it saves.'),
  cap('label', 'Nutrition label scanner', 'partial',
    'No OCR ships here, so it doesn’t pretend to read the photograph. You paste the panel and the parsing is the real part — “of which” lines, kJ/kcal pairs, salt to sodium, per-serving scaled back to 100 g.'),
  cap('receipt', 'Receipt scanner', 'partial',
    'Uses the browser’s native text detector when available, then parses items, prices, quantities, store and date and checks the result against the printed total. Pasted text remains the fallback because most browsers do not expose OCR.'),
  cap('barcode', 'Barcode recognition', 'partial',
    'Reads EAN and UPC codes from a camera image through the browser’s native BarcodeDetector where available. Product lookup stays offline against the bundled catalogue; manual entry is the fallback.'),
  cap('pantryPhoto', 'Pantry image recognition', 'partial',
    'On-device demonstration only. It shows what recognition would give you and says plainly that it is not identifying your actual shelf.'),
  cap('voice', 'Voice logging', 'built',
    'Speech in the browser, parsed into portions — “two slices of wholemeal bread and 200g greek yogurt for lunch”.'),
  cap('voiceAssistant', 'Voice assistant', 'partial',
    'A spoken question can drive the local food coach where browser speech recognition exists. Typed questions remain available everywhere.'),
  cap('geofence', 'Geofenced reminders', 'partial',
    'A saved 200m area can trigger a notification on re-entry while Forq is open. Background geofencing needs native operating-system permissions and is not available to this web app.'),
  cap('offline', 'Offline mode', 'built',
    'The core app opens from its service-worker cache and reads and writes the local store without a connection. Household sync and the OpenAI relay pause while offline; local changes remain available and can sync after the app reconnects.'),
  cap('bloods', 'Blood test results', 'partial',
    'No lab has an API a web app can call, and none would open one to an unauthenticated browser. You enter your own results and they are banded against the published reference ranges.'),
  cap('cgm', 'Continuous glucose monitor', 'partial',
    'Dexcom and Libre use vendor OAuth APIs rather than a browser API. Forq has a backend, but it does not currently implement or hold credentials for either vendor. Import their CSV instead; parsing happens locally, and signed-in household sync includes the saved readings.'),

  /* ---------- A browser cannot ---------- */
  cap('smartKitchen', 'Smart kitchen integration', 'impossible',
    'Ovens, fridges and scales speak Matter, Zigbee or a vendor cloud. A web page can reach none of them — there is no browser API for any of it, and a “Connect” button here would be decoration.',
    'The plan and the recipe are on your phone, which is the screen you were going to use in the kitchen anyway.'),
  cap('api', 'Authenticated API integrations', 'built',
    'Forq has authenticated server routes for household sync, calendar reads and writes, open product observations and an AI relay. Each integration works only when its credentials are configured and you opt in; AI prompts and relevant context are relayed to OpenAI. Without an account or provider, the local-first app and open-format hand-offs still work.'),
  cap('coach', 'Coach or trainer dashboard', 'built',
    'A household admin can create a read-only link scoped to diary, nutrition, meal plan and—only when explicitly selected—health records. Links expire, can be revoked immediately and record access counts.',
    'Open Household → Sharing. The coach never gets edit access, household shopping data or household membership.'),
  cap('provider', 'Healthcare provider access', 'refused',
    'Forq’s backend supports household identity and sync; it is not a clinical system and does not provide clinician roles, clinical audit, consent records or a legal basis for provider access.',
    'The same report, printed or as CSV, is something you can take to an appointment. It says how many days it covers, which is the first thing a clinician will ask.'),
  cap('corporate', 'Corporate wellness', 'refused',
    'Forq is local-first, with opt-in household sync and an OpenAI relay for AI requests. Neither path creates an employer account or employer view, and Forq deliberately does not expose one.',
    'Nothing stops you using Forq while your employer runs a scheme; Forq does not share your data with that scheme.'),
  cap('languages', 'Multi-language support', 'partial',
    'The interface is English only. Numbers, dates and times follow your device’s locale, and units are yours to set — but the words have not been translated, and shipping a machine translation of nutrition copy is how a caveat becomes a claim.'),

  /* ---------- Could be built, shouldn't be ---------- */
  cap('youthDeficit', 'Calorie deficits for under-18s', 'refused',
    'When the age given at setup is under 18, Forq will not set a calorie deficit, apply a weight-loss or body-recomposition multiplier, run a weekly calorie budget to pay a day back into, convert exercise into calories to eat back, score exact calorie adherence, or project a body change. Fasting tools and alcohol targets are not shown, caffeine is read against age and weight rather than the adult 400 mg figure, and sharing starts closed behind its own consent question. This follows NICE NG246 — dietary approaches for children and young people should be age-appropriate, focused on healthy eating rather than restriction, and part of a wider supported approach.',
    'What it does instead: maintenance targets, balanced meals, regular eating, variety across the week, and a plain pointer to a parent or carer, a GP, a school nurse or a registered dietitian for anything about weight, growth or eating.'),
  cap('youthCentiles', 'Child weight assessment', 'refused',
    'The NHS assesses weight in childhood and adolescence against age- and sex-specific centiles, which is a clinical judgement rather than a band an app can put on a number. Under 18 Forq shows no BMI band, and it does not rank or compare bodies between household members at any age.',
    'Recorded weights and measurements are still shown as your own readings over time, and can be printed or exported for an appointment.'),
  cap('dna', 'DNA-based nutrition advice', 'refused',
    'This one is a deliberate no. Consumer genotyping covers a handful of common variants, and for nearly all of them the effect on what you should eat is either tiny, unreplicated, or entirely dependent on things the test didn’t measure. Trials that gave people gene-based diets have not beaten the same advice given without the genes. Building this would mean generating confident, personal, permanent-sounding instructions from evidence that does not support them — so it isn’t built.',
    'If you have a report from a clinician about a genuine condition — coeliac disease, haemochromatosis, PKU, a diagnosed intolerance — set it as an allergy or an intolerance under Preferences and every recipe surface will honour it.'),
];

export const capabilityBy = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c]));

export const STATUS_LABELS = {
  built: { label: 'Built', tone: 'good' },
  partial: { label: 'Partly, honestly', tone: 'accent' },
  impossible: { label: 'A browser can’t', tone: 'muted' },
  refused: { label: 'Deliberately not', tone: 'warn' },
};

export const REGISTER_INTRO =
  `Everything people ask a nutrition app for, and where Forq actually stands on it. “A browser can’t” means the required native or vendor support is unavailable; “Deliberately not” means Forq has chosen not to build it. ${DATA_BOUNDARY}`;
