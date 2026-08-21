import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  lookupOpenFoodFactsProduct,
  lookupOpenPrices,
} from '../src/server/retailer-providers.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('open product and price data adapters', () => {
  it('maps Open Food Facts product and nutrition fields through a bounded response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 1,
      product: {
        product_name: 'Oat drink',
        brands: 'Example',
        quantity: '1 l',
        image_front_url: 'https://images.example/oat.jpg',
        ingredients_text: 'Water, oats',
        allergens: 'Oats',
        labels: 'Vegan',
        nutriscore_grade: 'b',
        ecoscore_grade: 'a',
        nutriments: {
          'energy-kcal_100g': 42,
          proteins_100g: 1.1,
          sugars_100g: 3.2,
        },
      },
    }), { status: 200 })));

    const result = await lookupOpenFoodFactsProduct('5012345678901');
    expect(result).toMatchObject({
      barcode: '5012345678901',
      name: 'Oat drink',
      brand: 'Example',
      quantity: '1 l',
      source: 'open-food-facts',
      nutrition: { kcal: 42, protein: 1.1, sugar: 3.2 },
    });
  });

  it('treats an Open Food Facts 404 as an unknown barcode, not a provider outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(lookupOpenFoodFactsProduct('5012345678901')).resolves.toBeNull();
  });

  it('keeps only GBP Open Prices observations and preserves location context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          id: 1,
          product_code: '5012345678901',
          product_name: 'Oat drink',
          price: 1.75,
          currency: 'GBP',
          price_is_discounted: true,
          date: '2026-07-30',
          product: { code: '5012345678901', product_name: 'Oat drink', brands: 'Example' },
          location: { osm_brand: 'Tesco', osm_display_name: 'Tesco, London' },
        },
        { product_code: '5012345678901', product_name: 'Oat drink', price: 2, currency: 'USD' },
      ],
    }), { status: 200 })));

    const result = await lookupOpenPrices({ barcode: '5012345678901' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      price: 1.75,
      currency: 'GBP',
      store: 'Tesco',
      location: 'Tesco, London',
      observedAt: '2026-07-30',
      offer: 'Observed discounted price',
      sourceLabel: 'Open Prices (community observed)',
    });
  });
});
