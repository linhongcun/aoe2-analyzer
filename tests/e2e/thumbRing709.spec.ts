import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

async function unbrokenNumbers(target: Locator) {
  const tokens = await target.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/×\d+(?:\.\d+)?|v:\d+(?:\.\d+)?|\d+\.\d+s/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, `${token.text}不应跨行`).toBe(1);
}

test('#709 PC1280 扳指近似游戏说明能打开精确作用对象', async ({ page }) => {
  await page.goto('./#/tech/437');
  const game = page.getByRole('region', { name: '游戏内说明（近似）', exact: true });
  await expect(game).toContainText('+15%');
  await expect(game.getByRole('link', { name: '查看精确间隔与DE来源', exact: true })).toHaveAttribute('href', '#/tech/437?tab=affects');
  await game.getByRole('link', { name: '查看精确间隔与DE来源', exact: true }).click();
  await expect(page).toHaveURL(/tab=affects/);
  for (const v of ['0.176471', '0.111111', '0.111116', '0.25', '0.250002']) await expect(page.locator('#affects')).toContainText(`v:${v}`);
  await expect(page.locator('#affects')).toContainText('s:rof');
  await expect(page.locator('#affects')).not.toContainText('攻击速度 +18%');
  await page.goto('./#/tech/437?civ=Chinese&me=Chinese&opp=Britons');
  await game.getByRole('link', { name: '查看精确间隔与DE来源', exact: true }).click();
  const query = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(Object.fromEntries(query)).toMatchObject({ tab: 'affects', civ: 'Chinese', me: 'Chinese', opp: 'Britons' });
});

test('#709 模拟器正负路径与PK展开共用实际rof说明', async ({ page }) => {
  await page.goto('./#/unit/24/Chinese/4/437/?tab=sim');
  const n = page.locator('[data-t="thumb-ring-interval"]');
  await expect(n).toContainText('2.00s');
  await expect(n).toContainText('1.70s');
  await expect(n).toContainText('-0.30s');
  await expect(n).toContainText('v:0.176471');
  await expect(n).toContainText('总差值');
  for (const route of ['unit/24/Chinese/4/?tab=sim', 'unit/24/Britons/4/437/?tab=sim', 'unit/6/Chinese/4/437/?tab=sim']) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('#sim')).toBeVisible();
    await expect(n).toHaveCount(0);
  }
  await page.goto('./#/duel?a=24.Chinese.4.437.&b=38.Franks.3..&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('#duel-a .duel-tech')).not.toHaveAttribute('open');
  await page.locator('#duel-a .duel-tech > summary').click();
  await expect(n).toContainText('v:0.176471');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#709 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      for (const context of ['overview', 'affects', 'sim'] as const) {
        await page.goto(context === 'sim' ? './#/unit/24/Chinese/4/437/?tab=sim' : context === 'affects' ? './#/tech/437?tab=affects' : './#/tech/437');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const target =
          context === 'sim' ? page.locator('[data-t="thumb-ring-interval"]') : context === 'affects' ? page.locator('#affects') : page.locator('#tech .dmain');
        await expect(target).toBeVisible();
        if (context === 'sim') {
          await expect(target).toContainText('Δ = 基间隔 × (1/(1+v) − 1)');
          await expect(target).toContainText('DE 188329');
        } else {
          await expect(target).toContainText('攻击间隔约 ×0.85');
          await expect(target).toContainText('v:0.176471');
        }
        if (context === 'overview') {
          await expect(target).toContainText('游戏内说明（近似）');
          const size = await target.getByRole('link', { name: '查看精确间隔与DE来源', exact: true }).boundingBox();
          expect(size!.width).toBeGreaterThanOrEqual(44);
          expect(size!.height).toBeGreaterThanOrEqual(44);
        }
        await unbrokenNumbers(target);
        await expect(target).toHaveCount(1);
        await target.evaluate((el) => el.setAttribute('data-ring-audit', '709'));
        expect((await new AxeBuilder({ page }).include('[data-ring-audit="709"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await target.screenshot({ path: info.outputPath(`thumb-ring-${context}-${width}-${theme}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
