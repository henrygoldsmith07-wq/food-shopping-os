import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const onboard = async (page, name = 'Ada') => {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start using Forq' }).click();
  await expect(page.getByText(new RegExp(`Good (morning|afternoon|evening), ${name}`))).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('onboards, navigates by keyboard and opens an accessible sheet', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /^You — profile/ }).click();
  const goals = page.getByRole('button', { name: /^Maintenance 2,200/ });
  await goals.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Goals & targets' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(goals).toBeFocused();
});

test('form controls never trigger iOS focus zoom', async ({ page }) => {
  const fontSize = (locator) => locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

  await expect(page.getByLabel('Your name')).toBeVisible();
  expect(await fontSize(page.getByLabel('Your name'))).toBeGreaterThanOrEqual(16);

  await onboard(page);
  await page.getByRole('button', { name: 'Recipes' }).click();
  expect(await fontSize(page.getByLabel('Search recipes'))).toBeGreaterThanOrEqual(16);
});

test('ships recognisable content before the client bundle boots', async ({ request }) => {
  const response = await request.get('/');
  const html = await response.text();
  expect(html).toContain('class="launch-shell"');
  expect(html.indexOf('class="launch-shell"')).toBeLessThan(html.indexOf('class="client-root"'));
});

test('keeps detailed diary totals progressively disclosed', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Log' }).click();
  await expect(page.getByText('Calories remaining')).toBeVisible();
  const disclosure = page.getByText('Macros, nutrients and weekly progress');
  await expect(disclosure).toBeVisible();
  await expect(page.getByText('Protein', { exact: true })).toBeHidden();
  await disclosure.click();
  await expect(page.getByText('Protein', { exact: true })).toBeVisible();
});

test('honours increased contrast and forced system colours', async ({ page }) => {
  await onboard(page);

  await page.emulateMedia({ contrast: 'more' });
  expect(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches)).toBe(true);
  const increased = await page.locator('.card').first().evaluate((element) => ({
    borderWidth: parseFloat(getComputedStyle(element).borderTopWidth),
    line: getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),
    ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
  }));
  expect(increased.borderWidth).toBeGreaterThanOrEqual(2);
  expect(increased.line).toBe(increased.ink);

  await page.emulateMedia({ contrast: 'no-preference', forcedColors: 'active' });
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  const forced = await page.getByRole('button', { name: 'Home' }).evaluate((element) => ({
    adjustment: getComputedStyle(element).forcedColorAdjust,
    background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    foreground: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
  }));
  expect(forced.adjustment).toBe('none');
  expect(forced.background).toBe('Canvas');
  expect(forced.foreground).toBe('CanvasText');
});

test('exports and restores a complete backup from first run', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /^You — profile/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  const backup = await download.path();

  await page.getByRole('button', { name: 'Reset app' }).click();
  await page.getByRole('button', { name: 'Tap to confirm' }).click();
  await expect(page.getByText('Welcome to Forq')).toBeVisible();

  await page.getByLabel('Restore Forq backup').setInputFiles(backup);
  await expect(page.getByText('Ada', { exact: true })).toBeVisible();
  await expect(page.getByText('Welcome to Forq')).toHaveCount(0);
});

test('preserves corrupt storage and offers recovery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('forq-state-v2', '{broken'));
  await page.reload();

  await expect(page.getByText('Saved data needs attention')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download original data' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('forq-state-v2'))).toBe('{broken');
});

test('home, recipes and Guidance have no automatically detectable accessibility violations', async ({ page }) => {
  await onboard(page);
  for (const screen of ['Home', 'Recipes']) {
    if (screen !== 'Home') await page.getByRole('button', { name: screen }).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .forEach((animation) => animation.finish()));
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${screen}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  }
  await page.getByRole('button', { name: 'Guidance — what matters now' }).click();
  const guidance = page.getByRole('dialog', { name: 'Guidance' });
  await expect(guidance.getByText('What matters now')).toBeVisible();
  await guidance.evaluate((element) => { element.dataset.axeTarget = 'guidance'; });
  const results = await new AxeBuilder({ page }).include('[data-axe-target="guidance"]').analyze();
  expect(results.violations, `Guidance: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
});

test('privacy disclosure is reachable and accessible without an account', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /^You — profile/ }).click();
  await page.getByRole('button', { name: 'Privacy, storage & deletion' }).click();

  const dialog = page.getByRole('dialog', { name: 'Privacy & data' });
  await expect(dialog.getByText('Stored on this device')).toBeVisible();
  await expect(dialog.getByText('Stored on Forq’s servers after sign-in')).toBeVisible();
  await expect(dialog.getByText('Transmitted when you choose a service')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete server household' })).toBeDisabled();
  await dialog.evaluate((element) => { element.dataset.axeTarget = 'privacy'; });
  const results = await new AxeBuilder({ page }).include('[data-axe-target="privacy"]').analyze();
  expect(results.violations).toEqual([]);
});

test('exposes collaboration and calendar planning controls', async ({ page }) => {
  await onboard(page);

  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: /Find busy evenings/i })).toBeVisible();

  await page.getByRole('button', { name: /^You/ }).click();
  const profile = page.getByRole('dialog', { name: 'You' });
  await profile.getByText('Just you', { exact: true }).click();

  const family = page.getByRole('dialog', { name: 'Family' });
  await family.getByText('Sharing', { exact: true }).click();
  await expect(family.getByText('Coach or trainer access')).toBeVisible();
  await expect(family.getByText(/read-only, revocable link/i)).toBeVisible();

  await family.getByText('Activity', { exact: true }).click();
  await expect(family.getByText('Server audit trail')).toBeVisible();
});

test('reopens offline after the service worker is ready', async ({ page, context }) => {
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Good (morning|afternoon|evening), Ada/)).toBeVisible();
});
