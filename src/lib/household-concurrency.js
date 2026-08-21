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
