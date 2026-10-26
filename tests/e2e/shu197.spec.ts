import { expect, test } from '@playwright/test';

const knightNote = '蜀不能训练骑士；骑士方案仅供通用模板经济估算。';
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 蜀：四宽双主题 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Shu');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按蜀计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toContainText('伐木兼产食物按连续收入估算');
      await expect(page.locator('[data-t="civ-note"]')).toContainText(knightNote);
      await page.screenshot({ path: info.outputPath(`shu-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('伐木有效收入');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      const share = page.locator('[data-t="share-card-btn"]:visible').first();
      await expect(share).not.toHaveAttribute('aria-disabled', 'true');
      await share.click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按蜀计');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Shu');
      await expect(page.locator('[data-t="card-basis"]')).not.toContainText(knightNote);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.goto('./#/builds?bo=fast-castle-knights&civ=Shu');
      await expect(page.locator('[data-t="civ-note"]')).toContainText(knightNote);
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="card-basis"]')).toContainText(knightNote);
      await page.screenshot({ path: info.outputPath(`shu-knight-share-${width}-${theme}.png`), fullPage: true });
      if (width === 360 && theme === 'light') {
        const download = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await download).saveAs(info.outputPath('shu-knight-download.png'));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#197 蜀可选、刷新与深链保留，孟加拉仍置灰', async ({ page }) => {
  await page.goto('./#/builds?bo=archers-19');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明' });
  await expect(picker.locator('[data-civ="Shu"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Bengalis"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Shu"]').click();
  await expect(page).toHaveURL(/[?&]civ=Shu/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按蜀计');
  await page.goto('./#/builds?bo=archers-19&civ=Bengalis');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的孟加拉加成尚未计入，已按通用计算。');
});

test('#197 蜀跟练/打印保留兼产与骑士限制，真实成本仍独立未计入', async ({ page }) => {
  for (const view of ['practice', 'print']) {
    await page.goto(`./#/builds?bo=fast-castle-knights&civ=Shu&view=${view}`);
    if (view === 'print') await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bp-context').getByText(knightNote, { exact: true })).toBeVisible();
    await expect(page.locator('.bp-context').getByText('伐木兼产食物按连续收入估算', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '开局来源与估算限制', exact: true })).toContainText(knightNote);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ media: 'screen' });
  await page.goto('./#/duel?a=74.Shu.3.f.&b=74.Magyars.3.f.&m=t');
  await expect(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：蜀 伐木同时产食物（伐木兼产食物，未建模）');
});
