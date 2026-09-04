import { householdPermission } from './household.js';
import { shoppingNameKey } from './shopping.js';
import { reconcilePurchase } from './pantry-intelligence.js';
import { moveBefore } from './utils.js';
import { applyListConflictResolution } from './household-concurrency.js';
import { uid } from './state.js';

const text = (value, max) => String(value || '').trim().slice(0, max);

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
    const gone = new Set(ids);
    const shoppingList = state.shoppingList.filter((item) => !gone.has(item.id));
    return shoppingList.length === state.shoppingList.length ? {} : { shoppingList };
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
      shoppingList: state.shoppingList.filter((item) => !bought.some((boughtItem) => boughtItem.id === item.id)),
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
  removeListItem: (id) => set((s) => ({ shoppingList: s.shoppingList.filter((i) => i.id !== id) })),
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
  clearChecked: () => set((s) => ({ shoppingList: s.shoppingList.filter((i) => !i.checked) })),
  resolveListConflict: (conflictId, side = 'mine') => set((s) => {
    if (!householdPermission(s, 'shopping')) return {};
    const conflict = (s.listConflicts || [])
      .find((entry) => entry.id === conflictId && entry.status !== 'resolved');
    if (!conflict) return {};
    const { rows, conflicts } = applyListConflictResolution(
      s.shoppingList, s.listConflicts, conflictId, side,
    );
    return { shoppingList: rows, listConflicts: conflicts };
  }),
});

export { receiptActions } from './receipt-actions.js';
