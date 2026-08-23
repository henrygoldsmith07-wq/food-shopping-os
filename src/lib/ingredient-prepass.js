/**
 * Ingredient pre-pass — normalise names, group duplicates, merge quantities.
 *
 * Built on the app's alias memory (aliases.js) so household-learned
 * corrections ("rocket" → "salad") apply everywhere this runs: pantry
 * matching, basket grouping and the optimiser's coverage math.
 */

import { entityKey } from './aliases.js';
import { parseQuantity } from './measure.js';

const clean = (name) => String(name || '').replace(/\s+/g, ' ').trim();

/** Canonical grouping key honouring learned aliases. */
export const rowKey = (row, learned = {}) => entityKey(row?.name ?? row, learned);

/** Index groups of rows that are the same ingredient under different spellings. */
export const duplicateGroups = (rows = [], learned = {}) => {
  const map = new Map();
  (rows || []).forEach((row, index) => {
    const k = rowKey(row, learned);
    if (!k) return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(index);
  });
  return [...map.values()].filter((g) => g.length > 1);
};

/**
 * Merge duplicate rows: first spelling wins as canonical, quantities sum when
 * dimensions agree, later rows survive as aliases. Un-keyed rows pass through.
 */
export const normaliseRows = (rows = [], learned = {}) => {
  const merged = [];
  const index = new Map();
  let duplicatesFound = 0;

  for (const row of rows || []) {
    const k = rowKey(row, learned);
    const name = clean(row?.name);
    if (!k || !name) { merged.push({ ...row }); continue; }

    const existingAt = index.get(k);
    if (existingAt === undefined) {
      const q = parseQuantity(row?.qty ?? '');
      const entry = { ...row, name, key: k, aliases: [name.toLowerCase()] };
      entry._dim = q?.dim ?? null;
      entry._amount = q?.amount ?? null;
      merged.push(entry);
      index.set(k, merged.length - 1);
      continue;
    }

    duplicatesFound += 1;
    const ex = merged[existingAt];
    const q = parseQuantity(row?.qty ?? '');
    if (ex._dim && q && q.dim === ex._dim && Number.isFinite(q.amount) && Number.isFinite(ex._amount)) {
      // Same dimension: fold together, grams with grams.
      ex.aliases.push(name.toLowerCase());
      ex._amount += q.amount;
      ex.qty = { amount: ex._amount, dim: q.dim, unit: q.unit };
      continue;
    }
    // Dimension mismatch (or unmeasurable): grams and millilitres never
    // silently add — the row stands on its own under the same key.
    const q2 = { ...row, name, key: k, aliases: [name.toLowerCase()] };
    merged.push(q2);
  }

  for (const entry of merged) {
    delete entry._dim;
    delete entry._amount;
  }
  return { rows: merged, duplicatesFound, groups: duplicateGroups(rows, learned).length };
};
