import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
const units: { id: number; zh: string }[] = JSON.parse(readFileSync('src/data/units.json', 'utf8'));
const region = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '攻击类蓄力参数', exact: true });
async function numbersStay(target: Locator) {
  const tokens = await target.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()))
      for (const match of (node.textContent ?? '').matchAll(/[+-]?\d+(?:\.\d+)?(?:\/秒|秒|%)?/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, token.text).toBe(1);
}
async function chargeRows(target: Locator) {
  await expect(target.locator('[data-charge-unit]')).toHaveCount(3);
  for (const id of [283, 1792, 1793]) {
    const row = target.locator(`[data-charge-unit="${id}"]`);
    await expect(row.getByRole('heading', { level: 3 })).toHaveText(units.find((u) => u.id === id)!.zh);
    for (const [key, value] of [
      ['beforeCapacity', '0'],
      ['capacity', '5'],
      ['rate', '0.25/秒'],
      ['duration', '20秒'],
    ])
      await expect(row.locator(`[data-charge-field="${key}"]`)).toHaveText(value!);
  }
  for (const phrase of ['容量不等于额外伤害', '静态换算不是运行时冷却', '冲锋额外伤害', '触发距离', '待确认']) await expect(target).toContainText(phrase);
}
test('#710 PC1280蓄力参数与两处训练措辞', async ({ page }) => {
  await page.goto('./#/tech/884');
  await expect(page.locator('#tech h1')).toContainText('野战军');
  await chargeRows(region(page));
  await expect(page.locator('.detail-effect-tiles')).toContainText('训练速度 +50%');
  await expect(page.locator('.detail-effect-tiles')).not.toContainText('建造速度');
  await page.getByRole('tab', { name: '作用对象', exact: true }).click();
  const affects = page.locator('#affects');
  await expect(affects).toContainText('训练速度 +50%');
  await expect(affects).not.toContainText('建造速度');
  await expect(affects.locator('[title*="建造"]')).toHaveCount(0);
  await expect(affects.locator('[alt*="建造"]')).toHaveCount(0);
  await page.goto('./#/tech/437');
  await expect(page.locator('#tech h1')).toContainText('扳指');
  await expect(region(page)).toHaveCount(0);
  await expect(page.locator('#tech')).toContainText('攻击间隔约 ×0.85');
});
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#710 charge四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      for (const tab of ['ov', 'affects']) {
        await page.goto(`./#/tech/884?tab=${tab}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const target = tab === 'ov' ? region(page) : page.locator('#affects');
        await expect(target).toBeVisible();
        if (tab === 'ov') await chargeRows(target);
        else {
          await expect(target).toContainText('训练速度 +50%');
          await expect(target).not.toContainText('建造速度');
        }
        await expect(target).toHaveCount(1);
        await target.evaluate((el) => el.setAttribute('data-charge-audit', '710'));
        expect((await new AxeBuilder({ page }).include('[data-charge-audit="710"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await numbersStay(target);
        if (tab === 'ov') {
          const entry = target.getByRole('link', { name: '数据说明', exact: true });
          await expect(entry).toHaveCount(1);
          await expect(entry).toHaveAttribute('href', '#/about-data');
          const box = await entry.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        for (const link of await target.locator('a.community-tool-entry').all()) {
          const box = await link.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (tab === 'ov') {
          await target.getByRole('link', { name: '数据说明', exact: true }).click();
          await expect(page).toHaveURL(/#\/about-data$/);
          await expect(page.getByRole('heading', { level: 2, name: '关于数据', exact: true })).toBeVisible();
          await page.goto('./#/tech/884?tab=ov');
          await expect(target).toBeVisible();
        }
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          scrollTo(0, 0);
        });
        await page.screenshot({ path: info.outputPath(`roman-charge-${tab}-${width}-${theme}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
