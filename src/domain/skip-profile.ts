// Skip-reason reflections — the review loop's learning side.
//
// A missed-meal card records *why* a planned meal was skipped. When the user
// reviews that card they rate their recall — but the reason is a habit claim,
// not a fact to memorise, so the review also asks whether the reason still
// holds. Every answer is folded into a small per-reason profile: how often
// the household said a reason still applies, how often it said the reason
// changed, and when it last reflected. Pure data in, pure data out — no
// storage, no clock except the injected `at`.

export interface SkipReflection {
  /** How many reviews said the reason still applies. */
  applies: number;
  /** How many reviews said the reason no longer describes the household. */
  changed: number;
  /** Whether the most recent answer said it still applies. */
  lastStillApplies: boolean;
  /** Epoch ms of the last folded answer. */
  lastAt: number;
}

/** Reason id → its reflection history. Absent means never reflected on. */
export type SkipProfile = Record<string, SkipReflection>;

export const emptyProfile = (): SkipProfile => ({});

/** Fold one answer into the profile, immutably. A reason seen for the first
 * time starts from zero; a repeated answer just increments its own side. */
export function foldSkipReflection(
  profile: SkipProfile,
  reasonId: string,
  stillApplies: boolean,
  at: number = Date.now(),
): SkipProfile {
  const prev = profile[reasonId];
  const next: SkipReflection = {
    applies: (prev?.applies || 0) + (stillApplies ? 1 : 0),
    changed: (prev?.changed || 0) + (stillApplies ? 0 : 1),
    lastStillApplies: stillApplies,
    lastAt: at,
  };
  return { ...profile, [reasonId]: next };
}

/** The entry for one reason, or null when the household never reflected. */
export function skipReflectionFor(profile: SkipProfile, reasonId: string): SkipReflection | null {
  return profile[reasonId] || null;
}

/** Total reflections folded so far, across every reason. */
export function reflectionTotal(profile: SkipProfile): number {
  let total = 0;
  for (const entry of Object.values(profile)) total += (entry?.applies || 0) + (entry?.changed || 0);
  return total;
}
