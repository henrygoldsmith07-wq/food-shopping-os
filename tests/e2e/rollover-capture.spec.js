import { expect, test } from '@playwright/test';

/**
 * The silent-miss capture, end to end.
 *
 * Unit tests pin that `hydrate` marks planned slots that passed with no
 * outcome when the stored day is behind today; this journey proves the same
 * truth in the built app. A returning household is seeded with a plan from a
 * few days ago and one binned item — nothing else. On boot the day rolls
 * forward, the unmarked dinners become `missed` events, and the pantry's
 * waste card must read them as a named cause: "Never cooked", with the meals
 * that slipped by listed, not just a number.
 */
test('rollover capture surfaces last week\'s silent misses on the waste card', async ({ page }) => {
  // Seed before any app script runs, so the app boots from this household.
  // Dates are computed in the page (same clock and timezone the app uses).
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const state = {
      onboarded: true,
      // Last opened three days ago — a genuine gap, so rollover fires.
      day: stamp(-3),
      // Two dinners planned last week that were never cooked, skipped or
      // swapped: the exact shape captureMissedMeals is looking for.
      plan: {
        [stamp(-5)]: { dinner: 'chicken-traybake' },
        [stamp(-4)]: { dinner: 'chickpea-curry' },
      },
      // One binned item, so the waste card has a reason to render.
      waste: [{ id: 'seed-waste-1', name: 'Milk', cat: 'Fridge', cost: 0.95, date: stamp(-2) }],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');

  // A returning household lands on the list, no onboarding. Reach the pantry
  // the same way any user can.
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search Forq').fill('Open pantry');
  // Enter runs the top command result — the pantry command outranks the
  // quick-add fallback because the typed title matches it exactly.
  await page.keyboard.press('Enter');
  const pantry = page.getByRole('dialog', { name: 'Smart pantry' });

  // The two unmarked dinners from last week became missed events at rollover,
  // and the waste card must name them — the cause, not just a count. The
  // pantry sheet fills lazily after boot, so the first wait rides with it.
  await expect(pantry.getByText('Your waste, by cause')).toBeVisible({ timeout: 15000 });
  await expect(pantry.getByText('Never cooked')).toBeVisible();
  await expect(pantry.getByText(/2 of those slipped by with nothing recorded/)).toBeVisible();
  await expect(pantry.getByText('Lemon Chicken Traybake')).toBeVisible();
  await expect(pantry.getByText('Coconut Chickpea Curry')).toBeVisible();
});

test('reopening the same day does not invent new misses', async ({ page }) => {
  // After the first boot has captured, the household's stored day is today —
  // so a second load must not double-count or add anything new.
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const state = {
      onboarded: true,
      day: stamp(0),
      plan: {
        [stamp(-5)]: { dinner: 'chicken-traybake' },
        [stamp(-4)]: { dinner: 'chickpea-curry' },
      },
      // Captured on the first boot: both slots already carry a missed event.
      mealPlanEvents: [
        { id: 'seed-mpe-1', date: stamp(-5), slot: 'dinner', plannedRecipeId: 'chicken-traybake', status: 'skipped', reason: 'missed', missed: true, at: Date.now() - 86400000 },
        { id: 'seed-mpe-2', date: stamp(-4), slot: 'dinner', plannedRecipeId: 'chickpea-curry', status: 'skipped', reason: 'missed', missed: true, at: Date.now() - 86400000 },
      ],
      waste: [{ id: 'seed-waste-1', name: 'Milk', cat: 'Fridge', cost: 0.95, date: stamp(-2) }],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search Forq').fill('Open pantry');
  await page.keyboard.press('Enter');
  const pantry = page.getByRole('dialog', { name: 'Smart pantry' });

  await expect(pantry.getByText('Your waste, by cause')).toBeVisible();
  // Still exactly the two seeded misses — never three.
  await expect(pantry.getByText(/2 of those slipped by with nothing recorded/)).toBeVisible();
});
