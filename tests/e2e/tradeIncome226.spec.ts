import { expect, test } from '@playwright/test';
const encodeTradeIncome = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    v: '1',
    civ: 'Franks',
    age: '4',
    unit: '128',
    gold: '100',
    cycle: '120',
    count: '10',
    mode: 'manual',
    target: '600',
    source: '',
    price: 'baseline',
    food: '0',
    wood: '0',
    priceGold: '0',
    stone: '0',
    priceSource: '',
    ...overrides,
  }).toString();

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#226 ${theme} @${width} 实测供需、手填投资、分享与布局`, async ({ page, context }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await page.goto('./#/trade-income');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('trade-total')).toHaveText('500 金／分钟');
      await page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true }).fill('601');
      await expect(page.getByTestId('trade-needed')).toHaveText('目标所需 13 个');
      await page.getByRole('textbox', { name: '每次实际交金量', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true })).toBeFocused();
      await page.getByRole('combobox', { name: '贸易单价来源', exact: true }).selectOption('manual');
      await page.getByRole('textbox', { name: '实际单价来源', exact: true }).fill('本局生产面板，已研究降价科技');
      await page.getByRole('textbox', { name: '木材单价', exact: true }).fill('75.5');
      await page.getByRole('textbox', { name: '黄金单价', exact: true }).fill('0');
      await expect(page.getByTestId('trade-investment-Wood')).toHaveText('755');
      await expect(page.getByTestId('trade-cost-Gold')).toHaveText('0');
      await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('方案链接已复制');
      const link = await page.evaluate(() => navigator.clipboard.readText());
      await page.goto(link);
      await page.reload();
      await expect(page.getByRole('textbox', { name: '木材单价', exact: true })).toHaveValue('75.5');
      await expect(page.getByRole('textbox', { name: '实际单价来源', exact: true })).toHaveValue('本局生产面板，已研究降价科技');
      await expect(page.getByTestId('trade-needed')).toHaveText('目标所需 13 个');
      const sizes = await page
        .getByTestId('trade-income-page')
        .locator('button, input, select, summary')
        .evaluateAll((els) =>
          els.map((el) => ({
            tag: el.tagName,
            height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width,
          })),
        );
      expect(
        sizes.every((s) => s.height >= 44 && s.width >= 44),
        JSON.stringify(sizes),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`trade-income226-${theme}-${width}.png`), fullPage: true });
      await page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true }).fill('0');
      await expect(page.getByRole('alert')).toContainText('完整周期须为大于 0');
      await expect(page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
      await page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true }).fill('120');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('textbox', { name: '每次实际交金量', exact: true }).fill('0');
      await expect(page.getByTestId('trade-needed')).toContainText('正目标无解');
      await page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true }).fill('0');
      await expect(page.getByTestId('trade-needed')).toHaveText('目标所需 0 个');
      expect(errors).toEqual([]);
    });

test('#226 车船时代合法性、价格基线与不重复加成', async ({ page }) => {
  await page.goto('./#/trade-income');
  await page.getByRole('combobox', { name: '贸易单位', exact: true }).selectOption('17');
  await page.getByRole('combobox', { name: '贸易文明', exact: true }).selectOption('Italians');
  await expect(page.getByTestId('trade-single')).toHaveText('50 金／分钟');
  await expect(page.locator('body')).toContainText('未计降价科技或盟友造价折扣');
  await page.getByRole('combobox', { name: '贸易时代', exact: true }).selectOption('1');
  await expect(page.getByRole('alert')).toContainText('不能训练所选贸易单位');
  await expect(page.getByTestId('trade-total')).toHaveCount(0);
  await page.getByRole('combobox', { name: '贸易时代', exact: true }).selectOption('4');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('#226 生产原方案带入并重算目标；坏来源必须显式切手动', async ({ page }) => {
  const source = new URLSearchParams({ civ: 'Franks', age: '3', walk: '3', farm: '1', techs: '', rows: '38:101:2' }).toString();
  const config = { civ: 'Franks', age: '3', mode: 'production', source };
  await page.goto('./#/trade-income?' + encodeTradeIncome(config));
  await expect(page.getByTestId('trade-target')).not.toHaveText('600 金／分钟');
  await expect(page.getByRole('link', { name: '查看原生产方案', exact: true })).toHaveAttribute('href', '#/production?' + source);
  await expect(page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true })).toHaveCount(0);
  await page.goto('./#/trade-income?' + encodeTradeIncome({ ...config, source: 'broken' }));
  await expect(page.getByRole('alert')).toContainText('原生产方案');
  await page.getByRole('textbox', { name: '当前车船数量', exact: true }).fill('20');
  await expect(page.getByRole('alert')).toContainText('原生产方案');
  await expect(page.getByTestId('trade-total')).toHaveCount(0);
  await page.getByRole('button', { name: '显式切换手动目标', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true })).toBeEnabled();
});

for (const mutation of ['duplicate', 'unknown', 'missing', 'numeric'])
  test(`#226 外层 ${mutation} 坏链接锁定，不能用手动目标洗白`, async ({ page }) => {
    const query = encodeTradeIncome({ mode: 'production', source: 'broken' });
    const broken =
      mutation === 'duplicate'
        ? query + '&age=2'
        : mutation === 'unknown'
          ? query + '&mystery=1'
          : mutation === 'missing'
            ? query.replace('v=1&', '')
            : query.replace('cycle=120', 'cycle=0');
    await page.goto('./#/trade-income?' + broken);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '当前车船数量', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '显式切换手动目标', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '重置方案', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('trade-total')).toHaveText('500 金／分钟');
  });

test('#226 复制失败可手动选择完整链接', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true }),
  );
  await page.goto('./#/trade-income?' + encodeTradeIncome());
  await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('手动复制');
  const link = page.getByRole('textbox', { name: '方案链接', exact: true });
  await expect(link).toHaveAttribute('readonly', '');
  await link.focus();
  expect(await link.inputValue()).toContain('/trade-income?v=1');
  expect(await link.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe((await link.inputValue()).length);
});

test('#226 极端有限结果在360宽仍可读，手填价格保留时提醒复核', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/trade-income?' + encodeTradeIncome({ gold: '1000000', cycle: '0.00000001', count: '1' }));
  await expect(page.getByTestId('trade-total')).toHaveText('6E15 金／分钟');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: '贸易单价来源', exact: true }).selectOption('manual');
  await page.getByRole('textbox', { name: '实际单价来源', exact: true }).fill('旧对象实测');
  await page.getByRole('textbox', { name: '黄金单价', exact: true }).fill('22');
  await page.getByRole('combobox', { name: '贸易单位', exact: true }).selectOption('17');
  await page.getByRole('combobox', { name: '贸易文明', exact: true }).selectOption('Portuguese');
  await expect(page.getByRole('textbox', { name: '黄金单价', exact: true })).toHaveValue('22');
  await expect(page.locator('body')).toContainText('手填价不随文明、时代或单位选择自动变化');
});
