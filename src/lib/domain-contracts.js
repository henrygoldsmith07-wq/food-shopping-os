/**
 * Forq domain contracts — the canonical shapes of the core loop.
 *
 * JS with checkJs-friendly JSDoc rather than a TS rewrite: the repo is
 * hundreds of JS files with `checkJs: false`, so a parallel .d.ts-style
 * contract module that tests and editors can read is the progressive step.
 * Each typedef names the fields domain logic may rely on; anything else on
 * the object is tolerated but never required. Where a contract has an invalid
 * state worth preventing (e.g. a price without a source), the matching
 * `is*` guard is the constructor — import it instead of re-checking inline.
 *
 * @typedef {Object} ShoppingItem
 * @property {string} id
 * @property {string} name
 * @property {string} [qty]
 * @property {boolean} [checked]
 * @property {number} [price]
 * @property {string} [priceSource]
 * @property {string} [aisle]
 * @property {string} [store]
 * @property {string} [fromRecipe]
 * @property {boolean} [autoListed]
 *
 * @typedef {Object} PantryItem
 * @property {string} id
 * @property {string} name
 * @property {string} [qty]
 * @property {string} [confidence] 'definite' | 'probable' | 'unknown'
 * @property {string} [expiry] ISO date
 * @property {string} [cat]
 * @property {boolean} [low]
 *
 * @typedef {Object} MealPlanEntry
 * @property {string} date ISO date
 * @property {string} slot 'breakfast' | 'lunch' | 'dinner'
 * @property {string} recipeId
 *
 * @typedef {Object} RecipeRef
 * @property {string} id
 * @property {string} name
 * @property {Array<{name:string, qty?:string}>} [ingredients]
 * @property {number} [servings]
 *
 * @typedef {Object} PriceObservation
 * @property {string} name
 * @property {number} price
 * @property {string} source canonical PRICE_SOURCES key (never empty)
 * @property {string} [store]
 * @property {string} [observedAt] ISO date
 * @property {string} [checkedAt] ISO datetime
 * @property {string} [url]
 * @property {string} [method] how the number was read (scraped | ai-extracted | …)
 *
 * @typedef {Object} HouseholdRef
 * @property {string} id
 * @property {string} [name]
 * @property {string} [role]
 *
 * @typedef {Object} SyncState
 * @property {number} version
 * @property {string} [householdId]
 * @property {string} [updatedAt]
 *
 * @typedef {Object} LedgerEvent
 * @property {string} id
 * @property {string} type one of LEDGER_EVENT_TYPES
 * @property {string} at ISO datetime
 * @property {string} origin one of LEDGER_ORIGINS
 * @property {string|null} [actor]
 *
 * @typedef {Object} Recommendation
 * @property {string} id
 * @property {string} kind
 * @property {string} label
 * @property {string} [reason]
 * @property {string} [evidence]
 * @property {number} [confidence]
 */

/** A price observation is only valid with a named canonical source. */
export const isValidPriceObservation = (row) =>
  Boolean(row && typeof row === 'object'
    && typeof row.name === 'string' && row.name.trim()
    && typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0
    && typeof row.source === 'string' && row.source.trim());

/** A shopping row is only valid with an id and a name. */
export const isValidShoppingItem = (row) =>
  Boolean(row && typeof row === 'object'
    && typeof row.id === 'string' && row.id
    && typeof row.name === 'string' && row.name.trim());

/** A pantry row is only valid with an id and a name. */
export const isValidPantryItem = (row) =>
  Boolean(row && typeof row === 'object'
    && typeof row.id === 'string' && row.id
    && typeof row.name === 'string' && row.name.trim());

/** Ledger events must carry id, known type, stamp and origin. */
export const isValidLedgerEvent = (event) =>
  Boolean(event && typeof event === 'object'
    && typeof event.id === 'string' && event.id
    && typeof event.type === 'string' && typeof event.at === 'string'
    && typeof event.origin === 'string');
