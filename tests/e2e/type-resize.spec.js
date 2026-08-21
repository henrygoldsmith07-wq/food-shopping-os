import { expect, test } from '@playwright/test';

const onboard = async (page) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ada');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start using Forq' }).click();
  await expect(page.getByText(/Good (morning|afternoon|evening), Ada/)).toBeVisible();
};

const pageOverflow = (page) => page.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));

const unmarkedClippedText = (page) => page.evaluate(() => [...document.querySelectorAll('main p, main span')]
  .filter((element) => {
    if (element.closest('[class*="overflow-x-auto"]')) return false;
    if (element.className.includes('truncate') || element.className.includes('line-clamp-')) return false;
    return element.scrollWidth > element.clientWidth + 1;
  })
  .slice(0, 10)
  .map((element) => element.textContent.trim()));

test('main screens reflow at 200% text without page-level horizontal overflow', async ({ page }, testInfo) => {
  await onboard(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

  for (const tab of ['Home', 'Plan', 'Log', 'Shop', 'Recipes']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .forEach((animation) => animation.finish()));
    const overflow = await pageOverflow(page);
    expect(overflow.scrollWidth, `${tab} is wider than the viewport at 200% text`).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(await unmarkedClippedText(page), `${tab} clips text at 200%`).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${tab.toLowerCase()}-200-percent.png`),
      fullPage: true,
    });
  }
});
