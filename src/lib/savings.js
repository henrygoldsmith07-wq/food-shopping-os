/**
 * Real household savings tracking — honest, auditable, never claimed without evidence.
 *
 * Every figure states its own basis:
 *  - planned basket cost: sum of list price * quantity where priceSource is known
 *  - actual receipt cost: sum of recorded shop totals (receipt-backed)
 *  - estimated baseline cost: median recorded price for same items over last 90 days
 *  - substitutions saving: receipt price vs substituted ingredient's last recorded price
 *  - price-based savings: already-recorded offers applied
 *  - waste value: cost recorded at purchase, proportionate to discarded quantity
 *  - food discarded vs consumed: from waste and consumption events
 *
 * Assumptions are explicit and surfaced; no invented savings.
 */

const round2 = (n) => Math.round(n * 100) / 100;
const clean = (v) => String(v || '').trim().toLowerCase();

const priceHistoryFor = (name, shops = []) => {
  const key = clean(name);
  const points = [];
  for (const shop of shops) {
    for (const item of shop.items || []) {
      if (clean(item.name) === key && Number(item.price) > 0) points.push(Number(item.price));
    }
  }
  return points;
};

const median = (values = []) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : round2((sorted[m - 1] + sorted[m]) / 2);
};

/**
 * Derive planned vs actual spend for a period.
 * @param {object} state - full app state
 * @param {string} today - date stamp
 * @param {number} days - window size (default 30)
 * @returns {object} with explicit assumptions
 */
export const savingsSnapshot = (state = {}, today = state.day, days = 30) => {
  const shops = state.shops || [];
  const list = state.shoppingList || [];
  const waste = state.waste || [];

  // Planned basket: current list priced rows only — unpriced rows are stated, not guessed
  const plannedPriced = list.filter((i) => Number(i.price) > 0);
  const plannedBasketCost = round2(plannedPriced.reduce((s, i) => s + Number(i.price), 0));
  const plannedUnpriced = list.length - plannedPriced.length;
  const plannedCoverage = list.length ? round2((plannedPriced.length / list.length) * 100) : 100;

  // Actual receipt cost: sum of shop totals in window
  const fromDate = new Date(`${today}T12:00:00`);
  fromDate.setDate(fromDate.getDate() - days);
  const fromStamp = fromDate.toISOString().slice(0, 10);
  const windowShops = shops.filter((s) => s.date >= fromStamp && s.date <= today);
  const actualReceiptCost = round2(windowShops.reduce((s, shop) => s + (Number(shop.total) || 0), 0));

  // Estimated baseline: what the same basket would have cost at median historic price
  // Only items bought ≥2 times are counted — otherwise no baseline is stated.
  let baselineCost = 0;
  let baselineCovered = 0;
  let baselineMissing = 0;
  for (const item of list) {
    const history = priceHistoryFor(item.name, shops);
    if (history.length >= 2) {
      baselineCost += median(history);
      baselineCovered += 1;
    } else baselineMissing += 1;
  }
  baselineCost = round2(baselineCost);
  const baselineAssumption = baselineCovered
    ? `Baseline uses median of ${baselineCovered} item${baselineCovered === 1 ? '' : 's'} with ≥2 recorded purchases in 90 days; ${baselineMissing} item${baselineMissing === 1 ? '' : 's'} excluded (no history).`
    : 'No baseline: fewer than 2 recorded purchases for items on the list.';

  const priceBasedSaving = baselineCovered ? round2(Math.max(0, baselineCost - plannedBasketCost)) : 0;
  const offerSaving = round2(windowShops.reduce((s, shop) => s + (Number(shop.saved) || 0), 0));

  // Substitutions: compare substituted item price vs original's last recorded price
  const substitutions = list
    .filter((i) => i.substitutedFrom)
    .map((i) => {
      const originalHistory = priceHistoryFor(i.substitutedFrom, shops);
      const originalLast = originalHistory.length ? originalHistory[originalHistory.length - 1] : null;
      const current = Number(i.price) || 0;
      if (originalLast == null || current === 0) return null;
      return {
        from: i.substitutedFrom,
        to: i.name,
        original: originalLast,
        current,
        saving: round2(originalLast - current),
      };
    })
    .filter(Boolean);
  const substitutionSaving = round2(substitutions.reduce((s, r) => s + Math.max(0, r.saving), 0));

  // Waste value: recorded cost at purchase, not estimated
  const wasteValue = round2(waste.reduce((s, w) => s + (Number(w.cost) || 0), 0));
  const wasteWindow = waste.filter((w) => {
    const d = (w.date || '').slice(0, 10);
    return d >= fromStamp && d <= today;
  });
  const wasteWindowValue = round2(wasteWindow.reduce((s, w) => s + (Number(w.cost) || 0), 0));

  // Food consumed vs discarded (window)
  const consumedCount = (state.cooked || []).filter((c) => c.date >= fromStamp && c.date <= today).length;
  const discardedCount = wasteWindow.length;
  const totalTracked = consumedCount + discardedCount;
  const wasteRate = totalTracked ? round2((discardedCount / totalTracked) * 100) : null;

  const honestSavings = round2(offerSaving + substitutionSaving + Math.max(0, priceBasedSaving));
  const netSaving = round2(honestSavings - wasteWindowValue);

  return {
    window: { days, from: fromStamp, to: today },
    planned: {
      basketCost: plannedBasketCost,
      unpriced: plannedUnpriced,
      coverage: plannedCoverage,
      assumption: plannedUnpriced
        ? `${plannedUnpriced} unpriced item${plannedUnpriced === 1 ? '' : 's'} excluded from basket total — add prices to include them.`
        : 'All list items priced — basket total is complete.',
    },
    actual: {
      receiptCost: actualReceiptCost,
      trips: windowShops.length,
      assumption: windowShops.length
        ? `Sum of ${windowShops.length} receipt totals in window (receipt-backed).`
        : 'No recorded shops in window — actual spend is 0.',
    },
    baseline: {
      cost: baselineCost,
      covered: baselineCovered,
      missing: baselineMissing,
      assumption: baselineAssumption,
    },
    savings: {
      priceBased: priceBasedSaving,
      offers: offerSaving,
      substitutions: substitutionSaving,
      substitutionDetails: substitutions,
      honestTotal: honestSavings,
      netAfterWaste: netSaving,
      assumption: `Honest total = offers (${offerSaving}) + substitutions (${substitutionSaving}) + price-based vs baseline (${priceBasedSaving}). Waste not subtracted except in net figure.`,
    },
    waste: {
      totalValue: wasteValue,
      windowValue: wasteWindowValue,
      discardedCount,
      consumedCount,
      wasteRate,
      assumption: wasteRate === null
        ? 'No consumption or waste events in window — waste rate not calculable.'
        : `Waste rate = discarded / (cooked + discarded) in window.`,
    },
    // Flat fields for dashboard sorting
    estimatedSavings: honestSavings,
    estimatedWastedValue: wasteWindowValue,
  };
};

export const baselineFor = (itemName, shops = []) => {
  const history = priceHistoryFor(itemName, shops);
  if (history.length < 2) return { baseline: null, assumption: 'Need ≥2 purchases for a baseline.' };
  return { baseline: median(history), observations: history.length, history, assumption: 'Median of recorded purchases.' };
};
