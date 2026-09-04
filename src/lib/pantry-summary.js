/**
 * One explainable read of the pantry's current situation.
 *
 * Kept separate from `pantry-intelligence.js` (where it was born) so that
 * evidence primitives stay under the 500-line boundary; it only needs the
 * normalised row and the confidence read from there, and nothing imports it
 * back, so there is no cycle.
 */
import { canonicalName, sameIngredient } from './aliases.js';
import { normalisePantryItem, pantryConfidenceLevel } from './pantry-intelligence.js';

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => DATE_RE.test(String(value || ''));

const signedDaysUntil = (stamp, today) => {
  if (!validDate(stamp) || !validDate(today)) return null;
  const expiry = new Date(`${stamp}T12:00:00`).getTime();
  const current = new Date(`${today}T12:00:00`).getTime();
  if (!Number.isFinite(expiry) || !Number.isFinite(current)) return null;
  return Math.round((expiry - current) / DAY_MS);
};

const stockStatusFor = (item, confidence) => {
  if (confidence.level === 'unknown') return 'unknown';
  if (item?.low) return 'running_low';
  return confidence.level === 'probable' ? 'probably_available' : 'confirmed_sufficient';
};

const samePantryThing = (left, right, learnedAliases = {}) =>
  sameIngredient(left, right, learnedAliases)
    || canonicalName(left, learnedAliases) === canonicalName(right, learnedAliases);

const buyingReasonFor = (item) => {
  if (item?.shoppingExplanation?.text) return item.shoppingExplanation.text;
  if (item?.mealDependency) return `Needed for ${item.mealDependency}`;
  if (item?.staple) return 'Predicted household restock';
  if (item?.manuallyRequested || item?.manual) return 'Added by you';
  return 'On your shopping list';
};

/**
 * The summary is deliberately derived from pantry rows and the existing
 * shopping list: it does not create another inventory record or infer that
 * uncertain stock is absent. A low row becomes a buying need only when it is
 * not already on the list; unknown/probable rows remain in `checkFirst` so the
 * app asks a person before it causes a purchase.
 */
export const pantryIntelligenceSummary = ({
  pantry = [], shoppingList = [], today = '', expiryWithin = 7, learnedAliases = {},
} = {}) => {
  const records = (Array.isArray(pantry) ? pantry : [])
    .map((source) => {
      const item = normalisePantryItem(source, { learnedAliases });
      const confidence = pantryConfidenceLevel(item, today);
      const status = stockStatusFor(item, confidence);
      return {
        item,
        key: item.ingredientKey || canonicalName(item.name, learnedAliases),
        status,
        confidence,
        daysLeft: signedDaysUntil(item.expiry, today),
      };
    })
    .filter(({ item }) => item.name);

  const stockCounts = {
    confirmed_sufficient: 0,
    probably_available: 0,
    running_low: 0,
    unknown: 0,
  };
  for (const row of records) stockCounts[row.status] += 1;

  const dated = records
    .filter((row) => row.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.item.name.localeCompare(b.item.name));
  const expiring = dated.filter((row) => row.daysLeft <= expiryWithin);
  const useFirst = expiring.map((row) => ({
    ...row,
    reason: row.daysLeft < 0
      ? `Past the recorded date by ${Math.abs(row.daysLeft)} day${Math.abs(row.daysLeft) === 1 ? '' : 's'} — review before using.`
      : row.daysLeft === 0
        ? 'Use today.'
        : `Use within ${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'}.`,
  }));

  // Legacy leftover rows can lack a date. They still deserve a visible prompt,
  // but are kept out of the "expiring" count because no date was recorded.
  records
    .filter((row) => row.item.cat === 'Leftovers' && row.daysLeft === null)
    .sort((a, b) => a.item.name.localeCompare(b.item.name))
    .forEach((row) => useFirst.push({ ...row, reason: 'Leftover with no recorded date — check before relying on it.' }));

  const openList = (Array.isArray(shoppingList) ? shoppingList : [])
    .filter((item) => item?.checked !== true && String(item?.name || '').trim())
    .map((item) => ({
      item,
      name: String(item.name).trim(),
      qty: item.qty || '',
      priority: item.priority || 'normal',
      source: 'shopping-list',
      reason: buyingReasonFor(item),
    }));
  const listNames = (Array.isArray(shoppingList) ? shoppingList : [])
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
  const lowStock = records
    .filter((row) => row.status === 'running_low')
    // A checked row is already in the user's active basket. It is not returned
    // in `openList`, but it must still suppress a second low-stock suggestion
    // until that basket is recorded or removed.
    .filter((row) => !listNames.some((name) => samePantryThing(name, row.item.name, learnedAliases)))
    .map((row) => ({
      ...row,
      name: row.item.name,
      qty: row.item.qty || '',
      priority: 'normal',
      source: 'pantry',
      reason: 'Marked as running low.',
    }));
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  const needsBuying = [...openList, ...lowStock]
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2) || a.name.localeCompare(b.name));
  const checkFirst = records
    .filter((row) => row.confidence.requiresConfirmation)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));

  return {
    stock: {
      total: records.length,
      value: Math.round(records.reduce((sum, row) => sum + (Number(row.item.cost) || 0), 0) * 100) / 100,
      dated: dated.length,
      counts: stockCounts,
      items: records,
    },
    expiring,
    useFirst,
    needsBuying,
    checkFirst,
    empty: records.length === 0,
  };
};
