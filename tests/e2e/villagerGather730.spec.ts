import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import eco from '../../src/data/eco.json' with { type: 'json' };

const examples = ['wood', 'farm', 'gold', 'stone', 'berries'] as const;
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

test('#730 PC1280村民页展示 eco.json 基准采集速率', async ({ page }) => {
  await page.goto('./#/unit/83');
  await expect(page.locator('#unit h1')).toContainText('村民');
  const target = region(page);
  await expect(target).toBeVisible();
  await expect(target).toContainText('纯采集，不含往返行走与放下资源');
  await expect(target).toContainText('不含文明加成');
  await expect(target).toContainText('女村民各任务形态的基准速率与携带量与上表相同');
  await expect(target).toContainText('DE Update 188329 (2026-10-28)');
  await expect(target).toContainText(eco.meta.tasks);
  await expect(target).not.toContainText('有效速率');
  for (const key of examples) {
    const task = eco.villager.tasks[key];
    const row = target.locator(`[data-task="${key}"]`);
    await expect(row.locator('[data-field="workRate"]')).toHaveText(String(task.workRate));
    await expect(row.locator('[data-field="carry"]')).toHaveText(String(task.carry));
  }
  await expect(target.locator('[data-task="hunt"] [data-field="carry"]')).toHaveText('35');
  await expect(target.locator('[data-task="build"]')).toContainText('建造');
  await expect(target.getByRole('columnheader', { name: '女村民速率' })).toHaveCount(0);
  const production = target.getByRole('link', { name: '持续生产', exact: true });
  const payoff = target.getByRole('link', { name: '经济科技收益', exact: true });
  await expect(production).toHaveAttribute('href', /#\/production$/);
  await expect(payoff).toHaveAttribute('href', /#\/eco-payoff$/);
  await production.click();
  await expect(page).toHaveURL(/#\/production$/);
  await page.goto('./#/unit/83');
  await payoff.click();
  await expect(page).toHaveURL(/#\/eco-payoff$/);
  await page.goto('./#/unit/38');
  await expect(page.locator('#unit h1')).toContainText('骑士');
  await expect(region(page)).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#730 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/unit/83');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const target = region(page);
      await expect(target).toContainText('纯采集，不含往返行走与放下资源');
      await expect(target.locator('[data-task="wood"] [data-field="workRate"]')).toHaveText(String(eco.villager.tasks.wood.workRate));
      await numbersStay(target);
      for (const link of await target.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await target.evaluate((el) => el.setAttribute('data-villager-gather-audit', '730'));
      expect((await new AxeBuilder({ page }).include('[data-villager-gather-audit="730"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({ path: info.outputPath(`villager-gather-${width}-${theme}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
