import { householdPermission } from './household.js';
import { shoppingNameKey } from './shopping.js';

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
});

export { receiptActions } from './receipt-actions.js';
