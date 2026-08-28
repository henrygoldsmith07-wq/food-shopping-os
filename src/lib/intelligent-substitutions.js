import { substitutesFor } from '../data/substitutions.js';
import { evaluateFoodSuitability, suitabilityContextFrom } from './food-suitability.js';
import { partByName } from '../data/recipe-parts.js';

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
