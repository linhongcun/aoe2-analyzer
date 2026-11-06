import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const boundary = (page: Page) => page.locator('[data-accuracy=boundary]');
const ballistics = (page: Page) => page.getByRole('region', { name: '准确度与弹道学', exact: true });

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

async function expectLinks(scope: Locator, names: readonly string[]) {
  for (const name of names) {
    const link = scope.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

test('#746 远程准确度与弹道学分开，近战和射程 1 不写这条', async ({ page }) => {
  await page.goto('./#/unit/4');
  await expect(page.locator('#unit h1')).toContainText('步弓手');
  const note = boundary(page);
  await expect(note.locator('[data-accuracy=percent]')).toHaveText('80%');
  await expect(note).toContainText('目录准确度');
  await expect(note).toContainText('进入单位 PK 的期望命中');
  await expect(note).toContainText('弹道学跟踪移动目标，站内未量化');
  await expect(note).toContainText('站内效果表没有可量化规则，量化预判待确认');
  await expect(note).toContainText('单位 PK 未模拟弹道和走位');
  await expect(note).not.toContainText('推荐');
  await expect(note).not.toContainText('提前量');
  await expect(note.getByRole('link', { name: '查看弹道学', exact: true })).toHaveAttribute('href', '#/tech/93');
  await expect(note.getByRole('link', { name: '查看单位 PK 模型边界', exact: true })).toHaveAttribute('href', '#/duel#duel-model');

  await page.goto('./#/unit/38');
  await expect(page.locator('#unit h1')).toContainText('骑士');
  await expect(boundary(page)).toHaveCount(0);

  await page.goto('./#/unit/879');
  await expect(page.locator('#unit h1')).toContainText('印加枪兵长');
  await expect(boundary(page)).toHaveCount(0);

  await page.goto('./#/unit/331');
  await expect(page.locator('#unit h1')).toContainText('巨型投石机');
  const other = page.getByRole('region', { name: '其他属性', exact: true });
  await expect(other).toContainText('目录打包记录的准确度，不代表展开命中率');
  await expect(boundary(page).locator('[data-accuracy=percent]')).toHaveText('92%');
  await expect(boundary(page)).toContainText('单位 PK 未模拟弹道和走位');

  await page.goto('./#/unit/1001');
  await expect(page.locator('#unit h1')).toContainText('风琴炮');
  await expect(boundary(page).locator('[data-accuracy=percent]')).toHaveText('0%');
  await expect(boundary(page)).toContainText('量化预判待确认');
  await expect(boundary(page)).not.toContainText('提前量');

  await page.goto('./#/tech/93');
  await expect(page.locator('#tech h1')).toContainText('弹道学');
  await expect(page.locator('#tech')).toContainText('对移动目标的射击准确度更高');
  const section = ballistics(page);
  await expect(section).toContainText('弹道学跟踪移动目标，站内未量化');
  await expect(section).toContainText('目录准确度是单位页上的百分比，进入单位 PK 的期望命中');
  await expect(section).toContainText('单位 PK 未模拟弹道和走位');
  await expect(section).toContainText('量化预判待确认');
  await expect(section.locator('[data-ballistics=track]')).toHaveAttribute('data-ballistics-rules', '0');
  await expect(section.locator('[data-ballistics=track]')).toHaveAttribute('data-ballistics-eco', '0');
  const model = section.getByRole('link', { name: '查看单位 PK 模型边界', exact: true });
  await expect(model).toHaveAttribute('href', '#/duel#duel-model');
  await model.click();
  await expect(page).toHaveURL(/#\/duel\?.*#duel-model$/);
  const duelNote = page.locator('#duel-model');
  await expect(duelNote).toBeInViewport();
  await expect(duelNote).toContainText('远程按命中率取期望');
  await expect(duelNote).toContainText('走位');

  await page.goto('./#/tech/101');
  await expect(ballistics(page)).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#746 四宽明暗 ${width}-${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/unit/4');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const note = boundary(page);
      await expect(note.locator('[data-accuracy=percent]')).toHaveText('80%');
      await numbersStay(note);
      await expectLinks(note, ['查看弹道学', '查看单位 PK 模型边界']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1280 && theme === 'light')
        expect((await new AxeBuilder({ page }).include('[data-accuracy=boundary]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

      await page.goto('./#/tech/93');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const section = ballistics(page);
      await expect(section).toContainText('单位 PK 未模拟弹道和走位');
      await expectLinks(section, ['查看单位 PK 模型边界']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1280 && theme === 'light')
        expect((await new AxeBuilder({ page }).include('[aria-label="准确度与弹道学"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors, errors.join('\n')).toEqual([]);
    });
