/**
 * Spoken shopping sentences → editable list items.
 *
 * Split out of `shopping.js` so the voice grammar (the number words, the unit
 * table and the two regexes that lean on them) lives in one place instead of
 * at the top of the shopping surface. Nothing here reads app state: give it a
 * transcript, get back `{ items, heard }` ready to drop on the list.
 */

const VOICE_NUMBERS = {
  an: '1', a: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', couple: '2', few: '3',
};
const VOICE_UNIT_PATTERN = 'kilograms?|kg|grams?|grammes?|g|millilitres?|milliliters?|ml|litres?|liters?|l|packs?|bags?|boxes?|cartons?|bottles?|jars?|tins?|cans?|bunch|bunches|loaf|loaves|pieces?|slices?|portions?|servings?|dozens?';
const VOICE_UNIT_ALIASES = {
  kilogram: 'kg', kilograms: 'kg', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  litre: 'l', litres: 'l', liter: 'l', liters: 'l', millilitre: 'ml', millilitres: 'ml',
  milliliter: 'ml', milliliters: 'ml',
};
const normaliseVoiceQty = (value) => String(value || '').replace(/\b(kilograms?|grams?|grammes?|litres?|liters?|millilitres?|milliliters?)\b/gi, (unit) => VOICE_UNIT_ALIASES[unit.toLowerCase()] || unit.toLowerCase());

const voiceItem = (chunk) => {
  const text = String(chunk || '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const bulk = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?\\s*(?:${VOICE_UNIT_PATTERN}))\\s+(?:of\\s+)?(.+)$`, 'i'));
  if (bulk) {
    const packed = normaliseVoiceQty(bulk[2]).replace(/\s+/g, '');
    return { name: bulk[3].replace(/[.!?]+$/, '').trim(), qty: `${bulk[1]} x ${packed}` };
  }
  const prefix = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?|${Object.keys(VOICE_NUMBERS).join('|')})\\s*((${VOICE_UNIT_PATTERN})\\b)?\\s*(?:of\\s+)?(.+)$`, 'i'));
  if (!prefix) return { name: text.replace(/[.!?]+$/, '').trim(), qty: '' };
  const number = VOICE_NUMBERS[prefix[1].toLowerCase()] || prefix[1];
  const unit = prefix[3] ? (VOICE_UNIT_ALIASES[prefix[3].toLowerCase()] || prefix[3].toLowerCase()) : '';
  const name = prefix[4].replace(/[.!?]+$/, '').trim();
  return name ? { name, qty: unit ? `${number} ${unit}` : number } : null;
};

/** Turn a spoken shopping sentence into separate, editable list items. */
export const parseVoiceShopping = (text) => {
  const body = String(text || '')
    .trim()
    .replace(/^(?:please\s+)?(?:add|buy|put\s+on\s+the\s+list|we\s+need|need)\s+/i, '');
  if (!body || /^(?:add|buy|please|need)$/i.test(body)) return { items: [], heard: body };
  const chunks = body.split(/\s*(?:,|;|\band\b|\bplus\b)\s*/i)
    .map((chunk) => voiceItem(chunk))
    .filter((item) => item?.name.length >= 2);
  return { items: chunks, heard: body };
};
