import { describe, it, expect } from 'vitest';
import {
  allergenTags, dietTags, healthScore, matchFood, nutritionTags, packGrams,
  pricePerKg, processingTag, tagsForItem, valueTags,
} from '../src/lib/food-tags.js';
import {
  applyTagView, filterByTags, groupedTags, isAllergenTag, popularTags,
  shopSpread, sortItems,
} from '../src/lib/food-tag-filters.js';

const row = (retailerId, retailer, price, packSize = null) => ({
  retailerId, retailer, price, packSize, name: `${retailer} thing`,
});
const ids = (tags) => tags.map((tag) => tag.id);

describe('matching a shopping item to a catalogue food', () => {
  it('matches a full product name, and singular/plural either way', () => {
    expect(matchFood('Semi-skimmed milk')?.name).toBe('Semi-skimmed milk');
    expect(matchFood('Bananas')?.name).toBe('Banana');
    expect(matchFood('Chicken breasts')?.name).toBe('Chicken breast, cooked');
  });

  it('refuses a loose match rather than tagging the wrong food', () => {
    // The catalogue search answers "milk" with "Milk chocolate". Hanging
    // nutrition tags on that would be worse than showing none.
    expect(matchFood('milk')).toBeNull();
    expect(matchFood('crisps')).toBeNull();
    expect(matchFood('a')).toBeNull();
    expect(matchFood('')).toBeNull();
  });

  it('ignores a qualifier the catalogue adds after a comma', () => {
    expect(matchFood('Lentils')?.name).toBe('Lentils, cooked');
  });
});

describe('nutrition tags use the regulated thresholds', () => {
  it('calls 20% of energy from protein "high protein", and 12% a source', () => {
    expect(ids(nutritionTags({ kcal: 100, protein: 5 }))).toContain('high-protein');
    expect(ids(nutritionTags({ kcal: 100, protein: 3.5 }))).toContain('source-of-protein');
    expect(ids(nutritionTags({ kcal: 100, protein: 1 }))).toEqual([]);
  });

  it('flags the UK front-of-pack red thresholds', () => {
    expect(ids(nutritionTags({ kcal: 400, sugar: 30 }))).toContain('high-sugar');
    expect(ids(nutritionTags({ kcal: 400, satFat: 6 }))).toContain('high-satfat');
    expect(ids(nutritionTags({ kcal: 400, sodium: 800 }))).toContain('high-salt');
  });

  it('says nothing when there is nothing to say', () => {
    expect(nutritionTags({})).toEqual([]);
  });
});

describe('the health grade', () => {
  it('grades a wholefood well and a fried snack badly', () => {
    expect(healthScore({ kcal: 116, protein: 9, fibre: 8, sugar: 1.8, satFat: 0.1, sodium: 2 }).grade).toBe('A');
    expect(['D', 'E']).toContain(healthScore({ kcal: 532, protein: 6.6, fibre: 4, sugar: 0.5, satFat: 3.1, sodium: 540 }).grade);
  });

  it('declines to grade a food with no energy figure', () => {
    expect(healthScore({})).toBeNull();
  });
});

describe('diet tags are a filter, not a certification', () => {
  it('names meat and fish where the product name does', () => {
    expect(ids(dietTags('Chicken breast'))).toContain('contains-meat');
    expect(ids(dietTags('Smoked salmon'))).toContain('contains-fish');
  });

  it('calls a dairy product vegetarian, not vegan', () => {
    const tags = ids(dietTags('Cheddar cheese'));
    expect(tags).toContain('vegetarian');
    expect(tags).not.toContain('vegan');
  });

  it('claims only that no animal ingredient was named', () => {
    // The honest claim for "Tomatoes" is not "vegan" — nothing was verified.
    expect(ids(dietTags('Tomatoes'))).toEqual(['no-animal-named']);
  });

  it('accepts a vegan claim the product itself makes', () => {
    expect(ids(dietTags('Vegan sausages'))).toEqual(['vegan']);
  });

  it('carries the caveat on every name-derived diet tag', () => {
    for (const tag of dietTags('Cheddar cheese')) expect(tag.detail).toMatch(/not a guarantee/i);
  });
});

describe('processing level', () => {
  it.each([
    ['Chicken nuggets', 'ultra-processed'],
    ['Smoked bacon', 'processed'],
    ['Olive oil', 'culinary-ingredient'],
    ['Carrots', 'minimally-processed'],
  ])('reads %s as %s', (name, expected) => {
    expect(processingTag(name).id).toBe(expected);
  });

  it('marks itself an estimate, because a name is weak evidence', () => {
    expect(processingTag('Carrots').label).toMatch(/est\./);
  });
});

describe('allergen tags only ever warn', () => {
  it('raises a declared allergen the name matches', () => {
    expect(ids(allergenTags('Cheddar cheese', ['milk']))).toEqual(['allergen:milk']);
  });

  it('stays silent about allergens the user has not declared', () => {
    expect(allergenTags('Cheddar cheese', ['peanuts'])).toEqual([]);
    expect(allergenTags('Cheddar cheese', [])).toEqual([]);
  });

  it('never claims an item is free of anything', () => {
    const labels = allergenTags('Cheddar cheese', ['milk']).map((tag) => tag.label);
    expect(labels[0]).toMatch(/^May contain/);
    expect(labels.join(' ')).not.toMatch(/free/i);
  });
});

describe('pack sizes and price per kg', () => {
  it.each([
    ['500g', 500],
    ['1.5kg', 1500],
    ['2.27l', 2270],
    ['6x330ml', 1980],
    ['loose', null],
  ])('reads %s as %s grams', (input, expected) => {
    expect(packGrams(input)).toBe(expected);
  });

  it('turns a pack price into a price per kilo', () => {
    expect(pricePerKg({ price: 2.5, packSize: '500g' })).toBe(5);
    expect(pricePerKg({ price: 2.5, packSize: 'loose' })).toBeNull();
  });
});

describe('value tags compare a product with itself, never with other products', () => {
  it('flags a real gap between shops', () => {
    const tags = ids(valueTags([row('a', 'A', 1), row('b', 'B', 2)]));
    expect(tags).toContain('good-value');
  });

  it('stays quiet when the shops broadly agree', () => {
    expect(ids(valueTags([row('a', 'A', 1.95), row('b', 'B', 2)]))).not.toContain('good-value');
  });

  it('compares today against this item’s own history', () => {
    const history = { points: [{ date: '1', best: 2 }, { date: '2', best: 2 }, { date: '3', best: 1 }] };
    expect(ids(valueTags([row('a', 'A', 1)], history))).toContain('cheaper-than-usual');
    const rising = { points: [{ date: '1', best: 1 }, { date: '2', best: 1 }, { date: '3', best: 2 }] };
    expect(ids(valueTags([row('a', 'A', 2)], rising))).toContain('dearer-than-usual');
  });

  it('reports the best price per kg when a pack size is readable', () => {
    const tags = valueTags([row('a', 'A', 2, '500g'), row('b', 'B', 3, '500g')]);
    expect(tags.find((tag) => tag.id === 'per-kg').label).toBe('From £4.00/kg');
  });
});

describe('new listings', () => {
  it('marks a shop that is pricing this now but was not last time', () => {
    const history = {
      points: [
        { date: '1', best: 1, shops: { tesco: { price: 1, retailer: 'Tesco' } } },
        { date: '2', best: 1, shops: { tesco: { price: 1, retailer: 'Tesco' } } },
      ],
    };
    const derived = tagsForItem({
      name: 'Tomatoes',
      perRetailer: [row('tesco', 'Tesco', 1), row('aldi', 'Aldi', 0.9)],
      history,
    });
    const newly = derived.tags.find((tag) => tag.id === 'newly-listed');
    expect(newly.label).toContain('Aldi');
  });

  it('says nothing on a first check, when everything would look new', () => {
    const history = { points: [{ date: '1', best: 1, shops: { tesco: { price: 1, retailer: 'Tesco' } } }] };
    expect(ids(tagsForItem({ name: 'Tomatoes', perRetailer: [row('aldi', 'Aldi', 1)], history }).tags))
      .not.toContain('newly-listed');
  });
});

describe('filtering', () => {
  const tagged = [
    { name: 'Lentils', bestPrice: 1, bestPerKg: 2, purchaseCount: 5, health: { grade: 'A' }, perRetailer: [row('a', 'A', 1), row('b', 'B', 3)], tags: [{ id: 'high-protein', group: 'nutrition', label: 'High protein' }, { id: 'vegetarian', group: 'diet', label: 'Veg' }] },
    { name: 'Bacon', bestPrice: 3, bestPerKg: 9, purchaseCount: 1, health: { grade: 'D' }, perRetailer: [row('a', 'A', 3)], tags: [{ id: 'high-protein', group: 'nutrition', label: 'High protein' }, { id: 'allergen:milk', group: 'allergen', label: 'May contain milk' }] },
    { name: 'Crisps', bestPrice: 2, bestPerKg: null, purchaseCount: 0, health: null, perRetailer: [row('a', 'A', 2)], tags: [{ id: 'ultra-processed', group: 'processing', label: 'Ultra' }] },
  ];

  it('requires every selected tag, so each one narrows the list', () => {
    expect(filterByTags(tagged, { selected: ['high-protein'] }).map((i) => i.name)).toEqual(['Lentils', 'Bacon']);
    expect(filterByTags(tagged, { selected: ['high-protein', 'vegetarian'] }).map((i) => i.name)).toEqual(['Lentils']);
  });

  it('treats an allergen as an exclusion, never an inclusion', () => {
    expect(isAllergenTag('allergen:milk')).toBe(true);
    const out = filterByTags(tagged, { excludeAllergens: ['milk'] }).map((i) => i.name);
    expect(out).toEqual(['Lentils', 'Crisps']);
  });

  it('accepts an allergen id in either form', () => {
    expect(filterByTags(tagged, { excludeAllergens: ['allergen:milk'] })).toHaveLength(2);
  });

  it('offers only tags something actually carries, most common first', () => {
    const offered = popularTags(tagged);
    expect(offered[0]).toMatchObject({ id: 'high-protein', count: 2 });
    expect(offered.every((tag) => tag.count > 0)).toBe(true);
  });

  it('groups the offered tags for a readable filter row', () => {
    const groups = groupedTags(popularTags(tagged)).map((group) => group.group);
    expect(groups).toContain('nutrition');
    expect(groups.indexOf('nutrition')).toBeLessThan(groups.indexOf('allergen'));
  });
});

describe('sorting', () => {
  const tagged = [
    { name: 'Lentils', bestPrice: 1, bestPerKg: 2, purchaseCount: 5, health: { grade: 'A' }, perRetailer: [row('a', 'A', 1), row('b', 'B', 3)], tags: [] },
    { name: 'Bacon', bestPrice: 3, bestPerKg: 9, purchaseCount: 1, health: { grade: 'D' }, perRetailer: [row('a', 'A', 3)], tags: [] },
    { name: 'Crisps', bestPrice: 2, bestPerKg: null, purchaseCount: 0, health: null, perRetailer: [row('a', 'A', 2)], tags: [] },
  ];
  const names = (sort) => sortItems(tagged, sort).map((item) => item.name);

  it('sorts by price, value per kg, health, popularity and name', () => {
    expect(names('price')).toEqual(['Lentils', 'Crisps', 'Bacon']);
    expect(names('per-kg')).toEqual(['Lentils', 'Bacon', 'Crisps']);
    expect(names('health')).toEqual(['Lentils', 'Bacon', 'Crisps']);
    expect(names('popularity')).toEqual(['Lentils', 'Bacon', 'Crisps']);
    expect(names('name')).toEqual(['Bacon', 'Crisps', 'Lentils']);
  });

  it('puts what it cannot rank last, rather than treating unknown as zero', () => {
    // Crisps has no readable pack size, so it is not "the cheapest per kg".
    expect(names('per-kg').at(-1)).toBe('Crisps');
    expect(names('health').at(-1)).toBe('Crisps');
  });

  it('sorts by the gap between shops, biggest first', () => {
    // A percentage, not money: pennies per 100ml and pennies per pack are not
    // the same currency, and this list mixes items that are measured both
    // ways. £1 against £3 is a 200% gap.
    expect(shopSpread(tagged[0])).toBe(200);
    expect(shopSpread(tagged[1])).toBeNull();
    expect(names('saving')[0]).toBe('Lentils');
    // Items with only one shop cannot have a gap, so they sort last rather
    // than floating to the top as "unknown".
    expect(names('saving').slice(1)).toEqual(['Bacon', 'Crisps']);
  });

  it('reports how much a filter hid, so an empty view explains itself', () => {
    const view = applyTagView(tagged, { selected: ['nothing-has-this'] });
    expect(view).toMatchObject({ shown: 0, total: 3, hidden: 3 });
  });
});

describe('the whole tag set for one item', () => {
  it('reads a real catalogue food end to end', () => {
    const derived = tagsForItem({
      name: 'Lentils',
      perRetailer: [row('a', 'Aldi', 1, '500g'), row('b', 'Booths', 2, '500g')],
      allergens: ['milk'],
      purchaseCount: 6,
    });
    expect(derived.matchedFood).toBe('Lentils, cooked');
    expect(derived.health.grade).toBe('A');
    expect(derived.bestPerKg).toBe(2);
    const tags = ids(derived.tags);
    expect(tags).toContain('health:A');
    expect(tags).toContain('high-fibre');
    expect(tags).toContain('good-value');
    expect(tags).toContain('regular-buy');
    expect(tags).not.toContain('allergen:milk');
  });

  it('still tags an item the catalogue does not know', () => {
    const derived = tagsForItem({ name: 'Artisan sourdough starter', perRetailer: [] });
    expect(derived.matchedFood).toBeNull();
    expect(derived.health).toBeNull();
    expect(ids(derived.tags).length).toBeGreaterThan(0);
  });
});
