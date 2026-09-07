import { expect, test } from '@playwright/test';

/**
 * The kitchen knowledge map, in the real browser.
 *
 * The vitest counterpart (knowledge-map.test.jsx) proves the map in jsdom;
 * this journey proves the same truth in the built app: a returning household
 * whose deck the scheduler has actually graded lands on the list screen,
 * opens the Learn tab, and the map renders real mastery bands derived from
 * the cards' scheduling state — never from anything the deck cannot say.
 *
 * The seed mirrors the vitest app-shell deck: Shopping's covered card is
 * reviewed well ahead of any plausible run date so its mastered band is
 * deterministic however the store rolls the day forward, and the two fresh
 * cards (one Shopping, one Cooking) are due today, which the review queue
 * shows but the map's band logic ignores — a fresh card is "Not started",
 * whatever the queue says.
 */
test('the Learn-tab knowledge map renders real mastery bands from a reviewed deck', async ({ page }) => {
  // Seed before any app script runs, so the app boots from this household.
  // Dates are computed in the page (same clock and timezone the app uses).
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    // Handmade origin on purpose: the boot auto-refresh retires kitchen
    // ('auto') cards no active seed template claims, and these fronts are
    // deliberately bespoke — the journey seeds a *reviewed* deck to read the
    // map's bands, not to test the seeder.
    const card = (id, topicId, front, back, reps, over = {}) => ({
      id, userId: 'local', subjectId: 'kitchen', topicId,
      front, back, origin: 'handmade', reps, lapses: 0,
      ease: 2.5, intervalDays: reps ? 2 : 0, due: stamp(0),
      createdAt: '2026-07-26T00:00:00Z', lastReviewedAt: null,
      ...over,
    });
    const state = {
      onboarded: true,
      name: 'Sam',
      day: stamp(0),
      cards: [
        // Reviewed four times, long interval, not due — the schedule has
        // genuinely graded this topic, so Shopping earns a covered band.
        card('s1', 'shopping', 'Which food did you buy most of this week?', 'Bread', 4, {
          ease: 2.5, intervalDays: 21, due: '2099-01-10', lastReviewedAt: '2098-12-01T10:00:00Z',
        }),
        // Fresh: never reviewed, so Shopping's studied share stays honest.
        card('s2', 'shopping', 'What did your most recent shop cost?', 'Co-op — £12.40', 0),
        // Fresh too: Cooking has no graded schedule, so it reads Not started.
        card('c1', 'cooking', 'Which planned meal did you skip this week?', 'Lentil soup — skipped', 0),
      ],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');

  // A returning household lands on the shopping list; Learn is a lazy tab.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Learn' }).click();

  // The map renders through the real derive chain: heading, subject, honest
  // curriculum-only levels, and both kitchen topics from the deck. Topic
  // names can also appear on the review queue's filter pills, so the
  // assertions below address the map's own topic-row buttons.
  await expect(page.getByText('Kitchen knowledge map')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Your kitchen')).toBeVisible();
  await expect(page.getByText('2 topics · 0 spec statements')).toBeVisible();

  // Mastery bands are words with icons, driven by the schedule: Shopping
  // earned a covered band from its graded card; Cooking, never reviewed,
  // reads Not started — nothing invents a band for an ungraded topic.
  const shoppingRow = page.getByRole('button', { name: /Shopping.*Covered/ });
  const cookingRow = page.getByRole('button', { name: /Cooking.*Not started/ });
  await expect(shoppingRow).toBeVisible();
  await expect(cookingRow).toBeVisible();
  await expect(shoppingRow.getByText('Covered', { exact: true })).toBeVisible();
  await expect(cookingRow.getByText('Not started', { exact: true })).toBeVisible();

  // Expand Shopping: the map walks its chain from real scheduling state —
  // one of two cards studied, and the mastery node shows the retention split
  // (the one studied card is held — nothing due today) rather than a bare
  // percentage, so the covered read carries its reason.
  await page.getByRole('button', { name: /Shopping.*Show the map/ }).click();
  await expect(page.getByText('1/2 studied')).toBeVisible();
  await expect(page.getByText('1 of 1 held', { exact: true })).toBeVisible();
  // The curriculum-only levels say what is missing, never imply it exists.
  await expect(page.getByText(/No spec statements mapped for this topic yet/)).toBeVisible();
});

test('expanding a topic with due cards offers Review, which focuses the queue on that topic', async ({ page }) => {
  // A deck spanning three topics: Shopping and Cooking each hold one card due
  // today (the review queue can act on both), Pantry's card matures next year
  // (its expanded row must offer no review — nothing honest to do).
  await page.addInitScript(() => {
    const stamp = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const card = (id, topicId, front, due) => ({
      id, userId: 'local', subjectId: 'kitchen', topicId,
      front, back: `${front} — answer`, origin: 'handmade',
      reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due,
      createdAt: '2026-07-26T00:00:00Z', lastReviewedAt: null,
    });
    const state = {
      onboarded: true,
      name: 'Sam',
      day: stamp(0),
      cards: [
        card('s1', 'shopping', 'Which shop did you visit most?', stamp(0)),
        card('c1', 'cooking', 'Which planned meal did you cook most?', stamp(0)),
        card('p1', 'pantry', 'Which item is next to expire?', stamp(365)),
      ],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Learn' }).click();
  await expect(page.getByText('Kitchen knowledge map')).toBeVisible({ timeout: 15000 });

  // Expand all three topic rows. The action's count mirrors the real queue:
  // Shopping and Cooking each have one due card, Pantry has none.
  await page.getByRole('button', { name: /Shopping.*Show the map/ }).click();
  await page.getByRole('button', { name: /Cooking.*Show the map/ }).click();
  await page.getByRole('button', { name: /Pantry.*Show the map/ }).click();
  const reviewButtons = page.getByRole('button', { name: 'Review this topic — 1 due' });
  await expect(reviewButtons).toHaveCount(2);
  // Topic rows render in kitchen-catalogue order (Shopping → Cooking →
  // Pantry), so the two reviews belong to Shopping and Cooking in turn.
  const shoppingReview = reviewButtons.first();
  await expect(shoppingReview).toBeVisible();

  // The review hands Shopping to the queue: the topic bar presses its chip
  // and the queue shows only the Shopping card — Cooking is set aside.
  await shoppingReview.click();
  const bar = page.getByRole('group', { name: 'Review one topic at a time' });
  await expect(bar.getByRole('button', { name: 'Shopping · 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Which shop did you visit most?')).toBeVisible();
  await expect(page.getByText('Which planned meal did you cook most?')).toHaveCount(0);
  await expect(page.getByText('1 to review')).toBeVisible();
});

test('reviewing the due card on Learn moves the topic from Not started to Covered on the map', async ({ page }) => {
  // One topic, one fresh card due today: the review queue holds it, the map
  // has no graded schedule yet, and the Good rating below is the first grade
  // the topic has ever seen — the band must move with that review.
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
      cards: [{
        id: 's1', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
        front: 'Which shop did you visit most?', back: 'The corner market',
        origin: 'handmade', reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: stamp(-1),
        createdAt: '2026-07-26T00:00:00Z', lastReviewedAt: null,
      }],
    };
    localStorage.setItem('forq-state-v2', JSON.stringify(state));
  });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Learn' }).click();
  await expect(page.getByText('Kitchen knowledge map')).toBeVisible({ timeout: 15000 });

  // Before the review the topic carries no band — nothing has been graded.
  const row = page.getByRole('button', { name: /Shopping.*Show the map/ });
  await expect(row.getByText('Not started', { exact: true })).toBeVisible();

  // Rate the queue's due card Good — the scheduler's next state (reps 1,
  // due a day out) is what the map's band reads next.
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Rate Good — knew it' }).click();

  // The same topic now shows a schedule-backed Covered band.
  await expect(row.getByText('Covered', { exact: true })).toBeVisible();
  await expect(row.getByText('Not started', { exact: true })).toHaveCount(0);
  // The graded card matured to tomorrow, so the queue is empty for today.
  await expect(page.getByText('Nothing due today')).toBeVisible();
});
