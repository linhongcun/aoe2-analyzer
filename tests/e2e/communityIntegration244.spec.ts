import { expect, test, type Page } from '@playwright/test';

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

const entries = [
  ['时间换算', '/game-clock', 'game-clock-page'],
  ['快捷键速查', '/hotkeys', 'hotkeys-page'],
  ['城堡前置应对', '/castle-defense', 'castle-defense-page'],
] as const;
const query = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#244 首页新入口可键盘进入 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const [label, path, id] of entries) {
        await page.goto('./#/');
        const link = page.getByRole('navigation', { name: '入门与实战', exact: true }).getByRole('link', { name: label, exact: true });
        await expect(link).toHaveAttribute('href', '#' + path);
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await link.focus();
        await link.press('Enter');
        await expect(page.getByTestId(id)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`community244-${theme}-${width}.png`), fullPage: true });
    });

for (const [label, path, id] of entries) {
  test(`#244 全局搜索可找到${label}`, async ({ page }) => {
    await page.goto('./#/');
    await page.getByRole('button', { name: '全局搜索', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await dialog.getByRole('textbox').fill(label);
    await expect(dialog.locator('.cmdk-t b', { hasText: label })).toBeVisible();
    await dialog.getByRole('textbox').press('Enter');
    await expect(page.getByTestId(id)).toBeVisible();
    expect(new URL(page.url()).hash.split('?')[0]).toBe('#' + path);
  });
  test(`#244 干净分享地址进入${label}`, async ({ page }) => {
    await page.goto(`.${path}/`);
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page).toHaveTitle(/帝国时代/);
  });
}

test('#244 施工时间带入换算，返回时原施工方案不变', async ({ page }) => {
  await page.goto('./#/construction');
  const time = page.getByTestId('construction-seconds');
  await expect(time).toBeVisible();
  const before = await time.innerText();
  const seconds = Number(before.replace(/,/g, '').match(/[\d.]+/)![0]);
  await page.getByRole('link', { name: '换算这段施工时间', exact: true }).click();
  await expect(page.getByTestId('game-clock-page')).toBeVisible();
  expect(Number(query(page).get('duration'))).toBeCloseTo(seconds, 2);
  expect(query(page).get('direction')).toBe('game-to-real');
  expect(query(page).get('ratio')).toBe('1.7');
  await expect(page.getByRole('textbox', { name: '速度倍率', exact: true })).toHaveValue('1.7');
  await page.getByRole('textbox', { name: '速度倍率', exact: true }).fill('1.7');
  await page.goBack();
  await expect(time).toHaveText(before);
});

test('#244 贸易带入完整游戏周期，不带入单程或收入', async ({ page }) => {
  await page.goto('./#/trade-income');
  await page.getByRole('textbox', { name: '完整周期（游戏秒）', exact: true }).fill('123.45');
  await page.getByRole('link', { name: '换算这段贸易周期', exact: true }).click();
  await expect(page.getByTestId('game-clock-page')).toBeVisible();
  expect(Number(query(page).get('duration'))).toBe(123.45);
  expect(query(page).get('unit')).toBe('seconds');
});

test('#244 回血时间带入换算且保留原回血结果', async ({ page }) => {
  await page.goto('./#/garrison-healing');
  const seconds = page.getByTestId('healing-seconds');
  await expect(seconds).toHaveText('150 秒');
  await page.getByRole('link', { name: '换算这段回血时间', exact: true }).click();
  await expect(page.getByTestId('game-clock-page')).toBeVisible();
  // The pinned healing rate is a Float32 value; the old panel rounds to 150.
  // Clock input must retain the raw duration rather than requiring that display rounding.
  expect(Number(query(page).get('duration'))).toBeCloseTo(150, 4);
  await expect(page.getByRole('textbox', { name: '原始游戏时长', exact: true })).toHaveValue(query(page).get('duration')!);
  await page.goBack();
  await expect(seconds).toHaveText('150 秒');
});

test('#244 当前跟练时点带入游戏时间，并可查个人按键表', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&view=practice');
  await expect(page.getByTestId('build-practice')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
  const text = await page.getByTestId('practice-current').innerText();
  const match = text.match(/估算时点约\s*(\d+):(\d+)/)!;
  expect(match).not.toBeNull();
  const displayedSeconds = Number(match[1]) * 60 + Number(match[2]);
  await page.getByRole('link', { name: '换算当前步骤时点', exact: true }).click();
  await expect(page.getByTestId('game-clock-page')).toBeVisible();
  expect(Math.abs(Number(query(page).get('duration')) - displayedSeconds)).toBeLessThanOrEqual(1);
  await page.goBack();
  await page.getByRole('link', { name: '查游戏操作与个人按键表', exact: true }).click();
  await expect(page.getByTestId('hotkeys-page')).toBeVisible();
});

test('#244 对局助手的城堡入口与原四类防守分区独立', async ({ page }) => {
  await page.goto('./#/matchup?rush=towers');
  const early = page.getByRole('region', { name: '应对早期进攻', exact: true });
  await expect(early.getByRole('combobox')).toHaveCount(1);
  await expect(early.getByRole('combobox')).toHaveValue('towers');
  await expect(early).toContainText('不模拟打塔');
  await page.getByRole('link', { name: '城堡前置：按当前局面查看应对', exact: true }).click();
  await expect(page.getByTestId('castle-defense-page')).toBeVisible();
  await page.goBack();
  await expect(early.getByRole('combobox')).toHaveValue('towers');
});

test('#244 无效施工与回血配置不产生可用的时长带入入口', async ({ page }) => {
  await page.goto('./#/construction?broken=1');
  await expect(page.getByTestId('construction-page').getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('link', { name: '换算这段施工时间', exact: true })).toHaveCount(0);
  await page.goto('./#/garrison-healing?broken=1');
  await expect(page.getByTestId('garrison-healing-page')).toBeVisible();
  await expect(page.getByTestId('garrison-healing-page').getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('link', { name: '换算这段回血时间', exact: true })).toHaveCount(0);
});

test('#244 干净分享页保留重复参数与坏编码，禁止引导脚本静默洗掉错误', async ({ page }) => {
  const raw = 'v=1&direction=game-to-real&unit=seconds&duration=600&ratio=1&ratio=1.7';
  await page.goto('./game-clock/?' + raw);
  await expect(page.getByTestId('game-clock-page').getByRole('alert').first()).toContainText('重复');
  expect(query(page).getAll('ratio')).toEqual(['1', '1.7']);
  await expect(page.getByTestId('game-clock-result')).toHaveCount(0);
  await page.goto('./game-clock/?v=1&direction=game-to-real&unit=seconds&duration=%ZZ&ratio=1');
  await expect(page.getByTestId('game-clock-page').getByRole('alert').first()).toContainText('编码损坏');
  await expect(page.getByTestId('game-clock-result')).toHaveCount(0);
});
