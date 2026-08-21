import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseReceipt } from '../src/lib/receipt.js';
import { lookupOpenPrices, priceFreshness, dedupeProducts, detectPackageMismatch } from '../src/server/retailer-providers.js';
import { observedStaleness, observedPriceLabel } from '../src/lib/observed-prices.js';
import { normaliseProvenance, sortByProvenance } from '../src/lib/price-provenance.js';
import { savingsSnapshot } from '../src/lib/savings.js';
import { wasteOutcome, LIFECYCLE_STATES, recordLifecycleEvent } from '../src/lib/pantry-lifecycle.js';
import { planOutcome, PLAN_REASONS } from '../src/lib/plan-outcome.js';
import { mergeShoppingLists, mergePantry, resolveVersionConflict, detectDuplicatePurchase } from '../src/lib/household-concurrency.js';
import { optimiseShopping, optimisationModes } from '../src/lib/shopping-optimisation.js';
import { outcomeDashboard } from '../src/lib/outcome-dashboard.js';
import { weeklyFoodLoop, CLOSED_LOOP_STEPS } from '../src/lib/food-loop.js';
import { SKIP_REASONS } from '../src/lib/planning-intelligence.js';
import { mealPlanAdherence } from '../src/lib/planning-intelligence.js';

// ---------- receipt edge cases ----------
describe('receipt edge cases', () => {
  it('parses multi-line wrapped names and ignores furniture', () => {
    const text = `
Tesco
12/07/2026
Milk 1L £1.45
CHOCOLATE BISCUITS
2 x £1.20  £2.40
TOTAL £3.85
Thank you
`;
    const res = parseReceipt(text);
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.printedTotal).toBe(3.85);
    // multi-line wrapped name should appear either as item or unread
    expect([...res.items.map((i) => i.name), ...res.unread].join(' ')).toMatch(/CHOCOLATE/i);
  });

  it('reports unbalanced total instead of silently accepting', () => {
    const text = `A £1.00\nB £2.00\nTOTAL £10.00`;
    const res = parseReceipt(text);
    expect(res.balanced).toBe(false);
    expect(res.printedTotal).toBe(10);
  });

  it('rejects single-line noise as not a receipt', () => {
    const res = parseReceipt('just one line');
    expect(res.error).toBeTruthy();
    expect(res.items).toEqual([]);
  });

  it('handles 0.482 kg @ £4.99/kg weighed goods', () => {
    const text = `STORE\nBananas\n0.482 kg @ £4.99/kg £2.41\nTOTAL £2.41`;
    const res = parseReceipt(text);
    // The weighed line's price attaches to the named item above it
    expect(res.items[0].price).toBeCloseTo(2.41, 2);
    expect(res.balanced).toBe(true);
  });

  it('reports an orphan priced line as unread instead of dropping it', () => {
    const res = parseReceipt(`STORE\n0.482 kg @ £4.99/kg £2.41\nTOTAL £2.41`);
    expect(res.unread.length).toBeGreaterThanOrEqual(1);
  });

  it('handles comma decimal separator', () => {
    const res = parseReceipt(`Milk £1,45\nTOTAL £1,45`);
    expect(res.items[0].price).toBeCloseTo(1.45, 2);
  });
});

// ---------- barcode edge cases ----------
describe('barcode edge cases', () => {
  it('priceFreshness marks >30d as stale', () => {
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    expect(priceFreshness(old).stale).toBe(true);
    expect(priceFreshness(old).level).toBe('stale');
  });
  it('priceFreshness marks fresh within 7d', () => {
    const fresh = new Date().toISOString();
    expect(priceFreshness(fresh).stale).toBe(false);
  });
  it('dedupeProducts keeps freshest or cheapest', () => {
    const rows = [
      { barcode: '123', price: 2, observedAt: new Date(Date.now() - 40 * 86400000).toISOString() },
      { barcode: '123', price: 1.5, observedAt: new Date().toISOString() },
    ];
    const deduped = dedupeProducts(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].price).toBe(1.5);
  });
  it('detectPackageMismatch warns on large size difference', () => {
    expect(detectPackageMismatch('400 g', '1 kg').mismatch).toBe(true);
    expect(detectPackageMismatch('500 g', '500 g').mismatch).toBe(false);
  });
});

// ---------- stale price handling ----------
describe('stale price handling', () => {
  it('observedStaleness labels fresh/ageing/old correctly', () => {
    const today = new Date().toISOString().slice(0, 10);
    const fresh = new Date().toISOString().slice(0, 10);
    expect(observedStaleness(fresh, today).level).toBe('fresh');
    const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    expect(observedStaleness(old, today).level).toBe('old');
  });
  it('observedPriceLabel never claims live', () => {
    const label = observedPriceLabel({ price: 1.2, store: 'Tesco', observedAt: new Date().toISOString() });
    expect(label.sourceLabel).toMatch(/community observed/i);
  });
  it('normaliseProvenance marks observed as not live and warns', () => {
    const p = normaliseProvenance({ price: 1, source: 'observed', observedAt: new Date(Date.now() - 40 * 86400000).toISOString(), store: 'Aldi' });
    expect(p.isLive).toBe(false);
    expect(p.warning).toMatch(/not a guaranteed/i);
    expect(p.isStale || p.freshnessTone === 'danger').toBeTruthy();
  });
  it('sortByProvenance ranks receipt above observed', () => {
    const sorted = sortByProvenance([
      { price: 1, source: 'observed', store: 'Aldi', observedAt: new Date().toISOString() },
      { price: 1.2, source: 'receipt', store: 'Tesco', observedAt: new Date().toISOString() },
    ]);
    expect(sorted[0].source).toBe('receipt');
  });
});

// ---------- retailer outage ----------
describe('retailer outage resilience', () => {
  it('timeout throws 504 with message', async () => {
    const origFetch = global.fetch;
    global.fetch = () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timeout'), { name: 'TimeoutError' })), 10));
    try {
      await lookupOpenPrices({ query: 'milk' });
      expect.unreachable?.('should throw');
    } catch (e) {
      expect(e.status).toBe(504);
      expect(e.message).toMatch(/timeout/i);
    } finally {
      global.fetch = origFetch;
    }
  });
  it('malformed payload throws 502 malformed', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => 'not json' });
    try {
      await lookupOpenPrices({ query: 'milk' });
      expect.unreachable?.('should throw');
    } catch (e) {
      expect(e.status).toBe(502);
      expect(e.message).toMatch(/malformed/i);
    } finally {
      global.fetch = origFetch;
    }
  });
  it('500 from provider throws 502 with provider code', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 503, text: async () => '{}', json: async () => ({}) });
    try {
      await lookupOpenPrices({ query: 'milk' });
      expect.unreachable?.('should throw');
    } catch (e) {
      expect(e.status).toBe(502);
      expect(e.message).toMatch(/provider/i);
    } finally {
      global.fetch = origFetch;
    }
  });
  it('429 rate limit throws 429', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 429, text: async () => '{}', json: async () => ({}) });
    try {
      await lookupOpenPrices({ query: 'milk' });
      expect.unreachable?.('should throw');
    } catch (e) {
      expect(e.status).toBe(429);
    } finally {
      global.fetch = origFetch;
    }
  });
});

// ---------- multi-user conflicts ----------
describe('household concurrency', () => {
  it('two users editing list simultaneously — deterministic checkedAt wins', () => {
    const local = [{ id: '1', name: 'Milk', checked: false, checkedAt: 100, aisle: 'Dairy' }];
    const remote = [{ id: '1', name: 'Milk', checked: true, checkedAt: 200, aisle: 'Dairy' }];
    const merged = mergeShoppingLists(local, remote);
    expect(merged.find((i) => i.id === '1').checked).toBe(true);
  });
  it('pantry quantity conflicts — merges when measurable, else conflict', () => {
    const local = [{ id: 'a', name: 'Rice', qty: '500 g' }];
    const remote = [{ id: 'b', name: 'Rice', qty: '500 g' }];
    const { pantry, conflicts } = mergePantry(local, remote);
    expect(pantry.length).toBe(1);
    expect(conflicts.length).toBe(0);
    const local2 = [{ id: 'a', name: 'Rice', qty: 'some' }];
    const remote2 = [{ id: 'b', name: 'Rice', qty: 'a handful' }];
    const res2 = mergePantry(local2, remote2);
    expect(res2.conflicts.length).toBe(1);
  });
  it('duplicate purchases detected', () => {
    const list = [{ name: 'Milk' }];
    expect(detectDuplicatePurchase('Milk', list, [])?.duplicate).toBe(true);
    expect(detectDuplicatePurchase('Bread', list, [])?.duplicate).toBe(false);
  });
  it('membership version conflict resolves deterministically', () => {
    const local = resolveVersionConflict(2, 3, { a: 1 }, { b: 2 });
    expect(local.winner).toBe('remote');
    const tie = resolveVersionConflict(1, 1, { a: 1 }, { b: 2 });
    expect(tie.winner).toBe('remote');
    expect(tie.conflict).toBe(true);
  });
  it('offline queue replay', async () => {
    const { offlineQueue } = await import('../src/lib/household-concurrency.js');
    const q = offlineQueue.enqueue([], { type: 'addToList', name: 'Milk' });
    const results = await offlineQueue.replay(q, async (op) => op.name);
    expect(results[0].ok).toBe(true);
  });
});

// ---------- waste tracking ----------
describe('waste tracking lifecycle', () => {
  it('LIFECYCLE_STATES includes all required states', () => {
    const ids = LIFECYCLE_STATES.map((s) => s.id);
    for (const required of ['purchased', 'opened', 'consumed', 'partially_consumed', 'used_in_recipe', 'leftover', 'expired', 'discarded']) {
      expect(ids).toContain(required);
    }
  });
  it('recordLifecycleEvent captures qty/value', () => {
    const item = { id: 'p1', name: 'Milk', cost: 1.2, qty: '1l' };
    const ev = recordLifecycleEvent(item, 'discarded', { qty: '500 ml', value: 0.6 });
    expect(ev.value).toBe(0.6);
    expect(ev.to).toBe('discarded');
  });
  it('wasteOutcome calculates waste rate and frequently discarded', () => {
    const pantry = [{ cat: 'Fresh' }, { cat: 'Leftovers' }];
    const waste = [{ name: 'Milk', cost: 1, cat: 'Fresh' }, { name: 'Milk', cost: 1, cat: 'Fresh' }, { name: 'Bread', cost: 0.8, cat: 'Bakery' }];
    const events = [{ to: 'consumed' }, { to: 'discarded' }, { to: 'discarded' }];
    const out = wasteOutcome(pantry, waste, events);
    expect(out.estimatedWastedValue).toBeCloseTo(2.8, 2);
    expect(out.frequentlyDiscarded[0].name).toBe('Milk');
    expect(out.wasteRate).toBeGreaterThan(0);
  });
  it('waste rate null when no events', () => {
    expect(wasteOutcome([], [], []).wasteRate).toBe(null);
  });
});

// ---------- plan-outcome tracking ----------
describe('plan-outcome tracking', () => {
  const day = '2026-08-03';
  const DINNER = 'chicken-traybake'; // real recipe id from the book
  const LUNCH = 'chickpea-curry';
  it('tracks meals planned vs cooked vs skipped', () => {
    const plan = { [day]: { dinner: DINNER, lunch: LUNCH } };
    const events = [{ date: day, slot: 'dinner', status: 'cooked', at: 1 }, { date: day, slot: 'lunch', status: 'skipped', reason: 'no-time', at: 2 }];
    const out = planOutcome(plan, [day], events, []);
    expect(out.planned).toBe(2);
    expect(out.completed).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.reasons['no-time']).toBe(1);
  });
  it('supports new reasons: leftovers-available, plan-too-complex, takeaway', () => {
    expect(SKIP_REASONS.map((r) => r.id)).toContain('leftovers-available');
    expect(SKIP_REASONS.map((r) => r.id)).toContain('plan-too-complex');
    expect(PLAN_REASONS.map((r) => r.id)).toContain('leftovers-available');
    const plan = { [day]: { dinner: DINNER } };
    const events = [{ date: day, slot: 'dinner', status: 'skipped', reason: 'leftovers-available', at: 1 }];
    const out = planOutcome(plan, [day], events, []);
    expect(out.learning.topSkipReason).toBe('leftovers-available');
  });
  it('detects takeaway/unplanned meals', () => {
    const plan = { [day]: { dinner: DINNER } };
    const cooked = [{ recipeId: LUNCH, date: day }];
    const out = planOutcome(plan, [day], [], cooked);
    expect(out.takeaway).toBe(1);
  });
  it('uses leftovers-used reason to suggest scheduling', () => {
    const plan = { [day]: { dinner: DINNER } };
    const events = [{ date: day, slot: 'dinner', status: 'skipped', reason: 'leftovers-available', at: 1 }];
    const out = planOutcome(plan, [day], events, []);
    expect(out.learning.suggestion).toMatch(/Leftovers/i);
  });
  it('substitutions counted', () => {
    const plan = { [day]: { dinner: DINNER } };
    const events = [{ date: day, slot: 'dinner', status: 'substituted', actualRecipeId: LUNCH, at: 1 }];
    const out = planOutcome(plan, [day], events, []);
    expect(out.substituted).toBe(1);
  });
});

// ---------- savings tracking honest assumptions ----------
describe('real household savings tracking', () => {
  it('planned basket excludes unpriced with explicit assumption', () => {
    const state = {
      day: '2026-08-03',
      shoppingList: [{ name: 'Milk', price: 1 }, { name: 'Bread', price: 0 }],
      shops: [],
      waste: [],
      cooked: [],
    };
    const snap = savingsSnapshot(state, '2026-08-03', 7);
    expect(snap.planned.unpriced).toBe(1);
    expect(snap.planned.assumption).toMatch(/unpriced/i);
    expect(snap.planned.basketCost).toBe(1);
  });
  it('baseline uses median of ≥2 purchases, reports assumption', () => {
    const state = {
      day: '2026-08-03',
      shoppingList: [{ name: 'Milk', price: 1.5 }],
      shops: [
        { date: '2026-08-01', items: [{ name: 'Milk', price: 1.2 }] },
        { date: '2026-08-02', items: [{ name: 'Milk', price: 1.4 }] },
      ],
      waste: [],
      cooked: [],
    };
    const snap = savingsSnapshot(state, '2026-08-03', 7);
    expect(snap.baseline.covered).toBe(1);
    expect(snap.baseline.assumption).toMatch(/median/i);
  });
  it('savings are never inflated when no baseline', () => {
    const state = { day: '2026-08-03', shoppingList: [{ name: 'NewItem', price: 5 }], shops: [], waste: [], cooked: [] };
    const snap = savingsSnapshot(state, '2026-08-03', 7);
    expect(snap.savings.honestTotal).toBeGreaterThanOrEqual(0);
    expect(snap.baseline.assumption).toMatch(/No baseline/i);
  });
  it('waste value and rate tracked explicitly', () => {
    const state = {
      day: '2026-08-03',
      shoppingList: [],
      shops: [{ date: '2026-08-03', total: 20, saved: 2 }],
      waste: [{ name: 'Milk', cost: 1, date: '2026-08-03' }],
      cooked: [{ date: '2026-08-03', recipeId: 'r1' }],
    };
    const snap = savingsSnapshot(state, '2026-08-03', 7);
    expect(snap.waste.windowValue).toBe(1);
    expect(snap.waste.wasteRate).toBe(50);
  });
});

// ---------- shopping optimisation ----------
describe('shopping optimisation', () => {
  const items = [{ name: 'Milk', price: 1.2, qty: '1l' }, { name: 'Bread', price: 1, qty: '1 loaf' }];
  const shops = [
    { store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1.1 }] },
    { store: 'Tesco', date: '2026-08-01', items: [{ name: 'Milk', price: 1.5 }, { name: 'Bread', price: 0.9 }] },
  ];
  it('lowest_cost assigns cheapest store per item', () => {
    const res = optimiseShopping(items, { shops, mode: 'lowest_cost' });
    expect(res.mode).toBe('lowest_cost');
    expect(res.assignment.find((i) => i.name === 'Milk').store).toBe('Aldi');
  });
  it('fewest_shops consolidates stores', () => {
    const res = optimiseShopping(items, { shops, mode: 'fewest_shops' });
    expect(res.stores).toBe(1);
  });
  it('lowest_waste skips pantry-covered items', () => {
    const pantry = [{ name: 'Milk', confidence: 'definite', low: false, qty: '1l' }];
    const res = optimiseShopping(items, { shops, pantry, mode: 'lowest_waste', today: '2026-08-03' });
    expect(res.itemCount).toBeLessThanOrEqual(items.length);
  });
  it('balanced and fastest modes exist', () => {
    expect(optimisationModes.map((m) => m.id)).toContain('balanced');
    expect(optimisationModes.map((m) => m.id)).toContain('fastest');
    expect(optimiseShopping(items, { shops, mode: 'balanced' }).explanation).toMatch(/Balanced/i);
    expect(optimiseShopping(items, { shops, mode: 'fastest' }).explanation).toBeTruthy();
  });
});

// ---------- outcome dashboard ----------
describe('real outcome dashboard', () => {
  it('measures over time with explicit assumptions', () => {
    const state = {
      day: '2026-08-03',
      plan: { '2026-08-03': { dinner: 'chicken-traybake' } },
      mealPlanEvents: [{ date: '2026-08-03', slot: 'dinner', status: 'cooked', at: 1 }],
      cooked: [{ recipeId: 'chicken-traybake', date: '2026-08-03' }],
      pantry: [{ name: 'Milk', confidence: 'definite', low: false }],
      shoppingList: [{ name: 'Milk', checked: true }],
      shops: [{ date: '2026-08-03', total: 10, items: [{ name: 'Milk', price: 1 }] }],
      waste: [{ name: 'Milk', cost: 1, date: '2026-08-02' }],
      pantryEvents: [],
    };
    const dash = outcomeDashboard(state, { today: '2026-08-03', windowDays: 7 });
    expect(dash.spend.actual).toBeGreaterThan(0);
    expect(dash.adherence.planned).toBeGreaterThan(0);
    expect(dash.waste.count).toBeGreaterThan(0);
    expect(dash.pantryAccuracy.total).toBe(1);
    expect(dash.shoppingCompletion.total).toBe(1);
  });
  it('reports not ready when no data', () => {
    const state = { day: '2026-08-03', plan: {}, shops: [], waste: [], pantry: [], shoppingList: [], mealPlanEvents: [], cooked: [] };
    const dash = outcomeDashboard(state, { today: '2026-08-03', windowDays: 7 });
    expect(dash.ready).toBe(false);
  });
});

// ---------- E2E core workflow ----------
describe('E2E core workflow (pantry → plan → shop → purchase → consumption → leftovers → learning)', () => {
  it('weeklyFoodLoop exposes full 8-step closed loop', () => {
    expect(CLOSED_LOOP_STEPS).toHaveLength(8);
    expect(CLOSED_LOOP_STEPS.map((s) => s.id)).toEqual(['pantry', 'plan', 'list', 'purchase', 'consumption', 'leftovers', 'waste', 'learning']);
    const state = { day: '2026-08-03', plan: {}, pantry: [{ name: 'Milk' }], shoppingList: [{ name: 'Bread' }], shops: [{ date: '2026-08-03' }], cooked: [{ date: '2026-08-03', recipeId: 'r1' }], waste: [], mealPlanEvents: [{ date: '2026-08-03', slot: 'dinner', status: 'cooked', at: 1 }] };
    const loop = weeklyFoodLoop(state, '2026-08-03');
    expect(loop.closedLoop.steps).toHaveLength(8);
    expect(loop.closedLoop.pct).toBeGreaterThan(0);
    expect(loop.nextClosed).toBeTruthy();
  });
  it('SKIP_REASONS include new learning reasons', () => {
    const ids = SKIP_REASONS.map((r) => r.id);
    expect(ids).toContain('leftovers-available');
    expect(ids).toContain('plan-too-complex');
    expect(ids).toContain('changed-preference');
  });
});
