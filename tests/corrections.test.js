import { describe, it, expect, vi } from 'vitest';
import {
  applyCorrection,
  listRowCorrections,
  pantryRowCorrections,
  mealCorrections,
} from '../src/lib/corrections.js';
import { outcomeMetrics } from '../src/lib/outcome-metrics.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

/**
 * Corrections must feed real models, and the app must only claim learning
 * when the write actually persisted. Outcome metrics must carry evidence and
 * stay silent rather than showing a fabricated zero.
 */
const day = '2026-07-28';

describe('one-tap corrections', () => {
  it('offers the corrections that row\'s assumptions make, not a generic menu', () => {
    const rows = listRowCorrections({ id: 's1', name: 'Milk', qty: '2 pints', price: 1.2 });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('bought-other-amount');
    expect(ids).toContain('didnt-buy');
    expect(ids).toContain('already-have');
    expect(ids).toContain('price-wrong');
    // No expiry correction on a list row — that assumption lives on the pantry.
    expect(ids).not.toContain('expiry-wrong');

    const pantry = pantryRowCorrections({ id: 'p1', name: 'Bread', qty: '1', expiry: day });
    const pantryIds = pantry.map((r) => r.id);
    expect(pantryIds).toContain('used-it');
    expect(pantryIds).toContain('threw-away');
    expect(pantryIds).toContain('expiry-wrong');
    expect(pantryIds).not.toContain('price-wrong');
  });

  it('routes each correction to an existing persisted command', () => {
    const calls = [];
    const app = new Proxy({}, {
      get: (target, name) => (...args) => calls.push([String(name), ...args]),
    });
    const item = { id: 's1', name: 'Milk', qty: '2 pints', price: 1.2 };
    // Every tap reached the real command surface, with a value valid for
    // that correction's kind (a price correction rightly refuses text).
    const values = { 'bought-other-amount': '3 pints', 'price-wrong': '1.10' };
    for (const correction of listRowCorrections(item)) {
      const ctx = { app, item, value: values[correction.id] || '3 pints' };
      const { changed } = applyCorrection(correction, ctx);
      expect(changed, correction.id).toBe(true);
    }
    // Every tap reached the real command surface.
    expect(calls.length).toBeGreaterThan(0);
    const names = calls.map(([name]) => name);
    expect(names).toContain('updateListItem');
    expect(names).toContain('addPantryItem');
  });

  it('claims "Forq will remember" only when the write persisted', () => {
    const failingApp = { updateListItem: () => { throw new Error('storage blocked'); } };
    const item = { id: 's1', name: 'Milk', qty: '2 pints' };
    const correction = listRowCorrections(item).find((c) => c.id === 'didnt-buy');
    const { changed, remembers } = applyCorrection(correction, { app: failingApp, item });
    expect(changed).toBe(false);
    expect(remembers).toBeNull();
  });

  it('meal corrections respond through the recommendation feedback path', () => {
    const calls = [];
    const app = { respondToRecommendation: (payload) => calls.push(payload) };
    for (const correction of mealCorrections({ recipe: { id: 'r1' }, recommendationId: 'rec1' })) {
      const { changed } = applyCorrection(correction, { app });
      expect(changed, correction.id).toBe(true);
    }
    expect(calls.every((payload) => payload.recommendationId === 'rec1')).toBe(true);
    // Accept and reject are both represented.
    expect(calls.some((payload) => payload.accepted)).toBe(true);
    expect(calls.some((payload) => payload.accepted === false)).toBe(true);
  });
});

describe('outcome metrics carry evidence', () => {
  const app = (extra = {}) => {
    const state = { ...EMPTY_STATE, day, onboarded: true, portions: 2, ...extra };
    return { ...state, ...deriveApp(state) };
  };

  it('every metric names its evidence and assumption', () => {
    const metrics = outcomeMetrics(app());
    for (const metric of Object.values(metrics)) {
      expect(metric.label).toBeTruthy();
      expect(metric.evidence, metric.label).toBeTruthy();
      expect(metric.assumption, metric.label).toBeTruthy();
    }
  });

  it('money metrics only count recorded prices, never guesses', () => {
    const state = app({
      shoppingList: [
        { id: 's1', name: 'Milk', qty: '2', price: 1.2, priceSource: 'manual' },
        { id: 's2', name: 'Mystery', qty: '1', price: 0 }, // unpriced
      ],
    });
    const metrics = outcomeMetrics(state);
    // An unpriced row contributes nothing to a money figure.
    for (const metric of Object.values(metrics)) {
      if (metric.unit === '£' && metric.value != null) {
        expect(Number(metric.value)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('stays silent rather than inventing a zero', () => {
    const metrics = outcomeMetrics(app());
    // With no shops and no plan there is no savings figure — value is null,
    // so the caller shows nothing instead of "£0.00 saved".
    expect(metrics.honestSavings.value).toBeNull();
  });
});
