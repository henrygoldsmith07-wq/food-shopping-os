import { describe, it, expect } from 'vitest';
import {
  applyEntries, batchGroups, clearDates, copyMealTo, coveredByLeftovers, daysInMonth,
  leftoverEntry, leftoverPortions, mealPlanIcs, monthDates, monthGrid, monthLabel, moveMeal,
  planDishes, planEntries, planStats, shiftMonth, shiftWeek, shoppingForPlan, weekOffset,
} from '../src/lib/mealplan.js';
import { inMonth, monthOf, peakNow, seasonalHits, seasonScore } from '../src/data/seasons.js';
import { weekDates } from '../src/lib/kitchen.js';
import { byId } from '../src/data/recipes.js';

const CURRY = 'chickpea-curry';
const SALMON = 'salmon-teriyaki';
const TRAYBAKE = 'chicken-traybake';

const plan = {
  '2026-07-06': { breakfast: 'protein-pancakes', dinner: CURRY },
  '2026-07-08': { dinner: CURRY },
  '2026-07-10': { dinner: SALMON },
};
const week = weekDates('2026-07-06');

describe('the calendar', () => {
  it('knows how long a month is and names it', () => {
    expect(daysInMonth('2026-07-15')).toBe(31);
    expect(daysInMonth('2026-02-01')).toBe(28);
    expect(daysInMonth('2028-02-01')).toBe(29); // leap year
    expect(monthLabel('2026-07-15')).toBe('July 2026');
    expect(monthDates('2026-07-15')).toHaveLength(31);
    expect(monthDates('2026-07-15')[0]).toBe('2026-07-01');
  });

  it('lays a month out as whole Monday-first weeks', () => {
    const cells = monthGrid('2026-07-15');
    expect(cells.length % 7).toBe(0);
    // Every day of the month is in there, and only July is marked in-month.
    const inside = cells.filter((c) => c.inMonth).map((c) => c.date);
    expect(inside).toEqual(monthDates('2026-07-15'));
    expect(cells.filter((c) => !c.inMonth).every((c) => !c.date.startsWith('2026-07'))).toBe(true);
  });

  it('steps a week or a month at a time, and back', () => {
    expect(shiftWeek('2026-07-08', 1)).toBe('2026-07-13');
    expect(shiftWeek('2026-07-08', -1)).toBe('2026-06-29');
    expect(shiftMonth('2026-07-08', 1)).toBe('2026-08-01');
    expect(shiftMonth('2026-01-08', -1)).toBe('2025-12-01');
    expect(shiftMonth(shiftMonth('2026-07-08', 3), -3)).toBe('2026-07-01');
  });

  it('finds the week containing a focused date', () => {
    expect(weekOffset('2026-08-02', '2026-08-03')).toBe(1);
    expect(weekOffset('2026-08-03', '2026-08-02')).toBe(-1);
  });
});

describe('reading a plan', () => {
  it('lists what is planned, in calendar and meal order', () => {
    const entries = planEntries(plan, week);
    expect(entries.map((e) => `${e.date} ${e.slot}`)).toEqual([
      '2026-07-06 breakfast', '2026-07-06 dinner', '2026-07-08 dinner', '2026-07-10 dinner',
    ]);
    expect(entries[0].recipe.name).toBe('Banana Protein Pancakes');
  });

  it('groups the distinct dishes, most-used first', () => {
    const dishes = planDishes(plan, week);
    expect(dishes[0].recipe.id).toBe(CURRY);
    expect(dishes[0].slots).toHaveLength(2);
    expect(dishes).toHaveLength(3);
  });

  it('costs the range and averages calories over the days you planned', () => {
    const stats = planStats(plan, week, { people: 2 });
    const curry = byId(CURRY);
    expect(stats.meals).toBe(4);
    expect(stats.cost).toBeCloseTo(
      (byId('protein-pancakes').costPerServing + curry.costPerServing * 2 + byId(SALMON).costPerServing) * 2,
      2,
    );
    expect(stats.daysPlanned).toBe(3);
    expect(stats.emptyDays).toBe(4);
    expect(stats.kcalPerDay).toBe(Math.round(stats.kcal / 3));
    expect(planStats({}, week).meals).toBe(0);
  });

  it('exports the selected plan range as calendar events', () => {
    const { text, events } = mealPlanIcs(plan, week, { now: new Date('2026-07-01T09:00:00Z') });
    expect(events).toBe(4);
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('PRODID:-//Le Studio//Forq//EN');
    // Cook start = eat time minus prep (pancakes 15m → 07:45; curry 25m → 18:05)
    expect(text).toContain('DTSTART;TZID=Europe/London:20260706T074500');
    expect(text).toContain('DTEND;TZID=Europe/London:20260706T080000');
    expect(text).toContain('SUMMARY:Cook: Banana Protein Pancakes');
    expect(text).toContain('DTSTART;TZID=Europe/London:20260706T180500');
    expect(text).toContain('DTEND;TZID=Europe/London:20260706T183000');
    expect(text).toContain('SUMMARY:Cook: Coconut Chickpea Curry');
    expect(text).toContain('CATEGORIES:meal,forq,le-studio');
    expect(text).not.toContain('20260713');
  });

  it('escapes calendar punctuation and exports an empty calendar safely', () => {
    const custom = {
      '2026-07-06': { dinner: CURRY },
    };
    const { text } = mealPlanIcs(custom, week, { calendarName: 'Meals, week; one' });
    expect(text).toContain('X-WR-CALNAME:Meals\\, week\\; one');
    expect(mealPlanIcs({}, week).events).toBe(0);
  });
});

describe('moving a meal', () => {
  it('moves it to an empty slot', () => {
    const next = moveMeal(plan, { date: '2026-07-10', slot: 'dinner' }, { date: '2026-07-09', slot: 'lunch' });
    expect(next['2026-07-09'].lunch).toBe(SALMON);
    expect(next['2026-07-10']).toBeUndefined(); // the day empties out entirely
    expect(plan['2026-07-10'].dinner).toBe(SALMON); // the original is untouched
  });

  it('swaps when the target is taken, so nothing is lost', () => {
    const next = moveMeal(plan, { date: '2026-07-08', slot: 'dinner' }, { date: '2026-07-10', slot: 'dinner' });
    expect(next['2026-07-10'].dinner).toBe(CURRY);
    expect(next['2026-07-08'].dinner).toBe(SALMON);
  });

  it('does nothing when there is nothing to move, or the slot is its own target', () => {
    const empty = { date: '2026-07-07', slot: 'dinner' };
    expect(moveMeal(plan, empty, { date: '2026-07-09', slot: 'dinner' })).toBe(plan);
    expect(moveMeal(plan, { date: '2026-07-08', slot: 'dinner' }, { date: '2026-07-08', slot: 'dinner' })).toBe(plan);
    expect(moveMeal(plan, null, empty)).toBe(plan);
  });

  it('copies, applies a generated run and clears a range', () => {
    const copied = copyMealTo(plan, { date: '2026-07-08', slot: 'dinner' }, { date: '2026-07-09', slot: 'lunch' });
    expect(copied['2026-07-09'].lunch).toBe(CURRY);
    expect(copied['2026-07-08'].dinner).toBe(CURRY); // still there — a copy, not a move

    const applied = applyEntries({}, [
      { date: '2026-07-06', slot: 'dinner', recipeId: TRAYBAKE },
      { date: '2026-07-07', slot: 'dinner', recipeId: null }, // a gap in the run is skipped
    ]);
    expect(applied).toEqual({ '2026-07-06': { dinner: TRAYBAKE } });

    expect(clearDates(plan, week)).toEqual({});
    expect(Object.keys(clearDates(plan, ['2026-07-08']))).toEqual(['2026-07-06', '2026-07-10']);
  });
});

describe('leftovers', () => {
  const curry = byId(CURRY);
  const fridge = [
    { id: 'p1', ...leftoverEntry(curry, 2, '2026-07-06') },
    { id: 'p2', name: 'Milk', cat: 'Fresh' },
  ];

  it('dates a portion and keeps it out of the invented-data business', () => {
    const item = leftoverEntry(curry, 2, '2026-07-06');
    expect(item.recipeId).toBe(CURRY);
    expect(item.portions).toBe(2);
    expect(item.expiry).toBe('2026-07-09');
    expect(item.cost).toBe(0);
    expect(item.cat).toBe('Leftovers');
  });

  it('counts what is in the fridge by dish', () => {
    expect(leftoverPortions(fridge).get(CURRY)).toBe(2);
    expect(leftoverPortions(fridge).get(SALMON)).toBeUndefined();
    expect(leftoverPortions([]).size).toBe(0);
  });

  it('covers planned meals in calendar order until the portions run out', () => {
    const busy = { ...plan, '2026-07-09': { dinner: CURRY } }; // three curries, two portions
    const covered = coveredByLeftovers(busy, week, fridge);
    expect(covered.map((e) => e.date)).toEqual(['2026-07-06', '2026-07-08']);
  });

  it('keeps a covered dish off the shopping list', () => {
    const withLeftovers = shoppingForPlan(plan, week, { pantry: fridge });
    // Both curry slots are covered by the two portions, so nothing for it is bought.
    expect(withLeftovers.some((i) => i.fromRecipe === curry.name)).toBe(false);
    expect(withLeftovers.some((i) => i.fromRecipe === byId(SALMON).name)).toBe(true);

    const without = shoppingForPlan(plan, week, { pantry: [] });
    expect(without.some((i) => i.fromRecipe === curry.name)).toBe(true);
  });

  it('still shops for what the pantry does not hold', () => {
    const items = shoppingForPlan({ '2026-07-06': { dinner: SALMON } }, week, {
      pantry: [{ name: 'Sushi rice' }, { name: 'Soy sauce' }],
    });
    expect(items.some((i) => i.name === 'Sushi rice')).toBe(false);
    expect(items.some((i) => i.name === 'Salmon fillets')).toBe(true);
  });
});

describe('batch cooking', () => {
  it('spots a dish planned more than once and says when to cook it', () => {
    const groups = batchGroups(plan, week, { people: 2 });
    expect(groups).toHaveLength(1);
    const [curry] = groups;
    expect(curry.recipe.id).toBe(CURRY);
    expect(curry.cookOn).toBe('2026-07-06');
    expect(curry.covers.map((c) => c.date)).toEqual(['2026-07-08']);
    expect(curry.portions).toBe(4);
    expect(curry.batches).toBe(1); // the curry serves four
    expect(curry.saves).toBeGreaterThan(0);
  });

  it('asks for a second batch when the portions outgrow the recipe', () => {
    const feast = {
      '2026-07-06': { dinner: CURRY }, '2026-07-07': { dinner: CURRY }, '2026-07-08': { dinner: CURRY },
    };
    expect(batchGroups(feast, week, { people: 3 })[0].batches).toBe(3); // 9 portions of a 4-serving dish
  });

  it('has nothing to say about a week of different dishes', () => {
    expect(batchGroups({ '2026-07-06': { dinner: CURRY }, '2026-07-07': { dinner: SALMON } }, week)).toEqual([]);
  });
});

describe('the growing calendar', () => {
  it('reads a month off a date and wraps the winter crops', () => {
    expect(monthOf('2026-07-15')).toBe(7);
    const leeks = { from: 9, to: 4 };
    expect(inMonth(leeks, 12)).toBe(true);
    expect(inMonth(leeks, 1)).toBe(true);
    expect(inMonth(leeks, 6)).toBe(false);
    expect(inMonth({ from: 4, to: 6 }, 5)).toBe(true);
    expect(inMonth({ from: 4, to: 6 }, 7)).toBe(false);
  });

  it('scores a dish on what is actually in it', () => {
    const curry = byId(CURRY);
    // Tomatoes and spinach are summer crops; in December only its onion is.
    expect(seasonalHits(curry, 6)).toEqual(expect.arrayContaining(['Tomatoes', 'Spinach']));
    expect(seasonalHits(curry, 12)).toEqual(['Onions']);
    expect(seasonScore(curry, 6)).toBeGreaterThan(seasonScore(curry, 12));
    expect(seasonScore({ ingredients: [] }, 6)).toBe(0);
  });

  it('has something to recommend in every month', () => {
    for (let m = 1; m <= 12; m += 1) expect(peakNow(m).length, `month ${m}`).toBeGreaterThan(2);
  });
});
