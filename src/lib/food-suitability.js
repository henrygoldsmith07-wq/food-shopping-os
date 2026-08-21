/**
 * One central food-safety and preference engine for Forq.
 *
 * Every surface that decides whether a recipe or food is safe, flagged or
 * preferred must call this module. The previous split (preferences.js for
 * allergies/religious, goals.js for diet patterns) is still available as thin
 * wrappers so existing tests keep working while the rest of the app migrates.
 *
 * Result shape (FoodSuitability):
 *   allowed      — false only when there is at least one blocker
 *   blockers     — hard stops (allergens, religious rules, exclude diets, expired)
 *   warnings     — soft flags (intolerances, time/skill stretch, household, near-expiry)
 *   preferences  — ranking nudges (favourite cuisine, prefer tags)
 *   confidence   — how complete the ingredient + preference data is
 *   missingData  — what is still unknown (so UI can ask for it)
 */

import {
  allergenBy, intoleranceBy, religiousBy, skillBy, timeBudgetBy, MATCH_CAVEAT,
} from '../data/preferences.js';
import { dietPattern } from '../data/goals.js';
import { dayStamp, daysUntil } from './kitchen.js';

/** @typedef {'allergy'|'intolerance'|'religious'|'diet'|'household'|'preference'|'skill'|'time'|'expiry'|'other'} SuitabilityKind */
/** @typedef {'block'|'warn'|'prefer'} SuitabilitySeverity */

/**
 * @typedef {{
 *   code: string,
 *   label: string,
 *   kind: SuitabilityKind,
 *   severity: SuitabilitySeverity,
 *   detail?: string,
 * }} SuitabilityReason
 */

/**
 * @typedef {{
 *   allowed: boolean,
 *   blockers: SuitabilityReason[],
 *   warnings: SuitabilityReason[],
 *   preferences: SuitabilityReason[],
 *   confidence: 'high'|'medium'|'low',
 *   missingData: string[],
 * }} FoodSuitability
 */

const reason = (code, label, kind, severity, detail) => ({
  code,
  label,
  kind,
  severity,
  ...(detail ? { detail } : {}),
});

/** Text a recipe or food presents for matching. */
const textOf = (item) => {
  if (!item) return '';
  const name = item.name || '';
  const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
  const brand = item.brand || '';
  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients.map((i) => (typeof i === 'string' ? i : i?.name || '')).join(' ')
    : '';
  return `${name} ${brand} ${tags} ${ingredients}`.trim();
};

/** True when the item looks like a full recipe (has ingredients list). */
const isRecipe = (item) => Array.isArray(item?.ingredients);

/**
 * Build the context object every surface should pass.
 * Accepts either a full app state, a deriveApp result, or a plain prefs bag.
 * Optional `today` (YYYY-MM-DD) drives expiry evaluation for leftovers/pantry.
 */
export const suitabilityContextFrom = (source = {}) => {
  // deriveApp exposes `prefs`; raw state has the fields at top level.
  const prefs = source.prefs || source;
  const diets = source.planDiets
    || source.diets
    || prefs.diets
    || [];
  const members = source.members || [];
  const householdDiets = members.flatMap((m) => m.diets || []);
  return {
    allergies: prefs.allergies || source.allergies || [],
    intolerances: prefs.intolerances || source.intolerances || [],
    religious: prefs.religious || source.religious || [],
    diets: [...new Set([...diets, ...householdDiets])],
    householdDiets: [...new Set(householdDiets)],
    personalDiets: source.diets || prefs.diets || [],
    cuisines: prefs.cuisines || source.cuisines || [],
    skill: prefs.skill || source.skill || null,
    timeBudget: prefs.timeBudget || source.timeBudget || null,
    members,
    today: source.today || prefs.today || dayStamp(),
  };
};

/* ---------- Match helpers (same rules as the previous modules) ---------- */

const hitsFromTable = (item, ids, table) => {
  const text = textOf(item);
  return (ids || [])
    .map((id) => table[id])
    .filter((rule) => rule && rule.match.test(text))
    .map((rule) => ({ id: rule.id, label: rule.label }));
};

const allergenHits = (item, allergies) => hitsFromTable(item, allergies, allergenBy);
const intoleranceHits = (item, intolerances) => hitsFromTable(item, intolerances, intoleranceBy);
const religiousHits = (item, religious) => hitsFromTable(item, religious, religiousBy);

const dietConflictsFor = (item, diets) => {
  if (!item || !diets?.length) return [];
  const text = textOf(item);
  return diets
    .map(dietPattern)
    .filter((p) => {
      if (!p) return false;
      if (isRecipe(item) && p.recipeTag) return !p.recipeTag(item);
      return p.excludes ? p.excludes.test(text) : false;
    })
    .map((p) => ({ id: p.id, label: p.label, prefer: p.prefer, discourage: p.discourage }));
};

/** Expiry signals for dated pantry / leftover items. */
const expiryReasons = (item, today) => {
  const blockers = [];
  const warnings = [];
  if (!item?.expiry) return { blockers, warnings };
  const days = daysUntil(item.expiry, today);
  if (days === null) return { blockers, warnings };

  if (days < 0) {
    blockers.push(reason(
      'expiry:expired',
      'Past use-by',
      'expiry',
      'block',
      `Past use-by by ${-days} day${-days === 1 ? '' : 's'}. Do not recommend.`,
    ));
  } else if (days === 0) {
    // Still usable today, but treat as urgent warning (not a hard block).
    warnings.push(reason(
      'expiry:today',
      'Use by today',
      'expiry',
      'warn',
      'Use-by is today — prioritise this leftover.',
    ));
  } else if (days === 1) {
    warnings.push(reason(
      'expiry:1day',
      '1 day left',
      'expiry',
      'warn',
      'Use by tomorrow.',
    ));
  } else if (days <= 3) {
    warnings.push(reason(
      'expiry:soon',
      `${days} days left`,
      'expiry',
      'warn',
      `Use within ${days} days.`,
    ));
  }
  return { blockers, warnings };
};

/* ---------- Core evaluation ---------- */

/**
 * Evaluate one recipe, food, or leftover/pantry item against the full safety +
 * preference context. This is the single function every surface must call.
 *
 * Leftover / pantry items with an `expiry` field receive expiry blockers
 * (past use-by) and warnings (today / 1 day / within 3 days).
 *
 * @param {object} item - recipe, food, or pantry leftover
 * @param {object} context - from suitabilityContextFrom, or a plain bag
 * @returns {FoodSuitability}
 */
export const evaluateFoodSuitability = (item, context = {}) => {
  const ctx = suitabilityContextFrom(context);
  const blockers = [];
  const warnings = [];
  const preferences = [];
  const missingData = [];

  if (!item) {
    return {
      allowed: false,
      blockers: [reason('no-item', 'No item to evaluate', 'other', 'block')],
      warnings: [],
      preferences: [],
      confidence: 'low',
      missingData: ['item'],
    };
  }

  // --- Hard blockers: allergens ---
  for (const hit of allergenHits(item, ctx.allergies)) {
    blockers.push(reason(
      `allergy:${hit.id}`,
      hit.label,
      'allergy',
      'block',
      `Contains or names ${hit.label.toLowerCase()}. ${MATCH_CAVEAT}`,
    ));
  }

  // --- Hard blockers: religious ---
  for (const hit of religiousHits(item, ctx.religious)) {
    blockers.push(reason(
      `religious:${hit.id}`,
      hit.label,
      'religious',
      'block',
      `Conflicts with ${hit.label}. ${MATCH_CAVEAT}`,
    ));
  }

  // --- Hard blockers: dietary exclude patterns (personal + household) ---
  const dietHits = dietConflictsFor(item, ctx.diets);
  for (const hit of dietHits) {
    const fromHousehold = ctx.householdDiets.includes(hit.id) && !ctx.personalDiets.includes(hit.id);
    blockers.push(reason(
      `diet:${hit.id}`,
      hit.label,
      fromHousehold ? 'household' : 'diet',
      'block',
      fromHousehold
        ? `Conflicts with a household diet (${hit.label}).`
        : `Does not fit ${hit.label}.`,
    ));
  }

  // --- Expiry for leftovers / dated pantry items ---
  const expiry = expiryReasons(item, ctx.today);
  blockers.push(...expiry.blockers);
  warnings.push(...expiry.warnings);

  // --- Warnings: intolerances (never silent blocks) ---
  for (const hit of intoleranceHits(item, ctx.intolerances)) {
    warnings.push(reason(
      `intolerance:${hit.id}`,
      hit.label,
      'intolerance',
      'warn',
      `Contains ${hit.label.toLowerCase()} — amount matters; only you know your threshold.`,
    ));
  }

  // --- Warnings / preferences: time and skill (recipes only) ---
  if (isRecipe(item)) {
    const budget = timeBudgetBy[ctx.timeBudget];
    const skill = skillBy[ctx.skill];
    const minutes = Number(item.time) || 0;
    const steps = item.steps?.length || 0;

    if (budget && Number.isFinite(budget.minutes) && minutes > budget.minutes) {
      warnings.push(reason(
        'time:over',
        `Longer than ${budget.label}`,
        'time',
        'warn',
        `${minutes} min vs your ${budget.label} budget.`,
      ));
    }
    if (skill && Number.isFinite(skill.maxSteps) && steps > skill.maxSteps) {
      warnings.push(reason(
        'skill:over',
        `More steps than ${skill.label}`,
        'skill',
        'warn',
        `${steps} steps vs your ${skill.label} comfort.`,
      ));
    }

    // Favourite cuisine
    if (item.cuisine && (ctx.cuisines || []).includes(item.cuisine)) {
      preferences.push(reason(
        `cuisine:${item.cuisine}`,
        item.cuisine,
        'preference',
        'prefer',
        'One of your favourite cuisines.',
      ));
    }

    // Pattern-level prefer / discourage
    for (const p of (ctx.diets || []).map(dietPattern).filter(Boolean)) {
      if (p.prefer && p.prefer(item)) {
        preferences.push(reason(
          `prefer:${p.id}`,
          p.label,
          'preference',
          'prefer',
          `Fits ${p.label} preferences.`,
        ));
      }
      if (p.discourage && p.discourage.test(textOf(item))) {
        warnings.push(reason(
          `discourage:${p.id}`,
          p.label,
          'diet',
          'warn',
          `Discouraged under ${p.label}.`,
        ));
      }
    }
  }

  // --- Confidence & missing data ---
  if (!(ctx.allergies?.length || ctx.intolerances?.length || ctx.religious?.length || ctx.diets?.length)) {
    missingData.push('preferences-unset');
  }
  if (isRecipe(item)) {
    const lines = item.ingredients || [];
    if (!lines.length) missingData.push('ingredients-empty');
    else if (lines.some((i) => !(typeof i === 'string' ? i : i?.name))) {
      missingData.push('ingredients-incomplete');
    }
  } else if (!item.name) {
    missingData.push('name-missing');
  }
  // Leftovers without a use-by cannot be prioritised safely
  if (item.cat === 'Leftovers' && !item.expiry) {
    missingData.push('expiry-missing');
  }

  let confidence = 'high';
  if (missingData.includes('ingredients-empty') || missingData.includes('ingredients-incomplete')) {
    confidence = 'low';
  } else if (missingData.includes('preferences-unset') || missingData.includes('expiry-missing') || missingData.length) {
    confidence = 'medium';
  }

  // De-dupe by code
  const uniq = (list) => {
    const seen = new Set();
    return list.filter((r) => {
      if (seen.has(r.code)) return false;
      seen.add(r.code);
      return true;
    });
  };

  const blockersU = uniq(blockers);
  return {
    allowed: blockersU.length === 0,
    blockers: blockersU,
    warnings: uniq(warnings),
    preferences: uniq(preferences),
    confidence,
    missingData: [...new Set(missingData)],
  };
};

/** Keep only items that are allowed. */
export const filterBySuitability = (items = [], context = {}) =>
  items.filter((item) => evaluateFoodSuitability(item, context).allowed);

/**
 * Rank allowed items: preferences first, then fewer warnings, then original order.
 * Near-expiry leftovers rank higher so they are used first.
 */
export const rankBySuitability = (items = [], context = {}) => {
  const scored = filterBySuitability(items, context).map((item, index) => {
    const fit = evaluateFoodSuitability(item, context);
    const expiryWarn = fit.warnings.filter((w) => w.kind === 'expiry').length;
    const score =
      fit.preferences.length * 3
      + expiryWarn * 4 // push soon-to-expire leftovers up
      - (fit.warnings.length - expiryWarn) * 2
      - (fit.confidence === 'low' ? 1 : 0);
    return { item, score, index, fit };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((row) => row.item);
};

/**
 * Leftover recommendations: only allowed leftovers, ordered by urgency of
 * expiry then suitability. Surfaces that show "use these leftovers" must call
 * this (or evaluateFoodSuitability directly) so expiry warnings stay central.
 */
export const rankLeftovers = (leftovers = [], context = {}) => {
  const ctx = suitabilityContextFrom(context);
  const scored = leftovers
    .map((item, index) => {
      const fit = evaluateFoodSuitability(item, ctx);
      if (!fit.allowed) return null;
      const days = item.expiry ? daysUntil(item.expiry, ctx.today) : 999;
      /* Lower days = more urgent; still respect preference/warning balance.
         Anything past its use-by was already dropped as not allowed, so a
         zero here means "use it today" — the most urgent case there is, and
         it has to outrank tomorrow's rather than sink below it. */
      const score =
        (days <= 0 ? 60 : days <= 1 ? 50 : days <= 3 ? 30 : days <= 7 ? 10 : 0)
        + fit.preferences.length * 3
        - fit.warnings.filter((w) => w.kind !== 'expiry').length * 2;
      return { item, score, days: days ?? 999, index, fit };
    })
    .filter(Boolean);
  scored.sort((a, b) => b.score - a.score || a.days - b.days || a.index - b.index);
  return scored.map((row) => row.item);
};

/** How much of a pool survives the hard rules. */
export const suitabilityReach = (items = [], context = {}) => {
  const total = items.length || 0;
  const left = filterBySuitability(items, context).length;
  return {
    total,
    left,
    removed: total - left,
    pct: total ? Math.round((left / total) * 100) : 0,
  };
};

/** Human summary of active hard + soft rules. */
export const suitabilitySummary = (context = {}) => {
  const ctx = suitabilityContextFrom(context);
  const parts = [];
  const n = (list) => (list || []).length;
  if (n(ctx.allergies)) parts.push(`${n(ctx.allergies)} allergen${n(ctx.allergies) === 1 ? '' : 's'}`);
  if (n(ctx.religious)) {
    parts.push(ctx.religious.map((id) => religiousBy[id]?.label).filter(Boolean).join(', '));
  }
  if (n(ctx.intolerances)) parts.push(`${n(ctx.intolerances)} intolerance${n(ctx.intolerances) === 1 ? '' : 's'}`);
  if (n(ctx.diets)) {
    parts.push(ctx.diets.map((id) => dietPattern(id)?.label).filter(Boolean).join(', '));
  }
  if (n(ctx.cuisines)) parts.push(`${n(ctx.cuisines)} favourite cuisine${n(ctx.cuisines) === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'Nothing set — everything is offered';
};

export { MATCH_CAVEAT };
