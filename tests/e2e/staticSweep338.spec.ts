import { expect, test } from '@playwright/test';
import { coldStaticPage } from './staticSweep338';
import { guardPage } from './v0290-helpers';

guardPage();
for (const width of [360, 1280])
  test(`#338 cold timeline readiness keeps the single timeline h1 after #770 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let visited = false;
    await coldStaticPage(page, '/builds?bo=archers-19', async () => {
      await expect(page.locator('main h1.tl-title')).toContainText('19 人口单靶场弓手速攻');
      await expect(page.locator('main h1')).toHaveCount(1);
      visited = true;
    });
    expect(visited).toBe(true);
  });
