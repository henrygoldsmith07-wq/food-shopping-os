/**
 * Pantry evidence and reconciliation primitives.
 *
 * These functions keep the pantry useful without turning an unreadable amount
 * or a conflicting source into a made-up fact. Display quantities stay in the
 * form the user entered; normalised quantities are carried alongside them for
 * comparisons and explanations.
 */

import { canonicalName, learnAlias, sameIngredient } from './aliases.js';
import { addQuantities, formatQuantity, parseQuantity, subtractQuantities } from './measure.js';
import { mergeQtys } from './pantry.js';

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (value) => String(value ?? '').trim();
const validDate = (value) => DATE_RE.test(String(value || ''));
const dayDistance = (from, to) => {
  if (!validDate(from) || !validDate(to)) return null;
  return Math.max(0, Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / DAY_MS));
};

const rawConfidence = (item) => {
  const value = String(item?.confidence || 'definite').toLowerCase();
  return ['definite', 'probable', 'unknown'].includes(value) ? value : 'definite';
};

const amountConfidence = (item, parsed) => {
  const value = String(item?.amountConfidence || '').toLowerCase();
  if (['exact', 'approximate', 'unknown'].includes(value)) return value;
  if (!clean(item?.qty)) return 'unknown';
  return parsed?.confidence || 'unknown';
};

const confidenceMeta = {
  definite: { tier: 'high', score: 0.96, label: 'High confidence', tone: 'good' },
  probable: { tier: 'medium', score: 0.64, label: 'Medium confidence', tone: 'muted' },
  unknown: { tier: 'low', score: 0.18, label: 'Low confidence', tone: 'warn' },
};

/**
 * Read a pantry row as evidence, including time-based confidence decay.
 * Legacy rows without a date remain usable; there is no honest clock to decay.
 */
export const pantryConfidenceLevel = (item, today = '') => {
  const stored = rawConfidence(item);
  const meta = confidenceMeta[stored];
  const observedAt = item?.lastConfirmedAt
    || item?.confidenceUpdatedAt
    || item?.purchaseDate
    || item?.addedAt
    || null;
  const ageDays = dayDistance(observedAt, today);
  let level = stored;
  if (ageDays !== null) {
    if (stored === 'definite' && ageDays >= 45) level = 'unknown';
    else if (stored === 'definite' && ageDays >= 21) level = 'probable';
    else if (stored === 'probable' && ageDays >= 14) level = 'unknown';
  }
  const effective = confidenceMeta[level];
  const amount = amountConfidence(item, parsedQuantity(item));
  const decayed = level !== stored;
  const requiresConfirmation = level !== 'definite';
  const amountNeedsConfirmation = amount === 'unknown';
  return {
    stored,
    level,
    tier: effective.tier,
    score: effective.score,
    label: effective.label,
    tone: effective.tone,
    amount,
    amountNeedsConfirmation,
    ageDays,
    observedAt,
    decayed,
    requiresConfirmation,
    reason: decayed
      ? `Last confirmed ${ageDays} days ago; confidence has faded.`
      : amount === 'unknown'
        ? 'The stock amount has not been recorded.'
        : level === 'probable'
          ? 'This stock was recorded as probable.'
          : item?.low
            ? 'This item is marked as running low.'
            : 'Recently confirmed pantry stock.',
  };
};

export const confidenceAfterDecay = (item, today = '') => pantryConfidenceLevel(item, today).level;

const parsedQuantity = (item, learnedAliases = {}) => parseQuantity(item?.qty, {
  ingredient: canonicalName(item?.name, learnedAliases),
});

/** Add a readable, canonical quantity without rewriting what the user typed. */
export const normalisePantryItem = (item = {}, { learnedAliases = {} } = {}) => {
  const ingredientKey = canonicalName(item.name, learnedAliases);
  const parsed = parsedQuantity(item, learnedAliases);
  const qty = clean(item.qty);
  return {
    ...item,
    name: clean(item.name),
    ingredientKey,
    canonicalName: ingredientKey,
    normalisedName: ingredientKey,
    normalisedQty: parsed ? formatQuantity(parsed) : qty,
    amountConfidence: amountConfidence(item, parsed),
    confidence: rawConfidence(item),
  };
};

const countReading = (parsed) => {
  if (!parsed) return null;
  if (parsed.count) return { amount: parsed.count.amount, unit: parsed.count.unit };
  if (parsed.dim === 'count') return { amount: parsed.amount, unit: parsed.unit || 'unit' };
  return null;
};

const quantityCanMerge = (a, b, ingredient) => {
  const left = parseQuantity(a, { ingredient });
  const right = parseQuantity(b, { ingredient });
  if (!clean(a) && !clean(b)) return true;
  if (!left || !right) return false;
  return Boolean(addQuantities(left, right, { ingredient }));
};

/** Keep package counts as package counts when both sides use the same unit. */
export const mergePantryQuantities = (a, b, { ingredient = '' } = {}) => {
  const left = parseQuantity(a, { ingredient });
  const right = parseQuantity(b, { ingredient });
  const lc = countReading(left);
  const rc = countReading(right);
  if (lc && rc && lc.unit === rc.unit) {
    return formatQuantity({ amount: lc.amount + rc.amount, dim: 'count', unit: lc.unit });
  }
  return mergeQtys(a, b, { ingredient });
};

const combinedConfidence = (a, b) => {
  const values = [rawConfidence(a), rawConfidence(b)];
  if (values.includes('unknown')) return 'unknown';
  if (values.includes('probable')) return 'probable';
  return 'definite';
};

const combinedAmountConfidence = (a, b, qty) => {
  const values = [amountConfidence(a), amountConfidence(b)];
  if (!clean(qty) || values.includes('unknown')) return 'unknown';
  if (values.includes('approximate')) return 'approximate';
  return 'exact';
};

const mergeRows = (left, right, { learnedAliases = {}, today = '' } = {}) => {
  const ingredientKey = canonicalName(left.name || right.name, learnedAliases);
  const qty = mergePantryQuantities(left.qty, right.qty, { ingredient: ingredientKey });
  const parsed = parseQuantity(qty, { ingredient: ingredientKey });
  const merged = {
    ...left,
    ingredientKey,
    canonicalName: ingredientKey,
    normalisedName: ingredientKey,
    qty,
    normalisedQty: parsed ? formatQuantity(parsed) : qty,
    amountConfidence: parsed ? combinedAmountConfidence(left, right, qty) : 'unknown',
    confidence: combinedConfidence(left, right),
    cost: Math.round(((Number(left.cost) || 0) + (Number(right.cost) || 0)) * 100) / 100,
    low: Boolean(left.low || right.low),
    expiry: left.expiry || right.expiry || null,
    purchaseDate: right.purchaseDate || left.purchaseDate || null,
    lastConfirmedAt: right.lastConfirmedAt || left.lastConfirmedAt || today || null,
    confidenceUpdatedAt: right.confidenceUpdatedAt || left.confidenceUpdatedAt || today || null,
    store: right.store || left.store || '',
    sources: [...new Set([...(left.sources || []), ...(right.sources || []), left.source, right.source].filter(Boolean))],
    sourceIds: [...new Set([...(left.sourceIds || [left.id]), ...(right.sourceIds || [right.id])].filter(Boolean))],
  };
  return merged;
};

const conflictFor = (ingredientKey, left, right, today, index) => ({
  id: `pantry-conflict-${ingredientKey.replace(/[^a-z0-9]+/g, '-')}-${index}`,
  type: 'quantity',
  status: 'open',
  ingredientKey,
  itemIds: [...new Set([left.id, right.id].filter(Boolean))],
  itemNames: [...new Set([left.name, right.name].filter(Boolean))],
  title: `Check ${left.name || right.name}`,
  reason: `These quantities cannot be safely combined (${left.qty || 'amount unknown'} and ${right.qty || 'amount unknown'}).`,
  action: 'Keep separate or confirm the units before merging.',
  createdAt: today || null,
});

/** Consolidate equivalent pantry rows, leaving incompatible quantities visible. */
export const consolidatePantry = (pantry = [], { learnedAliases = {}, today = '', force = false } = {}) => {
  const groups = [];
  const conflicts = [];
  let merged = 0;
  for (const source of Array.isArray(pantry) ? pantry : []) {
    const item = normalisePantryItem(source, { learnedAliases });
    if (!item.name) continue;
    const key = item.ingredientKey;
    const candidates = groups.filter((group) => sameIngredient(group.ingredientKey, key, learnedAliases));
    const target = candidates.find((group) => force || quantityCanMerge(group.qty, item.qty, key));
    if (target) {
      const index = groups.indexOf(target);
      groups[index] = mergeRows(target, item, { learnedAliases, today });
      merged += 1;
      continue;
    }
    if (candidates.length) conflicts.push(conflictFor(key, candidates[0], item, today, conflicts.length));
    groups.push({ ...item, sourceIds: item.id ? [item.id] : [] });
  }
  return { pantry: groups, conflicts, merged };
};

const purchaseRow = (item, { learnedAliases = {}, date = '', today = '', idFactory } = {}) => {
  const row = normalisePantryItem({
    ...item,
    id: item.id || idFactory?.('p') || `pantry-purchase-${date || today}`,
    qty: clean(item.qty) || '1',
    confidence: 'definite',
    amountConfidence: clean(item.qty) ? item.amountConfidence : 'exact',
    source: 'purchase',
    purchaseDate: item.purchaseDate || date || today || null,
    lastConfirmedAt: today || date || null,
    confidenceUpdatedAt: today || date || null,
    low: false,
  }, { learnedAliases });
  return { ...row, cost: Number(item.price ?? item.cost) || 0, store: item.store || '' };
};

/**
 * Reconcile a shop or receipt into existing pantry evidence. Matching names
 * are merged only when their quantities share a measurable scale; otherwise a
 * conflict is returned for the household to resolve.
 */
export const reconcilePurchase = (
  pantry = [],
  purchases = [],
  { learnedAliases = {}, date = '', today = '', location = 'Cupboard', idFactory } = {},
) => {
  let next = (Array.isArray(pantry) ? pantry : []).map((item) => normalisePantryItem(item, { learnedAliases }));
  const matches = [];
  const added = [];
  const conflicts = [];
  for (const source of Array.isArray(purchases) ? purchases : []) {
    const incoming = purchaseRow({ ...source, location: source.location || location }, {
      learnedAliases, date, today, idFactory,
    });
    if (!incoming.name) continue;
    const sameRows = next
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => sameIngredient(item.ingredientKey || item.name, incoming.ingredientKey, learnedAliases));
    const candidate = sameRows.find(({ item }) => quantityCanMerge(item.qty, incoming.qty, incoming.ingredientKey));
    if (candidate) {
      const before = candidate.item.qty || '';
      const merged = mergeRows(candidate.item, incoming, { learnedAliases, today });
      next[candidate.index] = { ...merged, location: candidate.item.location || incoming.location || location };
      matches.push({ purchase: incoming.name, pantryId: candidate.item.id, action: 'merged', before, after: merged.qty });
      continue;
    }
    if (sameRows.length) {
      const conflict = conflictFor(incoming.ingredientKey, sameRows[0].item, incoming, today, conflicts.length);
      conflicts.push({ ...conflict, type: 'purchase', incoming, existing: sameRows[0].item });
    }
    next.push(incoming);
    added.push(incoming);
    matches.push({ purchase: incoming.name, pantryId: incoming.id, action: 'added', after: incoming.qty });
  }
  return { pantry: next, matches, added, conflicts };
};

/** A compact event read stored after recipe-based pantry deduction. */
export const inferConsumption = ({
  recipe, used = [], shortfalls = [], assumed = [], confirmationNeeded = [], today = '', enabled = true,
} = {}) => {
  if (!enabled) {
    return {
      type: 'recipe_consumption',
      recipeId: recipe?.id || null,
      recipeName: recipe?.name || 'Recipe',
      date: today || null,
      confidence: 'not_run',
      enabled: false,
      used,
      assumed,
      confirmationNeeded,
      shortfalls,
      explanation: 'Automatic pantry deduction is off; no stock was changed.',
    };
  }
  const confidence = shortfalls.length || confirmationNeeded.length ? 'low' : assumed.length ? 'medium' : 'high';
  return {
    type: 'recipe_consumption',
    recipeId: recipe?.id || null,
    recipeName: recipe?.name || 'Recipe',
    date: today || null,
    confidence,
    enabled: true,
    used,
    assumed,
    confirmationNeeded,
    shortfalls,
    explanation: shortfalls.length
      ? `${shortfalls.length} ingredient${shortfalls.length === 1 ? '' : 's'} fell short while cooking.`
      : assumed.length || confirmationNeeded.length
        ? 'Some pantry quantities or confidence levels needed an assumption.'
        : 'Pantry quantities matched the recipe and were deducted.',
  };
};

/** The quantity short of a recipe need, when both sides can be compared. */
export const shortfallQuantity = (available, needed, { ingredient = '' } = {}) => {
  const have = parseQuantity(available, { ingredient });
  const need = parseQuantity(needed, { ingredient });
  if (!need) return clean(needed);
  if (!have) return clean(needed);
  const difference = subtractQuantities(have, need, { ingredient });
  if (!difference || difference.shortfall <= 0) return '';
  return formatQuantity({ ...need, amount: difference.shortfall });
};

/** Explain a shortfall in language that makes the evidence and next action clear. */
export const explainPantryShortfall = ({
  name, needQty, availableQty = '', shortfallQty = '', sourceRecipes = [],
} = {}) => {
  const ingredient = clean(name) || 'this ingredient';
  const recipes = sourceRecipes.filter(Boolean);
  const source = recipes.length ? ` across ${recipes.join(' and ')}` : '';
  if (!availableQty) return `Need ${needQty || 'an amount'} of ${ingredient}${source}; no confirmed stock is recorded.`;
  if (shortfallQty) return `Need ${needQty || 'more'} of ${ingredient}${source}; pantry evidence shows ${availableQty}, so add about ${shortfallQty}.`;
  return `Pantry records ${availableQty} of ${ingredient}${source}, but confirm the amount before relying on it.`;
};

export const learnHouseholdAlias = (learned, raw, canonical) => learnAlias(learned || {}, raw, canonical);
