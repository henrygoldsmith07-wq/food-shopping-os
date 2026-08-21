/**
 * The game layer, counted rather than stored.
 *
 * XP, levels, streaks, daily goals, weekly challenges, missions and
 * achievements are all derived from the same records as everything else: the
 * diary, the cook history, recorded shops, the plan and the pantry. Nothing
 * here can be earned by tapping a button, and deleting something takes its XP
 * with it — which is the point.
 */

import { RECIPES, byId } from '../data/recipes.js';
import {
  ACCENT_UNLOCKS, DAILY_GOALS, LEVEL_TITLES, MISSIONS, SEASONAL_EVENTS, WEEKLY_CHALLENGES,
  XP_AWARDS, XP_PER_LEVEL, eventForMonth,
} from '../data/quests.js';
import { addDays, budgetWeeks, dayStamp, spentInWeek, weekDates, weekStart } from './kitchen.js';
import { dayTotals } from './nutrition.js';
import { seasonScore, monthOf } from '../data/seasons.js';
import { isUnderEighteen } from './youth.js';

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Under 18 the game layer stops rewarding exact calorie adherence: no XP for
 * landing inside a target, no "days on target" streak, and the challenge that
 * counts them drops out of the rotation. Everything else — cooking, logging,
 * planning, shopping — still counts, because none of it is about a number.
 */
const scoresAdherence = (state) => !isUnderEighteen(state);

const challengePool = (state) =>
  (scoresAdherence(state)
    ? WEEKLY_CHALLENGES
    : WEEKLY_CHALLENGES.filter((challenge) => challenge.metric !== 'onTargetDaysThisWeek'));

/* ---------- Streaks ---------- */

/** The longest run of consecutive days in a set of dates. */
export const longestRun = (dates = []) => {
  const set = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const date of set) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > best) best = run;
  }
  return best;
};

/** A run ending today, or yesterday — an evening cook still counts tomorrow. */
export const runEndingNow = (dates = [], today = dayStamp()) => {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let run = 0;
  while (set.has(cursor)) {
    run += 1;
    cursor = addDays(cursor, -1);
  }
  return run;
};

/** Every streak the app can honestly claim, each with its best ever. */
export const streaks = (state, today = dayStamp()) => {
  const loggedDates = Object.keys(state.log || {}).filter((d) => (state.log[d] || []).length);
  const cookedDates = (state.cooked || []).map((c) => c.date);
  const target = state.targets?.kcal || 0;
  const onTargetDates = loggedDates.filter((d) => {
    const kcal = dayTotals(state.log[d]).kcal;
    return target && kcal > 0 && Math.abs(kcal - target) <= target * 0.1;
  });
  const build = (dates, label, detail) => ({
    label,
    detail,
    days: runEndingNow(dates, today),
    best: longestRun(dates),
    total: new Set(dates).size,
  });
  return {
    logging: build(loggedDates, 'Diary', 'days in a row with something logged'),
    cooking: build(cookedDates, 'Cooking', 'days in a row you cooked'),
    onTarget: scoresAdherence(state)
      ? build(onTargetDates, 'On target', 'days inside your calorie target')
      : null,
  };
};

/* ---------- XP and levels ---------- */

const countEntries = (log = {}) => Object.values(log).reduce((n, day) => n + day.length, 0);
const countPlanned = (plan = {}) => Object.values(plan).reduce((n, day) => n + Object.keys(day).length, 0);

/**
 * Where your XP came from — the counts are real, so the total is too. Nothing
 * is banked: undo something and its XP goes with it.
 */
export const xpBreakdown = (state, today = dayStamp()) => {
  const onTarget = streaks(state, today).onTarget?.total || 0;
  const done = completedIds(state, today);
  const rows = [
    { key: 'entry', label: 'Foods logged', count: countEntries(state.log) },
    { key: 'cooked', label: 'Recipes cooked', count: (state.cooked || []).length },
    { key: 'shop', label: 'Shops recorded', count: (state.shops || []).length },
    { key: 'recipe', label: 'Recipes of your own', count: (state.myRecipes || []).length },
    { key: 'planned', label: 'Meals planned', count: countPlanned(state.plan) },
    { key: 'onTargetDay', label: 'Days on target', count: onTarget },
    { key: 'challenge', label: 'Challenges completed', count: done.challenges },
    { key: 'mission', label: 'Missions completed', count: done.missions },
  ];
  return rows
    .map((row) => ({ ...row, each: XP_AWARDS[row.key], xp: row.count * XP_AWARDS[row.key] }))
    .filter((row) => row.count > 0);
};

export const xpFrom = (state, today = dayStamp()) =>
  xpBreakdown(state, today).reduce((sum, row) => sum + row.xp, 0);

export const levelTitle = (level) =>
  [...LEVEL_TITLES].reverse().find(([from]) => level >= from)?.[1] || LEVEL_TITLES[0][1];

/** Level, its name, and how far into it you are. */
export const levelInfo = (xp = 0) => {
  const total = Math.max(0, Math.round(xp));
  const level = Math.floor(total / XP_PER_LEVEL) + 1;
  const into = total % XP_PER_LEVEL;
  return {
    xp: total,
    level,
    title: levelTitle(level),
    into,
    need: XP_PER_LEVEL - into,
    pct: clampPct((into / XP_PER_LEVEL) * 100),
    nextTitle: levelTitle(level + 1) === levelTitle(level) ? null : levelTitle(level + 1),
  };
};

/** Accents you've unlocked: the original five, plus what your level has earned. */
export const unlockedAccents = (level = 1) => ACCENT_UNLOCKS.filter((a) => level >= a.level).map((a) => a.id);

/* ---------- The metrics quests are counted against ---------- */

const recipeOf = (id) => byId(id) || RECIPES.find((r) => r.id === id);
const isPlant = (r) => r?.tags?.some((t) => t === 'vegan' || t === 'vegetarian');

/**
 * Every named metric a goal, challenge or mission can be measured by. All of
 * them read the same records the rest of the app does.
 */
export const questMetrics = (state, today = dayStamp()) => {
  const log = state.log || {};
  const week = weekDates(today);
  const inWeek = (date) => week.includes(date);
  const cooked = state.cooked || [];
  const cookedThisWeek = cooked.filter((c) => inWeek(c.date));
  const cookedRecipes = cookedThisWeek.map((c) => recipeOf(c.recipeId)).filter(Boolean);
  const todayEntries = log[today] || [];
  const targets = state.targets || {};
  const month = monthOf(today);

  const loggedDaysThisWeek = week.filter((d) => (log[d] || []).length).length;
  const onTargetDaysThisWeek = week.filter((d) => {
    const kcal = dayTotals(log[d] || []).kcal;
    return targets.kcal && kcal > 0 && Math.abs(kcal - targets.kcal) <= targets.kcal * 0.1;
  }).length;
  const plannedDinners = week.filter((d) => (state.plan || {})[d]?.dinner).length;
  const before = cooked.filter((c) => !inWeek(c.date)).map((c) => c.recipeId);
  const pantryNames = (state.pantry || []).map((p) => p.name.toLowerCase());

  return {
    /* today */
    mealsLoggedToday: new Set(todayEntries.map((e) => e.meal).filter(Boolean)).size,
    proteinPctToday: targets.protein ? clampPct((dayTotals(todayEntries).protein / targets.protein) * 100) : 0,
    waterToday: Math.round(state.water || 0),
    cookedToday: cooked.filter((c) => c.date === today).length,
    plannedTomorrow: Object.keys((state.plan || {})[addDays(today, 1)] || {}).length,

    /* this week */
    cookedThisWeek: cookedThisWeek.length,
    plantMealsThisWeek: cookedRecipes.filter(isPlant).length,
    loggedDaysThisWeek,
    onTargetDaysThisWeek,
    plannedDinnersThisWeek: plannedDinners,
    underBudgetThisWeek: state.weeklyBudget > 0
      && spentInWeek(state.shops || [], today) > 0
      && spentInWeek(state.shops || [], today) <= state.weeklyBudget ? 1 : 0,
    zeroWasteThisWeek: (state.waste || []).some((w) => inWeek(w.date)) ? 0 : 1,
    newDishesThisWeek: cookedThisWeek.filter((c) => !before.includes(c.recipeId)).length,
    seasonalMealsThisWeek: cookedRecipes.filter((r) => seasonScore(r, month) > 0).length,
    batchMealsThisWeek: cookedRecipes.filter((r) => (r.servings || 1) > 2).length,
    pantryMealsThisWeek: cookedRecipes.filter((r) =>
      r.ingredients.every((i) => pantryNames.some((n) => n.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(n)))).length,

    /* all time */
    recipesCooked: cooked.length,
    loggedDays: Object.keys(log).filter((d) => log[d].length).length,
    cuisines: new Set(cooked.map((c) => recipeOf(c.recipeId)?.cuisine).filter(Boolean)).size,
    budgetWeeks: budgetWeeks(state.shops || [], state.weeklyBudget || 0, today),
    ownRecipes: (state.myRecipes || []).length,
    bestCookStreak: longestRun(cooked.map((c) => c.date)),
  };
};

const withProgress = (quest, metrics) => {
  const progress = Math.min(metrics[quest.metric] ?? 0, quest.of);
  return { ...quest, progress, done: progress >= quest.of, pct: clampPct((progress / quest.of) * 100) };
};

/* ---------- What's on today, this week, and long term ---------- */

export const dailyGoals = (state, today = dayStamp()) => {
  const metrics = questMetrics(state, today);
  return DAILY_GOALS.map((goal) => withProgress(goal, metrics));
};

/**
 * Which week it is, counted from the Monday it starts on — so every day of a
 * week returns the same number and the challenges don't change on Wednesday.
 */
export const weekIndex = (today = dayStamp()) => {
  const monday = weekStart(today);
  const epoch = new Date('2026-01-05T12:00:00'); // a Monday
  return Math.round((new Date(`${monday}T12:00:00`) - epoch) / (7 * 86400000));
};

/**
 * Three challenges a week, picked by the week itself so they don't reshuffle,
 * plus whatever the season is running.
 */
export const weeklyChallenges = (state, today = dayStamp()) => {
  const metrics = questMetrics(state, today);
  const pool = challengePool(state);
  const start = (weekIndex(today) * 3) % pool.length;
  const picked = Array.from({ length: 3 }, (_, i) => pool[(start + i) % pool.length]);
  const event = eventForMonth(monthOf(today));
  const all = event ? [...picked, event.challenge] : picked;
  return all.map((quest) => withProgress(quest, metrics));
};

export const missions = (state, today = dayStamp()) => {
  const metrics = questMetrics(state, today);
  return MISSIONS.map((mission) => withProgress(mission, metrics))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.pct - a.pct);
};

/** The seasonal event running right now, if any. */
export const seasonalEvent = (state, today = dayStamp()) => {
  const event = eventForMonth(monthOf(today));
  if (!event) return null;
  return { ...event, challenge: withProgress(event.challenge, questMetrics(state, today)) };
};

const completedIds = (state, today = dayStamp()) => ({
  challenges: weeklyChallengesRaw(state, today).filter((c) => c.done).length,
  missions: missions(state, today).filter((m) => m.done).length,
});

/** Challenge progress without the XP loop reading back into itself. */
function weeklyChallengesRaw(state, today) {
  const metrics = questMetrics(state, today);
  const pool = challengePool(state);
  const start = (weekIndex(today) * 3) % pool.length;
  return Array.from({ length: 3 }, (_, i) => withProgress(pool[(start + i) % pool.length], metrics));
}

/* ---------- Achievements: the dated firsts and bests ---------- */

/**
 * Not badges — the things that actually happened, with the date they happened
 * on. Anything that hasn't happened simply isn't in the list.
 */
export const achievements = (state, today = dayStamp()) => {
  const out = [];
  const cooked = [...(state.cooked || [])].sort((a, b) => a.date.localeCompare(b.date));
  const shops = [...(state.shops || [])].sort((a, b) => a.date.localeCompare(b.date));
  const loggedDates = Object.keys(state.log || {}).filter((d) => (state.log[d] || []).length).sort();
  const s = streaks(state, today);

  if (cooked.length) {
    const first = recipeOf(cooked[0].recipeId);
    out.push({ id: 'first-cook', label: 'First thing cooked', detail: first?.name || 'a recipe', date: cooked[0].date });
  }
  if (loggedDates.length) {
    out.push({ id: 'first-log', label: 'First day logged', detail: `${loggedDates.length} days since`, date: loggedDates[0] });
  }
  if (shops.length) {
    const biggest = [...shops].sort((a, b) => b.total - a.total)[0];
    out.push({ id: 'first-shop', label: 'First shop recorded', detail: shops[0].store, date: shops[0].date });
    if (shops.length > 1) {
      out.push({ id: 'biggest-shop', label: 'Biggest shop', detail: `${biggest.store} · £${biggest.total.toFixed(2)}`, date: biggest.date });
    }
  }
  if (s.cooking.best > 1) {
    out.push({ id: 'best-cook-streak', label: 'Longest cooking streak', detail: `${s.cooking.best} days`, date: null });
  }
  if (s.logging.best > 1) {
    out.push({ id: 'best-log-streak', label: 'Longest diary streak', detail: `${s.logging.best} days`, date: null });
  }
  if ((state.myRecipes || []).length) {
    out.push({ id: 'own-recipe', label: 'First recipe of your own', detail: state.myRecipes[0].name, date: state.myRecipes[0].savedAt || null });
  }
  return out;
};

/** Everything the game layer knows, in one object for the store. */
export const progressSummary = (state, today = dayStamp()) => {
  const xp = xpFrom(state, today);
  const level = levelInfo(xp);
  return {
    xp,
    level,
    breakdown: xpBreakdown(state, today),
    streaks: streaks(state, today),
    daily: dailyGoals(state, today),
    weekly: weeklyChallenges(state, today),
    missions: missions(state, today),
    event: seasonalEvent(state, today),
    achievements: achievements(state, today),
    accents: unlockedAccents(level.level),
  };
};

export { SEASONAL_EVENTS };
