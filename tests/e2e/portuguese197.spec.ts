import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 葡萄牙：四宽双主题 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await page.goto('./#/builds?bo=drush-fc&civ=Portuguese');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按葡萄牙计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toHaveText('采果兼产木材按连续收入估算');
      await page.screenshot({ path: info.outputPath(`portuguese-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('采果兼产木材');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('比例连续流入');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      const militia = page.locator('ol.tl-steps > li').filter({ hasText: '民兵' }).first();
      await militia.locator('button').first().click();
      await expect(page.locator('[data-t="step-cost"]')).toContainText('黄金 16');
      await expect(page.locator('[data-t="step-cost"]')).toContainText('食物 50');
      const share = page.locator('[data-t="share-card-btn"]:visible').first();
      await expect(share).not.toHaveAttribute('aria-disabled', 'true');
      await share.click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按葡萄牙计');
      await expect(page.locator('[data-t="share-card"]')).toContainText('civ=Portuguese');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#197 选择葡萄牙并刷新保留；蜀仍不可选且直链回退通用', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18');
  await page.locator('#tlciv').click();
  const dialog = page.getByRole('dialog', { name: '文明' });
  const portuguese = dialog.locator('[data-civ="Portuguese"]');
  await expect(portuguese).not.toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.locator('[data-civ="Shu"]')).toHaveAttribute('aria-disabled', 'true');
  await portuguese.click();
  await expect(page).toHaveURL(/[?&]civ=Portuguese/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按葡萄牙计');
  await page.goto('./#/builds?bo=scouts-18&civ=Shu');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的蜀加成尚未计入，已按通用计算。');
  await expect(page.locator('[data-t="share-card-btn"]:visible').first()).toHaveAttribute('aria-disabled', 'true');
  await expect(page).toHaveURL(/[?&]civ=Shu/);
});
