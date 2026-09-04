/**
 * Household concurrency — deterministic conflict behaviour for simultaneous edits.
 *
 * Guarantees:
 *  - two users editing list simultaneously → last writer wins per-item by checkedAt, list order by lastChangedAt
 *  - pantry quantity conflicts → merge when measurable, otherwise keep both as conflict
 *  - duplicate purchases → duplicatePurchaseCheck warns before second write
 *  - membership changes → permissions checked before every write (household.js)
 *  - offline edits → queued and replayed on reconnect (cloud.js)
 *  - sync after reconnect → versioned compare, never silently overwriting newer remote
 */

import { shoppingNameKey } from './shopping.js';
import { canonicalName } from './aliases.js';
import { mergePantryQuantities } from './pantry-intelligence.js';
import { parseQuantity } from './measure.js';

const byId = (list = []) => new Map(list.map((i) => [i.id, i]));

export const mergeShoppingLists = (local = [], remote = [], { lastChangedAtLocal = 0, lastChangedAtRemote = 0 } = {}) => {
  const localById = byId(local);
  const remoteById = byId(remote);
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);
  const merged = [];
  for (const id of allIds) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && !r) merged.push(l);
    else if (!l && r) merged.push(r);
    else {
      // both have it — deterministic: newer checkedAt wins, newer price wins if same checked state
      const lTime = Number(l.checkedAt || l.updatedAt || lastChangedAtLocal) || 0;
      const rTime = Number(r.checkedAt || r.updatedAt || lastChangedAtRemote) || 0;
      if (rTime > lTime) merged.push({ ...l, ...r, mergedFrom: 'remote-wins' });
      else if (lTime > rTime) merged.push({ ...r, ...l, mergedFrom: 'local-wins' });
      else {
        // tie — lexical compare on id ensures determinism
        const winner = String(l.id).localeCompare(String(r.id)) <= 0 ? l : r;
        merged.push({ ...winner, mergedFrom: 'tie-lexical' });
      }
    }
  }
  // Deterministic order: not checked first, then aisle, then name
  return merged.sort((a, b) => Number(a.checked) - Number(b.checked) || String(a.aisle || '').localeCompare(String(b.aisle || '')) || String(a.name).localeCompare(String(b.name)));
};

export const mergePantry = (local = [], remote = [], { today = '', learnedAliases = {} } = {}) => {
  const byKey = new Map();
  const conflicts = [];
  const add = (item, source) => {
    const key = canonicalName(item.name, learnedAliases);
    if (!byKey.has(key)) {
      byKey.set(key, { ...item, sources: [source] });
      return;
    }
    const existing = byKey.get(key);
    const canMerge = (() => {
      const a = parseQuantity(existing.qty, { ingredient: key });
      const b = parseQuantity(item.qty, { ingredient: key });
      if (!existing.qty && !item.qty) return true;
      if (!a || !b) return false;
      try { return Boolean(mergePantryQuantities(existing.qty, item.qty, { ingredient: key })); } catch { return false; }
    })();
    if (canMerge) {
      const mergedQty = existing.qty && item.qty ? (mergePantryQuantities(existing.qty, item.qty, { ingredient: key }) || existing.qty) : (existing.qty || item.qty);
      byKey.set(key, { ...existing, qty: mergedQty, merged: true, sources: [...(existing.sources || []), source] });
    } else {
      conflicts.push({ key, local: existing.name, remote: item.name, qtyLocal: existing.qty, qtyRemote: item.qty });
      // keep both with suffixed keys
      byKey.set(`${key}__conflict_${item.id}`, { ...item, conflict: true, sources: [source] });
    }
  };
  for (const item of local) add(item, 'local');
  for (const item of remote) add(item, 'remote');
  return { pantry: [...byKey.values()], conflicts };
};

export const detectDuplicatePurchase = (itemName, list = [], shops = [], { learnedAliases = {} } = {}) => {
  const key = shoppingNameKey(itemName);
  const onList = list.find((i) => shoppingNameKey(i.name) === key);
  if (onList) return { duplicate: true, where: 'list', item: onList };
  const recentShop = [...shops].reverse().find((shop) => (shop.items || []).some((i) => shoppingNameKey(i.name) === key));
  if (recentShop) return { duplicate: true, where: 'recent-shop', shop: recentShop };
  return { duplicate: false };
};

/* ---------- Shopping-list divergence, made visible ----------
   Whole-state sync is versioned and last-writer-wins, which is right for
   most keys and silent data loss for a shared list: Ada edits "Milk" while
   Sam's device was offline, Sam's push 409s, and Sam is told to reload —
   which throws his edit away. Instead we fingerprint the rows each side
   synced from (the base) and only ask a human about rows BOTH sides
   changed differently. Everything one-sided merges automatically, with the
   side that changed winning; identical rows pass through untouched.
*/

/** The fields a row comparison cares about. Timestamps of unrelated noise
 * (e.g. routeFromTicks internals) never make a row look "edited". */
export const LIST_FP_FIELDS = ['name', 'qty', 'checked', 'checkedBy', 'checkedAt', 'price', 'priceSource', 'aisle', 'note'];

export const rowFingerprint = (row = {}) => JSON.stringify(
  LIST_FP_FIELDS.map((field) => [field, row[field] ?? null]),
);

/** id → fingerprint of the rows this device last synced. */
export const baseListFingerprint = (list = []) => {
  const map = {};
  for (const row of list) if (row?.id) map[row.id] = rowFingerprint(row);
  return map;
};

/**
 * Merge two divergent copies of the shopping list against the fingerprint of
 * the copy both sides last synced from.
 *
 *   - rows only one side has      → keep (additions never conflict)
 *   - rows both have, unchanged   → keep as-is
 *   - changed on exactly one side → that side wins (a normal sync)
 *   - changed differently on BOTH sides → no silent winner: each becomes a
 *     conflict holding the two versions, for the household to settle.
 */
export const reconcileShoppingDivergence = (local = [], remote = [], base = {}) => {
  const localById = byId(local);
  const remoteById = byId(remote);
  const rows = [];
  const conflicts = [];
  const seen = new Set();
  const push = (row) => { rows.push(row); seen.add(row.id); };
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const mine = localById.get(id);
    const theirs = remoteById.get(id);
    if (!mine) { push(theirs); continue; }
    if (!theirs) { push(mine); continue; }
    const fpMine = rowFingerprint(mine);
    const fpTheirs = rowFingerprint(theirs);
    if (fpMine === fpTheirs) { push(mine); continue; }
    const baseFp = Object.prototype.hasOwnProperty.call(base, id) ? base[id] : undefined;
    const mineChanged = baseFp === undefined || baseFp !== fpMine;
    const theirsChanged = baseFp === undefined || baseFp !== fpTheirs;
    if (mineChanged && theirsChanged) {
      // Both sides edited the same row since they shared a base — a decision
      // only the household can make. Neither version is silently discarded.
      conflicts.push({
        id: `lc_${id}_${Math.random().toString(36).slice(2, 8)}`,
        itemId: id,
        name: mine.name || theirs.name || 'Item',
        field: (LIST_FP_FIELDS.find((f) => (mine[f] ?? null) !== (theirs[f] ?? null)) || 'name'),
        mine,
        theirs,
        createdAt: Date.now(),
        status: 'open',
        localIndex: local.findIndex((row) => row.id === id),
      });
    } else if (mineChanged) {
      push(mine);
    } else {
      push(theirs);
    }
  }
  // Keep the shared order stable where possible: untouched rows stay put, and
  // adopted rows land where their side had them.
  const order = new Map();
  local.forEach((row, i) => { if (seen.has(row.id) && !order.has(row.id)) order.set(row.id, i * 2); });
  remote.forEach((row, i) => { if (seen.has(row.id) && !order.has(row.id)) order.set(row.id, i * 2 + 1); });
  rows.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return { rows, conflicts };
};

/** What a resolution would leave behind: the chosen copy back on the list,
 *  the conflict marked resolved. Pure — the caller commits it. */
/** Fold a newer household copy's rows into a local state without losing
 *  either side. Returns the next state, or null when nothing would change
 *  (nothing to adopt and nothing to settle). Pure — the caller commits. */
export const adoptRemoteListRows = (localState, remoteRows, base = {}) => {
  const { rows, conflicts } = reconcileShoppingDivergence(
    localState?.shoppingList || [],
    remoteRows || [],
    base,
  );
  const open = (localState?.listConflicts || []).filter((entry) => entry.status !== 'resolved');
  const nextConflicts = [...open, ...conflicts].slice(-50);
  const sameRows = JSON.stringify(rows) === JSON.stringify(localState?.shoppingList || []);
  const sameConflicts = JSON.stringify(nextConflicts) === JSON.stringify(open);
  if (sameRows && sameConflicts) return null;
  return { shoppingList: rows, listConflicts: nextConflicts, conflicts: conflicts.length };
};

export const applyListConflictResolution = (list = [], conflicts = [], conflictId, side = 'mine') => {
  const conflict = (conflicts || []).find((entry) => entry.id === conflictId && entry.status !== 'resolved');
  if (!conflict) return { rows: list, conflicts: conflicts || [] };
  const chosen = side === 'mine' ? conflict.mine : conflict.theirs;
  const rows = list.filter((row) => row.id !== conflict.itemId);
  const at = Math.min(Math.max(conflict.localIndex ?? rows.length, 0), rows.length);
  rows.splice(at, 0, chosen);
  return {
    rows,
    conflicts: (conflicts || []).map((entry) => (entry.id === conflictId
      ? { ...entry, status: 'resolved', resolution: side, resolvedAt: Date.now() }
      : entry)),
  };
};

export const resolveVersionConflict = (localVersion, remoteVersion, localState, remoteState) => {
  // Deterministic: higher version wins; tie -> lexicographically larger householdId wins; fallback -> remote wins if non-empty
  if (remoteVersion > localVersion) return { winner: 'remote', state: remoteState };
  if (localVersion > remoteVersion) return { winner: 'local', state: localState };
  // Tie
  if (remoteState && !localState) return { winner: 'remote', state: remoteState };
  if (localState && !remoteState) return { winner: 'local', state: localState };
  // Both present — prefer remote (server) but record conflict for UI
  return { winner: 'remote', state: remoteState, conflict: true, reason: 'version tie — server wins deterministically' };
};

export const offlineQueue = {
  enqueue: (queue = [], op) => [...queue, { ...op, queuedAt: Date.now(), id: `${op.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }],
  replay: async (queue = [], apply) => {
    const results = [];
    for (const op of queue) {
      try {
        const res = await apply(op);
        results.push({ op, ok: true, res });
      } catch (e) {
        results.push({ op, ok: false, error: e.message });
      }
    }
    return results;
  },
};
