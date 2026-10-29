import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import type { BuildOrder } from '../../src/domain/buildOrder';

const pins = JSON.parse(readFileSync(new URL('../../scripts/data_sources.json', import.meta.url), 'utf8')) as { patch: { build: number } };
const orders = readdirSync(new URL('../../src/data/build-orders/', import.meta.url))
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(`../../src/data/build-orders/${file}`, import.meta.url), 'utf8')) as BuildOrder);

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#216 跟练与完整清单 ${theme} ${width}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=maa-archers-18&civ=Huns&dist=7&house=0&step=9&view=practice');
      await expect(page.getByTestId('build-practice')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const progress = page.getByTestId('practice-progress');
      const current = page.getByTestId('practice-current');
      await expect(progress).toContainText('当前第 1 / 12 步');
      await expect(page.getByRole('button', { name: '上一步', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '重新开始', exact: true })).toBeDisabled();
      await expect(current).toContainText('匈奴不需要');
      await expect(page.getByTestId('practice-parameters')).toContainText('走路距离 7 格');
      const zone = page.getByRole('region', { name: '手动跟练区域', exact: true });
      await zone.focus();
      await page.keyboard.press('ArrowRight');
      await expect(progress).toContainText('当前第 2 / 12 步');
      await page.keyboard.press('ArrowLeft');
      await expect(progress).toContainText('当前第 1 / 12 步');
      for (let index = 0; index < 7; index++) await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
      await expect(progress).toContainText('当前第 8 / 12 步');
      await expect(current.getByTestId('practice-action')).toHaveCount(4);
      const currentBox = await current.boundingBox();
      expect(currentBox!.y).toBeGreaterThanOrEqual(52);
      expect(currentBox!.y).toBeLessThan(120);
      await expect(current).toContainText('训练 3 个民兵');
      await expect(current).toContainText('升级为武士');
      await expect(page.getByTestId('practice-next')).toContainText('第 9 步');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`practice216-${theme}-${width}.png`), fullPage: true });
      await page.getByRole('link', { name: '查看完整清单', exact: true }).click();
      const checklist = page.getByTestId('practice-checklist');
      await expect(checklist.getByTestId('practice-checklist-step')).toHaveCount(12);
      await expect(checklist.getByTestId('practice-action')).toHaveCount(
        orders.find((order) => order.id === 'maa-archers-18')!.steps.reduce((total, step) => total + step.actions.length, 0),
      );
      await expect(page.getByRole('region', { name: '开局来源与估算限制' })).toContainText('完整估算假设');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`practice216-print-${theme}-${width}.png`), fullPage: true });
      await page.getByRole('link', { name: '返回时间线', exact: true }).click();
      await expect(page.locator('[data-t="timeline"]')).toBeVisible();
      const params = new URLSearchParams(page.url().split('?')[1]);
      expect(params.get('civ')).toBe('Huns');
      expect(params.get('dist')).toBe('7');
      expect(params.get('house')).toBe('0');
      expect(params.get('step')).toBe('9');
      expect(params.has('view')).toBe(false);
      await expect(page.locator('.tl-steps [data-step="8"]')).toHaveAttribute('aria-selected', 'true');
      expect(errors).toEqual([]);
    });
  }

test('#216 手动末步完成、撤回、重置与配置变更归零', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&view=practice&dist=7&house=0');
  await expect(page.getByTestId('build-practice')).toBeVisible({ timeout: 30_000 });
  const progress = page.getByTestId('practice-progress');
  const zone = page.getByRole('region', { name: '手动跟练区域', exact: true });
  await zone.focus();
  await page.keyboard.press('Control+ArrowRight');
  await expect(progress).toContainText('已手动跟完 0 / 13 步');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  await expect(progress).toContainText('已手动跟完 1 / 13 步');
  await page.getByRole('combobox', { name: '跟练开局', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  // 原生下拉按键仍可更改选项，不会被跟练快捷键吞掉。
  await expect(page.getByRole('combobox', { name: '跟练开局', exact: true })).not.toHaveValue('scouts-18');
  await page.getByRole('combobox', { name: '跟练开局', exact: true }).selectOption('scouts-18');
  await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
  await page.getByRole('button', { name: '跟练文明：通用', exact: true }).click();
  const search = page.getByPlaceholder('搜索文明（中/英）');
  await search.fill('Huns');
  await search.press('ArrowRight');
  await expect(progress).toContainText('已手动跟完 1 / 13 步');
  await search.press('Enter');
  await expect(progress).toContainText('已手动跟完 0 / 13 步');
  await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
  await page.getByRole('combobox', { name: '跟练开局', exact: true }).selectOption('archers-19');
  await expect(progress).toContainText('已手动跟完 0 / 11 步');
  for (let index = 0; index < 10; index++) await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
  await expect(page.getByTestId('practice-next')).toContainText('这是最后一步');
  await expect(progress).toContainText('已手动跟完 10 / 11 步');
  await page.getByRole('button', { name: '完成最后一步', exact: true }).click();
  await expect(progress).toContainText('本轮跟练已完成');
  await expect(progress).toContainText('已手动跟完 11 / 11 步');
  await expect(page.getByRole('button', { name: '已跟完全部步骤', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(progress).toContainText('当前第 11 / 11 步');
  await page.getByRole('button', { name: '完成最后一步', exact: true }).click();
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(progress).toContainText('当前第 11 / 11 步');
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await expect(progress).toContainText('当前第 1 / 11 步');
  await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('build-practice')).toBeVisible({ timeout: 30_000 });
  await expect(progress).toContainText('当前第 1 / 11 步');
});

test('#216 全部真实开局完整清单与A4 PDF保留来源/限制', async ({ page }, info) => {
  test.setTimeout(90_000);
  for (const order of orders) {
    await page.goto(`./#/builds?bo=${order.id}&view=print&civ=Poles&dist=7&house=0`);
    await expect(page.getByTestId('build-practice')).toBeVisible({ timeout: 30_000 });
    const rows = page.getByTestId('practice-checklist-step');
    await expect(rows).toHaveCount(order.steps.length);
    for (let index = 0; index < order.steps.length; index++) {
      await expect(rows.nth(index).getByTestId('practice-action')).toHaveCount(order.steps[index]!.actions.length);
      if (order.steps[index]!.siteAdded) await expect(rows.nth(index)).toContainText('本站补充，来源未列');
    }
    await expect(page.getByTestId('practice-civ-warning')).toContainText('加成尚未计入，已按通用计算');
    for (const source of order.sources) await expect(page.locator('.bp-sources')).toContainText(source.url);
    await expect(page.locator('.bp-sources')).toContainText(`DE Update ${pins.patch.build}`);
    await page.pdf({ path: info.outputPath(`practice216-${order.id}-a4.pdf`), format: 'A4', preferCSSPageSize: true, printBackground: true });
  }
  await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.reload();
  await expect(page.getByTestId('build-practice')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('./#/builds?bo=fast-castle-knights&view=practice&civ=Poles&dist=7&house=0');
  await expect(page.getByTestId('build-practice')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('practice-progress')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('practice-progress')).toBeHidden();
  await expect(page.getByTestId('practice-checklist')).toBeVisible();
  await expect(page.getByTestId('practice-checklist-step')).toHaveCount(14);
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.editorial-footer')).toBeHidden();
  expect(await page.getByTestId('build-practice').evaluate((element) => getComputedStyle(element).color)).toBe('rgb(0, 0, 0)');
  expect(await page.getByTestId('build-practice').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  const pdfPath = info.outputPath('practice216-knights-a4.pdf');
  const pdf = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  await info.attach('完整步骤单 A4 PDF', { path: pdfPath, contentType: 'application/pdf' });
  await page.screenshot({ path: info.outputPath('practice216-print-media.png'), fullPage: true });
});

test('#216 开局列表与时间线入口继续可用', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/builds');
  await page.locator('#bo-scouts-18 > summary').click();
  await page.locator('#bo-scouts-18').getByRole('link', { name: '专注跟练', exact: true }).click();
  await expect(page.getByTestId('practice-current')).toBeVisible();
  await page.getByRole('link', { name: '返回时间线', exact: true }).click();
  const steps = page.locator('.tl-step');
  await steps.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(steps.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '步骤详情', exact: true }).getByRole('link', { name: '村民', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '复制链接', exact: true }).first().click();
  await expect(page.locator('[data-t="toast-copied"]')).toBeVisible();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(shared).pathname).toMatch(/\/builds\/scouts-18\/$/);
  expect(new URL(shared).searchParams.get('step')).toBe('2');
  await page.goto(shared);
  await expect(page.locator('.tl-steps [data-step="1"]')).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await page.getByRole('link', { name: '打印步骤单', exact: true }).click();
  await expect(page.getByTestId('practice-checklist-step')).toHaveCount(13);
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = 'yes';
    };
  });
  await page.getByRole('button', { name: '打印 / 保存 PDF', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'yes');
});
