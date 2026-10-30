import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const production = 'civ=Franks&age=3&walk=4&farm=2&techs=202&rows=38%3A101%3A2%2C83%3A109%3A1';
const meOpp = '&me=Franks&opp=Britons';
test('生产配置有效时带入圣物来源，无效时可新建独立方案 #531', async ({ page }) => {
  await page.goto('./#/production?' + production + meOpp);
  await expect(page.getByTestId('production-total')).toBeVisible();
  await page.getByText('其他相关工具', { exact: true }).click();
  const linked = page.getByRole('link', { name: '另查固定圣物收益', exact: true });
  const target = new URL((await linked.getAttribute('href'))!, page.url());
  const query = new URLSearchParams(target.hash.split('?')[1]);
  expect(query.get('civ')).toBe('Franks');
  expect(query.get('ctxReturn')).toBe('/production?' + production + meOpp);
  expect(query.get('me')).toBe('Franks');
  expect(query.get('opp')).toBe('Britons');
  await page.getByLabel('需求 1 建筑数量', { exact: true }).fill('-1');
  await expect(page.getByRole('alert')).toContainText('建筑数量须为');
  await expect(linked).toHaveCount(0);
  const blank = page.getByRole('link', { name: '新建圣物收益方案', exact: true });
  await expect(blank).toHaveAttribute('href', '#/relic-income');
  await blank.click();
  await expect(page.getByRole('heading', { name: '圣物收益', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeEnabled();
  expect(new URL(page.url()).hash).toBe('#/relic-income');
});

test('生产与收益带入、人数假设及原多行方案能往返 #531', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/production?' + production + meOpp);
  await expect(page.getByTestId('production-page')).toBeVisible();
  const entry = page.getByRole('link', { name: '带着方案核对收益' });
  await expect(entry).toHaveAttribute('href', /ctxReturn=/);
  await entry.click();
  await expect(page.getByRole('heading', { name: '先确认用于估算的村民人数', exact: true })).toBeVisible();
  await expect(page.getByTestId('eco-balance')).toHaveCount(0);
  await page.getByRole('button', { name: '使用原方案的理论供给人数' }).click();
  await expect(page.getByText('正在使用理论供给人数作为假设')).toBeVisible();
  await page.getByLabel('黄金村民数').fill('20');
  await expect(page.getByText('正在使用手动调整的供给假设')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('黄金村民数')).toHaveValue('20');
  const back = page.getByRole('link', { name: '返回原生产方案', exact: true });
  const href = await back.getAttribute('href');
  const fresh = await context.newPage();
  await fresh.goto(new URL(href!, page.url()).href);
  await expect(fresh.getByTestId('production-row')).toHaveCount(2);
  await expect(fresh.getByLabel('需求 1 建筑数量')).toHaveValue('2');
  await expect(fresh.getByLabel('需求 2 建筑数量')).toHaveValue('1');
  await expect(fresh.getByLabel('木金石单程距离', { exact: true })).toHaveValue('4');
  await expect(fresh.getByLabel('农田单程距离', { exact: true })).toHaveValue('2');
  await expect(fresh.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', /me=Franks&opp=Britons/);
  await fresh.getByLabel('生产文明', { exact: true }).selectOption('Mongols');
  await expect(fresh.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', /me=Franks&opp=Britons/);
  expect(errors).toEqual([]);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#531 生产收益情境 ${theme} @${width}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/production?' + production + meOpp);
      await expect(page.getByTestId('production-total')).toBeVisible();
      await page.getByRole('button', { name: '对比少一座生产建筑的需求', exact: true }).click();
      await expect(page.locator('.production-comparison-body')).toContainText('总供给人数差');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const productionViolations = (await new AxeBuilder({ page }).include('.production-next').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(productionViolations).toEqual([]);
      await page.getByRole('link', { name: /带着方案核对收益/ }).click();
      await expect(page.getByRole('heading', { name: '先确认用于估算的村民人数', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '使用原方案的理论供给人数', exact: true }).click();
      await expect(page.getByTestId('eco-balance')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bridgeViolations = (await new AxeBuilder({ page }).include('.eco-production-bridge').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(bridgeViolations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`economy531-${theme}-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });

test('带导航的训练对照仍拒绝其他未知参数 #531', async ({ page }) => {
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks,Britons&ctxReturn=%2Funit%2F38%3Fciv%3DFranks');
  await expect(page.getByTestId('train-compare-page')).toBeVisible();
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&extra=unknown&ctxReturn=%2Funit%2F38%3Fciv%3DFranks');
  await expect(page.getByRole('alert')).toContainText('未知参数');
});

test('主动打开科技假设才改变生产科技，原方案回链仍保持 #531', async ({ page }) => {
  await page.goto('./#/production?' + production + meOpp);
  await page.getByRole('link', { name: /带着方案核对收益/ }).click();
  await page.getByRole('button', { name: '使用原方案的理论供给人数', exact: true }).click();
  await page.getByRole('combobox', { name: '待研究科技', exact: true }).selectOption('55');
  const original = await page.getByRole('link', { name: '返回原生产方案', exact: true }).getAttribute('href');
  await page.getByRole('link', { name: '用这项科技作生产假设', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '金矿开采', exact: true })).toBeChecked();
  await expect(page.getByTestId('production-row')).toHaveCount(2);
  expect(original).toContain('techs=202');
  expect(original).not.toContain('techs=202%2C55');
  const back = page.getByRole('link', { name: '回经济科技收益', exact: true });
  await back.click();
  await expect(page.getByRole('combobox', { name: '待研究科技', exact: true })).toHaveValue('55');
});

test('训练对照修改和复制保留受控导航 #531', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks&ctxReturn=%2Funit%2F38%3Fciv%3DFranks&me=Franks&opp=Britons');
  await expect(page.getByTestId('train-compare-page')).toBeVisible();
  await page.getByRole('combobox', { name: '对照单位', exact: true }).selectOption('283');
  await expect(page).toHaveURL(/ctxReturn=/);
  await page.getByRole('button', { name: '复制对照链接', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('ctxReturn=');
  expect(copied).toContain('me=Franks&opp=Britons');
  await page.goto(copied);
  await expect(page.getByRole('link', { name: '回单位', exact: true })).toHaveAttribute('href', '#/unit/38?civ=Franks');
});

test('重置收益必须重新确认人数并恢复原生产投影 #531', async ({ page }) => {
  await page.goto('./#/production?' + production + meOpp);
  await page.getByRole('link', { name: /带着方案核对收益/ }).click();
  const sourceHref = await page.getByRole('link', { name: '返回原生产方案', exact: true }).getAttribute('href');
  await page.getByRole('button', { name: '使用原方案的理论供给人数', exact: true }).click();
  await expect(page.getByTestId('eco-balance')).toBeVisible();
  await page.getByRole('button', { name: '重置方案', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先确认用于估算的村民人数', exact: true })).toBeVisible();
  await expect(page.getByTestId('eco-balance')).toHaveCount(0);
  await expect(page.getByText('正在使用理论供给人数作为假设')).toHaveCount(0);
  await expect(page.getByLabel('收益文明', { exact: true })).toHaveValue('Franks');
  await expect(page.getByLabel('收益时代', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('收益单程距离', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('木材村民数', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('link', { name: '返回原生产方案', exact: true })).toHaveAttribute('href', sourceHref!);
  await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
});

test('无生产来源的新入口重置重新确认，旧直达重置维持原行为 #531', async ({ page }) => {
  await page.goto('./#/eco-payoff?civ=Mongols&age=3&target=55&ctxPeople=none');
  await page.getByRole('button', { name: '我来填写实际人数', exact: true }).click();
  await page.getByLabel('黄金村民数', { exact: true }).fill('20');
  await page.getByRole('button', { name: '重置方案', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先确认用于估算的村民人数', exact: true })).toBeVisible();
  await expect(page.getByTestId('eco-balance')).toHaveCount(0);
  await page.goto('./#/eco-payoff?civ=Mongols&age=3&target=55');
  await page.getByRole('button', { name: '重置方案', exact: true }).click();
  await expect(page.getByTestId('eco-balance')).toBeVisible();
  await expect(page.getByLabel('木材村民数', { exact: true })).toHaveValue('10');
  await expect(page).not.toHaveURL(/ctxPeople/);
});

test('修改收益条件明确标明与原生产来源的差别 #531', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/production?' + production + meOpp);
  await page.getByRole('link', { name: /带着方案核对收益/ }).click();
  await page.getByRole('button', { name: '使用原方案的理论供给人数', exact: true }).click();
  await page.getByLabel('收益文明', { exact: true }).selectOption('Mongols');
  await page.getByLabel('收益时代', { exact: true }).selectOption('4');
  await page.getByLabel('收益单程距离', { exact: true }).fill('7');
  await expect(page.locator('.eco-carry-list')).toContainText('当前文明：蒙古（来源法兰克）');
  await expect(page.locator('.eco-carry-list')).toContainText('当前时代：帝王时代（来源城堡时代）');
  await expect(page.locator('.eco-carry-list')).toContainText('当前木金石距离：7 格（来源4 格）');
  await expect(page.locator('.eco-production-bridge')).toContainText('原理论人数只作为人数假设');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
