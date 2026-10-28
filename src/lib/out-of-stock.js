/**
 * "Not on the shelf": mid-shop, a missing item should become a decision
 * (swap it, or carry it to the next shop), not a row you silently skip.
 * State lives on the row itself (`outOfStock`, `outOfStockAt`) so it survives
 * reloads and syncs with shared lists.
 */
import { substitutesFor } from '../data/substitutions.js';

const name = (row) => String(row?.name || '').trim();

export const isOutOfStock = (row) => Boolean(row && row.outOfStock && !row.checked);

/** Patch for updateListItem. Toggles; ticking later clears nothing, but a ticked row is never "out". */
export const outOfStockPatch = (row, now = Date.now()) => (isOutOfStock(row)
  ? { outOfStock: false, outOfStockAt: null }
  : { outOfStock: true, outOfStockAt: now });

/** Rows currently flagged, oldest flag first. */
export const outOfStockRows = (list) => (Array.isArray(list) ? list : [])
  .filter(isOutOfStock)
  .sort((a, b) => (Number(a.outOfStockAt) || 0) - (Number(b.outOfStockAt) || 0));

/** Substitutes for the row: the app's verified candidates first, then the swap table, no duplicates. */
export function substituteChoices(row, verified = []) {
  const seen = new Set();
  const out = [];
  for (const option of [...(verified || []), ...substitutesFor(name(row))]) {
    const label = String(option?.name || option?.label || '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key) || key === name(row).toLowerCase()) continue;
    seen.add(key);
    out.push({ ...option, name: label });
  }
  return out.slice(0, 3);
}

/** Which meals this row was for, in plain words, or null. */
export function affectedMeals(row) {
  const from = String(row?.fromRecipe || '').trim();
  return from ? from : null;
}

/** One line for the card: what is missing and what it affects. */
export function outOfStockLine(row) {
  const meals = affectedMeals(row);
  return meals ? `${name(row)} is missing — it was for ${meals}.` : `${name(row)} is missing.`;
}

/** Summary for Finish shop: what to carry to next time. */
export function carryOverSummary(list) {
  const rows = outOfStockRows(list);
  if (!rows.length) return null;
  return `${rows.length} item${rows.length === 1 ? '' : 's'} not found: ${rows.map(name).join(', ')}. They stay on your list.`;
}
