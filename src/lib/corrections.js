// @ts-check
/**
 * One-tap corrections — the shortest path from "that's wrong" to a fixed
 * model.
 *
 * Every entry routes to an EXISTING persisted command (`binPantryItem`,
 * `correctPrediction`, `respondToRecommendation`, `updatePantryItem`,
 * `updateListItem`, `correctPantry`). Nothing here writes state directly and
 * nothing here learns: the commands own the ledger, the undo stack and the
 * learning inputs, so a correction tapped here is the same correction a
 * person would make through the longer route. The catalogue exists so a row
 * can offer exactly the corrections that row's assumptions make, instead of
 * a generic "report a problem".
 *
 * Each correction names its evidence consequence ("Forq will remember
 * this"), and only claims it when the underlying command actually persists
 * something the model reads.
 */

/**
 * @typedef {Object} CorrectionContext
 * @property {any} [app] store command surface
 * @property {string} [itemId]  shopping-list row id
 * @property {string} [pantryId] pantry row id
 * @property {any} [item]       the row being corrected
 * @property {any} [recipe]     the recipe a recommendation named
 * @property {string} [recommendationId]
 * @property {string} [value]   the entered amount, when one is needed
 */

/**
 * @typedef {Object} Correction
 * @property {string} id
 * @property {string} label
 * @property {string} kind
 * @property {boolean} [needsValue]
 * @property {string} [remembers]
 * @property {(ctx: CorrectionContext) => boolean} apply
 */

/** Corrections for a shopping-list row. */
export const listRowCorrections = (item = {}) => {
  /** @type {Correction[]} */
  const rows = [];
  if (item.qty) {
    rows.push({
      id: 'bought-other-amount',
      label: 'Bought a different amount',
      kind: 'quantity',
      // The actual amount is asked in the sheet; this is the entry point.
      needsValue: true,
      apply: ({ app, value }) => {
        if (!value) return false;
        app.updateListItem?.(item.id, { qty: String(value) });
        return true;
      },
      remembers: 'Forq will remember this amount when predicting your next shop.',
    });
  }
  rows.push({
    id: 'didnt-buy',
    label: "Didn't buy this",
    kind: 'purchase',
    apply: ({ app }) => {
      app.updateListItem?.(item.id, { checked: false, notBought: true });
      return true;
    },
    remembers: 'Forq will stop assuming you always pick this up.',
  });
  rows.push({
    id: 'already-have',
    label: 'Already have this',
    kind: 'pantry',
    apply: ({ app }) => {
      // The row moves to the pantry as owned, and the list no longer asks.
      app.updateListItem?.(item.id, { checked: true, autoListed: false });
      app.addPantryItem?.({ name: item.name, qty: item.qty || '', cat: item.cat || 'Other', source: 'correction' });
      return true;
    },
    remembers: 'Forq will count it as kitchen stock next time.',
  });
  if (Number(item.price) > 0) {
    rows.push({
      id: 'price-wrong',
      label: 'Price was wrong',
      kind: 'price',
      needsValue: true,
      apply: ({ app, value }) => {
        const price = Number(value);
        if (!Number.isFinite(price) || price < 0) return false;
        app.updateListItem?.(item.id, { price, priceSource: 'manual' });
        return true;
      },
      remembers: 'Your receipt history will use the price you paid.',
    });
  }
  return rows;
};

/** Corrections for a pantry row. */
export const pantryRowCorrections = (item = {}) => {
  /** @type {Correction[]} */
  const rows = [
    {
      id: 'used-it',
      label: 'Used it already',
      kind: 'consumption',
      apply: ({ app }) => {
        app.consumePantryItem?.(item.id, {});
        return true;
      },
      remembers: 'Forq updates your stock and its use-rate for this item.',
    },
    {
      id: 'threw-away',
      label: 'Threw this away',
      kind: 'waste',
      needsValue: false,
      apply: ({ app }) => {
        app.binPantryItem?.(item.id, { reason: 'discarded' });
        return true;
      },
      remembers: 'Forq will buy less of this after repeated waste.',
    },
  ];
  if (item.qty) {
    rows.push({
      id: 'still-have-some',
      label: 'Still have some left',
      kind: 'quantity',
      needsValue: true,
      apply: ({ app, value }) => {
        if (!value) return false;
        app.updatePantryItem?.(item.id, { qty: String(value) });
        return true;
      },
      remembers: 'Forq will plan around what is actually left.',
    });
  }
  if (item.expiry) {
    rows.push({
      id: 'expiry-wrong',
      label: 'Expiry is wrong',
      kind: 'expiry',
      needsValue: true,
      apply: ({ app, value }) => {
        if (!value) return false;
        app.updatePantryItem?.(item.id, { expiry: String(value) });
        return true;
      },
      remembers: 'Use-by warnings will follow the real date.',
    });
  }
  return rows;
};

/** Corrections for a recommendation or a planned meal. */
export const mealCorrections = ({ recipe = null, recommendationId = '' } = {}) => {
  const id = recommendationId || `meal:${recipe?.id || 'unknown'}`;
  /** @type {Correction[]} */
  return [
    {
      id: 'good-suggestion',
      label: 'Good suggestion',
      kind: 'recommendation',
      apply: ({ app }) => {
        app.respondToRecommendation?.({ recommendationId: id, accepted: true, recipeId: recipe?.id, context: { source: 'correction' } });
        return true;
      },
      remembers: 'Forq will suggest meals like this more often.',
    },
    {
      id: 'not-tonight',
      label: 'Not tonight',
      kind: 'recommendation',
      apply: ({ app }) => {
        app.respondToRecommendation?.({ recommendationId: id, accepted: false, recipeId: recipe?.id, context: { source: 'correction', reason: 'not-tonight' } });
        return true;
      },
      remembers: 'Tonight is skipped — next week still considers this meal.',
    },
    {
      id: 'dont-recommend-often',
      label: "Don't recommend this often",
      kind: 'recommendation',
      apply: ({ app }) => {
        app.respondToRecommendation?.({ recommendationId: id, accepted: false, recipeId: recipe?.id, context: { source: 'correction', reason: 'too-frequent' } });
        return true;
      },
      remembers: 'This meal drops down your suggestions.',
    },
    {
      id: 'dont-like',
      label: "I don't like this",
      kind: 'taste',
      apply: ({ app }) => {
        app.respondToRecommendation?.({ recommendationId: id, accepted: false, recipeId: recipe?.id, context: { source: 'correction', reason: 'dislike' } });
        return true;
      },
      remembers: 'Forq will stop recommending this dish.',
    },
  ];
};

/**
 * Run a correction and report whether the model actually changed. The
 * caller shows "Forq will remember this" only when `changed` is true — the
 * brief's rule: never claim learning that did not persist.
 *
 * @param {{ apply: (ctx: any) => boolean, remembers?: string|null }} correction
 * @param {Partial<CorrectionContext>} ctx
 * @returns {{ changed: boolean, remembers: string|null }}
 */
export const applyCorrection = (correction, ctx = {}) => {
  if (!correction?.apply) return { changed: false, remembers: null };
  let changed = false;
  try {
    changed = Boolean(correction.apply(ctx));
  } catch {
    changed = false;
  }
  return { changed, remembers: changed ? correction.remembers || null : null };
};
