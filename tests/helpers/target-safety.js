/**
 * Getting a state past the target-safety gates, for tests that are about
 * something else. Anything testing the gates themselves builds its own state.
 */

import { targetSafety } from '../../src/lib/goals.js';
import { confirmationRecord, SCREENING_IDS } from '../../src/lib/target-safety.js';

/** Every screening question answered, none of them flagged. */
export const CLEAR_SCREENING = Object.fromEntries(SCREENING_IDS.map((id) => [id, 'no']));

/** The same state with the screen answered and the proposed target confirmed. */
export const agreedDeficit = (state, day = '2026-08-03') => {
  const screened = { ...state, goalScreening: CLEAR_SCREENING };
  const { signature } = targetSafety(screened).confirmation;
  return { ...screened, targetConfirmation: signature ? confirmationRecord(signature, day) : null };
};
