/**
 * Everything that can change a calorie target, in one place.
 *
 * They all share a shape: write the thing you changed, then recompute the
 * targets from it — unless the targets are custom, in which case they are
 * yours and nothing recalculates them. The recompute runs `targetsFor`, so the
 * safety assessment in `target-safety.js` governs every one of these.
 */

import { DEFAULT_TARGETS } from '../data/nutrients.js';
import { targetsFor, targetSafety } from './goals.js';
import { confirmationRecord } from './target-safety.js';

const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

/** Recompute unless the person has taken the numbers over. */
const recomputed = (state, next) => (state.targetMode === 'auto' ? targetsFor(next) : state.targets);

export const targetActions = (set) => ({
  setTarget: (key, value) =>
    set((s) => ({
      targets: { ...s.targets, [key]: Math.max(0, Number(value) || 0) },
      targetMode: MACRO_KEYS.includes(key) ? 'custom' : s.targetMode,
    })),
  resetTargets: () => set((s) => ({ targets: targetsFor({ ...s, targets: DEFAULT_TARGETS }), targetMode: 'auto' })),
  setGoal: (goal) =>
    set((s) => {
      const next = { ...s, goal };
      return { goal, targets: recomputed(s, next) };
    }),
  toggleDiet: (id) =>
    set((s) => {
      const diets = s.diets.includes(id) ? s.diets.filter((d) => d !== id) : [...s.diets, id];
      const next = { ...s, diets };
      return { diets, targets: recomputed(s, next) };
    }),
  setBody: (patch) =>
    set((s) => {
      const body = { ...s.body, ...patch };
      const next = { ...s, body };
      return { body, targets: recomputed(s, next) };
    }),
  setMaintenance: (kcal) =>
    set((s) => {
      const maintenanceKcal = Math.max(0, Number(kcal) || 0);
      const next = { ...s, maintenanceKcal };
      return { maintenanceKcal, targets: recomputed(s, next) };
    }),
  setTargetMode: (targetMode) =>
    set((s) => ({
      targetMode,
      targets: targetMode === 'auto' ? targetsFor(s) : s.targets,
    })),
  // The screen that comes before a restrictive goal. Answers are stored as
  // given and nothing is inferred from them; the targets recompute because an
  // unanswered or flagged screen plans at maintenance.
  answerGoalScreening: (id, answer) =>
    set((s) => {
      const goalScreening = { ...(s.goalScreening || {}), [id]: answer === 'yes' ? 'yes' : 'no' };
      const next = { ...s, goalScreening };
      return { goalScreening, targets: recomputed(s, next) };
    }),
  clearGoalScreening: () =>
    set((s) => {
      const next = { ...s, goalScreening: null, targetConfirmation: null };
      return { goalScreening: null, targetConfirmation: null, targets: recomputed(s, next) };
    }),
  // Confirming the target Forq has proposed. The record names that target, so
  // changing the goal or the numbers behind it asks again rather than carrying
  // an old agreement over to a figure nobody has seen.
  confirmTarget: () =>
    set((s) => {
      const { signature } = targetSafety(s).confirmation;
      if (!signature) return {};
      const targetConfirmation = confirmationRecord(signature, s.day);
      const next = { ...s, targetConfirmation };
      return { targetConfirmation, targets: recomputed(s, next) };
    }),
  setWeeklyKcal: (kcal) => set({ weeklyKcal: Math.max(0, Number(kcal) || 0) }),
});
