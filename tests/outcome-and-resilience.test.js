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

  it('fastest mode walks the learned store route when one exists', () => {
    // Both items cheapest at Aldi, so the trip is one shop and the Aldi
    // route applies. The learned order here is dairy first — the opposite
    // of the standard taxonomy, which puts Bakery before Dairy & eggs.
    const aldiWeek = [
      { store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1.1 }, { name: 'Bread', price: 0.8 }] },
      { store: 'Tesco', date: '2026-08-01', items: [{ name: 'Milk', price: 1.5 }, { name: 'Bread', price: 0.9 }] },
    ];
    const list = [
      { name: 'Milk', price: 1.2, qty: '1l', aisle: 'Dairy & eggs' },
      { name: 'Bread', price: 1, qty: '1 loaf', aisle: 'Bakery' },
    ];
    const res = optimiseShopping(list, {
      shops: aldiWeek, mode: 'fastest', routes: { Aldi: ['Dairy & eggs', 'Bakery'] },
    });
    expect(res.assignment.map((i) => i.name)).toEqual(['Milk', 'Bread']); // learned order wins
    expect(res.assignment[0].reason).toMatch(/Aisle 1 at Aldi/);
  });

  it('fastest mode falls back to standard order without a learned route', () => {
    const aldiWeek = [
      { store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1.1 }, { name: 'Bread', price: 0.8 }] },
    ];
    const list = [
      { name: 'Milk', price: 1.2, qty: '1l', aisle: 'Dairy & eggs' },
      { name: 'Bread', price: 1, qty: '1 loaf', aisle: 'Bakery' },
    ];
    const res = optimiseShopping(list, { shops: aldiWeek, mode: 'fastest' });
    // Standard taxonomy: Bakery before Dairy & eggs — routes were never guessed.
    expect(res.assignment.map((i) => i.name)).toEqual(['Bread', 'Milk']);
  });
});

// ---------- the week's budget guards the basket ----------
describe('the shopping budget guard', () => {
  // Milk is cheapest at Aldi (£1.10), Bread only recorded at Tesco (£0.90) —
  // a deterministic £2.00 lowest-cost basket to test headroom against.
  const items = [{ name: 'Milk', price: 1.2, qty: '1l' }, { name: 'Bread', price: 1, qty: '1 loaf' }];
  const shops = [
    { store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1.1 }] },
    { store: 'Tesco', date: '2026-08-01', items: [{ name: 'Milk', price: 1.5 }, { name: 'Bread', price: 0.9 }] },
  ];

  it('flags an assignment that exceeds the remaining headroom', () => {
    const res = optimiseShopping(items, { shops, mode: 'lowest_cost', weeklyBudget: 1.2 });
    expect(res.budget).toMatchObject({ weekly: 1.2, spent: 0, left: 1.2, total: 2, overBy: 0.8, over: true });
    // Every row from the point the running total crosses the headroom is flagged.
    expect(res.assignment.filter((row) => row.overBudget).length).toBeGreaterThan(0);
    expect(res.explanation).toMatch(/This basket is £0\.80 over the £1\.20 left of your £1\.20 budget/);
  });

  it('records spent spend against the weekly budget in the headroom', () => {
    // £25 already spent of a £30 week leaves £5; the £2 basket fits inside it.
    const res = optimiseShopping(items, { shops, mode: 'lowest_cost', weeklyBudget: 30, budgetSpent: 25 });
    expect(res.budget).toMatchObject({ weekly: 30, spent: 25, left: 5, over: false, overBy: 0 });
    expect(res.assignment.every((row) => !row.overBudget)).toBe(true);
    expect(res.explanation).toMatch(/Within budget: £5\.00 remains after £25\.00 spent of £30\.00\./);
  });

  it('reasons about the headroom in every mode\'s explanation', () => {
    for (const mode of ['lowest_cost', 'fewest_shops', 'balanced', 'lowest_waste', 'fastest']) {
      const res = optimiseShopping(items, { shops, mode, weeklyBudget: 1.2 });
      expect(res.budget.over, mode).toBe(true);
      expect(res.explanation, mode).toMatch(/over the £1\.20 left/);
    }
  });

  it('stays silent when no weekly budget is set', () => {
    const res = optimiseShopping(items, { shops, mode: 'balanced' });
    expect(res.budget).toBeNull();
    expect(res.assignment.some((row) => row.overBudget)).toBe(false);
    expect(res.explanation).not.toMatch(/budget/i);
  });

  it('keeps a typed price that beats every record instead of raising it', () => {
    // Butter is recorded at £2.00 only, but the household typed £1.50 —
    // the honest cheapest-known price is the typed one. Raising it to the
    // record would make the basket cost more, not less.
    const res = optimiseShopping(
      [{ name: 'Butter', price: 1.5, qty: '250g', store: 'Aldi' }],
      { shops: [{ store: 'Aldi', date: '2026-08-01', items: [{ name: 'Butter', price: 2 }] }], mode: 'lowest_cost', weeklyBudget: 10 },
    );
    expect(res.assignment[0]).toMatchObject({ price: 1.5, store: 'Aldi', source: 'manual' });
    expect(res.assignment[0].reason).toMatch(/beats the £2\.00 record — kept as typed/);
    expect(res.total).toBe(1.5);
  });

  it('lets the kept typed price pull a basket back inside the headroom', () => {
    // Milk £1.10 and Bread £0.90 are cheapest at Aldi; Eggs is recorded at
    // £2.20 (Aldi) and £1.90 (Tesco), but the household typed £1.50. At the
    // old behaviour Eggs jumped to £1.90 and the £3.60 headroom was missed
    // by £0.30; re-optimised at cheapest-known, the basket fits.
    const res = optimiseShopping(
      [
        { name: 'Milk', price: 1.4, qty: '1l' },
        { name: 'Bread', price: 1.2, qty: '1 loaf' },
        { name: 'Eggs', price: 1.5, qty: '6' },
      ],
      {
        shops: [
          { store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1.1 }, { name: 'Bread', price: 0.9 }, { name: 'Eggs', price: 2.2 }] },
          { store: 'Tesco', date: '2026-08-01', items: [{ name: 'Eggs', price: 1.9 }] },
        ],
        mode: 'lowest_cost',
        weeklyBudget: 3.6,
      },
    );
    expect(res.budget).toMatchObject({ total: 3.5, left: 3.6, over: false, overBy: 0 });
    expect(res.assignment.find((r) => r.name === 'Eggs')).toMatchObject({ price: 1.5, source: 'manual' });
    expect(res.assignment.every((row) => !row.overBudget)).toBe(true);
  });

  it('still moves to a cheaper recorded store when the typed price is higher', () => {
    const res = optimiseShopping(
      [{ name: 'Milk', price: 1.5, qty: '1l', store: 'Tesco' }],
      {
        shops: [
          { store: 'Tesco', date: '2026-08-01', items: [{ name: 'Milk', price: 1.5 }] },
          { store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1.1 }] },
        ],
        mode: 'lowest_cost',
        weeklyBudget: 1.2,
      },
    );
    expect(res.assignment[0]).toMatchObject({ price: 1.1, store: 'Aldi', source: 'historical' });
    expect(res.budget.over).toBe(false);
  });

  it('still flags rows that are over even at their cheapest known price', () => {
    // Honey typed at £1.60 is the cheapest known option (records run £1.80),
    // yet even that cannot fit £1.50 of headroom — the re-optimisation keeps
    // the typed price and the guard flags the genuine overage honestly.
    const res = optimiseShopping(
      [{ name: 'Honey', price: 1.6, qty: '340g' }],
      { shops: [{ store: 'Sainsbury', date: '2026-08-01', items: [{ name: 'Honey', price: 1.8 }] }], mode: 'lowest_cost', weeklyBudget: 1.5 },
    );
    expect(res.assignment[0]).toMatchObject({ price: 1.6, source: 'manual', overBudget: true });
    expect(res.budget).toMatchObject({ total: 1.6, left: 1.5, overBy: 0.1, over: true });
    expect(res.explanation).toMatch(/over the £1\.50 left/);
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
