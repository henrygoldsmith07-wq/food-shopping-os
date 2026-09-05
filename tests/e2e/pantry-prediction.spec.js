import { expect, test } from '@playwright/test';

/**
 * The Shop-tab pantry prediction journey, in the real browser.
 *
 * The vitest counterpart (waste-prediction-plan.test.jsx) proves the block in
 * jsdom; this journey proves the same truth in the built app: a returning
 * household with dated stock seeds the list screen, the basket's "Check
 * pantry before buying" affordance opens the Smart pantry sheet, and the
 * prediction block renders through the real derive chain — the at-risk row
 * with its quantity, the risk band, and the concrete action line. Spinach is
 * dated for tomorrow (inside the 7-day horizon, high risk); rice sits two
 * months out and must stay out of the block.
 */
test('the Shop-tab pantry sheet shows the prediction block in the built app', async ({ page }) => {
  // Seed before any app script runs, so the app boots from this household.
  // Dates are computed in the page (same clock and timezone the app uses);
  // the store rolls a stale day forward at boot, so the expiry must be
  // relative to the real day the journey actually runs on.
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const state = {
      onboarded: true,
      name: 'Sam',
      day: stamp(0),
      // Spinach expires tomorrow — inside the horizon, so it is genuinely at
      // risk; the rice is far outside it and must stay quiet.
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '200 g', location: 'Fridge', expiry: stamp(1) },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: stamp(60) },
      ],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');

  // A returning household lands on the shopping list, no onboarding. The
  // basket offers the pantry before buying.
  await page.getByRole('button', { name: /Check pantry before buying/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(sheet).toBeVisible();

  // The prediction block renders through the real derive chain: heading, the
  // at-risk row with its quantity, the risk band, and the concrete action.
  await expect(sheet.getByText('Likely to go unused')).toBeVisible();
  const row = sheet.getByRole('button', { name: 'Plan a meal using Spinach' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Spinach · 200 g', { exact: true })).toBeVisible();
  await expect(row.getByText(/High risk/)).toBeVisible();
  await expect(sheet.getByText(/Plan a meal using Spinach before \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expect(sheet.getByText(/1 high-risk 1 ingredient may go unused/)).toBeVisible();
  // The long-dated rice is on the shelf but never a prediction.
  await expect(sheet.getByRole('button', { name: 'Plan a meal using Rice' })).toHaveCount(0);
});
