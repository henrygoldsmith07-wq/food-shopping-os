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

  it('mounts inside the Learn tab of the full app', async () => {
    cleanup();
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Learn'));
    expect(await screen.findByText('Flashcard review')).toBeDefined(); // LearnTab is lazy-loaded
    expect(screen.getByText('Membrane structure?')).toBeDefined();
  });

  it('surfaces the due count on Today and opens Learn from it', async () => {
    cleanup();
    render(<App />);
    // The list is the landing now; Today is the dashboard tab.
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    expect(await screen.findByText('Flashcards waiting')).toBeDefined();
    expect(screen.getByText('3 cards to review — keep the memory fresh.')).toBeDefined();

    fireEvent.click(screen.getByText('Flashcards waiting'));
    expect(await screen.findByText('Flashcard review')).toBeDefined(); // the strip leads into the queue
  });

  it('offers the kitchen deck on Today when a returning user has no cards', async () => {
    cleanup();
    // The strip counts against the real clock, so the activity must be
    // clock-relative: a shop this week and a pantry item expiring soon.
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const inWeek = iso(Date.now() - 2 * 86_400_000);
    const soon = iso(Date.now() + 3 * 86_400_000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [],
      shops: [{ id: 's1', date: inWeek, store: 'Co-op', total: 12.4, items: [{ name: 'Milk' }] }],
      pantry: [{ id: 'p1', name: 'Salmon', expiry: soon }],
    }));
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));

    const strip = await screen.findByLabelText('Start a deck from your kitchen');
    expect(within(strip).getByText(/3 questions from your kitchen/)).toBeDefined();
    // The count breaks down by card before the tap — the template chips name
    // exactly which cards will fire, planned-meal ones included.
    expect(within(strip).getByText('Bought most')).toBeDefined();
    expect(within(strip).getByText('Last shop cost')).toBeDefined();
    expect(within(strip).getByText('Next to expire')).toBeDefined();

    // The tap opens the preview first — nothing is written yet.
    fireEvent.click(within(strip).getByText('Start a deck from your kitchen'));
    const preview = await screen.findByLabelText('Kitchen deck preview');
    expect(within(preview).getByText('Cards your kitchen would build')).toBeDefined();
    expect(within(preview).getByText('Which food did you buy most of this week?')).toBeDefined();
    expect((JSON.parse(localStorage.getItem(STORAGE_KEY)).cards || [])).toHaveLength(0);

    // One tap on the footer builds the whole deck right there.
    fireEvent.click(within(preview).getByRole('button', { name: 'Add remaining seed questions' }));
    expect(await screen.findByText('Deck started')).toBeDefined();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.cards).toHaveLength(3);
    expect(stored.cards.every((c) => c.origin === 'auto')).toBe(true);

    // The confirmation leads into the review queue.
    fireEvent.click(screen.getByText('Review'));
    expect(await screen.findByText('Flashcard review')).toBeDefined();
  });

  it('skipping every question on Today keeps the deck from being invented', async () => {
    cleanup();
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const inWeek = iso(Date.now() - 2 * 86_400_000);
    const soon = iso(Date.now() + 3 * 86_400_000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [],
      shops: [{ id: 's1', date: inWeek, store: 'Co-op', total: 12.4, items: [{ name: 'Milk' }] }],
      pantry: [{ id: 'p1', name: 'Salmon', expiry: soon }],
    }));
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));

    const strip = await screen.findByLabelText('Start a deck from your kitchen');
    fireEvent.click(within(strip).getByText('Start a deck from your kitchen'));
    const preview = await screen.findByLabelText('Kitchen deck preview');
    for (const front of [
      'Which food did you buy most of this week?',
      'What did your most recent shop cost?',
      'Which pantry item is next to expire?',
    ]) {
      fireEvent.click(within(preview).getByRole('button', { name: `Skip question for ${front}` }));
    }
    // Every row declined: the panel closes and the offer stands down — but
    // the skips are durable, so nothing re-asks until Settings restores them.
    expect(screen.queryByLabelText('Kitchen deck preview')).toBeNull();
    expect(screen.queryByLabelText('Start a deck from your kitchen')).toBeNull();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.cards || []).toHaveLength(0); // no deck invented
    expect(stored.kitchenKeptFronts).toHaveLength(3);
  });

  it('names the planned-meal cards the offer would build, not just a total', async () => {
    cleanup();
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const skippedDay = iso(Date.now() - 2 * 86_400_000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [],
      myRecipes: [
        { id: 'r1', name: 'Pasta with tomato sauce' },
        { id: 'r2', name: 'Lentil soup' },
      ],
      plan: { [iso(Date.now())]: { dinner: 'r1' } },
      mealPlanEvents: [
        { id: 'mpe1', date: skippedDay, slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' },
      ],
    }));
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    const strip = await screen.findByLabelText('Start a deck from your kitchen');
    expect(within(strip).getByText('2 questions from your kitchen.')).toBeDefined();
    // The plan templates are named as cards, not hidden behind a total.
    expect(within(strip).getByText("Tonight's dinner")).toBeDefined();
    expect(within(strip).getByText('A meal you skipped')).toBeDefined();
  });

  it('the kitchen-seed strip stays off the dashboard once a deck exists', async () => {
    cleanup();
    render(<App />); // seeded deck: 3 cards, nothing to seed
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    expect(await screen.findByRole('button', { name: 'Rearrange' })).toBeDefined();
    expect(screen.queryByLabelText('Start a deck from your kitchen')).toBeNull();
  });

  it('stays quiet on Today when nothing is due', async () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{ ...deck[2], due: '9999-12-31' }], // far past any real review day
    }));
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    expect(await screen.findByRole('button', { name: 'Rearrange' })).toBeDefined(); // Home rendered
    expect(screen.queryByText('Flashcards waiting')).toBeNull();
  });

  it('offers building a deck from the kitchen when there is activity', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded, cards: [],
      shops: [{ id: 's1', date: DAY, store: 'Co-op', total: 12.4, items: [{ name: 'Milk' }] }],
      pantry: [{ id: 'p1', name: 'Salmon', expiry: '2026-07-30' }],
    }));
    renderCard();
    const build = screen.getByRole('button', { name: 'Build a deck from your kitchen' });
    expect(build).toBeDefined();

    fireEvent.click(build);
    // Seeded: shop-most, shop-total, pantry-expiring — all origin 'auto'.
    const seededDeck = storedDeck();
    expect(seededDeck).toHaveLength(3);
    expect(seededDeck.every((c) => c.origin === 'auto')).toBe(true);
    expect(seededDeck.map((c) => c.front)).toContain('Which food did you buy most of this week?');
    expect(seededDeck.map((c) => c.back)).toContain('Co-op — £12.40');
    expect(screen.getByText('3 to review')).toBeDefined();
    // The deck is no longer empty, so the offer is gone — nothing to double-seed.
    expect(screen.queryByRole('button', { name: 'Build a deck from your kitchen' })).toBeNull();
  });

  it('shows no kitchen-seed button when there is no activity', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, cards: [] }));
    renderCard();
    expect(screen.getByText('No cards yet')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Build a deck from your kitchen' })).toBeNull();
  });

  it('lets an empty deck start the queue: the form is open and saving creates a due card', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, cards: [] }));
    renderCard();

    // A fresh deck shows the form straight away, under the honest empty copy.
    expect(screen.getByText('No cards yet')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save card' }).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Card question'), { target: { value: 'Pourquoi la nuit?' } });
    expect(screen.getByRole('button', { name: 'Save card' }).disabled).toBe(true); // both sides needed
    fireEvent.change(screen.getByLabelText('Card answer'), { target: { value: 'La Terre tourne.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    // The card is due the day it appears, so the queue starts immediately.
    expect(storedDeck()).toHaveLength(1);
    expect(storedDeck()[0]).toMatchObject({
      front: 'Pourquoi la nuit?', back: 'La Terre tourne.', origin: 'handmade',
      reps: 0, lapses: 0, due: DAY,
    });
    expect(screen.getByText('Pourquoi la nuit?')).toBeDefined();
    expect(screen.getByText('1 to review')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeDefined();
  });

  it('adds another card from the review header and the new card joins the due queue', () => {
    renderCard(); // seeded deck: c1 + c2 due
    fireEvent.click(screen.getByRole('button', { name: 'Add a new card' }));
    expect(screen.getByText('New card')).toBeDefined();
    expect(screen.queryByText('Membrane structure?')).toBeNull(); // queue set aside while adding

    fireEvent.change(screen.getByLabelText('Card question'), { target: { value: 'Third due card?' } });
    fireEvent.change(screen.getByLabelText('Card answer'), { target: { value: 'Yes, due today too.' } });
    fireEvent.change(screen.getByLabelText('Card topic (optional)'), { target: { value: 'membranes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(storedDeck()).toHaveLength(4);
    expect(storedDeck().find((c) => c.front === 'Third due card?')).toMatchObject({
      topicId: 'membranes', origin: 'handmade', due: DAY,
    });
    // Back to the queue: the overdue card still leads, and the count grew.
    expect(screen.getByText('Membrane structure?')).toBeDefined();
    expect(screen.getByText('3 to review')).toBeDefined();
  });

  it('cancels out of adding without touching the deck', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Add a new card' }));
    fireEvent.change(screen.getByLabelText('Card question'), { target: { value: 'Should not persist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(storedDeck()).toHaveLength(3); // untouched
    expect(screen.getByText('Membrane structure?')).toBeDefined(); // review resumed
    expect(screen.queryByText('Should not persist')).toBeNull();
  });

  it('offers adding a card from the nothing-due state', () => {
    cleanup();
    // Only a far-future card: nothing due, but the deck is not empty.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [{ ...deck[2], due: '9999-12-31' }],
    }));
    renderCard();
    expect(screen.getByText('Nothing due today')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    fireEvent.change(screen.getByLabelText('Card question'), { target: { value: 'Fresh one?' } });
    fireEvent.change(screen.getByLabelText('Card answer'), { target: { value: 'Due as soon as saved.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    // The new card is due today, so there is something to review again.
    expect(screen.getByText('Fresh one?')).toBeDefined();
    expect(screen.getByText('1 to review')).toBeDefined();
  });

  it('shows the standing New card form above the queue when the deck has cards', async () => {
    cleanup();
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Learn'));
    expect(await screen.findByText('New card')).toBeDefined(); // LearnTab is lazy-loaded
    // The persistent form and the review queue both render. The full app runs
    // on the real clock, so all three July cards are overdue by now.
    expect(screen.getByLabelText('Card question')).toBeDefined();
    expect(screen.getByText('3 to review')).toBeDefined();

    // Saving through the standing form adds a card without touching the queue.
    fireEvent.change(screen.getByLabelText('Card question'), { target: { value: 'Fourth card?' } });
    fireEvent.change(screen.getByLabelText('Card answer'), { target: { value: 'Added from the tab-level form.' } });
    fireEvent.change(screen.getByLabelText('Card topic (optional)'), { target: { value: 't1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(storedDeck()).toHaveLength(4);
    expect(storedDeck().find((c) => c.front === 'Fourth card?')).toMatchObject({
      topicId: 't1', origin: 'handmade',
    }); // due = today (the real clock), pinned deterministically in the unit tests
    expect(await screen.findByText('Card saved — it is in the queue below.')).toBeDefined();
    expect(screen.getByText('4 to review')).toBeDefined(); // the new card joined the queue
    // The form cleared itself after saving.
    expect(screen.getByLabelText('Card question').value).toBe('');
  });

  it('steps aside on an empty deck so only one form ever shows', () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, cards: [] }));
    render(
      <AppProvider>
        <>
          <NewCardSection now={NOW} />
          <ReviewQueueCard now={NOW} />
        </>
      </AppProvider>,
    );
    // The queue's own empty state owns creation; the standing section is absent.
    expect(screen.getByText('No cards yet')).toBeDefined();
    expect(screen.getAllByLabelText('Card question')).toHaveLength(1);
    expect(screen.queryByText('A new card is due the day you add it — the queue below picks it up right away.')).toBeNull();
  });

  it('starts the queue end to end from the Learn tab of a fresh app', async () => {
    cleanup();
    // Onboarded, but no cards key at all — a user who has never touched the deck.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true, name: 'Sam', day: DAY }));
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Learn'));
    expect(await screen.findByText('No cards yet')).toBeDefined(); // LearnTab is lazy-loaded

    fireEvent.change(screen.getByLabelText('Card question'), { target: { value: 'First ever card?' } });
    fireEvent.change(screen.getByLabelText('Card answer'), { target: { value: 'Made from the Learn tab.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByText('1 to review')).toBeDefined();
    expect(screen.getByText('First ever card?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeDefined();
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