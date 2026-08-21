import { householdPermission } from './household.js';
import { uid } from './state.js';
import { reconcilePurchase } from './pantry-intelligence.js';

const text = (value, max) => String(value || '').trim().slice(0, max);

const receiptItems = (items) => (Array.isArray(items) ? items : [])
  .map((item) => ({
    name: text(item?.name, 120),
    price: Math.max(0, Number(item?.price) || 0),
    qty: text(item?.qty, 60),
    emoji: text(item?.emoji, 12),
  }))
  .filter((item) => item.name);

const receiptShop = (state, { store, date, total }, items) => ({
  id: uid('h'),
  date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : state.day,
  store: text(store, 80) || 'Unnamed shop',
  total: Math.round(Math.max(0, Number(total) || 0) * 100) / 100,
  saved: 0,
  items,
});

/** Save a confirmed receipt as one undoable pantry + shop-history operation. */
export const receiptActions = (set) => ({
  saveReceipt: ({ store, date, total, items = [] } = {}) => set((state) => {
    if (!householdPermission(state, 'shopping') || !householdPermission(state, 'pantry')) return {};
    const bought = receiptItems(items);
    if (!bought.length) return {};
    const shop = receiptShop(state, { store, date, total }, bought);
    const reconciled = reconcilePurchase(state.pantry, bought.map((item) => ({
      ...item,
      cat: 'Fresh',
      location: 'Cupboard',
      store: shop.store,
    })), {
      learnedAliases: state.aliasMemory || {},
      date: shop.date,
      today: state.day,
      idFactory: () => uid('p'),
    });
    const event = {
      id: uid('pe'),
      type: 'purchase_reconciliation',
      date: state.day,
      store: shop.store,
      added: reconciled.added.length,
      merged: reconciled.matches.filter((match) => match.action === 'merged').length,
      conflicts: reconciled.conflicts.length,
    };
    return {
      shops: [...state.shops, shop],
      pantry: reconciled.pantry,
      pantryConflicts: [...(state.pantryConflicts || []), ...reconciled.conflicts].slice(-100),
      pantryEvents: [...(state.pantryEvents || []), event].slice(-100),
      lastPantryEvent: event,
    };
  }),
});
