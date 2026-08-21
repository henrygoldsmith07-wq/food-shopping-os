import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const encoded = Buffer.from(svg).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%}</style><img src="data:image/svg+xml;base64,${encoded}" alt="">`,
  );
  await page.locator('img').screenshot({
    path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname.slice(1),
    omitBackground: true,
  });
}

await browser.close();
