/**
 * One name key for one product, everywhere in the app.
 *
 * "Milk", "milk" and "MILK " are the same product; "Berry" and "Berries" are
 * too. Without a single normal form, the same item recorded twice would read
 * as two items — in price alerts, in the pantry, in suggestions. This lives
 * in its own module because `price-alerts.js` needs it at hydration time,
 * and hydration must not pull the whole shopping surface (and through it the
 * recipe book) in just to compare two names.
 */
export const shoppingNameKey = (name) => {
  const raw = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const words = raw.replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const key = words.map((word) => {
    if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 3) return word.slice(0, -1);
    return word;
  }).join(' ');
  return key || raw;
};
