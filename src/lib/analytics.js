import { addDays, pantryAnalytics, spendByMonth } from './kitchen.js';
import { dayTotals } from './nutrition.js';
import { periodFootprint, shopFootprint } from './footprint.js';
import { shoppingNameKey } from './shopping.js';
import { SLOT_KEYS } from './mealplan.js';

const round = (value, places = 0) => {
  const scale = 10 ** places;
  return Math.round((Number(value) || 0) * scale) / scale;
};

const sum = (rows, read) => rows.reduce((total, row) => total + (Number(read(row)) || 0), 0);

const monthLabel = (key) => new Date(`${key}-01T12:00:00`)
  .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const grouped = (rows, readKey, readValue = () => 1) => {
  const groups = new Map();
  rows.forEach((row) => {
    const name = String(readKey(row) || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const current = groups.get(key) || { name, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(readValue(row)) || 0;
    groups.set(key, current);
  });
  return [...groups.values()];
};

const nutritionForDates = (state, dates) => {
  const rows = dates
    .map((date) => ({ date, entries: state.log?.[date] || [] }))
    .filter((row) => row.entries.length);
  const totals = rows.map((row) => ({ date: row.date, ...dayTotals(row.entries) }));
  const keys = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'sodium'];
  const averages = Object.fromEntries(keys.map((key) => [
    key,
    round(sum(totals, (row) => row[key]) / (totals.length || 1), key === 'kcal' ? 0 : 1),
  ]));
  return { rows: totals, loggedDays: totals.length, averages };
};

export const shoppingAnalytics = (state, today = state.day) => {
  const shops = state.shops || [];
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const thisMonth = shops.filter((shop) => String(shop.date || '').startsWith(month));
  const thisYear = shops.filter((shop) => String(shop.date || '').startsWith(year));
  const stores = grouped(shops, (shop) => shop.store, (shop) => shop.total)
    .map((row) => {
      const trips = shops.filter((shop) => String(shop.store || '').trim().toLowerCase() === row.name.toLowerCase());
      const spent = round(sum(trips, (shop) => shop.total), 2);
      return {
        name: row.name,
        trips: trips.length,
        spent,
        average: round(spent / trips.length, 2),
        saved: round(sum(trips, (shop) => shop.saved), 2),
      };
    })
    .sort((a, b) => b.trips - a.trips || b.spent - a.spent || a.name.localeCompare(b.name));
  const products = grouped(shops.flatMap((shop) => shop.items || []), (item) => item.name)
    .map((row) => ({ name: row.name, times: row.count }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
  const brands = grouped(
    Object.values(state.log || {}).flatMap((entries) => entries || []),
    (entry) => entry.brand,
  )
    .map((row) => ({ name: row.name, times: row.count }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
  const days = grouped(shops, (shop) => {
    if (!shop.date) return '';
    return new Date(`${shop.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
  })
    .map((row) => ({ name: row.name, trips: row.count }))
    .sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name));
  const totalItems = sum(shops, (shop) => (shop.items || []).length);
  const allSaved = round(sum(shops, (shop) => shop.saved), 2);

  return {
    spent: {
      month: round(sum(thisMonth, (shop) => shop.total), 2),
      year: round(sum(thisYear, (shop) => shop.total), 2),
      total: round(sum(shops, (shop) => shop.total), 2),
    },
    trips: shops.length,
    averageBasket: round(sum(shops, (shop) => shop.total) / (shops.length || 1), 2),
    averageItems: round(totalItems / (shops.length || 1), 1),
    stores,
    products,
    brands,
    favouriteDay: days[0] || null,
    monthly: spendByMonth(shops, 12, today),
    savings: {
      total: allSaved,
      month: round(sum(thisMonth, (shop) => shop.saved), 2),
      year: round(sum(thisYear, (shop) => shop.saved), 2),
      trips: shops.filter((shop) => Number(shop.saved) > 0).length,
    },
  };
};

export const nutritionAnalytics = (state, { days = 30, today = state.day } = {}) => {
  const dates = Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  const report = nutritionForDates(state, dates);
  const targets = state.targets || {};
  return {
    ...report,
    days,
    coverage: Math.round((report.loggedDays / days) * 100),
    nutrients: ['kcal', 'protein', 'carbs', 'fat', 'fibre'].map((key) => ({
      key,
      average: report.averages[key],
      target: Number(targets[key]) || 0,
      pct: targets[key] ? Math.round((report.averages[key] / targets[key]) * 100) : null,
    })),
  };
};

export const pantryDashboard = (state, today = state.day) => {
  const report = pantryAnalytics(state.pantry || [], today);
  return {
    ...report,
    datedCoverage: report.total ? Math.round((report.dated / report.total) * 100) : 0,
  };
};

export const wasteAnalytics = (state, today = state.day) => {
  const waste = state.waste || [];
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const shopping = shoppingAnalytics(state, today);
  const monthRows = waste.filter((row) => String(row.date || '').startsWith(month));
  const yearRows = waste.filter((row) => String(row.date || '').startsWith(year));
  const top = grouped(waste, (row) => row.name, (row) => row.cost)
    .map((row) => ({ name: row.name, count: row.count, cost: round(row.value, 2) }))
    .sort((a, b) => b.cost - a.cost || b.count - a.count || a.name.localeCompare(b.name));
  const monthlySpend = shopping.spent.month;

  return {
    month: {
      count: monthRows.length,
      cost: round(sum(monthRows, (row) => row.cost), 2),
      rate: monthlySpend ? round((sum(monthRows, (row) => row.cost) / monthlySpend) * 100, 1) : null,
    },
    year: {
      count: yearRows.length,
      cost: round(sum(yearRows, (row) => row.cost), 2),
    },
    total: {
      count: waste.length,
      cost: round(sum(waste, (row) => row.cost), 2),
    },
    top,
    monthly: spendByMonth(
      waste.map((row, index) => ({ ...row, id: `waste-${index}`, total: row.cost })),
      6,
      today,
    ).map(({ key, label, spend }) => ({ key, label, cost: spend })),
  };
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEASUREMENT_DAYS = 30;
const MINIMUM_TREND_TRIPS = 4;
const EMERGENCY_SHOP_MAX_ITEMS = 2;
const DUPLICATE_PURCHASE_WINDOW_DAYS = 7;
const TIME_SAVED_MODEL = {
  consolidatedLineMinutes: 2,
  purchaseWarningMinutes: 1,
};

const isDate = (value) => DATE_RE.test(String(value || ''));

const inDateWindow = (value, start, end) => {
  const date = String(value || '');
  return isDate(date) && date >= start && date <= end;
};

const dayDistance = (from, to) => {
  if (!isDate(from) || !isDate(to)) return Infinity;
  return Math.abs(
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000,
  );
};

const datedShops = (shops = []) => shops
  .map((shop, index) => ({ shop, index }))
  .filter(({ shop }) => isDate(shop.date))
  .sort((a, b) => String(a.shop.date).localeCompare(String(b.shop.date)) || a.index - b.index);

const splitShopHistory = (shops = []) => {
  const rows = datedShops(shops);
  if (rows.length < MINIMUM_TREND_TRIPS) return null;
  const splitAt = Math.ceil(rows.length / 2);
  return {
    rows,
    splitAt,
    baseline: rows.slice(0, splitAt),
    recent: rows.slice(splitAt),
    boundary: rows[splitAt]?.shop.date || '',
  };
};

const relativeReduction = (baseline, recent) => (
  baseline > 0 ? round(((baseline - recent) / baseline) * 100, 1) : null
);

const trendFor = (baselineValue, recentValue) => ({
  baseline: round(baselineValue, 1),
  recent: round(recentValue, 1),
  reductionPct: relativeReduction(baselineValue, recentValue),
});

const itemCount = (shop) => (shop.items || []).filter((item) => String(item.name || '').trim()).length;

const emergencyShop = (shop) => itemCount(shop) > 0 && itemCount(shop) <= EMERGENCY_SHOP_MAX_ITEMS;

const rate = (numerator, denominator) => (denominator ? round((numerator / denominator) * 100, 1) : null);

const plannedMealCompletion = (state, today, start) => {
  const planned = Object.entries(state.plan || {}).flatMap(([date, day]) => {
    if (!inDateWindow(date, start, today)) return [];
    return SLOT_KEYS
      .filter((slot) => day?.[slot])
      .map((slot) => ({ date, slot, recipeId: day[slot] }));
  });
  const cooked = new Map();
  (state.cooked || []).forEach((entry) => {
    if (!inDateWindow(entry.date, start, today) || !entry.recipeId) return;
    const key = `${entry.date}|${entry.recipeId}`;
    cooked.set(key, (cooked.get(key) || 0) + 1);
  });
  let completed = 0;
  planned.forEach((entry) => {
    const key = `${entry.date}|${entry.recipeId}`;
    const available = cooked.get(key) || 0;
    if (available > 0) {
      completed += 1;
      cooked.set(key, available - 1);
    }
  });
  return {
    days: MEASUREMENT_DAYS,
    planned: planned.length,
    completed,
    incomplete: Math.max(0, planned.length - completed),
    completionPct: rate(completed, planned.length),
  };
};

const duplicatePurchaseRows = (shops = []) => {
  const lastPurchased = new Map();
  const rows = [];
  datedShops(shops).forEach(({ shop }, shopIndex) => {
    const keys = new Set();
    (shop.items || []).forEach((item) => {
      const key = shoppingNameKey(item.name);
      if (!key) return;
      const previous = lastPurchased.get(key);
      rows.push({
        shopDate: shop.date,
        shopIndex,
        key,
        duplicate: Boolean(previous && dayDistance(previous, shop.date) <= DUPLICATE_PURCHASE_WINDOW_DAYS),
      });
      keys.add(key);
    });
    keys.forEach((key) => lastPurchased.set(key, shop.date));
  });
  return rows;
};

const measurementWindow = (today) => ({
  start: addDays(today, -MEASUREMENT_DAYS + 1),
  end: today,
});

const timeSavedMeasurement = (state) => {
  const list = state.shoppingList || [];
  const consolidatedLines = list.reduce((total, item) => {
    const recipeSources = Math.max(
      Array.isArray(item.forRecipes) ? item.forRecipes.length : 0,
      Array.isArray(item.sourceRecipes) ? item.sourceRecipes.length : 0,
    );
    const alternateNames = Array.isArray(item.alsoKnownAs) ? item.alsoKnownAs.length : 0;
    return total + Math.max(0, recipeSources - 1) + alternateNames;
  }, 0);
  const purchaseWarnings = list.filter((item) => item.purchaseWarning).length;
  const estimatedMinutes = (consolidatedLines * TIME_SAVED_MODEL.consolidatedLineMinutes)
    + (purchaseWarnings * TIME_SAVED_MODEL.purchaseWarningMinutes);
  return {
    estimatedMinutes: estimatedMinutes || null,
    confidence: 'proxy',
    consolidatedLines,
    purchaseWarnings,
    model: TIME_SAVED_MODEL,
    explanation: 'Proxy estimate from consolidated list lines and recent-purchase warnings; no stopwatch data is recorded.',
  };
};

const emergencyShopMeasurement = (shops) => {
  const emergency = shops.filter(emergencyShop).length;
  const history = splitShopHistory(shops);
  let trend = null;
  if (history) {
    const baselineEmergency = history.baseline.filter(({ shop }) => emergencyShop(shop)).length;
    const recentEmergency = history.recent.filter(({ shop }) => emergencyShop(shop)).length;
    trend = trendFor(
      rate(baselineEmergency, history.baseline.length) || 0,
      rate(recentEmergency, history.recent.length) || 0,
    );
  }
  return {
    definition: `recorded shop with ${EMERGENCY_SHOP_MAX_ITEMS} or fewer named items`,
    trips: shops.length,
    emergencyTrips: emergency,
    rate: rate(emergency, shops.length),
    trend,
    readyForTrend: Boolean(history),
    minimumTrips: MINIMUM_TREND_TRIPS,
  };
};

const duplicatePurchaseMeasurement = (state, shops) => {
  const rows = duplicatePurchaseRows(shops);
  const duplicates = rows.filter((row) => row.duplicate).length;
  const history = splitShopHistory(shops);
  let trend = null;
  if (history) {
    const baselineRows = rows.filter((row) => row.shopIndex < history.splitAt);
    const recentRows = rows.filter((row) => row.shopIndex >= history.splitAt);
    trend = trendFor(
      rate(baselineRows.filter((row) => row.duplicate).length, baselineRows.length) || 0,
      rate(recentRows.filter((row) => row.duplicate).length, recentRows.length) || 0,
    );
  }
  return {
    definition: `same item bought again within ${DUPLICATE_PURCHASE_WINDOW_DAYS} days of a recorded shop (proxy)`,
    itemLines: rows.length,
    duplicateLines: duplicates,
    rate: rate(duplicates, rows.length),
    recentPurchaseWarnings: (state.shoppingList || []).filter((item) => item.purchaseWarning).length,
    trend,
    readyForTrend: Boolean(history),
    minimumTrips: MINIMUM_TREND_TRIPS,
  };
};

const wasteReductionMeasurement = (state, shops, today, start) => {
  const waste = state.waste || [];
  const windowRows = waste.filter((row) => inDateWindow(row.date, start, today));
  const history = splitShopHistory(shops);
  let trend = null;
  if (history) {
    const baselineCost = sum(waste.filter((row) => isDate(row.date) && row.date < history.boundary), (row) => row.cost);
    const recentCost = sum(waste.filter((row) => isDate(row.date) && row.date >= history.boundary), (row) => row.cost);
    const baselineRate = baselineCost / (history.baseline.length || 1);
    const recentRate = recentCost / (history.recent.length || 1);
    trend = {
      ...trendFor(baselineRate, recentRate),
      baselineCost: round(baselineCost, 2),
      recentCost: round(recentCost, 2),
      unit: '£ per recorded shop',
    };
  }
  return {
    definition: 'recorded waste cost per recorded shop; reductions are relative to the earlier half of shop history',
    observedCost: round(sum(waste, (row) => row.cost), 2),
    observedItems: waste.length,
    window: {
      days: MEASUREMENT_DAYS,
      cost: round(sum(windowRows, (row) => row.cost), 2),
      items: windowRows.length,
    },
    trend,
    readyForTrend: Boolean(history),
    minimumTrips: MINIMUM_TREND_TRIPS,
  };
};

const pantryConfirmationMeasurement = (state, today, start) => {
  const events = (state.pantryEvents || []).filter((event) => (
    event.type === 'recipe_consumption'
    && event.enabled !== false
    && inDateWindow(event.date || event.at, start, today)
  ));
  const requestCounts = events.map((event) => (
    Array.isArray(event.confirmationNeeded)
      ? event.confirmationNeeded.length
      : Number(event.confirmationNeeded) || 0
  ));
  const eventsNeedingConfirmation = requestCounts.filter((count) => count > 0).length;
  const confirmationRequests = sum(requestCounts, (count) => count);
  const openConflicts = (state.pantryConflicts || []).filter((conflict) => conflict.status !== 'resolved').length;
  return {
    days: MEASUREMENT_DAYS,
    consumptionEvents: events.length,
    eventsNeedingConfirmation,
    confirmationRequests,
    burdenPct: rate(eventsNeedingConfirmation, events.length),
    openConflicts,
  };
};

/**
 * Outcome measurements for the household loop. Values are derived from
 * recorded actions; a reduction is withheld until four dated shop trips can
 * provide an earlier and later comparison period.
 */
export const measurementAnalytics = (state, today = state.day) => {
  const { start } = measurementWindow(today);
  const shops = state.shops || [];
  return {
    window: { days: MEASUREMENT_DAYS, start, end: today },
    householdTimeSaved: timeSavedMeasurement(state),
    emergencyShopReduction: emergencyShopMeasurement(shops),
    duplicatePurchaseReduction: duplicatePurchaseMeasurement(state, shops),
    foodWasteReduction: wasteReductionMeasurement(state, shops, today, start),
    plannedMealCompletion: plannedMealCompletion(state, today, start),
    pantryConfirmationBurden: pantryConfirmationMeasurement(state, today, start),
  };
};

export const carbonAnalytics = (state, today = state.day) => ({
  food: periodFootprint(state.log || {}, { days: 30, today }),
  shopping: shopFootprint(state.shops || [], { days: 30, today }),
});

export const calendarAnalyticsReport = (state, period = 'month', today = state.day) => {
  const prefix = period === 'year' ? today.slice(0, 4) : today.slice(0, 7);
  const shops = (state.shops || []).filter((row) => String(row.date || '').startsWith(prefix));
  const waste = (state.waste || []).filter((row) => String(row.date || '').startsWith(prefix));
  const dates = Object.keys(state.log || {}).filter((date) => date.startsWith(prefix)).sort();
  const nutrition = nutritionForDates(state, dates);
  const elapsedDays = period === 'year'
    ? Math.floor((new Date(`${today}T12:00:00`) - new Date(`${today.slice(0, 4)}-01-01T12:00:00`)) / 86400000) + 1
    : Number(today.slice(8, 10));
  return {
    period,
    label: period === 'year' ? prefix : monthLabel(prefix),
    spend: round(sum(shops, (shop) => shop.total), 2),
    trips: shops.length,
    items: sum(shops, (shop) => (shop.items || []).length),
    saved: round(sum(shops, (shop) => shop.saved), 2),
    wasteCost: round(sum(waste, (row) => row.cost), 2),
    wasteItems: waste.length,
    loggedDays: nutrition.loggedDays,
    nutrition: nutrition.averages,
    carbon: periodFootprint(state.log || {}, { days: elapsedDays, today }),
  };
};
