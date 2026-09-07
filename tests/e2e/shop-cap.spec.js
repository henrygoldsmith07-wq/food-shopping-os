import { expect, test } from '@playwright/test';

/**
 * The affordable-cap banner, in the real browser.
 *
 * The vitest counterpart (shopbasket-cap.test.jsx) walks the same journey in
 * jsdom: a household whose list outruns the week's headroom sees the banner
 * name what fits and offer the re-rank; toggling ranks the rows cheapest-first
 * and each pushed-out row wears its "past the cap" marker; toggling back
 * restores the user's own order and clears every marker. This journey proves
 * that flow end to end in the built app, from the seeded over-budget list.
 */
test('the cap banner ranks an over-budget list and back, marking the rows it pushes out', async ({ page }) => {
  // Seed before any app script runs, so the app boots from this household.
  // £30 budget, nothing spent: the £5 and £8 items fit (£13), the £20 item
  // sits past the cap — so the ranked list must wear the marker on that row,
  // not just reorder it behind a summary line.
  await page.addInitScript(() => {
    localStorage.setItem('forq-state-v2', JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: '2099-01-01',
      weeklyBudget: 30,
      shoppingList: [
        { id: 'w', name: 'Wine', qty: '', price: 20, aisle: 'Other', checked: false, note: '', priority: 'normal' },
        { id: 'm', name: 'Milk', qty: '', price: 5, aisle: 'Dairy & eggs', checked: false, note: '', priority: 'normal' },
        { id: 'b', name: 'Bread', qty: '', price: 8, aisle: 'Bakery', checked: false, note: '', priority: 'normal' },
      ],
    }));
  });

  await page.goto('/');

  // The shopping list is home for a returning household; leave it and come
  // back through the main navigation, the way the journey is walked.
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Today', exact: true }).click();
  await nav.getByRole('button', { name: 'List', exact: true }).click();

  // The basket is over budget, so the cap banner names what fits and offers
  // the re-rank. (The heading lives in its own span — read the whole line.)
  const banner = page.getByText(/2 priced items .*fit your £30\.00 headroom/);
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(banner).toContainText('1 priced item');
  const rank = page.getByRole('button', { name: 'Rank by what I can afford' });
  await expect(rank).toBeVisible();

  // Rank it: the list reads cheapest-first and the row the cap pushed out
  // wears its marker; the rows that fit stay clean.
  await rank.click();
  await expect(page.getByRole('button', { name: 'Back to my order' })).toBeVisible();
  const wineRow = page.getByRole('button', { name: 'Tick Wine' }).locator('..').locator('..');
  await expect(wineRow.getByText(/Past the week's cap/)).toBeVisible();
  const milkRow = page.getByRole('button', { name: 'Tick Milk' }).locator('..').locator('..');
  await expect(milkRow.getByText(/Past the week's cap/)).toHaveCount(0);

  // Back to the user's own order: no boundary is being drawn any more, so no
  // row wears the marker.
  await page.getByRole('button', { name: 'Back to my order' }).click();
  await expect(page.getByRole('button', { name: 'Rank by what I can afford' })).toBeVisible();
  await expect(page.getByText(/Past the week's cap/)).toHaveCount(0);

  // The toggle is a view, never a mutation: the list still holds all three
  // items either way.
  await expect(page.getByRole('button', { name: 'Tick Wine' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tick Milk' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tick Bread' })).toBeVisible();
});
