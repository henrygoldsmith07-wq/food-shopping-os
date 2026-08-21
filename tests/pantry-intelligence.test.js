import { describe, expect, it } from 'vitest';
import {
  consolidatePantry,
  explainPantryShortfall,
  inferConsumption,
  normalisePantryItem,
  pantryConfidenceLevel,
  reconcilePurchase,
  shortfallQuantity,
} from '../src/lib/pantry-intelligence.js';
import { consumePantryIngredients } from '../src/lib/kitchen.js';

describe('pantry intelligence', () => {
  it('decays dated confidence and keeps the evidence reason', () => {
    const reading = pantryConfidenceLevel({ confidence: 'definite', qty: '1 kg', addedAt: '2026-06-01' }, '2026-08-19');
    expect(reading.level).toBe('unknown');
    expect(reading.requiresConfirmation).toBe(true);
    expect(reading.reason).toMatch(/faded/);
  });

  it('normalises units without destroying the user-facing quantity', () => {
    const row = normalisePantryItem({ name: '2 tins tomatoes', qty: '2 tins' });
    expect(row.qty).toBe('2 tins');
    expect(row.normalisedQty).toBe('800 g');
    expect(row.amountConfidence).toBe('exact');
  });

  it('sums alias-matched quantities and surfaces incompatible conflicts', () => {
    const merged = consolidatePantry([
      { id: 'a', name: 'tinned tomatoes', qty: '1 tin', cost: 1 },
      { id: 'b', name: 'Chopped tomatoes', qty: '1 tin', cost: 1 },
    ], { today: '2026-08-19' });
    expect(merged.merged).toBe(1);
    expect(merged.pantry).toHaveLength(1);
    expect(merged.pantry[0].qty).toBe('2 tins');

    const conflict = consolidatePantry([
      { id: 'a', name: 'Milk', qty: '1 l' },
      { id: 'b', name: 'Milk', qty: '2 eggs' },
    ], { today: '2026-08-19' });
    expect(conflict.pantry).toHaveLength(2);
    expect(conflict.conflicts[0].status).toBe('open');
  });

  it('reconciles a purchase into existing stock with a confirmed source', () => {
    const result = reconcilePurchase(
      [{ id: 'a', name: 'Milk', qty: '500 ml', cost: 1 }],
      [{ name: 'milk', qty: '500 ml', price: 1.2, store: 'Tesco' }],
      { date: '2026-08-19', today: '2026-08-19', idFactory: () => 'p1' },
    );
    expect(result.added).toHaveLength(0);
    expect(result.matches[0].action).toBe('merged');
    expect(result.pantry[0].qty).toBe('1 l');
    expect(result.pantry[0].confidence).toBe('definite');
    expect(result.pantry[0].lastConfirmedAt).toBe('2026-08-19');
  });

  it('does not auto-deduct unknown stock and records the confirmation need', () => {
    const result = consumePantryIngredients(
      [{ id: 'a', name: 'Milk', qty: '1 l', confidence: 'unknown' }],
      [{ name: 'Milk', qty: '500 ml' }],
      { today: '2026-08-19' },
    );
    expect(result.confirmationNeeded[0].itemId).toBe('a');
    expect(result.pantry).toHaveLength(1);
    expect(result.shortfalls[0].short).toBe('500 ml');
  });

  it('explains the quantity and the recipes behind a shortfall', () => {
    expect(shortfallQuantity('300 g', '500 g', { ingredient: 'rice' })).toBe('200 g');
    expect(explainPantryShortfall({
      name: 'Rice', needQty: '500 g', availableQty: '300 g', shortfallQty: '200 g',
      sourceRecipes: ['Curry', 'Pilaf'],
    })).toMatch(/Curry and Pilaf/);
    expect(inferConsumption({ recipe: { id: 'r1', name: 'Curry' }, shortfalls: [{ name: 'Rice' }], today: '2026-08-19' }).confidence).toBe('low');
  });
});
