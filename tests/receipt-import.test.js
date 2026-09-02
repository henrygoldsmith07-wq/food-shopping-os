import { describe, it, expect } from 'vitest';
import { parseReceiptCsv, RECEIPT_CSV_TEMPLATE } from '../src/lib/receipt-import.js';

const CSV = [
  'date,store,item,qty,price',
  '2026-08-03,Tesco,Wholemeal bread,1,1.35',
  '2026-08-03,Tesco,Semi-skimmed milk 2L,1,£1.65',
  '2026-08-05,Aldi,Bananas,1 bag,0.89',
].join('\n');

describe('receipt CSV import', () => {
  it('groups rows into shop records by date and store', () => {
    const { shops, stats, errors } = parseReceiptCsv(CSV);
    expect(errors).toEqual([]);
    expect(shops).toHaveLength(2);
    expect(stats.parsed).toBe(3);

    const tesco = shops.find((shop) => shop.store === 'Tesco');
    expect(tesco.date).toBe('2026-08-03');
    expect(tesco.items).toHaveLength(2);
    expect(tesco.total).toBeCloseTo(3.0, 2);
    expect(tesco.items.every((item) => item.priceSource === 'receipt')).toBe(true);
    expect(shops[0].date <= shops[shops.length - 1].date).toBe(true); // sorted oldest first
  });

  it('matches loose headers in any order and handles UK dates', () => {
    const csv = [
      'product,where,when,amountpaid',
      'Eggs,Sainsburys,04/08/2026,2.10',
    ].join('\n');
    const { shops } = parseReceiptCsv(csv);
    expect(shops).toHaveLength(1);
    expect(shops[0].store).toBe('Sainsburys');
    expect(shops[0].date).toBe('2026-08-04');
    expect(shops[0].items[0].name).toBe('Eggs');
    expect(shops[0].items[0].price).toBe(2.1);
  });

  it('falls back to positional columns when there is no header', () => {
    const { shops } = parseReceiptCsv('2026-08-01,Lidl,Pasta,500g,0.75');
    expect(shops[0].items[0]).toMatchObject({ name: 'Pasta', price: 0.75, qty: '500g' });
  });

  it('skips unreadable rows with a reason instead of throwing', () => {
    const csv = [
      'date,store,item,qty,price',
      '2026-08-03,Tesco,Bread,1,n/a',
      '2026-08-03,Tesco,Milk,1,1.10',
    ].join('\n');
    const { shops, stats, errors } = parseReceiptCsv(csv);
    expect(stats.parsed).toBe(1);
    expect(shops[0].items[0].name).toBe('Milk');
    expect(errors[0]).toMatch(/Bread/);
  });

  it('reports the exact skipped count even when only some reasons are shown', () => {
    const rows = ['date,store,item,qty,price'];
    for (let i = 0; i < 8; i += 1) rows.push(`2026-08-03,Tesco,Thing ${i},1,`);
    const { stats, errors } = parseReceiptCsv(rows.join('\n'));
    expect(stats.parsed).toBe(0);
    expect(stats.skipped).toBe(8);
    expect(errors.length).toBeLessThanOrEqual(5); // reasons are capped, the count is not
  });

  it('returns an empty, explained result for an empty file', () => {
    const { shops, errors } = parseReceiptCsv('');
    expect(shops).toEqual([]);
    expect(errors[0]).toMatch(/empty/i);
  });

  it('documents its format in a template that parses', () => {
    const rows = RECEIPT_CSV_TEMPLATE.split('\n');
    expect(rows[0]).toBe('date,store,item,qty,price');
    const { shops, errors } = parseReceiptCsv(RECEIPT_CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(shops[0].items[0].name).toBe('Wholemeal bread');
  });
});
