import { householdPermission } from './household.js';
import { aisleFor, shoppingNameKey } from './shopping.js';
import { reconcilePurchase } from './pantry-intelligence.js';
import { moveBefore } from './utils.js';
import { applyListConflictResolution } from './household-concurrency.js';
import { emojiFor, uid } from './state.js';
import { upsertPredictions, listSnapshotSync } from './shopping-predictions.js';
import { refreshBasketFreeze } from './prediction-evidence.js';

const text = (value, max) => String(value || '').trim().slice(0, max);

/**
 * Remove list rows and their LIVE prediction snapshots in the SAME state
 * write (task: enforce list ↔ snapshot consistency): every live
 * shoppingPredictions[].id must refer to a currently visible list row, so a
 * removal that left its snapshot behind would break the invariant. Frozen
 * copies on historical shop records are untouched — they live on the shops,
 * not in this book.
 *
 * The basket freeze rides the same write (task: material list changes): with
 * a prior freeze and a still-trustworthy forecast the shown basket is
 * re-frozen over the remaining rows; with no trustworthy forecast left the
 * prior freeze is explicitly invalidated — never left describing rows that
 * are no longer shown, and never invented merely because a row left.
 */
const removeRowsWithSnapshots = (state, goneIds) => {
  const gone = goneIds instanceof Set ? goneIds : new Set(goneIds);
  const shoppingList = state.shoppingList.filter((item) => !gone.has(item.id));
  if (shoppingList.length === state.shoppingList.length) return null;
  const { shoppingPredictions } = listSnapshotSync(shoppingList, state.shoppingPredictions);
  return {
    shoppingList,
    shoppingPredictions,
    basketPredictions: refreshBasketFreeze({ state, nextList: shoppingList, source: 'row-removal', requirePrev: true }),
  };
};

/** Actions for saved shopping products, kept out of the main store API. */
export const shoppingActions = (set) => ({
  toggleFavouriteShopping: (item) => set((state) => {
    if (!householdPermission(state, 'shopping')) return {};
    const name = text(item?.name, 100);
    const key = shoppingNameKey(name);
    if (!key) return {};
    const favourites = state.favouriteShopping || [];
    const existing = favourites.find((candidate) => shoppingNameKey(candidate.name) === key);
    if (existing) {
      return { favouriteShopping: favourites.filter((candidate) => shoppingNameKey(candidate.name) !== key) };
    }
    return {
      favouriteShopping: [
        ...favourites.slice(-49),
        {
          name,
          emoji: text(item.emoji, 12),
          aisle: text(item.aisle, 40) || 'Other',
          store: text(item.store, 80),
          qty: text(item.qty, 60),
          price: Math.max(0, Number(item.price) || 0),
          note: text(item.note, 160),
        },
      ],
    };
  }),
  setItemStore: (id, store) => set((state) => {
    if (!householdPermission(state, 'shopping')) return {};
    const value = text(store, 80);
    return { shoppingList: state.shoppingList.map((item) => (item.id === id ? { ...item, store: value } : item)) };
  }),

  // Bulk variants are atomic on purpose: one snapshot, so one undo reverses
  // the whole operation. Looping the single-item actions from a component
  // would leave the undo stack N calls deep with no way back but N taps.
  removeListItems: (ids) => set((state) => {
    if (!householdPermission(state, 'shopping')) return {};
    // The rows and their live snapshots leave in ONE write (see
    // removeRowsWithSnapshots) — the books cannot diverge mid-operation.
    const changes = removeRowsWithSnapshots(state, ids);
    return changes || {};
  }),

  /** Send every ticked item to the pantry in one move, merging with stock the
   * same way a recorded shop does. One atomic snapshot means one undo takes
   * the whole operation back. */
  moveCheckedToPantry: (location = 'Cupboard') => set((state) => {
    if (!householdPermission(state, 'shopping') || !householdPermission(state, 'pantry')) return {};
    const bought = state.shoppingList.filter((item) => item.checked);
    if (!bought.length) return {};
    const reconciled = reconcilePurchase(state.pantry, bought.map((item) => ({
      ...item,
      store: item.store || '',
      location,
      price: Number(item.price) || 0,
    })), {
      learnedAliases: state.aliasMemory || {},
      date: state.day,
      today: state.day,
      location,
      idFactory: () => uid('p'),
    });
    return {
      pantry: reconciled.pantry,
      // The moved rows leave the list — their live snapshots leave in the
      // SAME write (the list ↔ snapshot invariant holds mid-operation).
      ...(() => {
        const nextList = state.shoppingList.filter((item) => !bought.some((boughtItem) => boughtItem.id === item.id));
        const { shoppingPredictions } = listSnapshotSync(nextList, state.shoppingPredictions);
        return {
          shoppingList: nextList,
          shoppingPredictions,
          // The shown basket changed — refresh or invalidate the freeze in
          // the same write (see removeRowsWithSnapshots).
          basketPredictions: refreshBasketFreeze({ state, nextList, source: 'row-removal', requirePrev: true }),
        };
      })(),
      pantryConflicts: reconciled.conflicts.length
        ? [...(state.pantryConflicts || []), ...reconciled.conflicts].slice(-100)
        : state.pantryConflicts,
      pantryEvents: [...(state.pantryEvents || []), {
        id: uid('pe'), type: 'bulk_move_to_pantry', date: state.day,
        added: reconciled.added.length, merged: reconciled.matches.filter((match) => match.action === 'merged').length,
      }].slice(-100),
    };
  }),
  moveListItem: (id, beforeId) =>
    set((s) => {
      const shoppingList = moveBefore(s.shoppingList, id, beforeId);
      return shoppingList === s.shoppingList ? {} : { shoppingList };
    }),
  removeListItem: (id) => set((s) => {
    const changes = removeRowsWithSnapshots(s, [id]);
    return changes || {};
  }),
  toggleChecked: (id) =>
    set((s) => ({
      shoppingList: s.shoppingList.map((i) => (i.id === id
        ? {
          ...i,
          checked: !i.checked,
          checkedAt: i.checked ? null : Date.now(),
          // Who ticked it — so a shared list reads as people's ticks,
          // not a single anonymous checkmark. Cleared on untick.
          checkedBy: i.checked ? null : s.activeMemberId || null,
        }
        : i)),
    })),
  clearChecked: () => set((s) => {
    const changes = removeRowsWithSnapshots(s, s.shoppingList.filter((i) => i.checked).map((i) => i.id));
    return changes || {};
  }),
  resolveListConflict: (conflictId, side = 'mine') => set((s) => {
    if (!householdPermission(s, 'shopping')) return {};
    const conflict = (s.listConflicts || [])
      .find((entry) => entry.id === conflictId && entry.status !== 'resolved');
    if (!conflict) return {};
    const { rows, conflicts } = applyListConflictResolution(
      s.shoppingList, s.listConflicts, conflictId, side,
    );
    // Resolution can drop rows — the invariant is re-enforced on the same
    // write, so no orphaned snapshot survives a conflict resolution (and the
    // basket freeze is refreshed/invalidated alongside, never left stale).
    const { shoppingPredictions } = listSnapshotSync(rows, s.shoppingPredictions);
    return {
      shoppingList: rows,
      shoppingPredictions,
      basketPredictions: refreshBasketFreeze({ state: s, nextList: rows, source: 'row-removal', requirePrev: true }),
      listConflicts: conflicts,
    };
  }),

  // Swap one list row for a substitute. The ROW keeps its id, but the
  // ingredient it names changes — so its frozen prediction no longer
  // describes what will be bought. The snapshot is relabelled with explicit
  // lineage (`substitutedFrom`) IN THE SAME WRITE, and the substitution is
  // planned through upsertPredictions so the fresh snapshot for the NEW
  // ingredient is written like any other row. Evaluation then either follows
  // the lineage or excludes the row — it never scores a Rice prediction
  // against a Quinoa purchase just because the row id matched.
  substituteListItem: (id, option) =>
    set((s) => {
      if (!householdPermission(s, 'shopping')) return {};
      const current = s.shoppingList.find((item) => item.id === id);
      const name = String(option?.name || '').trim();
      if (!current || name.length < 2 || current.name === name) return {};
      const duplicate = s.shoppingList.find((item) => item.id !== id && shoppingNameKey(item.name) === shoppingNameKey(name));
      if (duplicate) return {};
      const price = Number(option.price) || 0;
      const why = option.why || option.rationale || '';
      const shoppingList = s.shoppingList.map((item) => (item.id === id ? {
        ...item,
        name,
        emoji: option.emoji || emojiFor(name),
        price,
        priceSource: price ? (option.priceConfidence === 'receipt' ? 'receipt' : 'recorded') : 'unknown',
        aisle: aisleFor(name, s.aisleMemory),
        substitutedFrom: current.name,
        substitutionWhy: why,
        purchaseWarning: null,
      } : item));
      // Lineage on the prediction book: the row's old snapshot (same id) is
      // REPLACED by a fresh snapshot for the new ingredient, carrying the
      // substitution lineage. The Rice record cannot ride a Quinoa purchase
      // — the snapshot on this row id is a Quinoa snapshot, marked as a
      // substitution so evaluation can exclude it from ingredient accuracy.
      const substitutedRow = shoppingList.find((item) => item.id === id);
      // Recipe provenance belonged to the ORIGINAL ingredient: the fresh
      // snapshot names the substitution lineage instead of borrowing recipes
      // that never asked for it.
      const book = Array.isArray(s.shoppingPredictions) ? s.shoppingPredictions : [];
      const shoppingPredictions = upsertPredictions(
        [{ ...substitutedRow, sourceRecipes: [], fromRecipe: null }],
        book,
        { day: s.day, learnedAliases: s.aliasMemory || {} },
      );
      const changes = {
        shoppingList,
        shoppingPredictions,
      };
      // MATERIAL SUBSTITUTION REPRICE (task: re-freeze spend predictions
      // after substitutions): Rice £1 → Quinoa £3 changes the basket cost
      // actually on show, so a NEW freeze (source `substitution-reprice`) is
      // created NOW and the old freeze is superseded in the same write — it
      // remains historical evidence but checkout must evaluate against the
      // £3-era basket, never the £1 one.
      const nextRow = shoppingList.find((item) => item.id === id);
      if ((Number(nextRow?.price) || 0) !== (Number(current.price) || 0)) {
        changes.basketPredictions = refreshBasketFreeze({
          state: s,
          nextList: shoppingList,
          source: 'substitution-reprice',
        });
      }
      return changes;
    }),
});

export { receiptActions } from './receipt-actions.js';
