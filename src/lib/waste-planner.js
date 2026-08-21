import { INGREDIENT_PACKAGES, packageSize } from '../data/package-sizes.js';
import { canonicalName } from './aliases.js';
import { parseQuantity } from './measure.js';

const PACKAGE_UNITS = [
  'pack', 'bag', 'punnet', 'tub', 'tin', 'can', 'jar', 'pouch', 'packet',
  'block', 'bottle', 'carton', 'loaf', 'box', 'ball', 'pot', 'tube', 'bar',
];

const FRESH_COUNT_UNITS = new Set([
  'pepper', 'onion', 'lemon', 'lime', 'apple', 'banana', 'avocado', 'tomato',
  'carrot', 'potato', 'courgette', 'aubergine', 'mushroom', 'head', 'bunch',
  'clove', 'bulb', 'sprig', 'piece', 'fillet', 'breast', 'thigh', 'rasher',
]);

const PERISHABLE_CATEGORIES = new Set([
  'Fresh', 'Dairy & eggs', 'Leftovers',
]);

const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const dateValue = (stamp) => {
  const value = String(stamp || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysBetween = (from, to) => {
  const left = dateValue(from);
  const right = dateValue(to);
  if (!left || !right) return null;
  return Math.round((right - left) / 86400000);
};

const asRows = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => (typeof item === 'string' ? { name: item, qty: '' } : item))
  .filter((item) => item && String(item.name || '').trim());

const amountFor = (value, ingredient) => {
  const parsed = parseQuantity(value, { ingredient });
  return parsed ? { ...parsed, amount: round(parsed.amount) } : null;
};

const addReading = (row, parsed, amount) => {
  if (!parsed) return;
  row.measurements[parsed.dim] = round((row.measurements[parsed.dim] || 0) + amount);
  row.units[parsed.dim] = parsed.unit;
};

/**
 * Flatten the ingredients in a candidate plan onto canonical names and
 * comparable measures. Unknown quantities remain visible as occurrences, but
 * never become invented grams or millilitres.
 */
export const ingredientRequirements = (meals = [], { people = null, learnedAliases = {}, dates = [] } = {}) => {
  const groups = new Map();
  for (const [index, recipe] of (meals || []).entries()) {
    if (!recipe) continue;
    const recipeServings = Number(recipe.servings);
    const factor = positive(people) && positive(recipeServings)
      ? Number(people) / recipeServings
      : 1;
    for (const ingredient of recipe.ingredients || []) {
      const name = String(ingredient?.name || ingredient || '').trim();
      const key = canonicalName(name, learnedAliases);
      if (!key) continue;
      const row = groups.get(key) || {
        key,
        name,
        occurrences: 0,
        unknownOccurrences: 0,
        recipes: [],
        indexes: [],
        dates: [],
        measurements: {},
        units: {},
        byIndex: {},
      };
      row.occurrences += 1;
      row.indexes.push(index);
      if (!row.recipes.includes(recipe.name || recipe.id)) row.recipes.push(recipe.name || recipe.id);
      const parsed = amountFor(ingredient.qty, key);
      if (!parsed) row.unknownOccurrences += 1;
      else {
        const amount = parsed.amount * factor;
        addReading(row, parsed, amount);
        row.byIndex[index] = {
          ...(row.byIndex[index] || {}),
          [parsed.dim]: round((row.byIndex[index]?.[parsed.dim] || 0) + amount),
        };
      }
      groups.set(key, row);
    }
  }
  return [...groups.values()].map((row) => ({
    ...row,
    dates: row.indexes.map((index) => dates[index] || null).filter(Boolean),
    dimensions: Object.keys(row.measurements),
  }));
};

const parsePackageOverride = (value, ingredient) => {
  if (typeof value === 'string') {
    const parsed = amountFor(value, ingredient);
    return parsed ? { ...parsed, packageUnit: 'pack' } : null;
  }
  if (!value || typeof value !== 'object') return null;
  if (value.qty) return parsePackageOverride(value.qty, ingredient);
  if (positive(value.amount) && value.dim) {
    return {
      amount: round(value.amount),
      dim: value.dim,
      unit: value.unit || (value.dim === 'mass' ? 'g' : value.dim === 'volume' ? 'ml' : 'unit'),
      confidence: value.confidence || 'exact',
      packageUnit: value.packageUnit || 'pack',
    };
  }
  if (positive(value.amount) && value.unit) return amountFor(`${value.amount} ${value.unit}`, ingredient);
  return null;
};

const tablePackage = (ingredient) => {
  const table = INGREDIENT_PACKAGES[ingredient];
  if (!table) return null;
  for (const unit of PACKAGE_UNITS) {
    if (table[unit]) return { ...table[unit], unit, source: 'ingredient' };
  }
  const [unit, value] = Object.entries(table)[0] || [];
  return value ? { ...value, unit, source: 'ingredient' } : null;
};

const packageFor = (key, requirement, packageSizes = {}) => {
  const override = packageSizes?.[key] || packageSizes?.[requirement.name];
  const overridden = parsePackageOverride(override, key);
  if (overridden) return { ...overridden, source: 'household' };
  const known = tablePackage(key);
  if (known) {
    const parsed = amountFor(`${known.amount} ${known.dim === 'mass' ? 'g' : known.dim === 'volume' ? 'ml' : known.unit}`, key);
    if (parsed) return { ...parsed, source: known.source, packageUnit: known.unit };
  }
  const firstDimension = requirement.dimensions[0];
  const unit = requirement.units[firstDimension];
  if (firstDimension === 'count' && FRESH_COUNT_UNITS.has(unit)) {
    return { amount: 1, dim: 'count', unit, confidence: 'approximate', source: 'whole ingredient', packageUnit: unit };
  }
  // A package-size override can name a unit rather than a complete quantity.
  if (unit) {
    const generic = packageSize(unit, key);
    if (generic) {
      const parsed = amountFor(`${generic.amount} ${generic.dim === 'mass' ? 'g' : generic.dim === 'volume' ? 'ml' : unit}`, key);
      if (parsed) return { ...parsed, source: generic.source, packageUnit: unit };
    }
  }
  return null;
};

const stockGroups = (pantry = [], learnedAliases = {}) => {
  const groups = new Map();
  for (const item of asRows(pantry)) {
    if (item.cat === 'Leftovers') continue;
    const key = canonicalName(item.name, learnedAliases);
    if (!key) continue;
    const row = groups.get(key) || { key, name: item.name, items: [], measurements: {} };
    const parsed = amountFor(item.qty, key);
    if (parsed) row.measurements[parsed.dim] = round((row.measurements[parsed.dim] || 0) + parsed.amount);
    row.items.push({ item, parsed });
    groups.set(key, row);
  }
  return groups;
};

const primaryMeasurement = (requirement) => {
  const dim = requirement.dimensions[0];
  return dim ? { dim, amount: Number(requirement.measurements[dim]) || 0, unit: requirement.units[dim] } : null;
};

const isPerishable = (item) => Boolean(item?.expiry) || PERISHABLE_CATEGORIES.has(item?.cat);

const unusedRow = ({ key, name, amount, dim, unit, reason, recipes = [], severity = 'watch', learned = false, date = null }) => ({
  key,
  name,
  amount: round(amount),
  dim,
  qty: dim === 'mass' ? `${round(amount)} g` : dim === 'volume' ? `${round(amount)} ml` : `${round(amount)} ${unit || 'unit'}${amount === 1 ? '' : 's'}`,
  unit: unit || null,
  reason,
  severity,
  learned,
  recipes,
  date,
});

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
  // Servings that use only part of a whole fresh item (half a pepper, a third
  // of an onion). Even when the plan fills every pack exactly, each partial
  // use leaves an opened remainder between meals, so it is scored as its own
  // fragmentation vector alongside pack remainder.
  let fractionalUses = 0;

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
      if (
        primary.dim === 'count'
        && FRESH_COUNT_UNITS.has(primary.unit)
        && primary.amount > 0
        && primary.amount < pack.amount - 0.001
      ) {
        fractionalUses += requirement.occurrences;
        fragmentationRisks.push({
          key: requirement.key,
          name: requirement.name,
          amount: round(primary.amount),
          remainder: round(pack.amount - primary.amount),
          recipes: requirement.recipes,
          reason: `Each use needs only ${round(primary.amount)} ${primary.unit} of a whole one, so part of it sits opened between meals.`,
        });
      }
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
  const fractionalPenalty = Math.min(12, fractionalUses * 4);
  const unusedScore = clamp(100 - unusedPenalty - learnedPenalty - fractionalPenalty);
  const leftoversScore = clamp(100 - leftoversGenerated * 25);
  const expiryScore = metric(urgentUsed, urgentDatedStock);
  const scored = [
    [pantryUtilisation ?? 100, pantryUtilisation === null ? 0 : 0.22],
    [perishableUtilisation ?? 100, perishableUtilisation === null ? 0 : 0.24],
    [packUtilisation ?? 100, packUtilisation === null ? 0 : 0.27],
    [leftoversScore, 0.1],
    [unusedScore, 0.17],
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
    fractionalUses,
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
