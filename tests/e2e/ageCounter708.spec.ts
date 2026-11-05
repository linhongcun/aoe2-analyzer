import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog: { id: number; zh: string }[] = JSON.parse(readFileSync('src/data/units.json', 'utf8'));
const names = new Map(catalog.map((unit) => [unit.id, unit.zh]));

const region = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '按时代类别加成对照', exact: true });
async function values(scope: Locator, pair: string, attack: string, armor: string, damage: string) {
  const row = scope.locator(`[data-counter-pair="${pair}"]`);
  await expect(row.locator('dd')).toHaveText([attack, armor, damage]);
}
async function numbersStay(scope: Locator) {
  const tokens = await scope.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()))
      for (const m of (node.textContent ?? '').matchAll(/-?\d+(?:\.\d+)?/g)) {
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
test('#708 PC1280五入口两时代及固定基础口径', async ({ page }) => {
  for (const id of [38, 283, 569, 8, 530]) {
    await page.goto(`./#/unit/${id}`);
    const target = region(page);
    await expect(target.getByRole('heading', { level: 3 })).toHaveText(['城堡时代', '帝王时代']);
    await expect(target).toContainText('不是单次总伤害或胜负');
    await expect(target).toContainText('常规目录时代示例');
    await expect(target).toContainText('文明提前解锁、禁训及升级以科技树为准');
    if ([38, 283, 569].includes(id)) {
      for (const [era, pairs] of [
        [
          '城堡时代',
          [
            ['358-38', '22'],
            ['329-38', '9'],
          ],
        ],
        [
          '帝王时代',
          [
            ['359-283', '32'],
            ['330-283', '18'],
            ['359-569', '32'],
            ['330-569', '18'],
          ],
        ],
      ] as const)
        await ageCard(target, era, pairs);
    } else {
      await ageCard(target, '城堡时代', [
        ['7-8', '3'],
        ['6-8', '4'],
      ]);
      await ageCard(target, '帝王时代', [['6-530', '4']]);
      await expect(target).toContainText('封建形态沿用');
    }
  }
  await page.goto('./#/unit/38/Byzantines/4/?tab=ov');
  await expect(region(page)).toContainText('固定基础参考');
  await expect(region(page)).toContainText('未含科技、文明和团队加成');
  await values(region(page), '358-38', '22', '0', '22');
  await page.goto('./#/unit/280');
  await expect(page.getByRole('heading', { level: 1, name: /轻型投石车/ })).toBeVisible();
  await expect(region(page)).toHaveCount(0);
});

async function ageCard(target: Locator, era: string, pairs: readonly (readonly [string, string])[]) {
  const card = target.getByRole('heading', { level: 3, name: era, exact: true }).locator('..');
  const rows = card.locator('[data-counter-pair]');
  await expect(rows).toHaveCount(pairs.length);
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-counter-pair')))).toEqual(pairs.map(([pair]) => pair));
  for (const [pair, value] of pairs) {
    await values(card, pair, value, '0', value);
    const [attacker, defender] = pair.split('-').map(Number);
    await expect(card.locator(`[data-counter-pair="${pair}"]`).getByRole('heading', { level: 4 })).toHaveText(
      `${names.get(attacker!)} 对 ${names.get(defender!)}`,
    );
  }
}
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#708 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      for (const id of [38, 8]) {
        await page.goto(`./#/unit/${id}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const target = region(page);
        await expect(target).toBeVisible();
        await values(target, id === 38 ? '358-38' : '6-8', id === 38 ? '22' : '4', '0', id === 38 ? '22' : '4');
        await numbersStay(target);
        const entry = target.getByRole('link', { name: '数据说明', exact: true });
        const box = await entry.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await entry.click();
        await expect(page).toHaveURL(/#\/about-data$/);
        await expect(page.getByRole('heading', { level: 2, name: '关于数据', exact: true })).toBeVisible();
        await page.goto(`./#/unit/${id}`);
        await expect(target).toBeVisible();
        await expect(target).toHaveCount(1);
        await target.evaluate((el) => el.setAttribute('data-counter-audit', '708'));
        expect((await new AxeBuilder({ page }).include('[data-counter-audit="708"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({ path: info.outputPath(`age-counter-${id}-${width}-${theme}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
