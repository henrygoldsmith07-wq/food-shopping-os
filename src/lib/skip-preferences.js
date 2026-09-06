// What a confirmed skip reason means — shared by the planner and the UI.
//
// A review reflection asks whether a skipped meal's reason still applies.
// A reason the household confirms twice, latest answer still true, is
// treated as a standing preference: the planner leans on it, and the Learn
// tab can say so in the same words. One home for the threshold and the
// phrases, so the plan's note and the card can never drift apart.

/** Confirmations with the latest answer still true before planning leans on a reason. */
export const CONFIRM_THRESHOLD = 2;

/** Whether a reflection history counts as confirmed still-applies. */
export const isConfirmedSkipReason = (entry) =>
  (entry?.applies || 0) >= CONFIRM_THRESHOLD && entry?.lastStillApplies === true;

/** What leaning on each reason sounds like — in the plan's note and on Learn. */
export const SKIP_PHRASES = {
  'no-time': 'quicker, 30-minute dishes',
  'plan-too-complex': 'simpler dishes',
  'missing-ingredients': 'dishes you can mostly make from what you already have',
};

/** Reasons the plan leans on, strongest reflection first. */
export const confirmedSkipReasonIds = (profile) => Object.entries(profile || {})
  .filter(([, entry]) => isConfirmedSkipReason(entry))
  .sort((a, b) => ((b[1].applies || 0) + (b[1].changed || 0)) - ((a[1].applies || 0) + (a[1].changed || 0)))
  .map(([reasonId]) => reasonId);
