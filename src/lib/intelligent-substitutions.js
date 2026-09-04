import { substitutesFor } from '../data/substitutions.js';
import { evaluateFoodSuitability, suitabilityContextFrom } from './food-suitability.js';
import { pantryAvailability } from './kitchen.js';
import { canonicalName, sameIngredient } from './aliases.js';
import { addQuantities, parseQuantity, scaleQuantity, sufficientFor } from './measure.js';
import { partByName } from '../data/recipe-parts.js';
import { applySwap } from './recipe-tools.js';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const text = (value) => String(value || '').toLowerCase();
const priceOf = (item) => Number(item?.price ?? item?.cost ?? item?.latestPrice ?? 0) || 0;
const nutrients = (item) => item?.per100 || item?.nutrition || {};

const nutritionSimilarity = (from, to) => {
  const a = nutrients(from);
  const b = nutrients(to);
  const keys = ['kcal', 'protein', 'carbs', 'fat'];
  const known = keys.filter((key) => Number.isFinite(Number(a[key])) && Number.isFinite(Number(b[key])));
  if (!known.length) return { score: 0.5, label: 'nutrition not fully known' };
  const differences = known.map((key) => Math.min(1, Math.abs(Number(a[key]) - Number(b[key])) / Math.max(1, Math.abs(Number(a[key])))));
  const score = 1 - differences.reduce((sum, value) => sum + value, 0) / differences.length;
  return { score: Math.max(0, score), label: `${Math.round(score * 100)}% nutritional similarity` };
};

const recipeCompatibility = (recipe, from, to, option) => {
  const ingredientNames = (recipe?.ingredients || []).map((item) => text(item.name || item));
  const recipeText = text(recipe?.name) + ' ' + ingredientNames.join(' ');
  const compatible = option.recipeCompatible === false ? false : option.recipeCompatible === true || !option.incompatibleWith?.some((term) => recipeText.includes(text(term)));
  return { score: compatible ? 1 : 0, compatible };
};

const preferenceScore = (candidate, context) => {
  const fit = evaluateFoodSuitability(candidate, context);
  if (!fit.allowed) return { score: 0, fit };
  return { score: 1 - Math.min(0.5, fit.warnings.length * 0.12) + Math.min(0.25, fit.preferences.length * 0.08), fit };
};

/**
 * Rank only defensible substitutions. Dietary blockers are hard exclusions;
 * recipe fit, household preference, nutritional similarity and price improvement
 * are scored separately and returned as evidence.
 */
export const rankSubstitutions = (recipe, ingredient, candidates = null, context = {}) => {
  const source = typeof ingredient === 'string'
    ? (recipe?.ingredients || []).find((item) => text(item.name || item) === text(ingredient)) || { name: ingredient }
    : ingredient || {};
  const options = candidates || substitutesFor(source.name);
  const ctx = suitabilityContextFrom(context);
  const baselinePrice = priceOf(source) || priceOf(partByName(source.name));
  return options.map((option) => {
    const candidate = { ...option, name: option.name || option.label };
    const fit = preferenceScore(candidate, ctx);
    const compatibility = recipeCompatibility(recipe, source, candidate, option);
    const nutrition = nutritionSimilarity(source, candidate);
    const candidatePrice = priceOf(candidate);
    const saving = baselinePrice > 0 && candidatePrice > 0 ? round(baselinePrice - candidatePrice) : null;
    const priceScore = saving === null ? 0.5 : saving > 0 ? Math.min(1, 0.5 + saving / Math.max(1, baselinePrice)) : Math.max(0, 0.5 + saving / Math.max(1, baselinePrice));
    const score = compatibility.score * 0.3 + fit.score * 0.25 + nutrition.score * 0.2 + priceScore * 0.25;
    return {
      ...candidate,
      score: round(score),
      safe: fit.fit.allowed && compatibility.compatible,
      confidence: fit.fit.confidence,
      saving,
      evidence: {
        recipeCompatible: compatibility.compatible,
        dietaryCompatible: fit.fit.allowed,
        householdFit: round(fit.score),
        nutritionSimilarity: round(nutrition.score),
        priceImprovement: saving === null ? 'unknown' : saving > 0,
      },
      rationale: [
        compatibility.compatible ? 'works in this recipe' : 'may not work in this recipe',
        fit.fit.allowed ? 'fits household dietary rules' : 'blocked by dietary rules',
        nutrition.label,
        saving > 0 ? `saves approximately £${saving.toFixed(2)}` : saving === null ? 'price improvement unverified' : 'not cheaper',
      ].join(' · '),
    };
  }).filter((candidate) => candidate.safe).sort((a, b) => b.score - a.score);
};

export const bestSubstitution = (recipe, ingredient, candidates, context = {}) => {
  const ranked = rankSubstitutions(recipe, ingredient, candidates, context);
  const best = ranked[0] || null;
  return { ingredient: typeof ingredient === 'string' ? ingredient : ingredient?.name, best, candidates: ranked, recommendation: best ? `${best.name} ${best.saving > 0 ? `saves approximately £${best.saving.toFixed(2)}` : 'is a practical alternative'} and ${best.rationale}.` : null };
};

const pantryRead = (name, need, {
  pantry = [], today = '', learnedAliases = {},
} = {}) => {
  const rows = (Array.isArray(pantry) ? pantry : []).filter((item) => {
    const stockedName = typeof item === 'string' ? item : item?.name;
    return sameIngredient(stockedName, name, learnedAliases);
  });
  if (!rows.length) return { state: 'missing', rows };
  if (rows.some((item) => typeof item === 'string')) return { state: 'available', rows };

  const key = canonicalName(name, learnedAliases);
  const definite = rows.filter((item) => pantryAvailability(item, today) === 'confirmed_sufficient');
  const uncertain = rows.filter((item) => pantryAvailability(item, today) !== 'confirmed_sufficient');
  if (!definite.length) return { state: uncertain.length ? 'uncertain' : 'missing', rows };
  if (!need) return { state: 'available', rows };

  const required = typeof need === 'object' ? need : parseQuantity(need, { ingredient: key });
  if (!required) return { state: 'available', rows };

  let total = null;
  let unreadable = false;
  let incomparable = false;
  for (const item of definite) {
    // Existing pantry semantics deliberately count definite stock with no
    // amount as present. Keep that honest name-level fallback rather than
    // inventing a quantity just to make automatic substitutions possible.
    if (!String(item.qty || '').trim()) return { state: 'available', rows };
    const parsed = parseQuantity(item.qty, { ingredient: key });
    if (!parsed) {
      unreadable = true;
      continue;
    }
    if (!total) total = parsed;
    else {
      total = addQuantities(total, parsed, { ingredient: key });
      if (!total) incomparable = true;
    }
  }

  if (total) {
    const enough = sufficientFor(total, required, { ingredient: key });
    if (enough === true) return { state: 'available', rows, quantity: total };
    if (enough === false && !uncertain.length) return { state: 'missing', rows, quantity: total };
  }
  return { state: uncertain.length || unreadable || incomparable ? 'uncertain' : 'missing', rows, quantity: total };
};

/**
 * Estimate the amount of a replacement needed for the same dish. Measured
 * recipe lines keep their own amount and apply the substitution ratio. Bare
 * counts use the known recipe-part serving size; an unrecognised line remains
 * unmeasured, so a candidate without a quantity can still be used but a made-up
 * weight cannot be required.
 */
const replacementNeed = (line, option, recipe, learnedAliases = {}) => {
  const ratio = Number(option?.ratio ?? 1) || 1;
  const sourceKey = canonicalName(line?.name, learnedAliases);
  const parsed = parseQuantity(line?.qty, { ingredient: sourceKey });
  if (parsed && (parsed.dim === 'mass' || parsed.dim === 'volume')) {
    return scaleQuantity(parsed, ratio);
  }
  const source = partByName(line?.name);
  const servings = Math.max(1, Number(recipe?.servings) || 1);
  if (source && (parsed?.dim === 'count' || !line?.qty)) {
    return {
      amount: Math.round(source.grams * servings * ratio * 100) / 100,
      dim: 'mass',
      unit: 'g',
      confidence: 'approximate',
    };
  }
  return parsed ? scaleQuantity(parsed, ratio) : null;
};

const optionsFor = (line, { candidates, candidatesByIngredient } = {}) => {
  const byName = candidatesByIngredient || {};
  const name = String(line?.name || '');
  const key = canonicalName(name);
  return byName[name] || byName[key] || candidates || substitutesFor(name);
};

/**
 * Automatically adapt a recipe only when the original ingredient is definitely
 * missing and a safe equivalent is already available in the pantry. Unknown or
 * probable stock is never treated as absent, and a candidate that would break
 * the household safety rules is never applied.
 *
 * The returned recipe is a normal recipe variant: servings, time, method and
 * every unrelated property survive `applySwap`; nutrition/cost/tags are
 * recalculated where both food parts are known. When no defensible swap exists,
 * the original recipe is returned unchanged with an explanation for the UI.
 */
export const autoSubstituteRecipe = (recipe, options = {}, maybeContext = {}) => {
  const config = Array.isArray(options)
    ? { ...maybeContext, pantry: options }
    : (options || {});
  const pantry = Array.isArray(config.pantry) ? config.pantry : [];
  const today = config.today || config.context?.today || '';
  const learnedAliases = config.learnedAliases || config.context?.learnedAliases || {};
  const context = suitabilityContextFrom({ ...(config.context || {}), today });
  if (!recipe?.ingredients?.length || !pantry.length) {
    return { recipe, changed: false, substitutions: [], unresolved: [] };
  }

  let adapted = recipe;
  const substitutions = [];
  const unresolved = [];

  for (let index = 0; index < recipe.ingredients.length; index += 1) {
    const line = adapted.ingredients[index];
    if (!line?.name) continue;
    const originalRead = pantryRead(line.name, line.qty, { pantry, today, learnedAliases });
    const sourceFit = evaluateFoodSuitability({ name: line.name }, context);
    const sourceNeedsSwap = !sourceFit.allowed;
    if (!sourceNeedsSwap && originalRead.state === 'available') continue;
    if (!sourceNeedsSwap && originalRead.state === 'uncertain') {
      unresolved.push({ ingredient: line.name, reason: 'stock-uncertain', detail: 'Pantry evidence is not definite enough to replace automatically.' });
      continue;
    }

    const ranked = rankSubstitutions(adapted, line, optionsFor(line, config), context);
    const available = ranked.filter((option) => {
      const need = replacementNeed(line, option, adapted, learnedAliases);
      return pantryRead(option.name, need, { pantry, today, learnedAliases }).state === 'available';
    });
    let applied = null;
    for (const option of available) {
      const candidate = applySwap(adapted, line.name, option);
      const fit = evaluateFoodSuitability(candidate, context);
      if (!fit.allowed) continue;
      adapted = candidate;
      applied = option;
      break;
    }

    if (!applied) {
      unresolved.push({
        ingredient: line.name,
        reason: ranked.length ? 'no-safe-available-substitution' : 'no-known-substitution',
        candidates: ranked.map((option) => option.name),
      });
      continue;
    }
    substitutions.push({
      from: line.name,
      to: applied.name,
      why: applied.why || applied.rationale || 'Safe pantry alternative',
      confidence: applied.confidence || context.confidence,
      need: replacementNeed(line, applied, recipe, learnedAliases),
      evidence: applied.evidence,
    });
  }

  return {
    recipe: substitutions.length > 0
      ? {
        ...adapted,
        autoSubstituted: true,
        substitutionSource: 'pantry',
        autoSubstitutions: substitutions,
      }
      : recipe,
    changed: substitutions.length > 0,
    substitutions,
    unresolved,
  };
};

// A descriptive alias for callers that think in terms of missing ingredients.
export const substituteUnavailableIngredients = autoSubstituteRecipe;
