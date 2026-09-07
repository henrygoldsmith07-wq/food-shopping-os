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

test('the tonight affordance opens the dinner picker pre-searched in the built app', async ({ page }) => {
  // Same returning household: spinach dated for tomorrow is the at-risk row
  // whose second affordance skips the week generator and asks for tonight.
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
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '200 g', location: 'Fridge', expiry: stamp(1) },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: stamp(60) },
      ],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Check pantry before buying/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(sheet).toBeVisible();

  // The row's second affordance asks for tonight's dinner slot.
  await sheet.getByRole('button', { name: 'Cook Spinach tonight' }).click();

  // The Plan tab opens the dinner picker already searched on the ingredient:
  // the query is typed, only spinach-matching dishes are listed, and the
  // pantry sheet has slid away behind the app's navigation.
  const picker = page.getByRole('dialog', { name: 'Plan a meal' });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel('Search recipes')).toHaveValue('Spinach');
  const dish = picker.getByRole('button', { name: /Coconut Chickpea Curry/ });
  await expect(dish).toBeVisible();
  await expect(sheet).toBeHidden();
  // The generator is not part of this path — the picker came up instead.
  await expect(page.getByRole('button', { name: 'Close generator' })).toHaveCount(0);
});

test('the prediction block stays quiet when the week plan covers the expiring stock', async ({ page }) => {
  // The quiet twin of the block journey, in the real browser: the same 300 g
  // of spinach sits on the shelf expiring on the plan's last day, but the
  // week's two curries (150 g each) use every gram before the date — so no
  // warning fires, and the seen-but-covered item reads as covered instead.
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    // This week's Saturday and Sunday — the dates the seeded plan must land
    // on so the week derive actually resolves the meals.
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const week = (index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const state = {
      onboarded: true,
      name: 'Sam',
      day: stamp(0),
      // Expiring on the plan's last day, fully used by two chickpea curries;
      // the rice sits two months out and must never appear anywhere.
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '300 g', location: 'Fridge', expiry: week(6) },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: stamp(60) },
      ],
      plan: {
        [week(5)]: { dinner: 'chickpea-curry' },
        [week(6)]: { dinner: 'chickpea-curry' },
      },
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Check pantry before buying/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(sheet).toBeVisible();

  // The spinach is genuinely on the shelf and near its date, yet the plan is
  // what keeps it out of the prediction: no warning heading, row or summary.
  await expect(sheet.getByText('Likely to go unused')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Plan a meal using Spinach' })).toHaveCount(0);
  await expect(sheet.getByText(/ingredient may go unused/)).toHaveCount(0);
  // Seen-but-covered reads as covered, not ignored, in the real app too.
  await expect(sheet.getByText('Covered by the plan')).toBeVisible();
  await expect(sheet.getByText('Spinach · 300 g — used by 2 planned meals before its date', { exact: true })).toBeVisible();
});

test('a plan that only half-uses the expiring stock still flags the leftover', async ({ page }) => {
  // The sibling of the quiet journey, in the real browser: the same spinach
  // is genuinely planned, but 400 g against two 150 g curries leaves 100 g
  // after the plan — so it stays on the warning list with the remainder and
  // the cause named, never read as fully covered.
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const week = (index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const state = {
      onboarded: true,
      name: 'Sam',
      day: stamp(0),
      // 400 g expiring on the plan's last day against 300 g the two curries
      // use: 100 g is left over even though the plan genuinely uses the item.
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '400 g', location: 'Fridge', expiry: week(6) },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: stamp(60) },
      ],
      plan: {
        [week(5)]: { dinner: 'chickpea-curry' },
        [week(6)]: { dinner: 'chickpea-curry' },
      },
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Check pantry before buying/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(sheet).toBeVisible();

  // The item stays on the warning list — coverage was only partial.
  await expect(sheet.getByText('Likely to go unused')).toBeVisible();
  await expect(sheet.getByText(/ingredient may go unused/)).toBeVisible();
  // Only the remainder is at risk, and the row names it by quantity…
  await expect(sheet.getByText('Spinach · 100 g', { exact: true })).toBeVisible();
  // …and by cause: the plan used some of it — what is left is the rest.
  await expect(sheet.getByText('No planned meal uses all of this dated stock.')).toBeVisible();
  // It must not simultaneously read as fully covered.
  await expect(sheet.getByText('Covered by the plan')).toHaveCount(0);
});

test('the week-plan affordance opens the generator focused on the at-risk item', async ({ page }) => {
  // The row's primary affordance goes to the week generator, not tonight's
  // picker: the Plan tab opens with the generator already favouring dishes
  // that use the expiring spinach.
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
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '200 g', location: 'Fridge', expiry: stamp(1) },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: stamp(60) },
      ],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Check pantry before buying/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Smart pantry' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Plan a meal using Spinach' }).click();

  // The Plan tab is now current and the generator is open, not the picker.
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
  const generator = page.getByRole('button', { name: 'Close generator' });
  await expect(generator).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Plan a meal' })).toHaveCount(0);
  await expect(sheet).toBeHidden();

  // The item arrived as the generator's focus: it reads as use-soon and the
  // generated week must actually pin a dish that uses it before it goes off.
  await expect(page.getByText(/Spinach — use soon/)).toBeVisible();
  await page.getByRole('button', { name: /^Generate$/ }).click();
  await expect(page.getByText(/is pinned in — it uses Spinach before it goes off/)).toBeVisible({ timeout: 15000 });
  // The slot that carries the focused item is badged, not just described.
  await expect(page.getByText('Pinned', { exact: true }).first()).toBeVisible();
});
