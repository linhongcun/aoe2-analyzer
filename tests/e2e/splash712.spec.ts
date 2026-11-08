import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
const buildings: { id: number; zh: string }[] = JSON.parse(readFileSync('src/data/buildings.json', 'utf8'));
const region = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '溅射与最小射程', exact: true });
async function numbersStay(scope: Locator) {
  const tokens = await scope.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()))
      for (const m of (node.textContent ?? '').matchAll(/\d+(?:\.\d+)?/g)) {
        const range = document.createRange();
        range.setStart(node, m.index!);
        range.setEnd(node, m.index! + m[0].length);
        found.push({ text: m[0], lines: range.getClientRects().length });
      }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, token.text).toBe(1);
}
test('#712 PC1280三单位半径/最小射程与描述原生链接', async ({ page }) => {
  for (const [id, radius, name] of [
    [280, '1', '轻型投石车'],
    [550, '1.25', '中型投石车'],
    [588, '1.5', '重型投石车'],
  ] as const) {
    await page.goto(`./#/unit/${id}`);
    await expect(page.locator('#unit h1')).toContainText(name);
    const target = region(page);
    await expect(target.locator('[data-splash-field=radius]')).toHaveText(radius);
    await expect(target.locator('[data-splash-field=minimum]')).toHaveText('3');
    for (const phrase of [
      '落点周围的溅射半径',
      '单位（是否以格计）待确认',
      '满伤区与边缘伤害/衰减待确认',
      '攻击者至瞄准点的发射限制',
      '不是免伤圈',
      '不代表不会被其他落点的溅射波及',
    ])
      await expect(target).toContainText(phrase);
    const desc = page.locator('#unit .desc');
    await expect(desc).not.toContainText(/\([ \t]*\)|（[ \t]*）/);
    for (const word of ['大学', '修道院', ...(id === 588 ? [] : ['攻城武器厂'])]) {
      await expect(desc).toContainText(`(${word})`);
      await expect(desc.getByRole('link', { name: word, exact: true })).toHaveAttribute('href', `#/building/${buildings.find((b) => b.zh === word)!.id}`);
    }
  }
  await page.goto('./#/unit/38');
  await expect(page.locator('#unit h1')).toContainText('骑士');
  await expect(region(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: '按时代类别加成对照', exact: true })).toBeVisible();
  await page.goto('./#/unit/331');
  await expect(page.locator('#unit h1')).toContainText('巨型投石机');
  await expect(region(page)).toHaveCount(0);
  await expect(page.locator('#unit .desc')).toContainText('打包后可移动，展开后可攻击');
});
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#712 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      for (const id of [280, 550, 588]) {
        await page.goto(`./#/unit/${id}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const target = region(page);
        await expect(target).toBeVisible();
        await numbersStay(target);
        const links = target.getByRole('link');
        await expect(links).toHaveCount(2);
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(target.getByRole('link', { name: '固定版本字段说明', exact: true })).toHaveAttribute(
          'href',
          'https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/js/main.js#L387',
        );
        await target.getByRole('link', { name: '数据说明', exact: true }).click();
        await expect(page).toHaveURL(/#\/about-data$/);
        await expect(page.getByRole('heading', { level: 1, name: '关于数据', exact: true })).toBeVisible();
        await page.goto(`./#/unit/${id}`);
        await expect(target).toBeVisible();
        await expect(target).toHaveCount(1);
        await target.evaluate((el) => el.setAttribute('data-splash-audit', '712'));
        expect((await new AxeBuilder({ page }).include('[data-splash-audit="712"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({ path: info.outputPath(`splash-${id}-${width}-${theme}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
