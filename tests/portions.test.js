import { describe, it, expect } from 'vitest';
import {
  householdPortionsFor, recipePortionFactors, scaleListToPortions, portionsFromCooked,
} from '../src/lib/portions.js';

describe('the household portions decision', () => {
  it('stays configured until the appetite evidence is strong', () => {
    expect(householdPortionsFor({ portions: 2 })).toMatchObject({ portions: 2, source: 'configured', configured: 2, override: 'auto', autoPortions: 2, autoLearned: false });
    // Two observations is a coincidence, not an appetite.
    expect(householdPortionsFor({ portions: 2, cooked: [{ portions: 3 }, { portions: 3 }] }).source).toBe('configured');
    // A gap under half a portion is noise.
    expect(householdPortionsFor({ portions: 2, cooked: [{ portions: 2 }, { portions: 2 }, { portions: 2.25 }] }).source).toBe('configured');
  });

  it('learns from raw cooked events when no derived profile exists', () => {
    const app = { portions: 2, cooked: [{ portions: 3 }, { portions: 3 }, { portionsEaten: 4 }] };
    // Mean 3.33 → rounded to the half portion: 3.5.
    expect(householdPortionsFor(app)).toMatchObject({ portions: 3.5, source: 'learned', configured: 2, autoLearned: true });
    expect(householdPortionsFor(app).evidence).toEqual({ observations: 3, typical: 10 / 3 });
  });

  it('prefers the derived profile over raw events, and never breaks on junk', () => {
    const app = {
      portions: 2,
      cooked: [{ portions: 4 }, { portions: 4 }, { portions: 4 }],
      householdPreferences: { portions: { typical: 1, observations: 5 } },
    };
    expect(householdPortionsFor(app)).toMatchObject({ portions: 1, source: 'learned', configured: 2 });
    expect(householdPortionsFor({ portions: 2, cooked: 'junk' }).source).toBe('configured');
    expect(householdPortionsFor({}).portions).toBe(1);
    expect(portionsFromCooked([{ portions: 0 }, { portions: -1 }, null]).length).toBe(0);
  });

  it('an explicit override beats the learned appetite and reports what automatic would do', () => {
    const app = {
      portions: 2,
      householdPreferences: { portions: { typical: 3, observations: 4 } },
      portionsOverride: 5,
    };
    const decided = householdPortionsFor(app);
    expect(decided).toMatchObject({ portions: 5, source: 'configured', override: 5, autoPortions: 3, autoLearned: true });
    // The household can always hand control back.
    expect(householdPortionsFor({ ...app, portionsOverride: 'auto' })).toMatchObject({ portions: 3, source: 'learned', override: 'auto' });
  });
});

describe('scaling a plan list to those portions', () => {
  it('scales plan rows by the recipe factor and leaves non-plan rows alone', () => {
    const factors = recipePortionFactors(
      [{ recipe: { name: 'Traybake', servings: 4 } }, { recipe: { name: 'Curry', servings: 2 } }],
      3,
    );
    expect(factors.get('Traybake')).toBe(0.75);
    expect(factors.get('Curry')).toBe(1.5);
    const items = [
      { name: 'Chicken thighs', qty: '8', fromRecipe: 'Traybake' },
      { name: 'Chickpeas', qty: '2 tins', fromRecipe: 'Curry' },
      { name: 'Bin bags', qty: '1' }, // manually requested — already the amount meant
      { name: 'Mystery', qty: '2', fromRecipe: 'Unplanned' }, // treated as written for one serving
    ];
    const scaled = scaleListToPortions(items, 3, factors);
    expect(scaled[0].qty).toBe('6');
    expect(scaled[1].qty).toBe('3 tins');
    expect(scaled[2].qty).toBe('1');
    expect(scaled[3].qty).toBe('6');
  });
});
