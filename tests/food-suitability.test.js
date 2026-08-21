import { describe, it, expect } from 'vitest';
import {
  evaluateFoodSuitability,
  filterBySuitability,
  rankBySuitability,
  rankLeftovers,
  suitabilityContextFrom,
  suitabilityReach,
  suitabilitySummary,
} from '../src/lib/food-suitability.js';
import { addDays, dayStamp } from '../src/lib/kitchen.js';

const recipe = (name, ingredients, over = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  ingredients: ingredients.map((n) => ({ name: n, qty: '1' })),
  steps: ['a', 'b'],
  time: 30,
  cuisine: 'British',
  tags: [],
  ...over,
});

const PEANUT_STEW = recipe('Peanut stew', ['peanuts', 'sweet potato', 'onion']);
const FISH_PIE = recipe('Fish pie', ['cod', 'milk', 'potato'], { cuisine: 'British' });
const BACON_PASTA = recipe('Bacon pasta', ['bacon', 'pasta', 'cream'], { cuisine: 'Italian', tags: [] });
const RICE_BOWL = recipe('Rice bowl', ['rice', 'spring onion', 'sesame'], { cuisine: 'Japanese', tags: ['vegan', 'vegetarian'] });
const TOFU_STIR = recipe('Tofu stir fry', ['tofu', 'broccoli', 'soy sauce'], { cuisine: 'Chinese', tags: ['vegan', 'vegetarian'] });

const today = dayStamp();
const leftover = (name, daysFromToday, over = {}) => ({
  id: `lo-${name}`,
  name: `${name} (leftovers)`,
  cat: 'Leftovers',
  portions: 2,
  qty: '2 portions',
  expiry: addDays(today, daysFromToday),
  ...over,
});

describe('evaluateFoodSuitability — hard blockers', () => {
  it('blocks allergens', () => {
    const fit = evaluateFoodSuitability(PEANUT_STEW, { allergies: ['peanuts'] });
    expect(fit.allowed).toBe(false);
    expect(fit.blockers.some((b) => b.kind === 'allergy' && b.code.includes('peanuts'))).toBe(true);
    expect(fit.warnings).toEqual([]);
  });

  it('blocks religious rules', () => {
    const fit = evaluateFoodSuitability(BACON_PASTA, { religious: ['halal'] });
    expect(fit.allowed).toBe(false);
    expect(fit.blockers.some((b) => b.kind === 'religious')).toBe(true);
  });

  it('blocks diet patterns (vegan)', () => {
    const fit = evaluateFoodSuitability(FISH_PIE, { diets: ['vegan'] });
    expect(fit.allowed).toBe(false);
    expect(fit.blockers.some((b) => b.kind === 'diet')).toBe(true);
  });

  it('blocks household diets merged into context', () => {
    const ctx = suitabilityContextFrom({
      diets: [],
      members: [{ id: '1', diets: ['vegetarian'] }],
    });
    const fit = evaluateFoodSuitability(BACON_PASTA, ctx);
    expect(fit.allowed).toBe(false);
    expect(fit.blockers.some((b) => b.kind === 'household' || b.kind === 'diet')).toBe(true);
  });

  it('allows a clean recipe', () => {
    const fit = evaluateFoodSuitability(RICE_BOWL, {
      allergies: ['peanuts'],
      religious: ['halal'],
      diets: ['vegan'],
    });
    expect(fit.allowed).toBe(true);
    expect(fit.blockers).toEqual([]);
  });
});

describe('evaluateFoodSuitability — leftover expiry', () => {
  it('blocks leftovers past use-by', () => {
    const item = leftover('Curry', -2);
    const fit = evaluateFoodSuitability(item, { today });
    expect(fit.allowed).toBe(false);
    expect(fit.blockers.some((b) => b.kind === 'expiry' && b.code === 'expiry:expired')).toBe(true);
  });

  it('warns when use-by is today', () => {
    const item = leftover('Pasta', 0);
    const fit = evaluateFoodSuitability(item, { today });
    expect(fit.allowed).toBe(true);
    expect(fit.warnings.some((w) => w.code === 'expiry:today')).toBe(true);
  });

  it('warns when 1 day left', () => {
    const item = leftover('Soup', 1);
    const fit = evaluateFoodSuitability(item, { today });
    expect(fit.allowed).toBe(true);
    expect(fit.warnings.some((w) => w.code === 'expiry:1day')).toBe(true);
  });

  it('warns when within three days', () => {
    const item = leftover('Stew', 3);
    const fit = evaluateFoodSuitability(item, { today });
    expect(fit.allowed).toBe(true);
    expect(fit.warnings.some((w) => w.code === 'expiry:soon')).toBe(true);
  });

  it('does not warn when expiry is further out', () => {
    const item = leftover('Bake', 5);
    const fit = evaluateFoodSuitability(item, { today });
    expect(fit.allowed).toBe(true);
    expect(fit.warnings.filter((w) => w.kind === 'expiry')).toEqual([]);
  });

  it('marks medium confidence when leftover has no expiry', () => {
    const item = { id: 'x', name: 'Mystery leftovers', cat: 'Leftovers', portions: 1 };
    const fit = evaluateFoodSuitability(item, { today });
    expect(fit.missingData).toContain('expiry-missing');
    expect(fit.confidence).toBe('medium');
  });
});

describe('evaluateFoodSuitability — warnings and preferences', () => {
  it('flags intolerances without blocking', () => {
    const fit = evaluateFoodSuitability(FISH_PIE, { intolerances: ['lactose'] });
    expect(fit.allowed).toBe(true);
    expect(fit.warnings.some((w) => w.kind === 'intolerance')).toBe(true);
  });

  it('warns on time and skill stretch', () => {
    const long = recipe('Slow ragu', ['beef', 'tomato'], { time: 180, steps: Array(20).fill('x') });
    const fit = evaluateFoodSuitability(long, { timeBudget: 'quick', skill: 'beginner' });
    expect(fit.allowed).toBe(true);
    expect(fit.warnings.some((w) => w.code === 'time:over')).toBe(true);
    expect(fit.warnings.some((w) => w.code === 'skill:over')).toBe(true);
  });

  it('marks favourite cuisine as a preference', () => {
    const fit = evaluateFoodSuitability(RICE_BOWL, { cuisines: ['Japanese'] });
    expect(fit.preferences.some((p) => p.code.startsWith('cuisine:'))).toBe(true);
  });
});

describe('filter / rank / reach / leftovers', () => {
  const pool = [PEANUT_STEW, FISH_PIE, BACON_PASTA, RICE_BOWL, TOFU_STIR];

  it('filterBySuitability removes blockers only', () => {
    const left = filterBySuitability(pool, { allergies: ['peanuts'], diets: ['vegetarian'] });
    expect(left.map((r) => r.name).sort()).toEqual(['Rice bowl', 'Tofu stir fry'].sort());
  });

  it('rankBySuitability puts preferences first and warnings later', () => {
    const ranked = rankBySuitability([FISH_PIE, RICE_BOWL], {
      intolerances: ['lactose'],
      cuisines: ['Japanese'],
    });
    expect(ranked[0].name).toBe('Rice bowl');
  });

  it('suitabilityReach reports what is left', () => {
    const reach = suitabilityReach(pool, { allergies: ['peanuts', 'milk'] });
    expect(reach.removed).toBeGreaterThan(0);
    expect(reach.left + reach.removed).toBe(reach.total);
  });

  it('suitabilitySummary is human readable', () => {
    expect(suitabilitySummary({})).toMatch(/Nothing set/);
    expect(suitabilitySummary({ allergies: ['peanuts'] })).toMatch(/allergen/);
  });

  it('rankLeftovers drops expired and prioritises soonest use-by', () => {
    const items = [
      leftover('Old', -1),
      leftover('Soon', 1),
      leftover('Later', 4),
      leftover('Today', 0),
    ];
    const ranked = rankLeftovers(items, { today });
    expect(ranked.map((i) => i.name)).toEqual([
      'Today (leftovers)',
      'Soon (leftovers)',
      'Later (leftovers)',
    ]);
  });
});

describe('confidence and missingData', () => {
  it('marks low confidence when ingredients are empty', () => {
    const bare = { id: 'x', name: 'Mystery', ingredients: [], tags: [] };
    const fit = evaluateFoodSuitability(bare, { allergies: ['peanuts'] });
    expect(fit.confidence).toBe('low');
    expect(fit.missingData).toContain('ingredients-empty');
  });

  it('marks medium when no preferences are set', () => {
    const fit = evaluateFoodSuitability(RICE_BOWL, {});
    expect(['medium', 'high']).toContain(fit.confidence);
    expect(fit.missingData).toContain('preferences-unset');
  });
});
