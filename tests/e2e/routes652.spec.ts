import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('路线衔接公开存量与追加预算，不替代城堡快照', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^边路/ }).click();
  await expect(page.getByTestId('scene-Britons').getByText('城堡时代 · 弩手', { exact: true })).toBeVisible();
  await page.getByTestId('scene-Britons').getByText('为什么', { exact: true }).click();
  await expect(page.getByTestId('scene-Britons').locator('p').filter({ hasText: '预算可负担' })).toBeVisible();
  await expect(page.getByText('封建到城堡：路线衔接', { exact: true })).toBeVisible();
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  await expect(page.getByTestId('route-ledger-Britons')).toContainText('存量升级');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['dark', 'light']) {
    test(`路线 ${width} ${theme} 两阶段账本与布局`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await page.goto('./#/');
      await page.getByRole('button', { name: /组队随机地图/ }).click();
      await page.getByRole('button', { name: '4v4', exact: true }).click();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await page.getByRole('button', { name: /^边路/ }).click();
      await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
      const section = page.getByTestId('route-continuity'),
        row = page.getByTestId('route-ledger-Britons');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(row).toContainText('存量不重新购买');
      await page.getByLabel('城堡追加额度（工秒）', { exact: true }).selectOption('0');
      await expect(row).toContainText('没有完成弩手升级');
      await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('0');
      await expect(row).toContainText('科技包未完成');
      await page.getByLabel('城堡新增上限', { exact: true }).selectOption('0');
      await expect(row).toContainText('0 弩手');
      await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('2000');
      await page.getByLabel('城堡追加额度（工秒）', { exact: true }).selectOption('3000');
      await page.getByLabel('城堡新增上限', { exact: true }).selectOption('6');
      await row.getByText('查看两阶段账本', { exact: true }).click();
      await expect(section).toContainText('封建余额不结转');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await section
        .locator('.start-scene-controls')
        .screenshot({ path: info.outputPath(`controls-${width}-${theme}.png`), style: 'header.topbar { visibility: hidden !important; }' });
      await row.screenshot({ path: info.outputPath(`route-${width}-${theme}.png`), style: 'header.topbar { visibility: hidden !important; }' });
      if (width === 360)
        expect((await new AxeBuilder({ page }).include('[data-testid="route-continuity"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

test('中路保留侦骑与骑士新产分开，畜牧和零新增可解释', async ({ page }, info) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^中路/ }).click();
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  const row = page.getByTestId('route-ledger-Huns');
  await expect(row).toContainText('侦骑不会升级成骑士');
  await expect(row).toContainText('已计入本次付费畜牧');
  await page.getByLabel('路线畜牧', { exact: true }).selectOption('false');
  await expect(row).toContainText('未额外计入畜牧');
  await page.getByLabel('路线畜牧', { exact: true }).selectOption('true');
  await page.getByLabel('城堡新增上限', { exact: true }).selectOption('0');
  await expect(row).toContainText('0 骑士');
  await expect(row).toContainText('未额外计入畜牧');
  await page.getByLabel('城堡新增上限', { exact: true }).selectOption('6');
  await row.screenshot({ path: info.outputPath('pocket-route.png'), style: 'header.topbar { visibility: hidden !important; }' });
});
