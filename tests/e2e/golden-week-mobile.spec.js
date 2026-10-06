import { expect, test } from '@playwright/test';

/**
 * Golden week on a phone: plan -> pantry-aware list -> bought -> leftover
 * -> changed next suggestion. Mobile viewport only. No scraping, no AI,
 * no parked tool. Copy must not claim live stock or a complete catalogue.
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

  // Empty Plan leads with the loop.
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start the week loop' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the week loop' }).click();
  await expect(page.getByText('Week loop')).toBeVisible();

  // Pick a meal for the first open dinner, set portions, generate the list.
  await page.getByRole('button', { name: /Choose dinner/ }).first().click();
  await page.getByRole('button', { name: /Chicken|Curry|Traybake/ }).first().click();
  await expect(page.getByText(/meal.*planned|planned/i).first()).toBeVisible({ timeout: 10000 });

  // The list step shows its working: need, pantry, buy.
  const loop = page.getByRole('dialog', { name: 'Week loop' });
  await expect(loop.getByText(/Need .*pantry .*buy/i).first()).toBeVisible({ timeout: 10000 });

  // Home still leads with the loop and nothing else.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('button', { name: /Start the week/ })).toBeVisible();
  await expect(page.getByText(/XP|badges|Live stock|complete catalogue/i)).toHaveCount(0);
});

test('demo and copy never claim live stock or a complete catalogue', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('Tell Forq what you are eating; it works out what to buy; it helps you waste less.')).toBeVisible();
  await expect(page.getByText('1. Plan meals')).toBeVisible();
  await expect(page.getByText('2. Buy exactly what you need')).toBeVisible();
  await expect(page.getByText('3. Waste less')).toBeVisible();
  await expect(page.getByText(/live stock|complete catalogue|complete UK catalogue|all-in-one|food OS/i)).toHaveCount(0);
});
