import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import NewCardSection from '../src/components/NewCardSection.jsx';
import ReviewQueueCard from '../src/components/ReviewQueueCard.jsx';

/**
 * The review screen on the Learn tab: the soonest-due card is shown, the
 * answer is hidden until asked, and the four ratings hand the scheduler a
 * grade whose next state is persisted through the store.
 */
const DAY = '2026-07-28';
const NOW = new Date('2026-07-28T10:00:00Z');

const deck = [
  {
    id: 'c1', userId: 'local', subjectId: 'bio', topicId: 't1',
    front: 'Membrane structure?', back: 'Phospholipid bilayer.', origin: 'seed',
    reps: 2, lapses: 0, ease: 2.5, intervalDays: 6, due: '2026-07-27',
    createdAt: '2026-07-01T00:00:00Z', lastReviewedAt: '2026-07-21T00:00:00Z',
  },
  {
    id: 'c2', userId: 'local', subjectId: 'bio', topicId: 't1',
    front: 'SA:V ratio?', back: 'Limits cell size.', origin: 'seed',
    reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: '2026-07-28',
    createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
  },
  {
    id: 'c3', userId: 'local', subjectId: 'bio', topicId: 't1',
    front: 'Mitochondria?', back: 'Powerhouse of the cell.', origin: 'seed',
    reps: 1, lapses: 0, ease: 2.5, intervalDays: 3, due: '2026-07-30',
    createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: '2026-07-27T00:00:00Z',
  },
];

const seeded = { onboarded: true, name: 'Sam', day: DAY, cards: deck };

const renderCard = (topicReviewRequest = null) => render(
  <AppProvider>
    <ReviewQueueCard now={NOW} topicReviewRequest={topicReviewRequest} />
  </AppProvider>,
);

const storedDeck = () => JSON.parse(localStorage.getItem(STORAGE_KEY)).cards;

describe('focusing the review queue one topic at a time', () => {
  const twoTopicDeck = [
    { ...deck[0], id: 'm1', topicId: 'membranes', due: '2026-07-26' },
    { ...deck[0], id: 'm2', topicId: 'membranes', due: '2026-07-27', front: 'Second membrane card?' },
    { ...deck[0], id: 'e1', topicId: 'enzymes', due: '2026-07-27', front: 'Enzyme card?' },
  ];

  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, cards: twoTopicDeck })));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows per-topic counts, focuses a topic, and keeps All honest', () => {
    renderCard();
    const bar = screen.getByLabelText('Review one topic at a time');
    expect(within(bar).getByText('Membranes · 2')).toBeDefined();
    expect(within(bar).getByText('Enzymes · 1')).toBeDefined();
    expect(within(bar).getByText('All')).toBeDefined();

    fireEvent.click(within(bar).getByText('Enzymes · 1'));
    expect(screen.getByText('Enzyme card?')).toBeDefined();
    expect(screen.getByText('1 to review')); // filtered count, not 3
    expect(screen.queryByText('Membrane structure?')).toBeNull();
  });

  it('a rating inside a focus advances within the topic', () => {
    renderCard();
    const bar = screen.getByLabelText('Review one topic at a time');
    fireEvent.click(within(bar).getByText('Membranes · 2'));
    expect(screen.getByText('Membrane structure?')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Reveal answer'));
    fireEvent.click(screen.getByLabelText('Rate Good — knew it'));
    // Next due membrane card surfaces; the enzyme card does not leak in.
    expect(screen.getByText('Second membrane card?')).toBeDefined();
    expect(screen.queryByText('Enzyme card?')).toBeNull();
  });

  it('exhausting a focus falls back to All instead of a dead end', () => {
    renderCard();
    const bar = screen.getByLabelText('Review one topic at a time');
    fireEvent.click(within(bar).getByText('Enzymes · 1'));
    fireEvent.click(screen.getByLabelText('Reveal answer'));
    fireEvent.click(screen.getByLabelText('Rate Good — knew it'));
    expect(within(bar).getByText('All')).toBeDefined();
    expect(screen.getByText('Membrane structure?')).toBeDefined(); // queue continues
  });

  it('rating the last card of a multi-card focus ends the session, not one card early', () => {
    renderCard();
    const bar = screen.getByLabelText('Review one topic at a time');
    fireEvent.click(within(bar).getByText('Membranes · 2'));
    // First membrane card: the focus holds — a second card is still due.
    fireEvent.click(screen.getByLabelText('Reveal answer'));
    fireEvent.click(screen.getByLabelText('Rate Good — knew it'));
    expect(screen.getByText('Second membrane card?')).toBeDefined();
    expect(within(screen.getByLabelText('Review one topic at a time')).getByRole('button', { name: 'Membranes · 1' }).getAttribute('aria-pressed')).toBe('true');
    // Second membrane card: the topic is spent — the session leaves the
    // focus and the full queue's soonest card (the enzyme card) surfaces.
    fireEvent.click(screen.getByLabelText('Reveal answer'));
    fireEvent.click(screen.getByLabelText('Rate Good — knew it'));
    expect(screen.getByText('Enzyme card?')).toBeDefined();
    // Only one topic still owes cards, so the bar stops offering filters —
    // the queue is All by construction, with nothing pressed.
    expect(screen.queryByLabelText('Review one topic at a time')).toBeNull();
    expect(screen.getByText('1 to review')).toBeDefined();
  });

  it('toggling focus off returns to the full queue', () => {
    renderCard();
    const bar = screen.getByLabelText('Review one topic at a time');
    fireEvent.click(within(bar).getByText('Membranes · 2'));
    fireEvent.click(within(bar).getByText('Membranes · 2'));
    expect(screen.getByText('3 to review')).toBeDefined(); // full queue restored
    expect(screen.getByText('Membrane structure?')).toBeDefined(); // soonest across all
  });

  it('retagging a card moves it between topics without touching its schedule', () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("Retag this card's topic"));
    fireEvent.change(screen.getByLabelText('Card topic'), { target: { value: 'organelles' } });
    fireEvent.click(screen.getByLabelText('Save topic'));

    const stored = storedDeck();
    const card = stored.find((c) => c.id === 'm1');
    expect(card.topicId).toBe('organelles'); // retagged
    expect(card.intervalDays).toBe(6); // schedule untouched
    expect(card.reps).toBe(2);
    expect(screen.getByText('Organelles')).toBeDefined(); // pill updates
  });

  it('a blank retag falls back to General and shows no pill', () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("Retag this card's topic"));
    fireEvent.change(screen.getByLabelText('Card topic'), { target: { value: '  ' } });
    fireEvent.click(screen.getByLabelText('Save topic'));
    expect(storedDeck().find((c) => c.id === 'm1').topicId).toBe('general');
    expect(screen.queryByText('Membranes')).toBeNull(); // general default hides the pill
  });

  it('cancelling a retag leaves the card as it was', () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("Retag this card's topic"));
    fireEvent.change(screen.getByLabelText('Card topic'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByLabelText('Cancel topic edit'));
    expect(storedDeck().find((c) => c.id === 'm1').topicId).toBe('membranes');
  });

  it('the tag pill on the card itself focuses that topic too', () => {
    renderCard();
    // The soonest card is a Membranes card, so its tag is the one on screen.
    fireEvent.click(screen.getByLabelText('Filter the queue to Membranes'));
    expect(screen.getByText('2 to review')).toBeDefined();
    expect(screen.getByText('Membrane structure?')).toBeDefined();
    expect(screen.queryByText('Enzyme card?')).toBeNull();
    // It is a toggle: tapping the active pill restores the full queue.
    fireEvent.click(screen.getByLabelText('Filter the queue to Membranes'));
    expect(screen.getByText('3 to review')).toBeDefined();
  });

  it('the forget flow removes only kitchen cards and can bring them back', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [
        ...deck,
        {
          id: 'c-auto', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
          front: 'Which food did you buy most of this week?', back: 'Bread',
          origin: 'auto', reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
          createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
        },
      ],
    }));
    renderCard();
    fireEvent.click(screen.getByText('Turn off kitchen cards'));
    fireEvent.click(screen.getByLabelText('Confirm removing kitchen cards'));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']); // auto card gone
    expect(stored.kitchenCardsForgotten).toBe(true);
  });

  it('no topic bar when every due card shares one topic', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    renderCard();
    expect(screen.getByText('2 to review')).toBeDefined();
    expect(screen.queryByLabelText('Review one topic at a time')).toBeNull();
  });
});

describe('the week-ahead forecast strip on Learn', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows the coming week with Today first and per-day counts', () => {
    renderCard();
    const strip = screen.getByLabelText('Week-ahead forecast');
    const days = within(strip).getAllByLabelText(/cards due on/);
    expect(days).toHaveLength(7);
    expect(within(strip).getByText('Today')).toBeDefined();
    expect(days[0].getAttribute('aria-label')).toBe('2 cards due on 2026-07-28');
    expect(days[2].getAttribute('aria-label')).toBe('1 cards due on 2026-07-30');
  });

  it('stays hidden for an empty deck', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true, name: 'Sam', day: DAY }));
    renderCard();
    expect(screen.getByText('No cards yet')).toBeDefined();
    expect(screen.queryByLabelText('Week-ahead forecast')).toBeNull();
  });
});

describe('the flashcard review queue on Learn', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows the soonest-due card with its answer hidden', () => {
    renderCard();
    expect(screen.getByText('Flashcard review')).toBeDefined();
    expect(screen.getByText('Membrane structure?')).toBeDefined(); // overdue first
    expect(screen.getByText('2 to review')).toBeDefined();
    expect(screen.queryByText('Phospholipid bilayer.')).toBeNull(); // answer stays hidden
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeDefined();
  });

  it('tags the card with its topic under the front', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{ ...deck[1], topicId: 'membranes' }],
    }));
    renderCard();
    expect(screen.getByText('SA:V ratio?')).toBeDefined();
    expect(screen.getByText('Membranes')).toBeDefined();
  });

  it('shows no topic pill for untagged cards', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{ ...deck[1], topicId: 'general' }],
    }));
    renderCard();
    expect(screen.getByText('SA:V ratio?')).toBeDefined();
    expect(screen.queryByText('general')).toBeNull();
  });

  it('reveals the answer and the four ratings on flip', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(screen.getByText('Phospholipid bilayer.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rate Again — forgot it' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rate Hard — effortful' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rate Good — knew it' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rate Easy — too easy' })).toBeDefined();
    // Plain cards carry no skip story — no follow-up line appears.
    expect(screen.queryByText(/Why it was skipped/)).toBeNull();
  });

  it('reveals why a missed meal was skipped, once the answer is shown', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        ...deck[1], topicId: 'cooking',
        front: 'Which planned meal did you skip this week?',
        back: 'Pasta with tomato sauce — 2026-07-27',
        skippedReason: 'no-time',
      }],
    }));
    renderCard();
    // The reason stays hidden with the answer.
    expect(screen.queryByText(/Why it was skipped/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    // The label and the reason sit in sibling nodes; the body reads the line whole.
    expect(document.body.textContent).toMatch(/Why it was skipped: No time/);
    expect(screen.getByRole('button', { name: 'Rate Good — knew it' })).toBeDefined();
  });

  it('rating a missed-meal card holds the review on the reason question, then grades and folds', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        ...deck[1], topicId: 'cooking',
        front: 'Which planned meal did you skip this week?',
        back: 'Pasta with tomato sauce — 2026-07-27',
        skippedReason: 'no-time',
      }],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));
    // The review holds: the reflection question replaces the ratings grid, and
    // the grade is not committed until it is answered.
    expect(document.body.textContent).toMatch(/Does “No time” still describe why planned meals get skipped/);
    expect(storedDeck()[0].lastReviewedAt).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Still applies — No time remains a real reason' }));
    // The answer folded into the profile and the grade landed in the same pass.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.skipReasonProfile['no-time']).toEqual({
      applies: 1, changed: 0, lastStillApplies: true, lastAt: NOW.getTime(),
    });
    expect(storedDeck()[0].lastReviewedAt).toBe('2026-07-28T10:00:00.000Z');
    expect(screen.getByText('Nothing due today')).toBeDefined(); // the review advanced
  });

  it('dismissing the reflection grades the card without folding anything', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        ...deck[1], topicId: 'cooking',
        front: 'Which planned meal did you skip this week?',
        back: 'Pasta with tomato sauce — 2026-07-27',
        skippedReason: 'no-time',
      }],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip the reflection and grade the card' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.skipReasonProfile['no-time']).toBeUndefined(); // nothing folded
    expect(storedDeck()[0].lastReviewedAt).toBe('2026-07-28T10:00:00.000Z'); // but it was graded
    expect(screen.getByText('Nothing due today')).toBeDefined();
  });

  it('an Again rating on a missed-meal card grades at once — no reason question', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        ...deck[1], topicId: 'cooking',
        front: 'Which planned meal did you skip this week?',
        back: 'Pasta with tomato sauce — 2026-07-27',
        skippedReason: 'no-time',
      }],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Again — forgot it' }));
    expect(document.body.textContent).not.toMatch(/still describe why planned meals get skipped/);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.skipReasonProfile['no-time']).toBeUndefined();
    expect(storedDeck()[0].lastReviewedAt).toBe('2026-07-28T10:00:00.000Z'); // graded immediately
    // Again keeps the card due today — it returns to the front of the queue.
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeDefined();
  });

  it('a reason reflected on before carries its last conclusion onto the reveal', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{
        ...deck[1], topicId: 'cooking',
        front: 'Which planned meal did you skip this week?',
        back: 'Pasta with tomato sauce — 2026-07-27',
        skippedReason: 'no-time',
      }],
      skipReasonProfile: {
        'no-time': { applies: 2, changed: 1, lastStillApplies: false, lastAt: 1234 },
      },
    }));
    renderCard();
    expect(screen.queryByText(/Reflected on this reason/)).toBeNull(); // hidden with the answer
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(document.body.textContent).toMatch(/Reflected on this reason 3× — you last said it no longer applies/);
  });

  it('offers a stale tonight card for removal in the refresh preview', () => {
    cleanup();
    const stale = {
      ...deck[1], topicId: 'cooking', origin: 'auto',
      front: "What's planned for dinner tonight?", back: 'Pasta with tomato sauce',
      due: '9999-12-31', // not due — the removal offer lives under Nothing due
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [stale], plan: {}, mealPlanEvents: [],
    }));
    renderCard();
    // The merge sees the outlived card even though nothing is due.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 1 kitchen card' }));
    expect(document.body.textContent).toMatch(/No longer on the plan/);
    fireEvent.click(screen.getByRole('button', { name: `Remove stale card for What's planned for dinner tonight?` }));
    expect(storedDeck()).toHaveLength(0);
    expect(screen.getByText('No cards yet')).toBeDefined(); // the stale card is gone
    expect(screen.queryByText(/No longer on the plan/)).toBeNull();
  });

  it('keeping a stale plan card is durable: it stays and stops being offered', () => {
    cleanup();
    const stale = {
      ...deck[1], topicId: 'cooking', origin: 'auto',
      front: "What's planned for dinner tonight?", back: 'Pasta with tomato sauce',
      due: '9999-12-31',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [stale], plan: {}, mealPlanEvents: [],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 1 kitchen card' }));
    fireEvent.click(screen.getByRole('button', { name: `Keep stale card for What's planned for dinner tonight?` }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.cards).toHaveLength(1); // kept, not removed
    expect(stored.kitchenKeptFronts).toEqual(["What's planned for dinner tonight?"]);
    expect(screen.getByText('Nothing due today')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Refresh/ })).toBeNull(); // no longer offered
  });

  it('previews what a refresh changes and applies one row on its own confirm', () => {
    cleanup();
    const staleAuto = {
      id: 'c-auto', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
      front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips',
      origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
      createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [staleAuto],
      shops: [{ id: 's1', date: DAY, store: 'Co-op', items: [{ name: 'Bread' }] }],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 1 kitchen card' }));
    // The preview names the change before anything is written.
    expect(screen.getByText('What refreshing would change')).toBeDefined();
    expect(document.body.textContent).toMatch(/Milk — on 2 trips.*→.*Bread/);
    expect(storedDeck()[0].back).toBe('Milk — on 2 trips'); // untouched while previewing
    fireEvent.click(screen.getByRole('button', { name: 'Close refresh preview' }));
    expect(storedDeck()[0].back).toBe('Milk — on 2 trips');
    // Reopening and confirming that one row applies the refresh and closes.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 1 kitchen card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply refresh for Which food did you buy most of this week?' }));
    expect(storedDeck()[0].back).toBe('Bread');
    expect(screen.queryByRole('button', { name: /Refresh \d kitchen card/ })).toBeNull();
  });

  it('applies one stale row and skips another: the kept answer stays put for good', () => {
    cleanup();
    const twoStale = [
      {
        id: 'c-most', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
        front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips',
        origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
      {
        id: 'c-total', userId: 'local', subjectId: 'kitchen', topicId: 'budget',
        front: 'What did your most recent shop cost?', back: 'Tesco — £5.00',
        origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: twoStale,
      shops: [{ id: 's1', date: DAY, store: 'Co-op', total: 12.4, items: [{ name: 'Bread' }] }],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 2 kitchen cards' }));
    // Each row carries its own decision: refresh just the shop-total card.
    fireEvent.click(screen.getByRole('button', { name: 'Apply refresh for What did your most recent shop cost?' }));
    expect(storedDeck().find((c) => c.id === 'c-total').back).toBe('Co-op — £12.40');
    expect(storedDeck().find((c) => c.id === 'c-most').back).toBe('Milk — on 2 trips'); // not touched yet
    // Skipping the other keeps its current answer durably — no future re-offer.
    fireEvent.click(screen.getByRole('button', { name: 'Skip refresh for Which food did you buy most of this week?' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.cards.find((c) => c.id === 'c-most').back).toBe('Milk — on 2 trips');
    expect(stored.kitchenKeptFronts).toEqual(['Which food did you buy most of this week?']);
    // Both rows are dealt with — nothing is left to refresh or re-offer.
    expect(screen.queryByRole('button', { name: /Refresh \d kitchen card/ })).toBeNull();
  });

  it('keeps every current answer at deck level without forgetting the deck', () => {
    const twoStale = [
      {
        id: 'c-most', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
        front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips',
        origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
      {
        id: 'c-total', userId: 'local', subjectId: 'kitchen', topicId: 'budget',
        front: 'What did your most recent shop cost?', back: 'Tesco — £5.00',
        origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
      {
        id: 'c-hand', userId: 'local', subjectId: 'manual', topicId: 'general',
        front: 'My own note', back: 'keep me', origin: 'handmade',
        reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: twoStale,
      shops: [{ id: 's1', date: DAY, store: 'Co-op', total: 12.4, items: [{ name: 'Bread' }] }],
    }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 2 kitchen cards' }));
    // The per-row Skip, applied once: the deck-level action sits beside it.
    fireEvent.click(screen.getByRole('button', { name: 'Keep all current answers' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Every auto front present in the deck is recorded as kept, durably.
    expect([...stored.kitchenKeptFronts].sort()).toEqual([
      'What did your most recent shop cost?',
      'Which food did you buy most of this week?',
    ]);
    // Not the forget opt-out: no card leaves and nothing is marked forgotten.
    expect(stored.cards).toHaveLength(3);
    expect(stored.kitchenCardsForgotten).toBeFalsy();
    expect(stored.cards.some((c) => c.id === 'c-hand')).toBe(true); // handmade untouched
    expect(stored.cards.find((c) => c.id === 'c-most').back).toBe('Milk — on 2 trips'); // answer kept as-is
    // The preview closed and nothing is left to refresh or re-offer.
    expect(screen.queryByText('What refreshing would change')).toBeNull();
    expect(screen.queryByRole('button', { name: /Refresh \d kitchen card/ })).toBeNull();
  });

  it('labels the reduced refresh offer when a row was skipped as-is', () => {
    const twoStale = [
      {
        id: 'c-most', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
        front: 'Which food did you buy most of this week?', back: 'Milk — on 2 trips',
        origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
      {
        id: 'c-total', userId: 'local', subjectId: 'kitchen', topicId: 'budget',
        front: 'What did your most recent shop cost?', back: 'Tesco — £5.00',
        origin: 'auto', reps: 1, lapses: 0, ease: 2.5, intervalDays: 0, due: DAY,
        createdAt: '2026-07-20T00:00:00Z', lastReviewedAt: null,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: twoStale,
      shops: [{ id: 's1', date: DAY, store: 'Co-op', total: 12.4, items: [{ name: 'Bread' }] }],
    }));
    renderCard();
    // Two refreshes are offered; skipping one halves the offer.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 2 kitchen cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip refresh for Which food did you buy most of this week?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close refresh preview' }));
    // The remaining offer reads as a choice, not a vanished row.
    expect(screen.getByRole('button', { name: 'Refresh 1 kitchen card' })).toBeDefined();
    expect(screen.getByText(/1 kept as-is/)).toBeDefined();
    // Refreshing what is left clears the offer and the label together.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 1 kitchen card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply refresh for What did your most recent shop cost?' }));
    expect(screen.queryByRole('button', { name: /Refresh \d kitchen card/ })).toBeNull();
    expect(screen.queryByText(/kept as-is/)).toBeNull();
  });

  it('grades through the store and advances the queue', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));

    // c1 (interval 6, ease 2.5) → 6 × 2.5 = 15 days, reps 2 → 3.
    expect(storedDeck().find((c) => c.id === 'c1')).toMatchObject({
      reps: 3, lapses: 0, intervalDays: 15,
    });
    // The queue moved on to the next due card, answer hidden again.
    expect(screen.getByText('SA:V ratio?')).toBeDefined();
    expect(screen.getByText('1 to review')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeDefined();
  });

  it('keeps a missed card in the queue for relearning', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Again — forgot it' }));

    // The miss lapsed c1 (seen before) and it is due again today.
    expect(storedDeck().find((c) => c.id === 'c1')).toMatchObject({
      reps: 3, lapses: 1, intervalDays: 0, due: DAY,
    });
    expect(screen.getByText('Membrane structure?')).toBeDefined(); // still in the queue
    expect(screen.getByText('2 to review')).toBeDefined();
  });

  it('clears to a done state once every due card is reviewed', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Easy — too easy' }));

    expect(screen.getByText('Nothing due today')).toBeDefined();
    expect(screen.getByText(/The next card matures on 2026-07-30/)).toBeDefined();
  });

  it('explains itself honestly when the deck is empty', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, cards: [] }));
    renderCard();
    expect(screen.getByText('No cards yet')).toBeDefined();
  });

  // Boundary (Revise quarantine): SRS no longer lives on Learn/Today.
  // The queue components above are covered by direct renders; the app
  // shell now serves food learning only. See src/legacy/README.md.
  it('Learn tab is food learning only — no SRS queue in the app shell', async () => {
    cleanup();
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Learn'));
    expect(await screen.findByText('Make the next week easier')).toBeDefined();
    expect(screen.queryByText('Flashcard review')).toBeNull();
    expect(screen.queryByText('Kitchen knowledge map')).toBeNull();
  });

  it('Today tab is Plan → Shop → Eat with no SRS strips', async () => {
    cleanup();
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    expect(await screen.findByLabelText('Plan, shop, eat')).toBeDefined();
    expect(screen.queryByText('Flashcards waiting')).toBeNull();
    expect(screen.queryByLabelText('Start a deck from your kitchen')).toBeNull();
  });


  it('a reason ask focuses only that reason’s missed-meal cards; the tap-out releases it', () => {
    cleanup();
    const skipCard = (id, reason, front) => ({
      ...deck[1], id, topicId: 'cooking', front, back: `${front} — 2026-07-27`,
      skippedReason: reason,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [
        skipCard('s1', 'no-time', 'Which planned meal did you skip this week?'),
        skipCard('s2', 'missing-ingredients', 'Which planned meal was unmakeable?'),
      ],
    }));
    renderCard({ id: 1, reason: 'no-time' });
    // Focus lands on the asked reason only — the other reason's card is out.
    expect(screen.getByText('Which planned meal did you skip this week?')).toBeDefined();
    expect(screen.queryByText('Which planned meal was unmakeable?')).toBeNull();
    expect(screen.getByText('1 to review')).toBeDefined();
    // The tap-out names the active focus and releases it — the full queue's
    // soonest card (s1 wins the due-day tiebreak) is back on top.
    fireEvent.click(screen.getByRole('button', { name: 'Stop focusing this skip reason' }));
    expect(screen.getByText('Which planned meal did you skip this week?')).toBeDefined();
    expect(screen.getByText('2 to review')).toBeDefined();
  });

  it('a topic ask supersedes a reason focus and vice versa — one narrowing at a time', () => {
    cleanup();
    const skipCard = {
      ...deck[1], id: 's1', topicId: 'cooking',
      front: 'Which planned meal did you skip this week?',
      back: 'Which planned meal did you skip this week? — 2026-07-27',
      skippedReason: 'no-time',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{ ...deck[0], id: 'm1' }, skipCard], // one due topic card, one due reason card
    }));
    const { rerender } = renderCard({ id: 1, topicId: 't1' });
    expect(screen.getByText('Membrane structure?')).toBeDefined();
    const ask = (request) => rerender(
      <AppProvider>
        <ReviewQueueCard now={NOW} topicReviewRequest={request} />
      </AppProvider>,
    );
    ask({ id: 2, reason: 'no-time' });
    expect(screen.getByText('Which planned meal did you skip this week?')).toBeDefined();
    ask({ id: 3, topicId: 't1' });
    expect(screen.getByText('Membrane structure?')).toBeDefined();
  });
});

describe('the boot refresh note on the queue', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const seedWith = (stamp) => localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...seeded,
    cards: deck.map((c) => ({ ...c, origin: 'auto' })), // an adopted kitchen deck
    kitchenBootRefresh: stamp,
  }));

  it('names the merge the boot made, in the queue that shows the deck', () => {
    seedWith({ count: 2, day: DAY });
    renderCard();
    expect(screen.getByText('2 kitchen cards refreshed on open')).toBeDefined();
  });

  it('reads singular when one card changed', () => {
    seedWith({ count: 1, day: DAY });
    renderCard();
    expect(screen.getByText('1 kitchen card refreshed on open')).toBeDefined();
  });

  it('never claims a refresh for a stamp that is not from today', () => {
    seedWith({ count: 2, day: '2026-07-27' }); // yesterday's boot — the note is stale
    renderCard();
    expect(screen.queryByText(/kitchen cards? refreshed on open/)).toBeNull();
  });

  it('stays quiet when no boot refresh has stamped the state', () => {
    seedWith(null);
    renderCard();
    expect(screen.queryByText(/kitchen cards? refreshed on open/)).toBeNull();
  });
});