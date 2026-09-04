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
});