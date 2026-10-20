import { expect, test, type Page } from '@playwright/test';

const groups = ['新手入门', '对局计划', '经济计算', '资料'];

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#272 分组入口、导航与计算页 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/');
      const home = page.locator('#home');
      await expect(home.getByRole('heading', { level: 2 })).toHaveText(groups);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await noOverflow(page);
      expect(
        await home.locator('.num').evaluateAll((items) =>
          items.every((item) => {
            const range = document.createRange();
            range.selectNodeContents(item);
            return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size <= 1;
          }),
        ),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`home-${theme}-${width}.png`), fullPage: true });

      if (width < 900) await page.getByRole('button', { name: '菜单', exact: true }).click();
      const tools = page.getByRole('button', { name: '工具', exact: true });
      await tools.click();
      const panel = page.locator('#tools-menu');
      await expect(panel.getByRole('heading', { level: 2 })).toHaveText(groups);
      // 首页所有模块卡片都在桌面菜单和手机抽屉中有对应入口。
      const paths = await home.locator('a.hcard').evaluateAll((links) => links.map((link) => link.getAttribute('href')).sort());
      expect(await panel.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')).sort())).toEqual(paths);
      expect(
        await panel.getByRole('link').evaluateAll((links) =>
          links.every((link) => {
            const range = document.createRange();
            const text = [...link.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
            if (!text) return false;
            range.selectNodeContents(text);
            return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size === 1;
          }),
        ),
      ).toBe(true);
      if (width === 1280) {
        const tops = await page
          .locator('.ngroup > .nitem, .tools > button')
          .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
        expect(new Set(tops).size).toBe(1);
      }
      await noOverflow(page);
      await panel.getByRole('link', { name: '市场买卖', exact: true }).click();
      await expect(page).toHaveURL(/#\/market(?:\?|$)/);
      await expect(panel).toBeHidden();
      await expect(page.locator('main h1')).toContainText('市场买卖');
      await noOverflow(page);

      for (const [label, route] of [
        ['市场买卖', 'market'],
        ['经济科技收益', 'eco-payoff'],
      ] as const) {
        await page.goto('./#/');
        await home.getByRole('link', { name: new RegExp(label) }).click();
        await expect(page).toHaveURL(new RegExp(`#/${route}(?:\\?|$)`));
        await expect(page.locator('main h1')).toContainText(label);
        await noOverflow(page);
      }
      expect(errors).toEqual([]);
    });

test('#272 工具菜单键盘可达，Esc 和移出焦点收起', async ({ page }) => {
  await page.goto('./#/');
  const trigger = page.getByRole('button', { name: '工具', exact: true });
  const panel = page.locator('#tools-menu');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(panel.getByRole('link').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(panel.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('link').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(panel.getByRole('link').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel).toBeHidden();
});

test('#272 历史首发与当前购买在页头互相说明并链接', async ({ page }) => {
  await page.goto('./#/dlc');
  const dlcLink = page.locator('#dlcs > p').first();
  await expect(dlcLink).toContainText('想看当前本体包含哪些内容、哪些需要另购');
  await dlcLink.getByRole('link', { name: '查看当前内容与购买导航', exact: true }).click();
  await expect(page).toHaveURL(/#\/content-guide(?:\?|$)/);
  const contentHead = page.locator('.cg-heading');
  await expect(contentHead).toContainText('想看文明最早在哪个版本登场');
  await contentHead.getByRole('link', { name: '查看文明历史首发列表', exact: true }).click();
  await expect(page).toHaveURL(/#\/dlc$/);
});
