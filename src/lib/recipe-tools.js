/**
 * What you can do to a recipe: scale it, swap an ingredient out, read its full
 * nutrition, or hand it to someone else.
 *
 * Every one of these recomputes rather than re-guesses. Scaling multiplies the
 * amounts and leaves per-serving nutrition alone (a bigger pan is not a bigger
 * portion); a substitution subtracts the ingredient it replaced and adds the
 * one it brought, using the same per-100 g tables the recipe book is built
 * from. Where an ingredient isn't in those tables the app says the figures are
 * unchanged rather than inventing new ones.
 *
 * Diet / allergy filtering for search goes through the central food-suitability
 * engine when a suitabilityCtx is supplied.
 */

import { partByName } from '../data/recipe-parts.js';
import { substitutesFor } from '../data/substitutions.js';
import { NUTRIENT_KEYS } from '../data/nutrients.js';
import { estimateRecipeMicros } from './foodlog.js';
import { KCAL_PER_G } from '../data/goals.js';
import { recipeAllowed } from './goals.js';
import { evaluateFoodSuitability, suitabilityContextFrom } from './food-suitability.js';

const round1 = (n) => Math.round(n * 10) / 10;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* ---------- Portion scaling ---------- */

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** Pull a number and a unit out of "150 g", "2 tbsp", "1 tin", "½ lemon". */
export const parseQty = (qty) => {
  const text = String(qty || '').trim();
  const m = text.match(/^(\d+(?:\.\d+)?|[½¼¾⅓⅔])(\s*)(.*)$/);
  if (!m) return null;
  const amount = FRACTIONS[m[1]] ?? Number(m[1]);
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: m[3].trim(), spaced: m[2].length > 0 };
};

const pretty = (n) => {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  if (Math.abs(rounded - Math.round(rounded * 2) / 2) < 0.001) return String(Math.round(rounded * 2) / 2);
  return String(Math.round(rounded * 10) / 10);
};

export const scaleQty = (qty, factor) => {
  const parsed = parseQty(qty);
  if (!parsed || factor === 1) return String(qty ?? '');
  const amount = pretty(parsed.amount * factor);
  if (!parsed.unit) return amount;
  return parsed.spaced ? `${amount} ${parsed.unit}` : `${amount}${parsed.unit}`;
};

export const scaleRecipe = (recipe, servings) => {
  const from = recipe.servings || 1;
  const to = Math.max(1, Math.round(servings));
  if (to === from) return { ...recipe, totalCost: Math.round(recipe.costPerServing * from * 100) / 100 };
  const factor = to / from;
  return {
    ...recipe,
    servings: to,
    scaledFrom: from,
    ingredients: recipe.ingredients.map((i) => ({ ...i, qty: scaleQty(i.qty, factor) })),
    totalCost: Math.round(recipe.costPerServing * to * 100) / 100,
  };
};

/* ---------- Diet tags, read off the ingredients ---------- */

const strip = (text) => text
  .replace(/(coconut|oat|almond|soya?|rice) (milk|yogurt|cream)/gi, '')
  .replace(/(peanut|almond|nut|cashew) butter/gi, '');

const MEAT = /chicken|beef|lamb|pork|turkey|bacon|ham|sausage|salmon|cod|prawn|tuna|mackerel|anchov|fish|seafood/i;
const ANIMAL_PRODUCT = /milk|yogurt|yoghurt|cheese|halloumi|feta|paneer|parmesan|butter|egg|honey|whey|korma|tikka|pesto|cream/i;

export const dietTagsFor = (ingredients = []) => {
  const text = strip(ingredients.map((i) => i.name).join(' '));
  const meat = MEAT.test(text);
  const product = ANIMAL_PRODUCT.test(text);
  if (!meat && !product) return ['vegan', 'vegetarian'];
  if (!meat) return ['vegetarian'];
  return [];
};

const retag = (recipe, ingredients) => {
  const keep = recipe.tags.filter((t) => t !== 'vegan' && t !== 'vegetarian');
  return [...keep, ...dietTagsFor(ingredients)];
};

/* ---------- Substitutions ---------- */

export const swapsFor = (recipe) =>
  (recipe.ingredients || [])
    .map((i) => ({ ingredient: i.name, options: substitutesFor(i.name) }))
    .filter((row) => row.options.length);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stem = (w) => w.toLowerCase().replace(/s$/, '');

const dedupe = (text) => text
  .split(/\s+/)
  .filter((word, i, all) => i === 0 || stem(word) !== stem(all[i - 1]))
  .join(' ');

const rename = (name, from, to) => {
  for (const token of [from, ...from.split(/\s+/)]) {
    const re = new RegExp(`\\b${escapeRe(token)}\\b`, 'i');
    const found = name.match(re);
    if (found) {
      const upper = /^[A-Z]/.test(found[0]);
      const replacement = upper ? to.charAt(0).toUpperCase() + to.slice(1) : to.toLowerCase();
      const out = dedupe(name.replace(re, replacement));
      return out.charAt(0).toUpperCase() + out.slice(1);
    }
  }
  return `${name} with ${to.toLowerCase()}`;
};

export const applySwap = (recipe, ingredientName, option) => {
  const index = recipe.ingredients.findIndex((i) => i.name.toLowerCase() === ingredientName.toLowerCase());
  if (index < 0) return recipe;

  const from = partByName(ingredientName);
  const to = partByName(option.name);
  const servings = recipe.servings || 1;
  const grams = from ? Math.round(from.grams * (option.ratio ?? 1)) : null;

  const ingredients = recipe.ingredients.map((line, i) => (i === index
    ? { name: option.name, qty: grams ? `${grams * servings} g` : line.qty }
    : line));

  const name = rename(recipe.name, ingredientName, option.name);
  const base = {
    ...recipe,
    id: `${slug(name)}-swap`,
    name,
    ingredients,
    tags: retag(recipe, ingredients),
    variantOf: recipe.variantOf || recipe.id,
    swaps: [...(recipe.swaps || []), { from: ingredientName, to: option.name, why: option.why }],
    signature: false,
  };

  if (!from || !to) return { ...base, recalculated: false };

  const delta = (key) => (to.per100[key] || 0) * (grams / 100) - (from.per100[key] || 0) * (from.grams / 100);
  const kcal = Math.max(0, Math.round(recipe.kcal + delta('kcal')));
  const protein = Math.max(0, Math.round(recipe.protein + delta('protein')));
  const carbs = Math.max(0, Math.round(recipe.carbs + delta('carbs')));
  const fat = Math.max(0, Math.round(recipe.fat + delta('fat')));
  const fibre = Math.max(0, round1(recipe.fibre + delta('fibre')));
  const costDelta = (to.price || 0) * (grams / 100) - (from.price || 0) * (from.grams / 100);
  return {
    ...base,
    kcal,
    protein,
    carbs,
    fat,
    fibre,
    costPerServing: Math.max(0.35, Math.round((recipe.costPerServing + costDelta) * 100) / 100),
    recalculated: true,
  };
};

export const swapsForDiet = (recipe, diet) =>
  (recipe.ingredients || [])
    .map((i) => {
      const option = substitutesFor(i.name).find((o) => o.for.includes(diet));
      return option ? { ingredient: i.name, option } : null;
    })
    .filter(Boolean);

export const makeItFit = (recipe, diet) =>
  swapsForDiet(recipe, diet).reduce((acc, { ingredient, option }) => applySwap(acc, ingredient, option), recipe);

/**
 * After a swap (or import), re-check the dish against the user's full safety
 * context so AI generation / substitutions never hand back a blocker.
 */
export const suitabilityAfterSwap = (recipe, context = {}) =>
  evaluateFoodSuitability(recipe, suitabilityContextFrom(context));

/* ---------- Dislikes → substitutions ---------- */

/**
 * If a dish contains something a household member dislikes, offer the
 * substitute the app already knows — the same table that makes a dish vegan
 * makes it "without the thing nobody will eat". Only swaps with a `why` are
 * offered; a dislike is never silently removed.
 */
export const dislikeSwapsFor = (recipe, dislikes = []) => {
  const terms = dislikes.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  if (!terms.length || !recipe?.ingredients?.length) return [];
  return recipe.ingredients
    .map((line) => {
      const name = String(line.name || '').trim();
      const disliked = terms.find((term) => name.toLowerCase().includes(term));
      if (!disliked) return null;
      const options = substitutesFor(name);
      return options.length ? { ingredient: name, disliked, options } : null;
    })
    .filter(Boolean);
};

/* ---------- Nutrition ---------- */

/**
 * How much the app can trust a dish's nutrition. A catalogue or label figure
 * is 'label'; one computed from matched ingredients is 'estimated' with the
 * matched share; a recipe with no ingredient match at all is 'unknown'.
 */
export const nutritionConfidence = (recipe) => {
  if (!recipe) return { kind: 'unknown', label: 'Unknown — no nutrition recorded.' };
  const matched = recipe.ingredients && recipe.ingredients.length
    ? Math.round((recipe.ingredients.filter((i) => partByName(i.name)).length / recipe.ingredients.length) * 100)
    : 0;
  if (recipe.signature || recipe.per100 || recipe.nutritionSource === 'label') {
    return { kind: 'label', label: 'From the recipe book / label — a stated figure, not an estimate.' };
  }
  if (matched >= 70) {
    return { kind: 'estimated', label: `Estimated from ingredients (${matched}% matched to food tables).` };
  }
  if (matched > 0) {
    return { kind: 'estimated', label: `Roughly estimated — only ${matched}% of ingredients matched food tables.` };
  }
  return { kind: 'unknown', label: 'Unknown — no ingredient nutrition was matched.' };
};

export const macroSplit = ({ protein = 0, carbs = 0, fat = 0 }) => {
  const parts = {
    protein: protein * KCAL_PER_G.protein,
    carbs: carbs * KCAL_PER_G.carbs,
    fat: fat * KCAL_PER_G.fat,
  };
  const total = parts.protein + parts.carbs + parts.fat;
  if (!total) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((parts.protein / total) * 100),
    carbs: Math.round((parts.carbs / total) * 100),
    fat: Math.round((parts.fat / total) * 100),
  };
};

export const recipeNutrition = (recipe, catalogue) => {
  const per100 = estimateRecipeMicros(recipe, catalogue);
  const lines = recipe.ingredients.length;
  const totals = { kcal: recipe.kcal, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat, fibre: recipe.fibre };
  if (per100) {
    const factor = per100.kcal ? recipe.kcal / per100.kcal : 0;
    for (const key of NUTRIENT_KEYS) {
      if (key in totals) continue;
      totals[key] = Math.round((per100[key] || 0) * factor * 100) / 100;
    }
  }
  return {
    totals,
    split: macroSplit(recipe),
    estimated: Boolean(per100),
    matched: per100 ? Math.round((recipe.ingredients.filter((i) => partByName(i.name)).length / Math.max(1, lines)) * 100) : 0,
  };
};

/* ---------- Searching and filtering ---------- */

const hasIngredient = (recipe, term) => {
  const t = String(term).toLowerCase().trim();
  if (!t) return false;
  return recipe.ingredients.some((i) => i.name.toLowerCase().includes(t))
    || recipe.name.toLowerCase().includes(t);
};

export const missingFrom = (recipe, have = []) => {
  const stock = have.map((n) => String(n).toLowerCase()).filter(Boolean);
  return recipe.ingredients.filter((i) => {
    const name = i.name.toLowerCase();
    return !stock.some((h) => h.includes(name) || name.includes(h));
  });
};

/**
 * One query over the library. When `suitabilityCtx` is provided, hard blocks
 * (allergens, religious, diet patterns, household) are applied by the central
 * engine. Extra `diets` in the filter still work for one-off search filters.
 */
export const searchRecipes = (pool = [], {
  query = '', diets = [], maxTime = null, include = [], exclude = [], have = [], maxMissing = null,
  suitabilityCtx = null,
} = {}) => {
  const q = query.trim().toLowerCase();
  const ctx = suitabilityCtx ? suitabilityContextFrom(suitabilityCtx) : null;
  return pool.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q)
      || r.cuisine.toLowerCase().includes(q)
      || r.tags.some((t) => t.includes(q))
      || r.ingredients.some((i) => i.name.toLowerCase().includes(q)))) return false;
    if (maxTime && r.time > maxTime) return false;
    if (include.length && !include.every((t) => hasIngredient(r, t))) return false;
    if (exclude.length && exclude.some((t) => hasIngredient(r, t))) return false;
    if (maxMissing !== null && missingFrom(r, have).length > maxMissing) return false;
    if (ctx && !evaluateFoodSuitability(r, ctx).allowed) return false;
    if (diets.length && !recipeAllowed(r, diets)) return false;
    return true;
  });
};

/* ---------- Keeping an imported recipe ---------- */

const VIDEO_HOST = /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com\/reel)/i;

export const isVideoLink = (url) => VIDEO_HOST.test(String(url || ''));

export const safeExternalUrl = (value) => {
  const text = String(value || '').trim();
  try {
    const parsed = new URL(text);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

export const recipeFromImport = (result, { text = '', url = '', provenance = {} } = {}) => {
  const known = new Set((result.ingredients || []).map((i) => (i.line || '').trim()));
  const source = safeExternalUrl(url);
  const steps = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 30 && !known.has(l) && !/^serves?\b/i.test(l) && l !== result.title)
    .map((line) => ({ text: line }));

  const per = result.perServing || {};
  const servings = Math.max(1, Number(result.servings) || 1);
  const importedAt = new Date().toISOString();
  const unread = Array.isArray(result.unread) ? result.unread.slice(0, 30).map(String) : [];
  // Honest about what the import actually captured: a recipe with no method
  // line, or ingredient lines it couldn't parse, is 'partial', never full.
  const confidence = steps.length > 0 && (result.ingredients || []).length > 0 && !unread.length
    ? 'full'
    : 'partial';
  return {
    id: `mine-${slug(result.title)}`,
    name: result.title,
    emoji: '🍽️',
    meal: 'dinner',
    cuisine: result.domain ? result.domain.replace(/^www\./, '') : 'Yours',
    tags: ['imported'],
    time: 30,
    prep: 10,
    difficulty: 'Easy',
    servings,
    kcal: Math.round(per.kcal || 0),
    protein: Math.round(per.protein || 0),
    carbs: Math.round(per.carbs || 0),
    fat: Math.round(per.fat || 0),
    fibre: round1(per.fibre || 0),
    costPerServing: 0,
    healthScore: 60,
    proteinScore: 50,
    envScore: 60,
    ingredients: (result.ingredients || []).map((i) => ({
      name: i.food?.name || i.name || i.line,
      qty: i.food && i.grams ? `${Math.round(i.grams * servings)} g` : (i.line || ''),
    })),
    steps: steps.length
      ? steps
      : [{ text: 'No method came with this import — paste the steps in as well and they’ll appear here.' }],
    source: source || null,
    video: isVideoLink(source) ? source : undefined,
    imported: true,
    importedAt,
    confidence,
    unread,
    // Where the import came from, when it was published and who wrote it —
    // read off the page's own schema.org data, never invented.
    provenance: {
      author: provenance.author || null,
      datePublished: provenance.datePublished || null,
      yield: provenance.yield || null,
    },
  };
};

/** Evaluate an imported / shared recipe against the user's safety context. */
export const importSuitability = (recipe, context = {}) =>
  evaluateFoodSuitability(recipe, suitabilityContextFrom(context));

/* ---------- Sharing ---------- */

const FIELDS = ['name', 'emoji', 'cuisine', 'meal', 'tags', 'time', 'prep', 'difficulty', 'servings',
  'kcal', 'protein', 'carbs', 'fat', 'fibre', 'healthScore', 'proteinScore', 'envScore',
  'ingredients', 'steps', 'source', 'video'];

const toBase64 = (text) => (typeof btoa === 'function'
  ? btoa(unescape(encodeURIComponent(text)))
  : Buffer.from(text, 'utf8').toString('base64'));

const fromBase64 = (text) => (typeof atob === 'function'
  ? decodeURIComponent(escape(atob(text)))
  : Buffer.from(text, 'base64').toString('utf8'));

export const shareCode = (recipe, by = '') => {
  const payload = { v: 1, by, r: Object.fromEntries(FIELDS.filter((f) => recipe[f] !== undefined).map((f) => [f, recipe[f]])) };
  return `FORQ1:${toBase64(JSON.stringify(payload))}`;
};

export const parseShareCode = (code) => {
  const text = String(code || '').trim();
  if (!text.startsWith('FORQ1:')) return { recipe: null, error: 'That doesn’t look like a Forq recipe code.' };
  let payload;
  try {
    payload = JSON.parse(fromBase64(text.slice(6)));
  } catch {
    return { recipe: null, error: 'That code is damaged — ask for it again.' };
  }
  const r = payload?.r;
  if (!r?.name || !Array.isArray(r.ingredients) || !Array.isArray(r.steps) || !r.ingredients.length) {
    return { recipe: null, error: 'That code doesn’t contain a full recipe.' };
  }
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const source = safeExternalUrl(r.source);
  const video = safeExternalUrl(r.video);
  return {
    error: null,
    recipe: {
      ...r,
      id: `shared-${slug(r.name)}`,
      name: String(r.name).slice(0, 80),
      emoji: r.emoji || '🍽️',
      cuisine: r.cuisine || 'Shared',
      meal: ['breakfast', 'lunch', 'dinner'].includes(r.meal) ? r.meal : 'dinner',
      tags: Array.isArray(r.tags) ? r.tags.slice(0, 12).map(String) : [],
      time: num(r.time, 30),
      prep: num(r.prep, 10),
      difficulty: r.difficulty || 'Easy',
      servings: Math.max(1, num(r.servings, 2)),
      kcal: num(r.kcal),
      protein: num(r.protein),
      carbs: num(r.carbs),
      fat: num(r.fat),
      fibre: num(r.fibre),
      healthScore: num(r.healthScore, 60),
      proteinScore: num(r.proteinScore, 50),
      envScore: num(r.envScore, 60),
      costPerServing: num(r.costPerServing, 0),
      ingredients: r.ingredients.slice(0, 40).map((i) => ({ name: String(i.name || '').slice(0, 60), qty: String(i.qty || '') })),
      steps: r.steps.slice(0, 30).map((s) => ({ text: String(s.text || '').slice(0, 400), timerMins: s.timerMins ? num(s.timerMins) : undefined })),
      source: source || null,
      video: video || undefined,
      sharedBy: payload.by ? String(payload.by).slice(0, 40) : '',
      shared: true,
    },
  };
};
