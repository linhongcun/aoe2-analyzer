// #296 自测（Linus）：#/builds、#/duel 的主标题改为 h1 后，外观与其它列表页的 h2 标题一致；其它列表页不受影响。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;
const look = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((h) => {
      const s = getComputedStyle(h);
      return { fs: s.fontSize, lh: s.lineHeight, fw: s.fontWeight, ls: s.letterSpacing, color: s.color, margin: s.margin, ff: s.fontFamily };
    });
async function go(page: Page, route: string, theme: (typeof THEMES)[number]) {
  await page.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.lhead > :first-child')).toBeVisible();
}

for (const theme of THEMES)
  for (const w of [360, 1280])
    test(`${theme} @${w}：#/builds、#/duel 的 h1 与 #/civs 列表标题 h2 外观相同`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await go(page, '/civs', theme);
      const ref = await look(page, '.lhead h2');
      for (const route of ['/builds', '/duel']) {
        await go(page, route, theme);
        expect(await look(page, '.lhead h1'), route).toEqual(ref);
        await expect(page.locator('.lhead h2')).toHaveCount(0);
      }
    });

test('读屏可按一级标题找到两页主标题', async ({ page }) => {
  await go(page, '/builds', 'light');
  await expect(page.getByRole('heading', { level: 1, name: '开局流程', exact: true })).toBeVisible();
  await go(page, '/duel', 'light');
  await expect(page.getByRole('heading', { level: 1, name: '单位 PK', exact: true })).toBeVisible();
});

test('#/builds、#/duel 通过 axe page-has-heading-one；两页标题层级无跳级', async ({ page }) => {
  for (const route of ['/builds', '/duel']) {
    await go(page, route, 'light');
    const r = await new AxeBuilder({ page }).withRules(['page-has-heading-one']).analyze();
    expect(
      r.violations.map((v) => v.id),
      route,
    ).toEqual([]);
  }
  for (const route of ['/builds', '/duel']) {
    await go(page, route, 'light');
    const r = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
    expect(
      r.violations.map((v) => v.id),
      route,
    ).toEqual([]);
    if (route === '/duel') {
      await page.locator('#duel details').evaluateAll((elements) =>
        elements.forEach((element) => {
          (element as HTMLDetailsElement).open = true;
        }),
      );
      const expanded = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
      expect(
        expanded.violations.map((v) => v.id),
        '展开后的单位 PK',
      ).toEqual([]);
    }
  }
});

test('不在范围的列表页仍用 h2 标题（#/civs、#/units、#/techs）', async ({ page }) => {
  for (const route of ['/civs', '/units', '/techs']) {
    await go(page, route, 'light');
    await expect(page.locator('.lhead h2'), route).toHaveCount(1);
    await expect(page.locator('.lhead h1'), route).toHaveCount(0);
  }
});
