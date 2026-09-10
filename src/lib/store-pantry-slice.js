/**
 * Pantry domain slice — lifecycle commands extracted from the central store.
 *
 * Part of the store decomposition (see store-slices.js): the pantry slice owns
 * bin / consume / lifecycle transitions. Pure command creators over `set`;
 * no React, no network, offline-safe. Every waste write appends one
 * IngredientWasted ledger event so Plan → Shop → Eat stays replayable.
 */

import { createLedgerEvent } from './event-ledger.js';

export const PANTRY_LIFECYCLE_STATES = ['opened', 'partially_consumed', 'leftover', 'expired', 'consumed', 'discarded'];

const withLedger = (state, event) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  return { ...state, householdLedger: [...ledger, event].slice(-500) };
};

export const pantryLifecycleActions = (set, { householdPermission, uid }) => ({
  binPantryItem: (id, { qty, value, reason } = {}) =>
    set((s) => {
      const item = householdPermission(s, 'pantry') ? s.pantry.find((p) => p.id === id) : null;
      if (!item) return {};
      const wasteValue = value != null ? Number(value) : Number(item.cost) || 0;
      const lifecycleEvent = {
        id: uid('pe'),
        type: 'pantry_lifecycle',
        itemId: item.id,
        name: item.name,
        from: item.lifecycleState || 'purchased',
        to: 'discarded',
        qty: qty || item.qty || '',
        value: Math.round(wasteValue * 100) / 100,
        cat: item.cat || 'Other',
        reason: reason || 'discarded',
        date: s.day,
        at: Date.now(),
      };
      return withLedger({
        pantry: s.pantry
          .map((p) => (p.id === id ? { ...p, lifecycleState: 'discarded', discardedAt: s.day } : p))
          .filter((p) => p.id !== id),
        waste: [...s.waste, {
          name: item.name,
          cost: Math.round(wasteValue * 100) / 100,
          qty: qty || item.qty || '',
          cat: item.cat || 'Other',
          reason: reason || 'expired',
          lifecycleState: 'discarded',
          date: s.day,
          quantity: Number(qty) || undefined,
        }],
        pantryEvents: [...(s.pantryEvents || []), lifecycleEvent].slice(-100),
        lastPantryEvent: lifecycleEvent,
      }, createLedgerEvent('IngredientWasted', {
        name: item.name,
        reason: reason || 'expired',
        cost: Math.round(wasteValue * 100) / 100,
      }, { origin: 'user' }));
    }),
  consumePantryItem: (id, { qty } = {}) =>
    set((s) => {
      const item = householdPermission(s, 'pantry') ? s.pantry.find((p) => p.id === id) : null;
      if (!item) return {};
      const event = {
        id: uid('pe'),
        type: 'pantry_lifecycle',
        itemId: item.id,
        name: item.name,
        from: item.lifecycleState || 'purchased',
        to: 'consumed',
        qty: qty || item.qty || '',
        value: Number(item.cost) || 0,
        cat: item.cat || 'Other',
        reason: 'consumed',
        date: s.day,
        at: Date.now(),
      };
      return {
        pantry: s.pantry.filter((p) => p.id !== id),
        pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
        lastPantryEvent: event,
      };
    }),
  updatePantryLifecycle: (id, toState, { qty, value, note } = {}) =>
    set((s) => {
      const item = s.pantry.find((p) => p.id === id);
      if (!item || !PANTRY_LIFECYCLE_STATES.includes(toState)) return {};
      const event = {
        id: uid('pe'),
        type: 'pantry_lifecycle',
        itemId: item.id,
        name: item.name,
        from: item.lifecycleState || 'purchased',
        to: toState,
        qty: qty || item.qty || '',
        value: value != null ? Number(value) : Number(item.cost) || 0,
        note: note || '',
        date: s.day,
        at: Date.now(),
      };
      const patch = { lifecycleState: toState };
      if (toState === 'opened') patch.openedDate = s.day;
      if (toState === 'expired') patch.expiredAt = s.day;
      if (toState === 'consumed' || toState === 'discarded') return {
        pantry: s.pantry.filter((p) => p.id !== id),
        waste: toState === 'discarded' ? [...s.waste, { name: item.name, cost: event.value, qty: event.qty, cat: item.cat || 'Other', reason: note || 'discarded', lifecycleState: toState, date: s.day }] : s.waste,
        pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
        lastPantryEvent: event,
      };
      return {
        pantry: s.pantry.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
        lastPantryEvent: event,
      };
    }),
});
