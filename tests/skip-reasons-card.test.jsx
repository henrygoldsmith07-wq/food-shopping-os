import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import SkipReasonsCard from '../src/components/SkipReasonsCard.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const seed = (profile) => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  onboarded: true, name: 'Sam', skipReasonProfile: profile,
}));

const renderCard = () => render(
  <AppProvider>
    <SkipReasonsCard />
  </AppProvider>,
);

describe('the skip-reasons card on Learn', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('stays silent until the household has reflected on a skip reason', () => {
    seed({});
    renderCard();
    expect(screen.queryByText('The plan listens to what you said still applies')).toBeNull();
  });

  it('says what a confirmed reason makes the next plan do, in the plan’s own words', () => {
    seed({ 'no-time': { applies: 2, changed: 0, lastStillApplies: true, lastAt: 0 } });
    renderCard();
    expect(screen.getByText('No time')).toBeDefined();
    expect(screen.getByText('Confirmed — the next plan leans on quicker, 30-minute dishes.')).toBeDefined();
  });

  it('shows the one-away state honestly instead of promising the leaning already', () => {
    seed({ 'missing-ingredients': { applies: 1, changed: 0, lastStillApplies: true, lastAt: 0 } });
    renderCard();
    expect(screen.getByText(/One more “still applies” and the plan leans on dishes you can mostly make/)).toBeDefined();
    expect(screen.getByText('Nothing is confirmed yet — no plan is leaning on any of these.')).toBeDefined();
  });

  it('marks a reason the household said changed as shaping nothing', () => {
    seed({ 'not-in-the-mood': { applies: 1, changed: 3, lastStillApplies: false, lastAt: 0 } });
    renderCard();
    expect(screen.getByText('You said this no longer applies — it shapes nothing.')).toBeDefined();
  });

  it('offers a one-tap path to a reason that has due review questions', () => {
    seed({ 'no-time': { applies: 2, changed: 0, lastStillApplies: true, lastAt: 0 } });
    // A due missed-meal card carrying that reason — origin 'seed', so the
    // boot refresh for kitchen-generated cards leaves it alone.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true, name: 'Sam', day: '2026-07-28',
      skipReasonProfile: { 'no-time': { applies: 2, changed: 0, lastStillApplies: true, lastAt: 0 } },
      cards: [{
        id: 's1', userId: 'local', subjectId: 'kitchen', topicId: 'cooking',
        front: 'Which planned meal did you skip this week?', back: 'Pasta — 2026-07-27',
        origin: 'seed', skippedReason: 'no-time',
        reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: '2026-07-27',
        createdAt: '2026-07-27T00:00:00Z', lastReviewedAt: null,
      }],
    }));
    const onReviewReason = vi.fn();
    render(
      <AppProvider>
        <SkipReasonsCard onReviewReason={onReviewReason} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByLabelText('Review 1 No time question'));
    expect(onReviewReason).toHaveBeenCalledWith('no-time');
  });

  it('a reason with nothing due stays a plain row — no dead tap target', () => {
    seed({ 'no-time': { applies: 2, changed: 0, lastStillApplies: true, lastAt: 0 } });
    const onReviewReason = vi.fn();
    render(
      <AppProvider>
        <SkipReasonsCard onReviewReason={onReviewReason} />
      </AppProvider>,
    );
    expect(screen.queryByLabelText(/Review \d+ No time question/)).toBeNull();
    expect(screen.queryByText(/Review \d+ question/)).toBeNull();
    expect(screen.getByText('No time')).toBeDefined();
  });
});
