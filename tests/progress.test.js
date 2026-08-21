import { describe, it, expect } from 'vitest';
import {
  achievements, dailyGoals, levelInfo, levelTitle, longestRun, missions, progressSummary,
  questMetrics, runEndingNow, seasonalEvent, streaks, unlockedAccents, weeklyChallenges, weekIndex,
  xpBreakdown, xpFrom,
} from '../src/lib/progress.js';
import { XP_AWARDS, XP_PER_LEVEL, eventForMonth, SEASONAL_EVENTS } from '../src/data/quests.js';
import { badgeProgress, kitchenStats } from '../src/lib/kitchen.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';
import { addDays } from '../src/lib/kitchen.js';

const TODAY = '2026-07-28'; // a Tuesday
const entry = (meal, kcal = 500, protein = 30) => ({
  id: `${meal}-${kcal}`, meal, time: '12:00', grams: 100,
  per100: { kcal, protein, carbs: 0, fat: 0, fibre: 0 },
});

const state = (over = {}) => ({
  day: TODAY,
  log: {},
  cooked: [],
  shops: [],
  myRecipes: [],
  plan: {},
  pantry: [],
  waste: [],
  water: 0,
  weeklyBudget: 0,
  targets: { ...DEFAULT_TARGETS, kcal: 2000, protein: 120 },
  ...over,
});

describe('streaks', () => {
  it('measures the run you are on and the best you have had', () => {
    const dates = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-25', '2026-07-27', '2026-07-28'];
    expect(longestRun(dates)).toBe(3);
    expect(runEndingNow(dates, TODAY)).toBe(2);
    expect(runEndingNow(dates, '2026-07-30')).toBe(0); // the run has been broken
    expect(longestRun([])).toBe(0);
    expect(runEndingNow(['2026-07-27'], TODAY)).toBe(1); // yesterday still counts
  });

  it('reads a diary, a cook history and days on target', () => {
    const s = state({
      log: { '2026-07-27': [entry('lunch', 2000)], [TODAY]: [entry('lunch', 2000)] },
      cooked: [{ recipeId: 'chickpea-curry', date: TODAY }],
    });
    const out = streaks(s, TODAY);
    expect(out.logging.days).toBe(2);
    expect(out.cooking.days).toBe(1);
    expect(out.onTarget.days).toBe(2); // both days land on 2,000 kcal
    expect(out.onTarget.total).toBe(2);
  });

  it('has nothing to claim for an empty app', () => {
    const out = streaks(state(), TODAY);
    expect(out.logging).toMatchObject({ days: 0, best: 0, total: 0 });
    expect(out.cooking.days).toBe(0);
  });
});

describe('XP and levels', () => {
  it('is counted from what you did, not banked', () => {
    const s = state({
      log: { [TODAY]: [entry('breakfast'), entry('lunch')] },
      cooked: [{ recipeId: 'chickpea-curry', date: TODAY }],
      shops: [{ id: 's1', date: TODAY, store: 'Aldi', total: 20, items: [] }],
      myRecipes: [{ id: 'mine-1', name: 'Mine' }],
      plan: { [TODAY]: { dinner: 'chickpea-curry' } },
    });
    const rows = xpBreakdown(s, TODAY);
    expect(rows.find((r) => r.key === 'entry')).toMatchObject({ count: 2, xp: 2 * XP_AWARDS.entry });
    expect(rows.find((r) => r.key === 'cooked').xp).toBe(XP_AWARDS.cooked);
    expect(rows.find((r) => r.key === 'shop').xp).toBe(XP_AWARDS.shop);
    expect(rows.find((r) => r.key === 'planned').xp).toBe(XP_AWARDS.planned);
    expect(xpFrom(s, TODAY)).toBe(rows.reduce((n, r) => n + r.xp, 0));

    // Take the cook back out and its XP goes with it.
    const undone = xpFrom({ ...s, cooked: [] }, TODAY);
    expect(undone).toBe(xpFrom(s, TODAY) - XP_AWARDS.cooked);
  });

  it('shows nothing at all before you have done anything', () => {
    expect(xpBreakdown(state(), TODAY)).toEqual([]);
    expect(xpFrom(state(), TODAY)).toBe(0);
  });

  it('names the level you reached', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, need: XP_PER_LEVEL, pct: 0 });
    expect(levelInfo(XP_PER_LEVEL).level).toBe(2);
    expect(levelInfo(XP_PER_LEVEL * 5 + 80)).toMatchObject({ level: 6, into: 80, pct: 50 });
    expect(levelTitle(1)).toBe('Getting started');
    expect(levelTitle(21)).toBe('Master chef');
    expect(levelTitle(99)).toBe('Legend of the larder');
  });

  it('unlocks accents by level without taking any away', () => {
    expect(unlockedAccents(1)).toEqual([]);
    expect(unlockedAccents(4)).toEqual(['sage']);
    expect(unlockedAccents(12)).toEqual(['sage', 'clay', 'ink']);
  });
});

describe('what the quests are counted against', () => {
  const busy = state({
    log: {
      [TODAY]: [entry('breakfast', 400, 30), entry('lunch', 600, 40), entry('dinner', 1000, 50)],
      '2026-07-27': [entry('lunch', 2000, 120)],
    },
    cooked: [
      { recipeId: 'chickpea-curry', date: TODAY },
      { recipeId: 'chicken-traybake', date: '2026-07-27' },
      { recipeId: 'chickpea-curry', date: '2026-06-01' },
    ],
    plan: { [TODAY]: { dinner: 'chickpea-curry' }, '2026-07-29': { dinner: 'chickpea-curry', lunch: 'x' } },
    water: 8,
    waste: [],
  });

  it('counts today', () => {
    const m = questMetrics(busy, TODAY);
    expect(m.mealsLoggedToday).toBe(3);
    expect(m.proteinPctToday).toBe(100); // 120g of a 120g target
    expect(m.waterToday).toBe(8);
    expect(m.cookedToday).toBe(1);
    expect(m.plannedTomorrow).toBe(2);
  });

  it('counts the week', () => {
    const m = questMetrics(busy, TODAY);
    expect(m.cookedThisWeek).toBe(2); // June's cook is another week
    expect(m.plantMealsThisWeek).toBe(1); // the curry is vegan, the traybake isn't
    expect(m.loggedDaysThisWeek).toBe(2);
    expect(m.plannedDinnersThisWeek).toBe(2);
    expect(m.zeroWasteThisWeek).toBe(1);
    expect(m.newDishesThisWeek).toBe(1); // the curry was cooked before
  });

  it('counts a lifetime', () => {
    const m = questMetrics(busy, TODAY);
    expect(m.recipesCooked).toBe(3);
    expect(m.loggedDays).toBe(2);
    expect(m.cuisines).toBe(2);
    expect(m.bestCookStreak).toBe(2);
  });

  it('will not call an unrecorded week under budget', () => {
    expect(questMetrics(state({ weeklyBudget: 60 }), TODAY).underBudgetThisWeek).toBe(0);
    const spent = state({
      weeklyBudget: 60,
      shops: [{ id: 's', date: TODAY, store: 'Aldi', total: 40, items: [] }],
    });
    expect(questMetrics(spent, TODAY).underBudgetThisWeek).toBe(1);
    const over = { ...spent, shops: [{ ...spent.shops[0], total: 90 }] };
    expect(questMetrics(over, TODAY).underBudgetThisWeek).toBe(0);
  });
});

describe('goals, challenges and missions', () => {
  it('gives today five goals, all at zero on a fresh app', () => {
    const goals = dailyGoals(state(), TODAY);
    expect(goals).toHaveLength(5);
    expect(goals.every((g) => g.progress === 0 && !g.done)).toBe(true);
  });

  it('marks a goal done only when the count reaches it', () => {
    const s = state({ log: { [TODAY]: [entry('breakfast'), entry('lunch'), entry('dinner')] } });
    const meals = dailyGoals(s, TODAY).find((g) => g.id === 'log-meals');
    expect(meals).toMatchObject({ progress: 3, done: true, pct: 100 });
  });

  it('picks the same three challenges all week, plus the season', () => {
    const monday = weeklyChallenges(state(), '2026-07-27').map((c) => c.id);
    const friday = weeklyChallenges(state(), '2026-07-31').map((c) => c.id);
    expect(monday).toEqual(friday);
    expect(weekIndex('2026-07-27')).toBe(weekIndex('2026-07-31'));
    // Three weekly challenges plus July's seasonal one.
    expect(monday).toHaveLength(4);
    expect(monday).toContain(eventForMonth(7).challenge.id);
  });

  it('moves on to a different set next week', () => {
    const thisWeek = weeklyChallenges(state(), '2026-07-27').slice(0, 3).map((c) => c.id);
    const next = weeklyChallenges(state(), '2026-08-03').slice(0, 3).map((c) => c.id);
    expect(next).not.toEqual(thisWeek);
  });

  it('runs a seasonal event for every month of the year', () => {
    for (let m = 1; m <= 12; m += 1) expect(eventForMonth(m), `month ${m}`).toBeTruthy();
    expect(SEASONAL_EVENTS.every((e) => e.challenge.metric && e.challenge.of > 0)).toBe(true);
    expect(seasonalEvent(state(), TODAY).name).toBe('Summer of salads');
  });

  it('sorts missions by how close they are, finished ones last', () => {
    const s = state({ cooked: Array.from({ length: 25 }, (_, i) => ({ recipeId: 'chickpea-curry', date: addDays(TODAY, -i) })) });
    const list = missions(s, TODAY);
    expect(list.find((m) => m.id === 'cook-25').done).toBe(true);
    expect(list[list.length - 1].done).toBe(true); // done ones sink
    expect(list.every((m) => m.progress <= m.of)).toBe(true);
  });
});

describe('achievements', () => {
  it('records only what actually happened, with its date', () => {
    const s = state({
      cooked: [{ recipeId: 'chickpea-curry', date: '2026-07-20' }],
      shops: [
        { id: 's1', date: '2026-07-21', store: 'Aldi', total: 30, items: [] },
        { id: 's2', date: '2026-07-25', store: 'Tesco', total: 62.5, items: [] },
      ],
      log: { '2026-07-20': [entry('lunch')] },
    });
    const out = achievements(s, TODAY);
    expect(out.find((a) => a.id === 'first-cook')).toMatchObject({ detail: 'Coconut Chickpea Curry', date: '2026-07-20' });
    expect(out.find((a) => a.id === 'first-shop').detail).toBe('Aldi');
    expect(out.find((a) => a.id === 'biggest-shop').detail).toMatch(/Tesco · £62.50/);
    expect(achievements(state(), TODAY)).toEqual([]);
  });
});

describe('badges', () => {
  it('read the same counters the rest of the app does', () => {
    const s = state({
      plan: { [TODAY]: { dinner: 'a', lunch: 'b' } },
      myRecipes: [{ id: 'r1', name: 'One' }],
      log: { [TODAY]: [entry('lunch'), entry('dinner')] },
    });
    const stats = kitchenStats({ ...s, xp: xpFrom(s, TODAY) }, TODAY);
    expect(stats.plannedMeals).toBe(2);
    expect(stats.ownRecipes).toBe(1);
    expect(stats.entriesLogged).toBe(2);

    const badges = badgeProgress(stats);
    expect(badges.find((b) => b.id === 'planner')).toMatchObject({ progress: 2, of: 21, earned: false });
    expect(badges.every((b) => b.progress <= b.of)).toBe(true);
  });
});

describe('the whole summary', () => {
  it('hands the app one object with everything in it', () => {
    const summary = progressSummary(state(), TODAY);
    expect(summary.xp).toBe(0);
    expect(summary.level.level).toBe(1);
    expect(summary.daily).toHaveLength(5);
    expect(summary.weekly.length).toBeGreaterThanOrEqual(3);
    expect(summary.missions.length).toBeGreaterThan(0);
    expect(summary.achievements).toEqual([]);
    expect(summary.accents).toEqual([]);
    expect(summary.event.name).toBeTruthy();
  });
});
