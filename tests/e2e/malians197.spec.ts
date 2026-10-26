import { expect, test } from '@playwright/test';

const note = '采金交仓额外黄金按连续收入估算';
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 马里：四宽双主题 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Malians');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按马里计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toHaveText(note);
      await page.screenshot({ path: info.outputPath(`malians-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('有效采金收入');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('不模拟客户端逐次交仓');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await page.locator('[data-step="0"]').locator('button').first().click();
      await expect(page.locator('[data-t="step-cost"]')).toContainText('木头 42');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按马里计');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Malians');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('马里');
      await page.screenshot({ path: info.outputPath(`malians-share-${width}-${theme}.png`), fullPage: true });
      if (width === 360 && theme === 'light') {
        const download = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await download).saveAs(info.outputPath('malians-download.png'));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#197 马里可选、刷新与深链保留，孟加拉仍置灰', async ({ page }) => {
  await page.goto('./#/builds?bo=archers-19');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Malians"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Bengalis"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Malians"]').click();
  await expect(page).toHaveURL(/[?&]civ=Malians/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按马里计');
  await page.goto('./#/builds?bo=archers-19&civ=Bengalis');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的孟加拉加成尚未计入，已按通用计算。');
});

test('#197 马里跟练和打印保留交仓估算，真实成本仍独立未计入', async ({ page }) => {
  for (const view of ['practice', 'print']) {
    await page.goto(`./#/builds?bo=archers-19&civ=Malians&view=${view}`);
    if (view === 'print') await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bp-context').getByText(note, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '开局来源与估算限制', exact: true })).toContainText('采金交仓额外黄金按有效采金收入的百分比连续计入');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ media: 'screen' });
  await page.goto('./#/duel?a=74.Malians.3.f.&b=74.Magyars.3.f.&m=t');
  await expect(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：马里 采金加成（存放黄金加成，未建模）');
});
