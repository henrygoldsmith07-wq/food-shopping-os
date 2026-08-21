/**
 * Choosing which recipes first-run setup offers you.
 *
 * Setup used to name the same three dishes for everyone, which meant a vegan
 * was shown a chicken traybake on their first screen. What is offered is now
 * worked out from what has already been said, in a fixed order of authority:
 *
 *   1. **Hard restrictions** — allergens and observed religious rules, yours
 *      and every household member's. These remove a recipe. It is never shown
 *      greyed out with a warning, because a disabled unsafe recipe is still an
 *      unsafe recipe on the screen.
 *   2. **Dietary patterns** — vegan, vegetarian, pescatarian, gluten-free and
 *      the rest, again pooled across the household.
 *   3. **Preferences**, which only reorder what survived: ingredient-data
 *      confidence first, then a set that has something cheap in it, something
 *      fast, and something built from cupboard staples.
 *
 * Nothing below relaxes 1 or 2 to reach a count. If the rules leave fewer than
 * six dishes, fewer than six are offered and the caller is told why.
 */

import { RECIPES } from '../data/recipes.js';
import { partByName } from '../data/recipe-parts.js';
import { CATALOGUE } from '../data/foods.js';
import { DIET_PATTERNS, dietPattern } from '../data/goals.js';
import { religiousBy } from '../data/preferences.js';
import { evaluateFoodSuitability, suitabilityContextFrom } from './food-suitability.js';

/** How many suitable dishes setup aims to put in front of you. */
export const STARTER_OPTION_COUNT = 6;

/** How many of them you can take into your first week. */
export const MAX_STARTER_PICKS = 3;

const DIET_IDS = new Set(DIET_PATTERNS.map((d) => d.id));
const RELIGIOUS_IDS = new Set(Object.keys(religiousBy));

const CHEAP_PER_SERVING = 1.5;
const FAST_MINUTES = 25;
const STAPLE_SHARE = 0.5;
const CONFIDENT = 0.75;

/**
 * Ingredients most kitchens already hold. Deliberately a short list of things
 * that keep: a "cupboard meal" you have to shop for is not one.
 */
const STAPLES = /\b(rice|pasta|noodles?|spaghetti|penne|couscous|lentils?|beans?|chickpeas?|tinned|tin|tomatoes|passata|stock|oil|olive oil|onions?|garlic|ginger|flour|oats|sugar|honey|soy sauce|vinegar|salt|pepper|spice|paprika|cumin|curry (paste|powder)|oregano|thyme|chilli|coconut milk|peanut butter|tahini|eggs?|frozen)\b/i;

const catalogueNames = new Set(CATALOGUE.map((food) => String(food.name || '').toLowerCase()));

const ingredientNames = (recipe) => (recipe?.ingredients || [])
  .map((line) => (typeof line === 'string' ? line : line?.name))
  .filter(Boolean);

/** Does the app hold real nutrition data for this ingredient line? */
const known = (name) => {
  const key = String(name).trim().toLowerCase();
  if (partByName(key)) return true;
  if (catalogueNames.has(key)) return true;
  // "Chickpeas (tins)" and "Chicken thighs" should both find their food; a
  // straight equality check on a shopping-list phrasing would not.
  return [...catalogueNames].some((food) => food.length > 3 && (key.includes(food) || food.includes(key)));
};

/** An amount we can actually scale — "600g" yes, "thumb" no. */
const quantified = (line) => /\d/.test(String((typeof line === 'string' ? '' : line?.qty) || ''));

/**
 * How much of a recipe we genuinely know, 0–1: the share of its ingredients
 * that resolve to real food data, and the share carrying a usable amount.
 *
 * This is what makes the filters above worth trusting — a recipe whose
 * ingredients the app cannot recognise is a recipe whose allergens it cannot
 * see either, so those sink rather than lead.
 */
export const ingredientConfidence = (recipe) => {
  const lines = recipe?.ingredients || [];
  if (!lines.length) return 0;
  const names = ingredientNames(recipe);
  const resolved = names.filter(known).length / lines.length;
  const amounts = lines.filter(quantified).length / lines.length;
  return Math.round((resolved * 0.7 + amounts * 0.3) * 100) / 100;
};

/** The share of a recipe's ingredients that are cupboard staples. */
export const stapleShare = (recipe) => {
  const names = ingredientNames(recipe);
  if (!names.length) return 0;
  return names.filter((name) => STAPLES.test(name)).length / names.length;
};

/**
 * Everyone's rules in one place. Household members carry their own diets, and
 * a pattern anybody in the house keeps applies to a meal everybody eats.
 */
export const householdRules = ({ diets = [], members = [], prefs = {} } = {}) => {
  const memberDiets = members.flatMap((member) => member?.diets || []);
  const all = [...new Set([...diets, ...memberDiets])];
  return {
    patterns: all.filter((id) => DIET_IDS.has(id)),
    fromMembers: memberDiets.length > 0,
    prefs,
    /* The one engine every surface asks. Setup does not re-implement the rules
       — a screen that decides for itself what is safe is a second answer to a
       question that must only have one. A religious rule set on a member is as
       hard a line as one set on you, which the context below folds in. */
    context: suitabilityContextFrom({
      allergies: prefs.allergies || [],
      intolerances: prefs.intolerances || [],
      religious: [...new Set([...(prefs.religious || []), ...all.filter((id) => RELIGIOUS_IDS.has(id))])],
      diets,
      members,
      cuisines: prefs.cuisines || [],
      skill: prefs.skill || null,
      timeBudget: prefs.timeBudget || null,
    }),
  };
};

/** Hard lines (allergen, observed rule) as opposed to a dietary pattern. */
const HARD = new Set(['allergy', 'religious']);
const blockedKinds = (recipe, context) =>
  evaluateFoodSuitability(recipe, context).blockers.map((blocker) => blocker.kind);

const list = (items) => (items.length < 2
  ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * Is this dish allowed at all? The two hard stages only — used to check a dish
 * chosen in an earlier round still passes rules that have changed since.
 */
export const starterSuitable = (recipe, { diets = [], members = [], prefs = {} } = {}) => {
  if (!recipe) return false;
  return evaluateFoodSuitability(recipe, householdRules({ diets, members, prefs }).context).allowed;
};

/** Why this dish is on the list — plain sentences, not a score. */
const reasonsFor = (recipe, { patterns, prefs, fromMembers }) => {
  const reasons = [];
  // Only the patterns that actually rule ingredients in or out are named here.
  // "Fits keto" on a chickpea curry would be a claim this filter never made.
  const labels = patterns
    .map(dietPattern)
    .filter((pattern) => pattern?.kind === 'exclude')
    .map((pattern) => pattern.label.toLowerCase());
  if (labels.length) {
    reasons.push(`Fits ${list(labels)}${fromMembers ? ', for everyone you cook for' : ''}`);
  }
  if ((prefs.allergies || []).length || (prefs.religious || []).length) {
    reasons.push('Clear of everything you asked us to avoid');
  }
  if (recipe.costPerServing <= CHEAP_PER_SERVING) reasons.push(`£${recipe.costPerServing.toFixed(2)} a serving`);
  if (recipe.time <= FAST_MINUTES) reasons.push(`On the table in ${recipe.time} minutes`);
  if (stapleShare(recipe) >= STAPLE_SHARE) reasons.push('Mostly cupboard staples');
  if (ingredientConfidence(recipe) >= CONFIDENT) reasons.push('Ingredients we hold real nutrition data for');
  if (!reasons.length) reasons.push(`${recipe.cuisine} · ${recipe.time} min · ${recipe.kcal} kcal a serving`);
  return reasons;
};

/** Ranking among dishes that are already suitable. Preference, never safety. */
const baseScore = (recipe, patterns) => {
  const prefers = patterns.map(dietPattern).filter((p) => p?.prefer);
  // Confidence leads deliberately, and nothing here outweighs it — including
  // being one of the hand-written signature dishes. A dish whose ingredients
  // the app can read is a dish it can filter honestly, which is the point.
  return ingredientConfidence(recipe) * 5
    + prefers.filter((p) => p.prefer(recipe)).length
    + (recipe.healthScore || 0) / 100;
};

/** How much this dish repeats one already chosen — cuisine, ingredients, tags. */
const similarity = (recipe, chosen) => {
  const names = new Set(ingredientNames(recipe).map((n) => n.toLowerCase()));
  return chosen.reduce((penalty, other) => {
    const shared = ingredientNames(other).filter((n) => names.has(n.toLowerCase())).length;
    const tags = (recipe.tags || []).filter((t) => (other.tags || []).includes(t)).length;
    return penalty
      + (recipe.cuisine === other.cuisine ? 2 : 0)
      + (shared >= 3 ? 2 : 0)
      + (tags >= 3 ? 1 : 0);
  }, 0);
};

const QUOTAS = [
  { id: 'cheap', met: (r) => r.costPerServing <= CHEAP_PER_SERVING },
  { id: 'fast', met: (r) => r.time <= FAST_MINUTES },
  { id: 'staples', met: (r) => stapleShare(r) >= STAPLE_SHARE },
];

/**
 * Take `count` from a ranked pool: best first, penalised for repeating what is
 * already picked, and pulled towards the cheap/fast/cupboard trio as the slots
 * run out. Deterministic — the same inputs give the same six.
 */
const selectSet = (pool, count, patterns) => {
  const chosen = [];
  const left = [...pool];
  while (chosen.length < count && left.length) {
    const slotsLeft = count - chosen.length;
    const unmet = QUOTAS.filter((q) => !chosen.some((r) => q.met(r)));
    // Only force a quota once there are exactly as many slots left as gaps.
    const pressing = slotsLeft <= unmet.length;
    const score = (recipe) => baseScore(recipe, patterns)
      - similarity(recipe, chosen)
      + unmet.filter((q) => q.met(recipe)).length * (pressing ? 10 : 0.75);
    let best = 0;
    left.forEach((recipe, index) => { if (score(recipe) > score(left[best])) best = index; });
    chosen.push(left.splice(best, 1)[0]);
  }
  return chosen;
};

/**
 * "Show me different choices" has to actually change the answer, so each round
 * is selected from what the rounds before it did not use. Once the suitable
 * dishes run out it starts again from the best of them rather than showing an
 * empty screen — the rules are never loosened to fill a round.
 */
const roundOf = (ranked, count, round, patterns) => {
  let pool = [...ranked];
  let picked = [];
  for (let index = 0; index <= round; index += 1) {
    if (pool.length < count) pool = [...ranked];
    picked = selectSet(pool, Math.min(count, pool.length), patterns);
    const used = new Set(picked.map((recipe) => recipe.id));
    pool = pool.filter((recipe) => !used.has(recipe.id));
  }
  return picked;
};

/**
 * The recipes first-run setup should offer.
 *
 * @param {object} input
 * @param {object[]} input.recipes  the book to choose from
 * @param {string[]} input.diets    your dietary patterns
 * @param {object[]} input.members  household members, each with their own
 * @param {object} input.prefs      allergens, intolerances, religious rules
 * @param {number} input.round      bumped by "show me different choices"
 * @returns {{options: {recipe: object, reasons: string[]}[], hidden: object,
 *   patterns: string[], more: boolean, short: boolean}}
 */
export const starterOptions = ({
  recipes = RECIPES,
  diets = [],
  members = [],
  prefs = {},
  round = 0,
  count = STARTER_OPTION_COUNT,
} = {}) => {
  const rules = householdRules({ diets, members, prefs });
  const dinners = recipes.filter((recipe) => recipe.meal !== 'breakfast' && recipe.meal !== 'lunch');

  /* One evaluation per dish, read twice: the hard lines are what removed it
     first, the patterns are what removed it next. Both come from the same
     engine, so setup can never disagree with the rest of the app about what is
     safe — it only reports the order in which the answer was reached. */
  const judged = dinners.map((recipe) => [recipe, blockedKinds(recipe, rules.context)]);
  // 1. Hard lines. These recipes leave the list entirely.
  const safe = judged.filter(([, kinds]) => !kinds.some((kind) => HARD.has(kind)));
  // 2. Dietary patterns, yours and the household's.
  const suitable = safe.filter(([, kinds]) => kinds.length === 0).map(([recipe]) => recipe);
  // 3. Preference only, from here down.
  const ranked = [...suitable].sort((a, b) => baseScore(b, rules.patterns) - baseScore(a, rules.patterns)
    || a.id.localeCompare(b.id));

  const chosen = roundOf(ranked, count, Math.max(0, Math.floor(round) || 0), rules.patterns);

  return {
    options: chosen.map((recipe) => ({ recipe, reasons: reasonsFor(recipe, rules) })),
    patterns: rules.patterns,
    hidden: {
      unsafe: dinners.length - safe.length,
      offPattern: safe.length - suitable.length,
      suitable: suitable.length,
    },
    /** Whether "show me different choices" has anything else to show. */
    more: ranked.length > count,
    /** True when the rules genuinely leave fewer than the six we aim for. */
    short: ranked.length < count,
  };
};
