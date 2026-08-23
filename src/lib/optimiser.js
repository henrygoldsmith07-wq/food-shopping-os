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

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n) => Math.max(0, Math.min(100, n));
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
export const pantryCoverage = (meals = [], pantryItems = []) => {
  const stock = new Map();
  for (const p of pantryItems || []) {
    const k = key(p?.name);
    if (!k) continue;
    const q = readQty(p.qty);
    const cur = stock.get(k);
    stock.set(k, cur && cur.dim === q.dim ? { ...cur, amount: cur.amount + q.amount } : q);
  }
  let need = 0;
  let covered = 0;
  for (const meal of meals) {
    for (const ing of meal?.ingredients || []) {
      const k = key(ing?.name);
      if (!k) continue;
      const q = readQty(ing.qty);
      need += q.amount;
      const have = stock.get(k);
      if (have && have.dim === q.dim && have.amount >= q.amount) covered += q.amount;
    }
  }
  return need ? covered / need : null;
};

/** Share of soon-expiring pantry stock the plan actually uses. */
export const expiryCoverage = (meals = [], pantryItems = [], { today, horizonDays = 7 } = {}) => {
  const usedTokens = new Set();
  for (const meal of meals) for (const ing of meal?.ingredients || []) usedTokens.add(key(ing?.name));
  const dated = (pantryItems || []).filter((p) => p?.expiry && new Date(`${p.expiry}T12:00:00`) <= (() => {
    const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + horizonDays); return d;
  })());
  if (!dated.length) return null;
  const hit = dated.filter((p) => [...usedTokens].some((t) => t.includes(key(p.name)) || key(p.name).includes(t)));
  return hit.length / dated.length;
};

const budgetFitOf = (meals, priceTable) => {
  if (!priceTable) return null;
  const cost = meals.reduce((sum, meal) => sum + (meal?.ingredients || []).reduce((s, ing) => {
    const price = priceTable[key(ing?.name)];
    return price == null ? s : s + price * readQty(ing.qty).amount;
  }, 0), 0);
  return { cost: round1(cost), fit: null }; // fit filled against budget by caller
};

const DEFAULT_WEIGHTS = {
  pantryCoverage: 0.26,
  wasteScore: 0.22,
  expiryCoverage: 0.18,
  budgetFit: 0.16,
  timeFit: 0.1,
  equipmentFit: 0.08,
  packFit: 0.0,
};

/**
 * Rank candidate meal plans. Candidates are arrays of meals
 * ({id,title,ingredients:[{name,qty}],time?,equipment?:[]}).
 */
export const rankPlans = (candidates = [], context = {}) => {
  const {
    pantryItems = [], today = new Date().toISOString().slice(0, 10),
    weeklyBudget = null, maxTimeMins = null, strictEquipment = false,
    equipmentOwned = [], packageSizes = {}, wasteScores = {},
    weights = {}, priceTable = null,
  } = context;
  const W = { ...DEFAULT_WEIGHTS, ...weights };

  const ranked = (candidates || []).map((meals, candidateIndex) => {
    const metrics = {};
    const reasons = [];

    metrics.pantryCoverage = pantryCoverage(meals, pantryItems);

    metrics.wasteScore = typeof wasteScores[candidateIndex] === 'number'
      ? clamp(wasteScores[candidateIndex])
      : null;

    metrics.expiryCoverage = expiryCoverage(meals, pantryItems, { today });

    const est = budgetFitOf(meals, priceTable);
    if (est && weeklyBudget != null && weeklyBudget > 0) {
      const overshoot = est.cost - weeklyBudget;
      metrics.budgetFit = clamp(100 - Math.max(0, overshoot / weeklyBudget) * 200);
      metrics.estimatedCost = est.cost;
      if (overshoot > 0) reasons.push(`Over budget by £${round1(overshoot)}.`);
      else reasons.push(`Inside budget at £${round1(est.cost)}.`);
    } else metrics.budgetFit = null;

    if (maxTimeMins) {
      const times = meals.map((m) => Number(m?.time) || 0);
      const longest = Math.max(0, ...times);
      metrics.timeFit = clamp(longest === 0 ? 100 : 100 - Math.max(0, (longest - maxTimeMins) / maxTimeMins) * 120);
    } else metrics.timeFit = null;

    const equipRows = meals.map((m) => m?.equipment || []);
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
          const pack = packRows.find(([pk]) => key(pk) === key(ing?.name));
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
    if (metrics.expiryCoverage != null) reasons.push(`Uses ${Math.round(metrics.expiryCoverage * 100)}% of stock expiring within 7 days.`);
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
