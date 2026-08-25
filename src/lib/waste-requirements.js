/**
 * What a week of meals actually needs, in packages you can buy.
 *
 * A recipe asks for 150 g of spinach; the shop sells a 260 g bag. The gap
 * between those two numbers is where food waste comes from, so this module
 * works in whole packages and keeps the leftover as a real figure rather than
 * rounding it away.
 *
 * Split out of waste-planner.js, which scores plans against these figures; the
 * whole surface is re-exported from there so callers import it as before.
 */

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

export const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const dateValue = (stamp) => {
  const value = String(stamp || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const daysBetween = (from, to) => {
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

export const packageFor = (key, requirement, packageSizes = {}) => {
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

export const stockGroups = (pantry = [], learnedAliases = {}) => {
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

export const primaryMeasurement = (requirement) => {
  const dim = requirement.dimensions[0];
  return dim ? { dim, amount: Number(requirement.measurements[dim]) || 0, unit: requirement.units[dim] } : null;
};

export const isPerishable = (item) => Boolean(item?.expiry) || PERISHABLE_CATEGORIES.has(item?.cat);

export const unusedRow = ({ key, name, amount, dim, unit, reason, recipes = [], severity = 'watch', learned = false, date = null }) => ({
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
