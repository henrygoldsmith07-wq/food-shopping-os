/**
 * Turn a pasted shopping list into list rows.
 *
 * People already keep lists — in Notes, in Messages, on paper they photographed.
 * Retyping them item by item is exactly the kind of chore that makes an app get
 * abandoned, so the add-item form accepts a whole list at once. The parser is
 * deliberately narrow: it handles the shapes people actually write and leaves
 * everything else as the item's name, because a wrong guess is worse than an
 * unguessable line. Quantity-deduping against what's already on the list is the
 * store's job (addToList), not the parser's.
 */

const UNITS = new Set([
  'g', 'kg', 'ml', 'l', 'cl', 'oz', 'lb', 'pint', 'pints', 'litre', 'litres', 'liter', 'liters',
  'pack', 'packs', 'pk', 'tin', 'tins', 'can', 'cans', 'box', 'boxes', 'bag', 'bags',
  'bottle', 'bottles', 'jar', 'jars', 'bunch', 'bunches', 'loaf', 'loaves', 'dozen',
]);

const qtyWithUnit = (number, unit) => `${number} ${unit}`;

const line = (raw) => {
  let text = String(raw || '').trim();
  if (!text) return null;
  text = text.replace(/^[-•*–—•▪◦>]+\s*/, '').replace(/\s+/g, ' ');
  if (text.length < 2) return null;

  // "2x milk" / "2 x milk"
  let match = text.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s+(.+)$/i);
  if (match) return { name: match[2], qty: match[1].replace(',', '.') };

  // "milk x2" / "milk x 2"
  match = text.match(/^(.+?)\s+[x×]\s*(\d+(?:[.,]\d+)?)$/i);
  if (match) return { name: match[1], qty: match[2].replace(',', '.') };

  // "milk: 2" / "milk - 2"
  match = text.match(/^(.+?)\s*[:–—-]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)$/);
  if (match) {
    const unit = match[3].toLowerCase();
    return { name: match[1], qty: unit && UNITS.has(unit) ? qtyWithUnit(match[2].replace(',', '.'), unit) : match[2].replace(',', '.') };
  }

  // "2 pints of milk" — the second word only counts as a unit when it is one;
  // otherwise "2 red peppers" would lose the word "red".
  match = text.match(/^(\d+(?:[.,]\d+)?)\s+([a-zA-Z]+)\s+(?:of\s+)?(.+)$/);
  if (match) {
    const unit = match[2].toLowerCase();
    if (UNITS.has(unit)) return { name: match[3], qty: qtyWithUnit(match[1].replace(',', '.'), unit) };
    return { name: text.slice(match[1].length).trim(), qty: match[1].replace(',', '.') };
  }

  // "6 eggs" — bare number prefix with nothing after it to mis-split.
  match = text.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (match) return { name: match[2], qty: match[1].replace(',', '.') };

  return { name: text, qty: '' };
};

export const parsePastedList = (text, { max = 60 } = {}) => {
  const rows = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (rows.length >= max) break;
    const parsed = line(raw);
    if (!parsed) continue;
    const name = parsed.name.trim();
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, qty: parsed.qty });
  }
  return rows;
};
