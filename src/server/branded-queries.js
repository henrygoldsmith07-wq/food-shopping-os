/**
 * Asking for a product by a name the shop actually stocks.
 *
 * Shops index brands. A search for "baked beans" competes with every own-brand
 * tin, every meal deal and every recipe card; a search for "Heinz Baked Beans"
 * hits one product page. So when a generic query comes back with nothing at a
 * shop, the last thing worth trying is a branded product from the app's own
 * catalogue that *is* the thing that was asked for.
 *
 * The catalogue is the constraint that keeps this honest. The brand is not
 * guessed, invented, or asked of a model — it is a product already in the
 * app's data, whose generic words are exactly the words that were typed. And
 * the row that comes back is still scored against what the person wrote, so a
 * branded search can only find the same food under a fuller name.
 *
 * This is the last rung, tried only after the plain and quantity-free queries
 * have both failed at a shop that answered. It costs at most one more request
 * to a shop that has already proved it will answer one.
 */

import { BRANDED_FOODS } from '../data/branded-foods.js';
import { BRANDED_FOODS_EXTRA } from '../data/branded-foods-extra.js';
import { contentTerms } from './search-terms.js';

const CATALOGUE = [...BRANDED_FOODS, ...BRANDED_FOODS_EXTRA];

/**
 * Branded products whose name contains every identifying word that was typed.
 *
 * "baked beans" matches "Heinz Baked Beans"; "Heinz baked beans" is already
 * specific and matches nothing, because there is nothing left to make it more
 * specific with; and a single word matches nothing at all, on purpose.
 */
export const brandedQueries = (name = '', { limit = 1, catalogue = CATALOGUE } = {}) => {
  const typed = contentTerms(name);
  // One word is not enough to brand safely. "milk" is contained in "Cadbury
  // Dairy Milk" and in "PG Tips Tea (brewed, no milk)", and a row from either
  // search still scores as a match for the word "milk" — the relevance rule
  // cannot tell a chocolate bar from a bottle when the request was one word
  // long. Two words is where a branded guess stops being a coin toss.
  if (typed.length < 2) return [];
  const out = [];
  for (const food of catalogue) {
    const words = new Set(contentTerms(food.name));
    if (!typed.every((word) => words.has(word))) continue;
    // Already as specific as the catalogue can make it: no rung to add.
    if (words.size <= typed.length) continue;
    out.push(food.name);
    if (out.length >= limit) break;
  }
  return out;
};
