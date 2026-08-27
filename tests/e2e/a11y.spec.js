import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility sweep across the primary screens.
 * Forq is one page with client-side tabs, so the sweep loads the app once and
 * scans each tab in turn. WCAG A/AA rules only; known third-party noise is
 * filtered rather than silently ignored (each exclusion states its reason).
 */

/**
 * The app's actual bottom bar. Pantry is deliberately absent: it is a sheet
 * reachable from Home and the header, not a tab, so it is scanned separately
 * below rather than clicked for as a tab that has never existed.
 */
const TABS = ['Home', 'Plan', 'Shop', 'Log', 'Recipes'];

/**
 * Onboarding, unconditionally and by role.
 *
 * Two things here are what made this file look like an accessibility problem
 * rather than a broken fixture. It asked `isVisible()` before the client
 * bundle had hydrated, got `false`, and skipped onboarding entirely; and it
 * matched buttons by loose text. Either way onboarding never completed, so no
 * tab button was ever rendered and every tab case timed out reaching for one —
 * while "Home" passed for the wrong reason, because it is the only case that
 * skips the click and so scanned the onboarding screen instead of Home.
 *
 * `fill` auto-waits, so doing this unconditionally is both simpler and the
 * thing that actually works. It mirrors the helper in release.spec.js.
 */
const onboard = async (page, name = 'Axe') => {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start using Forq' }).click();
  await expect(page.getByText(new RegExp(`Good (morning|afternoon|evening), ${name}`))).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  // Start every scan from a first run, so onboarding is always the entry path.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

const scan = async (page, include = null) => {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (include ? builder.include(include) : builder).analyze();
  // 'color-contrast' fires on decorative gradients behind text; manual
  // contrast pairs are covered by the typography tests instead.
  return results.violations
    .filter((violation) => violation.id !== 'color-contrast')
    .map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`);
};

test.describe('accessibility — primary screens', () => {
  for (const tab of TABS) {
    test(`tab "${tab}" has no automatically-detectable WCAG A/AA violations`, async ({ page }) => {
      await onboard(page);
      if (tab !== 'Home') {
        const button = page.getByRole('button', { name: tab, exact: true }).first();
        // Assert the tab exists before clicking, so a missing tab reads as a
        // missing tab rather than as a 30-second timeout.
        await expect(button, `${tab} tab should be in the bottom bar`).toBeVisible();
        await button.click();
      }
      expect(await scan(page), `${tab} should be clean`).toEqual([]);
    });
  }

  test('the pantry sheet has no automatically-detectable WCAG A/AA violations', async ({ page }) => {
    await onboard(page);
    // On a first run Home offers the pantry as "Add what's in your cupboards";
    // the "Open pantry" section header only appears once something is tracked.
    // Matched loosely because the copy uses a curly apostrophe.
    await page.getByRole('button', { name: /Add what.s in your cupboards/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Smart pantry' });
    await expect(sheet).toBeVisible();
    await sheet.evaluate((element) => { element.dataset.axeTarget = 'pantry'; });
    expect(await scan(page, '[data-axe-target="pantry"]'), 'pantry sheet should be clean').toEqual([]);
  });
});
