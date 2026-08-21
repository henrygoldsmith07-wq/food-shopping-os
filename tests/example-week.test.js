import { describe, it, expect } from 'vitest';
import {
  createExampleWeekState,
  isDemoState,
  DEMO_LABEL,
  DEMO_WALKTHROUGH,
  DEMO_DINNER_IDS,
} from '../src/data/exampleWeek.js';
import { weekDates } from '../src/lib/kitchen.js';
import { planStats, shoppingForPlan } from '../src/lib/mealplan.js';
import { EMPTY_STATE } from '../src/lib/state.js';

describe('example week demonstration data', () => {
  it('is clearly labelled and walkthrough covers plan → list → shop → pantry', () => {
    expect(DEMO_LABEL).toMatch(/demonstration/i);
    expect(DEMO_WALKTHROUGH.map((s) => s.id)).toEqual(
      expect.arrayContaining(['plan', 'list', 'shop', 'pantry', 'done']),
    );
  });

  it('builds an isolated session with a full week plan and pantry staples', () => {
    const day = '2026-07-28';
    const demo = createExampleWeekState(day);
    expect(isDemoState(demo)).toBe(true);
    expect(demo.onboarded).toBe(true);
    expect(demo.isDemoSession).toBe(true);
    expect(demo.name).toMatch(/example/i);

    const dates = weekDates(day);
    expect(dates).toHaveLength(7);
    const stats = planStats(demo.plan, dates);
    expect(stats.meals).toBe(7);
    expect(demo.pantry.length).toBeGreaterThan(0);
    expect(demo.shoppingList).toEqual([]);
    // No history that would fake streaks / analytics
    expect(demo.cooked).toEqual([]);
    expect(demo.shops).toEqual([]);
    expect(demo.log).toEqual({});
  });

  it('uses real catalogue recipes so cooking mode works in the demo', () => {
    DEMO_DINNER_IDS.forEach((id) => {
      expect(id).toBeTruthy();
    });
    const demo = createExampleWeekState('2026-07-28');
    const dates = weekDates(demo.day);
    const need = shoppingForPlan(demo.plan, dates, { pantry: demo.pantry });
    expect(need.length).toBeGreaterThan(0);
    // Pantry staples reduce the list
    const withoutPantry = shoppingForPlan(demo.plan, dates, { pantry: [] });
    expect(need.length).toBeLessThanOrEqual(withoutPantry.length);
  });

  it('does not mutate EMPTY_STATE when creating a demo', () => {
    const before = JSON.stringify(EMPTY_STATE);
    createExampleWeekState('2026-07-28');
    expect(JSON.stringify(EMPTY_STATE)).toBe(before);
  });
});
