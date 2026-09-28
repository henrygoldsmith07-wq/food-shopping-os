/**
 * What should I do next?
 *
 * The Week screen used to open with three cards that all claimed to be the next
 * thing to do: Autopilot, the loop confirmation, and the guidance preview —
 * each with its own heading, its own button and its own idea of priority. A
 * person opening the app was asked three times and had no way to rank the
 * answers.
 *
 * So the ranking happens once, here, and the screen shows the winner. The
 * rules are deliberately about *urgency of the kitchen*, not about which module
 * happens to be enabled:
 *
 *   1. Something is going off that nothing is using → use it
 *   2. A planned meal was skipped or never confirmed → confirm it
 *   3. The list has unchecked items and the plan has no shopping for today → shop
 *   4. The week has no plan at all → plan
 *   5. Otherwise, there is no single next action, and the screen says so
 *
 * Nothing is deleted. Every candidate the resolver can name still has its own
 * card further down the screen, and every action it can return is a normal
 * navigation or store call — the resolver chooses what to *lead with*, never
 * what is possible.
 */

const severity = { urgent: 3, soon: 2, normal: 1 };

/** The pantry items Forq has evidence are going unused, worst first. */
const goingOff = (app) =>
  (app.wastePrediction?.items || [])
    .filter((row) => row.likelihood === 'high' || (row.daysLeft ?? 99) <= 2)
    .map((row) => row.name)
    .filter(Boolean);

/**
 * The single next action, or null when there isn't one worth leading with.
 * Each action names the screen or store call it performs, so the caller only
 * has to execute it.
 */
export const nextAction = (app, { onOpenPantry, goTab, openGuidance, onOpenWeekLoop } = {}) => {
  // Read from the same derived signal the waste card shows, rather than
  // re-deriving "will go off and nothing uses it" here. One answer to that
  // question, so the week screen and the pantry card can never disagree.
  const unused = goingOff(app);
  if (unused.length) {
    return {
      id: 'use-soon',
      priority: severity.urgent,
      title: `Use ${unused.length === 1 ? unused[0] : `${unused.length} things`} before it goes off`,
      detail: 'Nothing you have planned uses it yet. A meal built around it is the cheapest way to use it up.',
      cta: 'See the pantry',
      run: () => (onOpenPantry ? onOpenPantry() : goTab?.('plan')),
    };
  }

  const unconfirmed = app.loopChecks?.unconfirmed || 0;
  if (unconfirmed > 0) {
    return {
      id: 'confirm-loop',
      priority: severity.soon,
      title: `Confirm ${unconfirmed === 1 ? 'one meal' : `${unconfirmed} meals`} from this week`,
      detail: 'Forq is holding a prediction about these. Confirming or skipping them is what teaches it.',
      cta: 'Review',
      run: () => goTab?.('cook'),
    };
  }

  const recovery = app.weekRecovery;
  if (recovery?.suggestions?.length) {
    return {
      id: 'recover-week',
      priority: severity.soon,
      title: 'Your week needs a quick recovery',
      detail: recovery.explanations?.[0] || 'Some planned days are behind you. Forq has a way forward.',
      cta: 'Show me',
      run: () => (onOpenWeekLoop ? onOpenWeekLoop('plan') : goTab?.('plan')),
    };
  }

  const plannedAhead = Object.keys(app.plan || {}).filter((day) => day >= app.day).length;
  const unchecked = (app.shoppingList || []).filter((row) => !row.checked).length;
  if (!plannedAhead) {
    return {
      id: 'plan-week',
      priority: severity.normal,
      title: 'Plan the week',
      detail: 'Nothing is in the plan yet. Once it is, the shopping list builds itself from it.',
      cta: 'Plan meals',
      run: () => goTab?.('plan'),
    };
  }
  if (unchecked) {
    return {
      id: 'shop',
      priority: severity.normal,
      title: `${unchecked} ${unchecked === 1 ? 'item' : 'items'} still to buy`,
      detail: 'The list was built from your plan. Buying off it is what keeps the plan and the kitchen in step.',
      cta: 'Open the list',
      run: () => goTab?.('shop'),
    };
  }

  // Setup gaps are worth surfacing, but they are not a next action in the
  // loop — they are the price of admission to it.
  const setup = app.guidance?.items?.find((item) => String(item.id).startsWith('setup-'));
  if (setup) {
    return {
      id: 'setup',
      priority: severity.normal,
      title: setup.title,
      detail: setup.detail || 'Forq asks for very little up front, and this is the rest of it.',
      cta: setup.cta || 'Finish setup',
      run: () => openGuidance?.('setup'),
    };
  }

  return null;
};
