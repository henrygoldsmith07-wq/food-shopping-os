/**
 * How many portions the household eats, and what that means for quantities.
 *
 * The configured household size is the baseline. When recorded outcomes say
 * the household consistently eats a different amount — at least three cooks
 * with portions recorded, and at least half a portion away from the setting
 * — the learned appetite wins, so quantities follow what actually gets
 * eaten rather than what the profile says. Every list path reads this one
 * decision, so the plan generator, the plan tab, the reconcile pass and the
 * week loop cannot disagree about how much to buy.
 */

import { isAdaptationHeld } from './adaptation-suppression.js';

/** Portion numbers from recorded cooks, in order. */
export const portionsFromCooked = (cooked = []) => (Array.isArray(cooked) ? cooked : [])
  .map((event) => Number(event?.portionsEaten ?? event?.portions))
  .filter((n) => Number.isFinite(n) && n > 0);

/**
 * The household's portions: `configured` by default, `learned` when the
 * evidence is strong enough. Reads the derived preference profile when the
 * caller has one, and falls back to raw cooked events otherwise, so a
 * plain-state caller gets the same answer as the app.
 *
 * The household can override: `portionsOverride` set to `"auto"` (or unset)
 * follows the decision above; a number is what the household says, period —
 * learned appetite never moves the list against an explicit choice. The
 * result carries the appetite evidence and what automatic would say
 * (`autoPortions`, `autoLearned`) either way, so a UI can show how far the
 * learning has got and what is being overridden.
 */
export const householdPortionsFor = (source = {}) => {
  const configured = Math.max(1, Number(source.portions) || Number(source.household) || 1);
  const learned = source.householdPreferences?.portions;
  let observations = Number(learned?.observations) || 0;
  let typical = Number(learned?.typical);
  if (!observations) {
    const patterns = portionsFromCooked(source.cooked);
    observations = patterns.length;
    typical = patterns.length ? patterns.reduce((sum, n) => sum + n, 0) / patterns.length : NaN;
  }
  const evidence = { observations, typical: Number.isFinite(typical) ? typical : null };
  // Suppression: a household that undid the learned-appetite change gets
  // the configured portions until the rejection's own clock clears it —
  // regeneration never re-applies a rejected adaptation (see
  // adaptation-suppression.js). Callers pass state (or a derived app view
  // of it) with `.day` for the recency clock.
  const suppressed = isAdaptationHeld(source, 'portions', { today: source?.day || null });
  const learnedApplies = !suppressed && observations >= 3 && evidence.typical > 0
    && Math.abs(evidence.typical - configured) >= 0.5;
  const autoPortions = learnedApplies ? Math.max(1, Math.round(evidence.typical * 2) / 2) : configured;
  const autoLearned = learnedApplies && autoPortions !== configured;
  const override = source.portionsOverride === 'auto' || source.portionsOverride == null
    ? 'auto'
    : Math.max(1, Math.round(Number(source.portionsOverride)));
  if (override !== 'auto') {
    return { portions: override, source: 'configured', configured, override, evidence, autoPortions, autoLearned };
  }
  if (autoLearned) {
    return { portions: autoPortions, source: 'learned', configured, override, evidence, autoPortions, autoLearned };
  }
  return { portions: configured, source: 'configured', configured, override, evidence, autoPortions, autoLearned };
};

/** Scale a free-text qty by a factor (e.g. 2 people / 1 serving). */
export const scaleQty = (qty, factor = 1) => {
  if (!qty || !(factor > 0) || Math.abs(factor - 1) < 0.05) return qty || '';
  const text = String(qty).trim();
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return text;
  const n = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(n)) return text;
  const scaled = Math.round(n * factor * 10) / 10;
  const unit = (m[2] || '').trim();
  return unit ? `${scaled} ${unit}` : String(scaled);
};

/**
 * Per-recipe scaling factors: a recipe's quantities are written for its own
 * serving count, so the factor is household portions ÷ written servings.
 */
export const recipePortionFactors = (entries = [], people = 1) => {
  const factors = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const recipe = entry?.recipe;
    if (!recipe?.name) continue;
    const servings = Number(recipe.servings) || 1;
    factors.set(recipe.name, people / servings);
  }
  return factors;
};

/**
 * Scale a list to the household's portions. Only plan-derived rows (those
 * carrying `fromRecipe`) scale — a staple or a manually requested item is
 * already the amount the household means. A plan row whose recipe is not in
 * the factor map is treated as written for one serving.
 */
export const scaleListToPortions = (items, people = 1, factors = new Map()) =>
  (Array.isArray(items) ? items : []).map((item) => {
    if (!item?.fromRecipe) return item;
    const factor = factors.get(item.fromRecipe) || people;
    return { ...item, qty: scaleQty(item.qty, factor) };
  });
