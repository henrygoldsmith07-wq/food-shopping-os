import { householdPermission } from './household.js';
import { aisleFor, applyOffers, shoppingNameKey, routeFromTicks } from './shopping.js';
import { reconcilePurchase } from './pantry-intelligence.js';
import { moveBefore } from './utils.js';
import { applyListConflictResolution } from './household-concurrency.js';
import { emojiFor, uid } from './state.js';
import { upsertPredictions, listSnapshotSync, buildShopRecord } from './shopping-predictions.js';
import { PREDICTION_PROVENANCE, refreshBasketFreeze } from './prediction-evidence.js';
import { receiptOutcomeRecords } from './price-evidence.js';
import { appendLedgerEvent, createLedgerEvent } from './event-ledger.js';

const text = (value, max) => String(value || '').trim().slice(0, max);

/**
 * Remove list rows and their LIVE prediction snapshots in the SAME state
 * write (task: enforce list ↔ snapshot consistency): every live
 * shoppingPredictions[].id must refer to a currently visible list row, so a
 * removal that left its snapshot behind would break the invariant. Frozen
 * copies on historical shop records are untouched — they live on the shops,
 * not in this book.
 *
 * The basket freeze rides the same write (task: material list changes): with
 * a prior freeze and a still-trustworthy forecast the shown basket is
 * re-frozen over the remaining rows; with no trustworthy forecast left the
 * prior freeze is explicitly invalidated — never left describing rows that
 * are no longer shown, and never invented merely because a row left.
 */
const removeRowsWithSnapshots = (state, goneIds) => {
  const gone = goneIds instanceof Set ? goneIds : new Set(goneIds);
  const shoppingList = state.shoppingList.filter((item) => !gone.has(item.id));
  if (shoppingList.length === state.shoppingList.length) return null;
  const { shoppingPredictions } = listSnapshotSync(shoppingList, state.shoppingPredictions);
  return {
    shoppingList,
    shoppingPredictions,
    basketPredictions: refreshBasketFreeze({ state, nextList: shoppingList, source: 'row-removal', requirePrev: true }),
  };
};

/** Actions for saved shopping products, kept out of the main store API. */
export const shoppingActions = (set) => ({
  toggleFavouriteShopping: (item) => set((state) => {
    if (!householdPermission(state, 'shopping')) return {};
    const name = text(item?.name, 100);
    const key = shoppingNameKey(name);
    if (!key) return {};
    const favourites = state.favouriteShopping || [];
    const existing = favourites.find((candidate) => shoppingNameKey(candidate.name) === key);
    if (existing) {
      return { favouriteShopping: favourites.filter((candidate) => shoppingNameKey(candidate.name) !== key) };
    }
    return {
      favouriteShopping: [
        ...favourites.slice(-49),
        {
          name,
          emoji: text(item.emoji, 12),
          aisle: text(item.aisle, 40) || 'Other',
          store: text(item.store, 80),
          qty: text(item.qty, 60),
          price: Math.max(0, Number(item.price) || 0),
          note: text(item.note, 160),
        },
      ],
    };
  }),
  setItemStore: (id, store) => set((state) => {
    if (!householdPermission(state, 'shopping')) return {};
    const value = text(store, 80);
    return { shoppingList: state.shoppingList.map((item) => (item.id === id ? { ...item, store: value } : item)) };
  }),

  // Bulk variants are atomic on purpose: one snapshot, so one undo reverses
  // the whole operation. Looping the single-item actions from a component
  // would leave the undo stack N calls deep with no way back but N taps.
  removeListItems: (ids) => set((state) => {
    if (!householdPermission(state, 'shopping')) return {};
    // The rows and their live snapshots leave in ONE write (see
    // removeRowsWithSnapshots) — the books cannot diverge mid-operation.
    const changes = removeRowsWithSnapshots(state, ids);
    return changes || {};
  }),

  /** Send every ticked item to the pantry in one move, merging with stock the
   * same way a recorded shop does. One atomic snapshot means one undo takes
   * the whole operation back. */
  moveCheckedToPantry: (location = 'Cupboard') => set((state) => {
    if (!householdPermission(state, 'shopping') || !householdPermission(state, 'pantry')) return {};
    const bought = state.shoppingList.filter((item) => item.checked);
    if (!bought.length) return {};
    const reconciled = reconcilePurchase(state.pantry, bought.map((item) => ({
      ...item,
      store: item.store || '',
      location,
      price: Number(item.price) || 0,
    })), {
      learnedAliases: state.aliasMemory || {},
      date: state.day,
      today: state.day,
      location,
      idFactory: () => uid('p'),
    });
    return {
      pantry: reconciled.pantry,
      // The moved rows leave the list — their live snapshots leave in the
      // SAME write (the list ↔ snapshot invariant holds mid-operation).
      ...(() => {
        const nextList = state.shoppingList.filter((item) => !bought.some((boughtItem) => boughtItem.id === item.id));
        const { shoppingPredictions } = listSnapshotSync(nextList, state.shoppingPredictions);
        return {
          shoppingList: nextList,
          shoppingPredictions,
          // The shown basket changed — refresh or invalidate the freeze in
          // the same write (see removeRowsWithSnapshots).
          basketPredictions: refreshBasketFreeze({ state, nextList, source: 'row-removal', requirePrev: true }),
        };
      })(),
      pantryConflicts: reconciled.conflicts.length
        ? [...(state.pantryConflicts || []), ...reconciled.conflicts].slice(-100)
        : state.pantryConflicts,
      pantryEvents: [...(state.pantryEvents || []), {
        id: uid('pe'), type: 'bulk_move_to_pantry', date: state.day,
        added: reconciled.added.length, merged: reconciled.matches.filter((match) => match.action === 'merged').length,
      }].slice(-100),
    };
  }),
  moveListItem: (id, beforeId) =>
    set((s) => {
      const shoppingList = moveBefore(s.shoppingList, id, beforeId);
      return shoppingList === s.shoppingList ? {} : { shoppingList };
    }),
  removeListItem: (id) => set((s) => {
    const changes = removeRowsWithSnapshots(s, [id]);
    return changes || {};
  }),
  toggleChecked: (id) =>
    set((s) => ({
      shoppingList: s.shoppingList.map((i) => (i.id === id
        ? {
          ...i,
          checked: !i.checked,
          checkedAt: i.checked ? null : Date.now(),
          // Who ticked it — so a shared list reads as people's ticks,
          // not a single anonymous checkmark. Cleared on untick.
          checkedBy: i.checked ? null : s.activeMemberId || null,
        }
        : i)),
    })),
  clearChecked: () => set((s) => {
    const changes = removeRowsWithSnapshots(s, s.shoppingList.filter((i) => i.checked).map((i) => i.id));
    return changes || {};
  }),
  resolveListConflict: (conflictId, side = 'mine') => set((s) => {
    if (!householdPermission(s, 'shopping')) return {};
    const conflict = (s.listConflicts || [])
      .find((entry) => entry.id === conflictId && entry.status !== 'resolved');
    if (!conflict) return {};
    const { rows, conflicts } = applyListConflictResolution(
      s.shoppingList, s.listConflicts, conflictId, side,
    );
    // Resolution can drop rows — the invariant is re-enforced on the same
    // write, so no orphaned snapshot survives a conflict resolution (and the
    // basket freeze is refreshed/invalidated alongside, never left stale).
    const { shoppingPredictions } = listSnapshotSync(rows, s.shoppingPredictions);
    return {
      shoppingList: rows,
      shoppingPredictions,
      basketPredictions: refreshBasketFreeze({ state: s, nextList: rows, source: 'row-removal', requirePrev: true }),
      listConflicts: conflicts,
    };
  }),

  // Swap one list row for a substitute. The ROW keeps its id, but the
  // ingredient it names changes — so its frozen prediction no longer
  // describes what will be bought. The snapshot is relabelled with explicit
  // lineage (`substitutedFrom`) IN THE SAME WRITE, and the substitution is
  // planned through upsertPredictions so the fresh snapshot for the NEW
  // ingredient is written like any other row. Evaluation then either follows
  // the lineage or excludes the row — it never scores a Rice prediction
  // against a Quinoa purchase just because the row id matched.
  substituteListItem: (id, option) =>
    set((s) => {
      if (!householdPermission(s, 'shopping')) return {};
      const current = s.shoppingList.find((item) => item.id === id);
      const name = String(option?.name || '').trim();
      if (!current || name.length < 2 || current.name === name) return {};
      const duplicate = s.shoppingList.find((item) => item.id !== id && shoppingNameKey(item.name) === shoppingNameKey(name));
      if (duplicate) return {};
      const price = Number(option.price) || 0;
      const why = option.why || option.rationale || '';
      const shoppingList = s.shoppingList.map((item) => (item.id === id ? {
        ...item,
        name,
        emoji: option.emoji || emojiFor(name),
        price,
        priceSource: price ? (option.priceConfidence === 'receipt' ? 'receipt' : 'recorded') : 'unknown',
        aisle: aisleFor(name, s.aisleMemory),
        substitutedFrom: current.name,
        substitutionWhy: why,
        purchaseWarning: null,
      } : item));
      // Lineage on the prediction book: the row's old snapshot (same id) is
      // REPLACED by a fresh snapshot for the new ingredient, carrying the
      // substitution lineage. The Rice record cannot ride a Quinoa purchase
      // — the snapshot on this row id is a Quinoa snapshot, marked as a
      // substitution so evaluation can exclude it from ingredient accuracy.
      const substitutedRow = shoppingList.find((item) => item.id === id);
      // Recipe provenance belonged to the ORIGINAL ingredient: the fresh
      // snapshot names the substitution lineage instead of borrowing recipes
      // that never asked for it. The swap is a USER decision (task:
      // substitution provenance) — its snapshot is provenance-stamped
      // user-substitution, never forq-plan: the displayed price rode the
      // household's choice, not Forq advice.
      const book = Array.isArray(s.shoppingPredictions) ? s.shoppingPredictions : [];
      const shoppingPredictions = upsertPredictions(
        [{ ...substitutedRow, sourceRecipes: [], fromRecipe: null }],
        book,
        {
          day: s.day,
          learnedAliases: s.aliasMemory || {},
          provenanceByRow: { [id]: PREDICTION_PROVENANCE.USER_SUBSTITUTION },
        },
      );
      const changes = {
        shoppingList,
        shoppingPredictions,
      };
      // MATERIAL SUBSTITUTION REPRICE (task: re-freeze spend predictions
      // after substitutions): Rice £1 → Quinoa £3 changes the basket cost
      // actually on show, so a NEW freeze (source `substitution-reprice`) is
      // created NOW and the old freeze is superseded in the same write — it
      // remains historical evidence but checkout must evaluate against the
      // £3-era basket, never the £1 one.
      const nextRow = shoppingList.find((item) => item.id === id);
      if ((Number(nextRow?.price) || 0) !== (Number(current.price) || 0)) {
        changes.basketPredictions = refreshBasketFreeze({
          // FREEZE ORDERING (task: the freeze must describe the book it
          // will be evaluated against): pass the NEW prediction book so the
          // re-frozen basket stamps the substituted row with its fresh
          // user-substitution provenance — the pre-write book still held
          // the old ingredient's snapshot.
          state: { ...s, shoppingPredictions },
          nextList: shoppingList,
          source: 'substitution-reprice',
        });
      }
      return changes;
    }),
  ...recordShopAction(set),
});

/**
 * Record a completed shop from the CHECKED list rows (task: one shared
 * purchase recorder). The basket prediction copied onto the record is the
 * genuine pre-till freeze; each item keeps its shown list price as a
 * PREDICTION echo and carries an actual price only when one was
 * independently observed — the checked-rows flow observes none, so the
 * record's receipt outcomes are honestly empty. Pantry reconciliation,
 * the replayable purchase event, the store route and the list/book clean-up
 * ride the same single write.
 */
const recordShopAction = (set) => ({
  recordShop: ({ store, total, toPantry = true, location = 'Cupboard', itemIds = null }) =>
    set((s) => {
      if (!householdPermission(s, 'shopping')) return {};
      const bought = s.shoppingList.filter((i) => i.checked && (!itemIds || itemIds.includes(i.id)));
      if (!bought.length) return {};
      const shopStore = store || 'Unnamed shop';
      const { saved } = applyOffers(bought, s.offers, { store: shopStore, today: s.day });
      const purchaseDate = s.day;
      const reconciled = toPantry && householdPermission(s, 'pantry')
        ? reconcilePurchase(s.pantry, bought.map((item) => ({
          ...item, store: shopStore, location, price: Number(item.price) || 0,
        })), {
          learnedAliases: s.aliasMemory || {},
          date: purchaseDate,
          today: s.day,
          location,
          idFactory: () => uid('p'),
        })
        : null;
      // One shared purchase-recording shape (see shopping-predictions.js):
      // the basket prediction frozen pre-till, and the prediction
      // snapshots for the exact rows bought, captured from the list's
      // prediction book while it still exists. Quantity evaluation reads
      // THESE — never a reconstruction from recipes.
      // No `predictedCost` here: the SPEND prediction is the pre-till
      // freeze matched by row-prediction ids (see shop-record.js) —
      // copied verbatim, never recomputed. No freeze → `predicted: null`
      // and spend accuracy excludes the shop honestly.
      const record = buildShopRecord({
        state: s,
        items: bought,
        store: shopStore,
        total,
        id: uid('h'),
        day: s.day,
      });
      // The freeze stamps each bought row with its canonical subject
      // resolved at purchase time; the item rewrite below must carry
      // that stamp forward, or the checked-rows path would lose the
      // frozen outcome identity the command path keeps.
      const stampedSubjectById = new Map(record.items.map((item) => [item?.id, item?.subjectKey]));
      // PREDICTION vs OUTCOME (task: separate predicted price from actual
      // receipt price): each shop item keeps the list price it was shown
      // (`price`/`priceSource` — a prediction echo, NEVER relabelled as
      // receipt evidence) and carries an actual ONLY when one was
      // independently observed on this flow. The checked-rows flow
      // observes none — so `actualPrice` stays null on every row and
      // strict row-level spend accuracy honestly excludes this shop.
      // `recordedAt` is the recording moment, not an outcome label.
      const shop = {
        ...record,
        saved,
        pantryReconciled: Boolean(reconciled),
        items: bought.map(({ id: itemId, name, price, qty, emoji, priceSource: rowPriceSource }) => ({
          id: itemId,
          name,
          price: Number(price) || 0,
          priceSource: rowPriceSource || 'unknown',
          recordedAt: s.day,
          qty,
          emoji,
          subjectKey: stampedSubjectById.get(itemId) ?? null,
          actualPrice: null,
          actualPriceSource: null,
          observedAt: null,
        })),
      };
      const route = routeFromTicks(bought);
      const pantryEvent = reconciled
        ? {
          id: uid('pe'), type: 'purchase_reconciliation', date: s.day,
          store: shop.store, added: reconciled.added.length,
          merged: reconciled.matches.filter((match) => match.action === 'merged').length,
          conflicts: reconciled.conflicts.length,
        }
        : null;
      // One replayable purchase event per recorded shop. A shop with no
      // planned meal within ±3 days is honestly marked off-plan — that is
      // the flag week recovery reads to clear the rows it covered.
      const plannedDatesNear = Object.keys(s.plan || {})
        .filter((d) => Object.keys(s.plan[d] || {}).length)
        .some((d) => Math.abs(new Date(`${d}T12:00:00`) - new Date(`${s.day}T12:00:00`)) <= 3 * 86400000);
      const withPurchase = appendLedgerEvent(s, createLedgerEvent(
        'IngredientPurchased',
        {
          shopId: shop.id,
          store: shop.store,
          total: shop.total,
          items: shop.items.map((i) => i.name),
          unplanned: !plannedDatesNear || undefined,
        },
        { origin: 'user', at: `${s.day}T12:00:00.000Z` },
      ));
      return {
        ...withPurchase,
        shops: [...s.shops, shop],
        // Canonical receipt-outcome records (task: actual price-observation
        // pipeline): the rows whose prices were INDEPENDENTLY observed on
        // this flow. The checked-rows flow observes none — honest empty.
        receiptOutcomes: receiptOutcomeRecords(shop),
        shoppingList: s.shoppingList.filter((i) => !bought.some((item) => item.id === i.id)),
        // The bought rows' snapshots now live on the shop record — the
        // book only describes rows currently on show. The used basket
        // freeze STAYS: it is historical evidence, referenced by the
        // shop's copied spendPrediction, not live state.
        shoppingPredictions: (s.shoppingPredictions || []).filter((p) => !bought.some((item) => item.id === p.id)),
        storeRoutes: route.length > 1 ? { ...s.storeRoutes, [shop.store]: route } : s.storeRoutes,
        pantry: reconciled ? reconciled.pantry : s.pantry,
        pantryConflicts: reconciled
          ? [...(s.pantryConflicts || []), ...reconciled.conflicts].slice(-100)
          : s.pantryConflicts,
        pantryEvents: pantryEvent ? [...(s.pantryEvents || []), pantryEvent].slice(-100) : s.pantryEvents,
        lastPantryEvent: pantryEvent || s.lastPantryEvent,
      };
    }),
});

export { receiptActions } from './receipt-actions.js';
