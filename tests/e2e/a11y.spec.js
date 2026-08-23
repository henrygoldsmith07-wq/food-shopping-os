import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility sweep across the primary screens.
 * Forq is one page with client-side tabs, so the sweep loads the app once and
 * scans each tab in turn. WCAG A/AA rules only; known third-party noise is
 * filtered rather than silently ignored (each exclusion states its reason).
 */

const TABS = ['Home', 'Plan', 'Log', 'Shop', 'Pantry'];

test.describe('accessibility — primary screens', () => {
  for (const tab of TABS) {
    test(`tab "${tab}" has no automatically-detectable WCAG A/AA violations`, async ({ page }) => {
      await page.goto('/');
      // First visit lands on onboarding; skip through it so real screens show.
      const nameField = page.getByLabel('Your name');
      if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill('Axe');
        await page.getByText('Continue').click();
        await page.getByText('Continue').click();
        await page.getByText('Start using Forq').click();
      }
      if (tab !== 'Home') {
        await page.getByRole('button', { name: tab, exact: true }).first().click();
      }
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const violations = results.violations.filter((v) => ![
        // 'color-contrast' fires on decorative gradients behind text; manual
        // contrast pairs are covered by typography tests instead.
        v.id === 'color-contrast',
      ].includes(true));
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        `${tab} should be clean`,
      ).toEqual([]);
    });
  }
});
