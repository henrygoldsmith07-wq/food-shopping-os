/**
 * Three-way merge mechanics for shared household state.
 *
 * Every merge answers one question per row, field or key: who changed this
 * since the copy both devices last agreed on (the *base*)?
 *
 *   - changed on exactly one side → that side wins (a normal sync)
 *   - changed identically on both → no conflict
 *   - changed differently on both → the collection decides: merge what is
 *     measurable, otherwise surface a conflict. Never a silent winner.
 *   - removed on one side, untouched on the other → stays removed
 *   - removed on one side, EDITED on the other → the edit wins; work is
 *     never dropped in favour of an absence
 *
 * The base is a snapshot of fingerprints saved only on confirmed syncs, so a
 * failed push can never drift it. Without a base every difference looks like
 * a fight — deliberately conservative rather than silently lossy.
 *
 * Everything here is pure: callers commit the result.
 */

/** Stable value fingerprint: key order never makes two copies look different. */
export const valueFingerprint = (value) => {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((acc, key) => {
        if (v[key] !== undefined) acc[key] = stable(v[key]);
        return acc;
      }, {});
    }
    return v ?? null;
  };
  return JSON.stringify(stable(value ?? null));
};

/** Fingerprint of just the fields a row comparison cares about. */
export const fieldsFingerprint = (row, fields) =>
  JSON.stringify(fields.map((field) => [field, row?.[field] ?? null]));

const same = (a, b) => valueFingerprint(a) === valueFingerprint(b);

/**
 * Field-level three-way merge of one row. Fields only one side touched pass
 * through untouched; fields both sides changed differently come back in
 * `contested` for the collection to resolve.
 */
export const mergeRowFields = (mine, theirs, baseRow, fields) => {
  const row = { ...mine };
  const contested = [];
  for (const field of fields) {
    const m = mine?.[field] ?? null;
    const t = theirs?.[field] ?? null;
    if (same(m, t)) continue;
    const b = baseRow?.[field] ?? null;
    if (baseRow === undefined) {
      contested.push(field);
    } else if (same(m, b)) {
      row[field] = theirs[field]; // only theirs changed it
    } else if (same(t, b)) {
      row[field] = mine[field]; // only mine changed it
    } else {
      contested.push(field);
    }
  }
  return { row, contested };
};

/**
 * Three-way merge of two id-keyed row lists against a base fingerprint map.
 *
 * `options.resolveContested(mine, theirs, contested)` may settle a fight
 * itself (e.g. two measurable pantry quantities) and return the merged row.
 * Fights it cannot settle are returned in `fights` — the caller decides how
 * each collection parks them. `keepOnFight: 'mine'` keeps this device's row
 * in place while the fight waits (pantry, plan); `'none'` parks the row
 * inside the conflict itself (the shared list's established behaviour).
 *
 * Rows parked in an open conflict (`parked` keys) are excluded and never
 * re-added, so running the same merge twice is a no-op.
 */
export const threeWayRows = (local = [], remote = [], base = {}, options = {}) => {
  const {
    fields,
    keyOf = (row) => row?.id,
    keepOnFight = 'none',
    parked = new Set(),
    resolveContested = null,
  } = options;
  const lMap = new Map(local.map((row) => [keyOf(row), row]));
  const rMap = new Map(remote.map((row) => [keyOf(row), row]));
  const rows = [];
  const fights = [];
  const seen = new Set();
  const push = (key, row) => {
    if (seen.has(key) || parked.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  for (const key of new Set([...lMap.keys(), ...rMap.keys()])) {
    const mine = lMap.get(key);
    const theirs = rMap.get(key);
    const baseFp = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined;
    if (mine && !theirs) {
      // Absent on their side: their deletion wins unless we edited the row
      // since the base — an edit is never lost to an absence.
      if (baseFp !== undefined && baseFp === fieldsFingerprint(mine, fields)) continue;
      push(key, mine);
      continue;
    }
    if (!mine && theirs) {
      if (baseFp !== undefined && baseFp === fieldsFingerprint(theirs, fields)) continue;
      push(key, theirs);
      continue;
    }
    const fpMine = fieldsFingerprint(mine, fields);
    const fpTheirs = fieldsFingerprint(theirs, fields);
    if (fpMine === fpTheirs) {
      push(key, mine);
      continue;
    }
    const { row: mergedRow, contested } = mergeRowFields(
      mine,
      theirs,
      baseFp === undefined ? undefined : fieldsFromFingerprint(baseFp, fields),
      fields,
    );
    const resolved = contested.length ? resolveContested?.(mine, theirs, contested) : mergedRow;
    if (resolved) {
      push(key, resolved);
      continue;
    }
    if (!contested.length) {
      push(key, mergedRow);
      continue;
    }
    fights.push({
      key, mine, theirs, contested, localIndex: local.findIndex((row) => keyOf(row) === key),
    });
    if (keepOnFight === 'mine') push(key, mine);
  }
  // Stable order: untouched rows stay where they were; adopted rows land near
  // the side they came from.
  const order = new Map();
  local.forEach((row, i) => {
    const key = keyOf(row);
    if (!order.has(key)) order.set(key, i * 2);
  });
  remote.forEach((row, i) => {
    const key = keyOf(row);
    if (!order.has(key)) order.set(key, i * 2 + 1);
  });
  rows.sort((a, b) => (order.get(keyOf(a)) ?? 1e9) - (order.get(keyOf(b)) ?? 1e9));
  return { rows, fights };
};

/** Rebuild the compared fields from their stored fingerprint. */
const fieldsFromFingerprint = (fp, fields) => {
  try {
    const pairs = JSON.parse(fp);
    return Object.fromEntries(fields.map((field, i) => [field, pairs[i]?.[1] ?? null]));
  } catch {
    return undefined;
  }
};

/**
 * Three-way merge of two id-keyed arrays of records (events, recipes, shops).
 * Records are immutable facts: additions from either side are kept, deletions
 * are respected unless the other side edited the record, and a record edited
 * differently on both sides keeps this device's copy (the next push makes it
 * the shared truth — no data is dropped either way).
 */
export const threeWayRecords = (local = [], remote = [], base = []) => {
  const fields = recordFields(local, remote);
  const keyOf = recordKey;
  const baseMap = Array.isArray(base)
    ? Object.fromEntries(base.map((row) => [recordKey(row), fieldsFingerprint(row, fields)]))
    : base;
  const { rows } = threeWayRows(local, remote, baseMap, { fields, keyOf, keepOnFight: 'mine' });
  return rows;
};

/** Records without an id (cooked meals, CGM readings) key by their content. */
const recordKey = (row) => row?.id ?? valueFingerprint(row);

/** Every key any record carries, so two edited copies are compared whole. */
const recordFields = (local = [], remote = []) => {
  const keys = new Set();
  for (const row of [...local, ...remote]) {
    if (row && typeof row === 'object') Object.keys(row).forEach((key) => keys.add(key));
  }
  keys.delete('id');
  return [...keys];
};

/**
 * Three-way merge of two primitive arrays treated as sets (allergens, diets,
 * favourites). Values either side added are kept; a removal on one side is
 * respected while the other side left the value alone — hard lines like
 * allergens are never resurrected by a merge.
 */
export const threeWaySets = (local = [], remote = [], base = []) => {
  const baseSet = new Set(base);
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  const out = [];
  const seen = new Set();
  for (const value of [...local, ...remote]) {
    if (seen.has(value)) continue;
    seen.add(value);
    // Added since the base by at least one side, or present on both sides.
    if (!baseSet.has(value) || (localSet.has(value) && remoteSet.has(value))) out.push(value);
  }
  return out;
};

/**
 * Three-way merge of two plain objects keyed by id (ratings, alias memory,
 * per-item settings). One-sided changes win; a key changed differently on
 * both sides keeps the household copy — deterministic, and the next local
 * edit of that key is free to win normally.
 */
export const threeWayMap = (local = {}, remote = {}, base = {}) => {
  const out = { ...local };
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const inLocal = Object.prototype.hasOwnProperty.call(local, key);
    const inRemote = Object.prototype.hasOwnProperty.call(remote, key);
    const inBase = Object.prototype.hasOwnProperty.call(base, key);
    if (inLocal && inRemote) {
      if (same(local[key], remote[key])) continue;
      if (inBase && same(local[key], base[key])) out[key] = remote[key];
      else if (inBase && same(remote[key], base[key])) out[key] = local[key];
      else out[key] = remote[key]; // both changed: the household copy is canonical
      continue;
    }
    const only = inLocal ? local[key] : remote[key];
    const side = inLocal ? local : remote;
    if (inBase && same(side[key], base[key])) {
      delete out[key]; // removed on one side, untouched on the other
    } else {
      out[key] = only; // added by one side
    }
  }
  return out;
};
