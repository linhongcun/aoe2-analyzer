import AxeBuilder from '@axe-core/playwright';
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
const pageRoot = (page: Page) => page.getByTestId('game-clock-page');
const params = (values: Record<string, string>) => new URLSearchParams(values).toString();
const query = (values: Record<string, string> = {}) => params({ v: '1', direction: 'game-to-real', unit: 'seconds', duration: '600', ratio: '1.7', ...values });
const input = (page: Page) => page.getByRole('textbox', { name: /原始(?:游戏|现实)时长/ });

test('#237 默认标准速度下，同一个原始时长双向换算', async ({ page }) => {
  await page.goto('./#/game-clock');
  await expect(pageRoot(page)).toBeVisible();
  await expect(page.getByRole('textbox', { name: '速度倍率', exact: true })).toHaveValue('1.7');
  await page.getByRole('button', { name: '试算数学示例' }).click();
  await expect(page.getByTestId('game-clock-result')).toHaveText('5:53');
  await expect(page.getByTestId('game-clock-seconds')).toHaveText('352.941176 秒');
  await expect(page.getByText('示例采用标准速度（天梯默认），倍率为 1.7。', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '换算方向', exact: true }).selectOption('real-to-game');
  await expect(input(page)).toHaveValue('10:00');
  await expect(page.getByTestId('game-clock-result')).toHaveText('17:00');
  await expect(page.getByRole('heading', { name: '对应游戏时长', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '换算方向', exact: true }).selectOption('game-to-real');
  await expect(page.getByTestId('game-clock-result')).toHaveText('5:53');
});

test('#266 预设名称、选中状态与手动倍率同步，来源可查', async ({ page }) => {
  await page.goto('./#/game-clock');
  const presets = page.getByRole('group', { name: '游戏速度预设', exact: true });
  const ratio = page.getByRole('textbox', { name: '速度倍率', exact: true });
  for (const [value, name, shown] of [
    ['1.0', '慢速（Slow）', '10:00'],
    ['1.5', '休闲（Casual）', '6:40'],
    ['1.7', '标准（Normal，天梯默认）', '5:53'],
    ['2.0', '快速（Fast）', '5:00'],
  ] as const) {
    const button = presets.getByRole('button', { name: `${value} ${name}`, exact: true });
    await button.click();
    await expect(ratio).toHaveValue(value);
    await expect(page.getByTestId('game-clock-result')).toHaveText(shown);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(1);
  }
  await ratio.fill('1.70');
  await expect(presets.getByRole('button', { name: '1.7 标准（Normal，天梯默认）', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await ratio.fill('2.5');
  await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(0);
  await ratio.fill('1e3');
  await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.getByText('换算规则与适用范围', { exact: true }).click();
  await expect(pageRoot(page).getByRole('link', { name: '帝国时代官方论坛：DE 游戏速度讨论', exact: true })).toHaveAttribute(
    'href',
    'https://forums.ageofempires.com/t/whats-the-equivalent-to-1-5-game-speed-in-aoe2-de/84298',
  );
});

test('#266 省略倍率的链接使用标准速度，旧链接的显式倍率 1 保持原义', async ({ page }) => {
  const values = new URLSearchParams(query());
  values.delete('ratio');
  await page.goto('./#/game-clock?' + values.toString());
  await expect(page.getByTestId('game-clock-result')).toHaveText('5:53');
  await expect(page.getByRole('textbox', { name: '速度倍率', exact: true })).toHaveValue('1.7');
  await page.goto('./#/game-clock?' + query({ ratio: '1' }));
  await expect(page.getByTestId('game-clock-result')).toHaveText('10:00');
  await expect(page.getByRole('group', { name: '游戏速度预设', exact: true }).getByRole('button', { name: '1.0 慢速（Slow）', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('#237 单位切换保存原始小数，刷新和重复切换不二次换算', async ({ page }) => {
  await page.goto('./#/game-clock?' + query({ duration: '600.123456789' }));
  const result = await page.getByTestId('game-clock-seconds').innerText();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('combobox', { name: '输入单位', exact: true }).selectOption('minutes');
    await expect(input(page)).toHaveValue('10:00.123456789');
    await expect(page.getByTestId('game-clock-seconds')).toHaveText(result);
    await page.getByRole('combobox', { name: '输入单位', exact: true }).selectOption('seconds');
    await expect(input(page)).toHaveValue('600.123456789');
  }
  await page.reload();
  await expect(input(page)).toHaveValue('600.123456789');
  await expect(page.getByRole('textbox', { name: '速度倍率', exact: true })).toHaveValue('1.7');
  await expect(page.getByTestId('game-clock-seconds')).toHaveText(result);
});

test('#237 空值、非法分秒和零倍率暂停；无效时切换单位保留草稿', async ({ page }) => {
  await page.goto('./#/game-clock');
  await input(page).fill('');
  await expect(pageRoot(page).getByRole('alert')).toContainText('请填写时长');
  await expect(page.getByTestId('game-clock-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制换算链接' })).toBeDisabled();
  await input(page).fill('10:60');
  await page.getByRole('combobox', { name: '输入单位', exact: true }).selectOption('seconds');
  await expect(input(page)).toHaveValue('10:60');
  await expect(page.getByRole('combobox', { name: '输入单位', exact: true })).toHaveValue('minutes');
  await expect(pageRoot(page).getByText('先修正时长，再切换单位；原输入已保留。', { exact: true })).toBeVisible();
  await input(page).fill('0:00');
  await expect(page.getByTestId('game-clock-result')).toHaveText('0:00');
  await page.getByRole('textbox', { name: '速度倍率', exact: true }).fill('0');
  await expect(pageRoot(page).getByRole('alert')).toContainText('倍率须为大于 0');
  await expect(input(page)).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('textbox', { name: '速度倍率', exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('game-clock-result')).toHaveCount(0);
  await page.getByRole('textbox', { name: '速度倍率', exact: true }).fill('1e3');
  await expect(pageRoot(page).getByRole('alert')).toContainText('不使用指数写法');
  await page.getByRole('button', { name: '重置换算', exact: true }).click();
  await expect(page.getByTestId('game-clock-result')).toHaveText('5:53');
});

test('#237 损坏和重复参数显示明确重置，不回落成看似有效的方案', async ({ page }) => {
  for (const suffix of ['&ratio=2', '&extra=unknown']) {
    await page.goto('./#/game-clock?' + query() + suffix);
    await expect(pageRoot(page).getByRole('alert')).toContainText('未知或重复参数');
    await expect(input(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '复制换算链接' })).toBeDisabled();
    await page.getByRole('button', { name: '重置换算', exact: true }).click();
    await expect(page.getByTestId('game-clock-result')).toHaveText('5:53');
  }
  await page.goto('./#/game-clock?' + query({ duration: '%GG' }));
  await expect(pageRoot(page).getByRole('alert')).toContainText('非负十进制数字');
});

test('#237 分享链接恢复方向、时长、倍率与单位，复制失败有完整手动地址', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/game-clock?' + query({ direction: 'real-to-game', unit: 'minutes', duration: '10:00' }));
  await page.getByRole('button', { name: '复制换算链接' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(copied);
  expect(url.pathname).toBe(new URL('./game-clock/', test.info().project.use.baseURL).pathname);
  expect(Object.fromEntries(url.searchParams)).toEqual({ v: '1', direction: 'real-to-game', unit: 'minutes', duration: '10:00', ratio: '1.7' });
  await page.goto(copied);
  await page.reload();
  await expect(page.getByTestId('game-clock-result')).toHaveText('17:00');
  await expect(page.getByRole('combobox', { name: '输入单位', exact: true })).toHaveValue('minutes');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('blocked');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制换算链接' }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  await expect(page.getByRole('textbox', { name: '手动复制换算链接', exact: true })).toHaveValue(copied);
});

test('#237 极端合法倍率不撑破窄屏，输出上限有解释', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/game-clock?' + query({ ratio: '1.' + '0'.repeat(61), duration: '100000000' }));
  await expect(page.getByTestId('game-clock-result')).toHaveText('1666666:40');
  await page.getByRole('textbox', { name: '速度倍率', exact: true }).fill('0.000000000000000001');
  await expect(pageRoot(page).getByRole('alert')).toContainText('超出可准确显示的范围');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#237 ${theme} @${width} 输入、结果与规则可读`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/game-clock?' + query());
      await expect(page.getByTestId('game-clock-result')).toHaveText('5:53');
      for (const preset of await page.getByRole('group', { name: '游戏速度预设', exact: true }).getByRole('button').all()) {
        const box = await preset.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(await preset.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        expect(await preset.locator('.gc-number').evaluate((element) => element.getClientRects().length)).toBe(1);
      }
      expect(
        await pageRoot(page)
          .locator('.gc-number, .num')
          .evaluateAll((elements) => elements.every((element) => element.getClientRects().length === 1)),
      ).toBe(true);
      const share = page.getByRole('button', { name: '复制换算链接', exact: true });
      const box = await share.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      await share.focus();
      await expect(share).toBeFocused();
      await page.getByText('换算规则与适用范围', { exact: true }).click();
      const violations = (await new AxeBuilder({ page }).include('.game-clock-page').withRules(['color-contrast']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`game-clock-${theme}-${width}.png`), fullPage: true });
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByTestId('game-clock-result')).toBeVisible();
    });
