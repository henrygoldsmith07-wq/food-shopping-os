import { describe, it, expect } from 'vitest';
import {
  bmi, bodySummary, cycleSummary, latest, movement, series, sleepSummary, stressSummary,
  symptomCounts, vitalReadings, vitalSummary, waistRisk,
} from '../src/lib/health.js';
import { bpCategory, cholesterolCategory, glucoseCategory } from '../src/data/health.js';
import { fitDimensions, MAX_EDGE, storageEstimate } from '../src/lib/photos.js';
import { addDays } from '../src/lib/kitchen.js';

const TODAY = '2026-07-28';
const m = (key, value, date) => ({ id: `${key}-${date}`, key, value, date });

describe('measurements', () => {
  it('reads a series oldest first and skips anything that is not a number', () => {
    const list = series([
      m('weight', 82, '2026-07-20'),
      m('weight', 'heavy', '2026-07-21'),
      m('weight', 80.4, '2026-07-10'),
      m('waist', 90, '2026-07-11'),
    ], 'weight');
    expect(list.map((r) => r.date)).toEqual(['2026-07-10', '2026-07-20']);
    expect(latest([], 'weight')).toBe(null);
  });

  it('has no trend from a single reading — one number is not a direction', () => {
    expect(movement([m('weight', 82, TODAY)], 'weight', { today: TODAY })).toBe(null);
  });

  it('reports the change, the span it happened over, and the weekly pace', () => {
    const trend = movement([
      m('weight', 84, addDays(TODAY, -28)),
      m('weight', 82.6, addDays(TODAY, -14)),
      m('weight', 82, TODAY),
    ], 'weight', { today: TODAY });
    expect(trend.change).toBe(-2);
    expect(trend.spanDays).toBe(28);
    expect(trend.perWeek).toBe(-0.5);
    expect(trend.readings).toBe(3);
    expect(trend.direction).toBe('down');
  });

  it('ignores readings older than the window it was asked for', () => {
    const trend = movement([
      m('weight', 95, addDays(TODAY, -200)),
      m('weight', 82, addDays(TODAY, -10)),
      m('weight', 82, TODAY),
    ], 'weight', { today: TODAY, days: 90 });
    expect(trend.from).toBe(82);
    expect(trend.direction).toBe('steady');
  });
});

describe('bmi and waist', () => {
  it('needs both a weight and a height, and never stores the answer', () => {
    expect(bmi(80, null)).toBe(null);
    expect(bmi(null, 180)).toBe(null);
    expect(bmi(80, 180)).toEqual({ value: 24.7, label: 'Healthy weight', tone: 'good' });
    expect(bmi(55, 180).label).toBe('Underweight');
    expect(bmi(95, 180).label).toBe('Overweight');
    expect(bmi(110, 180).label).toBe('Obese');
  });

  it('will not band a waist without a stated sex, and says why', () => {
    const unknown = waistRisk(95, null);
    expect(unknown.label).toBe(null);
    expect(unknown.note).toMatch(/differ by sex/);
    expect(waistRisk(78, 'female').label).toBe('In range');
    expect(waistRisk(84, 'female').label).toBe('Raised');
    expect(waistRisk(103, 'male').label).toBe('High');
    expect(waistRisk(0, 'male')).toBe(null);
  });

  it('summarises the body page, and flags a missing height rather than guessing one', () => {
    const summary = bodySummary({
      measurements: [m('weight', 82, TODAY), m('waist', 96, TODAY)],
      body: { sex: 'male' },
    }, TODAY);
    expect(summary.readings.weight.value).toBe(82);
    expect(summary.readings.bodyFat).toBe(null);
    expect(summary.bmi).toBe(null);
    expect(summary.needsHeight).toBe(true);
    expect(summary.waist.label).toBe('Raised');
    expect(summary.count).toBe(2);
  });

  it('is empty, not broken, before anything is logged', () => {
    const summary = bodySummary({ measurements: [], body: {} }, TODAY);
    expect(summary.count).toBe(0);
    expect(summary.bmi).toBe(null);
    expect(summary.needsHeight).toBe(false);
    expect(summary.waist).toBe(null);
  });
});

describe('vitals', () => {
  it('bands blood pressure the way the NHS publishes it', () => {
    expect(bpCategory({ systolic: 118, diastolic: 76 }).label).toBe('Normal');
    expect(bpCategory({ systolic: 134, diastolic: 78 }).label).toBe('Slightly raised');
    expect(bpCategory({ systolic: 146, diastolic: 92 }).label).toBe('High');
    expect(bpCategory({ systolic: 185, diastolic: 118 }).tone).toBe('danger');
    expect(bpCategory({ systolic: 85, diastolic: 55 }).label).toBe('Low');
    expect(bpCategory({ systolic: 120 })).toBe(null);
  });

  it('bands glucose and cholesterol, and says nothing without a reading', () => {
    expect(glucoseCategory({ glucose: 5.2 }).label).toBe('Normal');
    expect(glucoseCategory({ glucose: 6.4 }).label).toBe('Raised');
    expect(glucoseCategory({ glucose: 9 }).tone).toBe('danger');
    expect(glucoseCategory({})).toBe(null);
    expect(cholesterolCategory({ total: 4.4 }).label).toBe('In range');
    expect(cholesterolCategory({ total: 6.1, hdl: 1.4 }).advice).toMatch(/HDL is in range/);
    expect(cholesterolCategory({ hdl: 1.4 })).toBe(null);
  });

  it('returns readings newest first with their band attached', () => {
    const list = vitalReadings([
      { id: 'a', key: 'bp', date: '2026-07-01', values: { systolic: 150, diastolic: 95 } },
      { id: 'b', key: 'bp', date: '2026-07-20', values: { systolic: 122, diastolic: 78 } },
      { id: 'c', key: 'glucose', date: '2026-07-20', values: { glucose: 5.1 } },
    ], 'bp');
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
    expect(list[0].category.label).toBe('Normal');
  });

  it('summarises every vital, counting zero for the ones you have never taken', () => {
    const summary = vitalSummary([{ id: 'a', key: 'bp', date: TODAY, values: { systolic: 120, diastolic: 80 } }]);
    expect(summary.bp.count).toBe(1);
    expect(summary.glucose).toEqual({ latest: null, count: 0 });
    expect(summary.cholesterol.count).toBe(0);
  });
});

describe('sleep and stress', () => {
  const night = (date, hours, quality) => ({ id: date, date, hours, quality });

  it('says nothing at all before a night is logged', () => {
    expect(sleepSummary([], { today: TODAY })).toEqual({ nights: 0 });
    expect(stressSummary([], { today: TODAY })).toEqual({ days: 0 });
  });

  it('averages the nights inside the window and counts the short ones', () => {
    const summary = sleepSummary([
      night(addDays(TODAY, -20), 4, 1), // outside the 14-night window
      night(addDays(TODAY, -3), 6, 2),
      night(addDays(TODAY, -1), 8, 4),
      night(TODAY, 7, 4),
    ], { today: TODAY });
    expect(summary.nights).toBe(3);
    expect(summary.avgHours).toBe(7);
    expect(summary.shortest).toBe(6);
    expect(summary.longest).toBe(8);
    expect(summary.avgQuality).toBe(3.3);
    expect(summary.under7).toBe(1);
    expect(summary.last.date).toBe(TODAY);
  });

  it('averages stress and keeps the three most recent things you wrote down', () => {
    const summary = stressSummary([
      { id: '1', date: addDays(TODAY, -4), level: 2, note: 'quiet week' },
      { id: '2', date: addDays(TODAY, -3), level: 5, note: 'deadline' },
      { id: '3', date: addDays(TODAY, -2), level: 4, note: 'deadline again' },
      { id: '4', date: addDays(TODAY, -1), level: 4 },
      { id: '5', date: TODAY, level: 1, note: 'shipped it' },
    ], { today: TODAY });
    expect(summary.days).toBe(5);
    expect(summary.avg).toBe(3.2);
    expect(summary.high).toBe(3);
    expect(summary.notes.map((n) => n.id)).toEqual(['5', '3', '2']);
  });
});

describe('cycle', () => {
  it('asks for a first period rather than showing an empty prediction', () => {
    const summary = cycleSummary([], TODAY);
    expect(summary).toEqual({ logged: 0, ready: false, reason: 'Log a period start and this fills in.' });
  });

  it('refuses to predict from one logged period, and says what it needs', () => {
    const summary = cycleSummary([{ id: 'a', start: addDays(TODAY, -6) }], TODAY);
    expect(summary.ready).toBe(false);
    expect(summary.logged).toBe(1);
    expect(summary.dayOfCycle).toBe(7);
    expect(summary.reason).toMatch(/Two logged periods/);
    expect(summary.next).toBeUndefined();
  });

  it('averages your own cycle lengths and dates the next one from them', () => {
    const summary = cycleSummary([
      { id: 'a', start: '2026-05-04' },
      { id: 'b', start: '2026-06-01' }, // 28
      { id: 'c', start: '2026-07-01' }, // 30
      { id: 'd', start: '2026-07-27' }, // 26
    ], TODAY);
    expect(summary.ready).toBe(true);
    expect(summary.avgLength).toBe(28);
    expect(summary.shortest).toBe(26);
    expect(summary.longest).toBe(30);
    expect(summary.variation).toBe(4);
    expect(summary.next).toBe('2026-08-24');
    expect(summary.daysUntilNext).toBe(27);
    expect(summary.dayOfCycle).toBe(2);
    expect(summary.basis).toBe('3 cycles of your own');
  });

  it('drops an impossible gap instead of letting a mistype set the average', () => {
    const summary = cycleSummary([
      { id: 'a', start: '2026-06-01' },
      { id: 'b', start: '2026-06-03' }, // 2 days — a slip, not a cycle
      { id: 'c', start: '2026-07-01' }, // 28
    ], TODAY);
    expect(summary.ready).toBe(true);
    expect(summary.avgLength).toBe(28);
  });

  it('counts only the symptoms you actually recorded', () => {
    const counts = symptomCounts([
      { start: '2026-06-01', symptoms: ['Cramps', 'Tired'] },
      { start: '2026-07-01', symptoms: ['Cramps'] },
      { start: '2026-07-27' },
    ]);
    expect(counts).toEqual([{ name: 'Cramps', times: 2 }, { name: 'Tired', times: 1 }]);
    expect(symptomCounts([])).toEqual([]);
  });
});

describe('progress photos', () => {
  it('leaves a small picture alone and shrinks a big one to shape', () => {
    expect(fitDimensions(300, 200)).toEqual({ width: 300, height: 200 });
    expect(fitDimensions(1200, 900)).toEqual({ width: MAX_EDGE, height: 360 });
    expect(fitDimensions(900, 1800)).toEqual({ width: 240, height: MAX_EDGE });
    expect(fitDimensions(0, 100)).toEqual({ width: 0, height: 0 });
  });

  it('estimates what the thumbnails are costing your browser storage', () => {
    expect(storageEstimate([])).toEqual({ bytes: 0, kb: 0, pctOfFiveMb: 0 });
    const estimate = storageEstimate([{ thumb: 'a'.repeat(40000) }, { thumb: 'b'.repeat(40000) }]);
    expect(estimate.kb).toBe(59);
    expect(estimate.pctOfFiveMb).toBe(1);
  });
});
