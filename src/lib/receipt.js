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
 */

const CURRENCY = /£\s*(\d+[.,]\d{2})|(\d+[.,]\d{2})\s*£/;

/** Lines that are a receipt's furniture rather than a purchase. */
const NOISE = [
  /^\s*(total|subtotal|sub-total|balance|change|cash|card|visa|mastercard|amex|contactless)\b/i,
  /^\s*(vat|tax|gross|net|no\.?\s*of\s*items?|items?\s*sold)\b/i,
  /^\s*(thank you|thanks|customer copy|merchant copy|please retain|receipt|till|store|tel|www\.|@)/i,
  /^\s*(clubcard|nectar|loyalty|points|savings?|you saved|multibuy saving)\b/i,
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

/**
 * The price a line is actually charging. On a "2 x £1.20  £2.40" line the
 * last figure is the line total; a single-price line is just its price.
 */
const linePrice = (text) => {
  const matches = [...String(text).matchAll(new RegExp(CURRENCY.source, 'g'))];
  if (!matches.length) return null;
  // Quantity-prefixed or weighed lines ("2 x £1.20  £2.40", "0.482 kg @ £4.99/kg £2.41")
  // charge the last figure; a single-price line is just its price.
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
 *
 * Order matters: the weighed-goods line ("0.482 kg @ £4.99/kg") has to go
 * before the price is removed, or its remains read as an item name.
 */
const nameOf = (line) => line
  .replace(/\d+(?:\.\d+)?\s*kg\s*@\s*£?\s*[\d.]+\s*\/?\s*kg/i, '')
  .replace(CURRENCY, '')
  .replace(/^\s*\d+\s*(?:x|@)\s*/i, '')
  .replace(/\b[A-Z]{1,2}\d{4,}\b/g, '') // till/product codes
  .replace(/\*+/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

/** A name needs actual words in it — "@ /kg" is a leftover, not a product. */
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

/**
 * Parse a pasted receipt into items you can push to the pantry or record as a
 * shop. Reports what it couldn't read, and whether the item prices add up to
 * the printed total — the one check that tells you whether to trust it.
 */
export const parseReceipt = (text) => {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trimEnd());
  if (lines.filter((l) => l.trim()).length < 2) {
    return { items: [], unread: [], error: 'Paste the receipt text — a line per item, however your shop prints it.' };
  }

  const items = [];
  const unread = [];
  let lastItem = null;
  let pendingName = null; // a wrapped name line waiting for its price on the next line
  for (const line of lines) {
    if (isNoise(line)) continue;
    const price = linePrice(line);
    const name = nameOf(line);
    if (price === null) {
      // A line with words but no price is usually a wrapped item name; a line
      // with neither is furniture we already skipped.
      if (isName(name) && name.length > 2) {
        pendingName = name;
        lastItem = null;
      }
      continue;
    }
    if (!isName(name)) {
      const quantity = quantityOf(line);
      if (lastItem && quantity !== null) lastItem.qty = quantity;
      else if (pendingName) {
        // Weighed goods: the name sat on its own line, the price+qty on the next.
        lastItem = { name: pendingName.slice(0, 60), price, qty: quantity || 1 };
        items.push(lastItem);
        pendingName = null;
      } else {
        unread.push(line.trim()); // a priced line with no product above it is unread, never dropped
      }
      continue;
    }
    lastItem = {
      name: name.slice(0, 60),
      price,
      qty: quantityOf(line) || 1,
    };
    items.push(lastItem);
    pendingName = null;
  }
  // A wrapped name that never got its price is still unread, not dropped.
  if (pendingName) unread.push(pendingName);

  const printed = totalFrom(lines);
  const summed = Math.round(items.reduce((sum, i) => sum + i.price, 0) * 100) / 100;
  return {
    items,
    unread,
    store: storeFrom(text),
    date: dateFrom(text),
    printedTotal: printed,
    itemTotal: summed,
    // Within a penny of the printed total is a parse you can trust; anything
    // else is the app telling you to check rather than quietly being wrong.
    balanced: printed !== null ? Math.abs(printed - summed) < 0.02 : null,
    error: items.length ? null : 'No priced lines found. Receipts vary — a line per item with its price is what this reads.',
  };
};
