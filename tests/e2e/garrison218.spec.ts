import { expect, test, type Page } from '@playwright/test';

const messages = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const url = (building = 109, params = '') => `/#/building/${building}?tab=garrison&civ=Franks&age=4&${params}`;
const panel = (page: Page) => page.getByTestId('garrison-preview');
const total = (page: Page) => page.getByTestId('garrison-total');

test('#218 TC空驻军、第一箭与上限分别展示', async ({ page }) => {
  await page.goto(url());
  await expect(total(page)).toHaveText('0');
  await expect(panel(page)).toContainText('空驻军时不会开火');
  await page.getByRole('spinbutton', { name: '驻军人数' }).fill('1');
  await expect(total(page)).toHaveText('1');
  await expect(panel(page)).toContainText('再驻 1 个村民');
  await page.getByRole('spinbutton', { name: '驻军人数' }).fill('15');
  await expect(total(page)).toHaveText('10');
  await expect(panel(page)).toContainText('已达箭矢上限');
});

test('#218 箭塔可独立开火，人数阈值表不等于容量', async ({ page }) => {
  await page.goto(url(79));
  await expect(total(page)).toHaveText('1');
  await page.getByRole('spinbutton', { name: '驻军人数' }).fill('4');
  await expect(total(page)).toHaveText('5');
  await page.getByText('查看人数阈值表').click();
  await expect(panel(page).getByRole('table')).toContainText('0 人');
  await expect(panel(page).getByRole('table')).toContainText('5 人');
});

test('#218 防御箭塔存在容量内无法再加箭的状态', async ({ page }) => {
  await page.goto(url(234, 'garrison=5'));
  await expect(total(page)).toHaveText('4');
  await expect(panel(page)).toContainText('当前容量内无法再增加箭矢');
  await expect(panel(page)).toContainText('容量内无法达到');
});

test('#218 科技前置联动与当前版本村民贡献修正', async ({ page }) => {
  await page.goto('/#/building/109?tab=garrison&civ=Britons&age=4&garrison=5');
  const bracer = page.getByRole('checkbox', { name: '护腕', exact: true });
  await bracer.check();
  await expect(page.getByRole('checkbox', { name: '箭羽', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '锥子箭', exact: true })).toBeChecked();
  await expect(total(page)).toHaveText('5');
  await page.getByRole('checkbox', { name: '箭羽', exact: true }).uncheck();
  await expect(bracer).not.toBeChecked();
});

test('#218 条顿修正容量和箭矢上限', async ({ page }) => {
  await page.goto('/#/building/109?tab=garrison&civ=Teutons&age=4&garrison=25');
  await expect(total(page)).toHaveText('15');
  await expect(panel(page)).toContainText('25 人');
  await expect(panel(page)).toContainText('15 箭');
});

test('#218 日本UT常驻箭数与村民副箭分开', async ({ page }) => {
  await page.goto('/#/building/79?tab=garrison&civ=Japanese&age=3&gtechs=484&garrison=0');
  await expect(page.getByTestId('garrison-base')).toHaveText('3');
  await expect(page.getByTestId('garrison-extra')).toHaveText('0');
  await expect(total(page)).toHaveText('3');
});

test('#218 土耳其免费化学自动勾选且不可取消', async ({ page }) => {
  await page.goto('/#/building/109?tab=garrison&civ=Turks&age=4');
  const chemistry = page.getByRole('checkbox', { name: '化学（免费）' });
  await expect(chemistry).toBeChecked();
  await expect(chemistry).toBeDisabled();
});

test('#218 从建筑模拟器带入文明、时代和相关科技', async ({ page }) => {
  await page.goto('/#/building/79?tab=sim&civ=Britons&age=3&techs=199,200');
  await page.getByRole('link', { name: '查看村民驻军箭数与人数阈值' }).click();
  await expect(page.getByRole('checkbox', { name: '箭羽', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '锥子箭', exact: true })).toBeChecked();
  await expect(page.getByRole('combobox', { name: '驻军时代' })).toHaveValue('3');
});

test('#218 分享复制拒绝提供可还原的手动链接', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
      configurable: true,
    }),
  );
  await page.goto('/#/building/79?tab=garrison&civ=Japanese&age=3&gtechs=199,200,484&garrison=4');
  await expect(total(page)).toHaveText('7');
  await page.getByRole('button', { name: '复制驻军方案', exact: true }).click();
  const link = page.getByRole('textbox', { name: '驻军方案链接' });
  await expect(link).toBeVisible();
  const shared = await link.inputValue();
  await page.goto(shared);
  await expect(total(page)).toHaveText('7');
  await expect(page.getByRole('spinbutton', { name: '驻军人数' })).toHaveValue('4');
});

for (const query of ['gtechs=999999', 'gtechs=199,,200', 'gtechs=' + '9'.repeat(400), 'garrison=16', 'garrison=0&garrison=5', 'civ=Unknown'])
  test(`#218 非法链接不输出假结果 ${query.slice(0, 35)}`, async ({ page }) => {
    await page.goto(query.startsWith('civ=') ? `/#/building/109?tab=garrison&${query}` : url(109, query));
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('garrison-result')).toHaveCount(0);
    await page.getByRole('button', { name: '重置驻军方案' }).click();
    await expect(page.getByTestId('garrison-result')).toBeVisible();
  });

test('#218 建筑详情有独立入口，范围外建筑没有驻军计算入口', async ({ page }) => {
  await page.goto('/#/building/109');
  await page.getByRole('tab', { name: '村民驻军', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.goto('/#/building/82');
  await expect(page.getByRole('tab', { name: '村民驻军', exact: true })).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#218 ${theme} @${width} 驻军预览布局与键盘`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('/#/building/79?tab=garrison&civ=Japanese&age=4&gtechs=199,200,201,47,484,608&garrison=4');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(total(page)).toBeVisible();
      const count = page.getByRole('spinbutton', { name: '驻军人数' });
      await count.focus();
      await count.press('ArrowUp');
      await expect(count).toHaveValue('5');
      await page.getByText('查看人数阈值表').click();
      for (const target of await panel(page).getByRole('button').all()) {
        if (await target.isVisible()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`garrison218-${theme}-${width}.png`), fullPage: true });
    });
