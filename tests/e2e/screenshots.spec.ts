import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';

// 视觉存档：设置 SHOT_DIR 才会运行（CI 默认跳过）。
// 例：SHOT_DIR=tests/e2e/__baselines__/pre-redesign npx playwright test tests/e2e/screenshots.spec.ts
const OUT = process.env.SHOT_DIR;

const PAGES: [name: string, hash: string, ready: string][] = [
  ['home', '', '#home .hcard'],
  ['units', '#units', '#ugrid .card'],
  ['unit-paladin', '#unit/569', '#unit .dtabs'],
  ['unit-paladin-sim', '#unit/569?tab=sim', '#sim .simt'],
  ['civ-franks', '#civ/Franks', '#detail h2'],
  ['simulator-hub', '#/simulator', '#simhub .card'],
];
const WIDTHS: [number, number][] = [
  [1280, 900],
  [390, 844],
];

test.beforeAll(() => {
  if (OUT) mkdirSync(OUT, { recursive: true });
});

for (const [width, height] of WIDTHS) {
  for (const [name, hash, ready] of PAGES) {
    test(`screenshot ${name} @${width}`, async ({ page }) => {
      test.skip(!OUT, '设置 SHOT_DIR 后再运行');
      await page.setViewportSize({ width, height });
      await page.goto('./' + hash);
      await page.locator(ready).first().waitFor();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: join(OUT!, `${name}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}
