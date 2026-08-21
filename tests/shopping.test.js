import { describe, it, expect } from 'vitest';
import {
  aisleFor, applyOffers, basketProjection, cheapestFor, compareStores, expiryBuckets,
  groupForStore, mergeItems, refile, rememberAisle, restockSuggestions, routeFor,
  findShoppingDuplicate, parseVoiceShopping, priceAlertMatches, quantitySuggestion, routeFromTicks,
  savingsAvailable, wasteSummary,
} from '../src/lib/shopping.js';
import { priceHistory } from '../src/lib/kitchen.js';

const item = (name, price = 0, extra = {}) => ({ id: name, name, price, aisle: 'Other', ...extra });

const SHOPS = [
  {
    id: 's1', date: '2026-07-01', store: 'Tesco', total: 12,
    items: [{ name: 'Pasta', price: 1.2 }, { name: 'Olive oil', price: 4.5 }, { name: 'Milk', price: 1.3 }],
  },
  {
    id: 's2', date: '2026-07-08', store: 'Aldi', total: 9,
    items: [{ name: 'Pasta', price: 0.79 }, { name: 'Milk', price: 1.1 }],
  },
  {
    id: 's3', date: '2026-07-15', store: 'Tesco', total: 11,
    items: [{ name: 'Pasta', price: 1.3 }, { name: 'Milk', price: 1.35 }],
  },
];

describe('aisles that learn', () => {
  it('guesses from the name until you tell it otherwise', () => {
    expect(aisleFor('Bananas')).toBe('Fruit & veg');
    const memory = rememberAisle({}, 'Bananas', 'Frozen');
    expect(aisleFor('Bananas', memory)).toBe('Frozen');
    expect(aisleFor('BANANAS ', memory)).toBe('Frozen'); // however you type it
    expect(rememberAisle(memory, 'Bananas', null)).toBe(memory);
  });

  it('re-files a list with everything it has been taught', () => {
    const memory = rememberAisle({}, 'Tofu', 'Frozen');
    const [tofu, bread] = refile([item('Tofu'), item('Bread')], memory);
    expect(tofu.aisle).toBe('Frozen');
    expect(bread.aisle).toBe('Other'); // untouched
  });
});

describe('the route round a shop', () => {
  it('is the order you ticked things off in', () => {
    const ticked = [
      item('Bread', 1, { aisle: 'Bakery', checked: true, checkedAt: 30 }),
      item('Apples', 1, { aisle: 'Fruit & veg', checked: true, checkedAt: 10 }),
      item('Bagels', 2, { aisle: 'Bakery', checked: true, checkedAt: 40 }),
      item('Peas', 1, { aisle: 'Frozen', checked: false }),
    ];
    expect(routeFromTicks(ticked)).toEqual(['Fruit & veg', 'Bakery']);
    expect(routeFromTicks([])).toEqual([]);
  });

  it('walks a learned route first, then everything else', () => {
    const routes = { Aldi: ['Bakery', 'Fruit & veg'] };
    expect(routeFor('Aldi', routes).slice(0, 2)).toEqual(['Bakery', 'Fruit & veg']);
    expect(routeFor('Aldi', routes)).toContain('Frozen');
    expect(routeFor('Nowhere', routes)[0]).toBe('Fruit & veg'); // the standard order
  });

  it('groups a list in that order, with what it has learned about aisles', () => {
    const list = [item('Bread', 1, { aisle: 'Bakery' }), item('Apples', 1, { aisle: 'Fruit & veg' })];
    const grouped = groupForStore(list, { store: 'Aldi', routes: { Aldi: ['Bakery', 'Fruit & veg'] } });
    expect(grouped.map(([aisle]) => aisle)).toEqual(['Bakery', 'Fruit & veg']);

    const relearned = groupForStore(list, { memory: { apples: 'Frozen' } });
    expect(relearned.find(([a]) => a === 'Frozen')[1][0].name).toBe('Apples');
  });
});

describe('price comparison from your own receipts', () => {
  it('prices the same list at each shop, and says how much it could price', () => {
    const list = [item('Pasta'), item('Milk'), item('Sourdough')];
    const rows = compareStores(list, SHOPS);
    expect(rows.map((r) => r.store)).toEqual(expect.arrayContaining(['Tesco', 'Aldi']));

    const tesco = rows.find((r) => r.store === 'Tesco');
    const aldi = rows.find((r) => r.store === 'Aldi');
    expect(tesco.total).toBeCloseTo(1.3 + 1.35, 2); // the latest Tesco prices
    expect(aldi.total).toBeCloseTo(0.79 + 1.1, 2);
    expect(tesco.covered).toBe(2);
    expect(tesco.of).toBe(3); // it never pretends to price the sourdough
    expect(compareStores(list, [])).toEqual([]);
  });

  it('finds the cheapest you have ever paid, and where', () => {
    const history = priceHistory(SHOPS);
    expect(cheapestFor('Pasta', history)).toMatchObject({ price: 0.79, store: 'Aldi', times: 3 });
    expect(cheapestFor('Caviar', history)).toBeNull();
  });

  it('flags what you are about to overpay for', () => {
    const savings = savingsAvailable([item('Pasta', 1.3), item('Milk', 1.0)], SHOPS);
    expect(savings).toHaveLength(1);
    expect(savings[0]).toMatchObject({ name: 'Pasta', best: 0.79, store: 'Aldi' });
    expect(savings[0].saving).toBeCloseTo(0.51, 2);
  });

  it('fires price alerts only when a recorded price reaches the target', () => {
    const alerts = [
      { id: 'a1', name: 'Pasta', target: 0.8 },
      { id: 'a2', name: 'Milk', target: 1 },
    ];
    expect(priceAlertMatches(alerts, SHOPS)).toEqual([
      expect.objectContaining({ id: 'a1', latest: 0.79, hit: true }),
      expect.objectContaining({ id: 'a2', latest: 1.1, hit: false }),
    ]);
  });
});

describe('offers you entered', () => {
  const list = [item('Pasta', 1.2), item('Pasta sauce', 2), item('Milk', 1.3)];

  it('takes money off what it matches', () => {
    const { lines, saved } = applyOffers(list, [{ id: 'o1', label: '£1 off pasta', match: 'pasta', kind: 'money', value: 1 }]);
    expect(saved).toBe(1);
    expect(lines[0].items).toEqual(['Pasta', 'Pasta sauce']);
  });

  it('takes a percentage off', () => {
    const { saved } = applyOffers(list, [{ id: 'o2', label: '25% off milk', match: 'milk', kind: 'percent', value: 25 }]);
    expect(saved).toBeCloseTo(0.33, 2);
  });

  it('works a multibuy out on the cheapest of each group', () => {
    const three = [item('Soup', 1), item('Soup box', 2), item('Soup tin', 3)];
    const { saved } = applyOffers(three, [{ id: 'o3', label: '3 for 2 soup', match: 'soup', kind: 'multibuy', value: 3 }]);
    expect(saved).toBe(1); // the cheapest of the three is free
    const two = applyOffers([item('Soup', 1), item('Soup tin', 3)], [{ id: 'o3', label: '3 for 2', match: 'soup', kind: 'multibuy', value: 3 }]);
    expect(two.saved).toBe(0); // not enough for the deal yet
  });

  it('ignores an offer nothing on the list matches', () => {
    expect(applyOffers(list, [{ id: 'o4', label: '£2 off wine', match: 'wine', kind: 'money', value: 2 }])).toEqual({ lines: [], saved: 0 });
    expect(applyOffers([], [{ id: 'o5', label: 'x', match: 'pasta', kind: 'money', value: 1 }]).saved).toBe(0);
  });

  it('does not apply expired coupons or coupons for another store', () => {
    const offer = { id: 'o6', label: '£1 off pasta', match: 'pasta', kind: 'money', value: 1, store: 'Tesco' };
    expect(applyOffers(list, [offer], { store: 'Aldi', today: '2026-07-28' }).saved).toBe(0);
    expect(applyOffers(list, [{ ...offer, expiry: '2026-07-27' }], { store: 'Tesco', today: '2026-07-28' }).saved).toBe(0);
    expect(applyOffers(list, [{ ...offer, expiry: '2026-07-29' }], { store: 'Tesco', today: '2026-07-28' }).saved).toBe(1);
  });

  it('keeps store-only offers on items assigned to that store', () => {
    const list = [item('Milk', 1.2, { store: 'Aldi' }), item('Milk', 1.3, { store: 'Tesco' })];
    const offer = { id: 'o7', label: '£1 off milk', match: 'milk', kind: 'money', value: 1, store: 'Tesco' };
    const result = applyOffers(list, [offer]);
    expect(result.saved).toBe(1);
    expect(result.lines[0].items).toEqual(['Milk']);
  });
});

describe('voice shopping', () => {
  it('splits spoken items and keeps their quantities', () => {
    const parsed = parseVoiceShopping('add two cartons of milk, 3 bananas and 500g chicken breast');
    expect(parsed.items).toEqual([
      { name: 'milk', qty: '2 cartons' },
      { name: 'bananas', qty: '3' },
      { name: 'chicken breast', qty: '500 g' },
    ]);
  });

  it('handles a spoken command and items without quantities', () => {
    expect(parseVoiceShopping('please buy a bag of spinach plus olive oil').items).toEqual([
      { name: 'spinach', qty: '1 bag' },
      { name: 'olive oil', qty: '' },
    ]);
    expect(parseVoiceShopping('add an apple and 2 litres of milk')).toEqual({
      items: [{ name: 'apple', qty: '1' }, { name: 'milk', qty: '2 l' }],
      heard: 'an apple and 2 litres of milk',
    });
    expect(parseVoiceShopping('a loaf of bread').items).toEqual([{ name: 'bread', qty: '1 loaf' }]);
    expect(parseVoiceShopping('500 grams chicken and 250 millilitres stock').items).toEqual([
      { name: 'chicken', qty: '500 g' },
      { name: 'stock', qty: '250 ml' },
    ]);
    expect(parseVoiceShopping('add 2 x 500 grams chicken').items).toEqual([{ name: 'chicken', qty: '2 x 500g' }]);
    expect(parseVoiceShopping('')).toEqual({ items: [], heard: '' });
    expect(parseVoiceShopping('add')).toEqual({ items: [], heard: 'add' });
  });
});

describe('shopping duplicate detection', () => {
  it('catches normalised singular/plural duplicates', () => {
    const result = findShoppingDuplicate('BANANAS', [item('Banana')]);
    expect(result).toMatchObject({ kind: 'exact', item: { name: 'Banana' } });
  });

  it('flags close pack-name variants without blocking distinct short names', () => {
    expect(findShoppingDuplicate('oat milk 1l', [item('Oat milk')])).toMatchObject({ kind: 'similar' });
    expect(findShoppingDuplicate('milk', [item('Oat milk')])).toBeNull();
  });
});

describe('quantity suggestions', () => {
  it('uses the most common recorded quantity and breaks ties by the latest shop', () => {
    const shops = [
      { items: [{ name: 'Milk', qty: '2 pints' }] },
      { items: [{ name: 'MILK', qty: '2 pints' }] },
      { items: [{ name: 'Milk', qty: '4 pints' }] },
    ];
    expect(quantitySuggestion('milk', shops)).toEqual({ qty: '2 pints', times: 3, matches: 2 });
    expect(quantitySuggestion('Bread', shops)).toBeNull();
  });

  it('uses the latest quantity when there is no usual pack size', () => {
    expect(quantitySuggestion('Rice', [
      { items: [{ name: 'Rice', qty: '500 g' }] },
      { items: [{ name: 'Rice', qty: '1 kg' }] },
    ])).toMatchObject({ qty: '1 kg', times: 2, matches: 1 });
  });
});

describe('the basket against your budget', () => {
  it('projects the total after your offers, and the headroom left', () => {
    const list = [item('Pasta', 1.2), item('Milk', 1.3), item('Bread')];
    const p = basketProjection(list, {
      budget: 40,
      spent: 30,
      offers: [{ id: 'o1', label: '£1 off pasta', match: 'pasta', kind: 'money', value: 1 }],
    });
    expect(p.total).toBe(2.5);
    expect(p.saved).toBe(1);
    expect(p.projected).toBe(1.5);
    expect(p.left).toBe(8.5);
    expect(p.over).toBe(false);
    expect(p.unpriced).toBe(1); // the bread has no price, and it says so
  });

  it('says when the shop would take you over', () => {
    const p = basketProjection([item('Weekly shop', 55)], { budget: 60, spent: 20 });
    expect(p.over).toBe(true);
    expect(p.left).toBe(-15);
  });

  it('has no opinion without a budget', () => {
    expect(basketProjection([item('Milk', 1)], {}).left).toBeNull();
    expect(basketProjection([], {}).total).toBe(0);
  });
});

describe('the pantry', () => {
  const days = { '2026-07-01': -3, '2026-07-04': 0, '2026-07-06': 2, '2026-07-10': 6, '2026-08-01': 28 };
  const pantry = Object.entries(days).map(([expiry], i) => ({ id: `p${i}`, name: `Item ${i}`, expiry, cost: i }));
  const daysUntil = (stamp) => days[stamp];

  it('sorts what is going off into buckets, soonest first', () => {
    const buckets = expiryBuckets(pantry, daysUntil);
    expect(buckets.map((b) => b.id)).toEqual(['gone', 'today', 'soon', 'week']);
    expect(buckets[0].items[0].item.expiry).toBe('2026-07-01');
    expect(buckets.flatMap((b) => b.items).some((d) => d.item.expiry === '2026-08-01')).toBe(false);
    expect(expiryBuckets([{ id: 'x', name: 'Salt' }], daysUntil)).toEqual([]);
  });

  it('adds up what you threw away', () => {
    const w = wasteSummary([{ name: 'Spinach', cost: 1.2 }, { name: 'Cream', cost: 2.5 }]);
    expect(w.count).toBe(2);
    expect(w.cost).toBe(3.7);
    expect(w.worst.name).toBe('Cream');
    expect(wasteSummary([])).toMatchObject({ count: 0, cost: 0, worst: null });
  });

  it('suggests restocking only what you have bought more than once', () => {
    const out = restockSuggestions(SHOPS, [], []);
    expect(out.map((r) => r.name)).toEqual(['Pasta', 'Milk']); // olive oil was a one-off
    expect(restockSuggestions(SHOPS, [{ name: 'Pasta' }], [])).toHaveLength(1);
    expect(restockSuggestions(SHOPS, [], [{ name: 'Milk' }]).map((r) => r.name)).toEqual(['Pasta']);
    expect(restockSuggestions([], [], [])).toEqual([]);
  });
});

describe('meals to shopping', () => {
  it('merges a duplicate ingredient into one line, keeping every meal that wanted it', () => {
    const merged = mergeItems([
      { name: 'Chicken breast', qty: '300 g', fromRecipe: 'Traybake' },
      { name: 'chicken breast', qty: '150 g', fromRecipe: 'Stir-fry' },
      { name: 'Rice', qty: '180 g', fromRecipe: 'Stir-fry' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].qty).toBe('450 g');
    expect(merged[0].fromRecipe).toBe('2 meals');
    expect(merged[1].fromRecipe).toBe('Stir-fry');
  });

  it('consolidates two names for one ingredient into a single row', () => {
    // Two recipes, two spellings, one tin aisle. The list used to carry both.
    const merged = mergeItems([
      { name: 'Chopped tomatoes', qty: '400 g', fromRecipe: 'Chilli' },
      { name: 'Tinned tomatoes', qty: '1 tin', fromRecipe: 'Ragu' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe('800 g');
    expect(merged[0].name).toBe('Chopped tomatoes');
    expect(merged[0].alsoKnownAs).toEqual(['Tinned tomatoes']);
    expect(merged[0].fromRecipe).toBe('2 meals');
  });

  it('consolidates on a correction the household taught it', () => {
    const merged = mergeItems(
      [
        { name: 'Chicken breast', qty: '300 g', fromRecipe: 'Traybake' },
        { name: 'Chicken fillets', qty: '200 g', fromRecipe: 'Stir-fry' },
      ],
      { learnedAliases: { 'chicken fillets': 'chicken breast' } },
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe('500 g');
  });

  it('will not merge two different foods that merely read alike', () => {
    const merged = mergeItems([
      { name: 'Coconut milk', qty: '1 tin' },
      { name: 'Semi-skimmed milk', qty: '500 ml' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('keeps mass and volume separate rather than summing them', async () => {
    const { mergeQtys, qtySuffices } = await import('../src/lib/pantry.js');
    expect(mergeQtys('100 g', '100 ml')).toBe('100 g + 100 ml');
    expect(mergeQtys('200 ml', '300 ml')).toBe('500 ml');
    expect(qtySuffices('100 g', '100 ml')).toBeNull();
    expect(qtySuffices('500 g', '300 g')).toBe(true);
    expect(qtySuffices('100 ml', '200 ml')).toBe(false);
  });

  it('parses mixed fractions for countable items', async () => {
    const { parseQtyAmount } = await import('../src/lib/pantry.js');
    expect(parseQtyAmount('½ lemon')?.amount).toBeCloseTo(0.5, 5);
    expect(parseQtyAmount('1 ½ lemons')?.amount).toBeCloseTo(1.5, 5);
    expect(parseQtyAmount('1½ lemons')?.amount).toBeCloseTo(1.5, 5);
    expect(parseQtyAmount('2.5 tins')?.amount).toBeCloseTo(1000, 5); // 2.5 * 400g normalised
  });
});
