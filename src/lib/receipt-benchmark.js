/**
 * Receipt parser benchmark — score the parser against a corpus of receipts.
 *
 * The seed corpus models real UK layouts across Tesco, Sainsbury's, Aldi,
 * Lidl, Morrisons, Asda, Waitrose, Co-op and an independent shop, and
 * exercises every line type the app claims to read: weighed goods, quantity
 * prefixes, split descriptions, multiline items, loyalty prices, multibuy
 * savings, coupons and refunds — plus a receipt that should be rejected.
 *
 * It scales by appending: drop real receipts in as new `cases` with the same
 * shape as SEED_CORPUS entries. Nothing else changes; the metrics are
 * per-field so a parser that reads prices perfectly but loses names can't
 * hide behind an average.
 */

import { parseReceipt } from './receipt.js';

const lower = (s) => String(s || '').trim().toLowerCase();
const near = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) <= eps;

export const SEED_CORPUS = [
  {
    name: 'tesco-basic', retailer: 'Tesco', features: [],
    text: 'TESCO EXTRA\n14/08/2026\nBananas 6pk\n£1.10\nSemi-skimmed milk 2 pint\n£1.65\nWarburtons toastie\n£1.40\nTotal £4.15',
    expect: { store: 'Tesco', date: '2026-08-14', total: 4.15, items: [
      { name: 'bananas 6pk', price: 1.1 },
      { name: 'semi-skimmed milk 2 pint', price: 1.65 },
      { name: 'warburtons toastie', price: 1.4 },
    ] },
  },
  {
    name: 'sainsburys-weighed', retailer: "Sainsbury's", features: ['weighed'],
    text: "SAINSBURY'S\n2026-08-12\nBraeburn apples\n0.482 kg @ £2.39/kg\n£1.15\nTotal £1.15",
    expect: { store: "Sainsbury's", date: '2026-08-12', total: 1.15, items: [
      { name: 'braeburn apples', price: 1.15 },
    ] },
  },
  {
    name: 'asda-multiline', retailer: 'Asda', features: ['multiline'],
    text: 'ASDA\n12/08/2026\nChilled ready meal\nchicken korma 400g\n£3.20\nASDA smart price rice\n£0.45\nTotal £3.65',
    expect: { store: 'Asda', date: '2026-08-12', total: 3.65, items: [
      { name: 'chicken korma 400g', price: 3.2 },
      { name: 'smart price rice', price: 0.45 },
    ] },
  },
  {
    name: 'aldi-qty-prefix', retailer: 'Aldi', features: ['qty-prefix'],
    text: 'ALDI\n11/08/2026\nYoghurt 4pk\n2 x @ £1.25\n£2.50\nTotal £2.50',
    expect: { store: 'Aldi', date: '2026-08-11', total: 2.5, items: [
      { name: 'yoghurt 4pk', price: 2.5 },
    ] },
  },
  {
    name: 'morrisons-multibuy', retailer: 'Morrisons', features: ['multibuy'],
    text: 'MORRISONS\n09/08/2026\nYoghurt 4pk\n£2.50\nMULTIBUY SAVING\n-£0.50\nTotal £2.50',
    expect: { store: 'Morrisons', date: '2026-08-09', total: 2.5, saved: 0.5, items: [
      { name: 'yoghurt 4pk', price: 2.5 },
    ] },
  },
  {
    name: 'lidl-coupon', retailer: 'Lidl', features: ['coupon'],
    text: 'LIDL\n08/08/2026\nPenne pasta 500g\n£0.95\nCOUPON £0.50 OFF\nTotal £0.45',
    expect: { store: 'Lidl', date: '2026-08-08', total: 0.45, coupons: 1, items: [
      { name: 'penne pasta 500g', price: 0.95 },
    ] },
  },
  {
    name: 'waitrose-loyalty-price', retailer: 'Waitrose', features: ['loyalty'],
    text: 'WAITROSE\n07/08/2026\nHeinz beans\n£0.80\nCLUBCARD SAVING\n-£0.40\nTotal £0.80',
    expect: { store: 'Waitrose', date: '2026-08-07', total: 0.8, saved: 0.4, items: [
      { name: 'heinz beans', price: 0.8 },
    ] },
  },
  {
    name: 'coop-independent', retailer: 'Co-op / independent', features: ['independent'],
    text: 'CORNER SHOP SW9\n06/08/2026\nFree-range eggs\n£1.85\nTotal £1.85',
    expect: { independent: true, date: '2026-08-06', total: 1.85, items: [
      { name: 'free-range eggs', price: 1.85 },
    ] },
  },
  {
    name: 'sainsburys-refund', retailer: "Sainsbury's", features: ['refund'],
    text: "SAINSBURY'S\n05/08/2026\nYogurt REFUND\n-£1.85\nMilk 4pt\n£1.85\nTotal £0.00",
    expect: { store: "Sainsbury's", date: '2026-08-05', total: 0, refundNames: ['yogurt'], items: [
      { name: 'milk 4pt', price: 1.85 },
    ] },
  },
  {
    name: 'asda-split-description', retailer: 'Asda', features: ['split'],
    text: 'ASDA\n04/08/2026\nASDA grower’s selection\nvine tomatoes 500g\n£0.98\nTotal £0.98',
    expect: { store: 'Asda', date: '2026-08-04', total: 0.98, items: [
      { name: 'vine tomatoes 500g', price: 0.98 },
    ] },
  },
  {
    name: 'tesco-substitution', retailer: 'Tesco', features: ['substitution'],
    text: 'TESCO\n03/08/2026\nBaby spinach (SUBSTITUTE)\n£0.90\nTotal £0.90',
    expect: { store: 'Tesco', date: '2026-08-03', total: 0.9, substitution: true, items: [
      { name: 'baby spinach (substitute)', price: 0.9 },
    ] },
  },
  {
    name: 'unreadable-garbage', retailer: 'unknown', features: ['unreadable'],
    text: 'SOME SHOP\nthanks for visiting\nplease come again',
    expect: { error: true },
  },
];

const matchItems = (got = [], expected = []) => {
  let matched = 0;
  for (const want of expected) {
    const hit = got.find((item) =>
      lower(item.name).includes(lower(want.name))
      || lower(want.name).includes(lower(item.name)));
    if (hit && near(hit.price, want.price)) matched += 1;
  }
  return { matched };
};

/** Score one receipt case; every field reports its own hit or miss. */
export const scoreCase = (testCase) => {
  const parsed = parseReceipt(testCase.text);
  const exp = testCase.expect;
  if (exp.error) {
    const rejected = Boolean(parsed.error) && !parsed.items.length;
    return { name: testCase.name, retailer: testCase.retailer, features: testCase.features || [],
      expectedItems: 0, matchedItems: 0, itemRecall: 1,
      fieldHits: { rejected }, pass: rejected };
  }
  const { matched } = matchItems(parsed.items, exp.items);
  const fields = {
    store: exp.independent ? parsed.store === 'Independent shop' : (!exp.store || parsed.store === exp.store),
    date: !exp.date || parsed.date === exp.date,
    balanced: exp.total != null ? parsed.balanced === true && near(parsed.netTotal ?? parsed.itemTotal, exp.total) : null,
    saved: exp.saved != null ? near(parsed.savedTotal || 0, exp.saved) : null,
    coupons: exp.coupons != null ? parsed.coupons.length === exp.coupons : null,
    refunds: exp.refundNames
      ? exp.refundNames.every((n) => (parsed.refunds || []).some((r) => lower(r.name).includes(lower(n))))
      : null,
    substitution: exp.substitution != null
      ? parsed.items.some((i) => (i.flags || []).includes('substitution')) === exp.substitution
      : null,
  };
  return {
    name: testCase.name,
    retailer: testCase.retailer,
    features: testCase.features || [],
    expectedItems: exp.items.length,
    matchedItems: matched,
    itemRecall: exp.items.length ? matched / exp.items.length : 1,
    fieldHits: fields,
    pass: matched === exp.items.length && Object.values(fields).every((v) => v !== false),
  };
};

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

/** Aggregate over a corpus — per-field accuracy plus per-feature/per-retailer views. */
export const benchmarkReceipts = (cases = SEED_CORPUS) => {
  const scored = cases.map(scoreCase);
  const featureScores = {};
  const retailerScores = {};
  for (const row of scored) {
    for (const f of row.features) {
      featureScores[f] = featureScores[f] || { cases: 0, passed: 0 };
      featureScores[f].cases += 1;
      if (row.pass) featureScores[f].passed += 1;
    }
    retailerScores[row.retailer] = retailerScores[row.retailer] || { cases: 0, passed: 0 };
    retailerScores[row.retailer].cases += 1;
    if (row.pass) retailerScores[row.retailer].passed += 1;
  }
  const withSaved = scored.filter((r) => r.fieldHits.saved !== null && r.fieldHits.saved !== undefined);
  const withCoupons = scored.filter((r) => r.fieldHits.coupons !== null);
  const withRefunds = scored.filter((r) => r.fieldHits.refunds !== null);
  const balanceCases = scored.filter((r) => r.fieldHits.balanced !== null);
  return {
    corpusSize: cases.length,
    cases: scored.length,
    passed: scored.filter((r) => r.pass).length,
    itemRecallPct: pct(scored.reduce((s, r) => s + r.matchedItems, 0), scored.reduce((s, r) => s + r.expectedItems, 0)),
    fieldAccuracy: {
      store: pct(scored.filter((r) => r.fieldHits.store === true).length, scored.filter((r) => typeof r.fieldHits.store === 'boolean').length),
      date: pct(scored.filter((r) => r.fieldHits.date === true).length, scored.length),
      totalsBalance: pct(balanceCases.filter((r) => r.fieldHits.balanced === true).length, balanceCases.length),
      discountsCaptured: pct(withSaved.filter((r) => r.fieldHits.saved === true).length, withSaved.length),
      couponsCaptured: pct(withCoupons.filter((r) => r.fieldHits.coupons === true).length, withCoupons.length),
      refundsCaptured: pct(withRefunds.filter((r) => r.fieldHits.refunds === true).length, withRefunds.length),
    },
    byFeature: Object.fromEntries(Object.entries(featureScores).map(([f, v]) => [f, pct(v.passed, v.cases)])),
    byRetailer: Object.fromEntries(Object.entries(retailerScores).map(([r, v]) => [r, pct(v.passed, v.cases)])),
    failing: scored.filter((r) => !r.pass).map((r) => r.name),
  };
};
