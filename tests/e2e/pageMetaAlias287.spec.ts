import { expect, test } from '@playwright/test';

const cases = [
  { path: '/game-clock', title: /游戏与现实时间换算/, upper: '/GAME-CLOCK', encoded: '/%67ame-clock' },
  { path: '/duel', title: /单位 PK/, upper: '/DUEL', encoded: '/%64uel' },
  { path: '/hotkeys', title: /游戏快捷键速查/, upper: '/HOTKEYS', encoded: '/%68otkeys' },
] as const;

for (const item of cases)
  for (const alias of [item.upper, item.encoded])
    test(`#287 ${item.path} 别名 ${alias} 的标题和分享地址不是首页`, async ({ page }) => {
      await page.goto('./#' + alias);
      await expect(page).toHaveTitle(item.title);
      const og = await page.locator('meta[property="og:url"]').getAttribute('content');
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(new URL(og!).pathname).toMatch(new RegExp(`${item.path}/$`));
      expect(new URL(canonical!).pathname).toMatch(new RegExp(`${item.path}/$`));
      expect(new URL(og!).pathname).not.toBe('/');
      expect(new URL(canonical!).pathname).not.toBe('/');
    });
