import { useMemo } from 'react';
import { CATALOGUE } from '../data/foods.js';
import { guessAisle } from '../data/stores.js';
import { aisleFor, mergeItems, rememberAisle, shoppingNameKey } from './shopping.js';
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
import { householdPortionsFor } from './portions.js';
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
import { upsertPredictions } from './shopping-predictions.js';
import { predictionActions } from './prediction-feedback.js';
import { shoppingListMutations } from './shopping-list-mutations.js';
import {
  PREDICTION_PROVENANCE,
  basketPredictionEvent,
  quantityOverrideEvent,
} from './prediction-evidence.js';
import { buildDomainCommands } from './store-commands.js';
import { ledgerCommands } from './event-ledger.js';
import { pantryLifecycleActions } from './store-pantry-slice.js';
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
      claimAdventureMission: (id) => set((s) => ({ adventureCompleted: { ...(s.adventureCompleted || {}), [id]: true }, xp: (s.xp || 0) + 50 })),
      savePlanSimulation: (simulation) => set((s) => ({ planSimulations: [...(s.planSimulations || []), { ...simulation, id: uid('sim'), savedAt: Date.now() }].slice(-20) })),
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
      // Provenance for added rows (task: freeze prediction provenance): a
      // recipe-derived row is Forq's plan advice, an auto-generated row is a
      // Forq top-up, everything else is the household's own hand-added row —
      // unless the caller names the provenance explicitly.
      ...shoppingListMutations(set, { latest }),

      // substituteListItem lives in shopping-actions.js (with the other row
      // actions) and writes substitution lineage onto the prediction book —
      // a row that changed ingredient must not ride its old snapshot.
      // recordShop lives in shopping-actions.js (one shared purchase
      // recorder: checked-rows flow and domain commands keep one shape).
      ...offerActions(set, latest),
      ...predictionActions(set),
      compareBaskets: (items, offersByStore, options) => compareBaskets(items, offersByStore, options),
      wasteLearningProfile: () => wasteLearningProfile({
        purchases: latest.current.shops || [],
        waste: latest.current.waste || [],
        today: latest.current.day,
        learnedAliases: latest.current.aliasMemory || {},
      }),
      // Pantry lifecycle lives in its own domain slice (see store-pantry-slice.js).
      ...pantryLifecycleActions(set, { householdPermission, uid }),
      ...planActions(set),
      ...pantryFlowActions(set),
      ...householdActions(set, uid),
      ...healthActions(set),
      ...reminderActions(set),
      ...smartActions(set), ...pantryActions(set),
      ...preferenceActions(set),
      ...advancedActions(set, uid),
      ...diaryActions(set),
      // Plan → Shop → Eat domain slices: one verb per intent + ledger events.
      // Legacy slice actions above stay for backwards compatibility.
      ...buildDomainCommands(set),
      ...ledgerCommands(set),
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
