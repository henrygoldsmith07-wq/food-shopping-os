import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  catalogueStats, clearProductCatalogue, crossShopProducts, loadProductCatalogue,
  productRows, recordProduct, recordProducts,
} from '../src/lib/product-catalogue.js';
import ProductShops from '../src/components/ProductShops.jsx';

const row = (retailerId, retailer, name, packSize, price) => ({
  retailerId, retailer, name, packSize, price, method: 'json-ld',
});

/**
 * The store is keyed the way the rest of the app keys item names, which
 * singularises: "eggs" is filed under "egg". Reaching for the entry rather
 * than guessing the key keeps these tests about the catalogue.
 */
const only = (store) => Object.values(store)[0];

const milk = {
  name: 'milk',
  perRetailer: [
    row('tesco', 'Tesco', 'Tesco British Semi Skimmed Milk 2.27L', '2.27l', 1.45),
    row('aldi', 'Aldi', 'Cowbelle Semi Skimmed Milk 1.13L', '1.13l', 0.85),
  ],
};

describe('a catalogue built from checks that happened', () => {
  beforeEach(() => {
    localStorage.clear();
    clearProductCatalogue();
  });

  it('keeps what each shop calls the product, its size and its price', () => {
    const store = recordProduct({}, 'milk', milk, '2026-08-27');
    expect(store.milk.shops.tesco).toMatchObject({
      retailer: 'Tesco',
      productName: 'Tesco British Semi Skimmed Milk 2.27L',
      amount: '2.27l',
      price: 1.45,
      seenAt: '2026-08-27',
    });
    expect(store.milk.firstSeen).toBe('2026-08-27');
  });

  it('keeps the shopper’s word and the shop’s word apart', () => {
    // "Milk" is the request. "Tesco British Semi Skimmed Milk 2.27L" is the
    // product, and only the second one identifies what was actually priced.
    const store = recordProduct({}, 'milk', milk);
    expect(store.milk.name).toBe('milk');
    expect(store.milk.shops.aldi.productName).toBe('Cowbelle Semi Skimmed Milk 1.13L');
  });

  it('replaces a shop’s row rather than stacking days on it', () => {
    // Price history lives next door. Two stores of the same observations
    // would drift apart, and this one is a catalogue, not a time series.
    let store = recordProduct({}, 'milk', milk, '2026-08-01');
    store = recordProduct(store, 'milk', {
      perRetailer: [row('tesco', 'Tesco', 'Tesco British Semi Skimmed Milk 2.27L', '2.27l', 1.6)],
    }, '2026-08-27');
    expect(Object.keys(store.milk.shops)).toEqual(['tesco', 'aldi']);
    expect(store.milk.shops.tesco.price).toBe(1.6);
    expect(store.milk.firstSeen).toBe('2026-08-01');
    expect(store.milk.lastSeen).toBe('2026-08-27');
  });

  it('records nothing for a check that priced nothing', () => {
    expect(recordProduct({}, 'kale', { perRetailer: [] })).toEqual({});
    expect(recordProduct({}, 'kale', { perRetailer: [{ retailerId: 'tesco', price: 0 }] })).toEqual({});
  });

  it('persists a whole run and skips the items that errored', () => {
    recordProducts({
      milk: { name: 'milk', ...milk },
      kale: { name: 'kale', error: 'shop refused', perRetailer: [] },
    });
    const stored = loadProductCatalogue();
    expect(Object.keys(stored)).toEqual(['milk']);
    expect(catalogueStats(stored)).toMatchObject({
      products: 1, rows: 2, retailers: 2, comparable: 1,
    });
  });
});

describe('price per amount, which is the whole point', () => {
  it('gets the answer a ticket price gets backwards', () => {
    // Aldi's £0.85 beats Tesco's £1.45 on the ticket. Per litre Tesco wins,
    // because the bottle is twice the size. This is the everyday case.
    const store = recordProduct({}, 'milk', milk, '2026-08-27');
    const out = productRows(store.milk);
    expect(out.cheapest.retailer).toBe('Aldi');
    expect(out.bestValue.retailer).toBe('Tesco');
    expect(out.ticketMisleads).toBe(true);
    expect(out.margin).toBe(25);
  });

  it('refuses to rank sizes that are on different scales', () => {
    // Six eggs against 500g of eggs: both are eggs, neither is cheaper.
    const store = recordProduct({}, 'eggs', {
      perRetailer: [
        row('tesco', 'Tesco', 'Free Range Eggs 6 Pack', '6 pack', 1.6),
        row('lidl', 'Lidl', 'Free Range Eggs 500g', '500g', 1.4),
      ],
    });
    const out = productRows(only(store));
    expect(out.mixedScales).toBe(true);
    expect(out.bestValue).toBeNull();
    // Still listed, by price, rather than dropped for being awkward.
    expect(out.ranked.map((r) => r.retailer)).toEqual(['Lidl', 'Tesco']);
  });

  it('has nothing to compare for a product seen at one shop', () => {
    const store = recordProduct({}, 'milk', {
      perRetailer: [row('tesco', 'Tesco', 'Milk 2.27L', '2.27l', 1.45)],
    });
    expect(productRows(only(store)).shops).toBe(1);
    expect(crossShopProducts(store)).toEqual([]);
  });

  it('lists the products worth comparing, most shops first', () => {
    let store = recordProduct({}, 'milk', milk);
    store = recordProduct(store, 'beans', {
      perRetailer: [
        row('tesco', 'Tesco', 'Heinz Baked Beans 415g', '415g', 1.4),
        row('asda', 'Asda', 'Heinz Baked Beans 415g', '415g', 1.35),
        row('aldi', 'Aldi', 'Heinz Baked Beans 415g', '415g', 1.29),
      ],
    });
    store = recordProduct(store, 'kale', {
      perRetailer: [row('tesco', 'Tesco', 'Kale 200g', '200g', 1.0)],
    });
    expect(crossShopProducts(store).map((p) => [p.name, p.shops])).toEqual([
      ['beans', 3], ['milk', 2],
    ]);
  });

  it('survives a product whose size no shop stated', () => {
    const store = recordProduct({}, 'bread', {
      perRetailer: [
        row('tesco', 'Tesco', 'Bread', null, 1.1),
        row('aldi', 'Aldi', 'Bread', null, 0.9),
      ],
    });
    const out = productRows(only(store));
    expect(out.bestValue).toBeNull();
    expect(out.unpriceable).toBe(2);
    expect(out.cheapest.retailer).toBe('Aldi');
  });
});

describe('the cross-shop table', () => {
  afterEach(cleanup);

  const product = productRows(recordProduct({}, 'milk', milk, '2026-08-27').milk);

  it('shows every shop with its own name, amount, price and per-amount', () => {
    render(<ProductShops product={product} />);
    expect(screen.getByText('Same item, 2 shops')).toBeTruthy();
    const tesco = screen.getByRole('rowheader', { name: /Tesco/ }).closest('tr');
    expect(within(tesco).getByText('2.27l')).toBeTruthy();
    expect(within(tesco).getByText('£1.45')).toBeTruthy();
    expect(within(tesco).getByText(/£0\.06 \/ 100ml/)).toBeTruthy();
    expect(within(tesco).getByText('Tesco British Semi Skimmed Milk 2.27L')).toBeTruthy();
  });

  it('says plainly when the cheaper ticket is the worse buy', () => {
    render(<ProductShops product={product} />);
    expect(screen.getByText(/Aldi has the cheaper ticket, but Tesco is better value per amount by 25%/)).toBeTruthy();
  });

  it('renders nothing for a product only one shop sells', () => {
    const single = productRows(only(recordProduct({}, 'milk', {
      perRetailer: [row('tesco', 'Tesco', 'Milk 2.27L', '2.27l', 1.45)],
    })));
    const { container } = render(<ProductShops product={single} />);
    expect(container.innerHTML).toBe('');
  });

  it('explains itself rather than ranking across scales', () => {
    const eggs = productRows(only(recordProduct({}, 'eggs', {
      perRetailer: [
        row('tesco', 'Tesco', 'Free Range Eggs 6 Pack', '6 pack', 1.6),
        row('lidl', 'Lidl', 'Free Range Eggs 500g', '500g', 1.4),
      ],
    })));
    render(<ProductShops product={eggs} />);
    expect(screen.getByText(/different scales.*not ranked by value/s)).toBeTruthy();
    expect(screen.queryByText('best value')).toBeNull();
  });
});
