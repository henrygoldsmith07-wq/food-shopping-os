import { describe, it, expect } from 'vitest';
import {
  adherence, dailySummary, habitAnalysis, loggedDays, predictProgress, recentDays, trend,
} from '../src/lib/coach.js';
import {
  groceryRecommendations, healthierSwaps, macroAdvice, mealFeedback, personalTips, restaurantPicks,
} from '../src/lib/advice.js';
import { parseLabel, labelToDraft, saltToSodium, basisOf } from '../src/lib/label.js';
import { CATALOGUE } from '../src/data/foods.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';
import { addDays } from '../src/lib/kitchen.js';

const TODAY = '2026-07-28';

const entry = (name, meal, kcal, protein, extra = {}) => ({
  id: `${name}-${meal}-${kcal}`,
  name,
  meal,
  time: extra.time || '12:30',
  grams: 100,
  per100: { kcal, protein, carbs: 0, fat: 0, fibre: extra.fibre || 0 },
  ...extra,
});

/** `days` days of identical eating, ending today. */
const logOf = (days, entries, from = TODAY) =>
  Object.fromEntries(Array.from({ length: days }, (_, i) => [addDays(from, -i), entries]));

const DAY = [
  entry('Porridge', 'breakfast', 300, 10, { time: '08:00' }),
  entry('Chicken salad', 'lunch', 500, 40, { time: '13:00' }),
  entry('Pasta', 'dinner', 700, 25, { time: '19:30' }),
  entry('Crisps', 'snack', 300, 3, { time: '21:30' }),
];

const state = (over = {}) => ({
  day: TODAY,
  log: {},
  targets: { ...DEFAULT_TARGETS, kcal: 2000, protein: 130 },
  goal: 'lose',
  diets: [],
  planDiets: [],
  // No height or age, so maintenance is the figure typed in rather than a
  // Mifflin-St Jeor estimate — which keeps these expectations readable.
  body: { sex: 'female', weightKg: 70, activity: 'light' },
  maintenanceKcal: 2200,
  plan: {},
  ...over,
});

describe('reading the diary', () => {
  it('counts only days with something in them', () => {
    const log = { '2026-07-27': DAY, '2026-07-26': [], '2026-07-25': DAY };
    expect(loggedDays(log).map((d) => d.date)).toEqual(['2026-07-25', '2026-07-27']);
    expect(recentDays(log, { days: 4, today: TODAY }).filter((d) => d.logged)).toHaveLength(2);
    expect(recentDays(log, { days: 4, today: TODAY })).toHaveLength(4); // gaps are still days
  });

  it('measures adherence against the days you actually logged', () => {
    const log = logOf(6, DAY);
    const stats = adherence(log, { kcal: 1800, protein: 130 }, { days: 14, today: TODAY });
    expect(stats.days).toBe(6);
    expect(stats.avgKcal).toBe(1800);
    expect(stats.kcalHitPct).toBe(100); // 1800 is exactly the target
    expect(stats.proteinHit).toBe(0); // 78g of protein never reaches 130
    expect(adherence({}, { kcal: 1800 }, { today: TODAY }).days).toBe(0);
  });

  it('needs four days before it will call a trend', () => {
    expect(trend(logOf(3, DAY), 'kcal', { today: TODAY })).toBeNull();
    const rising = {
      ...logOf(3, DAY, addDays(TODAY, -3)),
      ...logOf(3, [...DAY, entry('Cake', 'snack', 600, 5)], TODAY),
    };
    const t = trend(rising, 'kcal', { days: 14, today: TODAY });
    expect(t.direction).toBe('up');
    expect(t.change).toBe(600);
    expect(t.days).toBe(6);
  });
});

describe('habits', () => {
  it('describes how the days actually look', () => {
    const h = habitAnalysis(logOf(7, DAY), { today: TODAY });
    expect(h.days).toBe(7);
    expect(h.perDay).toBe(4);
    expect(h.window).toMatchObject({ first: '08:00', last: '21:30', hours: 13.5 });
    expect(h.snackShare).toBe(17); // 300 of 1800 kcal
    expect(h.topFoods[0].times).toBe(7);
    expect(h.skipped).toEqual([]);
    expect(h.consistency).toBe(50); // 7 of the last 14 days
  });

  it('spots a meal that rarely reaches the diary', () => {
    const h = habitAnalysis(logOf(6, [DAY[1], DAY[2]]), { today: TODAY });
    expect(h.skipped.map((s) => s.key)).toEqual(['breakfast']);
    expect(h.skipped[0].days).toBe(0);
  });

  it('says nothing at all about an empty diary', () => {
    expect(habitAnalysis({}, { today: TODAY })).toEqual({ days: 0, entries: 0 });
  });
});

describe('progress', () => {
  it('refuses to predict from too little', () => {
    const p = predictProgress(state({ log: logOf(3, DAY) }), { today: TODAY });
    expect(p.ready).toBe(false);
    expect(p.reason).toMatch(/five logged days/i);
  });

  it('needs a maintenance figure', () => {
    const p = predictProgress(
      state({ log: logOf(7, DAY), maintenanceKcal: 0, body: { sex: 'unspecified' } }),
      { today: TODAY },
    );
    expect(p.ready).toBe(false);
    expect(p.reason).toMatch(/maintenance/i);
  });

  it('turns a deficit into a weekly pace, with its assumptions', () => {
    const p = predictProgress(state({ log: logOf(7, DAY) }), { today: TODAY });
    expect(p.ready).toBe(true);
    expect(p.avgKcal).toBe(1800);
    expect(p.maintenance).toBe(2200);
    expect(p.balance).toBe(-400);
    expect(p.perWeekKg).toBeCloseTo(-0.36, 2); // 400 × 7 ÷ 7700
    expect(p.direction).toBe('losing');
    expect(p.onCourse).toBe(true); // the goal is weight loss
    expect(p.caveat).toMatch(/assumes/i);
  });

  it('counts the weeks to a target weight when you have set one', () => {
    const p = predictProgress(
      state({ log: logOf(7, DAY), body: { sex: 'female', weightKg: 70, targetWeightKg: 66 } }),
      { today: TODAY },
    );
    expect(p.toTarget.gapKg).toBe(-4);
    expect(p.toTarget.weeks).toBe(11);
    expect(p.toTarget.date > TODAY).toBe(true);
  });

  it('knows when the pace is the wrong way round', () => {
    const big = [...DAY, entry('Second dinner', 'dinner', 900, 20)];
    const p = predictProgress(state({ log: logOf(7, big) }), { today: TODAY });
    expect(p.direction).toBe('gaining');
    expect(p.onCourse).toBe(false);
  });
});

describe('the day, read back', () => {
  it('adds up what landed and what is left', () => {
    const s = dailySummary(state({ log: { [TODAY]: DAY } }), { today: TODAY });
    expect(s.logged).toBe(4);
    expect(Math.round(s.totals.kcal)).toBe(1800);
    expect(s.left.kcal).toBe(200);
    expect(s.left.protein).toBe(52);
    expect(s.meals.map((m) => m.key)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });

  it('is honest about an empty day', () => {
    const s = dailySummary(state(), { today: TODAY });
    expect(s.logged).toBe(0);
    expect(s.complete).toBe(false);
  });
});

describe('meal feedback', () => {
  it('reports a meal as a share of the day and offers at most one thing', () => {
    const f = mealFeedback(DAY, 'lunch', { targets: { kcal: 2000, protein: 130 } });
    expect(f.label).toBe('Lunch');
    expect(f.kcalShare).toBe(25);
    expect(f.proteinShare).toBe(31);
    expect(f.points[0]).toMatch(/500 kcal/);
    expect(f.suggestion).toMatch(/protein-dense/i);
  });

  it('flags calories without protein', () => {
    const f = mealFeedback(DAY, 'snack', { targets: { kcal: 1000, protein: 130 } });
    expect(f.suggestion).toMatch(/little protein/i);
  });

  it('has nothing to say about a meal you didn’t eat', () => {
    expect(mealFeedback(DAY, 'brunch', { targets: {} })).toBeNull();
  });
});

describe('healthier swaps', () => {
  it('only offers a swap a number supports', () => {
    const crisps = CATALOGUE.find((f) => /crisps/i.test(f.name));
    const swaps = healthierSwaps(crisps, { catalogue: CATALOGUE });
    expect(swaps.length).toBeGreaterThan(0);
    for (const s of swaps) {
      expect(s.food.id).not.toBe(crisps.id);
      expect(s.why.length).toBeGreaterThan(3);
    }
  });

  it('respects the patterns you eat by, and gives up quietly', () => {
    const chicken = CATALOGUE.find((f) => /chicken breast/i.test(f.name));
    const vegan = healthierSwaps(chicken, { catalogue: CATALOGUE, diets: ['vegan'] });
    expect(vegan.every((s) => !/chicken|beef|salmon|egg|yogurt/i.test(s.food.name))).toBe(true);
    expect(healthierSwaps(null)).toEqual([]);
    expect(healthierSwaps({ name: 'Nothing', per100: null })).toEqual([]);
  });
});

describe('recommendations', () => {
  it('waits for three logged days before recommending groceries', () => {
    const out = groceryRecommendations(state({ log: logOf(2, DAY) }), { today: TODAY });
    expect(out.ready).toBe(false);
    expect(out.items).toEqual([]);
  });

  it('answers a real shortfall with a real food', () => {
    const out = groceryRecommendations(state({ log: logOf(5, DAY) }), { today: TODAY });
    expect(out.ready).toBe(true);
    expect(out.gaps.length).toBeGreaterThan(0);
    expect(out.items.length).toBeGreaterThan(0);
    for (const item of out.items) {
      expect(item.food.per100[item.gap.key]).toBeGreaterThan(0);
      expect(item.why).toMatch(/% of your/);
    }
  });

  it('suggests moving a target you never hit', () => {
    const advice = macroAdvice(state({ log: logOf(10, DAY) }), { today: TODAY });
    expect(advice.ready).toBe(true);
    const protein = advice.changes.find((c) => c.key === 'protein');
    expect(protein.from).toBe(130);
    expect(protein.to).toBeLessThan(130);
    expect(protein.why).toMatch(/logged days/);
  });

  it('leaves targets alone when they match the days', () => {
    const s = state({ log: logOf(10, DAY), targets: { ...DEFAULT_TARGETS, kcal: 1800, protein: 75 } });
    expect(macroAdvice(s, { today: TODAY }).changes).toEqual([]);
  });

  it('picks restaurant dishes that fit what is left, from menus it ships', () => {
    const out = restaurantPicks(state({ log: { [TODAY]: [DAY[0]] } }), { today: TODAY });
    expect(out.kcalLeft).toBe(1700);
    expect(out.picks.length).toBeGreaterThan(0);
    expect(out.picks.every((p) => p.kcal <= out.kcalLeft)).toBe(true);
    expect(out.chains.length).toBeGreaterThan(0);
  });
});

describe('tips', () => {
  it('says only what the numbers support', () => {
    const tips = personalTips(state({ log: logOf(10, DAY) }), { today: TODAY });
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) expect(tip.evidence).toBeTruthy();
  });

  it('admits when there is nothing to go on', () => {
    const [tip] = personalTips(state(), { today: TODAY });
    expect(tip.evidence).toMatch(/no logged days/i);
  });
});

describe('reading a nutrition label', () => {
  const PANEL = `Nutrition per 100g
Energy 1046kJ / 250kcal
Fat 12g
of which saturates 5.1g
Carbohydrate 30g
of which sugars 2.4g
Fibre 3.1g
Protein 8.5g
Salt 1.2g`;

  it('parses a UK panel, "of which" lines and all', () => {
    const { per100, ok, missing } = parseLabel(PANEL);
    expect(ok).toBe(true);
    expect(per100).toMatchObject({
      kcal: 250, fat: 12, satFat: 5.1, carbs: 30, sugar: 2.4, fibre: 3.1, protein: 8.5,
    });
    expect(per100.sodium).toBe(saltToSodium(1.2));
    expect(missing).toEqual([]);
  });

  it('scales a per-serving column back to 100 g, and says it did', () => {
    const { per100, basis } = parseLabel('Per 50g serving\nEnergy 100kcal\nProtein 5g\nFat 2g\nCarbohydrate 10g');
    expect(basis).toMatchObject({ grams: 50, unit: 'g', stated: true });
    expect(per100.kcal).toBe(200);
    expect(per100.protein).toBe(10);
    expect(basisOf('no basis here').stated).toBe(false);
  });

  it('lists what it could not find rather than inventing it', () => {
    const { per100, missing, ok } = parseLabel('Energy 250kcal\nProtein 8.5g');
    expect(ok).toBe(true);
    expect(missing).toEqual(['carbs', 'fat']);
    expect(per100.fat).toBeUndefined();
    expect(parseLabel('').ok).toBe(false);
    expect(parseLabel('hello there').found).toEqual([]);
  });

  it('hands the custom-food form per-serving figures', () => {
    const { draft, ok } = labelToDraft(PANEL, { name: 'Granola', servingGrams: 50 });
    expect(ok).toBe(true);
    expect(draft.name).toBe('Granola');
    expect(draft.kcal).toBe(125); // half of the per-100 figure
    expect(draft.protein).toBe(4.3);
  });
});
