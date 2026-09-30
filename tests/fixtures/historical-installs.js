/**
 * Real saved installs, from earlier versions of Forq.
 *
 * Migration tests are only worth writing against shapes that actually shipped.
 * A fixture built by filling in today's `EMPTY_STATE` proves nothing: it is
 * already valid, so it exercises none of the repair paths. These are hand-built
 * from what each version actually wrote, including the fields that have since
 * been renamed, dropped or re-typed — which is exactly where hydration earns
 * its keep.
 *
 * Every fixture is a plain object. The tests deep-freeze them, so a migration
 * that mutated its input would throw rather than pass quietly.
 */

/** v1 — the first shipped shape. No schemaVersion, no members, no plan. */
export const V1_INSTALL = {
  onboarded: true,
  name: 'Ada',
  day: '2026-02-10',
  plan: {},
  pantry: [
    { id: 'p1', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: '2027-01-01' },
    { id: 'p2', name: 'Spinach', qty: '200 g', location: 'Fridge', expiry: '2026-02-12' },
  ],
  shoppingList: [
    { id: 's1', name: 'Milk', qty: '2 l', price: 1.35, checked: false, aisle: 'Dairy & eggs' },
    { id: 's2', name: 'Bread', qty: '1 loaf', price: 0.9, checked: true, aisle: 'Bakery' },
  ],
  log: {
    '2026-02-09': [
      { foodId: 'oats', name: 'Oats', grams: 50, kcal: 190, per100: { kcal: 380, protein: 13, carbs: 67, fat: 7 } },
    ],
  },
  shops: [
    { id: 'sh1', date: '2026-02-08', store: 'Sainsbury', total: 23.4, items: [{ name: 'Milk', price: 1.35, qty: '2 l' }] },
  ],
};

/** v2 — households arrived: members with a role and a permissions bag. */
export const V2_INSTALL = {
  ...V1_INSTALL,
  schemaVersion: 2,
  day: '2026-03-04',
  members: [{ id: 'm1', name: 'Ada', role: 'adult' }],
  household: 2,
  householdName: 'Ada & Sam',
  activeMemberId: 'm1',
  plan: { '2026-03-05': { dinner: 'chickpea-curry' } },
  permissions: { shopping: true, pantry: true },
};

/** v3 — the evidence books. Versions were added per book as they were defined. */
export const V3_INSTALL = {
  ...V2_INSTALL,
  schemaVersion: 3,
  day: '2026-04-18',
  priceAlertConfig: { risePct: 15, bargainPct: 20, overrides: { milk: { risePct: 5 } } },
  coupons: [{ id: 'c1', label: '£1 off yoghurt', kind: 'money', value: 1 }],
  offers: [],
  shoppingPredictions: [
    { id: 'sp1', type: 'prediction_snapshot', name: 'Milk', amount: 2, unit: 'l' },
    { nonsense: true },
  ],
  quantityOverrides: [
    { schemaVersion: 1, id: 'q1', ingredient: 'chicken breast', amount: 500, unit: 'g' },
  ],
  basketPredictions: [],
  predictionCorrections: [],
};

/** v4 — the current shape, mid-use, with the health vault enabled. */
export const V4_INSTALL = {
  ...V3_INSTALL,
  schemaVersion: 4,
  day: '2026-05-20',
  healthVaultEnabled: true,
  measurements: [{ id: 'ms1', key: 'weightKg', value: 68.4, date: '2026-05-19' }],
  // Real trip/cook/waste shapes as the app writes them: shops are trip
  // records (no `name`, id always present), cooks are {recipeId,date}
  // outcomes with no id at all, and waste rows are {name,…,date} with no id.
  // All of them must survive hydration — spend, streaks and price history
  // are built from them.
  shops: [
    ...V1_INSTALL.shops,
    { id: 'sh2', date: '2026-05-17', store: 'Tesco', total: 12.1, items: [{ name: 'Eggs', price: 2.1 }] },
  ],
  cooked: [
    { recipeId: 'chickpea-curry', date: '2026-05-18', portions: 2 },
    { id: 'c2', recipeId: 'chicken-traybake', date: '2026-05-17', portions: 4 },
  ],
  waste: [
    { name: 'Spinach', qty: '200 g', date: '2026-05-14', cause: 'expired' },
    { id: 'w2', name: 'Milk', qty: '1 l', date: '2026-05-13', cause: 'expired' },
  ],
  leftovers: [],
  trackingCycle: false,
};

/**
 * A v4 install damaged the way files actually get damaged: a truncated
 * upload, a half-applied migration, a hand-edited export. Each key is broken
 * in a way that would reach product logic as a wrong number if it were not
 * stopped at the boundary.
 */
export const DAMAGED_INSTALL = {
  onboarded: true,
  name: 'Ada',
  day: '2026-05-20',
  pantry: [
    { id: 'p1', name: 'Rice', qty: '1 kg', expiry: '2027-01-01' },
    // A row with an id but no name cannot be cooked, expired or subtracted —
    // it is a row that lost its name, and half a row is worse than none.
    { id: 'p2', qty: '3 kg' },
    // A row with no id at all: nothing in the app could tick, edit or remove
    // it, so it is not a row.
    { name: 'Anonymous', qty: '1 kg' },
    null,
    'not an object',
    // An expiry that is not a date would sort as "never" and read as fresh.
    { id: 'p3', name: 'Spinach', qty: '200 g', expiry: 'next tuesday' },
  ],
  shoppingList: [
    { id: 's1', name: 'Milk', price: 1.35, priceSource: 'receipt', checked: false },
    // An unsourced price must read as unknown, never as a fact.
    { id: 's2', name: 'Bread', price: 0.9 },
    // A price that is a word is not a price.
    { id: 's3', name: 'Eggs', price: 'about a pound' },
    { qty: '2 l' },
  ],
  plan: {
    '2026-05-21': { dinner: 'chickpea-curry', lunch: '' },
    // A day key that is not a date, and a day whose value is not a map.
    'next week': { dinner: 'pasta' },
    '2026-05-22': 'chickpea-curry',
    '2026-05-23': { breakfast: null, dinner: 'porridge' },
  },
  log: {
    '2026-05-19': [
      { foodId: 'oats', name: 'Oats', grams: 50, per100: { kcal: 380 } },
      // An entry with no food is not a diary entry.
      { name: 'Mystery', kcal: 200 },
      null,
    ],
    'yesterday': [{ foodId: 'milk', name: 'Milk' }],
    '2026-05-18': 'not an array',
  },
  shops: [
    { id: 'sh1', date: '2026-05-18', store: 'Sainsbury', total: 23.4, items: [{ name: 'Milk', price: 1.35 }, null] },
    { id: 'sh2' },
  ],
};
