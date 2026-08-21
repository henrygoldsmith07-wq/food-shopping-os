/**
 * What your food costs the planet, in the same spirit as everything else here:
 * computed from what you logged, with its own uncertainty stated.
 *
 * A footprint is grams × a published per-kilogram factor for the food's
 * category. That arithmetic is exact; the factor is a category average across
 * thousands of farms, so the answer is an order of magnitude and the app says
 * so wherever it appears. Foods the table can't place are counted as
 * *unmatched* and reported, never silently treated as zero — a footprint that
 * quietly ignores half your shopping is worse than no footprint.
 */

import {
  CO2_EQUIVALENTS, FOOD_FOOTPRINTS, IMPACT_BANDS, UK_DAILY_AVERAGE_CO2,
} from '../data/sustainability.js';
import { addDays, dayStamp } from './kitchen.js';

const round = (n, dp = 2) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};

/** The category a food name falls into, or null when the table can't place it. */
export const categoryFor = (name) => {
  const text = String(name || '');
  return FOOD_FOOTPRINTS.find((c) => c.match.test(text)) || null;
};

/** kg CO₂e and litres of water for a weight of one food. */
export const footprintOf = (name, grams = 0) => {
  const category = categoryFor(name);
  if (!category || !grams) return { matched: Boolean(category), co2: 0, water: 0, category };
  const kg = grams / 1000;
  return {
    matched: true,
    category,
    co2: round(category.co2 * kg, 3),
    water: Math.round(category.water * kg),
  };
};

const tally = (items) => {
  let co2 = 0;
  let water = 0;
  let matched = 0;
  const byCategory = new Map();
  for (const { name, grams } of items) {
    const hit = footprintOf(name, grams);
    if (!hit.matched) continue;
    matched += 1;
    co2 += hit.co2;
    water += hit.water;
    const row = byCategory.get(hit.category.id)
      || { id: hit.category.id, label: hit.category.label, co2: 0, grams: 0 };
    row.co2 += hit.co2;
    row.grams += grams;
    byCategory.set(hit.category.id, row);
  }
  return {
    co2: round(co2, 2),
    water: Math.round(water),
    items: items.length,
    matched,
    // The honest denominator: how much of what you logged this figure saw.
    unmatched: items.length - matched,
    coverage: items.length ? Math.round((matched / items.length) * 100) : 0,
    byCategory: [...byCategory.values()]
      .map((r) => ({ ...r, co2: round(r.co2, 2), grams: Math.round(r.grams) }))
      .sort((a, b) => b.co2 - a.co2),
  };
};

/** Everything logged on one day, as a footprint. */
export const dayFootprint = (log = {}, date = dayStamp()) =>
  tally((log[date] || []).map((e) => ({ name: e.name, grams: Number(e.grams) || 0 })));

/**
 * A window of days. Averages over the days that actually had food in them,
 * the same rule the reports use — a blank day isn't a zero-emission day.
 */
export const periodFootprint = (log = {}, { days = 7, today = dayStamp() } = {}) => {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i));
  const logged = dates.filter((d) => (log[d] || []).length > 0);
  const items = logged.flatMap((d) => (log[d] || []).map((e) => ({ name: e.name, grams: Number(e.grams) || 0 })));
  const totals = tally(items);
  const perDay = logged.length ? round(totals.co2 / logged.length, 2) : 0;
  const band = IMPACT_BANDS.find((b) => perDay < b.to);
  return {
    ...totals,
    days,
    loggedDays: logged.length,
    perDay,
    band: logged.length ? band.label : null,
    tone: logged.length ? band.tone : 'muted',
    vsAverage: logged.length ? Math.round((perDay / UK_DAILY_AVERAGE_CO2) * 100) : null,
  };
};

/** A recipe's footprint per serving, from its ingredient list. */
export const recipeFootprint = (recipe, gramsPerIngredient = 120) => {
  const items = (recipe?.ingredients || []).map((i) => ({
    name: typeof i === 'string' ? i : i.name,
    grams: gramsPerIngredient,
  }));
  return {
    ...tally(items),
    // An ingredient list has no weights, so this is a shape comparison between
    // dishes rather than a figure for a plate.
    estimate: true,
  };
};

/** What you actually bought, from your recorded shops. */
export const shopFootprint = (shops = [], { days = 30, today = dayStamp() } = {}) => {
  const from = addDays(today, -days);
  const recent = shops.filter((s) => s.date >= from);
  const items = recent.flatMap((s) => (s.items || []).map((i) => ({ name: i.name, grams: 500 })));
  return { ...tally(items), shops: recent.length, assumedGrams: 500 };
};

/** What a number of kilograms is roughly like, for scale. */
export const equivalents = (kgCo2) =>
  CO2_EQUIVALENTS.map((e) => ({ ...e, amount: Math.round(kgCo2 * e.perKg) })).filter((e) => e.amount > 0);

/**
 * Swaps that would actually move the number: your heaviest category, and the
 * lighter thing that does a similar job. Only offered where the saving is real
 * and computed from the same table as the figure it would improve.
 */
const SWAPS = [
  { from: 'beef', to: 'poultry', line: 'Chicken in place of beef' },
  { from: 'beef', to: 'pulses', line: 'Beans or lentils in place of beef' },
  { from: 'lamb', to: 'poultry', line: 'Chicken in place of lamb' },
  { from: 'cheese', to: 'tofu', line: 'Tofu in place of some cheese' },
  { from: 'prawns', to: 'whiteFish', line: 'White fish in place of prawns' },
  { from: 'fish', to: 'whiteFish', line: 'Wild white fish in place of farmed' },
  { from: 'pork', to: 'pulses', line: 'Pulses in place of some pork' },
  { from: 'rice', to: 'potatoes', line: 'Potatoes in place of rice' },
];

export const swapIdeas = (report, limit = 3) => {
  const by = Object.fromEntries(FOOD_FOOTPRINTS.map((c) => [c.id, c]));
  return report.byCategory
    .flatMap((row) => SWAPS.filter((s) => s.from === row.id).map((swap) => {
      const saved = round(((by[swap.from].co2 - by[swap.to].co2) * row.grams) / 1000, 2);
      return { ...swap, saved, share: report.co2 ? Math.round((row.co2 / report.co2) * 100) : 0 };
    }))
    .filter((s) => s.saved > 0.1)
    .sort((a, b) => b.saved - a.saved)
    .slice(0, limit);
};
