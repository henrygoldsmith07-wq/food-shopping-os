import { expect, test } from '@playwright/test';

/**
 * The critical journeys the wishlist named: plan a week, shop it, move
 * purchases into the pantry, cook a planned meal, and apply a receipt.
 *
 * Each journey is asserted at its hand-off — the moment state written by one
 * screen is read by the next — so a broken seam fails here, not in a unit
 * test that drives the two halves separately.
 */

const onboard = async (page, name = 'Ada') => {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start using Forq' }).click();
  // The shopping list is the landing screen now — the greeting lives on Today.
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText(new RegExp(`Good (morning|afternoon|evening), ${name}`))).toBeVisible({ timeout: 15000 });
};

const openProposal = async (page) => {
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Generate a plan for me' }).click();
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByRole('button', { name: 'Put in my plan' })).toBeVisible({ timeout: 15000 });
};

const commitPlan = async (page) => {
  await openProposal(page);
  await page.getByRole('button', { name: 'Put in my plan' }).click();
  await expect(page.getByRole('button', { name: /^Cook .* now$/ }).first()).toBeVisible({ timeout: 15000 });
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('plans a week, sends it to the list, shops and moves purchases into the pantry', async ({ page }) => {
  await onboard(page);

  // Plan → Shop: the generated week's ingredients become a basket in one tap.
  await openProposal(page);
  await page.getByRole('button', { name: 'Shop for it' }).click();
  await page.getByRole('button', { name: 'Review shopping list' }).click();
  await expect(page.getByRole('heading', { name: 'Your list' })).toBeVisible();

  // A deterministic item makes the shop → pantry hand-off assertable.
  await page.getByRole('button', { name: 'Add an item' }).click();
  await page.getByLabel('Item name').fill('Oats 500g');
  await page.getByRole('button', { name: 'Add item' }).click();

  await page.getByRole('button', { name: 'Tick Oats 500g' }).click();
  await page.getByRole('button', { name: 'To pantry' }).click();
  await expect(page.getByText('Moved to pantry.')).toBeVisible();

  // The wipe this journey guards against: moving one purchase must leave the
  // rest of the plan-derived list standing, not empty it.
  await expect(page.getByRole('button', { name: /^Tick / }).first()).toBeVisible();

  // Pantry truth reflects the move — reached the way any user can, whatever
  // the dashboard currently offers: Ctrl+K, type the command, run it.
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search Forq').fill('Open pantry');
  await page.keyboard.press('Enter');
  const pantry = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(pantry.getByText('Oats 500g', { exact: true })).toBeVisible();
});

test('opens cooking mode directly from a planned meal', async ({ page }) => {
  await onboard(page);
  await commitPlan(page);

  // Cook: a planned meal opens its step-by-step cooking mode.
  await page.getByRole('button', { name: /^Cook .* now$/ }).first().click();
  await expect(page.getByRole('button', { name: 'Exit' })).toBeVisible();
  await expect(page.getByText('Step 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next ›' })).toBeVisible();
});

test('applies a pasted receipt onto the list and into the pantry', async ({ page }) => {
  await onboard(page);
  // Receipt capture is an optional tool — enable it the way the app does.
  await page.addInitScript(() => {
    try {
      const raw = localStorage.getItem('forq-state-v2');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const state = parsed && typeof parsed.state === 'object' ? parsed.state : parsed;
      const tools = Array.isArray(state.enabledTools) ? state.enabledTools : [];
      if (!tools.includes('receipt')) state.enabledTools = [...tools, 'receipt'];
      localStorage.setItem('forq-state-v2', JSON.stringify(parsed));
    } catch { /* a storage-blocked browser is a different test's problem */ }
  });
  await page.reload();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText(/Good (morning|afternoon|evening), Ada/)).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: 'Read a receipt' }).click();

  const sheet = page.getByRole('dialog', { name: 'Read a receipt' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Receipt text').fill(
    `TESCO EXTRA\n28/07/2026  14:02\n\nBANANAS LOOSE          £0.83\nSEMI SKIMMED MILK 2L   £2.50\n\nTOTAL                 £3.33`,
  );
  await sheet.getByRole('button', { name: 'Read it' }).click();
  await expect(sheet.getByText('2 items · Tesco')).toBeVisible();
  await expect(sheet.getByText('Adds up')).toBeVisible();

  // Receipt → pantry: the parsed lines land in the pantry.
  await sheet.getByRole('button', { name: 'Add 2 to the pantry' }).click();
  const pantry = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(pantry.getByText('BANANAS LOOSE', { exact: true })).toBeVisible();
  await expect(pantry.getByText('SEMI SKIMMED MILK 2L', { exact: true })).toBeVisible();
});