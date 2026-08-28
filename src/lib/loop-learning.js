/**
 * The learning half of the household loop.
 *
 * Everything here is pure: given what the household did (cooked, binned,
 * bought), it adjusts what the app does next (what the list asks you to buy,
 * what cooking saves by default, and whether the loop itself has drifted).
 * No figures are invented — where the data cannot support a change, it stays
 * an annotation.
 */

import { canonicalName } from './aliases.js';
import { daysUntil } from './kitchen.js';
import { shoppingForPlan } from './mealplan.js';

/** How far back "you keep binning this" looks. */
export const WASTE_LOOKBACK_DAYS = 28;

const NOON = 'T12:00:00';

/** Whole days from `from` to `to` (ISO stamps); null when either is unreadable. */
export const daysBetweenStamps = (from, to) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ''))) return null;
  return Math.round((new Date(`${to}${NOON}`) - new Date(`${from}${NOON}`)) / 86400000);
};

/**
 * Waste history grouped the way the loop reads it: canonical name →
 * { count, cost, lastDate } within the lookback window.
 */
export const recentWasteProfile = (waste = [], { today, learnedAliases = {}, lookbackDays = WASTE_LOOKBACK_DAYS } = {}) => {
  const groups = new Map();
  for (const entry of Array.isArray(waste) ? waste : []) {
    const name = String(entry?.name || '').trim();
    if (!name) continue;
    const date = String(entry?.date || '').slice(0, 10);
    const age = today ? daysBetweenStamps(date, today) : null;
    if (age !== null && (age < 0 || age > lookbackDays)) continue;
    const key = canonicalName(name, learnedAliases) || name.toLowerCase();
    const row = groups.get(key) || { key, name, count: 0, cost: 0, lastDate: null };
    row.count += 1;
    row.cost = Math.round((row.cost + (Number(entry?.cost) || 0)) * 100) / 100;
    if (date && (!row.lastDate || date > row.lastDate)) row.lastDate = date;
    groups.set(key, row);
  }
  return groups;
};

/**
 * "3 avocados" → "2 avocados". Only whole-count quantities of discrete
 * things are reduced — grams, litres and everything else we cannot verify is
 * annotated, never rewritten.
 */
const MASS_VOLUME_UNIT = /^(?:g|gr|grams?|kg|kilograms?|ml|millilitres?|milliliters?|l|litres?|liters?|cl|fl\s*oz|oz\.?|lbs?|lb)\.?$/i;
export const reduceCountQty = (qty) => {
  const m = String(qty || '').trim().match(/^(\d+)\s*(.*)$/);
  if (!m) return null;
  const unit = (m[2] || '').trim();
  if (MASS_VOLUME_UNIT.test(unit)) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 2) return null;
  return unit ? `${n - 1} ${unit}` : String(n - 1);
};

/**
 * The list builder's learning pass. An ingredient the household has binned
 * twice or more in the last month comes back with one fewer unit than the
 * recipes asked for, and a note saying why. Everything else passes through
 * untouched.
 */
export const wasteAwareList = (items = [], { waste = [], today, learnedAliases = {} } = {}) => {
  const profile = recentWasteProfile(waste, { today, learnedAliases });
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item?.name) return item;
    const key = canonicalName(item.name, learnedAliases) || String(item.name).toLowerCase();
    const row = profile.get(key);
    if (!row || row.count < 2) return item;
    const reduced = reduceCountQty(item.qty);
    const note = reduced
      ? `Binned ${row.count}× recently — buying one fewer`
      : `You've binned this ${row.count}× recently — consider buying less`;
    return {
      ...item,
      qty: reduced || item.qty,
      wasteNote: note,
      binnedCount: row.count,
      lastBinnedAt: row.lastDate,
    };
  });
};

/**
 * Plan → list in one call, the way the loop promises it: only the
 * ingredients the plan actually needs minus what the pantry and the fridge
 * already cover, with an ingredient the household keeps binning arriving one
 * unit lighter and labelled why.
 */
export const shoppingListForPlan = (
  plan,
  dates,
  { pantry = [], waste = [], today, learnedAliases = {} } = {},
) => wasteAwareList(
  shoppingForPlan(plan, dates, { pantry, today, learnedAliases }),
  { waste, today, learnedAliases },
);

/**
 * What cooking should save by default: what the dish made minus the people
 * eating. Tuesday's 4-serving fajitas for a household of 2 pre-save 2
 * portions — the step the loop used to lose.
 */
export const defaultLeftoverPortions = (recipe, people = 1) => {
  const servings = Math.max(1, Math.round(Number(recipe?.servings) || 1));
  const eaters = Math.max(1, Math.round(Number(people) || 1));
  return Math.max(0, servings - eaters);
};

const unmarkedPastMeals = (plan = {}, cooked = [], events = [], today) => {
  const cookedKeys = new Set((cooked || []).map((c) => `${c.date}|${c.recipeId}`));
  const eventKeys = new Set((events || []).map((e) => `${e.date}|${e.slot}`));
  const rows = [];
  for (const [date, slots] of Object.entries(plan || {})) {
    if (date >= today) continue;
    for (const [slot, recipeId] of Object.entries(slots || {})) {
      if (!recipeId) continue;
      if (eventKeys.has(`${date}|${slot}`)) continue;
      if (cookedKeys.has(`${date}|${recipeId}`)) continue;
      rows.push({ date, slot, recipeId });
    }
  }
  return rows;
};

/**
 * Loop drift detection — the guarantee that a month of real use cannot
 * quietly desync inventory, shopping, planning and waste. Each issue is
 * stated plainly and, where it can be, carries a one-tap fix.
 */
export const loopHealth = (state, today = state?.day) => {
  const issues = [];
  const cookedCount = (state?.cooked || []).length;
  const pantryCount = (state?.pantry || []).length;

  // Cooking happened, the pantry is tracked, but cooking never touches it:
  // every downstream number (coverage, leftovers, the list) is now fiction.
  if (cookedCount > 0 && state?.autoUsePantry === false && pantryCount > 0) {
    issues.push({
      id: 'pantry-use-off',
      severity: 'warn',
      title: 'Cooking isn’t updating your pantry',
      detail: `${cookedCount} cooked meal${cookedCount === 1 ? '' : 's'} happened without the pantry being used up, so what Forq thinks you have has drifted from what you have.`,
      fix: { kind: 'enable-pantry-use', label: 'Start updating the pantry when you cook' },
    });
  }

  // Leftovers past their date are the loop's most expensive leak: portions
  // saved, never planned, never binned — invisible in every other view.
  const expiredLeftovers = (state?.pantry || []).filter(
    (p) => p.cat === 'Leftovers' && p.expiry && (daysUntil(p.expiry, today) ?? 0) < 0,
  );
  if (expiredLeftovers.length) {
    issues.push({
      id: 'expired-leftovers',
      severity: 'warn',
      title: 'Leftover portions have gone past their date',
      detail: `${expiredLeftovers.length} saved portion row${expiredLeftovers.length === 1 ? '' : 's'} expired uneaten. Moving them into waste keeps the next week's numbers honest.`,
      fix: { kind: 'bin-expired-leftovers', label: `Bin ${expiredLeftovers.length} expired portion row${expiredLeftovers.length === 1 ? '' : 's'}` },
    });
  }

  // Shops that never reached the pantry: bought twice next week because the
  // first buy was never recorded as owned.
  const flagged = new Set(
    (state?.pantryEvents || [])
      .filter((e) => e?.type === 'purchase_reconciliation')
      .map((e) => `${e.date}|${e.store}`),
  );
  const unreconciled = (state?.shops || [])
    .filter((shop) => shop?.items?.length && !shop.pantryReconciled && !flagged.has(`${shop.date}|${shop.store}`))
    .filter((shop) => {
      const age = daysBetweenStamps(shop.date, today);
      return age !== null && age >= 0 && age <= 14;
    });
  if (unreconciled.length) {
    issues.push({
      id: 'unreconciled-shops',
      severity: 'info',
      title: 'Recent shops never reached your pantry',
      detail: `${unreconciled.length} shop${unreconciled.length === 1 ? ' wasn’t' : 's weren’t'} added to the pantry, so Forq may ask you to buy things you already own.`,
      fix: {
        kind: 'reconcile-shops',
        label: `Add ${unreconciled.length <= 3 ? 'them' : 'the last 3'} to the pantry`,
        shopIds: unreconciled.slice(-3).map((shop) => shop.id),
      },
    });
  }

  // Planned meals in the past with no outcome recorded: the plan-vs-reality
  // learning starves without them.
  const pending = unmarkedPastMeals(state?.plan, state?.cooked, state?.mealPlanEvents, today);
  if (pending.length) {
    issues.push({
      id: 'unmarked-meals',
      severity: 'info',
      title: 'Past meals weren’t marked as cooked or skipped',
      detail: `${pending.length} planned meal${pending.length === 1 ? '' : 's'} from earlier this week has no outcome yet — this is what teaches next week's plan.`,
      fix: null,
      goTab: 'plan',
    });
  }

  return { issues, checkedAt: today };
};
