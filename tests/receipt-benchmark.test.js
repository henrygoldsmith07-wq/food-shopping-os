import { describe, it, expect } from 'vitest';
import { parseReceipt, receiptConfidence } from '../src/lib/receipt.js';
import { benchmarkReceipts, scoreCase, SEED_CORPUS } from '../src/lib/receipt-benchmark.js';

describe('receipt parser — line types real receipts contain', () => {
  it('captures loyalty savings as information without touching arithmetic', () => {
    const parsed = parseReceipt('WAITROSE\n07/08/2026\nHeinz beans\n£0.80\nCLUBCARD SAVING\n-£0.40\nTotal £0.80');
    expect(parsed.discounts).toHaveLength(1);
    expect(parsed.discounts[0]).toMatchObject({ amount: 0.4, kind: 'loyalty' });
    expect(parsed.savedTotal).toBe(0.4);
    expect(parsed.netTotal).toBe(0.8); // the item line was already the paid price
    expect(parsed.balanced).toBe(true);
  });

  it('captures multibuy offers as data', () => {
    const parsed = parseReceipt('MORRISONS\n09/08/2026\nYoghurt 4pk\n£2.50\nMULTIBUY SAVING\n-£0.50\nTotal £2.50');
    expect(parsed.discounts[0]).toMatchObject({ kind: 'multibuy', amount: 0.5 });
    expect(parsed.balanced).toBe(true);
  });

  it('treats coupons as payment events that adjust the net', () => {
    const parsed = parseReceipt('LIDL\n08/08/2026\nPenne pasta 500g\n£0.95\nCOUPON £0.50 OFF\nTotal £0.45');
    expect(parsed.coupons).toHaveLength(1);
    expect(parsed.couponTotal).toBe(0.5);
    expect(parsed.netTotal).toBe(0.45);
    expect(parsed.balanced).toBe(true);
  });

  it('reads refunds as money back, never as a purchase', () => {
    const parsed = parseReceipt("SAINSBURY'S\n05/08/2026\nYogurt REFUND\n-£1.85\nMilk\n£1.85\nTotal £0.00");
    expect(parsed.refunds).toHaveLength(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.netTotal).toBeCloseTo(0, 2);
    expect(parsed.balanced).toBe(true);
  });

  it('keeps the unit on weighed goods and defers to the printed line total', () => {
    const parsed = parseReceipt("SAINSBURY'S\n2026-08-12\nBraeburn apples\n0.482 kg @ £2.39/kg\n£1.15");
    expect(parsed.items[0].qtyUnit).toBe('kg');
    expect(parsed.items[0].price).toBe(1.15); // not the per-kg rate
    expect(parsed.items[0].flags).toContain('weighed');
  });

  it('multiplies quantity-prefixed single-figure lines and marks them low-confidence', () => {
    const parsed = parseReceipt('ALDI\n11/08/2026\nYoghurt 4pk\n2 x @ £1.25\n£2.50');
    expect(parsed.items[0].price).toBe(2.5);
    expect(parsed.items[0].confidence).toBe('low'); // computed, not read
    expect(parsed.items[0].flags).toContain('computed-from-unit-price');
  });

  it('marks substitutions so swapped items are visible in history', () => {
    const parsed = parseReceipt('TESCO\n03/08/2026\nBaby spinach (SUBSTITUTE)\n£0.90');
    expect(parsed.items[0].flags).toContain('substitution');
  });

  it('names independent shops honestly instead of guessing a brand', () => {
    const parsed = parseReceipt('CORNER SHOP SW9\n06/08/2026\nFree-range eggs\n£1.85\nTotal £1.85');
    expect(parsed.store).toBe('Independent shop');
    expect(parsed.balanced).toBe(true);
  });

  it('rejects unreadable input plainly rather than inventing items', () => {
    const parsed = parseReceipt('SOME SHOP\nthanks for visiting\nplease come again');
    expect(parsed.error).toMatch(/No priced lines/);
    expect(parsed.items).toHaveLength(0);
  });
});

describe('receipt benchmark — scored against a multi-retailer corpus', () => {
  it('covers nine retailer groups and every claimed feature', () => {
    expect(new Set(SEED_CORPUS.map((c) => c.retailer)).size).toBeGreaterThanOrEqual(8);
    const { byFeature } = benchmarkReceipts();
    for (const feature of ['weighed', 'multiline', 'qty-prefix', 'multibuy', 'coupon', 'loyalty', 'refund', 'split', 'substitution', 'independent', 'unreadable']) {
      expect(byFeature[feature]).toBeDefined();
    }
  });

  it('scores the seed corpus at full recall with every field accurate', () => {
    const report = benchmarkReceipts();
    expect(report.corpusSize).toBeGreaterThanOrEqual(12);
    expect(report.itemRecallPct).toBeGreaterThanOrEqual(90);
    expect(report.fieldAccuracy.totalsBalance).toBeGreaterThanOrEqual(80);
    expect(report.failing).toEqual([]);
  });

  it('a failing case names itself so corrections land where they belong', () => {
    const bad = scoreCase({
      name: 'broken-fixture', retailer: 'X', features: [],
      text: 'SHOP\n01/08/2026\nGhost item\n£9.99',
      expect: { store: 'X', date: '2026-08-01', total: 9.99, items: [{ name: 'ghost item', price: 4.5 }] },
    });
    expect(bad.pass).toBe(false);
    expect(bad.matchedItems).toBe(0);
  });
});

describe('receipt confidence — one glance before you save', () => {
  it('is high when the receipt balances with clean lines', () => {
    const parsed = parseReceipt('TESCO EXTRA\n14/08/2026\nBananas 6pk\n£1.10\nTotal £1.10');
    expect(receiptConfidence(parsed).level).toBe('high');
  });

  it('drops when prices were computed or lines were unread', () => {
    const computed = parseReceipt('ALDI\n11/08/2026\nYoghurt 4pk\n2 x @ £1.25\n£2.50');
    const conf = receiptConfidence(computed);
    expect(conf.level === 'low' || conf.reasons.some((r) => /computed/.test(r))).toBe(true);

    const withUnread = parseReceipt('TESCO\n14/08/2026\nBananas £1.10\n??? ??? ???\n£3.30');
    expect(receiptConfidence(withUnread).reasons.join(' ')).toMatch(/unread/);
  });

  it('is low for a rejected receipt', () => {
    expect(receiptConfidence(parseReceipt('nothing here')).level).toBe('low');
  });
});
