import { describe, expect, it } from 'vitest';
import { rescueSuggestions } from '../src/lib/expiry-rescue.js';

const day = '2026-10-28';
const recipes = [
  { id: 'r1', name: 'Spinach dal', ingredients: [{ name: 'spinach' }, { name: 'lentils' }] },
  { id: 'r2', name: 'Spinach omelette', ingredients: [{ name: 'spinach' }, { name: 'eggs' }] },
  { id: 'r3', name: 'Plain pasta', ingredients: [{ name: 'pasta' }] },
];
const soon = (daysLeft) => [{ item: { name: 'spinach' }, daysLeft }];

describe('rescueSuggestions', () => {
  it('suggests recipes that use expiring items, tonight when it goes off today', () => {
    const out = rescueSuggestions({ recipes, useSoonRows: soon(0), plan: {}, day });
    expect(out).toHaveLength(1);
    expect(out[0].tonight).toBe(true);
    expect(out[0].date).toBe(day);
    expect(out.map((o) => o.recipe.id)).not.toContain('r3');
  });
  it('gives each night to one suggestion and skips taken nights', () => {
    const out = rescueSuggestions({ recipes, useSoonRows: soon(2), plan: { [day]: { dinner: 'x' } }, day });
    expect(out.map((o) => o.date)).toEqual(['2026-10-29', '2026-10-30']);
  });
  it('drops suggestions with no open night before expiry and skips planned recipes', () => {
    expect(rescueSuggestions({ recipes, useSoonRows: soon(0), plan: { [day]: { dinner: 'x' } }, day })).toEqual([]);
    const out = rescueSuggestions({ recipes, useSoonRows: soon(3), plan: { '2026-10-31': { lunch: 'r1' } }, day });
    expect(out.map((o) => o.recipe.id)).toEqual(['r2']);
  });
  it('returns nothing with no expiring items', () => {
    expect(rescueSuggestions({ recipes, useSoonRows: [], plan: {}, day })).toEqual([]);
  });
});
