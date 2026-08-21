import { describe, expect, it } from 'vitest';
import { NOTIFICATION_PRESETS, REMINDER_KINDS } from '../src/data/reminders.js';
import { notificationPresets } from '../src/lib/reminder-suggest.js';
import { reminderContext } from '../src/lib/reminders.js';

const TODAY = '2026-07-28';

describe('notification presets', () => {
  it('covers every requested notification without duplicating the existing shopping and meal kinds', () => {
    expect(NOTIFICATION_PRESETS.map((preset) => preset.kind)).toEqual([
      'expiry', 'grocery', 'meal', 'budget', 'weeklyReport',
      'dailySummary', 'pantry', 'sale', 'restock',
    ]);
    const kinds = new Set(REMINDER_KINDS.map((kind) => kind.key));
    expect(NOTIFICATION_PRESETS.every((preset) => kinds.has(preset.kind))).toBe(true);
  });

  it('only offers presets that have not already been configured', () => {
    expect(notificationPresets([{ kind: 'expiry' }, { kind: 'meal' }]).map((preset) => preset.kind))
      .not.toContain('expiry');
    expect(notificationPresets([{ kind: 'expiry' }, { kind: 'meal' }]).map((preset) => preset.kind))
      .not.toContain('meal');
    expect(notificationPresets([])).toHaveLength(9);
  });
});

describe('notification context', () => {
  const state = {
    day: TODAY,
    pantry: [
      { name: 'Milk', expiry: '2026-07-29', low: true },
      { name: 'Pasta', expiry: null, low: true },
    ],
    shoppingList: [{ name: 'Bread' }],
    weeklyBudget: 80,
    monthlyBudget: 300,
    spentThisWeek: 62.5,
    spentThisMonth: 210,
    basket: { projected: 25, over: true },
    log: { [TODAY]: [{ name: 'Porridge' }] },
    plan: { [TODAY]: { dinner: 'r1' } },
    priceAlertStatus: [{ name: 'Coffee', target: 5, latest: 4.5, hit: true, store: 'Tesco' }],
    restock: [{ name: 'Rice', times: 3 }],
  };

  it('builds actionable expiry, pantry, budget and report summaries from saved records', () => {
    expect(reminderContext('expiry', state)).toMatch(/Milk.*tomorrow/);
    expect(reminderContext('pantry', state)).toMatch(/2 running low.*1 expiring this week/);
    expect(reminderContext('budget', state)).toMatch(/£62.50 of £80.00.*basket would take you over/);
    expect(reminderContext('dailySummary', state)).toMatch(/1 food entry.*1 meal planned.*1 list item/);
    expect(reminderContext('weeklyReport', state)).toMatch(/1 of 7 diary days logged.*£62.50 spent/);
  });

  it('labels sale evidence and restock predictions honestly', () => {
    expect(reminderContext('sale', state))
      .toBe('Coffee is £4.50 at Tesco, below your £5.00 target in recorded shops.');
    expect(reminderContext('restock', state)).toBe('1 repeat buy looks due: Rice.');
    expect(reminderContext('sale', { priceAlertStatus: [] })).toMatch(/No price targets saved/);
    expect(reminderContext('restock', { restock: [] })).toMatch(/No repeat buys look due/);
  });
});
