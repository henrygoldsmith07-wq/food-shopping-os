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

const renderCard = () => render(
  <AppProvider>
    <ReviewQueueCard now={NOW} />
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
});