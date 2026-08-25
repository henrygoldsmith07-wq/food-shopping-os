/**
 * Offers, price alerts, coupons — and the corrections that teach the app a
 * name it got wrong.
 *
 * None of this reads a retailer feed. An offer exists because someone typed it
 * in, an alert fires against prices from your own receipts, and a coupon is
 * one you told the app about. That is why every write here is a plain record
 * of something the user asserted, never a fetched fact.
 *
 * Split out of store-api.js, which assembles these alongside the pantry,
 * shopping, diary and household actions.
 */

import { canonicalName, learnAlias } from './aliases.js';
import { normalisePriceAlertConfig } from './price-alerts.js';
import { normaliseCoupon } from './coupons.js';
import { consolidatePantry as consolidate } from './pantry-intelligence.js';
import { routeFromTicks } from './shopping.js';
import { householdPermission } from './household.js';
import { uid } from './state.js';

export const offerActions = (set, latest) => ({
  addOffer: (offer) =>
    set((s) => {
      const label = String(offer.label || '').trim();
      const match = String(offer.match || '').trim();
      if (label.length < 2 || !match) return {};
      return {
        offers: [...s.offers, {
          id: uid('o'),
          label,
          match,
          kind: ['money', 'percent', 'multibuy'].includes(offer.kind) ? offer.kind : 'money',
          value: Math.max(0, Number(offer.value) || 0),
          store: String(offer.store || '').trim(),
          expiry: /^\d{4}-\d{2}-\d{2}$/.test(offer.expiry || '') ? offer.expiry : null,
          addedAt: s.day,
        }],
      };
    }),
  removeOffer: (id) => set((s) => ({ offers: s.offers.filter((o) => o.id !== id) })),
  addPriceAlert: ({ name, target }) =>
    set((s) => {
      const label = String(name || '').trim();
      const price = Math.max(0, Number(target) || 0);
      if (label.length < 2 || !price) return {};
      return { priceAlerts: [...s.priceAlerts, { id: uid('pa'), name: label, target: price }] };
    }),
  removePriceAlert: (id) =>
    set((s) => ({ priceAlerts: s.priceAlerts.filter((alert) => alert.id !== id) })),
  setPriceAlertConfig: (patch) =>
    set((s) => {
      const next = normalisePriceAlertConfig({ ...s.priceAlertConfig, ...(patch || {}) });
      return { priceAlertConfig: next };
    }),
  /* ---- Kitchen intelligence (Forq 10) ---- */
  setShoppingPreferences: (patch) =>
    set((s) => ({
      shoppingPreferences: {
        ...(s.shoppingPreferences || {}),
        ...(patch || {}),
        offlineMode: patch?.offlineMode == null ? Boolean(s.shoppingPreferences?.offlineMode) : Boolean(patch.offlineMode),
        largeTouch: patch?.largeTouch == null ? Boolean(s.shoppingPreferences?.largeTouch) : Boolean(patch.largeTouch),
      },
    })),
  setStoreRoute: (store, order) =>
    set((s) => {
      const cleanStore = String(store || '').trim();
      if (!cleanStore) return {};
      const cleaned = (Array.isArray(order) ? order : [])
        .map((aisle) => String(aisle || '').trim())
        .filter(Boolean);
      if (!cleaned.length) return {};
      return { storeRoutes: { ...(s.storeRoutes || {}), [cleanStore]: cleaned } };
    }),
  clearStoreRoute: (store) =>
    set((s) => {
      const routes = { ...(s.storeRoutes || {}) };
      if (!routes[store]) return {};
      delete routes[store];
      return { storeRoutes: routes };
    }),
  /** A scan/typo correction: 'tomatos' → 'tomatoes'. Teaches entity resolution. */
  learnCorrection: ({ from, to }) =>
    set((s) => {
      const next = learnAlias(s.aliasMemory || {}, from, to);
      if (next === s.aliasMemory) return {};
      const result = consolidate(s.pantry, { learnedAliases: next, today: s.day });
      const event = {
        id: uid('pe'), type: 'household_alias_learned', date: s.day,
        from, to, merged: result.merged,
      };
      return {
        aliasMemory: next,
        pantry: result.pantry,
        pantryConflicts: [...(s.pantryConflicts || []), ...result.conflicts].slice(-100),
        pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
        lastPantryEvent: event,
      };
    }),
  /** Alias-aware pantry consumption for one recipe's ingredient line. */
  canonicalName: (name) => canonicalName(name, latest.current.aliasMemory),
  setPriceAlertOverride: (name, kind, pct) =>
    set((s) => {
      const key = String(name || '').trim().toLowerCase();
      if (!key || !['rise', 'bargain'].includes(kind)) return {};
      const n = Math.max(5, Math.min(50, Math.round(Number(pct) || 15)));
      const overrides = { ...(s.priceAlertConfig?.overrides || {}) };
      const existing = overrides[key] || {};
      overrides[key] = { ...existing, [kind === 'rise' ? 'risePct' : 'bargainPct']: n };
      return { priceAlertConfig: normalisePriceAlertConfig({ ...s.priceAlertConfig, overrides }) };
    }),
  clearPriceAlertOverride: (name, kind) =>
    set((s) => {
      const key = String(name || '').trim().toLowerCase();
      const overrides = { ...(s.priceAlertConfig?.overrides || {}) };
      if (!overrides[key]) return {};
      const next = { ...overrides[key] };
      if (kind === 'rise') delete next.risePct;
      else if (kind === 'bargain') delete next.bargainPct;
      else delete overrides[key];
      if (kind && Object.keys(next).length) overrides[key] = next;
      else if (!kind) delete overrides[key];
      else delete overrides[key];
      return { priceAlertConfig: normalisePriceAlertConfig({ ...s.priceAlertConfig, overrides }) };
    }),
  // Coupon vault — manual + photo OCR draft (no retailer feed)
  addCoupon: (raw) =>
    set((s) => {
      const label = String(raw?.label || '').trim();
      if (label.length < 2) return {};
      const normalised = normaliseCoupon({ ...raw, id: raw?.id || uid('cp'), addedAt: s.day }, s.day);
      if (!normalised.label) return {};
      if (normalised.kind === 'money' || normalised.kind === 'percent' || normalised.kind === 'multibuy') {
        if (!(Number(normalised.value) > 0)) return {};
      }
      const kindOk = COUPON_KINDS.some((k) => k.id === normalised.kind);
      if (!kindOk) return {};
      const progOk = !normalised.programme || LOYALTY_PROGRAMMES.some((p) => p.id === normalised.programme);
      if (!progOk) return {};
      return { coupons: [...(s.coupons || []), normalised] };
    }),
  updateCoupon: (id, patch) =>
    set((s) => ({
      coupons: (s.coupons || []).map((c) => (c.id === id ? normaliseCoupon({ ...c, ...patch, id }, s.day) : c)),
    })),
  removeCoupon: (id) => set((s) => ({ coupons: (s.coupons || []).filter((c) => c.id !== id) })),
  toggleCouponUsed: (id) =>
    set((s) => ({
      coupons: (s.coupons || []).map((c) => c.id === id ? { ...c, used: !c.used, usedAt: !c.used ? s.day : null } : c),
    })),
});
