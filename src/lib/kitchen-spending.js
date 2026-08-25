/**
 * What you spent, and what the app has watched you do.
 *
 * Shops, spending windows, price history and the achievement counters all read
 * the same recorded trips — nothing here is estimated, and a period with no
 * recorded shop reports nothing rather than zero.
 *
 * Split out of kitchen.js to keep both readable; the whole surface is still
 * re-exported from there, so callers import from `kitchen.js` as before.
 */

import { BADGES } from '../data/plan.js';
import { RECIPES } from '../data/recipes.js';
import { addDays, dayStamp, weekStart } from './kitchen-dates.js';

/* ---------- Shops and spending ---------- */

export const shopsInWeek = (shops = [], stamp = dayStamp()) => {
  const start = weekStart(stamp);
  const end = addDays(start, 7);
  return shops.filter((s) => s.date >= start && s.date < end);
};

export const spentInWeek = (shops = [], stamp = dayStamp()) =>
  Math.round(shopsInWeek(shops, stamp).reduce((sum, s) => sum + (Number(s.total) || 0), 0) * 100) / 100;

export const spentInMonth = (shops = [], stamp = dayStamp()) => {
  const month = String(stamp).slice(0, 7);
  return Math.round(
    shops.filter((shop) => String(shop.date).slice(0, 7) === month)
      .reduce((sum, shop) => sum + (Number(shop.total) || 0), 0) * 100,
  ) / 100;
};

/** Monthly totals, oldest first — the profile's spending chart. */
export const spendByMonth = (shops = [], months = 6, today = dayStamp()) => {
  const out = [];
  const base = new Date(`${today}T12:00:00`);
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const spend = shops
      .filter((s) => s.date.slice(0, 7) === key)
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    out.push({ key, label: d.toLocaleDateString('en-GB', { month: 'short' }), spend: Math.round(spend * 100) / 100 });
  }
  return out;
};

/** Weeks (most recent first) where recorded spend stayed inside the budget. */
export const budgetWeeks = (shops = [], weeklyBudget = 0, today = dayStamp()) => {
  if (!weeklyBudget) return 0;
  let streak = 0;
  for (let i = 1; i <= 12; i += 1) {
    const stamp = addDays(weekStart(today), -7 * i);
    const week = shopsInWeek(shops, stamp);
    if (!week.length) break;
    if (spentInWeek(shops, stamp) > weeklyBudget) break;
    streak += 1;
  }
  return streak;
};

/**
 * What you have actually paid for a thing, over time. Only names bought more
 * than once show a trend — everything else is a single data point, and says so.
 */
export const priceHistory = (shops = []) => {
  const byName = new Map();
  for (const shop of [...shops].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const item of shop.items || []) {
      const price = Number(item.price) || 0;
      if (!price) continue;
      const key = item.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, { name: item.name.trim(), emoji: item.emoji, points: [] });
      byName.get(key).points.push({ date: shop.date, price, store: shop.store });
    }
  }
  return [...byName.values()]
    .map((entry) => {
      const prices = entry.points.map((p) => p.price);
      const latest = prices[prices.length - 1];
      const previous = prices.length > 1 ? prices[prices.length - 2] : null;
      const best = Math.min(...prices);
      return {
        ...entry,
        prices,
        latest,
        previous,
        change: previous === null ? null : Math.round((latest - previous) * 100) / 100,
        best,
        bestStore: entry.points.find((p) => p.price === best)?.store || null,
        // Provenance: the date and store behind the latest figure, so a price
        // always carries its own timestamp rather than a bare number.
        latestDate: entry.points[entry.points.length - 1]?.date || null,
        latestStore: entry.points[entry.points.length - 1]?.store || null,
        times: prices.length,
      };
    })
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
};

/** Like-for-like movement across products bought at least twice. */
export const groceryInflation = (shops = []) => {
  const comparable = priceHistory(shops).filter((item) => item.points.length > 1);
  const baseline = Math.round(comparable.reduce((sum, item) => sum + item.points[0].price, 0) * 100) / 100;
  const current = Math.round(comparable.reduce((sum, item) => sum + item.latest, 0) * 100) / 100;
  return {
    items: comparable.length,
    baseline,
    current,
    change: Math.round((current - baseline) * 100) / 100,
    percent: baseline ? Math.round(((current - baseline) / baseline) * 1000) / 10 : null,
  };
};

export const savingsSummary = (shops = []) => ({
  saved: Math.round(shops.reduce((sum, shop) => sum + (Number(shop.saved) || 0), 0) * 100) / 100,
  trips: shops.filter((shop) => Number(shop.saved) > 0).length,
});

/* ---------- Plan ---------- */

export const planForDay = (plan = {}, stamp = dayStamp()) => plan[stamp] || {};

export const planCost = (slots = {}) =>
  Math.round(
    Object.values(slots)
      .map((id) => RECIPES.find((r) => r.id === id))
      .filter(Boolean)
      .reduce((sum, r) => sum + r.costPerServing, 0) * 100,
  ) / 100;

export const plannedMeals = (plan = {}) =>
  Object.values(plan).reduce((n, slots) => n + Object.values(slots).filter(Boolean).length, 0);

/* ---------- Achievements ---------- */

export const levelFrom = (xp, per = 160) => Math.floor(Math.max(0, xp) / per) + 1;

/**
 * Consecutive days ending today (or yesterday, so an evening cook still counts
 * tomorrow morning) — used for both the cooking streak and logging streaks.
 */
export const streakFrom = (days = [], today = dayStamp()) => {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

const PLANT_TAGS = ['vegan', 'vegetarian'];

/** Real counters behind the badges. */
export const kitchenStats = (
  { cooked = [], log = {}, shops = [], weeklyBudget = 0, xp = 0, plan = {}, myRecipes = [] },
  today = dayStamp(),
) => {
  const recipes = cooked.map((c) => RECIPES.find((r) => r.id === c.recipeId)).filter(Boolean);
  return {
    recipesCooked: cooked.length,
    cuisines: new Set(recipes.map((r) => r.cuisine)).size,
    plantMeals: recipes.filter((r) => r.tags.some((t) => PLANT_TAGS.includes(t))).length,
    streak: streakFrom(cooked.map((c) => c.date), today),
    loggedDays: Object.values(log).filter((entries) => entries.length).length,
    budgetWeeks: budgetWeeks(shops, weeklyBudget, today),
    level: levelFrom(xp),
    shops: shops.length,
    plannedMeals: Object.values(plan).reduce((n, day) => n + Object.keys(day).length, 0),
    ownRecipes: myRecipes.length,
    entriesLogged: Object.values(log).reduce((n, day) => n + day.length, 0),
  };
};

export const badgeProgress = (stats) =>
  BADGES.map((b) => {
    const progress = Math.min(stats[b.metric] || 0, b.of);
    return { ...b, progress, earned: progress >= b.of };
  });

/** Which cuisines you actually cook, as a share of everything cooked. */
export const cuisineSplit = (cooked = []) => {
  const counts = new Map();
  for (const entry of cooked) {
    const recipe = RECIPES.find((r) => r.id === entry.recipeId);
    if (!recipe) continue;
    counts.set(recipe.cuisine, (counts.get(recipe.cuisine) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...counts.entries()]
    .map(([name, n]) => ({ name, count: n, pct: Math.round((n / total) * 100) }))
    .sort((a, b) => b.count - a.count);
};
