/**
 * Reading a supermarket receipt.
 *
 * No OCR ships with this app, so it does not pretend to read the photograph.
 * What it does is the part that's actually hard and actually real: parsing the
 * text once you have it — from your retailer's app, an emailed receipt, or
 * typing it out. UK receipt layouts are a mess of their own conventions and
 * this handles the common ones.
 *
 * Everything it can't read is reported as unread, with the line, rather than
 * dropped. A receipt parser that silently loses three items is worse than one
 * that says "I couldn't do these four".
 *
 * Money rules, stated once:
 *   - item lines are what you paid (loyalty/multibuy savings are already in them)
 *   - loyalty & multibuy savings are recorded as information, never arithmetic
 *   - coupons and refunds are payment events and DO adjust the net total
 */

const CURRENCY = /£\s*(\d+[.,]\d{2})|(\d+[.,]\d{2})\s*£/;

/** Lines that are a receipt's furniture rather than a purchase. */
const NOISE = [
  /^\s*(total|subtotal|sub-total|balance|change|cash|card|visa|mastercard|amex|contactless)\b/i,
  /^\s*(vat|tax|gross|net|no\.?\s*of\s*items?|items?\s*sold)\b/i,
  /^\s*(thank you|thanks|customer copy|merchant copy|please retain|receipt|till|store|tel|www\.|@)/i,
  /^\s*points\b/i,
  /^\s*[-=*_]{3,}\s*$/,
  /^\s*\d{2}[/:]\d{2}/, // bare dates and times
  /^\s*$/,
];

const isNoise = (line) => NOISE.some((re) => re.test(line));

const money = (text) => {
  const match = CURRENCY.exec(text);
  if (!match) return null;
  return Number((match[1] || match[2]).replace(',', '.'));
};

/* ---------- Savings, coupons, refunds ---------- */

export const discountKind = (line) => {
  if (/coupon|voucher/i.test(line)) return 'coupon';
  if (/multibuy|\bany \d+ for\b|buy\s*(?:one|\d+)\s*get/i.test(line)) return 'multibuy';
  if (/clubcard|nectar|loyalty|member price/i.test(line)) return 'loyalty';
  if (/you saved|sav(?:ing|ings)|price drop|offer\b/i.test(line)) return 'offer';
  return null;
};

/** A saving line: its kind, and the amount when it prints one here. */
export const discountFrom = (line) => {
  const kind = discountKind(line);
  if (!kind) return null;
  const m = /£\s*(\d+[.,]\d{2})/.exec(line);
  const amount = m ? Number(m[1].replace(',', '.')) : null; // null = next line, or BOGOF
  if (amount !== null && amount <= 0) return null;
  return { kind, amount, rawLine: line.trim().slice(0, 120) };
};

/** A priced refund line is money back, never a purchase. */
export const refundFrom = (line) => {
  if (!/^refund\b|^reversal\b/i.test(String(line || '').trim()) && !/-\s*£\s*\d/.test(line)) return null;
  const match = /£\s*(\d+[.,]\d{2})/.exec(line);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const name = String(line || '')
    .replace(/^refund\b[:\s-]*/i, '')
    .replace(CURRENCY, '')
    .replace(/-\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60) || 'Refund';
  return { name, amount };
};

/**
 * The price a line is actually charging. On a "2 x £1.20  £2.40" line the
 * last figure is the line total; a single-price line is just its price.
 */
const linePrice = (text) => {
  const matches = [...String(text).matchAll(new RegExp(CURRENCY.source, 'g'))];
  if (!matches.length) return null;
  const prefixed = /^\s*\d+\s*(?:x|@)/i.test(String(text)) || /\d+(?:\.\d+)?\s*kg\s*@/i.test(String(text));
  const pick = matches.length > 1 && prefixed ? matches[matches.length - 1] : matches[0];
  return Number((pick[1] || pick[2]).replace(',', '.'));
};

/** "2 @ £1.50" and "0.482 kg @ £4.99/kg" both mean a quantity. */
const QTY_PATTERNS = [
  /^(\d+)\s*(?:x|@)\s*/i,
  /(\d+(?:\.\d+)?)\s*kg\s*@/i,
  /\bx\s*(\d+)\b/i,
];

const quantityOf = (line) => {
  for (const re of QTY_PATTERNS) {
    const match = re.exec(line);
    if (match) return Number(match[1]);
  }
  return null;
};

/**
 * Strip the price, the quantity and the till codes, leaving the food.
 * Order matters: the weighed-goods segment goes before the price is removed.
 */
const nameOf = (line) => String(line || '')
  .replace(/\d+(?:\.\d+)?\s*kg\s*@\s*£?\s*[\d.]+\s*\/?\s*kg/i, '')
  .replace(CURRENCY, '')
  .replace(/^\s*\d+\s*(?:x|@)\s*/i, '')
  .replace(/\b[A-Z]{1,2}\d{4,}\b/g, '') // till/product codes
  .replace(/\*+/g, '')
  .replace(/^[^A-Za-z0-9]+/, '') // a stray "@" left behind by the prefix strip
  .replace(/\s{2,}/g, ' ')
  .trim();

const isName = (text) => text.length >= 2 && /[a-z]{2,}/i.test(text);

const STORES = [
  [/tesco/i, 'Tesco'], [/sainsbury/i, "Sainsbury's"], [/asda/i, 'Asda'], [/morrison/i, 'Morrisons'],
  [/aldi/i, 'Aldi'], [/lidl/i, 'Lidl'], [/waitrose/i, 'Waitrose'], [/co-?op/i, 'Co-op'],
  [/m\s?&\s?s|marks\s*(and|&)\s*spencer/i, 'M&S'], [/iceland/i, 'Iceland'],
];

export const storeFrom = (text) => STORES.find(([re]) => re.test(text))?.[1] || '';

const DATE_PATTERNS = [
  /(\d{4})-(\d{2})-(\d{2})/,
  /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/,
  /(\d{1,2})[/.](\d{1,2})[/.](\d{2})\b/,
];

export const dateFrom = (text) => {
  for (const re of DATE_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    if (m[0].startsWith(m[1]) && m[1].length === 4) return `${m[1]}-${m[2]}-${m[3]}`;
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
};

/** The printed total, so the parse can be checked against it. */
export const totalFrom = (lines) => {
  const line = [...lines].reverse().find((l) => /^\s*(total|balance due|amount due)\b/i.test(l) && money(l) !== null);
  return line ? money(line) : null;
};

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Parse a pasted receipt into items you can push to the pantry or record as a
 * shop. Reports what it couldn't read, whether prices add up, and how much to
 * trust each line.
 */
export const parseReceipt = (text) => {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trimEnd());
  if (lines.filter((l) => l.trim()).length < 2) {
    return { items: [], unread: [], discounts: [], refunds: [], coupons: [], error: 'Paste the receipt text — a line per item, however your shop prints it.' };
  }

  const items = [];
  const unread = [];
  const discounts = [];
  const refunds = [];
  const coupons = [];
  let lastItem = null;
  let pendingName = null; // a wrapped name line waiting for its price on the next line
  let pendingSaving = null; // a "CLUBCARD/MULTIBUY SAVING" header waiting for its amount
  let pendingCoupon = false;

  for (const line of lines) {
    // Two-line patterns: header first, bare amount underneath ("−£0.40").
    if ((pendingSaving || pendingCoupon) && money(line) !== null && /^[-£\d\s.,]+$/.test(line.trim())) {
      const target = pendingCoupon ? coupons : discounts;
      target.push({ kind: pendingCoupon ? 'coupon' : pendingSaving.kind, amount: round2(money(line)), rawLine: line.trim().slice(0, 120) });
      pendingSaving = null;
      pendingCoupon = false;
      continue;
    }
    const kind = discountKind(line);
    if (kind) {
      const inline = discountFrom(line);
      if (inline && inline.amount != null) {
        (kind === 'coupon' ? coupons : discounts).push(inline);
      } else {
        pendingSaving = kind === 'coupon' ? null : { kind };
        pendingCoupon = kind === 'coupon';
      }
      continue;
    }
    if (isNoise(line)) continue;
    const refund = refundFrom(line); // before discounts: "NECTAR REFUND −£1.85" is money back
    if (refund) {
      // A bare "−£1.85" under an item name refunds that item.
      if (refund.name === 'Refund' && pendingName) {
        refund.name = pendingName.slice(0, 60);
        pendingName = null;
      }
      refunds.push(refund);
      continue;
    }

    const price = linePrice(line);
    const name = nameOf(line);
    const weighedKg = /(\d+(?:\.\d+)?)\s*kg\s*@/i.exec(line)?.[1] ?? null;

    if (price === null) {
      if (isName(name) && name.length > 2) {
        pendingName = name;
        lastItem = null;
      }
      continue;
    }

    if (!isName(name)) {
      const bareMoney = money(line);
      // Weighed goods priced per-kg defer to the bare line total that follows.
      if (lastItem?.priceIsRate && bareMoney !== null && quantityOf(line) === null) {
        lastItem.price = bareMoney;
        lastItem.priceIsRate = false;
        lastItem.flags = (lastItem.flags || []).filter((f) => f !== 'rate-price');
        lastItem.confidence = 'medium';
        continue;
      }
      const quantity = quantityOf(line);
      if (lastItem && quantity !== null) lastItem.qty = quantity;
      else if (pendingName) {
        const singleFigure = [...line.matchAll(new RegExp(CURRENCY.source, 'g'))].length === 1;
        const qtyPrefix = /^\s*\d+\s*(?:x|@)/i.test(line);
        const rateOnly = Boolean(weighedKg) && singleFigure; // per-kg rate; total follows
        const computed = !weighedKg && qtyPrefix && singleFigure && Number(quantity) > 1;
        lastItem = {
          name: pendingName.slice(0, 60),
          price: computed ? round2(price * quantity) : price,
          qty: quantity || 1,
          ...(weighedKg ? { qtyUnit: 'kg' } : {}),
          ...(rateOnly ? { priceIsRate: true } : {}),
          confidence: computed || rateOnly ? 'low' : 'medium',
          flags: [
            ...(/substitut/i.test(pendingName) ? ['substitution'] : []),
            ...(weighedKg ? ['weighed', 'wrapped-name'] : ['wrapped-name']),
            ...(rateOnly ? ['rate-price'] : []),
            ...(computed ? ['computed-from-unit-price'] : []),
          ],
        };
        items.push(lastItem);
        pendingName = null;
      } else {
        unread.push(line.trim()); // priced line with no product above it: reported, never dropped
      }
      continue;
    }

    const qty = quantityOf(line) || 1;
    const prefixedSingleFigure = /^\s*\d+\s*(?:x|@)/i.test(line)
      && [...line.matchAll(new RegExp(CURRENCY.source, 'g'))].length === 1
      && Number(qty) > 1;
    lastItem = {
      name: name.slice(0, 60),
      price: prefixedSingleFigure ? round2(price * qty) : price,
      qty,
      ...(weighedKg ? { qtyUnit: 'kg' } : {}),
      confidence: prefixedSingleFigure ? 'low' : 'high',
      flags: [
        ...(/substitut/i.test(line) ? ['substitution'] : []),
        ...(weighedKg ? ['weighed'] : []),
        ...(prefixedSingleFigure ? ['computed-from-unit-price'] : []),
      ],
    };
    items.push(lastItem);
    pendingName = null;
  }

  if (pendingName) unread.push(pendingName); // wrapped name that never got its price: unread, not dropped

  const printed = totalFrom(lines);
  const summed = round2(items.reduce((sum, i) => sum + i.price, 0));
  const refundTotal = round2(refunds.reduce((sum, r) => sum + r.amount, 0));
  const couponTotal = round2(coupons.reduce((sum, c) => sum + c.amount, 0));
  const savedTotal = round2(discounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0));
  const netSummed = round2(summed - refundTotal - couponTotal);
  return {
    items,
    unread,
    discounts,
    refunds,
    coupons,
    savedTotal,     // shelf-gap information only — never arithmetic
    couponTotal,    // payment event — adjusts the net
    store: storeFrom(text) || (String(text).trim() ? 'Independent shop' : ''),
    date: dateFrom(text),
    printedTotal: printed,
    itemTotal: summed,
    netTotal: netSummed,
    balanced: printed !== null ? Math.abs(printed - netSummed) < 0.02 : null,
    error: items.length ? null : 'No priced lines found. Receipts vary — a line per item with its price is what this reads.',
  };
};

/** How much to trust a finished parse, in one glance. */
export const receiptConfidence = (parsed = {}) => {
  const items = parsed.items || [];
  if (parsed.error || !items.length) return { level: 'low', score: 0, reasons: ['nothing readable'] };
  let score = parsed.balanced === true ? 80 : parsed.balanced === false ? 45 : 55;
  const reasons = [];
  if (parsed.unread?.length) {
    score -= Math.min(30, parsed.unread.length * 10);
    reasons.push(`${parsed.unread.length} unread line${parsed.unread.length === 1 ? '' : 's'}`);
  }
  const computed = items.filter((i) => i.confidence === 'low').length;
  if (computed) { score -= computed * 15; reasons.push(`${computed} price${computed === 1 ? '' : 's'} computed, not read`); }
  const soft = items.filter((i) => i.confidence === 'medium').length;
  if (soft) score -= soft * 5;
  score = Math.max(0, Math.min(100, score));
  return { level: score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low', score, reasons };
};
