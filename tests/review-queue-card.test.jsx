import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
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