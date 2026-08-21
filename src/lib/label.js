/**
 * Reading a nutrition label.
 *
 * This build ships no OCR and no product database beyond the bundled
 * catalogue, so it does not pretend to read pixels: you point the phone at the
 * panel, then type or paste what it says, and *this* is the part that is real —
 * a parser for the way UK and EU panels are actually written, including the
 * "of which" lines, kJ/kcal pairs, salt-to-sodium conversion, and per-serving
 * columns that need scaling back to 100 g.
 *
 * Anything it can't find is reported as missing rather than filled in with a
 * plausible number.
 */

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`;

const rule = (key, pattern, unit = 'g') => ({ key, pattern, unit });

/**
 * Order matters: the "of which" lines are matched before their parent, so
 * "of which saturates" isn't read as the fat line.
 */
const RULES = [
  rule('kcal', new RegExp(`${NUM}\\s*k?cal`, 'i'), 'kcal'),
  rule('satFat', new RegExp(`(?:of which\\s+)?satur\\w*[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('transFat', new RegExp(`trans[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('sugar', new RegExp(`(?:of which\\s+)?sugars?[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('fibre', new RegExp(`fib(?:re|er)[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('protein', new RegExp(`protein[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('carbs', new RegExp(`carbo\\w*[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('fat', new RegExp(`(?:^|\\n)\\s*(?:total\\s+)?fat[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('salt', new RegExp(`salt[^\\d\\n]*${NUM}\\s*g`, 'i')),
  rule('sodium', new RegExp(`sodium[^\\d\\n]*${NUM}\\s*(mg|g)`, 'i'), 'mixed'),
  rule('calcium', new RegExp(`calcium[^\\d\\n]*${NUM}\\s*mg`, 'i'), 'mg'),
  rule('iron', new RegExp(`iron[^\\d\\n]*${NUM}\\s*mg`, 'i'), 'mg'),
  rule('potassium', new RegExp(`potassium[^\\d\\n]*${NUM}\\s*mg`, 'i'), 'mg'),
];

const toNumber = (raw) => {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** 1 g of salt is 0.4 g of sodium — 400 mg. */
export const saltToSodium = (grams) => Math.round(grams * 400);

/** "per 45g serving" / "per 100 ml" — what basis the numbers are given on. */
export const basisOf = (text) => {
  const per100 = /per\s*100\s*(g|ml)/i.exec(text);
  if (per100) return { grams: 100, unit: per100[1].toLowerCase(), stated: true };
  const serving = new RegExp(`per\\s*(?:serving\\s*\\(?)?${NUM}\\s*(g|ml)`, 'i').exec(text);
  if (serving) return { grams: toNumber(serving[1]), unit: serving[2].toLowerCase(), stated: true };
  return { grams: 100, unit: 'g', stated: false };
};

/**
 * Parse a panel into per-100 g figures.
 *
 * Returns what it found, what it couldn't, and the basis it read the numbers
 * on — so the form can say "these were per 45 g and I've scaled them" instead
 * of silently changing your numbers.
 */
export const parseLabel = (text) => {
  const raw = String(text || '');
  if (raw.trim().length < 6) return { per100: {}, found: [], missing: ['kcal'], basis: null, ok: false };

  const basis = basisOf(raw);
  const factor = basis.grams ? 100 / basis.grams : 1;
  const per100 = {};
  const found = [];

  for (const { key, pattern, unit } of RULES) {
    const hit = pattern.exec(raw);
    if (!hit) continue;
    const value = toNumber(hit[1]);
    if (value === null) continue;
    if (key === 'salt') {
      if (per100.sodium === undefined) {
        per100.sodium = Math.round(saltToSodium(value) * factor);
        found.push('sodium');
      }
      continue;
    }
    if (key === 'sodium') {
      const mg = (hit[2] || '').toLowerCase() === 'g' ? value * 1000 : value;
      per100.sodium = Math.round(mg * factor);
      if (!found.includes('sodium')) found.push('sodium');
      continue;
    }
    const scaled = value * factor;
    per100[key] = unit === 'kcal' || unit === 'mg' ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    found.push(key);
  }

  const missing = ['kcal', 'protein', 'carbs', 'fat'].filter((k) => per100[k] === undefined);
  return { per100, found, missing, basis, ok: per100.kcal !== undefined };
};

/** A pasted label as the draft the custom-food form expects. */
export const labelToDraft = (text, { name = '', servingGrams = 100 } = {}) => {
  const { per100, found, missing, basis, ok } = parseLabel(text);
  return {
    ok,
    found,
    missing,
    basis,
    draft: {
      name,
      servingGrams,
      ...Object.fromEntries(Object.entries(per100).map(([key, value]) => [
        key,
        // The form works in per-serving figures, as printed on a packet.
        Math.round(((value * servingGrams) / 100) * 10) / 10,
      ])),
    },
  };
};
