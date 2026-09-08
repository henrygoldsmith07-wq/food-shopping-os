import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import KnowledgeMapSection from '../src/components/KnowledgeMapSection.jsx';
import ReviewQueueCard from '../src/components/ReviewQueueCard.jsx';

/**
 * The kitchen knowledge map, fed from the real deck: one subject built from
 * the card topics, honest numbers from the cards themselves, and the
 * curriculum-only levels (spec statements, questions, exam outlook) absent
 * until content that can evidence them exists.
 */
const DAY = '2026-07-28';

const card = (id, topicId, reps, over = {}) => ({
  id, userId: 'local', subjectId: 'kitchen', topicId,
  front: `${topicId} front ${id}`, back: `${topicId} back ${id}`,
  origin: 'auto', reps, lapses: 0, ease: 2.5, intervalDays: reps ? 2 : 0, due: DAY,
  createdAt: '2026-07-26T00:00:00Z', lastReviewedAt: reps ? '2026-07-27T00:00:00Z' : null,
  ...over,
});

const seed = (cards) => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  onboarded: true, name: 'Sam', day: DAY, cards,
}));

const renderSection = () => render(
  <AppProvider>
    <KnowledgeMapSection />
  </AppProvider>,
);
/**
 * Legacy SRS integration harness (Revise quarantine): the queue + map wired
 * together exactly as the old Learn tab did, without routing through the
 * food-loop shell. Learn now serves food learning only (see the boundary
 * test below); this harness keeps the queue/map interaction covered.
 */
const renderQueueAndMap = () => {
  const Harness = () => {
    const [ask, setAsk] = useState(null);
    return (
      <AppProvider>
        <ReviewQueueCard now={new Date()} topicReviewRequest={ask} />
        <KnowledgeMapSection
          onReviewTopic={(topicId) => setAsk((prev) => ({ id: (prev?.id || 0) + 1, topicId }))}
        />
      </AppProvider>
    );
  };
  return render(<Harness />);
};

describe('the kitchen knowledge map on Learn', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('maps the deck: real topics, card counts, honest empty curriculum levels', () => {
    seed([card('s1', 'shopping', 0), card('s2', 'shopping', 0), card('c1', 'cooking', 3)]);
    renderSection();

    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();
    expect(screen.getByText('Your kitchen')).toBeDefined();
    expect(screen.getByText(/2 topics · 0 spec statements/)).toBeDefined();
    // Kitchen-catalogue order: shopping before cooking.
    expect(screen.getByText('Shopping')).toBeDefined();
    expect(screen.getByText('Cooking')).toBeDefined();
    // Mastery only exists where the schedule has graded: Shopping's two
    // fresh cards still read Not started; Cooking's reviewed card earns a band.
    expect(screen.getAllByText('Not started')).toHaveLength(1);
    expect(screen.getByText('Needs work')).toBeDefined();

    // Expand Shopping: both cards, none studied yet.
    fireEvent.click(screen.getByRole('button', { name: /Shopping.*Show the map/ }));
    expect(screen.getByText('2 in deck')).toBeDefined();
    expect(screen.getByText(/No spec statements mapped for this topic yet/)).toBeDefined();

    // Expand Cooking: its card was reviewed — studied counts are real.
    fireEvent.click(screen.getByRole('button', { name: /Cooking.*Show the map/ }));
    expect(screen.getByText('1/1 studied')).toBeDefined();
  });

  it('stays off Learn when there is no deck', () => {
    seed([]);
    renderSection();
    expect(screen.queryByText('Kitchen knowledge map')).toBeNull();
    expect(screen.queryByText('Your kitchen')).toBeNull();
  });
});

describe('the kitchen knowledge map through the app shell', () => {
  it('Learn tab serves food learning, not the quarantined knowledge map', async () => {
    // Boundary (Revise quarantine, src/legacy/README.md): the SRS map left
    // the food-loop shell. Learn teaches from meals/shops/waste instead.
    render(<App />);
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Learn'));
    expect(await screen.findByText('Make the next week easier')).toBeDefined();
    expect(screen.queryByText('Kitchen knowledge map')).toBeNull();
  });

  beforeEach(() => {
    localStorage.clear();
    seed([
      // Reviewed well ahead of any plausible run date, so the mastered band is
      // deterministic however the store rolls the seeded day forward.
      card('s1', 'shopping', 4, { ease: 2.5, intervalDays: 21, due: '2099-01-10', lastReviewedAt: '2098-12-01T10:00:00Z' }),
      card('s2', 'shopping', 0),
      card('c1', 'cooking', 0),
    ]);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the map from the seeded deck (legacy direct render)', async () => {
    renderSection();
    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();

    // The subject header and both kitchen topics arrive from the deck.
    expect(screen.getByText('Your kitchen')).toBeDefined();
    expect(screen.getByText(/2 topics · 0 spec statements/)).toBeDefined();
    // Shopping earned a schedule-backed band; Cooking never reviewed stays out.
    expect(screen.getByText('Covered')).toBeDefined();
    expect(screen.getAllByText('Not started')).toHaveLength(1);

    // Expand Shopping: the map walks its chain from real scheduling state.
    fireEvent.click(screen.getByRole('button', { name: /Shopping.*Show the map/ }));
    expect(screen.getByText('1/2 studied')).toBeDefined();
    // The mastery node shows the retention split, not a bare blend: the one
    // studied card is held (nothing due today) and the hint carries the counts.
    expect(screen.getByText('1 of 1 held', { exact: true })).toBeDefined();
    expect(screen.getByTitle(/retention 100% \(1 of 1 held\) · confidence 100% · 4 graded/)).toBeDefined();
    // The curriculum-only levels say what is missing, never imply it exists.
    expect(screen.getByText(/No spec statements mapped for this topic yet/)).toBeDefined();
  });

  it('seeds all four bands and the map reads one status per topic end to end', async () => {
    // One topic in each band the schedule can honestly claim: Shopping is
    // mastered (a held card, no lapses → 1.0), Cooking is mid-flight (3
    // studied, 2 due today → 0.53), Pantry is failing (one card due with
    // lapse history → 0.05), Food diary is untouched (a fresh card, no
    // review yet → no mastery row at all). All dates stay deterministic
    // however the store rolls the seeded day forward.
    localStorage.clear();
    seed([
      card('s1', 'shopping', 4, { ease: 2.5, intervalDays: 21, due: '2099-01-10', lastReviewedAt: '2098-12-01T10:00:00Z' }),
      card('c1', 'cooking', 3, { ease: 2.5, intervalDays: 21, due: '2099-01-10', lastReviewedAt: '2098-12-01T10:00:00Z' }),
      card('c2', 'cooking', 3, { due: '2026-07-27', lastReviewedAt: '2026-07-20T10:00:00Z' }),
      card('c3', 'cooking', 2, { due: '2026-07-27', lastReviewedAt: '2026-07-20T10:00:00Z' }),
      card('p1', 'pantry', 3, { ease: 1.7, intervalDays: 0, due: '2026-07-27', lapses: 2, lastReviewedAt: '2026-07-20T10:00:00Z' }),
      card('d1', 'diary', 0),
    ]);
    renderSection();
    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();

    // All four kitchen topics arrive, each wearing its own band from the
    // same schedule — no fabricated statuses, no missing rows.
    expect(screen.getByText('Your kitchen')).toBeDefined();
    expect(screen.getByText(/4 topics · 0 spec statements/)).toBeDefined();
    const rowOf = (topic) => screen.getByRole('button', { name: new RegExp(`${topic}.*Show the map`) });
    expect(within(rowOf('Shopping')).getByText('Covered', { exact: true })).toBeDefined();
    expect(within(rowOf('Cooking')).getByText('In progress', { exact: true })).toBeDefined();
    expect(within(rowOf('Pantry')).getByText('Needs work', { exact: true })).toBeDefined();
    expect(within(rowOf('Food diary')).getByText('Not started', { exact: true })).toBeDefined();

    // The failing topic's own chain names the cause: Pantry's single studied
    // card is due and lapsed, so its mastery node shows nothing held and the
    // flashcard hint carries the same lapse the band was dragged by.
    fireEvent.click(rowOf('Pantry'));
    expect(screen.getByText('0 of 1 held · 1 due today', { exact: true })).toBeDefined();
    expect(screen.getByTitle(/1 due now · 1 lapsed/)).toBeDefined();
  });

  it('reviews a due card on Learn and the map band changes with the review', async () => {
    // One fresh card, one topic, overdue: the queue holds it, the map has no
    // graded schedule yet ("Not started"), and a Good rating is the first
    // grade the topic has ever seen — which is exactly what the band reads.
    localStorage.clear();
    seed([card('s1', 'shopping', 0, { due: '2026-07-27' })]);
    renderQueueAndMap();
    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();

    // Before the review: the topic carries no band because nothing has been
    // graded — the map says Not started, honestly, whatever the queue holds.
    const row = screen.getByRole('button', { name: /Shopping.*Show the map/ });
    expect(within(row).getByText('Not started', { exact: true })).toBeDefined();

    // The queue's due card is the one the topic waits on. Rate it Good: the
    // scheduler lands a real next state (reps 1, due a day out) through the
    // store's write path, so the deck the map reads has changed.
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)).cards.find((c) => c.id === 's1');
    expect(stored).toMatchObject({ reps: 1, intervalDays: 1, ease: 2.5 });

    // The same topic now reads a schedule-backed band: the card is not due
    // until tomorrow, retention is whole, and the band is Covered.
    const after = screen.getByRole('button', { name: /Shopping.*Show the map/ });
    expect(within(after).getByText('Covered', { exact: true })).toBeDefined();
    expect(within(after).queryByText('Not started', { exact: true })).toBeNull();
  });

  it('shows the retention split — held versus due today — on the mastery node', async () => {
    // Three studied Shopping cards, two of them due: the weak read is caused
    // by the due cards, and the mastery node must show that split plainly.
    localStorage.clear();
    seed([
      card('s1', 'shopping', 4, { ease: 2.5, intervalDays: 21, due: '2099-01-10', lastReviewedAt: '2098-12-01T10:00:00Z' }),
      card('s2', 'shopping', 2, { ease: 2.0, intervalDays: 2, due: DAY, lastReviewedAt: '2026-07-20T10:00:00Z' }),
      card('s3', 'shopping', 1, { due: DAY, lastReviewedAt: '2026-07-20T10:00:00Z' }),
    ]);
    renderSection();
    expect(screen.getByText('In progress')).toBeDefined(); // 0.49 → not covered
    fireEvent.click(screen.getByRole('button', { name: /Shopping.*Show the map/ }));
    // The node reads the reason without a hover: 1 of the 3 studied cards is
    // held, 2 are due today — exactly why the band is not Covered.
    expect(screen.getByText('1 of 3 held · 2 due today', { exact: true })).toBeDefined();
    expect(screen.getByTitle(/retention 33% \(1 of 3 held · 2 due today\) · confidence 86% · 7 graded/)).toBeDefined();
  });

  it('a card whose last review was Again reads as an open mistake on the chain', async () => {
    // One Shopping card, lapsed and still failing: its last review was rated
    // Again, so the topic's mistake level must read "1 open" — the deck's own
    // schedule is the evidence, no invented marks needed.
    localStorage.clear();
    seed([card('s1', 'shopping', 3, {
      ease: 1.7, intervalDays: 0, due: DAY, lapses: 2,
      lastRating: 'again', lastReviewedAt: '2026-07-20T10:00:00Z',
    })]);
    renderSection();
    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Shopping.*Show the map/ }));
    // The chain's mistake level shows the open miss; the flashcard hint names
    // the same state (lapsed and due) so the two levels tell one story.
    expect(screen.getByText('1 open', { exact: true })).toBeDefined();
    expect(screen.getByTitle(/1 due now · 1 lapsed/)).toBeDefined();
  });

  it('a topic whose card keeps lapsing reads its drag in the mastery hint', () => {
    // A not-due card that has lapsed 3 times in 5 reviews: retention is full
    // (nothing is due) yet mastery is dragged to 40% — the band must read as
    // in-progress and the node must name the lapse history as the cause.
    localStorage.clear();
    seed([card('s1', 'shopping', 5, {
      ease: 2.5, intervalDays: 21, due: '2099-01-10', lapses: 3,
      lastReviewedAt: '2098-12-01T10:00:00Z',
    })]);
    renderSection();

    expect(screen.getByText('In progress')).toBeDefined();
    expect(screen.queryByText('Covered')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Shopping.*Show the map/ }));
    // The dragged band is visible as the split: not due, yet nothing held —
    // the lapse history, not retention, is what reads weak here.
    expect(screen.getByText('1 of 1 held', { exact: true })).toBeDefined();
    expect(screen.getByTitle(/lapse history drags 40% of it · retention 100% \(1 of 1 held\) · confidence 100% · 5 graded/)).toBeDefined();
  });
});

describe('reviewing a topic from the map', () => {
  beforeEach(() => {
    localStorage.clear();
    // Three kitchen topics: Shopping and Cooking each have a due card today
    // (the review action exists and can focus the queue), Pantry has none due
    // (its expanded row must offer no review — nothing honest to do). The
    // mastered Shopping card is the map's covered band; the due ones are what
    // the action should lead into.
    seed([
      card('s1', 'shopping', 4, { ease: 2.5, intervalDays: 21, due: '2099-01-10', lastReviewedAt: '2098-12-01T10:00:00Z' }),
      card('s2', 'shopping', 0),
      card('c1', 'cooking', 0),
      card('p1', 'pantry', 0, { due: '2099-01-10' }), // not due — no action
    ]);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('expanding a topic with due cards offers Review, which focuses the queue on that topic', async () => {
    renderQueueAndMap();
    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();

    // The queue bar above groups the due cards into two reviewable topics.
    const bar = screen.getByLabelText('Review one topic at a time');
    expect(within(bar).getByText('Shopping · 1')).toBeDefined();
    expect(within(bar).getByText('Cooking · 1')).toBeDefined();

    // The action's count mirrors the queue, not the map's studied-only chain:
    // Shopping and Cooking each hold one due card (the mastered Shopping card
    // is not due), so both offer the review. Pantry has nothing due, so its
    // expanded map offers no review — nothing honest to do.
    const shoppingRow = screen.getByRole('button', { name: /Shopping.*Show the map/ });
    const cookingRow = screen.getByRole('button', { name: /Cooking.*Show the map/ });
    const pantryRow = screen.getByRole('button', { name: /Pantry.*Show the map/ });
    fireEvent.click(shoppingRow);
    fireEvent.click(cookingRow);
    fireEvent.click(pantryRow);
    const reviewButtons = screen.getAllByRole('button', { name: 'Review this topic — 1 due' });
    expect(reviewButtons).toHaveLength(2);
    // Pantry's expanded row offers nothing — no due cards means no review.
    expect(within(pantryRow.parentElement).queryByRole('button', { name: /Review this topic/ })).toBeNull();

    // The map's review asks the queue (rendered above) to focus Cooking: its
    // chip presses, its card shows, and Shopping's due card is set aside.
    const cookingReview = within(cookingRow.parentElement).getByRole('button', { name: 'Review this topic — 1 due' });
    fireEvent.click(cookingReview);
    expect(within(bar).getByRole('button', { name: 'Cooking · 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/cooking front c1/)).toBeDefined();
    expect(screen.queryByText(/shopping front s2/)).toBeNull();
    expect(screen.getByText('1 to review')).toBeDefined();
  });

  it('a focused session from the map rates through every due card of that topic, then returns to All', async () => {
    // Shopping owes two due cards, Cooking one: a review started from the
    // map's Shopping action must work through both Shopping cards in queue
    // order, never leak Cooking in, and hand back to the full queue (with
    // Cooking's card waiting) once the focused topic is exhausted.
    localStorage.clear();
    seed([
      card('s1', 'shopping', 0, { due: DAY }),
      card('s2', 'shopping', 0, { due: DAY }),
      card('c1', 'cooking', 0, { due: DAY }),
    ]);
    renderQueueAndMap();
    expect(screen.getByText('Kitchen knowledge map')).toBeDefined();

    const bar = screen.getByLabelText('Review one topic at a time');
    expect(within(bar).getByText('Shopping · 2')).toBeDefined();
    expect(within(bar).getByText('Cooking · 1')).toBeDefined();

    // Start the session from the map's Shopping action — the queue focuses
    // on Shopping and the first of its due cards surfaces (soonest by id).
    const shoppingRow = screen.getByRole('button', { name: /Shopping.*Show the map/ });
    fireEvent.click(shoppingRow);
    fireEvent.click(within(shoppingRow.parentElement).getByRole('button', { name: 'Review this topic — 2 due' }));
    expect(screen.getByRole('button', { name: 'Shopping · 2' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('2 to review')).toBeDefined();

    // Rate the first Shopping card: the second stays inside the topic.
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));
    expect(screen.getByText('1 to review')).toBeDefined();
    expect(screen.queryByText(/cooking front c1/)).toBeNull();

    // Rate the last Shopping card: Shopping's debt is paid, so the focused
    // session ends and the queue returns to All — Cooking's due card is what
    // the full queue holds next. (The topic bar re-queries fresh: with one
    // group left it stops offering per-topic chips, so an old node reference
    // would lie about the session's state.)
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rate Good — knew it' }));
    expect(screen.getByText(/cooking front c1/)).toBeDefined();
    expect(screen.queryByText(/shopping front s2/)).toBeNull();
    expect(screen.getByText('1 to review')).toBeDefined();
    // All is the whole queue again — no topic chip is pressed, and with only
    // Cooking still due there is no second group to filter to.
    expect(screen.queryByLabelText('Review one topic at a time')).toBeNull();
  });
});
