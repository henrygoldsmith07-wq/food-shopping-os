/**
 * Choosing the week that wastes least.
 *
 * Candidate plans are scored against what they would actually require — see
 * `waste-requirements.js` — and against what this household has been observed
 * to bin. A plan that leaves half a pepper stranded scores worse than one that
 * finishes the pepper, and ties break toward cutting up fewer whole items.
 */

import { canonicalName } from './aliases.js';
import {
  clamp, daysBetween, ingredientRequirements, isPerishable, packageFor,
  primaryMeasurement, round, stockGroups, unusedRow,
} from './waste-requirements.js';

/* Requirements are the input to every score here, so the whole surface is
   re-exported and callers keep one import. */
export * from './waste-requirements.js';

/** Learn repeated discarded ingredients without treating one bin as a rule. */
export const learnWasteProfile = (waste = [], { learnedAliases = {} } = {}) => {
  const groups = new Map();
  for (const entry of Array.isArray(waste) ? waste : []) {
    const name = String(entry?.name || entry?.item?.name || '').trim();
    const key = canonicalName(name, learnedAliases);
    if (!key) continue;
    const row = groups.get(key) || { key, name, count: 0, cost: 0, dates: [] };
    row.count += 1;
    row.cost = round(row.cost + (Number(entry.cost) || 0));
    if (entry.date) row.dates.push(entry.date);
    groups.set(key, row);
  }
  const ingredients = [...groups.values()]
    .map((row) => ({
      ...row,
      repeated: row.count >= 2,
      lastDate: [...row.dates].sort().at(-1) || null,
      risk: round(Math.min(3, row.count) + row.cost / 5, 2),
    }))
    .sort((a, b) => b.count - a.count || b.cost - a.cost || a.name.localeCompare(b.name));
  return {
    ingredients,
    repeated: ingredients.filter((row) => row.repeated),
    totalItems: ingredients.reduce((sum, row) => sum + row.count, 0),
    totalCost: round(ingredients.reduce((sum, row) => sum + row.cost, 0)),
  };
};

const profileByKey = (history, learnedAliases) => {
  if (history?.ingredients && Array.isArray(history.ingredients)) return new Map(history.ingredients.map((row) => [row.key, row]));
  return new Map(learnWasteProfile(history, { learnedAliases }).ingredients.map((row) => [row.key, row]));
};

const explicitLeftovers = (recipe) => {
  const value = recipe?.expectedLeftovers ?? recipe?.leftoverPortions ?? recipe?.leftovers;
  if (typeof value === 'object') return Math.max(0, Number(value.portions || value.amount) || 0);
  return Math.max(0, Number(value) || 0);
};

const metric = (numerator, denominator) => denominator > 0 ? clamp((numerator / denominator) * 100) : null;

/**
 * Score one ordered candidate plan. The score is deliberately explainable:
 * every point comes from pantry stock, dated stock, known pack sizes,
 * leftovers, or an observed household waste pattern.
 */
export const scoreWastePlan = (
  meals = [],
  {
    pantry = [], people = null, dates = [], today = '', wasteHistory = [], wasteProfile = null,
    packageSizes = {}, learnedAliases = {}, expiryHorizon = 7,
  } = {},
) => {
  const requirements = ingredientRequirements(meals, { people, learnedAliases, dates });
  const stock = stockGroups(pantry, learnedAliases);
  const wasteByKey = profileByKey(wasteProfile || wasteHistory, learnedAliases);
  const expectedUnusedIngredients = [];
  const fragmentationRisks = [];
  const purchaseRows = [];
  let pantryNeeded = 0;
  let pantryUsed = 0;
  let datedStock = 0;
  let datedUsedBeforeExpiry = 0;
  let expiryMisses = 0;
  let urgentDatedStock = 0;
  let urgentUsed = 0;
  let packageNeed = 0;
  let packagePurchased = 0;
  let learnedWasteRisk = 0;

  // Start with all dated stock, including ingredients no candidate uses. The
  // denominator must include an ignored spinach bag or yoghurt pot, otherwise
  // a plan that forgets it would look artificially perfect.
  for (const row of stock.values()) {
    for (const pantryRow of row.items) {
      if (!pantryRow.item?.expiry || !pantryRow.parsed) continue;
      datedStock += pantryRow.parsed.amount;
      const daysLeft = daysBetween(today, pantryRow.item.expiry);
      if (daysLeft !== null && daysLeft <= expiryHorizon) urgentDatedStock += pantryRow.parsed.amount;
    }
  }

  for (const requirement of requirements) {
    const primary = primaryMeasurement(requirement);
    const stored = stock.get(requirement.key);
    const pantryAmount = primary ? Number(stored?.measurements?.[primary.dim] || 0) : 0;
    const neededAmount = primary?.amount || 0;
    const usedAmount = Math.min(neededAmount, pantryAmount);
    if (pantryAmount > 0) {
      pantryNeeded += pantryAmount;
      pantryUsed += usedAmount;
    }

    const usesDates = [...requirement.dates].sort();
    const pack = primary ? packageFor(requirement.key, requirement, packageSizes) : null;
    const history = wasteByKey.get(requirement.key);
    const purchaseAmount = primary ? Math.max(0, neededAmount - usedAmount) : 0;
    let packs = 0;
    let purchasedAmount = 0;
    let unusedPackAmount = 0;
    let packUtilisation = null;
    if (pack && primary && pack.dim === primary.dim && purchaseAmount > 0) {
      packs = Math.max(1, Math.ceil((purchaseAmount - 0.0001) / pack.amount));
      purchasedAmount = round(packs * pack.amount);
      unusedPackAmount = round(Math.max(0, purchasedAmount - purchaseAmount));
      packUtilisation = metric(purchaseAmount, purchasedAmount);
      packageNeed += purchaseAmount;
      packagePurchased += purchasedAmount;
      purchaseRows.push({
        key: requirement.key,
        name: requirement.name,
        requiredAmount: round(purchaseAmount),
        qty: unusedRow({ amount: purchaseAmount, dim: primary.dim, unit: primary.unit }).qty,
        purchasedAmount,
        packs,
        packSize: round(pack.amount),
        packUnit: pack.packageUnit || pack.unit,
        packUtilisation,
        source: pack.source,
      });
      if (unusedPackAmount > 0.01) {
        const learned = Boolean(history?.repeated);
        expectedUnusedIngredients.push(unusedRow({
          key: requirement.key,
          name: requirement.name,
          amount: unusedPackAmount,
          dim: primary.dim,
          unit: primary.dim === 'count' ? primary.unit : primary.unit,
          reason: requirement.occurrences === 1
            ? `Used once, leaving part of a ${pack.packageUnit || 'pack'} unused.`
            : `The plan does not fill the final ${pack.packageUnit || 'pack'}.`,
          recipes: requirement.recipes,
          severity: learned || primary.dim === 'count' ? 'high' : 'watch',
          learned,
        }));
        if (requirement.occurrences === 1 || (primary.dim === 'count' && primary.amount < pack.amount)) {
          fragmentationRisks.push({
            key: requirement.key,
            name: requirement.name,
            amount: round(purchaseAmount),
            remainder: round(unusedPackAmount),
            recipes: requirement.recipes,
            reason: `Only one planned use leaves ${unusedRow({ amount: unusedPackAmount, dim: primary.dim, unit: primary.unit }).qty} unused.`,
          });
        }
        if (history) learnedWasteRisk += history.risk || history.count || 1;
      }
    } else if (primary && primary.dim === 'count' && primary.amount < 1 && requirement.occurrences === 1) {
      // A half pepper, lemon or similar whole ingredient is a fragmentation
      // risk even when the catalogue has no honest retail pack size for it.
      fragmentationRisks.push({
        key: requirement.key,
        name: requirement.name,
        amount: round(purchaseAmount || neededAmount),
        remainder: round(1 - primary.amount),
        recipes: requirement.recipes,
        reason: `Only one planned use needs ${round(primary.amount)} ${primary.unit}; the rest is likely to remain.`,
      });
    }
    if (primary && purchaseAmount > 0 && !purchaseRows.some((row) => row.key === requirement.key)) {
      purchaseRows.push({
        key: requirement.key,
        name: requirement.name,
        requiredAmount: round(purchaseAmount),
        qty: unusedRow({ amount: purchaseAmount, dim: primary.dim, unit: primary.unit }).qty,
        purchasedAmount: round(purchaseAmount),
        packs: null,
        packSize: null,
        packUnit: null,
        packUtilisation: null,
        source: 'quantity only',
      });
    }

    // When there is no trustworthy pack size, a repeated household discard is
    // still useful evidence. Reusing the ingredient later is safer than
    // buying it for a one-off meal; using it twice softens the risk because it
    // gives the household a chance to finish it.
    if (history?.repeated && (!pack || unusedPackAmount <= 0.01)) {
      const reuseFactor = requirement.occurrences > 1 ? 0.35 : 1;
      learnedWasteRisk += (history.risk || history.count || 1) * reuseFactor;
      if (primary && requirement.occurrences === 1 && !pack) {
        expectedUnusedIngredients.push(unusedRow({
          key: requirement.key,
          name: requirement.name,
          amount: neededAmount,
          dim: primary.dim,
          unit: primary.unit,
          reason: 'This household repeatedly bins it; a one-off purchase is a waste risk.',
          recipes: requirement.recipes,
          severity: 'high',
          learned: true,
        }));
      }
    }

    const hasDates = usesDates.length > 0;
    for (const pantryRow of stored?.items || []) {
      if (!pantryRow.item?.expiry) continue;
      const parsed = pantryRow.parsed;
      const rowAmount = parsed && primary && parsed.dim === primary.dim ? parsed.amount : 0;
      if (rowAmount <= 0) continue;
      const daysLeft = daysBetween(today, pantryRow.item.expiry);
      const urgent = daysLeft !== null && daysLeft <= expiryHorizon;
      const requiredBefore = hasDates
        ? requirement.indexes.reduce((sum, index) => {
          const date = dates[index];
          return (!date || date <= pantryRow.item.expiry)
            ? sum + Number(requirement.byIndex[index]?.[primary.dim] || 0)
            : sum;
        }, 0)
        : neededAmount;
      const requiredAfter = Math.max(0, neededAmount - requiredBefore);
      const usedBefore = Math.min(rowAmount, requiredBefore);
      const usedAfter = Math.min(Math.max(0, rowAmount - usedBefore), requiredAfter);
      const used = usedBefore + usedAfter;
      if (usedBefore > 0) {
        datedUsedBeforeExpiry += usedBefore;
        if (urgent) urgentUsed += usedBefore;
      }
      if (usedAfter > 0) expiryMisses += 1;
      if (rowAmount - used > 0.01 && (daysLeft === null || daysLeft <= expiryHorizon)) {
        expectedUnusedIngredients.push(unusedRow({
          key: requirement.key,
          name: pantryRow.item.name,
          amount: rowAmount - used,
          dim: parsed.dim,
          unit: parsed.unit,
          reason: daysLeft !== null && daysLeft < 0 ? 'Already past its recorded date.' : 'No planned meal uses all of this dated stock.',
          recipes: requirement.recipes,
          severity: daysLeft !== null && daysLeft <= 1 ? 'high' : 'watch',
          date: pantryRow.item.expiry,
        }));
      }
    }

    // A dated pantry item whose canonical name never appears in the plan is
    // handled below; this branch covers a matching item with a non-readable
    // recipe quantity without pretending it was consumed.
    if (!primary && stored?.items?.some((row) => row.item?.expiry)) {
      const history = wasteByKey.get(requirement.key);
      if (history) learnedWasteRisk += history.risk || history.count || 1;
    }
  }

  for (const [key, row] of stock.entries()) {
    for (const pantryRow of row.items) {
      if (!pantryRow.item?.expiry || !isPerishable(pantryRow.item)) continue;
      const parsed = pantryRow.parsed;
      const requirement = requirements.find((candidate) => candidate.key === key);
      const needed = requirement && parsed && requirement.measurements[parsed.dim]
        ? Number(requirement.measurements[parsed.dim])
        : 0;
      if (parsed && !requirement && parsed.amount > 0) {
        const daysLeft = daysBetween(today, pantryRow.item.expiry);
        if (daysLeft === null || daysLeft <= expiryHorizon) {
          expectedUnusedIngredients.push(unusedRow({
            key,
            name: pantryRow.item.name,
            amount: parsed.amount,
            dim: parsed.dim,
            unit: parsed.unit,
            reason: daysLeft !== null && daysLeft < 0 ? 'Past its recorded date and absent from the plan.' : 'No planned meal uses this dated ingredient.',
            severity: daysLeft !== null && daysLeft <= 1 ? 'high' : 'watch',
            date: pantryRow.item.expiry,
          }));
        }
      } else if (parsed && needed < parsed.amount && pantryRow.item.expiry) {
        // Rows are already represented by the requirement pass when the
        // ingredient is used; this only guards against quantity ambiguity.
        const daysLeft = daysBetween(today, pantryRow.item.expiry);
        if (daysLeft !== null && daysLeft <= expiryHorizon && !expectedUnusedIngredients.some((item) => item.key === key && item.date === pantryRow.item.expiry)) {
          expectedUnusedIngredients.push(unusedRow({
            key,
            name: pantryRow.item.name,
            amount: parsed.amount - needed,
            dim: parsed.dim,
            unit: parsed.unit,
            reason: 'Dated stock is only partly covered by the plan.',
            severity: daysLeft <= 1 ? 'high' : 'watch',
            date: pantryRow.item.expiry,
          }));
        }
      }
    }
  }

  const perishableUtilisation = metric(datedUsedBeforeExpiry, datedStock);
  const pantryUtilisation = metric(pantryUsed, pantryNeeded);
  const packUtilisation = metric(packageNeed, packagePurchased);
  const leftoversGenerated = round((meals || []).reduce((sum, recipe) => sum + explicitLeftovers(recipe), 0));
  const uniqueUnused = expectedUnusedIngredients.filter((row, index, all) => all.findIndex((other) => (
    other.key === row.key && other.amount === row.amount && other.date === row.date
  )) === index);
  const learnedRows = uniqueUnused.filter((row) => wasteByKey.get(row.key)?.repeated);
  const unusedPenalty = uniqueUnused.reduce((sum, row) => sum + (row.severity === 'high' ? 18 : 10), 0);
  const learnedPenalty = Math.min(35, learnedWasteRisk * 3 + learnedRows.length * 6);
  const unusedScore = clamp(100 - unusedPenalty - learnedPenalty);
  const leftoversScore = clamp(100 - leftoversGenerated * 25);
  const expiryScore = metric(urgentUsed, urgentDatedStock);
  // Splitting whole-count items into fractional uses across meals fragments
  // them even when totals line up — penalise it so whole-unit plans win ties.
  const splitWholeUses = (meals || []).reduce((count, recipe) => count + (recipe?.ingredients || [])
    .filter((ing) => /½|^0\.5\b|\bhalf\b/i.test(String(ing?.qty || ''))).length, 0);
  const fragmentationScore = clamp(100 - Math.max(0, splitWholeUses - 1) * 20);
  const scored = [
    [pantryUtilisation ?? 100, pantryUtilisation === null ? 0 : 0.22],
    [perishableUtilisation ?? 100, perishableUtilisation === null ? 0 : 0.24],
    [packUtilisation ?? 100, packUtilisation === null ? 0 : 0.25],
    [leftoversScore, 0.1],
    [unusedScore, 0.17],
    [fragmentationScore, 0.12],
  ];
  const weight = scored.reduce((sum, [, value]) => sum + value, 0) || 1;
  const score = round(scored.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) / weight);
  const expectedWaste = round(1 - score / 100, 3);
  const recommendations = [];
  for (const row of fragmentationRisks.slice(0, 3)) {
    recommendations.push(`Use ${row.name} again later in the plan to avoid a fragmented purchase.`);
  }
  for (const row of uniqueUnused.filter((item) => item.date).slice(0, 2)) {
    recommendations.push(`Move a ${row.name} meal before ${row.date} so it is used while fresh.`);
  }
  for (const row of learnedRows.slice(0, 2)) {
    recommendations.push(`The household often wastes ${row.name}; buy only the planned amount or choose another meal.`);
  }
  if (!recommendations.length && score >= 80) recommendations.push('This plan uses dated stock and fills the known packs well.');
  return {
    score,
    wasteScore: score,
    expectedWaste,
    wasteRisk: round(100 - score),
    pantryUtilisation,
    pantryUtilization: pantryUtilisation,
    perishableUtilisation,
    perishableUtilization: perishableUtilisation,
    packUtilisation,
    packUtilization: packUtilisation,
    leftoversGenerated,
    expectedUnusedIngredients: uniqueUnused,
    expectedUnusedCount: uniqueUnused.length,
    fragmentationRisks: fragmentationRisks.sort((a, b) => b.remainder - a.remainder),
    expiryMisses,
    expiryPriority: expiryScore,
    learnedWasteRisk: round(learnedWasteRisk),
    learnedWaste: learnedRows,
    purchaseRows,
    requirements,
    recommendations,
    breakdown: {
      pantry: pantryUtilisation,
      perishable: perishableUtilisation,
      packs: packUtilisation,
      leftovers: leftoversScore,
      unused: unusedScore,
    },
  };
};

/** Rank deterministic candidate plans, preserving the first candidate on ties. */
export const rankWastePlans = (candidates = [], options = {}) => {
  const ranked = (candidates || [])
    .map((meals, index) => ({ candidateIndex: index, meals, ...scoreWastePlan(meals, options) }))
    .sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex);
  return { best: ranked[0] || null, ranked };
};

export const chooseWasteMinimisingPlan = (candidates = [], options = {}) => rankWastePlans(candidates, options).best;
