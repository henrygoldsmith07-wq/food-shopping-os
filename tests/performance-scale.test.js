import { describe, expect, it } from 'vitest';
import { compareBaskets } from '../src/lib/basket-optimizer.js';
import { expiringSoon, pantryValue } from '../src/lib/kitchen.js';
import { buildPlan } from '../src/lib/planner.js';
import { resolveList } from '../src/lib/price-resolver.js';
import { RECIPES } from '../src/data/recipes.js';

/**
 * Scale tripwires for the pure engines a power user actually hits.
 *
 * These are not microbenchmarks: budgets are ten times what a correct
 * implementation needs, so a slow machine never flakes them. What they catch
 * is the regression that hides in review — an accidental O(n²) inside a
 * routine that is fine at twenty rows and unusable at a thousand. Each case
 * also asserts correct counts at scale, so "fast" cannot be bought by
 * silently skipping work.
 *
 * The sizes are a deliberate exaggeration of a real household: nobody has a
 * thousand-item list, but the engines should survive one without notice.
 */

const elapsed = (fn) => {
  const start = performance.now();
  const out = fn();
  return { out, ms: performance.now() - start };
};

describe('the heavy engines stay linear-ish at power-user scale', () => {
  it('resolves a 1,000-item list against four price sources quickly', () => {
    // Lowercase names so raw and normalized keys agree, as the real stores do.
    const name = (i) => `pantry product ${i}`;
    const items = Array.from({ length: 1000 }, (_, i) => ({ name: name(i) }));
    const sources = {
      receipts: Object.fromEntries(Array.from({ length: 1000 }, (_, i) =>
        [name(i), { points: [{ date: '2026-07-01', price: 0.5 + i, store: 'Aldi' }] }])),
      scraped: Object.fromEntries(Array.from({ length: 1000 }, (_, i) =>
        [name(i), { checkedAt: '2026-08-26', best: { price: 0.6 + i, retailer: 'tesco.com', name: `Product ${i}` } }])),
    };
    const { out, ms } = elapsed(() => resolveList(items, sources, { now: new Date('2026-08-27').getTime() }));
    expect(out.total).toBe(1000);
    expect(out.resolved).toBe(1000);
    expect(out.rows.every((row) => Number.isFinite(row.price))).toBe(true);
    expect(ms).toBeLessThan(5000);
  });

  it('compares a 1,000-item basket across six stores quickly', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ name: `Item ${i}` }));
    const stores = Object.fromEntries(
      ['Tesco', 'Sainsburys', 'Asda', 'Aldi', 'Lidl', 'Morrisons'].map((store) => [
        store,
        Object.fromEntries(items.map((item, i) => [item.name.toLowerCase(), {
          price: 0.4 + i, offers: i % 7 === 0 ? [{ kind: 'money', value: 0.2, label: 'deal' }] : [],
        }])),
      ]),
    );
    const { out, ms } = elapsed(() => compareBaskets(items, stores));
    expect(out.best.store).toBeTruthy();
    expect(out.rows).toHaveLength(6);
    expect(ms).toBeLessThan(5000);
  });

  it('rolls up a 2,000-row pantry (value, expiring, low) quickly', () => {
    const pantry = Array.from({ length: 2000 }, (_, i) => ({
      id: `p${i}`,
      name: `Item ${i}`,
      cost: i % 7 ? 0.8 + i : 0, // a few cost nothing, like the real shape
      expiry: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      low: i % 11 === 0,
    }));
    const { out, ms } = elapsed(() => ({
      value: pantryValue(pantry),
      soon: expiringSoon(pantry, 3, '2026-08-27').length,
      low: pantry.filter((p) => p.low).length,
    }));
    expect(out.value).toBeGreaterThan(0);
    expect(out.soon + out.low).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
  });

  it('plans a week from a 420-recipe book quickly', () => {
    // The planner consumes the shipped recipe shape; clones with unique ids
    // grow the book without inventing fields the real entries lack.
    const base = RECIPES[0];
    const bigBook = Array.from({ length: 420 }, (_, i) => ({
      ...base,
      id: `${base.id}-clone-${i}`,
      name: `${base.name} variant ${i}`,
    }));
    const { out, ms } = elapsed(() => buildPlan({
      scope: 'A week',
      recipes: bigBook,
      people: 4,
      today: '2026-08-27',
    }, 7));
    expect(out).toBeTruthy();
    expect(ms).toBeLessThan(10000);
  });
});