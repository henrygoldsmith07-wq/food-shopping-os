import { describe, expect, it } from 'vitest';
import {
  addQuantities, compareUnitPrices, convert, formatQuantity, parseQuantity,
  scaleQuantity, subtractQuantities, sufficientFor, unitPriceOf,
} from '../src/lib/measure.js';
import { packageSize } from '../src/data/package-sizes.js';
import { RECIPES } from '../src/data/recipes.js';

describe('reading a quantity', () => {
  it('reads the metric amounts a packet is labelled with', () => {
    expect(parseQuantity('400 g')).toMatchObject({ amount: 400, dim: 'mass', unit: 'g' });
    expect(parseQuantity('1.5kg')).toMatchObject({ amount: 1500, dim: 'mass' });
    expect(parseQuantity('200ml')).toMatchObject({ amount: 200, dim: 'volume', unit: 'ml' });
    expect(parseQuantity('1L')).toMatchObject({ amount: 1000, dim: 'volume' });
    expect(parseQuantity('1 litre')).toMatchObject({ amount: 1000, dim: 'volume' });
    expect(parseQuantity('1 kg 500 g')).toMatchObject({ amount: 1500, dim: 'mass' });
  });

  it('reads the spoons and cups recipes are written in', () => {
    expect(parseQuantity('1 tsp')).toMatchObject({ amount: 5, dim: 'volume' });
    expect(parseQuantity('3 tbsp')).toMatchObject({ amount: 45, dim: 'volume' });
    expect(parseQuantity('2 tablespoons')).toMatchObject({ amount: 30, dim: 'volume' });
    // A cup is a real measure but an ambiguous one, and says so.
    expect(parseQuantity('1 cup')).toMatchObject({ dim: 'volume', confidence: 'approximate' });
  });

  it('reads imperial amounts from an imported recipe', () => {
    expect(parseQuantity('8 oz').amount).toBeCloseTo(226.8, 1);
    expect(parseQuantity('1 lb').amount).toBeCloseTo(453.59, 1);
    expect(parseQuantity('2 fl oz').amount).toBeCloseTo(56.83, 1);
    expect(parseQuantity('1 pint').amount).toBeCloseTo(568.26, 1);
  });

  it('reads fractions however they are written', () => {
    expect(parseQuantity('½ lemon')).toMatchObject({ amount: 0.5, unit: 'lemon' });
    expect(parseQuantity('1/2 pack')).toMatchObject({ dim: 'mass' });
    expect(parseQuantity('1 ½ lemons').amount).toBeCloseTo(1.5);
    expect(parseQuantity('1½ lemons').amount).toBeCloseTo(1.5);
    expect(parseQuantity('1 1/2 tbsp').amount).toBeCloseTo(22.5);
    expect(parseQuantity('half a lemon')).toMatchObject({ amount: 0.5, unit: 'lemon' });
  });

  it('reads a multipack as the total it holds', () => {
    expect(parseQuantity('3 x 200g')).toMatchObject({ amount: 600, dim: 'mass' });
    expect(parseQuantity('6 × 125 g')).toMatchObject({ amount: 750, dim: 'mass' });
    expect(parseQuantity('2 tins (400g)')).toMatchObject({ amount: 800, dim: 'mass' });
  });

  it('marks a hedge or a range as approximate instead of pretending', () => {
    expect(parseQuantity('about 400g')).toMatchObject({ amount: 400, confidence: 'approximate' });
    expect(parseQuantity('2-3 tbsp')).toMatchObject({ confidence: 'approximate', range: { min: 2, max: 3 } });
    // A range plans against its top, so a shopping list never sends you short.
    expect(parseQuantity('2-3 tbsp').amount).toBe(45);
    expect(parseQuantity('a pinch')).toMatchObject({ confidence: 'approximate', vague: true });
  });

  it('returns nothing at all for text that holds no quantity', () => {
    expect(parseQuantity('to serve')).toBeNull();
    expect(parseQuantity('to taste')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity(null)).toBeNull();
  });
});

describe('package sizes', () => {
  it('knows a tin of tomatoes is 400 g and a tin of coconut milk is 400 ml', () => {
    // The whole reason this table exists: these two are not the same dimension,
    // and the old code turned both into grams.
    expect(parseQuantity('1 tin', { ingredient: 'chopped tomatoes' }))
      .toMatchObject({ amount: 400, dim: 'mass', confidence: 'exact' });
    expect(parseQuantity('1 tin', { ingredient: 'coconut milk' }))
      .toMatchObject({ amount: 400, dim: 'volume', confidence: 'exact' });
  });

  it('treats a size it had to guess as approximate', () => {
    expect(parseQuantity('1 jar', { ingredient: 'honey' }).confidence).toBe('exact');
    expect(parseQuantity('1 jar', { ingredient: 'pickled walnuts' }).confidence).toBe('approximate');
    expect(packageSize('jar', 'honey').source).toBe('ingredient');
    expect(packageSize('jar', 'pickled walnuts').source).toBe('generic');
    expect(packageSize('nonsense', 'honey')).toBeNull();
  });

  it('counts a box of eggs in eggs, not in grams', () => {
    expect(parseQuantity('1 box', { ingredient: 'eggs' })).toMatchObject({ amount: 6, dim: 'count' });
  });
});

describe('comparing quantities', () => {
  it('answers whether what we have covers what is needed', () => {
    expect(sufficientFor('500 g', '400 g')).toBe(true);
    expect(sufficientFor('200 g', '400 g')).toBe(false);
    expect(sufficientFor('1 tin', '400 g', { ingredient: 'chopped tomatoes' })).toBe(true);
    expect(sufficientFor('1 tin', '500 g', { ingredient: 'chopped tomatoes' })).toBe(false);
  });

  it('refuses to compare a mass with a volume', () => {
    expect(sufficientFor('100 g', '100 ml')).toBeNull();
    expect(addQuantities('100 g', '100 ml')).toBeNull();
    expect(sufficientFor('2 tins', '3 lemons')).toBeNull();
  });

  it('crosses mass and volume only with a density, and says it did', () => {
    const spooned = parseQuantity('2 tbsp');
    expect(convert(spooned, 'mass', { ingredient: 'olive oil' }))
      .toMatchObject({ dim: 'mass', confidence: 'approximate', convertedFrom: 'volume' });
    // No density for this one, so no answer rather than an invented one.
    expect(convert(spooned, 'mass', { ingredient: 'pickled walnuts' })).toBeNull();
  });

  it('adds, subtracts and scales', () => {
    expect(addQuantities('600 g', '400 g')).toMatchObject({ amount: 1000, dim: 'mass' });
    expect(subtractQuantities('1 kg', '600 g')).toMatchObject({ amount: 400, shortfall: 0 });
    expect(subtractQuantities('300 g', '500 g')).toMatchObject({ amount: 0, shortfall: 200 });
    expect(scaleQuantity(parseQuantity('400 g'), 1.5)).toMatchObject({ amount: 600 });
  });

  it('an approximate input makes the answer approximate', () => {
    expect(addQuantities('about 200 g', '300 g').confidence).toBe('approximate');
    expect(addQuantities('200 g', '300 g').confidence).toBe('exact');
  });
});

describe('writing a quantity back', () => {
  it('writes it the way a person would', () => {
    expect(formatQuantity(parseQuantity('1000 g'))).toBe('1 kg');
    expect(formatQuantity(parseQuantity('1500 ml'))).toBe('1.5 l');
    expect(formatQuantity(parseQuantity('450 g'))).toBe('450 g');
    expect(formatQuantity(parseQuantity('½ lemon'))).toBe('½ lemon');
    expect(formatQuantity(parseQuantity('3 lemons'))).toBe('3 lemons');
    expect(formatQuantity(null)).toBe('');
  });
});

describe('unit price', () => {
  it('prices per 100 g, per 100 ml or per item', () => {
    expect(unitPriceOf(3, '2 x 500g')).toMatchObject({ value: 0.3, unit: '100g' });
    expect(unitPriceOf(1.5, '1l')).toMatchObject({ value: 0.15, unit: '100ml' });
    expect(unitPriceOf(2.4, '6')).toMatchObject({ value: 0.4, unit: 'each' });
    expect(unitPriceOf(0, '500 g')).toBeNull();
    expect(unitPriceOf(2, 'to serve')).toBeNull();
  });

  it('finds the better value and reports how much better', () => {
    const result = compareUnitPrices([
      { id: 'small', price: 1.2, qty: '500 g' },
      { id: 'big', price: 2, qty: '1 kg' },
    ]);
    expect(result.best.id).toBe('big');
    expect(result.margin).toBeGreaterThan(15);
  });

  it('will not rank per-item against per-100g', () => {
    const result = compareUnitPrices([
      { id: 'a', price: 2, qty: '6' },
      { id: 'b', price: 3, qty: '500 g' },
    ]);
    expect(result.mixedScales).toBe(true);
    expect(result.best).toBeNull();
  });

  it('keeps rows it cannot price rather than dropping them from the claim', () => {
    const result = compareUnitPrices([
      { id: 'a', price: 1.2, qty: '500 g' },
      { id: 'b', price: 3, qty: 'to taste' },
    ]);
    expect(result.incomparable.map((row) => row.id)).toEqual(['b']);
  });
});

describe('coverage against the app’s own recipe book', () => {
  const lines = RECIPES.flatMap((recipe) => (recipe.ingredients || [])
    .map((ingredient) => ({ recipe: recipe.id, ...ingredient })));

  it('reads nearly every quantity the shipped recipes are written with', () => {
    const stated = lines.filter((line) => String(line.qty || '').trim());
    const unread = stated.filter((line) => !parseQuantity(line.qty, { ingredient: line.name }));
    const coverage = 1 - unread.length / stated.length;
    // Measured over the 6,629 stated quantities in the shipped recipe book:
    // the old parser read 81.3% of them, this reads all but "to serve", which
    // is not a quantity. tsp, tbsp, "1/2 pack", "2 sticks" and every imperial
    // amount used to read as nothing at all.
    expect(stated.length).toBeGreaterThan(100);
    expect(coverage).toBeGreaterThan(0.999);
    expect([...new Set(unread.map((line) => line.qty))]).toEqual(['to serve']);
  });

  it('never reads a quantity as zero or negative', () => {
    for (const line of lines) {
      const parsed = parseQuantity(line.qty, { ingredient: line.name });
      if (parsed) expect(parsed.amount).toBeGreaterThan(0);
    }
  });
});
