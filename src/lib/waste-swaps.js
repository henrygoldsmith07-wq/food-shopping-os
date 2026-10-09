/**
 * Moving a meal so it is eaten before its ingredients turn.
 *
 * The waste planner can say *what* will go unused; this answers the question
 * the household actually asks: "should we move dinner?". It scores the week
 * before and after each candidate move with the same `scoreWastePlan` the
 * generator uses — so a suggestion is never a hunch, it is a measured
 * difference on the exact evidence the rest of the app already trusts.
 *
 * Two kinds of move are considered, both dinner-to-dinner and both strictly
 * future-dated (nothing suggests rewriting history):
 *
 *   swap — two planned dinners exchange nights;
 *   move — a dinner lands on an earlier empty night.
 *
 * A candidate is only returned when the score *improves*, and the reason
 * names the ingredient that left the risk list (with its expiry), or says
 * plainly when the gain came from pack/pantry fit instead. Candidates are
 * capped and deterministic: same input, same suggestions, same order.
 *
 * The caller passes `entries` ({date, slot, recipe}) rather than a raw plan
 * so this module stays a pure function of resolved recipes — and so tests can
 * feed it synthetic dishes without touching the recipe book.
 */

import { daysUntil } from './kitchen-dates.js';
import { sameIngredient } from './aliases.js';
import { scoreWastePlan } from './waste-planner.js';

const dayShort = (date) =>
  new Date(`${String(date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric',
  });

const usesIngredient = (recipe, name) =>
  (recipe?.ingredients || []).some((ingredient) => sameIngredient(ingredient?.name || ingredient, name));

/** Dinner nights in `dates` still empty and not already past — landing spots. */
const emptyDinnerNights = (plan = {}, dates = [], today = '') => dates
  .filter((date) => date >= today && !(plan?.[date] || {}).dinner)

export const wasteSwapSuggestions = ({
  entries = [],
  plan = {},
  dates = [],
  pantry = [],
  today = '',
  people = null,
  learnedAliases = {},
  wasteHistory = [],
  wasteProfile = null,
  packageSizes = {},
  max = 3,
} = {}) => {
  const active = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.slot === 'dinner' && entry.recipe && entry.date >= today);
  if (active.length < 1 || dates.length < 2) return [];

  const scoreOptions = {
    pantry, people, today, learnedAliases, wasteHistory, wasteProfile, packageSizes,
  };
  const baseDates = active.map((entry) => entry.date);
  const meals = active.map((entry) => entry.recipe);
  const before = scoreWastePlan(meals, { ...scoreOptions, dates: baseDates });

  // Dated stock still ahead of us and inside this range. Nothing else can be
  // saved by moving anything, so nothing else drives a suggestion.
  const lastDate = [...dates].sort().at(-1) || today;
  const atRisk = (pantry || []).filter((row) => row?.expiry
    && Number.isFinite(daysUntil(row.expiry, today))
    && daysUntil(row.expiry, today) >= 0
    && row.expiry <= lastDate);

  /** The soonest-expiring at-risk ingredient a meal actually uses. */
  const riskFor = (recipe) => atRisk
    .filter((row) => usesIngredient(recipe, row.name))
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)))[0] || null;

  const emptyNights = emptyDinnerNights(plan, dates, today);

  // Only enumerate moves an at-risk ingredient could justify — a swap between
  // two meals that touch nothing dated cannot reduce waste.
  const candidates = [];
  for (let i = 0; i < active.length; i += 1) {
    const from = active[i];
    const fromRisk = riskFor(from.recipe);
    if (!fromRisk) continue;
    for (const night of emptyNights) {
      if (night >= from.date) continue;
      if (fromRisk.expiry < night) continue; // it would turn before the new night
      candidates.push({ kind: 'move', i, to: night });
    }
    for (let j = i + 1; j < active.length; j += 1) {
      const to = active[j];
      // From lands after expiry, to lands before it: the dated food gets eaten.
      if (riskFor(to.recipe) || fromRisk.expiry >= to.date || fromRisk.expiry < from.date) continue;
      candidates.push({ kind: 'swap', i, j, to: to.date });
    }
  }

  const scored = [];
  for (const candidate of candidates) {
    const movedDates = [...baseDates];
    if (candidate.kind === 'swap') {
      movedDates[candidate.i] = candidate.to;
      movedDates[candidate.j] = baseDates[candidate.i];
    } else {
      movedDates[candidate.i] = candidate.to;
    }
    const after = scoreWastePlan(meals, { ...scoreOptions, dates: movedDates });
    const delta = Math.round(((after.score || 0) - (before.score || 0)) * 100) / 100;
    if (!(delta > 0)) continue;

    const from = active[candidate.i];
    const ingredient = riskFor(from.recipe);
    // Evidence: what left the expected-unused list. A gain that did not save
    // this ingredient does not claim it did.
    const unusedBefore = new Set((before.expectedUnusedIngredients || []).map((row) => row.key));
    const saved = (after.expectedUnusedIngredients || [])
      .filter((row) => !unusedBefore.has(row.key) && row.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
    const named = saved && ingredient && sameIngredient(saved.name, ingredient.name) ? saved : null;
    const dated = named || ingredient;

    const fromName = from.recipe.name;
    const toName = candidate.kind === 'swap' ? active[candidate.j].recipe.name : null;
    const reason = candidate.kind === 'swap'
      ? `Moving ${fromName} from ${dayShort(from.date)} to ${dayShort(candidate.to)} (and ${toName} the other way) puts ${dated.name} to use before it turns on ${dayShort(dated.expiry)}.`
      : `Moving ${fromName} from ${dayShort(from.date)} to ${dayShort(candidate.to)} puts ${dated.name} to use before it turns on ${dayShort(dated.expiry)}.`;

    scored.push({
      kind: candidate.kind,
      from: { date: from.date, slot: 'dinner' },
      to: { date: candidate.to, slot: 'dinner' },
      recipeFrom: fromName,
      recipeTo: toName,
      ingredient: { name: dated.name, expiry: dated.expiry },
      before: before.score,
      after: after.score,
      delta,
      reason,
    });
  }

  // Best gain first; deterministic tiebreaks so the same week always proposes
  // the same move in the same order.
  return scored
    .sort((a, b) => b.delta - a.delta
      || String(a.from.date).localeCompare(String(b.from.date))
      || String(a.to.date).localeCompare(String(b.to.date)))
    .slice(0, Math.max(0, Number(max) || 0));
};

