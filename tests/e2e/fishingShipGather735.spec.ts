import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import eco from '../../src/data/eco.json' with { type: 'json' };

const region = (page: Page) => page.getByRole('region', { name: '基准采集', exact: true });

async function numbersStay(scope: Locator) {
  const tokens = await scope.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/\d+(?:\.\d+)?/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, `${token.text}不应拆行`).toBe(1);
}

test('#735 PC1280渔船页展示 eco.json 岸鱼与深海鱼基准采集', async ({ page }) => {
  await page.goto('./#/unit/13');
  await expect(page.locator('#unit h1')).toContainText('渔船');
  const target = region(page);
  await expect(target).toBeVisible();
  await expect(target).toContainText('纯采集，不含往返行走与放下资源');
  await expect(target).toContainText('不含文明加成');
  await expect(target).toContainText('养鱼场采集速率没有单独字段，标待确认');
  await expect(target).toContainText(eco.meta.patch);
  await expect(target).toContainText(eco.meta.tasks);
  await expect(target).toContainText('meta');
  const baseline = target.locator('[data-contrast="baseline"]');
  const gillnets = target.locator('[data-contrast="gillnets"]');
  await expect(baseline.locator('[data-task="shore"] [data-field="workRate"]')).toHaveText(String(eco.fishingShip.workRate));
  await expect(baseline.locator('[data-task="shore"] [data-field="carry"]')).toHaveText(String(eco.fishingShip.carry));
  await expect(baseline.locator('[data-task="deep"] [data-field="multiplier"]')).toHaveText(`×${eco.fishingShip.deepFishMultiplier}`);
  await expect(baseline.locator('[data-task="deep"] [data-field="workRate"]')).toHaveText('0.42');
  await expect(baseline.locator('[data-task="fishTrap"] [data-field="workRate"]')).toHaveText('待确认');
  await expect(gillnets.locator('[data-task="shore"] [data-field="workRate"]')).toHaveText('0.264');
  await expect(gillnets.locator('[data-task="deep"] [data-field="workRate"]')).toHaveText('0.462');
  await expect(gillnets.locator('[data-task="shore"] [data-field="carry"]')).toHaveText('20');
  await expect(gillnets.locator('[data-task="fishTrap"] [data-field="workRate"]')).toHaveText('待确认');
  await expect(target).not.toContainText('水图');
  const link = target.getByRole('link', { name: '刺网', exact: true });
  await expect(link).toHaveAttribute('href', /#\/tech\/65$/);
  await link.click();
  await expect(page).toHaveURL(/#\/tech\/65$/);
  await expect(page.locator('#tech h1')).toContainText('刺网');
  await page.goto('./#/unit/83');
  await expect(page.locator('#unit h1')).toContainText('村民');
  await expect(region(page)).not.toContainText('岸鱼');
  await page.goto('./#/unit/38');
  await expect(page.locator('#unit h1')).toContainText('骑士');
  await expect(region(page)).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#735 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/unit/13');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const target = region(page);
      await expect(target).toContainText('纯采集，不含往返行走与放下资源');
      await expect(target.locator('[data-contrast="baseline"] [data-task="shore"] [data-field="workRate"]')).toHaveText(String(eco.fishingShip.workRate));
      await expect(target.locator('[data-contrast="baseline"] [data-task="deep"] [data-field="multiplier"]')).toHaveText(
        `×${eco.fishingShip.deepFishMultiplier}`,
      );
      await numbersStay(target);
      for (const link of await target.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await target.evaluate((el) => el.setAttribute('data-fishing-gather-audit', '735'));
      expect((await new AxeBuilder({ page }).include('[data-fishing-gather-audit="735"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({ path: info.outputPath(`fishing-gather-${width}-${theme}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
