import { describe, expect, it } from 'vitest';
import {
  dailyMicroReport, deficiencyAdvice, DEFICIENT_PCT, foodSourcesFor, MICRO_GROUPS,
  microRow, microRows, statusTone, topDeficiencies, weeklyMicroTrend,
} from '../src/lib/micronutrition.js';
import { buildEntry, buildQuickEntry } from '../src/lib/nutrition.js';
import { FOODS } from '../src/data/foods.js';
import { DEFAULT_TARGETS, MICRONUTRIENT_KEYS } from '../src/data/nutrients.js';

const byId = (id) => FOODS.find((f) => f.id === id);
const eat = (id, grams) => buildEntry(byId(id), { grams });

describe('a day read against the reference intakes', () => {
  it('scores every deep-tracked micronutrient, and nothing that is a limit', () => {
    const rows = microRows(dailyMicroReport([eat('spinach', 100)]).rows.length ? {} : {});
    expect(rows.map((r) => r.key)).toEqual(MICRONUTRIENT_KEYS);
    expect(rows.map((r) => r.key)).not.toContain('sodium');
  });

  it('calls a well-covered nutrient met and a barely-touched one short', () => {
    const report = dailyMicroReport([eat('spinach', 200), eat('salmon-fillet', 150)], DEFAULT_TARGETS);
    const folate = report.rows.find((r) => r.key === 'vitB9');
    const omega = report.rows.find((r) => r.key === 'omega3');
    expect(folate.status).toBe('ample');
    expect(omega.pct).toBeGreaterThan(100);
    expect(report.deficient.map((r) => r.key)).toContain('iodine');
  });

  it('measures the shortfall in the nutrient’s own unit', () => {
    const report = dailyMicroReport([eat('white-rice', 200)], DEFAULT_TARGETS);
    const b12 = report.rows.find((r) => r.key === 'vitB12');
    expect(b12.value).toBe(0);
    expect(b12.shortfall).toBe(DEFAULT_TARGETS.vitB12);
    expect(b12.unit).toBe('µg');
  });

  it('reads an unlogged nutrient as unmeasured, never as a deficiency', () => {
    const report = dailyMicroReport([buildQuickEntry({ kcal: 700, protein: 30 })], DEFAULT_TARGETS);
    const iron = report.rows.find((r) => r.key === 'iron');
    expect(iron.status).toBe('unmeasured');
    expect(iron.value).toBeNull();
    expect(report.deficient).toHaveLength(0);
    expect(report.unmeasured.length).toBe(MICRONUTRIENT_KEYS.length);
  });

  it('flags an excess only where an upper level has been published', () => {
    // Enough liver-grade vitamin A to pass the 3000 µg upper level.
    const heavy = dailyMicroReport([eat('butter', 500)], DEFAULT_TARGETS);
    const vitA = heavy.rows.find((r) => r.key === 'vitA');
    expect(vitA.upper).toBe(3000);
    expect(vitA.status).toBe('excess');
    expect(heavy.excess.map((r) => r.key)).toContain('vitA');

    // Magnesium has no published food UL, so a big number is never an excess.
    const magnesium = microRow('magnesium', { magnesium: 5000 }, DEFAULT_TARGETS);
    expect(magnesium.upper).toBeNull();
    expect(magnesium.upperPct).toBeNull();
    expect(magnesium.status).toBe('ample');
  });

  it('tones deficiency and excess as things to look at', () => {
    expect(statusTone('deficient')).toBe('danger');
    expect(statusTone('excess')).toBe('danger');
    expect(statusTone('ample')).toBe('good');
    expect(statusTone('unmeasured')).toBe('faint');
  });
});

describe('the week', () => {
  const dates = ['2026-03-02', '2026-03-03', '2026-03-04'];
  const log = {
    '2026-03-02': [eat('white-rice', 300)],
    '2026-03-04': [eat('white-rice', 300)],
  };

  it('averages only the days that were actually logged', () => {
    const trend = weeklyMicroTrend(log, dates, DEFAULT_TARGETS);
    expect(trend.loggedDays).toBe(2);
    const b12 = trend.nutrients.find((n) => n.key === 'vitB12');
    expect(b12.measuredDays).toBe(2);
    // The untouched middle day is a hole in the series, not a zero-intake day.
    expect(b12.series).toEqual([0, null, 0]);
  });

  it('names the gaps that keep coming back', () => {
    const trend = weeklyMicroTrend(log, dates, DEFAULT_TARGETS);
    const keys = trend.persistentGaps.map((n) => n.key);
    expect(keys).toContain('vitB12');
    expect(keys).toContain('vitB9');
    expect(trend.persistentGaps.every((n) => n.shortDays >= 1)).toBe(true);
  });

  it('does not invent gaps from a week with nothing logged', () => {
    const trend = weeklyMicroTrend({}, dates, DEFAULT_TARGETS);
    expect(trend.loggedDays).toBe(0);
    expect(trend.persistentGaps).toEqual([]);
    expect(trend.nutrients.every((n) => n.average === null)).toBe(true);
  });
});

describe('closing a gap with food', () => {
  it('ranks sources by an ordinary serving, not by 100 g', () => {
    const sources = foodSourcesFor('vitB12', { targets: DEFAULT_TARGETS });
    expect(sources.length).toBe(3);
    expect(sources[0].amount).toBeGreaterThanOrEqual(sources[1].amount);
    expect(sources.every((s) => s.serving)).toBe(true);
    expect(sources.map((s) => s.id)).not.toContain('white-rice');
  });

  it('honours the exclusions a household has set', () => {
    const withFish = foodSourcesFor('omega3', { targets: DEFAULT_TARGETS, limit: 6 });
    expect(withFish.map((s) => s.id)).toContain('salmon-fillet');
    const vegan = foodSourcesFor('omega3', {
      targets: DEFAULT_TARGETS,
      limit: 6,
      exclude: (food) => ['salmon-fillet', 'tuna-tinned'].includes(food.id),
    });
    expect(vegan.map((s) => s.id)).not.toContain('salmon-fillet');
    expect(vegan.map((s) => s.id)).not.toContain('tuna-tinned');
  });

  it('surfaces the three worst gaps with food behind each', () => {
    const report = dailyMicroReport([eat('white-rice', 400)], DEFAULT_TARGETS);
    const trend = weeklyMicroTrend({ '2026-03-02': [eat('white-rice', 400)] }, ['2026-03-02'], DEFAULT_TARGETS);
    const top = topDeficiencies(report, { trend, targets: DEFAULT_TARGETS });
    expect(top).toHaveLength(3);
    expect(top[0].pct).toBeLessThan(DEFICIENT_PCT);
    expect(top[0].sources.length).toBeGreaterThan(0);
    expect(top[0].shortDays).toBe(1);
    // Worst first.
    expect(top[0].pct).toBeLessThanOrEqual(top[1].pct);
  });

  it('advises food, never a supplement', () => {
    const report = dailyMicroReport([eat('white-rice', 400)], DEFAULT_TARGETS);
    const [worst] = topDeficiencies(report, { targets: DEFAULT_TARGETS });
    const advice = deficiencyAdvice(worst);
    expect(advice).toContain(worst.label);
    expect(advice.toLowerCase()).not.toMatch(/supplement|tablet|pill|capsule/);
    expect(advice).toMatch(/\d+%/);
  });

  it('says so plainly when the catalogue has no source for a nutrient', () => {
    const advice = deficiencyAdvice({ label: 'Iodine', pct: 12, sources: [] });
    expect(advice).toMatch(/Nothing in your catalogue/);
  });
});

describe('how the rows are laid out', () => {
  it('groups minerals, vitamins and B vitamins, covering every tracked key', () => {
    const grouped = MICRO_GROUPS.flatMap((group) => group.keys);
    expect(new Set(grouped)).toEqual(new Set(MICRONUTRIENT_KEYS));
    expect(MICRO_GROUPS.find((g) => g.id === 'bvitamin').keys).toContain('vitB9');
    expect(MICRO_GROUPS.find((g) => g.id === 'bvitamin').keys).not.toContain('vitB');
  });
});
