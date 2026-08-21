import { describe, it, expect } from 'vitest';
import {
  hydrate, levelFromXp, parseBackup, recentFoodsFrom, rolloverDay, serialiseBackup,
  STATE_VERSION, xpIntoLevel, XP_PER_LEVEL, EMPTY_STATE,
} from '../src/lib/store.jsx';
import { dayTotals } from '../src/lib/nutrition.js';

describe('levels', () => {
  it('derives level from xp consistently', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2);
    expect(levelFromXp(1240)).toBe(8);
  });
  it('xpIntoLevel + level are coherent', () => {
    for (const xp of [0, 40, 159, 160, 1240, 5000]) {
      expect(xpIntoLevel(xp)).toBe(xp % XP_PER_LEVEL);
      expect(xpIntoLevel(xp)).toBeLessThan(XP_PER_LEVEL);
    }
  });
});

describe('a brand new app', () => {
  it('starts with nothing pre-filled', () => {
    expect(EMPTY_STATE.onboarded).toBe(false);
    expect(EMPTY_STATE.name).toBe('');
    // XP isn't stored at all any more — it is counted from what you've done.
    expect(EMPTY_STATE.xp).toBeUndefined();
    expect(EMPTY_STATE.weeklyBudget).toBe(0);
    expect(EMPTY_STATE.monthlyBudget).toBe(0);
    expect(EMPTY_STATE.priceAlerts).toEqual([]);
    expect(EMPTY_STATE.recipeRatings).toEqual({});
    expect(EMPTY_STATE.water).toBe(0);
    for (const key of ['pantry', 'shoppingList', 'favouriteShopping', 'shops', 'cooked', 'mealPlanEvents',
      'cookingTimeHistory', 'favourites', 'favouriteFoods', 'customFoods', 'mealTemplates', 'recipeCollections']) {
      expect(EMPTY_STATE[key], key).toEqual([]);
    }
    for (const key of ['log', 'plan']) {
      expect(EMPTY_STATE[key], key).toEqual({});
    }
  });

  it('has no calories, spend or streak to show', () => {
    expect(dayTotals(EMPTY_STATE.log[EMPTY_STATE.day] || []).kcal).toBe(0);
    expect(recentFoodsFrom(EMPTY_STATE.log)).toEqual([]);
  });

  it('still ships reference targets, which are editable defaults not user data', () => {
    expect(EMPTY_STATE.targets.kcal).toBeGreaterThan(0);
    expect(EMPTY_STATE.targets.iron).toBeGreaterThan(0);
  });
});

describe('durable backups', () => {
  it('round-trips a versioned backup without losing user data', () => {
    const state = { ...EMPTY_STATE, onboarded: true, name: 'Ada', pantry: [{ id: 'p1', name: 'Milk' }] };
    const restored = parseBackup(serialiseBackup(state));

    expect(restored.schemaVersion).toBe(STATE_VERSION);
    expect(restored.name).toBe('Ada');
    expect(restored.pantry).toEqual([{ id: 'p1', name: 'Milk' }]);
  });

  it('migrates old plain-state exports and repairs known collection types', () => {
    const restored = parseBackup(JSON.stringify({
      onboarded: true,
      name: 'Sam',
      pantry: 'not-an-array',
      log: [],
      body: null,
    }));

    expect(restored.pantry).toEqual([]);
    expect(restored.log).toEqual({});
    expect(restored.body.activity).toBe('light');
    expect(restored.schemaVersion).toBe(STATE_VERSION);
  });

  it('rejects partial or unrelated JSON instead of treating it as an empty app', () => {
    expect(() => parseBackup('{}')).toThrow(/complete Forq backup/);
    expect(() => parseBackup('[]')).toThrow(/complete Forq backup/);
  });

  it('hydrates non-object input safely for internal migrations', () => {
    expect(hydrate(null).pantry).toEqual([]);
  });
});

describe('rolloverDay', () => {
  const base = {
    day: '2026-07-21',
    water: 6,
    waterExtraMl: 500,
    xp: 240,
    log: { '2026-07-21': [{ id: 'a', meal: 'lunch' }] },
    pantry: [{ id: 'p1', name: 'Milk' }],
    shops: [{ id: 'h1', total: 22 }],
  };

  it('resets only what belongs to a single day', () => {
    const next = rolloverDay(base, '2026-07-22');
    expect(next.day).toBe('2026-07-22');
    expect(next.water).toBe(0);
    expect(next.waterExtraMl).toBe(0);
    expect(next.xp).toBe(240); // an unknown field is carried over untouched
  });

  it('keeps the diary, pantry and shop history', () => {
    const next = rolloverDay(base, '2026-07-22');
    expect(next.log['2026-07-21']).toHaveLength(1);
    expect(next.log['2026-07-22']).toBeUndefined();
    expect(next.pantry).toHaveLength(1);
    expect(next.shops).toHaveLength(1);
  });

  it('is a no-op on the same day', () => {
    expect(rolloverDay(base, '2026-07-21')).toBe(base);
  });
});

describe('recent foods', () => {
  it('reads newest-first from whatever has been logged', () => {
    const log = {
      '2026-07-20': [{ foodId: 'banana', name: 'Banana', per100: { kcal: 89 }, grams: 118 }],
      '2026-07-21': [
        { foodId: 'egg', name: 'Egg', per100: { kcal: 143 }, grams: 58 },
        { foodId: 'banana', name: 'Banana', per100: { kcal: 89 }, grams: 118 },
      ],
    };
    const ids = recentFoodsFrom(log).map((f) => f.id);
    expect(ids[0]).toBe('banana');
    expect(new Set(ids).size).toBe(ids.length);
  });
});
