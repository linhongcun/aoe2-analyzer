import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Fixed DE 185872 model examples; these checks do not represent game-client measurements.
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

const configuration = (patch: Record<string, string> = {}) =>
  new URLSearchParams({ hv: '1', b: '109', civ: 'Britons', age: '3', u: '83', entry: 'enter', techs: '', current: '10', target: '25', ...patch });
const url = (patch: Record<string, string> = {}) => './#/garrison-healing?' + configuration(patch).toString();
const panel = (page: Page) => page.getByTestId('garrison-healing-page');
const result = (page: Page) => page.getByTestId('healing-result');
const current = (page: Page) => page.getByRole('textbox', { name: '当前 HP', exact: true });
const target = (page: Page) => page.getByRole('textbox', { name: '目标 HP', exact: true });
const copy = (page: Page) => page.getByRole('button', { name: '复制回血方案', exact: true });
const herbal = (page: Page) => page.getByRole('checkbox', { name: /^草药/ });

test('#229 切换 URL 后返回原方案，不恢复此前尚未完成的坏 HP 草稿', async ({ page }) => {
  await page.goto(url());
  await current(page).fill('-1');
  await expect(result(page)).toHaveAttribute('data-status', 'invalid');
  await page.evaluate(
    (query) => {
      window.location.hash = '/garrison-healing?' + query;
    },
    configuration({ target: '20' }).toString(),
  );
  await expect(target(page)).toHaveValue('20');
  await expect(current(page)).toHaveValue('10');
  await page.evaluate((query) => {
    window.location.hash = '/garrison-healing?' + query;
  }, configuration().toString());
  await expect(target(page)).toHaveValue('25');
  await expect(current(page)).toHaveValue('10');
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
});

test('#229 空链接只默认正常方案，显示建筑静态恢复与范围', async ({ page }) => {
  await page.goto('./#/garrison-healing');
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await expect(page.getByTestId('healing-seconds')).toHaveText('150 秒');
  await expect(page.getByTestId('healing-rate')).toHaveText('6 HP / 分钟');
  await expect(page.getByTestId('healing-max-hp')).toContainText('25 HP');
  await expect(panel(page)).toContainText('不计单位自身再生');
  await expect(panel(page)).toContainText('未经过当前版本游戏客户端实测');
});

test('#229 草药显示六倍速率与增加500%，同差血量时间为六分之一', async ({ page }) => {
  await page.goto(url());
  await expect(page.getByTestId('healing-before')).toContainText('150 秒');
  await expect(page.getByTestId('healing-after')).toContainText('25 秒');
  await expect(page.getByTestId('healing-multiplier')).toContainText('6 倍');
  await expect(page.getByTestId('healing-multiplier')).toContainText('500%');
  await herbal(page).check();
  await expect(page.getByTestId('healing-seconds')).toHaveText('25 秒');
  await expect(page.getByTestId('healing-rate')).toHaveText('36 HP / 分钟');
  await page.reload();
  await expect(herbal(page)).toBeChecked();
  await expect(page.getByTestId('healing-seconds')).toHaveText('25 秒');
});

test('#229 免费草药自动生效一次，不伪造可取消的无草药基线', async ({ page }) => {
  await page.goto(url({ civ: 'Teutons' }));
  await expect(herbal(page)).toBeChecked();
  await expect(herbal(page)).toBeDisabled();
  await expect(panel(page)).toContainText('草药（免费，自动生效）');
  await expect(page.getByTestId('healing-seconds')).toHaveText('25 秒');
  await expect(page.getByTestId('healing-before')).toContainText('不能构造未研究状态');
  await expect(page.getByTestId('healing-before')).toContainText('暂停比较');
  await expect(page.getByTestId('healing-multiplier')).toHaveCount(0);
  await page.getByRole('button', { name: '清空自选科技', exact: true }).click();
  await expect(page.getByTestId('healing-seconds')).toHaveText('25 秒');
});

test('#229 不开放的草药不冒充可研究效果', async ({ page }) => {
  await page.goto(url({ civ: 'Turks' }));
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await expect(herbal(page)).toHaveCount(0);
  await expect(page.getByTestId('healing-after')).toContainText('尚不能研究草药');
  await expect(page.getByTestId('healing-after')).toContainText('暂停比较');
});

for (const [hp, goal] of [
  ['25', '25'],
  ['25', '20'],
])
  test(`#229 已达到目标明确为零秒 ${hp}/${goal}`, async ({ page }) => {
    await page.goto(url({ current: hp!, target: goal! }));
    await expect(result(page)).toHaveAttribute('data-status', 'complete');
    await expect(result(page)).toContainText('无需恢复');
    await expect(page.getByTestId('healing-seconds')).toHaveText('0 秒');
  });

test('#229 最大 HP 科技改变上限，取消后保留超限输入并允许修正', async ({ page }) => {
  await page.goto(url());
  const loom = page.getByRole('checkbox', { name: '织布机', exact: true });
  await loom.check();
  await expect(page.getByTestId('healing-max-hp')).toContainText('40 HP');
  await target(page).fill('40');
  await expect(page.getByTestId('healing-seconds')).toHaveText('300 秒');
  await loom.uncheck();
  await expect(result(page)).toHaveAttribute('data-status', 'invalid');
  await expect(target(page)).toHaveValue('40');
  await expect(target(page)).toBeEnabled();
  await expect(copy(page)).toBeDisabled();
  await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
  await target(page).fill('25');
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await expect(page.getByTestId('healing-seconds')).toHaveText('150 秒');
});

test('#229 阿兹特克草药额外 HP 不悄悄降低同一比较目标', async ({ page }) => {
  await page.goto(url({ civ: 'Aztecs', u: '125', techs: '231,441', target: '55' }));
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await expect(target(page)).toHaveValue('55');
  await expect(page.getByTestId('healing-max-hp')).toContainText('55 HP');
  await expect(page.getByTestId('healing-before')).toHaveAttribute('data-status', 'invalid');
  await expect(page.getByTestId('healing-before')).toContainText('50');
  await expect(page.getByTestId('healing-before')).toContainText('暂停比较');
  await expect(page.getByTestId('healing-after')).toContainText('75 秒');
});

test('#229 自产留驻有恢复速率但不能冒充受伤单位重返建筑', async ({ page }) => {
  await page.goto(url({ b: '12', u: '74', entry: 'created' }));
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await expect(page.getByTestId('healing-rate')).toHaveText('30 HP / 分钟');
  await expect(page.getByRole('combobox', { name: '回血驻留方式', exact: true }).locator('option[value="enter"]')).toHaveCount(0);
  await expect(page.getByTestId('healing-created-warning')).toContainText('不表示受伤单位能从外部重新进入');
});

test('#229 合法高棉房屋驻留与零治疗率独立显示', async ({ page }) => {
  await page.goto(url({ b: '70', civ: 'Khmer', age: '1' }));
  await expect(result(page)).toHaveAttribute('data-status', 'zero-rate');
  await expect(result(page)).toContainText('治疗速率为零');
  await expect(page.getByTestId('healing-paused')).toBeVisible();
  await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
  await expect(page.getByTestId('healing-before')).toContainText('暂停比较');
});

test('#229 已核实有机单位在零速率宿主已达目标，明确无需恢复而非未知', async ({ page }) => {
  await page.goto(url({ b: '70', civ: 'Khmer', age: '1', current: '25', target: '25' }));
  await expect(result(page)).toHaveAttribute('data-status', 'complete');
  await expect(result(page)).toContainText('无需恢复');
  await expect(page.getByTestId('healing-seconds')).toHaveText('0 秒');
  await expect(page.getByTestId('healing-rate')).toHaveText('0 HP / 分钟');
  await expect(page.getByTestId('healing-paused')).toHaveCount(0);
});

test('#229 骡车治疗机制未核实，不用零秒表示未知', async ({ page }) => {
  await page.goto(url({ b: '1806', civ: 'Armenians', u: '1808', target: '20' }));
  await expect(result(page)).toHaveAttribute('data-status', 'unverified');
  await expect(page.getByTestId('healing-max-hp')).toContainText('待核实');
  await expect(page.getByTestId('healing-paused')).toBeVisible();
  await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
  await expect(result(page)).toContainText('治疗资格尚未核实');
});

test('#229 圣物存放单独显示不具备治疗资格', async ({ page }) => {
  await page.goto(url({ b: '104', u: '285', entry: 'deposit' }));
  await expect(result(page)).toHaveAttribute('data-status', 'ineligible');
  await expect(result(page)).toContainText('不具备建筑治疗资格');
  await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
  await expect(panel(page)).toContainText('圣物存放与单位恢复不同');
});

for (const invalid of ['', '-1', '0', 'NaN', 'Infinity', '1e2'])
  test(`#229 编辑中非法 HP 保留且停算，可直接恢复 ${invalid || '空值'}`, async ({ page }) => {
    await page.goto(url());
    await current(page).fill(invalid);
    await expect(current(page)).toHaveValue(invalid);
    await expect(current(page)).toBeEnabled();
    await expect(result(page)).toHaveAttribute('data-status', 'invalid');
    await expect(copy(page)).toBeDisabled();
    await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
    await current(page).fill('10.5');
    await target(page).fill('11.25');
    await expect(result(page)).toHaveAttribute('data-status', 'valid');
    await expect(page.getByTestId('healing-seconds')).toHaveText('7.5 秒');
    await expect(copy(page)).toBeEnabled();
  });

const broken = [
  (query: URLSearchParams) => query.append('b', '82'),
  (query: URLSearchParams) => query.delete('techs'),
  (query: URLSearchParams) => query.set('unknown', '1'),
  (query: URLSearchParams) => query.set('target', 'Infinity'),
];
for (const [index, mutate] of broken.entries())
  test(`#229 损坏分享链接锁定且保留，必须显式重置 ${index + 1}`, async ({ page }) => {
    const query = configuration();
    mutate(query);
    await page.goto('./#/garrison-healing?' + query.toString());
    const original = page.url();
    await expect(page.getByTestId('healing-link-error')).toBeVisible();
    await expect(current(page)).toBeDisabled();
    await expect(target(page)).toBeDisabled();
    await expect(page.getByRole('combobox', { name: '回血时代', exact: true })).toBeDisabled();
    await expect(copy(page)).toBeDisabled();
    await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
    expect(page.url()).toBe(original);
    await page.reload();
    await expect(current(page)).toBeDisabled();
    await page.getByRole('button', { name: '重置回血方案', exact: true }).click();
    await expect(result(page)).toHaveAttribute('data-status', 'valid');
    await expect(current(page)).toBeEnabled();
    await expect(copy(page)).toBeEnabled();
  });

test('#229 外部进入非法生产建筑的链接不会自动改成自产留驻', async ({ page }) => {
  await page.goto(url({ b: '104', u: '125', entry: 'enter' }));
  await expect(page.getByTestId('healing-link-error')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '回血驻留方式', exact: true })).toHaveValue('enter');
  await expect(current(page)).toBeDisabled();
  await expect(page.getByTestId('healing-seconds')).toHaveCount(0);
});

for (const [key, raw] of [
  ['hv', '%FF'],
  ['target', '%ZZ'],
])
  test(`#229 原始链接转义损坏不会被参数归一化掩盖 ${key}`, async ({ page }) => {
    const query = configuration();
    const encoded = query.toString().replace(new RegExp(`${key}=[^&]*`), `${key}=${raw}`);
    await page.goto('./#/garrison-healing?' + encoded);
    await expect(page.getByTestId('healing-link-error')).toBeVisible();
    await expect(current(page)).toBeDisabled();
    await expect(copy(page)).toBeDisabled();
    await page.getByRole('button', { name: '重置回血方案', exact: true }).click();
    await expect(result(page)).toHaveAttribute('data-status', 'valid');
  });

test('#229 自产解锁科技取消后就地停算，可重新勾选恢复且不把编辑变成坏链接', async ({ page }) => {
  await page.goto(url({ b: '12', civ: 'Goths', u: '41', entry: 'created', techs: '16' }));
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  const anarchy = page.getByRole('checkbox', { name: '无政府', exact: true });
  await anarchy.uncheck();
  await expect(result(page)).toHaveAttribute('data-status', 'ineligible');
  await expect(page.getByTestId('healing-link-error')).toHaveCount(0);
  await expect(anarchy).toBeEnabled();
  await expect(current(page)).toBeEnabled();
  await expect(copy(page)).toBeDisabled();
  await anarchy.check();
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await expect(copy(page)).toBeEnabled();
  await page.getByRole('combobox', { name: '回血单位', exact: true }).selectOption('74');
  await page.getByRole('combobox', { name: '回血单位', exact: true }).selectOption('41');
  await expect(anarchy).toBeChecked();
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
});

test('#229 复制失败提供完整安全子路径链接，重载恢复全部字段', async ({ page }) => {
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
  await page.goto(url({ b: '1806', civ: 'Armenians', age: '4', techs: '22,441', current: '12.5', target: '40' }));
  await expect(result(page)).toHaveAttribute('data-status', 'valid');
  await copy(page).click();
  await expect(page.getByRole('status').filter({ hasText: '自动复制失败' })).toBeVisible();
  const manual = page.getByRole('textbox', { name: '回血方案链接', exact: true });
  await expect(manual).toBeVisible();
  const shared = new URL(await manual.inputValue());
  const base = new URL(test.info().project.use.baseURL!);
  expect(shared.origin).toBe(base.origin);
  expect(shared.pathname).toBe(base.pathname);
  expect(shared.hash).toContain('/garrison-healing?');
  const params = new URLSearchParams(shared.hash.split('?')[1]);
  expect(Object.fromEntries(params)).toEqual({
    hv: '1',
    b: '1806',
    civ: 'Armenians',
    age: '4',
    u: '83',
    entry: 'enter',
    techs: '22,441',
    current: '12.5',
    target: '40',
  });
  await manual.focus();
  expect(await manual.evaluate((input: HTMLInputElement) => input.selectionStart === 0 && input.selectionEnd === input.value.length)).toBe(true);
  await page.goto(shared.href);
  await page.reload();
  await expect(page.getByRole('combobox', { name: '回血文明', exact: true })).toHaveValue('Armenians');
  await expect(page.getByRole('combobox', { name: '回血建筑', exact: true })).toHaveValue('1806');
  await expect(current(page)).toHaveValue('12.5');
  await expect(target(page)).toHaveValue('40');
  await expect(herbal(page)).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '织布机', exact: true })).toBeChecked();
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#229 ${theme} @${width} 单目标恢复、键盘与触区`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto(url({ b: '82', techs: '22,441', current: '10.5', target: '40' }));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(result(page)).toHaveAttribute('data-status', 'valid');
      await current(page).focus();
      await current(page).press('Tab');
      await expect(target(page)).toBeFocused();
      await target(page).fill('35');
      await expect(result(page)).toHaveAttribute('data-status', 'valid');
      for (const control of await panel(page).locator('button, select, input:not([type="checkbox"]), .healing-tech-grid label, a').all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId('healing-seconds')).toHaveCSS('white-space', 'nowrap');
      if (width === 375) {
        const violations = (await new AxeBuilder({ page }).include('[data-testid="garrison-healing-page"]').withRules(['color-contrast']).analyze()).violations;
        expect(violations).toEqual([]);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`garrisonHealing229-${theme}-${width}.png`), fullPage: true });
    });
