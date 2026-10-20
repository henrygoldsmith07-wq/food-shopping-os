import { describe, expect, it } from 'vitest';
import '../src/data/recipes-full.js';
import { allRecipes, byId } from '../src/data/recipes.js';
import { starterOptions } from '../src/lib/starter-recipes.js';
import { dinnerCombo } from '../src/data/recipe-combos.js';
import { MASTER_RECIPE_EXPANSION } from '../src/data/master-recipe-expansion.js';
import { PROTEINS, BASES, VEG, SAUCES } from '../src/data/recipe-parts.js';

/**
 * What the library may offer. These pin the clean-up of the generated and
 * estimated shelves: no fabricated ingredient lists, no one-size method, no
 * title-cased sauce glued to the front of a name, no placeholder times.
 */
const library = allRecipes();

describe('recipe library quality', () => {
  it('offers no estimator-filled recipes', () => {
    expect(library.filter((r) => r.estimateConfidence)).toEqual([]);
  });

  it('gives every recipe a method of its own, not the generic three lines', () => {
    const generic = library.filter((r) => /Prepare the .* ingredients\./.test(r.steps?.[0]?.text || ''));
    expect(generic.map((r) => r.name)).toEqual([]);
  });

  it('names generated dishes the way a person would', () => {
    const glued = library.filter((r) => /^[A-Z][\w&' -]+ (Sauce|Glaze|Butter|Yogurt|Dressing|Marinade|Base) [A-Z]/.test(r.name));
    expect(glued.map((r) => r.name)).toEqual([]);
  });

  it('has no single time shared by an implausible share of the library', () => {
    const counts = {};
    for (const r of library) counts[r.time] = (counts[r.time] || 0) + 1;
    expect(Math.max(...Object.values(counts)) / library.length).toBeLessThan(0.25);
  });

  it('keeps withdrawn recipes resolvable for meals already planned', () => {
    // Withdrawn shelf rows still answer byId, so an old plan slot never breaks.
    const shell = MASTER_RECIPE_EXPANSION.find((r) => r.estimateConfidence === 'estimate');
    expect(shell).toBeTruthy();
    expect(library.some((r) => r.id === shell.id)).toBe(false);
    expect(byId(shell.id)?.id).toBe(shell.id);
  });
});

describe('combinations', () => {
  it('refuses pairings nobody cooks', () => {
    expect(dinnerCombo({ protein: PROTEINS.beans || Object.values(PROTEINS)[13], base: BASES.polenta || Object.values(BASES).find((b) => b.name === 'Polenta'), veg: Object.values(VEG)[0], sauce: Object.values(SAUCES).find((s) => s.name === 'Tikka masala sauce') })).toBeNull();
    expect(dinnerCombo({ protein: Object.values(PROTEINS).find((p) => p.name === 'Cod fillet'), base: Object.values(BASES).find((b) => b.name === 'Potatoes'), veg: null, sauce: Object.values(SAUCES).find((s) => s.name === 'Red wine gravy') })).toBeNull();
  });

  it('names and times a pairing that works', () => {
    const combo = dinnerCombo({
      protein: Object.values(PROTEINS).find((p) => p.name === 'Chicken breast'),
      base: Object.values(BASES).find((b) => b.name === 'White rice'),
      veg: Object.values(VEG).find((v) => v.name === 'Broccoli'),
      sauce: Object.values(SAUCES).find((s) => s.name === 'Teriyaki glaze'),
    });
    expect(combo.name).toBe('Chicken breast in teriyaki glaze with white rice');
    expect(combo.cuisine).toBe('Japanese');
    expect(combo.time % 5).toBe(0);
    expect(combo.steps.length).toBeGreaterThanOrEqual(4);
  });
});

describe('onboarding', () => {
  it('opens on hand-written dishes', () => {
    const { options = [] } = starterOptions({ diets: [], members: [], prefs: {} }) || {};
    const picks = (options.length ? options : starterOptions({ diets: [], members: [], prefs: {} })).map((o) => o.recipe || o);
    const handWritten = picks.filter((r) => !String(r.id).startsWith('generated'));
    expect(handWritten.length).toBeGreaterThanOrEqual(3);
  });
});
