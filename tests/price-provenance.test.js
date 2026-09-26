import { describe, expect, it } from 'vitest';
import {
  isValidLedgerEvent, isValidPantryItem, isValidPriceObservation, isValidShoppingItem,
} from '../src/lib/domain-contracts.js';
import { detectPriceMismatch, mostAuthoritative, normaliseProvenance } from '../src/lib/price-provenance.js';
import { candidatesFor, resolvePrice } from '../src/lib/price-resolver.js';
import { classifyAiFailure } from '../src/server/openrouter.js';
import { aiReadiness } from '../src/server/env.js';

describe('price provenance — every price carries its receipt', () => {
  it('normalises scraper method/via rows instead of calling them manual', () => {
    expect(normaliseProvenance({ name: 'Milk', price: 1.25, method: 'ai-extracted', retailer: 'Tesco' }).source)
      .toBe('ai-extracted');
    expect(normaliseProvenance({ name: 'Milk', price: 1.25, method: 'google-shopping', retailer: 'Asda' }).source)
      .toBe('google-shopping');
    expect(normaliseProvenance({ name: 'Milk', price: 1.25, source: 'scraped', retailer: 'Tesco' }).source)
      .toBe('scraped');
  });

  it('never presents AI-read or community rows as live quotes', () => {
    const ai = normaliseProvenance({ name: 'Milk', price: 1.25, method: 'ai-extracted' });
    const community = normaliseProvenance({ name: 'Milk', price: 1.1, source: 'observed', observedAt: '2026-09-01' });
    expect(ai.isLive).toBe(false);
    expect(community.isLive).toBe(false);
    expect(ai.warning).toMatch(/confirm at the shelf/i);
    expect(community.warning).toMatch(/not a guaranteed/i);
  });

  it('ranks receipt above live above community above estimate', () => {
    const best = mostAuthoritative([
      { name: 'Beans', price: 0.9, source: 'estimated' },
      { name: 'Beans', price: 1.0, source: 'observed', observedAt: '2026-09-20' },
      { name: 'Beans', price: 1.2, source: 'receipt', observedAt: '2026-09-25' },
    ]);
    expect(best.source).toBe('receipt');
  });

  it('flags a mismatched product instead of pricing it confidently', () => {
    expect(detectPriceMismatch({ name: 'Green beans 220g' }, 'Heinz baked beans')).not.toBeNull();
    expect(detectPriceMismatch({ name: 'Heinz baked beans 415g' }, 'Heinz baked beans')).toBeNull();
  });

  it('demotes a mismatched scrape below the household receipt', () => {
    const resolved = resolvePrice('Heinz baked beans', {
      scraped: {
        'heinz baked beans': {
          best: { price: 0.4, name: 'Green beans 220g', retailer: 'Tesco', url: 'https://x.test' },
          checkedAt: new Date().toISOString(),
        },
      },
      receipts: { 'heinz baked beans': { points: [{ price: 1.2, date: '2026-09-20', store: 'Tesco' }] } },
    });
    expect(resolved.resolved).toBe(true);
    expect(resolved.source).toBe('recorded');
    expect(resolved.mismatch?.reason).toMatch(/different product|missing/i);
  });

  it('candidates carry provenance, never an invented price', () => {
    expect(candidatesFor('Unicorn steaks', {})).toEqual([]);
    expect(resolvePrice('Unicorn steaks', {}).resolved).toBe(false);
  });
});

describe('domain contracts — invalid states are constructible only by hand', () => {
  it('rejects prices without a source, rows without names, events without provenance', () => {
    expect(isValidPriceObservation({ name: 'Milk', price: 1.2 })).toBe(false);
    expect(isValidPriceObservation({ name: 'Milk', price: 1.2, source: 'receipt' })).toBe(true);
    expect(isValidShoppingItem({ name: 'Milk' })).toBe(false);
    expect(isValidShoppingItem({ id: 's1', name: 'Milk' })).toBe(true);
    expect(isValidPantryItem({ id: 'p1', name: '' })).toBe(false);
    expect(isValidPantryItem({ id: 'p1', name: 'Milk' })).toBe(true);
    expect(isValidLedgerEvent({ id: 'e1', type: 'MealCooked', at: '2026-09-26T00:00:00Z' })).toBe(false);
    expect(isValidLedgerEvent({
      id: 'e1', type: 'MealCooked', at: '2026-09-26T00:00:00Z', origin: 'user',
    })).toBe(true);
  });

  it('classifies AI failures into permanent / retry-model / retry-provider', () => {
    expect(classifyAiFailure({ status: 401 })).toBe('permanent');
    expect(classifyAiFailure({ status: 404 })).toBe('retry-model');
    expect(classifyAiFailure({ status: 503 })).toBe('retry-provider');
  });

  it('reports free-tier AI as ready without OpenAI', () => {
    expect(aiReadiness({}).ready).toBe(false);
    expect(aiReadiness({ NVIDIA_API_KEY: 'nvapi-x' }).ready).toBe(true);
    expect(aiReadiness({ OPENROUTER_API_KEY: 'sk-or-x' }).provider).toBe('openrouter');
  });
});
