import { describe, expect, it } from 'vitest';
import { kitchenCardCandidates, planSeedMerge } from '../src/domain/card-gen';
import type { Card } from '../src/domain/types';

/**
 * The deck a food app earns: cards generated from the user's own kitchen
 * activity. Every template must fire only when its data exists, read the
 * right window (this week, not forever), and never invent a name it cannot
 * resolve.
 */
const NOW = new Date('2026-07-28T10:00:00Z');

const activity = {
  shops: [
    // The old June trip carries Milk too — if the window leaked, it would
    // count 3 trips instead of 2.
    { id: 's-old', date: '2026-06-01', store: 'Old shop', total: 99, items: [{ name: 'Milk' }] },
    { id: 's2', date: '2026-07-24', store: 'Sainsbury', total: 8.2, items: [{ name: 'Milk' }, { name: 'Bread' }] },
    { id: 's1', date: '2026-07-27', store: 'Co-op', total: 12.4, items: [{ name: 'Milk' }, { name: 'Eggs' }] },
  ],
  log: { '2026-07-26': [{ name: 'Yogurt' }], '2026-07-27': [{ name: 'Banana' }] },
  pantry: [
    { id: 'p2', name: 'Rice', expiry: '2027-01-01' },
    { id: 'p1', name: 'Salmon', expiry: '2026-07-30' },
    { id: 'p3', name: 'Oats' }, // no expiry — never a candidate
  ],
  cooked: [{ recipeId: 'r1', date: '2026-07-26' }],
  myRecipes: [{ id: 'r1', name: 'Pasta with tomato sauce' }],
  // The Tuesday skip is this week's; the July-10 one is outside the window.
  mealPlanEvents: [
    { date: '2026-07-21', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' },
    { date: '2026-07-10', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'plans-changed' },
  ],
};

describe('kitchenCardCandidates', () => {
  it('turns real activity into one card per template, most personal first', () => {
    const cards = kitchenCardCandidates(activity, NOW);
    expect(cards.map((c) => c.seedKey)).toEqual([
      'shop-most', 'shop-total', 'pantry-expiring', 'log-recent', 'cooked-last', 'missed-meal',
    ]);
    const missed = cards.find((c) => c.seedKey === 'missed-meal');
    expect(missed.front).toBe('Which planned meal did you skip this week?');
    expect(missed.back).toBe('Pasta with tomato sauce — 2026-07-21'); // in-window skip
    expect(missed.topicId).toBe('cooking');
    expect(missed.skippedReason).toBe('no-time'); // the reason rides on the card

    const [shopMost, shopTotal, expiring, logRecent, cookedLast] = cards;
    expect(shopMost.front).toBe('Which food did you buy most of this week?');
    expect(shopMost.back).toBe('Milk — on 2 trips'); // the June trip stayed out of the week
    expect(shopMost.topicId).toBe('shopping');
    expect(shopMost.origin).toBe('auto');

    expect(shopTotal.back).toBe('Co-op — £12.40'); // the most recent shop, not the biggest
    expect(shopTotal.topicId).toBe('budget');

    expect(expiring.back).toBe('Salmon — expires 2026-07-30'); // earliest expiry, Oats skipped
    expect(expiring.topicId).toBe('pantry');

    expect(logRecent.back).toBe('Banana'); // newest day first
    expect(logRecent.topicId).toBe('diary');

    expect(cookedLast.back).toBe('Pasta with tomato sauce'); // resolved through the user's book
    expect(cookedLast.topicId).toBe('cooking');
  });

  it('counts an item once per trip, not once per line', () => {
    const cards = kitchenCardCandidates({
      shops: [{ id: 's1', date: '2026-07-27', items: [{ name: 'Milk' }, { name: 'Milk' }, { name: 'Milk' }] }],
    }, NOW);
    const most = cards.find((c) => c.seedKey === 'shop-most');
    expect(most.back).toBe('Milk'); // a single trip needs no trip count
  });

  it('emits no shop-total card when a trip has no total', () => {
    const cards = kitchenCardCandidates({
      shops: [{ id: 's1', date: '2026-07-27', items: [{ name: 'Milk' }] }],
    }, NOW);
    expect(cards.some((c) => c.seedKey === 'shop-total')).toBe(false);
    expect(cards.find((c) => c.seedKey === 'shop-most').back).toBe('Milk');
  });

  it('skips the cooked card when the recipe cannot be named', () => {
    const cards = kitchenCardCandidates({
      cooked: [{ recipeId: 'ghost', date: '2026-07-26' }],
    }, NOW);
    expect(cards.some((c) => c.seedKey === 'cooked-last')).toBe(false);
  });

  it('resolves recipe names through the injected resolver as a fallback', () => {
    const cards = kitchenCardCandidates(
      { cooked: [{ recipeId: 'r2', date: '2026-07-26' }] },
      NOW,
      (id) => (id === 'r2' ? 'Lentil soup' : null),
    );
    expect(cards.find((c) => c.seedKey === 'cooked-last').back).toBe('Lentil soup');
  });

  it('yields nothing for an empty kitchen — nothing is invented', () => {
    expect(kitchenCardCandidates({}, NOW)).toEqual([]);
  });

  it('missed-meal skips takeaways, unnamed plans, and out-of-week skips', () => {
    const cards = kitchenCardCandidates(
      {
        mealPlanEvents: [
          { date: '2026-07-27', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'takeaway', isTakeaway: true },
          { date: '2026-07-26', slot: 'dinner', plannedRecipeId: 'r2', status: 'skipped', reason: 'other' }, // unnamed
          { date: '2026-06-30', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' }, // old
          { date: '2026-07-25', slot: 'dinner', plannedRecipeId: 'r1', status: 'cooked' }, // not a skip
        ],
      },
      NOW,
      (id) => (id === 'r1' ? 'Lentil soup' : null),
    );
    expect(cards.some((c) => c.seedKey === 'missed-meal')).toBe(false);
  });

  it('picks the most recent in-week skip when several exist', () => {
    const cards = kitchenCardCandidates(
      {
        mealPlanEvents: [
          { date: '2026-07-23', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' },
          { date: '2026-07-26', slot: 'lunch', plannedRecipeId: 'r1', status: 'skipped', reason: 'not-in-the-mood' },
        ],
      },
      NOW,
      (id) => (id === 'r1' ? 'Lentil soup' : null),
    );
    expect(cards.find((c) => c.seedKey === 'missed-meal').back).toBe('Lentil soup — 2026-07-26');
  });

  it('the planned-meals family fires: tonight, the swap, and leftovers covered', () => {
    const cards = kitchenCardCandidates({
      myRecipes: [
        { id: 'r1', name: 'Pasta with tomato sauce' },
        { id: 'r2', name: 'Lentil soup' },
      ],
      plan: { '2026-07-28': { dinner: 'r1' } },
      mealPlanEvents: [
        // The Tuesday slot said Pasta, the kitchen cooked soup instead.
        { date: '2026-07-27', slot: 'dinner', plannedRecipeId: 'r1', actualRecipeId: 'r2', status: 'substituted' },
        // The Monday slot was skipped because leftovers were available.
        { date: '2026-07-26', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'leftovers-available' },
      ],
    }, NOW);
    const byKey = Object.fromEntries(cards.map((c) => [c.seedKey, c]));
    expect(byKey['plan-tonight']).toMatchObject({
      front: "What's planned for dinner tonight?",
      back: 'Pasta with tomato sauce',
      topicId: 'cooking', origin: 'auto',
    });
    expect(byKey['plan-swapped'].front).toBe('Which planned meal did you swap this week?');
    expect(byKey['plan-swapped'].back).toBe('Pasta with tomato sauce → Lentil soup');
    expect(byKey['leftovers-covered'].front).toBe('Which planned meal did leftovers cover this week?');
    expect(byKey['leftovers-covered'].back).toBe('Pasta with tomato sauce — 2026-07-26');
    // The leftovers-available skip is a deliberate win, not a miss — one
    // event must never become two cards.
    expect(byKey['missed-meal']).toBeUndefined();
  });

  it('plan-tonight fires only for a dinner the plan names today', () => {
    // Tomorrow's dinner is not tonight's — nothing to ask today.
    const tomorrowOnly = kitchenCardCandidates({
      myRecipes: [{ id: 'r1', name: 'Lentil soup' }],
      plan: { '2026-07-29': { dinner: 'r1' } },
    }, NOW);
    expect(tomorrowOnly.some((c) => c.seedKey === 'plan-tonight')).toBe(false);
    // An unnameable dinner asks nothing.
    const ghost = kitchenCardCandidates(
      { plan: { '2026-07-28': { dinner: 'ghost' } } },
      NOW,
      () => null,
    );
    expect(ghost.some((c) => c.seedKey === 'plan-tonight')).toBe(false);
    // A plan with only lunch leaves tonight's question unasked.
    const lunchOnly = kitchenCardCandidates({
      myRecipes: [{ id: 'r1', name: 'Lentil soup' }],
      plan: { '2026-07-28': { lunch: 'r1' } },
    }, NOW);
    expect(lunchOnly.some((c) => c.seedKey === 'plan-tonight')).toBe(false);
  });

  it('plan-swapped needs both sides named and stays inside the week', () => {
    const unnamedActual = kitchenCardCandidates(
      {
        mealPlanEvents: [
          { date: '2026-07-27', slot: 'dinner', plannedRecipeId: 'r1', actualRecipeId: 'ghost', status: 'substituted' },
        ],
      },
      NOW,
      (id) => (id === 'r1' ? 'Lentil soup' : null),
    );
    expect(unnamedActual.some((c) => c.seedKey === 'plan-swapped')).toBe(false);
    const oldSwap = kitchenCardCandidates(
      {
        myRecipes: [
          { id: 'r1', name: 'Pasta with tomato sauce' },
          { id: 'r2', name: 'Lentil soup' },
        ],
        mealPlanEvents: [
          { date: '2026-07-01', slot: 'dinner', plannedRecipeId: 'r1', actualRecipeId: 'r2', status: 'substituted' },
        ],
      },
      NOW,
    );
    expect(oldSwap.some((c) => c.seedKey === 'plan-swapped')).toBe(false);
  });

  it('leftovers-covered reads only leftovers-available skips; plain skips stay missed-meal', () => {
    const cards = kitchenCardCandidates(
      {
        mealPlanEvents: [
          // A no-time skip is a miss, not a leftovers win — and vice versa.
          { date: '2026-07-27', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' },
          { date: '2026-07-25', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'leftovers-available' },
        ],
      },
      NOW,
      (id) => (id === 'r1' ? 'Lentil soup' : null),
    );
    const byKey = Object.fromEntries(cards.map((c) => [c.seedKey, c]));
    expect(byKey['leftovers-covered'].back).toBe('Lentil soup — 2026-07-25');
    expect(byKey['missed-meal'].back).toBe('Lentil soup — 2026-07-27');
    // Out of the week, a leftovers skip is history, not a question.
    const oldCover = kitchenCardCandidates(
      {
        mealPlanEvents: [
          { date: '2026-07-01', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'leftovers-available' },
        ],
      },
      NOW,
      (id) => (id === 'r1' ? 'Lentil soup' : null),
    );
    expect(oldCover.some((c) => c.seedKey === 'leftovers-covered')).toBe(false);
  });
});

describe('planSeedMerge', () => {
  const mkDeckCard = (over: Partial<Card>): Card => ({
    id: 'x', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
    front: 'f', back: 'b', origin: 'auto', reps: 1, lapses: 0, ease: 2.5,
    intervalDays: 2, due: '2026-07-30', createdAt: '2026-07-20T00:00:00Z',
    lastReviewedAt: '2026-07-26T00:00:00Z', ...over,
  });

  it('adds new questions and refreshes stale auto answers in place', () => {
    const deck = [
      mkDeckCard({ id: 'old-most', front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips' }),
      mkDeckCard({ id: 'fresh-pantry', front: 'Which pantry item is next to expire?', back: 'Salmon — expires 2026-07-30' }),
    ];
    const candidates = kitchenCardCandidates(
      {
        // Bread is the new most-bought; the pantry answer is unchanged.
        shops: [{ id: 's1', date: '2026-07-27', items: [{ name: 'Bread' }] }],
        pantry: [{ id: 'p1', name: 'Salmon', expiry: '2026-07-30' }],
      },
      NOW,
    );
    const plan = planSeedMerge(candidates, deck);
    expect(plan.updates).toEqual([{ id: 'old-most', back: 'Bread' }]);
    expect(plan.additions).toEqual([]); // every fresh question already has a card
  });

  it('never rewrites a handmade card, even when its answer is stale', () => {
    const deck = [
      mkDeckCard({
        id: 'hand', origin: 'handmade',
        front: 'Which food did you buy most of this week?', back: 'My own note',
      }),
    ];
    const candidates = kitchenCardCandidates(
      { shops: [{ id: 's1', date: '2026-07-27', items: [{ name: 'Bread' }] }] },
      NOW,
    );
    const plan = planSeedMerge(candidates, deck);
    expect(plan.updates).toEqual([]);
    expect(plan.additions).toEqual([]); // the user owns their words
  });

  it('adds a template whose question the deck has never held', () => {
    const candidates = kitchenCardCandidates(
      { pantry: [{ id: 'p1', name: 'Salmon', expiry: '2026-07-30' }] },
      NOW,
    );
    const plan = planSeedMerge(candidates, []);
    expect(plan.additions).toHaveLength(1);
    expect(plan.updates).toEqual([]);
  });  it('refreshes the skip reason when the missed meal changes', () => {
    const deck = [
      mkDeckCard({
        id: 'm', origin: 'auto',
        front: 'Which planned meal did you skip this week?',
        back: 'Lentil soup — 2026-07-20',
        skippedReason: 'no-time',
      }),
    ];
    // A newer, differently-motivated skip supersedes the stored answer — the
    // reason must travel with the refresh, not linger as yesterday's excuse.
    const candidates = kitchenCardCandidates(
      {
        mealPlanEvents: [
          { date: '2026-07-26', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'changed-preference' },
        ],
      },
      NOW,
      (id) => (id === 'r1' ? 'Lentil soup' : null),
    );
    const plan = planSeedMerge(candidates, deck);
    expect(plan.updates).toEqual([{
      id: 'm', back: 'Lentil soup — 2026-07-26', skippedReason: 'changed-preference',
    }]);
    expect(plan.additions).toEqual([]);
  });

  it('a matching answer means no update, and each template fires once', () => {
    const deck = [
      mkDeckCard({ front: 'Which food did you buy most of this week?', back: 'Bread' }),
    ];
    const candidates = kitchenCardCandidates(
      { shops: [{ id: 's1', date: '2026-07-27', items: [{ name: 'Bread' }] }] },
      NOW,
    );
    const plan = planSeedMerge(candidates, deck);
    expect(plan.updates).toEqual([]);
    expect(plan.additions).toEqual([]);
  });
});
