/**
 * Import a past grocery history from a CSV of receipts.
 *
 * The point is cold start: a user with six months of paper or bank-statement
 * receipts shouldn't have to start from nothing. Columns are matched loosely —
 * date, store, item, qty and price, in any order, with or without a header —
 * and rows are grouped into shop records the same way a receipt scans into
 * Forq, so analytics, price memory and restock predictions see imported shops
 * exactly like recorded ones.
 */

import { emojiFor, todayStamp, uid } from './state.js';
import { guessAisle } from '../data/stores.js';

export const RECEIPT_CSV_TEMPLATE = 'date,store,item,qty,price\n2026-08-03,Tesco,Wholemeal bread,1,1.35\n2026-08-03,Tesco,Semi-skimmed milk 2L,1,1.65';

const HEADER_ALIASES = {
  date: ['date', 'day', 'purchased', 'purchasedate', 'when'],
  store: ['store', 'shop', 'supermarket', 'retailer', 'where'],
  item: ['item', 'product', 'name', 'description', 'what'],
  qty: ['qty', 'quantity', 'amount', 'size'],
  price: ['price', 'cost', 'total', 'paid', 'amountpaid', 'value'],
};

const splitCsvLine = (line) => {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
};

const parsePrice = (raw) => {
  const value = Number(String(raw ?? '').replace(/[£$€\s]/g, '').replace(/,/g, '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
};

const parseDate = (raw, fallback) => {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const uk = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (uk) {
    const [, d, m, y] = uk;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
};

const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');

const detectColumns = (headerRow) => {
  const columns = {};
  headerRow.forEach((cell, index) => {
    const key = Object.keys(HEADER_ALIASES).find((field) => HEADER_ALIASES[field].includes(norm(cell)));
    if (key && columns[key] === undefined) columns[key] = index;
  });
  return columns;
};

/** Faithful column detection for a headerless file falls back to position. */
const POSITIONAL = { date: 0, store: 1, item: 2, qty: 3, price: 4 };

/**
 * Parse a receipt CSV into Forq shop records.
 * Returns `{ shops, stats, errors }` — never throws for row-level problems.
 */
export const parseReceiptCsv = (text, { today = todayStamp(), importToPantry = false } = {}) => {
  const errors = [];
  const rows = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rows.length) return { shops: [], stats: { rows: 0, shops: 0, items: 0 }, errors: ['The file is empty.'] };

  let columns = detectColumns(splitCsvLine(rows[0]));
  let dataRows = rows;
  if (columns.item !== undefined) {
    dataRows = rows.slice(1);
  } else {
    columns = POSITIONAL;
  }

  const groups = new Map();
  let parsedRows = 0;

  dataRows.forEach((line, index) => {
    const cells = splitCsvLine(line);
    const item = String(cells[columns.item] ?? '').trim();
    if (!item) return;
    const price = parsePrice(cells[columns.price]);
    const date = parseDate(cells[columns.date], today);
    const store = String(cells[columns.store] ?? '').trim() || 'Unnamed shop';
    if (price === null) {
      errors.push(`Row ${index + 1}: no readable price for “${item}” — skipped.`);
      return;
    }
    parsedRows += 1;
    const key = `${date}|${store.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { date, store, items: [] });
    groups.get(key).items.push({
      name: item,
      price,
      qty: String(cells[columns.qty] ?? '').trim(),
      emoji: emojiFor(item),
      aisle: guessAisle(item),
      priceSource: 'receipt',
      recordedAt: date,
    });
  });

  const shops = [...groups.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((group) => ({
      id: uid('h'),
      date: group.date,
      store: group.store,
      total: Math.round(group.items.reduce((sum, item) => sum + item.price, 0) * 100) / 100,
      saved: 0,
      imported: true,
      pantryReconciled: Boolean(importToPantry),
      items: group.items,
    }));

  return {
    shops,
    stats: { rows: dataRows.length, parsed: parsedRows, shops: shops.length, items: parsedRows },
    errors: errors.slice(0, 5),
  };
};
