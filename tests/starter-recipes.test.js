import { describe, it, expect } from 'vitest';
import {
  MAX_STARTER_PICKS, STARTER_OPTION_COUNT, ingredientConfidence, stapleShare,
  starterOptions, starterSuitable,
} from '../src/lib/starter-recipes.js';
import { recipeConflicts } from '../src/lib/goals.js';
import { isBlocked } from '../src/lib/preferences.js';
import { RECIPES } from '../src/data/recipes.js';

const names = (result) => result.options.map((option) => option.recipe.name);
const recipes = (result) => result.options.map((option) => option.recipe);

describe('what first-run setup offers', () => {
  it('offers at least six suitable dinners', () => {
    for (const diets of [[], ['vegan'], ['vegetarian'], ['pescatarian'], ['gluten-free', 'dairy-free']]) {
      const result = starterOptions({ diets });
      expect(result.options.length).toBe(STARTER_OPTION_COUNT);
      expect(STARTER_OPTION_COUNT).toBeGreaterThanOrEqual(6);
      expect(result.short).toBe(false);
    }
  });

  it('is no longer the same three dishes whatever you said', () => {
    const plain = names(starterOptions({}));
    const vegan = names(starterOptions({ diets: ['vegan'] }));
    expect(vegan).not.toEqual(plain);
    expect(vegan.some((name) => plain.includes(name))).toBe(true); // some overlap is fine
  });

  it('drops everything the pattern rules out, rather than showing it disabled', () => {
    for (const diets of [['vegan'], ['vegetarian'], ['pescatarian']]) {
      const result = starterOptions({ diets });
      for (const recipe of recipes(result)) {
        expect(recipeConflicts(recipe, diets)).toEqual([]);
      }
      expect(result.hidden.offPattern).toBeGreaterThan(0);
    }
  });

  it('never offers a recipe naming an allergen or breaking an observed rule', () => {
    const prefs = { allergies: ['peanuts', 'milk'], religious: ['halal'] };
    const result = starterOptions({ prefs });
    for (const recipe of recipes(result)) expect(isBlocked(recipe, prefs)).toBe(false);
    expect(result.hidden.unsafe).toBeGreaterThan(0);
  });

  it('applies the hard lines before the patterns', () => {
    // Vegan alone leaves plenty; vegan plus a soya allergy has to leave less,
    // because the allergen is removed from an already-filtered book.
    const vegan = starterOptions({ diets: ['vegan'] });
    const veganNoSoya = starterOptions({ diets: ['vegan'], prefs: { allergies: ['soya'] } });
    expect(veganNoSoya.hidden.suitable).toBeLessThan(vegan.hidden.suitable);
    for (const recipe of recipes(veganNoSoya)) {
      expect(isBlocked(recipe, { allergies: ['soya'] })).toBe(false);
      expect(recipeConflicts(recipe, ['vegan'])).toEqual([]);
    }
  });

  it('honours a household member’s pattern as well as your own', () => {
    const mine = starterOptions({ diets: ['pescatarian'] });
    const ours = starterOptions({ diets: ['pescatarian'], members: [{ name: 'Kit', diets: ['vegan'] }] });
    expect(ours.patterns).toContain('vegan');
    for (const recipe of recipes(ours)) expect(recipeConflicts(recipe, ['vegan'])).toEqual([]);
    expect(ours.hidden.suitable).toBeLessThan(mine.hidden.suitable);
  });

  it('treats a member’s religious rule as a hard line, not a preference', () => {
    const result = starterOptions({ members: [{ name: 'Ari', diets: ['kosher'] }] });
    for (const recipe of recipes(result)) {
      expect(isBlocked(recipe, { religious: ['kosher'] })).toBe(false);
    }
    expect(result.hidden.unsafe).toBeGreaterThan(0);
  });

  it('prefers recipes whose ingredients it actually has data for', () => {
    const offered = recipes(starterOptions({}));
    const average = offered.reduce((n, r) => n + ingredientConfidence(r), 0) / offered.length;
    const book = RECIPES.filter((r) => r.meal === 'dinner');
    const bookAverage = book.reduce((n, r) => n + ingredientConfidence(r), 0) / book.length;
    expect(average).toBeGreaterThan(bookAverage);
  });

  it('includes something cheap, something fast and something from the cupboard', () => {
    for (const diets of [[], ['vegan'], ['vegetarian'], ['pescatarian'], ['gluten-free']]) {
      const offered = recipes(starterOptions({ diets }));
      expect(offered.some((r) => r.costPerServing <= 1.5)).toBe(true);
      expect(offered.some((r) => r.time <= 25)).toBe(true);
      expect(offered.some((r) => stapleShare(r) >= 0.5)).toBe(true);
    }
  });

  it('does not offer three near-identical dinners', () => {
    for (const diets of [[], ['vegan'], ['pescatarian']]) {
      const offered = recipes(starterOptions({ diets }));
      const cuisines = offered.map((r) => r.cuisine);
      for (const cuisine of new Set(cuisines)) {
        expect(cuisines.filter((c) => c === cuisine).length).toBeLessThan(3);
      }
    }
  });

  it('says why each one is there', () => {
    for (const option of starterOptions({ diets: ['vegan'] }).options) {
      expect(option.reasons.length).toBeGreaterThan(0);
      expect(option.reasons[0]).toContain('vegan');
    }
    // Patterns that only reshape macros make no claim about the ingredients.
    const keto = starterOptions({ diets: ['keto'] });
    expect(keto.options.every((o) => o.reasons.every((r) => !r.includes('keto')))).toBe(true);
  });

  it('gives genuinely different choices when asked, without loosening the rules', () => {
    const first = starterOptions({ diets: ['vegan'] });
    const second = starterOptions({ diets: ['vegan'], round: 1 });
    expect(first.more).toBe(true);
    expect(names(second).some((name) => names(first).includes(name))).toBe(false);
    for (const recipe of recipes(second)) expect(recipeConflicts(recipe, ['vegan'])).toEqual([]);
    expect(second.options.length).toBe(STARTER_OPTION_COUNT);
  });

  it('starts the rounds again rather than running dry', () => {
    const round = starterOptions({ diets: ['vegan'], round: 40 });
    expect(round.options.length).toBe(STARTER_OPTION_COUNT);
  });

  it('is the same six for the same answers', () => {
    expect(names(starterOptions({ diets: ['vegetarian'] })))
      .toEqual(names(starterOptions({ diets: ['vegetarian'] })));
  });

  it('offers fewer than six rather than something unsuitable', () => {
    const book = RECIPES.filter((r) => r.meal === 'dinner').slice(0, 3);
    const result = starterOptions({ recipes: book });
    expect(result.options.length).toBe(3);
    expect(result.short).toBe(true);
    expect(result.more).toBe(false);
  });

  it('takes at most three picks into the first week', () => {
    expect(MAX_STARTER_PICKS).toBe(3);
  });
});

describe('ingredient-data confidence', () => {
  it('scores a recipe on what the app can recognise and scale', () => {
    const known = {
      ingredients: [{ name: 'Chicken breast', qty: '150 g' }, { name: 'White rice', qty: '75 g' }],
    };
    const vague = { ingredients: [{ name: 'A handful of something', qty: 'some' }] };
    expect(ingredientConfidence(known)).toBeGreaterThan(0.8);
    expect(ingredientConfidence(vague)).toBe(0);
    expect(ingredientConfidence({ ingredients: [] })).toBe(0);
    expect(ingredientConfidence(null)).toBe(0);
  });
});

describe('a choice made earlier', () => {
  it('survives a new round but not a rule that now excludes it', () => {
    const traybake = RECIPES.find((r) => r.id === 'chicken-traybake');
    expect(starterSuitable(traybake, {})).toBe(true);
    expect(starterSuitable(traybake, { diets: ['vegan'] })).toBe(false);
    expect(starterSuitable(traybake, { members: [{ diets: ['vegetarian'] }] })).toBe(false);
    expect(starterSuitable(traybake, { prefs: { allergies: ['gluten'] } })).toBe(true);
    expect(starterSuitable(undefined, {})).toBe(false);
  });
});
