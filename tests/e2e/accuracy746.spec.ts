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
  const other = page.locator('#unit-notes');
  await expect(other).toContainText('目录打包记录的准确度，不代表展开命中率');
  await expect(boundary(page).locator('[data-accuracy=percent]')).toHaveText('92%');
  await expect(boundary(page).locator('[data-accuracy=ballistics]')).toHaveAttribute('data-ballistics-applicable', 'false');
  await expect(boundary(page)).toContainText('本单位不适用大学科技「弹道学」');
  await expect(boundary(page).getByRole('link', { name: '查看弹道学', exact: true })).toHaveCount(0);
  await expect(boundary(page)).toContainText('单位 PK 未模拟弹道和走位');

  await page.goto('./#/unit/1001');
  await expect(page.locator('#unit h1')).toContainText('风琴炮');
  await expect(boundary(page).locator('[data-accuracy=percent]')).toHaveText('0%');
  await expect(boundary(page)).toContainText('不表示打不中');
  await expect(boundary(page).locator('[data-accuracy=ballistics]')).toHaveAttribute('data-ballistics-applicable', 'false');
  await expect(boundary(page)).toContainText('本单位不适用大学科技「弹道学」');
  await expect(boundary(page)).not.toContainText('量化预判待确认');
  await expect(boundary(page)).not.toContainText('弹道学跟踪移动目标');
  await expect(boundary(page)).not.toContainText('提前量');
  await expect(boundary(page).getByRole('link', { name: '查看弹道学', exact: true })).toHaveCount(0);
  await expect(boundary(page).getByRole('link', { name: '查看单位 PK 模型边界', exact: true })).toHaveAttribute('href', '#/duel#duel-model');

  await page.goto('./#/unit/1911');
  await expect(page.locator('#unit h1')).toContainText('掷弹兵');
  await expect(boundary(page).locator('[data-accuracy=percent]')).toHaveText('0%');
  await expect(boundary(page)).toContainText('不表示打不中');
  await expect(boundary(page).locator('[data-accuracy=ballistics]')).toHaveAttribute('data-ballistics-applicable', 'true');
  await expect(boundary(page)).toContainText('弹道学跟踪移动目标，站内未量化');
  await expect(boundary(page).getByRole('link', { name: '查看弹道学', exact: true })).toHaveAttribute('href', '#/tech/93');
  await expect(boundary(page).getByRole('link', { name: '查看单位 PK 模型边界', exact: true })).toHaveAttribute('href', '#/duel#duel-model');

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

test('远程散布的单位、来源、零值与双列窄屏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.getByRole('region', { name: '准确度与落点散布' });
  for (const [id, accuracy, dispersion] of [
    [46, '50%', '0.75'],
    [39, '50%', '0.33'],
    [866, '100%', '0.75'],
    [281, '100%', '0'],
  ] as const) {
    await page.goto('./#/unit/' + id);
    await expect(panel.locator('[data-accuracy=percent]')).toHaveText(accuracy);
    await expect(panel.locator('[data-accuracy=dispersion] dd').first()).toHaveText(dispersion);
    const boxes = await panel.locator('dd:first-of-type').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top));
    expect(boxes[0]).toBe(boxes[1]);
    await expect(panel.getByRole('link', { name: '固定版本 DAT' })).toHaveAttribute('href', /auto-mods\/blob\/[a-f0-9]{40}\/dat\/empires2_x2_p1.dat$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(panel).toContainText('固定源显式记录为 0');
  await page.goto('./#/unit/1962');
  await expect(panel).toBeVisible();
  await page.goto('./#/unit/1980');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.ud-form-warn')).toContainText('目录准确度为 0%');
});

test('#1507 弹道学不适用远程、无普攻回退与双宽明暗核验', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  // 1) 不适用弹道学代表远程：精锐飞轮刃投掷手、火枪手、火艨艟
  for (const [route, name, pct] of [
    ['./#/unit/1743?civ=Gurjaras', '精锐飞轮刃投掷手', '100%'],
    ['./#/unit/5?civ=Gurjaras', '火枪手', '75%'],
    ['./#/unit/1103', '火艨艟', '0%'],
  ] as const) {
    await page.goto(route);
    await expect(page.locator('#unit h1')).toContainText(name);
    const note = boundary(page);
    await expect(note.locator('[data-accuracy=percent]')).toHaveText(pct);
    await expect(note.locator('[data-accuracy=ballistics]')).toHaveAttribute('data-ballistics-applicable', 'false');
    await expect(note).toContainText('本单位不适用大学科技「弹道学」');
    await expect(note).not.toContainText('弹道学跟踪移动目标');
    await expect(note.getByRole('link', { name: '查看弹道学', exact: true })).toHaveCount(0);
    await expectLinks(note, ['查看单位 PK 模型边界']);
  }

  // 2) 无普通攻击施法单位（僧侣、传教士）与非施法单位（渔船）回退；仅蓄力近战（扈从部队）对照组
  for (const [route, name, pct, isCaster] of [
    ['./#/unit/125', '僧侣', '38%', true],
    ['./#/unit/775?civ=Spanish', '传教士', '38%', true],
    ['./#/unit/13', '渔船', '0%', false],
  ] as const) {
    await page.goto(route);
    await expect(page.locator('#unit h1')).toContainText(name);
    await expect(page.locator('[data-accuracy=panel]')).toHaveCount(0);
    const fallback = page.locator('[data-accuracy=no-normal-attack]');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText(pct);
    await expect(fallback).toContainText('无普通攻击');
    if (isCaster) {
      await expect(fallback).toContainText('目录原始读数，不进入单位 PK 期望命中，也不代表下方招降机制的概率。');
    } else {
      await expect(fallback).toContainText('目录原始读数，不进入单位 PK 期望命中。');
      await expect(fallback).not.toContainText('招降');
    }
    await expect(page.locator('#unit-notes a[href="#/tech/93"]')).toHaveCount(0);
  }

  await page.goto('./#/unit/2705');
  await expect(page.locator('#unit h1')).toContainText('扈从部队');
  await expect(page.locator('[data-accuracy=panel]')).toHaveCount(0);
  await expect(page.locator('[data-accuracy=no-normal-attack]')).toHaveCount(0);
  await expect(page.locator('#unit-notes')).toContainText('准确度 100%');

  // 3) 桌面 1280 与窄屏 360 明暗双主题：防折行、触控区、无横向溢出、Axe WCAG AA
  for (const [width, theme, route, scopeSel] of [
    [1280, 'light', './#/unit/1743?civ=Gurjaras', '[data-accuracy=panel]'],
    [360, 'dark', './#/unit/5?civ=Gurjaras', '[data-accuracy=panel]'],
    [360, 'dark', './#/unit/1911', '[data-accuracy=panel]'],
    [1280, 'light', './#/unit/125', '[data-accuracy=no-normal-attack]'],
    [360, 'dark', './#/unit/775?civ=Spanish', '[data-accuracy=no-normal-attack]'],
    [360, 'light', './#/unit/13', '[data-accuracy=no-normal-attack]'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const scope = page.locator(scopeSel);
    await expect(scope).toBeVisible();
    await numbersStay(scope);
    const nwWrapped = await scope.locator('.nw').evaluateAll((els) =>
      els
        .filter((el) => {
          const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
          return new Set(rects.map((r) => Math.round(r.top))).size > 1;
        })
        .map((el) => el.textContent),
    );
    expect(nwWrapped, `.nw wrapped on ${route} ${width}-${theme}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${route} ${width}`).toBe(true);
    const axe = await new AxeBuilder({ page }).include(scopeSel).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `axe ${route} ${width}-${theme}`).toEqual([]);
  }

  expect(errors, errors.join('\n')).toEqual([]);
});
