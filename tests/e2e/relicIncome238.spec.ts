import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const encoded = (extra: Record<string, string> = {}) =>
  new URLSearchParams({
    v: '1',
    civ: 'Franks',
    count: '1',
    minutes: '10',
    target: '0',
    a1: '',
    a2: '',
    a3: '',
    gtr: '0',
    atheism: 'none',
    ...extra,
  }).toString();
const url = (extra: Record<string, string> = {}) => './#/relic-income?' + encoded(extra);

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#238 ${theme} @${width} 原始数据估算、团队去重、研究分享与零语义`, async ({ page, context }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/relic-income');
      await expect(page.getByTestId('relic-income-page')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('30 金／游戏分钟');
      await expect(page.getByTestId('relic-total-Gold')).toHaveText('300 金');
      await expect(page.getByTestId('relic-warnings')).toContainText('方案假设');
      await page.getByRole('textbox', { name: '已生效圣物数量', exact: true }).fill('2');
      await page.getByRole('textbox', { name: '已生效圣物数量', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('textbox', { name: '持续游戏分钟', exact: true })).toBeFocused();
      await page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true }).fill('100');
      await page.getByRole('combobox', { name: '队友1文明', exact: true }).selectOption('Aztecs');
      await page.getByRole('combobox', { name: '队友2文明', exact: true }).selectOption('Aztecs');
      await page.getByRole('combobox', { name: '队友3文明', exact: true }).selectOption('Burgundians');
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('79.8 金／游戏分钟');
      await expect(page.getByTestId('relic-rate-Food')).toHaveText('40 食物／游戏分钟');
      await page.getByText('来源贡献与计算顺序', { exact: true }).click();
      await expect(page.getByTestId('relic-source-aztecs-Gold')).toHaveCount(1);
      await expect(page.getByTestId('relic-source-aztecs-Gold')).toContainText('队友1');
      await expect(page.getByTestId('relic-source-aztecs-Gold')).toContainText('队友2');
      await page.getByRole('combobox', { name: '圣物文明', exact: true }).selectOption('Hindustanis');
      await page
        .getByRole('checkbox', {
          name: '本方已研究大干道（仅印度斯坦）',
          exact: true,
        })
        .check();
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('87.78 金／游戏分钟');
      await page.getByRole('combobox', { name: '无神论状态', exact: true }).selectOption('one');
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('43.89 金／游戏分钟');
      await expect(page.getByTestId('relic-rate-Food')).toHaveText('20 食物／游戏分钟');
      await expect(page.getByTestId('relic-gap')).toHaveText('56.11 金');
      await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('方案链接已复制');
      const shared = await page.evaluate(() => navigator.clipboard.readText());
      expect(shared).toContain('#/relic-income?');
      await page.goto(shared);
      await page.reload();
      await expect(page.getByRole('combobox', { name: '圣物文明', exact: true })).toHaveValue('Hindustanis');
      await expect(
        page.getByRole('checkbox', {
          name: '本方已研究大干道（仅印度斯坦）',
          exact: true,
        }),
      ).toBeChecked();
      await expect(page.getByRole('combobox', { name: '队友2文明', exact: true })).toHaveValue('Aztecs');
      await expect(page.getByRole('combobox', { name: '无神论状态', exact: true })).toHaveValue('one');
      await expect(page.getByTestId('relic-total-Gold')).toHaveText('438.9 金');
      const sizes = await page
        .getByTestId('relic-income-page')
        .locator('button, input, select, textarea, summary')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
        );
      expect(
        sizes.every((size) => size.width >= 44 && size.height >= 44),
        JSON.stringify(sizes),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include('[data-testid="relic-income-page"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`relic-income238-${theme}-${width}.png`),
        fullPage: true,
      });
      await page.getByRole('textbox', { name: '持续游戏分钟', exact: true }).fill('0');
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('43.89 金／游戏分钟');
      await expect(page.getByTestId('relic-total-Gold')).toHaveText('0 金');
      await expect(page.getByTestId('relic-total-Food')).toHaveText('0 食物');
      await page.getByRole('textbox', { name: '已生效圣物数量', exact: true }).fill('0');
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('0 金／游戏分钟');
      await expect(page.getByTestId('relic-gap')).toHaveText('100 金');
      await page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true }).fill('0');
      await expect(page.getByTestId('relic-covered')).toHaveText('0 金');
      await expect(page.getByTestId('relic-gap')).toHaveText('0 金');
      expect(errors).toEqual([]);
    });
  }

test('#238 本方团队不重复、盟友大干道不传递、阵容变动实时刷新', async ({ page }) => {
  await page.goto(url({ civ: 'Aztecs', a1: 'Aztecs', a2: 'Aztecs', a3: 'Burgundians' }));
  await expect(page.getByTestId('relic-rate-Gold')).toHaveText('39.9 金／游戏分钟');
  await expect(page.getByTestId('relic-rate-Food')).toHaveText('20 食物／游戏分钟');
  await page.getByRole('combobox', { name: '圣物文明', exact: true }).selectOption('Burgundians');
  await expect(page.getByTestId('relic-rate-Food')).toHaveText('20 食物／游戏分钟');
  await page.getByRole('combobox', { name: '队友1文明', exact: true }).selectOption('Hindustanis');
  await page.getByRole('combobox', { name: '队友2文明', exact: true }).selectOption('');
  await expect(page.getByTestId('relic-rate-Gold')).toHaveText('30 金／游戏分钟');
  await page.getByRole('combobox', { name: '圣物文明', exact: true }).selectOption('Franks');
  await page.getByRole('combobox', { name: '队友3文明', exact: true }).selectOption('');
  await expect(page.getByTestId('relic-rate-Food')).toHaveText('0 食物／游戏分钟');
});

for (const atheism of ['multiple', 'unknown', 'changing'])
  test(`#238 ${atheism}暂停受影响结果且完整恢复暂停方案`, async ({ page }) => {
    await page.goto(
      url({
        atheism,
        a1: 'Aztecs',
        a2: 'Burgundians',
        count: '2',
        target: '100',
      }),
    );
    await expect(page.getByTestId('relic-result')).toHaveAttribute('data-status', 'paused');
    await expect(page.getByRole('alert')).toContainText('黄金、食物与金耗覆盖已暂停');
    await expect(page.getByTestId('relic-rate-Gold')).toHaveText('未核实，暂停');
    await expect(page.getByTestId('relic-total-Food')).toHaveText('未核实，暂停');
    await expect(page.getByTestId('relic-gap')).toHaveText('暂停计算');
    await expect(page.getByTestId('relic-rate-Wood')).toHaveText('0 木材／游戏分钟');
    await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole('combobox', { name: '无神论状态', exact: true })).toHaveValue(atheism);
    await page.getByRole('combobox', { name: '无神论状态', exact: true }).selectOption('none');
    await expect(page.getByTestId('relic-result')).toHaveAttribute('data-status', 'valid');
    await expect(page.getByTestId('relic-rate-Gold')).toHaveText('79.8 金／游戏分钟');
  });

test('#238 立陶宛适用单位/阈值/上限，亚美尼亚不自动加圣物', async ({ page }) => {
  await page.goto(url({ civ: 'Lithuanians', count: '5' }));
  await expect(page.getByTestId('relic-lithuanian')).toContainText('精锐烈堤司');
  await expect(page.getByTestId('relic-lithuanian')).toContainText('不适用于翼骑兵');
  await expect(page.getByTestId('relic-lithuanian')).toContainText('超出上限不继续叠加');
  await expect(page.getByTestId('relic-lithuanian-bonus')).toHaveText('当前数量对应的加成说明：+4（最高 +4）。');
  await expect(page.getByTestId('relic-rate-Gold')).toHaveText('150 金／游戏分钟');
  await page.getByRole('textbox', { name: '已生效圣物数量', exact: true }).fill('2');
  await expect(page.getByTestId('relic-lithuanian-bonus')).toContainText('说明：+2');
  await page.getByRole('combobox', { name: '圣物文明', exact: true }).selectOption('Armenians');
  await expect(page.getByTestId('relic-lithuanian')).toHaveCount(0);
  await expect(page.getByTestId('relic-rate-Gold')).toHaveText('60 金／游戏分钟');
  await expect(page.getByTestId('relic-warnings')).toContainText('不会再加一件');
});

test('#238 原始无效字段保持可编辑，非适用研究不会被悄悄清掉', async ({ page }) => {
  await page.goto(url({ count: '-2', minutes: '2.5' }));
  const count = page.getByRole('textbox', {
    name: '已生效圣物数量',
    exact: true,
  });
  await expect(count).toHaveValue('-2');
  await expect(count).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('圣物数量须为');
  await expect(page.getByTestId('relic-rate-Gold')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
  await count.fill('2');
  await expect(page.getByTestId('relic-total-Gold')).toHaveText('150 金');
  await page.getByRole('combobox', { name: '圣物文明', exact: true }).selectOption('Hindustanis');
  await page
    .getByRole('checkbox', {
      name: '本方已研究大干道（仅印度斯坦）',
      exact: true,
    })
    .check();
  await page.getByRole('combobox', { name: '圣物文明', exact: true }).selectOption('Franks');
  await expect(page.getByRole('alert')).toContainText('仅适用于本方印度斯坦');
  await expect(
    page.getByRole('checkbox', {
      name: '本方已研究大干道（仅印度斯坦）',
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole('checkbox', {
      name: '本方已研究大干道（仅印度斯坦）',
      exact: true,
    })
    .uncheck();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await count.fill('1000001');
  await expect(page.getByRole('alert')).toContainText('1000000');
  await page.getByRole('button', { name: '重置圣物方案', exact: true }).click();
  await expect(count).toHaveValue('1');
});

test('#238 重复/未知/坏编码/超长链接锁定，保留原文且显式重置', async ({ page }) => {
  for (const query of [encoded() + '&count=5', encoded() + '&bad=1', encoded().replace('count=1', 'count=%E0%A4'), encoded() + '&bad=' + 'x'.repeat(8001)]) {
    await page.goto('./#/relic-income?' + query);
    await expect(page.getByRole('alert')).toContainText('链接结构损坏');
    await expect(page.getByRole('textbox', { name: '原方案链接', exact: true })).toHaveValue(/#\/relic-income\?/);
    await expect(page.getByRole('textbox', { name: '已生效圣物数量', exact: true })).toBeDisabled();
    await expect(page.getByTestId('relic-rate-Gold')).toHaveCount(0);
    await page.getByRole('button', { name: '重置圣物方案', exact: true }).click();
    await expect(page.getByTestId('relic-rate-Gold')).toHaveText('30 金／游戏分钟');
  }
});

test('#238 剪贴板失败展示完整链接并清除外层无关查询', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await page.goto(
    './?unrelated=1#/relic-income?' +
      encoded({
        count: '7',
        atheism: 'unknown',
        a1: 'Aztecs',
        a2: 'Burgundians',
        a3: 'Armenians',
      }),
  );
  await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const manual = page.getByRole('textbox', {
    name: '完整方案链接',
    exact: true,
  });
  const full = new URL(await manual.inputValue());
  expect(full.search).toBe('');
  expect(full.hash).toBe(
    '#/relic-income?' +
      encoded({
        count: '7',
        atheism: 'unknown',
        a1: 'Aztecs',
        a2: 'Burgundians',
        a3: 'Armenians',
      }),
  );
  await manual.focus();
  expect(
    await manual.evaluate((element) => element instanceof HTMLTextAreaElement && element.selectionEnd === element.value.length && element.selectionStart === 0),
  ).toBe(true);
  await page.goto(full.href);
  await page.reload();
  await expect(page.getByRole('combobox', { name: '队友3文明', exact: true })).toHaveValue('Armenians');
  await expect(page.getByTestId('relic-result')).toHaveAttribute('data-status', 'paused');
});

test('#238 数据块加载错误明确暂停，不采用普通文明默认结果', async ({ page }) => {
  await page.route(/relic_income(?:[-.]|\.json)/, (route) => route.abort('failed'));
  await page.goto('./#/relic-income');
  await expect(page.getByTestId('relic-income-page')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('固定圣物数据加载失败');
  await expect(page.getByRole('button', { name: '重试加载数据', exact: true })).toBeVisible();
  await expect(page.getByTestId('relic-rate-Gold')).toHaveCount(0);
});
