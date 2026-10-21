import { expect, test, type Locator, type Page } from '@playwright/test';

// Cross-page entry contracts only. The individual tool specs cover their models.
const messages = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const query = (values: Record<string, string>) => new URLSearchParams(values).toString();
const production = {
  civ: 'Franks',
  age: '3',
  walk: '5',
  farm: '0.5',
  techs: '202',
  rows: '4:87:2,38:101:3',
};
const hashQuery = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
const hashPath = (page: Page) => new URL(page.url()).hash.slice(1).split('?')[0];
const healing = (page: Page) => page.getByTestId('garrison-healing-page');
const garrisonUrl = (building: number, civ: string, age: number, army: string, gtechs = '') =>
  './#/building/' + building + '?' + query({ tab: 'garrison', gv: '2', civ, age: String(age), army, gtechs });
async function touchTarget(link: Locator) {
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
async function compareCiv(page: Page, slot: 'A' | 'B', civ: string) {
  await page.getByRole('button', { name: new RegExp(`^文明 ${slot}：`) }).click();
  await page.locator(`[role="option"][data-civ="${civ}"]`).click();
}

test('#230 窄屏首页四个规划入口可键盘访问并进入真实页面', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  for (const [, path, pageId] of [
    ['商路供给', '/trade-income', 'trade-income-page'],
    ['多人施工', '/construction', 'construction-page'],
    ['队伍加成', '/team-bonuses', 'team-bonuses-page'],
    ['驻军回血', '/garrison-healing', 'garrison-healing-page'],
  ]) {
    await page.goto('./#/');
    // #272 起首页按用途分组，入口改为分组卡片。
    const link = page.locator(`#home a.hcard[href="#${path}"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '#' + path);
    await touchTarget(link);
    await link.focus();
    await link.press('Enter');
    await expect(page.getByTestId(pageId!)).toBeVisible();
    expect(hashPath(page)).toBe(path);
  }
});

test('#230 持续生产带入商路保留完整来源，回看原方案不丢科技、距离和两条需求', async ({ page }) => {
  await page.goto('./#/production?' + query(production));
  const gold = page.getByTestId('production-resource-Gold');
  await expect(gold).toBeVisible();
  const spend = (await gold.innerText()).match(/开销\s*([\d,.]+)\s*\/\s*分钟/);
  expect(spend).not.toBeNull();
  const expectedGold = Number(spend![1]!.replace(/,/g, ''));
  expect(expectedGold).toBeGreaterThan(0);
  await page.getByRole('link', { name: '按当前生产金耗规划商路供给', exact: true }).click();
  await expect(page.getByTestId('trade-income-page')).toBeVisible();
  const params = hashQuery(page);
  expect(params.get('mode')).toBe('production');
  expect(params.get('civ')).toBe('Franks');
  expect(params.get('age')).toBe('3');
  expect(Object.fromEntries(new URLSearchParams(params.get('source')!))).toEqual(production);
  const target = page.getByTestId('trade-target');
  await expect(target).toBeVisible();
  expect(Number((await target.innerText()).replace(/,/g, '').match(/[\d.]+/)![0])).toBeCloseTo(expectedGold, 2);
  await page.getByRole('textbox', { name: '每次实际交金量', exact: true }).fill('75');
  await page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true }).fill('90');
  expect(Number((await target.innerText()).replace(/,/g, '').match(/[\d.]+/)![0])).toBeCloseTo(expectedGold, 2);
  await page.getByRole('link', { name: '查看原生产方案', exact: true }).click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  expect(Object.fromEntries(hashQuery(page))).toEqual(production);
  await expect(page.getByRole('textbox', { name: '需求 1 建筑数量', exact: true })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: '需求 2 建筑数量', exact: true })).toHaveValue('3');
  await expect(page.getByRole('checkbox', { name: '双刃斧', exact: true })).toBeChecked();
});

test('#230 非法生产配置不生成可继续带入的商路入口', async ({ page }) => {
  await page.goto('./#/production?' + query({ ...production, rows: '38:101:-1' }));
  await expect(page.getByTestId('production-page').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: '按当前生产金耗规划商路供给', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('production-page')).toContainText('修正当前生产配置后可带入商路供给');
});

test('#230 建筑模拟器进入施工时保留建筑、文明、时代与已选合法科技', async ({ page }) => {
  await page.goto('./#/building/82?' + query({ tab: 'sim', civ: 'Spanish', age: '4', techs: '50,51' }));
  await expect(page.locator('#simage')).toHaveValue('4');
  await expect(page.getByRole('checkbox', { name: /^建筑学 / })).toBeChecked();
  await page.getByRole('link', { name: '按当前文明与科技比较施工', exact: true }).click();
  await expect(page.getByTestId('construction-page')).toBeVisible();
  expect(Object.fromEntries(hashQuery(page))).toEqual({
    cv: '1',
    building: '82',
    civ: 'Spanish',
    age: '4',
    techs: '50,51',
    builders: '4',
    baseline: '1',
    tc: '1',
    task: '',
    walk: '3',
    farm: '0',
  });
  await expect(page.getByRole('combobox', { name: '施工建筑', exact: true })).toHaveValue('82');
  await expect(page.getByRole('combobox', { name: '施工文明', exact: true })).toHaveValue('Spanish');
  await expect(page.getByRole('combobox', { name: '施工时代', exact: true })).toHaveValue('4');
  await expect(page.getByRole('checkbox', { name: '建筑学', exact: true })).toBeChecked();
  await expect(page.getByTestId('construction-seconds')).toBeVisible();
  await expect(page.getByTestId('construction-page').getByRole('alert')).toHaveCount(0);
});

test('#230 库曼封建攻城器厂施工入口保留特殊时代，不退回城堡时代', async ({ page }) => {
  await page.goto('./#/building/49?' + query({ tab: 'sim', civ: 'Cumans', age: '2', techs: '' }));
  await expect(page.locator('#simage')).toHaveValue('2');
  await page.getByRole('link', { name: '按当前文明与科技比较施工', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '施工建筑', exact: true })).toHaveValue('49');
  await expect(page.getByRole('combobox', { name: '施工时代', exact: true })).toHaveValue('2');
  expect(hashQuery(page).get('civ')).toBe('Cumans');
  await expect(page.getByTestId('construction-seconds')).toBeVisible();
  await expect(page.getByTestId('construction-page').getByRole('alert')).toHaveCount(0);
});

test('#230 建筑模拟器进入回血保留宿主、文明与时代，免费草药交给独立模型', async ({ page }) => {
  await page.goto('./#/building/109?' + query({ tab: 'sim', civ: 'Teutons', age: '4', techs: '8,50,51' }));
  await expect(page.locator('#simage')).toHaveValue('4');
  await page.getByRole('link', { name: '查看单目标驻军回血', exact: true }).click();
  await expect(healing(page)).toBeVisible();
  expect(Object.fromEntries(hashQuery(page))).toEqual({
    hv: '1',
    b: '109',
    civ: 'Teutons',
    age: '4',
    u: '83',
    entry: 'enter',
    techs: '',
    current: '1',
    target: '25',
  });
  await expect(page.getByRole('combobox', { name: '回血建筑', exact: true })).toHaveValue('109');
  await expect(page.getByRole('combobox', { name: '回血文明', exact: true })).toHaveValue('Teutons');
  await expect(page.getByRole('combobox', { name: '回血时代', exact: true })).toHaveValue('4');
  await expect(page.getByRole('checkbox', { name: /^草药/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^草药/ })).toBeDisabled();
  await expect(page.getByTestId('healing-result')).toHaveAttribute('data-status', 'valid');
});

test('#230 单行自产驻军进入回血保留单位、驻留方式和解锁科技，数量不冒充目标数', async ({ page }) => {
  await page.goto(garrisonUrl(12, 'Goths', 3, '41:2:c', '16'));
  await expect(page.getByTestId('garrison-used')).toHaveText('2');
  await page.getByRole('link', { name: '按此单位查看驻军回血', exact: true }).click();
  await expect(healing(page)).toBeVisible();
  const params = hashQuery(page);
  expect(Object.fromEntries(params)).toMatchObject({ hv: '1', b: '12', civ: 'Goths', age: '3', u: '41', entry: 'created', techs: '16', current: '1' });
  expect(params.has('army')).toBe(false);
  expect(params.has('count')).toBe(false);
  await expect(page.getByRole('combobox', { name: '回血单位', exact: true })).toHaveValue('41');
  await expect(page.getByRole('combobox', { name: '回血驻留方式', exact: true })).toHaveValue('created');
  await expect(page.getByRole('checkbox', { name: '无政府', exact: true })).toBeChecked();
  await expect(page.getByTestId('healing-created-warning')).toBeVisible();
  await expect(page.getByTestId('healing-result')).toHaveAttribute('data-status', 'valid');
});

test('#230 混合驻军进入独立单目标回血，返回时原混合配置完整保留', async ({ page }) => {
  await page.goto(garrisonUrl(82, 'Franks', 4, '4:2:e,38:1:e'));
  await expect(page.getByTestId('garrison-used')).toHaveText('3');
  await expect(page.getByTestId('garrison-preview')).toContainText('不迁移混合数量');
  await page.getByRole('link', { name: '查看单目标回血，进入后选择对象', exact: true }).click();
  await expect(healing(page)).toBeVisible();
  expect(Object.fromEntries(hashQuery(page))).toMatchObject({ b: '82', civ: 'Franks', age: '4', u: '83', entry: 'enter', current: '1', target: '25' });
  expect(hashQuery(page).has('army')).toBe(false);
  await expect(page.getByTestId('healing-result')).toHaveAttribute('data-status', 'valid');
  await page.goBack();
  await expect(page.getByTestId('garrison-used')).toHaveText('3');
  expect(hashQuery(page).get('army')).toBe('4:2:e,38:1:e');
  await expect(page.getByRole('combobox', { name: '驻军单位 1', exact: true })).toHaveValue('4');
  await expect(page.getByRole('combobox', { name: '驻军单位 2', exact: true })).toHaveValue('38');
});

test('#230 非法驻军配置不生成回血迁移入口', async ({ page }) => {
  await page.goto(garrisonUrl(109, 'Franks', 3, '83:16:e'));
  await expect(page.getByTestId('garrison-preview').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: '按此单位查看驻军回血', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '查看单目标回血，进入后选择对象', exact: true })).toHaveCount(0);
});

test('#230 文明对比携带两名玩家及重复文明顺序，队伍页来源保留两个提供者', async ({ page }) => {
  await page.goto('./#/compare');
  await compareCiv(page, 'A', 'Berbers');
  await compareCiv(page, 'B', 'Berbers');
  await page.getByRole('link', { name: '查看这两个文明的队伍加成来源', exact: true }).click();
  await expect(page.getByTestId('team-bonuses-page')).toBeVisible();
  expect(Object.fromEntries(hashQuery(page))).toEqual({ tv: '1', players: 'Berbers,Berbers', age: '4', target: 'all', unit: '', researched: '' });
  await expect(page.getByRole('button', { name: '玩家 1 文明：柏柏尔', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '玩家 2 文明：柏柏尔', exact: true })).toBeVisible();
  const source = page.getByTestId('team-bonus-Berbers-team');
  await expect(source).toHaveCount(1);
  await expect(source.getByRole('link', { name: '玩家 1 · 柏柏尔', exact: true })).toBeVisible();
  await expect(source.getByRole('link', { name: '玩家 2 · 柏柏尔', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-technology-578').getByRole('checkbox')).not.toBeChecked();
  await page.goBack();
  await expect(page.getByRole('button', { name: '文明 A：柏柏尔', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '文明 B：柏柏尔', exact: true })).toBeVisible();
});
