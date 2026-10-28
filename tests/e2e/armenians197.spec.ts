import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const overflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const nowrap = async (page: Page) =>
  page.locator('main .num, main .nw').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
      return new Set(tops).size > 1 ? [element.textContent] : [];
    }),
  );

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 亚美尼亚骡车、真实费用、研究口径与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      await page.goto('./#/builds?bo=scouts-18&civ=Armenians&step=3');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按亚美尼亚计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toContainText('逐次改为付费骡车');
      await expect(page.locator('[data-t="civ-note"]')).toContainText('对应研究完成后');
      const detail = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(detail.getByRole('link', { name: '骡车', exact: true })).toHaveAttribute('href', '#/building/1808');
      await expect(page.locator('[data-step="2"] .n')).toContainText('60木、15食物');
      await expect(page.locator('[data-step="2"] .n')).not.toContainText('伐木场');
      await expect(detail.locator('[data-t="step-cost"]')).toContainText('食物 15');
      await expect(detail.locator('[data-t="step-cost"]')).toContainText('木头 60');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      if (width === 360 && theme === 'light')
        expect(
          (await new AxeBuilder({ page }).include('[data-t="civ-note"]').include('.tl-detail').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        ).toEqual([]);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`armenians197-cart-${width}-${theme}.png`), fullPage: true });

      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('每个原营地建造动作均新增一辆付费骡车');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('未经当前客户端实测');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按亚美尼亚计');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('逐次改为付费骡车');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('对应研究完成后');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Armenians');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`armenians197-share-${width}-${theme}.png`), fullPage: true });
      if (width === 1280 && theme === 'light') {
        const downloaded = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await downloaded).saveAs(info.outputPath('armenians197-share-download.png'));
      }
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();

      await page.goto('./#/builds?bo=archers-19&civ=Armenians&step=9');
      await expect(page.getByRole('region', { name: '步骤详情', exact: true }).getByRole('link', { name: '骡车', exact: true })).toBeVisible();
      await expect(page.locator('[data-step="8"] .n')).toContainText('60木、15食物');
      // The old primary-action cost is the House, not the sum of this compound action block.
      await expect(page.locator('[data-t="step-cost"]')).toContainText('木头 25');
      // The first wood cart already exists here; 202 can use it while this second cart is built.
      await expect(page.locator('[data-t="civ-note"]')).toContainText('对应研究完成后');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`armenians197-compound-${width}-${theme}.png`), fullPage: true });

      // Source observer's existing BO has an unfinished Blacksmith when 199 is requested.
      await page.goto('./#/builds?bo=maa-archers-18&civ=Armenians&step=12');
      await expect(page.getByRole('region', { name: '步骤详情', exact: true })).toContainText('研究前需等铁匠铺建成');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`armenians197-research-site-${width}-${theme}.png`), fullPage: true });

      for (const index of [0, 1]) {
        await page.goto(`./#/civ/Armenians/bonus/${index}`);
        const usage = page.locator('#bonus .bonusbody [data-usage="sim"]');
        await expect(usage).toHaveAttribute('data-on', 'true');
        await expect(usage).toContainText(index === 0 ? '逐次付费骡车费用' : '对应研究完成后');
        await overflow(page);
        expect(await nowrap(page)).toEqual([]);
        await page.screenshot({ path: info.outputPath(`armenians197-bonus${index}-${width}-${theme}.png`), fullPage: true });
      }

      await page.goto('./#/builds?bo=scouts-18&civ=Armenians&view=practice');
      await expect(page.locator('[data-testid="build-practice"]')).toBeVisible();
      await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
      await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
      const current = page.locator('[data-testid="practice-current"]');
      await expect(current).toContainText('建造 1 辆骡车');
      await expect(current).toContainText('60木、15食物');
      await expect(current.locator('.nw').filter({ hasText: /^1\s*辆$/ })).toBeVisible();
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`armenians197-practice-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/builds?bo=scouts-18&civ=Armenians&view=print');
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('[data-testid="practice-checklist"]')).toContainText('建造 1 辆骡车');
      await expect(page.locator('[data-testid="practice-checklist"]')).not.toContainText('建造 1 座骡车');
      await expect(page.locator('[data-testid="build-practice"]')).toContainText('移动和自动复用未模拟');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`armenians197-print-${width}-${theme}.png`), fullPage: true });
      await page.emulateMedia({ media: 'screen' });
      expect(errors).toEqual([]);
    });

test('#197 亚美尼亚可选和刷新保留，格鲁吉亚仍为明确未支持样本', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&civ=Armenians&step=3');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按亚美尼亚计');
  await page.reload();
  await expect(page.locator('[data-step="2"] .n')).toContainText('60木、15食物');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Armenians"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Georgians"]')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await page.goto('./#/builds?bo=scouts-18&civ=Georgians');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('链接里的格鲁吉亚加成尚未计入，已按通用计算');
});
