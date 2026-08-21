/**
 * Coupon & app-rewards vault — manual, honest, photo-assisted.
 *
 * No retailer feed exists, so this never invents coupons. The vault is yours
 * to fill: a barcode-style card you add by typing, or by photographing a
 * coupon/receipt and letting the on-device OCR seed the draft for you to
 * confirm. Photos never leave the device unless you upload them.
 *
 * OCR uses the same browser TextDetector hook as receipt capture — client-side
 * only, with a manual fallback when unavailable.
 */

import { dayStamp, daysUntil } from './kitchen.js';
import { detectReceiptText } from './smart-capture.js';

export const LOYALTY_PROGRAMMES = [
  { id: 'clubcard', label: 'Clubcard', retailer: 'Tesco' },
  { id: 'nectar', label: 'Nectar', retailer: "Sainsbury's" },
  { id: 'mywaitrose', label: 'myWaitrose', retailer: 'Waitrose' },
  { id: 'mymorrisons', label: 'MyMorrisons', retailer: 'Morrisons' },
  { id: 'aldi', label: 'Aldi', retailer: 'Aldi' },
  { id: 'lidl-plus', label: 'Lidl Plus', retailer: 'Lidl' },
  { id: 'other', label: 'Other', retailer: '' },
];

export const COUPON_KINDS = [
  { id: 'money', label: '£ off', hint: '£1.50 off' },
  { id: 'percent', label: '% off', hint: '25% off' },
  { id: 'multibuy', label: 'Multibuy', hint: '3 for 2' },
  { id: 'points', label: 'Points / reward', hint: 'Double points' },
  { id: 'freebie', label: 'Free item', hint: 'Free coffee' },
];

const clean = (value, max) => String(value || '').trim().slice(0, max);

export const normaliseCoupon = (raw = {}, today = dayStamp()) => {
  const label = clean(raw.label, 80);
  const match = clean(raw.match, 60);
  const kind = COUPON_KINDS.some((k) => k.id === raw.kind) ? raw.kind : 'money';
  const value = Math.max(0, Number(raw.value) || 0);
  const store = clean(raw.store, 80);
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(raw.expiry || '') ? raw.expiry : null;
  const code = clean(raw.code, 40);
  const programme = LOYALTY_PROGRAMMES.some((p) => p.id === raw.programme) ? raw.programme : null;
  const status = raw.expiry && expiry && expiry < today ? 'expired' : raw.used ? 'used' : 'active';
  return {
    id: clean(raw.id, 40),
    label,
    match,
    kind,
    value,
    store,
    expiry,
    code,
    programme,
    barcode: clean(raw.barcode, 40),
    used: Boolean(raw.used),
    usedAt: raw.usedAt || null,
    addedAt: raw.addedAt || today,
    source: raw.source || 'manual', // manual | photo-ocr
    status,
    daysLeft: expiry ? daysUntil(expiry, today) : null,
  };
};

export const couponExpiryLabel = (coupon, today = dayStamp()) => {
  if (!coupon?.expiry) return { label: 'No expiry', tone: 'muted', urgent: false };
  const d = daysUntil(coupon.expiry, today);
  if (d == null) return { label: 'Expiry unknown', tone: 'muted', urgent: false };
  if (d < 0) return { label: `Expired ${coupon.expiry}`, tone: 'danger', urgent: true };
  if (d === 0) return { label: 'Expires today', tone: 'warn', urgent: true };
  if (d === 1) return { label: 'Expires tomorrow', tone: 'warn', urgent: true };
  if (d <= 7) return { label: `Expires in ${d} days · ${coupon.expiry}`, tone: 'warn', urgent: true };
  return { label: `Expires ${coupon.expiry}`, tone: 'muted', urgent: false };
};

export const couponAppliesTo = (coupon, itemName) => {
  const term = String(coupon?.match || coupon?.label || '').trim().toLowerCase();
  if (!term) return false;
  return String(itemName || '').toLowerCase().includes(term);
};

export const couponsForList = (coupons = [], items = [], today = dayStamp()) =>
  (coupons || [])
    .map(normaliseCoupon)
    .filter((c) => !c.used && (!c.expiry || c.expiry >= today))
    .map((coupon) => {
      const hits = (items || []).filter((item) => couponAppliesTo(coupon, item.name));
      return hits.length ? { coupon, hits: hits.map((h) => h.name) } : null;
    })
    .filter(Boolean);

export const couponVaultStats = (coupons = [], today = dayStamp()) => {
  const normalised = (coupons || []).map((c) => normaliseCoupon(c, today));
  return {
    total: normalised.length,
    active: normalised.filter((c) => c.status === 'active').length,
    expiringSoon: normalised.filter((c) => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 7 && c.status === 'active').length,
    expired: normalised.filter((c) => c.status === 'expired').length,
    used: normalised.filter((c) => c.used).length,
  };
};

/**
 * Photo → draft assist: use on-device TextDetector to seed a coupon form.
 * Never auto-saves — the user confirms every field.
 */
const OFFER_LINE = /(£\s*\d+[.,]\d{2}|£\s*\d+|\d+\s*%|\d+\s*for\s*\d+|free|points|reward|voucher|coupon)/i;

export const draftFromOcrText = (text) => {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const offerLine = lines.find((l) => OFFER_LINE.test(l)) || lines[0] || '';
  const pct = offerLine.match(/(\d+)\s*%/);
  const money = offerLine.match(/£\s*(\d+[.,]\d{2}|\d+)/);
  const multibuy = offerLine.match(/(\d+)\s*for\s*(\d+)/i);
  let kind = 'money';
  let value = '';
  if (pct) { kind = 'percent'; value = pct[1]; }
  else if (multibuy) { kind = 'multibuy'; value = multibuy[1]; }
  else if (/free/i.test(offerLine) || /free item/i.test(offerLine)) { kind = 'freebie'; value = ''; }
  else if (/points|reward/i.test(offerLine)) { kind = 'points'; value = ''; }
  else if (money) { kind = 'money'; value = String(money[1]).replace(',', '.'); }
  const codeMatch = raw.match(/\b([A-Z0-9]{6,12})\b/);
  return {
    label: offerLine.slice(0, 80) || 'Scanned offer — check and save',
    match: '',
    kind,
    value,
    code: codeMatch ? codeMatch[1] : '',
    source: 'photo-ocr',
    ocrLines: lines.slice(0, 6),
  };
};

export const draftCouponFromPhoto = async (file, deps = {}) => {
  const text = await detectReceiptText(file, deps);
  return draftFromOcrText(text);
};
