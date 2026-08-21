import { describe, expect, it } from 'vitest';
import {
  changedStateFields, mergePermittedState, scopeHouseholdState,
} from '../src/server/household-scope.js';
import { coachSnapshot } from '../src/server/coach-shares.js';
import { busyFromIcs, busyMealDates, parseIcsEvents } from '../src/lib/calendar.js';
import { buildPlan } from '../src/lib/planner.js';
import { compareSizes, unitPrice } from '../src/lib/shopping.js';

const recipes = [
  {
    id: 'leftover', name: 'Leftover curry', meal: 'dinner', protein: 25, kcal: 450,
    costPerServing: 1.2, time: 20, servings: 4, tags: ['batch'], cuisine: 'Indian',
    ingredients: [{ name: 'Spinach' }],
  },
  {
    id: 'fresh', name: 'Fresh pasta', meal: 'dinner', protein: 22, kcal: 480,
    costPerServing: 2.5, time: 25, servings: 2, tags: [], cuisine: 'Italian',
    ingredients: [{ name: 'Tomato' }],
  },
];

describe('household permission boundaries', () => {
  const state = {
    name: 'Sam',
    shoppingList: [{ id: 'i1', name: 'Milk' }],
    pantry: [{ id: 'p1', name: 'Rice' }],
    log: { '2026-07-30': [{ id: 'e1' }] },
    glucose: [{ value: 5.4 }],
  };

  it('redacts health and shopping independently', () => {
    expect(scopeHouseholdState(state, ['pantry'])).toMatchObject({
      shoppingList: [],
      pantry: state.pantry,
      log: {},
      glucose: [],
    });
  });

  it('preserves fields a restricted member cannot write', () => {
    const incoming = { ...state, shoppingList: [], pantry: [], glucose: [] };
    expect(mergePermittedState(state, incoming, ['pantry'])).toMatchObject({
      shoppingList: state.shoppingList,
      pantry: [],
      glucose: state.glucose,
    });
    expect(changedStateFields(state, mergePermittedState(state, incoming, ['pantry']))).toEqual(['pantry']);
  });

  it('preserves server health while the local encrypted vault is locked', () => {
    const incoming = { ...state, pantry: [], log: {}, glucose: [] };
    expect(mergePermittedState(state, incoming, ['admin', 'health', 'pantry'], ['health'])).toMatchObject({
      pantry: [],
      log: state.log,
      glucose: state.glucose,
    });
  });
});

describe('coach scoping', () => {
  it('does not leak health without the explicit health scope', () => {
    const state = { log: { today: [] }, plan: { today: {} }, glucose: [{ value: 5.4 }], body: { weightKg: 70 } };
    const shared = coachSnapshot(state, ['diary', 'plan']);
    expect(shared.diary.log).toEqual(state.log);
    expect(shared.plan.plan).toEqual(state.plan);
    expect(shared.health).toBeUndefined();
    expect(JSON.stringify(shared)).not.toContain('weightKg');
  });
});

describe('calendar-aware planning', () => {
  it('marks all-day and dinner-overlap events but ignores morning meetings', () => {
    expect(busyMealDates([
      { start: '2026-08-03', end: '2026-08-04', allDay: true },
      { start: '2026-08-04T09:00:00Z', end: '2026-08-04T10:00:00Z', allDay: false },
      { start: '2026-08-05T18:00:00Z', end: '2026-08-05T20:00:00Z', allDay: false },
    ])).toEqual(['2026-08-03', '2026-08-05']);
  });

  it('parses Chrono-style ICS into dinner-busy dates', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Le Studio//Chrono//EN',
      'BEGIN:VEVENT',
      'UID:1@chrono',
      'DTSTART:20260805T180000',
      'DTEND:20260805T193000',
      'SUMMARY:Team call',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2@chrono',
      'DTSTART:20260806T090000',
      'DTEND:20260806T100000',
      'SUMMARY:Morning standup',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseIcsEvents(ics);
    expect(events).toHaveLength(2);
    const busy = busyFromIcs(ics, { source: 'Chrono ICS', now: 1 });
    expect(busy.map((b) => b.date)).toEqual(['2026-08-05']);
    expect(busy[0].source).toBe('Chrono ICS');
  });
});

describe('leftover-first seasonal budget planning', () => {
  it('uses available leftover portions before selecting new dishes', () => {
    const result = buildPlan({
      scope: 'A week',
      recipes,
      budget: 3,
      leftovers: [{ recipeId: 'leftover', portions: 2 }],
      days: 3,
      month: 7,
    }, 12);
    expect(result.meals.slice(0, 2).map((recipe) => recipe.id)).toEqual(['leftover', 'leftover']);
    expect(result.note).toMatch(/Leftover-first/);
  });
});

describe('unit prices', () => {
  it('normalises packs to a shelf-comparable price', () => {
    expect(unitPrice({ price: 3, qty: '2 x 500g' })).toMatchObject({ value: 0.3, unit: '100g' });
    // "1 litre" and "1l" are the same shelf. They used to disagree: the spelled
    // out unit fell through the regex and priced at nothing at all.
    expect(unitPrice({ price: 1.5, qty: '1 litre' })).toMatchObject({ value: 0.15, unit: '100ml' });
    expect(unitPrice({ price: 1.5, qty: '1l' })).toMatchObject({ value: 0.15, unit: '100ml' });
  });

  it('says when a per-unit price leans on a package average', () => {
    // A stated weight is a measurement…
    expect(unitPrice({ name: 'Chopped tomatoes', price: 1, qty: '400 g' }).confidence).toBe('exact');
    // …and so is a tin of something we know the tin size of.
    expect(unitPrice({ name: 'Chopped tomatoes', price: 1, qty: '1 tin' }).confidence).toBe('exact');
    // A generic jar is an average, and must not pose as a measurement.
    expect(unitPrice({ name: 'Pickled walnuts', price: 3, qty: '1 jar' }).confidence).toBe('approximate');
  });

  it('ranks sizes of one product and refuses to rank incomparable ones', () => {
    const ranked = compareSizes([
      { name: 'Pasta', price: 1.2, qty: '500 g' },
      { name: 'Pasta', price: 2, qty: '1 kg' },
    ]);
    expect(ranked.best.qty).toBe('1 kg');
    expect(ranked.margin).toBeGreaterThan(0);

    const mixed = compareSizes([
      { name: 'Eggs', price: 2, qty: '6' },
      { name: 'Eggs', price: 3, qty: '500 g' },
    ]);
    expect(mixed.mixedScales).toBe(true);
    expect(mixed.best).toBeNull();
  });
});
