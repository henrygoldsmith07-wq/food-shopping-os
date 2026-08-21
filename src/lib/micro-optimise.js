/**
 * Closing the gaps in a week, with food that exists.
 *
 * The job: you're averaging 40% of your iron and 55% of your calcium. Which
 * foods, in portions a person would actually eat, close the most of that?
 *
 * It's a greedy set-cover. Each candidate food is scored on how much of the
 * *remaining* shortfall a realistic portion of it closes, weighted by how far
 * short you are; the best is taken, the shortfall is reduced by what it
 * supplies, and the next is scored against what's left. Greedy rather than
 * exact because the exact version is NP-hard and a nutrition app has no
 * business spending a second of your battery proving optimality over lentils.
 *
 * Two rules keep it honest: it only proposes foods the catalogue has real
 * per-100 g figures for, and it never proposes something your allergies or
 * observed rules rule out.
 */

import { HEADLINE_KEYS, nutrientBy, NUTRIENTS } from '../data/nutrients.js';
import { isBlocked } from './preferences.js';

const round = (n, dp = 1) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};

/** A portion someone would actually eat, not 100 g of everything. */
const portionOf = (food) => {
  const serving = food.servings?.[0]?.grams;
  return Math.max(20, Math.min(300, Number(serving) || 100));
};

/**
 * The nutrients you're falling short on, worst first. Only nutrients meant to
 * be *reached* — being under a limit is the point of a limit.
 */
export const shortfalls = (averages = {}, targets = {}, { under = 0.9 } = {}) =>
  NUTRIENTS
    // Micronutrients only. Calories and the big three have their own screens,
    // and letting a calorie deficit dominate would bury every actual gap.
    .filter((n) => n.kind === 'goal' && !HEADLINE_KEYS.includes(n.key) && targets[n.key] > 0)
    .map((n) => {
      const have = Number(averages[n.key]) || 0;
      const need = targets[n.key];
      return {
        key: n.key,
        label: n.label,
        unit: n.unit,
        have: round(have, 1),
        need,
        gap: round(Math.max(0, need - have), 1),
        pct: Math.round((have / need) * 100),
      };
    })
    .filter((row) => row.have < row.need * under)
    .sort((a, b) => a.pct - b.pct);

/**
 * How much of the remaining gaps one portion of a food closes. Capped per
 * nutrient at the gap itself, so a food absurdly high in one thing can't score
 * its way to the top on a nutrient you'd already covered.
 */
const scoreFood = (food, gaps) => {
  const grams = portionOf(food);
  const supplies = {};
  let score = 0;
  for (const gap of gaps) {
    const per100 = Number(food.per100?.[gap.key]) || 0;
    if (!per100) continue;
    const amount = (per100 * grams) / 100;
    const useful = Math.min(amount, gap.remaining);
    if (useful <= 0) continue;
    supplies[gap.key] = round(amount, 1);
    // Weighted by how far short you are: closing the worst gap counts most.
    score += (useful / gap.need) * (1 + (100 - gap.pct) / 100);
  }
  return { food, grams, supplies, score: round(score, 4) };
};

/**
 * Foods that would close the most of what you're short on, in order.
 *
 * Returns `{ ready, picks, reason }` — `ready: false` with a reason when there
 * is nothing to work on, rather than a list of foods you don't need.
 */
export const optimiseMicros = (averages, targets, catalogue = [], {
  limit = 5, prefs = {}, minDays = 0, loggedDays = 0,
} = {}) => {
  if (loggedDays < minDays) {
    return {
      ready: false,
      picks: [],
      reason: `${minDays} logged days make this worth computing — you have ${loggedDays}.`,
    };
  }
  const gaps = shortfalls(averages, targets);
  if (!gaps.length) {
    return { ready: true, picks: [], gaps: [], reason: 'Nothing is running short against your targets.' };
  }

  // Only foods with real figures for at least one nutrient you're short on,
  // and only ones your rules allow.
  const pool = catalogue.filter((food) => food.per100
    && gaps.some((g) => Number(food.per100[g.key]) > 0)
    && !isBlocked({ name: food.name, ingredients: [{ name: food.name }] }, prefs));

  const remaining = gaps.map((g) => ({ ...g, remaining: g.gap }));
  const picks = [];
  const used = new Set();

  for (let round_ = 0; round_ < limit; round_ += 1) {
    if (remaining.every((g) => g.remaining <= 0)) break;
    let best = null;
    for (const food of pool) {
      if (used.has(food.id)) continue;
      const scored = scoreFood(food, remaining.filter((g) => g.remaining > 0));
      if (scored.score > 0 && (!best || scored.score > best.score)) best = scored;
    }
    if (!best) break;
    used.add(best.food.id);
    for (const gap of remaining) {
      const supplied = best.supplies[gap.key];
      if (supplied) gap.remaining = round(Math.max(0, gap.remaining - supplied), 1);
    }
    picks.push({
      id: best.food.id,
      name: best.food.name,
      emoji: best.food.emoji,
      grams: best.grams,
      // What it's here for, worst gap first — the reason, not a garnish.
      closes: Object.entries(best.supplies)
        .map(([key, amount]) => ({
          key,
          label: nutrientBy[key]?.label || key,
          unit: nutrientBy[key]?.unit || '',
          amount,
          pctOfGap: Math.round((amount / (gaps.find((g) => g.key === key)?.gap || 1)) * 100),
        }))
        .sort((a, b) => b.pctOfGap - a.pctOfGap)
        .slice(0, 3),
    });
  }

  return {
    ready: true,
    gaps,
    picks,
    // What's still short after all of it, said out loud.
    stillShort: remaining.filter((g) => g.remaining > 0).map((g) => ({ key: g.key, label: g.label, left: g.remaining, unit: g.unit })),
    caveat: 'Computed from the catalogue’s per-100 g figures and a normal portion of each. Food is not the only route to a nutrient, and a persistent shortfall is a conversation with a clinician rather than a shopping list.',
  };
};
