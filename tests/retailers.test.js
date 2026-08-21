import { describe, expect, it } from 'vitest';
import {
  retailerBasket, retailerById, retailerOffers, retailerSearchUrl, RETAILERS,
} from '../src/data/retailers.js';

describe('UK retailer integrations', () => {
  it('ships every requested retailer with official shopping and offers links', () => {
    expect(RETAILERS.map((retailer) => retailer.name)).toEqual([
      'Tesco', "Sainsbury's", 'Asda', 'Aldi', 'Lidl', 'Morrisons',
      'Waitrose', 'Ocado', 'Amazon Fresh',
    ]);
    for (const retailer of RETAILERS) {
      expect(retailer.shopUrl).toMatch(/^https:\/\//);
      expect(retailer.offersUrl).toMatch(/^https:\/\//);
      expect(retailer.deliveryUrl).toMatch(/^https:\/\//);
    }
  });

  it('builds an encoded retailer product search for price and availability checks', () => {
    expect(retailerSearchUrl('tesco', 'Greek yoghurt 0%')).toContain('Greek%20yoghurt%200%25');
    expect(retailerSearchUrl('missing', 'Milk')).toBeNull();
  });

  it('uses the latest recorded price at the selected retailer without inventing gaps', () => {
    const list = [{ name: 'Milk' }, { name: 'Bread' }];
    const shops = [
      { date: '2026-07-01', store: 'Sainsbury’s', items: [{ name: 'Milk', price: 1.4 }] },
      { date: '2026-07-20', store: "Sainsbury's", items: [{ name: 'Milk', price: 1.5 }] },
    ];
    expect(retailerBasket('sainsburys', list, shops)).toMatchObject({
      covered: 1,
      of: 2,
      total: 1.5,
      rows: [
        expect.objectContaining({ name: 'Milk', price: 1.5 }),
        expect.objectContaining({ name: 'Bread', price: null }),
      ],
    });
  });

  it('matches saved offers despite apostrophe variants', () => {
    const offers = [
      { id: '1', store: 'Sainsbury’s', label: 'Nectar price' },
      { id: '2', store: 'Tesco', label: 'Clubcard price' },
      { id: '3', store: '', label: 'Any shop voucher' },
    ];
    expect(retailerOffers(retailerById('sainsburys'), offers).map((offer) => offer.id)).toEqual(['1', '3']);
  });
});
