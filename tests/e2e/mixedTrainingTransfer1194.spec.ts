import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeMixedDuel, mixedDataVersion, type MixedDuelInput } from '../../src/domain/mixedDuelParams';

const source = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')) as Parameters<typeof mixedDataVersion>[0];
const fixture: MixedDuelInput = {
  rule: 'frontline-v2',
  data: mixedDataVersion(source),
  a: {
    civ: 'Gurjaras',
    age: '4',
    techs: ['835', '67'],
    team: [],
    rows: [
      { uid: '330', qty: '12' },
      { uid: '1743', qty: '8' },
    ],
  },
  b: {
    civ: 'Franks',
    age: '3',
    techs: [],
    team: [],
    rows: [
      { uid: '38', qty: '10' },
      { uid: '281', qty: '6' },
    ],
  },
};
const action = (page: Page, side: 'A' | 'B') => page.getByRole('link', { name: `计算 ${side} 方训练费用`, exact: true });
const open = (page: Page, input = fixture) => page.goto('./#/duel?' + encodeMixedDuel(input));

for (const width of [1280, 360]) {
  test(`#1194 ${width}px 单方完整交接、手填同价、分享和编辑`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    const a = action(page, 'A');
    const b = action(page, 'B');
    const summary = page.getByTestId('production-transfer');
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await expect(page.getByTestId('mixed-result')).toHaveCount(0);
    expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 360) await a.press('Enter');
    else await a.click();
    await expect(summary).toContainText('已带入混编 PK 的 A 方');
    await expect(summary).toContainText('瞿折罗 · 帝王时代 · 2 行');
    await expect(summary).toContainText('计入单价：刹帝利');
    await expect(summary).toContainText('锻造（仅影响战斗）');
    await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('12');
    await expect(page.getByLabel('兵种 2 训练数量')).toHaveValue('8');
    const result = page.getByTestId('train-total-result');
    await expect(result.getByTestId('train-total-resource-Food')).toContainText('884');
    await expect(result.getByTestId('train-total-resource-Gold')).toContainText('960');
    expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('units')).toBe('330:12,1743:8');
    const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
    await copy.click();
    await expect(page.getByText('链接已复制，包含当前全部设置。')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const tab = await context.newPage();
    await tab.goto(copied);
    const manual = tab.getByTestId('train-total-result');
    await expect(manual).toBeVisible();
    await expect(manual).toHaveText(await result.innerText(), { useInnerText: true });
    await expect(tab.getByTestId('production-transfer')).toHaveCount(0);
    await tab.reload();
    await expect(manual.getByTestId('train-total-resource-Gold')).toContainText('960');
    await tab.goto('./#/production?mode=train-total&civ=Gurjaras&age=4&techs=835&units=330%3A12%2C1743%3A8');
    await expect(manual).toHaveText(await result.innerText(), { useInnerText: true });
    await tab.close();
    await page.getByLabel('兵种 1 训练数量').fill('13');
    await expect(summary).toHaveCount(0);
    await page.getByLabel('兵种 1 训练数量').fill('12');
    await expect(summary).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#mix-a-qty-1')).toHaveValue('8');
    await b.click();
    await expect(summary).toContainText('已带入混编 PK 的 B 方');
    await expect(summary).toContainText('法兰克 · 城堡时代 · 2 行');
    await expect(result.getByTestId('train-total-resource-Food')).toContainText('930');
    await expect(result.getByTestId('train-total-resource-Gold')).toContainText('900');
    expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('units')).toBe('38:10,281:6');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('#1194 无效侧定位并保留输入，另一方独立，失效版本暂停全部带入', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await open(page);
  const quantity = page.locator('#mix-a-qty-1');
  await quantity.fill('0');
  const a = action(page, 'A');
  const b = action(page, 'B');
  const blocked = page.getByRole('complementary', { name: '暂不能带入 A 方' });
  await expect(a).toHaveCount(0);
  await expect(b).toBeVisible();
  await expect(blocked).toContainText('第 2 行数量须为 1–200 的正整数');
  await blocked.getByRole('button', { name: '修改第 2 行数量', exact: true }).press('Enter');
  await expect(quantity).toBeFocused();
  await expect(quantity).toHaveValue('0');
  await quantity.fill('8');
  await expect(a).toBeVisible();
  await open(page, {
    ...fixture,
    a: {
      civ: 'Mapuche',
      age: '4',
      techs: ['1380'],
      team: [],
      rows: [
        { uid: '2569', qty: '2' },
        { uid: '93', qty: '1' },
      ],
    },
  });
  await expect(a).toHaveCount(0);
  await expect(b).toBeVisible();
  await expect(blocked).toContainText('布图马普');
  const malformed = encodeMixedDuel(fixture);
  malformed.set('ma', '{');
  await page.goto('./#/duel?' + malformed);
  await expect(blocked).toContainText('A 方链接 JSON 格式损坏');
  const repair = page.getByRole('button', { name: '重新配置双方（清空损坏方案）' });
  await expect(repair).toBeEnabled();
  await repair.focus();
  for (let step = 0; step < 12 && !(await b.evaluate((element) => document.activeElement === element)); step++) {
    await page.keyboard.press('Tab');
  }
  await expect(b).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('train-total-resource-Food')).toContainText('930');
  await open(page, { ...fixture, data: 'old-fixed-data' });
  await expect(a).toHaveCount(0);
  await expect(b).toHaveCount(0);
  await expect(blocked).toContainText('当前固定数据重新校验');
  await page.getByRole('button', { name: '确认使用当前数据重新校验' }).click();
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
});

test('#1334 日本巨型投石机与亚美尼亚牧师战士点「满科技」预设后可一键带入训练总价', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  const cases = [
    {
      label: '日本巨型投石机',
      civ: 'Japanese',
      uid: '331',
      qty: '5',
      omitted: '弹射器（不改变本方训练单价或解锁）',
      resources: [
        ['Wood', '1,000'],
        ['Gold', '1,000'],
      ] as const,
    },
    {
      label: '亚美尼亚牧师战士',
      civ: 'Armenians',
      uid: '1811',
      qty: '5',
      omitted: '费雷特斯（不改变本方训练单价或解锁）',
      resources: [
        ['Food', '200'],
        ['Gold', '250'],
      ] as const,
    },
    {
      label: '不列颠箭船',
      civ: 'Britons',
      uid: '539',
      qty: '5',
      omitted: '鱼鳞式建造法（不改变本方训练单价或解锁）',
      resources: [
        ['Wood', '360'],
        ['Gold', '150'],
      ] as const,
    },
    {
      label: '不列颠村民',
      civ: 'Britons',
      uid: '83',
      qty: '5',
      omitted: '独轮推车（不改变本方训练单价或解锁）',
      resources: [['Food', '250']] as const,
    },
  ];

  for (const item of cases) {
    await open(page, {
      ...fixture,
      a: { civ: item.civ, age: '4', techs: [], team: [], rows: [{ uid: item.uid, qty: item.qty }] },
    });
    const sideA = page.locator('section.mix-side.side-a');
    await sideA.getByRole('button', { name: '满科技', exact: true }).click();
    await expect(sideA.getByRole('complementary', { name: '暂不能带入 A 方' }), item.label).toHaveCount(0);
    const link = action(page, 'A');
    await expect(link, item.label).toBeVisible();
    await link.click();

    const summary = page.getByTestId('production-transfer');
    await expect(summary, item.label).toContainText('已带入混编 PK 的 A 方');
    await expect(summary, item.label).toContainText(item.omitted);
    const result = page.getByTestId('train-total-result');
    await expect(result, item.label).not.toContainText('部分训练费用');
    for (const [res, amount] of item.resources) {
      await expect(result.getByTestId(`train-total-resource-${res}`), `${item.label}:${res}`).toContainText(amount);
    }
  }

  expect(errors).toEqual([]);
});
