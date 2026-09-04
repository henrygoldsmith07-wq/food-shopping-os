/**
 * The Forq optimiser — one engine weighing meals, pantry and basket together.
 *
 * Design rules:
 *  - every dimension reports its own 0–100 score or null; null dimensions are
 *    excluded from the weighting instead of pretending to be 100
 *  - weights are visible and tunable; the winner always carries reasons
 *  - richer signals (e.g. waste-planner's pack model) can be fed in via
 *    `wasteScores` without this module depending on them
 */

import { canonicalName } from './aliases.js';

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n) => Math.max(0, Math.min(100, n));
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const normaliseWeightMap = (weights = {}) => Object.fromEntries(
  Object.entries(weights).map(([name, value]) => [name, finitePositive(value) ? Number(value) : 0]),
);
const ingredientKey = (name, learnedAliases = {}) => key(canonicalName(name, learnedAliases))
  .replace(/^(fresh|frozen|dried|cooked|organic|tinned|canned) /, '').trim();

const EQUIPMENT_TAGS = new Set(['air-fryer', 'slow-cooker', 'microwave', 'blender', 'rice-cooker', 'pressure-cooker', 'grill', 'oven', 'hob'].map(key));
const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre'];

const requiredEquipment = (meal) => [...new Set([
  ...(Array.isArray(meal?.equipment) ? meal.equipment : []),
  ...(meal?.tags || []).filter((tag) => EQUIPMENT_TAGS.has(key(tag))),
].map(key).filter(Boolean))];

const mealNutrients = (meals = []) => meals.reduce((totals, meal) => {
  for (const nutrient of NUTRIENT_KEYS) totals[nutrient] += Number(meal?.[nutrient]) || 0;
  return totals;
}, Object.fromEntries(NUTRIENT_KEYS.map((nutrient) => [nutrient, 0])));

const recipeCost = (meals = [], people = 1, priceTable = null, learnedAliases = {}) => {
  let cost = 0;
  let known = 0;
  const eaters = Math.max(1, Number(people) || 1);
  for (const meal of meals) {
    const ingredients = meal?.ingredients || [];
    const servings = Number(meal?.servings);
    const factor = Number.isFinite(servings) && servings > 0 ? eaters / servings : 1;
    const priced = ingredients.map((ingredient) => {
      const price = priceTable && (priceTable[ingredientKey(ingredient?.name, learnedAliases)]
        ?? priceTable[key(ingredient?.name)]);
      return price != null && Number.isFinite(Number(price))
        ? Number(price) * readQty(ingredient?.qty).amount * factor
        : null;
    });
    if (priced.length > 0 && priced.every((price) => price != null)) {
      cost += priced.reduce((sum, price) => sum + price, 0);
      known += 1;
    } else if (Number.isFinite(Number(meal?.costPerServing))) {
      // Ingredient prices are often incomplete; the recipe's per-serving cost
      // is the safer estimate than silently counting only part of the meal.
      cost += Math.max(0, Number(meal.costPerServing)) * eaters;
      known += 1;
    }
  }
  return known === meals.filter(Boolean).length && known ? round1(cost) : null;
};

const nutritionFitOf = (meals, targets, { days = 1, share = 1 } = {}) => {
  if (!targets || typeof targets !== 'object') return null;
  const totals = mealNutrients(meals);
  const scale = Math.max(0.01, (Number(days) || 1) * (Number(share) || 1));
  const scores = {};
  const targetValues = {};
  for (const nutrient of NUTRIENT_KEYS) {
    const target = Number(targets[nutrient]) * scale;
    if (!Number.isFinite(target) || target <= 0) continue;
    targetValues[nutrient] = round1(target);
    scores[nutrient] = ['protein', 'fibre'].includes(nutrient)
      ? clamp((totals[nutrient] / target) * 100)
      : clamp(100 - (Math.abs(totals[nutrient] - target) / target) * 100);
  }
  const values = Object.values(scores);
  if (!values.length) return null;
  return {
    score: round1(values.reduce((sum, value) => sum + value, 0) / values.length),
    actual: Object.fromEntries(NUTRIENT_KEYS.map((nutrient) => [nutrient, round1(totals[nutrient])])),
    target: targetValues,
    scores,
  };
};

const supermarketInfo = (meals, shops = [], preferredStore = null, learnedAliases = {}) => {
  const needed = [...new Set((meals || []).flatMap((meal) => (meal?.ingredients || [])
    .map((ingredient) => ingredientKey(ingredient?.name, learnedAliases)).filter(Boolean)))];
  if (!needed.length || !shops.length) return null;
  const availability = new Map();
  for (const shop of shops) {
    const store = String(shop?.store || '').trim();
    if (!store) continue;
    const available = availability.get(store) || new Set();
    for (const item of shop.items || []) {
      const itemKey = ingredientKey(item?.name, learnedAliases);
      if (itemKey) available.add(itemKey);
    }
    availability.set(store, available);
  }
  const stores = [...availability.entries()];
  if (!stores.length) return null;
  const coverage = (store) => needed.filter((name) => store.has(name)).length;
  const best = stores.slice().sort((a, b) => (
    coverage(b[1]) - coverage(a[1])
    || Number(b[0] === preferredStore) - Number(a[0] === preferredStore)
    || a[0].localeCompare(b[0])
  ))[0];
  const remaining = new Set(needed);
  let stops = 0;
  while (remaining.size) {
    const next = stores
      .map(([store, available]) => ({ store, available, gain: [...remaining].filter((name) => available.has(name)).length }))
      .sort((a, b) => b.gain - a.gain || Number(b.store === preferredStore) - Number(a.store === preferredStore) || a.store.localeCompare(b.store))[0];
    if (!next?.gain) break;
    next.available.forEach((name) => remaining.delete(name));
    stops += 1;
  }
  return {
    store: best[0],
    covered: coverage(best[1]),
    missing: needed.filter((name) => !best[1].has(name)),
    needed: needed.length,
    score: (coverage(best[1]) / needed.length) * 100,
    stops,
    stores: stores.length,
  };
};

/** Light quantity reader: number + dimension (mass/volume/count). */
export const readQty = (qty) => {
  if (qty == null) return { amount: 1, dim: 'count' };
  const text = String(qty).toLowerCase().replace(/\s+/g, '');
  const m = text.match(/^(\d+(?:[.,]\d+)?)(kg|g|ml|l|items?|pcs?|x)?$/);
  const half = /^½$/.test(text) ? 0.5 : null;
  const frac = text.match(/^(\d+)\/(\d+)$/);
  let amount = m ? Number(m[1].replace(',', '.')) : half ?? (frac ? Number(frac[1]) / Number(frac[2]) : Number(text) || 1);
  const dim = m?.[2] ? (['kg', 'g'].includes(m[2]) ? 'mass' : ['ml', 'l'].includes(m[2]) ? 'volume' : 'count')
    : /[a-z]/.test(text) ? 'other' : 'count';
  // Convert using the exact captured unit — '/l/' would also match 'ml'.
  if (m?.[2] === 'kg') amount *= 1000;
  if (m?.[2] === 'l') amount *= 1000;
  return { amount, dim };
};

/** Share of the candidate's ingredient need already sitting in the pantry. */
export const pantryCoverage = (meals = [], pantryItems = [], learnedAliases = {}) => {
  const stock = new Map();
  for (const p of pantryItems || []) {      const k = ingredientKey(p?.name, learnedAliases);
    if (!k) continue;
    const q = readQty(p.qty);
    const cur = stock.get(k);
    stock.set(k, cur && cur.dim === q.dim ? { ...cur, amount: cur.amount + q.amount } : q);
  }
  let need = 0;
  let covered = 0;
  for (const meal of meals) {
    for (const ing of meal?.ingredients || []) {
      const k = ingredientKey(ing?.name, learnedAliases);
      if (!k) continue;
      const q = readQty(ing.qty);
      need += q.amount;
      const have = stock.get(k);
      if (!have || have.dim !== q.dim) continue;
      const used = Math.min(have.amount, q.amount);
      covered += used;
      have.amount -= used;
    }
  }
  return need ? covered / need : null;
};

/** Share of soon-expiring pantry stock the plan actually uses. */
export const expiryCoverage = (meals = [], pantryItems = [], { today, horizonDays = 7, learnedAliases = {} } = {}) => {
  const usedTokens = new Set();
  for (const meal of meals) for (const ing of meal?.ingredients || []) usedTokens.add(key(canonicalName(ing?.name, learnedAliases)));
  const dated = (pantryItems || []).filter((p) => p?.expiry && new Date(`${p.expiry}T12:00:00`) <= (() => {
    const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + horizonDays); return d;
  })());
  if (!dated.length) return null;
  const hit = dated.filter((p) => {
    const pantryToken = key(canonicalName(p.name, learnedAliases));
    return [...usedTokens].some((token) => token === pantryToken || token.includes(pantryToken) || pantryToken.includes(token));
  });
  return hit.length / dated.length;
};

const preferenceFitOf = (meals, preferenceScores = {}) => {
  const values = (meals || []).map((meal) => preferenceScores[meal?.id]).filter((value) => Number.isFinite(Number(value)));
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  return clamp(50 + average * 5);
};

const varietyOf = (meals, learnedAliases = {}) => {
  const rows = (meals || []).filter(Boolean);
  if (!rows.length) return null;
  const ids = rows.map((meal) => key(meal.id || meal.name || meal.title)).filter(Boolean);
  const cuisines = rows.map((meal) => key(meal.cuisine)).filter(Boolean);
  const ingredients = rows.flatMap((meal) => (meal.ingredients || [])
    .map((ingredient) => ingredientKey(ingredient?.name, learnedAliases)).filter(Boolean));
  const ratio = (values) => values.length ? new Set(values).size / values.length : 1;
  return clamp((ratio(ids) * 0.5 + ratio(cuisines) * 0.3 + ratio(ingredients) * 0.2) * 100);
};

const DEFAULT_WEIGHTS = {
  pantryCoverage: 0.26,
  wasteScore: 0.22,
  expiryCoverage: 0.18,
  budgetFit: 0.16,
  nutritionFit: 0.0,
  preferenceFit: 0.0,
  supermarketFit: 0.0,
  timeFit: 0.1,
  equipmentFit: 0.08,
  packFit: 0.0,
  variety: 0.0,
};

/**
 * Rank candidate meal plans. Candidates are arrays of meals
 * ({id,title,ingredients:[{name,qty}],time?,equipment?:[]}).
 */
export const rankPlans = (candidates = [], context = {}) => {
  const {
    pantryItems = [], today = new Date().toISOString().slice(0, 10),
    weeklyBudget = null, maxTimeMins = null, preferredTimeMins = null, strictEquipment = false,
    equipmentOwned = [], packageSizes = {}, wasteScores = {},
    weights = {}, priceTable = null, people = 1, nutritionTargets = null,
    nutritionDays = 1, nutritionShare = 1, preferenceScores = {},
    shops = [], preferredStore = null, learnedAliases = {},
  } = context;
  const W = { ...DEFAULT_WEIGHTS, ...normaliseWeightMap(weights) };

  const ranked = (candidates || []).map((meals, candidateIndex) => {
    const metrics = {};
    const reasons = [];

    metrics.pantryCoverage = pantryCoverage(meals, pantryItems, learnedAliases);

    metrics.wasteScore = typeof wasteScores[candidateIndex] === 'number'
      ? clamp(wasteScores[candidateIndex])
      : null;

    metrics.variety = varietyOf(meals, learnedAliases);

    metrics.expiryCoverage = expiryCoverage(meals, pantryItems, { today, learnedAliases });

    const nutrition = nutritionFitOf(meals, nutritionTargets, {
      days: nutritionDays,
      share: nutritionShare,
    });
    metrics.nutritionFit = nutrition?.score ?? null;
    metrics.nutritionBreakdown = nutrition;
    metrics.preferenceFit = preferenceFitOf(meals, preferenceScores);

    const supermarket = supermarketInfo(meals, shops, preferredStore, learnedAliases);
    metrics.supermarketFit = supermarket
      ? clamp(supermarket.score - Math.max(0, supermarket.stops - 1) * 5)
      : null;
    metrics.supermarket = supermarket;

    const estimatedCost = recipeCost(meals, people, priceTable, learnedAliases);
    metrics.estimatedCost = estimatedCost;
    if (estimatedCost != null && weeklyBudget != null && weeklyBudget > 0) {
      const est = { cost: estimatedCost };
      const overshoot = est.cost - weeklyBudget;
      metrics.budgetFit = clamp(100 - Math.max(0, overshoot / weeklyBudget) * 200);
      metrics.estimatedCost = est.cost;
      if (overshoot > 0) reasons.push(`Over budget by £${round1(overshoot)}.`);
      else reasons.push(`Inside budget at £${round1(est.cost)}.`);
    } else metrics.budgetFit = null;

    const times = meals.map((m) => Number(m?.time) || 0);
    const longest = Math.max(0, ...times);
    const averageTime = times.length ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;
    if (maxTimeMins) {
      metrics.timeFit = clamp(longest === 0 ? 100 : 100 - Math.max(0, (longest - maxTimeMins) / maxTimeMins) * 120);
    } else if (preferredTimeMins) {
      metrics.timeFit = clamp(100 - Math.abs(averageTime - preferredTimeMins) / Math.max(preferredTimeMins, 1) * 100);
    } else metrics.timeFit = null;
    metrics.totalTime = times.reduce((sum, time) => sum + time, 0);

    const equipRows = meals.map(requiredEquipment);
    if (equipRows.some((e) => e.length)) {
      const owned = new Set(equipmentOwned.map(key));
      const ok = equipRows.filter((e) => e.every((x) => owned.has(key(x)))).length;
      metrics.equipmentFit = equipRows.length ? ok / equipRows.length : null;
      if (strictEquipment && metrics.equipmentFit < 1) metrics.equipmentFit = 0;
    } else metrics.equipmentFit = null;

    // Pack rounding: how much of bought packs would remain unused.
    const packRows = Object.entries(packageSizes);
    if (packRows.length) {
      let remainder = 0;
      let counted = 0;
      for (const meal of meals) {
        for (const ing of meal?.ingredients || []) {
          const pack = packRows.find(([pk]) => ingredientKey(pk, learnedAliases) === ingredientKey(ing?.name, learnedAliases));
          if (!pack) continue;
          const need = readQty(ing.qty).amount;
          const packSize = readQty(pack[1]).amount || 1;
          remainder += (Math.ceil(need / packSize) * packSize - need) / packSize;
          counted += 1;
        }
      }
      metrics.packFit = counted ? clamp(100 - (remainder / counted) * 100) : null;
    } else metrics.packFit = null;

    const active = Object.entries(W).filter(([k]) => metrics[k] != null && W[k] > 0);
    const weightSum = active.reduce((s, [, w]) => s + w, 0) || 1;
    // Share metrics are 0–1; every dimension must enter the blend on one scale.
    const SCALE = { pantryCoverage: 100, expiryCoverage: 100, equipmentFit: 100 };
    // Strict equipment mode benches plans that need kit you don't own.
    const infeasible = strictEquipment && metrics.equipmentFit != null && metrics.equipmentFit < 1;
    const score = infeasible ? -1 : active.length
      ? Math.round(active.reduce((s, [k, w]) => s + metrics[k] * (SCALE[k] || 1) * w, 0) / weightSum)
      : 0;

    if (metrics.pantryCoverage != null) reasons.push(`${Math.round(metrics.pantryCoverage * 100)}% already in your pantry.`);
    if (metrics.variety != null && metrics.variety < 100) reasons.push(`${Math.round(metrics.variety)}% meal variety; repeated dishes keep the plan simpler.`);
    if (metrics.expiryCoverage != null) reasons.push(`Uses ${Math.round(metrics.expiryCoverage * 100)}% of stock expiring within 7 days.`);
    if (metrics.nutritionBreakdown?.score != null) reasons.push(`Nutrition fit is ${Math.round(metrics.nutritionBreakdown.score)}/100 against the selected targets.`);
    if (metrics.preferenceFit != null) reasons.push(`Taste and household preferences score ${Math.round(metrics.preferenceFit)}/100.`);
    if (metrics.supermarket?.store) reasons.push(`Recorded shop history covers ${Math.round(metrics.supermarket.score)}% at ${metrics.supermarket.store} in ${metrics.supermarket.stops} stop${metrics.supermarket.stops === 1 ? '' : 's'}.`);
    if (infeasible) reasons.push('Needs equipment you do not own.');

    return { candidateIndex, meals, score, metrics, reasons };
  }).sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex);

  return { best: ranked[0] || null, ranked };
};

export const chooseOptimalPlan = (candidates = [], context = {}) => rankPlans(candidates, context).best;

/* ---------- Basket side ---------- */

/**
 * Consolidate a shopping list: assign stores, propose a single-trip plan when
 * one shop covers nearly everything, and suggest cheaper substitutes from the
 * household's own receipt history.
 */
export const optimiseBasket = (items = [], context = {}) => {
  const { preferredStore = null, shops = [], packageSizes = {}, cheapThreshold = 1.15 } = context;

  const assigned = (items || []).map((item) => ({
    ...item,
    store: item.store || preferredStore || 'Unassigned',
  }));

  const groups = {};
  for (const item of assigned) groups[item.store] = (groups[item.store] || []).concat(item);

  // Single-trip suggestion: the biggest store group vs everything else.
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const singleTrip = sorted.length > 1 && sorted[0][1].length >= Math.ceil(items.length * 0.8)
    ? { store: sorted[0][0], extraStops: sorted.length - 1, skipped: sorted.slice(1).flatMap(([, rows]) => rows.map((r) => r.name)) }
    : null;

  // Cheaper-elsewhere suggestions from recorded receipts.
  const suggestions = [];
  for (const item of assigned) {
    if (!(Number(item.price) > 0)) continue;
    let cheapest = null;
    for (const shop of shops || []) {
      for (const row of shop.items || []) {
        if (key(row.name) !== key(item.name) || !Number(row.price)) continue;
        if (!cheapest || row.price < cheapest.price) cheapest = { price: Number(row.price), store: shop.store };
      }
    }
    if (cheapest && cheapest.price <= item.price / cheapThreshold) {
      suggestions.push({
        item: item.name,
        from: item.store,
        to: cheapest.store,
        save: round1(item.price - cheapest.price),
      });
    }
  }

  // Whole-pack rounding notes.
  const packNotes = [];
  for (const item of assigned) {
    const packEntry = Object.entries(packageSizes).find(([pk]) => key(pk) === key(item.name));
    if (!packEntry) continue;
    const need = readQty(item.qty).amount;
    const packSize = readQty(packEntry[1]).amount || 1;
    const packs = Math.max(1, Math.ceil(need / packSize));
    packNotes.push({ item: item.name, buyPacks: packs, note: `${packs} × ${packEntry[1]} covers ${need}.` });
  }

  return {
    groups,
    singleTrip,
    suggestions,
    packNotes,
    assumption: singleTrip
      ? `${singleTrip.store} covers ${singleTrip.store === 'Unassigned' ? '' : 'most '}of the list; ${singleTrip.extraStops} extra stop${singleTrip.extraStops === 1 ? '' : 's'} suggested against it.`
      : 'No single-shop consolidation found worth suggesting.',
  };
};
