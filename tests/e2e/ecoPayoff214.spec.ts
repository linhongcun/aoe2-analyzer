import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#214 ${theme} @${width} 科研收益、分享、边界与布局`, async ({ page, context }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await page.goto('./#/eco-payoff');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('eco-balance')).toContainText('从现在起约');
      await page.getByRole('textbox', { name: '木材村民数', exact: true }).fill('17');
      await page.getByRole('textbox', { name: '观察时长', exact: true }).fill('8.5');
      await page.getByRole('checkbox', { name: '已有独轮推车', exact: true }).check();
      const gain = await page.getByTestId('eco-gain-Wood').textContent();
      await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('方案链接已复制');
      const link = await page.evaluate(() => navigator.clipboard.readText());
      expect(link).toContain('/eco-payoff?');
      await page.goto(link);
      await expect(page.getByRole('textbox', { name: '木材村民数', exact: true })).toHaveValue('17');
      await expect(page.getByRole('checkbox', { name: '已有独轮推车', exact: true })).toBeChecked();
      await expect(page.getByTestId('eco-gain-Wood')).toHaveText(gain!);
      await page.reload();
      await expect(page.getByTestId('eco-gain-Wood')).toHaveText(gain!);
      await page.screenshot({ path: info.outputPath(`eco-payoff214-${theme}-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('textbox', { name: '观察时长', exact: true }).fill('0.1');
      await expect(page.getByTestId('eco-gain-Wood')).toHaveText('0');
      await page.getByRole('textbox', { name: '木材村民数', exact: true }).fill('0');
      await expect(page.getByTestId('eco-balance')).toContainText('无有限平衡时间');
      await page.getByRole('textbox', { name: '木材村民数', exact: true }).fill('-1');
      await expect(page.getByRole('alert')).toContainText('村民数须为');
      await expect(page.getByTestId('eco-balance')).toHaveCount(0);
      await page.goto('./#/eco-payoff?target=no&age=2&age=3');
      await expect(page.getByRole('alert')).toContainText('链接参数');
      await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
      await expect(page.getByRole('textbox', { name: '木材村民数', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '重置方案', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Infinity');
      expect(errors).toEqual([]);
    });

for (const query of ['target=no', 'age=no', 'known=bad', 'age=2&age=3'])
  test(`#214 非法链接 ${query} 不会因无关编辑回落成默认方案`, async ({ page }) => {
    await page.goto('./#/eco-payoff?' + query);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '木材村民数', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: '待研究科技', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
    await expect(page.getByTestId('eco-balance')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(query.replace(/[?&]/g, '\\$&') + '$'));
    await page.getByRole('button', { name: '重置方案', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('eco-balance')).toContainText('从现在起约');
    await expect(page.getByRole('textbox', { name: '木材村民数', exact: true })).toBeEnabled();
  });

test('#214 前置、文明修正、免费与不完整机制状态', async ({ page }) => {
  await page.goto('./#/eco-payoff?age=3&target=203');
  await expect(page.getByRole('alert')).toContainText('缺少前置：双刃斧');
  await page.getByRole('checkbox', { name: '已有双刃斧', exact: true }).check();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('eco-balance')).toContainText('从现在起约');
  await page.getByRole('checkbox', { name: '已有弓锯', exact: true }).check();
  await expect(page.getByTestId('eco-already')).toBeVisible();
  await expect(page.getByTestId('eco-gain-Wood')).toHaveText('0');
  await page.goto('./#/eco-payoff?civ=Vietnamese&target=202&age=2');
  await expect(page.getByTestId('eco-cost-Wood')).toHaveText('0');
  await expect(page.getByTestId('eco-cost-Food')).not.toHaveText('0');
  await expect(page.getByTestId('eco-research-time')).toHaveText('12.5 秒');
  await page.goto('./#/eco-payoff?civ=Burmese&target=202&age=2');
  await expect(page.getByTestId('eco-already')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '已有双刃斧', exact: true })).toBeDisabled();
  await page.goto('./#/eco-payoff?civ=Wei&target=202&age=2');
  await expect(page.getByTestId('eco-incomplete')).toBeVisible();
  await expect(page.getByTestId('eco-balance')).toContainText('暂不提供');
  await expect(page.locator('body')).toContainText('赠送村民未计入');
  await page.goto('./#/eco-payoff?civ=Franks&target=221&age=4');
  await expect(page.getByRole('alert')).toContainText('不可用');
});

test('#214 生产页与科技详情入口，前后导航保持URL', async ({ page }) => {
  await page.goto('./#/production');
  await page.getByRole('link', { name: /经济科技收益：/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: '经济科技收益' })).toBeVisible();
  await page.goto('./#/tech/203');
  await page.getByRole('link', { name: '查看经济科技收益与研究投入', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '待研究科技', exact: true })).toHaveValue('203');
  await page.getByRole('checkbox', { name: '已有双刃斧', exact: true }).check();
  const url = page.url();
  await page.getByRole('link', { name: '持续生产工具', exact: true }).click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('checkbox', { name: '已有双刃斧', exact: true })).toBeChecked();
  await expect(page.locator('nav.crumbs')).toContainText('经济科技收益');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill('jingjikejishouyi');
  await expect(page.locator('.cmdk-list li').first()).toContainText('经济科技收益');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('eco-payoff-page')).toBeVisible();
});
