import { expect, test, type Page } from '@playwright/test';
/**
 * v0.27.0 验收（#299）。Kent 写，先失败，#264 / #266 修完后应全部通过。
 * 标「守卫」的用例现在就应通过。中文速度名称的措辞留给开发，这里只验倍率数字和按钮存在。
 */

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

// ---------- #266 时间换算 ----------
const clockPage = (page: Page) => page.getByTestId('game-clock-page');
const ratioInput = (page: Page) => page.getByRole('textbox', { name: '速度倍率', exact: true });
const clockResult = (page: Page) => page.getByTestId('game-clock-result');
/** 名称里出现该倍率数字（1.0 / 2.0 也接受写成 1 / 2），前后不紧跟其他数字或小数点。 */
const ratioName = (ratio: string) => {
  const [whole, frac] = ratio.split('.');
  const num = frac === '0' ? `${whole}(?:\\.0)?` : `${whole}\\.${frac}`;
  return new RegExp(`(?:^|[^\\d.])${num}(?![\\d]|\\.\\d)`);
};
const preset = (page: Page, ratio: string) =>
  clockPage(page).getByRole('button', { name: ratioName(ratio) }).or(clockPage(page).getByRole('radio', { name: ratioName(ratio) }));
// 10:00 游戏时间在各档速度下的现实时长（四舍五入到整秒）
const PRESETS = [
  ['1.0', '10:00'],
  ['1.5', '6:40'],
  ['1.7', '5:53'],
  ['2.0', '5:00'],
] as const;

test('#266 a/b 默认倍率 1.7，10:00 游戏时间换成现实时间显示 5:53', async ({ page }) => {
  await page.goto('./#/game-clock');
  await expect(clockPage(page)).toBeVisible();
  await expect.poll(async () => Number(await ratioInput(page).inputValue())).toBe(1.7);
  await expect(page.getByRole('combobox', { name: '换算方向', exact: true })).toHaveValue('game-to-real');
  await expect(page.getByRole('textbox', { name: /原始游戏时长/ })).toHaveValue('10:00');
  await expect(clockResult(page)).toHaveText('5:53');
});

test('#266 c 提供 1.0 / 1.5 / 1.7 / 2.0 四档预设，点选后倍率和结果随之更新', async ({ page }) => {
  await page.goto('./#/game-clock');
  await expect(clockPage(page)).toBeVisible();
  for (const [ratio] of PRESETS) await expect(preset(page, ratio), `预设 ${ratio}`).toHaveCount(1);
  for (const [ratio, shown] of [...PRESETS].reverse()) {
    await preset(page, ratio).click();
    await expect.poll(async () => Number(await ratioInput(page).inputValue()), `预设 ${ratio}`).toBe(Number(ratio));
    await expect(clockResult(page), `预设 ${ratio}`).toHaveText(shown);
  }
});

test('#266 d 页面不再说 1.7「不表示游戏默认速度」', async ({ page }) => {
  await page.goto('./#/game-clock');
  await expect(clockPage(page)).toBeVisible();
  await expect(clockPage(page)).not.toContainText('不表示游戏默认速度');
});

test('#266 e 守卫：仍可手填倍率，非法倍率仍被拒绝', async ({ page }) => {
  await page.goto('./#/game-clock');
  await ratioInput(page).fill('2.5');
  await expect(clockResult(page)).toHaveText('4:00');
  await ratioInput(page).fill('0');
  await expect(clockPage(page).getByRole('alert')).toContainText('倍率须为大于 0');
  await expect(ratioInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(clockResult(page)).toHaveCount(0);
  await ratioInput(page).fill('1e3');
  await expect(clockPage(page).getByRole('alert')).toContainText('不使用指数写法');
  await ratioInput(page).fill('1.5');
  await expect(clockResult(page)).toHaveText('6:40');
});

// #266 补充验收（issuecomment-6303285333）：从其他工具跳来没有指定倍率时用 1.7；旧链接显式 ratio=1 仍按 1。
const clockQuery = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);

test('#266 f 从贸易收益跳到时间换算，倍率框显示 1.7 并按 1.7 换算', async ({ page }) => {
  await page.goto('./#/trade-income');
  await page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true }).fill('600');
  await page.getByRole('link', { name: '换算这段贸易周期', exact: true }).click();
  await expect(clockPage(page)).toBeVisible();
  expect(Number(clockQuery(page).get('duration'))).toBe(600);
  await expect.poll(async () => Number(await ratioInput(page).inputValue())).toBe(1.7);
  await expect(clockResult(page)).toHaveText('5:53');
});

test('#266 f 从驻军回血跳到时间换算，倍率框显示 1.7', async ({ page }) => {
  await page.goto('./#/garrison-healing');
  await expect(page.getByTestId('healing-seconds')).toHaveText('150 秒');
  await page.getByRole('link', { name: '换算这段回血时间', exact: true }).click();
  await expect(clockPage(page)).toBeVisible();
  await expect.poll(async () => Number(await ratioInput(page).inputValue())).toBe(1.7);
  await expect(clockResult(page)).toHaveText('1:28');
});

test('#266 g 守卫：旧链接显式带 ratio=1 仍按 1 打开', async ({ page }) => {
  await page.goto('./#/game-clock?v=1&direction=game-to-real&unit=seconds&duration=600&ratio=1');
  await expect(clockPage(page)).toBeVisible();
  await expect(ratioInput(page)).toHaveValue('1');
  await expect(clockResult(page)).toHaveText('10:00');
});

// ---------- #264 加固教堂圣物 ----------
const garrisonUrl = (building: number, civ: string, age: number, army: string) =>
  `./#/building/${building}?tab=garrison&gv=2&civ=${civ}&age=${age}&army=${army}&gtechs=`;
const garrisonPanel = (page: Page) => page.getByTestId('garrison-preview');

test.describe('#264 加固教堂存放圣物加箭', () => {
  for (const [army, arrows] of [
    ['285:1:d', '1'],
    ['285:4:d', '4'],
    ['83:2:e,285:2:d', '4'],
    ['83:3:e,285:4:d', '5'],
  ] as const)
    test(`亚美尼亚城堡时代 1806 ${army} 总箭数 ${arrows}`, async ({ page }) => {
      await page.goto(garrisonUrl(1806, 'Armenians', 3, army));
      await expect(page.getByTestId('garrison-result')).toBeVisible();
      await expect(page.getByTestId('garrison-total')).toHaveText(arrows);
      await expect(garrisonPanel(page)).not.toContainText('不增加弹丸');
    });

  test('守卫：普通修道院（104）存放圣物不显示箭数', async ({ page }) => {
    await page.goto(garrisonUrl(104, 'Franks', 3, '285:2:d'));
    await expect(page.getByTestId('garrison-used')).toHaveText('2');
    await expect(page.getByTestId('garrison-total')).toHaveCount(0);
  });
});
