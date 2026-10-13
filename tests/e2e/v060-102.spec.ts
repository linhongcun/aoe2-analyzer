// v0.6.0 用例（e2e）— Kent。#102（PR #116）：PK 地址栏与反馈链接带完整对阵
import { expect, test, type Page } from '@playwright/test';

// ───────────── #102 反馈链接带上当前对阵 ─────────────
const fbPage = async (page: Page) => {
  const href = (await page.locator('a[data-t="feedback"]').first().getAttribute('href'))!;
  const body = new URL(href).searchParams.get('body')!;
  return new URL(body.match(/页面：(\S+)/)![1]!);
};
const hashParams = (u: URL) => new URLSearchParams(u.hash.split('?')[1] ?? '');

test.describe('#102 PK 反馈链接与当前对阵一致', () => {
  test('改对阵（模式/科技预设）后，反馈链接参数 = 地址栏 hash 参数（Steve 口径原文）', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.4.f.&b=329.Berbers.4.f.&m=r&bud=3000');
    await page.getByRole('radio', { name: '1v1' }).click();
    await page.getByRole('radio', { name: '当前时代满科技' }).nth(1).click();
    const fb = hashParams(await fbPage(page));
    const addr = hashParams(new URL(page.url()));
    expect(Object.fromEntries(fb)).toEqual(Object.fromEntries(addr));
  });
  test('未改动的默认对阵也要完整带上 A、B、模式（否则反馈复现不了玩家看到的对阵）', async ({ page }) => {
    await page.goto('#/duel');
    await expect(page.locator('.duel-head').first()).toBeVisible();
    const fb = hashParams(await fbPage(page));
    const addr = hashParams(new URL(page.url()));
    for (const k of ['a', 'b', 'm']) {
      expect(addr.get(k), `地址栏缺 ${k}`).toBeTruthy();
      expect(fb.get(k), `反馈链接缺 ${k}`).toBeTruthy();
    }
    expect(Object.fromEntries(fb)).toEqual(Object.fromEntries(addr));
  });
  test('只改了 A 侧时，反馈链接里 B 侧也要在（当前 hash 只写改动过的一侧）', async ({ page }) => {
    await page.goto('#/duel');
    await page.getByRole('radio', { name: '等资源' }).click();
    await page.getByRole('radio', { name: '当前时代满科技' }).first().click();
    const fb = hashParams(await fbPage(page));
    for (const k of ['a', 'b', 'm', 'bud']) expect(fb.get(k), `反馈链接缺 ${k}`).toBeTruthy();
  });
});

// ───────────── 旧用例按 v0.6.0 新口径（Steve 定稿）：smoke.spec.ts 工具菜单进 PK 的地址断言由 #102 引起 ─────────────
test('#102 smoke 工具菜单进单位 PK：地址带完整 a/b/m，不再以 #/duel 结尾', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '工具' }).click();
  await page.locator('#tools-menu').getByRole('link', { name: '单位 PK' }).click();
  await expect(page).toHaveURL(/#\/duel\?/);
  const p = new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');
  for (const k of ['a', 'b', 'm']) expect(p.get(k), `地址栏缺 ${k}`).toBeTruthy();
});
