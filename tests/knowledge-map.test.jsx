import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const card = (id, topicId, reps) => ({
  id, userId: 'local', subjectId: 'kitchen', topicId,
  front: `${topicId} front ${id}`, back: `${topicId} back ${id}`,
  origin: 'auto', reps, lapses: 0, ease: 2.5, intervalDays: reps ? 2 : 0, due: DAY,
  createdAt: '2026-07-26T00:00:00Z', lastReviewedAt: reps ? '2026-07-27T00:00:00Z' : null,
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
    // No mastery rows yet — every topic reads Not started.
    expect(screen.getAllByText('Not started')).toHaveLength(2);

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
