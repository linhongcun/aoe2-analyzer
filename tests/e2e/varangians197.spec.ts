import { expect, test } from '@playwright/test';

const note = '牧羊、狩猎和捕鱼兼产黄金按连续收入估算';
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 瓦兰吉人：四宽双主题 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Varangians');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按瓦兰吉人计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toHaveText(note);
      await page.screenshot({ path: info.outputPath(`varangians-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('有效食物收入');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('不模拟客户端逐笔到账');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await page.locator('[data-step="0"]').locator('button').first().click();
      await expect(page.locator('[data-t="step-cost"]')).toContainText('木头 50');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按瓦兰吉人计');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Varangians');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('瓦兰吉人');
      await page.screenshot({ path: info.outputPath(`varangians-share-${width}-${theme}.png`), fullPage: true });
      if (width === 360 && theme === 'light') {
        const download = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await download).saveAs(info.outputPath('varangians-download.png'));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#197 瓦兰吉人可选、刷新与深链保留，波兰仍置灰', async ({ page }) => {
  await page.goto('./#/builds?bo=archers-19');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Varangians"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Varangians"]').click();
  await expect(page).toHaveURL(/[?&]civ=Varangians/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按瓦兰吉人计');
  await page.goto('./#/builds?bo=archers-19&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的波兰加成尚未计入，已按通用计算。');
});

test('#197 瓦兰吉人跟练和打印保留兼产估算，真实成本仍按原农田口径', async ({ page }) => {
  for (const view of ['practice', 'print']) {
    await page.goto(`./#/builds?bo=archers-19&civ=Varangians&view=${view}`);
    if (view === 'print') await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bp-context').getByText(note, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '开局来源与估算限制', exact: true })).toContainText('牧羊、狩猎和捕鱼兼产黄金按有效食物收入的比例连续计入');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ media: 'screen' });
  // 独立真实成本按农田主率，不扩展为牧羊/狩猎/捕鱼模型。
  await page.goto('./#/duel?a=74.Varangians.3.f.&b=74.Magyars.3.f.&m=t');
  await expect(page.locator('[data-t="rc-a"]')).toBeVisible();
  await expect(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveCount(0);
});
