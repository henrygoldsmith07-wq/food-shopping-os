import { describe, it, expect } from 'vitest';
import {
  adherenceReport, dailyReport, deficiencyAlerts, monthDates, monthlyReport, monthlyTrend,
  periodReport, timingReport, weeklyReport, weightChart,
} from '../src/lib/reports.js';
import {
  csvCell, dailyCsv, entriesCsv, measurementsCsv, printableReport, toCsv,
} from '../src/lib/report-export.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';
import { addDays } from '../src/lib/kitchen.js';

const TODAY = '2026-07-28'; // a Tuesday

const entry = (meal, kcal, { time = '12:00', name = 'Something', protein = 20 } = {}) => ({
  id: `${meal}-${kcal}-${time}`,
  meal,
  time,
  name,
  grams: 100,
  per100: { kcal, protein, carbs: 30, fat: 10, fibre: 3, iron: 2, calcium: 100 },
});

const state = (over = {}) => ({
  day: TODAY,
  log: {},
  measurements: [],
  targets: { ...DEFAULT_TARGETS, kcal: 2000, protein: 120 },
  ...over,
});

describe('a day', () => {
  it('reports nothing as nothing, rather than a row of zeroes', () => {
    const report = dailyReport(state(), TODAY);
    expect(report.logged).toBe(false);
    expect(report.entries).toBe(0);
    expect(report.byMeal).toEqual([]);
  });

  it('splits the day by meal, with each one’s share', () => {
    const report = dailyReport(state({
      log: { [TODAY]: [entry('breakfast', 400, { time: '08:00' }), entry('dinner', 600, { time: '19:30' })] },
    }), TODAY);
    expect(report.logged).toBe(true);
    expect(report.totals.kcal).toBe(1000);
    expect(report.byMeal.map((m) => [m.label, m.kcal, m.share]))
      .toEqual([['Breakfast', 400, 40], ['Dinner', 600, 60]]);
    expect(report.first).toBe('08:00');
    expect(report.last).toBe('19:30');
  });

  it('measures each macro against the target you set', () => {
    const report = dailyReport(state({ log: { [TODAY]: [entry('lunch', 1000)] } }), TODAY);
    const kcal = report.macros.find((m) => m.key === 'kcal');
    expect(kcal).toMatchObject({ value: 1000, target: 2000, pct: 50 });
  });
});

describe('a period', () => {
  // The week runs Monday to Sunday, so these three sit inside the same one.
  const threeDays = state({
    log: {
      '2026-07-27': [entry('lunch', 1800)], // Mon
      '2026-07-28': [entry('lunch', 2100)], // Tue, today
      '2026-07-29': [entry('lunch', 2600)], // Wed
    },
  });

  it('leads with how many days it actually saw', () => {
    const report = weeklyReport(threeDays, TODAY);
    expect(report.days).toBe(7);
    expect(report.loggedDays).toBe(3);
    expect(report.coverage).toBe(43);
  });

  it('averages the logged days only — a blank day is not a fast', () => {
    const report = weeklyReport(threeDays, TODAY);
    expect(report.avgKcal).toBe(2167); // (1800+2100+2600)/3, not /7
    expect(report.totalKcal).toBe(6500);
  });

  it('counts the days within a tenth of your target', () => {
    const report = weeklyReport(threeDays, TODAY);
    expect(report.onTargetDays).toBe(2); // 1800 and 2100 are within 10% of 2000
    expect(report.adherence).toBe(67);
    expect(report.highest.kcal).toBe(2600);
    expect(report.lowest.kcal).toBe(1800);
  });

  it('is empty, not broken, over a window with nothing in it', () => {
    const report = weeklyReport(state(), TODAY);
    expect(report).toMatchObject({ loggedDays: 0, coverage: 0, avgKcal: 0, adherence: 0, highest: null });
  });

  it('keeps blank days in the series as blanks, not zeroes', () => {
    const report = periodReport(threeDays, ['2026-07-26', '2026-07-27'], 'Two days');
    expect(report.series.map((d) => d.kcal)).toEqual([null, 1800]);
  });
});

describe('months', () => {
  it('knows how long each month is', () => {
    expect(monthDates('2026-07-15')).toHaveLength(31);
    expect(monthDates('2026-02-10')).toHaveLength(28);
    expect(monthDates('2024-02-10')).toHaveLength(29);
    expect(monthDates('2026-07-15')[0]).toBe('2026-07-01');
  });

  it('summarises the calendar month, not a rolling thirty days', () => {
    const report = monthlyReport(state({ log: { '2026-07-03': [entry('lunch', 2000)] } }), TODAY);
    expect(report.days).toBe(31);
    expect(report.loggedDays).toBe(1);
    expect(report.from).toBe('2026-07-01');
  });

  it('leaves empty months out of the trend rather than averaging them to zero', () => {
    const trend = monthlyTrend(state({
      log: { '2026-05-04': [entry('lunch', 2000)], '2026-07-03': [entry('lunch', 1800)] },
    }), { months: 6, today: TODAY });
    expect(trend.map((m) => m.label)).toEqual(['2026-05', '2026-07']);
    expect(trend[1].avgKcal).toBe(1800);
  });
});

describe('the weight chart', () => {
  const m = (date, value) => ({ id: date, key: 'weight', value, date });

  it('says a single reading is not a line', () => {
    expect(weightChart(state(), { today: TODAY })).toEqual({ points: [], readings: 0 });
    const one = weightChart(state({ measurements: [m(TODAY, 82)] }), { today: TODAY });
    expect(one.readings).toBe(1);
    expect(one.enough).toBe(false);
  });

  it('charts the readings inside the window with their movement', () => {
    const chart = weightChart(state({
      measurements: [m('2026-01-01', 95), m(addDays(TODAY, -30), 84), m(TODAY, 82)],
    }), { today: TODAY, days: 90 });
    expect(chart.readings).toBe(2); // January is outside 90 days
    expect(chart.from).toBe(84);
    expect(chart.to).toBe(82);
    expect(chart.change).toBe(-2);
    expect(chart.enough).toBe(true);
  });
});

describe('coming up short', () => {
  const thinDays = (n) => Object.fromEntries(
    Array.from({ length: n }, (_, i) => [addDays(TODAY, -i), [entry('lunch', 500, { protein: 5 })]]),
  );

  it('refuses to call anything a deficiency off a few days', () => {
    const report = deficiencyAlerts(state({ log: thinDays(3) }), { today: TODAY });
    expect(report.ready).toBe(false);
    expect(report.alerts).toEqual([]);
    expect(report.reason).toMatch(/you have 3/);
  });

  it('reports what is low once there are enough days, with the caveat', () => {
    const report = deficiencyAlerts(state({ log: thinDays(10) }), { today: TODAY });
    expect(report.ready).toBe(true);
    expect(report.loggedDays).toBe(10);
    expect(report.alerts.length).toBeGreaterThan(0);
    expect(report.alerts[0].pct).toBeLessThan(70);
    expect(report.caveat).toMatch(/not a diagnosis/);
  });

  it('never calls being under a limit a shortfall', () => {
    const report = deficiencyAlerts(state({ log: thinDays(10) }), { today: TODAY });
    // Sodium and saturated fat are things to stay under; low is the point.
    expect(report.alerts.map((a) => a.key)).not.toContain('sodium');
    expect(report.alerts.map((a) => a.key)).not.toContain('satFat');
  });
});

describe('patterns', () => {
  it('finds the hour each meal usually lands, and whether it is regular', () => {
    const log = {};
    for (let i = 0; i < 5; i += 1) {
      log[addDays(TODAY, -i)] = [entry('breakfast', 400, { time: i === 0 ? '08:10' : '08:00' })];
    }
    const report = timingReport(state({ log }), { today: TODAY });
    expect(report.loggedDays).toBe(5);
    const breakfast = report.meals.find((m) => m.key === 'breakfast');
    expect(breakfast.usualAt).toBe('08:02');
    expect(breakfast.regular).toBe(true);
  });

  it('calls a wide spread what it is, rather than a failure', () => {
    const log = {
      [TODAY]: [entry('dinner', 700, { time: '18:00' })],
      [addDays(TODAY, -1)]: [entry('dinner', 700, { time: '22:30' })],
    };
    const dinner = timingReport(state({ log }), { today: TODAY }).meals.find((m) => m.key === 'dinner');
    expect(dinner.regular).toBe(false);
    expect(dinner.spreadMinutes).toBe(270);
  });

  it('says nothing about timing with nothing timed', () => {
    expect(timingReport(state(), { today: TODAY })).toEqual({ loggedDays: 0, meals: [] });
  });

  it('counts how often each target was hit, under and over', () => {
    const log = {
      [TODAY]: [entry('lunch', 2000)],
      [addDays(TODAY, -1)]: [entry('lunch', 1200)],
      [addDays(TODAY, -2)]: [entry('lunch', 2900)],
    };
    const report = adherenceReport(state({ log }), { today: TODAY });
    const kcal = report.rows.find((r) => r.key === 'kcal');
    expect(report.loggedDays).toBe(3);
    expect(kcal).toMatchObject({ within: 1, under: 1, over: 1, pct: 33 });
  });
});

describe('taking it out of the app', () => {
  it('quotes a CSV cell only when it has to', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('with, comma')).toBe('"with, comma"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('a,b\r\n1,2');
  });

  it('writes one row per logged day, and skips the blank ones', () => {
    const { text, rows } = dailyCsv(state({
      log: { [TODAY]: [entry('lunch', 2000)], [addDays(TODAY, -3)]: [entry('lunch', 1800)] },
    }), { days: 7, today: TODAY });
    expect(rows).toBe(2);
    const lines = text.split('\r\n');
    expect(lines[0]).toMatch(/^Date,Entries,Calories/);
    expect(lines[1]).toMatch(new RegExp(`^${addDays(TODAY, -3)},1,1800`));
  });

  it('writes one row per food for anyone who wants their own arithmetic', () => {
    const { text, rows } = entriesCsv(state({
      log: { [TODAY]: [entry('lunch', 2000, { name: 'Rice, cooked' })] },
    }), { days: 2, today: TODAY });
    expect(rows).toBe(1);
    expect(text).toContain('"Rice, cooked"'); // the comma is quoted, not lost
  });

  it('writes the measurements out in date order', () => {
    const { text, rows } = measurementsCsv(state({
      measurements: [
        { date: '2026-07-20', key: 'weight', value: 83 },
        { date: '2026-07-10', key: 'weight', value: 84 },
      ],
    }));
    expect(rows).toBe(2);
    expect(text.split('\r\n')[1]).toBe('2026-07-10,weight,84');
  });

  it('builds a printable page that states its own sample size', () => {
    const report = weeklyReport(state({ log: { [TODAY]: [entry('lunch', 2000)] } }), TODAY);
    const html = printableReport(report, { name: 'Sam', generated: new Date('2026-07-28T09:00:00Z') });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('1 of 7 days logged (14%)');
    expect(html).toContain('a day unrecorded, not a day without food');
    expect(html).toContain('Sam');
  });

  it('escapes anything that would break out of the page', () => {
    const report = weeklyReport(state(), TODAY);
    const html = printableReport(report, { name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
