import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import KnowledgeMapSection from '../src/components/KnowledgeMapSection.jsx';

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

  it('renders the map from the seeded deck on the Learn tab', async () => {
    render(<App />);
    // Returning users land on the list; Learn is a lazy tab.
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Learn'));
    await screen.findByText('Kitchen knowledge map');

    // The subject header and both kitchen topics arrive from the deck.
    expect(screen.getByText('Your kitchen')).toBeDefined();
    expect(screen.getByText(/2 topics · 0 spec statements/)).toBeDefined();
    // Shopping earned a schedule-backed band; Cooking never reviewed stays out.
    expect(screen.getByText('Covered')).toBeDefined();
    expect(screen.getAllByText('Not started')).toHaveLength(1);

    // Expand Shopping: the map walks its chain from real scheduling state.
    fireEvent.click(screen.getByRole('button', { name: /Shopping.*Show the map/ }));
    expect(screen.getByText('1/2 studied')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    // The mastery hint lives on the node chip as its title tooltip.
    expect(screen.getByTitle(/· 4 graded/)).toBeDefined();
    // The curriculum-only levels say what is missing, never imply it exists.
    expect(screen.getByText(/No spec statements mapped for this topic yet/)).toBeDefined();
  });
});
