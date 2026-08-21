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
import { emojiFor, EMPTY_STATE, todayStamp, uid } from './state.js';
import { parseBackup, serialiseBackup } from './store-persistence.js';
import { vaultActions } from './vault-actions.js';
import { receiptActions, shoppingActions } from './shopping-actions.js';
import { normalisePriceAlertConfig } from './price-alerts.js';
import { COUPON_KINDS, LOYALTY_PROGRAMMES, normaliseCoupon } from './coupons.js';
import { duplicatePurchaseCheck } from './shopping-intelligence.js';
export function useStoreApi({
  blockPersistence, cloudStatus, latest, setState, setStorageIssue, storageIssue,
  undoHistory, vaultKey, vaultSalt, vaultWrites, setVaultUnlocked,
}) {
  const api = useMemo(() => {
    const set = (patch) => setState((s) => {
      let changes = typeof patch === 'function' ? patch(s) : patch;
      if (!changes || !Object.keys(changes).length) return s;
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
      undoHistory.current = [...undoHistory.current.slice(-29), s];
      return { ...s, ...changes };
    });
    const addEntries = (entries, date) =>
      set((s) => {
        const day = date || s.day;
        if (!entries.length) return {};
        return {
          log: { ...s.log, [day]: [...(s.log[day] || []), ...entries] },
        };
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
          undoHistory.current = [];
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
        undoHistory.current = [];
        setStorageIssue(null);
        setState({ ...EMPTY_STATE, day: todayStamp() });
      },
      finishOnboarding: (profile) =>
        set((s) => ({
          ...profile,
          onboarded: true,
          measurements: seedMeasurements(profile.body, s.day, s.measurements),
        })),
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
      saveRecipe: (recipe) =>
        set((s) => {
          if (!householdPermission(s, 'recipes')) return {};
          const id = s.myRecipes.some((r) => r.id === recipe.id) ? `${recipe.id}-${s.myRecipes.length + 1}` : recipe.id;
          return { myRecipes: [...s.myRecipes, { ...recipe, id, savedAt: s.day }] };
        }),
      removeRecipe: (id) =>
        set((s) => (householdPermission(s, 'recipes') ? {
          myRecipes: s.myRecipes.filter((r) => r.id !== id),
          favourites: s.favourites.filter((f) => f !== id),
          recipeCollections: s.recipeCollections.map((collection) => ({
            ...collection,
            recipeIds: collection.recipeIds.filter((recipeId) => recipeId !== id),
          })),
          recipeRatings: Object.fromEntries(Object.entries(s.recipeRatings).filter(([recipeId]) => recipeId !== id)),
          tasteRatings: Object.fromEntries(Object.entries(s.tasteRatings).filter(([recipeId]) => recipeId !== id)),
        } : {})),
      toggleFavourite: (id) =>
        set((s) => (householdPermission(s, 'recipes') ? {
          favourites: s.favourites.includes(id)
            ? s.favourites.filter((x) => x !== id)
            : [...s.favourites, id],
        } : {})),
      rateRecipeTaste: (id, verdict) =>
        set((s) => {
          if (!householdPermission(s, 'recipes') || !id || !['nope', 'like', 'love'].includes(verdict)) return {};
          const liked = verdict === 'like' || verdict === 'love';
          return {
            tasteRatings: { ...s.tasteRatings, [id]: verdict },
            favourites: liked
              ? [...new Set([...s.favourites, id])]
              : s.favourites.filter((recipeId) => recipeId !== id),
          };
        }),
      resetRecipeTaste: () => set({ tasteRatings: {} }),
      createRecipeCollection: (name, recipeId = null) =>
        set((s) => {
          if (!householdPermission(s, 'recipes')) return {};
          const clean = String(name || '').trim().slice(0, 40);
          if (clean.length < 2) return {};
          const existing = s.recipeCollections.find((collection) => collection.name.toLowerCase() === clean.toLowerCase());
          if (existing) {
            if (!recipeId || existing.recipeIds.includes(recipeId)) return {};
            return {
              recipeCollections: s.recipeCollections.map((collection) => (
                collection.id === existing.id
                  ? { ...collection, recipeIds: [...collection.recipeIds, recipeId] }
                  : collection
              )),
            };
          }
          return {
            recipeCollections: [...s.recipeCollections, {
              id: uid('rc'),
              name: clean,
              recipeIds: recipeId ? [recipeId] : [],
              createdAt: s.day,
            }],
          };
        }),
      removeRecipeCollection: (id) =>
        set((s) => (householdPermission(s, 'recipes')
          ? { recipeCollections: s.recipeCollections.filter((collection) => collection.id !== id) }
          : {})),
      toggleRecipeCollection: (collectionId, recipeId) =>
        set((s) => {
          if (!householdPermission(s, 'recipes') || !recipeId) return {};
          return {
            recipeCollections: s.recipeCollections.map((collection) => {
              if (collection.id !== collectionId) return collection;
              return {
                ...collection,
                recipeIds: collection.recipeIds.includes(recipeId)
                  ? collection.recipeIds.filter((id) => id !== recipeId)
                  : [...collection.recipeIds, recipeId],
              };
            }),
          };
        }),
      rateRecipe: (id, rating) =>
        set((s) => {
          if (!householdPermission(s, 'recipes')) return {};
          const score = Math.round(Number(rating));
          if (!id || score < 1 || score > 5) return {};
          return { recipeRatings: { ...s.recipeRatings, [id]: score } };
        }),
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
            cost: Number(item.cost) || 0,
          }, { learnedAliases: s.aliasMemory || {} });
          const result = consolidate([...s.pantry, added], { learnedAliases: s.aliasMemory || {}, today: s.day });
          return {
            pantry: result.pantry,
            pantryConflicts: [...(s.pantryConflicts || []), ...result.conflicts].slice(-100),
          };
        }),
      updatePantryItem: (id, patch) =>
        set((s) => (householdPermission(s, 'pantry') ? { pantry: s.pantry.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : {})),
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
          return fresh.length ? { shoppingList: [...s.shoppingList, ...fresh] } : {};
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
          const shop = {
            id: uid('h'),
            date: s.day,
            store: shopStore,
            total: Math.round((Number(total) || 0) * 100) / 100,
            saved,
            items: bought.map(({ name, price, qty, emoji }) => ({
              name,
              price: Number(price) || 0,
              priceSource: 'receipt',
              recordedAt: s.day,
              qty,
              emoji,
            })),
          };
          const purchaseDate = s.day;
          const route = routeFromTicks(bought);
          const reconciled = toPantry && householdPermission(s, 'pantry')
            ? reconcilePurchase(s.pantry, bought.map((item) => ({
              ...item, store: shop.store, location, price: Number(item.price) || 0,
            })), {
              learnedAliases: s.aliasMemory || {},
              date: purchaseDate,
              today: s.day,
              location,
              idFactory: () => uid('p'),
            })
            : null;
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
      addOffer: (offer) =>
        set((s) => {
          const label = String(offer.label || '').trim();
          const match = String(offer.match || '').trim();
          if (label.length < 2 || !match) return {};
          return {
            offers: [...s.offers, {
              id: uid('o'),
              label,
              match,
              kind: ['money', 'percent', 'multibuy'].includes(offer.kind) ? offer.kind : 'money',
              value: Math.max(0, Number(offer.value) || 0),
              store: String(offer.store || '').trim(),
              expiry: /^\d{4}-\d{2}-\d{2}$/.test(offer.expiry || '') ? offer.expiry : null,
              addedAt: s.day,
            }],
          };
        }),
      removeOffer: (id) => set((s) => ({ offers: s.offers.filter((o) => o.id !== id) })),
      addPriceAlert: ({ name, target }) =>
        set((s) => {
          const label = String(name || '').trim();
          const price = Math.max(0, Number(target) || 0);
          if (label.length < 2 || !price) return {};
          return { priceAlerts: [...s.priceAlerts, { id: uid('pa'), name: label, target: price }] };
        }),
      removePriceAlert: (id) =>
        set((s) => ({ priceAlerts: s.priceAlerts.filter((alert) => alert.id !== id) })),
      setPriceAlertConfig: (patch) =>
        set((s) => {
          const next = normalisePriceAlertConfig({ ...s.priceAlertConfig, ...(patch || {}) });
          return { priceAlertConfig: next };
        }),
      /* ---- Kitchen intelligence (Forq 10) ---- */
      setShoppingPreferences: (patch) =>
        set((s) => ({
          shoppingPreferences: {
            ...(s.shoppingPreferences || {}),
            ...(patch || {}),
            offlineMode: patch?.offlineMode == null ? Boolean(s.shoppingPreferences?.offlineMode) : Boolean(patch.offlineMode),
            largeTouch: patch?.largeTouch == null ? Boolean(s.shoppingPreferences?.largeTouch) : Boolean(patch.largeTouch),
          },
        })),
      setStoreRoute: (store, order) =>
        set((s) => {
          const cleanStore = String(store || '').trim();
          if (!cleanStore) return {};
          const cleaned = (Array.isArray(order) ? order : [])
            .map((aisle) => String(aisle || '').trim())
            .filter(Boolean);
          if (!cleaned.length) return {};
          return { storeRoutes: { ...(s.storeRoutes || {}), [cleanStore]: cleaned } };
        }),
      clearStoreRoute: (store) =>
        set((s) => {
          const routes = { ...(s.storeRoutes || {}) };
          if (!routes[store]) return {};
          delete routes[store];
          return { storeRoutes: routes };
        }),
      /** A scan/typo correction: 'tomatos' → 'tomatoes'. Teaches entity resolution. */
      learnCorrection: ({ from, to }) =>
        set((s) => {
          const next = learnAlias(s.aliasMemory || {}, from, to);
          if (next === s.aliasMemory) return {};
          const result = consolidate(s.pantry, { learnedAliases: next, today: s.day });
          const event = {
            id: uid('pe'), type: 'household_alias_learned', date: s.day,
            from, to, merged: result.merged,
          };
          return {
            aliasMemory: next,
            pantry: result.pantry,
            pantryConflicts: [...(s.pantryConflicts || []), ...result.conflicts].slice(-100),
            pantryEvents: [...(s.pantryEvents || []), event].slice(-100),
            lastPantryEvent: event,
          };
        }),
      /** Alias-aware pantry consumption for one recipe's ingredient line. */
      canonicalName: (name) => canonicalName(name, latest.current.aliasMemory),
      setPriceAlertOverride: (name, kind, pct) =>
        set((s) => {
          const key = String(name || '').trim().toLowerCase();
          if (!key || !['rise', 'bargain'].includes(kind)) return {};
          const n = Math.max(5, Math.min(50, Math.round(Number(pct) || 15)));
          const overrides = { ...(s.priceAlertConfig?.overrides || {}) };
          const existing = overrides[key] || {};
          overrides[key] = { ...existing, [kind === 'rise' ? 'risePct' : 'bargainPct']: n };
          return { priceAlertConfig: normalisePriceAlertConfig({ ...s.priceAlertConfig, overrides }) };
        }),
      clearPriceAlertOverride: (name, kind) =>
        set((s) => {
          const key = String(name || '').trim().toLowerCase();
          const overrides = { ...(s.priceAlertConfig?.overrides || {}) };
          if (!overrides[key]) return {};
          const next = { ...overrides[key] };
          if (kind === 'rise') delete next.risePct;
          else if (kind === 'bargain') delete next.bargainPct;
          else delete overrides[key];
          if (kind && Object.keys(next).length) overrides[key] = next;
          else if (!kind) delete overrides[key];
          else delete overrides[key];
          return { priceAlertConfig: normalisePriceAlertConfig({ ...s.priceAlertConfig, overrides }) };
        }),
      // Coupon vault — manual + photo OCR draft (no retailer feed)
      addCoupon: (raw) =>
        set((s) => {
          const label = String(raw?.label || '').trim();
          if (label.length < 2) return {};
          const normalised = normaliseCoupon({ ...raw, id: raw?.id || uid('cp'), addedAt: s.day }, s.day);
          if (!normalised.label) return {};
          if (normalised.kind === 'money' || normalised.kind === 'percent' || normalised.kind === 'multibuy') {
            if (!(Number(normalised.value) > 0)) return {};
          }
          const kindOk = COUPON_KINDS.some((k) => k.id === normalised.kind);
          if (!kindOk) return {};
          const progOk = !normalised.programme || LOYALTY_PROGRAMMES.some((p) => p.id === normalised.programme);
          if (!progOk) return {};
          return { coupons: [...(s.coupons || []), normalised] };
        }),
      updateCoupon: (id, patch) =>
        set((s) => ({
          coupons: (s.coupons || []).map((c) => (c.id === id ? normaliseCoupon({ ...c, ...patch, id }, s.day) : c)),
        })),
      removeCoupon: (id) => set((s) => ({ coupons: (s.coupons || []).filter((c) => c.id !== id) })),
      toggleCouponUsed: (id) =>
        set((s) => ({
          coupons: (s.coupons || []).map((c) => c.id === id ? { ...c, used: !c.used, usedAt: !c.used ? s.day : null } : c),
        })),
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
              reason: reason || 'discarded',
              lifecycleState: 'discarded',
              date: s.day,
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
      markMealPlanOutcome: ({ date, slot, status = 'skipped', reason = null, actualRecipeId = null } = {}) =>
        set((s) => {
          const plannedRecipeId = s.plan?.[date]?.[slot];
          const allowed = ['cooked', 'skipped', 'substituted', 'unplanned', 'takeaway'];
          if (!date || !slot || !plannedRecipeId || !allowed.includes(status)) return {};
          // Validate reason against full list — including new leftovers-available, plan-too-complex, takeaway
          const validReasons = ['no-time', 'missing-ingredients', 'ingredients-missing', 'changed-preference', 'leftovers-available', 'plan-too-complex', 'not-in-the-mood', 'plans-changed', 'ate-something-else', 'takeaway', 'cooked-a-different-meal', 'other'];
          const cleanReason = validReasons.includes(reason) ? reason : (status === 'skipped' ? 'other' : null);
          const event = {
            id: uid('mpe'),
            date,
            slot,
            plannedRecipeId,
            actualRecipeId: actualRecipeId || (status === 'cooked' ? plannedRecipeId : status === 'substituted' ? actualRecipeId : null),
            status: status === 'takeaway' ? 'skipped' : status,
            reason: status === 'skipped' || status === 'takeaway' ? (cleanReason === 'takeaway' ? 'takeaway' : cleanReason) : (cleanReason === 'cooked-a-different-meal' ? 'cooked-a-different-meal' : null),
            isTakeaway: status === 'takeaway',
            leftoverUsed: reason === 'leftovers-available',
            at: Date.now(),
          };
          const existing = (s.mealPlanEvents || []).filter((item) => !(item.date === date && item.slot === slot));
          return { mealPlanEvents: [...existing, event].slice(-500) };
        }),
      recordTakeaway: ({ date = null, reason = 'takeaway', note = '' } = {}) =>
        set((s) => {
          const d = date || s.day;
          const event = {
            id: uid('mpe'),
            date: d,
            slot: 'unplanned',
            plannedRecipeId: null,
            actualRecipeId: null,
            status: 'unplanned',
            reason: reason || 'takeaway',
            note: String(note || '').slice(0, 120),
            at: Date.now(),
          };
          return { mealPlanEvents: [...(s.mealPlanEvents || []), event].slice(-500) };
        }),
      setPlanSlot: (date, slot, recipeId) =>
        set((s) => {
          const day = { ...(s.plan[date] || {}) };
          if (recipeId) day[slot] = recipeId;
          else delete day[slot];
          const plan = { ...s.plan };
          if (Object.keys(day).length) plan[date] = day;
          else delete plan[date];
          return { plan };
        }),
      clearPlanWeek: (dates) => set((s) => ({ plan: clearDates(s.plan, dates) })),
      moveMealSlot: (from, to) => set((s) => ({ plan: moveMeal(s.plan, from, to) })),
      applyPlanEntries: (entries) => set((s) => ({ plan: applyEntries(s.plan, entries) })),
      ...householdActions(set, uid),
      saveLeftovers: (recipe, portions) =>
        set((s) => (householdPermission(s, 'pantry') && portions > 0
          ? { pantry: [...s.pantry, { id: uid('p'), low: false, ...leftoverEntry(recipe, portions, s.day) }] }
          : {})),
      useLeftover: (id) =>
        set((s) => (householdPermission(s, 'pantry') ? {
          pantry: s.pantry
            .map((p) => {
              if (p.id !== id) return p;
              const portions = (Number(p.portions) || 1) - 1;
              return { ...p, portions, qty: `${portions} portion${portions === 1 ? '' : 's'}` };
            })
            .filter((p) => p.cat !== LEFTOVER_CAT || (Number(p.portions) || 0) > 0),
        } : {})),
      ...healthActions(set),
      ...reminderActions(set),
      ...smartActions(set), ...pantryActions(set),
      ...preferenceActions(set),
      ...advancedActions(set, uid),
      logEntries: addEntries,
      logEntry: (entry, date) => addEntries([entry], date),
      updateEntry: (id, patch, date) =>
        set((s) => {
          const day = date || s.day;
          return {
            log: { ...s.log, [day]: (s.log[day] || []).map((e) => (e.id === id ? { ...e, ...patch } : e)) },
          };
        }),
      removeEntry: (id, date) =>
        set((s) => {
          const day = date || s.day;
          return { log: { ...s.log, [day]: (s.log[day] || []).filter((e) => e.id !== id) } };
        }),
      copyMeal: ({ fromDate, fromMeal, toMeal, toDate }) =>
        set((s) => {
          const source = (s.log[fromDate] || []).filter((e) => e.meal === fromMeal);
          if (!source.length) return {};
          const day = toDate || s.day;
          const copied = copyEntries(source, { meal: toMeal || fromMeal });
          return { log: { ...s.log, [day]: [...(s.log[day] || []), ...copied] } };
        }),
      saveTemplate: (name, meal, entries) =>
        set((s) => ({
          mealTemplates: [...s.mealTemplates, {
            id: uid('tpl'),
            name: name || `${meal} template`,
            meal,
            entries: entries.map((e) => ({ ...e, time: '00:00' })),
          }],
        })),
      deleteTemplate: (id) => set((s) => ({ mealTemplates: s.mealTemplates.filter((t) => t.id !== id) })),
      applyTemplate: (id, meal) =>
        set((s) => {
          const tpl = s.mealTemplates.find((t) => t.id === id);
          if (!tpl) return {};
          const copied = copyEntries(tpl.entries, { meal: meal || tpl.meal }).map((e) => ({
            ...e,
            time: new Date().toTimeString().slice(0, 5),
            source: 'template',
          }));
          return { log: { ...s.log, [s.day]: [...(s.log[s.day] || []), ...copied] } };
        }),
      addCustomFood: (food) => set((s) => ({ customFoods: [...s.customFoods, food] })),
      removeCustomFood: (id) => set((s) => ({ customFoods: s.customFoods.filter((f) => f.id !== id) })),
      toggleFavouriteFood: (id) =>
        set((s) => ({
          favouriteFoods: s.favouriteFoods.includes(id)
            ? s.favouriteFoods.filter((x) => x !== id)
            : [...s.favouriteFoods, id],
        })),
      completeRecipe: (recipe, { leftovers = 0, actualMins = null } = {}) =>
        set((s) => {
          const entry = buildEntry(recipeFood(recipe, [...CATALOGUE, ...s.customFoods]), { source: 'recipe' });
          // Cooking a 4-serving dish for a household of 2 uses half of it.
          const consumed = householdPermission(s, 'pantry') && s.autoUsePantry
            ? consumePantryIngredients(s.pantry, recipe.ingredients, {
              learnedAliases: s.aliasMemory,
              servings: Math.max(1, Math.round(s.portions || 0)) + Math.max(0, Number(leftovers) || 0),
              recipeServings: recipe.servings,
              today: s.day,
            })
            : { pantry: s.pantry, used: [], shortfalls: [], assumed: [], confirmationNeeded: [] };
          const inference = inferConsumption({
            recipe,
            ...consumed,
            today: s.day,
            enabled: householdPermission(s, 'pantry') && s.autoUsePantry,
          });
          const pantryEvent = { id: uid('pe'), ...inference };
          const plannedSlots = Object.entries(s.plan?.[s.day] || {});
          const plannedSlot = plannedSlots.find(([, recipeId]) => recipeId === recipe.id) || plannedSlots[0] || null;
          const plannedRecipeId = plannedSlot?.[1] || null;
          const mealPlanEvent = plannedSlot ? {
            id: uid('mpe'),
            date: s.day,
            slot: plannedSlot[0],
            plannedRecipeId,
            actualRecipeId: recipe.id,
            status: plannedRecipeId === recipe.id ? 'cooked' : 'substituted',
            reason: plannedRecipeId === recipe.id ? null : 'cooked-a-different-meal',
            at: Date.now(),
          } : null;
          const elapsed = Number(actualMins);
          const timeEvent = Number.isFinite(elapsed) && elapsed > 0 ? {
            id: uid('ct'),
            recipeId: recipe.id,
            date: s.day,
            estimatedMins: Number(recipe.time) || null,
            actualMins: Math.round(elapsed * 10) / 10,
          } : null;
          return {
            cooked: [...s.cooked, { recipeId: recipe.id, date: s.day }],
            log: { ...s.log, [s.day]: [...(s.log[s.day] || []), entry] },
            mealPlanEvents: mealPlanEvent
              ? [...(s.mealPlanEvents || []).filter((item) => !(item.date === s.day && item.slot === mealPlanEvent.slot)), mealPlanEvent].slice(-500)
              : s.mealPlanEvents || [],
            cookingTimeHistory: timeEvent
              ? [...(s.cookingTimeHistory || []), timeEvent].slice(-300)
              : s.cookingTimeHistory || [],
            pantry: householdPermission(s, 'pantry') && leftovers > 0
              ? [...consumed.pantry, { id: uid('p'), low: false, ...leftoverEntry(recipe, leftovers, s.day) }]
              : consumed.pantry,
            pantryEvents: [...(s.pantryEvents || []), pantryEvent].slice(-100),
            lastPantryEvent: pantryEvent,
          };
        }),
    };
  }, [storageIssue, cloudStatus]);
  return api;
}
