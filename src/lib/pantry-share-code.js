/**
 * Sharing a pantry, and reading it back.
 *
 * A share code is the whole point of the local-first promise: a household can
 * hand its pantry to another device without either of them having an account.
 * The code is base64 over UTF-8 rather than anything clever, and a code that
 * does not parse returns null instead of a half-restored pantry.
 *
 * `recipesUsing` lives here too, because "what could I cook from this?" is the
 * first thing anyone asks of a pantry they have just been handed.
 */

import { RECIPES } from '../data/recipes.js';
import { dayStamp } from './kitchen-dates.js';
import { amountConfidence, expiringSoon, pantryConfidence } from './kitchen.js';

const encodeUtf8 = (value) => btoa(unescape(encodeURIComponent(value)));
const decodeUtf8 = (value) => decodeURIComponent(escape(atob(value)));

/** Portable snapshot generated locally for the user to send without an upload. */
export const pantryShareCode = (pantry = []) =>
  `FORQ-PANTRY-1.${encodeUtf8(JSON.stringify(pantry.map((item) => ({
    name: String(item.name || '').trim(),
    confidence: pantryConfidence(item),
    amountConfidence: amountConfidence(item),
    emoji: item.emoji || '',
    qty: String(item.qty || ''),
    cost: Number(item.cost) || 0,
    location: String(item.location || 'Pantry'),
    cat: String(item.cat || 'Other'),
    store: String(item.store || ''),
    expiry: item.expiry || null,
    low: Boolean(item.low),
  }))))}`;

export const pantryFromShareCode = (code) => {
  try {
    const text = String(code || '').trim();
    if (!text.startsWith('FORQ-PANTRY-1.')) throw new Error();
    const rows = JSON.parse(decodeUtf8(text.slice('FORQ-PANTRY-1.'.length)));
    if (!Array.isArray(rows) || rows.length > 500 || rows.some((item) => !item || typeof item.name !== 'string')) throw new Error();
    return rows.filter((item) => item.name.trim()).map((item) => ({
      ...item,
      name: item.name.trim().slice(0, 120),
      qty: String(item.qty || '').slice(0, 60),
      confidence: String(item.confidence || 'definite').slice(0,20),
      cost: Math.max(0, Number(item.cost) || 0),
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(item.expiry || '') ? item.expiry : null,
      low: Boolean(item.low),
    }));
  } catch {
    throw new Error('That pantry code is invalid or damaged.');
  }
};

/** Recipes that use something about to go off, best match first. */
export const recipesUsing = (pantry = [], limit = 3, today = dayStamp()) => {
  const names = expiringSoon(pantry, 3, today).map((p) => p.name.toLowerCase());
  if (!names.length) return [];
  return RECIPES
    .map((r) => ({
      recipe: r,
      hits: r.ingredients.filter((i) => names.some((n) => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()))).length,
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);
};
