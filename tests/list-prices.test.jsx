import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { typicalPriceFor } from '../src/data/typical-prices.js';
import { estimateBasket, rowEstimate } from '../src/lib/basket-estimate.js';
import { RECIPES } from '../src/data/recipes.js';
import ShopBasket from '../src/components/ShopBasket.jsx';

describe('typical UK prices', () => {
  it('prices every ingredient the recipes put on a list', () => {
    const names = new Set(RECIPES.flatMap((r) => (r.ingredients || []).map((i) => i?.name || i)));
    const missing = [...names].filter((name) => !typicalPriceFor(name));
    expect(missing).toEqual([]);
  });

  it('buys loose items by the count and packs by the weight', () => {
    expect(typicalPriceFor('lemons', '3')).toMatchObject({ units: 3, price: 0.9 });
    expect(typicalPriceFor('beef mince', '750 g')).toMatchObject({ units: 2, pack: '500 g' });
    expect(typicalPriceFor('rice', '300 g')).toMatchObject({ units: 1 });
    expect(typicalPriceFor('smoked paprika', '1 jar')).toMatchObject({ units: 1, pack: 'jar' });
  });

  it('is not fooled by a misleading first word', () => {
    expect(typicalPriceFor('butter beans').pack).toBe('400 g tin');
    expect(typicalPriceFor('egg noodles').pack).toBe('300 g');
    expect(typicalPriceFor('beef tomatoes').pack).toBe('each');
    expect(typicalPriceFor('panko breadcrumbs').pack).toBe('200 g');
  });

  it('caps a mistyped count', () => {
    expect(typicalPriceFor('bread', '200').units).toBe(6);
  });

  it('knows nothing about things it has never seen', () => {
    expect(typicalPriceFor('zzz widget')).toBeNull();
  });
});

describe('row estimates', () => {
  const row = { name: 'Chopped tomatoes', qty: '2' };

  it('keeps your own price', () => {
    expect(rowEstimate({ ...row, price: 1.5 })).toMatchObject({ price: 1.5, source: 'yours' });
  });

  it('prefers a live shop price, then a community one, then typical', () => {
    const key = 'chopped tomatoe';
    const live = { [key]: { best: { price: 0.39, retailer: 'Aldi' } } };
    const observed = { [key]: { price: 0.55, store: 'Tesco' } };
    expect(rowEstimate(row, { live, observed })).toMatchObject({ price: 0.78, source: 'live', label: 'Aldi, live' });
    expect(rowEstimate(row, { observed })).toMatchObject({ price: 1.1, source: 'observed' });
    expect(rowEstimate(row)).toMatchObject({ price: 0.9, source: 'typical' });
  });

  it('splits the basket into what you priced and what is estimated', () => {
    const out = estimateBasket([
      { name: 'Milk', price: 1.55 },
      { name: 'Onions', qty: '3' },
      { name: 'zzz widget' },
    ]);
    expect(out).toMatchObject({ known: 1.55, estimated: 0.45, total: 2, estimatedCount: 1, unknownCount: 1 });
    expect(out.sources.typical).toBe(1);
  });
});

describe('the basket card with estimated rows', () => {
  afterEach(() => cleanup());
  const props = {
    ticked: 0, visibleList: [], shoppingMode: false, shoppingSession: { active: false, stop: vi.fn() },
    isOnline: true, setSheet: vi.fn(), onOpenPantry: null,
    app: { weeklyBudget: 0, pantry: [], shoppingPreferences: {}, setShoppingPreferences: vi.fn(), shoppingInsights: {}, plan: {}, day: '2026-10-16' },
  };

  it('totals the whole list, and says how much is borrowed', () => {
    render(<ShopBasket
      {...props}
      basket={{ projected: 5, total: 5, saved: 0, priced: 1, unpriced: 3, spent: 0, left: null, over: false }}
      estimate={{ known: 5, estimated: 7.25, total: 12.25, estimatedCount: 3, unknownCount: 0, sources: { live: 1, observed: 0, typical: 2 } }}
    />);
    expect(screen.getByText('about £12.25')).toBeDefined();
    expect(screen.getByText(/£5\.00 from your prices \+ about £7\.25 for 3 items at 1 live, 2 typical prices/)).toBeDefined();
    expect(screen.queryByText(/with no price yet/)).toBeNull();
  });

  it('with nothing priced, quotes the estimate rather than £0.00', () => {
    render(<ShopBasket
      {...props}
      basket={{ projected: 0, total: 0, saved: 0, priced: 0, unpriced: 2, spent: 0, left: null, over: false }}
      estimate={{ known: 0, estimated: 3.1, total: 3.1, estimatedCount: 2, unknownCount: 0, sources: { live: 0, observed: 0, typical: 2 } }}
    />);
    expect(screen.queryByText('£0.00')).toBeNull();
    expect(screen.getByText('about £3.10')).toBeDefined();
    expect(screen.getByText(/Estimated: about £3\.10 for 2 items at 2 typical prices/)).toBeDefined();
  });
});
