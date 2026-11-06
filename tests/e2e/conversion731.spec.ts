import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const OFFICIAL = 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-99311/';
const region = (page: Page) => page.getByRole('region', { name: '招降机制', exact: true });

async function numbersStay(scope: Locator) {
  const tokens = await scope.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/\d+(?:\.\d+)?/g)) {
        const range = document.createRange();
        range.setStart(node, match.index ?? 0);
        range.setEnd(node, (match.index ?? 0) + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, token.text).toBe(1);
}

async function expectMechanism(page: Page, anchor: boolean) {
  const target = region(page);
  await expect(target).toBeVisible();
  await expect(target.locator('[data-conversion=interval]')).toHaveText('5–9 秒');
  await expect(target.locator('[data-conversion=chance]')).toHaveText('40%');
  await expect(target.locator('[data-conversion=baseline-status]')).toHaveText('待确认（无站内 DAT）');
  await expect(target.locator('[data-conversion=devotion-min]')).toHaveText('+1');
  await expect(target.locator('[data-conversion=devotion-max]')).toHaveText('+1');
  await expect(target.locator('[data-conversion=faith-min]')).toHaveText('+4');
  await expect(target.locator('[data-conversion=faith-max]')).toHaveText('+4');
  await expect(target).toContainText('单位被敌方僧侣招降的困难度增加 15%');
  await expect(target).toContainText('单位被敌人僧侣招降的困难度增加 50%');
  await expect(target).toContainText('平均时间的近似说法，不是另一套数值');
  await expect(target).toContainText('当前站内增量与 Update 99311 的记载相同');
  await expect(target.locator('[data-conversion=resistance]')).toHaveText('部分单位另有抗性。待确认。');
  await expect(target).not.toContainText('斥候');
  await expect(target).not.toContainText('+3');
  await expect(target).not.toContainText('150');
  await expect(target).not.toContainText('推荐');
  await expect(target).not.toContainText('该不该');
  await expect(target.getByRole('link', { name: /99311/ })).toHaveAttribute('href', OFFICIAL);
  for (const [name, href] of [
    ['虔诚', '#/tech/46'],
    ['信念', '#/tech/45'],
  ] as const) {
    const links = target.getByRole('link', { name, exact: true });
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) await expect(link).toHaveAttribute('href', href);
  }
  if (anchor) await expect(page.locator('#conversion')).toBeVisible();
  else await expect(page.locator('#conversion')).toHaveCount(0);
  const links = target.getByRole('link');
  expect(await links.count()).toBeGreaterThanOrEqual(4);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await numbersStay(target);
}

test('#731 僧侣与传教士页展示招降机制，科技页只放短链', async ({ page }) => {
  await page.goto('./#/unit/125');
  await expect(page.locator('#unit h1')).toContainText('僧侣');
  await expectMechanism(page, true);

  await page.goto('./#/unit/775');
  await expect(page.locator('#unit h1')).toContainText('传教士');
  await expectMechanism(page, false);

  await page.goto('./#/unit/38');
  await expect(page.locator('#unit h1')).toContainText('骑士');
  await expect(region(page)).toHaveCount(0);

  await page.goto('./#/unit/1811');
  await expect(page.locator('#unit h1')).toContainText('牧师战士');
  await expect(region(page)).toHaveCount(0);

  for (const [id, name, food, gold] of [
    [46, '虔诚', '100', '200'],
    [45, '信念', '550', '750'],
  ] as const) {
    await page.goto(`./#/tech/${id}`);
    await expect(page.locator('#tech h1')).toContainText(name);
    const note = page.getByRole('region', { name: '效果说明', exact: true });
    await expect(note).toContainText('上方百分比是平均时间的近似说法，不是另一套数值。');
    await expect(note).not.toContainText('150');
    const link = note.getByRole('link', { name: '查看招降间隔与概率', exact: true });
    await expect(link).toHaveAttribute('href', '#/unit/125#conversion');
    const box = await link.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page).toHaveURL(/#\/unit\/125#conversion$/);
    await expect(page.locator('#unit h1')).toContainText('僧侣');
    await expect(region(page)).toBeVisible();
    await expect(page.locator('#tech')).toHaveCount(0);
    // 费用仍在科技页，不在这段跳转后的单位说明里改写。回到科技页核对原费用数字。
    await page.goto(`./#/tech/${id}`);
    const cost = page.getByRole('region', { name: '研究', exact: true });
    await expect(cost).toContainText(food);
    await expect(cost).toContainText(gold);
  }

  await page.goto('./#/tech/101');
  await expect(page.getByRole('link', { name: '查看招降间隔与概率', exact: true })).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#731 四宽明暗 ${width}-${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.goto('./#/unit/125');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectMechanism(page, true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1280) expect((await new AxeBuilder({ page }).include('#conversion').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

      await page.goto('./#/tech/46');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const note = page.getByRole('region', { name: '效果说明', exact: true });
      await expect(note.getByRole('link', { name: '查看招降间隔与概率', exact: true })).toBeVisible();
      await numbersStay(note);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1280)
        expect((await new AxeBuilder({ page }).include('[aria-label="效果说明"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors, errors.join('\n')).toEqual([]);
    });
