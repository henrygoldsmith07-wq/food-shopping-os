import { describe, it, expect } from 'vitest';
import {
  PRODUCT,
  PRIMARY_LOOP,
  SUPPORTING_PILLARS,
  SURFACE_POSITIONING,
} from '../src/data/product.js';

describe('Forq product positioning', () => {
  it('states a single primary promise about what to eat, buy and waste', () => {
    // The canonical sentence is owned by tests/copy-claims.test.js, which locks
    // it across README, the demo page, onboarding and docs/SCOPE.md. It reads
    // "it works out what to buy" (Wedge cut 2, 2026-10-06) — not the older
    // "what you need to buy" this test used to assert. Update this together with
    // copy-claims.test.js and the four copy sites, never alone.
    // Matches the spelled-out "what you are eating" in the canonical sentence.
    expect(PRODUCT.promise).toMatch(/what you are eating/i);
    expect(PRODUCT.promise).toMatch(/works out what to buy/i);
    expect(PRODUCT.promise).toMatch(/waste less/i);
  });

  it('orders the primary loop plan → shop → waste', () => {
    expect(PRIMARY_LOOP.map((s) => s.id)).toEqual(['plan', 'shop', 'waste']);
  });

  it('marks nutrition, health and exercise as support, not primary', () => {
    for (const id of ['nutrition', 'health', 'exercise', 'analytics']) {
      const pillar = SUPPORTING_PILLARS.find((p) => p.id === id);
      expect(pillar, id).toBeTruthy();
      expect(pillar.role).toBe('support');
    }
  });

  it('positions log tab as support and plan/shop as primary', () => {
    expect(SURFACE_POSITIONING.plan.role).toBe('primary');
    expect(SURFACE_POSITIONING.shop.role).toBe('primary');
    expect(SURFACE_POSITIONING.log.role).toBe('support');
    expect(SURFACE_POSITIONING.recipes.role).toBe('support');
  });

  it('meta description leads with the promise, not a feature laundry list', () => {
    expect(PRODUCT.metaDescription.toLowerCase()).toContain('plan meals');
    expect(PRODUCT.metaDescription.toLowerCase()).not.toContain('fitness tracker');
    expect(PRODUCT.metaDescription.toLowerCase()).not.toContain('health tracker');
    // The field's own doc comment caps it at ~155 chars for search snippets.
    // Nothing enforced that, so a well-meaning rewrite could quietly exceed it.
    expect(PRODUCT.metaDescription.length).toBeLessThanOrEqual(155);
  });
});
