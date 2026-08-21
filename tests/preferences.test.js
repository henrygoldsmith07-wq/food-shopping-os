import { describe, it, expect } from 'vitest';
import {
  allergenHits, allowedByPrefs, blockedBy, intoleranceHits, isBlocked, prefsSummary, rankByPrefs,
  reach, recipeFit, religiousHits,
} from '../src/lib/preferences.js';
import { ALLERGENS, MATCH_CAVEAT, RELIGIOUS_DIETS } from '../src/data/preferences.js';
import {
  cmToFtIn, energyValue, formatEnergy, formatHeight, formatTime, formatVolume, formatWeight,
  formatters, kcalToKj, kgToLb, kgToStone, lbToKg, mlToFloz,
} from '../src/lib/units.js';

const recipe = (name, ingredients, over = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  ingredients: ingredients.map((n) => ({ name: n, qty: '1' })),
  steps: ['a', 'b'],
  time: 30,
  cuisine: 'British',
  ...over,
});

const PEANUT_STEW = recipe('Peanut stew', ['peanuts', 'sweet potato', 'onion']);
const FISH_PIE = recipe('Fish pie', ['cod', 'milk', 'potato'], { cuisine: 'British' });
const BACON_PASTA = recipe('Bacon pasta', ['bacon', 'pasta', 'cream'], { cuisine: 'Italian' });
const RICE_BOWL = recipe('Rice bowl', ['rice', 'spring onion', 'sesame'], { cuisine: 'Japanese' });

describe('allergies are a hard line', () => {
  it('finds the allergen a recipe names', () => {
    expect(allergenHits(PEANUT_STEW, ['peanuts']).map((h) => h.id)).toEqual(['peanuts']);
    expect(allergenHits(FISH_PIE, ['fish', 'milk']).map((h) => h.id)).toEqual(['fish', 'milk']);
    expect(allergenHits(RICE_BOWL, ['peanuts', 'fish'])).toEqual([]);
  });

  it('removes the recipe rather than ranking it down', () => {
    const prefs = { allergies: ['peanuts'] };
    expect(isBlocked(PEANUT_STEW, prefs)).toBe(true);
    const pool = [PEANUT_STEW, RICE_BOWL, FISH_PIE];
    expect(allowedByPrefs(pool, prefs).map((r) => r.name)).toEqual(['Rice bowl', 'Fish pie']);
    // And it stays gone however the list is sorted.
    expect(rankByPrefs(pool, prefs).some((r) => r.id === PEANUT_STEW.id)).toBe(false);
  });

  it('matches the recipe name too, not only the ingredient list', () => {
    const named = { id: 'x', name: 'Satay noodles', ingredients: [{ name: 'noodles' }] };
    expect(isBlocked(named, { allergies: ['peanuts'] })).toBe(true);
  });

  it('offers everything when nothing is set', () => {
    const pool = [PEANUT_STEW, FISH_PIE, BACON_PASTA];
    expect(allowedByPrefs(pool, {})).toHaveLength(3);
    expect(blockedBy(PEANUT_STEW, {})).toEqual([]);
  });

  it('covers the fourteen the law makes declarable, each with a way to spot it', () => {
    expect(ALLERGENS).toHaveLength(14);
    for (const a of ALLERGENS) expect(a.match.test('')).toBe(false);
    expect(MATCH_CAVEAT).toMatch(/not a guarantee/);
  });
});

describe('religious rules are hard too', () => {
  it('blocks what the rule excludes, and leaves the rest', () => {
    expect(religiousHits(BACON_PASTA, ['halal']).map((h) => h.id)).toEqual(['halal']);
    expect(isBlocked(BACON_PASTA, { religious: ['halal'] })).toBe(true);
    expect(isBlocked(RICE_BOWL, { religious: ['halal'] })).toBe(false);
    expect(isBlocked(FISH_PIE, { religious: ['kosher'] })).toBe(false); // fin fish is fine
    expect(isBlocked(recipe('Prawn curry', ['prawns', 'rice']), { religious: ['kosher'] })).toBe(true);
  });

  it('joins allergens in one block list, so every surface agrees', () => {
    const prefs = { allergies: ['milk'], religious: ['halal'] };
    expect(blockedBy(BACON_PASTA, prefs).map((b) => b.id).sort()).toEqual(['halal', 'milk']);
  });

  it('has a rule for each observance it offers', () => {
    for (const r of RELIGIOUS_DIETS) expect(r.match).toBeInstanceOf(RegExp);
  });
});

describe('intolerances flag rather than remove', () => {
  it('keeps the recipe and names what is in it', () => {
    const prefs = { intolerances: ['lactose'] };
    expect(intoleranceHits(FISH_PIE, ['lactose']).map((h) => h.id)).toEqual(['lactose']);
    expect(isBlocked(FISH_PIE, prefs)).toBe(false);
    expect(allowedByPrefs([FISH_PIE], prefs)).toHaveLength(1);
  });

  it('ranks a flagged recipe below a clean one, but still shows it', () => {
    const ranked = rankByPrefs([FISH_PIE, RICE_BOWL], { intolerances: ['lactose'] });
    expect(ranked.map((r) => r.name)).toEqual(['Rice bowl', 'Fish pie']);
  });
});

describe('taste and circumstance reorder, never remove', () => {
  it('puts your cuisines first', () => {
    const ranked = rankByPrefs([FISH_PIE, RICE_BOWL], { cuisines: ['Japanese'] });
    expect(ranked[0].name).toBe('Rice bowl');
  });

  it('reads a recipe against the time and skill you said you had', () => {
    const long = recipe('Slow ragu', ['beef', 'tomato'], { time: 180, steps: Array(20).fill('x') });
    const fit = recipeFit(long, { timeBudget: 'quick', skill: 'beginner' });
    expect(fit.tooLong).toBe(true);
    expect(fit.tooFiddly).toBe(true);
    expect(fit.blocked).toEqual([]); // still allowed — you asked, you didn't forbid
    expect(recipeFit(long, { timeBudget: 'unhurried', skill: 'keen' }).tooLong).toBe(false);
  });

  it('marks a favourite cuisine without doing anything else about it', () => {
    expect(recipeFit(RICE_BOWL, { cuisines: ['Japanese'] }).favouriteCuisine).toBe(true);
    expect(recipeFit(RICE_BOWL, { cuisines: ['Greek'] }).favouriteCuisine).toBe(false);
  });
});

describe('how much of the book your rules leave', () => {
  it('counts what is left, and what went', () => {
    const pool = [PEANUT_STEW, FISH_PIE, BACON_PASTA, RICE_BOWL];
    expect(reach(pool, {})).toEqual({ total: 4, left: 4, removed: 0, pct: 100 });
    const cut = reach(pool, { allergies: ['peanuts', 'milk'] });
    expect(cut.left).toBe(1);
    expect(cut.removed).toBe(3);
    expect(cut.pct).toBe(25);
    expect(reach([], {}).pct).toBe(0);
  });

  it('says plainly when nothing is set', () => {
    expect(prefsSummary({})).toMatch(/Nothing set/);
    expect(prefsSummary({ allergies: ['peanuts'] })).toBe('1 allergen');
    expect(prefsSummary({ allergies: ['peanuts', 'milk'], religious: ['halal'], cuisines: ['Thai'] }))
      .toBe('2 allergens · Halal · 1 favourite cuisine');
  });
});

describe('units change the display and nothing else', () => {
  it('converts weight the ways British scales read', () => {
    expect(kgToLb(80)).toBe(176.4);
    // A round trip through one-decimal pounds can't come back exact, and the
    // conversion doesn't pretend it does.
    expect(lbToKg(176.4)).toBe(80.01);
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80, 1);
    expect(kgToStone(82)).toEqual({ stone: 12, pounds: 12.8 });
    expect(formatWeight(82, 'kg')).toBe('82 kg');
    expect(formatWeight(82, 'lb')).toBe('180.8 lb');
    expect(formatWeight(82, 'st')).toBe('12 st 12.8 lb');
    expect(formatWeight(null, 'kg')).toBe(null);
  });

  it('converts height, energy and volume', () => {
    expect(cmToFtIn(180)).toEqual({ feet: 5, inches: 11 });
    expect(formatHeight(180, 'ftin')).toBe('5′ 11″');
    expect(formatHeight(180, 'cm')).toBe('180 cm');
    expect(kcalToKj(2000)).toBe(8368);
    expect(formatEnergy(2000, 'kJ')).toBe('8,368 kJ');
    expect(formatEnergy(2000, 'kcal')).toBe('2,000 kcal');
    expect(energyValue(2000, 'kcal')).toBe(2000);
    expect(mlToFloz(250)).toBe(8.8);
    expect(formatVolume(250, 'floz')).toBe('8.8 fl oz');
  });

  it('reads a clock either way, and leaves nonsense alone', () => {
    expect(formatTime('13:05', '12h')).toBe('1:05 pm');
    expect(formatTime('00:30', '12h')).toBe('12:30 am');
    expect(formatTime('12:00', '12h')).toBe('12:00 pm');
    expect(formatTime('13:05', '24h')).toBe('13:05');
    expect(formatTime('9:05', '24h')).toBe('09:05');
    expect(formatTime('', '12h')).toBe('');
  });

  it('binds one set of formatters to your choices, defaulting to metric', () => {
    const metric = formatters({});
    expect(metric.weight(82)).toBe('82 kg');
    expect(metric.energy(2000)).toBe('2,000 kcal');
    const imperial = formatters({ units: { weight: 'lb', energy: 'kJ', clock: '12h' } });
    expect(imperial.weight(82)).toBe('180.8 lb');
    expect(imperial.energy(2000)).toBe('8,368 kJ');
    expect(imperial.time('18:30')).toBe('6:30 pm');
    // Anything you didn't change stays metric rather than flipping wholesale.
    expect(imperial.height(180)).toBe('180 cm');
  });
});
