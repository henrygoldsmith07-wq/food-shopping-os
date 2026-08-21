import { describe, expect, it } from 'vitest';
import {
  calendarAnalyticsReport, nutritionAnalytics, pantryDashboard, shoppingAnalytics,
  wasteAnalytics,
} from '../src/lib/analytics.js';

const TODAY = '2026-07-28';
const food = (name, brand, kcal, protein = 20) => ({
  id: `${name}-${kcal}`,
  name,
  brand,
  grams: 100,
  per100: { kcal, protein, carbs: 30, fat: 10, fibre: 5 },
  meal: 'lunch',
  time: '12:00',
});

const state = {
  day: TODAY,
  targets: { kcal: 2000, protein: 120, carbs: 250, fat: 70, fibre: 30 },
  shops: [
    { date: '2026-07-02', store: 'Tesco', total: 20, saved: 2, items: [{ name: 'Milk', price: 2 }, { name: 'Bread', price: 1.5 }] },
    { date: '2026-07-10', store: 'Tesco', total: 30, saved: 1, items: [{ name: 'Milk', price: 2.1 }] },
    { date: '2026-06-15', store: 'Aldi', total: 10, saved: 0, items: [{ name: 'Rice', price: 2 }] },
  ],
  waste: [
    { name: 'Spinach', cost: 2, date: '2026-07-12' },
    { name: 'Spinach', cost: 1, date: '2026-06-12' },
  ],
  pantry: [
    { name: 'Milk', cost: 2, location: 'Fridge', cat: 'Dairy', expiry: '2026-07-29', low: true },
    { name: 'Rice', cost: 3, location: 'Cupboard', cat: 'Dry goods', expiry: null, low: false },
  ],
  log: {
    '2026-07-27': [food('Yoghurt', 'Fage', 1000)],
    '2026-07-28': [food('Yoghurt', 'Fage', 2000), food('Oats', 'Quaker', 1000)],
  },
};

describe('shopping analytics', () => {
  it('builds spending, savings, store and habit figures from recorded shops', () => {
    const report = shoppingAnalytics(state, TODAY);
    expect(report.spent.month).toBe(50);
    expect(report.spent.year).toBe(60);
    expect(report.savings.total).toBe(3);
    expect(report.stores[0]).toMatchObject({ name: 'Tesco', trips: 2, spent: 50 });
    expect(report.products[0]).toMatchObject({ name: 'Milk', times: 2 });
    expect(report.brands[0]).toMatchObject({ name: 'Fage', times: 2 });
    expect(report.averageItems).toBeCloseTo(1.3, 1);
  });
});

describe('nutrition and pantry analytics', () => {
  it('averages logged days only and states coverage', () => {
    const report = nutritionAnalytics(state, { days: 30, today: TODAY });
    expect(report.loggedDays).toBe(2);
    expect(report.days).toBe(30);
    expect(report.averages.kcal).toBe(2000);
    expect(report.averages.protein).toBe(30);
  });

  it('summarises the live pantry by location, category and expiry risk', () => {
    const report = pantryDashboard(state, TODAY);
    expect(report).toMatchObject({ total: 2, value: 5, useSoon: 1, low: 1, datedCoverage: 50 });
    expect(report.byLocation.map((row) => row.label)).toEqual(['Cupboard', 'Fridge']);
  });
});

describe('waste and calendar reports', () => {
  it('shows waste cost, rate and repeat waste without treating missing spend as zero food', () => {
    const report = wasteAnalytics(state, TODAY);
    expect(report.month).toMatchObject({ count: 1, cost: 2 });
    expect(report.month.rate).toBe(4);
    expect(report.top[0]).toMatchObject({ name: 'Spinach', count: 2, cost: 3 });
  });

  it('builds calendar month and year reports', () => {
    expect(calendarAnalyticsReport(state, 'month', TODAY)).toMatchObject({
      label: 'July 2026',
      spend: 50,
      trips: 2,
      saved: 3,
      wasteCost: 2,
      loggedDays: 2,
    });
    expect(calendarAnalyticsReport(state, 'year', TODAY)).toMatchObject({
      label: '2026',
      spend: 60,
      trips: 3,
      wasteCost: 3,
    });
  });
});

describe('empty analytics', () => {
  it('returns explicit zeroes and null rates instead of NaN or invented history', () => {
    const empty = { ...state, shops: [], waste: [], pantry: [], log: {} };
    expect(shoppingAnalytics(empty, TODAY)).toMatchObject({
      trips: 0,
      averageBasket: 0,
      averageItems: 0,
      stores: [],
      products: [],
    });
    expect(nutritionAnalytics(empty, { days: 30, today: TODAY })).toMatchObject({
      loggedDays: 0,
      coverage: 0,
    });
    expect(wasteAnalytics(empty, TODAY).month).toMatchObject({ count: 0, cost: 0, rate: null });
    expect(calendarAnalyticsReport(empty, 'year', TODAY)).toMatchObject({
      spend: 0,
      trips: 0,
      loggedDays: 0,
    });
  });
});
