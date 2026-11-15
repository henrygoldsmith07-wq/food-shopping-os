import { describe, it, expect } from 'vitest';
import {
  LOYALTY_PROGRAMMES, COUPON_KINDS, normaliseCoupon, couponExpiryLabel, couponAppliesTo,
  couponsForList, couponVaultStats, draftFromOcrText,
} from '../src/lib/coupons.js';

describe('normaliseCoupon', () => {
  it('defaults a blank entry to an active manual coupon', () => {
    const c = normaliseCoupon();
    expect(c).toMatchObject({ kind: 'money', value: 0, used: false, status: 'active', source: 'manual' });
    expect(c.expiry).toBeNull();
    expect(c.programme).toBeNull();
  });

  it('clamps stringy lengths and numbers instead of trusting the form', () => {
    const c = normaliseCoupon({ label: 'x'.repeat(200), value: -5, code: 'y'.repeat(99), barcode: 'z'.repeat(99) });
    expect(c.label).toHaveLength(80);
    expect(c.value).toBe(0);
    expect(c.code).toHaveLength(40);
    expect(c.barcode).toHaveLength(40);
  });

  it('rejects kinds and programmes it has never heard of', () => {
    expect(normaliseCoupon({ kind: 'bitcoin' }).kind).toBe('money');
    expect(normaliseCoupon({ kind: 'percent' }).kind).toBe('percent');
    expect(normaliseCoupon({ programme: 'clubcard' }).programme).toBe('clubcard');
    expect(normaliseCoupon({ programme: 'clubworld' }).programme).toBeNull();
  });

  it('accepts only YYYY-MM-DD expiries and marks stale ones expired', () => {
    expect(normaliseCoupon({ expiry: '03/2027' }).expiry).toBeNull();
    const c = normaliseCoupon({ expiry: '2026-11-01' }, '2026-11-05');
    expect(c.status).toBe('expired');
    expect(c.daysLeft).toBe(-4);
  });

  it('a future expiry is not expired even when the coupon is used', () => {
    const c = normaliseCoupon({ used: true, expiry: '2026-12-01' }, '2026-11-05');
    expect(c.status).toBe('used');
    expect(c.daysLeft).toBe(26);
  });
});

describe('couponExpiryLabel boundaries and tones', () => {
  const label = (expiry, today) => couponExpiryLabel({ expiry }, today);

  it('says so when there is no expiry', () => {
    expect(label(undefined, '2026-11-01')).toMatchObject({ label: 'No expiry', tone: 'muted', urgent: false });
  });

  it('warns through the last week, then goes quiet again beyond it', () => {
    expect(label('2026-11-01', '2026-10-25')).toMatchObject({ label: 'Expires in 7 days · 2026-11-01', tone: 'warn', urgent: true });
    expect(label('2026-11-09', '2026-11-01')).toMatchObject({ label: 'Expires 2026-11-09', tone: 'muted', urgent: false });
    expect(label('2028-06-01', '2026-11-01')).toMatchObject({ label: 'Expires 2028-06-01', tone: 'muted', urgent: false });
  });

  it('treats today and tomorrow as urgent and the past as danger', () => {
    expect(label('2026-11-01', '2026-11-01')).toMatchObject({ label: 'Expires today', tone: 'warn', urgent: true });
    expect(label('2026-11-02', '2026-11-01')).toMatchObject({ label: 'Expires tomorrow', tone: 'warn', urgent: true });
    expect(label('2026-10-31', '2026-11-01')).toMatchObject({ label: 'Expired 2026-10-31', tone: 'danger', urgent: true });
  });
});

describe('couponAppliesTo', () => {
  it('matches case-insensitively, falling back to the label', () => {
    expect(couponAppliesTo({ match: 'Oat Milk' }, 'oat milk barista 1l')).toBe(true);
    expect(couponAppliesTo({ label: 'Bananas' }, 'Fairtrade bananas')).toBe(true);
    expect(couponAppliesTo({ label: 'Bananas', match: 'milk' }, 'Fairtrade bananas')).toBe(false);
  });

  it('never matches an empty term or an empty item', () => {
    expect(couponAppliesTo({ match: '' }, 'milk')).toBe(false);
    expect(couponAppliesTo({}, 'milk')).toBe(false);
    expect(couponAppliesTo({ match: 'milk' }, '')).toBe(false);
  });
});

describe('couponsForList', () => {
  it('pairs only unused, unexpired coupons with the list rows they match', () => {
    const coupons = [
      { id: 'a', match: 'milk', used: false, expiry: '2026-11-02' },
      { id: 'b', match: 'milk', used: true, expiry: '2026-11-02' },
      { id: 'c', match: 'beans', expiry: '2026-10-01' },
      { id: 'd', match: 'bread' },
    ];
    const items = [{ name: 'Semi-skimmed milk 2L' }, { name: 'Wholemeal bread' }];
    const hits = couponsForList(coupons, items, '2026-11-01');
    expect(hits.map((hit) => hit.coupon.id)).toEqual(['a', 'd']);
    expect(hits[0].hits).toEqual(['Semi-skimmed milk 2L']);
  });

  it('drops a coupon that expired the day before, and keeps one expiring today', () => {
    expect(couponsForList([{ match: 'milk', expiry: '2026-11-01' }], [{ name: 'milk' }], '2026-11-02')).toEqual([]);
    expect(couponsForList([{ match: 'milk', expiry: '2026-11-01' }], [{ name: 'milk' }], '2026-11-01')).toHaveLength(1);
  });
});

describe('couponVaultStats', () => {
  it('counts each bucket from the same normalised snapshot', () => {
    const coupons = [
      { match: 'a', expiry: '2026-11-02' },             // active, expiring soon
      { match: 'b' },                                    // active, no expiry
      { match: 'c', expiry: '2026-10-30' },              // expired
      { match: 'd', used: true, expiry: '2026-10-30' },  // used, though also stale
      { match: 'e', used: true },
    ];
    expect(couponVaultStats(coupons, '2026-11-01')).toEqual({ total: 5, active: 2, expiringSoon: 1, expired: 2, used: 2 });
  });

  it('an expired coupon is never also counted as expiring soon', () => {
    expect(couponVaultStats([{ match: 'a', expiry: '2026-10-30' }], '2026-11-01').expiringSoon).toBe(0);
  });

  it('counts the used state of a stale coupon inside `used`, matching the status field', () => {
    expect(couponVaultStats([{ match: 'a', used: true, expiry: '2026-10-30' }], '2026-11-01').expired).toBe(1);
  });
});

describe('draftFromOcrText', () => {
  it('reads a £ amount, % off, a multibuy and a freebie into the right kind', () => {
    expect(draftFromOcrText('Save £1.50 on cheese')).toMatchObject({ kind: 'money', value: '1.50' });
    expect(draftFromOcrText('25% off all yoghurt')).toMatchObject({ kind: 'percent', value: '25' });
    expect(draftFromOcrText('3 for 2 on all crisps')).toMatchObject({ kind: 'multibuy', value: '3' });
    expect(draftFromOcrText('FREE coffee with any breakfast')).toMatchObject({ kind: 'freebie', value: '' });
  });

  it('scans past a keyword-only line to find the line that carries the value', () => {
    expect(draftFromOcrText('Any coupon\nSave £1.50 on cheese')).toMatchObject({ label: 'Save £1.50 on cheese', kind: 'money', value: '1.50' });
    expect(draftFromOcrText('Take this to the till\n25% off all yoghurt')).toMatchObject({ kind: 'percent', value: '25' });
    expect(draftFromOcrText('Voucher\n3 for 2 on crisps')).toMatchObject({ kind: 'multibuy', value: '3' });
  });

  it('falls back to the first line when nothing carries an offer shape', () => {
    const draft = draftFromOcrText('A'.repeat(120));
    expect(draft.label).toHaveLength(80);
    expect(draft.ocrLines).toEqual(['A'.repeat(120)]);
    expect(draft.source).toBe('photo-ocr');
    expect(draft.kind).toBe('money');
    expect(draft.value).toBe('');
  });

  it('pulls a code out of the whole text, not just the offer line', () => {
    const draft = draftFromOcrText('Cheaper cheese\nSave 50% on cheese\nCode 50OFF24');
    expect(draft.kind).toBe('percent');
    expect(draft.value).toBe('50');
    expect(draft.code).toBe('50OFF24');
  });
});
