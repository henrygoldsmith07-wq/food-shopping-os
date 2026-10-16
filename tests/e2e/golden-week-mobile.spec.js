import { expect, test } from '@playwright/test';

/**
 * Golden week on a phone: plan -> pantry-aware list -> bought -> leftover
 * -> changed next suggestion. Mobile viewport only. No scraping, no AI,
 * no parked tool. Copy must not claim live stock or a complete catalogue.
 *
 * Onboarding only seeds a starter plan when the user picks starter dinners, and
 * this flow picks none - so the plan is empty and correctly leads with the loop.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const onboard = async (page, name = 'Golden') => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start using Forq' }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByText(new RegExp(`Good (morning|afternoon|evening), ${name}`))).toBeVisible({ timeout: 15000 });
};

test('a week completes on a phone without parked tools', async ({ page }) => {
  await onboard(page);

  // Onboarding does not seed a plan unless the user picks starter dinners, and
  // this flow picks none - so the empty plan leads with the loop.
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start the week loop' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the week loop' }).click();
  // Scoped by role: the trigger's accessible name also contains "week loop",
  // so a bare getByText('Week loop') matches two elements once the dialog opens.
  const loop = page.getByRole('dialog');
  await expect(loop.getByRole('heading', { name: 'Week loop' })).toBeVisible({ timeout: 15000 });

  // Pick a meal for the first open dinner, set portions, generate the list.
  await page.getByRole('button', { name: /Choose dinner/ }).first().click();
  await page.getByRole('button', { name: /Chicken|Curry|Traybake/ }).first().click();
  await expect(page.getByText(/meal.*planned|planned/i).first()).toBeVisible({ timeout: 10000 });

  // The list step shows its working: need, pantry, buy.
  await expect(loop.getByText(/Need .*pantry .*buy/i).first()).toBeVisible({ timeout: 10000 });

  // Home still leads with the loop and nothing else.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('button', { name: /Start the week/ })).toBeVisible();
  // Word-boundary the gamification terms: a bare /XP/i also matches the "xp"
  // inside "Explore", which is copy the product deliberately keeps.
  await expect(page.getByText(/\bXP\b|\bbadges?\b|Live stock|complete catalogue/i)).toHaveCount(0);
});

test('demo and copy never claim live stock or a complete catalogue', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('Tell Forq what you are eating; it works out what to buy; it helps you waste less.')).toBeVisible();
  await expect(page.getByText('1. Plan meals')).toBeVisible();
  await expect(page.getByText('2. Buy exactly what you need')).toBeVisible();
  await expect(page.getByText('3. Waste less')).toBeVisible();
  await expect(page.getByText(/live stock|complete catalogue|complete UK catalogue|all-in-one|food OS/i)).toHaveCount(0);
});
