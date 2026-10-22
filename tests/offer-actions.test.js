import { describe, it, expect } from 'vitest';
import { offerActions } from '../src/lib/offer-actions.js';

const makeStore = (init = {}) => {
  let state = { day: '2026-10-21', offers: [], priceAlerts: [], coupons: [], priceAlertConfig: {}, ...init };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { actions: offerActions(set, { current: state }), get: () => state };
};

describe('offer, alert and coupon actions', () => {
  it('addCoupon saves a valid coupon instead of throwing (missing imports)', () => {
    const { actions, get } = makeStore();
    expect(() => actions.addCoupon({ label: '50p off milk', kind: 'money', value: 0.5 })).not.toThrow();
    expect(get().coupons).toHaveLength(1);
    expect(get().coupons[0].label).toBe('50p off milk');
  });
  it('addCoupon rejects short labels and zero-value money coupons', () => {
    const { actions, get } = makeStore();
    actions.addCoupon({ label: 'x', kind: 'money', value: 1 });
    actions.addCoupon({ label: 'Free thing', kind: 'money', value: 0 });
    expect(get().coupons).toEqual([]);
  });
  it('toggleCouponUsed stamps and clears usedAt', () => {
    const { actions, get } = makeStore();
    actions.addCoupon({ label: '10% off', kind: 'percent', value: 10 });
    const id = get().coupons[0].id;
    actions.toggleCouponUsed(id);
    expect(get().coupons[0]).toMatchObject({ used: true, usedAt: '2026-10-21' });
    actions.toggleCouponUsed(id);
    expect(get().coupons[0]).toMatchObject({ used: false, usedAt: null });
  });
  it('addOffer validates label/match, kind, value and expiry', () => {
    const { actions, get } = makeStore();
    actions.addOffer({ label: 'a', match: 'milk' });
    actions.addOffer({ label: 'Milk deal', match: '' });
    expect(get().offers).toEqual([]);
    actions.addOffer({ label: 'Milk deal', match: 'milk', kind: 'bogus', value: -3, expiry: 'tomorrow' });
    expect(get().offers[0]).toMatchObject({ kind: 'money', value: 0, expiry: null });
  });
  it('addPriceAlert needs a name and a positive target', () => {
    const { actions, get } = makeStore();
    actions.addPriceAlert({ name: 'Eggs', target: 0 });
    actions.addPriceAlert({ name: 'E', target: 2 });
    expect(get().priceAlerts).toEqual([]);
    actions.addPriceAlert({ name: 'Eggs', target: 2 });
    expect(get().priceAlerts).toHaveLength(1);
  });
});
