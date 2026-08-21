import { describe, it, expect } from 'vitest';
import {
  PRODUCT,
  PRIMARY_LOOP,
  SUPPORTING_PILLARS,
  SURFACE_POSITIONING,
} from '../src/data/product.js';

describe('Forq product positioning', () => {
  it('states a single primary promise about plan, buy, waste', () => {
    expect(PRODUCT.promise).toMatch(/plan meals/i);
    expect(PRODUCT.promise).toMatch(/buy exactly what you need/i);
    expect(PRODUCT.promise).toMatch(/waste less food/i);
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
  });
});
