import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

/**
 * The SRS engine's store half: addCard seeds a fresh card, reviewDueCards
 * collects what the scheduler says is due, and reviewCard grades one review
 * and persists the returned card state — through the same write path as
 * everything else, so a graded card survives a reload from localStorage.
 */
const DAY = '2026-07-28';
const NOW = new Date('2026-07-28T10:00:00Z');

const seededCards = [
  {
    id: 'c-overdue', userId: 'local', subjectId: 'bio', topicId: 't1',
    front: 'Membrane structure?', back: 'Phospholipid bilayer.', origin: 'seed',
    reps: 3, lapses: 1, ease: 2.1, intervalDays: 8, due: '2026-07-27',
    createdAt: '2026-07-01T00:00:00Z', lastReviewedAt: '2026-07-20T00:00:00Z',
  },
  {
    id: 'c-today', userId: 'local', subjectId: 'bio', topicId: 't1',
    front: 'SA:V ratio?', back: 'Limits cell size.', origin: 'seed',
    reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: '2026-07-28',
    createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
  },
  {
    id: 'c-future', userId: 'local', subjectId: 'bio', topicId: 't1',
    front: 'Mitochondria?', back: 'Powerhouse of the cell.', origin: 'seed',
    reps: 2, lapses: 0, ease: 2.5, intervalDays: 6, due: '2026-07-30',
    createdAt: '2026-07-15T00:00:00Z', lastReviewedAt: '2026-07-24T00:00:00Z',
  },
];

const seeded = { onboarded: true, name: 'Sam', day: DAY, cards: seededCards };

function Probe({ render }) {
  const app = useApp();
  return <div data-testid="probe">{render(app)}</div>;
}

describe('the review queue through the store', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const renderStore = () => {
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.reviewCard('c-today', 'good', NOW)}>good today</button>
              <button onClick={() => app.reviewCard('c-overdue', 'again', NOW)}>miss overdue</button>
              <button onClick={() => app.reviewCard('ghost', 'good', NOW)}>review ghost</button>
              <button onClick={() => app.addCard({
                userId: 'local', subjectId: 'bio', topicId: 't1',
                front: 'Nucleus?', back: 'Contains DNA.', origin: 'seed',
              }, NOW)}>add card</button>
              <span data-testid="deck">{app.cards.length}</span>
            </div>
          );
        }} />
      </AppProvider>,
    );
    return () => snap;
  };

  it('collects only what is due on the day, soonest first', () => {
    let queue = null;
    render(
      <AppProvider>
        <Probe render={(app) => (
          <button onClick={() => { queue = app.reviewDueCards(NOW); }}>queue</button>
        )} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('queue'));
    expect(queue.map((c) => c.id)).toEqual(['c-overdue', 'c-today']);
  });

  it('grades a review and persists the returned card state', () => {
    const getSnap = renderStore();
    fireEvent.click(screen.getByText('good today'));
    const graded = getSnap().cards.find((c) => c.id === 'c-today');
    expect(graded).toMatchObject({
      reps: 1, lapses: 0, ease: 2.5, intervalDays: 1, due: '2026-07-29',
    });
    expect(graded.lastReviewedAt).toBe(NOW.toISOString());
    // The rest of the deck was not disturbed.
    expect(getSnap().cards.find((c) => c.id === 'c-overdue').reps).toBe(3);
    // The write went through the real persistence path: a reload sees it.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)).cards;
    expect(stored.find((c) => c.id === 'c-today')).toMatchObject({
      reps: 1, intervalDays: 1, due: '2026-07-29',
    });
  });

  it('a miss on a card already seen lapses it back to learning', () => {
    const getSnap = renderStore();
    fireEvent.click(screen.getByText('miss overdue'));
    expect(getSnap().cards.find((c) => c.id === 'c-overdue')).toMatchObject({
      reps: 4, lapses: 2, ease: 1.9, intervalDays: 0, due: DAY,
    });
  });

  it('an unknown card is a no-op, never a failure', () => {
    const getSnap = renderStore();
    fireEvent.click(screen.getByText('review ghost'));
    expect(getSnap().cards).toEqual(seededCards);
  });

  it('addCard seeds a fresh card that is immediately due', () => {
    const getSnap = renderStore();
    fireEvent.click(screen.getByText('add card'));
    const added = getSnap().cards.find((c) => c.front === 'Nucleus?');
    expect(added).toMatchObject({
      reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY, lastReviewedAt: null,
    });
    expect(added.id).toMatch(/^c/);
    expect(getSnap().reviewDueCards().some((c) => c.id === added.id)).toBe(true);
    expect(screen.getByTestId('deck').textContent).toBe('4');
  });

  it('seeds a deck from kitchen activity, idempotently', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [],
      shops: [{ id: 's1', date: DAY, store: 'Co-op', total: 12.4, items: [{ name: 'Milk' }] }],
      pantry: [{ id: 'p1', name: 'Salmon', expiry: '2026-07-30' }],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.seedCardsFromActivity(NOW)}>seed</button>
              <span data-testid="seedable">{app.kitchenSeedCount(NOW)}</span>
              <span data-testid="deck">{app.cards.length}</span>
            </div>
          );
        }} />
      </AppProvider>,
    );
    // Three candidates: shop-most, shop-total, pantry-expiring.
    expect(screen.getByTestId('seedable').textContent).toBe('3');
    fireEvent.click(screen.getByText('seed'));
    expect(screen.getByTestId('deck').textContent).toBe('3');
    expect(snap.cards.every((c) => c.origin === 'auto')).toBe(true);
    // Idempotent: seeding again adds nothing, and nothing is left to seed.
    fireEvent.click(screen.getByText('seed'));
    expect(screen.getByTestId('deck').textContent).toBe('3');
    expect(screen.getByTestId('seedable').textContent).toBe('0');
  });

  it('re-seeding refreshes a stale auto answer instead of duplicating it', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        id: 'c-auto', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
        front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips',
        origin: 'auto', reps: 2, lapses: 0, ease: 2.5, intervalDays: 4, due: '2026-08-01',
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: '2026-07-24T00:00:00Z',
      }],
      // Bread is now the week's most-bought — the auto card's back is stale.
      // No `total` on the trip, so the shop-total template stays out of it.
      shops: [{ id: 's1', date: DAY, store: 'Co-op', items: [{ name: 'Bread' }] }],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.seedCardsFromActivity(NOW)}>seed</button>
              <span data-testid="seedable">{app.kitchenSeedCount(NOW)}</span>
              <span data-testid="deck">{app.cards.length}</span>
            </div>
          );
        }} />
      </AppProvider>,
    );
    // The refresh counts as seedable work — the offer does not hide it.
    expect(screen.getByTestId('seedable').textContent).toBe('1');
    fireEvent.click(screen.getByText('seed'));
    expect(screen.getByTestId('deck').textContent).toBe('1'); // no duplicate
    const refreshed = snap.cards.find((c) => c.id === 'c-auto');
    expect(refreshed.back).toBe('Bread');
    expect(refreshed.reps).toBe(2); // schedule and history untouched
    expect(refreshed.intervalDays).toBe(4);
    expect(refreshed.due).toBe('2026-08-01');
  });

  it('re-seeding never rewrites a handmade card that went stale', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        id: 'c-hand', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
        front: 'Which food did you buy most of this week?', back: 'My own note',
        origin: 'handmade', reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
      }],
      // No `total`, so only the shop-most template is in play.
      shops: [{ id: 's1', date: DAY, store: 'Co-op', items: [{ name: 'Bread' }] }],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.seedCardsFromActivity(NOW)}>seed</button>
              <span data-testid="seedable">{app.kitchenSeedCount(NOW)}</span>
            </div>
          );
        }} />
      </AppProvider>,
    );
    expect(screen.getByTestId('seedable').textContent).toBe('0');
    fireEvent.click(screen.getByText('seed'));
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0].back).toBe('My own note'); // the user owns their words
  });

  it('forgetKitchenCards clears only auto cards and stands the offers down', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [
        ...seededCards,
        {
          id: 'c-auto', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
          front: 'Which food did you buy most of this week?', back: 'Bread',
          origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 2, due: '2026-07-30',
          createdAt: '2026-07-26T00:00:00Z', lastReviewedAt: '2026-07-27T00:00:00Z',
        },
      ],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <button onClick={() => app.forgetKitchenCards()}>forget</button>;
        }} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('forget'));
    expect(snap.cards.map((c) => c.id)).toEqual(['c-overdue', 'c-today', 'c-future']); // handmade/seed stay
    expect(snap.kitchenCardsForgotten).toBe(true);
    // The write went through the real persistence path.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).kitchenCardsForgotten).toBe(true);
  });

  it('forgetting with no auto cards is a no-op, and a re-seed lifts the opt-out', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      kitchenCardsForgotten: true,
      cards: seededCards.filter(() => false),
      shops: [{ id: 's1', date: DAY, store: 'Co-op', total: 5, items: [{ name: 'Milk' }] }],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.forgetKitchenCards()}>forget</button>
              <button onClick={() => app.seedCardsFromActivity(NOW)}>seed</button>
            </div>
          );
        }} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('forget'));
    expect(snap.kitchenCardsForgotten).toBe(true); // nothing to forget — flag stays
    fireEvent.click(screen.getByText('seed'));
    expect(snap.kitchenCardsForgotten).toBe(false); // an explicit re-seed lifts it
    expect(snap.cards).toHaveLength(2); // shop-most + shop-total
  });

  it('seeds a missed-meal card from a skipped plan slot, refreshing when the skip changes', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [],
      myRecipes: [{ id: 'r1', name: 'Pasta with tomato sauce' }],
      mealPlanEvents: [{ id: 'mpe1', date: '2026-07-27', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' }],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.seedCardsFromActivity(NOW)}>seed</button>
              <span data-testid="seedable">{app.kitchenSeedCount(NOW)}</span>
            </div>
          );
        }} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('seed'));
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0]).toMatchObject({
      origin: 'auto', topicId: 'cooking',
      front: 'Which planned meal did you skip this week?',
      back: 'Pasta with tomato sauce — 2026-07-27',
    });
  });
});
describe('the refresh preview (what a seed run would change)', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const staleAuto = {
    id: 'c-auto', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
    front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips',
    origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
    createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
  };

  const previewOf = (over) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, ...over }));
    let preview;
    render(
      <AppProvider>
        <Probe render={(app) => {
          preview = app.kitchenSeedPreview(NOW);
          return null;
        }} />
      </AppProvider>,
    );
    return preview;
  };

  it('reports stale answers as old → new pairs, and writes nothing', () => {
    cleanup();
    const preview = previewOf({
      cards: [staleAuto],
      shops: [{ id: 's1', date: DAY, store: 'Co-op', items: [{ name: 'Bread' }] }], // Bread is the most-bought now
    });
    expect(preview.total).toBe(1);
    expect(preview.additions).toEqual([]);
    expect(preview.updates).toEqual([{
      front: 'Which food did you buy most of this week?',
      oldBack: 'Milk — on 2 trips',
      newBack: 'Bread',
    }]);
    // A preview is a read: the stored deck is untouched.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).cards[0].back).toBe('Milk — on 2 trips');
  });

  it('lists new questions separately from stale-answer refreshes', () => {
    cleanup();
    const preview = previewOf({
      cards: [staleAuto],
      shops: [],
      myRecipes: [{ id: 'r1', name: 'Pasta with tomato sauce' }],
      mealPlanEvents: [{ id: 'mpe1', date: '2026-07-27', slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' }],
    });
    expect(preview.total).toBe(1);
    expect(preview.updates).toEqual([]);
    expect(preview.additions).toEqual([{
      front: 'Which planned meal did you skip this week?',
      topicId: 'cooking',
    }]);
  });
});
