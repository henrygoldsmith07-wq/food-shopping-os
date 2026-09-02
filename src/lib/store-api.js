import { useMemo } from 'react';
import { CATALOGUE } from '../data/foods.js';
import { guessAisle } from '../data/stores.js';
import { aisleFor, applyOffers, mergeItems, rememberAisle, routeFromTicks, shoppingNameKey } from './shopping.js';
import { buildEntry, copyEntries } from './nutrition.js';
import { recipeFood } from './foodlog.js';
import { targetActions } from './target-actions.js';
import { applyEntries, clearDates, LEFTOVER_CAT, leftoverEntry, moveMeal } from './mealplan.js';
import { consumePantryIngredients } from './kitchen.js';
import { canonicalName, learnAlias } from './aliases.js';
import { inferPantryStock } from './pantry-intelligence.js';
import { consolidatePantry as consolidate, inferConsumption, normalisePantryItem, reconcilePurchase } from './pantry-intelligence.js';
import { pantryActions } from './pantry-actions.js';
import { healthActions, seedMeasurements } from './health-actions.js';
import { reminderActions } from './reminder-actions.js';
import { advancedActions, preferenceActions } from './preference-actions.js';
import { householdActions } from './household-actions.js';
import { smartActions } from './smart-actions.js';
import { HEALTH_CREDENTIAL_KEY, HEALTH_FIELDS, HEALTH_VAULT_KEY } from './health-vault.js';
import { householdPermission } from './household.js';
import { moveBefore } from './utils.js';
import { recipeActions } from './recipe-actions.js';
import { diaryActions } from './diary-actions.js';
import { offerActions } from './offer-actions.js';
import { planActions } from './plan-actions.js';
import { pantryFlowActions } from './pantry-flow-actions.js';
import { withAutoListSync } from './week-loop.js';
import { emojiFor, EMPTY_STATE, todayStamp, uid } from './state.js';
import { parseBackup, serialiseBackup } from './store-persistence.js';
import { vaultActions } from './vault-actions.js';
import { receiptActions, shoppingActions } from './shopping-actions.js';
import { normalisePriceAlertConfig } from './price-alerts.js';
import { COUPON_KINDS, LOYALTY_PROGRAMMES, normaliseCoupon } from './coupons.js';
import { duplicatePurchaseCheck } from './shopping-intelligence.js';
import { compareBaskets } from './basket-optimizer.js';
import { applyWasteLearning, wasteLearningProfile } from './waste-learning.js';
export function useStoreApi({
  blockPersistence, cloudStatus, latest, setState, setStorageIssue, storageIssue,
  undoHistory, undoBatch, vaultKey, vaultSalt, vaultWrites, setVaultUnlocked,
}) {
  const api = useMemo(() => {      const set = (patch) => setState((s) => {
      let changes = typeof patch === 'function' ? patch(s) : patch;
      if (!changes || !Object.keys(changes).length) return s;
      // Plan edits, pantry spent by cooking, binned ingredients and portion
      // corrections re-derive the shopping list in the same write — the
      // transitions between loop stages happen by themselves.
      changes = withAutoListSync(s, changes);
      const shoppingKeys = ['shoppingList', 'shops', 'favouriteShopping', 'shoppingPreferences', 'aisleMemory', 'storeRoutes', 'offers'];
      if (Object.keys(changes).some((key) => shoppingKeys.includes(key)) && !changes.shoppingMeta) {
        changes = {
          ...changes,
          shoppingMeta: {
            ...(s.shoppingMeta || {}),
            lastChangedAt: Date.now(),
            lastChangedBy: s.activeMemberId || 'this device',
          },
        };
      }
      if (s.healthVaultEnabled && !vaultKey.current
        && Object.keys(changes).some((key) => HEALTH_FIELDS.includes(key))) return s;
      if (undoBatch?.current) {  // one import, one undo step
        if (undoBatch.current === 'open') undoBatch.current = s;
        return { ...s, ...changes };
      }
      undoHistory.current = [...undoHistory.current.slice(-29), s];
      return { ...s, ...changes };
    });
    return {
      ...shoppingActions(set), ...receiptActions(set),
      set,
      storageIssue,
      cloudStatus,
      exportData: () => serialiseBackup(
        latest.current,
        latest.current.healthVaultEnabled
          ? JSON.parse(localStorage.getItem(HEALTH_VAULT_KEY) || 'null')
          : null,
      ),
      restoreData: (text) => {
        try {
          const backup = typeof text === 'string' ? JSON.parse(text) : text;
          const restored = parseBackup(text);
          if (backup?.healthVault) localStorage.setItem(HEALTH_VAULT_KEY, JSON.stringify(backup.healthVault));
          vaultKey.current = null;
          vaultSalt.current = null;
          setVaultUnlocked(false);
          blockPersistence.current = false;
          undoHistory.current = []; undoBatch.current = null;
          setStorageIssue(null);
          setState(restored);
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'That backup could not be read.',
          };
        }
      },
      undoLast: () => {
        const previous = undoHistory.current.pop();
        if (!previous) return false;
        setState(previous);
        return true;
      },
      reset: () => {
        localStorage.removeItem(HEALTH_VAULT_KEY);
        localStorage.removeItem(HEALTH_CREDENTIAL_KEY);
        vaultKey.current = null;
        vaultSalt.current = null;
        setVaultUnlocked(false);
        blockPersistence.current = false;
        undoHistory.current = []; undoBatch.current = null;
        setStorageIssue(null);
        setState({ ...EMPTY_STATE, day: todayStamp() });
      },
      finishOnboarding: (profile) =>
        set((s) => {
          // Setup's cycle switch makes the same promise as the one in Goals:
          // turning it on adds the Health cycle page. That page is gated on the
          // 'cycle' optional tool as well as trackCycle, and setTrackCycle
          // already keeps the pair in lockstep -- but setup wrote the flag
          // without the tool, so the page never appeared for that route.
          const tools = new Set(profile.enabledTools ?? s.enabledTools ?? []);
          if (profile.trackCycle) tools.add('cycle'); else tools.delete('cycle');
          return {
            ...profile,
            onboarded: true,
            enabledTools: [...tools],
            measurements: seedMeasurements(profile.body, s.day, s.measurements),
          };
        }),
      dismissSetupStep: (id) =>
        set((s) => ({
          dismissedSetupSteps: s.dismissedSetupSteps.includes(id)
            ? s.dismissedSetupSteps
            : [...s.dismissedSetupSteps, id],
        })),
      dismissWelcome: () => set({ welcomeDismissed: true }),
      ...vaultActions({
        latest, set, setVaultUnlocked, undoHistory, vaultKey, vaultSalt, vaultWrites,
      }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setAccent: (accent) => set({ accent }),
      addWater: (d) => set((s) => ({ water: Math.max(0, Math.min(8, s.water + d)) })),
      addWaterMl: (ml) => set((s) => ({ waterExtraMl: Math.max(0, s.waterExtraMl + ml) })),
      ...targetActions(set),
      ...recipeActions(set),
      addPantryItem: (item = {}) =>
        set((s) => {
          if (!householdPermission(s, 'pantry')) return {};
          const added = normalisePantryItem({
            id: uid('p'),
            emoji: emojiFor(item.name),
            low: false,
            addedAt: s.day,
            lifecycleState: item.lifecycleState || 'purchased',
            openedDate: item.openedDate || null,
            ...item,
            name: String(item.name || '').trim(),
            // The day it went into the cupboard is the purchase day when no
            // other date was given — freshness and confidence read off it.
            purchaseDate: item.purchaseDate || s.day,
            lastConfirmedAt: item.lastConfirmedAt || s.day,
            confidenceUpdatedAt: item.confidenceUpdatedAt || s.day,
            purchaseSource: item.purchaseSource || item.source || 'manual',
            expectedConsumptionRate: item.expectedConsumptionRate || null,
            plannedMealAllocations: item.plannedMealAllocations || [],
            cost: Number(item.cost) || 0,
          }, { learnedAliases: s.aliasMemory || {} });
          const result = consolidate([...s.pantry, added], { learnedAliases: s.aliasMemory || {}, today: s.day });
          return {
            pantry: result.pantry,
            pantryConflicts: [...(s.pantryConflicts || []), ...result.conflicts].slice(-100),
          };
        }),
      updatePantryItem: (id, patch) =>
        set((s) => (householdPermission(s, 'pantry') ? {
          pantry: s.pantry.map((p) => (p.id === id ? {
            ...p,
            ...patch,
            ...(Object.prototype.hasOwnProperty.call(patch || {}, 'qty') ? {
              amountConfidence: patch.qty ? (patch.amountConfidence || 'approximate') : 'unknown',
              lastConfirmedAt: s.day,
              confidenceUpdatedAt: s.day,
            } : {}),
          } : p)),
        } : {})),
      confirmPantryItem: (id, patch = {}) =>
        set((s) => (householdPermission(s, 'pantry') ? {
          pantry: s.pantry.map((p) => (p.id === id ? {
            ...p,
            ...patch,
            confidence: 'definite',
            amountConfidence: patch.qty ? (patch.amountConfidence || 'exact') : p.amountConfidence,
            lastConfirmedAt: s.day,
            confidenceUpdatedAt: s.day,
          } : p)),
        } : {})),
      refreshPantryEstimates: () =>
        set((s) => {
          if (!householdPermission(s, 'pantry')) return {};
          const events = [...(s.pantryEvents || []), ...(s.cooked || []).map((entry) => ({ ...entry, type: 'recipe_consumption' }))];
          const inferred = s.pantry.map((item) => inferPantryStock(item, { events, today: s.day }).item);
          return { pantry: inferred, pantryEstimatesAt: s.day };
        }),
      removePantryItem: (id) => set((s) => (householdPermission(s, 'pantry') ? { pantry: s.pantry.filter((p) => p.id !== id) } : {})),
      importPantry: (items) =>
        set((s) => {
          if (!householdPermission(s, 'pantry')) return {};
          const keyFor = (item) => `${String(item.name).trim().toLowerCase()}|${String(item.location || '').toLowerCase()}`;
          const have = new Set(s.pantry.map(keyFor));
          const fresh = items.filter((item) => !have.has(keyFor(item))).map((item) => ({
            ...item,
            id: uid('p'),
            emoji: item.emoji || emojiFor(item.name),
            addedAt: s.day,
          }));
          return fresh.length ? { pantry: [...s.pantry, ...fresh] } : {};
        }),
      togglePantryLow: (id) =>
        set((s) => (householdPermission(s, 'pantry') ? { pantry: s.pantry.map((p) => (p.id === id ? { ...p, low: !p.low } : p)) } : {})),
      addToList: (items) =>
        set((s) => {
          if (!householdPermission(s, 'shopping')) return {};
          const keyFor = shoppingNameKey;
          const have = new Set(s.shoppingList.map((i) => keyFor(i.name)));
          const quantities = new Map();
          [...s.shops].reverse().forEach((shop) => shop.items.forEach((item) => {
            const key = keyFor(item.name);
            if (!quantities.has(key) && item.qty) quantities.set(key, item.qty);
          }));
          const fresh = mergeItems(Array.isArray(items) ? items : [items])
            .filter((i) => i.name && !have.has(keyFor(i.name)))
            .map((i) => {
              const check = duplicatePurchaseCheck(i, {
                list: s.shoppingList,
                shops: s.shops,
                today: s.day,
                learnedAliases: s.aliasMemory || {},
              });
              return {
                id: i.id || uid('s'),
                checked: false,
                price: Number(i.price) || 0,
                priceSource: i.priceSource || (Number(i.price) > 0 ? 'manual' : 'unknown'),
                qty: i.qty || quantities.get(keyFor(i.name)) || '',
                note: String(i.note || '').trim(),
                priority: i.priority === 'high' ? 'high' : 'normal',
                emoji: i.emoji || emojiFor(i.name),
                ...i,
                purchaseWarning: check.recentlyPurchased || null,
                aisle: aisleFor(i.name, s.aisleMemory) === guessAisle(i.name)
                  ? (i.aisle || guessAisle(i.name))
                  : aisleFor(i.name, s.aisleMemory),
              };
            });
          const learned = wasteLearningProfile({
            purchases: s.shops,
            waste: s.waste,
            today: s.day,
            learnedAliases: s.aliasMemory || {},
          });
          const learnedFresh = applyWasteLearning(fresh, learned);
          return learnedFresh.length ? { shoppingList: [...s.shoppingList, ...learnedFresh] } : {};
        }),
      repeatLastShop: () =>
        set((s) => {
          const last = s.shops.at(-1);
          if (!last?.items?.length) return {};
          const have = new Set(s.shoppingList.map((i) => shoppingNameKey(i.name)));
          const items = last.items.filter((i) => i.name && !have.has(shoppingNameKey(i.name)) && (have.add(shoppingNameKey(i.name)), true))
            .map((i) => ({ id: uid('s'), name: i.name, qty: i.qty || '', price: Number(i.price) || 0, priceSource: 'receipt',
              store: last.store || '', emoji: i.emoji || emojiFor(i.name), aisle: aisleFor(i.name, s.aisleMemory), checked: false,
              note: '', priority: 'normal' }));
          return items.length ? { shoppingList: [...s.shoppingList, ...items] } : {};
        }),
      setItemAisle: (id, aisle) =>
        set((s) => {
          const item = s.shoppingList.find((i) => i.id === id);
          if (!item) return {};
          return {
            shoppingList: s.shoppingList.map((i) => (i.id === id ? { ...i, aisle } : i)),
            aisleMemory: rememberAisle(s.aisleMemory, item.name, aisle),
          };
        }),
      updateListItem: (id, patch) =>
        set((s) => ({ shoppingList: s.shoppingList.map((i) => (i.id === id
          ? { ...i, ...patch, ...(Object.prototype.hasOwnProperty.call(patch || {}, 'price') ? { priceSource: Number(patch.price) > 0 ? 'manual' : 'unknown' } : {}) }
          : i)) })),
      substituteListItem: (id, option) =>
        set((s) => {
          const current = s.shoppingList.find((item) => item.id === id);
          const name = String(option?.name || '').trim();
          if (!current || name.length < 2 || current.name === name) return {};
          const duplicate = s.shoppingList.find((item) => item.id !== id && shoppingNameKey(item.name) === shoppingNameKey(name));
          if (duplicate) return {};
          const price = Number(option.price) || 0;
          return {
            shoppingList: s.shoppingList.map((item) => (item.id === id ? {
              ...item,
              name,
              emoji: option.emoji || emojiFor(name),
              price,
              priceSource: price ? (option.priceConfidence === 'receipt' ? 'receipt' : 'recorded') : 'unknown',
              aisle: aisleFor(name, s.aisleMemory),
              substitutedFrom: current.name,
              substitutionWhy: option.why || option.rationale || '',
              purchaseWarning: null,
            } : item)),
          };
        }),
      moveListItem: (id, beforeId) =>
        set((s) => {
          const shoppingList = moveBefore(s.shoppingList, id, beforeId);
          return shoppingList === s.shoppingList ? {} : { shoppingList };
        }),
      removeListItem: (id) => set((s) => ({ shoppingList: s.shoppingList.filter((i) => i.id !== id) })),
      toggleChecked: (id) =>
        set((s) => ({
          shoppingList: s.shoppingList.map((i) => (i.id === id
            ? { ...i, checked: !i.checked, checkedAt: i.checked ? null : Date.now() }
            : i)),
        })),
      clearChecked: () => set((s) => ({ shoppingList: s.shoppingList.filter((i) => !i.checked) })),
      recordShop: ({ store, total, toPantry = false, location = 'Cupboard', itemIds = null }) =>
        set((s) => {
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
          const shop = {
            id: uid('h'),
            date: s.day,
            store: shopStore,
            total: Math.round((Number(total) || 0) * 100) / 100,
            saved,
            pantryReconciled: Boolean(reconciled),
            items: bought.map(({ name, price, qty, emoji }) => ({
              name,
              price: Number(price) || 0,
              priceSource: 'receipt',
              recordedAt: s.day,
              qty,
              emoji,
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
          return {
            shops: [...s.shops, shop],
            shoppingList: s.shoppingList.filter((i) => !bought.some((item) => item.id === i.id)),
            storeRoutes: route.length > 1 ? { ...s.storeRoutes, [shop.store]: route } : s.storeRoutes,
            pantry: reconciled ? reconciled.pantry : s.pantry,
            pantryConflicts: reconciled
              ? [...(s.pantryConflicts || []), ...reconciled.conflicts].slice(-100)
              : s.pantryConflicts,
            pantryEvents: pantryEvent ? [...(s.pantryEvents || []), pantryEvent].slice(-100) : s.pantryEvents,
            lastPantryEvent: pantryEvent || s.lastPantryEvent,
          };
        }),
      ...offerActions(set, latest),
      compareBaskets: (items, offersByStore, options) => compareBaskets(items, offersByStore, options),
      wasteLearningProfile: () => wasteLearningProfile({
        purchases: latest.current.shops || [],
        waste: latest.current.waste || [],
        today: latest.current.day,
        learnedAliases: latest.current.aliasMemory || {},
      }),
      binPantryItem: (id, { qty, value, reason } = {}) =>
        set((s) => {
          const item = householdPermission(s, 'pantry') ? s.pantry.find((p) => p.id === id) : null;
          if (!item) return {};
          const wasteValue = value != null ? Number(value) : Number(item.cost) || 0;
          const lifecycleEvent = {
            id: uid('pe'),
            type: 'pantry_lifecycle',
            itemId: item.id,
            name: item.name,
            from: item.lifecycleState || 'purchased',
            to: 'discarded',
            qty: qty || item.qty || '',
            value: Math.round(wasteValue * 100) / 100,
            cat: item.cat || 'Other',
            reason: reason || 'discarded',
            date: s.day,
            at: Date.now(),
          };
          return {
            pantry: s.pantry
              .map((p) => (p.id === id ? { ...p, lifecycleState: 'discarded', discardedAt: s.day } : p))
              .filter((p) => p.id !== id),
            waste: [...s.waste, {
              name: item.name,
              cost: Math.round(wasteValue * 100) / 100,
              qty: qty || item.qty || '',
              cat: item.cat || 'Other',
              reason: reason || 'expired',
              lifecycleState: 'discarded',
              date: s.day,
              quantity: Number(qty) || undefined,
            }],
            pantryEvents: [...(s.pantryEvents || []), lifecycleEvent].slice(-100),
            lastPantryEvent: lifecycleEvent,
          };
        }),
      consumePantryItem: (id, { qty } = {}) =>
        set((s) => {
          const item = householdPermission(s, 'pantry') ? s.pantry.find((p) => p.id === id) : null;
          if (!item) return {};
          const event = {
            id: uid('pe'),
            type: 'pantry_lifecycle',
            itemId: item.id,
            name: item.name,
            from: item.lifecycleState || 'purchased',
            to: 'consumed',
            qty: qty || item.qty || '',
            value: Number(item.cost) || 0,
            cat: item.cat || 'Other',
            reason: 'consumed',
            date: s.day,
            at: Date.now(),
          };
          return {
            pantry: s.pantry.filter((p) => p.id !== id),
            pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
            lastPantryEvent: event,
          };
        }),
      updatePantryLifecycle: (id, toState, { qty, value, note } = {}) =>
        set((s) => {
          const item = s.pantry.find((p) => p.id === id);
          if (!item || !['opened', 'partially_consumed', 'leftover', 'expired', 'consumed', 'discarded'].includes(toState)) return {};
          const event = {
            id: uid('pe'),
            type: 'pantry_lifecycle',
            itemId: item.id,
            name: item.name,
            from: item.lifecycleState || 'purchased',
            to: toState,
            qty: qty || item.qty || '',
            value: value != null ? Number(value) : Number(item.cost) || 0,
            note: note || '',
            date: s.day,
            at: Date.now(),
          };
          const patch = { lifecycleState: toState };
          if (toState === 'opened') patch.openedDate = s.day;
          if (toState === 'expired') patch.expiredAt = s.day;
          if (toState === 'consumed' || toState === 'discarded') return {
            pantry: s.pantry.filter((p) => p.id !== id),
            waste: toState === 'discarded' ? [...s.waste, { name: item.name, cost: event.value, qty: event.qty, cat: item.cat || 'Other', reason: note || 'discarded', lifecycleState: toState, date: s.day }] : s.waste,
            pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
            lastPantryEvent: event,
          };
          return {
            pantry: s.pantry.map((p) => (p.id === id ? { ...p, ...patch } : p)),
            pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
            lastPantryEvent: event,
          };
        }),
      ...planActions(set),
      ...pantryFlowActions(set),
      ...householdActions(set, uid),
      ...healthActions(set),
      ...reminderActions(set),
      ...smartActions(set), ...pantryActions(set),
      ...preferenceActions(set),
      ...advancedActions(set, uid),
      ...diaryActions(set),
    };
    // Every other input is a ref or a useState setter, so their identities are
    // stable for the component's life: naming them changes nothing at runtime
    // and lets the hook rules check this list instead of being told to skip it.
  }, [
    storageIssue, cloudStatus, blockPersistence, latest, setState, setStorageIssue,
    setVaultUnlocked, undoHistory, undoBatch, vaultKey, vaultSalt, vaultWrites,
  ]);
  return api;
}
