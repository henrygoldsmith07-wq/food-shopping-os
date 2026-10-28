/**
 * In-store "undo the last tick": a fat-thumb mis-tap in the aisle should be a
 * one-tap fix, not a hunt through the list. Derived purely from the list's own
 * checkedAt stamps, so it works after a reload and for shared lists.
 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/** The most recently ticked row, if it was ticked within the window. */
export function lastTicked(list, now = Date.now(), windowMs = UNDO_WINDOW_MS) {
  let latest = null;
  for (const row of Array.isArray(list) ? list : []) {
    if (!row || !row.checked) continue;
    const at = Number(row.checkedAt);
    if (!Number.isFinite(at) || at <= 0) continue;
    if (now - at > windowMs || at > now + 60000) continue;
    if (!latest || at > latest.checkedAt) latest = row;
  }
  return latest;
}

/** Plain label for the undo card. */
export const undoLabel = (row) => `Ticked ${String(row?.name || 'an item').trim() || 'an item'}`;
