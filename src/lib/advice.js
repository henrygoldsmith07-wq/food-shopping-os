/**
 * Advice: the things the coach suggests you actually do.
 *
 * Each function returns findings with the evidence attached, and returns
 * nothing at all when the data doesn't support a suggestion. Foods come from
 * the bundled catalogue, dishes from the recipe book, swaps from the same
 * substitution table the recipe pages use — nothing is invented for the
 * occasion, and no claim is made about products the app has never seen.
 */

import { CATALOGUE, RESTAURANT_FOODS } from '../data/foods.js';
import { NUTRIENTS } from '../data/nutrients.js';
import { dayTotals, mealLabel } from './nutrition.js';
import { adherence, habitAnalysis, predictProgress, recentDays } from './coach.js';
import { dietConflicts } from './goals.js';
import { dayStamp } from './kitchen.js';
import { isUnderEighteen, YOUTH_COPY, YOUTH_SIGNPOST } from './youth.js';

const round = (n, dp = 0) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};

const perKcal = (food, key) => (food.per100?.kcal ? (food.per100[key] || 0) / food.per100.kcal : 0);

/* ---------- Meal feedback ---------- */

/**
 * What one meal did to the day. Facts first — its share of the day's calories
 * and protein — then at most one suggestion, and only where a number supports
 * it.
 */
export const mealFeedback = (entries = [], meal, { targets = {}, dayEntries = entries, youth = false } = {}) => {
  const mine = entries.filter((e) => e.meal === meal);
  if (!mine.length) return null;
  const totals = dayTotals(mine);
  const day = dayTotals(dayEntries);
  const kcalShare = targets.kcal ? Math.round((totals.kcal / targets.kcal) * 100) : 0;
  const proteinShare = targets.protein ? Math.round((totals.protein / targets.protein) * 100) : 0;
  const points = [
    `${Math.round(totals.kcal)} kcal — ${kcalShare}% of your day`,
    `${Math.round(totals.protein)}g protein — ${proteinShare}% of your target`,
  ];
  if (totals.fibre) points.push(`${round(totals.fibre, 1)}g fibre`);

  let suggestion = null;
  const proteinDensity = totals.kcal ? totals.protein / (totals.kcal / 100) : 0;
  if (proteinShare < 15 && kcalShare > 25) {
    suggestion = 'Plenty of calories, little protein — worth adding a protein source to this meal rather than a later snack.';
  } else if (proteinDensity >= 8) {
    suggestion = 'Protein-dense for its calories — this is the kind of meal that makes the day’s target easy.';
  } else if (!youth && targets.kcal && day.kcal > targets.kcal && meal !== 'snack') {
    // "Over by X" is the debt framing, so under 18 the meal is read on what it
    // contained rather than on what it did to a running balance.
    suggestion = `Today is already ${Math.round(day.kcal - targets.kcal)} kcal over — nothing to fix now, but worth knowing.`;
  } else if (youth && totals.fibre >= 5) {
    suggestion = 'A good amount of fibre in one meal — vegetables, fruit, beans and wholegrains are what move it.';
  }

  return { meal, label: mealLabel(meal), items: mine.length, totals, kcalShare, proteinShare, points, suggestion };
};

/* ---------- Healthier swaps ---------- */

const SWAP_RULES = [
  { key: 'protein', better: (a, b) => perKcal(b, 'protein') > perKcal(a, 'protein') * 1.3, why: 'more protein for the same calories' },
  { key: 'fibre', better: (a, b) => perKcal(b, 'fibre') > perKcal(a, 'fibre') * 1.5, why: 'more fibre' },
  { key: 'satFat', better: (a, b) => perKcal(b, 'satFat') < perKcal(a, 'satFat') * 0.6, why: 'less saturated fat' },
  { key: 'sugar', better: (a, b) => perKcal(b, 'sugar') < perKcal(a, 'sugar') * 0.6, why: 'less sugar' },
];

/**
 * Foods that do the same job as this one but read better on a nutrient you
 * care about. Candidates share a tag with the original, so a swap for crisps
 * is another snack rather than a lecture about broccoli.
 */
export const healthierSwaps = (food, { catalogue = CATALOGUE, diets = [], limit = 3 } = {}) => {
  if (!food?.per100) return [];
  const tags = new Set(food.tags || []);
  return catalogue
    .filter((f) => f.id !== food.id && f.per100 && !f.chain)
    .filter((f) => (tags.size ? (f.tags || []).some((t) => tags.has(t)) : true))
    .filter((f) => !dietConflicts(f, diets).length)
    .map((f) => {
      const wins = SWAP_RULES.filter((rule) => rule.better(food, f));
      if (!wins.length) return null;
      const kcalDiff = Math.round((f.per100.kcal || 0) - (food.per100.kcal || 0));
      return {
        food: f,
        why: wins.map((w) => w.why).join(' and '),
        kcalDiff,
        score: wins.length - (kcalDiff > 0 ? 0.5 : 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

/* ---------- Grocery recommendations ---------- */

const TRACKED_GAPS = ['protein', 'fibre', 'iron', 'calcium', 'potassium', 'vitC', 'vitD'];

/**
 * What to put in the trolley, from the nutrients your own week came up short
 * on — each suggestion names the shortfall it answers.
 */
export const groceryRecommendations = (state, { limit = 5, today = dayStamp() } = {}) => {
  const rows = recentDays(state.log, { days: 7, today }).filter((d) => d.logged);
  if (rows.length < 3) {
    return { ready: false, reason: `Three logged days in the last week gives me something to go on — you have ${rows.length}.`, items: [] };
  }
  const avg = Object.fromEntries(TRACKED_GAPS.map((key) => [
    key,
    rows.reduce((s, d) => s + (d.totals[key] || 0), 0) / rows.length,
  ]));
  const gaps = TRACKED_GAPS
    .map((key) => {
      const nutrient = NUTRIENTS.find((n) => n.key === key);
      const target = state.targets?.[key] ?? nutrient?.target;
      if (!target) return null;
      const share = avg[key] / target;
      return share < 0.75 ? { key, label: nutrient?.label || key, share: Math.round(share * 100) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.share - b.share);

  const items = [];
  const taken = new Set();
  for (const gap of gaps) {
    const best = CATALOGUE
      .filter((f) => !f.chain && f.per100?.[gap.key] && !taken.has(f.id))
      .filter((f) => !dietConflicts(f, state.diets).length)
      .sort((a, b) => perKcal(b, gap.key) - perKcal(a, gap.key))[0];
    if (!best) continue;
    taken.add(best.id);
    items.push({ food: best, gap, why: `you're averaging ${gap.share}% of your ${gap.label.toLowerCase()} target` });
    if (items.length >= limit) break;
  }
  return { ready: true, days: rows.length, gaps, items };
};

/* ---------- Macro adjustments ---------- */

/**
 * Whether your targets are worth changing — judged on whether you actually hit
 * them. A target you miss nine days out of ten is a target problem, not a
 * character problem, but it takes a week of data to say so.
 */
export const macroAdvice = (state, { today = dayStamp() } = {}) => {
  const stats = adherence(state.log, state.targets, { days: 14, today });
  if (stats.days < 7) {
    return { ready: false, reason: `A week of logged days makes this meaningful — you have ${stats.days}.`, changes: [] };
  }
  const changes = [];
  const t = state.targets || {};

  if (t.protein && stats.proteinHitPct <= 30 && stats.avgProtein > 0) {
    const suggestion = Math.round((stats.avgProtein + t.protein) / 2 / 5) * 5;
    if (suggestion < t.protein) {
      changes.push({
        key: 'protein',
        from: t.protein,
        to: suggestion,
        why: `you've hit ${t.protein}g on ${stats.proteinHit} of ${stats.days} logged days, averaging ${stats.avgProtein}g. A target you meet is worth more than one you don't.`,
      });
    }
  }
  if (t.kcal && stats.avgKcal && Math.abs(stats.avgKcal - t.kcal) > t.kcal * 0.15) {
    changes.push({
      key: 'kcal',
      from: t.kcal,
      to: Math.round((stats.avgKcal + t.kcal) / 2 / 10) * 10,
      why: `you're averaging ${stats.avgKcal.toLocaleString()} kcal against a ${t.kcal.toLocaleString()} target across ${stats.days} days — either the target or the habit has to move.`,
    });
  }
  return { ready: true, days: stats.days, stats, changes };
};

/* ---------- Eating out ---------- */

/**
 * Dishes from the bundled restaurant menus that fit what's left of your day
 * and the patterns you eat by. Only chains the app actually ships data for.
 */
export const restaurantPicks = (state, { limit = 4, today = dayStamp() } = {}) => {
  const totals = dayTotals(state.log?.[today] || []);
  const kcalLeft = Math.max(0, Math.round((state.targets?.kcal || 0) - totals.kcal));
  const proteinLeft = Math.max(0, Math.round((state.targets?.protein || 0) - totals.protein));
  const ceiling = kcalLeft || 800;

  const picks = RESTAURANT_FOODS
    .filter((f) => !dietConflicts(f, state.planDiets || state.diets || []).length)
    .map((f) => {
      const serving = f.servings?.[0]?.grams || 100;
      const kcal = Math.round(((f.per100.kcal || 0) * serving) / 100);
      const protein = Math.round(((f.per100.protein || 0) * serving) / 100);
      return { food: f, kcal, protein, fits: kcal <= ceiling };
    })
    .filter((p) => p.fits && p.kcal > 0)
    .sort((a, b) => b.protein / Math.max(1, b.kcal) - a.protein / Math.max(1, a.kcal))
    .slice(0, limit);

  return { kcalLeft, proteinLeft, picks, chains: [...new Set(picks.map((p) => p.food.chain))] };
};

/* ---------- Tips ---------- */

/**
 * Personalised tips, each one a reading of your own numbers with the evidence
 * printed next to it. No tip without a number behind it.
 */
/**
 * The under-18 reading of the same diary.
 *
 * Same evidence rule — no tip without a number behind it — but the things it
 * looks for are the ones NICE asks an age-appropriate approach to be about:
 * balanced meals, eating regularly through the day, and variety across the
 * week. Nothing here is about a deficit, a pace or a target hit rate, and the
 * signpost is always last so it reads as an offer rather than an alarm.
 */
export const youthTips = (state, { today = dayStamp(), limit = 4 } = {}) => {
  const habits = habitAnalysis(state.log, { today });
  const tips = [];

  if (habits.skipped.length) {
    const [first] = habits.skipped;
    tips.push({
      title: `${first.label} is rarely in the diary`,
      detail: 'Eating regularly through the day is the thing most worth getting right at your age — it keeps energy and concentration steady far better than making it up later.',
      evidence: `${first.label.toLowerCase()} logged on ${first.days} of ${habits.days} days`,
    });
  }
  if (habits.topFoods.length >= 3 && habits.entries >= 10) {
    const variety = new Set(habits.topFoods.map((food) => food.name)).size;
    tips.push({
      title: 'Variety is worth more than any single number here',
      detail: 'Different foods bring different vitamins and minerals, so a week with more kinds of food in it covers more ground than a week spent adjusting portions.',
      evidence: `${variety} foods repeat across ${habits.days} logged days`,
    });
  }
  if (habits.window && habits.window.hours >= 14) {
    tips.push({
      title: 'Your eating runs across a long day',
      detail: 'Meals spread out with something in between is fine. What is worth avoiding is a long gap and then most of the day at once.',
      evidence: `${habits.window.first} to ${habits.window.last} — a ${habits.window.hours} hour window`,
    });
  }
  tips.push({
    title: 'What a balanced plate looks like',
    detail: YOUTH_COPY.balance,
    evidence: `${habits.days} logged day${habits.days === 1 ? '' : 's'} behind this page`,
  });
  tips.push({
    title: 'If weight is on your mind',
    detail: YOUTH_SIGNPOST,
    evidence: 'the same advice whatever your diary says',
  });

  return tips.slice(0, limit);
};

export const personalTips = (state, { today = dayStamp(), limit = 4 } = {}) => {
  const habits = habitAnalysis(state.log, { today });
  const stats = adherence(state.log, state.targets, { days: 14, today });
  const progress = predictProgress(state, { today });
  const tips = [];

  if (isUnderEighteen(state) && habits.days) return youthTips(state, { today, limit });

  if (!habits.days) {
    return [{
      title: 'Log a couple of days and I’ll have something to say',
      detail: 'Every tip here is read off your own diary. With nothing in it, anything I said would be invented.',
      evidence: 'no logged days yet',
    }];
  }

  if (habits.snackShare >= 30) {
    tips.push({
      title: 'A third of your calories arrive between meals',
      detail: 'Not a problem in itself — but if the day runs over, snacks are where it happens, so that’s the cheapest place to look first.',
      evidence: `${habits.snackShare}% of calories from snacks across ${habits.days} days`,
    });
  }
  if (habits.skipped.length) {
    const [first] = habits.skipped;
    tips.push({
      title: `${first.label} rarely gets logged`,
      detail: 'Either you’re skipping it or it isn’t reaching the diary. Both are worth knowing, because everything else here reads off what’s recorded.',
      evidence: `${first.label.toLowerCase()} logged on ${first.days} of ${habits.days} days`,
    });
  }
  if (habits.weekendGap !== null && Math.abs(habits.weekendGap) >= 300) {
    tips.push({
      title: habits.weekendGap > 0 ? 'Weekends run heavier than weekdays' : 'Weekends run lighter than weekdays',
      detail: 'A weekly calorie budget absorbs this better than a daily one — the Goals panel can hold the week as one number.',
      evidence: `${Math.abs(habits.weekendGap)} kcal a day difference`,
    });
  }
  if (stats.days >= 5 && stats.proteinHitPct < 40) {
    tips.push({
      title: 'Protein is the target you miss most',
      detail: 'Front-loading it — a protein source at breakfast rather than a third of it at dinner — is usually what moves this.',
      evidence: `hit on ${stats.proteinHit} of ${stats.days} logged days`,
    });
  }
  if (progress.ready && !progress.onCourse) {
    tips.push({
      title: `Your pace is ${progress.direction}, which isn’t what the goal asks for`,
      detail: 'Either the intake or the goal needs to move; the numbers can’t do both.',
      evidence: `${progress.avgKcal.toLocaleString()} kcal a day against ${progress.maintenance.toLocaleString()} maintenance, over ${progress.days} days`,
    });
  }
  if (habits.consistency >= 80) {
    tips.push({
      title: 'Your logging is consistent enough to trust',
      detail: 'Which means the trends, the predictions and the target advice on this page are all worth something.',
      evidence: `logged ${habits.consistency}% of the last fortnight`,
    });
  }

  return tips.slice(0, limit);
};
