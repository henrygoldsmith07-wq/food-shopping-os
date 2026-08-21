import { describe, expect, it } from 'vitest';
import { guidanceFor } from '../src/lib/guidance.js';

const base = {
  day: '2026-07-28',
  entryGoal: 'plan',
  dismissedSetupSteps: [],
  targets: { kcal: 2200 },
  targetMode: 'custom',
  log: {},
  entries: [],
  pantry: [],
  plan: {},
  shops: [],
  cooked: [],
  shoppingList: [],
  remindersDue: [],
  proteinToday: 0,
  proteinGoal: 140,
};

describe('guidance ranking', () => {
  it('puts time-sensitive pantry waste ahead of setup', () => {
    const items = guidanceFor({
      ...base,
      pantry: [{ id: 'p1', name: 'Spinach', expiry: '2026-07-29' }],
    });
    expect(items[0]).toMatchObject({ id: 'expiry', title: 'Use spinach next' });
  });

  it('puts due reminders first', () => {
    const items = guidanceFor({
      ...base,
      remindersDue: [{ id: 'r1' }],
      pantry: [{ id: 'p1', name: 'Spinach', expiry: '2026-07-29' }],
    });
    expect(items[0].id).toBe('reminders');
  });

  it('attaches the sample size before offering a review', () => {
    const log = Object.fromEntries(['2026-07-26', '2026-07-27', '2026-07-28'].map((day) => [day, [{ id: day }]]));
    const review = guidanceFor({ ...base, log, entries: log['2026-07-28'] }).find((item) => item.id === 'review');
    expect(review.evidence).toBe('3 logged days');
  });

  it('does not repeat the same setup action in the queue', () => {
    const items = guidanceFor(base);
    expect(items.filter((item) => item.id === 'plan' || item.id === 'setup-plan')).toHaveLength(1);
  });
});
