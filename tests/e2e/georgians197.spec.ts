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
    test(`#197 格鲁吉亚起始免费车、显式付费车与公开口径 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);

      await page.goto('./#/builds?bo=scouts-18&civ=Georgians&step=1');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按格鲁吉亚计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toContainText('开局已有1辆免费骡车，不占人口');
      await expect(page.locator('[data-t="civ-note"]')).toContainText('原营地动作仍逐次新增付费骡车');
      const first = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(first).toContainText(/食物\s+200/);
      await expect(first).toContainText(/木头\s+200/);
      await expect(first).toContainText(/黄金\s+100/);
      await expect(first).toContainText(/石头\s+200/);
      await expect(first).toContainText(/人口\s+4\/5/);
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`georgians197-start-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/builds?bo=scouts-18&civ=Georgians&step=3');
      const detail = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(detail.getByRole('link', { name: '骡车', exact: true })).toHaveAttribute('href', '#/building/1808');
      await expect(page.locator('[data-step="2"] .n')).toContainText('80木、20食物');
      await expect(page.locator('[data-step="2"] .n')).not.toContainText('伐木场');
      await expect(detail.locator('[data-t="step-cost"]')).toContainText('食物 20');
      await expect(detail.locator('[data-t="step-cost"]')).toContainText('木头 80');
      await expect(page.locator('[data-t="civ-note"]')).toContainText('移动和自动复用未模拟');
      await page.reload();
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按格鲁吉亚计');
      await expect(page.locator('[data-step="2"] .n')).toContainText('80木、20食物');
      const mobilePicker = !(await page.locator('#tlciv').isVisible());
      const settings = page.getByRole('dialog', { name: '设置', exact: true });
      if (mobilePicker) {
        await page.getByRole('button', { name: /^设置/ }).click();
        await settings.locator('#tlciv').click();
      } else await page.locator('#tlciv').click();
      const picker = page.getByRole('dialog', { name: '文明', exact: true });
      await expect(picker.locator('[data-civ="Georgians"]')).not.toHaveAttribute('aria-disabled', 'true');
      await expect(picker.locator('[data-civ="Poles"]')).not.toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      if (mobilePicker && (await settings.isVisible())) await settings.getByRole('button', { name: '完成', exact: true }).click();
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      if (width === 360 && theme === 'light')
        expect(
          (await new AxeBuilder({ page }).include('[data-t="civ-note"]').include('.tl-detail').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        ).toEqual([]);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`georgians197-cart-${width}-${theme}.png`), fullPage: true });

      await page.getByRole('button', { name: '估算', exact: true }).click();
      const assumptions = page.getByRole('dialog', { name: '估算说明' });
      await expect(assumptions).toContainText('起始免费骡车已作为完成实体和一种时代前置');
      await expect(assumptions).toContainText('每个原营地建造动作仍新增一辆付费骡车');
      await expect(assumptions).toContainText('未经当前客户端实测');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按格鲁吉亚计');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('开局已有1辆免费骡车，不占人口');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('每辆80木、20食物');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('移动和自动复用未模拟');
      await expect(page.locator('[data-t="card-basis"]')).not.toContainText('科技增强');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Georgians');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`georgians197-share-${width}-${theme}.png`), fullPage: true });
      if (width === 1280 && theme === 'light') {
        const downloaded = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await downloaded).saveAs(info.outputPath('georgians197-share-download.png'));
      }
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();

      await page.goto('./#/builds?bo=archers-19&civ=Georgians&step=9');
      const compound = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(compound.getByRole('link', { name: '骡车', exact: true })).toHaveAttribute('href', '#/building/1808');
      await expect(compound.getByRole('link', { name: '双刃斧', exact: true })).toHaveAttribute('href', '#/tech/202');
      await expect(page.locator('[data-step="8"] .n')).toContainText('80木、20食物');
      // The primary action is a House; its cost remains independent of the paid cart in this block.
      await expect(compound.locator('[data-t="step-cost"]')).toContainText('木头 25');
      await expect(page.locator('[data-t="civ-note"]')).toContainText('免费骡车');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`georgians197-compound-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/civ/Georgians/bonus/0');
      const usage = page.locator('#bonus .bonusbody [data-usage="sim"]');
      await expect(usage).toHaveAttribute('data-on', 'true');
      await expect(usage).toContainText('免费骡车');
      await expect(usage).toContainText('付费');
      await expect(usage).toContainText('移动');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`georgians197-bonus0-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/builds?bo=scouts-18&civ=Georgians&view=practice');
      const practice = page.locator('[data-testid="build-practice"]');
      await expect(practice).toContainText('开局已有1辆免费骡车，不占人口');
      await expect(practice).toContainText('原营地动作仍逐次新增付费骡车');
      await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
      await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
      const current = page.locator('[data-testid="practice-current"]');
      await expect(current).toContainText('建造 1 辆骡车');
      await expect(current).toContainText('80木、20食物');
      await expect(
        current
          .locator('.nw')
          .filter({ hasText: /^1\s*辆$/ })
          .first(),
      ).toBeVisible();
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`georgians197-practice-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/builds?bo=scouts-18&civ=Georgians&view=print');
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('[data-testid="practice-checklist"]')).toContainText('建造 1 辆骡车');
      await expect(page.locator('[data-testid="practice-checklist"]')).not.toContainText('建造 1 座骡车');
      await expect(practice).toContainText('开局已有1辆免费骡车，不占人口');
      await expect(practice).toContainText('原营地动作仍逐次新增付费骡车');
      await expect(practice).toContainText('移动和自动复用未模拟');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`georgians197-print-${width}-${theme}.png`), fullPage: true });
      await page.emulateMedia({ media: 'screen' });

      await page.goto('./#/builds?bo=scouts-18&civ=Poles');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按波兰计');
      await expect(page.locator('[data-t="civ-note"]')).toContainText('农田即时收获未计入');
      await expect(page.locator('[data-t="share-card-btn"]:visible').first()).not.toHaveAttribute('aria-disabled', 'true');
      await overflow(page);
      expect(await nowrap(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
