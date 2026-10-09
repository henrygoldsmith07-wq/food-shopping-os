/**
 * The household's usual products — brand and pack, keyed by shopping name.
 *
 * "You always buy Yeo Valley yoghurt, 500 g" is knowledge the shopping loop
 * can only get from the household, so it is stored exactly as given and never
 * inferred: no preference is written from purchase history, because buying the
 * own-brand once when the usual one was out is not a change of mind.
 *
 * Everything here is pure. The store action that writes the key lives in
 * `shopping-actions.js`; the basket optimiser reads `offerPrefersBrand` to
 * break a price tie — never to hide a cheaper equivalent, which is why the
 * preference only ever ranks *between equal-priced equivalent* offers.
 */

import { shoppingNameKey } from './shopping-names.js';

const clean = (value, max) => String(value || '').trim().slice(0, max);

/** The recorded preference for a shopping-list name, or null. */
export const preferenceFor = (preferences, name) => {
  const key = shoppingNameKey(name);
  return key ? preferences?.[key] || null : null;
};

/**
 * Add or update one preference. A patch with neither brand nor pack removes
 * the key entirely — a preference with no content is not a preference, and
 * leaving `{brand:'', packSize:''}` behind would make the row claim one.
 */
export const setProductPreference = (preferences = {}, name, patch = {}) => {
  const key = shoppingNameKey(name);
  if (!key) return preferences;
  const next = { ...preferences };
  const brand = clean(patch.brand, 60);
  const packSize = clean(patch.packSize, 40);
  if (!brand && !packSize) {
    delete next[key];
    return next;
  }
  next[key] = {
    ...(next[key] || {}),
    brand,
    packSize,
    updatedAt: patch.updatedAt || next[key]?.updatedAt || null,
  };
  return next;
};

/** Remove a preference outright. Returns the same map when there is none. */
export const clearProductPreference = (preferences = {}, name) => {
  const key = shoppingNameKey(name);
  if (!key || !(key in (preferences || {}))) return preferences;
  const next = { ...preferences };
  delete next[key];
  return next;
};

/** One line for the row: "Tesco own · 500 g" — null when nothing is set. */
export const preferenceLabel = (preference) => {
  if (!preference) return null;
  const parts = [preference.brand, preference.packSize].map((part) => clean(part, 60)).filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

/**
 * Does this offer look like the household's usual brand? Matched on the
 * product's own words, which is the same strength of evidence the rest of the
 * shopping surface uses — a name match, not a promise about the shelf.
 */
export const offerPrefersBrand = (offer, preference) => {
  const brand = clean(preference?.brand, 60).toLowerCase();
  if (!brand) return false;
  const haystack = clean(
    `${offer?.brand || ''} ${offer?.name || offer?.product || ''}`, 300,
  ).toLowerCase();
  return Boolean(haystack) && haystack.includes(brand);
};
