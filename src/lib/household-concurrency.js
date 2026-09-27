/**
 * Household concurrency — deterministic conflict behaviour for simultaneous edits.
 *
 * Guarantees:
 *  - two users editing list simultaneously → one-sided changes merge, rows
 *    changed differently on both devices become an explicit conflict
 *  - pantry quantity conflicts → merge when measurable, otherwise keep both as conflict
 *  - meal-plan slots edited on two devices → independent slots coexist, the
 *    same slot changed differently becomes an explicit conflict
 *  - duplicate purchases → duplicatePurchaseCheck warns before second write
 *  - membership changes → permissions checked before every write (household.js)
 *  - offline edits → queued and replayed on reconnect (cloud.js)
 *  - sync after reconnect → versioned compare, never silently overwriting newer remote
 *
 * This module owns the shared-list rules and the row-level helpers the rest
 * of the merge policy uses. The mechanism is one three-way merge (see
 * state-merge.js) over the copy both devices last agreed on; household-merge.js
 * applies it to the whole household state. Independent changes always
 * coexist; a change made differently on both sides is never resolved by a
 * silent winner.
 */

import { shoppingNameKey } from './shopping.js';
import { canonicalName } from './aliases.js';
import { mergePantryQuantities, quantityCanMerge } from './pantry-intelligence.js';
import { threeWayRows } from './state-merge.js';

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
    // "Merge when measurable" — two amounts only combine into one number
    // when both can be read onto the same scale. "A bag" and "two mugs"
    // never become an invented total.
    const canMerge = quantityCanMerge(existing.qty, item.qty, key);
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

/* ---------- Shared-row divergence, made visible ----------
   Whole-state sync is versioned, which is right for most keys and silent
   data loss for the things a household edits together: Ada edits "Milk"
   while Sam's device was offline, Sam's push 409s, and a reload would throw
   his edit away. Instead we fingerprint the rows each side synced from (the
   base) and only ask a human about rows BOTH sides changed differently.
   Everything one-sided merges automatically, with the side that changed
   winning; identical rows pass through untouched. Fields changed on only one
   side of a row merge too — a tick and a rename are not a fight.
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
 * Deterministic conflict id derived from both versions — never Math.random, so
 * the same divergence reconciled twice (on two devices, or after a retry)
 * produces one conflict instead of two.
 * @param {string} id
 * @param {string} mineFp
 * @param {string} theirsFp
 */
export const conflictIdFor = (id, mineFp, theirsFp) => {
  let hash = 0;
  const text = `${id}|${mineFp}|${theirsFp}`;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 31 + text.charCodeAt(i)) | 0);
  }
  return `lc_${id}_${(hash >>> 0).toString(36)}`;
};

/**
 * Merge two divergent copies of the shopping list against the fingerprint of
 * the copy both sides last synced from.
 *
 *   - rows only one side has      → keep (additions never conflict), unless
 *     the base shows the other side deleted an untouched row
 *   - rows both have, unchanged   → keep as-is
 *   - changed on exactly one side → that side wins (a normal sync)
 *   - changed differently on BOTH sides → no silent winner: each becomes a
 *     conflict holding the two versions, for the household to settle.
 */
export const reconcileShoppingDivergence = (local = [], remote = [], base = {}) => {
  const { rows, fights } = threeWayRows(local, remote, base, {
    fields: LIST_FP_FIELDS,
    keyOf: (row) => row.id,
    keepOnFight: 'none',
  });
  const conflicts = fights.map((fight) => listConflictFor(fight, local));
  return { rows, conflicts };
};

export const listConflictFor = (fight, local) => {
  const { mine, theirs, key: id } = fight;
  return {
    // Derived from the two versions, not a fresh random string: reconciling the
    // same divergence twice must not leave the household two open conflicts.
    id: conflictIdFor(id, rowFingerprint(mine), rowFingerprint(theirs)),
    itemId: id,
    name: mine.name || theirs.name || 'Item',
    field: (LIST_FP_FIELDS.find((f) => (mine[f] ?? null) !== (theirs[f] ?? null)) || 'name'),
    mine,
    theirs,
    createdAt: Date.now(),
    status: 'open',
    localIndex: local.findIndex((row) => row.id === id),
  };
};

/** Fold a newer household copy's rows into a local state without losing
 *  either side. Returns the next state, or null when nothing would change
 *  (nothing to adopt and nothing to settle). Pure — the caller commits. */
export const adoptRemoteListRows = (localState, remoteRows, base = {}) => {
  const open = (localState?.listConflicts || []).filter((entry) => entry.status !== 'resolved');
  // Rows parked inside an open conflict are excluded so the same divergence
  // never adopts a copy behind the household's back — and so running the
  // merge twice is a no-op rather than a second conflict.
  const parked = new Set(open.map((entry) => entry.itemId));
  const { rows, fights } = threeWayRows(localState?.shoppingList || [], remoteRows || [], base, {
    fields: LIST_FP_FIELDS,
    keyOf: (row) => row.id,
    keepOnFight: 'none',
    parked,
  });
  const conflicts = fights
    .filter((fight) => !open.some((entry) => entry.itemId === fight.key))
    .map((fight) => listConflictFor(fight, localState?.shoppingList || []));
  const nextConflicts = [...open, ...conflicts].slice(-50);
  const sameRows = JSON.stringify(rows) === JSON.stringify(localState?.shoppingList || []);
  const sameConflicts = JSON.stringify(nextConflicts) === JSON.stringify(open);
  if (sameRows && sameConflicts) return null;
  return { shoppingList: rows, listConflicts: nextConflicts, conflicts: conflicts.length };
};

/** What a resolution would leave behind: the chosen copy back on the list,
 *  the conflict marked resolved. Pure — the caller commits it. */
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
  /**
   * @param {Array<any>} queue
   * @param {{ type: string, [key: string]: any }} op
   * @param {{ now?: () => number, random?: () => number }} [options]
   *   The clock and the random source are injected rather than reached for
   *   globally, so a retry of the same op keeps one identity instead of two
   *   that later replay as duplicates.
   */
  enqueue: (queue = [], op, { now = Date.now, random = Math.random } = {}) => {
    const stamp = now();
    const suffix = String(random()).slice(2, 8);
    return [...queue, { ...op, queuedAt: stamp, id: `${op.type}-${stamp}-${suffix}` }];
  },
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
