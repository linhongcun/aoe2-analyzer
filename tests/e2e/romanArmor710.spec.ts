import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const units: { id: number; zh: string }[] = JSON.parse(readFileSync('src/data/units.json', 'utf8'));
const techs: { id: number; zh: string }[] = JSON.parse(readFileSync('src/data/techs.json', 'utf8'));
const region = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '步兵护甲科技对照', exact: true });
async function numbersStay(target: import('@playwright/test').Locator) {
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
async function armorRows(target: import('@playwright/test').Locator) {
  await expect(target.locator('[data-armor-tech]')).toHaveCount(2);
  for (const id of [74, 76]) {
    const row = target.locator(`[data-armor-tech="${id}"]`);
    await expect(row.getByRole('heading', { level: 3 })).toHaveText(techs.find((t) => t.id === id)!.zh);
    for (const stat of ['ma', 'pa']) {
      await expect(row.locator(`[data-armor-field="normal-${stat}"]`)).toHaveText('+1');
      await expect(row.locator(`[data-armor-field="roman-${stat}"]`)).toHaveText('+2');
    }
    expect(await row.locator('[data-armor-unit]').evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-armor-unit'))))).toEqual([
      74, 75, 77, 93, 358, 359, 1793,
    ]);
    for (const uid of [74, 75, 77, 93, 358, 359, 1793]) {
      const link = row.locator(`a[data-armor-unit="${uid}"]`);
      await expect(link).toHaveText(units.find((u) => u.id === uid)!.zh);
      await expect(link).toHaveAttribute('href', `#/unit/${uid}`);
    }
  }
  const example = target.locator('[data-armor-example="1793"]');
  await expect(example).toHaveCount(1);
  await expect(example.getByRole('heading', { level: 3 })).toContainText(units.find((u) => u.id === 1793)!.zh);
  for (const [stage, value] of [
    ['base', '2'],
    ['scale', '4'],
    ['chain', '6'],
  ])
    for (const stat of ['ma', 'pa']) await expect(example.locator(`[data-armor-stage="${stage}"] [data-armor-field="${stat}"]`)).toHaveText(value!);
  await expect(target).toContainText('罗马无法研究步兵钢甲，本例不计入');
  await expect(target.locator('[data-armor-tech="77"]')).toHaveCount(0);
  for (const word of ['同一形态', `已研究${techs.find((t) => t.id === 74)!.zh}及${techs.find((t) => t.id === 76)!.zh}`, '不含其它科技/团队加成'])
    await expect(target).toContainText(word);
}
test('#710 PC1280条件护甲对象/单项/前置累计与非目标', async ({ page }) => {
  await page.goto('./#/civ/Romans/bonus/1');
  await expect(page.locator('#bonus h1')).toContainText('罗马');
  await armorRows(region(page));
  for (const route of ['civ/Romans/bonus/0', 'civ/Britons/bonus/1']) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('#bonus h1')).toBeVisible();
    await expect(region(page)).toHaveCount(0);
  }
});
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#710 armor四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.goto('./#/civ/Romans/bonus/1');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const target = region(page);
      await armorRows(target);
      await expect(target).toHaveCount(1);
      await target.evaluate((el) => el.setAttribute('data-armor-audit', '710'));
      expect((await new AxeBuilder({ page }).include('[data-armor-audit="710"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await numbersStay(target);
      const entry = target.getByRole('link', { name: '数据说明', exact: true });
      await expect(entry).toHaveCount(1);
      await expect(entry).toHaveAttribute('href', '#/about-data');
      for (const link of await target.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await entry.click();
      await expect(page).toHaveURL(/#\/about-data$/);
      await expect(page.getByRole('heading', { level: 2, name: '关于数据', exact: true })).toBeVisible();
      await page.goto('./#/civ/Romans/bonus/1');
      await expect(target).toBeVisible();
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        scrollTo(0, 0);
      });
      await page.screenshot({ path: info.outputPath(`roman-armor-${width}-${theme}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
