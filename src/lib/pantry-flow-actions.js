/**
 * The one-tap repairs for loop drift (see loop-learning.js).
 *
 * Both are the same writes the ordinary flows make — reconciling a purchase
 * like finishing a shop does, binning expired leftovers like the pantry's own
 * button — so a repaired loop and a hand-kept loop end up indistinguishable.
 */

import { reconcilePurchase } from './pantry-intelligence.js';
import { householdPermission } from './household.js';
import { LEFTOVER_CAT } from './mealplan.js';
import { uid } from './state.js';

export const pantryFlowActions = (set) => ({
  /** Finish what a shop started: run a recorded trip's items into the pantry. */
  reconcileShopToPantry: (shopId) =>
    set((s) => {
      if (!householdPermission(s, 'pantry')) return {};
      const shop = (s.shops || []).find((entry) => entry.id === shopId);
      if (!shop || shop.pantryReconciled) return {};
      const reconciled = reconcilePurchase(
        s.pantry,
        shop.items.map((item) => ({
          ...item,
          store: shop.store,
          location: 'Cupboard',
          price: Number(item.price) || 0,
        })),
        {
          learnedAliases: s.aliasMemory || {},
          date: shop.date,
          today: s.day,
          location: 'Cupboard',
          idFactory: () => uid('p'),
        },
      );
      const event = {
        id: uid('pe'),
        type: 'purchase_reconciliation',
        date: s.day,
        store: shop.store,
        added: reconciled.added.length,
        merged: reconciled.matches.filter((match) => match.action === 'merged').length,
        conflicts: reconciled.conflicts.length,
      };
      return {
        pantry: reconciled.pantry,
        pantryConflicts: [...(s.pantryConflicts || []), ...reconciled.conflicts].slice(-100),
        pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
        lastPantryEvent: event,
        shops: s.shops.map((entry) => (entry.id === shopId ? { ...entry, pantryReconciled: true } : entry)),
      };
    }),

  /** Expired portions become waste entries — the waste view stays truthful. */
  clearExpiredLeftovers: () =>
    set((s) => {
      if (!householdPermission(s, 'pantry')) return {};
      const expired = (s.pantry || []).filter(
        (p) => p.cat === LEFTOVER_CAT && p.expiry && p.expiry < s.day,
      );
      if (!expired.length) return {};
      const ids = new Set(expired.map((p) => p.id));
      const wasteRows = expired.map((item) => ({
        name: String(item.name || '').replace(/ \(leftovers\)$/, ''),
        cost: 0,
        qty: item.qty || '',
        cat: LEFTOVER_CAT,
        reason: 'expired',
        lifecycleState: 'discarded',
        date: s.day,
      }));
      const events = expired.map((item) => ({
        id: uid('pe'),
        type: 'pantry_lifecycle',
        itemId: item.id,
        name: item.name,
        from: item.lifecycleState || 'leftover',
        to: 'discarded',
        qty: item.qty || '',
        value: Number(item.cost) || 0,
        cat: LEFTOVER_CAT,
        reason: 'expired',
        date: s.day,
        at: Date.now(),
      }));
      return {
        pantry: s.pantry.filter((p) => !ids.has(p.id)),
        waste: [...s.waste, ...wasteRows],
        pantryEvents: [...(s.pantryEvents || []), ...events].slice(-100),
      };
    }),
});
