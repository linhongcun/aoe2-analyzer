import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const PINS = JSON.parse(readFileSync(new URL('../../scripts/data_sources.json', import.meta.url), 'utf8')) as typeof import('../../scripts/data_sources.json');

const KNIGHT = '38.Byzantines.3..';
const PIKEMAN = '358.Byzantines.3..';
const VERSION = String(PINS.patch.build);
const pageErrors = new WeakMap<Page, string[]>();

function comparisonUrl({
  current = '38.Byzantines.3.67.',
  before = KNIGHT,
  opponent = KNIGHT,
  fixed = opponent,
  mode = '1',
  version = VERSION,
}: {
  current?: string;
  before?: string;
  opponent?: string;
  fixed?: string;
  mode?: string;
  version?: string;
} = {}) {
  const params = new URLSearchParams({ a: current, b: opponent, m: mode, base: before, fixed, basev: version });
  return `./#/duel?${params}`;
}

function comparison(page: Page) {
  return page.locator('[data-t="upgrade-comparison"]');
}

function metric(page: Page, name: string, column: 0 | 1) {
  return comparison(page).locator(`[data-metric="${name}"] td`).nth(column).locator('[data-t="upgrade-value"]');
}

async function expectMetric(page: Page, name: string, before: number, current: number) {
  for (const [column, value] of [before, current].entries()) {
    await expect(metric(page, name, column as 0 | 1)).toHaveText(new RegExp(`^${String(value).replace('.', '\\.')}($|[^\\d.])`));
  }
}

async function techCheckbox(page: Page, side: 'a' | 'b', name: string) {
  const details = page.locator(`#duel-${side} details.duel-tech`);
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  return details
    .locator('label.simt')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
    .locator('input[type="checkbox"]');
}

async function expectInvalid(page: Page) {
  await expect(comparison(page).locator('[data-t="upgrade-status"]')).toBeVisible();
  await expect(comparison(page).locator('[data-t="upgrade-status"]')).not.toHaveText('');
  await expect(comparison(page).locator('[data-metric]')).toHaveCount(0);
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('base')).not.toBeNull();
}

async function expectResource(cost: Locator, resource: string, value: number) {
  await expect(cost.locator(`.res:has(img[alt="${resource}"])`)).toHaveText(String(value));
}

function leadingNumber(value: string | null) {
  const match = value?.trim().match(/^\d+(?:\.\d+)?/);
  expect(match, `Expected a numeric result, received ${value}`).not.toBeNull();
  return Number(match![0]);
}

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('#205 保存、勾选科技、复制分享、刷新与清除比较', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`./#/duel?a=${KNIGHT}&b=${KNIGHT}&m=1`);
  const panel = comparison(page);
  await expect(panel.locator('[data-t="upgrade-status"]')).toBeVisible();
  await panel.getByRole('button', { name: '保存为升级前', exact: true }).click();
  await expectMetric(page, 'ab-hits', 13, 13);
  await expect(panel).toContainText('尚无科技变化');
  const saved = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(saved.get('base')).toBe(KNIGHT);
  expect(saved.get('fixed')).toBe(KNIGHT);
  expect(saved.get('basev')).toBe(VERSION);

  await (await techCheckbox(page, 'a', '锻造')).check();
  await expectMetric(page, 'ab-dmg', 8, 9);
  await expectMetric(page, 'ab-hits', 13, 12);
  await expectMetric(page, 'ab-time', 21.6, 19.8);
  await expect(panel.locator('[data-t="upgrade-before"]')).toContainText('无科技');
  await expect(panel.locator('[data-t="upgrade-current"]').getByRole('link', { name: '锻造', exact: true })).toBeVisible();
  await expect(panel.locator('[data-t="upgrade-added"]')).toContainText('锻造');
  await expectResource(panel.locator('[data-t="upgrade-added-cost"]'), '食物', 150);
  await panel.getByRole('button', { name: /复制.*链接/ }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('base=');
  expect(link).toContain('fixed=');
  expect(link).toContain(`basev=${VERSION}`);
  await page.goto(link);
  await page.reload();
  await expectMetric(page, 'ab-hits', 13, 12);
  await expect(await techCheckbox(page, 'a', '锻造')).toBeChecked();
  await panel.getByRole('button', { name: '重新保存基准', exact: true }).click();
  await expectMetric(page, 'ab-hits', 12, 12);
  await panel.getByRole('button', { name: '清除比较', exact: true }).click();
  await expect(panel.locator('[data-metric]')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '保存为升级前', exact: true })).toBeVisible();
  const cleared = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  for (const key of ['base', 'fixed', 'basev']) expect(cleared.has(key)).toBe(false);
});

test('#205 攻击提高但击杀阈值不变，并只计算新增科技费用', async ({ page }) => {
  await page.goto(comparisonUrl({ current: '38.Byzantines.3.67-68.', before: '38.Byzantines.3.67.', opponent: PIKEMAN }));
  await expectMetric(page, 'ab-dmg', 11, 12);
  await expectMetric(page, 'ab-hits', 5, 5);
  await expectMetric(page, 'ab-time', 7.2, 7.2);
  await expect(comparison(page).locator('[data-metric="ab-hits"]')).toContainText('不变');
  const cost = comparison(page).locator('[data-t="upgrade-added-cost"]');
  await expectResource(cost, '食物', 220);
  await expectResource(cost, '黄金', 120);
  await expect(cost).toContainText('75');
  await expect(comparison(page).locator('[data-t="upgrade-added"]').getByRole('link', { name: '锻造', exact: true })).toHaveCount(0);
  await expect(comparison(page).locator('[data-t="upgrade-added"]').getByRole('link', { name: '铸铁', exact: true })).toBeVisible();
});

test('#205 畜牧只提高移速时说明模型限制', async ({ page }) => {
  await page.goto(comparisonUrl({ current: '38.Byzantines.3.39-67.', before: '38.Byzantines.3.67.', opponent: PIKEMAN }));
  await expectMetric(page, 'a-spd', 1.35, 1.485);
  await expectMetric(page, 'ab-hits', 5, 5);
  await expectMetric(page, 'ab-time', 7.2, 7.2);
  await expect(comparison(page)).toContainText(/未模拟.*移速|移速.*未.*模拟/);
  await expectResource(comparison(page).locator('[data-t="upgrade-added-cost"]'), '食物', 150);
  await expect(comparison(page).locator('[data-t="upgrade-added-cost"]')).toContainText('40');
});

test('#205 分享补全前置、去重收费，取消科技不退款', async ({ page }) => {
  await page.goto(comparisonUrl({ current: '38.Byzantines.3.68-68.' }));
  const panel = comparison(page);
  const cost = panel.locator('[data-t="upgrade-added-cost"]');
  await expectResource(cost, '食物', 370);
  await expectResource(cost, '黄金', 120);
  await expect(cost).toContainText('125');
  await expect(panel.locator('[data-t="upgrade-prerequisites"]')).toContainText('锻造');
  await expect(panel.locator('[data-t="upgrade-current"]').getByRole('link', { name: '锻造', exact: true })).toHaveCount(1);
  await expect(panel.locator('[data-t="upgrade-current"]').getByRole('link', { name: '铸铁', exact: true })).toHaveCount(1);
  await expect(panel).toContainText(/基础.*研究费用|研究.*基础.*费用/);
  await expect(panel).toContainText(/文明.*折扣/);
  await expect(panel).toContainText(/训练费用/);

  await page.goto(comparisonUrl({ current: KNIGHT, before: '38.Byzantines.3.67.' }));
  await expect(panel.locator('[data-t="upgrade-removed"]')).toContainText('锻造');
  await expect(panel).toContainText(/不退|不返还/);
  await expect(panel.locator('[data-t="upgrade-added-cost"]')).not.toContainText('-150');
  await expectMetric(page, 'ab-hits', 12, 13);
});

test('#205 两列分别等于各自的独立 1v1 结果', async ({ page }) => {
  await page.goto(comparisonUrl({ current: '38.Byzantines.3.68.', opponent: PIKEMAN }));
  const entries = [
    ['每击伤害', 'ab-dmg', 'ba-dmg'],
    ['期望每击（含命中率）', 'ab-exp', 'ba-exp'],
    ['击杀所需次数', 'ab-hits', 'ba-hits'],
    ['击杀用时', 'ab-time', 'ba-time'],
  ] as const;
  const plans = [];
  for (const [column, selector] of ['upgrade-before', 'upgrade-current'].entries()) {
    const href = await comparison(page).locator(`[data-t="${selector}"] a[href*="/duel?"]`).getAttribute('href');
    expect(href).not.toBeNull();
    const expected = [];
    for (const [label, ab, ba] of entries) {
      expected.push({
        label,
        a: leadingNumber(await metric(page, ab, column as 0 | 1).textContent()),
        b: leadingNumber(await metric(page, ba, column as 0 | 1).textContent()),
      });
    }
    plans.push({ url: new URL(href!, page.url()).href, expected });
  }
  for (const plan of plans) {
    await page.goto(plan.url);
    await expect(page.locator('#duel-res')).toBeVisible();
    for (const row of plan.expected) {
      const result = page.locator('#duel-res .duel-tab tr').filter({ has: page.getByText(row.label, { exact: true }) });
      expect(leadingNumber(await result.locator('td').nth(1).textContent())).toBe(row.a);
      expect(leadingNumber(await result.locator('td').nth(2).textContent())).toBe(row.b);
    }
    expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('base')).toBe(false);
  }
});

const invalidatingChanges: [string, (page: Page) => Promise<unknown>][] = [
  ['B 方科技', async (page) => (await techCheckbox(page, 'b', '锻造')).check()],
  [
    'A 方单位',
    async (page) => {
      await page.locator('#duel-a-unit').click();
      await page.getByRole('dialog', { name: 'A 方单位', exact: true }).locator('[data-unit="4"]').click();
    },
  ],
  [
    'A 方文明',
    async (page) => {
      await page.locator('#duel-a-civ').click();
      await page.getByRole('dialog', { name: 'A 方文明', exact: true }).locator('[data-civ="Franks"]').click();
    },
  ],
  [
    'A 方时代',
    async (page) => {
      await techCheckbox(page, 'a', '锻造');
      await page.locator('#duel-a-age').selectOption('4');
    },
  ],
  [
    'A 方团队加成',
    async (page) => {
      await techCheckbox(page, 'a', '锻造');
      await page
        .locator('#duel-a .simg')
        .filter({ has: page.getByRole('heading', { name: '团队加成（开关）', exact: true }) })
        .getByRole('checkbox')
        .first()
        .check();
    },
  ],
  ['非 1v1 模式', async (page) => page.getByRole('radio', { name: 'N vs M', exact: true }).click()],
];

for (const [name, change] of invalidatingChanges) {
  test(`#205 修改${name}使比较失效，刷新保留原因`, async ({ page }) => {
    await page.goto(comparisonUrl());
    await expectMetric(page, 'ab-hits', 13, 12);
    await change(page);
    await expectInvalid(page);
    await page.reload();
    await expectInvalid(page);
    await comparison(page).getByRole('button', { name: '清除比较', exact: true }).click();
    expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('base')).toBe(false);
  });
}

test('#205 选择未来时代科技自动升时代也使基准失效', async ({ page }) => {
  await page.goto(comparisonUrl());
  await (await techCheckbox(page, 'a', '骑兵钢甲')).check();
  await expect(page.locator('#duel-a-age')).toHaveValue('4');
  await expectInvalid(page);
});

test('#205 非法、未来时代、无效果及不支持的分享科技不会被默默忽略', async ({ page }) => {
  const invalid = [
    comparisonUrl({ current: '38.Byzantines.3.999999.' }),
    comparisonUrl({ current: '38.Byzantines.3.bad.' }),
    comparisonUrl({ current: '38.Byzantines.3.80.' }),
    comparisonUrl({ current: '38.Byzantines.3.182.' }),
    comparisonUrl({ current: '38.Byzantines.4.75.', before: '38.Byzantines.4..' }),
    comparisonUrl({ before: '38.Byzantines.3.999999.' }),
    comparisonUrl({ fixed: '38.Byzantines.3.999999.' }),
    comparisonUrl({ version: '185871' }),
  ];
  for (const url of invalid) {
    await page.goto(url);
    await expectInvalid(page);
  }
});

test('#205 直接加载上下文发生变化的分享链接也拒绝比较', async ({ page }) => {
  const invalid = [
    comparisonUrl({ current: '4.Byzantines.3..' }),
    comparisonUrl({ current: '38.Franks.3.67.' }),
    comparisonUrl({ current: '38.Byzantines.4.67.' }),
    comparisonUrl({ opponent: '38.Byzantines.3.67.', fixed: KNIGHT }),
    comparisonUrl({ mode: 'n' }),
  ];
  for (const url of invalid) {
    await page.goto(url);
    await expectInvalid(page);
  }
});

test('#205 无法训练或非 1v1 时禁止保存基准', async ({ page }) => {
  for (const url of [`./#/duel?a=${KNIGHT}&b=${KNIGHT}&m=n`, './#/duel?a=38.Aztecs.3..&b=38.Byzantines.3..&m=1']) {
    await page.goto(url);
    await expect(comparison(page).locator('[data-t="upgrade-status"]')).toBeVisible();
    await expect(comparison(page).getByRole('button', { name: '保存为升级前', exact: true })).toBeDisabled();
    await expect(comparison(page).locator('[data-metric]')).toHaveCount(0);
  }
});

test('#205 爆炸单位没有攻击间隔时不显示虚构的时间与胜负差值', async ({ page }) => {
  const camel = '1263.Tatars.4..';
  await page.goto(comparisonUrl({ current: camel, before: camel }));
  await expect(metric(page, 'ab-time', 0)).toHaveText('—');
  await expect(metric(page, 'ab-time', 1)).toHaveText('—');
  for (const name of ['winner', 'duration', 'remaining']) {
    await expect(metric(page, name, 0)).toHaveText('—');
    await expect(metric(page, name, 1)).toHaveText('—');
    await expect(comparison(page).locator(`[data-metric="${name}"]`)).toContainText('未模拟');
  }
  await expect(comparison(page)).toContainText('缺少攻击间隔');
  await expect(comparison(page)).not.toContainText(/NaN|Infinity/);
});

test('#205 剪贴板拒绝时提供完整手动复制链接且没有页面错误', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Permission denied')) } });
  });
  await page.goto(comparisonUrl());
  await comparison(page).getByRole('button', { name: '复制比较链接', exact: true }).click();
  await expect(comparison(page).locator('[data-t="upgrade-copy-status"]')).toContainText('手动复制');
  await expect(comparison(page).getByRole('textbox', { name: '手动复制比较链接', exact: true })).toHaveValue(page.url());
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`#205 ${theme} @${width} 完整方案、费用和差值无横向溢出`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto(comparisonUrl({ current: '38.Byzantines.3.39-67-68-81-82.', before: '38.Byzantines.3.67.' }));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const panel = comparison(page);
      await expect(panel.locator('[data-t="upgrade-before"]')).toBeVisible();
      await expect(panel.locator('[data-t="upgrade-current"]')).toBeVisible();
      await expect(panel.locator('[data-t="upgrade-added-cost"]')).toBeVisible();
      await expect(panel.locator('[data-metric="ab-hits"]')).toBeVisible();
      await expect(panel).not.toContainText('NaN');
      for (const card of ['upgrade-before', 'upgrade-current']) await expect(panel.locator(`[data-t="${card}"]`)).toContainText(VERSION);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`upgrade205-${theme}-${width}.png`), fullPage: true });
    });
  }
}
