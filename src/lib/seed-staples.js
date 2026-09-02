/**
 * Smart data seeding — "10 common pantry staples".
 *
 * The app starts empty by principle, but an empty pantry can't answer
 * anything. This offers a one-tap middle ground: a short, universal list the
 * user almost certainly has, clearly labelled so it never pretends to be
 * observed data. Seeded items are marked `purchaseSource: 'starter'` and are
 * easy to spot (and remove) because of it.
 */

import { addDays } from './kitchen.js';

/** name, emoji, cat, location, qty — the ten things nearly every kitchen has. */
export const COMMON_STAPLES = [
  { name: 'Olive oil', emoji: '🫒', cat: 'Cupboard', location: 'Cupboard', qty: '1 bottle' },
  { name: 'Rice', emoji: '🍚', cat: 'Cupboard', location: 'Cupboard', qty: '1 kg' },
  { name: 'Pasta', emoji: '🍝', cat: 'Cupboard', location: 'Cupboard', qty: '500 g' },
  { name: 'Plain flour', emoji: '🌾', cat: 'Cupboard', location: 'Cupboard', qty: '1 kg' },
  { name: 'Tinned tomatoes', emoji: '🥫', cat: 'Cupboard', location: 'Cupboard', qty: '2 tins' },
  { name: 'Onion', emoji: '🧅', cat: 'Fresh', location: 'Cupboard', qty: '3' },
  { name: 'Garlic', emoji: '🧄', cat: 'Fresh', location: 'Cupboard', qty: '1 bulb' },
  { name: 'Eggs', emoji: '🥚', cat: 'Fridge', location: 'Fridge', qty: '6' },
  { name: 'Milk', emoji: '🥛', cat: 'Fridge', location: 'Fridge', qty: '1 L' },
  { name: 'Butter', emoji: '🧈', cat: 'Fridge', location: 'Fridge', qty: '250 g' },
];

/** Perishable staples get a conservative best-before so expiry tracking works. */
const SHELF_LIFE_DAYS = { Eggs: 9, Milk: 5, Butter: 21, Onion: 10, Garlic: 14 };

export const staplePantryItems = (day, { cost = 0 } = {}) =>
  COMMON_STAPLES.map((staple) => ({
    ...staple,
    id: null, // assigned by importPantry
    expiry: SHELF_LIFE_DAYS[staple.name] ? addDays(day, SHELF_LIFE_DAYS[staple.name]) : null,
    low: false,
    cost,
    store: '',
    purchaseSource: 'starter',
    addedAt: day,
    purchaseDate: day,
    lastConfirmedAt: day,
    confidenceUpdatedAt: day,
  }));

/** Items the user already tracks, so seeding only adds what's missing. */
export const staplesNotAlreadyIn = (existingPantry = [], staples = COMMON_STAPLES) => {
  const have = new Set(existingPantry.map((item) => String(item.name).trim().toLowerCase()));
  return staples.filter((staple) => !have.has(staple.name.toLowerCase()));
};
